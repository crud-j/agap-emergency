import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { cert, getApps, initializeApp } from 'firebase-admin/app';

/**
 * Turns FIREBASE_PRIVATE_KEY into the PEM text firebase-admin expects, however it was
 * pasted: one line with literal `\n` escapes (the .env form), real line breaks, Windows
 * line breaks, or with the surrounding quotes kept (some dashboards store the quotes of
 * a pasted `KEY="..."` line as part of the value).
 */
export function normalizeFirebasePrivateKey(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  let key = raw.trim();
  if (key.length >= 2 && ((key.startsWith('"') && key.endsWith('"')) || (key.startsWith("'") && key.endsWith("'")))) {
    key = key.slice(1, -1);
  }
  key = key.replace(/\\r/g, '').replace(/\\n/g, '\n').replace(/\r\n/g, '\n').trim();
  return key ? `${key}\n` : undefined;
}

/**
 * Initializes the shared Firebase Admin app once. Never throws: a missing or unreadable
 * key only turns push off (logged), it must not stop the backend from starting, because
 * push is a best-effort channel (a failed push never blocks an incident).
 * Returns whether Firebase is available.
 */
export function ensureFirebaseApp(config: ConfigService, logger: Logger): boolean {
  if (getApps().length > 0) return true;
  const projectId = config.get<string>('FIREBASE_PROJECT_ID')?.trim();
  const clientEmail = config.get<string>('FIREBASE_CLIENT_EMAIL')?.trim();
  const privateKey = normalizeFirebasePrivateKey(config.get<string>('FIREBASE_PRIVATE_KEY'));
  if (!projectId || !clientEmail || !privateKey) {
    logger.warn(
      'Firebase Admin not initialized: FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL or FIREBASE_PRIVATE_KEY missing. Push is off.',
    );
    return false;
  }
  try {
    initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
    logger.log('Firebase Admin initialized');
    return true;
  } catch (err) {
    // The message never contains the key itself.
    logger.error(
      `Firebase Admin could not start (${err instanceof Error ? err.message : String(err)}). ` +
        'Check FIREBASE_PRIVATE_KEY: the full "-----BEGIN PRIVATE KEY-----...-----END PRIVATE KEY-----" text. Push is off.',
    );
    return false;
  }
}
