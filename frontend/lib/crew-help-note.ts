import { NOTIFICATION_EVENT_TYPES } from '@agap/shared';

/**
 * The crew's free-text note on a "Crew help requested" notice (plan Phase 2 step 5).
 * It lives only in the dispatcher's own notice `data_payload`, never in the body or
 * a WebSocket payload, so the bell reads it from there. Null for any other notice.
 */
export function crewHelpNote(notif: { event_type: string; data_payload: Record<string, unknown> | null }): string | null {
  if (notif.event_type !== NOTIFICATION_EVENT_TYPES.CREW_HELP_REQUESTED) return null;
  const note = notif.data_payload?.note;
  return typeof note === 'string' && note.trim() ? note.trim() : null;
}
