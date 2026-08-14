import { Transform } from 'class-transformer';
import {
  IsNumberString,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateAssetDto {
  /** Human name, e.g. "Family Savings". */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  label?: string;

  /** Asset code, e.g. XLM, USDC. */
  @IsString()
  @MinLength(1, { message: 'Please choose an asset (e.g. XLM or USDC).' })
  @MaxLength(12)
  @Matches(/^[A-Za-z0-9]+$/, { message: 'Asset codes use letters and numbers only.' })
  assetCode!: string;

  /** Amount as a decimal string to preserve precision (Prisma Decimal). */
  @Transform(({ value }) => (value == null ? value : String(value)))
  @IsNumberString({}, { message: 'Please enter a valid amount.' })
  amount!: string;

  /** Optional beneficiary this asset is assigned to. */
  @IsOptional()
  @IsString()
  recipientId?: string;
}
