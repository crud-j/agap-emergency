import { BadRequestException } from '@nestjs/common';
import { UserRole } from '@agap/shared';
import { AnalyticsController } from '../../src/analytics/analytics.controller';
import {
  AnalyticsExportService,
  INCIDENT_EXPORT_HEADER,
  MAX_EXPORT_INCIDENT_ROWS,
  exportFilename,
} from '../../src/analytics/export/analytics-export.service';
import { csvCell, manilaIso, toCsv } from '../../src/analytics/export/csv';
import { ROLES_KEY } from '../../src/common/decorators/roles.decorator';

const NOW = new Date('2026-11-14T04:00:00.000Z');
const RANGE = { from: new Date('2026-10-15T04:00:00.000Z'), to: NOW };
const ACTOR = { id: '00000000-0000-0000-0000-000000000001', role: 'SUPERVISOR', ipAddress: '10.0.0.5' };

function incidentRow(overrides: Record<string, unknown> = {}) {
  return {
    reference: 'INC-2026-000123',
    category: 'FIRE',
    priority: 'CRITICAL',
    status: 'RESOLVED',
    trigger_method: 'SOS_BUTTON',
    surge_incident: false,
    patients: 2,
    barangay: 'Biñang 1st',
    municipality: 'Bocaue',
    submitted_at: new Date('2026-11-01T01:00:00.000Z'),
    acknowledged_at: new Date('2026-11-01T01:01:30.000Z'),
    dispatched_at: new Date('2026-11-01T01:07:00.000Z'),
    on_scene_at: new Date('2026-11-01T01:20:00.000Z'),
    resolved_at: new Date('2026-11-01T02:00:00.000Z'),
    closed_at: null,
    acknowledge_secs: '90.000000',
    dispatch_secs: '420.000000',
    on_scene_secs: '1200.000000',
    resolve_secs: '3600.000000',
    acknowledge_sla_secs: 120,
    dispatch_sla_secs: 300,
    false_alert_type: null,
    dispatches: 2,
    ...overrides,
  };
}

function makeService(queryRawResults: unknown[] = []) {
  const queue = [...queryRawResults];
  const tx = { auditLog: { create: jest.fn().mockResolvedValue({}) } };
  const prisma = {
    $queryRaw: jest.fn().mockImplementation(() => Promise.resolve(queue.shift() ?? [])),
    $transaction: jest.fn().mockImplementation((fn: (t: unknown) => unknown) => fn(tx)),
  };
  const analytics = {
    getVolume: jest.fn().mockResolvedValue({
      byCategory: [{ category: 'FIRE', _count: { _all: 3 } }],
      byStatus: [{ status: 'RESOLVED', _count: { _all: 3 } }],
    }),
    getSlaCompliance: jest.fn().mockResolvedValue({
      total: 3, acknowledgeSlaMet: 2, dispatchSlaMet: 1, acknowledgeCompliancePct: 67, dispatchCompliancePct: null,
    }),
    getFalseAlertRate: jest.fn().mockResolvedValue({ totalIncidents: 3, falseAlerts: 1, ratePct: 33 }),
    getResponseTimes: jest.fn().mockResolvedValue([
      {
        category: 'FIRE',
        _avg: {
          acknowledge_duration_secs: 90, dispatch_duration_secs: 420,
          response_duration_secs: 1200, total_duration_secs: null,
        },
        _count: { _all: 3 },
      },
    ]),
  };
  const audit = { logInTransaction: jest.fn().mockImplementation((t: typeof tx) => t.auditLog.create({})) };
  const service = new AnalyticsExportService(prisma as any, analytics as any, audit as any);
  return { service, prisma, analytics, audit, tx };
}

const lines = (csv: string) => csv.replace(/^﻿/, '').trimEnd().split('\r\n');

describe('CSV writer', () => {
  it('quotes commas, quotes and newlines', () => {
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('line\nbreak')).toBe('"line\nbreak"');
  });

  it('defuses spreadsheet formulas in text but leaves numbers alone', () => {
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvCell('+63')).toBe("'+63");
    expect(csvCell('@SUM')).toBe("'@SUM");
    expect(csvCell(-5)).toBe('-5');
  });

  it('writes blanks for null, yes/no for booleans, Manila time for dates', () => {
    expect(csvCell(null)).toBe('');
    expect(csvCell(undefined)).toBe('');
    expect(csvCell(Number.NaN)).toBe('');
    expect(csvCell(true)).toBe('yes');
    expect(csvCell(false)).toBe('no');
    expect(manilaIso(new Date('2026-11-01T17:30:00.000Z'))).toBe('2026-11-02T01:30:00+08:00');
  });

  it('starts with a UTF-8 BOM and uses CRLF', () => {
    expect(toCsv(['a', 'b'], [[1, 'Biñang 1st']])).toBe('﻿a,b\r\n1,Biñang 1st\r\n');
  });
});

describe('GET /analytics/export access', () => {
  it('allows exactly the Supervisor and System Administrator (same as the page data)', () => {
    const roles = Reflect.getMetadata(ROLES_KEY, AnalyticsController.prototype.exportCsv);
    expect([...roles].sort()).toEqual([UserRole.SUPERVISOR, UserRole.SYSTEM_ADMINISTRATOR].sort());
  });
});

