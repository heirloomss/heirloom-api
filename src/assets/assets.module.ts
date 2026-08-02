import { Module } from '@nestjs/common';
import { CommonModule } from '../common/common.module';
import { ActivityModule } from '../activity/activity.module';
import { AssetsService } from './assets.service';
import { AssetsController } from './assets.controller';

@Module({
  imports: [CommonModule, ActivityModule],
  controllers: [AssetsController],
  providers: [AssetsService],
  exports: [AssetsService],
})
export class AssetsModule {}
