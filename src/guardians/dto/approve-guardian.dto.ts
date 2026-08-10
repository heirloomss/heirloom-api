import { IsOptional, Matches } from 'class-validator';

/**
 * Build the on-chain `approve_guardian` transaction for this guardian to sign.
 * The guardian's Stellar account is required — they sign with it in Freighter.
 * If omitted, the guardian's stored `walletAddress` is used.
 */
export class ApproveGuardianDto {
  @IsOptional()
  @Matches(/^G[A-Z2-7]{55}$/, {
    message: "That doesn't look like a valid Stellar account.",
  })
  guardianAddress?: string;
}
