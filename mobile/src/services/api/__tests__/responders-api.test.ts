/// <reference types="jest" />
import { requestHelp } from '../responders.api';
import { ApiError } from '../http';

const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';

function mockFetch(status: number, body: unknown) {
  const fetchMock = jest.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  });
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

describe('requestHelp (plan Phase 2 step 5)', () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it('POSTs the need, count, trimmed note and clientRequestId to the help-request route', async () => {
    const fetchMock = mockFetch(201, { deduplicated: false, incidentId: 'inc-1' });

    const result = await requestHelp(
      'disp-1',
      { need: 'AMBULANCE', count: 2, note: '  two burned  ', clientRequestId: 'req-1' },
      'tok',
    );

    expect(result).toEqual({ deduplicated: false, incidentId: 'inc-1' });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${API_BASE}/v1/responders/assignments/disp-1/help-request`);
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer tok');
    expect(JSON.parse(init.body)).toEqual({ need: 'AMBULANCE', count: 2, note: 'two burned', clientRequestId: 'req-1' });
  });

  it('leaves out an empty note and the unset optional fields', async () => {
    const fetchMock = mockFetch(201, { deduplicated: true, incidentId: 'inc-1' });

    const result = await requestHelp('disp-1', { need: 'MORE_PERSONNEL', note: '   ' }, 'tok');

    expect(result.deduplicated).toBe(true);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ need: 'MORE_PERSONNEL' });
  });

  it("throws the server's reason so the sheet can show it", async () => {
    mockFetch(403, { message: 'You are not on an active crew for this incident.' });

    await expect(requestHelp('disp-1', { need: 'FIRE_UNIT' }, 'tok')).rejects.toEqual(
      expect.objectContaining({ message: 'You are not on an active crew for this incident.', status: 403 }),
    );
    await expect(requestHelp('disp-1', { need: 'FIRE_UNIT' }, 'tok')).rejects.toBeInstanceOf(ApiError);
  });
});
