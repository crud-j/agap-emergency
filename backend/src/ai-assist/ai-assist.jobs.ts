/**
 * AI_ASSIST queue contract. Pure, so the barangay reply service can queue a job without
 * loading AiAssistModule or the Gemini SDK (K10).
 */

/** `subject_type` of a barangay reply suggestion: the row in barangay_sms_inbound. */
export const BARANGAY_SMS_SUBJECT = 'barangay_sms_inbound';

/** One AI_ASSIST job. Only the barangay reply task exists today (no case brief). */
export interface AiAssistJobData {
  task: 'BARANGAY_REPLY';
  inboundId: string;
}

/** The job name and its deterministic id (`-`, not `:`: BullMQ rejects most ids with `:`). */
export const BARANGAY_REPLY_JOB = 'barangay-reply';
export const barangayReplyJobId = (inboundId: string): string => `reply-${inboundId}`;
