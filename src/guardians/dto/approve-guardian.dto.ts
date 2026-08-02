import { IsOptional, Matches } from 'class-validator';

/**
 * Records a guardian's verification. Optionally carries the guardian's Stellar
 * address so the approval can be mirrored on-chain (approve_guardian).
 */
export class ApproveGuardianDto {
  @IsOptional()
  @Matches(/^G[A-Z2-7]{55}$/, {
    message: 'That doesn\'t look like a valid Stellar account.',
  })
  guardianAddress?: string;
}
