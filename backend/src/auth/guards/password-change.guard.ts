import { ForbiddenException, Injectable, SetMetadata, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { IS_PUBLIC_KEY } from '../../common/decorators/public.decorator';

export const PASSWORD_CHANGE_ALLOWED_KEY = 'passwordChangeAllowed';
export const PasswordChangeAllowed = () => SetMetadata(PASSWORD_CHANGE_ALLOWED_KEY, true);

interface PasswordChangePayload {
  pwc?: boolean;
}

@Injectable()
export class PasswordChangeGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true;

    const handler = context.getHandler();
    const controller = context.getClass();
    if (
      this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [handler, controller]) ||
      this.reflector.getAllAndOverride<boolean>(PASSWORD_CHANGE_ALLOWED_KEY, [handler, controller])
    ) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{ headers?: { authorization?: unknown } }>();
    const authorization = request.headers?.authorization;
    if (typeof authorization !== 'string') return true;

    const [scheme, token] = authorization.split(' ');
    if (scheme?.toLowerCase() !== 'bearer' || !token) return true;

    let payload: PasswordChangePayload;
    try {
      payload = await this.jwt.verifyAsync<PasswordChangePayload>(token);
    } catch (error: unknown) {
      if (
        error instanceof Error &&
        ['JsonWebTokenError', 'TokenExpiredError', 'NotBeforeError'].includes(error.name)
      ) {
        return true;
      }
      throw error;
    }

    if (payload.pwc === true) {
      throw new ForbiddenException({
        code: 'PASSWORD_CHANGE_REQUIRED',
        message: 'Change your password before continuing',
      });
    }
    return true;
  }
}
