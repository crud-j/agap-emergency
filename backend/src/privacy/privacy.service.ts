import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';

@Injectable()
export class PrivacyService {
  constructor(private readonly prisma: PrismaService) {}

  async getAccessLog(userId: string) {
    return this.prisma.sensitive_data_access_log.findMany({
      where: { accessor_id: userId },
      orderBy: { accessed_at: 'desc' },
      take: 200,
    });
  }

  async exportData(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        emergency_contacts: true,
        medical_profiles: true,
        consent_records: true,
        incident_reporters: true,
      },
    });
    if (!user) throw new NotFoundException('User not found');
    const { password_hash: _, ...safe } = user;
    return { exportedAt: new Date().toISOString(), data: safe };
  }
}
