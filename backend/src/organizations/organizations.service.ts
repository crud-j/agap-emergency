import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { AddMemberDto } from './dto/add-member.dto';

@Injectable()
export class OrganizationsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    return this.prisma.organization.findMany({
      where: { is_active: true },
      orderBy: { name: 'asc' },
    });
  }

  async findById(id: string) {
    const org = await this.prisma.organization.findUnique({
      where: { id },
      include: { organization_memberships: true },
    });
    if (!org) throw new NotFoundException('Organization not found');
    return org;
  }

  async create(dto: CreateOrganizationDto) {
    return this.prisma.organization.create({
      data: {
        name: dto.name,
        short_name: dto.shortName ?? null,
        organization_type: dto.organizationType as any,
        barangay: dto.barangay ?? null,
        contact_number: dto.contactNumber ?? null,
        email: dto.email ?? null,
        address: dto.address ?? null,
      },
    });
  }

  async update(id: string, dto: Partial<CreateOrganizationDto>) {
    await this.findById(id);
    return this.prisma.organization.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.shortName !== undefined && { short_name: dto.shortName }),
        ...(dto.organizationType !== undefined && {
          organization_type: dto.organizationType as any,
        }),
        ...(dto.barangay !== undefined && { barangay: dto.barangay }),
        ...(dto.contactNumber !== undefined && { contact_number: dto.contactNumber }),
        ...(dto.email !== undefined && { email: dto.email }),
        ...(dto.address !== undefined && { address: dto.address }),
      },
    });
  }

  async findMembers(orgId: string) {
    await this.findById(orgId);
    return this.prisma.organization_memberships.findMany({
      where: { organization_id: orgId, is_active: true },
      include: { users: { select: { id: true, full_name: true, role: true } } },
    });
  }

  async addMember(orgId: string, dto: AddMemberDto) {
    await this.findById(orgId);
    const existing = await this.prisma.organization_memberships.findFirst({
      where: { organization_id: orgId, user_id: dto.userId },
    });
    if (existing) throw new BadRequestException('User is already a member');
    return this.prisma.organization_memberships.create({
      data: {
        organization_id: orgId,
        user_id: dto.userId,
        position: dto.position ?? null,
      },
    });
  }

  async removeMember(orgId: string, userId: string) {
    await this.prisma.organization_memberships.deleteMany({
      where: { organization_id: orgId, user_id: userId },
    });
  }
}
