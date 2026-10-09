'use client';

import { useState, type JSX } from 'react';
import {
  Users, Shield, Activity, Search, ChevronLeft, ChevronRight,
  UserCheck, UserX, Trash2, Edit, Lock, CheckCircle2, XCircle,
  Database, Cpu, Clock, Settings,
} from 'lucide-react';
import {
  Button, Badge, DataTable,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
  Skeleton, EmptyState,
  type Column,
} from '@/components/ui';
import { useAuthUser, hasRole } from '@/lib/use-auth';
import { titleCase } from '@/lib/incident-format';
import {
  useAdminUsers,
  useSystemHealth,
  useSystemConfig,
  useChangeUserRole,
  useActivateUser,
  useDeactivateUser,
  useDeleteUser,
  useUpsertConfig,
} from '@/features/admin/hooks';
import type { AdminUser, AdminUserListParams } from '@/features/admin/api';
import { cn } from '@/lib/utils';

// ─── Constants ────────────────────────────────────────────────────────────────

const USER_ROLES = [
  'CITIZEN', 'BYSTANDER', 'DISPATCHER', 'SUPERVISOR', 'RESPONDER',
  'HOSPITAL_USER', 'ORG_ADMINISTRATOR', 'ANNOUNCEMENTS_PUBLISHER', 'SYSTEM_ADMINISTRATOR',
] as const;

const USER_STATUSES = ['ACTIVE', 'PENDING_VERIFICATION', 'SUSPENDED', 'DEACTIVATED'] as const;
const PER_PAGE = 20;
type AdminTab = 'users' | 'health' | 'config';

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

function UsersTab(): JSX.Element {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [filterRole, setFilterRole] = useState('ALL');
  const [filterStatus, setFilterStatus] = useState('ALL');
  const [roleTarget, setRoleTarget] = useState<AdminUser | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminUser | null>(null);

  const params: AdminUserListParams = {
    page,
    perPage: PER_PAGE,
    ...(search && { search }),
    ...(filterRole !== 'ALL' && { role: filterRole }),
    ...(filterStatus !== 'ALL' && { status: filterStatus }),
  };

  const { data, isLoading } = useAdminUsers(params);
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

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-1">
          <span className="text-xs text-agap-textSub">Page {page} of {totalPages}</span>
          <div className="flex gap-1.5">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className={cn(
                'inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors',
                page === 1
                  ? 'border-[rgba(168,181,193,0.20)] text-agap-textSub cursor-not-allowed bg-agap-surface'
                  : 'border-[rgba(168,181,193,0.20)] text-agap-textMid hover:bg-agap-surface bg-white',
              )}
            >
              <ChevronLeft size={13} /> Prev
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className={cn(
                'inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors',
                page === totalPages
                  ? 'border-[rgba(168,181,193,0.20)] text-agap-textSub cursor-not-allowed bg-agap-surface'
                  : 'border-[rgba(168,181,193,0.20)] text-agap-textMid hover:bg-agap-surface bg-white',
              )}
            >
              Next <ChevronRight size={13} />
            </button>
          </div>
        </div>
      )}

      <RoleChangeDialog target={roleTarget} onClose={() => setRoleTarget(null)} />
      <DeleteDialog target={deleteTarget} onClose={() => setDeleteTarget(null)} />
    </div>
  );
}

// ─── Health Tab ───────────────────────────────────────────────────────────────

function HealthTab(): JSX.Element {
  const { data, isLoading } = useSystemHealth();

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {[0,1,2,3].map(i => <Skeleton key={i} className="h-28 rounded-2xl" />)}
      </div>
    );
  }

  if (!data) {
    return <EmptyState title="Health unavailable" description="Could not reach the health endpoint." />;
  }

  interface HealthCard {
    label: string;
    value: string;
    icon: typeof Database;
    ok: boolean;
  }

  const cards: HealthCard[] = [
    {
      label: 'Database',
      value: data.database === 'ok' ? 'Healthy' : data.database === 'unknown' ? 'Unknown' : 'Error',
      icon: Database,
      ok: data.database === 'ok',
    },
    {
      label: 'Redis',
      value: data.redis === 'ok' ? 'Healthy' : data.redis === 'unknown' ? 'Unknown' : 'Error',
      icon: Cpu,
      ok: data.redis === 'ok',
    },
    {
      label: 'Timestamp',
      value: data.timestamp ? new Date(data.timestamp).toLocaleString('en-PH') : '—',
      icon: Clock,
      ok: true,
    },
  ];

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <div
              key={card.label}
              className={cn(
                'rounded-2xl border p-5 flex items-center gap-4',
                card.ok
                  ? 'bg-agap-greenSoft border-[rgba(13,96,83,0.16)]'
                  : 'bg-agap-dangerSoft border-[rgba(212,72,88,0.18)]',
              )}
            >
              <div className={cn(
                'flex h-10 w-10 items-center justify-center rounded-xl shrink-0',
                card.ok ? 'bg-agap-green/10' : 'bg-agap-danger/10',
              )}>
                <Icon size={20} className={card.ok ? 'text-agap-green' : 'text-agap-danger'} />
              </div>
              <div>
                <p className="text-xs font-semibold text-agap-textSub uppercase tracking-wide">{card.label}</p>
                <p className="text-base font-bold text-agap-textMain">{card.value}</p>
              </div>
              {card.ok
                ? <CheckCircle2 size={16} className="text-agap-green ml-auto shrink-0" />
                : <XCircle size={16} className="text-agap-danger ml-auto shrink-0" />
              }
            </div>
          );
        })}
      </div>

      <p className="text-xs text-agap-textSub">
        Health refreshes every 60 seconds automatically.
      </p>
    </div>
  );
}

