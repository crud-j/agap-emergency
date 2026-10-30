/**
 * Transport outbox (MOD-19, plan §19): start transport, destination change and arrival
 * tapped while the phone is offline are saved here (Expo Secure Store) and sent in tap
 * order when it reconnects. Each keeps the clientRequestId generated at the tap, so a
 * resend is recognised by the server and never records twice (Rule 12).
 *
 * Only these three crew actions are queued. SOS is never held for later delivery
 * (transmission.tsx) and does not use this.
 *
 * An item leaves the outbox only on a 2xx, or on a 4xx the server will refuse again
 * (its message is kept for the screen). Network errors, 401 (an expired session),
 * 408, 429 and 5xx keep it for the next try.
 */
import * as SecureStore from 'expo-secure-store';
import { ApiError, NetworkError } from '@/src/services/api/http';
import { updateAssignmentStatus } from '@/src/services/api/responders.api';
import { listTransports, recordArrival, updateTransportDestination } from '@/src/services/api/transport.api';
import { generateUUID } from '@/src/lib/uuid';

/** Plan §19: at most 3 pending transport actions per dispatch. */
export const MAX_PENDING_PER_DISPATCH = 3;
/** Drop messages kept for the screen (newest last). */
const MAX_DROPS = 5;

export type OutboxAction =
  /** "Start transport": PATCH /responders/assignments/:id/status TRANSPORTING (the button's own endpoint). */
  | { kind: 'start'; incidentId: string; dispatchId: string }
  /** transportId null: the start is still waiting too; the open record is looked up when sending. */
  | { kind: 'destination'; incidentId: string; dispatchId: string; transportId: string | null; destinationId: string }
  | { kind: 'arrive'; incidentId: string; dispatchId: string; transportId: string };

export type OutboxItem = OutboxAction & {
  clientRequestId: string;
  /** Device time of the tap; an arrival sends it as occurredAt. */
  tappedAt: string;
};

/** An item the server refused for good, with its reason for the crew. */
export interface OutboxDrop {
  clientRequestId: string;
  dispatchId: string;
  kind: OutboxItem['kind'];
  message: string;
}

export interface OutboxState {
  items: OutboxItem[];
  drops: OutboxDrop[];
}

export const EMPTY_OUTBOX: OutboxState = { items: [], drops: [] };

/** The id and tap time are fixed here, when the crew taps, and kept through every retry. */
export function newOutboxItem(action: OutboxAction, now: Date = new Date()): OutboxItem {
  return { ...action, clientRequestId: generateUUID(), tappedAt: now.toISOString() };
}

export type EnqueueResult = 'QUEUED' | 'FULL' | 'ALREADY_QUEUED';

/**
 * Adds an item at the end. FULL: this dispatch already has 3 waiting. ALREADY_QUEUED:
 * the same tap, or a second start / arrival for the same dispatch (a double tap).
 */
export function enqueue(state: OutboxState, item: OutboxItem): { state: OutboxState; result: EnqueueResult } {
  const same = pendingFor(state, item.dispatchId);
  if (
    same.some((i) => i.clientRequestId === item.clientRequestId)
    || (item.kind !== 'destination' && same.some((i) => i.kind === item.kind))
  ) {
    return { state, result: 'ALREADY_QUEUED' };
  }
  if (same.length >= MAX_PENDING_PER_DISPATCH) return { state, result: 'FULL' };
  return { state: { ...state, items: [...state.items, item] }, result: 'QUEUED' };
}

export function pendingFor(state: OutboxState, dispatchId: string): OutboxItem[] {
  return state.items.filter((i) => i.dispatchId === dispatchId);
}

/** Thrown by a sender when the item can never succeed (e.g. no open transport for a queued destination). */
export class OutboxItemRejected extends Error {}

/** Whether to keep an item for another try. Unknown errors are kept: dropping one would lose a crew action. */
export function isRetryable(err: unknown): boolean {
  if (err instanceof OutboxItemRejected) return false;
  if (err instanceof NetworkError) return true;
  if (err instanceof ApiError) {
    return err.status === 401 || err.status === 408 || err.status === 429 || err.status >= 500;
  }
  return true;
}

export interface FlushResult {
  /** clientRequestIds that left the outbox (sent, or refused for good). */
  removed: string[];
  drops: OutboxDrop[];
  /** A retryable failure stopped the flush; the rest waits for the next try, in order. */
  stopped: boolean;
}

/** Sends the items in order. The first retryable failure stops it, so nothing overtakes a waiting item. */
export async function flushOutbox(
  items: readonly OutboxItem[],
  send: (item: OutboxItem) => Promise<unknown>,
): Promise<FlushResult> {
  const result: FlushResult = { removed: [], drops: [], stopped: false };
  for (const item of items) {
    try {
      await send(item);
      result.removed.push(item.clientRequestId);
    } catch (err) {
      if (isRetryable(err)) {
        result.stopped = true;
        return result;
      }
      result.removed.push(item.clientRequestId);
      result.drops.push({
        clientRequestId: item.clientRequestId,
        dispatchId: item.dispatchId,
        kind: item.kind,
        message: err instanceof Error && err.message ? err.message : 'The server refused it.',
      });
    }
  }
  return result;
}

/** Applies a flush to the current state, keeping items queued while it ran. */
export function applyFlush(state: OutboxState, flush: FlushResult): OutboxState {
  const removed = new Set(flush.removed);
  return {
    items: state.items.filter((i) => !removed.has(i.clientRequestId)),
    drops: [...state.drops, ...flush.drops].slice(-MAX_DROPS),
  };
}

