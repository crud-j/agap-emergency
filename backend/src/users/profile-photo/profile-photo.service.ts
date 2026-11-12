import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import sharp from 'sharp';
import { randomUUID } from 'crypto';
import { AuditAction } from '@agap/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { MediaService } from '../../media/media.service';
import { PhotoContentCheckService } from './photo-content-check.service';
import { RESPONDER_PHOTO_CONSENT_TYPE } from '../../common/utils/reporter-photo';

/** A profile photo can be changed once every this many months. */
export const PROFILE_PHOTO_COOLDOWN_MONTHS = 5;

/** Multer limit. Phone selfies are well under this; the server re-encodes to ~100 KB. */
export const MAX_PROFILE_PHOTO_BYTES = 10_485_760; // 10 MB

const ACCEPTED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
/** Stored size: square, enough for any avatar in the apps without keeping a full-resolution face. */
const STORED_EDGE_PX = 640;

/**
 * `date` plus `months`, clamped to the last day of the target month
 * (31 Aug + 5 months = 31 Jan; 30 Sep + 5 months = 28/29 Feb).
 */
export function addMonths(date: Date, months: number): Date {
  const d = new Date(date.getTime());
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, lastDay));
  return d;
}

/** When the photo set at `updatedAt` may next be changed. Null: no photo yet, so any time. */
export function nextProfilePhotoChangeAt(updatedAt: Date | null): Date | null {
  return updatedAt ? addMonths(updatedAt, PROFILE_PHOTO_COOLDOWN_MONTHS) : null;
}

/** Photo fields added to the user's own profile. The storage location is never exposed. */
export interface ProfilePhotoInfo {
  has_profile_photo: boolean;
  profile_photo_updated_at: Date | null;
  /** Null when it can be changed now. */
  profile_photo_next_change_at: Date | null;
}

export function profilePhotoInfo(updatedAt: Date | null, now = new Date()): ProfilePhotoInfo {
  const next = nextProfilePhotoChangeAt(updatedAt);
  return {
    has_profile_photo: updatedAt !== null,
    profile_photo_updated_at: updatedAt,
    profile_photo_next_change_at: next && next > now ? next : null,
  };
}

/**
 * MOD-01: the user's profile picture, taken as a live selfie in the AGAP app.
 *
 * Personal data: stored privately (same bucket and local-disk fallback as other
 * private objects), never logged. Served to its owner, and to the staff and crew of
 * the owner's active reports only when they opt in (see ReporterPhotoService).
 */
@Injectable()
export class ProfilePhotoService {
  private readonly logger = new Logger(ProfilePhotoService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly media: MediaService,
    private readonly audit: AuditService,
    private readonly contentCheck: PhotoContentCheckService,
  ) {}

