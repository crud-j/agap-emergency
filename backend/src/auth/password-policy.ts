import { BadRequestException } from '@nestjs/common';
import { dictionary } from '@zxcvbn-ts/language-common';

const COMMON_PASSWORDS = new Set(
  dictionary['passwords-common'].slice(0, 10_000).map((password) => password.toLowerCase()),
);

export interface PasswordIdentity {
  email?: string | null;
  name?: string | null;
}

function normalize(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

export function assertPasswordPolicy(password: string, identity: PasswordIdentity): void {
  const length = Array.from(password).length;
  if (length < 12) throw new BadRequestException('Password must be at least 12 characters long');
  if (length > 128) throw new BadRequestException('Password must be no more than 128 characters long');

  const normalizedPassword = normalize(password);
  const emailLocalPart = identity.email?.split('@')[0] ?? '';
  const nameParts = identity.name?.split(/[^a-zA-Z0-9]+/) ?? [];
  const personalTerms = [emailLocalPart, ...nameParts]
    .map(normalize)
    .filter((term) => term.length >= 3);
  const restrictedTerms = ['agap', 'bocaue', ...personalTerms];

  if (restrictedTerms.some((term) => normalizedPassword.includes(term))) {
    throw new BadRequestException('Password must not contain your name, email, AGAP, or Bocaue');
  }

  if (COMMON_PASSWORDS.has(password.toLowerCase())) {
    throw new BadRequestException('Choose a password that is not commonly used');
  }
}
