import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RECENT_AUTH_SECONDS } from '../decorators/recent-auth.decorator';

@Injectable()
export class RecentAuthGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const seconds = this.reflector.getAllAndOverride<number>(RECENT_AUTH_SECONDS, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!seconds) return true;

    const user = context.switchToHttp().getRequest().user as { authTime?: number } | undefined;
    const authTime = user?.authTime;
    if (typeof authTime !== 'number' || Math.floor(Date.now() / 1000) - authTime > seconds) {
      throw new UnauthorizedException({
        statusCode: 401,
        code: 'STEP_UP_REQUIRED',
        message: 'Recent authentication is required for this action',
      });
    }
    return true;
  }
}
