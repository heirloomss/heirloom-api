import { Type } from 'class-transformer';
import { IsOptional, IsString, MaxLength, MinLength, ValidateNested } from 'class-validator';
import { ReleaseRuleDto } from './create-message.dto';

export class UpdateMessageDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  title?: string;

  @IsOptional()
  @IsString()
  recipientId?: string;

  @IsOptional()
  @IsString()
  content?: string;

  @IsOptional()
  @IsString()
  fileUrl?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => ReleaseRuleDto)
  releaseRule?: ReleaseRuleDto;
}
