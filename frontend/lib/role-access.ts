/**
 * Which Operations Center pages each role may open, where it lands after sign-in,
 * and what its sidebar shows. Spec: docs/AGAP_Role_Rules_and_Dashboard_Content.md (§0).
 *
 * This only shapes navigation. The backend's @Roles(...) on every endpoint is the
 * control; a route is listed here for a role only if the endpoints its page loads
 * allow that role.
 */

export const ROLE = {
  DISPATCHER: 'DISPATCHER',
  SUPERVISOR: 'SUPERVISOR',
  HOSPITAL_USER: 'HOSPITAL_USER',
  ORG_ADMIN: 'ORG_ADMINISTRATOR',
  PUBLISHER: 'ANNOUNCEMENTS_PUBLISHER',
  SYS_ADMIN: 'SYSTEM_ADMINISTRATOR',
} as const;

const { DISPATCHER, SUPERVISOR, HOSPITAL_USER, ORG_ADMIN, PUBLISHER, SYS_ADMIN } = ROLE;

const OPS = [DISPATCHER, SUPERVISOR];
const CONSOLE = [DISPATCHER, SUPERVISOR, ORG_ADMIN, PUBLISHER, SYS_ADMIN];

/**
 * Route prefix → roles that may open it. The longest matching prefix wins, and a
 * path that matches nothing is closed to everyone.
 */
const ROUTE_ROLES: { prefix: string; roles: readonly string[] }[] = [
  { prefix: '/dashboard', roles: CONSOLE },
  { prefix: '/account', roles: [...CONSOLE, HOSPITAL_USER] },

  { prefix: '/operations/incidents', roles: OPS },
  { prefix: '/operations/map', roles: OPS },
  { prefix: '/operations/triage', roles: OPS },
  { prefix: '/operations/dispatch', roles: OPS },
  { prefix: '/operations/multi-agency', roles: OPS },
  { prefix: '/operations/history', roles: OPS },
  { prefix: '/operations/escalations', roles: [SUPERVISOR] },
  { prefix: '/operations/command', roles: [SUPERVISOR] },
  { prefix: '/operations/surge', roles: [SUPERVISOR] },
  { prefix: '/operations/risk', roles: [SUPERVISOR] },
  // CRITICAL advisories awaiting MDRRMO approval (Phase 7).
  { prefix: '/operations/approvals', roles: [SUPERVISOR] },
  { prefix: '/analytics', roles: [SUPERVISOR] },

  // Fleet & Units. The System and Org Administrators see only its Registry tab.
  { prefix: '/operations/fleet', roles: [DISPATCHER, SUPERVISOR, ORG_ADMIN, SYS_ADMIN] },
  // Old Registry route; redirects to the Fleet & Units Registry tab.
  { prefix: '/resources', roles: [DISPATCHER, SUPERVISOR, ORG_ADMIN, SYS_ADMIN] },
  // Mutual-aid requests to answer for the Org Administrator's organization.
  { prefix: '/resources/requests', roles: [ORG_ADMIN] },
  // Org Administrators of hospital organizations register their own hospitals (MOD-39).
  { prefix: '/hospitals', roles: [HOSPITAL_USER, DISPATCHER, SUPERVISOR, ORG_ADMIN, SYS_ADMIN] },

  // Public announcements are readable by every console role (the dashboard's
  // critical-advisory banner links here); composing needs a publishing role.
  { prefix: '/announcements', roles: CONSOLE },
  { prefix: '/announcements/compose', roles: [PUBLISHER, SYS_ADMIN] },
  // Reads GET /announcements/publisher/all (publisher roles only).
  { prefix: '/announcements/history', roles: [PUBLISHER, SYS_ADMIN] },

  { prefix: '/audit', roles: [SUPERVISOR, SYS_ADMIN] },
  { prefix: '/organizations', roles: [ORG_ADMIN, SYS_ADMIN] },
  { prefix: '/administration', roles: [SYS_ADMIN] },
  // The only administration page the Org Administrator opens (Phase 6).
  { prefix: '/administration/barangays', roles: [ORG_ADMIN, SYS_ADMIN] },
  { prefix: '/ops/kitchen-sink', roles: [SYS_ADMIN] },
];

const LANDING: Record<string, string> = {
  [DISPATCHER]: '/operations/dispatch',
  [SUPERVISOR]: '/dashboard',
  [PUBLISHER]: '/dashboard',
  [SYS_ADMIN]: '/dashboard',
  [ORG_ADMIN]: '/dashboard',
  [HOSPITAL_USER]: '/hospitals',
};

