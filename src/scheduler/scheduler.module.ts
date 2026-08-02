import { BullModule } from '@nestjs/bullmq';
import { Logger, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ActivityModule } from '../activity/activity.module';
import { CHECK_IN_QUEUE } from './scheduler.constants';
import { SchedulerService } from './scheduler.service';
import { CheckInProcessor } from './check-in.processor';

/**
 * BullMQ-backed Life Check-In scheduler. The Redis connection is configured
 * from REDIS_URL. If Redis is unreachable the queue's own retry strategy keeps
 * trying quietly in the background — it does not crash the app at boot.
 */
@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const url = config.get<string>('REDIS_URL') ?? 'redis://localhost:6379';
        const logger = new Logger('SchedulerModule');
        return {
          connection: {
            url,
            // Keep boot resilient: don't throw synchronously, back off, and
            // don't spam reconnects forever.
            enableOfflineQueue: true,
            maxRetriesPerRequest: null,
            retryStrategy: (times: number) => {
              if (times === 1) {
                logger.warn(
                  'Redis is not reachable yet. The Life Check-In scheduler will connect when it becomes available.',
                );
              }
              return Math.min(times * 1000, 30_000);
            },
          },
        };
      },
    }),
    BullModule.registerQueue({ name: CHECK_IN_QUEUE }),
    ActivityModule,
  ],
  providers: [SchedulerService, CheckInProcessor],
  exports: [SchedulerService],
})
export class SchedulerModule {}
