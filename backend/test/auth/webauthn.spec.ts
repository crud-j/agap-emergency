import { UnauthorizedException } from '@nestjs/common';

jest.mock('@simplewebauthn/server', () => ({
  generateRegistrationOptions: jest.fn(async () => ({ challenge: 'reg-challenge' })),
  generateAuthenticationOptions: jest.fn(async () => ({ challenge: 'auth-challenge' })),
  verifyRegistrationResponse: jest.fn(),
  verifyAuthenticationResponse: jest.fn(),
}));

import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from '@simplewebauthn/server';
import { WebAuthnService } from '../../src/auth/webauthn.service';

const FINGERPRINT = 'AB:CD:EF:01';
const APK_ORIGIN = `android:apk-key-hash:${Buffer.from('abcdef01', 'hex').toString('base64url')}`;

const user = {
  id: 'user-1',
  email: 'juan@example.ph',
  phone_number: '+639171234567',
  full_name: 'Juan Dela Cruz',
  role: 'CITIZEN',
  status: 'ACTIVE',
  is_guest: false,
  password_hash: 'secret-hash',
};

const storedCredential = {
  id: 'cred-row-1',
  user_id: 'user-1',
  credential_id: 'cred-abc',
  public_key: Buffer.from([1, 2, 3]).toString('base64url'),
  sign_count: BigInt(0),
  transports: ['INTERNAL', 'HYBRID'],
  is_active: true,
  device_label: 'Pixel 8 (Android)',
};

