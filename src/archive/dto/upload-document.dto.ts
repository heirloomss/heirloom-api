import { IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { DocumentCategory } from '@prisma/client';

/**
 * Metadata that accompanies a multipart file upload. The file itself arrives
 * as the `file` part; these fields describe it.
 */
export class UploadDocumentDto {
  @IsString()
  @MinLength(1, { message: 'Please give this document a title.' })
  @MaxLength(160)
  title!: string;

  @IsOptional()
  @IsEnum(DocumentCategory, {
    message: 'Please choose a valid category for this document.',
  })
  category?: DocumentCategory;
}
