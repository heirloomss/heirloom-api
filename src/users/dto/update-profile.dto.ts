import {
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

/** The owner's per-channel notification toggles (all optional, default on). */
export class NotificationPreferencesDto {
  @IsOptional()
  @IsBoolean()
  checkInReminders?: boolean;

  @IsOptional()
  @IsBoolean()
  guardianResponses?: boolean;

  @IsOptional()
  @IsBoolean()
  beneficiaryClaims?: boolean;
}

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MinLength(2, { message: 'Please tell us your name.' })
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsEmail({}, { message: 'Please enter a valid email address.' })
  email?: string;

  @IsOptional()
  @IsString()
  @Matches(/^G[A-Z2-7]{55}$/, {
    message: 'That account address doesn’t look quite right. It should begin with a G.',
  })
  walletAddress?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => NotificationPreferencesDto)
  notificationPrefs?: NotificationPreferencesDto;
}
