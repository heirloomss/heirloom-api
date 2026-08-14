import { Transform } from 'class-transformer';
import {
  IsDateString,
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateBeneficiaryDto {
  @IsString()
  @MinLength(1, { message: 'Please enter a name.' })
  @MaxLength(120)
  name!: string;

  @IsString()
  @MinLength(1, { message: 'Please choose a relationship (e.g. Daughter, Brother, Friend).' })
  @MaxLength(60)
  relationship!: string;

  @IsEmail({}, { message: 'Please enter a valid email address.' })
  email!: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;

  @IsOptional()
  @Transform(({ value }) => (value === '' ? undefined : value))
  @Matches(/^G[A-Z2-7]{55}$/, {
    message: "That doesn't look like a valid Stellar account.",
  })
  walletAddress?: string;

  /** Optional — gates AT_AGE Legacy Journey messages (e.g. 18th birthday). */
  @IsOptional()
  @IsDateString({}, { message: 'Please enter a valid date of birth.' })
  dateOfBirth?: string;

  @IsInt()
  @Min(0, { message: "Allocation can't be negative." })
  @Max(100, { message: "Allocation can't exceed 100%." })
  allocationPercentage!: number;
}
