import { IsEmail, IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
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
  @IsEnum(GuardianStatus)
  status?: GuardianStatus;
}
