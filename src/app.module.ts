import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { validateEnv } from './config/env.validation';
import { PrismaModule } from './prisma/prisma.module';
import { CommonModule } from './common/common.module';
import { EncryptionModule } from './encryption/encryption.module';
import { NotificationsModule } from './notifications/notifications.module';
import { StellarModule } from './stellar/stellar.module';
import { ActivityModule } from './activity/activity.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { BeneficiariesModule } from './beneficiaries/beneficiaries.module';
import { GuardiansModule } from './guardians/guardians.module';
import { AssetsModule } from './assets/assets.module';
import { ArchiveModule } from './archive/archive.module';
import { MessagesModule } from './messages/messages.module';
import { LegacyModule } from './legacy/legacy.module';
import { SchedulerModule } from './scheduler/scheduler.module';
import { HealthController } from './health/health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: validateEnv,
    }),
    // Global rate limiting: 120 requests/minute per IP by default. Sensitive
    // endpoints (e.g. the wallet challenge) tighten this with @Throttle.
    ThrottlerModule.forRoot([
      {
        name: 'default',
        ttl: 60_000,
        limit: 120,
      },
    ]),
    // Infrastructure
    PrismaModule,
    CommonModule,
    EncryptionModule,
    NotificationsModule,
    StellarModule,
    // Features
    ActivityModule,
    AuthModule,
    UsersModule,
    BeneficiariesModule,
    GuardiansModule,
    AssetsModule,
    ArchiveModule,
    MessagesModule,
    LegacyModule,
    SchedulerModule,
  ],
  controllers: [HealthController],
  providers: [
    // Apply rate limiting across every route.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
