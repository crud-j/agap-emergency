import { Logger } from '@nestjs/common';
import { generateKeyPairSync } from 'crypto';

jest.mock('firebase-admin/app', () => {
  const apps: unknown[] = [];
  return {
    getApps: jest.fn(() => apps),
    cert: jest.fn((c: unknown) => c),
    initializeApp: jest.fn(() => {
      apps.push({});
      return {};
    }),
    __apps: apps,
  };
});

import * as firebaseApp from 'firebase-admin/app';
import { ensureFirebaseApp, normalizeFirebasePrivateKey } from '../../src/notifications/firebase-admin';

const PEM = generateKeyPairSync('rsa', { modulusLength: 1024 })
  .privateKey.export({ type: 'pkcs8', format: 'pem' })
  .toString();
const ONE_LINE = PEM.trim().split('\n').join('\\n') + '\\n';

/** MOD-16/18: push is best effort. A badly pasted key turns push off; it never stops the backend. */
describe('normalizeFirebasePrivateKey', () => {
  it.each([
    ['one line with \\n escapes (.env form)', ONE_LINE],
    ['the same, with the double quotes of KEY="..." kept', `"${ONE_LINE}"`],
    ['single quotes kept', `'${ONE_LINE}'`],
    ['real line breaks', PEM],
    ['Windows line breaks', PEM.replace(/\n/g, '\r\n')],
    ['escaped Windows line breaks', PEM.trim().split('\n').join('\\r\\n')],
  ])('%s gives the PEM text', (_label, raw) => {
    expect(normalizeFirebasePrivateKey(raw)).toBe(PEM.trim() + '\n');
  });

  it('treats empty and missing values as missing', () => {
    expect(normalizeFirebasePrivateKey(undefined)).toBeUndefined();
    expect(normalizeFirebasePrivateKey('   ')).toBeUndefined();
    expect(normalizeFirebasePrivateKey('""')).toBeUndefined();
  });
});

describe('ensureFirebaseApp', () => {
  const apps = (firebaseApp as unknown as { __apps: unknown[] }).__apps;
  const logger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() } as unknown as Logger;
  const config = (values: Record<string, string | undefined>) => ({ get: (k: string) => values[k] }) as any;

  beforeEach(() => {
    apps.length = 0;
    jest.clearAllMocks();
  });

  it('initializes once with the normalized key', () => {
    const ok = ensureFirebaseApp(
      config({ FIREBASE_PROJECT_ID: 'p', FIREBASE_CLIENT_EMAIL: 'e@x', FIREBASE_PRIVATE_KEY: `"${ONE_LINE}"` }),
      logger,
    );
    expect(ok).toBe(true);
    expect(firebaseApp.cert).toHaveBeenCalledWith({ projectId: 'p', clientEmail: 'e@x', privateKey: PEM.trim() + '\n' });
    expect(ensureFirebaseApp(config({}), logger)).toBe(true);
    expect(firebaseApp.initializeApp).toHaveBeenCalledTimes(1);
  });

  it('returns false and warns when a value is missing', () => {
    expect(ensureFirebaseApp(config({ FIREBASE_PROJECT_ID: 'p' }), logger)).toBe(false);
    expect(logger.warn).toHaveBeenCalled();
    expect(firebaseApp.initializeApp).not.toHaveBeenCalled();
  });

  it('does not throw when firebase-admin rejects the key, and does not log the key', () => {
    (firebaseApp.initializeApp as jest.Mock).mockImplementationOnce(() => {
      throw new Error('Failed to parse private key.');
    });
    const secret = 'not-a-real-key-abc123';
    expect(() =>
      ensureFirebaseApp(
        config({ FIREBASE_PROJECT_ID: 'p', FIREBASE_CLIENT_EMAIL: 'e@x', FIREBASE_PRIVATE_KEY: secret }),
        logger,
      ),
    ).not.toThrow();
    const logged = (logger.error as jest.Mock).mock.calls.flat().join(' ');
    expect(logged).toContain('Failed to parse private key.');
    expect(logged).not.toContain(secret);
  });
});
