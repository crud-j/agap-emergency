import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { isSealed, open, parseEncryptionKey, seal } from '../common/crypto/secret-box';

const KEY_NAME = 'MEDICAL_ENCRYPTION_KEY';

/** The medical columns that are sealed at rest (MOD-03 / MOD-48). */
export interface MedicalFields {
  blood_type: string | null;
  allergies: string[];
  current_medications: string[];
  medical_conditions: string[];
  disabilities: string[];
  responder_notes: string | null;
}

/**
 * Seals medical profile fields with AES-256-GCM before they reach PostgreSQL and
 * opens them on the way out. Each value is bound to its owner (`aad`), so a value
 * copied onto another user's row fails to open. Its own key: rotating the MFA key
 * never touches medical data.
 *
 * Rows saved before encryption are plaintext; they are returned as they are and
 * sealed on the next save (or by `scripts/encrypt-medical-profiles.ts`).
 */
@Injectable()
export class MedicalCryptoService {
  constructor(private readonly config: ConfigService) {}

  isConfigured(): boolean {
    try {
      return this.loadKey() !== null;
    } catch {
      return false;
    }
  }

  /** Seals only the fields present in `fields`, so partial updates stay partial. */
  sealFields<T extends Partial<MedicalFields>>(userId: string, fields: T): T {
    const key = this.requireKey();
    const aad = this.aad(userId);
    const out: Record<string, unknown> = {};
    for (const [name, value] of Object.entries(fields)) {
      if (value === undefined) continue;
      if (value === null) out[name] = null;
      else if (Array.isArray(value)) out[name] = value.map((item: string) => seal(item, key, aad));
      else out[name] = seal(value as string, key, aad);
    }
    return out as T;
  }

  /** Returns the profile with its medical fields readable. */
  openProfile<T extends MedicalFields & { user_id: string }>(profile: T): T {
    const aad = this.aad(profile.user_id);
    const read = (value: string) => {
      if (!isSealed(value)) return value; // saved before encryption
      return open(value, this.requireKey(), aad);
    };
    return {
      ...profile,
      blood_type: profile.blood_type === null ? null : read(profile.blood_type),
      allergies: profile.allergies.map(read),
      current_medications: profile.current_medications.map(read),
      medical_conditions: profile.medical_conditions.map(read),
      disabilities: profile.disabilities.map(read),
      responder_notes: profile.responder_notes === null ? null : read(profile.responder_notes),
    };
  }

  private requireKey(): Buffer {
    const key = this.loadKey();
    if (!key) {
      throw new ServiceUnavailableException('Medical data encryption is not configured on this server');
    }
    return key;
  }

  private loadKey(): Buffer | null {
    return parseEncryptionKey(this.config.get<string>(KEY_NAME), KEY_NAME);
  }

  private aad(userId: string): string {
    return `medical_profile:${userId}`;
  }
}
