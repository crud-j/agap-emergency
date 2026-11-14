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
  // Dispatchers view it; risk-area management on it is the Supervisor's (API-enforced).
  { prefix: '/operations/risk', roles: OPS },
  // CRITICAL advisories awaiting MDRRMO approval (Phase 7).
  { prefix: '/operations/approvals', roles: [SUPERVISOR] },
  { prefix: '/analytics', roles: [SUPERVISOR] },

  // Fleet & Units. The System and Org Administrators see only its Registry tab.
  { prefix: '/operations/fleet', roles: [DISPATCHER, SUPERVISOR, ORG_ADMIN, SYS_ADMIN] },
  // Old Registry route; redirects to the Fleet & Units Registry tab.
  { prefix: '/resources', roles: [DISPATCHER, SUPERVISOR, ORG_ADMIN, SYS_ADMIN] },
  // Mutual-aid requests to answer for the Org Administrator's organization. The System
  // Administrator can view them read-only (GET /resources/requests already allows it).
  { prefix: '/resources/requests', roles: [ORG_ADMIN, SYS_ADMIN] },
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
  // ID reviews, PhilHealth ID and National ID (MOD-01, plan §7). The API also requires an Org Administrator's
  // organization to be MDRRMO; the sidebar link follows that (orgAdminOrgTypes below).
  { prefix: '/administration/id-reviews', roles: [ORG_ADMIN, SYS_ADMIN] },
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

/** A live count the sidebar shows next to a link (the Supervisor's inbox items). */
export type NavBadge = 'openEscalations' | 'pendingApprovals';

export interface NavLink {
  href: string;
  label: string;
  roles: readonly string[];
  exact?: boolean;
  /** An Org Administrator sees this link only when their organization is one of these types. */
  orgAdminOrgTypes?: readonly string[];
  badge?: NavBadge;
}

export interface NavGroup {
  label: string;
  items: NavLink[];
  /** Folded by default; one click opens it and the sidebar remembers that. */
  collapsible?: boolean;
  /** Opens by itself while an incident is under ICS command or surge mode is on. */
  opensDuringMajorIncident?: boolean;
}

/** Roles that use NAV_GROUPS: every console role except the Supervisor (SUPERVISOR_NAV_GROUPS). */
const NAV_ROLES = [DISPATCHER, ORG_ADMIN, PUBLISHER, SYS_ADMIN];

export const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Operations',
    items: [
      { href: '/dashboard', label: 'Dashboard', roles: NAV_ROLES, exact: true },
      { href: '/operations/incidents', label: 'Incident Queue', roles: [DISPATCHER] },
      { href: '/operations/triage', label: 'Triage', roles: [DISPATCHER] },
      // The live map and dispatch on one screen (/operations/map redirects here).
      { href: '/operations/dispatch', label: 'Live Dispatch', roles: [DISPATCHER] },
      { href: '/operations/risk', label: 'Risk Map', roles: [DISPATCHER] },
    ],
  },
  {
    label: 'Command',
    items: [
      { href: '/operations/multi-agency', label: 'Multi-Agency', roles: [DISPATCHER] },
    ],
  },
  {
    label: 'Resources',
    items: [
      { href: '/organizations', label: 'Organizations', roles: [ORG_ADMIN, SYS_ADMIN] },
      { href: '/operations/fleet', label: 'Fleet & Units', roles: [DISPATCHER, ORG_ADMIN, SYS_ADMIN] },
      { href: '/resources/requests', label: 'Requests', roles: [ORG_ADMIN, SYS_ADMIN] },
      { href: '/hospitals', label: 'Hospitals & Facilities', roles: [HOSPITAL_USER, DISPATCHER, ORG_ADMIN, SYS_ADMIN] },
    ],
  },
  {
    label: 'Broadcast',
    items: [
      { href: '/announcements', label: 'Announcements', roles: [PUBLISHER] },
      { href: '/announcements/history', label: 'Publication History', roles: [PUBLISHER] },
    ],
  },
  {
    label: 'Records',
    items: [
      { href: '/operations/history', label: 'Incident History', roles: [DISPATCHER] },
    ],
  },
  {
    label: 'Administration',
    items: [
      { href: '/administration/users', label: 'Users & Accounts', roles: [SYS_ADMIN] },
      { href: '/administration/permissions', label: 'Roles & Permissions', roles: [SYS_ADMIN] },
      { href: '/administration/barangays', label: 'Barangay Directory', roles: [ORG_ADMIN, SYS_ADMIN] },
      // Reviewers: System Administrator and MDRRMO Org Administrators (Part B Q1).
      { href: '/administration/id-reviews', label: 'ID Reviews', roles: [ORG_ADMIN, SYS_ADMIN], orgAdminOrgTypes: ['MDRRMO'] },
      // MOD-51: read-only list for support. Supervisors manage risk areas on the Risk Map;
      // the System Administrator has no Risk Map (Phase 5b).
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
      { href: '/account/security', label: 'Account Security', roles: NAV_ROLES },
    ],
  },
];

