import type { NotificationJobData } from '../jobs/processors/notification.processor';

/** Android channel for assignment pushes. Must match the `assignments` channel in mobile push-registration.ts. */
export const ASSIGNMENTS_CHANNEL = 'assignments';

export const ASSIGNMENT_PUSH_JOB = 'responder-assignment-push';

/** Retries for the enqueue → FCM hop; the 15-second assignment poll on the phone is the fallback. */
export const ASSIGNMENT_PUSH_OPTS = { attempts: 3, backoff: { type: 'exponential', delay: 5000 } } as const;

type PushIncident = { category: string; public_reference: string };

/**
 * MOD-18 / MOD-32: the push that wakes a crew phone. It shows on the lock screen, so it
 * carries the category and public reference only: no address, patient or reporter data.
 * `data` holds the dispatch ID, never the incident ID (that would open the citizen screen).
 */
export function assignmentPush(
  kind: 'ASSIGNMENT' | 'ASSIGNMENT_CANCELLED',
  incident: PushIncident,
  dispatchId: string,
  userId: string,
): NotificationJobData {
  const label = `${incident.category.replace(/_/g, ' ')} · ${incident.public_reference}`;
  return {
    channel: 'PUSH',
    userId,
    title: kind === 'ASSIGNMENT' ? 'New assignment' : 'Assignment cancelled',
    body:
      kind === 'ASSIGNMENT'
        ? `${label}. Open AGAP to accept.`
        : `${label}. This assignment was cancelled; no action needed.`,
    data: { type: kind, dispatchId },
    androidChannelId: ASSIGNMENTS_CHANNEL,
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
