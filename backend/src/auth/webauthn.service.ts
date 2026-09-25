import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from '@simplewebauthn/server';
import type {
  AuthenticationResponseJSON,
  RegistrationResponseJSON,
} from '@simplewebauthn/server';
import { PrismaService } from '../common/prisma/prisma.service';
import { AuthService } from './auth.service';

/** Map Prisma webauthn_transport enum values to the AuthenticatorTransport string literals
 *  expected by @simplewebauthn/server. */
function toTransport(t: string): string {
  return t.toLowerCase().replace('_', '-');
}

@Injectable()
export class WebAuthnService {
  private readonly rpID: string;
  private readonly rpName = 'AGAP Emergency Response';
  private readonly origin: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthService,
    private readonly config: ConfigService,
  ) {
    this.rpID = this.config.get<string>('WEBAUTHN_RP_ID', 'localhost');
    this.origin = this.config.get<string>('WEBAUTHN_ORIGIN', 'http://localhost:3000');
  }

  // ---------------------------------------------------------------------------
  // Registration
  // ---------------------------------------------------------------------------

  async beginRegistration(
    userId: string,
    deviceLabel?: string,
    ipAddress?: string,
    userAgent?: string,
  ) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException('Passkey operation failed');

    const existingCredentials = await this.prisma.webauthn_credentials.findMany({
      where: { user_id: userId, is_active: true },
      select: { credential_id: true, transports: true },
    });

    const options = await generateRegistrationOptions({
      rpName: this.rpName,
      rpID: this.rpID,
      userID: new Uint8Array(Buffer.from(userId)),
      userName: user.email ?? user.phone_number ?? userId,
      userDisplayName: user.full_name,
      excludeCredentials: existingCredentials.map((c) => ({
        id: c.credential_id,
        transports: c.transports.map(toTransport) as any,
      })),
      authenticatorSelection: {
        residentKey: 'preferred',
        userVerification: 'preferred',
      },
      timeout: 60000,
    });

    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
    const challenge = await this.prisma.webauthn_challenges.create({
      data: {
        user_id: userId,
        ceremony_type: 'REGISTRATION',
        status: 'PENDING',
        challenge: options.challenge,
        ip_address: ipAddress ?? null,
        user_agent: userAgent ?? null,
        expires_at: expiresAt,
      },
    });

    return { challengeId: challenge.id, options };
  }

  async completeRegistration(
    userId: string,
    challengeId: string,
    response: Record<string, unknown>,
    deviceLabel?: string,
    ipAddress?: string,
    userAgent?: string,
  ) {
    const challengeRecord = await this.prisma.webauthn_challenges.findUnique({
      where: { id: challengeId },
    });

    if (
      !challengeRecord ||
      challengeRecord.user_id !== userId ||
      challengeRecord.ceremony_type !== 'REGISTRATION' ||
      challengeRecord.status !== 'PENDING' ||
      challengeRecord.expires_at < new Date()
    ) {
      await this._failChallenge(challengeId);
      throw new UnauthorizedException('Passkey verification failed');
    }

    let verification: Awaited<ReturnType<typeof verifyRegistrationResponse>>;
    try {
      verification = await verifyRegistrationResponse({
        response: response as unknown as RegistrationResponseJSON,
        expectedChallenge: challengeRecord.challenge,
        expectedOrigin: this.origin,
        expectedRPID: this.rpID,
      });
    } catch {
      await this._failChallenge(challengeId);
      await this._writeAuthLog(userId, null, false, 'Registration verification threw', ipAddress, userAgent);
      throw new UnauthorizedException('Passkey verification failed');
    }

    if (!verification.verified || !verification.registrationInfo) {
      await this._failChallenge(challengeId);
      await this._writeAuthLog(userId, null, false, 'Verification returned false', ipAddress, userAgent);
      throw new UnauthorizedException('Passkey verification failed');
    }

    const { registrationInfo } = verification;
    const { credential, fmt, aaguid, credentialDeviceType, credentialBackedUp } = registrationInfo;

    // Convert Uint8Array public key → base64url string for storage
    const publicKeyBase64 = Buffer.from(credential.publicKey).toString('base64url');
    const credentialIdString = credential.id;

    const newCredential = await this.prisma.webauthn_credentials.create({
      data: {
        user_id: userId,
        credential_id: credentialIdString,
        public_key: publicKeyBase64,
        sign_count: BigInt(credential.counter),
        aaguid: aaguid ?? null,
        attestation_format: fmt ?? null,
        transports: (credential.transports ?? []).map((t: string) =>
          t.toUpperCase().replace('-', '_'),
        ) as any,
        is_backup_eligible: credentialDeviceType === 'multiDevice',
        is_backed_up: credentialBackedUp,
        device_label: deviceLabel ?? null,
        is_active: true,
      },
    });

    await this.prisma.webauthn_challenges.update({
      where: { id: challengeId },
      data: { status: 'COMPLETED', completed_at: new Date() },
    });

    await this._writeAuthLog(userId, newCredential.id, true, null, ipAddress, userAgent);

    return { credentialId: newCredential.id, deviceLabel: newCredential.device_label };
  }

  // ---------------------------------------------------------------------------
  // Authentication
  // ---------------------------------------------------------------------------

  async beginAuthentication(
    userId?: string,
    ipAddress?: string,
    userAgent?: string,
  ) {
    let allowCredentials: { id: string; transports?: any[] }[] = [];

    if (userId) {
      const credentials = await this.prisma.webauthn_credentials.findMany({
        where: { user_id: userId, is_active: true },
        select: { credential_id: true, transports: true },
      });
      allowCredentials = credentials.map((c) => ({
        id: c.credential_id,
        transports: c.transports.map(toTransport) as any,
      }));
    }

    const options = await generateAuthenticationOptions({
      rpID: this.rpID,
      allowCredentials,
      userVerification: 'preferred',
      timeout: 60000,
    });

    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
    const challenge = await this.prisma.webauthn_challenges.create({
      data: {
        user_id: userId ?? null,
        ceremony_type: 'AUTHENTICATION',
        status: 'PENDING',
        challenge: options.challenge,
        ip_address: ipAddress ?? null,
        user_agent: userAgent ?? null,
        expires_at: expiresAt,
      },
    });

    return { challengeId: challenge.id, options };
  }

  async completeAuthentication(
    challengeId: string,
    response: Record<string, unknown>,
    ipAddress?: string,
    userAgent?: string,
  ) {
    const challengeRecord = await this.prisma.webauthn_challenges.findUnique({
      where: { id: challengeId },
    });

    if (
      !challengeRecord ||
      challengeRecord.ceremony_type !== 'AUTHENTICATION' ||
      challengeRecord.status !== 'PENDING' ||
      challengeRecord.expires_at < new Date()
    ) {
      await this._failChallenge(challengeId);
      throw new UnauthorizedException('Passkey verification failed');
    }

    // response.id is the credential_id (base64url)
    const credentialIdFromResponse = (response as any).id as string | undefined;
    if (!credentialIdFromResponse) {
      await this._failChallenge(challengeId);
      throw new UnauthorizedException('Passkey verification failed');
    }

    const storedCredential = await this.prisma.webauthn_credentials.findUnique({
      where: { credential_id: credentialIdFromResponse },
    });

    if (!storedCredential || !storedCredential.is_active) {
      await this._failChallenge(challengeId);
      await this._writeAuthLog(null, null, false, 'Credential not found or inactive', ipAddress, userAgent);
      throw new UnauthorizedException('Passkey verification failed');
    }

    const publicKeyBytes = new Uint8Array(Buffer.from(storedCredential.public_key, 'base64url'));

    let verification: Awaited<ReturnType<typeof verifyAuthenticationResponse>>;
    try {
      verification = await verifyAuthenticationResponse({
        response: response as unknown as AuthenticationResponseJSON,
        expectedChallenge: challengeRecord.challenge,
        expectedOrigin: this.origin,
        expectedRPID: this.rpID,
        credential: {
          id: storedCredential.credential_id,
          publicKey: publicKeyBytes,
          counter: Number(storedCredential.sign_count),
          transports: storedCredential.transports.map(toTransport) as any,
        },
      });
    } catch {
      await this._failChallenge(challengeId);
      await this._writeAuthLog(storedCredential.user_id, storedCredential.id, false, 'Authentication threw', ipAddress, userAgent);
      throw new UnauthorizedException('Passkey verification failed');
    }

    if (!verification.verified) {
      await this._failChallenge(challengeId);
      await this._writeAuthLog(storedCredential.user_id, storedCredential.id, false, 'Verification returned false', ipAddress, userAgent);
      throw new UnauthorizedException('Passkey verification failed');
    }

    const { authenticationInfo } = verification;

    // Update credential sign count and last-used metadata
    await this.prisma.webauthn_credentials.update({
      where: { id: storedCredential.id },
      data: {
        sign_count: BigInt(authenticationInfo.newCounter),
        last_used_at: new Date(),
        last_used_ip: ipAddress ?? null,
        updated_at: new Date(),
      },
    });

    await this.prisma.webauthn_challenges.update({
      where: { id: challengeId },
      data: { status: 'COMPLETED', completed_at: new Date() },
    });

    await this._writeAuthLog(storedCredential.user_id, storedCredential.id, true, null, ipAddress, userAgent);

    const user = await this.prisma.user.findUnique({
      where: { id: storedCredential.user_id },
    });
    if (!user) throw new UnauthorizedException('Passkey verification failed');

    return this.authService.login({ id: user.id, email: user.email, role: user.role });
  }

  // ---------------------------------------------------------------------------
  // Credential management
  // ---------------------------------------------------------------------------

  async listCredentials(userId: string) {
    const credentials = await this.prisma.webauthn_credentials.findMany({
      where: { user_id: userId, is_active: true },
      select: {
        id: true,
        device_label: true,
        transports: true,
        last_used_at: true,
        created_at: true,
        is_backup_eligible: true,
        is_backed_up: true,
      },
      orderBy: { created_at: 'desc' },
    });
    return credentials;
  }

  async revokeCredential(userId: string, credentialId: string) {
    const credential = await this.prisma.webauthn_credentials.findUnique({
      where: { id: credentialId },
    });

    if (!credential || credential.user_id !== userId) {
      throw new UnauthorizedException('Passkey operation failed');
    }

    await this.prisma.webauthn_credentials.update({
      where: { id: credentialId },
      data: {
        is_active: false,
        revoked_at: new Date(),
        revoked_reason: 'USER_REVOKED',
        updated_at: new Date(),
      },
    });

    await this._writeAuthLog(userId, credentialId, false, 'USER_REVOKED', null, null);

    return { message: 'Passkey revoked' };
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private async _failChallenge(challengeId: string) {
    try {
      await this.prisma.webauthn_challenges.update({
        where: { id: challengeId },
        data: { status: 'FAILED' },
      });
    } catch {
      // ignore — challenge may not exist
    }
  }

  private async _writeAuthLog(
    userId: string | null,
    credentialId: string | null,
    wasSuccessful: boolean,
    failureReason: string | null,
    ipAddress?: string | null,
    userAgent?: string | null,
  ) {
    try {
      await this.prisma.webauthn_authentication_log.create({
        data: {
          user_id: userId,
          credential_id: credentialId,
          was_successful: wasSuccessful,
          failure_reason: failureReason,
          ip_address: ipAddress ?? null,
          user_agent: userAgent ?? null,
        },
      });
    } catch {
      // Audit log failure must never propagate
    }
  }
}
