import { ServiceUnavailableException } from '@nestjs/common';
import { openBuffer, sealBuffer } from '../../src/common/crypto/secret-box';
import { validateConfig } from '../../src/config/config.validation';
import { IdDocumentCryptoService } from '../../src/identity-verification/id-document-crypto.service';
import { JPEG, KEY, PEPPER, PIN, makeConfig } from './id-test-kit';

// MOD-01 / MOD-48 — sealing what a PhilHealth ID scan leaves behind (plan §5.1–§5.2).
describe('IdDocumentCryptoService', () => {
  const crypto = new IdDocumentCryptoService(makeConfig());
  const name = { last: 'DELA CRUZ', first: 'JUAN', middle: 'SANTOS' };

  it('seals the name so it opens only for its own verification row', () => {
    const sealed = crypto.sealName('row-1', name);
    expect(sealed.startsWith('v1.')).toBe(true);
    expect(sealed).not.toContain('DELA');
    expect(crypto.openName('row-1', sealed)).toEqual(name);
    expect(() => crypto.openName('row-2', sealed)).toThrow();
  });

  it('seals the image bytes in the binary v1 format, bound to the row', () => {
    const sealed = crypto.sealImage('row-1', JPEG);
    expect(sealed.subarray(0, 3).toString('ascii')).toBe('v1.');
    expect(sealed.includes(JPEG.subarray(4, 20))).toBe(false);
    expect(crypto.openImage('row-1', sealed).equals(JPEG)).toBe(true);
    expect(() => crypto.openImage('row-2', sealed)).toThrow();
  });

  it('refuses tampered or truncated image bytes', () => {
    const sealed = crypto.sealImage('row-1', JPEG);
    const tampered = Buffer.from(sealed);
    tampered[tampered.length - 1]! ^= 0xff;
    expect(() => crypto.openImage('row-1', tampered)).toThrow();
    expect(() => openBuffer(sealed.subarray(0, 20), Buffer.from(KEY, 'base64'), 'x')).toThrow('Unsupported sealed value');
    expect(() => openBuffer(Buffer.from('not sealed at all, just text'), Buffer.from(KEY, 'base64'), 'x')).toThrow();
  });

  it('round-trips through the secret-box Buffer variant directly', () => {
    const key = Buffer.from(KEY, 'base64');
    expect(openBuffer(sealBuffer(PNG_LIKE, key, 'a'), key, 'a').equals(PNG_LIKE)).toBe(true);
  });

  it('HMACs the PIN: stable, 64 hex characters, never the PIN itself, pepper-dependent', () => {
    const hmac = crypto.pinHmac(PIN);
    expect(hmac).toMatch(/^[0-9a-f]{64}$/);
    expect(hmac).toBe(crypto.pinHmac(PIN));
    expect(hmac).not.toContain(PIN);
    expect(new IdDocumentCryptoService(makeConfig({ ID_PIN_PEPPER: `${PEPPER}x` })).pinHmac(PIN)).not.toBe(hmac);
  });

  it('is unavailable without its key or pepper, instead of sealing with nothing', () => {
    const noKey = new IdDocumentCryptoService(makeConfig({ ID_DOCUMENT_ENCRYPTION_KEY: undefined }));
    const noPepper = new IdDocumentCryptoService(makeConfig({ ID_PIN_PEPPER: '' }));
    expect(noKey.isConfigured()).toBe(false);
    expect(noPepper.isConfigured()).toBe(false);
    expect(crypto.isConfigured()).toBe(true);
    expect(() => noKey.sealName('row-1', name)).toThrow(ServiceUnavailableException);
    expect(() => noPepper.pinHmac(PIN)).toThrow(ServiceUnavailableException);
  });
});

const PNG_LIKE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4, 5]);

describe('startup configuration (ID_VERIFICATION_REQUIRED)', () => {
  const base = {
    DATABASE_URL: 'postgres://localhost/agap',
    REDIS_URL: 'redis://localhost:6379',
    JWT_SECRET: 'x',
    JWT_REFRESH_SECRET: 'y',
  };

  it('refuses to start with the flag on and no ID key', () => {
    expect(() => validateConfig({ ...base, ID_VERIFICATION_REQUIRED: 'true', ID_PIN_PEPPER: PEPPER })).toThrow(
      'ID_VERIFICATION_REQUIRED=true requires ID_DOCUMENT_ENCRYPTION_KEY',
    );
  });

  it('refuses to start with the flag on and a missing or short pepper', () => {
    const on = { ...base, ID_VERIFICATION_REQUIRED: 'true', ID_DOCUMENT_ENCRYPTION_KEY: KEY };
    expect(() => validateConfig(on)).toThrow('requires ID_PIN_PEPPER');
    expect(() => validateConfig({ ...on, ID_PIN_PEPPER: 'short' })).toThrow('requires ID_PIN_PEPPER');
  });

  it('refuses a malformed key even with the flag off', () => {
    expect(() => validateConfig({ ...base, ID_DOCUMENT_ENCRYPTION_KEY: 'dG9vLXNob3J0' })).toThrow(
      'ID_DOCUMENT_ENCRYPTION_KEY must be 32 bytes',
    );
  });

  it('starts with the flag on and both secrets, or with the flag off and none', () => {
    expect(() =>
      validateConfig({ ...base, ID_VERIFICATION_REQUIRED: 'true', ID_DOCUMENT_ENCRYPTION_KEY: KEY, ID_PIN_PEPPER: PEPPER }),
    ).not.toThrow();
    expect(() => validateConfig({ ...base, ID_VERIFICATION_REQUIRED: 'false' })).not.toThrow();
    expect(() => validateConfig(base)).not.toThrow();
  });
});
