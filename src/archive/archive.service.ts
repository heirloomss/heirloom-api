import {
  BadRequestException,
  Injectable,
  NotFoundException,
  StreamableFile,
} from '@nestjs/common';
import { Document, DocumentCategory } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { ActivityService } from '../activity/activity.service';
import { ActivityType } from '../activity/activity.constants';
import { EncryptionService } from '../encryption/encryption.service';
import { StorageService } from './storage.service';
import { UploadDocumentDto } from './dto/upload-document.dto';

/**
 * Digital Archive. Files are encrypted with AES-256-GCM before they ever touch
 * storage; the database keeps only metadata plus the iv/authTag needed to
 * decrypt on download. Storage URLs are never exposed to clients.
 */
@Injectable()
export class ArchiveService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
    private readonly encryption: EncryptionService,
    private readonly storage: StorageService,
  ) {}

  list(userId: string): Promise<Document[]> {
    return this.prisma.document.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async upload(
    userId: string,
    dto: UploadDocumentDto,
    file: Express.Multer.File,
  ): Promise<Document> {
    if (!file) {
      throw new BadRequestException('Please choose a file to upload.');
    }

    // Encrypt the raw bytes, then store only ciphertext.
    const { ciphertext, iv, authTag } = this.encryption.encrypt(file.buffer);
    const key = `${userId}/${randomUUID()}`;
    const fileUrl = await this.storage.save(key, ciphertext);

    const document = await this.prisma.document.create({
      data: {
        userId,
        title: dto.title,
        category: dto.category ?? DocumentCategory.OTHER,
        fileUrl,
        encrypted: true,
        iv,
        authTag,
        mimeType: file.mimetype,
        size: file.size,
      },
    });

    await this.activity.record(
      userId,
      ActivityType.DOCUMENT_UPLOADED,
      `Uploaded "${document.title}" to your archive. It's safely encrypted.`,
    );
    return document;
  }

  /** Decrypts and streams a document back to its owner. */
  async download(userId: string, id: string): Promise<{ file: StreamableFile; document: Document }> {
    const document = await this.prisma.document.findFirst({ where: { id, userId } });
    if (!document) {
      throw new NotFoundException('We couldn\'t find that document.');
    }
    const key = this.storage.keyFromUrl(document.fileUrl);
    const ciphertext = await this.storage.read(key);
    const plaintext = this.encryption.decrypt(ciphertext, document.iv, document.authTag);
    return { file: new StreamableFile(plaintext), document };
  }

  async remove(userId: string, id: string): Promise<{ success: true }> {
    const document = await this.prisma.document.findFirst({ where: { id, userId } });
    if (!document) {
      throw new NotFoundException('We couldn\'t find that document.');
    }
    await this.storage.delete(this.storage.keyFromUrl(document.fileUrl));
    await this.prisma.document.delete({ where: { id } });
    await this.activity.record(
      userId,
      ActivityType.DOCUMENT_REMOVED,
      `Removed "${document.title}" from your archive.`,
    );
    return { success: true };
  }
}
