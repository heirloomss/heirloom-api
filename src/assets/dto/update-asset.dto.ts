import {
  IsEnum,
  IsNumberString,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { AssetStatus } from '@prisma/client';

export class UpdateAssetDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(12)
  @Matches(/^[A-Za-z0-9]+$/, { message: 'Asset codes use letters and numbers only.' })
  assetCode?: string;

  @IsOptional()
  @IsNumberString({}, { message: 'Please enter a valid amount.' })
  amount?: string;

  @IsOptional()
  @IsString()
  recipientId?: string;

  @IsOptional()
  @IsEnum(AssetStatus)
  status?: AssetStatus;
}
