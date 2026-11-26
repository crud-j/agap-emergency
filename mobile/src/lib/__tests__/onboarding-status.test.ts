/// <reference types="jest" />

const mockStore = new Map<string, string>();
const mockGetItem = jest.fn(async (k: string) => mockStore.get(k) ?? null);
const mockSetItem = jest.fn(async (k: string, v: string) => { mockStore.set(k, v); });
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: (k: string) => mockGetItem(k),
    setItem: (k: string, v: string) => mockSetItem(k, v),
  },
}));

import { hasCompletedOnboarding, markOnboardingComplete } from '../onboarding-status';

describe('onboarding shows once per install', () => {
  beforeEach(() => {
    mockStore.clear();
    mockGetItem.mockClear();
    mockSetItem.mockClear();
  });

  it('a fresh install has not completed onboarding', async () => {
    await expect(hasCompletedOnboarding()).resolves.toBe(false);
  });

  it('after Skip or Continue, every later launch skips it', async () => {
    await markOnboardingComplete();
    await expect(hasCompletedOnboarding()).resolves.toBe(true);
    await expect(hasCompletedOnboarding()).resolves.toBe(true);
  });

  it('unreadable storage counts as done, so nobody is trapped in onboarding', async () => {
    mockGetItem.mockRejectedValueOnce(new Error('storage unavailable'));
    await expect(hasCompletedOnboarding()).resolves.toBe(true);
  });

  it('a failed write never throws', async () => {
    mockSetItem.mockRejectedValueOnce(new Error('disk full'));
    await expect(markOnboardingComplete()).resolves.toBeUndefined();
  });
});
