import { BadRequestException, Injectable } from '@nestjs/common';
import { AuditAction } from '@agap/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { AnalyticsService, manilaDateKey, type AnalyticsDateRange } from '../analytics.service';
import { manilaReadable, toCsv, type CsvCell } from './csv';
import { FALLBACK_SLA_SECONDS, SLA_STEPS, formatTarget } from '../../sla-policies/sla-rules';
import {
  categoryLabel,
  falseAlertLabel,
  priorityLabel,
  roleLabel,
  statusLabel,
  triggerLabel,
  unitTypeLabel,
} from './labels';

/**
 * MOD-50 analytics CSV export: a backup of what the Analytics page shows.
 *
 *   summary   — a readable report: a title block, then titled sections (overview,
 *               response targets, incidents by category and status, average
 *               response times, unit deployments), each with its own headings.
 *   incidents — the incident list: one flat table, one row per reported incident,
 *               so it can be filtered and sorted. The summary is computed from it.
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
const [ACK_STEP, DISPATCH_STEP, ON_SCENE_STEP] = SLA_STEPS;
const NO_DATA = 'No data';

const FILE_PREFIX: Record<AnalyticsExportDataset, string> = {
  summary: 'AGAP-Analytics-Summary',
  incidents: 'AGAP-Incident-List',
};

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

/** Column headings of the incident list, in order. */
export const INCIDENT_EXPORT_HEADER = [
  'Reference No.',
  'Reported (Manila time)',
  'Category',
  'Priority',
  'Current Status',
  'How Reported',
  'Barangay',
  'Municipality',
  'Patients',
  'Surge / Mass-Casualty',
  'Acknowledged (Manila time)',
  'Dispatched (Manila time)',
  'Arrived On Scene (Manila time)',
  'Resolved (Manila time)',
  'Closed (Manila time)',
  'Minutes to Acknowledge',
  'Minutes to Dispatch',
  'Minutes to Arrive On Scene',
  'Minutes to Resolve',
  'Acknowledge Target (min)',
  'Acknowledge Target Result',
  'Dispatch Target (min)',
  'Dispatch Target Result',
  'On-Scene Target (min)',
  'On-Scene Target Result',
  'False Alert Reason',
  'Units Dispatched',
] as const;

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
  on_scene_sla_secs: number;
  false_alert_type: string | null;
  dispatches: number;
}

interface UnitUtilizationRow {
  name: string;
  call_sign: string | null;
  resource_type: string;
  dispatches: number;
}

/** Seconds (number or numeric string from Postgres) → minutes with one decimal; null stays null. */
export function minutes(secs: unknown): number | null {
  if (secs === null || secs === undefined) return null;
  const value = Number(secs);
  return Number.isFinite(value) ? Math.round(value / 6) / 10 : null;
}

function percent(part: number, whole: number): string {
  return whole > 0 ? `${Math.round((part / whole) * 100)}%` : NO_DATA;
}

/**
 * One step's result for one incident, by the same rules as getSlaCompliance():
 *  - the step happened → "Met" / "Missed";
 *  - still waiting for it → "Missed (overdue)" past the target, "Not yet due" before;
 *  - the incident ended without it → "Not acknowledged" / "Not dispatched" / ….
 */
export function targetResult(
  step: (typeof SLA_STEPS)[number],
  elapsedSecs: number | null,
  thresholdSecs: number,
  status: string,
  secsSinceReport: number,
): string {
  if (elapsedSecs !== null) return elapsedSecs <= thresholdSecs ? 'Met' : 'Missed';
  if (step.waitingStatuses.includes(status)) return secsSinceReport > thresholdSecs ? 'Missed (overdue)' : 'Not yet due';
  return `Not ${step.verb}`; // ended (or moved on) without the step
}

export function assertExportRange(range: AnalyticsDateRange): void {
  if (range.to.getTime() - range.from.getTime() > MAX_EXPORT_RANGE_DAYS * DAY_MS) {
    throw new BadRequestException(`An export can cover at most ${MAX_EXPORT_RANGE_DAYS} days. Choose a shorter period.`);
  }
}

