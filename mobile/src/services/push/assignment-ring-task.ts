import { AppState, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import { ringUntilOpened } from '../../../modules/agap-alarm';

/**
 * MOD-18 / MOD-32: a new assignment keeps ringing on a responder phone that has AGAP
 * closed or in the background, until the responder opens it.
 *
 * The server sends assignment pushes data-only (backend notification.processor.ts
 * buildFcmMessage). Android then wakes this task even when the app is closed.
 * expo-notifications has already shown the push once (one vibration); after a short
 * wait this replaces it, under the same tag, with one that repeats its alarm sound and
 * vibration (modules/agap-alarm). With AGAP on screen the in-app AssignmentAlarm rings
 * instead. Every 30 s the server repeats the push while nobody has answered.
 *
 * Imported from index.ts before the router, so it is defined when Android starts the
 * app's code in the background.
 */
export const ASSIGNMENT_RING_TASK = 'agap-assignment-ring';

/** expo-notifications shows its copy of the push first; ring only after that, so ours wins. */
export const RING_AFTER_MS = 1200;

export interface AssignmentRing {
  tag: string;
  title: string;
  body: string;
  /** Deep link the notification opens: the assignment screen. */
  url: string;
}

/**
 * The assignment to ring for, from the task's payload, or null. FCM data arrives as a
 * flat string map, nested differently depending on how Android started the task, so the
 * first object with `type: 'ASSIGNMENT'` and a dispatch id is used (searched a few levels).
 */
export function assignmentRingFromPayload(payload: unknown): AssignmentRing | null {
  const data = findAssignmentData(payload, 0);
  if (!data) return null;
  const dispatchId = data.dispatchId as string;
  return {
    tag: typeof data.tag === 'string' && data.tag ? data.tag : `assignment-${dispatchId}`,
    title: typeof data.title === 'string' && data.title ? data.title : 'New assignment',
    body: typeof data.message === 'string' && data.message ? data.message : 'Open AGAP to accept or decline.',
    url: `agap://responder/assignment/${encodeURIComponent(dispatchId)}`,
  };
}

function findAssignmentData(value: unknown, depth: number): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || depth > 3) return null;
  const record = value as Record<string, unknown>;
  if (record.type === 'ASSIGNMENT' && typeof record.dispatchId === 'string' && record.dispatchId) return record;
  for (const child of Object.values(record)) {
    const found = findAssignmentData(child, depth + 1);
    if (found) return found;
  }
  return null;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
// Read fresh each time: the app can come to the front during the wait.
const onScreen = () => AppState.currentState === 'active';

if (Platform.OS === 'android') {
  TaskManager.defineTask(ASSIGNMENT_RING_TASK, async ({ data, error }) => {
    if (error) return;
    const ring = assignmentRingFromPayload(data);
    // On screen: the full-screen in-app alarm already rings.
    if (!ring || onScreen()) return;
    await sleep(RING_AFTER_MS);
    if (onScreen()) return;
    ringUntilOpened(ring.tag, ring.title, ring.body, ring.url);
  });

  // Kept by Android across launches; registering again is harmless. A failure only
  // means the plain push (one vibration, repeated every 30 s) is what the phone gets.
  Notifications.registerTaskAsync(ASSIGNMENT_RING_TASK).catch(() => undefined);
}
