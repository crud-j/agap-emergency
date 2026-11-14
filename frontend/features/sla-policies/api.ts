import { api } from '@/lib/api';
import { getToken } from '@/lib/auth';

/**
 * MOD-41 response targets (SLA). The backend's sla_policies table is the only source:
 * the escalation alarm, Analytics and this console all read it. Seconds from the report.
 */
export interface SlaPolicy {
  id: string;
  /** null = any category. */
  category: string | null;
  /** null = any priority. */
  priority: string | null;
  acknowledgeSecs: number;
  dispatchSecs: number;
  onSceneSecs: number;
  isActive: boolean;
}

export interface SlaThresholds {
  acknowledge: number;
  dispatch: number;
  onScene: number;
}

export interface SlaPoliciesResponse {
  policies: SlaPolicy[];
  /** Applies when no active policy matches an incident. */
  fallback: SlaThresholds;
}

export interface SlaPolicyUpdate {
  acknowledgeSecs: number;
  dispatchSecs: number;
  onSceneSecs: number;
}

/** GET /sla-policies (Dispatcher, Supervisor, System Administrator). */
export function fetchSlaPolicies(): Promise<SlaPoliciesResponse> {
  return api.get('/sla-policies', getToken());
}

/** PATCH /sla-policies/:id (Supervisor, System Administrator). Audited server-side. */
export function updateSlaPolicy(id: string, body: SlaPolicyUpdate): Promise<SlaPolicy> {
  return api.patch(`/sla-policies/${id}`, body, getToken());
}
