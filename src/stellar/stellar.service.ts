import {
  Injectable,
  Logger,
  ServiceUnavailableException,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Account,
  Address,
  Asset,
  Contract,
  Keypair,
  nativeToScVal,
  Networks,
  rpc,
  scValToNative,
  TransactionBuilder,
  xdr,
} from '@stellar/stellar-sdk';
import { CreateLegacyParams, SubmitResult, UnsignedTransaction } from './stellar.types';

/**
 * Talks to the Heirloom Soroban `legacy` contract
 * (../../heirloom-contracts/contracts/legacy/src/lib.rs) in a strictly
 * self-custodial way.
 *
 * There is NO platform signing key. Every state-changing call is built as an
 * *unsigned* transaction envelope with the CLIENT's account as source, run
 * through Soroban `prepareTransaction` (footprint + auth), and returned as XDR
 * for the client to sign in their own Freighter wallet. The signed XDR comes
 * back to `submit()` which relays it to the network. Views are read via
 * `simulateTransaction` and never touch a key.
 *
 * If STELLAR_RPC_URL or HEIRLOOM_CONTRACT_ID are absent the service is
 * "not configured": every method throws ServiceUnavailableException (HTTP 503)
 * so callers fail clearly. It NEVER fabricates a transaction hash.
 */
@Injectable()
export class StellarService {
  private readonly logger = new Logger(StellarService.name);

  private readonly network: string;
  private readonly rpcUrl: string;
  private readonly contractId: string;
  private readonly configured: boolean;

  private readonly server?: rpc.Server;

  constructor(private readonly config: ConfigService) {
    this.network = this.config.get<string>('STELLAR_NETWORK') ?? 'testnet';
    this.rpcUrl =
      this.config.get<string>('STELLAR_RPC_URL') ?? 'https://soroban-testnet.stellar.org';
    this.contractId = this.config.get<string>('HEIRLOOM_CONTRACT_ID') ?? '';

    this.configured = Boolean(this.rpcUrl && this.contractId);

    if (this.configured) {
      this.server = new rpc.Server(this.rpcUrl, {
        allowHttp: this.rpcUrl.startsWith('http://'),
      });
      this.logger.log(`StellarService connected to ${this.network} via ${this.rpcUrl}.`);
    } else {
      this.logger.warn(
        'StellarService is NOT configured (missing STELLAR_RPC_URL or ' +
          'HEIRLOOM_CONTRACT_ID). On-chain endpoints will return 503 until set.',
      );
    }
  }

  /** Whether the on-chain layer is live. Endpoints use this to 503 clearly. */
  isConfigured(): boolean {
    return this.configured;
  }

  /** The deployed contract instance id (`C...`), or null if not configured. */
  getContractId(): string | null {
    return this.contractId || null;
  }

  networkPassphrase(): string {
    switch (this.network) {
      case 'mainnet':
        return Networks.PUBLIC;
      case 'futurenet':
        return Networks.FUTURENET;
      default:
        return Networks.TESTNET;
    }
  }

  /**
   * Resolve a token to its Stellar Asset Contract (SAC) address (`C...`), which
   * is what the `legacy` contract's `token: Address` expects.
   *
   * - `'native'` (or empty) → the native XLM SAC for this network.
   * - `'CODE:ISSUER'` → the SAC for that classic asset.
   * - a `C...` address → returned unchanged (already a contract).
   */
  resolveTokenContract(token?: string): string {
    const value = (token ?? '').trim();
    if (!value || value.toLowerCase() === 'native' || value.toUpperCase() === 'XLM') {
      return Asset.native().contractId(this.networkPassphrase());
    }
    if (value.startsWith('C')) {
      return value;
    }
    if (value.includes(':')) {
      const [code, issuer] = value.split(':');
      return new Asset(code, issuer).contractId(this.networkPassphrase());
    }
    throw new InternalServerErrorException(
      `Unrecognized token "${token}". Use "native", "CODE:ISSUER", or a C... contract address.`,
    );
  }

  // -------------------------------------------------------------------------
  // Build: return an unsigned XDR envelope for the client to sign.
  // Each mirrors a contract entrypoint; `source` is the account that must sign.
  // -------------------------------------------------------------------------

