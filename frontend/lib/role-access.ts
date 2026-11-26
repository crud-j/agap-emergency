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
  // MOD-41 response targets: the escalation alarm and Analytics read them (API-enforced).
  { prefix: '/operations/sla-targets', roles: [SUPERVISOR, SYS_ADMIN] },
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

/**
 * Roles that use NAV_GROUPS. The Supervisor (SUPERVISOR_NAV_GROUPS) and the System
 * Administrator (ADMIN_NAV_GROUPS) have their own sidebars.
 */
const NAV_ROLES = [DISPATCHER, ORG_ADMIN, PUBLISHER];

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
      { href: '/organizations', label: 'Organizations', roles: [ORG_ADMIN] },
      { href: '/operations/fleet', label: 'Fleet & Units', roles: [DISPATCHER, ORG_ADMIN] },
      { href: '/resources/requests', label: 'Requests', roles: [ORG_ADMIN] },
      { href: '/hospitals', label: 'Hospitals & Facilities', roles: [HOSPITAL_USER, DISPATCHER, ORG_ADMIN] },
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
      { href: '/administration/barangays', label: 'Barangay Directory', roles: [ORG_ADMIN] },
      // Reviewers: System Administrator and MDRRMO Org Administrators (Part B Q1).
      { href: '/administration/id-reviews', label: 'ID Reviews', roles: [ORG_ADMIN], orgAdminOrgTypes: ['MDRRMO'] },
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
      // The targets that raise those escalations (MOD-41).
      { href: '/operations/sla-targets', label: 'Response Targets', roles: S },
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

const A = [SYS_ADMIN];

/**
 * The System Administrator's sidebar: ten links in five groups. Related pages share one
 * link with tabs (Logs: activity, security events, SMS; Settings: configuration, response
 * targets, page access). The old addresses still open and redirect to the right tab.
 * Read-only operational lists (mutual-aid requests, risk areas) are not linked here;
 * their routes stay open to this role (ROUTE_ROLES is unchanged).
 */
export const ADMIN_NAV_GROUPS: NavGroup[] = [
  {
    label: 'Overview',
    items: [
      { href: '/dashboard', label: 'Dashboard', roles: A, exact: true },
    ],
  },
  {
    label: 'People',
    items: [
      { href: '/administration/users', label: 'Users & Accounts', roles: A },
      { href: '/administration/id-reviews', label: 'ID Reviews', roles: A },
    ],
  },
  {
    label: 'Reference Data',
    items: [
      { href: '/organizations', label: 'Organizations', roles: A },
      { href: '/hospitals', label: 'Hospitals & Facilities', roles: A },
      { href: '/operations/fleet', label: 'Fleet & Units', roles: A },
      { href: '/administration/barangays', label: 'Barangay Directory', roles: A },
    ],
  },
  {
    label: 'System',
    items: [
      { href: '/administration/logs', label: 'Logs', roles: A },
      { href: '/administration/settings', label: 'Settings', roles: A },
    ],
  },
  {
    label: 'Account',
    items: [
      { href: '/account/security', label: 'Account Security', roles: A },
    ],
  },
];

/** Every sidebar definition, for checks that must cover all of them. */
export const ALL_NAV_GROUPS: NavGroup[] = [...NAV_GROUPS, ...SUPERVISOR_NAV_GROUPS, ...ADMIN_NAV_GROUPS];

// ─── Page access table (MOD-47, read-only) ──────────────────────────────────────

/** The web console roles, in the order the access table shows them. */
export const ACCESS_ROLES: readonly { role: string; label: string }[] = [
  { role: DISPATCHER, label: 'Dispatcher' },
  { role: SUPERVISOR, label: 'Supervisor' },
  { role: HOSPITAL_USER, label: 'Hospital User' },
  { role: ORG_ADMIN, label: 'Org Admin' },
  { role: PUBLISHER, label: 'Publisher' },
  { role: SYS_ADMIN, label: 'System Admin' },
];

/** Every console page a person can open, grouped by area. Each sidebar link appears here (tested). */
export const ACCESS_PAGES: readonly { area: string; pages: readonly { href: string; label: string }[] }[] = [
  {
    area: 'Operations',
    pages: [
      { href: '/dashboard', label: 'Dashboard' },
      { href: '/operations/incidents', label: 'Incident Queue' },
      { href: '/operations/triage', label: 'Triage' },
      { href: '/operations/dispatch', label: 'Live Dispatch' },
      { href: '/operations/risk', label: 'Risk Map' },
      { href: '/operations/history', label: 'Incident History' },
    ],
  },
  {
    area: 'Oversight',
    pages: [
      { href: '/operations/escalations', label: 'Escalations' },
      { href: '/operations/approvals', label: 'Advisory Approvals' },
      { href: '/operations/sla-targets', label: 'Response Targets' },
      { href: '/analytics', label: 'Analytics' },
      { href: '/audit', label: 'Activity Log' },
    ],
  },
  {
    area: 'Major Incident',
    pages: [
      { href: '/operations/command', label: 'Command / ICS' },
      { href: '/operations/multi-agency', label: 'Multi-Agency' },
      { href: '/operations/surge', label: 'Surge Mode' },
    ],
  },
  {
    area: 'Resources',
    pages: [
      { href: '/organizations', label: 'Organizations' },
      { href: '/operations/fleet', label: 'Fleet & Units' },
      { href: '/resources/requests', label: 'Mutual-Aid Requests' },
      { href: '/hospitals', label: 'Hospitals & Facilities' },
    ],
  },
  {
    area: 'Broadcast',
    pages: [
      { href: '/announcements', label: 'Announcements' },
      { href: '/announcements/compose', label: 'Compose Announcement' },
      { href: '/announcements/history', label: 'Publication History' },
    ],
  },
  {
    area: 'Administration',
    pages: [
      { href: '/administration/users', label: 'Users & Accounts' },
      { href: '/administration/id-reviews', label: 'ID Reviews' },
      { href: '/administration/barangays', label: 'Barangay Directory' },
      { href: '/administration/risk-areas', label: 'Risk Areas (list)' },
      { href: '/administration/logs', label: 'Logs' },
      { href: '/administration/settings', label: 'Settings' },
    ],
  },
  {
    area: 'Account',
    pages: [
      { href: '/account/security', label: 'Account Security' },
    ],
  },
];

function showsLink(item: NavLink, role: string, orgType: string | undefined): boolean {
  if (!item.roles.includes(role)) return false;
  if (role === ORG_ADMIN && item.orgAdminOrgTypes) return !!orgType && item.orgAdminOrgTypes.includes(orgType);
  return true;
}

/** The sidebar for one role (and, for Org Administrators, their organization type): groups with at least one visible link. */
export function navForRole(role: string | undefined, orgType?: string): NavGroup[] {
  if (!role) return [];
  const source = role === SUPERVISOR ? SUPERVISOR_NAV_GROUPS : role === SYS_ADMIN ? ADMIN_NAV_GROUPS : NAV_GROUPS;
  return source
    .map((group) => ({ ...group, items: group.items.filter((item) => showsLink(item, role, orgType)) }))
    .filter((group) => group.items.length > 0);
}

/** Roles whose console is one page show no sidebar (spec §7: Hospital Portal). */
const NO_SIDEBAR_ROLES: readonly string[] = [HOSPITAL_USER];

export function showsSidebar(role: string | undefined): boolean {
  return !!role && !NO_SIDEBAR_ROLES.includes(role);
}
