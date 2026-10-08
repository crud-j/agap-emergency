import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';

// Operational staff can always participate in an incident's chat.
const DISPATCHER_ROLES = new Set(['DISPATCHER', 'SUPERVISOR', 'SYSTEM_ADMINISTRATOR', 'ORG_ADMINISTRATOR']);

interface IncidentMessageRow {
  id: string;
  incident_id: string;
  sender_id: string;
  message_text: string;
  attachment_id: string | null;
  sent_at: Date;
}

/**
 * Incident-scoped secure communications (MOD-33).
 *
 * Participants only: the reporter, assigned responders (dispatch crew), and
 * operational staff (dispatchers/supervisors/admins). Everyone else is blocked.
 *
 * Identity protection (CLAUDE.md rule 15): messages are returned/emitted with a
 * role-based sender label only — never the reporter's/bystander's personal name
 * or phone. The sender's own UUID is included so a client can mark its own
 * bubbles, but no personal identity ever crosses the wire.
 */
@Injectable()
export class CommunicationsService {
  private readonly logger = new Logger(CommunicationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
  ) {}

  async getMessages(incidentId: string, userId: string) {
    await this.assertParticipant(incidentId, userId);
    const reporterUserId = await this.reporterUserId(incidentId);

    const messages = (await this.prisma.incident_messages.findMany({
      where: { incident_id: incidentId, is_deleted: false },
      orderBy: { sent_at: 'asc' },
    })) as IncidentMessageRow[];

    const senderIds = [...new Set(messages.map((m) => m.sender_id))];
    const users = senderIds.length
      ? await this.prisma.user.findMany({ where: { id: { in: senderIds } }, select: { id: true, role: true } })
      : [];
    const roleById = new Map(users.map((u) => [u.id, u.role as string]));

    return messages.map((m) => this.present(m, roleById.get(m.sender_id) ?? null, reporterUserId));
  }

  async sendMessage(
    incidentId: string,
    dto: { messageText: string; attachmentId?: string },
    userId: string,
  ) {
    const { role } = await this.assertParticipant(incidentId, userId);
    const reporterUserId = await this.reporterUserId(incidentId);

    const created = (await this.prisma.incident_messages.create({
      data: {
        incident_id: incidentId,
        sender_id: userId,
        message_text: dto.messageText,
        attachment_id: dto.attachmentId ?? null,
      },
    })) as IncidentMessageRow;

    const presented = this.present(created, role, reporterUserId);

    // Distribute to the incident room only (best-effort). WS failure never blocks.
    try {
      this.realtime.messageCreated(incidentId, {
        id: presented.id,
        incidentId,
        senderId: presented.sender_id,
        senderRole: presented.sender_role,
        senderLabel: presented.sender_label,
        messageText: presented.message_text,
        attachmentId: presented.attachment_id,
        sentAt: presented.sent_at,
      });
    } catch (err) {
      this.logger.warn(`Realtime emit failed for message.created: ${String(err)}`);
    }

    return presented;
  }

  async markRead(messageId: string, userId: string) {
    const message = await this.prisma.incident_messages.findUnique({
      where: { id: messageId },
    });
    if (!message) throw new NotFoundException('Message not found');
    // Only a participant of the message's incident may mark it read.
    await this.assertParticipant(message.incident_id, userId);
    return this.prisma.message_reads.upsert({
      where: { message_id_user_id: { message_id: messageId, user_id: userId } },
      create: { message_id: messageId, user_id: userId },
      update: { read_at: new Date() },
    });
  }

  // ── Participants ────────────────────────────────────────────────────────────

  /**
   * Throws ForbiddenException unless the user is a participant of the incident:
   * operational staff, the reporter, or an assigned responder (dispatch crew).
   * Returns the requester's role for downstream labelling.
   */
  async assertParticipant(incidentId: string, userId: string): Promise<{ role: string | null }> {
    // Fetch reporter + user role in parallel first.
    const [reporter, user] = await Promise.all([
      this.prisma.incidentReporter.findUnique({
        where: { incident_id: incidentId },
        select: { user_id: true },
      }),
      this.prisma.user.findUnique({ where: { id: userId }, select: { role: true } }),
    ]);

    const role = (user?.role as string) ?? null;
    const isStaff = role != null && DISPATCHER_ROLES.has(role);
    const isReporter = reporter?.user_id != null && reporter.user_id === userId;

    // Staff can always participate — skip the crew lookup entirely.
    if (isStaff || isReporter) return { role };

    // Avoid the nested relation filter (`dispatches: { incident_id }`) which
    // triggers PrismaClientValidationError in Prisma 7 → HTTP 400. Use a
    // 2-step lookup: incident dispatch IDs first, then check crew membership.
    const dispatchIds = await this.prisma.dispatches.findMany({
      where: { incident_id: incidentId },
      select: { id: true },
    });
    const isCrew =
      dispatchIds.length > 0 &&
      (await this.prisma.dispatch_crew.findFirst({
        where: { user_id: userId, dispatch_id: { in: dispatchIds.map((d) => d.id) } },
        select: { id: true },
      })) != null;

    if (!isCrew) {
      throw new ForbiddenException('You are not a participant of this incident');
    }
    return { role };
  }

  private async reporterUserId(incidentId: string): Promise<string | null> {
    const reporter = await this.prisma.incidentReporter.findUnique({
      where: { incident_id: incidentId },
      select: { user_id: true },
    });
    return reporter?.user_id ?? null;
  }

  /**
   * Shape a message row for the wire. Role-based label only — the reporter (who
   * may be a bystander) is always surfaced as "Reporter", never by name.
   */
  private present(m: IncidentMessageRow, senderRole: string | null, reporterUserId: string | null) {
    const { role, label } = this.labelFor(senderRole, m.sender_id, reporterUserId);
    return {
      id: m.id,
      incident_id: m.incident_id,
      sender_id: m.sender_id,
      message_text: m.message_text,
      attachment_id: m.attachment_id,
      sent_at: m.sent_at.toISOString(),
      sender_role: role,
      sender_label: label,
    };
  }

  private labelFor(
    role: string | null,
    senderId: string,
    reporterUserId: string | null,
  ): { role: string; label: string } {
    if (reporterUserId && senderId === reporterUserId) {
      return { role: 'REPORTER', label: 'Reporter' };
    }
    switch (role) {
      case 'DISPATCHER':
        return { role, label: 'Dispatcher' };
      case 'SUPERVISOR':
        return { role, label: 'Supervisor' };
      case 'RESPONDER':
        return { role, label: 'Responder' };
      case 'HOSPITAL_USER':
        return { role, label: 'Hospital' };
      case 'ORG_ADMINISTRATOR':
      case 'SYSTEM_ADMINISTRATOR':
        return { role, label: 'Coordinator' };
      default:
        return { role: role ?? 'UNKNOWN', label: 'Participant' };
    }
  }
}
