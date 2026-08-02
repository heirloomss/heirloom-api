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
import { LegacyService } from './legacy.service';
import { ProtectLegacyDto } from './dto/protect-legacy.dto';

@Controller('legacy')
@UseGuards(JwtAuthGuard)
export class LegacyController {
  constructor(private readonly legacy: LegacyService) {}

  /** GET /api/legacy — plan overview. */
  @Get()
  overview(@CurrentUser('id') userId: string) {
    return this.legacy.overview(userId);
  }

  /** POST /api/legacy/protect — create the on-chain plan. */
  @Post('protect')
  protect(@CurrentUser('id') userId: string, @Body() dto: ProtectLegacyDto) {
    return this.legacy.protect(userId, dto);
  }

  /** POST /api/legacy/simulate-release — demo verification + release flow. */
  @Post('simulate-release')
  @HttpCode(HttpStatus.OK)
  simulateRelease(@CurrentUser('id') userId: string) {
    return this.legacy.simulateRelease(userId);
  }

  /** GET /api/legacy/claims — claim packages for beneficiaries. */
  @Get('claims')
  claims(@CurrentUser('id') userId: string) {
    return this.legacy.claims(userId);
  }
}
