import { Injectable } from '@nestjs/common';
import { Prisma, incident_status, user_role, user_status } from '@prisma/client';
import { ACTIVE_INCIDENT_STATUSES, ACTIVE_RESPONSE_INCIDENT_STATUSES } from '@agap/shared';
import { PrismaService } from '../common/prisma/prisma.service';
import { BLOCKED_ACCOUNT_STATUSES } from '../auth/account-status';
import { AnalyticsService, IncidentPerformance, UnitCounts, manilaMidnight } from '../analytics/analytics.service';

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;
const LIST_LIMIT = 50;

const ACTIVE = [...ACTIVE_INCIDENT_STATUSES] as incident_status[];
const RESPONDING = [...ACTIVE_RESPONSE_INCIDENT_STATUSES] as incident_status[];
const NOT_ACKNOWLEDGED: incident_status[] = ['SUBMITTED', 'RECEIVED'];
/** Ended incidents: a pending handover on one of these needs no action. */
const ENDED: incident_status[] = ['CLOSED', 'CANCELLED', 'FALSE_ALERT', 'DUPLICATE'];
/** Dispatches still holding a unit (SENT is in the enum but never written today). */
const OPEN_DISPATCH = ['PENDING', 'SENT', 'ACCEPTED'] as const;
const STAFF_ROLES: user_role[] = ['DISPATCHER', 'SUPERVISOR'];

/** system_configurations keys an administrator can set; a missing or invalid row means 5 minutes. */
export const OVERSIGHT_CONFIG = {
  waitingMinutes: 'oversight.waiting_minutes',
  staleLocationMinutes: 'oversight.stale_location_minutes',
} as const;
const DEFAULT_MINUTES = 5;

/** config_value is JSON: accept 7 or "7"; anything outside 1–240 falls back to the default. */
export function minutesFrom(value: Prisma.JsonValue | undefined): number {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  return Number.isInteger(n) && n >= 1 && n <= 240 ? n : DEFAULT_MINUTES;
}

export interface OversightSummary {
  generatedAt: string;
  active: number;
  critical: number;
  enRoute: number;
  onScene: number;
  resolvedToday: number;
  openEscalations: number;
  unacknowledged: number;
  units: UnitCounts;
  performance7d: IncidentPerformance;
}

export interface WorkloadRow {
  userId: string;
  name: string;
  role: user_role;
  openDispatches: number;
  openIncidents: number;
  actionsLastHour: number;
}

export interface OversightExceptions {
  generatedAt: string;
  thresholds: { waitingMinutes: number; staleLocationMinutes: number };
  waiting: {
    incidentId: string;
    publicReference: string;
    category: string;
    priority: string;
    status: string;
    submittedAt: string;
    waitingSec: number;
  }[];
  rejected: {
    dispatchId: string;
    incidentId: string;
    publicReference: string;
    unit: string;
    rejectedAt: string;
    reason: string | null;
    /** The incident already has another open dispatch. */
    reassigned: boolean;
  }[];
  staleLocation: {
    dispatchId: string;
    incidentId: string;
    publicReference: string;
    unit: string;
    /** Newest crew position for this incident; null if the crew never shared one. */
    lastSeenAt: string | null;
    silentSec: number;
  }[];
}

export interface PendingHandover {
  id: string;
  incidentId: string;
  publicReference: string;
  incidentStatus: string;
  from: { id: string; name: string; role: user_role };
  to: { id: string; name: string; role: user_role };
  handedOverAt: string;
  pendingActionCount: number;
}

