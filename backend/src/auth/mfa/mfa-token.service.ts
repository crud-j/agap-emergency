import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as crypto from 'crypto';
import { MfaStateStore } from './mfa-state.store';
import { MFA_TOKEN_MAX_FAILURES, MFA_TOKEN_TTL_SECONDS } from './mfa.constants';

/** `mfa` = second step for an enrolled user; `mfa-enroll` = forced first enrollment. */
export type MfaTokenPurpose = 'mfa' | 'mfa-enroll';

export interface MfaClaims {
  userId: string;
  jti: string;
  purpose: MfaTokenPurpose;
}

const EXPIRED = 'Your sign-in has expired. Sign in again.';

/**
 * The 5-minute, single-use token that carries a user from a correct password to the
 * second step. It is signed with a key DERIVED from JWT_SECRET, so it can never
 * validate as an access token (and an access token can never validate as this).
 */
@Injectable()
export class MfaTokenService {
  private readonly secret: string;

  constructor(
    private readonly jwt: JwtService,
    config: ConfigService,
    private readonly store: MfaStateStore,
  ) {
    this.secret = crypto
      .createHmac('sha256', config.getOrThrow<string>('JWT_SECRET'))
      .update('agap-mfa-token-v1')
      .digest('hex');
  }

  async issue(userId: string, purpose: MfaTokenPurpose): Promise<string> {
    const jti = crypto.randomUUID();
    await this.store.set(`mfa:jti:${jti}`, userId, MFA_TOKEN_TTL_SECONDS);
    return this.jwt.sign(
      { sub: userId, purpose, jti },
      { secret: this.secret, expiresIn: MFA_TOKEN_TTL_SECONDS },
    );
  }

  /** Validates signature, expiry, purpose and that the token hasn't been used or killed. */
  async verify(token: string, purpose: MfaTokenPurpose): Promise<MfaClaims> {
    let payload: { sub?: string; purpose?: string; jti?: string };
    try {
      payload = await this.jwt.verifyAsync(token, { secret: this.secret });
    } catch {
      throw new UnauthorizedException(EXPIRED);
    }
    if (!payload.sub || !payload.jti || payload.purpose !== purpose) throw new UnauthorizedException(EXPIRED);
    const owner = await this.store.get(`mfa:jti:${payload.jti}`);
    if (owner !== payload.sub) throw new UnauthorizedException(EXPIRED);
    return { userId: payload.sub, jti: payload.jti, purpose };
  }

  /** Count a wrong code. Returns true when this was the last allowed try and the token is now dead. */
  async recordFailure(jti: string): Promise<boolean> {
    const failures = await this.store.incr(`mfa:fail:${jti}`, MFA_TOKEN_TTL_SECONDS);
    if (failures < MFA_TOKEN_MAX_FAILURES) return false;
    await this.consume(jti);
    return true;
  }

  /** Single use: call once the second factor has succeeded. */
  async consume(jti: string): Promise<void> {
    await this.store.del(`mfa:jti:${jti}`);
    await this.store.del(`mfa:fail:${jti}`);
  }
}
