import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-local';
import type { Request } from 'express';
import { AuthService } from '../auth.service';
import { authContextFromRequest } from '../request-context';

@Injectable()
export class LocalStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly authService: AuthService) {
    // 'identifier' carries either an email or a phone number, so password login
    // works for phone-only accounts (email-only usernameField previously failed
    // with a bare 401 "Unauthorized" for phone logins).
    // passReqToCallback: failed sign-ins are audited with the caller's IP / user-agent.
    super({ usernameField: 'identifier', passReqToCallback: true });
  }

  async validate(req: Request, identifier: string, password: string) {
    const user = await this.authService.validateUser(identifier, password, authContextFromRequest(req));
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }
    return user;
  }
}
