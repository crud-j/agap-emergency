import { ALL_NAV_GROUPS, ROLE, canOpen, landingForRole, navForRole, showsSidebar } from '@/lib/role-access';

const CONSOLE_ROLES = Object.values(ROLE);

const labels = (role: string) => navForRole(role).flatMap((g) => g.items.map((i) => i.label));

describe('role-access', () => {
  it('every sidebar link opens for every role it is shown to', () => {
    for (const group of ALL_NAV_GROUPS) {
      for (const item of group.items) {
        for (const role of item.roles) {
          expect({ role, href: item.href, open: canOpen(role, item.href) }).toEqual({
            role,
            href: item.href,
            open: true,
          });
        }
      }
    }
  });

  it("every role's landing page is open to it", () => {
    for (const role of CONSOLE_ROLES) {
      expect({ role, open: canOpen(role, landingForRole(role)) }).toEqual({ role, open: true });
    }
  });

  it('no role has a Profile link, and labels are unique per role', () => {
    for (const role of CONSOLE_ROLES) {
      const list = labels(role);
      expect(list).not.toContain('Profile');
      expect(new Set(list).size).toBe(list.length);
    }
  });

  it('the System Administrator has no operational pages', () => {
    for (const path of [
      '/operations/incidents',
      '/operations/map',
      '/operations/triage',
      '/operations/dispatch',
      '/operations/escalations',
      '/operations/command',
      '/operations/multi-agency',
      '/operations/surge',
      '/operations/risk',
      '/analytics',
    ]) {
      expect({ path, open: canOpen(ROLE.SYS_ADMIN, path) }).toEqual({ path, open: false });
    }
  });

  it('roles without incident access cannot open incident pages', () => {
    for (const role of [ROLE.PUBLISHER, ROLE.ORG_ADMIN, ROLE.HOSPITAL_USER]) {
      expect(canOpen(role, '/operations/incidents')).toBe(false);
      expect(canOpen(role, '/operations/dispatch')).toBe(false);
    }
  });

  it('matches whole path segments and prefers the longest prefix', () => {
    expect(canOpen(ROLE.DISPATCHER, '/announcements')).toBe(true);
    expect(canOpen(ROLE.DISPATCHER, '/announcements/compose')).toBe(false);
    expect(canOpen(ROLE.PUBLISHER, '/announcements/compose')).toBe(true);
    expect(canOpen(ROLE.PUBLISHER, '/announcements/history')).toBe(true);
    expect(canOpen(ROLE.DISPATCHER, '/announcements/history')).toBe(false);
    expect(canOpen(ROLE.DISPATCHER, '/operations/history')).toBe(true);
    expect(canOpen(ROLE.SYS_ADMIN, '/operations/history')).toBe(false);
    expect(canOpen(ROLE.PUBLISHER, '/operations/history')).toBe(false);
    expect(canOpen(ROLE.SUPERVISOR, '/analyticsX')).toBe(false);
    expect(canOpen(ROLE.SYS_ADMIN, '/administration/users')).toBe(true);
    expect(canOpen(ROLE.SYS_ADMIN, '/administration/security')).toBe(true);
    expect(canOpen(ROLE.SYS_ADMIN, '/administration/integrations')).toBe(true);
    expect(canOpen(ROLE.SUPERVISOR, '/administration/security')).toBe(false);
    expect(canOpen(ROLE.ORG_ADMIN, '/administration/integrations')).toBe(false);
    // Phase 6: the Org Administrator's only administration page is the Barangay Directory.
    expect(canOpen(ROLE.ORG_ADMIN, '/administration/barangays')).toBe(true);
    expect(canOpen(ROLE.ORG_ADMIN, '/administration/users')).toBe(false);
    expect(canOpen(ROLE.ORG_ADMIN, '/administration')).toBe(false);
    expect(canOpen(ROLE.ORG_ADMIN, '/resources/requests')).toBe(true);
    expect(canOpen(ROLE.DISPATCHER, '/resources/requests')).toBe(false);
    // The System Administrator views mutual-aid requests read-only (answering is 403 server-side).
    expect(canOpen(ROLE.SYS_ADMIN, '/resources/requests')).toBe(true);
    expect(canOpen(ROLE.ORG_ADMIN, '/organizations')).toBe(true);
    expect(canOpen(ROLE.ORG_ADMIN, '/operations/fleet')).toBe(true);
    // Hospital organizations register their own hospitals (pending MDRRMO review).
    expect(canOpen(ROLE.ORG_ADMIN, '/hospitals')).toBe(true);
    expect(canOpen(undefined, '/dashboard')).toBe(false);
    expect(canOpen(ROLE.SYS_ADMIN, '/no-such-page')).toBe(false);
  });

  it('keeps the hospital portal scoped as before', () => {
    expect(canOpen(ROLE.HOSPITAL_USER, '/hospitals')).toBe(true);
    expect(canOpen(ROLE.HOSPITAL_USER, '/account/security')).toBe(true);
    expect(canOpen(ROLE.HOSPITAL_USER, '/dashboard')).toBe(false);
    expect(landingForRole(ROLE.HOSPITAL_USER)).toBe('/hospitals');
  });

  it('lands the LGU account and the Supervisor on their own dashboards', () => {
    expect(landingForRole(ROLE.PUBLISHER)).toBe('/dashboard');
    expect(landingForRole(ROLE.SUPERVISOR)).toBe('/dashboard');
    expect(landingForRole(ROLE.DISPATCHER)).toBe('/operations/dispatch');
  });

  it('Risk Map: Dispatcher and Supervisor; Risk Areas list: System Administrator only (read-only)', () => {
    expect(canOpen(ROLE.DISPATCHER, '/operations/risk')).toBe(true);
    expect(canOpen(ROLE.SUPERVISOR, '/operations/risk')).toBe(true);
    for (const role of [ROLE.SYS_ADMIN, ROLE.ORG_ADMIN, ROLE.PUBLISHER, ROLE.HOSPITAL_USER]) {
      expect(canOpen(role, '/operations/risk')).toBe(false);
    }
    expect(canOpen(ROLE.SYS_ADMIN, '/administration/risk-areas')).toBe(true);
    // Supervisors manage risk areas from the Risk Map, not from Administration.
    expect(canOpen(ROLE.SUPERVISOR, '/administration/risk-areas')).toBe(false);
  });

  it('only the Supervisor opens CRITICAL advisory approvals (Phase 7)', () => {
    expect(canOpen(ROLE.SUPERVISOR, '/operations/approvals')).toBe(true);
    for (const role of [ROLE.PUBLISHER, ROLE.SYS_ADMIN, ROLE.DISPATCHER, ROLE.ORG_ADMIN]) {
      expect(canOpen(role, '/operations/approvals')).toBe(false);
    }
  });

  it('sidebars match the agreed spec', () => {
    expect(labels(ROLE.DISPATCHER)).toEqual([
      'Dashboard', 'Incident Queue', 'Triage', 'Live Dispatch', 'Risk Map',
      'Multi-Agency', 'Fleet & Units', 'Hospitals & Facilities', 'Incident History',
      'Account Security',
    ]);
    expect(labels(ROLE.PUBLISHER)).toEqual(['Dashboard', 'Announcements', 'Publication History', 'Account Security']);
    expect(labels(ROLE.ORG_ADMIN)).toEqual([
      'Dashboard', 'Organizations', 'Fleet & Units', 'Requests', 'Hospitals & Facilities', 'Barangay Directory',
      'Account Security',
    ]);
    expect(labels(ROLE.HOSPITAL_USER)).toEqual(['Hospitals & Facilities']);
    expect(showsSidebar(ROLE.HOSPITAL_USER)).toBe(false);
    expect(showsSidebar(ROLE.DISPATCHER)).toBe(true);
    expect(labels(ROLE.SUPERVISOR)).toEqual([
      'Dashboard', 'Escalations', 'Approvals', 'Live Dispatch',
      'Incident Queue', 'Triage',
      'Command / ICS', 'Multi-Agency', 'Surge Mode',
      'Analytics', 'Risk Map', 'Activity Log', 'Incident History',
      'Fleet & Units', 'Hospitals & Facilities',
      'Account Security',
    ]);
    expect(labels(ROLE.SYS_ADMIN)).toEqual([
      'Dashboard', 'Organizations', 'Fleet & Units', 'Requests', 'Hospitals & Facilities',
      'Users & Accounts', 'Roles & Permissions', 'Barangay Directory', 'ID Reviews', 'Risk Areas', 'Audit Log',
      'Security Events', 'Integrations', 'Configuration',
      'Account Security',
    ]);
  });

  it("the Supervisor's sidebar shows oversight up front and folds the rest", () => {
    const groups = navForRole(ROLE.SUPERVISOR);
    const visible = groups.filter((g) => !g.collapsible).flatMap((g) => g.items.map((i) => i.label));
    expect(visible).toEqual(['Dashboard', 'Escalations', 'Approvals', 'Live Dispatch', 'Account Security']);
    expect(groups.filter((g) => g.collapsible).map((g) => g.label)).toEqual([
      'Take Over Dispatch', 'Major Incident', 'Reports', 'Resources',
    ]);
    expect(groups.find((g) => g.label === 'Major Incident')?.opensDuringMajorIncident).toBe(true);
    // Folding hides links, never permissions: every Dispatcher page still opens.
    for (const path of ['/operations/incidents', '/operations/triage', '/operations/dispatch', '/operations/surge']) {
      expect({ path, open: canOpen(ROLE.SUPERVISOR, path) }).toEqual({ path, open: true });
    }
  });

  it('Live Dispatch replaces Live Map; the old map URL still opens for ops roles (it redirects)', () => {
    for (const role of [ROLE.DISPATCHER, ROLE.SUPERVISOR]) {
      const items = navForRole(role).flatMap((g) => g.items);
      expect(items.map((i) => i.href)).not.toContain('/operations/map');
      expect(items.filter((i) => i.href === '/operations/dispatch').map((i) => i.label)).toEqual(['Live Dispatch']);
      expect(canOpen(role, '/operations/map')).toBe(true);
    }
  });

  it('no other role gets folded groups', () => {
    for (const role of CONSOLE_ROLES.filter((r) => r !== ROLE.SUPERVISOR)) {
      expect({ role, folded: navForRole(role, 'MDRRMO').some((g) => g.collapsible) }).toEqual({ role, folded: false });
    }
  });

  it('ID Reviews: shown to an MDRRMO Org Administrator only, among Org Administrators', () => {
    const orgAdminLabels = (orgType?: string) =>
      navForRole(ROLE.ORG_ADMIN, orgType).flatMap((g) => g.items.map((i) => i.label));

    expect(orgAdminLabels('MDRRMO')).toContain('ID Reviews');
    expect(orgAdminLabels('BFP')).not.toContain('ID Reviews');
    expect(orgAdminLabels('HOSPITAL')).not.toContain('ID Reviews');
    expect(orgAdminLabels(undefined)).not.toContain('ID Reviews');
    // The org type only narrows Org Administrators; other roles are unaffected by it.
    expect(navForRole(ROLE.SYS_ADMIN, 'BFP').flatMap((g) => g.items.map((i) => i.label))).toContain('ID Reviews');
    expect(navForRole(ROLE.DISPATCHER, 'MDRRMO').flatMap((g) => g.items.map((i) => i.label))).not.toContain('ID Reviews');
    expect(canOpen(ROLE.DISPATCHER, '/administration/id-reviews')).toBe(false);
    expect(canOpen(ROLE.SUPERVISOR, '/administration/id-reviews')).toBe(false);
  });
});
