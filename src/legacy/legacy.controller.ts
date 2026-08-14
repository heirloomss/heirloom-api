import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { LegacyService } from './legacy.service';
import { ProtectLegacyDto } from './dto/protect-legacy.dto';
import { SubmitLegacyDto } from './dto/submit-legacy.dto';
import { SetThresholdDto } from './dto/set-threshold.dto';
import { ConfirmMilestoneDto } from './dto/confirm-milestone.dto';
import { BuildClaimDto, BuildReleaseDto } from './dto/build-action.dto';

/**
 * Self-custodial legacy flow. Every state change is a two-step handshake:
 * a `/*​/build` endpoint returns an unsigned transaction the client signs in
 * Freighter, then `/submit` relays the signed envelope and reconciles the DB.
 */
@Controller('legacy')
@UseGuards(JwtAuthGuard)
export class LegacyController {
  constructor(private readonly legacy: LegacyService) {}

  /** GET /api/legacy — plan overview. */
  @Get()
  overview(@CurrentUser('id') userId: string) {
    return this.legacy.overview(userId);
  }

  /** GET /api/legacy/journey — the signature Legacy Journey timeline. */
  @Get('journey')
  journey(@CurrentUser('id') userId: string) {
    return this.legacy.journey(userId);
  }

  /** GET /api/legacy/guardian-settings — the "N of M" approval threshold. */
  @Get('guardian-settings')
  guardianSettings(@CurrentUser('id') userId: string) {
    return this.legacy.guardianSettings(userId);
  }

  /** PATCH /api/legacy/threshold — persist the approval threshold (draft only). */
  @Patch('threshold')
  setThreshold(@CurrentUser('id') userId: string, @Body() dto: SetThresholdDto) {
    return this.legacy.setThreshold(userId, dto.threshold);
  }

  /** POST /api/legacy/protect/build — unsigned create_legacy (owner). */
  @Post('protect/build')
  @HttpCode(HttpStatus.OK)
  protectBuild(@CurrentUser('id') userId: string, @Body() dto: ProtectLegacyDto) {
    return this.legacy.protectBuild(userId, dto);
  }

  /** POST /api/legacy/deposit/build — unsigned deposit (owner). */
  @Post('deposit/build')
  @HttpCode(HttpStatus.OK)
  depositBuild(@CurrentUser('id') userId: string) {
    return this.legacy.depositBuild(userId);
  }

  /** POST /api/legacy/release/build — unsigned finalize_release (permissionless). */
  @Post('release/build')
  @HttpCode(HttpStatus.OK)
  releaseBuild(@CurrentUser('id') userId: string, @Body() dto: BuildReleaseDto) {
    return this.legacy.releaseBuild(userId, dto.callerAddress);
  }

  /** POST /api/legacy/claim/build — unsigned claim_assets (beneficiary). */
  @Post('claim/build')
  @HttpCode(HttpStatus.OK)
  claimBuild(@CurrentUser('id') userId: string, @Body() dto: BuildClaimDto) {
    return this.legacy.claimBuild(userId, dto.beneficiaryId, dto.beneficiaryAddress);
  }

  /** POST /api/legacy/cancel/build — unsigned cancel_legacy (owner). */
  @Post('cancel/build')
  @HttpCode(HttpStatus.OK)
  cancelBuild(@CurrentUser('id') userId: string) {
    return this.legacy.cancelBuild(userId);
  }

  /** POST /api/legacy/submit — relay a client-signed transaction. */
  @Post('submit')
  @HttpCode(HttpStatus.OK)
  submit(@CurrentUser('id') userId: string, @Body() dto: SubmitLegacyDto) {
    return this.legacy.submit(userId, dto);
  }

  /** GET /api/legacy/claims — claim packages for beneficiaries. */
  @Get('claims')
  claims(@CurrentUser('id') userId: string) {
    return this.legacy.claims(userId);
  }

  /** POST /api/legacy/milestones — owner confirms a life event for the Journey. */
  @Post('milestones')
  @HttpCode(HttpStatus.OK)
  confirmMilestone(@CurrentUser('id') userId: string, @Body() dto: ConfirmMilestoneDto) {
    return this.legacy.confirmMilestone(userId, dto.event);
  }
}
