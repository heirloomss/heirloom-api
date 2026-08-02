import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Address,
  Contract,
  Keypair,
  nativeToScVal,
  Networks,
  rpc,
  scValToNative,
  TransactionBuilder,
  xdr,
} from '@stellar/stellar-sdk';
import {
  CreateLegacyParams,
  fakeTxHash,
  OnChainResult,
  StellarLegacyStatus,
} from './stellar.types';

/**
 * Wraps @stellar/stellar-sdk to talk to the Heirloom Soroban `legacy` contract
 * (see ../heirloom-contracts/contracts/legacy/src/lib.rs). Its methods mirror
 * the contract entrypoints: init, create_legacy, approve_guardian,
 * create_claim, claim_assets, cancel_legacy, get_legacy, get_claim.
 *
 * When STELLAR_SECRET_KEY or HEIRLOOM_CONTRACT_ID are absent the service runs
 * in "simulated" mode: it returns deterministic fake transaction hashes so the
 * whole app is runnable without a live network. The real invocation code is
 * kept intact behind the simulated guard.
 */
@Injectable()
export class StellarService {
  private readonly logger = new Logger(StellarService.name);

  private readonly network: string;
  private readonly rpcUrl: string;
  private readonly secretKey: string;
  private readonly contractId: string;
  private readonly simulated: boolean;

  private readonly server?: rpc.Server;

  constructor(private readonly config: ConfigService) {
    this.network = this.config.get<string>('STELLAR_NETWORK') ?? 'testnet';
    this.rpcUrl =
      this.config.get<string>('STELLAR_RPC_URL') ?? 'https://soroban-testnet.stellar.org';
    this.secretKey = this.config.get<string>('STELLAR_SECRET_KEY') ?? '';
    this.contractId = this.config.get<string>('HEIRLOOM_CONTRACT_ID') ?? '';

    this.simulated = !this.secretKey || !this.contractId;

    if (this.simulated) {
      this.logger.warn(
        'StellarService running in SIMULATED mode (no STELLAR_SECRET_KEY / HEIRLOOM_CONTRACT_ID). ' +
          'Returning deterministic fake transaction hashes.',
      );
    } else {
      this.server = new rpc.Server(this.rpcUrl, {
        allowHttp: this.rpcUrl.startsWith('http://'),
      });
      this.logger.log(`StellarService connected to ${this.network} via ${this.rpcUrl}.`);
    }
  }

  isSimulated(): boolean {
    return this.simulated;
  }

  private networkPassphrase(): string {
    switch (this.network) {
      case 'mainnet':
        return Networks.PUBLIC;
      case 'futurenet':
        return Networks.FUTURENET;
      default:
        return Networks.TESTNET;
    }
  }

  /** Register a legacy plan and protect assets behind it. */
  async createLegacy(params: CreateLegacyParams): Promise<OnChainResult> {
    if (this.simulated) {
      return {
        txHash: fakeTxHash('create_legacy', params.owner, params.amount),
        simulated: true,
        data: { status: 'Active' as StellarLegacyStatus },
      };
    }
    const guardianVals = params.guardians.map((g) =>
      nativeToScVal(
        {
          address: new Address(g.address).toScVal(),
          name: nativeToScVal(g.name, { type: 'string' }),
        },
        { type: { address: ['symbol', 'address'], name: ['symbol', 'string'] } },
      ),
    );
    const beneficiaryVals = params.beneficiaries.map((b) =>
      nativeToScVal(
        {
          address: new Address(b.address).toScVal(),
          share_bps: nativeToScVal(b.shareBps, { type: 'u32' }),
        },
        { type: { address: ['symbol', 'address'], share_bps: ['symbol', 'u32'] } },
      ),
    );

    return this.invoke(params.owner, 'create_legacy', [
      new Address(params.owner).toScVal(),
      new Address(params.token).toScVal(),
      nativeToScVal(params.amount, { type: 'i128' }),
      xdr.ScVal.scvVec(guardianVals),
      nativeToScVal(params.threshold, { type: 'u32' }),
      xdr.ScVal.scvVec(beneficiaryVals),
    ]);
  }

  /** Record a guardian's approval of the verification. */
  async approveGuardian(owner: string, guardian: string): Promise<OnChainResult> {
    if (this.simulated) {
      return {
        txHash: fakeTxHash('approve_guardian', owner, guardian),
        simulated: true,
      };
    }
    return this.invoke(guardian, 'approve_guardian', [
      new Address(owner).toScVal(),
      new Address(guardian).toScVal(),
    ]);
  }

