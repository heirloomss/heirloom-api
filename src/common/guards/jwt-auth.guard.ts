import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { AuthUser, JwtPayload } from '../types/jwt-payload';

/**
 * Guards routes with a Bearer JWT. On success attaches `{ id, email }` to
 * `request.user`, consumed by the `@CurrentUser()` decorator.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractToken(request);
    if (!token) {
      throw new UnauthorizedException('Please sign in to continue.');
    }

    try {
      const payload = await this.jwtService.verifyAsync<JwtPayload>(token, {
        secret: this.config.get<string>('JWT_SECRET'),
      });
      const user: AuthUser = {
        id: payload.sub,
        email: payload.email,
        walletAddress: payload.walletAddress,
      };
      (request as Request & { user: AuthUser }).user = user;
      return true;
    } catch {
      throw new UnauthorizedException('Your session has expired. Please sign in again.');
    }
  }

  private extractToken(request: Request): string | undefined {
    const header = request.headers.authorization;
    if (!header) {
      return undefined;
    }
    const [type, token] = header.split(' ');
    return type === 'Bearer' ? token : undefined;
  }
}
