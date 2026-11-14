import { BadRequestException } from '@nestjs/common';
import { UserRole } from '@agap/shared';
import { AnalyticsController } from '../../src/analytics/analytics.controller';
import {
  AnalyticsExportService,
  INCIDENT_EXPORT_HEADER,
  MAX_EXPORT_INCIDENT_ROWS,
  exportFilename,
  minutes,
} from '../../src/analytics/export/analytics-export.service';
import { csvCell, manilaDateTime, manilaReadable, toCsv } from '../../src/analytics/export/csv';
import { categoryLabel, statusLabel, titleCase, triggerLabel } from '../../src/analytics/export/labels';
import { ROLES_KEY } from '../../src/common/decorators/roles.decorator';

const NOW = new Date('2026-11-14T04:00:00.000Z');
const RANGE = { from: new Date('2026-10-15T04:00:00.000Z'), to: NOW };
const ACTOR = { id: '00000000-0000-0000-0000-000000000001', role: 'SUPERVISOR', ipAddress: '10.0.0.5' };

function incidentRow(overrides: Record<string, unknown> = {}) {
  return {
    reference: 'INC-2026-000123',
    category: 'ROAD_ACCIDENT',
    priority: 'CRITICAL',
    status: 'DISPATCH_PENDING',
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
    on_scene_sla_secs: 900,
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
      byCategory: [
        { category: 'MEDICAL', _count: { _all: 1 } },
        { category: 'FIRE', _count: { _all: 3 } },
      ],
      byStatus: [{ status: 'DISPATCH_PENDING', _count: { _all: 4 } }],
    }),
    getSlaCompliance: jest.fn().mockResolvedValue({
      total: 4,
      acknowledgeSlaMet: 2, acknowledgeMeasured: 3, acknowledgeOverdue: 1, acknowledgeCompliancePct: 67,
      dispatchSlaMet: 0, dispatchMeasured: 0, dispatchOverdue: 0, dispatchCompliancePct: null,
      onSceneSlaMet: 1, onSceneMeasured: 2, onSceneOverdue: 0, onSceneCompliancePct: 50,
    }),
    getFalseAlertRate: jest.fn().mockResolvedValue({ totalIncidents: 4, falseAlerts: 1, ratePct: 25 }),
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

  it('writes blanks for null, Yes/No for booleans, Manila time for dates', () => {
    expect(csvCell(null)).toBe('');
    expect(csvCell(undefined)).toBe('');
    expect(csvCell(Number.NaN)).toBe('');
    expect(csvCell(true)).toBe('Yes');
    expect(csvCell(false)).toBe('No');
    // 17:30 UTC is 01:30 the next day in Bocaue.
    expect(manilaDateTime(new Date('2026-11-01T17:30:00.000Z'))).toBe('2026-11-02 01:30');
    expect(manilaReadable(new Date('2026-11-01T17:30:00.000Z'))).toBe('Nov 2, 2026 1:30 AM');
    expect(manilaReadable(new Date('2026-11-14T04:00:00.000Z'))).toBe('Nov 14, 2026 12:00 PM');
  });

  it('starts with a UTF-8 BOM, uses CRLF and writes [] as a blank line', () => {
    expect(toCsv([['a', 'b'], [], [1, 'Biñang 1st']])).toBe('﻿a,b\r\n\r\n1,Biñang 1st\r\n');
  });
});

describe('export labels', () => {
  it('turns codes into plain English', () => {
    expect(categoryLabel('ROAD_ACCIDENT')).toBe('Road Accident');
    expect(statusLabel('DISPATCH_PENDING')).toBe('Awaiting Dispatch');
    expect(triggerLabel('SOS_BUTTON')).toBe('SOS Button');
  });

  it('falls back to Title Case for a code it does not know, and blank for none', () => {
    expect(titleCase('SOME_NEW_VALUE')).toBe('Some New Value');
    expect(categoryLabel('LANDSLIDE')).toBe('Landslide');
    expect(categoryLabel(null)).toBe('');
  });

  it('converts seconds to minutes with one decimal', () => {
    expect(minutes(90)).toBe(1.5);
    expect(minutes('420.000000')).toBe(7);
    expect(minutes(null)).toBeNull();
  });
});

describe('GET /analytics/export access', () => {
  it('allows exactly the Supervisor and System Administrator (same as the page data)', () => {
    const roles = Reflect.getMetadata(ROLES_KEY, AnalyticsController.prototype.exportCsv);
    expect([...roles].sort()).toEqual([UserRole.SUPERVISOR, UserRole.SYSTEM_ADMINISTRATOR].sort());
  });
});

