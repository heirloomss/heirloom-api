import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Asset, AssetStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ActivityService } from '../activity/activity.service';
import { ActivityType } from '../activity/activity.constants';
import { CreateAssetDto } from './dto/create-asset.dto';
import { UpdateAssetDto } from './dto/update-asset.dto';

/**
 * Protected Assets. The user experiences "Protected", never "Contract Locked".
 */
@Injectable()
export class AssetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
  ) {}

  list(userId: string): Promise<Asset[]> {
    return this.prisma.asset.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: { recipient: { select: { id: true, name: true, relationship: true } } },
    });
  }

  async findOne(userId: string, id: string): Promise<Asset> {
    const asset = await this.prisma.asset.findFirst({
      where: { id, userId },
      include: { recipient: { select: { id: true, name: true, relationship: true } } },
    });
    if (!asset) {
      throw new NotFoundException("We couldn't find that asset.");
    }
    return asset;
  }

  async create(userId: string, dto: CreateAssetDto): Promise<Asset> {
    await this.assertRecipient(userId, dto.recipientId);
    const asset = await this.prisma.asset.create({
      data: {
        userId,
        assetCode: dto.assetCode.toUpperCase(),
        amount: new Prisma.Decimal(dto.amount),
        recipientId: dto.recipientId ?? null,
        status: AssetStatus.PROTECTED,
      },
    });
    await this.activity.record(
      userId,
      ActivityType.ASSET_PROTECTED,
      `Protected ${asset.amount} ${asset.assetCode}.`,
    );
    return asset;
  }

  async update(userId: string, id: string, dto: UpdateAssetDto): Promise<Asset> {
    await this.findOne(userId, id);
    await this.assertRecipient(userId, dto.recipientId);

    const data: Prisma.AssetUpdateInput = {};
    if (dto.assetCode !== undefined) data.assetCode = dto.assetCode.toUpperCase();
    if (dto.amount !== undefined) data.amount = new Prisma.Decimal(dto.amount);
    if (dto.status !== undefined) data.status = dto.status;
    if (dto.recipientId !== undefined) {
      data.recipient = dto.recipientId
        ? { connect: { id: dto.recipientId } }
        : { disconnect: true };
    }

    const asset = await this.prisma.asset.update({ where: { id }, data });
    await this.activity.record(
      userId,
      ActivityType.ASSET_UPDATED,
      `Updated ${asset.assetCode} allocation.`,
    );
    return asset;
  }

  async remove(userId: string, id: string): Promise<{ success: true }> {
    const asset = await this.findOne(userId, id);
    await this.prisma.asset.delete({ where: { id } });
    await this.activity.record(
      userId,
      ActivityType.ASSET_REMOVED,
      `Removed ${asset.assetCode} from your legacy.`,
    );
    return { success: true };
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
