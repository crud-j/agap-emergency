import { Injectable } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { PrismaService } from '../../common/prisma/prisma.service';
import { BACKUP_CODE_COUNT } from './mfa.constants';

/** Plan §6.4: 10 characters from [a-z2-9], shown as xxxxx-xxxxx. */
const ALPHABET = 'abcdefghijklmnopqrstuvwxyz23456789';
const CODE_LENGTH = 10;
/**
 * Codes carry ~51 bits of entropy, so a fast-ish hash is enough — and verification may
 * have to compare against every unused code, which a cost-12 hash would make slow.
 */
const BCRYPT_ROUNDS = 10;

function generateCode(): string {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) code += ALPHABET[crypto.randomInt(ALPHABET.length)];
  return `${code.slice(0, 5)}-${code.slice(5)}`;
}

/** Accept the code as typed: case, spaces and the dash don't matter. */
export function normalizeBackupCode(input: string): string | null {
  const normalized = input.toLowerCase().replace(/[\s-]/g, '');
  return new RegExp(`^[${ALPHABET}]{${CODE_LENGTH}}$`).test(normalized) ? normalized : null;
}

@Injectable()
export class BackupCodesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Replace the user's whole set. The plaintext codes are returned once and never stored. */
  async regenerate(userId: string): Promise<string[]> {
    const codes = Array.from({ length: BACKUP_CODE_COUNT }, generateCode);
    const rows = await Promise.all(
      codes.map(async (code) => ({
        user_id: userId,
        code_hash: await bcrypt.hash(normalizeBackupCode(code)!, BCRYPT_ROUNDS),
      })),
    );
    await this.prisma.$transaction(async (tx) => {
      await tx.user_backup_codes.deleteMany({ where: { user_id: userId } });
      await tx.user_backup_codes.createMany({ data: rows });
    });
    return codes;
  }

  /** Check a code and burn it. Single use even if two requests present it at once. */
  async verifyAndConsume(userId: string, input: string): Promise<boolean> {
    const code = normalizeBackupCode(input);
    if (!code) return false;
    const unused = await this.prisma.user_backup_codes.findMany({ where: { user_id: userId, used_at: null } });
    for (const row of unused) {
      if (!(await bcrypt.compare(code, row.code_hash))) continue;
      const { count } = await this.prisma.user_backup_codes.updateMany({
        where: { id: row.id, used_at: null },
        data: { used_at: new Date() },
      });
      return count === 1;
    }
    return false;
  }

  remaining(userId: string): Promise<number> {
    return this.prisma.user_backup_codes.count({ where: { user_id: userId, used_at: null } });
  }

  async removeAll(userId: string): Promise<void> {
    await this.prisma.user_backup_codes.deleteMany({ where: { user_id: userId } });
  }
}
