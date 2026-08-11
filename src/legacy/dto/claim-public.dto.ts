import { IsIn, IsString, Matches, MinLength } from 'class-validator';

const STELLAR_ACCOUNT = /^G[A-Z2-7]{55}$/;

/**
 * The public Legacy Capsule at /claim/:token is reached by the beneficiary
 * WITHOUT logging in — the token in the URL is their only credential. Holding it
 * lets them VIEW the capsule and build the two transactions they must sign in
 * their own Freighter wallet; it can never move funds on its own. These DTOs
 * validate the small, tightly-scoped bodies those routes accept.
 */

/**
 * Build `finalize_release` from the capsule. The contract call is permissionless
 * (the owner is gone), but the transaction still needs a funded source account
 * to pay the fee and be sequenced — the beneficiary's own connected account.
 */
export class PublicReleaseBuildDto {
  @Matches(STELLAR_ACCOUNT, {
    message: "That doesn't look like a valid Stellar account.",
  })
  callerAddress!: string;
}

/** Build `claim_assets` from the capsule — signed by the beneficiary. */
export class PublicClaimBuildDto {
  /** The beneficiary's own Stellar account (the signer and the recipient). */
  @Matches(STELLAR_ACCOUNT, {
    message: "That doesn't look like a valid Stellar account.",
  })
  beneficiaryAddress!: string;
}

/**
 * The only actions the public capsule may relay. Everything else (protect,
 * deposit, approve, cancel) is owner/guardian territory and stays behind the
 * authenticated /legacy routes — a capsule visitor can only push the release
 * forward and claim their own share.
 */
export const PUBLIC_CLAIM_ACTIONS = ['release', 'claim'] as const;
export type PublicClaimAction = (typeof PUBLIC_CLAIM_ACTIONS)[number];

/** Relay a beneficiary-signed transaction from the capsule. */
export class PublicSubmitDto {
  @IsIn(PUBLIC_CLAIM_ACTIONS, { message: 'Unknown claim action.' })
  action!: PublicClaimAction;

  /** The signed transaction envelope (base64 XDR) from Freighter. */
  @IsString()
  @MinLength(1, { message: 'A signed transaction is required.' })
  signedXdr!: string;
}
