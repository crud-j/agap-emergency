import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { CreateConsentDto } from './dto/create-consent.dto';

@Injectable()
export class ConsentService {
  constructor(private readonly prisma: PrismaService) {}

  async grantConsent(userId: string, dto: CreateConsentDto) {
    return this.prisma.consent_records.create({
      data: {
        user_id: userId,
        consent_type: dto.consentType,
        status: 'GRANTED',
        ...(dto.ipAddress !== undefined && { ip_address: dto.ipAddress }),
      },
    });
  }

  async revokeConsent(userId: string, consentType: string) {
    const record = await this.prisma.consent_records.findFirst({
      where: { user_id: userId, consent_type: consentType, status: 'GRANTED' },
      orderBy: { granted_at: 'desc' },
    });
    if (!record) throw new NotFoundException('No active consent found');
    await this.prisma.consent_records.update({
      where: { id: record.id },
      data: { status: 'WITHDRAWN', withdrawn_at: new Date() },
    });
  }

  async checkConsent(userId: string, consentType: string) {
    const record = await this.prisma.consent_records.findFirst({
      where: { user_id: userId, consent_type: consentType, status: 'GRANTED' },
      orderBy: { granted_at: 'desc' },
    });
    return { consentType, granted: !!record, record };
  }
}
