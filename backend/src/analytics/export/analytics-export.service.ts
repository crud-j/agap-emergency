import { BadRequestException, Injectable } from '@nestjs/common';
import { AuditAction } from '@agap/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { AnalyticsService, manilaDateKey, type AnalyticsDateRange } from '../analytics.service';
import { toCsv, type CsvCell } from './csv';

/**
 * MOD-50 analytics CSV export: a backup of what the Analytics page shows.
 *
 *   summary   — the page's aggregates (totals, SLA, volume, response times) plus
 *               dispatches per unit, as one long-format table: section,item,metric,value.
 *   incidents — one row per reported incident in the range: the raw figures the
 *               aggregates are computed from.
 *
 * Neither file carries names, phone numbers, addresses, coordinates, free-text
 * descriptions or medical data. Barangay is the finest location given (the same
 * level the municipal overview shows). Every export is audited as DATA_EXPORT,
 * fail-closed: if the audit row cannot be written, no file is returned.
 */
export const ANALYTICS_EXPORT_DATASETS = ['summary', 'incidents'] as const;
export type AnalyticsExportDataset = (typeof ANALYTICS_EXPORT_DATASETS)[number];

/** One year: covers every range the page offers with room for an annual backup. */
export const MAX_EXPORT_RANGE_DAYS = 366;
/** Above this the request is refused rather than silently cut short. */
export const MAX_EXPORT_INCIDENT_ROWS = 50_000;

const DAY_MS = 24 * 60 * 60 * 1000;
// Fallbacks used when no active sla_policies row matches; same as getSlaCompliance().
const DEFAULT_ACK_SLA_SECS = 120;
const DEFAULT_DISPATCH_SLA_SECS = 300;

export interface AnalyticsExportActor {
  id: string;
  role: string;
  ipAddress?: string | undefined;
  userAgent?: string | undefined;
}

export interface AnalyticsExportFile {
  filename: string;
  content: string;
  rows: number;
}

export const INCIDENT_EXPORT_HEADER = [
  'reference',
  'category',
  'priority',
  'status',
  'trigger_method',
  'surge_incident',
  'patients',
  'barangay',
  'municipality',
  'submitted_at',
  'acknowledged_at',
  'dispatched_at',
  'on_scene_at',
  'resolved_at',
  'closed_at',
  'acknowledge_secs',
  'dispatch_secs',
  'on_scene_secs',
  'resolve_secs',
  'acknowledge_sla_secs',
  'acknowledge_sla_met',
  'dispatch_sla_secs',
  'dispatch_sla_met',
  'false_alert_type',
  'dispatches',
] as const;

export const SUMMARY_EXPORT_HEADER = ['section', 'item', 'metric', 'value'] as const;

interface IncidentExportRow {
  reference: string;
  category: string;
  priority: string;
  status: string;
  trigger_method: string;
  surge_incident: boolean;
  patients: number | null;
  barangay: string | null;
  municipality: string | null;
  submitted_at: Date;
  acknowledged_at: Date | null;
  dispatched_at: Date | null;
  on_scene_at: Date | null;
  resolved_at: Date | null;
  closed_at: Date | null;
  acknowledge_secs: unknown;
  dispatch_secs: unknown;
  on_scene_secs: unknown;
  resolve_secs: unknown;
  acknowledge_sla_secs: number;
  dispatch_sla_secs: number;
  false_alert_type: string | null;
  dispatches: number;
}

interface UnitUtilizationRow {
  name: string;
  call_sign: string | null;
  resource_type: string;
  dispatches: number;
}

function seconds(value: unknown): number | null {
  return value === null || value === undefined ? null : Math.round(Number(value));
}

/** yes / no when the step happened, blank when it has not (not measured). */
function slaMet(elapsed: number | null, threshold: number): boolean | null {
  return elapsed === null ? null : elapsed <= threshold;
}

export function assertExportRange(range: AnalyticsDateRange): void {
  if (range.to.getTime() - range.from.getTime() > MAX_EXPORT_RANGE_DAYS * DAY_MS) {
    throw new BadRequestException(`An export can cover at most ${MAX_EXPORT_RANGE_DAYS} days.`);
  }
}

export function exportFilename(dataset: AnalyticsExportDataset, range: AnalyticsDateRange): string {
  return `agap-analytics-${dataset}_${manilaDateKey(range.from)}_to_${manilaDateKey(range.to)}.csv`;
}

