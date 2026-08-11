import { Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { Beneficiary } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ActivityService } from '../activity/activity.service';
import { ActivityType } from '../activity/activity.constants';
import { CreateBeneficiaryDto } from './dto/create-beneficiary.dto';
import { UpdateBeneficiaryDto } from './dto/update-beneficiary.dto';

/**
 * The heart of the application — the people who matter most. Every beneficiary
 * is scoped to its owner and every mutation writes to the Family Timeline.
 */
@Injectable()
export class BeneficiariesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
  ) {}

  list(userId: string): Promise<Beneficiary[]> {
    return this.prisma.beneficiary.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(userId: string, id: string): Promise<Beneficiary> {
    const beneficiary = await this.prisma.beneficiary.findFirst({ where: { id, userId } });
    if (!beneficiary) {
      throw new NotFoundException("We couldn't find that beneficiary.");
    }
    return beneficiary;
  }

  async create(userId: string, dto: CreateBeneficiaryDto): Promise<Beneficiary> {
    const beneficiary = await this.prisma.beneficiary.create({
      data: { ...dto, userId, claimToken: this.newClaimToken() },
    });
    await this.activity.record(
      userId,
      ActivityType.BENEFICIARY_ADDED,
      `Added ${beneficiary.name} (${beneficiary.relationship}) to your legacy.`,
    );
    return beneficiary;
  }

  async update(userId: string, id: string, dto: UpdateBeneficiaryDto): Promise<Beneficiary> {
    await this.findOne(userId, id);
    const beneficiary = await this.prisma.beneficiary.update({
      where: { id },
      data: { ...dto },
    });
    await this.activity.record(
      userId,
      ActivityType.BENEFICIARY_UPDATED,
      `Updated ${beneficiary.name}'s details.`,
    );
    return beneficiary;
  }

  async remove(userId: string, id: string): Promise<{ success: true }> {
    const beneficiary = await this.findOne(userId, id);
    await this.prisma.beneficiary.delete({ where: { id } });
    await this.activity.record(
      userId,
      ActivityType.BENEFICIARY_REMOVED,
      `Removed ${beneficiary.name} from your legacy.`,
    );
    return { success: true };
  }

  /**
   * A fresh, unguessable claim token: 32 random bytes (256 bits) as hex. It is
   * the only key to a beneficiary's public Legacy Capsule and is safe to place
   * in a URL — it grants viewing, never spending.
   */
  private newClaimToken(): string {
    return randomBytes(32).toString('hex');
  }
}
