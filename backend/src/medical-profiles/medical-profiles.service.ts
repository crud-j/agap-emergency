import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { CreateMedicalProfileDto } from './dto/create-medical-profile.dto';
import { UpdateMedicalProfileDto } from './dto/update-medical-profile.dto';

const CONSENT_TYPE = 'MEDICAL_PROFILE';

@Injectable()
export class MedicalProfilesService {
  constructor(private readonly prisma: PrismaService) {}

  async findMine(userId: string) {
    const profile = await this.prisma.medicalProfile.findUnique({
      where: { user_id: userId },
    });
    if (!profile) throw new NotFoundException('No medical profile found');
    return profile;
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

    return this.prisma.medicalProfile.create({
      data: {
        user_id: userId,
        consent_record_id: consent.id,
        blood_type: dto.bloodType ?? null,
        allergies: dto.allergies ?? [],
        current_medications: dto.currentMedications ?? [],
        medical_conditions: dto.medicalConditions ?? [],
        disabilities: dto.disabilities ?? [],
        responder_notes: dto.responderNotes ?? null,
      },
    });
  }

  async update(userId: string, dto: UpdateMedicalProfileDto) {
    await this.findMine(userId);
    return this.prisma.medicalProfile.update({
      where: { user_id: userId },
      data: {
        ...(dto.bloodType !== undefined && { blood_type: dto.bloodType }),
        ...(dto.allergies !== undefined && { allergies: dto.allergies }),
        ...(dto.currentMedications !== undefined && {
          current_medications: dto.currentMedications,
        }),
        ...(dto.medicalConditions !== undefined && {
          medical_conditions: dto.medicalConditions,
        }),
        ...(dto.disabilities !== undefined && { disabilities: dto.disabilities }),
        ...(dto.responderNotes !== undefined && { responder_notes: dto.responderNotes }),
        last_reviewed_at: new Date(),
      },
    });
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

    return profile;
  }
}
