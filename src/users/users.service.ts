import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Read-only helpers around the User record and a dashboard summary that feeds
 * the peaceful "Your legacy is protected" hero.
 */
@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findById(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        walletAddress: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    if (!user) {
      throw new NotFoundException("We couldn't find your account.");
    }
    return user;
  }

  /** Update the caller's own profile. Only allow-listed fields may change. */
  async update(
    userId: string,
    data: { name?: string; email?: string; walletAddress?: string | null },
  ) {
    return this.prisma.user.update({
      where: { id: userId },
      data,
      select: {
        id: true,
        email: true,
        name: true,
        walletAddress: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  /**
   * Dashboard summary numbers: beneficiaries, protected assets, documents,
   * messages and last check-in — the calm dashboard cards from the PRD.
   */
  async summary(userId: string) {
    const [beneficiaries, documents, messages, assets, checkIn, plan] = await Promise.all([
      this.prisma.beneficiary.count({ where: { userId } }),
      this.prisma.document.count({ where: { userId } }),
      this.prisma.message.count({ where: { userId } }),
      this.prisma.asset.findMany({ where: { userId }, select: { amount: true, assetCode: true } }),
      this.prisma.checkIn.findUnique({ where: { userId } }),
      this.prisma.legacyPlan.findUnique({ where: { userId } }),
    ]);

    // Sum protected assets grouped by asset code (kept simple; no FX).
    const protectedByAsset: Record<string, string> = {};
    for (const asset of assets) {
      const current = protectedByAsset[asset.assetCode];
      protectedByAsset[asset.assetCode] = current
        ? (Number(current) + Number(asset.amount)).toString()
        : asset.amount.toString();
    }

    return {
      beneficiaries,
      documents,
      messages,
      protectedAssets: protectedByAsset,
      lastCheckIn: checkIn?.lastCheckIn ?? null,
      nextCheckIn: checkIn?.nextCheckIn ?? null,
      legacyStatus: plan?.status ?? 'DRAFT',
    };
  }
}
