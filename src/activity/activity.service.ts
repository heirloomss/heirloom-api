import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ActivityTypeValue } from './activity.constants';

/**
 * Writes and reads the audit trail that powers the Family Timeline. Every
 * mutating action across the app records an entry here.
 */
@Injectable()
export class ActivityService {
  private readonly logger = new Logger(ActivityService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Record an activity entry. Never throws into the caller — a failed audit
   * write should not roll back the user's real action; it's logged instead.
   */
  async record(userId: string, type: ActivityTypeValue, message: string): Promise<void> {
    try {
      await this.prisma.activityLog.create({
        data: { userId, type, message },
      });
    } catch (error) {
      this.logger.error(
        `Failed to record activity (${type}) for user ${userId}: ${(error as Error).message}`,
      );
    }
  }

  /** Recent events, newest first — the Family Timeline. */
  async recent(userId: string, limit = 50) {
    return this.prisma.activityLog.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }
}
