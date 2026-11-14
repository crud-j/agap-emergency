import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { CreateMedicalProfileDto } from './dto/create-medical-profile.dto';
import { UpdateMedicalProfileDto } from './dto/update-medical-profile.dto';
import { MedicalCryptoService } from './medical-crypto.service';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '@agap/shared';
import { MEDICAL_CONSENT_TYPE as CONSENT_TYPE, findSharedReporterProfile } from './patient-medical-access';

const NO_SHARED_PROFILE = 'No medical information has been shared for this patient.';

@Injectable()
export class MedicalProfilesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: MedicalCryptoService,
    private readonly audit?: AuditService,
  ) {}

  async findMine(userId: string) {
    const profile = await this.prisma.medicalProfile.findUnique({
      where: { user_id: userId },
    });
    if (!profile) throw new NotFoundException('No medical profile found');
    return this.crypto.openProfile(profile);
  }

  async create(userId: string, dto: CreateMedicalProfileDto) {
    const consent = await this.prisma.consent_records.findFirst({
      where: { user_id: userId, consent_type: CONSENT_TYPE, status: 'GRANTED' },
      orderBy: { granted_at: 'desc' },
    });
    if (!consent) {
      throw new BadRequestException(
        'Medical data consent must be granted before creating a profile',
      );
    }

    const existing = await this.prisma.medicalProfile.findUnique({
      where: { user_id: userId },
    });
    if (existing) throw new BadRequestException('Medical profile already exists');

    const created = await this.prisma.medicalProfile.create({
      data: {
        user_id: userId,
        consent_record_id: consent.id,
        ...this.crypto.sealFields(userId, {
          blood_type: dto.bloodType ?? null,
          allergies: dto.allergies ?? [],
          current_medications: dto.currentMedications ?? [],
          medical_conditions: dto.medicalConditions ?? [],
          disabilities: dto.disabilities ?? [],
          responder_notes: dto.responderNotes ?? null,
        }),
      },
    });
    return this.crypto.openProfile(created);
  }

  async update(userId: string, dto: UpdateMedicalProfileDto) {
    const current = await this.findMine(userId);
    const updated = await this.prisma.medicalProfile.update({
      where: { user_id: userId },
      data: {
        // Re-seal every field, so a profile saved before encryption is fully sealed
        // by its first edit, not only the fields that changed.
        ...this.crypto.sealFields(userId, {
          blood_type: dto.bloodType !== undefined ? dto.bloodType : current.blood_type,
          allergies: dto.allergies ?? current.allergies,
          current_medications: dto.currentMedications ?? current.current_medications,
          medical_conditions: dto.medicalConditions ?? current.medical_conditions,
          disabilities: dto.disabilities ?? current.disabilities,
          responder_notes: dto.responderNotes !== undefined ? dto.responderNotes : current.responder_notes,
        }),
        last_reviewed_at: new Date(),
        updated_at: new Date(),
      },
    });
    return this.crypto.openProfile(updated);
  }

  async deleteMine(userId: string) {
    const profile = await this.prisma.medicalProfile.findUnique({
      where: { user_id: userId },
    });
    if (!profile) throw new NotFoundException('No medical profile found');

    await this.prisma.$transaction([
      this.prisma.medicalProfile.delete({ where: { user_id: userId } }),
      this.prisma.consent_records.updateMany({
        where: { user_id: userId, consent_type: CONSENT_TYPE, status: 'GRANTED' },
        data: { status: 'WITHDRAWN', withdrawn_at: new Date() },
      }),
    ]);
  }

  /**
   * The patient's medical profile for the crew of one assignment (MOD-32 / MOD-48).
   * Only a crew member on that dispatch, after accepting it, and only when the
   * reporter said they themselves need help (see findSharedReporterProfile). Every
   * read is written to the citizen's access log (with the incident) and the audit trail.
   */
  async findForAssignment(dispatchId: string, actor: { id: string; role: string }) {
    const dispatch = await this.prisma.dispatches.findFirst({
      where: { id: dispatchId, status: 'ACCEPTED', dispatch_crew: { some: { user_id: actor.id } } },
      select: { incident_id: true, incidents: { select: { public_reference: true } } },
    });
    if (!dispatch) {
      void this.audit?.log({
        action: AuditAction.PERMISSION_DENIED,
        actorId: actor.id,
        actorRole: actor.role,
        entityType: 'medical_profile',
        entityId: dispatchId,
        moduleId: 'MOD-48',
        newValues: { reason: 'NOT_ACCEPTED_CREW_ON_DISPATCH', dispatchId },
      });
      throw new ForbiddenException("Only the crew of an accepted assignment can see the patient's medical information.");
    }

    const shared = await findSharedReporterProfile(this.prisma, dispatch.incident_id);
    if (!shared) throw new NotFoundException(NO_SHARED_PROFILE);
    const profile = await this.prisma.medicalProfile.findUnique({ where: { id: shared.profileId } });
    if (!profile) throw new NotFoundException(NO_SHARED_PROFILE);

    const reference = dispatch.incidents.public_reference;
    // Least-privilege: every sensitive read is logged before the data leaves.
    await this.prisma.sensitive_data_access_log.create({
      data: {
        accessor_id: actor.id,
        data_type: 'MEDICAL_PROFILE',
        entity_id: profile.id,
        incident_id: dispatch.incident_id,
        purpose: `Patient care by the assigned crew, ${reference}`,
      },
    });
    void this.audit?.log({
      action: AuditAction.READ,
      actorId: actor.id,
      actorRole: actor.role,
      entityType: 'medical_profile',
      entityId: profile.id,
      moduleId: 'MOD-48',
      incidentId: dispatch.incident_id,
      newValues: { dispatchId },
    });

    const open = this.crypto.openProfile(profile);
    // Medical fields only: no internal ids, no consent record.
    return {
      source: 'REPORTER_SELF_REPORTED' as const,
      blood_type: open.blood_type,
      allergies: open.allergies,
      current_medications: open.current_medications,
      medical_conditions: open.medical_conditions,
      disabilities: open.disabilities,
      responder_notes: open.responder_notes,
      last_reviewed_at: open.last_reviewed_at,
      updated_at: open.updated_at,
    };
  }
}
