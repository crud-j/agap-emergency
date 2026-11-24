'use client';

import { useState, type JSX, type ReactNode } from 'react';
import {
  Search,
  UserCheck, UserX, Trash2, Edit, XCircle,
  Settings, KeyRound, Plus, Info, CheckCircle2,
} from 'lucide-react';
import {
  Button, Badge, DataTable,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
  Skeleton, EmptyState, Pagination,
  type Column,
} from '@/components/ui';
import { titleCase } from '@/lib/incident-format';
import {
  useAdminUsers,
  useSystemConfig,
  useChangeUserRole,
  useActivateUser,
  useDeactivateUser,
  useDeleteUser,
  useUpsertConfig,
} from '@/features/admin/hooks';
import type { AdminUser, AdminUserListParams, SystemConfigEntry } from '@/features/admin/api';
import {
  usePermissions,
  useRolePermissions,
  useGrantPermission,
  useRevokePermission,
} from '@/features/admin/permissions-hooks';
import { cn } from '@/lib/utils';

// ─── Constants ────────────────────────────────────────────────────────────────

const USER_ROLES = [
  'CITIZEN', 'BYSTANDER', 'DISPATCHER', 'SUPERVISOR', 'RESPONDER',
  'HOSPITAL_USER', 'ORG_ADMINISTRATOR', 'ANNOUNCEMENTS_PUBLISHER', 'SYSTEM_ADMINISTRATOR',
] as const;

const USER_STATUSES = ['ACTIVE', 'PENDING_VERIFICATION', 'SUSPENDED', 'DEACTIVATED'] as const;
const PER_PAGE = 20;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function roleVariant(role: string): 'green' | 'red' | 'amber' | 'blue' | 'muted' {
  switch (role) {
    case 'SYSTEM_ADMINISTRATOR': return 'red';
    case 'SUPERVISOR':            return 'amber';
    case 'DISPATCHER':            return 'blue';
    case 'RESPONDER':             return 'green';
    default:                      return 'muted';
  }
}

