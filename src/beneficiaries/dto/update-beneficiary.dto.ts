import {
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

export class UpdateBeneficiaryDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  relationship?: string;

  @IsOptional()
  @IsEmail({}, { message: 'Please enter a valid email address.' })
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;

  @IsOptional()
  @Matches(/^G[A-Z2-7]{55}$/, {
    message: 'That doesn\'t look like a valid Stellar account.',
  })
  walletAddress?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  allocationPercentage?: number;
}
