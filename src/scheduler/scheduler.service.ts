import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Queue } from 'bullmq';
import { CHECK_IN_QUEUE, CHECK_IN_SWEEP_JOB } from './scheduler.constants';

/**
 * Registers the repeatable Life Check-In sweep. Must never crash the app if
 * Redis is unavailable at boot — a warning is logged and the API keeps serving.
 */
@Injectable()
export class SchedulerService implements OnModuleInit {
  private readonly logger = new Logger(SchedulerService.name);

  constructor(@InjectQueue(CHECK_IN_QUEUE) private readonly queue: Queue) {}

  async onModuleInit(): Promise<void> {
    try {
      // Sweep for missed check-ins on a regular cadence. Hourly is plenty for
      // day-scale intervals and keeps the demo responsive.
      await this.queue.add(
        CHECK_IN_SWEEP_JOB,
        {},
        {
          repeat: { pattern: '0 * * * *' }, // top of every hour
          removeOnComplete: true,
          removeOnFail: 100,
          jobId: CHECK_IN_SWEEP_JOB,
        },
      );
      this.logger.log('Life Check-In sweep scheduled (hourly).');
    } catch (error) {
      this.logger.warn(
        `Could not schedule the Life Check-In sweep (is Redis running?): ${
          (error as Error).message
        }. The API will keep running; scheduling will resume when Redis is available.`,
      );
    }
  }

  /** Manually trigger a sweep — handy for demos. Safe if Redis is down. */
  async triggerSweep(): Promise<boolean> {
    try {
      await this.queue.add(CHECK_IN_SWEEP_JOB, {}, { removeOnComplete: true });
      return true;
    } catch (error) {
      this.logger.warn(`Could not trigger sweep: ${(error as Error).message}`);
      return false;
    }
  }
}
