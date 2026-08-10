import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Message, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ActivityService } from '../activity/activity.service';
import { ActivityType } from '../activity/activity.constants';
import { EncryptionService } from '../encryption/encryption.service';
import { CreateMessageDto, ReleaseRuleDto } from './dto/create-message.dto';
import { UpdateMessageDto } from './dto/update-message.dto';

/** A message with its letter content decrypted for the owner. */
type MessageWithContent = Message & { content?: string | null };

const DEFAULT_RELEASE_RULE: ReleaseRuleDto = { kind: 'IMMEDIATELY' };

/**
 * Memory Collection — letters, voice, video and photos that become part of the
 * Legacy Journey. Letter text is encrypted at rest; media lives in the archive
 * storage and is referenced by fileUrl.
 */
@Injectable()
export class MessagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
    private readonly encryption: EncryptionService,
  ) {}

  async list(userId: string): Promise<Message[]> {
    // List view omits decrypted content; open one to read it.
    return this.prisma.message.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(userId: string, id: string): Promise<MessageWithContent> {
    const message = await this.prisma.message.findFirst({ where: { id, userId } });
    if (!message) {
      throw new NotFoundException("We couldn't find that message.");
    }
    return this.withDecryptedContent(message);
  }

  async create(userId: string, dto: CreateMessageDto): Promise<MessageWithContent> {
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
    await this.prisma.message.delete({ where: { id } });
    await this.activity.record(userId, ActivityType.MESSAGE_REMOVED, `Removed "${message.title}".`);
    return { success: true };
  }

  private withDecryptedContent(message: Message): MessageWithContent {
    if (message.contentEncrypted && message.contentIv && message.contentAuthTag) {
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