const S = [SUPERVISOR];

/**
 * The Supervisor's sidebar. They keep every Dispatcher page (a Supervisor alone on a
 * night shift must still dispatch), but their daily work is oversight, so only that
 * shows up front. The rest sits in folded groups, one click away. Folding changes
 * nothing about what the Supervisor may open (ROUTE_ROLES above is unchanged).
 */
export const SUPERVISOR_NAV_GROUPS: NavGroup[] = [
  {
    label: 'Oversight',
    items: [
      { href: '/dashboard', label: 'Dashboard', roles: S, exact: true },
      { href: '/operations/escalations', label: 'Escalations', roles: S, badge: 'openEscalations' },
      // CRITICAL advisories awaiting MDRRMO approval (Phase 7).
      { href: '/operations/approvals', label: 'Approvals', roles: S, badge: 'pendingApprovals' },
      // Opens on its Responding list without new-incident alerts (oversight first); the
      // Waiting list and every dispatch action stay one tab away.
      { href: '/operations/dispatch', label: 'Live Dispatch', roles: S },
    ],
  },
  {
    label: 'Take Over Dispatch',
    collapsible: true,
    items: [
      { href: '/operations/incidents', label: 'Incident Queue', roles: S },
      { href: '/operations/triage', label: 'Triage', roles: S },
    ],
  },
  {
    label: 'Major Incident',
    collapsible: true,
    opensDuringMajorIncident: true,
    items: [
      { href: '/operations/command', label: 'Command / ICS', roles: S },
      { href: '/operations/multi-agency', label: 'Multi-Agency', roles: S },
      { href: '/operations/surge', label: 'Surge Mode', roles: S },
    ],
  },
  {
    label: 'Reports',
    collapsible: true,
    items: [
      { href: '/analytics', label: 'Analytics', roles: S },
      { href: '/operations/risk', label: 'Risk Map', roles: S },
      // Same page as the System Administrator's Audit Log, named for its audience.
      { href: '/audit', label: 'Activity Log', roles: S },
      { href: '/operations/history', label: 'Incident History', roles: S },
    ],
  },
  {
    label: 'Resources',
    collapsible: true,
    items: [
      { href: '/operations/fleet', label: 'Fleet & Units', roles: S },
      { href: '/hospitals', label: 'Hospitals & Facilities', roles: S },
    ],
  },
  {
    label: 'Account',
    items: [
      { href: '/account/security', label: 'Account Security', roles: S },
    ],
  },
];

/** Every sidebar definition, for checks that must cover all of them. */
export const ALL_NAV_GROUPS: NavGroup[] = [...NAV_GROUPS, ...SUPERVISOR_NAV_GROUPS];

function showsLink(item: NavLink, role: string, orgType: string | undefined): boolean {
  if (!item.roles.includes(role)) return false;
  if (role === ORG_ADMIN && item.orgAdminOrgTypes) return !!orgType && item.orgAdminOrgTypes.includes(orgType);
  return true;
}

/** The sidebar for one role (and, for Org Administrators, their organization type): groups with at least one visible link. */
export function navForRole(role: string | undefined, orgType?: string): NavGroup[] {
  if (!role) return [];
  const source = role === SUPERVISOR ? SUPERVISOR_NAV_GROUPS : NAV_GROUPS;
  return source
    .map((group) => ({ ...group, items: group.items.filter((item) => showsLink(item, role, orgType)) }))
    .filter((group) => group.items.length > 0);
}

/** Roles whose console is one page show no sidebar (spec §7: Hospital Portal). */
const NO_SIDEBAR_ROLES: readonly string[] = [HOSPITAL_USER];

export function showsSidebar(role: string | undefined): boolean {
  return !!role && !NO_SIDEBAR_ROLES.includes(role);
}