function makePrisma() {
  return {
    user: { findUnique: jest.fn() },
    webauthn_credentials: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    webauthn_challenges: {
      create: jest.fn().mockResolvedValue({ id: 'challenge-1' }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    webauthn_authentication_log: { create: jest.fn() },
  };
}

function makeConfig(values: Record<string, string>) {
  return { get: jest.fn((key: string, fallback?: string) => values[key] ?? fallback) };
}

describe('WebAuthnService', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let authService: { login: jest.Mock };
  let auditService: { log: jest.Mock };
  let service: WebAuthnService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = makePrisma();
    authService = { login: jest.fn(async (u) => ({ accessToken: 'a', refreshToken: 'r', user: u })) };
    auditService = { log: jest.fn() };
    service = new WebAuthnService(
      prisma as any,
      authService as any,
      auditService as any,
      makeConfig({
        WEBAUTHN_RP_ID: 'agap.example.ph',
        WEBAUTHN_ORIGIN: 'https://agap.example.ph, https://ops.agap.example.ph',
        WEBAUTHN_ANDROID_CERT_FINGERPRINTS: FINGERPRINT,
      }) as any,
    );
  });

  describe('registration', () => {
    it('requires a discoverable, user-verified credential', async () => {
      prisma.user.findUnique.mockResolvedValue(user);
      await service.beginRegistration('user-1');
      expect(generateRegistrationOptions).toHaveBeenCalledWith(
        expect.objectContaining({
          rpID: 'agap.example.ph',
          authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
        }),
      );
    });

    it('rejects guest accounts', async () => {
      prisma.user.findUnique.mockResolvedValue({ ...user, is_guest: true });
      await expect(service.beginRegistration('user-1')).rejects.toThrow('Guest accounts');
      expect(prisma.webauthn_challenges.create).not.toHaveBeenCalled();
    });

    it('accepts web, iOS and Android origins and drops unknown transports', async () => {
      prisma.webauthn_challenges.findUnique.mockResolvedValue({ id: 'challenge-1', challenge: 'reg-challenge', user_id: 'user-1' });
      (verifyRegistrationResponse as jest.Mock).mockResolvedValue({
        verified: true,
        registrationInfo: {
          credential: { id: 'cred-abc', publicKey: new Uint8Array([1, 2, 3]), counter: 0, transports: ['internal', 'cable', 'hybrid'] },
          fmt: 'none',
          aaguid: '00000000-0000-0000-0000-000000000000',
          credentialDeviceType: 'multiDevice',
          credentialBackedUp: true,
        },
      });
      prisma.webauthn_credentials.create.mockResolvedValue({ id: 'cred-row-1', device_label: 'Pixel 8', created_at: new Date() });

      await service.completeRegistration('user-1', 'challenge-1', { id: 'cred-abc' }, 'Pixel 8');

      expect(verifyRegistrationResponse).toHaveBeenCalledWith(
        expect.objectContaining({
          expectedOrigin: ['https://agap.example.ph', 'https://ops.agap.example.ph', APK_ORIGIN],
          expectedRPID: 'agap.example.ph',
          requireUserVerification: true,
        }),
      );
      expect(prisma.webauthn_credentials.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ transports: ['INTERNAL', 'HYBRID'], device_label: 'Pixel 8' }),
      });
      expect(prisma.webauthn_challenges.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'COMPLETED' }) }),
      );
      expect(auditService.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'CREATE', entityType: 'webauthn_credential' }));
    });

    it('claims the challenge only for its own user', async () => {
      prisma.webauthn_challenges.updateMany.mockResolvedValue({ count: 0 });
      await expect(service.completeRegistration('someone-else', 'challenge-1', {})).rejects.toBeInstanceOf(UnauthorizedException);
      expect(prisma.webauthn_challenges.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ user_id: 'someone-else', status: 'PENDING' }) }),
      );
      expect(verifyRegistrationResponse).not.toHaveBeenCalled();
    });
  });

  describe('begin authentication (username-first)', () => {
    it('scopes the ceremony to the resolved user and their passkeys', async () => {
      prisma.user.findUnique.mockResolvedValue(user);
      prisma.webauthn_credentials.findMany.mockResolvedValue([
        { credential_id: 'cred-abc', transports: ['INTERNAL'] },
      ]);

      await service.beginAuthentication('juan@example.ph');

      expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { email: 'juan@example.ph' } });
      expect(generateAuthenticationOptions).toHaveBeenCalledWith(
        expect.objectContaining({
          allowCredentials: [{ id: 'cred-abc', transports: ['internal'] }],
          userVerification: 'required',
        }),
      );
      expect(prisma.webauthn_challenges.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ user_id: 'user-1' }) }),
      );
    });

    it('normalizes a phone identifier', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await service.beginAuthentication('09171234567');
      expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { phone_number: '+639171234567' } });
    });

    it('returns a bogus descriptor (no enumeration) when the identifier has no usable passkey', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await service.beginAuthentication('ghost@example.ph');
      const opts = (generateAuthenticationOptions as jest.Mock).mock.calls[0][0];
      expect(opts.allowCredentials).toHaveLength(1);
      expect(opts.allowCredentials[0].id).toEqual(expect.any(String));
      expect(prisma.webauthn_challenges.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ user_id: null }) }),
      );
    });
  });

  describe('authentication', () => {
    beforeEach(() => {
      prisma.webauthn_challenges.findUnique.mockResolvedValue({ id: 'challenge-1', challenge: 'auth-challenge', user_id: null });
      prisma.webauthn_credentials.findUnique.mockResolvedValue(storedCredential);
      prisma.user.findUnique.mockResolvedValue(user);
      (verifyAuthenticationResponse as jest.Mock).mockResolvedValue({ verified: true, authenticationInfo: { newCounter: 1 } });
    });

    it('issues tokens with the full safe user (no password hash)', async () => {
      const result = await service.completeAuthentication('challenge-1', { id: 'cred-abc' });

      expect(authService.login).toHaveBeenCalledTimes(1);
      const passedUser = authService.login.mock.calls[0][0];
      expect(passedUser).toMatchObject({ id: 'user-1', full_name: 'Juan Dela Cruz', role: 'CITIZEN' });
      expect(passedUser).not.toHaveProperty('password_hash');
      expect(result.accessToken).toBe('a');
    });

    it('rejects a replayed or expired challenge before verifying', async () => {
      prisma.webauthn_challenges.updateMany.mockResolvedValue({ count: 0 });
      await expect(service.completeAuthentication('challenge-1', { id: 'cred-abc' })).rejects.toBeInstanceOf(UnauthorizedException);
      expect(verifyAuthenticationResponse).not.toHaveBeenCalled();
      expect(authService.login).not.toHaveBeenCalled();
    });

    it("rejects another user's passkey on a user-scoped challenge", async () => {
      prisma.webauthn_challenges.findUnique.mockResolvedValue({ id: 'challenge-1', challenge: 'auth-challenge', user_id: 'user-2' });
      await expect(service.completeAuthentication('challenge-1', { id: 'cred-abc' })).rejects.toBeInstanceOf(UnauthorizedException);
      expect(authService.login).not.toHaveBeenCalled();
    });

    it('rejects suspended accounts', async () => {
      prisma.user.findUnique.mockResolvedValue({ ...user, status: 'SUSPENDED' });
      await expect(service.completeAuthentication('challenge-1', { id: 'cred-abc' })).rejects.toBeInstanceOf(UnauthorizedException);
      expect(authService.login).not.toHaveBeenCalled();
    });

    it('rejects a revoked credential', async () => {
      prisma.webauthn_credentials.findUnique.mockResolvedValue({ ...storedCredential, is_active: false });
      await expect(service.completeAuthentication('challenge-1', { id: 'cred-abc' })).rejects.toBeInstanceOf(UnauthorizedException);
      expect(verifyAuthenticationResponse).not.toHaveBeenCalled();
    });
  });

  describe('revocation', () => {
    it("cannot revoke another user's passkey", async () => {
      prisma.webauthn_credentials.findUnique.mockResolvedValue({ ...storedCredential, user_id: 'user-2' });
      await expect(service.revokeCredential('user-1', 'cred-row-1')).rejects.toBeInstanceOf(UnauthorizedException);
      expect(prisma.webauthn_credentials.update).not.toHaveBeenCalled();
    });

    it('deactivates and audits the passkey', async () => {
      prisma.webauthn_credentials.findUnique.mockResolvedValue(storedCredential);
      await service.revokeCredential('user-1', 'cred-row-1', '10.0.0.1');
      expect(prisma.webauthn_credentials.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ is_active: false, revoked_reason: 'USER_REVOKED' }) }),
      );
      expect(auditService.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'DELETE', ipAddress: '10.0.0.1' }));
    });
  });
});
