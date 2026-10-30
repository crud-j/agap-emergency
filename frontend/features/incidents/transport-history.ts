import type { AuditLogEntry } from '@/features/audit/api';
import type { IncidentTransport } from './api';

/** One destination change of a transport, oldest first (plan §16.5). */
export interface DestinationChange {
  at: string;
  /** Hospital name before the change; null when none was set yet. */
  from: string | null;
  to: string | null;
  reason: string | null;
  actor: string | null;
}

function idOf(values: Record<string, unknown> | null, ...keys: string[]): string | null {
  for (const key of keys) {
    const v = values?.[key];
    if (typeof v === 'string') return v;
  }
  return null;
}

/**
 * The destination history of one transport, from the incident audit trail
 * (GET /audit/incidents/:id, MOD-46): every transport_record UPDATE that set or
 * changed `destination_id`. Hospital names come from `names` (id → name); a hospital
 * no longer listed (e.g. deactivated) reads "a hospital no longer listed".
 */
export function destinationHistory(
  transport: Pick<IncidentTransport, 'id'>,
  audit: ReadonlyArray<AuditLogEntry> | undefined,
  names: ReadonlyMap<string, string>,
): DestinationChange[] {
  const name = (id: string | null) => (id ? names.get(id) ?? 'a hospital no longer listed' : null);
  return (audit ?? [])
    .filter((e) => e.entity_type === 'transport_record' && e.entity_id === transport.id && e.action === 'UPDATE')
    .flatMap((e) => {
      // PATCH writes the request (destinationId, changeReason); the first destination writes destination_id.
      const to = idOf(e.new_values, 'destinationId', 'destination_id');
      const from = idOf(e.old_values, 'destination_id');
      if (!to || to === from) return [];
      const reason = e.new_values?.['changeReason'];
      return [{
        at: e.occurred_at,
        from: name(from),
        to: name(to),
        reason: typeof reason === 'string' && reason.trim() ? reason : null,
        actor: e.users?.full_name ?? null,
      }];
    })
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
}
