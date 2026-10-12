import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '../stores/auth.store';
import { getMyAssignments, type Assignment } from '../services/api/responders.api';

// ─── Classification types ──────────────────────────────────────────────────────

export type AssignmentState =
  | 'PENDING_OFFER'
  | 'ACTIVE'
  | 'ACCEPTED_AWAITING_PROGRESS'
  | 'TERMINAL'
  | 'UNKNOWN';

export type AssignmentDerivation = {
  assignments: Assignment[];
  activeAssignments: Assignment[];
  acceptedAwaitingProgressAssignments: Assignment[];
  pendingOffers: Assignment[];
  terminalAssignments: Assignment[];
  unclassifiedAssignments: Assignment[];
};

// ─── Classification constants ──────────────────────────────────────────────────

const ACTIVE_INCIDENT_STATUSES = new Set([
  'DISPATCHED', 'EN_ROUTE', 'ON_SCENE', 'TRANSPORTING', 'ASSISTING',
]);
const AWAITING_PROGRESS_INCIDENT_STATUSES = new Set([
  'ACKNOWLEDGED', 'ASSESSED', 'DISPATCH_PENDING',
]);
const TERMINAL_DISPATCH_STATUSES = new Set(['REJECTED', 'CANCELLED', 'COMPLETED']);
const TERMINAL_INCIDENT_STATUSES = new Set([
  'RESOLVED', 'CLOSED', 'CANCELLED', 'FALSE_ALERT', 'DUPLICATE', 'UNABLE_TO_RESPOND', 'REFERRED',
]);
const KNOWN_DISPATCH_STATUSES = new Set([
  'PENDING', 'SENT', 'ACCEPTED', 'REJECTED', 'CANCELLED', 'COMPLETED',
]);
const KNOWN_INCIDENT_STATUSES = new Set([
  'DRAFT', 'SUBMITTED', 'RECEIVED', 'ACKNOWLEDGED', 'ASSESSED', 'DISPATCH_PENDING',
  'DISPATCHED', 'EN_ROUTE', 'ON_SCENE', 'TRANSPORTING', 'ASSISTING', 'RESOLVED',
  'CLOSED', 'CANCELLED', 'FALSE_ALERT', 'DUPLICATE', 'UNABLE_TO_RESPOND', 'REFERRED',
]);

// ─── Pure derivation helpers ───────────────────────────────────────────────────

function isValidDate(s: string | null | undefined): boolean {
  if (!s) return false;
  return !Number.isNaN(new Date(s).getTime());
}

function classifyAssignment(a: Assignment): AssignmentState {
  if (!isValidDate(a.created_at) || !isValidDate(a.updated_at)) return 'UNKNOWN';
  if (!a.status || !KNOWN_DISPATCH_STATUSES.has(a.status)) return 'UNKNOWN';

  const incidentStatus = a.incidents?.status;

  // terminal incident status overrides dispatch status
  if (incidentStatus && TERMINAL_INCIDENT_STATUSES.has(incidentStatus)) return 'TERMINAL';
  if (TERMINAL_DISPATCH_STATUSES.has(a.status)) return 'TERMINAL';
  if (a.status === 'PENDING' || a.status === 'SENT') return 'PENDING_OFFER';

  if (a.status === 'ACCEPTED') {
    if (!incidentStatus || !KNOWN_INCIDENT_STATUSES.has(incidentStatus)) return 'UNKNOWN';
    if (ACTIVE_INCIDENT_STATUSES.has(incidentStatus)) return 'ACTIVE';
    if (AWAITING_PROGRESS_INCIDENT_STATUSES.has(incidentStatus)) return 'ACCEPTED_AWAITING_PROGRESS';
    return 'UNKNOWN';
  }

  return 'UNKNOWN';
}

// Deterministic priority order: greatest updated_at → greatest created_at → greatest id
function sortByPriority(a: Assignment, b: Assignment): number {
  const ua = new Date(a.updated_at).getTime();
  const ub = new Date(b.updated_at).getTime();
  if (ub !== ua) return ub - ua;
  const ca = new Date(a.created_at).getTime();
  const cb = new Date(b.created_at).getTime();
  if (cb !== ca) return cb - ca;
  return b.id > a.id ? 1 : b.id < a.id ? -1 : 0;
}

/** Pure derivation: classify all assignments into disjoint buckets. */
export function classifyAssignments(assignments: Assignment[]): AssignmentDerivation {
  const activeAssignments: Assignment[] = [];
  const acceptedAwaitingProgressAssignments: Assignment[] = [];
  const pendingOffers: Assignment[] = [];
  const terminalAssignments: Assignment[] = [];
  const unclassifiedAssignments: Assignment[] = [];

  for (const a of assignments) {
    switch (classifyAssignment(a)) {
      case 'ACTIVE':
        activeAssignments.push(a);
        break;
      case 'ACCEPTED_AWAITING_PROGRESS':
        acceptedAwaitingProgressAssignments.push(a);
        break;
      case 'PENDING_OFFER':
        pendingOffers.push(a);
        break;
      case 'TERMINAL':
        terminalAssignments.push(a);
        break;
      default:
        unclassifiedAssignments.push(a);
    }
  }

  // Sort so index [0] is the highest-priority assignment to surface in UI
  activeAssignments.sort(sortByPriority);
  acceptedAwaitingProgressAssignments.sort(sortByPriority);

  return {
    assignments,
    activeAssignments,
    acceptedAwaitingProgressAssignments,
    pendingOffers,
    terminalAssignments,
    unclassifiedAssignments,
  };
}

// ─── Shared query hook ─────────────────────────────────────────────────────────

export interface ResponderAssignmentsResult {
  assignments: Assignment[];
  activeAssignments: Assignment[];
  acceptedAwaitingProgressAssignments: Assignment[];
  pendingOffers: Assignment[];
  unclassifiedAssignments: Assignment[];
  isLoading: boolean;
  isRefreshing: boolean;
  isError: boolean;
  isStale: boolean;
  error: Error | null;
  refetch: () => Promise<unknown>;
}

/**
 * Shared assignment query for Home, Missions, and Map tabs.
 * One query, one cache entry — no duplicate fetches across tabs.
 */
export function useResponderAssignments(): ResponderAssignmentsResult {
  const token = useAuthStore((s) => s.accessToken);

  const query = useQuery({
    queryKey: ['responder-assignments'],
    queryFn: () => getMyAssignments(token as string),
    enabled: Boolean(token),
    refetchInterval: 15_000,
  });

  const derivation = classifyAssignments(query.data ?? []);

  return {
    ...derivation,
    isLoading: query.isLoading,
    isRefreshing: query.isFetching && !query.isLoading,
    isError: query.isError,
    isStale: query.isStale,
    error: query.error,
    refetch: query.refetch,
  };
}
