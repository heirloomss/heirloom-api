import { Injectable } from '@nestjs/common';
import { CheckIn, CheckInStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ActivityService } from './activity.service';
import { ActivityType } from './activity.constants';

const DAY_MS = 24 * 60 * 60 * 1000;

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

  /** Fetch the user's check-in, if configured. */
  async get(userId: string): Promise<CheckIn | null> {
    return this.prisma.checkIn.findUnique({ where: { userId } });
  }

  /** Configure or update the cadence, resetting the timer from now. */
  async upsert(userId: string, intervalDays: number): Promise<CheckIn> {
    const now = new Date();
    const nextCheckIn = new Date(now.getTime() + intervalDays * DAY_MS);

    const checkIn = await this.prisma.checkIn.upsert({
      where: { userId },
      create: {
        userId,
        intervalDays,
        lastCheckIn: now,
        nextCheckIn,
        status: CheckInStatus.ACTIVE,
      },
      update: {
        intervalDays,
        lastCheckIn: now,
        nextCheckIn,
        status: CheckInStatus.ACTIVE,
      },
    });

    await this.activity.record(
      userId,
      ActivityType.CHECK_IN_CONFIRMED,
      `Life Check-In set to every ${intervalDays} days. We'll gently check in with you.`,
    );
    return checkIn;
  }

  /**
   * The "I'm Here" button. Resets the timer and returns the plan to ACTIVE
   * even if it had drifted into MISSED/VERIFYING — the user is clearly fine.
   */
  async confirm(userId: string): Promise<CheckIn> {
    const existing = await this.prisma.checkIn.findUnique({ where: { userId } });
    const intervalDays = existing?.intervalDays ?? 90;
    const now = new Date();
    const nextCheckIn = new Date(now.getTime() + intervalDays * DAY_MS);

    const checkIn = await this.prisma.checkIn.upsert({
      where: { userId },
      create: {
        userId,
        intervalDays,
        lastCheckIn: now,
        nextCheckIn,
        status: CheckInStatus.ACTIVE,
      },
      update: {
        lastCheckIn: now,
        nextCheckIn,
        status: CheckInStatus.ACTIVE,
      },
    });

    await this.activity.record(
      userId,
      ActivityType.CHECK_IN_CONFIRMED,
      "You checked in. Confirmed — everything's up to date.",
    );
    return checkIn;
  }
}
