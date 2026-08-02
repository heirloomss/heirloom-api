import {
  IsNumberString,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateAssetDto {
  /** Asset code, e.g. XLM, USDC. */
  @IsString()
  @MinLength(1, { message: 'Please choose an asset (e.g. XLM or USDC).' })
  @MaxLength(12)
  @Matches(/^[A-Za-z0-9]+$/, { message: 'Asset codes use letters and numbers only.' })
  assetCode!: string;

  /** Amount as a decimal string to preserve precision (Prisma Decimal). */
  @IsNumberString({}, { message: 'Please enter a valid amount.' })
  amount!: string;

  /** Optional beneficiary this asset is assigned to. */
  @IsOptional()
  @IsString()
  recipientId?: string;
}
