import 'reflect-metadata';
import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { getQueueToken } from '@nestjs/bullmq';
import { AuthService } from '@backend/auth/auth.service';
import { PrismaService } from '@backend/common/prisma/prisma.service';
import { QUEUE_NAMES } from '@agap/shared';
import { createMockPrisma } from './helpers/prisma.mock';
import * as bcrypt from 'bcryptjs';

describe('AuthService', () => {
  let service: AuthService;
  let mockPrisma: ReturnType<typeof createMockPrisma>;
  let mockJwtService: { sign: jest.Mock; verify: jest.Mock };
  let mockSmsQueue: { add: jest.Mock };

  const baseUser = {
    id: 'user-1',
    full_name: 'Juan dela Cruz',
    phone_number: '+639171234567',
    email: null,
    role: 'CITIZEN',
    status: 'ACTIVE',
    is_guest: false,
    password_hash: null,
    is_email_verified: false,
    is_phone_verified: false,
    created_at: new Date(),
    updated_at: new Date(),
  };

  beforeEach(async () => {
    mockPrisma = createMockPrisma();
    mockJwtService = { sign: jest.fn().mockReturnValue('access-token'), verify: jest.fn() };
    mockSmsQueue = { add: jest.fn().mockResolvedValue({}) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: JwtService, useValue: mockJwtService },
        { provide: getQueueToken(QUEUE_NAMES.SMS), useValue: mockSmsQueue },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  afterEach(() => jest.clearAllMocks());

  // ── Registration ──────────────────────────────────────────────────────────

  describe('register', () => {
    it('creates a new user and returns access + refresh tokens', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.user.create.mockResolvedValue({ ...baseUser, password_hash: 'hash' });
      mockPrisma.user_verifications.create.mockResolvedValue({});
      mockPrisma.user_sessions.create.mockResolvedValue({});

      const result = await service.register({
        fullName: 'Juan dela Cruz',
        phoneNumber: '+639171234567',
        password: 'SecurePass1!',
        confirmPassword: 'SecurePass1!',
      });

      expect(result.accessToken).toBe('access-token');
      expect(result.refreshToken).toBeDefined();
      expect(result.user).not.toHaveProperty('password_hash');
    });

    it('throws BadRequestException when passwords do not match', async () => {
      await expect(
        service.register({
          fullName: 'Juan',
          phoneNumber: '+63917',
          password: 'abc',
          confirmPassword: 'xyz',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when phone number is already registered', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(baseUser);

      await expect(
        service.register({
          fullName: 'Juan',
          phoneNumber: '+639171234567',
          password: 'SecurePass1!',
          confirmPassword: 'SecurePass1!',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('creates an OTP verification record after registration', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.user.create.mockResolvedValue({ ...baseUser, password_hash: 'hash' });
      mockPrisma.user_verifications.create.mockResolvedValue({});
      mockPrisma.user_sessions.create.mockResolvedValue({});

      await service.register({
        fullName: 'Juan',
        phoneNumber: '+639171234567',
        password: 'SecurePass1!',
        confirmPassword: 'SecurePass1!',
      });

      expect(mockPrisma.user_verifications.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ verification_type: 'PHONE' }) }),
      );
    });
  });

  // ── Guest registration ─────────────────────────────────────────────────────

  describe('registerGuest', () => {
    it('creates a BYSTANDER guest user without requiring a password', async () => {
      const guestUser = { ...baseUser, role: 'BYSTANDER', is_guest: true, password_hash: null };
      mockPrisma.user.create.mockResolvedValue(guestUser);

      const result = await service.registerGuest({ reporterName: 'Bystander' });

      expect(mockPrisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ is_guest: true }) }),
      );
      expect(result.accessToken).toBeDefined();
      expect(result.user).not.toHaveProperty('password_hash');
    });
  });

  // ── Login ─────────────────────────────────────────────────────────────────

  describe('login', () => {
    it('creates a session and returns access + refresh tokens', async () => {
      mockPrisma.user_sessions.create.mockResolvedValue({});

      const result = await service.login({ id: 'user-1', email: null, role: 'CITIZEN' });

      expect(result.accessToken).toBe('access-token');
      expect(result.refreshToken).toBeDefined();
      expect(mockPrisma.user_sessions.create).toHaveBeenCalled();
    });
  });

  // ── Validate user ─────────────────────────────────────────────────────────

  describe('validateUser', () => {
    it('returns null when user is not found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      const result = await service.validateUser('unknown@email.com', 'pass');
      expect(result).toBeNull();
    });

    it('returns null when user has no password set', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ ...baseUser, password_hash: null });
      const result = await service.validateUser('+63917', 'pass');
      expect(result).toBeNull();
    });

    it('returns null when password is incorrect', async () => {
      const hash = await bcrypt.hash('correct-password', 12);
      mockPrisma.user.findUnique.mockResolvedValue({ ...baseUser, password_hash: hash });
      const result = await service.validateUser('+63917', 'wrong-password');
      expect(result).toBeNull();
    });

    it('returns user (without password_hash) when credentials are valid', async () => {
      const password = 'SecurePass1!';
      const hash = await bcrypt.hash(password, 12);
      mockPrisma.user.findUnique.mockResolvedValue({ ...baseUser, password_hash: hash });

      const result = await service.validateUser('+639171234567', password);

      expect(result).toBeDefined();
      expect(result).not.toHaveProperty('password_hash');
      expect(result?.id).toBe('user-1');
    });
  });

  // ── Token refresh ─────────────────────────────────────────────────────────

  describe('refreshToken', () => {
    it('returns new tokens and revokes the used session', async () => {
      const session = {
        id: 'session-1',
        is_revoked: false,
        expires_at: new Date(Date.now() + 86400_000),
        users: { ...baseUser },
      };
      mockPrisma.user_sessions.findUnique.mockResolvedValue(session);
      mockPrisma.$transaction.mockImplementation(() => Promise.resolve([null, null]));

      const result = await service.refreshToken('valid-refresh-token');

      expect(result.accessToken).toBeDefined();
      expect(result.refreshToken).toBeDefined();
      expect(mockPrisma.$transaction).toHaveBeenCalled();
    });

    it('throws UnauthorizedException for a revoked session', async () => {
      mockPrisma.user_sessions.findUnique.mockResolvedValue({
        id: 'session-1',
        is_revoked: true,
        expires_at: new Date(Date.now() + 86400_000),
        users: baseUser,
      });

      await expect(service.refreshToken('revoked-token')).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException for an expired session', async () => {
      mockPrisma.user_sessions.findUnique.mockResolvedValue({
        id: 'session-1',
        is_revoked: false,
        expires_at: new Date(Date.now() - 1000),
        users: baseUser,
      });

      await expect(service.refreshToken('expired-token')).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException when session is not found', async () => {
      mockPrisma.user_sessions.findUnique.mockResolvedValue(null);
      await expect(service.refreshToken('unknown-token')).rejects.toThrow(UnauthorizedException);
    });
  });

  // ── Logout ────────────────────────────────────────────────────────────────

  describe('logout', () => {
    it('revokes all sessions for the user when no token is provided', async () => {
      mockPrisma.user_sessions.updateMany.mockResolvedValue({ count: 2 });

      const result = await service.logout('user-1');

      expect(mockPrisma.user_sessions.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ user_id: 'user-1' }),
          data: { is_revoked: true },
        }),
      );
      expect(result).toEqual({ message: 'Logged out' });
    });
  });

  // ── OTP verification ──────────────────────────────────────────────────────

  describe('verifyOtp', () => {
    it('marks verification and user as verified', async () => {
      mockPrisma.user_verifications.findFirst.mockResolvedValue({
        id: 'v-1',
        expires_at: new Date(Date.now() + 60_000),
      });
      mockPrisma.$transaction.mockResolvedValue([{}, {}]);

      const result = await service.verifyOtp({ userId: 'user-1', token: '123456', type: 'PHONE' });

      expect(result).toEqual({ message: 'Verification successful' });
    });

    it('throws BadRequestException when token is not found', async () => {
      mockPrisma.user_verifications.findFirst.mockResolvedValue(null);

      await expect(
        service.verifyOtp({ userId: 'user-1', token: 'bad', type: 'PHONE' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when token is expired', async () => {
      mockPrisma.user_verifications.findFirst.mockResolvedValue({
        id: 'v-1',
        expires_at: new Date(Date.now() - 1000),
      });

      await expect(
        service.verifyOtp({ userId: 'user-1', token: '123456', type: 'PHONE' }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ── Forgot password (account enumeration guard) ───────────────────────────

  describe('forgotPassword', () => {
    it('returns the same message whether the account exists or not', async () => {
      const expectedMsg = 'If the account exists, a reset OTP has been sent via SMS';

      mockPrisma.user.findUnique.mockResolvedValue(null);
      const resultNoAccount = await service.forgotPassword({ phoneNumber: '+63917' });

      mockPrisma.user.findUnique.mockResolvedValue(baseUser);
      mockPrisma.user_verifications.create.mockResolvedValue({});
      const resultWithAccount = await service.forgotPassword({ phoneNumber: '+63917' });

      expect(resultNoAccount.message).toBe(expectedMsg);
      expect(resultWithAccount.message).toBe(expectedMsg);
    });
  });

  // ── Phone OTP login ───────────────────────────────────────────────────────

  describe('loginPhone', () => {
    it('always returns the same message regardless of whether the number is registered', async () => {
      const expectedMsg = 'If this number is registered, an OTP has been sent.';

      mockPrisma.user.findUnique.mockResolvedValue(null);
      const r1 = await service.loginPhone('+63917');

      mockPrisma.user.findUnique.mockResolvedValue(baseUser);
      mockPrisma.user_verifications.updateMany.mockResolvedValue({ count: 0 });
      mockPrisma.user_verifications.create.mockResolvedValue({});
      mockSmsQueue.add.mockResolvedValue({});
      const r2 = await service.loginPhone('+63917');

      expect(r1.message).toBe(expectedMsg);
      expect(r2.message).toBe(expectedMsg);
    });

    it('queues an SMS OTP when the account exists', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(baseUser);
      mockPrisma.user_verifications.updateMany.mockResolvedValue({ count: 0 });
      mockPrisma.user_verifications.create.mockResolvedValue({});

      await service.loginPhone('+639171234567');

      expect(mockSmsQueue.add).toHaveBeenCalledWith('otp-sms', expect.objectContaining({
        phone: '+639171234567',
      }));
    });
  });
});
