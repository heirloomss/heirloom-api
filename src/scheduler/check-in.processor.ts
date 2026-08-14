import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job } from 'bullmq';
import { CheckInStatus, LegacyPlanStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ActivityService } from '../activity/activity.service';
import { ActivityType } from '../activity/activity.constants';
import { CHECK_IN_QUEUE } from './scheduler.constants';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Life Check-In sweep — the PRD safeguard cascade, never an instant assumption:
 *
 *   upcoming reminder (7 days before due)
 *     → first missed reminder
 *     → second missed reminder
 *     → guardians notified (verification begins)
 *
 * Missing a check-in only *begins* this workflow. Tapping "I'm Here" resets it.
 */
@Processor(CHECK_IN_QUEUE)
export class CheckInProcessor extends WorkerHost {
  private readonly logger = new Logger(CheckInProcessor.name);
  private readonly gapMs: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly activity: ActivityService,
    config: ConfigService,
  ) {
    super();
    const hours = config.get<number>('CHECK_IN_REMINDER_GAP_HOURS') ?? 168;
    this.gapMs = Math.max(1, hours) * HOUR_MS;
  }

  async process(job: Job): Promise<{ swept: number }> {
    this.logger.debug(`Running check-in sweep (job ${job.id ?? 'n/a'}).`);
    const now = new Date();
    let swept = 0;

    swept += await this.sendUpcomingReminders(now);
    swept += await this.advanceMissedCascade(now);

    return { swept };
  }

  /** "Your next Life Check-In is in 7 days." */
  private async sendUpcomingReminders(now: Date): Promise<number> {
    const windowStart = new Date(now.getTime() + 6 * DAY_MS);
    const windowEnd = new Date(now.getTime() + 8 * DAY_MS);

    const upcoming = await this.prisma.checkIn.findMany({
      where: {
        status: CheckInStatus.ACTIVE,
        upcomingReminderSent: false,
        nextCheckIn: { gte: windowStart, lte: windowEnd },
      },
      include: { user: true },
    });

    for (const checkIn of upcoming) {
      const daysRemaining = Math.max(
        1,
        Math.round((checkIn.nextCheckIn.getTime() - now.getTime()) / DAY_MS),
      );
      if (checkIn.user.email) {
        this.notifications.checkInReminder(
          checkIn.user.email,
          daysRemaining,
          checkIn.user.notificationPrefs,
        );
      }
      await this.prisma.checkIn.update({
        where: { id: checkIn.id },
        data: { upcomingReminderSent: true },
      });
    }
    return upcoming.length;
  }

  /**
   * Overdue ACTIVE check-ins: reminder 1, then reminder 2 after the gap, then
   * notify guardians and move the plan into VERIFYING.
   */
  private async advanceMissedCascade(now: Date): Promise<number> {
    const overdue = await this.prisma.checkIn.findMany({
      where: {
        status: { in: [CheckInStatus.ACTIVE, CheckInStatus.MISSED] },
        nextCheckIn: { lt: now },
        missedReminderCount: { lt: 3 },
      },
      include: { user: { include: { guardians: true } } },
    });

    let advanced = 0;
    for (const checkIn of overdue) {
      const count = checkIn.missedReminderCount;
      const dueForNext =
        count === 0 ||
        (checkIn.lastReminderAt != null &&
          now.getTime() - checkIn.lastReminderAt.getTime() >= this.gapMs);

      if (!dueForNext) {
        continue;
      }

      if (count < 2) {
        if (checkIn.user.email) {
          this.notifications.checkInMissed(checkIn.user.email);
        }
        await this.prisma.checkIn.update({
          where: { id: checkIn.id },
          data: {
            status: CheckInStatus.MISSED,
            missedReminderCount: count + 1,
            lastReminderAt: now,
          },
        });
        if (count === 0) {
          await this.activity.record(
            checkIn.userId,
            ActivityType.CHECK_IN_MISSED,
            "It's been a while since your last check-in. We're just making sure everything is okay.",
          );
        }
        advanced += 1;
        continue;
      }

      // Third step: notify guardians and begin verification.
      for (const guardian of checkIn.user.guardians) {
        this.notifications.guardianVerificationRequested(
          guardian.email,
          guardian.name,
          checkIn.user.name,
        );
      }
      await this.prisma.checkIn.update({
        where: { id: checkIn.id },
        data: {
          status: CheckInStatus.VERIFYING,
          missedReminderCount: 3,
          lastReminderAt: now,
        },
      });
      await this.prisma.legacyPlan.updateMany({
        where: { userId: checkIn.userId, status: LegacyPlanStatus.FUNDED },
        data: { status: LegacyPlanStatus.VERIFYING },
      });
      await this.activity.record(
        checkIn.userId,
        ActivityType.LEGACY_VERIFYING,
        'Trusted guardians have been asked to confirm, gently. Nothing has been released.',
      );
      advanced += 1;
    }

    if (advanced > 0) {
      this.logger.log(`Check-in sweep advanced ${advanced} plan(s) along the reminder cascade.`);
    }
    return advanced;
  }
}
