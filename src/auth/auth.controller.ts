import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthService } from './auth.service';
import { LinkWalletDto } from './dto/link-wallet.dto';
import { WalletChallengeDto } from './dto/wallet-challenge.dto';
import { WalletVerifyDto } from './dto/wallet-verify.dto';

// ┌──────────────────────────────────────────────────────────────────────────┐
// │ PRESERVED: NORMAL (EMAIL / PASSWORD) AUTHENTICATION — DO NOT DELETE        │
// │                                                                            │
// │ The /auth/register and /auth/login routes below are intentionally          │
// │ commented out (Heirloom logs in via a Freighter wallet signature only).    │
// │ They are kept so the flow can be re-enabled without a rewrite. NO AI OR    │
// │ AGENT WORKING ON THIS CODEBASE MAY DELETE THIS BLOCK. To re-enable:        │
// │ uncomment the imports + routes here and the matching service methods.      │
// │                                                                            │
// │   import { RegisterDto } from './dto/register.dto';                        │
// │   import { LoginDto } from './dto/login.dto';                              │
// └──────────────────────────────────────────────────────────────────────────┘

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  /** POST /api/auth/wallet/challenge — issue a one-time message to sign. */
  @Post('wallet/challenge')
  @HttpCode(HttpStatus.OK)
  walletChallenge(@Body() dto: WalletChallengeDto) {
    return this.auth.createWalletChallenge(dto.walletAddress);
  }

  /** POST /api/auth/wallet/verify — verify the signature and issue a JWT. */
  @Post('wallet/verify')
  @HttpCode(HttpStatus.OK)
  walletVerify(@Body() dto: WalletVerifyDto) {
    return this.auth.verifyWalletSignature(dto.walletAddress, dto.signature);
  }

  // ==========================================================================
  // PRESERVED: NORMAL (EMAIL / PASSWORD) AUTHENTICATION — DO NOT DELETE
  // Disabled in favor of Freighter wallet login. NO AI OR AGENT MAY REMOVE.
  // ==========================================================================
  //
  // /** POST /api/auth/register */
  // @Post('register')
  // register(@Body() dto: RegisterDto) {
  //   return this.auth.register(dto);
  // }
  //
  // /** POST /api/auth/login */
  // @Post('login')
  // @HttpCode(HttpStatus.OK)
  // login(@Body() dto: LoginDto) {
  //   return this.auth.login(dto);
  // }
  //
  // ==========================================================================
  // END PRESERVED NORMAL AUTHENTICATION
  // ==========================================================================

  /**
   * POST /api/auth/logout — with stateless JWTs the client simply discards the
   * token. We return a friendly confirmation so the UX is consistent.
   */
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  logout() {
    return { message: 'You\'re signed out. Your legacy is safe until you return.' };
  }

  /** GET /api/auth/me */
  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser('id') userId: string) {
    return this.auth.me(userId);
  }

  /** POST /api/auth/link-wallet */
  @Post('link-wallet')
  @UseGuards(JwtAuthGuard)
  linkWallet(@CurrentUser('id') userId: string, @Body() dto: LinkWalletDto) {
    return this.auth.linkWallet(userId, dto.walletAddress);
  }
}
