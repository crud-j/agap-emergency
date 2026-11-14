import { initialPanelTab, showsNewIncidentAlerts } from '@/features/dispatch/live-dispatch';
import { ROLE } from '@/lib/role-access';

describe('Live Dispatch role defaults', () => {
  it('the Supervisor opens on Responding, the Dispatcher on Waiting', () => {
    expect(initialPanelTab(null, ROLE.SUPERVISOR)).toBe('responding');
    expect(initialPanelTab(null, ROLE.DISPATCHER)).toBe('waiting');
  });

  it('before the role is known it shows Waiting (the Dispatcher landing page)', () => {
    expect(initialPanelTab(null, null)).toBe('waiting');
  });

  it('an explicit ?tab= wins over the role (old Live Map links send responding)', () => {
    expect(initialPanelTab('responding', ROLE.DISPATCHER)).toBe('responding');
    expect(initialPanelTab('waiting', ROLE.SUPERVISOR)).toBe('waiting');
    expect(initialPanelTab('bogus', ROLE.SUPERVISOR)).toBe('responding');
  });

  it('new-incident alerts: Dispatcher yes, Supervisor no, unknown role no', () => {
    expect(showsNewIncidentAlerts(ROLE.DISPATCHER)).toBe(true);
    expect(showsNewIncidentAlerts(ROLE.SUPERVISOR)).toBe(false);
    expect(showsNewIncidentAlerts(null)).toBe(false);
  });
});
