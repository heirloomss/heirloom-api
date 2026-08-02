import { Module } from '@nestjs/common';
import { CommonModule } from '../common/common.module';
import { ActivityModule } from '../activity/activity.module';
import { BeneficiariesService } from './beneficiaries.service';
import { BeneficiariesController } from './beneficiaries.controller';

@Module({
  imports: [CommonModule, ActivityModule],
  controllers: [BeneficiariesController],
  providers: [BeneficiariesService],
  exports: [BeneficiariesService],
})
export class BeneficiariesModule {}
