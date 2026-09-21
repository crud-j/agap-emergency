import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { CreateResourceDto } from './dto/create-resource.dto';
import { UpdateResourceStatusDto } from './dto/update-resource-status.dto';
import { ResourceRequestDto } from './dto/resource-request.dto';
import { Prisma } from '@prisma/client';

@Injectable()
export class ResourcesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(filters: { status?: string; type?: string; orgId?: string }) {
    const where: Prisma.resourcesWhereInput = { is_active: true };
    if (filters.status) where.status = filters.status as any;
    if (filters.type) where.resource_type = filters.type as any;
    if (filters.orgId) where.organization_id = filters.orgId;
    return this.prisma.resources.findMany({
      where,
      orderBy: { created_at: 'desc' },
    });
  }

  async findAvailable() {
    return this.prisma.resources.findMany({
      where: { status: 'AVAILABLE', is_active: true },
      orderBy: { created_at: 'asc' },
    });
  }

  async findById(id: string) {
    const resource = await this.prisma.resources.findUnique({
      where: { id },
      include: {
        resource_capability_assignments: { include: { resource_capabilities: true } },
      },
    });
    if (!resource) throw new NotFoundException('Resource not found');
    return resource;
  }

  async create(dto: CreateResourceDto) {
    return this.prisma.resources.create({
      data: {
        organization_id: dto.organizationId,
        name: dto.name,
        call_sign: dto.callSign ?? null,
        resource_type: dto.resourceType as any,
        vehicle_id: dto.vehicleId ?? null,
      },
    });
  }

  async update(id: string, dto: Partial<CreateResourceDto>) {
    await this.findById(id);
    return this.prisma.resources.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.callSign !== undefined && { call_sign: dto.callSign }),
        ...(dto.resourceType !== undefined && { resource_type: dto.resourceType as any }),
        ...(dto.vehicleId !== undefined && { vehicle_id: dto.vehicleId }),
      },
    });
  }

  async updateStatus(id: string, dto: UpdateResourceStatusDto, userId: string) {
    const resource = await this.findById(id);
    const [, updated] = await this.prisma.$transaction([
      this.prisma.resource_status_log.create({
        data: {
          resource_id: id,
          from_status: resource.status,
          to_status: dto.status as any,
          changed_by_id: userId,
        },
      }),
      this.prisma.resources.update({
        where: { id },
        data: { status: dto.status as any },
      }),
    ]);
    return updated;
  }

  async addCapability(resourceId: string, capabilityId: string) {
    await this.findById(resourceId);
    const existing = await this.prisma.resource_capability_assignments.findFirst({
      where: { resource_id: resourceId, capability_id: capabilityId },
    });
    if (existing) throw new BadRequestException('Capability already assigned');
    return this.prisma.resource_capability_assignments.create({
      data: { resource_id: resourceId, capability_id: capabilityId },
    });
  }

  async removeCapability(resourceId: string, capabilityId: string) {
    await this.prisma.resource_capability_assignments.deleteMany({
      where: { resource_id: resourceId, capability_id: capabilityId },
    });
  }

  async recommend(incidentId: string) {
    const incident = await this.prisma.incident.findUnique({ where: { id: incidentId } });
    if (!incident) throw new NotFoundException('Incident not found');
    // Placeholder ranking; real PostGIS distance scoring is a later step.
    const available = await this.prisma.resources.findMany({
      where: { status: 'AVAILABLE', is_active: true },
      orderBy: { created_at: 'asc' },
      take: 10,
    });
    return available.map((r, i) => ({ rank: i + 1, resource: r }));
  }

  async createRequest(dto: ResourceRequestDto, requestingOrgId: string) {
    return this.prisma.resourceRequest.create({
      data: {
        incident_id: dto.incidentId,
        requesting_org_id: requestingOrgId,
        resource_type: dto.resourceType as any,
        quantity: dto.quantity ?? 1,
        capability_needed: dto.capabilityNeeded ?? [],
        priority: (dto.priority ?? 'HIGH') as any,
        request_notes: dto.requestNotes ?? null,
      },
    });
  }

  async respondToRequest(requestId: string, accept: boolean, notes?: string) {
    const request = await this.prisma.resourceRequest.findUnique({
      where: { id: requestId },
    });
    if (!request) throw new NotFoundException('Resource request not found');
    return this.prisma.resourceRequest.update({
      where: { id: requestId },
      data: {
        status: accept ? 'ACCEPTED' : 'REJECTED',
        response_notes: notes ?? null,
        ...(accept && { fulfilled_at: new Date() }),
      },
    });
  }

  /** Resolve the actor's primary organization for outbound resource requests. */
  async resolveOrgForUser(userId: string): Promise<string> {
    const membership = await this.prisma.organization_memberships.findFirst({
      where: { user_id: userId, is_active: true },
    });
    if (!membership) {
      throw new BadRequestException('Actor is not a member of any organization');
    }
    return membership.organization_id;
  }
}
