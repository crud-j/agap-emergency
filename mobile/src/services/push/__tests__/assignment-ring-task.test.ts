/// <reference types="jest" />

jest.mock('expo-task-manager', () => ({ defineTask: jest.fn() }));
jest.mock('expo-notifications', () => ({ registerTaskAsync: jest.fn(() => Promise.resolve(null)) }));
jest.mock('../../../../modules/agap-alarm', () => ({ ringUntilOpened: jest.fn(() => true) }));

import { assignmentRingFromPayload } from '../assignment-ring-task';

/** What FCM delivers for a new assignment (backend buildFcmMessage), all strings. */
const FCM_DATA = {
  type: 'ASSIGNMENT',
  dispatchId: 'disp-1',
  title: 'New assignment',
  message: 'ROAD ACCIDENT · INC-2026-001234. Open AGAP to accept or decline.',
  channelId: 'assignments-alarm',
  tag: 'assignment-disp-1',
};

describe('assignment ring task payload (MOD-32)', () => {
  const expected = {
    tag: 'assignment-disp-1',
    title: 'New assignment',
    body: 'ROAD ACCIDENT · INC-2026-001234. Open AGAP to accept or decline.',
    url: 'agap://responder/assignment/disp-1',
  };

  it('reads the data map however the task was started (direct or wrapped)', () => {
    expect(assignmentRingFromPayload({ data: FCM_DATA, notification: null })).toEqual(expected);
    expect(assignmentRingFromPayload({ notification: { data: FCM_DATA } })).toEqual(expected);
    expect(assignmentRingFromPayload(FCM_DATA)).toEqual(expected);
  });

  it('falls back to safe text and the dispatch tag when fields are missing', () => {
    expect(assignmentRingFromPayload({ data: { type: 'ASSIGNMENT', dispatchId: 'd 2' } })).toEqual({
      tag: 'assignment-d 2',
      title: 'New assignment',
      body: 'Open AGAP to accept or decline.',
      url: 'agap://responder/assignment/d%202',
    });
  });

  it('ignores everything that is not a new assignment', () => {
    expect(assignmentRingFromPayload({ data: { ...FCM_DATA, type: 'ASSIGNMENT_CANCELLED' } })).toBeNull();
    expect(assignmentRingFromPayload({ data: { type: 'ASSIGNMENT', dispatchId: '' } })).toBeNull();
    expect(assignmentRingFromPayload({ data: { incidentId: 'inc-1' } })).toBeNull();
    expect(assignmentRingFromPayload(null)).toBeNull();
    expect(assignmentRingFromPayload('ASSIGNMENT')).toBeNull();
  });
});
