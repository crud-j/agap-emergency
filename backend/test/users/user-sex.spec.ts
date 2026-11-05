import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AuditAction, UserSex } from '@agap/shared';
import { AuthService } from '../../src/auth/auth.service';
import { RegisterDto } from '../../src/auth/dto/register.dto';
import { UpdateProfileDto } from '../../src/users/dto/update-profile.dto';
import { UsersService } from '../../src/users/users.service';

const validRegistration = {
  fullName: 'Maria Santos',
  phoneNumber: '09171234567',
  password: 'S3curePass!',
  confirmPassword: 'S3curePass!',
};

async function registerErrors(body: Record<string, unknown>) {
  const errors = await validate(plainToInstance(RegisterDto, body));
  return errors.map((e) => e.property);
}

describe('MOD-01 optional reporter sex', () => {
  describe('RegisterDto validation', () => {
    it('accepts a registration with no sex (older app builds)', async () => {
      expect(await registerErrors(validRegistration)).toEqual([]);
    });

    it.each(Object.values(UserSex))('accepts %s', async (sex) => {
      expect(await registerErrors({ ...validRegistration, sex })).toEqual([]);
    });

    it('rejects a value outside the enum', async () => {
      expect(await registerErrors({ ...validRegistration, sex: 'OTHER' })).toEqual(['sex']);
    });
  });

  describe('AuthService.register persistence', () => {
    function makeService() {
      const prisma = {
        user: {
          findUnique: jest.fn().mockResolvedValue(null),
          create: jest.fn(async ({ data }) => ({ id: 'user-1', ...data })),
        },
        user_verifications: { create: jest.fn() },
      };
      const smsQueue = { add: jest.fn().mockResolvedValue(undefined) };
      // register() reads ID_VERIFICATION_REQUIRED; unset = the registration flow these tests cover.
      const config = { get: () => undefined };
      const service = new AuthService(
        prisma as any, {} as any, smsQueue as any, undefined as any, undefined as any,
        undefined as any, undefined as any, config as any, undefined as any,
      );
      return { service, prisma };
    }

    it.each(Object.values(UserSex))('stores %s', async (sex) => {
      const { service, prisma } = makeService();
      await service.register({ ...validRegistration, sex } as RegisterDto);
      expect(prisma.user.create.mock.calls[0]![0].data.sex).toBe(sex);
    });

    it('stores null when sex is omitted', async () => {
      const { service, prisma } = makeService();
      await service.register(validRegistration as RegisterDto);
      expect(prisma.user.create.mock.calls[0]![0].data.sex).toBeNull();
    });

    it('never returns the password hash', async () => {
      const { service } = makeService();
      const { user } = await service.register({ ...validRegistration, sex: UserSex.FEMALE } as RegisterDto);
      expect(user).not.toHaveProperty('password_hash');
      expect(user.sex).toBe(UserSex.FEMALE);
    });
  });

  describe('UpdateProfileDto validation', () => {
    it('accepts null so a user can clear the choice', async () => {
      const errors = await validate(plainToInstance(UpdateProfileDto, { sex: null }));
      expect(errors).toEqual([]);
    });

    it('rejects a value outside the enum', async () => {
      const errors = await validate(plainToInstance(UpdateProfileDto, { sex: 'OTHER' }));
      expect(errors.map((e) => e.property)).toEqual(['sex']);
    });
  });

  describe('UsersService.updateMe', () => {
    function makeService(currentSex: UserSex | null) {
      const prisma = {
        user: {
          findUnique: jest.fn().mockResolvedValue({ id: 'user-1', role: 'CITIZEN', sex: currentSex }),
          update: jest.fn(async ({ data }) => ({ id: 'user-1', ...data })),
        },
      };
      const audit = { log: jest.fn().mockResolvedValue(undefined) };
      return { service: new UsersService(prisma as any, audit as any), prisma, audit };
    }

    it('saves the new value and audits the change without recording the value', async () => {
      const { service, prisma, audit } = makeService(null);
      await service.updateMe('user-1', { sex: UserSex.MALE });

      expect(prisma.user.update.mock.calls[0]![0].data.sex).toBe(UserSex.MALE);
      expect(audit.log).toHaveBeenCalledTimes(1);
      const entry = audit.log.mock.calls[0]![0];
      expect(entry).toMatchObject({ action: AuditAction.UPDATE, entityType: 'User', moduleId: 'MOD-01' });
      expect(JSON.stringify(entry)).not.toContain(UserSex.MALE);
    });

    it('clears the value when sent null', async () => {
      const { service, prisma } = makeService(UserSex.FEMALE);
      await service.updateMe('user-1', { sex: null });
      expect(prisma.user.update.mock.calls[0]![0].data.sex).toBeNull();
    });

    it('leaves sex untouched and writes no audit when the field is absent', async () => {
      const { service, prisma, audit } = makeService(UserSex.FEMALE);
      await service.updateMe('user-1', { fullName: 'Maria S.' });
      expect(prisma.user.update.mock.calls[0]![0].data).not.toHaveProperty('sex');
      expect(audit.log).not.toHaveBeenCalled();
    });

    it('writes no audit when the value is unchanged', async () => {
      const { service, audit } = makeService(UserSex.PREFER_NOT_TO_SAY);
      await service.updateMe('user-1', { sex: UserSex.PREFER_NOT_TO_SAY });
      expect(audit.log).not.toHaveBeenCalled();
    });
  });
});
