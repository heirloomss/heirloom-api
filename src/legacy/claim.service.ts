import { Injectable, NotFoundException } from '@nestjs/common';
import {
  Beneficiary,
  DocumentCategory,
  LegacyPlan,
  LegacyPlanStatus,
  Message,
  MessageType,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EncryptionService } from '../encryption/encryption.service';
import { UnsignedTransaction } from '../stellar/stellar.types';
import { LegacyService } from './legacy.service';
import { PublicClaimAction } from './dto/claim-public.dto';

/** A message rendered for the capsule, with its letter body decrypted. */
export interface CapsuleMessage {
  id: string;
  type: string;
  title: string;
  body: string | null;
}

/** The beneficiary-facing capsule payload. */
export interface Capsule {
  token: string;
  fromName: string;
  toName: string;
  message: string;
  status: LegacyPlanStatus;
  readyToClaim: boolean;
  assets: Array<{
    id: string;
    label: string;
    assetCode: string;
    amount: string;
    usdValue?: number;
  }>;
  documents: Array<{ id: string; title: string; category: string }>;
  messages: CapsuleMessage[];
}

/**
 * The PUBLIC side of the legacy lifecycle — the Legacy Capsule a beneficiary
 * opens without ever logging in.
 *
 * A beneficiary is a different person from the account owner and has no JWT, so
 * every method here is scoped by an unguessable per-beneficiary `claimToken`
 * carried in the URL. The token resolves to exactly one beneficiary (and thus
 * one owner + plan); from there this service DELEGATES to the same
 * owner-scoped {@link LegacyService} builders and reconcilers, so the public
 * path and the authenticated path share one code path and one set of on-chain
 * rules.
 *
 * Security: the token grants VIEWING only. It can never move funds — building
 * `finalize_release` / `claim_assets` returns unsigned XDR, and the transfer
 * still requires the beneficiary's own Freighter signature from the wallet
 * recorded on-chain. Content is additionally gated: nothing private is revealed
 * until the family has confirmed (VERIFIED) or the legacy has been released.
 */
