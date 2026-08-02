import { Module } from '@nestjs/common';
import { CommonModule } from '../common/common.module';
import { ActivityModule } from '../activity/activity.module';
import { GuardiansService } from './guardians.service';
import { GuardiansController } from './guardians.controller';

@Module({
  imports: [CommonModule, ActivityModule],
  controllers: [GuardiansController],
  providers: [GuardiansService],
  exports: [GuardiansService],
})
export class GuardiansModule {}
