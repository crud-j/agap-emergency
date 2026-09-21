import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';

@Injectable()
export class CommunicationsService {
  constructor(private readonly prisma: PrismaService) {}

  async getMessages(incidentId: string, _userId: string) {
    return this.prisma.incident_messages.findMany({
      where: { incident_id: incidentId, is_deleted: false },
      orderBy: { sent_at: 'asc' },
    });
  }

  async sendMessage(
    incidentId: string,
    dto: { messageText: string; attachmentId?: string },
    userId: string,
  ) {
    return this.prisma.incident_messages.create({
      data: {
        incident_id: incidentId,
        sender_id: userId,
        message_text: dto.messageText,
        attachment_id: dto.attachmentId ?? null,
      },
    });
  }

  async markRead(messageId: string, userId: string) {
    const message = await this.prisma.incident_messages.findUnique({
      where: { id: messageId },
    });
    if (!message) throw new NotFoundException('Message not found');
    return this.prisma.message_reads.upsert({
      where: { message_id_user_id: { message_id: messageId, user_id: userId } },
      create: { message_id: messageId, user_id: userId },
      update: { read_at: new Date() },
    });
  }
}
