/**
 * Password strength for registration (MOD-01). The rules are the registration schema's: 8–128 characters with a
 * lowercase letter, an uppercase letter, a number and a symbol. "Strong" means every rule is met, so the meter
 * never calls a password strong that the form would refuse.
 */

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

/** Each rule, in the order its hint is shown: the first one not met is the next thing to fix. */
export const PASSWORD_RULES = [
  { key: 'length', test: (value: string) => value.length >= PASSWORD_MIN_LENGTH },
  { key: 'lowercase', test: (value: string) => /[a-z]/.test(value) },
  { key: 'uppercase', test: (value: string) => /[A-Z]/.test(value) },
  { key: 'number', test: (value: string) => /\d/.test(value) },
  { key: 'symbol', test: (value: string) => /[^A-Za-z0-9\s]/.test(value) },
] as const;

export type PasswordRuleKey = (typeof PASSWORD_RULES)[number]['key'] | 'maximum';

/** 0: empty, 1: weak, 2: fair, 3: good, 4: strong (every rule met). */
export type PasswordLevel = 0 | 1 | 2 | 3 | 4;

export interface PasswordStrength {
  level: PasswordLevel;
  /** Every rule is met: the form will accept it. */
  meetsAll: boolean;
  /** The next rule to fix, or null when there's nothing to fix (or nothing typed yet). */
  nextRule: PasswordRuleKey | null;
}

export function passwordStrength(password: string): PasswordStrength {
  if (!password) return { level: 0, meetsAll: false, nextRule: null };

  const unmet = PASSWORD_RULES.filter((rule) => !rule.test(password)).map((rule) => rule.key);
  if (password.length > PASSWORD_MAX_LENGTH) {
    // Too long is the one thing to fix, whatever else is met; it can't be called strong.
    return { level: unmet.length === 0 ? 3 : levelFor(unmet.length), meetsAll: false, nextRule: 'maximum' };
  }
  if (unmet.length === 0) return { level: 4, meetsAll: true, nextRule: null };
  return { level: levelFor(unmet.length), meetsAll: false, nextRule: unmet[0] ?? null };
}

/** One rule short is good, two is fair, three or more is weak. */
function levelFor(unmetCount: number): 1 | 2 | 3 {
  if (unmetCount === 1) return 3;
  if (unmetCount === 2) return 2;
  return 1;
}