export function exportFilename(dataset: AnalyticsExportDataset, range: AnalyticsDateRange): string {
  return `${FILE_PREFIX[dataset]}_${manilaDateKey(range.from)}_to_${manilaDateKey(range.to)}.csv`;
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
      dataset === 'incidents' ? await this.incidentsCsv(range, now) : await this.summaryCsv(range, actor, now);
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

  /**
   * A report laid out for people: title block, then one titled section per topic,
   * each with its own headings, separated by blank rows. `rows` counts data rows
   * (section lines, not headings or blanks) for the audit entry.
   */
  async summaryCsv(
    range: AnalyticsDateRange,
    actor: Pick<AnalyticsExportActor, 'role'>,
    now: Date = new Date(),
  ): Promise<{ content: string; rows: number }> {
    const [volume, sla, falseRate, responseTimes, units] = await Promise.all([
      this.analytics.getVolume(range),
      this.analytics.getSlaCompliance(range, now),
      this.analytics.getFalseAlertRate(range),
      this.analytics.getResponseTimes(range),
      this.unitUtilization(range),
    ]);

    const days = Math.round((range.to.getTime() - range.from.getTime()) / DAY_MS);
    const categoryTotal = volume.byCategory.reduce((sum, g) => sum + g._count._all, 0);
    const statusTotal = volume.byStatus.reduce((sum, g) => sum + g._count._all, 0);
    const sortedByCount = <T extends { _count: { _all: number } }>(groups: T[]) =>
      [...groups].sort((a, b) => b._count._all - a._count._all);

    let dataRows = 0;
    const out: CsvCell[][] = [];
    const section = (title: string, headings: CsvCell[], rows: CsvCell[][], emptyText: string, note?: string) => {
      out.push([], [title], headings);
      if (rows.length === 0) out.push([emptyText]);
      else out.push(...rows);
      if (note) out.push([note]);
      dataRows += rows.length;
    };

    out.push(
      ['AGAP Emergency Response Analytics - Summary Report'],
      ['Bocaue MDRRMO Operations Center'],
      [],
      ['Report period', `${manilaReadable(range.from)} to ${manilaReadable(range.to)} (${days} days, Manila time)`],
      ['Generated on', `${manilaReadable(now)} (Manila time)`],
      ['Generated by', roleLabel(actor.role)],
      ['What is counted', 'Incidents reported in the period. Drafts and merged duplicate reports are not counted.'],
      ['Privacy', 'Totals only. No names, contact details, exact locations or medical data.'],
    );

    section(
      'OVERVIEW',
      ['Measure', 'Value'],
      [
        ['Incidents reported', falseRate.totalIncidents],
        ['Confirmed false alerts', falseRate.falseAlerts],
        ['False alert rate', falseRate.ratePct === null ? NO_DATA : `${falseRate.ratePct}%`],
      ],
      'No incidents in this period.',
    );

    section(
      'RESPONSE TARGETS (SLA)',
      ['Step', 'Within target', 'Incidents counted', 'Still waiting past target', 'Compliance'],
      [
        ['Acknowledged', sla.acknowledgeSlaMet, sla.acknowledgeMeasured, sla.acknowledgeOverdue, percent(sla.acknowledgeSlaMet, sla.acknowledgeMeasured)],
        ['Dispatched', sla.dispatchSlaMet, sla.dispatchMeasured, sla.dispatchOverdue, percent(sla.dispatchSlaMet, sla.dispatchMeasured)],
        ['First unit on scene', sla.onSceneSlaMet, sla.onSceneMeasured, sla.onSceneOverdue, percent(sla.onSceneSlaMet, sla.onSceneMeasured)],
      ],
      'No incidents in this period.',
      `Each incident is measured against the target for its priority (and category, if one is set), from the time it was reported. ` +
        `"Incidents counted" = incidents that reached the step plus those still waiting past the target (counted as missed). ` +
        `Incidents that ended before needing the step are not counted. ` +
        `If no target is set: acknowledge ${formatTarget(FALLBACK_SLA_SECONDS.acknowledge)}, dispatch ${formatTarget(FALLBACK_SLA_SECONDS.dispatch)}, on scene ${formatTarget(FALLBACK_SLA_SECONDS.onScene)}.`,
    );

    section(
      'INCIDENTS BY CATEGORY',
      ['Category', 'Incidents', 'Share of total'],
      sortedByCount(volume.byCategory).map((g): CsvCell[] => [
        categoryLabel(g.category),
        g._count._all,
        percent(g._count._all, categoryTotal),
      ]),
      'No incidents in this period.',
    );

    section(
      'INCIDENTS BY CURRENT STATUS',
      ['Status', 'Incidents', 'Share of total'],
      sortedByCount(volume.byStatus).map((g): CsvCell[] => [
        statusLabel(g.status),
        g._count._all,
        percent(g._count._all, statusTotal),
      ]),
      'No incidents in this period.',
    );

    const avg = (secs: number | null): CsvCell => minutes(secs) ?? NO_DATA;
    section(
      'AVERAGE RESPONSE TIMES BY CATEGORY (minutes from the report)',
      ['Category', 'Incidents', 'To acknowledge', 'To dispatch', 'To arrive on scene', 'To resolve'],
      responseTimes.map((g): CsvCell[] => [
        categoryLabel(g.category),
        g._count._all,
        avg(g._avg.acknowledge_duration_secs),
        avg(g._avg.dispatch_duration_secs),
        avg(g._avg.response_duration_secs),
        avg(g._avg.total_duration_secs),
      ]),
      'No response times yet.',
      'Each average uses only the incidents that reached that step.',
    );

    section(
      'UNIT DEPLOYMENTS',
      ['Unit', 'Call sign', 'Unit type', 'Times dispatched'],
      units.map((u): CsvCell[] => [u.name, u.call_sign ?? '', unitTypeLabel(u.resource_type), Number(u.dispatches)]),
      'No units were dispatched in this period.',
    );

    out.push([], ['End of report']);
    return { content: toCsv(out), rows: dataRows };
  }

  /** One flat table (single heading row) so it can be filtered, sorted and re-imported. */
  async incidentsCsv(range: AnalyticsDateRange, now: Date = new Date()): Promise<{ content: string; rows: number }> {
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
             COALESCE(sla.acknowledge_threshold_secs, ${FALLBACK_SLA_SECONDS.acknowledge})::int AS acknowledge_sla_secs,
             COALESCE(sla.dispatch_threshold_secs, ${FALLBACK_SLA_SECONDS.dispatch})::int AS dispatch_sla_secs,
             COALESCE(sla.on_scene_threshold_secs, ${FALLBACK_SLA_SECONDS.onScene})::int AS on_scene_sla_secs,
             fa.false_alert_type,
             (SELECT COUNT(*)::int FROM dispatches d WHERE d.incident_id = i.id) AS dispatches
        FROM incidents i
        LEFT JOIN incident_locations l ON l.incident_id = i.id
        LEFT JOIN LATERAL (
          SELECT p.acknowledge_threshold_secs, p.dispatch_threshold_secs, p.on_scene_threshold_secs
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
        `This period has more than ${MAX_EXPORT_INCIDENT_ROWS.toLocaleString('en-US')} incidents. Choose a shorter period.`,
      );
    }

    const body = rows.map((r): CsvCell[] => {
      const ackSecs = r.acknowledge_secs === null ? null : Number(r.acknowledge_secs);
      const dispatchSecs = r.dispatch_secs === null ? null : Number(r.dispatch_secs);
      const onSceneSecs = r.on_scene_secs === null ? null : Number(r.on_scene_secs);
      const ackTarget = Number(r.acknowledge_sla_secs);
      const dispatchTarget = Number(r.dispatch_sla_secs);
      const onSceneTarget = Number(r.on_scene_sla_secs);
      const sinceReport = (now.getTime() - new Date(r.submitted_at).getTime()) / 1000;
      return [
        r.reference,
        r.submitted_at,
        categoryLabel(r.category),
        priorityLabel(r.priority),
        statusLabel(r.status),
        triggerLabel(r.trigger_method),
        r.barangay || 'Not tagged',
        r.municipality ?? '',
        r.patients === null ? 'Unknown' : Number(r.patients),
        r.surge_incident,
        r.acknowledged_at,
        r.dispatched_at,
        r.on_scene_at,
        r.resolved_at,
        r.closed_at,
        minutes(ackSecs),
        minutes(dispatchSecs),
        minutes(onSceneSecs),
        minutes(r.resolve_secs),
        minutes(ackTarget),
        targetResult(ACK_STEP!, ackSecs, ackTarget, r.status, sinceReport),
        minutes(dispatchTarget),
        targetResult(DISPATCH_STEP!, dispatchSecs, dispatchTarget, r.status, sinceReport),
        minutes(onSceneTarget),
        targetResult(ON_SCENE_STEP!, onSceneSecs, onSceneTarget, r.status, sinceReport),
        falseAlertLabel(r.false_alert_type),
        Number(r.dispatches),
      ];
    });

    return { content: toCsv([[...INCIDENT_EXPORT_HEADER], ...body]), rows: body.length };
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
