import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { AuditAction } from '@agap/shared';
import { AuditService } from '../audit/audit.service';
import { SessionRevocationService } from '../auth/sessions/session-revocation.service';
import { AuthService } from '../auth/auth.service';
import { TrustedDeviceService } from '../auth/mfa/trusted-device.service';
import { assertPasswordPolicy } from '../auth/password-policy';
import * as crypto from 'crypto';

@Injectable()
export class AdministrationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly sessions: SessionRevocationService,
    private readonly auth: AuthService,
    private readonly trustedDevices: TrustedDeviceService,
  ) {}

  async findAllUsers(filters: {
    page?: number;
    perPage?: number;
    role?: string;
    status?: string;
    search?: string;
    organizationId?: string;
    mfa?: string;
  }) {
    const page = filters.page ?? 1;
    const perPage = Math.min(filters.perPage ?? 20, 100);
    const skip = (page - 1) * perPage;

    const where: Prisma.UserWhereInput = {};
    if (filters.role) where.role = filters.role as any;
    if (filters.status) where.status = filters.status as any;
    if (filters.organizationId) {
      where.organization_memberships = { some: { organization_id: filters.organizationId, is_active: true } };
    }
    if (filters.search) {
      const term = filters.search.trim();
      where.OR = [
        { full_name: { contains: term, mode: 'insensitive' } },
        { email: { contains: term, mode: 'insensitive' } },
        { phone_number: { contains: term, mode: 'insensitive' } },
      ];
    }
    if (filters.mfa === 'none') {
      where.role = { in: ['SYSTEM_ADMINISTRATOR', 'ORG_ADMINISTRATOR', 'SUPERVISOR', 'DISPATCHER', 'HOSPITAL_USER', 'ANNOUNCEMENTS_PUBLISHER'] } as any;
      where.AND = [
        { webauthn_credentials: { none: { is_active: true } } },
        { user_mfa_totp: { is: null } },
      ];
    }

    // Sequential (not `$transaction([...])`): the batch form in Prisma 7 drops
    // `skip: 0` and then rejects the query. A read list needs no transaction.
    const data = await this.prisma.user.findMany({
      where,
      select: {
        id: true,
        full_name: true,
        email: true,
        phone_number: true,
        role: true,
        status: true,
        created_at: true,
        last_login_at: true,
      },
      orderBy: { created_at: 'desc' },
      skip,
      take: perPage,
    });
    const total = await this.prisma.user.count({ where });

    return {
      data,
      meta: {
        total,
        page,
        perPage,
        totalPages: Math.ceil(total / perPage),
        hasNext: page * perPage < total,
        hasPrev: page > 1,
      },
    };
  }

  async unlock(userId: string, body: { reason: string }, actorId: string) {
    this.validateReason(body.reason);
    const user = await this.ensureTarget(userId, actorId);
    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.user.update({
        where: { id: userId },
        data: { failed_login_count: 0, locked_until: null, lockout_level: 0 },
      });
      await tx.account_lifecycle_events.create({
        data: { user_id: userId, event_type: 'ACCOUNT_UNLOCKED', performed_by_id: actorId, reason: body.reason },
      });
      await this.audit.logInTransaction(tx, {
        action: AuditAction.ACCOUNT_UNLOCKED,
        actorId,
        entityType: 'user',
        entityId: userId,
        moduleId: 'MOD-49',
        newValues: { reason: body.reason },
      });
      return result;
    });
    return { id: updated.id, message: `Account ${user.email ?? user.full_name} unlocked` };
  }

  async issueTemporaryPassword(userId: string, body: { reason: string }, actorId: string) {
    this.validateReason(body.reason);
    const user = await this.ensureTarget(userId, actorId);
    const temporaryPassword = this.generateTemporaryPassword();
    assertPasswordPolicy(temporaryPassword, { email: user.email, name: user.full_name });
    const passwordHash = await this.auth.hashPassword(temporaryPassword);
    const revokedIds = await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: {
          password_hash: passwordHash,
          must_change_password: true,
          password_changed_at: null,
          failed_login_count: 0,
          locked_until: null,
          lockout_level: 0,
        },
      });
      const ids = await this.sessions.revokeAllForUser(tx, userId);
      await this.trustedDevices.revokeAllForUser(tx, userId);
      await tx.account_lifecycle_events.create({
        data: { user_id: userId, event_type: 'TEMPORARY_PASSWORD_ISSUED', performed_by_id: actorId, reason: body.reason },
      });
      await this.audit.logInTransaction(tx, {
        action: AuditAction.PASSWORD_CHANGE,
        actorId,
        entityType: 'user',
        entityId: userId,
        moduleId: 'MOD-49',
        newValues: { method: 'ADMIN_TEMPORARY_PASSWORD', reason: body.reason, sessionsRevoked: ids.length },
      });
      return ids;
    });
    await this.sessions.markRevoked(revokedIds);
    return { temporaryPassword };
  }

  async resetMfa(userId: string, body: { reason: string }, actorId: string) {
    this.validateReason(body.reason);
    await this.ensureTarget(userId, actorId);
    const revokedIds = await this.prisma.$transaction(async (tx) => {
      await tx.user_mfa_totp.deleteMany({ where: { user_id: userId } });
      await tx.user_backup_codes.deleteMany({ where: { user_id: userId } });
      await tx.trusted_devices.updateMany({
        where: { user_id: userId, revoked_at: null },
        data: { revoked_at: new Date() },
      });
      const ids = await this.sessions.revokeAllForUser(tx, userId);
      await tx.account_lifecycle_events.create({
        data: { user_id: userId, event_type: 'MFA_RESET', performed_by_id: actorId, reason: body.reason },
      });
      await this.audit.logInTransaction(tx, {
        action: AuditAction.MFA_CHANGE,
        actorId,
        entityType: 'user',
        entityId: userId,
        moduleId: 'MOD-49',
        newValues: { change: 'ADMIN_MFA_RESET', reason: body.reason, sessionsRevoked: ids.length },
      });
      return ids;
    });
    await this.sessions.markRevoked(revokedIds);
    return { message: 'MFA enrollment reset' };
  }

  async revokeSessions(userId: string, body: { reason: string }, actorId: string) {
    this.validateReason(body.reason);
    await this.ensureTarget(userId, actorId);
    const revokedIds = await this.prisma.$transaction(async (tx) => {
      const ids = await this.sessions.revokeAllForUser(tx, userId);
      await tx.account_lifecycle_events.create({
        data: { user_id: userId, event_type: 'SESSIONS_REVOKED', performed_by_id: actorId, reason: body.reason },
      });
      await this.audit.logInTransaction(tx, {
        action: AuditAction.SESSION_REVOKED,
        actorId,
        entityType: 'user',
        entityId: userId,
        moduleId: 'MOD-49',
        newValues: { reason: body.reason, sessionsRevoked: ids.length },
      });
      return ids;
    });
    await this.sessions.markRevoked(revokedIds);
    return { sessionsRevoked: revokedIds.length };
  }

  /**
   * Changes a user's role. Not on your own account (an administrator can't lock
   * themselves out). Every session ends, so the next sign-in carries the new role
   * instead of the old one lingering in a live access token.
   */
  async changeRole(userId: string, newRole: string, actorId: string) {
    const user = await this.ensureTarget(userId, actorId);
    if (user.role === newRole) return user;
    const { updated, revokedIds } = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id: userId },
        data: { role: newRole as any },
      });
      await tx.account_lifecycle_events.create({
        data: {
          user_id: userId,
          event_type: 'ROLE_CHANGE',
          performed_by_id: actorId,
          reason: `Role changed from ${user.role} to ${newRole}`,
        },
      });
      const revokedIds = await this.sessions.revokeAllForUser(tx, userId);
      await this.audit.logInTransaction(tx, {
        action: AuditAction.UPDATE,
        actorId,
        entityType: 'user',
        entityId: userId,
        moduleId: 'MOD-49',
        oldValues: { role: user.role },
        newValues: { role: newRole, sessionsRevoked: revokedIds.length },
      });
      return { updated, revokedIds };
    });
    await this.sessions.markRevoked(revokedIds);
    return updated;
  }

  async activate(userId: string, actorId: string) {
    const user = await this.ensureUser(userId);
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id: userId },
        data: { status: 'ACTIVE' },
      });
      await tx.account_lifecycle_events.create({
        data: { user_id: userId, event_type: 'ACTIVATED', performed_by_id: actorId },
      });
      await this.audit.logInTransaction(tx, {
        action: AuditAction.UPDATE,
        actorId,
        entityType: 'user',
        entityId: userId,
        moduleId: 'MOD-49',
        oldValues: { status: user.status },
        newValues: { status: 'ACTIVE' },
      });
      return updated;
    });
  }

  async deactivate(userId: string, actorId: string) {
    await this.ensureUser(userId);
    const { updated, revokedIds } = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id: userId },
        data: { status: 'DEACTIVATED' },
      });
      await tx.account_lifecycle_events.create({
        data: { user_id: userId, event_type: 'DEACTIVATED', performed_by_id: actorId },
      });
      // Deactivation takes effect now: end every session so refresh tokens stop working.
      const revokedIds = await this.sessions.revokeAllForUser(tx, userId);
      await this.audit.logInTransaction(tx, {
        action: AuditAction.SESSION_REVOKED,
        actorId,
        entityType: 'user',
        entityId: userId,
        moduleId: 'MOD-49',
        newValues: { reason: 'ACCOUNT_DEACTIVATED', sessionsRevoked: revokedIds.length },
      });
      return { updated, revokedIds };
    });
    // After commit: cut live access tokens and sockets, not just refresh.
    await this.sessions.markRevoked(revokedIds);
    return updated;
  }

  /**
   * Only an account with no recorded history can be deleted (for example one created
   * by mistake). Audit rows are append-only and keep their actor, so anyone who has
   * signed in or acted is deactivated instead.
   */
  async deleteUser(userId: string, actorId: string) {
    await this.ensureUser(userId);
    if (userId === actorId) throw new BadRequestException('You cannot delete your own account.');
    const history = await this.prisma.auditLog.count({ where: { actor_id: userId } });
    if (history > 0) {
      throw new ConflictException('This account has audit history and cannot be deleted. Deactivate it instead.');
    }
    try {
      await this.prisma.user.delete({ where: { id: userId } });
    } catch (error) {
      // Other records (incidents, dispatches, handovers…) still point at the account.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
        throw new ConflictException('This account is linked to operational records and cannot be deleted. Deactivate it instead.');
      }
      throw error;
    }
    await this.audit.log({
      action: AuditAction.DELETE,
      actorId,
      entityType: 'user',
      entityId: userId,
      moduleId: 'MOD-49',
    });
  }

  async getConfig() {
    return this.prisma.system_configurations.findMany({
      where: { is_sensitive: false },
    });
  }

  async upsertConfig(key: string, value: unknown, userId: string) {
    const before = await this.prisma.system_configurations.findUnique({ where: { config_key: key } });
    const saved = await this.prisma.system_configurations.upsert({
      where: { config_key: key },
      create: {
        config_key: key,
        config_value: value as any,
        updated_by_id: userId,
      },
      update: { config_value: value as any, updated_by_id: userId },
    });
    // Sensitive values are recorded as changed, never copied into the audit trail.
    const shown = (v: unknown) => (before?.is_sensitive || saved.is_sensitive ? '[sensitive]' : v);
    await this.audit.log({
      action: before ? AuditAction.UPDATE : AuditAction.CREATE,
      actorId: userId,
      entityType: 'system_configuration',
      entityId: saved.id,
      moduleId: 'MOD-49',
      ...(before && { oldValues: { key, value: shown(before.config_value) } }),
      newValues: { key, value: shown(saved.config_value) },
    });
    return saved;
  }

  private async ensureUser(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  private async ensureTarget(userId: string, actorId: string) {
    if (userId === actorId) throw new ConflictException('You cannot perform this action on your own account');
    return this.ensureUser(userId);
  }

  private validateReason(reason: string) {
    if (typeof reason !== 'string' || reason.trim().length < 10) {
      throw new BadRequestException('A reason of at least 10 characters is required');
    }
  }

  private generateTemporaryPassword(): string {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*';
    let password = '';
    for (let i = 0; i < 14; i++) password += alphabet[crypto.randomInt(alphabet.length)];
    return password;
  }
}
