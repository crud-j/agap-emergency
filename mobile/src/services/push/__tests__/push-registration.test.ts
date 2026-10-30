/// <reference types="jest" />
import type * as Notifications from 'expo-notifications';

jest.mock('expo-notifications', () => ({}));
jest.mock('../../api/notifications.api', () => ({ registerFcmToken: jest.fn() }));

import { assignmentIdFromNotification, incidentIdFromNotification } from '../push-registration';

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
