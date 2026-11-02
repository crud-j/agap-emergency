import type { IncidentListItem } from './api';

type IncidentListCache = { data: IncidentListItem[] } | IncidentListItem[] | undefined;

/**
 * Patch one incident in a cached incident list (a plain array or a paginated `{ data }`),
 * so a socket event updates the queue and the dashboard before any refetch returns.
 */
export function patchIncidentInList<T extends IncidentListCache>(
  old: T,
  incidentId: string,
  patch: Partial<IncidentListItem>,
): T {
  if (!old) return old;
  const list = Array.isArray(old) ? old : old.data ?? [];
  const updated = list.map((inc) => (inc.id === incidentId ? { ...inc, ...patch } : inc));
  return (Array.isArray(old) ? updated : { ...old, data: updated }) as T;
}

/** Ids in `current` that were not in `previous`: the rows that just arrived. */
export function arrivedIds(previous: ReadonlySet<string> | null, current: { id: string }[]): string[] {
  if (!previous) return [];
  return current.filter((item) => !previous.has(item.id)).map((item) => item.id);
}
