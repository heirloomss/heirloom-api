import { Global, Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service';

/**
 * Global so scheduler, guardians and legacy can notify without re-importing.
 */
@Global()
@Module({
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
