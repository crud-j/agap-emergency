import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';
import { Prisma } from '@prisma/client';
import type { webauthn_ceremony_type, webauthn_transport } from '@prisma/client';
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from '@simplewebauthn/server';
import type {
  AuthenticationResponseJSON,
  AuthenticatorTransport,
  RegistrationResponseJSON,
} from '@simplewebauthn/server';
import { AuditAction } from '@agap/shared';
import { PrismaService } from '../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuthService } from './auth.service';

/** WebAuthn transport string ↔ Prisma webauthn_transport enum. Transports not in
 *  the DB enum (e.g. the legacy "cable") are dropped instead of failing the insert. */
const TRANSPORT_TO_DB: Record<string, webauthn_transport> = {
  usb: 'USB',
  nfc: 'NFC',
  ble: 'BLE',
  internal: 'INTERNAL',
  hybrid: 'HYBRID',
  'smart-card': 'SMART_CARD',
};

function toTransport(t: webauthn_transport): AuthenticatorTransport {
  return t.toLowerCase().replace('_', '-') as AuthenticatorTransport;
}

function toDbTransports(transports: readonly string[] | undefined): webauthn_transport[] {
  return (transports ?? [])
    .map((t) => TRANSPORT_TO_DB[t])
    .filter((t): t is webauthn_transport => !!t);
}

/** "AB:CD:…" SHA-256 signing-cert fingerprint → base64url, the form Android puts in
 *  clientDataJSON.origin as `android:apk-key-hash:<hash>`. */
function fingerprintToApkKeyHash(fingerprint: string): string {
  return Buffer.from(fingerprint.replace(/:/g, ''), 'hex').toString('base64url');
}

function csv(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
}

const CHALLENGE_TTL_MS = 5 * 60 * 1000;
const BLOCKED_STATUSES = new Set(['SUSPENDED', 'DEACTIVATED']);

