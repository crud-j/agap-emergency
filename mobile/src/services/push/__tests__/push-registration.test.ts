/// <reference types="jest" />
import type * as Notifications from 'expo-notifications';

jest.mock('expo-notifications', () => ({}));
jest.mock('../../api/notifications.api', () => ({ registerFcmToken: jest.fn() }));

import {
  assignmentIdFromNotification,
  incidentIdFromNotification,
  isGuestReportNotification,
} from '../push-registration';

const tap = (data: Record<string, unknown> | undefined) =>
  ({ notification: { request: { identifier: 'n-1', content: { data } } } }) as unknown as Notifications.NotificationResponse;

describe('assignmentIdFromNotification (AUTOMATION_NEEDS_PLAN C1)', () => {
  it('returns the dispatch ID of an assignment push', () => {
    expect(assignmentIdFromNotification(tap({ type: 'ASSIGNMENT', dispatchId: 'disp-1' }))).toBe('disp-1');
  });

  it('ignores a cancelled assignment, other pushes and malformed data', () => {
    expect(assignmentIdFromNotification(tap({ type: 'ASSIGNMENT_CANCELLED', dispatchId: 'disp-1' }))).toBeNull();
    expect(assignmentIdFromNotification(tap({ incidentId: 'inc-1' }))).toBeNull();
    expect(assignmentIdFromNotification(tap({ type: 'ASSIGNMENT', dispatchId: '' }))).toBeNull();
    expect(assignmentIdFromNotification(tap({ type: 'ASSIGNMENT', dispatchId: 42 }))).toBeNull();
    expect(assignmentIdFromNotification(tap(undefined))).toBeNull();
    expect(assignmentIdFromNotification(null)).toBeNull();
  });

  it('an assignment push carries no incident ID, so it never opens the citizen screen', () => {
    expect(incidentIdFromNotification(tap({ type: 'ASSIGNMENT', dispatchId: 'disp-1' }))).toBeNull();
    expect(incidentIdFromNotification(tap({ incidentId: 'inc-1' }))).toBe('inc-1');
  });
});

describe('guest report pushes (MOD-42)', () => {
  const guest = tap({ type: 'GUEST_REPORT_STATUS', status: 'DISPATCHED', publicReference: 'INC-2026-000200' });

  it('are recognised, and open neither an incident nor an assignment (no account)', () => {
    expect(isGuestReportNotification(guest)).toBe(true);
    expect(incidentIdFromNotification(guest)).toBeNull();
    expect(assignmentIdFromNotification(guest)).toBeNull();
  });

  it('other pushes are not guest pushes', () => {
    expect(isGuestReportNotification(tap({ incidentId: 'inc-1', type: 'INCIDENT_DISPATCHED' }))).toBe(false);
    expect(isGuestReportNotification(tap(undefined))).toBe(false);
    expect(isGuestReportNotification(null)).toBe(false);
  });
});

describe('Incident Command job notices (MOD-36)', () => {
  it('open the crew member’s assignment when they crew a unit on the incident', () => {
    for (const type of ['ICS_POSITION_ASSIGNED', 'ICS_POSITION_RELIEVED', 'ICS_COMMAND_ENDED']) {
      expect(assignmentIdFromNotification(tap({ type, incidentId: 'inc-1', dispatchId: 'disp-1' }))).toBe('disp-1');
    }
  });

  it('never open the reporter’s incident screen, which would refuse a responder', () => {
    const notice = tap({ type: 'ICS_POSITION_ASSIGNED', incidentId: 'inc-1' });
    expect(assignmentIdFromNotification(notice)).toBeNull();
    expect(incidentIdFromNotification(notice)).toBeNull();
  });
});
