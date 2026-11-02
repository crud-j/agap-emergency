import { buildIcsCandidates } from '@/features/incidents/ics-candidates';
import type { HandoverRecipient } from '@/features/incidents/command';
import type { Responder } from '@/features/responders/api';

const staff: HandoverRecipient[] = [
  { id: 'd2', full_name: 'Dispatcher Two', role: 'DISPATCHER' },
  { id: 's2', full_name: 'Ana Supervisor', role: 'SUPERVISOR' },
  { id: 'd1', full_name: 'Ben Dispatcher', role: 'DISPATCHER' },
];

const responder = (id: string, name: string, org: string | null): Responder => ({
  id,
  full_name: name,
  phone_number: null,
  status: null,
  availability_status: 'AVAILABLE',
  availability_changed_at: null,
  organization: org ? { id: `org-${org}`, name: org } : null,
});

describe('buildIcsCandidates (ICS position picker)', () => {
  it('lists the signed-in user first, then Supervisors, Dispatchers and Responders, each by name', () => {
    const groups = buildIcsCandidates({
      self: { id: 's1', name: 'Juan dela Cruz', role: 'SUPERVISOR' },
      staff,
      responders: [responder('r2', 'Zed Crew', 'BFP Bocaue'), responder('r1', 'Ada Crew', 'MDRRMO')],
    });

    expect(groups.map((g) => g.label)).toEqual(['You', 'Supervisors', 'Dispatchers', 'Responders']);
    expect(groups[0]!.people).toEqual([{ id: 's1', name: 'You (Juan dela Cruz)', detail: 'Supervisor' }]);
    expect(groups[2]!.people.map((p) => p.name)).toEqual(['Ben Dispatcher', 'Dispatcher Two']);
    expect(groups[3]!.people).toEqual([
      { id: 'r1', name: 'Ada Crew', detail: 'MDRRMO' },
      { id: 'r2', name: 'Zed Crew', detail: 'BFP Bocaue' },
    ]);
  });

  it('shows each person once and leaves out empty groups', () => {
    const groups = buildIcsCandidates({
      self: { id: 'd1', role: 'DISPATCHER' },
      staff,
      responders: [],
    });

    expect(groups.map((g) => g.label)).toEqual(['You', 'Supervisors', 'Dispatchers']);
    expect(groups[0]!.people[0]!.name).toBe('You');
    expect(groups.flatMap((g) => g.people).filter((p) => p.id === 'd1')).toHaveLength(1);
  });

  it('labels a responder without an organization as Responder', () => {
    const [group] = buildIcsCandidates({ self: null, staff: [], responders: [responder('r1', 'Ada Crew', null)] });
    expect(group).toEqual({ label: 'Responders', people: [{ id: 'r1', name: 'Ada Crew', detail: 'Responder' }] });
  });
});
