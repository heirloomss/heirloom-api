import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ActivityService } from './activity.service';
import { CheckInService } from './check-in.service';
import { UpsertCheckInDto } from './dto/upsert-check-in.dto';

/**
 * Family Timeline (recent events) and the Life Check-In endpoints.
 * All routes are scoped to the current user.
 */
@Controller('activity')
@UseGuards(JwtAuthGuard)
export class ActivityController {
  constructor(
    private readonly activity: ActivityService,
    private readonly checkIn: CheckInService,
  ) {}

  /** GET /api/activity — recent events / timeline. */
  @Get()
  recent(@CurrentUser('id') userId: string, @Query('limit') limit?: string) {
    const take = limit ? Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200) : 50;
    return this.activity.recent(userId, take);
  }

  /** GET /api/activity/checkin — current Life Check-In state. */
  @Get('checkin')
  getCheckIn(@CurrentUser('id') userId: string) {
    return this.checkIn.get(userId);
  }

  /**
   * POST /api/activity/checkin — the "I'm Here" button.
   * With a body it (re)configures the cadence; without one it just confirms.
   */
  @Post('checkin')
  confirm(@CurrentUser('id') userId: string, @Body() dto: UpsertCheckInDto) {
    if (typeof dto?.intervalDays === 'number') {
      return this.checkIn.upsert(userId, dto.intervalDays);
    }
    return this.checkIn.confirm(userId);
  }
}