@Injectable()
export class AnalyticsExportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly analytics: AnalyticsService,
    private readonly audit: AuditService,
  ) {}

  async export(
    dataset: AnalyticsExportDataset,
    range: AnalyticsDateRange,
    actor: AnalyticsExportActor,
    now: Date = new Date(),
  ): Promise<AnalyticsExportFile> {
    assertExportRange(range);
    const { content, rows } =
      dataset === 'incidents' ? await this.incidentsCsv(range) : await this.summaryCsv(range, actor, now);
    const filename = exportFilename(dataset, range);

    // Fail-closed: a bulk export that is not on the audit trail must not leave the server.
    await this.prisma.$transaction((tx) =>
      this.audit.logInTransaction(tx, {
        action: AuditAction.DATA_EXPORT,
        actorId: actor.id,
        actorRole: actor.role,
        entityType: 'analytics_export',
        moduleId: 'MOD-50',
        newValues: {
          dataset,
          from: range.from.toISOString(),
          to: range.to.toISOString(),
          rows,
          filename,
        },
        ipAddress: actor.ipAddress,
        userAgent: actor.userAgent,
      }),
    );

    return { filename, content, rows };
  }

  /** Long format so every section fits one table and pivots cleanly in a spreadsheet. */
  async summaryCsv(
    range: AnalyticsDateRange,
    actor: Pick<AnalyticsExportActor, 'role'>,
    now: Date = new Date(),
  ): Promise<{ content: string; rows: number }> {
    const [volume, sla, falseRate, responseTimes, units] = await Promise.all([
      this.analytics.getVolume(range),
      this.analytics.getSlaCompliance(range),
      this.analytics.getFalseAlertRate(range),
      this.analytics.getResponseTimes(range),
      this.unitUtilization(range),
    ]);

    const rows: CsvCell[][] = [
      ['report', 'AGAP Emergency Response Analytics', 'generated_at', now],
      ['report', '', 'generated_by_role', actor.role],
      ['report', '', 'range_from', range.from],
      ['report', '', 'range_to', range.to],
      ['report', '', 'excludes', 'DRAFT and DUPLICATE incidents'],

      ['totals', '', 'reported_incidents', falseRate.totalIncidents],
      ['totals', '', 'false_alerts', falseRate.falseAlerts],
      ['totals', '', 'false_alert_rate_pct', falseRate.ratePct],

      ['sla', '', 'incidents_measured', sla.total],
      ['sla', 'acknowledge', 'met', sla.acknowledgeSlaMet],
      ['sla', 'acknowledge', 'compliance_pct', sla.acknowledgeCompliancePct],
      ['sla', 'dispatch', 'met', sla.dispatchSlaMet],
      ['sla', 'dispatch', 'compliance_pct', sla.dispatchCompliancePct],

      ...volume.byCategory.map((g): CsvCell[] => ['volume_by_category', g.category, 'incidents', g._count._all]),
      ...volume.byStatus.map((g): CsvCell[] => ['volume_by_status', g.status, 'incidents', g._count._all]),

      ...responseTimes.flatMap((g): CsvCell[][] => [
        ['response_times', g.category, 'incidents', g._count._all],
        ['response_times', g.category, 'avg_acknowledge_secs', g._avg.acknowledge_duration_secs],
        ['response_times', g.category, 'avg_dispatch_secs', g._avg.dispatch_duration_secs],
        ['response_times', g.category, 'avg_on_scene_secs', g._avg.response_duration_secs],
        ['response_times', g.category, 'avg_resolve_secs', g._avg.total_duration_secs],
      ]),

      ...units.map((u): CsvCell[] => [
        'unit_dispatches',
        u.call_sign ? `${u.name} (${u.call_sign})` : u.name,
        `dispatches_${u.resource_type.toLowerCase()}`,
        Number(u.dispatches),
      ]),
    ];

    return { content: toCsv(SUMMARY_EXPORT_HEADER, rows), rows: rows.length };
  }

  async incidentsCsv(range: AnalyticsDateRange): Promise<{ content: string; rows: number }> {
    // Same population as the page (submitted in range, not DRAFT / DUPLICATE) and the
    // same SLA policy pick as getSlaCompliance(), so the rows add up to the summary.
    const rows = await this.prisma.$queryRaw<IncidentExportRow[]>`
      SELECT i.public_reference AS reference,
             i.category::text AS category,
             i.priority::text AS priority,
             i.status::text AS status,
             i.trigger_method::text AS trigger_method,
             i.is_surge_incident AS surge_incident,
             i.number_of_patients::int AS patients,
             l.barangay,
             l.municipality,
             i.submitted_at, i.acknowledged_at, i.dispatched_at, i.on_scene_at, i.resolved_at, i.closed_at,
             EXTRACT(EPOCH FROM (i.acknowledged_at - i.submitted_at)) AS acknowledge_secs,
             EXTRACT(EPOCH FROM (i.dispatched_at - i.submitted_at))   AS dispatch_secs,
             EXTRACT(EPOCH FROM (i.on_scene_at - i.submitted_at))     AS on_scene_secs,
             EXTRACT(EPOCH FROM (i.resolved_at - i.submitted_at))     AS resolve_secs,
             COALESCE(sla.acknowledge_threshold_secs, ${DEFAULT_ACK_SLA_SECS})::int AS acknowledge_sla_secs,
             COALESCE(sla.dispatch_threshold_secs, ${DEFAULT_DISPATCH_SLA_SECS})::int AS dispatch_sla_secs,
             fa.false_alert_type,
             (SELECT COUNT(*)::int FROM dispatches d WHERE d.incident_id = i.id) AS dispatches
        FROM incidents i
        LEFT JOIN incident_locations l ON l.incident_id = i.id
        LEFT JOIN LATERAL (
          SELECT p.acknowledge_threshold_secs, p.dispatch_threshold_secs
            FROM sla_policies p
           WHERE p.is_active = true
             AND (p.incident_category IS NULL OR p.incident_category = i.category)
             AND (p.priority IS NULL OR p.priority = i.priority)
           ORDER BY
             CASE WHEN p.incident_category IS NOT NULL AND p.priority IS NOT NULL THEN 2
                  WHEN p.incident_category IS NOT NULL OR p.priority IS NOT NULL THEN 1
                  ELSE 0 END DESC,
             p.created_at DESC
           LIMIT 1
        ) sla ON true
        LEFT JOIN LATERAL (
          SELECT f.false_alert_type::text AS false_alert_type
            FROM false_alerts f
           WHERE f.incident_id = i.id
           ORDER BY f.classified_at DESC
           LIMIT 1
        ) fa ON true
       WHERE i.submitted_at >= ${range.from}
         AND i.submitted_at < ${range.to}
         AND i.status::text NOT IN ('DRAFT', 'DUPLICATE')
       ORDER BY i.submitted_at ASC, i.public_reference ASC
       LIMIT ${MAX_EXPORT_INCIDENT_ROWS + 1}`;

    if (rows.length > MAX_EXPORT_INCIDENT_ROWS) {
      throw new BadRequestException(
        `More than ${MAX_EXPORT_INCIDENT_ROWS} incidents in this range. Export a shorter range.`,
      );
    }

    const body = rows.map((r): CsvCell[] => {
      const ack = seconds(r.acknowledge_secs);
      const dispatch = seconds(r.dispatch_secs);
      const ackSla = Number(r.acknowledge_sla_secs);
      const dispatchSla = Number(r.dispatch_sla_secs);
      return [
        r.reference,
        r.category,
        r.priority,
        r.status,
        r.trigger_method,
        r.surge_incident,
        r.patients === null ? null : Number(r.patients),
        r.barangay,
        r.municipality,
        r.submitted_at,
        r.acknowledged_at,
        r.dispatched_at,
        r.on_scene_at,
        r.resolved_at,
        r.closed_at,
        ack,
        dispatch,
        seconds(r.on_scene_secs),
        seconds(r.resolve_secs),
        ackSla,
        slaMet(ack, ackSla),
        dispatchSla,
        slaMet(dispatch, dispatchSla),
        r.false_alert_type,
        Number(r.dispatches),
      ];
    });

    return { content: toCsv(INCIDENT_EXPORT_HEADER, body), rows: body.length };
  }

  /** Dispatches per unit for incidents submitted in the range, by unit name (no internal IDs). */
  private unitUtilization(range: AnalyticsDateRange): Promise<UnitUtilizationRow[]> {
    return this.prisma.$queryRaw<UnitUtilizationRow[]>`
      SELECT r.name, r.call_sign, r.resource_type::text AS resource_type, COUNT(*)::int AS dispatches
        FROM dispatches d
        JOIN incidents i ON i.id = d.incident_id
        JOIN resources r ON r.id = d.resource_id
       WHERE i.submitted_at >= ${range.from}
         AND i.submitted_at < ${range.to}
       GROUP BY r.id, r.name, r.call_sign, r.resource_type
       ORDER BY dispatches DESC, r.name ASC`;
  }
}