  /** Build `create_legacy(owner, token, total_amount, guardians, threshold, beneficiaries)`. */
  buildCreateLegacy(params: CreateLegacyParams): Promise<UnsignedTransaction> {
    const guardianVals = params.guardians.map((g) => new Address(g).toScVal());
    const beneficiaryVals = params.beneficiaries.map((b) =>
      xdr.ScVal.scvMap([
        new xdr.ScMapEntry({
          key: nativeToScVal('beneficiary', { type: 'symbol' }),
          val: new Address(b.address).toScVal(),
        }),
        new xdr.ScMapEntry({
          key: nativeToScVal('bps', { type: 'symbol' }),
          val: nativeToScVal(b.shareBps, { type: 'u32' }),
        }),
      ]),
    );

    return this.buildInvoke(params.owner, 'create_legacy', [
      new Address(params.owner).toScVal(),
      new Address(params.token).toScVal(),
      nativeToScVal(params.totalAmount, { type: 'i128' }),
      xdr.ScVal.scvVec(guardianVals),
      nativeToScVal(params.threshold, { type: 'u32' }),
      xdr.ScVal.scvVec(beneficiaryVals),
    ]);
  }

  /** Build `deposit(legacy_id)` — owner funds the plan (Draft → Funded). */
  buildDeposit(owner: string, legacyId: bigint): Promise<UnsignedTransaction> {
    return this.buildInvoke(owner, 'deposit', [nativeToScVal(legacyId, { type: 'u64' })]);
  }

  /** Build `approve_guardian(legacy_id, guardian)` — signed by the guardian. */
  buildApproveGuardian(guardian: string, legacyId: bigint): Promise<UnsignedTransaction> {
    return this.buildInvoke(guardian, 'approve_guardian', [
      nativeToScVal(legacyId, { type: 'u64' }),
      new Address(guardian).toScVal(),
    ]);
  }

  /**
   * Build `finalize_release(legacy_id)`. The contract call is permissionless,
   * but a transaction still needs a source account to pay the fee and be
   * sequenced — `caller` fills that role (any funded account; typically the
   * beneficiary opening the capsule).
   */
  buildFinalizeRelease(caller: string, legacyId: bigint): Promise<UnsignedTransaction> {
    return this.buildInvoke(caller, 'finalize_release', [nativeToScVal(legacyId, { type: 'u64' })]);
  }

  /** Build `claim_assets(legacy_id, beneficiary)` — signed by the beneficiary. */
  buildClaimAssets(beneficiary: string, legacyId: bigint): Promise<UnsignedTransaction> {
    return this.buildInvoke(beneficiary, 'claim_assets', [
      nativeToScVal(legacyId, { type: 'u64' }),
      new Address(beneficiary).toScVal(),
    ]);
  }

  /** Build `cancel_legacy(legacy_id)` — signed by the owner, refunds deposit. */
  buildCancelLegacy(owner: string, legacyId: bigint): Promise<UnsignedTransaction> {
    return this.buildInvoke(owner, 'cancel_legacy', [nativeToScVal(legacyId, { type: 'u64' })]);
  }

  // -------------------------------------------------------------------------
  // Views (read-only simulation — no signing, no fee).
  // -------------------------------------------------------------------------

  /** Read `get_legacy(legacy_id)`. Returns null if the plan doesn't exist. */
  getLegacy(legacyId: bigint): Promise<unknown> {
    return this.readView('get_legacy', [nativeToScVal(legacyId, { type: 'u64' })]);
  }

  /** Read `get_approvals(legacy_id)` — the guardians that have approved. */
  getApprovals(legacyId: bigint): Promise<unknown> {
    return this.readView('get_approvals', [nativeToScVal(legacyId, { type: 'u64' })]);
  }

  /** Read `get_claim(legacy_id, beneficiary)`. */
  getClaim(legacyId: bigint, beneficiary: string): Promise<unknown> {
    return this.readView('get_claim', [
      nativeToScVal(legacyId, { type: 'u64' }),
      new Address(beneficiary).toScVal(),
    ]);
  }

  // -------------------------------------------------------------------------
  // Submit: relay a client-signed transaction to the network and poll.
  // -------------------------------------------------------------------------