describe('AnalyticsExportService', () => {
  it('names the file by dataset and Manila dates', () => {
    expect(exportFilename('incidents', RANGE)).toBe('agap-analytics-incidents_2026-10-15_to_2026-11-14.csv');
  });

  it('exports one row per incident with durations, SLA results and no personal data', async () => {
    const { service } = makeService([[incidentRow()]]);
    const { content, rows } = await service.incidentsCsv(RANGE);
    const [header, row] = lines(content);

    expect(rows).toBe(1);
    expect(header).toBe(INCIDENT_EXPORT_HEADER.join(','));
    for (const banned of ['name', 'phone', 'address', 'latitude', 'longitude', 'description', 'medical']) {
      expect(header).not.toContain(banned);
    }
    const cells = row!.split(',');
    const at = (col: (typeof INCIDENT_EXPORT_HEADER)[number]) => cells[INCIDENT_EXPORT_HEADER.indexOf(col)];
    expect(at('reference')).toBe('INC-2026-000123');
    expect(at('barangay')).toBe('Biñang 1st');
    expect(at('submitted_at')).toBe('2026-11-01T09:00:00+08:00');
    expect(at('closed_at')).toBe('');
    expect(at('acknowledge_secs')).toBe('90');
    expect(at('acknowledge_sla_met')).toBe('yes'); // 90 s <= 120 s
    expect(at('dispatch_sla_met')).toBe('no'); // 420 s > 300 s
    expect(at('dispatches')).toBe('2');
  });

  it('leaves SLA met blank when the step never happened', async () => {
    const { service } = makeService([
      [incidentRow({ acknowledged_at: null, acknowledge_secs: null, dispatched_at: null, dispatch_secs: null })],
    ]);
    const [, row] = lines((await service.incidentsCsv(RANGE)).content);
    const cells = row!.split(',');
    expect(cells[INCIDENT_EXPORT_HEADER.indexOf('acknowledge_sla_met')]).toBe('');
    expect(cells[INCIDENT_EXPORT_HEADER.indexOf('dispatch_sla_met')]).toBe('');
  });

  it('queries the same population as the page: in range, without DRAFT and DUPLICATE', async () => {
    const { service, prisma } = makeService([[]]);
    await service.incidentsCsv(RANGE);
    const [strings, ...values] = prisma.$queryRaw.mock.calls[0];
    const sql = (strings as string[]).join('?');
    expect(sql).toContain("NOT IN ('DRAFT', 'DUPLICATE')");
    expect(values).toEqual(expect.arrayContaining([RANGE.from, RANGE.to, MAX_EXPORT_INCIDENT_ROWS + 1]));
  });

  it('refuses rather than truncates when the range has too many incidents', async () => {
    const tooMany = Array.from({ length: MAX_EXPORT_INCIDENT_ROWS + 1 }, () => incidentRow());
    const { service } = makeService([tooMany]);
    await expect(service.incidentsCsv(RANGE)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuses a range longer than a year', async () => {
    const { service, prisma } = makeService();
    const range = { from: new Date('2025-01-01T00:00:00.000Z'), to: NOW };
    await expect(service.export('summary', range, ACTOR, NOW)).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('writes the page aggregates and unit dispatches into the summary', async () => {
    const { service } = makeService([[{ name: 'Rescue 1', call_sign: 'R1', resource_type: 'AMBULANCE', dispatches: 4 }]]);
    const { content } = await service.summaryCsv(RANGE, ACTOR, NOW);
    const body = lines(content);

    expect(body[0]).toBe('section,item,metric,value');
    expect(body).toContain('totals,,reported_incidents,3');
    expect(body).toContain('totals,,false_alert_rate_pct,33');
    expect(body).toContain('sla,acknowledge,compliance_pct,67');
    expect(body).toContain('sla,dispatch,compliance_pct,'); // null stays blank, not 0
    expect(body).toContain('volume_by_category,FIRE,incidents,3');
    expect(body).toContain('response_times,FIRE,avg_dispatch_secs,420');
    expect(body).toContain('unit_dispatches,Rescue 1 (R1),dispatches_ambulance,4');
    expect(content).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/); // no internal IDs
  });

  it('audits every export as DATA_EXPORT with dataset, range and row count', async () => {
    const { service, audit } = makeService([[incidentRow(), incidentRow({ reference: 'INC-2026-000124' })]]);
    const file = await service.export('incidents', RANGE, ACTOR, NOW);

    expect(file.rows).toBe(2);
    expect(audit.logInTransaction).toHaveBeenCalledTimes(1);
    expect(audit.logInTransaction.mock.calls[0][1]).toMatchObject({
      action: 'DATA_EXPORT',
      actorId: ACTOR.id,
      actorRole: 'SUPERVISOR',
      moduleId: 'MOD-50',
      entityType: 'analytics_export',
      ipAddress: '10.0.0.5',
      newValues: {
        dataset: 'incidents',
        from: RANGE.from.toISOString(),
        to: RANGE.to.toISOString(),
        rows: 2,
        filename: 'agap-analytics-incidents_2026-10-15_to_2026-11-14.csv',
      },
    });
  });

  it('returns no file when the audit row cannot be written (fail-closed)', async () => {
    const { service, tx } = makeService([[incidentRow()]]);
    tx.auditLog.create.mockRejectedValueOnce(new Error('db down'));
    await expect(service.export('incidents', RANGE, ACTOR, NOW)).rejects.toThrow('db down');
  });
});