  /** Create claims for all beneficiaries once verification succeeds. */
  async createClaim(owner: string): Promise<OnChainResult> {
    if (this.simulated) {
      return { txHash: fakeTxHash('create_claim', owner), simulated: true };
    }
    return this.invoke(owner, 'create_claim', [new Address(owner).toScVal()]);
  }

  /** A beneficiary claims their allocated assets. */
  async claimAssets(owner: string, beneficiary: string): Promise<OnChainResult> {
    if (this.simulated) {
      return {
        txHash: fakeTxHash('claim_assets', owner, beneficiary),
        simulated: true,
      };
    }
    return this.invoke(beneficiary, 'claim_assets', [
      new Address(owner).toScVal(),
      new Address(beneficiary).toScVal(),
    ]);
  }

  /** The owner cancels the plan before release; protected assets are returned. */
  async cancelLegacy(owner: string): Promise<OnChainResult> {
    if (this.simulated) {
      return { txHash: fakeTxHash('cancel_legacy', owner), simulated: true };
    }
    return this.invoke(owner, 'cancel_legacy', [new Address(owner).toScVal()]);
  }

  /** Read the legacy plan for an owner (view — simulated only, no signing). */
  async getLegacy(owner: string): Promise<OnChainResult> {
    if (this.simulated) {
      return {
        txHash: fakeTxHash('get_legacy', owner),
        simulated: true,
        data: null,
      };
    }
    return this.readView('get_legacy', [new Address(owner).toScVal()]);
  }

  /** Read a single beneficiary's claim (view). */
  async getClaim(owner: string, beneficiary: string): Promise<OnChainResult> {
    if (this.simulated) {
      return {
        txHash: fakeTxHash('get_claim', owner, beneficiary),
        simulated: true,
        data: null,
      };
    }
    return this.readView('get_claim', [
      new Address(owner).toScVal(),
      new Address(beneficiary).toScVal(),
    ]);
  }

  // -------------------------------------------------------------------------
  // Real network invocation. Only reached when not simulated.
  // -------------------------------------------------------------------------

  private async invoke(
    sourceSecretOrPublic: string,
    method: string,
    args: xdr.ScVal[],
  ): Promise<OnChainResult> {
    const server = this.requireServer();
    // The platform admin key signs and pays; require_auth() in the contract
    // is satisfied for owner/guardian/beneficiary actions via additional
    // signatures in a full implementation. For the MVP the admin key drives
    // submission from the API.
    const signer = Keypair.fromSecret(this.secretKey);
    const contract = new Contract(this.contractId);

    const account = await server.getAccount(signer.publicKey());
    const tx = new TransactionBuilder(account, {
      fee: '1000000',
      networkPassphrase: this.networkPassphrase(),
    })
      .addOperation(contract.call(method, ...args))
      .setTimeout(30)
      .build();

    const prepared = await server.prepareTransaction(tx);
    prepared.sign(signer);

    const sent = await server.sendTransaction(prepared);
    if (sent.status === 'ERROR') {
      throw new Error(`Stellar transaction failed for ${method}.`);
    }

    // Poll for completion.
    let getResponse = await server.getTransaction(sent.hash);
    const deadline = Date.now() + 30_000;
    while (
      getResponse.status === rpc.Api.GetTransactionStatus.NOT_FOUND &&
      Date.now() < deadline
    ) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      getResponse = await server.getTransaction(sent.hash);
    }

    let data: unknown;
    if (
      getResponse.status === rpc.Api.GetTransactionStatus.SUCCESS &&
      getResponse.returnValue
    ) {
      data = scValToNative(getResponse.returnValue);
    }

    void sourceSecretOrPublic;
    return { txHash: sent.hash, simulated: false, data };
  }

  private async readView(method: string, args: xdr.ScVal[]): Promise<OnChainResult> {
    const server = this.requireServer();
    const signer = Keypair.fromSecret(this.secretKey);
    const contract = new Contract(this.contractId);
    const account = await server.getAccount(signer.publicKey());
    const tx = new TransactionBuilder(account, {
      fee: '1000000',
      networkPassphrase: this.networkPassphrase(),
    })
      .addOperation(contract.call(method, ...args))
      .setTimeout(30)
      .build();

    const sim = await server.simulateTransaction(tx);
    let data: unknown;
    if (rpc.Api.isSimulationSuccess(sim) && sim.result?.retval) {
      data = scValToNative(sim.result.retval);
    }
    return { txHash: fakeTxHash(method, 'view'), simulated: false, data };
  }

  private requireServer(): rpc.Server {
    if (!this.server) {
      throw new Error('Stellar RPC server is not configured.');
    }
    return this.server;
  }
}
