import 'reflect-metadata';
import sharp from 'sharp';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  ProfilePhotoService,
  addMonths,
  nextProfilePhotoChangeAt,
  profilePhotoInfo,
} from '../../src/users/profile-photo/profile-photo.service';
import {
  DEFAULT_THRESHOLDS,
  PhotoContentCheckService,
  flagProbability,
  issuesFor,
  type PhotoCheckResult,
} from '../../src/users/profile-photo/photo-content-check.service';

async function jpegBytes(width = 800, height = 1000): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: { r: 240, g: 240, b: 240 } } })
    .jpeg()
    .toBuffer();
}

function file(buffer: Buffer, mimetype = 'image/jpeg'): Express.Multer.File {
  return { buffer, mimetype, size: buffer.length, originalname: 'selfie.jpg' } as Express.Multer.File;
}

function makeService(
  user: Record<string, unknown> | null,
  updateCount = 1,
  checkResult: PhotoCheckResult = { status: 'passed', scores: { SUNGLASSES: 0.1, UNDRESSED: 0.1 } },
) {
  const prisma = {
    user: {
      findUnique: jest.fn().mockResolvedValue(user),
      updateMany: jest.fn().mockResolvedValue({ count: updateCount }),
    },
  };
  const media = {
    putPrivateObject: jest.fn(async (key: string) => `agap-media:${key}`),
    getPrivateObject: jest.fn().mockResolvedValue(Buffer.from('jpeg')),
    deletePrivateObject: jest.fn().mockResolvedValue(undefined),
  };
  const audit = { log: jest.fn().mockResolvedValue(undefined) };
  const contentCheck = { check: jest.fn().mockResolvedValue(checkResult) };
  const service = new ProfilePhotoService(prisma as any, media as any, audit as any, contentCheck as any);
  return { service, prisma, media, audit, contentCheck };
}

const citizen = { role: 'CITIZEN', is_guest: false, profile_photo_location: null, profile_photo_updated_at: null };