export function dismissDrops(state: OutboxState, dispatchId: string): OutboxState {
  return { ...state, drops: state.drops.filter((d) => d.dispatchId !== dispatchId) };
}

// ─── Persistence (Expo Secure Store, one key per signed-in user) ──────────────

export interface OutboxStorage {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
  deleteItemAsync(key: string): Promise<void>;
}

/** Per user, so another crew member signing in on this phone never sends someone else's taps. */
export function outboxKey(userId: string): string {
  return `agap_transport_outbox_${userId}`;
}

export async function loadOutbox(storage: OutboxStorage, userId: string): Promise<OutboxState> {
  try {
    const raw = await storage.getItemAsync(outboxKey(userId));
    if (!raw) return EMPTY_OUTBOX;
    const parsed = JSON.parse(raw) as Partial<OutboxState>;
    return {
      items: Array.isArray(parsed.items) ? parsed.items.filter(isOutboxItem) : [],
      drops: Array.isArray(parsed.drops) ? parsed.drops : [],
    };
  } catch {
    return EMPTY_OUTBOX;
  }
}

export async function saveOutbox(storage: OutboxStorage, userId: string, state: OutboxState): Promise<void> {
  if (state.items.length === 0 && state.drops.length === 0) {
    await storage.deleteItemAsync(outboxKey(userId));
    return;
  }
  await storage.setItemAsync(outboxKey(userId), JSON.stringify(state));
}

function isOutboxItem(value: unknown): value is OutboxItem {
  const v = value as Partial<OutboxItem> | null;
  return !!v
    && typeof v.clientRequestId === 'string'
    && typeof v.dispatchId === 'string'
    && typeof v.incidentId === 'string'
    && (v.kind === 'start' || v.kind === 'destination' || v.kind === 'arrive');
}

// ─── Sending ───────────────────────────────────────────────────────────────────

/** One queued item to the API. An arrival from the outbox was made offline, so it sends occurredAt. */
export async function sendOutboxItem(item: OutboxItem, token: string): Promise<unknown> {
  switch (item.kind) {
    case 'start':
      return updateAssignmentStatus(item.dispatchId, 'TRANSPORTING', token, undefined, item.clientRequestId);
    case 'destination': {
      const transportId = item.transportId ?? (await openTransportId(item, token));
      return updateTransportDestination(item.incidentId, transportId, item.destinationId, token, item.clientRequestId);
    }
    case 'arrive':
      return recordArrival(item.incidentId, item.transportId, token, {
        clientRequestId: item.clientRequestId,
        occurredAt: item.tappedAt,
      });
  }
}

async function openTransportId(item: OutboxItem, token: string): Promise<string> {
  const open = (await listTransports(item.incidentId, token))
    .find((r) => r.dispatch_id === item.dispatchId && !r.arrived_at);
  if (!open) throw new OutboxItemRejected('The transport was not started, so the destination was not saved.');
  return open.id;
}

// ─── Shared outbox for the app (one per signed-in user) ──────────────────────

interface Snapshot {
  userId: string | null;
  state: OutboxState;
}

let snapshot: Snapshot = { userId: null, state: EMPTY_OUTBOX };
let opening: Promise<void> | null = null;
let flushing: Promise<FlushResult | null> | null = null;
const listeners = new Set<() => void>();

export function subscribeOutbox(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getOutboxSnapshot(): Snapshot {
  return snapshot;
}

function publish(next: Snapshot) {
  snapshot = next;
  listeners.forEach((fn) => fn());
}

/** Loads this user's saved outbox once (e.g. after the app was closed with items waiting). */
export function openOutbox(userId: string): Promise<void> {
  if (snapshot.userId === userId) return opening ?? Promise.resolve();
  publish({ userId, state: EMPTY_OUTBOX });
  opening = loadOutbox(SecureStore, userId).then((state) => {
    if (snapshot.userId !== userId) return;
    // Anything queued while it loaded goes after the saved items.
    publish({ userId, state: { items: [...state.items, ...snapshot.state.items], drops: state.drops } });
  });
  return opening;
}

async function commit(userId: string, state: OutboxState): Promise<void> {
  if (snapshot.userId !== userId) return;
  publish({ userId, state });
  try {
    await saveOutbox(SecureStore, userId, state);
  } catch {
    // Kept in memory for this session; it is saved again with the next change.
  }
}

export async function queueOutboxItem(userId: string, item: OutboxItem): Promise<EnqueueResult> {
  await openOutbox(userId);
  const { state, result } = enqueue(snapshot.state, item);
  if (result === 'QUEUED') await commit(userId, state);
  return result;
}

/** Sends what is waiting, in order. One flush at a time; null when there was nothing to do. */
export function flushTransportOutbox(userId: string, token: string): Promise<FlushResult | null> {
  if (flushing) return flushing;
  flushing = (async () => {
    await openOutbox(userId);
    const items = snapshot.state.items;
    if (items.length === 0) return null;
    const result = await flushOutbox(items, (item) => sendOutboxItem(item, token));
    await commit(userId, applyFlush(snapshot.state, result));
    return result;
  })().finally(() => {
    flushing = null;
  });
  return flushing;
}

export async function dismissOutboxDrops(userId: string, dispatchId: string): Promise<void> {
  await commit(userId, dismissDrops(snapshot.state, dispatchId));
}
