import { Module } from '@nestjs/common';
import { CommonModule } from '../common/common.module';
import { ActivityModule } from '../activity/activity.module';
import { EncryptionModule } from '../encryption/encryption.module';
import { LegacyService } from './legacy.service';
import { LegacyController } from './legacy.controller';
import { ClaimService } from './claim.service';
import { ClaimController } from './claim.controller';

@Module({
  // EncryptionModule is NOT @Global, so it must be imported explicitly for the
  // public capsule to decrypt letter bodies before revealing them.
  imports: [CommonModule, ActivityModule, EncryptionModule],
  controllers: [LegacyController, ClaimController],
  providers: [LegacyService, ClaimService],
  exports: [LegacyService],
})
export class LegacyModule {}