describe('MOD-01 profile photo', () => {
  describe('addMonths', () => {
    it('adds calendar months', () => {
      expect(addMonths(new Date('2026-01-15T08:00:00Z'), 5).toISOString()).toBe('2026-06-15T08:00:00.000Z');
    });

    it('clamps to the end of a shorter month', () => {
      expect(addMonths(new Date('2026-09-30T00:00:00Z'), 5).toISOString()).toBe('2027-02-28T00:00:00.000Z');
      expect(addMonths(new Date('2027-09-30T00:00:00Z'), 5).toISOString()).toBe('2028-02-29T00:00:00.000Z');
    });

    it('crosses the year', () => {
      expect(addMonths(new Date('2026-11-11T00:00:00Z'), 5).toISOString()).toBe('2027-04-11T00:00:00.000Z');
    });
  });

  describe('profilePhotoInfo', () => {
    it('no photo: none, changeable now', () => {
      expect(profilePhotoInfo(null)).toEqual({
        has_profile_photo: false,
        profile_photo_updated_at: null,
        profile_photo_next_change_at: null,
      });
    });

    it('recent photo: reports the next allowed date', () => {
      const set = new Date('2026-11-01T00:00:00Z');
      const info = profilePhotoInfo(set, new Date('2026-11-11T00:00:00Z'));
      expect(info.has_profile_photo).toBe(true);
      expect(info.profile_photo_next_change_at).toEqual(nextProfilePhotoChangeAt(set));
    });

    it('older than 5 months: changeable now', () => {
      const info = profilePhotoInfo(new Date('2026-01-01T00:00:00Z'), new Date('2026-11-11T00:00:00Z'));
      expect(info.profile_photo_next_change_at).toBeNull();
    });
  });

  describe('upload', () => {
    it('stores a re-encoded square JPEG privately and records it', async () => {
      const { service, prisma, media, audit } = makeService(citizen);
      const result = await service.upload('user-1', file(await jpegBytes()), 'live-camera');

      const [key, body] = media.putPrivateObject.mock.calls[0]!;
      expect(key).toMatch(/^profile-photos\/user-1\/[0-9a-f-]+\.jpg$/);
      const meta = await sharp(body as Buffer).metadata();
      expect([meta.format, meta.width, meta.height]).toEqual(['jpeg', 640, 640]);

      expect(prisma.user.updateMany.mock.calls[0]![0].where).toEqual({ id: 'user-1', profile_photo_updated_at: null });
      expect(result.has_profile_photo).toBe(true);
      expect(result.profile_photo_next_change_at).not.toBeNull();
      // The audit row names the field only, never the image or its location.
      expect(audit.log.mock.calls[0]![0].newValues).toEqual({ changedFields: ['profile_photo'] });
    });

    it('replaces an older photo and deletes the old object', async () => {
      const { service, media } = makeService({
        ...citizen,
        profile_photo_location: 'agap-media:profile-photos/user-1/old.jpg',
        profile_photo_updated_at: new Date('2025-01-01T00:00:00Z'),
      });
      await service.upload('user-1', file(await jpegBytes()), 'live-camera');
      expect(media.deletePrivateObject).toHaveBeenCalledWith('agap-media:profile-photos/user-1/old.jpg');
    });

    it('refuses a change within 5 months, before storing anything', async () => {
      const { service, media } = makeService({
        ...citizen,
        profile_photo_location: 'agap-media:profile-photos/user-1/old.jpg',
        profile_photo_updated_at: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      });
      await expect(service.upload('user-1', file(await jpegBytes()), 'live-camera')).rejects.toBeInstanceOf(ConflictException);
      expect(media.putPrivateObject).not.toHaveBeenCalled();
    });

    it('refuses anything but a live capture', async () => {
      const { service } = makeService(citizen);
      await expect(service.upload('user-1', file(await jpegBytes()), 'gallery')).rejects.toBeInstanceOf(BadRequestException);
      await expect(service.upload('user-1', file(await jpegBytes()), undefined)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('refuses bytes that are not an image', async () => {
      const { service, media } = makeService(citizen);
      await expect(service.upload('user-1', file(Buffer.from('not an image')), 'live-camera')).rejects.toBeInstanceOf(BadRequestException);
      expect(media.putPrivateObject).not.toHaveBeenCalled();
    });

    it('refuses guests', async () => {
      const { service } = makeService({ ...citizen, is_guest: true });
      await expect(service.upload('user-1', file(await jpegBytes()), 'live-camera')).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('checks the re-encoded square photo, not the raw upload', async () => {
      const { service, contentCheck } = makeService(citizen);
      await service.upload('user-1', file(await jpegBytes(900, 1200)), 'live-camera');
      const checked = contentCheck.check.mock.calls[0]![0] as Buffer;
      const meta = await sharp(checked).metadata();
      expect([meta.width, meta.height]).toEqual([640, 640]);
    });

    it('a flagged photo is refused with its reasons; nothing is stored and the window is not used', async () => {
      const { service, media, prisma, audit } = makeService(citizen, 1, {
        status: 'rejected',
        issues: ['SUNGLASSES', 'UNDRESSED'],
        scores: { SUNGLASSES: 0.9, UNDRESSED: 0.95 },
      });
      const error = await service.upload('user-1', file(await jpegBytes()), 'live-camera').catch((e) => e);
      expect(error).toBeInstanceOf(UnprocessableEntityException);
      expect(error.getResponse()).toMatchObject({ code: 'PROFILE_PHOTO_REJECTED', issues: ['SUNGLASSES', 'UNDRESSED'] });
      expect(media.putPrivateObject).not.toHaveBeenCalled();
      expect(prisma.user.updateMany).not.toHaveBeenCalled();
      expect(audit.log).not.toHaveBeenCalled();
    });

    it('when the check cannot run, the photo is refused for now (503), not let through', async () => {
      const { service, media } = makeService(citizen, 1, { status: 'unavailable' });
      const error = await service.upload('user-1', file(await jpegBytes()), 'live-camera').catch((e) => e);
      expect(error).toBeInstanceOf(ServiceUnavailableException);
      expect(error.getResponse()).toMatchObject({ code: 'PROFILE_PHOTO_CHECK_UNAVAILABLE' });
      expect(media.putPrivateObject).not.toHaveBeenCalled();
    });

    it('checks switched off: the photo is stored', async () => {
      const { service, media } = makeService(citizen, 1, { status: 'skipped' });
      await service.upload('user-1', file(await jpegBytes()), 'live-camera');
      expect(media.putPrivateObject).toHaveBeenCalled();
    });

    it('a concurrent change wins: the new object is discarded', async () => {
      const { service, prisma, media } = makeService(citizen, 0);
      prisma.user.findUnique
        .mockResolvedValueOnce(citizen)
        .mockResolvedValueOnce({ profile_photo_updated_at: new Date() });
      await expect(service.upload('user-1', file(await jpegBytes()), 'live-camera')).rejects.toBeInstanceOf(ConflictException);
      const stored = await media.putPrivateObject.mock.results[0]!.value;
      expect(media.deletePrivateObject).toHaveBeenCalledWith(stored);
    });
  });

  describe('showing the photo to responders (consent)', () => {
    function withConsent(active: { id: string } | null) {
      const made = makeService(citizen);
      const consent = {
        findFirst: jest.fn().mockResolvedValue(active),
        create: jest.fn().mockResolvedValue({ id: 'c-new' }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      };
      (made.prisma as any).consent_records = consent;
      return { ...made, consent };
    }

    it('turning it on records a dated consent and audits it', async () => {
      const { service, consent, audit } = withConsent(null);
      await expect(service.setResponderSharing('user-1', true)).resolves.toEqual({ profile_photo_shared_with_responders: true });
      expect(consent.create).toHaveBeenCalledWith({
        data: { user_id: 'user-1', consent_type: 'PROFILE_PHOTO_RESPONDERS', status: 'GRANTED' },
      });
      expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'CONSENT_GRANT', moduleId: 'MOD-48' }));
    });

    it('turning it off withdraws every active consent', async () => {
      const { service, consent, audit } = withConsent({ id: 'c-1' });
      await expect(service.setResponderSharing('user-1', false)).resolves.toEqual({ profile_photo_shared_with_responders: false });
      expect(consent.updateMany).toHaveBeenCalledWith({
        where: { user_id: 'user-1', consent_type: 'PROFILE_PHOTO_RESPONDERS', status: 'GRANTED' },
        data: { status: 'WITHDRAWN', withdrawn_at: expect.any(Date) },
      });
      expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'CONSENT_WITHDRAW' }));
    });

    it('is idempotent: no duplicate record, no audit row', async () => {
      const on = withConsent({ id: 'c-1' });
      await on.service.setResponderSharing('user-1', true);
      expect(on.consent.create).not.toHaveBeenCalled();
      expect(on.audit.log).not.toHaveBeenCalled();

      const off = withConsent(null);
      await off.service.setResponderSharing('user-1', false);
      expect(off.consent.updateMany).not.toHaveBeenCalled();
    });

    it('refuses guests', async () => {
      const { service, prisma, consent } = withConsent(null);
      prisma.user.findUnique.mockResolvedValueOnce({ ...citizen, is_guest: true });
      await expect(service.setResponderSharing('user-1', true)).rejects.toBeInstanceOf(ForbiddenException);
      expect(consent.create).not.toHaveBeenCalled();
    });
  });

  describe('content check scoring', () => {
    const unit = (i: number, n = 4) => Array.from({ length: n }, (_, j) => (j === i ? 1 : 0));

    it('an image matching a flag description scores near 1', () => {
      expect(flagProbability(unit(0), [unit(0)], [unit(1), unit(2)])).toBeGreaterThan(0.99);
    });

    it('an image matching a pass description scores near 0', () => {
      expect(flagProbability(unit(1), [unit(0)], [unit(1), unit(2)])).toBeLessThan(0.01);
    });

    it('sums the flag side when there are several flag descriptions', () => {
      // Equally similar to all four: two of four descriptions are on the flag side.
      const even = [0.5, 0.5, 0.5, 0.5];
      expect(flagProbability(even, [unit(0), unit(1)], [unit(2), unit(3)])).toBeCloseTo(0.5, 5);
    });

    it('flags only scores at or over their cut-off', () => {
      expect(issuesFor({ SUNGLASSES: 0.78, UNDRESSED: 0.69 }, DEFAULT_THRESHOLDS)).toEqual(['SUNGLASSES']);
      expect(issuesFor({ SUNGLASSES: 0.5, UNDRESSED: 0.95 }, DEFAULT_THRESHOLDS)).toEqual(['UNDRESSED']);
      expect(issuesFor({ SUNGLASSES: 0.1, UNDRESSED: 0.1 }, DEFAULT_THRESHOLDS)).toEqual([]);
    });

    it('PROFILE_PHOTO_CHECKS=off skips the check without loading the model', async () => {
      const config = { get: (key: string, fallback?: string) => (key === 'PROFILE_PHOTO_CHECKS' ? 'off' : fallback) };
      const checker = new PhotoContentCheckService(config as any);
      await expect(checker.check(Buffer.from('x'))).resolves.toEqual({ status: 'skipped' });
    });
  });
});
