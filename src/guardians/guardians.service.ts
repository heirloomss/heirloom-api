import { Injectable, NotFoundException } from '@nestjs/common';
import { Guardian, GuardianStatus, User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ActivityService } from '../activity/activity.service';
import { ActivityType } from '../activity/activity.constants';
import { NotificationsService } from '../notifications/notifications.service';
import { StellarService } from '../stellar/stellar.service';
import { CreateGuardianDto } from './dto/create-guardian.dto';
import { UpdateGuardianDto } from './dto/update-guardian.dto';
import { ApproveGuardianDto } from './dto/approve-guardian.dto';

/**
 * Trusted Guardians (N-of-M). Guardians never take ownership of assets — they
 * only confirm the verification process.
 */
@Injectable()
export class GuardiansService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
    private readonly notifications: NotificationsService,
    private readonly stellar: StellarService,
  ) {}

  list(userId: string): Promise<Guardian[]> {
    return this.prisma.guardian.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(userId: string, id: string): Promise<Guardian> {
    const guardian = await this.prisma.guardian.findFirst({ where: { id, userId } });
    if (!guardian) {
      throw new NotFoundException('We couldn\'t find that guardian.');
    }
    return guardian;
  }

  async create(userId: string, dto: CreateGuardianDto): Promise<Guardian> {
    const guardian = await this.prisma.guardian.create({
      data: { ...dto, userId, status: GuardianStatus.PENDING },
    });

    const owner = await this.prisma.user.findUnique({ where: { id: userId } });
    this.notifications.guardianInvited(guardian.email, guardian.name, owner?.name ?? 'Someone');

    await this.activity.record(
      userId,
      ActivityType.GUARDIAN_INVITED,
      `Invited ${guardian.name} to be a trusted guardian.`,
    );
    return guardian;
  }

  async update(userId: string, id: string, dto: UpdateGuardianDto): Promise<Guardian> {
    await this.findOne(userId, id);
    const guardian = await this.prisma.guardian.update({
      where: { id },
      data: { ...dto },
    });
    await this.activity.record(
      userId,
      ActivityType.GUARDIAN_UPDATED,
      `Updated guardian ${guardian.name}.`,
    );
    return guardian;
  }

  async remove(userId: string, id: string): Promise<{ success: true }> {
    const guardian = await this.findOne(userId, id);
    await this.prisma.guardian.delete({ where: { id } });
    await this.activity.record(
      userId,
      ActivityType.GUARDIAN_REMOVED,
      `Removed guardian ${guardian.name}.`,
    );
    return { success: true };
  }

  /**
   * Records a guardian's verification. Marks the guardian VERIFIED, mirrors the
   * approval on-chain (or in simulated mode), notifies the owner and logs it.
   */
  async approve(userId: string, id: string, dto: ApproveGuardianDto) {
    const guardian = await this.findOne(userId, id);
    const owner: User | null = await this.prisma.user.findUnique({ where: { id: userId } });

    const updated = await this.prisma.guardian.update({
      where: { id },
      data: { status: GuardianStatus.VERIFIED },
    });

    let onChain = undefined;
    if (owner?.walletAddress && dto.guardianAddress) {
      onChain = await this.stellar.approveGuardian(owner.walletAddress, dto.guardianAddress);
    }

    if (owner?.email) {
      this.notifications.guardianAccepted(owner.email, guardian.name);
    }

    await this.activity.record(
      userId,
      ActivityType.GUARDIAN_ACCEPTED,
      `${guardian.name} accepted your invitation. Your legacy is a little more protected today.`,
    );

    return { guardian: updated, onChain };
  }
}
