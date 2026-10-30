import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditAction } from '@agap/shared';
import { PrismaService } from '../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  BarangayCallbackNotFoundError,
  BarangayCallbackRefusedError,
  BarangayCallbackService,
} from '../barangay-coordination/barangay-callback.service';
import { NOTICE_INCLUDE } from '../barangay-coordination/barangay-link.service';
import { BarangayReplySchema } from './prompts/barangay-reply.prompt';
import { BARANGAY_SMS_SUBJECT } from './ai-assist.jobs';

export interface SuggestionActor {
  id: string;
  role: string;
}

/** What the drawer shows: the barangay's own words, Gemini's reading and the row status. */
export interface AiSuggestionView {
  id: string;
  kind: string;
  status: 'PENDING_REVIEW' | 'INFO';
  createdAt: string;
  reading: { status: string; confidence: number; english: string } | null;
  sourceText: string | null;
  receivedAt: string | null;
}

/**
 * AI Assist suggestions (AI_ASSIST_PLAN Phase 1/2). A suggestion changes nothing until a
 * Dispatcher or Supervisor accepts it, and then only through the same path as the
 * barangay's own SMS reply (BarangayCallbackService.reportBySms): incident status is never
 * touched, and NEEDS_BACKUP raises the usual supervisor escalation. Accept and dismiss are
 * audited (MOD-46) with the actor.
 */
@Injectable()
export class AiSuggestionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly callbacks: BarangayCallbackService,
  ) {}

  /** Open suggestions for the incident (review or information only), newest first. */
  async listForIncident(incidentId: string): Promise<AiSuggestionView[]> {
    const rows = await this.prisma.ai_suggestions.findMany({
      where: { incident_id: incidentId, status: { in: ['PENDING_REVIEW', 'INFO'] } },
      orderBy: { created_at: 'desc' },
      take: 5,
      select: { id: true, kind: true, status: true, created_at: true, output: true, subject_type: true, subject_id: true },
    });
    const inboundIds = rows
      .filter((r) => r.subject_type === BARANGAY_SMS_SUBJECT && r.subject_id)
      .map((r) => r.subject_id!);
    const inbound = inboundIds.length
      ? await this.prisma.barangay_sms_inbound.findMany({
          where: { id: { in: inboundIds } },
          select: { id: true, body: true, received_at: true },
        })
      : [];
    const byId = new Map(inbound.map((m) => [m.id, m]));

    return rows.map((r) => {
      const reading = BarangayReplySchema.safeParse(r.output);
      const source = r.subject_id ? byId.get(r.subject_id) : undefined;
      return {
        id: r.id,
        kind: r.kind,
        status: r.status as AiSuggestionView['status'],
        createdAt: r.created_at.toISOString(),
        reading: reading.success ? reading.data : null,
        sourceText: source?.body ?? null,
        receivedAt: source?.received_at.toISOString() ?? null,
      };
    });
  }

  /**
   * Records the reading as the barangay's SMS report, under the dispatcher. Refused for an
   * information-only or failed row, a second time, or when the case is already closed.
   */
  async accept(id: string, actor: SuggestionActor) {
    const row = await this.prisma.ai_suggestions.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Suggestion not found');
    if (row.kind !== 'BARANGAY_REPLY') throw new BadRequestException('This suggestion cannot be accepted.');
    if (row.status !== 'PENDING_REVIEW') throw new ConflictException(this.refusal(row.status));

    const reading = BarangayReplySchema.safeParse(row.output);
    if (!reading.success || reading.data.status === 'UNCLEAR') {
      throw new ConflictException('This reading has no status to record.');
    }
    const inbound = row.subject_id
      ? await this.prisma.barangay_sms_inbound.findUnique({ where: { id: row.subject_id }, select: { notice_id: true } })
      : null;
    const notice = inbound?.notice_id
      ? await this.prisma.incident_barangay_notices.findUnique({ where: { id: inbound.notice_id }, include: NOTICE_INCLUDE })
      : null;
    if (!notice) throw new NotFoundException('The barangay case for this reply was not found.');
    if (notice.closed_at !== null) throw new ConflictException('This case is closed.');

    // Claim first, so two dispatchers can't both apply it.
    const now = new Date();
    const claimed = await this.prisma.ai_suggestions.updateMany({
      where: { id, status: 'PENDING_REVIEW' },
      data: { status: 'ACCEPTED', reviewed_by_id: actor.id, reviewed_at: now },
    });
    if (claimed.count === 0) throw new ConflictException('This suggestion was already reviewed.');

    try {
      await this.callbacks.reportBySms(notice, reading.data.status, {
        actorId: actor.id,
        actorRole: actor.role,
        aiSuggestionId: id,
      });
    } catch (err) {
      await this.prisma.ai_suggestions.updateMany({
        where: { id, status: 'ACCEPTED' },
        data: { status: 'PENDING_REVIEW', reviewed_by_id: null, reviewed_at: null },
      });
      if (err instanceof BarangayCallbackRefusedError) throw new ConflictException(err.message);
      if (err instanceof BarangayCallbackNotFoundError) throw new NotFoundException(err.message);
      throw err;
    }

    await this.audit.log({
      action: AuditAction.UPDATE,
      actorId: actor.id,
      actorRole: actor.role,
      entityType: 'ai_suggestion',
      entityId: id,
      moduleId: 'MOD-46',
      incidentId: notice.incident_id,
      oldValues: { status: 'PENDING_REVIEW' },
      newValues: { status: 'ACCEPTED', aiSuggestionId: id, recorded: reading.data.status },
    });
    return { id, status: 'ACCEPTED' as const, recorded: reading.data.status };
  }

  /** Hides a suggestion (or an information-only reading). Changes nothing else. */
  async dismiss(id: string, actor: SuggestionActor) {
    const row = await this.prisma.ai_suggestions.findUnique({
      where: { id },
      select: { status: true, incident_id: true },
    });
    if (!row) throw new NotFoundException('Suggestion not found');
    const res = await this.prisma.ai_suggestions.updateMany({
      where: { id, status: { in: ['PENDING_REVIEW', 'INFO'] } },
      data: { status: 'DISMISSED', reviewed_by_id: actor.id, reviewed_at: new Date() },
    });
    if (res.count === 0) throw new ConflictException(this.refusal(row.status));

    await this.audit.log({
      action: AuditAction.UPDATE,
      actorId: actor.id,
      actorRole: actor.role,
      entityType: 'ai_suggestion',
      entityId: id,
      moduleId: 'MOD-46',
      ...(row.incident_id && { incidentId: row.incident_id }),
      oldValues: { status: row.status },
      newValues: { status: 'DISMISSED', aiSuggestionId: id },
    });
    return { id, status: 'DISMISSED' as const };
  }

  private refusal(status: string): string {
    if (status === 'INFO') return 'This reading is information only; record the outcome by hand.';
    if (status === 'FAILED') return 'The AI could not read this reply.';
    return 'This suggestion was already reviewed.';
  }
}
