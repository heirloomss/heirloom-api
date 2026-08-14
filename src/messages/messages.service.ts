import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Message, Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { ActivityService } from '../activity/activity.service';
import { ActivityType } from '../activity/activity.constants';
import { EncryptionService } from '../encryption/encryption.service';
import { StorageService } from '../archive/storage.service';
import { CreateMessageDto, ReleaseRuleDto } from './dto/create-message.dto';
import { UpdateMessageDto } from './dto/update-message.dto';

/** A message with its letter content decrypted for the owner. */
type MessageWithContent = Message & { content?: string | null };

const DEFAULT_RELEASE_RULE: ReleaseRuleDto = { kind: 'IMMEDIATELY' };

/**
 * Memory Collection — letters, voice, video and photos that become part of the
 * Legacy Journey. Letter text is encrypted at rest; media is encrypted and
 * stored in R2, referenced by fileUrl. Storage URLs are never exposed.
 */
@Injectable()
export class MessagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
    private readonly encryption: EncryptionService,
    private readonly storage: StorageService,
  ) {}

  async list(userId: string) {
    return this.prisma.message.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: { recipient: { select: { id: true, name: true } } },
    });
  }

  async findOne(userId: string, id: string): Promise<MessageWithContent> {
    const message = await this.prisma.message.findFirst({
      where: { id, userId },
      include: { recipient: { select: { id: true, name: true } } },
    });
    if (!message) {
      throw new NotFoundException("We couldn't find that message.");
    }
    return this.withDecryptedContent(message);
  }

  async create(
    userId: string,
    dto: CreateMessageDto,
    file?: Express.Multer.File,
  ): Promise<MessageWithContent> {
    await this.assertRecipient(userId, dto.recipientId);

    const data: Prisma.MessageCreateInput = {
      user: { connect: { id: userId } },
      type: dto.type,
      title: dto.title,
      fileUrl: dto.fileUrl ?? null,
      releaseRule: (dto.releaseRule ?? DEFAULT_RELEASE_RULE) as unknown as Prisma.InputJsonValue,
    };
    if (dto.recipientId) {
      data.recipient = { connect: { id: dto.recipientId } };
    }
    if (dto.content) {
      const { ciphertext, iv, authTag } = this.encryption.encryptString(dto.content);
      data.contentEncrypted = ciphertext;
      data.contentIv = iv;
      data.contentAuthTag = authTag;
    }
    if (file) {
      const stored = await this.storeMedia(userId, file);
      data.fileUrl = stored.fileUrl;
      data.contentIv = stored.iv;
      data.contentAuthTag = stored.authTag;
    }

    const message = await this.prisma.message.create({ data });
    await this.activity.record(
      userId,
      ActivityType.MESSAGE_CREATED,
      `Created a ${dto.type.toLowerCase()} — "${message.title}". Words can become lasting gifts.`,
    );
    return this.withDecryptedContent(message);
  }

  async update(userId: string, id: string, dto: UpdateMessageDto): Promise<MessageWithContent> {
    await this.findOne(userId, id);
    await this.assertRecipient(userId, dto.recipientId);

    const data: Prisma.MessageUpdateInput = {};
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.fileUrl !== undefined) data.fileUrl = dto.fileUrl;
    if (dto.releaseRule !== undefined) {
      data.releaseRule = dto.releaseRule as unknown as Prisma.InputJsonValue;
    }
    if (dto.recipientId !== undefined) {
      data.recipient = dto.recipientId
        ? { connect: { id: dto.recipientId } }
        : { disconnect: true };
    }
    if (dto.content !== undefined) {
      const { ciphertext, iv, authTag } = this.encryption.encryptString(dto.content);
      data.contentEncrypted = ciphertext;
      data.contentIv = iv;
      data.contentAuthTag = authTag;
    }

    const message = await this.prisma.message.update({ where: { id }, data });
    await this.activity.record(userId, ActivityType.MESSAGE_UPDATED, `Updated "${message.title}".`);
    return this.withDecryptedContent(message);
  }

  async remove(userId: string, id: string): Promise<{ success: true }> {
    const message = await this.prisma.message.findFirst({ where: { id, userId } });
    if (!message) {
      throw new NotFoundException("We couldn't find that message.");
    }
    if (message.fileUrl) {
      await this.storage.delete(this.storage.keyFromUrl(message.fileUrl));
    }
    await this.prisma.message.delete({ where: { id } });
    await this.activity.record(userId, ActivityType.MESSAGE_REMOVED, `Removed "${message.title}".`);
    return { success: true };
  }

  /** Decrypt and stream a voice/video/photo for its owner. */
  async downloadMedia(
    userId: string,
    id: string,
  ): Promise<{ buffer: Buffer; mimeType: string; title: string }> {
    const message = await this.prisma.message.findFirst({ where: { id, userId } });
    if (!message?.fileUrl || !message.contentIv || !message.contentAuthTag) {
      throw new NotFoundException("We couldn't find that recording.");
    }
    const ciphertext = await this.storage.read(this.storage.keyFromUrl(message.fileUrl));
    const buffer = this.encryption.decrypt(ciphertext, message.contentIv, message.contentAuthTag);
    return { buffer, mimeType: this.guessMime(message.type), title: message.title };
  }

  private async storeMedia(userId: string, file: Express.Multer.File) {
    if (file.size > 50 * 1024 * 1024) {
      throw new BadRequestException('Please keep recordings under 50 MB.');
    }
    const { ciphertext, iv, authTag } = this.encryption.encrypt(file.buffer);
    const key = `${userId}/messages/${randomUUID()}`;
    const fileUrl = await this.storage.save(key, ciphertext);
    return { fileUrl, iv, authTag };
  }

  private guessMime(type: Message['type']): string {
    switch (type) {
      case 'VIDEO':
        return 'video/mp4';
      case 'VOICE':
        return 'audio/mpeg';
      case 'PHOTO':
        return 'image/jpeg';
      default:
        return 'application/octet-stream';
    }
  }

  private withDecryptedContent(message: Message): MessageWithContent {
    if (
      message.type === 'LETTER' &&
      message.contentEncrypted &&
      message.contentIv &&
      message.contentAuthTag
    ) {
      const content = this.encryption.decryptString(
        message.contentEncrypted,
        message.contentIv,
        message.contentAuthTag,
      );
      return { ...message, content };
    }
    return { ...message, content: null };
  }

  private async assertRecipient(userId: string, recipientId?: string): Promise<void> {
    if (!recipientId) {
      return;
    }
    const recipient = await this.prisma.beneficiary.findFirst({
      where: { id: recipientId, userId },
    });
    if (!recipient) {
      throw new BadRequestException("That recipient isn't one of your beneficiaries.");
    }
  }
}