describe('AnalyticsExportService', () => {
  it('names each file by what it is and the Manila dates it covers', () => {
    expect(exportFilename('summary', RANGE)).toBe('AGAP-Analytics-Summary_2026-10-15_to_2026-11-14.csv');
    expect(exportFilename('incidents', RANGE)).toBe('AGAP-Incident-List_2026-10-15_to_2026-11-14.csv');
  });

  describe('incident list', () => {
    it('is one flat table with plain-English headings and values', async () => {
      const { service } = makeService([[incidentRow()]]);
      const { content, rows } = await service.incidentsCsv(RANGE);
      const [header, row] = lines(content);

      expect(rows).toBe(1);
      expect(header).toBe(INCIDENT_EXPORT_HEADER.join(','));
      const cells = row!.split(',');
      const at = (col: (typeof INCIDENT_EXPORT_HEADER)[number]) => cells[INCIDENT_EXPORT_HEADER.indexOf(col)];
      expect(at('Reference No.')).toBe('INC-2026-000123');
      expect(at('Reported (Manila time)')).toBe('2026-11-01 09:00');
      expect(at('Category')).toBe('Road Accident');
      expect(at('Priority')).toBe('Critical');
      expect(at('Current Status')).toBe('Awaiting Dispatch');
      expect(at('How Reported')).toBe('SOS Button');
      expect(at('Barangay')).toBe('Biñang 1st');
      expect(at('Surge / Mass-Casualty')).toBe('No');
      expect(at('Closed (Manila time)')).toBe('');
      expect(at('Minutes to Acknowledge')).toBe('1.5');
      expect(at('Minutes to Resolve')).toBe('60');
      expect(at('Acknowledge Target (min)')).toBe('2');
      expect(at('Acknowledge Target Result')).toBe('Met'); // 90 s <= 120 s
      expect(at('Dispatch Target Result')).toBe('Missed'); // 420 s > 300 s
      expect(at('On-Scene Target (min)')).toBe('15');
      expect(at('On-Scene Target Result')).toBe('Missed'); // 1200 s > 900 s
      expect(at('Units Dispatched')).toBe('2');
    });

    it('carries no personal or medical columns', async () => {
      const { service } = makeService([[]]);
      const [header] = lines((await service.incidentsCsv(RANGE)).content);
      for (const banned of ['name', 'phone', 'address', 'latitude', 'longitude', 'description', 'medical']) {
        expect(header!.toLowerCase()).not.toContain(banned);
      }
    });

    it('says which step has not happened, and fills unknown patients and untagged barangays', async () => {
      const { service } = makeService([[
        incidentRow({
          acknowledged_at: null, acknowledge_secs: null, dispatched_at: null, dispatch_secs: null,
          patients: null, barangay: null, false_alert_type: 'PRANK', status: 'FALSE_ALERT',
        }),
      ]]);
      const [, row] = lines((await service.incidentsCsv(RANGE)).content);
      const cells = row!.split(',');
      const at = (col: (typeof INCIDENT_EXPORT_HEADER)[number]) => cells[INCIDENT_EXPORT_HEADER.indexOf(col)];
      expect(at('Acknowledge Target Result')).toBe('Not acknowledged');
      expect(at('Dispatch Target Result')).toBe('Not dispatched');
      expect(at('Minutes to Acknowledge')).toBe('');
      expect(at('Patients')).toBe('Unknown');
      expect(at('Barangay')).toBe('Not tagged');
      expect(at('Current Status')).toBe('False Alert');
      expect(at('False Alert Reason')).toBe('Prank');
    });

    it('marks a step still waiting past its target as missed (overdue), and before it as not yet due', async () => {
      const waiting = incidentRow({
        status: 'ACKNOWLEDGED',
        dispatched_at: null, dispatch_secs: null, on_scene_at: null, on_scene_secs: null,
        resolved_at: null, resolve_secs: null,
      });
      const { service } = makeService([[waiting]]);
      // 10 minutes after the report: dispatch (5 min) is overdue, on scene (15 min) is not due yet.
      const tenMinLater = new Date(new Date(waiting.submitted_at).getTime() + 10 * 60_000);
      const [, row] = lines((await service.incidentsCsv(RANGE, tenMinLater)).content);
      const cells = row!.split(',');
      const at = (col: (typeof INCIDENT_EXPORT_HEADER)[number]) => cells[INCIDENT_EXPORT_HEADER.indexOf(col)];
      expect(at('Acknowledge Target Result')).toBe('Met');
      expect(at('Dispatch Target Result')).toBe('Missed (overdue)');
      expect(at('On-Scene Target Result')).toBe('Not yet due');
    });

    it('queries the same population as the page: in range, without DRAFT and DUPLICATE', async () => {
      const { service, prisma } = makeService([[]]);
      await service.incidentsCsv(RANGE);
      const [strings, ...values] = prisma.$queryRaw.mock.calls[0];
      expect((strings as string[]).join('?')).toContain("NOT IN ('DRAFT', 'DUPLICATE')");
      expect(values).toEqual(expect.arrayContaining([RANGE.from, RANGE.to, MAX_EXPORT_INCIDENT_ROWS + 1]));
    });

    it('refuses rather than truncates when the period has too many incidents', async () => {
      const tooMany = Array.from({ length: MAX_EXPORT_INCIDENT_ROWS + 1 }, () => incidentRow());
      const { service } = makeService([tooMany]);
      await expect(service.incidentsCsv(RANGE)).rejects.toThrow('Choose a shorter period');
    });
  });

  describe('summary report', () => {
    async function summary(units: unknown[] = []) {
      const { service } = makeService([units]);
      return lines((await service.summaryCsv(RANGE, ACTOR, NOW)).content);
    }

    it('opens with a title block that says what the report covers and who made it', async () => {
      const body = await summary();
      expect(body[0]).toBe('AGAP Emergency Response Analytics - Summary Report');
      expect(body).toContain('Report period,"Oct 15, 2026 12:00 PM to Nov 14, 2026 12:00 PM (30 days, Manila time)"');
      expect(body).toContain('Generated on,"Nov 14, 2026 12:00 PM (Manila time)"');
      expect(body).toContain('Generated by,Supervisor');
      expect(body[body.length - 1]).toBe('End of report');
    });

    it('lays each topic out as a titled section with its own headings', async () => {
      const body = await summary([{ name: 'Rescue 1', call_sign: 'R1', resource_type: 'RESCUE_BOAT', dispatches: 4 }]);
      const sectionAt = (title: string) => body.indexOf(title);

      expect(body[sectionAt('OVERVIEW') - 1]).toBe(''); // blank line before every section
      expect(body[sectionAt('OVERVIEW') + 1]).toBe('Measure,Value');
      expect(body).toContain('Incidents reported,4');
      expect(body).toContain('False alert rate,25%');

      expect(body[sectionAt('RESPONSE TARGETS (SLA)') + 1]).toBe(
        'Step,Within target,Incidents counted,Still waiting past target,Compliance',
      );
      expect(body).toContain('Acknowledged,2,3,1,67%');
      expect(body).toContain('Dispatched,0,0,0,No data'); // no base: "No data", never 0%
      expect(body).toContain('First unit on scene,1,2,0,50%');

      // Largest category first, with its share.
      const cat = sectionAt('INCIDENTS BY CATEGORY');
      expect(body.slice(cat + 1, cat + 4)).toEqual(['Category,Incidents,Share of total', 'Fire,3,75%', 'Medical,1,25%']);
      expect(body).toContain('Awaiting Dispatch,4,100%');

      expect(body).toContain('Fire,3,1.5,7,20,No data');
      expect(body).toContain('Rescue 1,R1,Rescue Boat,4');
    });

    it('says so when a section has nothing in it', async () => {
      const body = await summary([]);
      expect(body).toContain('No units were dispatched in this period.');
    });

    it('carries no internal IDs', async () => {
      const body = (await summary([{ name: 'Rescue 1', call_sign: null, resource_type: 'AMBULANCE', dispatches: 1 }])).join('\n');
      expect(body).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/);
    });
  });

  it('refuses a period longer than a year before querying anything', async () => {
    const { service, prisma } = makeService();
    const range = { from: new Date('2025-01-01T00:00:00.000Z'), to: NOW };
    await expect(service.export('summary', range, ACTOR, NOW)).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
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
        filename: 'AGAP-Incident-List_2026-10-15_to_2026-11-14.csv',
      },
    });
  });

  it('returns no file when the audit row cannot be written (fail-closed)', async () => {
    const { service, tx } = makeService([[incidentRow()]]);
    tx.auditLog.create.mockRejectedValueOnce(new Error('db down'));
    await expect(service.export('incidents', RANGE, ACTOR, NOW)).rejects.toThrow('db down');
  });
});
