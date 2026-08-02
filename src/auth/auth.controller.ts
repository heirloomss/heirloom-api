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
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { LinkWalletDto } from './dto/link-wallet.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  /** POST /api/auth/register */
  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }

  /** POST /api/auth/login */
  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
  }

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
