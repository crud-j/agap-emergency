/// <reference types="jest" />
import {
  EMPTY_FIRE_REPORT_FORM,
  buildFireReportBody,
  fireSummaryLine,
  formFromLatest,
  stepCount,
  toggleHazard,
  withFireFinishWarning,
} from '../fire-report';
import type { FireReport } from '../../services/api/fire-reports.api';

// Unit field flow plan, Phase 3: the fire report form on the phone.

function report(overrides: Partial<FireReport> = {}): FireReport {
  return {
    id: 'rep-1', incident_id: 'inc-1', dispatch_id: 'disp-1',
    alarm_level: 'THIRD_ALARM', fire_status: 'UNDER_CONTROL', structures_involved: 3, occupancy_type: 'INDUSTRIAL',
    hazards: ['FIREWORKS_EXPLOSIVES'], spreading: true, evacuation_needed: false,
    casualties_seen: 2, trapped_persons: 1, notes: 'old note', reported_at: '2026-10-31T02:00:00Z',
    ...overrides,
  };
}

describe('buildFireReportBody', () => {
  it('an untouched form sends an empty report: every field is optional', () => {
    expect(buildFireReportBody(EMPTY_FIRE_REPORT_FORM)).toEqual({});
  });

  it('sends only what was answered, keeps 0 and false, and trims the note', () => {
    expect(buildFireReportBody({
      ...EMPTY_FIRE_REPORT_FORM,
      fireStatus: 'ACTIVE', hazards: ['LPG', 'LIVE_WIRES'], trappedPersons: 0, casualtiesSeen: 4,
      spreading: false, notes: '  smoke from the back  ',
    })).toEqual({
      fireStatus: 'ACTIVE', hazards: ['LPG', 'LIVE_WIRES'], trappedPersons: 0, casualtiesSeen: 4,
      spreading: false, notes: 'smoke from the back',
    });
  });

  it('a blank note is left out', () => {
    expect(buildFireReportBody({ ...EMPTY_FIRE_REPORT_FORM, notes: '   ' })).toEqual({});
  });
});

describe('formFromLatest', () => {
  it('starts an update from the latest report, but never carries its note over', () => {
    const form = formFromLatest(report());
    expect(form).toMatchObject({ fireStatus: 'UNDER_CONTROL', alarmLevel: 'THIRD_ALARM', trappedPersons: 1, notes: '' });
    expect(buildFireReportBody(form)).not.toHaveProperty('notes');
  });

  it('no report yet → an empty form', () => {
    expect(formFromLatest(undefined)).toEqual(EMPTY_FIRE_REPORT_FORM);
  });
});

describe('form helpers', () => {
  it('stepCount counts an unanswered field from 0, never below 0 or above the cap', () => {
    expect(stepCount(null, 1)).toBe(1);
    expect(stepCount(null, -1)).toBe(0);
    expect(stepCount(0, -1)).toBe(0);
    expect(stepCount(500, 1, 500)).toBe(500);
  });

  it('toggleHazard adds and removes', () => {
    expect(toggleHazard(['LPG'], 'CHEMICALS')).toEqual(['LPG', 'CHEMICALS']);
    expect(toggleHazard(['LPG', 'CHEMICALS'], 'LPG')).toEqual(['CHEMICALS']);
  });

  it('fireSummaryLine is labels and counts, never the note', () => {
    expect(fireSummaryLine(report())).toBe('Under control · 3rd alarm · 1 trapped · 2 casualties');
    expect(fireSummaryLine(report({ fire_status: null, alarm_level: null, trapped_persons: 0, casualties_seen: null })))
      .toBe('Status not given');
  });
});

describe('withFireFinishWarning (Finish is asked, never blocked)', () => {
  const base = { title: 'Mark incident resolved?', message: 'Your unit becomes available again.' };

  it('"Fire out" keeps the usual confirm', () => {
    expect(withFireFinishWarning(base, 'FIRE_OUT')).toBe(base);
  });

  it('any other status, or no report, adds a warning to the confirm', () => {
    expect(withFireFinishWarning(base, 'UNDER_CONTROL')).toEqual({
      title: base.title,
      message: 'The last fire report says "Under control", not "Fire out". Your unit becomes available again.',
    });
    expect(withFireFinishWarning(base, null)?.message).toMatch(/^No fire report was filed/);
    expect(withFireFinishWarning(undefined, 'ACTIVE')).toEqual({
      title: 'Finish?', message: 'The last fire report says "Active", not "Fire out".',
    });
  });
});
