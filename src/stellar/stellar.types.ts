import { createHash } from 'crypto';

/** A guardian as understood by the on-chain contract. */
export interface ContractGuardian {
  address: string;
  name: string;
}

/** A beneficiary allocation in basis points (10,000 = 100%). */
export interface ContractBeneficiary {
  address: string;
  shareBps: number;
}

export interface CreateLegacyParams {
  owner: string;
  token: string;
  amount: string; // stroops / smallest unit, as a decimal string
  guardians: ContractGuardian[];
  threshold: number;
  beneficiaries: ContractBeneficiary[];
}

export type StellarLegacyStatus = 'Active' | 'Verified' | 'Released' | 'Cancelled';

export interface OnChainResult {
  /** Transaction hash (real, or deterministic fake in simulated mode). */
  txHash: string;
  /** Whether this came from the network or the local simulator. */
  simulated: boolean;
  /** Free-form contract return data. */
  data?: unknown;
}

/** Deterministic fake tx hash so demos are stable and inspectable. */
export function fakeTxHash(...parts: string[]): string {
  return createHash('sha256').update(['heirloom', ...parts].join(':')).digest('hex');
}
