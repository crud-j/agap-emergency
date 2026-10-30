import { createHash } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { RealtimeService } from '../realtime/realtime.service';
import { PrismaService } from '../common/prisma/prisma.service';
import { AiClientService } from './ai-client.service';
import { redactForAi } from './redact';
import {
  BARANGAY_REPLY_INSTRUCTIONS,
  BARANGAY_REPLY_JSON_SCHEMA,
  BARANGAY_REPLY_MAX_INPUT,
  BARANGAY_REPLY_MIN_CONFIDENCE,
  BarangayReplySchema,
} from './prompts/barangay-reply.prompt';
import { BARANGAY_SMS_SUBJECT, type AiAssistJobData } from './ai-assist.jobs';

/**
 * Runs one AI_ASSIST job: builds the redacted input, calls Gemini and stores exactly one
 * ai_suggestions row for whatever happened (a suggestion, information only, or FAILED with
 * an error code). It never throws, so BullMQ never retries a bad answer, and it never
 * changes the incident or the barangay notice: a dispatcher accepts or dismisses the row.
 */
@Injectable()
export class AiTaskRunner {
  private readonly logger = new Logger(AiTaskRunner.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiClientService,
    private readonly realtime: RealtimeService,
  ) {}

  async run(job: AiAssistJobData): Promise<void> {
    try {
      if (job.task === 'BARANGAY_REPLY') await this.barangayReply(job.inboundId);
    } catch (err) {
      this.logger.error(`AI ${job.task} job for ${job.inboundId} failed: ${err instanceof Error ? err.name : 'unknown'}`);
    }
  }

  private async barangayReply(inboundId: string): Promise<void> {
    // Off now (the flag may have changed since the job was queued): no call, no row.
    if (!this.ai.enabled) return;

    const inbound = await this.prisma.barangay_sms_inbound.findUnique({
      where: { id: inboundId },
      select: { id: true, body: true, outcome: true, notice: { select: { incident_id: true, closed_at: true } } },
    });
    // Only an unparsed reply linked to one open case is read (BarangayReplyService decides).
    if (!inbound || inbound.outcome !== 'UNPARSED' || !inbound.notice || inbound.notice.closed_at) return;

    // A repeated job (same inbound) never makes a second call.
    const existing = await this.prisma.ai_suggestions.findFirst({
      where: { subject_type: BARANGAY_SMS_SUBJECT, subject_id: inboundId },
      select: { id: true },
    });
    if (existing) return;

    // Only the redacted reply body leaves AGAP: no incident data, no phone number.
    const input = redactForAi(inbound.body, BARANGAY_REPLY_MAX_INPUT);
    const result = await this.ai.structured(
      'BARANGAY_REPLY',
      BARANGAY_REPLY_INSTRUCTIONS,
      input,
      BARANGAY_REPLY_JSON_SCHEMA,
      BarangayReplySchema,
    );
    if (!result.ok && result.error === 'DISABLED') return;

    const status = result.ok
      ? result.value.status === 'UNCLEAR' || result.value.confidence < BARANGAY_REPLY_MIN_CONFIDENCE
        ? 'INFO'
        : 'PENDING_REVIEW'
      : 'FAILED';
    const incidentId = inbound.notice.incident_id;

    // The newest reading for the case replaces older open ones, so the drawer stays short.
    // An information-only reading replaces only older information, and a reading of a help
    // request (NEEDS_BACKUP) is never replaced: it stays until a dispatcher acts on it. One
    // transaction, so a failed insert never leaves the case with its older cards gone.
    const row = await this.prisma.$transaction(async (tx) => {
      if (status !== 'FAILED') {
        await tx.ai_suggestions.updateMany({
          where: {
            incident_id: incidentId,
            kind: 'BARANGAY_REPLY',
            status: status === 'PENDING_REVIEW' ? { in: ['PENDING_REVIEW', 'INFO'] } : 'INFO',
            NOT: { output: { path: ['status'], equals: 'NEEDS_BACKUP' } },
          },
          data: { status: 'SUPERSEDED' },
        });
      }
      return tx.ai_suggestions.create({
        data: {
          incident_id: incidentId,
          subject_type: BARANGAY_SMS_SUBJECT,
          subject_id: inboundId,
          kind: 'BARANGAY_REPLY',
          status,
          input_hash: createHash('sha256').update(input).digest('hex'),
          ...(result.ok && { output: result.value }),
          model: result.model.slice(0, 80) || 'unset',
          latency_ms: result.latencyMs,
          error: result.ok ? null : result.error,
        },
        select: { id: true },
      });
    });

    this.realtime.aiSuggestionCreated({ suggestionId: row.id, incidentId, kind: 'BARANGAY_REPLY', status });
  }
}
