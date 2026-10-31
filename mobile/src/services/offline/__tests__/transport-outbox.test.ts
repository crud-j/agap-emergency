/// <reference types="jest" />
import * as SecureStore from 'expo-secure-store';
import { ApiError, NetworkError } from '../../api/http';
import {
  EMPTY_OUTBOX,
  MAX_PENDING_PER_DISPATCH,
  OutboxItemRejected,
  applyFlush,
  enqueue,
  flushOutbox,
  flushTransportOutbox,
  getOutboxSnapshot,
  isRetryable,
  loadOutbox,
  newOutboxItem,
  outboxKey,
  queueOutboxItem,
  saveOutbox,
  sendOutboxItem,
  type OutboxItem,
  type OutboxState,
  type OutboxStorage,
} from '../transport-outbox';

// Plan §19 / Prompt 15: the responder's transport outbox.

const mockSaved = new Map<string, string>();
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async (k: string) => mockSaved.get(k) ?? null),
  setItemAsync: jest.fn(async (k: string, v: string) => void mockSaved.set(k, v)),
  deleteItemAsync: jest.fn(async (k: string) => void mockSaved.delete(k)),
}));

const INCIDENT = 'inc-1';
const DISPATCH = 'dispatch-1';
const TRANSPORT = 'tr-1';

const start = (dispatchId = DISPATCH) => newOutboxItem({ kind: 'start', incidentId: INCIDENT, dispatchId });
const destination = (transportId: string | null = TRANSPORT, dispatchId = DISPATCH) =>
  newOutboxItem({ kind: 'destination', incidentId: INCIDENT, dispatchId, transportId, destinationId: 'fac-1' });
const arrive = (dispatchId = DISPATCH) =>
  newOutboxItem({ kind: 'arrive', incidentId: INCIDENT, dispatchId, transportId: TRANSPORT });

function queued(...items: OutboxItem[]): OutboxState {
  return items.reduce((state, item) => enqueue(state, item).state, EMPTY_OUTBOX);
}

function memoryStorage(): OutboxStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItemAsync: async (k) => data.get(k) ?? null,
    setItemAsync: async (k, v) => void data.set(k, v),
    deleteItemAsync: async (k) => void data.delete(k),
  };
}

function okResponse(body: unknown) {
  return { ok: true, status: 200, text: async () => JSON.stringify(body), json: async () => body } as unknown as Response;
}