// ─── Config Tab ───────────────────────────────────────────────────────────────

function ConfigTab(): JSX.Element {
  const { data, isLoading } = useSystemConfig();
  const [editKey, setEditKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [editError, setEditError] = useState<string | null>(null);
  const upsert = useUpsertConfig();

  async function handleSave() {
    if (!editKey) return;
    try {
      setEditError(null);
      let parsed: unknown = editValue;
      try { parsed = JSON.parse(editValue); } catch { /* keep as string */ }
      await upsert.mutateAsync({ key: editKey, value: parsed });
      setEditKey(null);
    } catch (e: unknown) {
      setEditError(e instanceof Error ? e.message : 'Save failed.');
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[0,1,2].map(i => <Skeleton key={i} className="h-12 rounded-xl" />)}
      </div>
    );
  }

  if (!data?.length) {
    return <EmptyState icon={Settings} title="No configuration entries" description="System configuration entries will appear here." />;
  }

  return (
    <div className="rounded-2xl bg-white border border-[rgba(168,181,193,0.20)] shadow-card overflow-hidden">
      {data.map((entry, i) => (
        <div
          key={entry.id}
          className={cn(
            'flex items-center gap-4 px-4 py-3',
            i < data.length - 1 && 'border-b border-[rgba(168,181,193,0.12)]',
          )}
        >
          <code className="text-xs font-mono text-agap-green flex-1">{entry.config_key}</code>
          <span className="text-sm text-agap-textMain flex-1 truncate">
            {JSON.stringify(entry.config_value)}
          </span>
          <span className="text-xs text-agap-textSub shrink-0">
            Updated {fmtDate(entry.updated_at)}
          </span>
          <button
            onClick={() => {
              setEditKey(entry.config_key);
              setEditValue(JSON.stringify(entry.config_value));
              setEditError(null);
            }}
            className="p-1.5 rounded-lg hover:bg-agap-surface text-agap-textSub hover:text-agap-textMain transition-colors shrink-0"
          >
            <Edit size={13} />
          </button>
        </div>
      ))}

      <Dialog open={!!editKey} onOpenChange={(open) => { if (!open) setEditKey(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings size={16} className="text-agap-green" />
              Edit Config
            </DialogTitle>
            {editKey && <DialogDescription><code className="text-agap-green">{editKey}</code></DialogDescription>}
          </DialogHeader>
          <div>
            <label className="block text-xs font-semibold text-agap-textSub uppercase tracking-wide mb-1.5">
              Value (JSON or string)
            </label>
            <input
              type="text"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              className="w-full rounded-xl border border-[rgba(168,181,193,0.20)] bg-white px-3 py-2 text-sm font-mono text-agap-textMain focus:outline-none focus:ring-2 focus:ring-agap-green"
            />
            {editError && <p className="mt-1.5 text-xs text-agap-danger">{editError}</p>}
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setEditKey(null)}>Cancel</Button>
            <Button variant="primary" loading={upsert.isPending} onClick={handleSave}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AdministrationPage(): JSX.Element {
  const user = useAuthUser();
  const authorized = hasRole(user, 'SYSTEM_ADMINISTRATOR');
  const [tab, setTab] = useState<AdminTab>('users');

  const tabs: { key: AdminTab; label: string; icon: typeof Users }[] = [
    { key: 'users', label: 'Users', icon: Users },
    { key: 'health', label: 'System Health', icon: Activity },
    { key: 'config', label: 'Configuration', icon: Settings },
  ];

  if (!authorized && user !== null) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-agap-dangerSoft">
          <Lock size={28} className="text-agap-danger" />
        </div>
        <div className="text-center">
          <h2 className="text-lg font-bold text-agap-textMain">Access Restricted</h2>
          <p className="text-sm text-agap-textSub mt-1">System Administration requires the System Administrator role.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-agap-textMain tracking-tight flex items-center gap-2">
            <Shield size={22} className="text-agap-green" />
            System Administration
          </h1>
          <p className="text-sm text-agap-textSub mt-0.5">
            MOD-49 · User accounts, system health, configuration
          </p>
        </div>
        <Badge variant="red" className="mt-1">
          <Lock size={11} /> Sys-Admin Only
        </Badge>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 rounded-xl bg-agap-surface p-1 w-fit">
        {tabs.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={cn(
              'inline-flex items-center gap-1.5 px-4 py-1.5 text-sm font-semibold rounded-lg transition-all',
              tab === key
                ? 'bg-white text-agap-green shadow-tile'
                : 'text-agap-textSub hover:text-agap-textMain',
            )}
          >
            <Icon size={14} />
            {label}
          </button>
        ))}
      </div>

      {/* Content */}
      {tab === 'users' && <UsersTab />}
      {tab === 'health' && <HealthTab />}
      {tab === 'config' && <ConfigTab />}
    </div>
  );
}
