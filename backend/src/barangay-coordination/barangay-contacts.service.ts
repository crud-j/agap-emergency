import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditAction, normalizePhPhone } from '@agap/shared';
import { PrismaService } from '../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { ContactRole, CreateBarangayContactDto, UpdateBarangayContactDto } from './dto/barangay-contact.dto';

/** The barangay or contact does not exist. */
export class BarangayContactNotFoundError extends Error {}
/** The change breaks a directory rule (invalid number, duplicate, landline as primary…). */
export class BarangayContactRefusedError extends Error {}

/** Marks numbers added here, so the directory seed never deactivates them. */
export const ADMIN_SOURCE = 'admin';

const CONTACT_SELECT = {
  id: true,
  barangay_id: true,
  phone_e164: true,
  phone_raw: true,
  kind: true,
  can_sms: true,
  role: true,
  label: true,
  is_active: true,
  is_demo: true,
  verified_at: true,
  source: true,
  updated_at: true,
} as const;

type Tx = Prisma.TransactionClient;

/** A contact that gave up its role slot to the one being changed. */
interface MovedContact {
  id: string;
  from: ContactRole;
  to: ContactRole;
}

/**
 * Phase 6 (MOD-34 / MOD-49): MDRRMO keeps the barangay phone directory up to date without
 * a redeploy. The next alert reads the directory fresh, so a change applies at once.
 *
 * Each barangay has at most one active PRIMARY and one active BACKUP (partial unique
 * indexes). Giving a contact a taken slot moves the holder into the contact's old slot,
 * so swapping primary and backup is one action. Numbers are never deleted, only
 * deactivated, so past alerts stay explainable. Every change is audited.
 */
