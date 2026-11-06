'use client';

import { useSyncExternalStore } from 'react';
import { getSessionUser, subscribeSession } from './auth';

export interface AuthUser {
  id: string;
  email?: string | undefined;
  role: string;
  orgId?: string | undefined;
  orgName?: string | undefined;
  /** e.g. MDRRMO. Navigation only; the API checks access itself. */
  orgType?: string | undefined;
  name?: string | undefined;
  mustChangePassword: boolean;
}

/** The signed-in user from the in-memory session (null before sign-in / restore). */
export function getAuthUser(): AuthUser | null {
  const user = getSessionUser();
  if (!user) return null;
  return {
    id: user.id,
    email: user.email ?? undefined,
    role: user.role,
    orgId: user.orgId ?? undefined,
    orgName: user.orgName ?? undefined,
    orgType: user.orgType ?? undefined,
    name: user.name,
    mustChangePassword: user.mustChangePassword,
  };
}

// useSyncExternalStore needs a stable snapshot between changes.
let cachedSource: ReturnType<typeof getSessionUser> = null;
let cachedUser: AuthUser | null = null;
function getSnapshot(): AuthUser | null {
  const source = getSessionUser();
  if (source !== cachedSource) {
    cachedSource = source;
    cachedUser = getAuthUser();
  }
  return cachedUser;
}

/** React hook — re-renders on sign-in, refresh and sign-out. Null during SSR. */
export function useAuthUser(): AuthUser | null {
  return useSyncExternalStore(subscribeSession, getSnapshot, () => null);
}

export function hasRole(user: AuthUser | null, ...roles: string[]): boolean {
  return !!user && roles.includes(user.role);
}
