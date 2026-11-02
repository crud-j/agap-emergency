import { arrivedIds, patchIncidentInList } from '@/features/incidents/live-patch';
import type { IncidentListItem } from '@/features/incidents/api';

const inc = (id: string, priority = 'HIGH', status = 'SUBMITTED') =>
  ({ id, priority, status }) as unknown as IncidentListItem;

describe('patchIncidentInList', () => {
  it('patches one incident in a paginated list and keeps the rest of the page', () => {
    const page = { data: [inc('a'), inc('b')], total: 2, page: 1 };
    const next = patchIncidentInList(page, 'b', { priority: 'CRITICAL' });

    expect(next.data.map((i) => i.priority)).toEqual(['HIGH', 'CRITICAL']);
    expect(next).toMatchObject({ total: 2, page: 1 });
    expect(page.data[1]!.priority).toBe('HIGH'); // the cached object is not mutated
  });

  it('patches a plain array', () => {
    const next = patchIncidentInList([inc('a')], 'a', { status: 'ACKNOWLEDGED' });
    expect(next[0]!.status).toBe('ACKNOWLEDGED');
  });

  it('leaves an empty cache and unknown ids alone', () => {
    expect(patchIncidentInList(undefined, 'a', { priority: 'LOW' })).toBeUndefined();
    expect(patchIncidentInList([inc('a')], 'zzz', { priority: 'LOW' })[0]!.priority).toBe('HIGH');
  });
});

describe('arrivedIds', () => {
  it('reports nothing on the first load', () => {
    expect(arrivedIds(null, [inc('a'), inc('b')])).toEqual([]);
  });

  it('reports only the incidents that were not in the previous list', () => {
    expect(arrivedIds(new Set(['a', 'b']), [inc('c'), inc('a'), inc('b')])).toEqual(['c']);
  });

  it('reports nothing when the same incidents only changed status', () => {
    expect(arrivedIds(new Set(['a']), [inc('a', 'HIGH', 'ACKNOWLEDGED')])).toEqual([]);
  });
});
