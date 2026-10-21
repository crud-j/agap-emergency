/**
 * Accounts that have signed in on this browser, for the "Choose an account" screen.
 *
 * Only a display name and an email are kept — never a password, token or role — and
 * only in this browser's localStorage. Anyone can remove an entry ("Remove an account"),
 * which matters on a shared console PC.
 */
const STORAGE_KEY = 'agap.accounts.v1';
const MAX_ACCOUNTS = 5;

export interface RememberedAccount {
  email: string;
  name: string;
  lastUsedAt: number;
}

function isAccount(value: unknown): value is RememberedAccount {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return typeof v['email'] === 'string' && typeof v['name'] === 'string' && typeof v['lastUsedAt'] === 'number';
}

export function getRememberedAccounts(): RememberedAccount[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter(isAccount).sort((a, b) => b.lastUsedAt - a.lastUsedAt) : [];
  } catch {
    return [];
  }
}

function save(accounts: RememberedAccount[]): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(accounts.slice(0, MAX_ACCOUNTS)));
  } catch {
    // Storage blocked (private window): the picker simply won't remember anyone.
  }
}

export function rememberAccount(user: { email: string | null; name: string }): void {
  if (typeof window === 'undefined' || !user.email) return;
  const email = user.email.trim().toLowerCase();
  const others = getRememberedAccounts().filter((a) => a.email !== email);
  save([{ email, name: user.name || email, lastUsedAt: Date.now() }, ...others]);
}

export function forgetAccount(email: string): RememberedAccount[] {
  const remaining = getRememberedAccounts().filter((a) => a.email !== email.trim().toLowerCase());
  save(remaining);
  return remaining;
}

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0]!.charAt(0);
  const last = parts.length > 1 ? parts[parts.length - 1]!.charAt(0) : '';
  return (first + last).toUpperCase();
}
