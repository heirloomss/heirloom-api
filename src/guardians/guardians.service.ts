import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Guardian, GuardianStatus, LegacyPlanStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ActivityService } from '../activity/activity.service';
import { ActivityType } from '../activity/activity.constants';
import { NotificationsService } from '../notifications/notifications.service';
import { StellarService } from '../stellar/stellar.service';
import { UnsignedTransaction } from '../stellar/stellar.types';
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
      throw new NotFoundException("We couldn't find that guardian.");
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
   * Build the on-chain `approve_guardian` transaction for the guardian to sign
   * in their own wallet (self-custody — the API never signs for them). The
   * guardian's address is recorded so future references match the plan, and the
   * plan must be Funded on-chain before approvals are accepted.
   *
   * The guardian's VERIFIED status and the owner's notification are applied by
   * `LegacyService.submit("approve")` once the signed transaction confirms.
   */
  async approveBuild(
    userId: string,
    id: string,
    dto: ApproveGuardianDto,
  ): Promise<UnsignedTransaction> {
    const guardian = await this.findOne(userId, id);

    const guardianAddress = dto.guardianAddress ?? guardian.walletAddress;
    if (!guardianAddress) {
      throw new BadRequestException('Connect your wallet before approving this legacy.');
    }
    if (guardian.walletAddress && guardian.walletAddress !== guardianAddress) {
      throw new BadRequestException(
        'This wallet does not match the one registered for this guardian.',
      );
    }

    const plan = await this.prisma.legacyPlan.findUnique({ where: { userId } });
    if (!plan || plan.legacyId == null) {
      throw new BadRequestException('This legacy is not registered on-chain yet.');
    }
    if (plan.status !== LegacyPlanStatus.FUNDED) {
      throw new ConflictException('This legacy is not ready for guardian approval yet.');
    }

    if (!guardian.walletAddress) {
      await this.prisma.guardian.update({
        where: { id },
        data: { walletAddress: guardianAddress },
      });
    }

    return this.stellar.buildApproveGuardian(guardianAddress, plan.legacyId);
  }
}
