import { PrismaClient } from '@prisma/client';
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';

/**
 * Thin wrapper around PrismaClient wired into the Nest lifecycle so the pool
 * connects at boot and closes cleanly on shutdown.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit(): Promise<void> {
    try {
      await this.$connect();
      this.logger.log('Connected to the database.');
    } catch (error) {
      // Don't crash the whole app at boot if the DB is briefly unavailable;
      // queries will surface the error. Log clearly so it's easy to spot.
      this.logger.error(`Could not connect to the database at boot: ${(error as Error).message}`);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