function matches(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

/** May this role open this console path? */
export function canOpen(role: string | undefined, pathname: string): boolean {
  if (!role) return false;
  let best: { prefix: string; roles: readonly string[] } | null = null;
  for (const route of ROUTE_ROLES) {
    if (matches(pathname, route.prefix) && (!best || route.prefix.length > best.prefix.length)) best = route;
  }
  return !!best && best.roles.includes(role);
}

/** Where a role goes after sign-in, and where "not available" pages point back to. */
export function landingForRole(role?: string): string {
  return (role && LANDING[role]) || '/dashboard';
}

// ─── Sidebar ───────────────────────────────────────────────────────────────────

export interface NavLink {
  href: string;
  label: string;
  roles: readonly string[];
  exact?: boolean;
}

export interface NavGroup {
  label: string;
  items: NavLink[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Operations',
    items: [
      { href: '/dashboard', label: 'Dashboard', roles: CONSOLE, exact: true },
      { href: '/operations/incidents', label: 'Incident Queue', roles: OPS },
      { href: '/operations/map', label: 'Live Map', roles: OPS },
      { href: '/operations/triage', label: 'Triage', roles: OPS },
      { href: '/operations/dispatch', label: 'Dispatch', roles: OPS },
    ],
  },
  {
    label: 'Oversight',
    items: [
      { href: '/operations/escalations', label: 'Escalations', roles: [SUPERVISOR] },
      // Same page as the System Administrator's Audit Log, named for its audience.
      { href: '/audit', label: 'Activity Log', roles: [SUPERVISOR] },
    ],
  },
  {
    label: 'Command',
    items: [
      { href: '/operations/command', label: 'Command / ICS', roles: [SUPERVISOR] },
      { href: '/operations/multi-agency', label: 'Multi-Agency', roles: OPS },
      { href: '/operations/surge', label: 'Surge Mode', roles: [SUPERVISOR] },
    ],
  },
  {
    label: 'Resources',
    items: [
      { href: '/organizations', label: 'Organizations', roles: [ORG_ADMIN, SYS_ADMIN] },
      { href: '/operations/fleet', label: 'Fleet & Units', roles: [DISPATCHER, SUPERVISOR, ORG_ADMIN, SYS_ADMIN] },
      { href: '/resources/requests', label: 'Requests', roles: [ORG_ADMIN] },
      { href: '/hospitals', label: 'Hospitals & Facilities', roles: [HOSPITAL_USER, DISPATCHER, SUPERVISOR, ORG_ADMIN, SYS_ADMIN] },
    ],
  },
  {
    label: 'Intelligence',
    items: [
      { href: '/analytics', label: 'Analytics', roles: [SUPERVISOR] },
      { href: '/operations/risk', label: 'Risk Map', roles: [SUPERVISOR] },
    ],
  },
  {
    label: 'Broadcast',
    items: [
      { href: '/announcements', label: 'Announcements', roles: [PUBLISHER] },
      { href: '/announcements/history', label: 'Publication History', roles: [PUBLISHER] },
      // The LGU account gets no new link: "Pending approval" is a filter on its page.
      { href: '/operations/approvals', label: 'Approvals', roles: [SUPERVISOR] },
    ],
  },
  {
    label: 'Records',
    items: [
      { href: '/operations/history', label: 'Incident History', roles: OPS },
    ],
  },
  {
    label: 'Administration',
    items: [
      { href: '/administration/users', label: 'Users & Accounts', roles: [SYS_ADMIN] },
      { href: '/administration/permissions', label: 'Roles & Permissions', roles: [SYS_ADMIN] },
      { href: '/administration/barangays', label: 'Barangay Directory', roles: [ORG_ADMIN, SYS_ADMIN] },
      // MOD-51 reference data; the Risk page itself stays Supervisor-only (Phase 5b).
      { href: '/administration/risk-areas', label: 'Risk Areas', roles: [SYS_ADMIN] },
      { href: '/audit', label: 'Audit Log', roles: [SYS_ADMIN] },
      { href: '/administration/security', label: 'Security Events', roles: [SYS_ADMIN] },
      { href: '/administration/integrations', label: 'Integrations', roles: [SYS_ADMIN] },
      { href: '/administration/config', label: 'Configuration', roles: [SYS_ADMIN] },
    ],
  },
  {
    // Every console role manages its own sign-in. The Hospital Portal has no sidebar,
    // so its users keep the shield link in the Topbar.
    label: 'Account',
    items: [
      { href: '/account/security', label: 'Account Security', roles: CONSOLE },
    ],
  },
];

/** The sidebar for one role: groups with at least one visible link. */
export function navForRole(role: string | undefined): NavGroup[] {
  if (!role) return [];
  return NAV_GROUPS.map((group) => ({
    label: group.label,
    items: group.items.filter((item) => item.roles.includes(role)),
  })).filter((group) => group.items.length > 0);
}

/** Roles whose console is one page show no sidebar (spec §7: Hospital Portal). */
const NO_SIDEBAR_ROLES: readonly string[] = [HOSPITAL_USER];

export function showsSidebar(role: string | undefined): boolean {
  return !!role && !NO_SIDEBAR_ROLES.includes(role);
}