  /**
   * Submit a client-signed transaction envelope (base64 XDR) to the network,
   * poll to completion, and return the hash + decoded return value. Throws a
   * typed error on failure — never a fabricated success.
   */
  async submit(signedXdr: string): Promise<SubmitResult> {
    const server = this.requireServer();

    let tx: ReturnType<typeof TransactionBuilder.fromXDR>;
    try {
      tx = TransactionBuilder.fromXDR(signedXdr, this.networkPassphrase());
    } catch {
      throw new InternalServerErrorException('The signed transaction could not be decoded.');
    }

    const sent = await server.sendTransaction(tx);
    if (sent.status === 'ERROR' || sent.status === 'DUPLICATE') {
      throw new InternalServerErrorException(
        `The network rejected the transaction (${sent.status}).`,
      );
    }

    let got = await server.getTransaction(sent.hash);
    const deadline = this.deadline(30_000);
    while (got.status === rpc.Api.GetTransactionStatus.NOT_FOUND && Date.now() < deadline) {
      await this.sleep(1000);
      got = await server.getTransaction(sent.hash);
    }

    if (got.status !== rpc.Api.GetTransactionStatus.SUCCESS) {
      throw new InternalServerErrorException(
        `The transaction did not succeed (status: ${got.status}).`,
      );
    }

    let data: unknown;
    if (got.returnValue) {
      data = this.decode(got.returnValue);
    }
    return { txHash: sent.hash, data };
  }

  // -------------------------------------------------------------------------
  // Internal helpers.
  // -------------------------------------------------------------------------

  /**
   * Build an unsigned, Soroban-prepared transaction with `source` as the
   * transaction source account, and return its XDR. `prepareTransaction`
   * attaches the simulated footprint and auth entries so the client's single
   * signature authorizes both the invocation and any `require_auth()`.
   */
  private async buildInvoke(
    source: string,
    method: string,
    args: xdr.ScVal[],
  ): Promise<UnsignedTransaction> {
    const server = this.requireServer();
    const contract = new Contract(this.contractId);

    // Fetch the source account so the sequence number is correct.
    let account: Account;
    try {
      account = await server.getAccount(source);
    } catch {
      throw new InternalServerErrorException(
        'That account does not exist on the network yet. It needs to be ' +
          'funded before it can sign transactions.',
      );
    }

    const tx = new TransactionBuilder(account, {
      fee: '1000000',
      networkPassphrase: this.networkPassphrase(),
    })
      .addOperation(contract.call(method, ...args))
      .setTimeout(120)
      .build();

    let prepared: typeof tx;
    try {
      prepared = await server.prepareTransaction(tx);
    } catch (err) {
      throw new InternalServerErrorException(
        `The contract rejected the "${method}" call during simulation: ` +
          `${err instanceof Error ? err.message : 'unknown error'}`,
      );
    }

    return {
      xdr: prepared.toXDR(),
      networkPassphrase: this.networkPassphrase(),
      method,
      source,
    };
  }

  /** Simulate a read-only call and decode its return value. */
  private async readView(method: string, args: xdr.ScVal[]): Promise<unknown> {
    const server = this.requireServer();
    const contract = new Contract(this.contractId);

    // Views don't mutate state, but a simulation still needs a source account.
    // A random keypair is used purely as a footprint-neutral placeholder — it
    // never signs and never pays, because the transaction is never submitted.
    const probe = Keypair.random().publicKey();
    const account = new Account(probe, '0');

    const tx = new TransactionBuilder(account, {
      fee: '1000000',
      networkPassphrase: this.networkPassphrase(),
    })
      .addOperation(contract.call(method, ...args))
      .setTimeout(30)
      .build();

    const sim = await server.simulateTransaction(tx);
    if (rpc.Api.isSimulationError(sim)) {
      throw new InternalServerErrorException(`Reading "${method}" failed: ${sim.error}`);
    }
    if (rpc.Api.isSimulationSuccess(sim) && sim.result?.retval) {
      return this.decode(sim.result.retval);
    }
    return null;
  }

  private decode(value: xdr.ScVal): unknown {
    return scValToNative(value);
  }

  private requireServer(): rpc.Server {
    if (!this.server) {
      throw new ServiceUnavailableException(
        'The on-chain service is not configured yet. Set STELLAR_RPC_URL and ' +
          'HEIRLOOM_CONTRACT_ID to enable it.',
      );
    }
    return this.server;
  }

  private deadline(ms: number): number {
    return Date.now() + ms;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