describe('newOutboxItem', () => {
  it('fixes a v4 clientRequestId and the tap time when the crew taps', () => {
    const at = new Date('2026-10-29T09:45:00.000Z');
    const item = newOutboxItem({ kind: 'arrive', incidentId: INCIDENT, dispatchId: DISPATCH, transportId: TRANSPORT }, at);

    expect(item.clientRequestId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(item.tappedAt).toBe('2026-10-29T09:45:00.000Z');
    expect(start().clientRequestId).not.toBe(start().clientRequestId);
  });
});

describe('enqueue', () => {
  it(`keeps at most ${MAX_PENDING_PER_DISPATCH} per dispatch; another dispatch has its own`, () => {
    const state = queued(start(), destination(null), destination());

    expect(enqueue(state, destination()).result).toBe('FULL');
    expect(enqueue(state, destination(TRANSPORT, 'dispatch-2')).result).toBe('QUEUED');
    expect(state.items).toHaveLength(3);
  });

  it('a double tap is not queued twice: the same tap, or a second start / arrival for the dispatch', () => {
    const tap = arrive();
    const state = queued(start(), tap);

    expect(enqueue(state, tap).result).toBe('ALREADY_QUEUED');
    expect(enqueue(state, arrive()).result).toBe('ALREADY_QUEUED');
    expect(enqueue(state, start()).result).toBe('ALREADY_QUEUED');
    expect(enqueue(state, destination()).result).toBe('QUEUED');
  });

  it('adds at the end (FIFO)', () => {
    const a = start();
    const b = destination(null);
    expect(queued(a, b).items.map((i) => i.clientRequestId)).toEqual([a.clientRequestId, b.clientRequestId]);
  });
});

describe('flushOutbox', () => {
  it('sends in tap order and removes each item on 2xx', async () => {
    const items = [start(), destination(null), arrive()];
    const sent: string[] = [];

    const result = await flushOutbox(items, async (item) => void sent.push(item.kind));

    expect(sent).toEqual(['start', 'destination', 'arrive']);
    expect(result.removed).toEqual(items.map((i) => i.clientRequestId));
    expect(result).toMatchObject({ drops: [], stopped: false });
  });

  it('a network error keeps the item and everything after it (nothing overtakes it)', async () => {
    const items = [destination(), arrive()];
    const send = jest.fn().mockRejectedValueOnce(new NetworkError(new TypeError('Network request failed')));

    const result = await flushOutbox(items, send);

    expect(result).toEqual({ removed: [], drops: [], stopped: true });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it.each([401, 408, 429, 500, 503])('HTTP %i is kept for another try', async (status) => {
    const result = await flushOutbox([arrive()], jest.fn().mockRejectedValue(new ApiError('later', status)));
    expect(result).toEqual({ removed: [], drops: [], stopped: true });
  });

  it.each([
    [409, 'This unit is already transporting to another hospital. Change the destination instead.'],
    [400, 'The arrival time is more than 30 minutes ago. Record the arrival again.'],
    [403, 'You are not on the crew for this dispatch.'],
  ])('HTTP %i is dropped with the server message, and the next item is still sent', async (status, message) => {
    const first = start();
    const second = arrive();
    const send = jest.fn().mockRejectedValueOnce(new ApiError(message, status)).mockResolvedValueOnce(undefined);

    const result = await flushOutbox([first, second], send);

    expect(result.removed).toEqual([first.clientRequestId, second.clientRequestId]);
    expect(result.drops).toEqual([{ clientRequestId: first.clientRequestId, dispatchId: DISPATCH, kind: 'start', message }]);
    expect(result.stopped).toBe(false);
  });

  it('isRetryable: network and unknown errors are kept, a rejected item is not', () => {
    expect(isRetryable(new NetworkError())).toBe(true);
    expect(isRetryable(new SyntaxError('Unexpected token <'))).toBe(true);
    expect(isRetryable(new OutboxItemRejected('no transport'))).toBe(false);
    expect(isRetryable(new ApiError('bad', 422))).toBe(false);
  });

  it('applyFlush keeps an item queued while the flush ran', () => {
    const sent = start();
    const late = arrive();
    const next = applyFlush(queued(sent, late), { removed: [sent.clientRequestId], drops: [], stopped: false });
    expect(next.items).toEqual([late]);
  });
});

describe('persistence', () => {
  it('round-trips through the store under a per-user key', async () => {
    const storage = memoryStorage();
    const state = queued(start(), destination(null));
    await saveOutbox(storage, 'user-a', state);

    expect([...storage.data.keys()]).toEqual([outboxKey('user-a')]);
    expect(outboxKey('user-a')).toMatch(/^[A-Za-z0-9._-]+$/); // Secure Store key alphabet
    expect(await loadOutbox(storage, 'user-a')).toEqual(state);
    expect(await loadOutbox(storage, 'user-b')).toEqual(EMPTY_OUTBOX);
  });

  it('an empty outbox deletes the key; a damaged value loads as empty', async () => {
    const storage = memoryStorage();
    await saveOutbox(storage, 'user-a', queued(start()));
    await saveOutbox(storage, 'user-a', EMPTY_OUTBOX);
    expect(storage.data.size).toBe(0);

    storage.data.set(outboxKey('user-a'), '{not json');
    expect(await loadOutbox(storage, 'user-a')).toEqual(EMPTY_OUTBOX);
    storage.data.set(outboxKey('user-a'), JSON.stringify({ items: [{ kind: 'arrive' }, start()], drops: [] }));
    expect((await loadOutbox(storage, 'user-a')).items).toHaveLength(1);
  });
});

describe('sendOutboxItem', () => {
  const fetchMock = jest.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });
  const bodyOf = (call: number) => JSON.parse(fetchMock.mock.calls[call]![1].body as string);

  it('start uses the crew button endpoint (TRANSPORTING) with the clientRequestId', async () => {
    fetchMock.mockResolvedValue(okResponse({}));
    const item = start();
    await sendOutboxItem(item, 'token');

    expect(fetchMock.mock.calls[0]![0]).toMatch(/\/v1\/responders\/assignments\/dispatch-1\/status$/);
    expect(bodyOf(0)).toEqual({ status: 'TRANSPORTING', clientRequestId: item.clientRequestId });
  });

  it('an arrival from the outbox sends occurredAt = the tap time', async () => {
    fetchMock.mockResolvedValue(okResponse({}));
    const item = arrive();
    await sendOutboxItem(item, 'token');

    expect(fetchMock.mock.calls[0]![0]).toMatch(/\/transport\/tr-1\/arrive$/);
    expect(bodyOf(0)).toEqual({ clientRequestId: item.clientRequestId, occurredAt: item.tappedAt });
  });

  it('a destination queued behind its start finds the open record first; none → rejected for good', async () => {
    fetchMock
      .mockResolvedValueOnce(okResponse([{ id: 'tr-9', dispatch_id: DISPATCH, arrived_at: null }]))
      .mockResolvedValueOnce(okResponse({}));
    const item = destination(null);
    await sendOutboxItem(item, 'token');
    expect(fetchMock.mock.calls[1]![0]).toMatch(/\/transport\/tr-9$/);
    expect(bodyOf(1)).toEqual({ destinationId: 'fac-1', clientRequestId: item.clientRequestId });

    fetchMock.mockResolvedValueOnce(okResponse([]));
    await expect(sendOutboxItem(destination(null), 'token')).rejects.toBeInstanceOf(OutboxItemRejected);
  });
});

describe('the shared outbox (Secure Store)', () => {
  it('a queued arrival survives in Secure Store and leaves it once the server accepts it', async () => {
    const fetchMock = jest.fn().mockRejectedValueOnce(new TypeError('Network request failed'))
      .mockResolvedValue(okResponse({}));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const item = arrive();

    expect(await queueOutboxItem('user-a', item)).toBe('QUEUED');
    expect(JSON.parse(mockSaved.get(outboxKey('user-a'))!).items).toEqual([item]);
    expect(SecureStore.setItemAsync).toHaveBeenCalled();

    await flushTransportOutbox('user-a', 'token'); // offline: kept
    expect(getOutboxSnapshot().state.items).toEqual([item]);

    await flushTransportOutbox('user-a', 'token'); // reconnected
    expect(getOutboxSnapshot().state.items).toEqual([]);
    expect(mockSaved.has(outboxKey('user-a'))).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

// Unit field flow plan, Phase 3: a fire crew's report waits in the same outbox.
describe('fire reports in the outbox', () => {
  const fireReport = (body: Record<string, unknown> = { fireStatus: 'ACTIVE', trappedPersons: 2 }) =>
    newOutboxItem({ kind: 'fireReport', incidentId: INCIDENT, dispatchId: DISPATCH, body: body as never });

  it('several reports can wait (each is its own report); the same tap is still queued once', () => {
    const first = fireReport();
    const second = fireReport({ fireStatus: 'UNDER_CONTROL' });
    const state = queued(first, second);
    expect(state.items.map((i) => i.clientRequestId)).toEqual([first.clientRequestId, second.clientRequestId]);
    expect(enqueue(state, first).result).toBe('ALREADY_QUEUED');
    expect(enqueue(state, fireReport()).result).toBe('QUEUED');
    expect(enqueue(queued(first, second, fireReport()), fireReport()).result).toBe('FULL');
  });

  it('is sent to POST /incidents/:id/fire-report with its body and the clientRequestId fixed at the tap', async () => {
    const fetchMock = jest.fn().mockResolvedValue(okResponse({ id: 'rep-1' }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const item = fireReport({ fireStatus: 'ACTIVE', hazards: ['FIREWORKS_EXPLOSIVES'], notes: 'n' });
    await sendOutboxItem(item, 'token');
    await sendOutboxItem(item, 'token'); // a retry after a lost response

    expect(fetchMock.mock.calls[0]![0]).toMatch(/\/v1\/incidents\/inc-1\/fire-report$/);
    expect(fetchMock.mock.calls[0]![1].method).toBe('POST');
    const bodies = fetchMock.mock.calls.map((c) => JSON.parse(c[1].body as string));
    expect(bodies[0]).toEqual({
      fireStatus: 'ACTIVE', hazards: ['FIREWORKS_EXPLOSIVES'], notes: 'n', clientRequestId: item.clientRequestId,
    });
    expect(bodies[1].clientRequestId).toBe(item.clientRequestId);
  });

  it('survives a restart in the store; a fire report item without its body is dropped as damaged', async () => {
    const storage = memoryStorage();
    const item = fireReport();
    await saveOutbox(storage, 'user-a', queued(item));
    expect((await loadOutbox(storage, 'user-a')).items).toEqual([item]);

    const { body: _body, ...broken } = item as Extract<OutboxItem, { kind: 'fireReport' }>;
    storage.data.set(outboxKey('user-a'), JSON.stringify({ items: [broken], drops: [] }));
    expect((await loadOutbox(storage, 'user-a')).items).toEqual([]);
  });

  it('waits behind a transport step queued before it, in tap order', async () => {
    const sent: string[] = [];
    const result = await flushOutbox([start(), fireReport()], async (i) => void sent.push(i.kind));
    expect(sent).toEqual(['start', 'fireReport']);
    expect(result.removed).toHaveLength(2);
  });
});

// Unit field flow plan, Phase 4: a rescue crew's trip waits in the same outbox.
describe('rescue trips in the outbox', () => {
  const rescueTrip = (body: Record<string, unknown> = { rescuedCount: 5, stillWaiting: 8 }) =>
    newOutboxItem({ kind: 'rescueTrip', incidentId: INCIDENT, dispatchId: DISPATCH, body: body as never });

  it('several trips can wait (each is its own trip); the same tap is still queued once', () => {
    const first = rescueTrip();
    const second = rescueTrip({ rescuedCount: 3 });
    const state = queued(first, second);
    expect(state.items.map((i) => i.clientRequestId)).toEqual([first.clientRequestId, second.clientRequestId]);
    expect(enqueue(state, first).result).toBe('ALREADY_QUEUED');
    expect(enqueue(state, rescueTrip()).result).toBe('QUEUED');
    expect(enqueue(queued(first, second, rescueTrip()), rescueTrip()).result).toBe('FULL');
  });

  it('is sent to POST /incidents/:id/rescue-trip with its body and the clientRequestId fixed at the tap', async () => {
    const fetchMock = jest.fn().mockResolvedValue(okResponse({ id: 'trip-1' }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const item = rescueTrip({ rescuedCount: 6, children: 2, takenTo: 'EVACUATION_CENTER', takenToFacilityId: 'fac-ec' });
    await sendOutboxItem(item, 'token');
    await sendOutboxItem(item, 'token'); // a retry after a lost response

    expect(fetchMock.mock.calls[0]![0]).toMatch(/\/v1\/incidents\/inc-1\/rescue-trip$/);
    expect(fetchMock.mock.calls[0]![1].method).toBe('POST');
    const bodies = fetchMock.mock.calls.map((c) => JSON.parse(c[1].body as string));
    expect(bodies[0]).toEqual({
      rescuedCount: 6, children: 2, takenTo: 'EVACUATION_CENTER', takenToFacilityId: 'fac-ec',
      clientRequestId: item.clientRequestId,
    });
    expect(bodies[1].clientRequestId).toBe(item.clientRequestId);
  });

  it('survives a restart in the store; a rescue trip item without its body is dropped as damaged', async () => {
    const storage = memoryStorage();
    const item = rescueTrip();
    await saveOutbox(storage, 'user-a', queued(item));
    expect((await loadOutbox(storage, 'user-a')).items).toEqual([item]);

    const { body: _body, ...broken } = item as Extract<OutboxItem, { kind: 'rescueTrip' }>;
    storage.data.set(outboxKey('user-a'), JSON.stringify({ items: [broken], drops: [] }));
    expect((await loadOutbox(storage, 'user-a')).items).toEqual([]);
  });

  it('waits behind a step queued before it, in tap order', async () => {
    const sent: string[] = [];
    await flushOutbox([start(), rescueTrip(), rescueTrip({ rescuedCount: 2 })], async (i) => void sent.push(i.kind));
    expect(sent).toEqual(['start', 'rescueTrip', 'rescueTrip']);
  });
});