export interface ActivityItem {
  id: string;
  incidentId: string;
  publicReference: string;
  fromStatus: string | null;
  toStatus: string;
  actor: { id: string; name: string; role: user_role } | null;
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

/**
 * Supervisor oversight (MOD-21, MOD-41, MOD-44). Read-only: every figure is
 * computed from rows the operational modules already persist; nothing here writes.
 */
@Injectable()
export class OversightService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly analytics: AnalyticsService,
  ) {}

  async getThresholds(): Promise<OversightExceptions['thresholds']> {
    const rows = await this.prisma.system_configurations.findMany({
      where: { config_key: { in: Object.values(OVERSIGHT_CONFIG) } },
      select: { config_key: true, config_value: true },
    });
    const value = (key: string) => rows.find((r) => r.config_key === key)?.config_value;
    return {
      waitingMinutes: minutesFrom(value(OVERSIGHT_CONFIG.waitingMinutes)),
      staleLocationMinutes: minutesFrom(value(OVERSIGHT_CONFIG.staleLocationMinutes)),
    };
  }

  async getSummary(now: Date = new Date()): Promise<OversightSummary> {
    const [byStatus, critical, resolvedToday, openEscalations, units, performance7d] = await Promise.all([
      this.prisma.incident.groupBy({
        by: ['status'],
        where: { status: { in: ACTIVE } },
        orderBy: { status: 'asc' },
        _count: { _all: true },
      }),
      this.prisma.incident.count({ where: { status: { in: ACTIVE }, priority: 'CRITICAL' } }),
      this.prisma.incident.count({ where: { resolved_at: { gte: manilaMidnight(now) } } }),
      this.prisma.escalation.count({ where: { status: { in: ['ACTIVE', 'ACKNOWLEDGED'] } } }),
      this.analytics.getUnitCounts(),
      this.analytics.getPerformanceFromIncidents(new Date(now.getTime() - 7 * DAY_MS)),
    ]);

    const inStatus = (statuses: incident_status[]) =>
      byStatus.filter((r) => statuses.includes(r.status)).reduce((sum, r) => sum + r._count._all, 0);

    return {
      generatedAt: now.toISOString(),
      active: inStatus(ACTIVE),
      critical,
      enRoute: inStatus(['EN_ROUTE']),
      onScene: inStatus(['ON_SCENE']),
      resolvedToday,
      openEscalations,
      unacknowledged: inStatus(NOT_ACKNOWLEDGED),
      units,
      performance7d,
    };
  }

  /**
   * Per Dispatcher and Supervisor: open dispatches they authorized on active
   * incidents (and how many distinct incidents those cover), and incident actions
   * they took in the last hour. Active staff with nothing open are listed too.
   */
  async getWorkload(now: Date = new Date()): Promise<WorkloadRow[]> {
    const hourAgo = new Date(now.getTime() - 60 * MINUTE_MS);
    const [open, actions] = await Promise.all([
      this.prisma.$queryRaw<{ dispatcher_id: string; open_dispatches: number; open_incidents: number }[]>`
        SELECT d.dispatcher_id,
               COUNT(*)::int                    AS open_dispatches,
               COUNT(DISTINCT d.incident_id)::int AS open_incidents
          FROM dispatches d
          JOIN incidents i ON i.id = d.incident_id
         WHERE d.status::text IN (${Prisma.join([...OPEN_DISPATCH])})
           AND i.status::text IN (${Prisma.join(ACTIVE)})
         GROUP BY d.dispatcher_id`,
      this.prisma.incidentEvent.groupBy({
        by: ['triggered_by_id'],
        where: { occurred_at: { gte: hourAgo }, triggered_by_id: { not: null } },
        orderBy: { triggered_by_id: 'asc' },
        _count: { _all: true },
      }),
    ]);

    const openBy = new Map(open.map((r) => [r.dispatcher_id, r]));
    const actionsBy = new Map(actions.map((r) => [r.triggered_by_id as string, r._count._all]));

    const staff = await this.prisma.user.findMany({
      where: {
        role: { in: STAFF_ROLES },
        // Staff who can sign in (account-status.ts), plus anyone still holding open incidents.
        OR: [
          { status: { notIn: [...BLOCKED_ACCOUNT_STATUSES] as user_status[] } },
          { id: { in: [...openBy.keys()] } },
        ],
      },
      select: { id: true, full_name: true, role: true },
    });

    return staff
      .map((u) => ({
        userId: u.id,
        name: u.full_name,
        role: u.role,
        openDispatches: Number(openBy.get(u.id)?.open_dispatches ?? 0),
        openIncidents: Number(openBy.get(u.id)?.open_incidents ?? 0),
        actionsLastHour: actionsBy.get(u.id) ?? 0,
      }))
      .sort((a, b) =>
        b.openDispatches - a.openDispatches || b.actionsLastHour - a.actionsLastHour || a.name.localeCompare(b.name),
      );
  }

  async getExceptions(now: Date = new Date()): Promise<OversightExceptions> {
    const thresholds = await this.getThresholds();
    const waitingCutoff = new Date(now.getTime() - thresholds.waitingMinutes * MINUTE_MS);
    const staleCutoff = new Date(now.getTime() - thresholds.staleLocationMinutes * MINUTE_MS);

    const [waiting, rejected, stale] = await Promise.all([
      this.prisma.incident.findMany({
        where: { status: { in: NOT_ACKNOWLEDGED }, submitted_at: { lt: waitingCutoff } },
        orderBy: { submitted_at: 'asc' },
        take: LIST_LIMIT,
        select: { id: true, public_reference: true, category: true, priority: true, status: true, submitted_at: true },
      }),
      this.prisma.dispatches.findMany({
        where: { status: 'REJECTED', rejected_at: { not: null }, incidents: { status: { in: ACTIVE } } },
        orderBy: { rejected_at: 'desc' },
        take: LIST_LIMIT,
        select: {
          id: true,
          rejected_at: true,
          rejected_reason: true,
          resources: { select: { call_sign: true, name: true } },
          incidents: {
            select: {
              id: true,
              public_reference: true,
              dispatches: { where: { status: { in: [...OPEN_DISPATCH] } }, select: { id: true } },
            },
          },
        },
      }),
      // location_history rows carry incident_id + user_id (the responder); resource_id is
      // not filled by the tracking endpoints, so a unit's newest position is its crew's
      // newest point on that incident. resource_id is matched too, for rows that set it.
      this.prisma.$queryRaw<{
        dispatch_id: string;
        incident_id: string;
        public_reference: string;
        unit: string;
        last_seen: Date | null;
        since: Date;
      }[]>`
        SELECT d.id AS dispatch_id,
               d.incident_id,
               i.public_reference,
               COALESCE(r.call_sign, r.name) AS unit,
               last.recorded_at AS last_seen,
               COALESCE(last.recorded_at, d.accepted_at, d.authorized_at) AS since
          FROM dispatches d
          JOIN incidents i ON i.id = d.incident_id
          JOIN resources r ON r.id = d.resource_id
          LEFT JOIN LATERAL (
                SELECT MAX(lh.recorded_at) AS recorded_at
                  FROM location_history lh
                 WHERE lh.incident_id = d.incident_id
                   AND (lh.resource_id = d.resource_id
                        OR EXISTS (SELECT 1 FROM dispatch_crew dc
                                    WHERE dc.dispatch_id = d.id AND dc.user_id = lh.user_id))
          ) last ON TRUE
         WHERE d.status = 'ACCEPTED'
           AND i.status::text IN (${Prisma.join(RESPONDING)})
           AND COALESCE(last.recorded_at, d.accepted_at, d.authorized_at) < ${staleCutoff}
         ORDER BY since ASC
         LIMIT ${LIST_LIMIT}`,
    ]);

    const secondsSince = (at: Date) => Math.max(0, Math.round((now.getTime() - at.getTime()) / 1000));

    return {
      generatedAt: now.toISOString(),
      thresholds,
      waiting: waiting.map((i) => ({
        incidentId: i.id,
        publicReference: i.public_reference,
        category: i.category,
        priority: i.priority,
        status: i.status,
        submittedAt: i.submitted_at.toISOString(),
        waitingSec: secondsSince(i.submitted_at),
      })),
      rejected: rejected
        .map((d) => ({
          dispatchId: d.id,
          incidentId: d.incidents.id,
          publicReference: d.incidents.public_reference,
          unit: d.resources.call_sign ?? d.resources.name,
          rejectedAt: (d.rejected_at as Date).toISOString(),
          reason: d.rejected_reason,
          reassigned: d.incidents.dispatches.length > 0,
        }))
        // Rejections nobody has covered yet come first.
        .sort((a, b) => Number(a.reassigned) - Number(b.reassigned)),
      staleLocation: stale.map((s) => ({
        dispatchId: s.dispatch_id,
        incidentId: s.incident_id,
        publicReference: s.public_reference,
        unit: s.unit,
        lastSeenAt: s.last_seen ? new Date(s.last_seen).toISOString() : null,
        silentSec: secondsSince(new Date(s.since)),
      })),
    };
  }

  /** Person-to-person handovers not yet acknowledged, on incidents that haven't ended. */
  async getPendingHandovers(): Promise<PendingHandover[]> {
    const rows = await this.prisma.incident_handovers.findMany({
      where: { acknowledged_at: null, incidents: { status: { notIn: ENDED } } },
      orderBy: { handed_over_at: 'asc' },
      take: LIST_LIMIT,
      select: {
        id: true,
        handed_over_at: true,
        pending_actions: true,
        incidents: { select: { id: true, public_reference: true, status: true } },
        users_incident_handovers_from_user_idTousers: { select: { id: true, full_name: true, role: true } },
        users_incident_handovers_to_user_idTousers: { select: { id: true, full_name: true, role: true } },
      },
    });
    return rows.map((h) => {
      const from = h.users_incident_handovers_from_user_idTousers;
      const to = h.users_incident_handovers_to_user_idTousers;
      return {
        id: h.id,
        incidentId: h.incidents.id,
        publicReference: h.incidents.public_reference,
        incidentStatus: h.incidents.status,
        from: { id: from.id, name: from.full_name, role: from.role },
        to: { id: to.id, name: to.full_name, role: to.role },
        handedOverAt: h.handed_over_at.toISOString(),
        pendingActionCount: h.pending_actions.length,
      };
    });
  }

  /**
   * Latest incident lifecycle events: status changes, triage and dispatch decisions
   * (incident_events; these transitions are not written to audit_logs). Notes are
   * left out: responders' free text can carry patient details.
   */
  async getActivity(limit = 20): Promise<ActivityItem[]> {
    const rows = await this.prisma.incidentEvent.findMany({
      orderBy: { occurred_at: 'desc' },
      take: Math.min(Math.max(limit, 1), LIST_LIMIT),
      select: {
        id: true,
        from_status: true,
        to_status: true,
        occurred_at: true,
        incidents: { select: { id: true, public_reference: true } },
        users: { select: { id: true, full_name: true, role: true } },
      },
    });
    return rows.map((e) => ({
      id: e.id,
      incidentId: e.incidents.id,
      publicReference: e.incidents.public_reference,
      fromStatus: e.from_status,
      toStatus: e.to_status,
      actor: e.users ? { id: e.users.id, name: e.users.full_name, role: e.users.role } : null,
      occurredAt: e.occurred_at.toISOString(),
    }));
  }

  /** Active incidents under ICS command or attached to an active surge (Command / ICS page). */
  async getMajorIncidents(): Promise<MajorIncident[]> {
    const rows = await this.prisma.incident.findMany({
      where: {
        status: { in: ACTIVE },
        OR: [
          { incident_command_structures: { is: { deactivated_at: null } } },
          { surge_incidents: { is: { status: 'ACTIVE' } } },
        ],
      },
      orderBy: [{ priority: 'asc' }, { submitted_at: 'asc' }],
      take: LIST_LIMIT,
      select: {
        id: true,
        public_reference: true,
        category: true,
        priority: true,
        status: true,
        incident_locations: { select: { barangay: true } },
        incident_command_structures: {
          select: {
            activated_at: true,
            deactivated_at: true,
            ics_assignments: { where: { relieved_at: null }, select: { id: true } },
          },
        },
        surge_incidents: { select: { name: true, status: true } },
        incident_agency_participants: { where: { left_at: null }, select: { id: true } },
      },
    });
    return rows.map((i) => {
      const ics = i.incident_command_structures;
      const icsActive = !!ics && ics.deactivated_at === null;
      return {
        incidentId: i.id,
        publicReference: i.public_reference,
        category: i.category,
        priority: i.priority,
        status: i.status,
        barangay: i.incident_locations?.barangay ?? null,
        icsActive,
        icsActivatedAt: icsActive ? ics.activated_at.toISOString() : null,
        positionsFilled: icsActive ? ics.ics_assignments.length : 0,
        surgeName: i.surge_incidents?.status === 'ACTIVE' ? i.surge_incidents.name : null,
        agencies: i.incident_agency_participants.length,
      };
    });
  }
}