  async upload(
    userId: string,
    file: Express.Multer.File | undefined,
    captureSource: string | undefined,
  ): Promise<ProfilePhotoInfo> {
    if (!file?.buffer?.length) throw new BadRequestException('No photo provided.');
    if (!ACCEPTED_MIME_TYPES.has(file.mimetype)) {
      throw new BadRequestException('Unsupported photo type. Allowed: jpeg, png, webp.');
    }
    // The app only offers the live front camera; there is no gallery option.
    if (captureSource !== 'live-camera') {
      throw new BadRequestException('Take a live selfie in the AGAP app to change your profile picture.');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true, is_guest: true, profile_photo_location: true, profile_photo_updated_at: true },
    });
    if (!user) throw new NotFoundException('User not found');
    if (user.is_guest) throw new ForbiddenException('Create an account to add a profile picture.');

    const now = new Date();
    this.assertCanChange(user.profile_photo_updated_at, now);

    const jpeg = await this.normalise(file.buffer);

    // Before anything is stored or the 5-month window is used: a refused photo leaves no trace.
    const check = await this.contentCheck.check(jpeg);
    if (check.status === 'unavailable') {
      throw new ServiceUnavailableException({
        code: 'PROFILE_PHOTO_CHECK_UNAVAILABLE',
        message: 'The photo check is starting up. Try again in a minute.',
      });
    }
    if (check.status === 'rejected') {
      throw new UnprocessableEntityException({
        code: 'PROFILE_PHOTO_REJECTED',
        issues: check.issues,
        message: 'Please retake your photo.',
      });
    }

    const location = await this.media.putPrivateObject(`profile-photos/${userId}/${randomUUID()}.jpg`, jpeg);

    // Only if nobody else changed it since the check above (a double tap, two devices).
    const { count } = await this.prisma.user.updateMany({
      where: { id: userId, profile_photo_updated_at: user.profile_photo_updated_at },
      data: { profile_photo_location: location, profile_photo_updated_at: now },
    });
    if (count === 0) {
      this.discard(location);
      const fresh = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { profile_photo_updated_at: true },
      });
      this.assertCanChange(fresh?.profile_photo_updated_at ?? null, now);
      throw new ConflictException('Your profile picture was just changed. Refresh and try again.');
    }

    if (user.profile_photo_location) this.discard(user.profile_photo_location);

    // MOD-46: that it changed, never the image or where it is stored.
    void this.audit.log({
      action: AuditAction.UPDATE,
      actorId: userId,
      actorRole: user.role,
      entityId: userId,
      entityType: 'User',
      moduleId: 'MOD-01',
      newValues: { changedFields: ['profile_photo'] },
    });

    return profilePhotoInfo(now, now);
  }

  /** The owner's photo as JPEG bytes. */
  async read(userId: string): Promise<Buffer> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { profile_photo_location: true },
    });
    if (!user?.profile_photo_location) throw new NotFoundException('No profile picture.');
    return this.media.getPrivateObject(user.profile_photo_location);
  }

  /**
   * MOD-01 / MOD-48: turns "show my photo to responders" on or off. Saved as a consent
   * record so it is dated and withdrawable; idempotent either way. Turning it off takes
   * effect at once: the reporter-photo route checks the consent on every request.
   */
  async setResponderSharing(userId: string, enabled: boolean): Promise<{ profile_photo_shared_with_responders: boolean }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true, is_guest: true },
    });
    if (!user) throw new NotFoundException('User not found');
    if (user.is_guest) throw new ForbiddenException('Create an account to share a profile picture.');

    const active = await this.prisma.consent_records.findFirst({
      where: { user_id: userId, consent_type: RESPONDER_PHOTO_CONSENT_TYPE, status: 'GRANTED' },
      select: { id: true },
    });
    if (enabled === !!active) return { profile_photo_shared_with_responders: enabled };

    if (enabled) {
      await this.prisma.consent_records.create({
        data: { user_id: userId, consent_type: RESPONDER_PHOTO_CONSENT_TYPE, status: 'GRANTED' },
      });
    } else {
      await this.prisma.consent_records.updateMany({
        where: { user_id: userId, consent_type: RESPONDER_PHOTO_CONSENT_TYPE, status: 'GRANTED' },
        data: { status: 'WITHDRAWN', withdrawn_at: new Date() },
      });
    }

    void this.audit.log({
      action: enabled ? AuditAction.CONSENT_GRANT : AuditAction.CONSENT_WITHDRAW,
      actorId: userId,
      actorRole: user.role,
      entityId: userId,
      entityType: 'User',
      moduleId: 'MOD-48',
      newValues: { consentType: RESPONDER_PHOTO_CONSENT_TYPE },
    });
    return { profile_photo_shared_with_responders: enabled };
  }

  private assertCanChange(updatedAt: Date | null, now: Date): void {
    const next = nextProfilePhotoChangeAt(updatedAt);
    if (next && next > now) {
      throw new ConflictException({
        code: 'PROFILE_PHOTO_COOLDOWN',
        message: `You can change your profile picture again on ${next.toISOString().slice(0, 10)}.`,
        nextChangeAt: next.toISOString(),
      });
    }
  }

  /**
   * Decodes and re-encodes the upload: proves it is a real image, applies the camera's
   * rotation, crops a centred square (the app frames the face in the centre), and drops
   * all metadata, including any GPS position, from what is stored.
   */
  private async normalise(input: Buffer): Promise<Buffer> {
    try {
      return await sharp(input, { failOn: 'error' })
        .rotate()
        .resize(STORED_EDGE_PX, STORED_EDGE_PX, { fit: 'cover', position: 'centre' })
        .jpeg({ quality: 85 })
        .toBuffer();
    } catch {
      throw new BadRequestException('The photo could not be read. Take it again.');
    }
  }

  /** Best-effort removal of an object nothing points at any more. */
  private discard(location: string): void {
    this.media.deletePrivateObject(location).catch((err: unknown) =>
      this.logger.warn(`Could not delete an unused profile photo: ${String(err)}`),
    );
  }
}
