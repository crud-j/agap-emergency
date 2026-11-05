import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

/**
 * AES-256-GCM sealing for secrets that must be recoverable (TOTP seeds, medical
 * profile fields). Not for passwords or codes — those are hashed.
 *
 * Format: `v1.<iv>.<tag>.<ciphertext>` (base64url). `aad` binds the ciphertext to
 * its owner (the user id), so a sealed value copied onto another account's row
 * fails to open instead of silently becoming that account's secret.
 */
const VERSION = 'v1';
const KEY_BYTES = 32;
const IV_BYTES = 12;

/** Decode a 32-byte base64 key (e.g. MFA_ENCRYPTION_KEY). Returns null when unset; throws when set but malformed. */
export function parseEncryptionKey(raw: string | undefined, name = 'MFA_ENCRYPTION_KEY'): Buffer | null {
  const value = raw?.trim();
  if (!value) return null;
  const key = Buffer.from(value, 'base64');
  if (key.length !== KEY_BYTES) {
    throw new Error(`${name} must be ${KEY_BYTES} bytes, base64-encoded (got ${key.length})`);
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
/** Whether a stored value is in the sealed format (rows written before encryption are not). */
export function isSealed(value: string): boolean {
  return value.startsWith(`${VERSION}.`);
}

export function open(sealed: string, key: Buffer, aad: string): string {
  const [version, iv, tag, ciphertext] = sealed.split('.');
  if (version !== VERSION || !iv || !tag || !ciphertext) throw new Error('Unsupported sealed value');
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'));
  decipher.setAAD(Buffer.from(aad, 'utf8'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, 'base64url')), decipher.final()]).toString('utf8');
}

// Binary form of the same v1 format, for files (ID images) where base64 would add a third:
// `v1.` + iv (12 bytes) + tag (16 bytes) + ciphertext.
const BUFFER_PREFIX = Buffer.from(`${VERSION}.`, 'ascii');
const TAG_BYTES = 16;

export function sealBuffer(plaintext: Buffer, key: Buffer, aad: string): Buffer {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(aad, 'utf8'));
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return Buffer.concat([BUFFER_PREFIX, iv, cipher.getAuthTag(), ciphertext]);
}

/** Throws when the key, the owner (`aad`) or the stored bytes are wrong or have been tampered with. */
export function openBuffer(sealed: Buffer, key: Buffer, aad: string): Buffer {
  const headerBytes = BUFFER_PREFIX.length + IV_BYTES + TAG_BYTES;
  if (sealed.length <= headerBytes || !sealed.subarray(0, BUFFER_PREFIX.length).equals(BUFFER_PREFIX)) {
    throw new Error('Unsupported sealed value');
  }
  const ivStart = BUFFER_PREFIX.length;
  const tagStart = ivStart + IV_BYTES;
  const decipher = createDecipheriv('aes-256-gcm', key, sealed.subarray(ivStart, tagStart));
  decipher.setAAD(Buffer.from(aad, 'utf8'));
  decipher.setAuthTag(sealed.subarray(tagStart, headerBytes));
  return Buffer.concat([decipher.update(sealed.subarray(headerBytes)), decipher.final()]);
}
