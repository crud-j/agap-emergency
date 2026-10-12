import { api } from '@/lib/api';
import { getToken } from '@/lib/auth';

// ─── Types (match `permissions` / `role_permissions` Prisma models) ───────────

export interface Permission {
  id: string;
  name: string;
  description: string | null;
  module_id: string | null;
  created_at: string;
}

export interface RolePermission {
  id: string;
  role: string;
  permission_id: string;
  created_at: string;
  permissions: Permission;
}

// ─── Fetchers (MOD-47) ─────────────────────────────────────────────────────────

/** Full catalog of permissions (SYSTEM_ADMINISTRATOR only). */
export function fetchPermissions(): Promise<Permission[]> {
  return api.get('/permissions', getToken());
}

/** Permissions currently granted to a role. */
export function fetchRolePermissions(role: string): Promise<RolePermission[]> {
  return api.get(`/permissions/roles/${role}`, getToken());
}

export function grantPermission(role: string, permissionId: string): Promise<RolePermission> {
  return api.post(`/permissions/roles/${role}`, { permissionId }, getToken());
}

export function revokePermission(role: string, permissionId: string): Promise<{ message: string }> {
  return api.delete(`/permissions/roles/${role}/${permissionId}`, getToken());
}
