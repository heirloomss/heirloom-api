import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AssetStatus,
  CheckInStatus,
  GuardianStatus,
  LegacyPlan,
  LegacyPlanStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ActivityService } from '../activity/activity.service';
import { ActivityType } from '../activity/activity.constants';
import { NotificationsService } from '../notifications/notifications.service';
import { StellarService } from '../stellar/stellar.service';
import { ContractBeneficiary, UnsignedTransaction } from '../stellar/stellar.types';
import { ProtectLegacyDto } from './dto/protect-legacy.dto';
import { SubmitLegacyDto } from './dto/submit-legacy.dto';

/**
 * Orchestrates the self-custodial legacy lifecycle.
 *
 * The API never signs for anyone. For each state change it BUILDS an unsigned
 * transaction (`*​Build` methods) that the owner / guardian / beneficiary signs
 * in their own Freighter wallet; the signed XDR returns to `submit()`, which
 * relays it, re-reads on-chain state, and reconciles the database. The user
 * only ever sees "Protected" / "Verifying" / "Ready to Claim".
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
      plan: plan ?? {
        status: LegacyPlanStatus.DRAFT,
        threshold: 2,
        contractId: null,
        legacyId: null,
      },
      counts: {
        beneficiaries: beneficiaries.length,
        guardians: guardians.length,
        verifiedGuardians: guardians.filter((g) => g.status === GuardianStatus.VERIFIED).length,
        assets: assets.length,
      },
      checkIn,
      onChainReady: this.stellar.isConfigured(),
    };
  }

  // -------------------------------------------------------------------------
  // Build steps — each returns an unsigned transaction for the client to sign.
  // -------------------------------------------------------------------------

  /**
   * Build the `create_legacy` transaction (owner-signed). Validates the plan is
   * ready and that every guardian and beneficiary has a wallet to sign/receive
   * with. Persists the plan in DRAFT so `submit("protect")` can attach the
   * returned on-chain id.
   */
  async protectBuild(userId: string, dto: ProtectLegacyDto): Promise<UnsignedTransaction> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException("We couldn't find your account.");
    }
    if (!user.walletAddress) {
      throw new BadRequestException('Connect your Freighter wallet before protecting your legacy.');
    }

    const existing = await this.prisma.legacyPlan.findUnique({
      where: { userId },
    });
    if (existing?.legacyId != null && existing.status !== LegacyPlanStatus.CANCELLED) {
      throw new ConflictException(
        'Your legacy is already registered on-chain. Fund it or cancel it first.',
      );
    }

    const [beneficiaries, guardians, assets] = await Promise.all([
      this.prisma.beneficiary.findMany({ where: { userId } }),
      this.prisma.guardian.findMany({ where: { userId } }),
      this.prisma.asset.findMany({ where: { userId } }),
    ]);

    if (beneficiaries.length === 0) {
      throw new BadRequestException('Add at least one beneficiary before protecting your legacy.');
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
        "The approval threshold can't be more than the number of guardians.",
      );
    }

    // Self-custody requires a real Stellar address for everyone who must sign
    // (guardians) or receive (beneficiaries).
    const guardiansMissingWallet = guardians.filter((g) => !g.walletAddress);
    if (guardiansMissingWallet.length > 0) {
      throw new BadRequestException(
        `These guardians need to connect a wallet first: ${guardiansMissingWallet
          .map((g) => g.name)
          .join(', ')}.`,
      );
    }
    const beneficiariesMissingWallet = beneficiaries.filter((b) => !b.walletAddress);
    if (beneficiariesMissingWallet.length > 0) {
      throw new BadRequestException(
        `These beneficiaries need to connect a wallet first: ${beneficiariesMissingWallet
          .map((b) => b.name)
          .join(', ')}.`,
      );
    }

    const guardianAddresses = guardians.map((g) => g.walletAddress as string);
    if (new Set(guardianAddresses).size !== guardianAddresses.length) {
      throw new BadRequestException(
        'Two guardians share the same wallet address. Each guardian needs a unique wallet.',
      );
    }
    const contractBeneficiaries: ContractBeneficiary[] = beneficiaries.map((b) => ({
      address: b.walletAddress as string,
      shareBps: b.allocationPercentage * 100,
    }));
    const beneficiaryAddresses = contractBeneficiaries.map((b) => b.address);
    if (new Set(beneficiaryAddresses).size !== beneficiaryAddresses.length) {
      throw new BadRequestException(
        'Two beneficiaries share the same wallet address. Each beneficiary needs a unique wallet.',
      );
    }

    const token = this.stellar.resolveTokenContract(dto.token);

    // Single-token pooled model for the MVP: sum every asset amount into one
    // committed total, expressed in the token's smallest unit (stroops).
    const totalUnits = assets.reduce(
      (sum, a) => sum.add(new Prisma.Decimal(a.amount)),
      new Prisma.Decimal(0),
    );
    const totalStroops = totalUnits.mul(10_000_000).toFixed(0);
    if (new Prisma.Decimal(totalStroops).lte(0)) {
      throw new BadRequestException('The total amount to protect must be greater than zero.');
    }

    const transaction = await this.stellar.buildCreateLegacy({
      owner: user.walletAddress,
      token,
      totalAmount: totalStroops,
      guardians: guardianAddresses,
      threshold,
      beneficiaries: contractBeneficiaries,
    });

    // Record the intended plan so submit() can reconcile it. legacyId stays
    // null until the create_legacy transaction confirms.
    await this.prisma.legacyPlan.upsert({
      where: { userId },
      create: {
        userId,
        threshold,
        status: LegacyPlanStatus.DRAFT,
        contractId: this.stellar.getContractId(),
        tokenAddress: token,
        totalAmount: new Prisma.Decimal(totalStroops),
        legacyId: null,
      },
      update: {
        threshold,
        status: LegacyPlanStatus.DRAFT,
        contractId: this.stellar.getContractId(),
        tokenAddress: token,
        totalAmount: new Prisma.Decimal(totalStroops),
        legacyId: null,
      },
    });

    return transaction;
  }

  /** Build the `deposit` transaction (owner-signed) — Draft → Funded. */
  async depositBuild(userId: string): Promise<UnsignedTransaction> {
    const { user, plan } = await this.ownerPlan(userId);
    if (plan.legacyId == null) {
      throw new BadRequestException('Register your legacy on-chain before funding it.');
    }
    if (plan.status !== LegacyPlanStatus.DRAFT) {
      throw new ConflictException('This legacy has already been funded.');
    }
    return this.stellar.buildDeposit(user.walletAddress as string, plan.legacyId);
  }

  /** Build the `cancel_legacy` transaction (owner-signed) — refunds any deposit. */
  async cancelBuild(userId: string): Promise<UnsignedTransaction> {
    const { user, plan } = await this.ownerPlan(userId);
    if (plan.legacyId == null) {
      throw new BadRequestException('There is no on-chain legacy to cancel.');
    }
    if (plan.status === LegacyPlanStatus.RELEASED || plan.status === LegacyPlanStatus.CANCELLED) {
      throw new ConflictException('This legacy can no longer be cancelled.');
    }
    return this.stellar.buildCancelLegacy(user.walletAddress as string, plan.legacyId);
  }

  /**
   * Build the `finalize_release` transaction. Permissionless on-chain, but the
   * transaction needs a funded source account (`callerAddress`) to pay the fee.
   */
  async releaseBuild(userId: string, callerAddress: string): Promise<UnsignedTransaction> {
    const plan = await this.prisma.legacyPlan.findUnique({ where: { userId } });
    if (!plan || plan.legacyId == null) {
      throw new BadRequestException('There is no on-chain legacy to release.');
    }
    if (plan.status !== LegacyPlanStatus.VERIFIED) {
      throw new ConflictException('This legacy is not verified yet, so it cannot be released.');
    }
    return this.stellar.buildFinalizeRelease(callerAddress, plan.legacyId);
  }

  /** Build the `claim_assets` transaction (beneficiary-signed). */
  async claimBuild(
    userId: string,
    beneficiaryId: string,
    beneficiaryAddress: string,
  ): Promise<UnsignedTransaction> {
    const plan = await this.prisma.legacyPlan.findUnique({ where: { userId } });
    if (!plan || plan.legacyId == null) {
      throw new BadRequestException('There is no on-chain legacy to claim.');
    }
    if (plan.status !== LegacyPlanStatus.RELEASED) {
      throw new ConflictException('This legacy is not ready to claim yet.');
    }
    const beneficiary = await this.prisma.beneficiary.findFirst({
      where: { id: beneficiaryId, userId },
    });
    if (!beneficiary) {
      throw new NotFoundException("We couldn't find that beneficiary.");
    }
    return this.stellar.buildClaimAssets(beneficiaryAddress, plan.legacyId);
  }

  // -------------------------------------------------------------------------
  // Submit — relay a client-signed transaction and reconcile the database.
  // -------------------------------------------------------------------------

  async submit(userId: string, dto: SubmitLegacyDto) {
    const plan = await this.prisma.legacyPlan.findUnique({ where: { userId } });
    if (!plan) {
      throw new BadRequestException('Start by protecting your legacy.');
    }

    const result = await this.stellar.submit(dto.signedXdr);

    switch (dto.action) {
      case 'protect':
        await this.reconcileProtect(userId, plan.id, result.data);
        break;
      case 'deposit':
        await this.reconcileDeposit(userId);
        break;
      case 'approve':
        await this.reconcileApprove(userId, plan, dto.guardianId);
        break;
      case 'release':
        await this.reconcileRelease(userId);
        break;
      case 'claim':
        await this.reconcileClaim(userId, dto.beneficiaryId);
        break;
      case 'cancel':
        await this.reconcileCancel(userId);
        break;
    }

    const updated = await this.prisma.legacyPlan.findUnique({
      where: { userId },
    });
    return { txHash: result.txHash, status: updated?.status ?? plan.status };
  }

  private async reconcileProtect(userId: string, planId: string, data: unknown): Promise<void> {
    const legacyId = this.toBigInt(data);
    if (legacyId == null) {
      throw new BadRequestException('The transaction confirmed but did not return a legacy id.');
    }
    await this.prisma.legacyPlan.update({
      where: { id: planId },
      data: { legacyId, status: LegacyPlanStatus.DRAFT },
    });
    await this.activity.record(
      userId,
      ActivityType.LEGACY_UPDATED,
      'Your legacy is registered. Fund it to finish protecting it.',
    );
  }

  private async reconcileDeposit(userId: string): Promise<void> {
    const [plan, user] = await Promise.all([
      this.prisma.legacyPlan.update({
        where: { userId },
        data: { status: LegacyPlanStatus.FUNDED },
      }),
      this.prisma.user.findUnique({ where: { id: userId } }),
    ]);
    void plan;
    await this.prisma.asset.updateMany({
      where: { userId },
      data: { status: AssetStatus.PROTECTED },
    });
    if (user?.email) {
      this.notifications.legacyUpdated(user.email);
    }
    await this.activity.record(
      userId,
      ActivityType.LEGACY_FUNDED,
      'Your legacy is protected on Stellar.',
    );
  }

  private async reconcileApprove(
    userId: string,
    plan: LegacyPlan,
    guardianId?: string,
  ): Promise<void> {
    if (guardianId) {
      const guardian = await this.prisma.guardian.findFirst({
        where: { id: guardianId, userId },
      });
      if (guardian) {
        await this.prisma.guardian.update({
          where: { id: guardian.id },
          data: { status: GuardianStatus.VERIFIED },
        });
      }
    }

    // Authoritative check: count on-chain approvals against the threshold.
    let approvals = 0;
    if (plan.legacyId != null) {
      const raw = await this.stellar.getApprovals(plan.legacyId);
      approvals = Array.isArray(raw) ? raw.length : 0;
    }

    if (approvals >= plan.threshold) {
      await this.prisma.legacyPlan.update({
        where: { userId },
        data: { status: LegacyPlanStatus.VERIFIED },
      });
      await this.prisma.checkIn.updateMany({
        where: { userId },
        data: { status: CheckInStatus.VERIFYING },
      });
      await this.activity.record(
        userId,
        ActivityType.LEGACY_VERIFIED,
        'Your guardians have confirmed. The legacy is verified.',
      );
    }
  }

  private async reconcileRelease(userId: string): Promise<void> {
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

    const beneficiaries = await this.prisma.beneficiary.findMany({
      where: { userId },
    });
    for (const beneficiary of beneficiaries) {
      this.notifications.beneficiaryNotified(beneficiary.email, beneficiary.name);
    }
    await this.activity.record(
      userId,
      ActivityType.LEGACY_RELEASED,
      'Verification complete. Claim packages are ready for your beneficiaries.',
    );
    await this.activity.record(
      userId,
      ActivityType.ASSET_RELEASED,
      'Your protected assets have been released for claiming.',
    );
  }

  private async reconcileClaim(userId: string, beneficiaryId?: string): Promise<void> {
    const [user, beneficiary] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: userId } }),
      beneficiaryId
        ? this.prisma.beneficiary.findFirst({
            where: { id: beneficiaryId, userId },
          })
        : Promise.resolve(null),
    ]);

    if (beneficiary) {
      await this.prisma.asset.updateMany({
        where: { userId, recipientId: beneficiary.id },
        data: { status: AssetStatus.CLAIMED },
      });
      if (user?.email) {
        this.notifications.assetClaimed(user.email, beneficiary.name);
      }
      await this.activity.record(
        userId,
        ActivityType.CLAIM_COMPLETED,
        `${beneficiary.name} has received their legacy.`,
      );
    }
  }

  private async reconcileCancel(userId: string): Promise<void> {
    await this.prisma.legacyPlan.update({
      where: { userId },
      data: { status: LegacyPlanStatus.CANCELLED },
    });
    await this.prisma.asset.updateMany({
      where: { userId },
      data: { status: AssetStatus.PROTECTED },
    });
    await this.prisma.checkIn.updateMany({
      where: { userId },
      data: { status: CheckInStatus.ACTIVE },
    });
    await this.activity.record(
      userId,
      ActivityType.LEGACY_CANCELLED,
      'Your legacy plan was cancelled and any funds were refunded to you.',
    );
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
        .map((a) => ({
          assetCode: a.assetCode,
          amount: a.amount.toString(),
          status: a.status,
        })),
      messages: messages
        .filter((m) => m.recipientId === beneficiary.id)
        .map((m) => ({ id: m.id, title: m.title, type: m.type })),
      // Documents aren't per-beneficiary in the MVP; the whole archive is shared.
      documents: documents.map((d) => ({
        id: d.id,
        title: d.title,
        category: d.category,
      })),
      status: released ? 'READY_TO_CLAIM' : 'PREPARING',
    }));

    return {
      status: plan?.status ?? LegacyPlanStatus.DRAFT,
      readyToClaim: released,
      packages,
    };
  }

  // -------------------------------------------------------------------------
  // Helpers.
  // -------------------------------------------------------------------------

  /** Load the owner + their plan, asserting both exist and a wallet is linked. */
  private async ownerPlan(userId: string) {
    const [user, plan] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: userId } }),
      this.prisma.legacyPlan.findUnique({ where: { userId } }),
    ]);
    if (!user) {
      throw new NotFoundException("We couldn't find your account.");
    }
    if (!user.walletAddress) {
      throw new BadRequestException('Connect your Freighter wallet first.');
    }
    if (!plan) {
      throw new BadRequestException('Start by protecting your legacy.');
    }
    return { user, plan };
  }

  /** Coerce a Soroban u64 return value (bigint | number | string) to bigint. */
  private toBigInt(data: unknown): bigint | null {
    if (typeof data === 'bigint') return data;
    if (typeof data === 'number' && Number.isFinite(data)) return BigInt(data);
    if (typeof data === 'string' && /^\d+$/.test(data)) return BigInt(data);
    return null;
  }
}
