import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { MedicalCryptoService } from '../medical-profiles/medical-crypto.service';

@Injectable()
export class PrivacyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly medicalCrypto: MedicalCryptoService,
  ) {}

  /**
   * MOD-48 — who opened this citizen's sensitive data (today: their medical profile),
   * newest first. Shows the accessor's role, never their name.
   */
  async getAccessLog(userId: string) {
    const profile = await this.prisma.medicalProfile.findUnique({
      where: { user_id: userId },
      select: { id: true },
    });
    const entityIds = [userId, ...(profile ? [profile.id] : [])];
    const rows = await this.prisma.sensitive_data_access_log.findMany({
      where: { entity_id: { in: entityIds } },
      orderBy: { accessed_at: 'desc' },
      take: 200,
      include: { users: { select: { role: true } } },
    });
    return rows.map(({ users, accessor_id: _accessor, ...row }) => ({ ...row, accessor_role: users.role }));
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
    const { password_hash: _, medical_profiles, ...safe } = user;
    // The export is for the owner, so medical fields are returned readable.
    return {
      exportedAt: new Date().toISOString(),
      data: { ...safe, medical_profiles: medical_profiles && this.medicalCrypto.openProfile(medical_profiles) },
    };
  }
}