@Injectable()
export class ClaimService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: EncryptionService,
    private readonly legacy: LegacyService,
  ) {}

  /** The guided capsule reveal. Gated so nothing private leaks before release. */
  async capsule(token: string): Promise<Capsule> {
    const { beneficiary, plan, ownerName } = await this.resolve(token);
    const status = plan?.status ?? LegacyPlanStatus.DRAFT;

    // Private content is revealed only once the family has confirmed the moment
    // has come (VERIFIED) or the legacy has been released. Before that, the
    // capsule is a gentle "being prepared" placeholder — no letters, no assets,
    // no documents — so a leaked link can never expose someone's private legacy
    // while they are still here.
    const revealed = status === LegacyPlanStatus.VERIFIED || status === LegacyPlanStatus.RELEASED;

    const base = {
      token,
      fromName: ownerName,
      toName: beneficiary.name,
      status,
      readyToClaim: status === LegacyPlanStatus.RELEASED,
    };

    if (!revealed) {
      return {
        ...base,
        message:
          'A gift is being prepared for you with great care. When the time is ' +
          'right, everything left for you will appear here — there will be ' +
          'nothing you need to do but open it.',
        assets: [],
        documents: [],
        messages: [],
      };
    }

    const [assets, documents, messages] = await Promise.all([
      this.prisma.asset.findMany({
        where: { userId: beneficiary.userId, recipientId: beneficiary.id },
        orderBy: { createdAt: 'asc' },
      }),
      // Documents aren't per-beneficiary in the MVP; the archive is shared with
      // everyone the legacy is released to, mirroring the owner's claims view.
      this.prisma.document.findMany({
        where: { userId: beneficiary.userId },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.message.findMany({
        where: { userId: beneficiary.userId, recipientId: beneficiary.id },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    return {
      ...base,
      message:
        'Someone who cared about you left this in your keeping. Take your ' +
        'time — there is no rush to open everything at once.',
      assets: assets.map((a) => ({
        id: a.id,
        label: a.assetCode,
        assetCode: a.assetCode,
        amount: a.amount.toString(),
        // No price oracle is wired in, so we never fabricate a fiat value.
        // A stablecoin's value is definitionally its face amount; everything
        // else is left unpriced rather than guessed at.
        usdValue: a.assetCode === 'USDC' ? Number(a.amount) : undefined,
      })),
      documents: documents.map((d) => ({
        id: d.id,
        title: d.title,
        category: this.friendlyCategory(d.category),
      })),
      messages: messages.map((m) => this.toCapsuleMessage(m)),
    };
  }

  /**
   * Build the permissionless `finalize_release` transaction. Delegates to the
   * owner-scoped builder using the userId the token resolves to, so the same
   * "must be VERIFIED" rule applies.
   */
  async releaseBuild(token: string, callerAddress: string): Promise<UnsignedTransaction> {
    const { beneficiary } = await this.resolve(token);
    return this.legacy.releaseBuild(beneficiary.userId, callerAddress);
  }

  /** Build the `claim_assets` transaction for the token's beneficiary. */
  async claimBuild(token: string, beneficiaryAddress: string): Promise<UnsignedTransaction> {
    const { beneficiary } = await this.resolve(token);
    return this.legacy.claimBuild(beneficiary.userId, beneficiary.id, beneficiaryAddress);
  }

  /**
   * Relay a beneficiary-signed transaction and reconcile. Only `release` and
   * `claim` reach here (enforced by the DTO); the beneficiaryId is taken from
   * the token, never from the caller, so a capsule visitor can only ever claim
   * their own share.
   */
  async submit(token: string, action: PublicClaimAction, signedXdr: string) {
    const { beneficiary } = await this.resolve(token);
    return this.legacy.submit(beneficiary.userId, {
      action,
      signedXdr,
      beneficiaryId: beneficiary.id,
    });
  }

  // -------------------------------------------------------------------------
  // Internal helpers.
  // -------------------------------------------------------------------------

  /** Resolve a claim token to its beneficiary, plan and owner name. */
  private async resolve(
    token: string,
  ): Promise<{ beneficiary: Beneficiary; plan: LegacyPlan | null; ownerName: string }> {
    // Reject obviously malformed tokens before touching the database. A real
    // token is 64 hex chars; anything shorter can't be one.
    if (!token || token.length < 32) {
      throw new NotFoundException('This legacy link is not valid.');
    }

    const beneficiary = await this.prisma.beneficiary.findUnique({
      where: { claimToken: token },
    });
    if (!beneficiary) {
      throw new NotFoundException('This legacy link is not valid.');
    }

    const [plan, owner] = await Promise.all([
      this.prisma.legacyPlan.findUnique({ where: { userId: beneficiary.userId } }),
      this.prisma.user.findUnique({
        where: { id: beneficiary.userId },
        select: { name: true },
      }),
    ]);

    return {
      beneficiary,
      plan,
      ownerName: owner?.name?.trim() || 'Someone who loves you',
    };
  }

  /** Shape a stored message for the capsule, decrypting the letter body. */
  private toCapsuleMessage(message: Message): CapsuleMessage {
    return {
      id: message.id,
      type: this.friendlyType(message.type),
      title: message.title,
      body: this.decryptBody(message),
    };
  }

  /**
   * Decrypt a letter's body for display. Failures degrade to null rather than
   * throwing so one unreadable message can never break the whole capsule.
   */
  private decryptBody(message: Message): string | null {
    if (message.contentEncrypted && message.contentIv && message.contentAuthTag) {
      try {
        return this.encryption.decryptString(
          message.contentEncrypted,
          message.contentIv,
          message.contentAuthTag,
        );
      } catch {
        return null;
      }
    }
    return null;
  }

  /** Present the storage enum (LETTER) as the UI's title-case label (Letter). */
  private friendlyType(type: MessageType): string {
    switch (type) {
      case MessageType.LETTER:
        return 'Letter';
      case MessageType.VIDEO:
        return 'Video';
      case MessageType.VOICE:
        return 'Voice';
      case MessageType.PHOTO:
        return 'Photo';
      default:
        return 'Letter';
    }
  }

  /** Present a document category enum as the UI's human label (HOUSE_DEED → House Deed). */
  private friendlyCategory(category: DocumentCategory): string {
    switch (category) {
      case DocumentCategory.PASSPORT:
        return 'Passport';
      case DocumentCategory.BIRTH_CERTIFICATE:
        return 'Birth Certificate';
      case DocumentCategory.INSURANCE:
        return 'Insurance';
      case DocumentCategory.HOUSE_DEED:
        return 'House Deed';
      case DocumentCategory.MARRIAGE_CERTIFICATE:
        return 'Marriage Certificate';
      case DocumentCategory.BUSINESS:
        return 'Business';
      case DocumentCategory.TAX:
        return 'Tax';
      case DocumentCategory.PASSWORD_HINT:
        return 'Password Hint';
      default:
        return 'Other';
    }
  }
}
