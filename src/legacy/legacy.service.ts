import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AssetStatus,
  CheckInStatus,
  GuardianStatus,
  LegacyPlan,
  LegacyPlanStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ActivityService } from '../activity/activity.service';
import { ActivityType } from '../activity/activity.constants';
import { NotificationsService } from '../notifications/notifications.service';
import { StellarService } from '../stellar/stellar.service';
import { ContractBeneficiary, ContractGuardian } from '../stellar/stellar.types';
import { ProtectLegacyDto } from './dto/protect-legacy.dto';

/** Native XLM asset placeholder used when no token address is supplied. */
const NATIVE_TOKEN = 'native';

/**
 * Ties beneficiaries, guardians and protected assets together into a single
 * on-chain legacy plan, and runs the demo verification + claim flow. The user
 * only ever sees "Protected" / "Verifying" / "Ready to Claim" — never
 * blockchain jargon.
 */
@Injectable()
export class LegacyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
    private readonly notifications: NotificationsService,
    private readonly stellar: StellarService,
  ) {}

  /** The current plan plus a snapshot of what it protects. */
  async overview(userId: string) {
    const [plan, beneficiaries, guardians, assets, checkIn] = await Promise.all([
      this.prisma.legacyPlan.findUnique({ where: { userId } }),
      this.prisma.beneficiary.findMany({ where: { userId } }),
      this.prisma.guardian.findMany({ where: { userId } }),
      this.prisma.asset.findMany({ where: { userId } }),
      this.prisma.checkIn.findUnique({ where: { userId } }),
    ]);

    return {
      plan: plan ?? { status: LegacyPlanStatus.DRAFT, threshold: 2, contractId: null },
      counts: {
        beneficiaries: beneficiaries.length,
        guardians: guardians.length,
        verifiedGuardians: guardians.filter((g) => g.status === GuardianStatus.VERIFIED).length,
        assets: assets.length,
      },
      checkIn,
      simulated: this.stellar.isSimulated(),
    };
  }

  /**
   * Protect the plan: allocate beneficiaries and guardians on-chain and move
   * the assets behind the Soroban contract (or simulate it).
   */
  async protect(userId: string, dto: ProtectLegacyDto): Promise<LegacyPlan> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('We couldn\'t find your account.');
    }

    const [beneficiaries, guardians, assets] = await Promise.all([
      this.prisma.beneficiary.findMany({ where: { userId } }),
      this.prisma.guardian.findMany({ where: { userId } }),
      this.prisma.asset.findMany({ where: { userId } }),
    ]);

    if (beneficiaries.length === 0) {
      throw new BadRequestException(
        'Add at least one beneficiary before protecting your legacy.',
      );
    }
    if (guardians.length === 0) {
      throw new BadRequestException(
        'Choose at least one trusted guardian before protecting your legacy.',
      );
    }
    if (assets.length === 0) {
      throw new BadRequestException('Add at least one asset to protect.');
    }

    const totalAllocation = beneficiaries.reduce((sum, b) => sum + b.allocationPercentage, 0);
    if (totalAllocation !== 100) {
      throw new BadRequestException(
        `Your beneficiary allocations add up to ${totalAllocation}%. They need to total 100%.`,
      );
    }

    const threshold = dto.threshold ?? Math.min(2, guardians.length);
    if (threshold > guardians.length) {
      throw new BadRequestException(
        'The approval threshold can\'t be more than the number of guardians.',
      );
    }

    // Sum protected amount across assets (single-token model for the MVP).
    const totalAmount = assets.reduce((sum, a) => sum + Number(a.amount), 0);

    const contractGuardians: ContractGuardian[] = guardians.map((g) => ({
      // In simulated mode we don't have on-chain addresses for every guardian;
      // fall back to the owner's wallet so the shape is valid.
      address: user.walletAddress ?? placeholderAddress(g.id),
      name: g.name,
    }));
    const contractBeneficiaries: ContractBeneficiary[] = beneficiaries.map((b) => ({
      address: b.walletAddress ?? placeholderAddress(b.id),
      shareBps: Math.round(b.allocationPercentage * 100),
    }));

    const owner = user.walletAddress ?? placeholderAddress(user.id);
    const result = await this.stellar.createLegacy({
      owner,
      token: dto.token ?? NATIVE_TOKEN,
      amount: String(Math.round(totalAmount * 1e7)), // to stroops
      guardians: contractGuardians,
      threshold,
      beneficiaries: contractBeneficiaries,
    });

    const plan = await this.prisma.legacyPlan.upsert({
      where: { userId },
      create: {
        userId,
        threshold,
        status: LegacyPlanStatus.PROTECTED,
        contractId: result.txHash,
      },
      update: {
        threshold,
        status: LegacyPlanStatus.PROTECTED,
        contractId: result.txHash,
      },
    });

    // Reflect protection on the assets.
    await this.prisma.asset.updateMany({
      where: { userId },
      data: { status: AssetStatus.PROTECTED, contractId: result.txHash },
    });

    // Wallet-only accounts may have no email on file — only notify when we have one.
    if (user.email) {
      this.notifications.legacyUpdated(user.email);
    }
    await this.activity.record(
      userId,
      ActivityType.LEGACY_PROTECTED,
      result.simulated
        ? 'Your legacy is protected. (Demo mode — no live network needed.)'
        : 'Your legacy is protected on Stellar.',
    );

    return plan;
  }

  /**
   * Simulated verification flow for the demo: mark the check-in as verifying,
   * verify guardians up to threshold, then release. Produces claim packages.
   */
  async simulateRelease(userId: string) {
    const plan = await this.prisma.legacyPlan.findUnique({ where: { userId } });
    if (!plan) {
      throw new BadRequestException('Protect your legacy before running a release.');
    }
    const user = await this.prisma.user.findUnique({ where: { id: userId } });

    const guardians = await this.prisma.guardian.findMany({ where: { userId } });
    const owner = user?.walletAddress ?? placeholderAddress(userId);

    // Move the check-in into the gentle verification state.
    await this.prisma.checkIn.updateMany({
      where: { userId },
      data: { status: CheckInStatus.VERIFYING },
    });
    await this.prisma.legacyPlan.update({
      where: { userId },
      data: { status: LegacyPlanStatus.VERIFYING },
    });
    await this.activity.record(
      userId,
      ActivityType.LEGACY_VERIFYING,
      'Verification has begun. Your guardians are being asked to confirm.',
    );

    // Guardians approve, up to the threshold.
    const toApprove = guardians.slice(0, plan.threshold);
    for (const guardian of toApprove) {
      await this.stellar.approveGuardian(owner, placeholderAddress(guardian.id));
      await this.prisma.guardian.update({
        where: { id: guardian.id },
        data: { status: GuardianStatus.VERIFIED },
      });
      if (user) {
        this.notifications.guardianVerificationRequested(
          guardian.email,
          guardian.name,
          user.name,
        );
      }
    }

    // Create claims + release.
    await this.stellar.createClaim(owner);
    await this.prisma.legacyPlan.update({
      where: { userId },
      data: { status: LegacyPlanStatus.RELEASED },
    });
    await this.prisma.asset.updateMany({
      where: { userId },
      data: { status: AssetStatus.RELEASED },
    });
    await this.prisma.checkIn.updateMany({
      where: { userId },
      data: { status: CheckInStatus.RELEASED },
    });

    // Notify beneficiaries their legacy is ready.
    const beneficiaries = await this.prisma.beneficiary.findMany({ where: { userId } });
    for (const beneficiary of beneficiaries) {
      this.notifications.beneficiaryNotified(beneficiary.email, beneficiary.name);
    }

    await this.activity.record(
      userId,
      ActivityType.LEGACY_RELEASED,
      'Verification complete. Claim packages are ready for your beneficiaries.',
    );

    return this.claims(userId);
  }

  /**
   * Claim packages for each beneficiary — assets, documents and messages,
   * presented as a warm "gift prepared for you" rather than a file list.
   */
  async claims(userId: string) {
    const [plan, beneficiaries, assets, documents, messages] = await Promise.all([
      this.prisma.legacyPlan.findUnique({ where: { userId } }),
      this.prisma.beneficiary.findMany({ where: { userId } }),
      this.prisma.asset.findMany({ where: { userId } }),
      this.prisma.document.findMany({ where: { userId } }),
      this.prisma.message.findMany({ where: { userId } }),
    ]);

    const released = plan?.status === LegacyPlanStatus.RELEASED;

    const packages = beneficiaries.map((beneficiary) => ({
      beneficiary: {
        id: beneficiary.id,
        name: beneficiary.name,
        relationship: beneficiary.relationship,
        allocationPercentage: beneficiary.allocationPercentage,
      },
      assets: assets
        .filter((a) => a.recipientId === beneficiary.id)
        .map((a) => ({ assetCode: a.assetCode, amount: a.amount.toString(), status: a.status })),
      messages: messages
        .filter((m) => m.recipientId === beneficiary.id)
        .map((m) => ({ id: m.id, title: m.title, type: m.type })),
      // Documents aren't per-beneficiary in the MVP; the whole archive is shared.
      documents: documents.map((d) => ({ id: d.id, title: d.title, category: d.category })),
      status: released ? 'READY_TO_CLAIM' : 'PREPARING',
    }));

    return {
      status: plan?.status ?? LegacyPlanStatus.DRAFT,
      readyToClaim: released,
      packages,
    };
  }
}

/**
 * Deterministic placeholder Stellar address for entities without a linked
 * wallet, so simulated on-chain payloads keep a valid shape. Never used for a
 * real transfer — the simulated guard short-circuits before the network.
 */
function placeholderAddress(seed: string): string {
  const base = 'G';
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let out = '';
  let n = 0;
  for (let i = 0; i < seed.length; i++) {
    n = (n + seed.charCodeAt(i)) % alphabet.length;
    out += alphabet[n];
  }
  while (out.length < 55) {
    n = (n * 31 + out.length) % alphabet.length;
    out += alphabet[n];
  }
  return base + out.slice(0, 55);
}
