import { ROLE } from '@/lib/role-access';

/** Live Dispatch panel lists: incidents waiting for a unit, and incidents with units out. */
export type PanelTab = 'waiting' | 'responding';

/**
 * Which list Live Dispatch opens on. An explicit ?tab= wins (old Live Map links send
 * "responding"). Otherwise the Supervisor starts on Responding, oversight first, and
 * everyone else on Waiting. Dispatch authority is the same either way; only the
 * starting view differs (docs/AGAP_Role_Rules_and_Dashboard_Content.md).
 */
export function initialPanelTab(tabParam: string | null, role: string | null | undefined): PanelTab {
  if (tabParam === 'waiting' || tabParam === 'responding') return tabParam;
  return role === ROLE.SUPERVISOR ? 'responding' : 'waiting';
}

/**
 * Whether "New incident" alerts pop up. Dispatcher only: a Supervisor watching the
 * map isn't pulled into the queue (they see the Immediate/Waiting counts, and
 * Escalations flags what needs them). False while the role is unknown, so a
 * Supervisor never gets an alert before sign-in state loads.
 */
export function showsNewIncidentAlerts(role: string | null | undefined): boolean {
  return !!role && role !== ROLE.SUPERVISOR;
}
