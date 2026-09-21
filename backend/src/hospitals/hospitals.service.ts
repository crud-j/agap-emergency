import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { CreateHospitalDto } from './dto/create-hospital.dto';
import { CreateReferralDto } from './dto/create-referral.dto';

@Injectable()
export class HospitalsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    return this.prisma.facility.findMany({
      where: { facility_type: 'HOSPITAL', is_active: true },
      orderBy: { name: 'asc' },
    });
  }

  async findNearby(_lat: number, _lng: number) {
    // Placeholder — PostGIS distance ordering is a later step.
    return this.prisma.facility.findMany({
      where: { facility_type: 'HOSPITAL', is_active: true },
      orderBy: { name: 'asc' },
      take: 10,
    });
  }

  async findById(id: string) {
    const facility = await this.prisma.facility.findUnique({
      where: { id },
      include: { facility_capabilities: true },
    });
    if (!facility) throw new NotFoundException('Hospital not found');
    return facility;
  }

  async create(dto: CreateHospitalDto) {
    return this.prisma.facility.create({
      data: {
        name: dto.name,
        facility_type: 'HOSPITAL',
        barangay: dto.barangay ?? null,
        municipality: dto.municipality ?? null,
        contact_number: dto.contactNumber ?? null,
        emergency_contact: dto.emergencyContact ?? null,
        has_emergency_room: dto.hasEmergencyRoom ?? false,
        has_icu: dto.hasIcu ?? false,
        blood_bank: dto.bloodBank ?? false,
      },
    });
  }

  async update(id: string, dto: Partial<CreateHospitalDto>) {
    await this.findById(id);
    return this.prisma.facility.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.barangay !== undefined && { barangay: dto.barangay }),
        ...(dto.municipality !== undefined && { municipality: dto.municipality }),
        ...(dto.contactNumber !== undefined && { contact_number: dto.contactNumber }),
        ...(dto.emergencyContact !== undefined && {
          emergency_contact: dto.emergencyContact,
        }),
        ...(dto.hasEmergencyRoom !== undefined && {
          has_emergency_room: dto.hasEmergencyRoom,
        }),
        ...(dto.hasIcu !== undefined && { has_icu: dto.hasIcu }),
        ...(dto.bloodBank !== undefined && { blood_bank: dto.bloodBank }),
      },
    });
  }

  async createReferral(
    hospitalId: string,
    incidentId: string,
    dto: CreateReferralDto,
    userId: string,
  ) {
    await this.findById(hospitalId);
    return this.prisma.facility_referrals.create({
      data: {
        facility_id: hospitalId,
        incident_id: incidentId,
        dispatch_id: dto.dispatchId ?? null,
        patient_id: dto.patientId ?? null,
        coordinated_by_id: userId,
        pre_arrival_notes: dto.preArrivalNotes ?? null,
        eta_minutes: dto.etaMinutes ?? null,
      },
    });
  }

  async findReferrals(hospitalId: string) {
    return this.prisma.facility_referrals.findMany({
      where: { facility_id: hospitalId },
      orderBy: { created_at: 'desc' },
    });
  }

  async findReferral(refId: string) {
    const referral = await this.prisma.facility_referrals.findUnique({
      where: { id: refId },
    });
    if (!referral) throw new NotFoundException('Referral not found');
    return referral;
  }

  async acknowledgeReferral(refId: string, _userId: string) {
    await this.findReferral(refId);
    return this.prisma.facility_referrals.update({
      where: { id: refId },
      data: { acknowledgment_status: 'ACKNOWLEDGED', acknowledged_at: new Date() },
    });
  }

  async markArrived(refId: string, _userId: string) {
    await this.findReferral(refId);
    return this.prisma.facility_referrals.update({
      where: { id: refId },
      data: { patient_arrived_at: new Date() },
    });
  }
}
