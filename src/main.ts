import 'reflect-metadata';
import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

async function bootstrap(): Promise<void> {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule, { bufferLogs: false });
  const config = app.get(ConfigService);

  // Secure HTTP headers. This is a JSON API (no server-rendered HTML), so the
  // cross-origin resource policy is relaxed just enough for the web app.
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );

  // All routes live under /api.
  app.setGlobalPrefix('api');

  // CORS for the heirloom-web app.
  const webOrigin = config.get<string>('WEB_ORIGIN') ?? 'http://localhost:3000';
  app.enableCors({
    origin: webOrigin.split(',').map((o) => o.trim()),
    credentials: true,
  });

  // Validate and strip unknown fields on every request body. Unknown fields are
  // rejected outright so malformed or probing payloads fail fast.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // Calm, human error responses.
  app.useGlobalFilters(new AllExceptionsFilter());

  // Graceful shutdown so Prisma/Bull close cleanly.
  app.enableShutdownHooks();

  const port = config.get<number>('PORT') ?? 4000;
  await app.listen(port);
  logger.log(`Heirloom API is ready at http://localhost:${port}/api`);
  logger.log(`Health check: http://localhost:${port}/api/health`);
}

bootstrap().catch((error) => {
  // eslint-disable-next-line no-console
  console.error('Failed to start Heirloom API:', error);
  process.exit(1);
});
