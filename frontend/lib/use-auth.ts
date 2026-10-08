'use client';

import { useState, useEffect } from 'react';
import { getToken } from './auth';

export interface AuthUser {
  id: string;
  email?: string | undefined;
  role: string;
  orgId?: string | undefined;
  orgName?: string | undefined;
  name?: string | undefined;
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const b64 = parts[1]!.replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(b64)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Read and decode the auth user from the agap_token cookie (client-side only). */
export function getAuthUser(): AuthUser | null {
  const token = getToken();
  if (!token) return null;
  const p = decodeJwtPayload(token);
  if (!p) return null;
  if (p['exp'] && Date.now() / 1000 > (p['exp'] as number)) return null;
  return {
    id: String(p['sub'] ?? p['userId'] ?? ''),
    email: p['email'] as string | undefined,
    role: String(p['role'] ?? ''),
    orgId: p['orgId'] as string | undefined,
    orgName: p['orgName'] as string | undefined,
    name: (p['name'] ?? p['full_name']) as string | undefined,
  };
}

/** React hook — hydrates after mount so SSR stays clean. */
export function useAuthUser(): AuthUser | null {
  const [user, setUser] = useState<AuthUser | null>(null);
  useEffect(() => { setUser(getAuthUser()); }, []);
  return user;
}

export function hasRole(user: AuthUser | null, ...roles: string[]): boolean {
  return !!user && roles.includes(user.role);
}
