import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ClaimService } from './claim.service';
import {
  PublicClaimBuildDto,
  PublicReleaseBuildDto,
  PublicSubmitDto,
} from './dto/claim-public.dto';

/**
 * The PUBLIC Legacy Capsule — the one place in Heirloom a person reaches WITHOUT
 * logging in. A beneficiary is a different person from the account owner and has
 * no JWT; the unguessable `:token` in the URL is their only credential, emailed
 * to them when the legacy is released.
 *
 * There is deliberately NO JwtAuthGuard here. Security instead rests on three
 * things: the token is 256 bits of entropy (unguessable), every route is tightly
 * rate-limited to blunt any enumeration attempt, and — most importantly — the
 * token can only ever VIEW the capsule and BUILD unsigned transactions. Moving
 * funds still requires the beneficiary's own Freighter signature from the wallet
 * recorded on-chain, so a leaked link can never drain a legacy.
 */
@Controller('claim')
@Throttle({ default: { ttl: 60_000, limit: 30 } })
export class ClaimController {
  constructor(private readonly claim: ClaimService) {}

  /** GET /api/claim/:token — the guided capsule reveal (gated until released). */
  @Get(':token')
  capsule(@Param('token') token: string) {
    return this.claim.capsule(token);
  }

  /**
   * POST /api/claim/:token/release/build — unsigned finalize_release. The call is
   * permissionless (the owner is gone) but still needs the beneficiary's account
   * as the funded source to sequence and pay the fee.
   */
  @Post(':token/release/build')
  @HttpCode(HttpStatus.OK)
  releaseBuild(@Param('token') token: string, @Body() dto: PublicReleaseBuildDto) {
    return this.claim.releaseBuild(token, dto.callerAddress);
  }

  /** POST /api/claim/:token/claim/build — unsigned claim_assets (beneficiary). */
  @Post(':token/claim/build')
  @HttpCode(HttpStatus.OK)
  claimBuild(@Param('token') token: string, @Body() dto: PublicClaimBuildDto) {
    return this.claim.claimBuild(token, dto.beneficiaryAddress);
  }

  /**
   * POST /api/claim/:token/submit — relay a beneficiary-signed transaction. Only
   * `release` and `claim` are accepted (enforced by the DTO); the beneficiary is
   * always taken from the token, never the request body, so a capsule visitor can
   * only ever push the release forward and claim their own share.
   */
  @Post(':token/submit')
  @HttpCode(HttpStatus.OK)
  submit(@Param('token') token: string, @Body() dto: PublicSubmitDto) {
    return this.claim.submit(token, dto.action, dto.signedXdr);
  }
}
