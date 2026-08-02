import { Module } from '@nestjs/common';
import { CommonModule } from '../common/common.module';
import { ActivityModule } from '../activity/activity.module';
import { EncryptionModule } from '../encryption/encryption.module';
import { ArchiveService } from './archive.service';
import { ArchiveController } from './archive.controller';
import { StorageService } from './storage.service';

@Module({
  imports: [CommonModule, ActivityModule, EncryptionModule],
  controllers: [ArchiveController],
  providers: [ArchiveService, StorageService],
  exports: [ArchiveService],
})
export class ArchiveModule {}
