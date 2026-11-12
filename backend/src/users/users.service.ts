import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ReportReadinessDto } from './dto/report-readiness.dto';
import { Prisma } from '@prisma/client';
import { AuditAction, UserRole } from '@agap/shared';
import { AuditService } from '../audit/audit.service';
import { SessionRevocationService } from '../auth/sessions/session-revocation.service';
import {
  AccountSnapshot,
  ReadinessCheck,
  ReadinessStatus,
  evaluateAccountChecks,
  evaluateDeviceChecks,
  overallStatus,
  sortChecks,
} from './readiness/readiness.evaluator';
import { profilePhotoInfo } from './profile-photo/profile-photo.service';
import { ACTIVE_RESPONDER_PHOTO_CONSENT } from '../common/utils/reporter-photo';

const MEDICAL_CONSENT_TYPE = 'MEDICAL_PROFILE';
const READINESS_STALE_AFTER_MS = 24 * 60 * 60 * 1000;

export interface ReadinessResult {
  /** Null until this user has reported a device check at least once. */
  overallStatus: ReadinessStatus | null;
  checks: ReadinessCheck[];
  passed: number;
  total: number;
  deviceId: string | null;
  checkedAt: string | null;
  syncedAt: string | null;
  stale: boolean;
}

function buildReadinessResult(
  checks: ReadinessCheck[],
  report: { device_id: string; checked_at: Date; updated_at: Date } | null,
): ReadinessResult {
  const sorted = sortChecks(checks);
  return {
    overallStatus: report ? overallStatus(sorted) : null,
    checks: sorted,
    passed: sorted.filter((check) => check.status === 'READY').length,
    total: sorted.length,
    deviceId: report?.device_id ?? null,
    checkedAt: report?.checked_at.toISOString() ?? null,
    syncedAt: report?.updated_at.toISOString() ?? null,
    stale: report ? Date.now() - report.checked_at.getTime() > READINESS_STALE_AFTER_MS : false,
  };
}

const SAFE_USER_SELECT = {
  id: true,
  full_name: true,
  email: true,
  phone_number: true,
  role: true,
  status: true,
  is_guest: true,
  is_email_verified: true,
  is_phone_verified: true,
  barangay: true,
  municipality: true,
  province: true,
  full_address: true,
  preferred_language: true,
  text_size: true,
  high_contrast: true,
  reduced_motion: true,
  sex: true,
  profile_completeness: true,
  last_login_at: true,
  created_at: true,
} satisfies Prisma.UserSelect;

/** What {@link withProfilePhoto} needs on top of the safe fields. */
const PROFILE_PHOTO_SELECT = {
  profile_photo_updated_at: true,
  consent_records: ACTIVE_RESPONDER_PHOTO_CONSENT,
} satisfies Prisma.UserSelect;

/**
 * The user's own profile: adds whether they have a photo, when they may next change it,
 * and whether they let the staff and crew of their reports see it.
 */
