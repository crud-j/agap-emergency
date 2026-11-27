jest.mock('firebase-admin/app', () => ({ getApps: () => [] }));
jest.mock('firebase-admin/messaging', () => ({ getMessaging: () => ({ send: jest.fn() }) }));

import { buildFcmMessage } from '../../src/jobs/processors/notification.processor';
import {
  ASSIGNMENT_ALARM_CHANNEL,
  ASSIGNMENT_PUSH_TTL_MS,
  ASSIGNMENTS_CHANNEL,
  assignmentPush,
} from '../../src/dispatch/assignment-push';

/**
 * MOD-18 / MOD-32: a new assignment goes out data-only, so the responder app's code runs
 * with the app closed and rings until answered. Its text still travels in `data`, where
 * expo-notifications reads it to show the push when that code is missing.
 */
describe('buildFcmMessage', () => {
  const incident = { category: 'ROAD_ACCIDENT', public_reference: 'INC-2026-001234' };

  it('new assignment: data-only, high priority, text + channel + tag in data, short TTL', () => {
    const msg = buildFcmMessage('tok', assignmentPush('ASSIGNMENT', incident, 'disp-1', 'resp-a')) as any;
    expect(msg.notification).toBeUndefined();
    expect(msg.android).toEqual({ priority: 'high', ttl: ASSIGNMENT_PUSH_TTL_MS });
    expect(msg.data).toEqual({
      type: 'ASSIGNMENT',
      dispatchId: 'disp-1',
      title: 'New assignment',
      message: 'ROAD ACCIDENT · INC-2026-001234. Open AGAP to accept or decline.',
      channelId: ASSIGNMENT_ALARM_CHANNEL,
      tag: 'assignment-disp-1',
    });
    // expo-notifications parses data.body as JSON: it must never be set.
    expect(msg.data.body).toBeUndefined();
  });

  it('repeat: same tag, reminder number as a string', () => {
    const msg = buildFcmMessage('tok', assignmentPush('ASSIGNMENT', incident, 'disp-1', 'resp-a', 3)) as any;
    expect(msg.data).toMatchObject({ title: 'New assignment: still waiting', reminder: '3', tag: 'assignment-disp-1' });
    expect(msg.notification).toBeUndefined();
  });

  it('cancellation: a plain notification push on the quiet channel, same tag (replaces the ringing one)', () => {
    const msg = buildFcmMessage('tok', assignmentPush('ASSIGNMENT_CANCELLED', incident, 'disp-1', 'resp-a')) as any;
    expect(msg.notification).toEqual({ title: 'Assignment cancelled', body: expect.stringContaining('cancelled') });
    expect(msg.android).toEqual({
      priority: 'high',
      notification: { channelId: ASSIGNMENTS_CHANNEL, tag: 'assignment-disp-1' },
    });
    expect(msg.data).toEqual({ type: 'ASSIGNMENT_CANCELLED', dispatchId: 'disp-1' });
  });

  it('other pushes are unchanged: notification block, no android section without channel/tag', () => {
    const msg = buildFcmMessage('tok', { channel: 'PUSH', userId: 'u', title: 'Hi', body: 'There', data: { incidentId: 'i' } }) as any;
    expect(msg).toEqual({ token: 'tok', notification: { title: 'Hi', body: 'There' }, data: { incidentId: 'i' } });
  });
});
