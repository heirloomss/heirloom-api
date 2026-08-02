import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';
import { AuthUser } from '../types/jwt-payload';

/**
 * Injects the authenticated user attached by JwtAuthGuard.
 * Usage: `@CurrentUser() user: AuthUser` or `@CurrentUser('id') userId: string`.
 */
export const CurrentUser = createParamDecorator(
  (data: keyof AuthUser | undefined, ctx: ExecutionContext): AuthUser | string => {
    const request = ctx.switchToHttp().getRequest<Request & { user: AuthUser }>();
    const user = request.user;
    return data ? user[data] : user;
  },
);
