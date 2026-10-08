import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { Prisma } from '@prisma/client';
import { UserRole } from '@agap/shared';

const SAFE_USER_SELECT = {
  id: true,
  full_name: true,
  email: true,
  phone_number: true,
  role: true,
  status: true,
  is_guest: true,
  is_email_verified: true,
  is_phone_verified: true,
  barangay: true,
  municipality: true,
  province: true,
  full_address: true,
  preferred_language: true,
  text_size: true,
  high_contrast: true,
  reduced_motion: true,
  profile_completeness: true,
  last_login_at: true,
  created_at: true,
} satisfies Prisma.UserSelect;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: SAFE_USER_SELECT,
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async updateMe(userId: string, dto: UpdateProfileDto) {
    await this.ensureExists(userId);
    return this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(dto.fullName !== undefined && { full_name: dto.fullName }),
        ...(dto.barangay !== undefined && { barangay: dto.barangay }),
        ...(dto.preferredLanguage !== undefined && {
          preferred_language: dto.preferredLanguage,
        }),
        ...(dto.fullAddress !== undefined && { full_address: dto.fullAddress }),
        ...(dto.textSize !== undefined && { text_size: dto.textSize }),
        ...(dto.highContrast !== undefined && { high_contrast: dto.highContrast }),
        ...(dto.reducedMotion !== undefined && { reduced_motion: dto.reducedMotion }),
      },
      select: SAFE_USER_SELECT,
    });
  }

  async deleteMe(userId: string) {
    await this.ensureExists(userId);
    await this.prisma.user.update({
      where: { id: userId },
      data: { status: 'DEACTIVATED' },
    });
  }

  async getReadiness(_userId: string) {
    // Mobile app manages OS permissions; backend returns a placeholder snapshot.
    return {
      hasGpsPermission: true,
      hasNotificationPermission: true,
      hasMotionPermission: true,
    };
  }

  async findById(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: SAFE_USER_SELECT,
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async findAll(params: { page?: number; perPage?: number; role?: UserRole }) {
    const page = params.page ?? 1;
    const perPage = Math.min(params.perPage ?? 20, 100);
    const skip = (page - 1) * perPage;

    const where: Prisma.UserWhereInput = {};
    if (params.role) where.role = params.role as any;

    const [data, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        select: SAFE_USER_SELECT,
        orderBy: { created_at: 'desc' },
        skip,
        take: perPage,
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      data,
      meta: { total, page, perPage, totalPages: Math.ceil(total / perPage) },
    };
  }

  private async ensureExists(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }
}
