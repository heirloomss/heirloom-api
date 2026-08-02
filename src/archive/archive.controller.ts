import {
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  Body,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ArchiveService } from './archive.service';
import { UploadDocumentDto } from './dto/upload-document.dto';

@Controller('archive')
@UseGuards(JwtAuthGuard)
export class ArchiveController {
  constructor(private readonly archive: ArchiveService) {}

  /** GET /api/archive — list documents (metadata only). */
  @Get()
  list(@CurrentUser('id') userId: string) {
    return this.archive.list(userId);
  }

  /**
   * POST /api/archive — multipart upload. The file part is `file`; title and
   * category arrive as form fields. Bytes are encrypted before storage.
   */
  @Post()
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 50 * 1024 * 1024 } }))
  upload(
    @CurrentUser('id') userId: string,
    @Body() dto: UploadDocumentDto,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.archive.upload(userId, dto, file);
  }

  /** GET /api/archive/:id/download — decrypts and streams the file. */
  @Get(':id/download')
  async download(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { file, document } = await this.archive.download(userId, id);
    res.set({
      'Content-Type': document.mimeType,
      'Content-Disposition': `attachment; filename="${encodeURIComponent(document.title)}"`,
    });
    return file;
  }

  /** DELETE /api/archive/:id */
  @Delete(':id')
  remove(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.archive.remove(userId, id);
  }
}