@Injectable()
export class BarangayContactsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** All 19 barangays with every contact, active first, primary first. */
  async listAll() {
    const barangays = await this.prisma.geo_regions.findMany({
      where: { region_type: 'barangay' },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
    const contacts = await this.prisma.barangay_contacts.findMany({
      select: CONTACT_SELECT,
      orderBy: [{ is_active: 'desc' }, { role: 'asc' }, { created_at: 'asc' }],
    });
    return barangays.map((b) => ({ ...b, contacts: contacts.filter((c) => c.barangay_id === b.id) }));
  }

  async create(dto: CreateBarangayContactDto, actorId: string) {
    const barangay = await this.prisma.geo_regions.findFirst({
      where: { id: dto.barangayId, region_type: 'barangay' },
      select: { id: true },
    });
    if (!barangay) throw new BarangayContactNotFoundError('Unknown barangay');

    const phone = normalizePhPhone(dto.phone);
    if (!phone.e164) {
      throw new BarangayContactRefusedError(
        'Not a valid PH number. Use a mobile (09xx xxx xxxx) or a landline with area code (044 xxx xxxx).',
      );
    }
    if (dto.role !== 'OTHER' && !phone.canSms) {
      throw new BarangayContactRefusedError('A landline cannot receive SMS, so it can only be "Other".');
    }

    const existing = await this.prisma.barangay_contacts.findUnique({
      where: { barangay_id_phone_e164: { barangay_id: dto.barangayId, phone_e164: phone.e164 } },
      select: { is_active: true },
    });
    if (existing) {
      throw new BarangayContactRefusedError(
        existing.is_active
          ? 'This number is already on file for this barangay.'
          : 'This number is on file but inactive. Reactivate it instead.',
      );
    }

    const { contact, moved } = await this.prisma.$transaction(async (tx) => {
      // A new contact has no slot to hand over: the current holder becomes "Other".
      const moved = await this.freeSlot(tx, dto.barangayId, dto.role, null, 'OTHER');
      const contact = await tx.barangay_contacts.create({
        data: {
          barangay_id: dto.barangayId,
          phone_e164: phone.e164!,
          phone_raw: dto.phone.trim().slice(0, 40),
          kind: phone.kind === 'MOBILE' ? 'MOBILE' : 'LANDLINE',
          can_sms: phone.canSms,
          role: dto.role,
          label: cleanLabel(dto.label),
          source: ADMIN_SOURCE,
        },
        select: CONTACT_SELECT,
      });
      return { contact, moved };
    });

    await this.audit.log({
      action: AuditAction.CREATE,
      actorId,
      entityType: 'barangay_contact',
      entityId: contact.id,
      moduleId: 'MOD-34',
      newValues: { barangay_id: contact.barangay_id, phone_e164: contact.phone_e164, role: contact.role, label: contact.label },
    });
    await this.auditMoved(moved, actorId);
    return contact;
  }

  async update(id: string, dto: UpdateBarangayContactDto, actorId: string) {
    const { before, contact, moved } = await this.prisma.$transaction(async (tx) => {
      const before = await tx.barangay_contacts.findUnique({ where: { id }, select: CONTACT_SELECT });
      if (!before) throw new BarangayContactNotFoundError('Contact not found');

      const isActive = dto.isActive ?? before.is_active;
      // An inactive number holds no slot, so reactivating never clashes with a newer one.
      const role: ContactRole = isActive ? (dto.role ?? before.role) : 'OTHER';
      if (role !== 'OTHER' && !before.can_sms) {
        throw new BarangayContactRefusedError('A landline cannot receive SMS, so it can only be "Other".');
      }

      let moved: MovedContact | null = null;
      const takesSlot = isActive && role !== 'OTHER' && (role !== before.role || !before.is_active);
      if (takesSlot) {
        const handOver: ContactRole = before.is_active ? before.role : 'OTHER';
        moved = await this.freeSlot(tx, before.barangay_id, role, id, handOver);
      }

      const contact = await tx.barangay_contacts.update({
        where: { id },
        data: {
          role,
          is_active: isActive,
          ...(dto.label !== undefined ? { label: cleanLabel(dto.label) } : {}),
          ...(dto.verified !== undefined ? { verified_at: dto.verified ? new Date() : null } : {}),
          ...(dto.isDemo !== undefined ? { is_demo: dto.isDemo } : {}),
        },
        select: CONTACT_SELECT,
      });
      return { before, contact, moved };
    });

    await this.audit.log({
      action: AuditAction.UPDATE,
      actorId,
      entityType: 'barangay_contact',
      entityId: id,
      moduleId: 'MOD-34',
      oldValues: pickAudited(before),
      newValues: pickAudited(contact),
    });
    await this.auditMoved(moved, actorId);
    return contact;
  }

  /**
   * Frees `role` in this barangay for `takerId` (null for a new contact): the current
   * holder moves to `handOver`. When the holder takes the taker's old slot (a swap), the
   * taker is parked on OTHER first so neither partial unique index is ever violated.
   */
  private async freeSlot(
    tx: Tx,
    barangayId: string,
    role: ContactRole,
    takerId: string | null,
    handOver: ContactRole,
  ): Promise<MovedContact | null> {
    if (role === 'OTHER') return null;
    const holder = await tx.barangay_contacts.findFirst({
      where: { barangay_id: barangayId, role, is_active: true, ...(takerId ? { id: { not: takerId } } : {}) },
      select: { id: true },
    });
    if (!holder) return null;
    if (takerId && handOver !== 'OTHER') {
      await tx.barangay_contacts.update({ where: { id: takerId }, data: { role: 'OTHER' } });
    }
    await tx.barangay_contacts.update({ where: { id: holder.id }, data: { role: handOver } });
    return { id: holder.id, from: role, to: handOver };
  }

  private async auditMoved(moved: MovedContact | null, actorId: string): Promise<void> {
    if (!moved) return;
    await this.audit.log({
      action: AuditAction.UPDATE,
      actorId,
      entityType: 'barangay_contact',
      entityId: moved.id,
      moduleId: 'MOD-34',
      oldValues: { role: moved.from },
      newValues: { role: moved.to, reason: 'slot taken by another contact' },
    });
  }
}

function cleanLabel(label: string | undefined): string | null {
  const t = label?.trim();
  return t ? t.slice(0, 120) : null;
}

function pickAudited(c: { role: string; label: string | null; is_active: boolean; is_demo: boolean; verified_at: Date | null }) {
  return {
    role: c.role,
    label: c.label,
    is_active: c.is_active,
    is_demo: c.is_demo,
    verified_at: c.verified_at?.toISOString() ?? null,
  };
}
