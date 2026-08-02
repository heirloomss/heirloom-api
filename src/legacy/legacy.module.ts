import { Module } from '@nestjs/common';
import { CommonModule } from '../common/common.module';
import { ActivityModule } from '../activity/activity.module';
import { LegacyService } from './legacy.service';
import { LegacyController } from './legacy.controller';

@Module({
  imports: [CommonModule, ActivityModule],
  controllers: [LegacyController],
  providers: [LegacyService],
  exports: [LegacyService],
})
export class LegacyModule {}
