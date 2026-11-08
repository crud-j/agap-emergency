import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'crypto';
import type { IdName } from '@agap/shared';
import { open, openBuffer, parseEncryptionKey, seal, sealBuffer } from '../common/crypto/secret-box';

const KEY_NAME = 'ID_DOCUMENT_ENCRYPTION_KEY';
const PEPPER_NAME = 'ID_PIN_PEPPER';

/**
 * Seals what AGAP keeps from an ID scan (MOD-01 / MOD-48): the name read from
 * the card and the card image. Both are bound to their verification row (`aad`), so a
 * value copied onto another row fails to open. Its own key: rotating the MFA or medical
 * key never touches ID documents. The PIN is never sealed or stored, only HMAC'd.
 */
@Injectable()
export class IdDocumentCryptoService {
  constructor(private readonly config: ConfigService) {}

  isConfigured(): boolean {
    try {
      return this.loadKey() !== null && !!this.loadPepper();
    } catch {
      return false;
    }
  }

  sealName(verificationId: string, name: IdName): string {
    return seal(JSON.stringify(name), this.requireKey(), this.aad(verificationId));
  }

  openName(verificationId: string, sealed: string): IdName {
    return JSON.parse(open(sealed, this.requireKey(), this.aad(verificationId))) as IdName;
  }

  sealImage(verificationId: string, image: Buffer): Buffer {
    return sealBuffer(image, this.requireKey(), this.aad(verificationId));
  }

  openImage(verificationId: string, sealed: Buffer): Buffer {
    return openBuffer(sealed, this.requireKey(), this.aad(verificationId));
  }

  /** HMAC-SHA256 of the 12-digit PIN (hex). Only for the one-ID-per-account check. */
  pinHmac(pin: string): string {
    const pepper = this.loadPepper();
    if (!pepper) throw this.notConfigured();
    return createHmac('sha256', pepper).update(pin, 'utf8').digest('hex');
  }

  private requireKey(): Buffer {
    const key = this.loadKey();
    if (!key) throw this.notConfigured();
    return key;
  }

  private loadKey(): Buffer | null {
    return parseEncryptionKey(this.config.get<string>(KEY_NAME), KEY_NAME);
  }

  private loadPepper(): string | undefined {
    return this.config.get<string>(PEPPER_NAME)?.trim() || undefined;
  }

  private notConfigured(): ServiceUnavailableException {
    return new ServiceUnavailableException('ID verification is not configured on this server');
  }

  private aad(verificationId: string): string {
    return `identity_verification:${verificationId}`;
  }
}
