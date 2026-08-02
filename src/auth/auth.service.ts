import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { User } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { ActivityService } from '../activity/activity.service';
import { ActivityType } from '../activity/activity.constants';
import { JwtPayload } from '../common/types/jwt-payload';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

/** Public representation of a user — never exposes the password hash. */
export type SafeUser = Omit<User, 'passwordHash'>;

export interface AuthResult {
  user: SafeUser;
  accessToken: string;
}

const SALT_ROUNDS = 12;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly activity: ActivityService,
  ) {}

  /** Register a new account with email + password. */
  async register(dto: RegisterDto): Promise<AuthResult> {
    const email = dto.email.toLowerCase().trim();
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new ConflictException('An account with this email already exists.');
    }

    const passwordHash = await bcrypt.hash(dto.password, SALT_ROUNDS);
    const user = await this.prisma.user.create({
      data: { email, name: dto.name.trim(), passwordHash },
    });

    await this.activity.record(
      user.id,
      ActivityType.ACCOUNT_CREATED,
      'Welcome to Heirloom. Your legacy begins here.',
    );

    return this.buildResult(user);
  }

  /** Email + password login. */
  async login(dto: LoginDto): Promise<AuthResult> {
    const email = dto.email.toLowerCase().trim();
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) {
      throw new UnauthorizedException('That email or password doesn\'t match our records.');
    }
    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('That email or password doesn\'t match our records.');
    }
    return this.buildResult(user);
  }

  /** Current user profile. */
  async me(userId: string): Promise<SafeUser> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException('We couldn\'t find your account.');
    }
    return this.strip(user);
  }

  /** Link (or update) a Stellar wallet address. */
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

  private buildResult(user: User): AuthResult {
    const payload: JwtPayload = { sub: user.id, email: user.email };
    const accessToken = this.jwt.sign(payload);
    return { user: this.strip(user), accessToken };
  }

  private strip(user: User): SafeUser {
    // Exclude the password hash from anything returned to clients.
    const { passwordHash: _passwordHash, ...safe } = user;
    return safe;
  }
}
