import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { CheckInStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ActivityService } from '../activity/activity.service';
import { ActivityType } from '../activity/activity.constants';
import { CHECK_IN_QUEUE } from './scheduler.constants';

/**
 * Processes the repeatable Life Check-In sweep. Finds users whose nextCheckIn
 * has passed while still ACTIVE, marks them MISSED, records the gentle activity
 * entry and notifies their guardians. This is the dead-man-switch, reworded
 * kindly — missing a check-in only *begins* a verification workflow.
 */
@Processor(CHECK_IN_QUEUE)
export class CheckInProcessor extends WorkerHost {
  private readonly logger = new Logger(CheckInProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly activity: ActivityService,
  ) {
    super();
  }

  async process(job: Job): Promise<{ swept: number }> {
    this.logger.debug(`Running check-in sweep (job ${job.id ?? 'n/a'}).`);
    const now = new Date();

    const overdue = await this.prisma.checkIn.findMany({
      where: { status: CheckInStatus.ACTIVE, nextCheckIn: { lt: now } },
      include: { user: { include: { guardians: true } } },
    });

    for (const checkIn of overdue) {
      await this.prisma.checkIn.update({
        where: { id: checkIn.id },
        data: { status: CheckInStatus.MISSED },
      });

      this.notifications.checkInMissed(checkIn.user.email);
      for (const guardian of checkIn.user.guardians) {
        this.notifications.guardianVerificationRequested(
          guardian.email,
          guardian.name,
          checkIn.user.name,
        );
      }

      await this.activity.record(
        checkIn.userId,
        ActivityType.CHECK_IN_MISSED,
        "It's been a while since your last check-in. We're just making sure everything is okay.",
      );
    }

    if (overdue.length > 0) {
      this.logger.log(`Check-in sweep marked ${overdue.length} plan(s) as missed.`);
    }
    return { swept: overdue.length };
  }
}
