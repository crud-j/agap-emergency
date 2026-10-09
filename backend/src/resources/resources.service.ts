import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateResourceDto } from './dto/create-resource.dto';
import { UpdateResourceStatusDto } from './dto/update-resource-status.dto';
import { ResourceRequestDto } from './dto/resource-request.dto';
import { AuditAction } from '@agap/shared';
import { Prisma } from '@prisma/client';

@Injectable()
export class ResourcesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

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
    const available = await this.prisma.resources.findMany({
      where: { status: 'AVAILABLE', is_active: true },
      orderBy: { created_at: 'asc' },
      take: 10,
    });
    return available.map((r, i) => ({ rank: i + 1, resource: r }));
  }

  // ── MOD-35 Mutual Aid Resource Requests ──────────────────────────────────────

  async listRequests(params: { incidentId?: string; orgId?: string; status?: string }) {
    const where: Prisma.ResourceRequestWhereInput = {};
    if (params.incidentId) where.incident_id = params.incidentId;
    if (params.status) where.status = params.status as any;
    if (params.orgId) {
      where.OR = [
        { requesting_org_id: params.orgId },
        { providing_org_id: params.orgId },
      ];
    }
    return this.prisma.resourceRequest.findMany({
      where,
      orderBy: { requested_at: 'desc' },
      include: {
        organizations_resource_requests_requesting_org_idToorganizations: {
          select: { id: true, name: true, short_name: true },
        },
        organizations_resource_requests_providing_org_idToorganizations: {
          select: { id: true, name: true, short_name: true },
        },
      },
    });
  }

  async createRequest(dto: ResourceRequestDto, requestingOrgId: string, actorId?: string) {
    const request = await this.prisma.resourceRequest.create({
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

    void this.audit.log({
      action: AuditAction.CREATE,
      ...(actorId && { actorId }),
      entityType: 'resource_request',
      entityId: request.id,
      moduleId: 'MOD-35',
      incidentId: dto.incidentId,
      newValues: {
        requesting_org_id: requestingOrgId,
        resource_type: dto.resourceType,
        quantity: request.quantity,
        priority: String(request.priority),
      },
    });

    return request;
  }

  async respondToRequest(
    requestId: string,
    accept: boolean,
    notes?: string,
    actorId?: string,
    providingOrgId?: string,
  ) {
    const request = await this.prisma.resourceRequest.findUnique({
      where: { id: requestId },
    });
    if (!request) throw new NotFoundException('Resource request not found');

    const newStatus = accept ? 'ACCEPTED' : 'REJECTED';
    const updated = await this.prisma.resourceRequest.update({
      where: { id: requestId },
      data: {
        status: newStatus as any,
        response_notes: notes ?? null,
        ...(providingOrgId && { providing_org_id: providingOrgId }),
        ...(accept && { fulfilled_at: new Date() }),
      },
    });

    void this.audit.log({
      action: AuditAction.UPDATE,
      ...(actorId && { actorId }),
      entityType: 'resource_request',
      entityId: requestId,
      moduleId: 'MOD-35',
      incidentId: request.incident_id,
      oldValues: { status: String(request.status) },
      newValues: { status: newStatus, response_notes: notes ?? null },
    });

    return updated;
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
