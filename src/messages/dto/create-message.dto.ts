import { Type } from 'class-transformer';
import {
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { MessageType } from '@prisma/client';

/**
 * When a message should be released — the Legacy Journey rules.
 * value is optional and its meaning depends on kind:
 *   AFTER_DAYS -> number of days, ON_DATE -> ISO date, AT_AGE -> age,
 *   ON_EVENT -> event name (e.g. "marriage", "graduation").
 */
export class ReleaseRuleDto {
  @IsIn(['IMMEDIATELY', 'AFTER_DAYS', 'ON_DATE', 'AT_AGE', 'ON_EVENT'], {
    message: 'Please choose when this should be shared.',
  })
  kind!: 'IMMEDIATELY' | 'AFTER_DAYS' | 'ON_DATE' | 'AT_AGE' | 'ON_EVENT';

  @IsOptional()
  value?: string | number;
}

export class CreateMessageDto {
  @IsEnum(MessageType, { message: 'Choose a message type: LETTER, VIDEO, VOICE or PHOTO.' })
  type!: MessageType;

  @IsString()
  @MinLength(1, { message: 'Please give this message a title.' })
  @MaxLength(160)
  title!: string;

  /** Optional beneficiary the message is addressed to. */
  @IsOptional()
  @IsString()
  recipientId?: string;

  /** For LETTER: the written words. Encrypted at rest. */
  @IsOptional()
  @IsString()
  content?: string;

  /** For VIDEO/VOICE/PHOTO: a reference to already-uploaded media. */
  @IsOptional()
  @IsString()
  fileUrl?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => ReleaseRuleDto)
  releaseRule?: ReleaseRuleDto;
}
