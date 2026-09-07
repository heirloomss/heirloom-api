import { Module } from '@nestjs/common';
import { CommonModule } from '../common/common.module';
import { ActivityService } from './activity.service';
import { CheckInService } from './check-in.service';
import { ActivityController } from './activity.controller';

/**
 * Family Timeline + Life Check-In. ActivityService is exported so every other
 * feature module can write audit entries. CommonModule provides the JwtModule /
 * JwtAuthGuard that ActivityController's @UseGuards needs.
 */
@Module({
  imports: [CommonModule],
  controllers: [ActivityController],
  providers: [ActivityService, CheckInService],
  exports: [ActivityService, CheckInService],
})
export class ActivityModule {}
