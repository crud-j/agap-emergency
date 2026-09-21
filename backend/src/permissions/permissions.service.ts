import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { UserRole } from '@agap/shared';

@Injectable()
export class PermissionsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    return this.prisma.permissions.findMany({ orderBy: { name: 'asc' } });
  }

  async findByRole(role: UserRole) {
    return this.prisma.role_permissions.findMany({
      where: { role: role as any },
      include: { permissions: true },
    });
  }

  async grantToRole(role: UserRole, permissionId: string) {
    const existing = await this.prisma.role_permissions.findFirst({
      where: { role: role as any, permission_id: permissionId },
    });
    if (existing) throw new BadRequestException('Permission already granted to role');
    return this.prisma.role_permissions.create({
      data: { role: role as any, permission_id: permissionId },
    });
  }

  async revokeFromRole(role: UserRole, permissionId: string) {
    await this.prisma.role_permissions.deleteMany({
      where: { role: role as any, permission_id: permissionId },
    });
  }
}
