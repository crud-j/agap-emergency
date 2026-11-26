import type { NotificationJobData } from '../jobs/processors/notification.processor';

/** Android channel for assignment updates (cancelled). Must match `assignments` in mobile push-registration.ts. */
export const ASSIGNMENTS_CHANNEL = 'assignments';

/**
 * Android channel for a new, unanswered assignment: long vibration, alarm sound, lock
 * screen. Must match `assignments-alarm` in mobile push-registration.ts. A separate id
 * because Android never lets an app change an existing channel's sound or vibration.
 * An APK without it shows the push on Android's fallback channel.
 */
export const ASSIGNMENT_ALARM_CHANNEL = 'assignments-alarm';

export const ASSIGNMENT_PUSH_JOB = 'responder-assignment-push';

/** Retries for the enqueue → FCM hop; the 15-second assignment poll on the phone is the fallback. */
export const ASSIGNMENT_PUSH_OPTS = { attempts: 3, backoff: { type: 'exponential', delay: 5000 } } as const;

/**
 * An unanswered assignment buzzes the crew phone again every 30 s, up to 6 times
 * (3 minutes). Then the Operations Center is alerted to reassign (Rule 8: a person
 * decides). It stops as soon as the dispatch is accepted, declined or cancelled.
 */
export const ASSIGNMENT_REMINDER_JOB = 'responder-assignment-reminder';
export const ASSIGNMENT_REMINDER_INTERVAL_MS = 30_000;
export const ASSIGNMENT_REMINDER_MAX = 6;
/** Dispatch statuses that are still waiting for the crew's answer. */
export const ASSIGNMENT_WAITING_STATUSES: ReadonlySet<string> = new Set(['PENDING', 'SENT']);
/** Start of the escalation reason, also used to raise it only once per dispatch. */
export const NO_ANSWER_REASON_PREFIX = 'No answer to assignment';

type PushIncident = { category: string; public_reference: string };

/** One notification per assignment: a repeat or a cancellation replaces it in the shade. */
export function assignmentTag(dispatchId: string): string {
  return `assignment-${dispatchId}`;
}

/**
 * MOD-18 / MOD-32: the push that wakes a crew phone. It shows on the lock screen, so it
 * carries the category and public reference only: no address, patient or reporter data.
 * `data` holds the dispatch ID, never the incident ID (that would open the citizen screen).
 * `reminder` is the repeat number (1–6) of an assignment still unanswered.
 */
export function assignmentPush(
  kind: 'ASSIGNMENT' | 'ASSIGNMENT_CANCELLED',
  incident: PushIncident,
  dispatchId: string,
  userId: string,
  reminder?: number,
): NotificationJobData {
  const label = `${incident.category.replace(/_/g, ' ')} · ${incident.public_reference}`;
  const title =
    kind === 'ASSIGNMENT_CANCELLED' ? 'Assignment cancelled' : reminder ? 'New assignment: still waiting' : 'New assignment';
  return {
    channel: 'PUSH',
    userId,
    title,
    body:
      kind === 'ASSIGNMENT'
        ? `${label}. Open AGAP to accept or decline.`
        : `${label}. This assignment was cancelled; no action needed.`,
    data: { type: kind, dispatchId, ...(reminder && { reminder }) },
    androidChannelId: kind === 'ASSIGNMENT' ? ASSIGNMENT_ALARM_CHANNEL : ASSIGNMENTS_CHANNEL,
    androidTag: assignmentTag(dispatchId),
  };
}

/** BullMQ custom IDs use '-' (a ':' throws unless there are exactly 3 parts). */
export function assignmentPushJobId(
  kind: 'ASSIGNMENT' | 'ASSIGNMENT_CANCELLED',
  dispatchId: string,
  userId: string,
): string {
  return kind === 'ASSIGNMENT' ? `assign-${dispatchId}-${userId}` : `assign-cancel-${dispatchId}-${userId}`;
}

/**
 * The delayed check behind each repeat. Not a push by itself: it pushes only if still
 * unanswered. `chain` (the time the assignment was sent) keeps job ids unique when a
 * responder is removed from a crew and added again.
 */
export function assignmentReminderJob(
  dispatchId: string,
  userId: string,
  attempt: number,
  chain: number,
): { data: NotificationJobData; jobId: string; delay: number } {
  return {
    data: { channel: 'ASSIGNMENT_REMINDER', userId, body: '', data: { dispatchId, attempt, chain } },
    jobId: `assign-remind-${dispatchId}-${userId}-${chain}-${attempt}`,
    delay: ASSIGNMENT_REMINDER_INTERVAL_MS,
  };
}
