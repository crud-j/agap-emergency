import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { SessionRevocationService } from '../sessions/session-revocation.service';

export interface JwtPayload {
  sub: string;
  email?: string;
  role: string;
  /** Session id — absent on guest tokens and tokens issued before sessions carried it. */
  sid?: string;
  /** RFC 8176 authentication methods used: ["pwd"], ["pwd","otp"], ["pwd","hwk"], ["hwk"]. */
  amr?: string[];
  /** Unix seconds of the sign-in that created the session (survives refreshes). */
  auth_time?: number;
  /** Set only on MFA tokens, which are signed with a different key and never reach here. */
  purpose?: string;
  iat?: number;
  exp?: number;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly sessions: SessionRevocationService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_SECRET'),
    });
  }

  async validate(payload: JwtPayload) {
    // Logout, password reset and deactivation take effect on the next request,
    // not when the access token happens to expire.
    if (payload.purpose) throw new UnauthorizedException('Invalid token');
    if (await this.sessions.isRevoked(payload.sid)) {
      throw new UnauthorizedException('Session has ended');
    }
    return {
      id: payload.sub,
      email: payload.email,
      role: payload.role,
      sid: payload.sid,
      amr: payload.amr,
      authTime: payload.auth_time,
    };
  }
}
