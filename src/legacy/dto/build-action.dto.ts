import { IsOptional, IsString, Matches } from 'class-validator';

const STELLAR_ACCOUNT = /^G[A-Z2-7]{55}$/;

/** Build `approve_guardian` XDR — signed by the guardian. */
export class BuildApproveDto {
  /** The guardian record whose approval this is. */
  @IsString()
  guardianId!: string;

  /** The guardian's own Stellar account (the signer). */
  @Matches(STELLAR_ACCOUNT, {
    message: "That doesn't look like a valid Stellar account.",
  })
  guardianAddress!: string;
}

/**
 * Build `finalize_release` XDR. The call is permissionless, but the transaction
 * still needs a funded source account to pay the fee — `callerAddress`.
 */
export class BuildReleaseDto {
  @Matches(STELLAR_ACCOUNT, {
    message: "That doesn't look like a valid Stellar account.",
  })
  callerAddress!: string;
}

/** Build `claim_assets` XDR — signed by the beneficiary. */
export class BuildClaimDto {
  /** The beneficiary record claiming. */
  @IsString()
  beneficiaryId!: string;

  /** The beneficiary's own Stellar account (the signer). */
  @Matches(STELLAR_ACCOUNT, {
    message: "That doesn't look like a valid Stellar account.",
  })
  beneficiaryAddress!: string;
}

/** Optional: identify a specific plan (owner has exactly one, so usually omitted). */
export class BuildOwnerActionDto {
  @IsOptional()
  @IsString()
  planId?: string;
}
