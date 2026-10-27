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

const CONSENT_TYPE = 'MEDICAL_PROFILE';

@Injectable()
export class MedicalProfilesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: MedicalCryptoService,
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

  async findForResponder(targetUserId: string, accessorId: string) {
    const consent = await this.prisma.consent_records.findFirst({
      where: { user_id: targetUserId, consent_type: CONSENT_TYPE, status: 'GRANTED' },
      orderBy: { granted_at: 'desc' },
    });
    if (!consent) {
      throw new ForbiddenException('Patient has not consented to medical data sharing');
    }

    const profile = await this.prisma.medicalProfile.findUnique({
      where: { user_id: targetUserId },
    });
    if (!profile) throw new NotFoundException('No medical profile found');

    // Least-privilege: log every sensitive-data access.
    await this.prisma.sensitive_data_access_log.create({
      data: {
        accessor_id: accessorId,
        data_type: 'MEDICAL_PROFILE',
        entity_id: profile.id,
        purpose: 'Responder incident access',
      },
    });

    return this.crypto.openProfile(profile);
  }
}
