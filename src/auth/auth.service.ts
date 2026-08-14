import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { User } from '@prisma/client';
import { randomBytes } from 'crypto';
import { Keypair } from '@stellar/stellar-sdk';
import { PrismaService } from '../prisma/prisma.service';
import { ActivityService } from '../activity/activity.service';
import { ActivityType } from '../activity/activity.constants';
import { JwtPayload } from '../common/types/jwt-payload';

// ┌──────────────────────────────────────────────────────────────────────────┐
// │ PRESERVED: NORMAL (EMAIL / PASSWORD) AUTHENTICATION — DO NOT DELETE        │
// │                                                                            │
// │ Heirloom logs into the dashboard with a Freighter wallet signature ONLY.   │
// │ The email/password register()/login() flow below is intentionally          │
// │ commented out, NOT removed, so it can be re-enabled later without a        │
// │ rewrite. NO AI OR AGENT WORKING ON THIS CODEBASE MAY DELETE THIS BLOCK OR   │
// │ ITS IMPORTS. To re-enable: uncomment the imports and methods here, the     │
// │ routes in auth.controller.ts, and the client in heirloom-web.              │
// │                                                                            │
// │ Imports used only by the preserved flow (kept commented to satisfy lint):  │
// │   import { ConflictException } from '@nestjs/common';                      │
// │   import * as bcrypt from 'bcryptjs';                                      │
// │   import { RegisterDto } from './dto/register.dto';                        │
// │   import { LoginDto } from './dto/login.dto';                              │
// │   const SALT_ROUNDS = 12;                                                  │
// └──────────────────────────────────────────────────────────────────────────┘

/** Public representation of a user — never exposes the password hash. */
export type SafeUser = Omit<User, 'passwordHash'>;

export interface AuthResult {
  user: SafeUser;
  accessToken: string;
}

