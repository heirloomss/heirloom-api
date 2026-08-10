/**
 * Types shared across the Stellar layer.
 *
 * Heirloom is self-custodial: the API never holds a signing key for owners,
 * guardians or beneficiaries. Every state-changing contract call is returned to
 * the client as an *unsigned* transaction envelope (XDR); the client signs it in
 * their own Freighter wallet and posts the signed XDR back to `/legacy/submit`.
 * These types describe that build/submit handshake and the on-chain plan shape
 * (see ../../heirloom-contracts/contracts/legacy/src/lib.rs).
 */

/** A beneficiary allocation in basis points (10,000 = 100%). */
export interface ContractBeneficiary {
  address: string;
  shareBps: number;
}

/** Arguments for `create_legacy(owner, token, total_amount, guardians, threshold, beneficiaries)`. */
export interface CreateLegacyParams {
  owner: string;
  token: string;
  /** Committed total in the token's smallest unit, as a decimal string (i128). */
  totalAmount: string;
  /** Guardian account addresses (Vec<Address>). */
  guardians: string[];
  threshold: number;
  beneficiaries: ContractBeneficiary[];
}

/**
 * An unsigned transaction the client must sign in Freighter. `xdr` is the
 * base64 transaction envelope; `networkPassphrase` tells Freighter which
 * network to sign for.
 */
export interface UnsignedTransaction {
  xdr: string;
  networkPassphrase: string;
  /** The contract method this envelope calls — for client-side display/telemetry. */
  method: string;
  /** The account expected to sign (source / auth). */
  source: string;
}

/** Result of submitting a signed transaction to the network. */
export interface SubmitResult {
  txHash: string;
  /** Decoded contract return value, if any. */
  data?: unknown;
}

/** On-chain legacy plan status, mirroring `LegacyStatus` in the contract. */
export type StellarLegacyStatus = 'Draft' | 'Funded' | 'Verified' | 'Released' | 'Cancelled';

/** Decoded `LegacyPlan` as returned by the `get_legacy` view. */
export interface OnChainLegacyPlan {
  owner: string;
  token: string;
  total_amount: bigint;
  guardians: string[];
  threshold: number;
  beneficiaries: { beneficiary: string; bps: number }[];
  status: StellarLegacyStatus;
  deposited: boolean;
}
