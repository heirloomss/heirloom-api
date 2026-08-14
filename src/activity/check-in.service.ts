import { Injectable } from '@nestjs/common';
import { CheckInStatus, LegacyPlanStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ActivityService } from './activity.service';
import { ActivityType } from './activity.constants';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface CheckInView {
  intervalDays: number;
  lastCheckIn: Date;
  nextCheckIn: Date;
  status: CheckInStatus;
  daysRemaining: number;
}

/**
 * Life Check-In ("I'm Here") logic. Missing a check-in never assumes the worst
 * — it begins a gentle verification workflow handled by the scheduler.
 */
@Injectable()
export class CheckInService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
  ) {}

  /** Fetch the user's check-in, shaped for the dashboard. */
  async get(userId: string): Promise<CheckInView | null> {
    const checkIn = await this.prisma.checkIn.findUnique({ where: { userId } });
    if (!checkIn) {
      return null;
    }
    const daysRemaining = Math.max(
      0,
      Math.ceil((checkIn.nextCheckIn.getTime() - Date.now()) / DAY_MS),
    );
    return {
      intervalDays: checkIn.intervalDays,
      lastCheckIn: checkIn.lastCheckIn,
      nextCheckIn: checkIn.nextCheckIn,
      status: checkIn.status,
      daysRemaining,
    };
  }

  /** Configure or update the cadence, resetting the timer from now. */
  async upsert(userId: string, intervalDays: number): Promise<CheckInView> {
    const checkIn = await this.reset(userId, intervalDays);
    await this.activity.record(
      userId,
      ActivityType.CHECK_IN_CONFIRMED,
      `Life Check-In set to every ${intervalDays} days. We'll gently check in with you.`,
    );
    return this.toView(checkIn);
  }

  /**
   * The "I'm Here" button. Resets the timer and returns the plan to ACTIVE
   * even if it had drifted into MISSED/VERIFYING — the user is clearly fine.
   * Off-chain VERIFYING (guardians notified, no on-chain verification yet) is
   * rolled back to FUNDED so nothing proceeds while they are here.
   */
  async confirm(userId: string): Promise<CheckInView> {
    const existing = await this.prisma.checkIn.findUnique({ where: { userId } });
    const intervalDays = existing?.intervalDays ?? 90;
    const checkIn = await this.reset(userId, intervalDays);

    await this.prisma.legacyPlan.updateMany({
      where: { userId, status: LegacyPlanStatus.VERIFYING },
      data: { status: LegacyPlanStatus.FUNDED },
    });

    await this.activity.record(
      userId,
      ActivityType.CHECK_IN_CONFIRMED,
      "You checked in. Confirmed — everything's up to date.",
    );
    return this.toView(checkIn);
  }

  private async reset(userId: string, intervalDays: number) {
    const now = new Date();
    const nextCheckIn = new Date(now.getTime() + intervalDays * DAY_MS);
    return this.prisma.checkIn.upsert({
      where: { userId },
      create: {
        userId,
        intervalDays,
        lastCheckIn: now,
        nextCheckIn,
        status: CheckInStatus.ACTIVE,
        upcomingReminderSent: false,
        missedReminderCount: 0,
        lastReminderAt: null,
      },
      update: {
        intervalDays,
        lastCheckIn: now,
        nextCheckIn,
        status: CheckInStatus.ACTIVE,
        upcomingReminderSent: false,
        missedReminderCount: 0,
        lastReminderAt: null,
      },
    });
  }

  private toView(checkIn: {
    intervalDays: number;
    lastCheckIn: Date;
    nextCheckIn: Date;
    status: CheckInStatus;
  }): CheckInView {
    return {
      intervalDays: checkIn.intervalDays,
      lastCheckIn: checkIn.lastCheckIn,
      nextCheckIn: checkIn.nextCheckIn,
      status: checkIn.status,
      daysRemaining: Math.max(
        0,
        Math.ceil((checkIn.nextCheckIn.getTime() - Date.now()) / DAY_MS),
      ),
    };
  }
}