@Injectable()
export class WebAuthnService {
  private readonly rpID: string;
  private readonly rpName = 'AGAP Emergency Response';
  /** Every origin an authenticator may legitimately report: the web portal origin(s),
   *  `https://<rpID>` for the iOS app, and one `android:apk-key-hash:` per signing key. */
  private readonly expectedOrigins: string[];

  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthService,
    private readonly auditService: AuditService,
    private readonly config: ConfigService,
  ) {
    this.rpID = this.config.get<string>('WEBAUTHN_RP_ID', 'localhost');

    const webOrigins = csv(this.config.get<string>('WEBAUTHN_ORIGIN', 'http://localhost:3000'));
    const androidOrigins = csv(this.config.get<string>('WEBAUTHN_ANDROID_CERT_FINGERPRINTS')).map(
      (fp) => `android:apk-key-hash:${fingerprintToApkKeyHash(fp)}`,
    );
    this.expectedOrigins = [...new Set([...webOrigins, ...androidOrigins])];
  }

  // ---------------------------------------------------------------------------
  // Registration
  // ---------------------------------------------------------------------------

  async beginRegistration(userId: string, ipAddress?: string, userAgent?: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException('Passkey operation failed');
    if (user.is_guest) {
      throw new ForbiddenException('Guest accounts cannot register a passkey');
    }

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
      attestationType: 'none',
      excludeCredentials: existingCredentials.map((c) => ({
        id: c.credential_id,
        transports: c.transports.map(toTransport),
      })),
      // Discoverable credential + user verification: mobile sign-in starts without
      // an identifier, so the passkey itself must carry the user handle.
      authenticatorSelection: {
        residentKey: 'required',
        userVerification: 'required',
      },
      timeout: 60000,
    });

    const challenge = await this.prisma.webauthn_challenges.create({
      data: {
        user_id: userId,
        ceremony_type: 'REGISTRATION',
        status: 'PENDING',
        challenge: options.challenge,
        ip_address: ipAddress ?? null,
        user_agent: userAgent ?? null,
        expires_at: new Date(Date.now() + CHALLENGE_TTL_MS),
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
    const challengeRecord = await this._claimChallenge(challengeId, 'REGISTRATION', userId);

    let verification: Awaited<ReturnType<typeof verifyRegistrationResponse>>;
    try {
      verification = await verifyRegistrationResponse({
        response: response as unknown as RegistrationResponseJSON,
        expectedChallenge: challengeRecord.challenge,
        expectedOrigin: this.expectedOrigins,
        expectedRPID: this.rpID,
        requireUserVerification: true,
      });
    } catch {
      await this._writeAuthLog(userId, null, false, 'Registration verification threw', ipAddress, userAgent);
      throw new UnauthorizedException('Passkey verification failed');
    }

    if (!verification.verified || !verification.registrationInfo) {
      await this._writeAuthLog(userId, null, false, 'Verification returned false', ipAddress, userAgent);
      throw new UnauthorizedException('Passkey verification failed');
    }

    const { credential, fmt, aaguid, credentialDeviceType, credentialBackedUp } =
      verification.registrationInfo;

    let newCredential;
    try {
      newCredential = await this.prisma.webauthn_credentials.create({
        data: {
          user_id: userId,
          credential_id: credential.id,
          public_key: Buffer.from(credential.publicKey).toString('base64url'),
          sign_count: BigInt(credential.counter),
          aaguid: aaguid ?? null,
          attestation_format: fmt ?? null,
          transports: toDbTransports(credential.transports),
          is_backup_eligible: credentialDeviceType === 'multiDevice',
          is_backed_up: credentialBackedUp,
          device_label: deviceLabel ?? null,
          is_active: true,
        },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new BadRequestException('This passkey is already registered');
      }
      throw err;
    }

    await this._completeChallenge(challengeId);
    await this._writeAuthLog(userId, newCredential.id, true, null, ipAddress, userAgent);
    await this.auditService.log({
      action: AuditAction.CREATE,
      actorId: userId,
      entityType: 'webauthn_credential',
      entityId: newCredential.id,
      moduleId: 'MOD-01',
      newValues: { deviceLabel: newCredential.device_label },
      ...(ipAddress ? { ipAddress } : {}),
    });

    return {
      id: newCredential.id,
      device_label: newCredential.device_label,
      created_at: newCredential.created_at,
    };
  }

  // ---------------------------------------------------------------------------
  // Authentication
  // ---------------------------------------------------------------------------

  /**
   * Username-first sign-in: the caller supplies the email or phone they typed,
   * and the ceremony is scoped to that account's passkeys. The OS then prompts
   * only for a passkey belonging to that user.
   *
   * To avoid revealing whether an account exists (enumeration) and to stop an
   * unrelated passkey on the same device from completing the ceremony, an
   * identifier that resolves to no usable passkey still gets a single bogus
   * credential descriptor — the authenticator finds no match and the UI reports
   * "no passkey on this device".
   */
  async beginAuthentication(identifier?: string, ipAddress?: string, userAgent?: string) {
    const user = identifier ? await this._resolveUser(identifier) : null;

    let allowCredentials: { id: string; transports?: AuthenticatorTransport[] }[] = [];
    if (user) {
      const credentials = await this.prisma.webauthn_credentials.findMany({
        where: { user_id: user.id, is_active: true },
        select: { credential_id: true, transports: true },
      });
      allowCredentials = credentials.map((c) => ({
        id: c.credential_id,
        transports: c.transports.map(toTransport),
      }));
    }
    if (identifier && allowCredentials.length === 0) {
      allowCredentials = [{ id: randomBytes(32).toString('base64url') }];
    }

    const options = await generateAuthenticationOptions({
      rpID: this.rpID,
      allowCredentials,
      userVerification: 'required',
      timeout: 60000,
    });

    const challenge = await this.prisma.webauthn_challenges.create({
      data: {
        user_id: user?.id ?? null,
        ceremony_type: 'AUTHENTICATION',
        status: 'PENDING',
        challenge: options.challenge,
        ip_address: ipAddress ?? null,
        user_agent: userAgent ?? null,
        expires_at: new Date(Date.now() + CHALLENGE_TTL_MS),
      },
    });

    return { challengeId: challenge.id, options };
  }

  /** Resolve a typed email or Philippine phone number to a user, mirroring the
   *  password-login identifier logic. */
  private async _resolveUser(identifier: string) {
    const id = identifier.trim();
    if (!id) return null;
    return id.includes('@')
      ? this.prisma.user.findUnique({ where: { email: id } })
      : this.prisma.user.findUnique({ where: { phone_number: this._normalizePhone(id) } });
  }

  private _normalizePhone(input: string): string {
    if (!input) return input;
    let digits = input.trim().replace(/[\s()-]/g, '');
    if (digits.startsWith('+')) digits = digits.slice(1);
    digits = digits.replace(/\D/g, '');
    if (digits.startsWith('0')) digits = '63' + digits.slice(1); // 09XX… → 639XX…
    else if (digits.startsWith('9')) digits = '63' + digits; //      9XX…  → 639XX…
    return '+' + digits;
  }

  async completeAuthentication(
    challengeId: string,
    response: Record<string, unknown>,
    ipAddress?: string,
    userAgent?: string,
  ) {
    const challengeRecord = await this._claimChallenge(challengeId, 'AUTHENTICATION');

    // response.id is the credential_id (base64url)
    const credentialIdFromResponse = (response as { id?: unknown }).id;
    if (typeof credentialIdFromResponse !== 'string' || !credentialIdFromResponse) {
      throw new UnauthorizedException('Passkey verification failed');
    }

    const storedCredential = await this.prisma.webauthn_credentials.findUnique({
      where: { credential_id: credentialIdFromResponse },
    });

    if (!storedCredential || !storedCredential.is_active) {
      await this._writeAuthLog(null, null, false, 'Credential not found or inactive', ipAddress, userAgent);
      throw new UnauthorizedException('Passkey verification failed');
    }

    // A ceremony begun for a specific user may only be completed with that user's passkey.
    if (challengeRecord.user_id && challengeRecord.user_id !== storedCredential.user_id) {
      await this._writeAuthLog(storedCredential.user_id, storedCredential.id, false, 'Credential does not belong to challenge user', ipAddress, userAgent);
      throw new UnauthorizedException('Passkey verification failed');
    }

    let verification: Awaited<ReturnType<typeof verifyAuthenticationResponse>>;
    try {
      verification = await verifyAuthenticationResponse({
        response: response as unknown as AuthenticationResponseJSON,
        expectedChallenge: challengeRecord.challenge,
        expectedOrigin: this.expectedOrigins,
        expectedRPID: this.rpID,
        requireUserVerification: true,
        credential: {
          id: storedCredential.credential_id,
          publicKey: new Uint8Array(Buffer.from(storedCredential.public_key, 'base64url')),
          counter: Number(storedCredential.sign_count),
          transports: storedCredential.transports.map(toTransport),
        },
      });
    } catch {
      await this._writeAuthLog(storedCredential.user_id, storedCredential.id, false, 'Authentication threw', ipAddress, userAgent);
      throw new UnauthorizedException('Passkey verification failed');
    }

    if (!verification.verified) {
      await this._writeAuthLog(storedCredential.user_id, storedCredential.id, false, 'Verification returned false', ipAddress, userAgent);
      throw new UnauthorizedException('Passkey verification failed');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: storedCredential.user_id },
    });
    if (!user || BLOCKED_STATUSES.has(user.status)) {
      await this._writeAuthLog(storedCredential.user_id, storedCredential.id, false, 'Account not active', ipAddress, userAgent);
      throw new UnauthorizedException('Passkey verification failed');
    }

    await this.prisma.webauthn_credentials.update({
      where: { id: storedCredential.id },
      data: {
        sign_count: BigInt(verification.authenticationInfo.newCounter),
        last_used_at: new Date(),
        last_used_ip: ipAddress ?? null,
        updated_at: new Date(),
      },
    });

    await this._completeChallenge(challengeId);
    await this._writeAuthLog(user.id, storedCredential.id, true, null, ipAddress, userAgent);

    // Same response shape as password login: tokens + the full safe user record.
    const { password_hash: _, ...safeUser } = user;
    return this.authService.login(safeUser);
  }

  // ---------------------------------------------------------------------------
  // Credential management
  // ---------------------------------------------------------------------------

  async listCredentials(userId: string) {
    return this.prisma.webauthn_credentials.findMany({
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
  }

  async revokeCredential(userId: string, credentialId: string, ipAddress?: string) {
    const credential = await this.prisma.webauthn_credentials.findUnique({
      where: { id: credentialId },
    });

    if (!credential || credential.user_id !== userId || !credential.is_active) {
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

    await this.auditService.log({
      action: AuditAction.DELETE,
      actorId: userId,
      entityType: 'webauthn_credential',
      entityId: credentialId,
      moduleId: 'MOD-01',
      oldValues: { deviceLabel: credential.device_label },
      ...(ipAddress ? { ipAddress } : {}),
    });

    return { message: 'Passkey revoked' };
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Atomically take a PENDING, unexpired challenge so it can be used at most once.
   * The claim moves it to FAILED; only a fully verified ceremony promotes it to
   * COMPLETED. Two concurrent completes for the same challenge cannot both pass.
   */
  private async _claimChallenge(
    challengeId: string,
    ceremony: webauthn_ceremony_type,
    userId?: string,
  ) {
    const claimed = await this.prisma.webauthn_challenges.updateMany({
      where: {
        id: challengeId,
        ceremony_type: ceremony,
        status: 'PENDING',
        expires_at: { gt: new Date() },
        ...(userId ? { user_id: userId } : {}),
      },
      data: { status: 'FAILED' },
    });
    if (claimed.count !== 1) {
      throw new UnauthorizedException('Passkey verification failed');
    }

    const record = await this.prisma.webauthn_challenges.findUnique({ where: { id: challengeId } });
    if (!record) throw new UnauthorizedException('Passkey verification failed');
    return record;
  }

  private async _completeChallenge(challengeId: string) {
    await this.prisma.webauthn_challenges.update({
      where: { id: challengeId },
      data: { status: 'COMPLETED', completed_at: new Date() },
    });
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
