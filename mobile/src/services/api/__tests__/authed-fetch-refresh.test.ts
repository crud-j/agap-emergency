/// <reference types="jest" />
import { ApiError, NetworkError } from '../http';

const mockRefreshAuthToken = jest.fn();
jest.mock('../auth.api', () => ({ refreshAuthToken: (t: string) => mockRefreshAuthToken(t) }));

const mockLogin = jest.fn(async () => {});
const mockLogout = jest.fn(async () => {});
const mockState = {
  accessToken: 'old-access' as string | null,
  refreshToken: 'refresh-1' as string | null,
  user: { id: 'u1' } as unknown,
  login: mockLogin,
  logout: mockLogout,
};
jest.mock('../../../stores/auth.store', () => ({ useAuthStore: { getState: () => mockState } }));

import { authedFetch, refreshAccessToken, refreshSession } from '../authed-fetch';

function response(status: number) {
  return { ok: status >= 200 && status < 300, status, json: async () => ({}), text: async () => '{}' };
}

describe('session refresh keeps the session when the server cannot be reached', () => {
  const realFetch = globalThis.fetch;
  beforeEach(() => {
    jest.clearAllMocks();
    mockState.refreshToken = 'refresh-1';
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it('stores new tokens on success', async () => {
    mockRefreshAuthToken.mockResolvedValue({ accessToken: 'a2', refreshToken: 'r2' });
    await expect(refreshSession()).resolves.toBe('refreshed');
    expect(mockLogin).toHaveBeenCalledWith({ accessToken: 'a2', refreshToken: 'r2' }, mockState.user);
    expect(mockLogout).not.toHaveBeenCalled();
  });

  it.each([400, 401, 403])('logs out when the server refuses the token (%i)', async (status) => {
    mockRefreshAuthToken.mockRejectedValue(new ApiError('Invalid or expired refresh token', status));
    await expect(refreshSession()).resolves.toBe('ended');
    expect(mockLogout).toHaveBeenCalledTimes(1);
  });

  it('logs out when there is no refresh token', async () => {
    mockState.refreshToken = null;
    await expect(refreshAccessToken()).resolves.toBe(false);
    expect(mockLogout).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['a dropped connection', new NetworkError(new TypeError('Network request failed'))],
    ['a rate limit', new ApiError('Too Many Requests', 429)],
    ['a server error', new ApiError('Bad Gateway', 502)],
    ['a Wi-Fi sign-in page (non-JSON)', new SyntaxError('JSON Parse error: Unexpected character: <')],
  ])('keeps the session on %s', async (_label, err) => {
    mockRefreshAuthToken.mockRejectedValue(err);
    await expect(refreshSession()).resolves.toBe('unreachable');
    await expect(refreshAccessToken()).resolves.toBe(false);
    expect(mockLogout).not.toHaveBeenCalled();
  });

  it('shares one refresh between concurrent callers', async () => {
    mockRefreshAuthToken.mockResolvedValue({ accessToken: 'a2', refreshToken: 'r2' });
    const [a, b] = await Promise.all([refreshSession(), refreshAccessToken()]);
    expect(a).toBe('refreshed');
    expect(b).toBe(true);
    expect(mockRefreshAuthToken).toHaveBeenCalledTimes(1);
  });

  it('authedFetch throws NetworkError (not "session expired") when the refresh cannot reach the server', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue(response(401)) as unknown as typeof fetch;
    mockRefreshAuthToken.mockRejectedValue(new NetworkError());
    await expect(authedFetch('https://api.test/v1/users/me')).rejects.toBeInstanceOf(NetworkError);
    expect(mockLogout).not.toHaveBeenCalled();
  });

  it('authedFetch reports an ended session when the server refuses the refresh', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue(response(401)) as unknown as typeof fetch;
    mockRefreshAuthToken.mockRejectedValue(new ApiError('Invalid or expired refresh token', 401));
    await expect(authedFetch('https://api.test/v1/users/me')).rejects.toThrow('Session expired');
    expect(mockLogout).toHaveBeenCalledTimes(1);
  });

  it('authedFetch retries with the new token after a refresh', async () => {
    const fetchMock = jest.fn()
      .mockResolvedValueOnce(response(401))
      .mockResolvedValueOnce(response(200));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    mockRefreshAuthToken.mockImplementation(async () => {
      mockState.accessToken = 'a2';
      return { accessToken: 'a2', refreshToken: 'r2' };
    });
    const res = await authedFetch('https://api.test/v1/users/me');
    expect(res.status).toBe(200);
    expect(fetchMock.mock.calls[1][1].headers.Authorization).toBe('Bearer a2');
  });
});
