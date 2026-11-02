import type { HandoverRecipient } from './command';
import type { Responder } from '@/features/responders/api';

export interface IcsCandidate {
  id: string;
  name: string;
  /** Shown after the name: the role, or a responder's organization. */
  detail: string;
}

export interface IcsCandidateGroup {
  label: string;
  people: IcsCandidate[];
}

const byName = (a: IcsCandidate, b: IcsCandidate) => a.name.localeCompare(b.name);

/**
 * People a Supervisor can name to an ICS position, grouped for the picker: the signed-in
 * user first (often the Incident Commander), then Supervisors, Dispatchers and Responders.
 * Each person appears once; empty groups are left out.
 */
export function buildIcsCandidates(input: {
  self: { id: string; name?: string | undefined; role: string } | null;
  staff: HandoverRecipient[];
  responders: Responder[];
}): IcsCandidateGroup[] {
  const seen = new Set<string>();
  const take = (person: IcsCandidate): IcsCandidate | null => {
    if (seen.has(person.id)) return null;
    seen.add(person.id);
    return person;
  };
  const roleLabel = (role: string) => (role === 'SUPERVISOR' ? 'Supervisor' : role === 'DISPATCHER' ? 'Dispatcher' : 'Responder');

  const groups: IcsCandidateGroup[] = [];
  if (input.self) {
    const me = take({ id: input.self.id, name: input.self.name ? `You (${input.self.name})` : 'You', detail: roleLabel(input.self.role) });
    if (me) groups.push({ label: 'You', people: [me] });
  }

  const staffOf = (role: HandoverRecipient['role']) =>
    input.staff
      .filter((s) => s.role === role)
      .map((s) => take({ id: s.id, name: s.full_name, detail: roleLabel(s.role) }))
      .filter((p): p is IcsCandidate => p !== null)
      .sort(byName);
  const supervisors = staffOf('SUPERVISOR');
  const dispatchers = staffOf('DISPATCHER');
  const responders = input.responders
    .map((r) => take({ id: r.id, name: r.full_name, detail: r.organization?.name ?? 'Responder' }))
    .filter((p): p is IcsCandidate => p !== null)
    .sort(byName);

  for (const [label, people] of [
    ['Supervisors', supervisors],
    ['Dispatchers', dispatchers],
    ['Responders', responders],
  ] as const) {
    if (people.length > 0) groups.push({ label, people });
  }
  return groups;
}
