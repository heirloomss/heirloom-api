import { Controller, Get } from '@nestjs/common';

/**
 * Liveness endpoint. Deliberately unauthenticated so Render's health checks
 * (and humans) can confirm the API is up. Full route: GET /api/health.
 */
@Controller('health')
export class HealthController {
  @Get()
  health() {
    return {
      status: 'ok',
      service: 'heirloom-api',
      timestamp: new Date().toISOString(),
    };
  }
}
