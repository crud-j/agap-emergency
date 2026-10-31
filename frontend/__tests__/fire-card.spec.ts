import { fireCardView, fireQueueBadge, FIRE_TONE_BADGE } from '@/lib/fire-report-view';
import type { IncidentFireReport } from '@/features/incidents/api';

// Unit field flow plan, Phase 3: the drawer's Fire card and the queue badge.

function report(overrides: Partial<IncidentFireReport> = {}): IncidentFireReport {
  return {
    id: 'rep-2',
    dispatch_id: 'disp-1',
    alarm_level: 'THIRD_ALARM',
    fire_status: 'ACTIVE',
    structures_involved: 4,
    occupancy_type: 'INDUSTRIAL',
    hazards: ['FIREWORKS_EXPLOSIVES', 'LPG'],
    spreading: true,
    evacuation_needed: true,
    casualties_seen: 3,
    trapped_persons: 2,
    notes: 'Warehouse roof down',
    reported_at: '2026-10-31T02:10:00Z',
    dispatches: { resources: { name: 'BFP Fire Truck 1', call_sign: 'BFP-FT1' } },
    ...overrides,
  };
}

describe('fireCardView', () => {
  it('nothing to show when no fire report was filed', () => {
    expect(fireCardView(undefined)).toBeNull();
    expect(fireCardView([])).toBeNull();
  });

  it('the latest report (first, newest) is the current picture, in labels from @agap/shared', () => {
    const view = fireCardView([report(), report({ id: 'rep-1', fire_status: 'UNDER_CONTROL', reported_at: '2026-10-31T02:00:00Z' })]);
    expect(view!.latest).toEqual({
      id: 'rep-2',
      status: 'Active',
      tone: 'danger',
      alarm: '3rd alarm',
      hazards: ['Fireworks / explosives', 'LPG'],
      counts: ['2 trapped', '3 casualties seen', '4 structures (Industrial)'],
      flags: ['Spreading to neighbours', 'Evacuation needed'],
      unit: 'BFP-FT1',
      notes: 'Warehouse roof down',
      reportedAt: '2026-10-31T02:10:00Z',
    });
    expect(view!.history.map((l) => [l.id, l.status])).toEqual([['rep-1', 'Under control']]);
  });

  it('an empty report still shows, as "Status not given", with no counts or flags', () => {
    const empty = report({
      alarm_level: null, fire_status: null, structures_involved: null, occupancy_type: null, hazards: [],
      spreading: null, evacuation_needed: null, casualties_seen: null, trapped_persons: null, notes: null, dispatches: null,
    });
    expect(fireCardView([empty])!.latest).toMatchObject({
      status: 'Status not given', tone: 'neutral', alarm: null, hazards: [], counts: [], flags: [], unit: null,
    });
  });

  it('a 0 count is shown (0 trapped is an answer), and fire out is the ok tone', () => {
    const line = fireCardView([report({ trapped_persons: 0, fire_status: 'FIRE_OUT' })])!.latest;
    expect(line.counts[0]).toBe('0 trapped');
    expect(FIRE_TONE_BADGE[line.tone]).toBe('green');
  });
});

describe('fireQueueBadge', () => {
  it('shows the latest fire status and alarm level, or nothing without a report', () => {
    expect(fireQueueBadge({ fire_field_reports: [{ fire_status: 'UNDER_CONTROL', alarm_level: 'SECOND_ALARM' }] }))
      .toEqual({ text: 'Under control · 2nd alarm', tone: 'warn' });
    expect(fireQueueBadge({ fire_field_reports: [] })).toBeNull();
    expect(fireQueueBadge({})).toBeNull();
  });
});
