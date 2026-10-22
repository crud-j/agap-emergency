import { api } from '@/lib/api';
import { getToken } from '@/lib/auth';
import type { MunicipalOverview } from '@/features/analytics/api';

// ─── Types (mirror backend/src/oversight/oversight.service.ts) ───────────────

export interface OversightSummary {
  generatedAt: string;
  active: number;
  critical: number;
  enRoute: number;
  onScene: number;
  resolvedToday: number;
  openEscalations: number;
  unacknowledged: number;
  units: MunicipalOverview['units'];
  performance7d: MunicipalOverview['performance7d'];
}

export interface WorkloadRow {
  userId: string;
  name: string;
  role: string;
  openDispatches: number;
  openIncidents: number;
  actionsLastHour: number;
}

export interface OversightExceptions {
  generatedAt: string;
  thresholds: { waitingMinutes: number; staleLocationMinutes: number };
  waiting: Array<{
    incidentId: string;
    publicReference: string;
    category: string;
    priority: string;
    status: string;
    submittedAt: string;
    waitingSec: number;
  }>;
  rejected: Array<{
    dispatchId: string;
    incidentId: string;
    publicReference: string;
    unit: string;
    rejectedAt: string;
    reason: string | null;
    reassigned: boolean;
  }>;
  staleLocation: Array<{
    dispatchId: string;
    incidentId: string;
    publicReference: string;
    unit: string;
    lastSeenAt: string | null;
    silentSec: number;
  }>;
}

export interface PendingHandover {
  id: string;
  incidentId: string;
  publicReference: string;
  incidentStatus: string;
  from: { id: string; name: string; role: string };
  to: { id: string; name: string; role: string };
  handedOverAt: string;
  pendingActionCount: number;
}

export interface ActivityItem {
  id: string;
  incidentId: string;
  publicReference: string;
  fromStatus: string | null;
  toStatus: string;
  actor: { id: string; name: string; role: string } | null;
  occurredAt: string;
}

export interface MajorIncident {
  incidentId: string;
  publicReference: string;
  category: string;
  priority: string;
  status: string;
  barangay: string | null;
  icsActive: boolean;
  icsActivatedAt: string | null;
  positionsFilled: number;
  surgeName: string | null;
  agencies: number;
}

// ─── Fetchers (Supervisor only) ──────────────────────────────────────────────

export function fetchOversightSummary(): Promise<OversightSummary> {
  return api.get('/oversight/summary', getToken());
}

export function fetchWorkload(): Promise<WorkloadRow[]> {
  return api.get('/oversight/workload', getToken());
}

export function fetchExceptions(): Promise<OversightExceptions> {
  return api.get('/oversight/exceptions', getToken());
}

export function fetchPendingHandovers(): Promise<PendingHandover[]> {
  return api.get('/oversight/handovers', getToken());
}

export function fetchActivity(): Promise<ActivityItem[]> {
  return api.get('/oversight/activity', getToken());
}

export function fetchMajorIncidents(): Promise<MajorIncident[]> {
  return api.get('/oversight/major-incidents', getToken());
}