/** How long a wallet login challenge stays valid before it must be re-issued. */
const CHALLENGE_TTL_MS = 5 * 60 * 1000;
/** Length in bytes of a Stellar (ed25519) signature. */
const SIGNATURE_BYTES = 64;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly activity: ActivityService,
  ) {}

  // ==========================================================================
  // FREIGHTER WALLET AUTHENTICATION (active)
  // ==========================================================================

  /**
   * Step 1 of wallet login: issue a one-time challenge the client signs in
   * Freighter. The nonce makes each challenge unique and single-use.
   */
  async createWalletChallenge(walletAddress: string): Promise<{ message: string }> {
    const nonce = randomBytes(24).toString('hex');
    const issuedAt = new Date();
    const expiresAt = new Date(issuedAt.getTime() + CHALLENGE_TTL_MS);
    const message = this.buildChallengeMessage(walletAddress, nonce, issuedAt);

    await this.prisma.walletChallenge.create({
      data: { walletAddress, nonce, message, expiresAt },
    });

    return { message };
  }

  /**
   * Step 2 of wallet login: verify the signature over the most recent, unexpired
   * challenge for this wallet. On success we find-or-create the user and issue a
   * JWT. The challenge is consumed either way so it can never be replayed.
   */
  async verifyWalletSignature(walletAddress: string, signature: string): Promise<AuthResult> {
    const challenge = await this.prisma.walletChallenge.findFirst({
      where: { walletAddress, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
    if (!challenge) {
      throw new UnauthorizedException(
        'Your sign-in request expired. Please connect your wallet again.',
      );
    }

    const valid = this.verifySignature(walletAddress, challenge.message, signature);

    // One-time use: clear every challenge for this wallet regardless of outcome.
    await this.prisma.walletChallenge.deleteMany({ where: { walletAddress } });

    if (!valid) {
      throw new UnauthorizedException(
        "We couldn't verify that signature. Please try connecting again.",
      );
    }

    const user = await this.findOrCreateWalletUser(walletAddress);
    return this.buildResult(user);
  }

  /** Current user profile. */
  async me(userId: string): Promise<SafeUser> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException("We couldn't find your account.");
    }
    return this.strip(user);
  }

  /** Link (or update) a Stellar wallet address on the current account. */
  async linkWallet(userId: string, walletAddress: string): Promise<SafeUser> {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { walletAddress },
    });
    await this.activity.record(
      userId,
      ActivityType.WALLET_LINKED,
      'You connected your account. Everything stays under your control.',
    );
    return this.strip(user);
  }

  // ==========================================================================
  // PRESERVED: NORMAL (EMAIL / PASSWORD) AUTHENTICATION — DO NOT DELETE
  // Intentionally disabled in favor of Freighter wallet login. See the banner
  // at the top of this file. NO AI OR AGENT MAY REMOVE THE BLOCK BELOW.
  // ==========================================================================
  //
  // /** Register a new account with email + password. */
  // async register(dto: RegisterDto): Promise<AuthResult> {
  //   const email = dto.email.toLowerCase().trim();
  //   const existing = await this.prisma.user.findUnique({ where: { email } });
  //   if (existing) {
  //     throw new ConflictException('An account with this email already exists.');
  //   }
  //
  //   const passwordHash = await bcrypt.hash(dto.password, SALT_ROUNDS);
  //   const user = await this.prisma.user.create({
  //     data: { email, name: dto.name.trim(), passwordHash },
  //   });
  //
  //   await this.activity.record(
  //     user.id,
  //     ActivityType.ACCOUNT_CREATED,
  //     'Welcome to Heirloome. Your legacy begins here.',
  //   );
  //
  //   return this.buildResult(user);
  // }
  //
  // /** Email + password login. */
  // async login(dto: LoginDto): Promise<AuthResult> {
  //   const email = dto.email.toLowerCase().trim();
  //   const user = await this.prisma.user.findUnique({ where: { email } });
  //   if (!user || !user.passwordHash) {
  //     throw new UnauthorizedException('That email or password doesn\'t match our records.');
  //   }
  //   const valid = await bcrypt.compare(dto.password, user.passwordHash);
  //   if (!valid) {
  //     throw new UnauthorizedException('That email or password doesn\'t match our records.');
  //   }
  //   return this.buildResult(user);
  // }
  //
  // ==========================================================================
  // END PRESERVED NORMAL AUTHENTICATION
  // ==========================================================================

  // --------------------------------------------------------------------------
  // Helpers
  // --------------------------------------------------------------------------

  /** Build the exact human-readable text the wallet signs. */
  private buildChallengeMessage(walletAddress: string, nonce: string, issuedAt: Date): string {
    return [
      'Heirloome — sign in to your digital legacy.',
      '',
      'Signing this message proves you control this account. It is free and',
      'submits no transaction to the network.',
      '',
      `Account: ${walletAddress}`,
      `Nonce: ${nonce}`,
      `Issued: ${issuedAt.toISOString()}`,
    ].join('\n');
  }

  /** Cryptographically verify a Stellar ed25519 signature over `message`. */
  private verifySignature(walletAddress: string, message: string, signature: string): boolean {
    try {
      const keypair = Keypair.fromPublicKey(walletAddress);
      const signatureBuffer = this.decodeSignature(signature);
      return keypair.verify(Buffer.from(message, 'utf8'), signatureBuffer);
    } catch {
      return false;
    }
  }

  /**
   * Freighter returns the signature as base64; accept hex as a defensive
   * fallback. A correct Stellar signature is exactly 64 bytes.
   */
  private decodeSignature(signature: string): Buffer {
    const trimmed = signature.trim();
    const base64 = Buffer.from(trimmed, 'base64');
    if (base64.length === SIGNATURE_BYTES) return base64;
    if (/^[0-9a-fA-F]+$/.test(trimmed)) {
      const hex = Buffer.from(trimmed, 'hex');
      if (hex.length === SIGNATURE_BYTES) return hex;
    }
    return base64;
  }

  /** Look up a wallet user, creating a fresh legacy owner on first sign-in. */
  private async findOrCreateWalletUser(walletAddress: string): Promise<User> {
    const existing = await this.prisma.user.findUnique({
      where: { walletAddress },
    });
    if (existing) return existing;

    const user = await this.prisma.user.create({
      data: { walletAddress, name: 'Heirloome Member' },
    });
    await this.activity.record(
      user.id,
      ActivityType.ACCOUNT_CREATED,
      'Welcome to Heirloome. Your legacy begins here.',
    );
    return user;
  }

  private buildResult(user: User): AuthResult {
    const payload: JwtPayload = { sub: user.id };
    if (user.email) payload.email = user.email;
    if (user.walletAddress) payload.walletAddress = user.walletAddress;
    const accessToken = this.jwt.sign(payload);
    return { user: this.strip(user), accessToken };
  }

  private strip(user: User): SafeUser {
    // Exclude the password hash from anything returned to clients.
    const { passwordHash: _passwordHash, ...safe } = user;
    return safe;
  }
}
