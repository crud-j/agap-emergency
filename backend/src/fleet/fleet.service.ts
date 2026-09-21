import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { CreateVehicleDto } from './dto/create-vehicle.dto';

@Injectable()
export class FleetService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    return this.prisma.vehicle.findMany({
      where: { is_active: true },
      include: { organizations: { select: { id: true, name: true } } },
      orderBy: { created_at: 'desc' },
    });
  }

  async findById(id: string) {
    const vehicle = await this.prisma.vehicle.findUnique({ where: { id } });
    if (!vehicle) throw new NotFoundException('Vehicle not found');
    return vehicle;
  }

  async create(dto: CreateVehicleDto) {
    return this.prisma.vehicle.create({
      data: {
        organization_id: dto.organizationId,
        plate_number: dto.plateNumber ?? null,
        unit_code: dto.unitCode ?? null,
        resource_type: dto.resourceType as any,
        make: dto.make ?? null,
        model: dto.model ?? null,
        year: dto.year ?? null,
        capacity_persons: dto.capacityPersons ?? null,
      },
    });
  }

  async update(id: string, dto: Partial<CreateVehicleDto>) {
    await this.findById(id);
    return this.prisma.vehicle.update({
      where: { id },
      data: {
        ...(dto.plateNumber !== undefined && { plate_number: dto.plateNumber }),
        ...(dto.unitCode !== undefined && { unit_code: dto.unitCode }),
        ...(dto.resourceType !== undefined && { resource_type: dto.resourceType as any }),
        ...(dto.make !== undefined && { make: dto.make }),
        ...(dto.model !== undefined && { model: dto.model }),
        ...(dto.year !== undefined && { year: dto.year }),
        ...(dto.capacityPersons !== undefined && { capacity_persons: dto.capacityPersons }),
      },
    });
  }

  async activate(id: string) {
    await this.findById(id);
    return this.prisma.vehicle.update({ where: { id }, data: { is_active: true } });
  }

  async deactivate(id: string) {
    await this.findById(id);
    return this.prisma.vehicle.update({ where: { id }, data: { is_active: false } });
  }
}
