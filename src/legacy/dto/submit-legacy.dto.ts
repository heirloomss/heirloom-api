import { IsIn, IsOptional, IsString, MinLength } from 'class-validator';

/** The on-chain actions a signed transaction can carry. */
export const LEGACY_ACTIONS = [
  'protect',
  'deposit',
  'approve',
  'release',
  'claim',
  'cancel',
] as const;

export type LegacyAction = (typeof LEGACY_ACTIONS)[number];

/**
 * Relay a client-signed transaction. `action` tells the API how to reconcile
 * the database once the transaction confirms; `guardianId` / `beneficiaryId`
 * scope the local record touched by an `approve` / `claim`.
 */
export class SubmitLegacyDto {
  @IsIn(LEGACY_ACTIONS, { message: 'Unknown legacy action.' })
  action!: LegacyAction;

  /** The signed transaction envelope (base64 XDR) from Freighter. */
  @IsString()
  @MinLength(1, { message: 'A signed transaction is required.' })
  signedXdr!: string;

  /** Required for `action: "approve"` — the guardian whose approval this is. */
  @IsOptional()
  @IsString()
  guardianId?: string;

  /** Required for `action: "claim"` — the beneficiary claiming. */
  @IsOptional()
  @IsString()
  beneficiaryId?: string;
}
