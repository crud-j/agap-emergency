import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

/**
 * AES-256-GCM sealing for secrets that must be recoverable (TOTP seeds). Not for
 * passwords or codes — those are hashed.
 *
 * Format: `v1.<iv>.<tag>.<ciphertext>` (base64url). `aad` binds the ciphertext to
 * its owner (the user id), so a sealed value copied onto another account's row
 * fails to open instead of silently becoming that account's secret.
 */
const VERSION = 'v1';
const KEY_BYTES = 32;
const IV_BYTES = 12;

/** Decode MFA_ENCRYPTION_KEY (32 bytes, base64). Returns null when unset; throws when set but malformed. */
export function parseEncryptionKey(raw: string | undefined): Buffer | null {
  const value = raw?.trim();
  if (!value) return null;
  const key = Buffer.from(value, 'base64');
  if (key.length !== KEY_BYTES) {
    throw new Error(`MFA_ENCRYPTION_KEY must be ${KEY_BYTES} bytes, base64-encoded (got ${key.length})`);
  }
  return key;
}

export function seal(plaintext: string, key: Buffer, aad: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(aad, 'utf8'));
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return [VERSION, iv, cipher.getAuthTag(), ciphertext].map((part) =>
    typeof part === 'string' ? part : part.toString('base64url'),
  ).join('.');
}

/** Throws when the key, the owner (`aad`) or the stored value is wrong or has been tampered with. */
export function open(sealed: string, key: Buffer, aad: string): string {
  const [version, iv, tag, ciphertext] = sealed.split('.');
  if (version !== VERSION || !iv || !tag || !ciphertext) throw new Error('Unsupported sealed value');
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'));
  decipher.setAAD(Buffer.from(aad, 'utf8'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, 'base64url')), decipher.final()]).toString('utf8');
}
