import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

/**
 * Shared building blocks used across feature modules: the JWT auth guard and a
 * pre-configured JwtModule. Exported so any module can guard its routes.
 */
@Module({
  imports: [
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        ({
          secret: config.get<string>('JWT_SECRET'),
          signOptions: {
            expiresIn: (config.get<string>('JWT_EXPIRES_IN') ??
              '7d') as import('@nestjs/jwt').JwtSignOptions['expiresIn'],
          },
        }) satisfies import('@nestjs/jwt').JwtModuleOptions,
    }),
  ],
  providers: [JwtAuthGuard],
  exports: [JwtAuthGuard, JwtModule],
})
export class CommonModule {}
