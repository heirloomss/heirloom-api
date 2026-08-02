import { Module } from '@nestjs/common';
import { ActivityService } from './activity.service';
import { CheckInService } from './check-in.service';
import { ActivityController } from './activity.controller';

/**
 * Family Timeline + Life Check-In. ActivityService is exported so every other
 * feature module can write audit entries.
 */
@Module({
  controllers: [ActivityController],
  providers: [ActivityService, CheckInService],
  exports: [ActivityService, CheckInService],
})
export class ActivityModule {}