function statusVariant(status: string): 'green' | 'muted' | 'amber' | 'red' {
  switch (status) {
    case 'ACTIVE':               return 'green';
    case 'PENDING_VERIFICATION': return 'amber';
    case 'SUSPENDED':            return 'amber';
    case 'DEACTIVATED':          return 'red';
    default:                     return 'muted';
  }
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ─── Role change dialog ───────────────────────────────────────────────────────

function RoleChangeDialog({
  target,
  onClose,
}: {
  target: AdminUser | null;
  onClose: () => void;
}): JSX.Element {
  const [newRole, setNewRole] = useState('');
  const [error, setError] = useState<string | null>(null);
  const change = useChangeUserRole();

  function handleOpen(open: boolean) {
    if (open && target) { setNewRole(target.role); setError(null); }
    if (!open) onClose();
  }

  async function handleConfirm() {
    if (!newRole || !target) return;
    if (newRole === target.role) { onClose(); return; }
    try {
      setError(null);
      await change.mutateAsync({ id: target.id, role: newRole });
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to change role.');
    }
  }

  return (
    <Dialog open={!!target} onOpenChange={handleOpen}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Edit size={16} className="text-agap-green" />
            Change Role
          </DialogTitle>
          {target && (
            <DialogDescription>
              {target.full_name ?? target.email}
            </DialogDescription>
          )}
        </DialogHeader>

        <div>
          <label className="block text-xs font-semibold text-agap-textSub uppercase tracking-wide mb-1.5">
            New Role
          </label>
          <Select value={newRole} onValueChange={setNewRole}>
            <SelectTrigger>
              <SelectValue placeholder="Select role" />
            </SelectTrigger>
            <SelectContent>
              {USER_ROLES.map((r) => (
                <SelectItem key={r} value={r}>{titleCase(r)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {error && <p className="mt-2 text-xs text-agap-danger">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            loading={change.isPending}
            onClick={handleConfirm}
            disabled={!newRole || newRole === target?.role}
          >
            Apply
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Delete confirm dialog ────────────────────────────────────────────────────

function DeleteDialog({
  target,
  onClose,
}: {
  target: AdminUser | null;
  onClose: () => void;
}): JSX.Element {
  const del = useDeleteUser();
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    if (!target) return;
    try {
      setError(null);
      await del.mutateAsync(target.id);
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Delete failed.');
    }
  }

  return (
    <Dialog open={!!target} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Trash2 size={16} className="text-agap-danger" />
            Delete User
          </DialogTitle>
          {target && (
            <DialogDescription>
              Permanently delete <strong>{target.full_name ?? target.email}</strong>? This cannot be undone.
            </DialogDescription>
          )}
        </DialogHeader>
        {error && <p className="text-xs text-agap-danger">{error}</p>}
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="danger" loading={del.isPending} onClick={handleConfirm}>
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Users Tab ────────────────────────────────────────────────────────────────

export function UsersTab({ initialSearch = '' }: { initialSearch?: string } = {}): JSX.Element {
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(PER_PAGE);
  const [search, setSearch] = useState(initialSearch);
  const [filterRole, setFilterRole] = useState('ALL');
  const [filterStatus, setFilterStatus] = useState('ALL');
  const [roleTarget, setRoleTarget] = useState<AdminUser | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminUser | null>(null);

  const params: AdminUserListParams = {
    page,
    perPage,
    ...(search && { search }),
    ...(filterRole !== 'ALL' && { role: filterRole }),
    ...(filterStatus !== 'ALL' && { status: filterStatus }),
  };

  const { data, isLoading, isFetching } = useAdminUsers(params);
  const activate = useActivateUser();
  const deactivate = useDeactivateUser();

  const rows: AdminUser[] = data?.data ?? [];
  const totalPages = data?.meta.totalPages ?? 1;

  const columns: Column<AdminUser>[] = [
    {
      key: 'name',
      header: 'Name / Email',
      accessor: (row) => (
        <div>
          <p className="font-semibold text-agap-textMain">{row.full_name ?? '—'}</p>
          <p className="text-xs text-agap-textSub">{row.email}</p>
        </div>
      ),
    },
    {
      key: 'role',
      header: 'Role',
      sortable: true,
      accessor: (row) => (
        <Badge variant={roleVariant(row.role)}>{titleCase(row.role)}</Badge>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      accessor: (row) => (
        <Badge variant={statusVariant(row.status)}>{titleCase(row.status)}</Badge>
      ),
    },
    {
      key: 'phone',
      header: 'Phone',
      accessor: (row) => (
        <span className="text-sm text-agap-textMid">{row.phone_number ?? '—'}</span>
      ),
    },
    {
      key: 'created',
      header: 'Joined',
      accessor: (row) => (
        <span className="text-xs text-agap-textSub">{fmtDate(row.created_at)}</span>
      ),
    },
    {
      key: 'last_login',
      header: 'Last Login',
      accessor: (row) => (
        <span className="text-xs text-agap-textSub">{fmtDate(row.last_login_at)}</span>
      ),
    },
    {
      key: 'actions',
      header: '',
      cellClassName: 'text-right',
      headerClassName: 'text-right',
      accessor: (row) => (
        <div className="flex items-center gap-1 justify-end">
          <button
            onClick={(e) => { e.stopPropagation(); setRoleTarget(row); }}
            title="Change role"
            className="p-1.5 rounded-lg hover:bg-agap-surface text-agap-textSub hover:text-agap-textMain transition-colors"
          >
            <Edit size={14} />
          </button>
          {row.status !== 'ACTIVE' ? (
            <button
              onClick={(e) => { e.stopPropagation(); activate.mutate(row.id); }}
              disabled={activate.isPending}
              title="Activate"
              className="p-1.5 rounded-lg hover:bg-agap-greenSoft text-agap-textSub hover:text-agap-green transition-colors"
            >
              <UserCheck size={14} />
            </button>
          ) : (
            <button
              onClick={(e) => { e.stopPropagation(); deactivate.mutate(row.id); }}
              disabled={deactivate.isPending}
              title="Deactivate"
              className="p-1.5 rounded-lg hover:bg-agap-dangerSoft text-agap-textSub hover:text-agap-danger transition-colors"
            >
              <UserX size={14} />
            </button>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); setDeleteTarget(row); }}
            title="Delete"
            className="p-1.5 rounded-lg hover:bg-agap-dangerSoft text-agap-textSub hover:text-agap-danger transition-colors"
          >
            <Trash2 size={14} />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-agap-textSub pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search name, email, phone…"
            className="w-full h-9 pl-8 pr-3 rounded-xl border border-[rgba(168,181,193,0.20)] bg-white text-sm text-agap-textMain placeholder:text-agap-textSub focus:outline-none focus:ring-2 focus:ring-agap-green"
          />
        </div>
        <div className="w-44">
          <Select value={filterRole} onValueChange={(v) => { setFilterRole(v); setPage(1); }}>
            <SelectTrigger className="h-9 text-sm">
              <SelectValue placeholder="Any role" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Any role</SelectItem>
              {USER_ROLES.map((r) => <SelectItem key={r} value={r}>{titleCase(r)}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="w-40">
          <Select value={filterStatus} onValueChange={(v) => { setFilterStatus(v); setPage(1); }}>
            <SelectTrigger className="h-9 text-sm">
              <SelectValue placeholder="Any status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Any status</SelectItem>
              {USER_STATUSES.map((s) => <SelectItem key={s} value={s}>{titleCase(s)}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        {data && (
          <p className="text-xs text-agap-textSub ml-auto">
            {data.meta.total} user{data.meta.total !== 1 ? 's' : ''}
          </p>
        )}
      </div>

      <DataTable
        columns={columns}
        data={rows}
        getRowKey={(r) => r.id}
        loading={isLoading}
        emptyTitle="No users found"
        emptyDescription="Try adjusting the filters."
      />

      {data && (
        <Pagination
          page={data.meta.page}
          totalPages={totalPages}
          total={data.meta.total}
          perPage={perPage}
          onPageChange={setPage}
          onPerPageChange={(n) => { setPerPage(n); setPage(1); }}
          noun="users"
          fetching={isFetching && !isLoading}
        />
      )}

      <RoleChangeDialog target={roleTarget} onClose={() => setRoleTarget(null)} />
      <DeleteDialog target={deleteTarget} onClose={() => setDeleteTarget(null)} />
    </div>
  );
}

// ─── Config Tab ───────────────────────────────────────────────────────────────

function fmtConfigValue(entry: SystemConfigEntry): string {
  const v = entry.config_value;
  if (typeof v === 'boolean') return v ? 'On' : 'Off';
  if ((typeof v === 'number' || typeof v === 'string') && entry.unit) return `${v} ${entry.unit}`;
  if (typeof v === 'string') return v;
  return JSON.stringify(v);
}

/** The edit text for a value: plain for scalars, JSON for anything else. */
function editText(entry: SystemConfigEntry): string {
  const v = entry.config_value;
  return typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean' ? String(v) : JSON.stringify(v, null, 2);
}

/** Parse the edit text by the key's type. Returns the value or a message. */
function parseConfigInput(entry: SystemConfigEntry, text: string): { value: unknown } | { error: string } {
  const label = entry.label ?? entry.config_key;
  switch (entry.value_type) {
    case 'boolean':
      return { value: text === 'true' };
    case 'number': {
      const n = Number(text);
      if (text.trim() === '' || !Number.isFinite(n)) return { error: `${label} must be a number.` };
      if (entry.min !== null && n < entry.min) return { error: `Must be at least ${entry.min}${entry.unit ? ` ${entry.unit}` : ''}.` };
      if (entry.max !== null && n > entry.max) return { error: `Must be at most ${entry.max}${entry.unit ? ` ${entry.unit}` : ''}.` };
      return { value: n };
    }
    case 'string':
      return text.trim() ? { value: text.trim() } : { error: `${label} cannot be empty.` };
    default:
      try {
        return { value: JSON.parse(text) };
      } catch {
        // Unknown keys accept plain text as a string, like before.
        return text.trim() ? { value: text } : { error: 'Enter a value.' };
      }
  }
}

function ConfigEditDialog({ entry, onClose }: { entry: SystemConfigEntry | null; onClose: () => void }): JSX.Element {
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const upsert = useUpsertConfig();
  const [openedFor, setOpenedFor] = useState<string | null>(null);

  // Reset the form each time a different entry opens.
  if (entry && openedFor !== entry.id) {
    setOpenedFor(entry.id);
    setText(editText(entry));
    setError(null);
  }

  async function handleSave() {
    if (!entry) return;
    const parsed = parseConfigInput(entry, text);
    if ('error' in parsed) { setError(parsed.error); return; }
    try {
      setError(null);
      await upsert.mutateAsync({ key: entry.config_key, value: parsed.value });
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Save failed.');
    }
  }

  const fieldClass = 'w-full rounded-xl border border-agap-fieldBorder bg-white px-3 py-2 text-sm text-agap-textMain focus:outline-none focus:ring-2 focus:ring-agap-green';

  return (
    <Dialog open={!!entry} onOpenChange={(open) => { if (!open) { setOpenedFor(null); onClose(); } }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings size={16} className="text-agap-green" />
            {entry?.label ?? 'Edit setting'}
          </DialogTitle>
          {entry && <DialogDescription><code className="text-agap-green">{entry.config_key}</code></DialogDescription>}
        </DialogHeader>

        {entry && (
          <div className="space-y-3">
            {entry.description && <p className="text-sm text-agap-textMid">{entry.description}</p>}
            {entry.read_by ? (
              <p className="flex items-start gap-2 rounded-xl bg-agap-greenSoft px-3 py-2 text-xs text-agap-green">
                <CheckCircle2 size={14} className="mt-0.5 shrink-0" /> {entry.read_by}. Takes effect on the next check.
              </p>
            ) : (
              <p className="flex items-start gap-2 rounded-xl bg-agap-amberSoft px-3 py-2 text-xs text-agap-amberText">
                <Info size={14} className="mt-0.5 shrink-0" /> No code reads this key yet: saving it changes nothing in the system.
              </p>
            )}

            <div>
              <label htmlFor="config-value" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-agap-textSub">
                Value{entry.unit ? ` (${entry.unit})` : ''}
                {entry.value_type === 'number' && entry.min !== null && entry.max !== null && (
                  <span className="ml-1 font-normal normal-case tracking-normal">· {entry.min}–{entry.max}</span>
                )}
              </label>
              {entry.value_type === 'boolean' ? (
                <select id="config-value" value={text} onChange={(e) => setText(e.target.value)} className={fieldClass}>
                  <option value="true">On</option>
                  <option value="false">Off</option>
                </select>
              ) : entry.value_type === 'number' ? (
                <input
                  id="config-value" type="number" inputMode="decimal" value={text}
                  min={entry.min ?? undefined} max={entry.max ?? undefined}
                  onChange={(e) => setText(e.target.value)} className={cn(fieldClass, 'tabular-nums')}
                />
              ) : entry.value_type === 'string' ? (
                <input id="config-value" type="text" value={text} onChange={(e) => setText(e.target.value)} className={fieldClass} />
              ) : (
                <textarea id="config-value" rows={4} value={text} onChange={(e) => setText(e.target.value)} className={cn(fieldClass, 'font-mono text-xs')} />
              )}
              {error && <p role="alert" className="mt-1.5 text-xs text-agap-danger">{error}</p>}
            </div>
            <p className="text-[11px] text-agap-textSub">Saving asks for your password again if you signed in a while ago, and is recorded in the audit log.</p>
          </div>
        )}

        <DialogFooter>
          <Button variant="secondary" onClick={() => { setOpenedFor(null); onClose(); }}>Cancel</Button>
          <Button variant="primary" loading={upsert.isPending} onClick={handleSave}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ConfigTab(): JSX.Element {
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(20);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<SystemConfigEntry | null>(null);
  const { data, isLoading, isError, isFetching } = useSystemConfig({ page, perPage, ...(search.trim() && { search: search.trim() }) });

  const rows = data?.data ?? [];
  const columns: Column<SystemConfigEntry>[] = [
    {
      key: 'setting',
      header: 'Setting',
      accessor: (row) => (
        <div className="min-w-0 max-w-md">
          <p className="font-semibold text-agap-textMain">{row.label ?? row.config_key}</p>
          {row.label && <code className="text-[11px] text-agap-textSub">{row.config_key}</code>}
          {row.description && <p className="mt-0.5 text-xs text-agap-textSub">{row.description}</p>}
        </div>
      ),
    },
    {
      key: 'value',
      header: 'Value',
      accessor: (row) => <span className="font-mono text-sm font-semibold text-agap-textMain">{fmtConfigValue(row)}</span>,
    },
    {
      key: 'use',
      header: 'Used by',
      accessor: (row) =>
        row.read_by ? (
          <span title={row.read_by}><Badge variant="green"><CheckCircle2 size={12} /> In use</Badge></span>
        ) : (
          <span title="Stored, but no code reads this key yet"><Badge variant="muted">Stored only</Badge></span>
        ),
    },
    {
      key: 'updated',
      header: 'Updated',
      accessor: (row) => (
        <div className="text-xs text-agap-textSub">
          <p>{fmtDate(row.updated_at)}</p>
          {row.updated_by_name && <p className="truncate">by {row.updated_by_name}</p>}
        </div>
      ),
    },
    {
      key: 'actions',
      header: '',
      cellClassName: 'text-right',
      accessor: (row) => (
        <button
          type="button"
          onClick={() => setEditing(row)}
          aria-label={`Edit ${row.label ?? row.config_key}`}
          className="rounded-lg p-1.5 text-agap-textSub transition-colors hover:bg-agap-surface hover:text-agap-textMain"
        >
          <Edit size={14} />
        </button>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[220px] max-w-sm flex-1">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-agap-textSub" />
          <input
            type="search"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search key or description…"
            aria-label="Search settings"
            className="h-9 w-full rounded-xl border border-agap-track bg-white pl-8 pr-3 text-sm text-agap-textMain placeholder:text-agap-textSub focus:outline-none focus:ring-2 focus:ring-agap-green"
          />
        </div>
        <p className="ml-auto flex items-center gap-1.5 text-xs text-agap-textSub">
          <Info size={13} /> Device push tokens and job bookkeeping are stored in the same table and are never shown here.
        </p>
      </div>

      {isError ? (
        <p role="alert" className="rounded-xl bg-agap-dangerSoft px-4 py-3 text-sm text-agap-danger">Couldn&apos;t load the configuration.</p>
      ) : isLoading ? (
        <div className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-14 rounded-xl" />)}</div>
      ) : rows.length === 0 && !search ? (
        <EmptyState icon={Settings} title="No configuration entries" description="Settings saved by the system appear here." />
      ) : (
        <DataTable
          columns={columns}
          data={rows}
          getRowKey={(r) => r.id}
          emptyTitle="No settings match"
          emptyDescription="Try another word."
        />
      )}

      {data && (
        <Pagination
          page={data.meta.page}
          totalPages={data.meta.totalPages}
          total={data.meta.total}
          perPage={data.meta.perPage}
          onPageChange={setPage}
          onPerPageChange={(n) => { setPerPage(n); setPage(1); }}
          noun="settings"
          fetching={isFetching && !isLoading}
        />
      )}

      <ConfigEditDialog entry={editing} onClose={() => setEditing(null)} />
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

// ─── Roles & Permissions Tab (MOD-47) ──────────────────────────────────────────

export function PermissionsTab(): JSX.Element {
  const [role, setRole] = useState<string>('DISPATCHER');

  const { data: allPermissions, isLoading: permsLoading } = usePermissions();
  const { data: rolePerms, isLoading: roleLoading } = useRolePermissions(role);
  const grant = useGrantPermission();
  const revoke = useRevokePermission();

  // Set of permission IDs currently granted to the selected role.
  const grantedIds = new Set((rolePerms ?? []).map((rp) => rp.permission_id));

  // Group the catalog by module for a scannable matrix.
  const grouped = (() => {
    const map = new Map<string, typeof allPermissions>();
    for (const p of allPermissions ?? []) {
      const key = p.module_id ?? 'GENERAL';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(p);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  })();

  function toggle(permissionId: string, granted: boolean) {
    if (granted) revoke.mutate({ role, permissionId });
    else grant.mutate({ role, permissionId });
  }

  const busyId =
    (grant.isPending && grant.variables?.permissionId) ||
    (revoke.isPending && revoke.variables?.permissionId) ||
    null;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-agap-textMain flex items-center gap-2">
            <KeyRound size={18} className="text-agap-green" /> Role Permissions
          </h2>
          <p className="text-sm text-agap-textSub mt-0.5">
            Grant or revoke capabilities for a role in the reference list.
          </p>
        </div>
        <div className="w-56">
          <Select value={role} onValueChange={setRole}>
            <SelectTrigger className="w-full"><SelectValue placeholder="Select role" /></SelectTrigger>
            <SelectContent>
              {USER_ROLES.map((r) => (
                <SelectItem key={r} value={r}>{titleCase(r)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex items-start gap-2.5 rounded-xl border border-[rgba(37,99,235,0.18)] bg-agap-infoSoft px-4 py-3 text-sm text-agap-info">
        <Info size={16} className="mt-0.5 shrink-0" />
        <p>
          <span className="font-semibold">Reference list.</span> Access is enforced by each endpoint&apos;s role rules,
          not by this table.
        </p>
      </div>

      {(grant.isError || revoke.isError) && (
        <p className="rounded-xl bg-agap-dangerSoft px-4 py-2 text-sm text-agap-danger">
          {((grant.error ?? revoke.error) as Error)?.message ?? 'Could not update permission.'}
        </p>
      )}

      {permsLoading || roleLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-28 rounded-2xl" />
          <Skeleton className="h-28 rounded-2xl" />
        </div>
      ) : grouped.length === 0 ? (
        <EmptyState icon={KeyRound} title="No permissions defined" description="The permission catalog is empty." />
      ) : (
        <div className="space-y-4">
          {grouped.map(([moduleId, perms]) => (
            <div key={moduleId} className="rounded-2xl border border-[rgba(168,181,193,0.20)] bg-white shadow-card overflow-hidden">
              <div className="bg-agap-surface px-4 py-2.5 border-b border-[rgba(168,181,193,0.20)]">
                <span className="text-xs font-bold uppercase tracking-wide text-agap-textSub">{moduleId}</span>
              </div>
              <ul className="divide-y divide-[rgba(168,181,193,0.14)]">
                {(perms ?? []).map((p) => {
                  const granted = grantedIds.has(p.id);
                  const busy = busyId === p.id;
                  return (
                    <li key={p.id} className="flex items-center justify-between gap-4 px-4 py-3">
                      <div className="min-w-0">
                        <p className="font-medium text-agap-textMain font-mono text-sm truncate">{p.name}</p>
                        {p.description && <p className="text-xs text-agap-textSub truncate">{p.description}</p>}
                      </div>
                      <Button
                        variant={granted ? 'secondary' : 'primary'}
                        size="sm"
                        loading={busy}
                        onClick={() => toggle(p.id, granted)}
                      >
                        {granted ? (
                          <><XCircle size={13} className="mr-1" /> Revoke</>
                        ) : (
                          <><Plus size={13} className="mr-1" /> Grant</>
                        )}
                      </Button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}


// ─── Page frame ───────────────────────────────────────────────────────────────

/** Header shared by the /administration/<section> pages (MOD-49). */
export function AdminPage({
  title, description, children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}): JSX.Element {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-agap-textMain tracking-tight">{title}</h1>
        <p className="text-sm text-agap-textSub mt-0.5">{description}</p>
      </div>
      {children}
    </div>
  );
}
