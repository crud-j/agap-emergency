import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';

@Injectable()
export class FacilitiesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    return this.prisma.facility.findMany({
      where: { is_active: true },
      orderBy: { name: 'asc' },
    });
  }

  async findById(id: string) {
    const facility = await this.prisma.facility.findUnique({
      where: { id },
      include: { facility_capabilities: true },
    });
    if (!facility) throw new NotFoundException('Facility not found');
    return facility;
  }

  async create(dto: {
    name: string;
    facilityType: string;
    barangay?: string;
    municipality?: string;
    contactNumber?: string;
    isEvacuationCenter?: boolean;
  }) {
    return this.prisma.facility.create({
      data: {
        name: dto.name,
        facility_type: dto.facilityType as any,
        barangay: dto.barangay ?? null,
        municipality: dto.municipality ?? null,
        contact_number: dto.contactNumber ?? null,
        is_evacuation_center: dto.isEvacuationCenter ?? false,
      },
    });
  }

  async updateStatus(
    id: string,
    dto: { receivingStatus?: string; capacityAvailable?: number },
  ) {
    await this.findById(id);
    return this.prisma.facility.update({
      where: { id },
      data: {
        ...(dto.receivingStatus !== undefined && {
          receiving_status: dto.receivingStatus as any,
        }),
        ...(dto.capacityAvailable !== undefined && {
          capacity_available: dto.capacityAvailable,
        }),
      },
    });
  }
}