function withProfilePhoto<T extends { profile_photo_updated_at: Date | null; consent_records?: unknown[] | null }>(user: T) {
  const { profile_photo_updated_at, consent_records, ...rest } = user;
  return {
    ...rest,
    ...profilePhotoInfo(profile_photo_updated_at),
    profile_photo_shared_with_responders: (consent_records?.length ?? 0) > 0,
  };
}

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly sessions: SessionRevocationService,
  ) {}

  async findMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { ...SAFE_USER_SELECT, ...PROFILE_PHOTO_SELECT },
    });
    if (!user) throw new NotFoundException('User not found');
    return withProfilePhoto(user);
  }

  async updateMe(userId: string, dto: UpdateProfileDto) {
    const current = await this.ensureExists(userId);
    const sexChanged = dto.sex !== undefined && dto.sex !== current.sex;

    // "ID verified" must never sit beside a name nobody checked (plan §11 D8). Withdrawing
    // consent ends the verification; scanning again then checks the new name.
    if (current.identity_verified_at && dto.fullName !== undefined && dto.fullName !== current.full_name) {
      throw new ConflictException('Your name is verified against your ID and can\'t be changed here.');
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(dto.sex !== undefined && { sex: dto.sex }),
        ...(dto.fullName !== undefined && { full_name: dto.fullName }),
        ...(dto.barangay !== undefined && { barangay: dto.barangay }),
        ...(dto.preferredLanguage !== undefined && {
          preferred_language: dto.preferredLanguage,
        }),
        ...(dto.fullAddress !== undefined && { full_address: dto.fullAddress }),
        ...(dto.textSize !== undefined && { text_size: dto.textSize }),
        ...(dto.highContrast !== undefined && { high_contrast: dto.highContrast }),
        ...(dto.reducedMotion !== undefined && { reduced_motion: dto.reducedMotion }),
      },
      select: { ...SAFE_USER_SELECT, ...PROFILE_PHOTO_SELECT },
    });

    if (sexChanged) {
      // MOD-46: record that the field changed, not its value. Sex is personal
      // data and audit rows are permanent, so the value itself is not copied here.
      void this.audit.log({
        action: AuditAction.UPDATE,
        actorId: userId,
        actorRole: current.role,
        entityId: userId,
        entityType: 'User',
        moduleId: 'MOD-01',
        newValues: { changedFields: ['sex'] },
      });
    }

    return withProfilePhoto(updated);
  }

  async deleteMe(userId: string) {
    await this.ensureExists(userId);
    // Sign out everywhere together with the deactivation.
    const revokedIds = await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: { status: 'DEACTIVATED' },
      });
      return this.sessions.revokeAllForUser(tx, userId);
    });
    await this.sessions.markRevoked(revokedIds);
  }

  async getReadiness(userId: string, deviceId?: string): Promise<ReadinessResult> {
    const [account, report] = await Promise.all([
      this.getAccountSnapshot(userId),
      this.prisma.device_readiness_reports.findFirst({
        where: { user_id: userId, ...(deviceId && { device_id: deviceId }) },
        orderBy: { updated_at: 'desc' },
      }),
    ]);

    const accountChecks = evaluateAccountChecks(account);
    if (!report) {
      return buildReadinessResult(accountChecks, null);
    }

    const deviceChecks = evaluateDeviceChecks(
      {
        locationPermission: report.location_permission,
        locationServicesEnabled: report.location_services_enabled,
        notificationPermission: report.notification_permission,
        cameraPermission: report.camera_permission,
        motionSensorAvailable: report.motion_sensor_available,
        connectivity: report.connectivity,
      },
      account,
    );
    return buildReadinessResult([...deviceChecks, ...accountChecks], report);
  }

  async reportReadiness(userId: string, dto: ReportReadinessDto): Promise<ReadinessResult> {
    const account = await this.getAccountSnapshot(userId);
    const checks = [...evaluateDeviceChecks(dto, account), ...evaluateAccountChecks(account)];
    const status = overallStatus(checks);
    // A device clock running ahead must not make a report look fresher than it is.
    const checkedAt = new Date(Math.min(Date.parse(dto.checkedAt), Date.now()));

    const device = {
      platform: dto.platform,
      app_version: dto.appVersion ?? null,
      location_permission: dto.locationPermission,
      location_services_enabled: dto.locationServicesEnabled,
      notification_permission: dto.notificationPermission,
      camera_permission: dto.cameraPermission,
      motion_sensor_available: dto.motionSensorAvailable,
      connectivity: dto.connectivity,
      connection_type: dto.connectionType ?? null,
      overall_status: status,
      checked_at: checkedAt,
    };

    const report = await this.prisma.device_readiness_reports.upsert({
      where: { user_id_device_id: { user_id: userId, device_id: dto.deviceId } },
      create: { user_id: userId, device_id: dto.deviceId, ...device },
      update: { ...device, updated_at: new Date() },
    });

    return buildReadinessResult(checks, report);
  }

  private async getAccountSnapshot(userId: string): Promise<AccountSnapshot> {
    const [user, activeEmergencyContacts, pushToken, medicalProfile, medicalConsent] =
      await Promise.all([
        this.prisma.user.findUnique({
          where: { id: userId },
          select: { phone_number: true, is_phone_verified: true },
        }),
        this.prisma.emergencyContact.count({ where: { user_id: userId, is_active: true } }),
        this.prisma.system_configurations.findUnique({
          where: { config_key: `fcm_token:${userId}` },
          select: { config_value: true },
        }),
        this.prisma.medicalProfile.findUnique({ where: { user_id: userId }, select: { id: true } }),
        this.prisma.consent_records.findFirst({
          where: { user_id: userId, consent_type: MEDICAL_CONSENT_TYPE, status: 'GRANTED' },
          select: { id: true },
        }),
      ]);
    if (!user) throw new NotFoundException('User not found');

    const tokenValue = pushToken?.config_value as { fcmToken?: unknown } | null | undefined;
    return {
      pushTokenRegistered: typeof tokenValue?.fcmToken === 'string' && tokenValue.fcmToken.length > 0,
      activeEmergencyContacts,
      phoneNumber: user.phone_number,
      phoneVerified: user.is_phone_verified,
      hasMedicalProfile: !!medicalProfile,
      medicalConsentGranted: !!medicalConsent,
    };
  }

  async findById(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: SAFE_USER_SELECT,
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async findAll(params: { page?: number; perPage?: number; role?: UserRole }) {
    const page = params.page ?? 1;
    const perPage = Math.min(params.perPage ?? 20, 100);
    const skip = (page - 1) * perPage;

    const where: Prisma.UserWhereInput = {};
    if (params.role) where.role = params.role as any;

    const [data, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        select: SAFE_USER_SELECT,
        orderBy: { created_at: 'desc' },
        skip,
        take: perPage,
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      data,
      meta: { total, page, perPage, totalPages: Math.ceil(total / perPage) },
    };
  }

  private async ensureExists(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }
}
