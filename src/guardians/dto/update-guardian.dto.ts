import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { GuardianStatus } from '@prisma/client';

export class UpdateGuardianDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsEmail({}, { message: 'Please enter a valid email address.' })
  email?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  relationship?: string;

  @IsOptional()
  @Matches(/^G[A-Z2-7]{55}$/, {
    message: "That doesn't look like a valid Stellar account.",
  })
  walletAddress?: string;

  @IsOptional()
  @IsEnum(GuardianStatus)
  status?: GuardianStatus;
}
