'use client';

import { useState, type JSX } from 'react';
import Link from 'next/link';
import { Filter, X } from 'lucide-react';
import {
  Badge, DataTable,
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
  Pagination,
  type BadgeVariant, type Column,
} from '@/components/ui';
import { useAuditLog } from '@/features/audit/hooks';
import type { AuditLogEntry, AuditLogParams } from '@/features/audit/api';
import { titleCase } from '@/lib/incident-format';

/** Security actions in `audit_action`: account security, then guest reports (Rule 14 abuse watch). */
const SECURITY_ACTIONS = [
  'LOGIN_FAILED',
  'ACCOUNT_LOCKED',
  'ACCOUNT_UNLOCKED',
  'PASSWORD_CHANGE',
  'MFA_CHANGE',
  'SESSION_REVOKED',
  'PERMISSION_DENIED',
  'GUEST_REPORT',
  'GUEST_REPORT_REPEAT',
  'GUEST_REPORT_BLOCKED',
] as const;

const GUEST_ACTIONS = new Set<string>(['GUEST_REPORT', 'GUEST_REPORT_REPEAT', 'GUEST_REPORT_BLOCKED']);

const ACTION_LABELS: Record<string, string> = {
  GUEST_REPORT: 'Guest report',
  GUEST_REPORT_REPEAT: 'Guest report (repeat)',
  GUEST_REPORT_BLOCKED: 'Guest report blocked',
};

function actionLabel(action: string): string {
  return ACTION_LABELS[action] ?? titleCase(action);
}

const ACTION_VARIANT: Record<string, BadgeVariant> = {
  LOGIN_FAILED: 'amber',
  ACCOUNT_LOCKED: 'red',
  PERMISSION_DENIED: 'red',
  ACCOUNT_UNLOCKED: 'green',
  PASSWORD_CHANGE: 'blue',
  MFA_CHANGE: 'blue',
  SESSION_REVOKED: 'muted',
  GUEST_REPORT: 'muted',
  GUEST_REPORT_REPEAT: 'amber',
  GUEST_REPORT_BLOCKED: 'red',
};

/** Reason codes written by auth.service, mfa.service, administration.service and the guest limit. */
const DETAIL_LABELS: Record<string, string> = {
  LIMIT_DEVICE: 'Too many from one phone',
  LIMIT_IP: 'Too many from one network',
  LIMIT_SPOT: 'Same place, same network',
  LIMIT_PHONE: 'Too many SMS from one number',
  LIMIT_OPEN: 'Earlier report still open',
  LIMIT_WAIT: 'Wait after a false alert',
  ACCOUNT_LOCKED: 'Sign-in while locked',
  MFA_FAILED: 'Wrong verification code',
  SELF_SERVICE_RESET: 'Reset by the user',
  SELF_SERVICE_CHANGE: 'Changed by the user',
  ADMIN_TEMPORARY_PASSWORD: 'Temporary password by an admin',
  ADMIN_MFA_RESET: 'MFA reset by an admin',
  SELF_SERVICE: 'Signed out a session',
  ACCOUNT_DEACTIVATED: 'Account deactivated',
};

const PER_PAGE = 25;

const INPUT_CLASS =
  'w-full h-9 rounded-xl border border-[rgba(168,181,193,0.20)] bg-white px-3 text-sm text-agap-textMain focus:outline-none focus:ring-2 focus:ring-agap-green';

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'medium' });
}

function label(code: unknown): string | null {
  if (typeof code !== 'string' || !code) return null;
  return DETAIL_LABELS[code] ?? titleCase(code);
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/**
 * Guest report details: which phone (a short code, not the device id), how many reports
 * this network sent in 10 minutes, and for a refusal, which limit.
 */
export function guestDetailOf(v: Record<string, unknown>): string {
  const place = num(v['samePlaceReports10m']);
  const network = num(v['networkReports10m']);
  const limit = num(v['limit']);
  const minutes = num(v['windowMinutes']);
  const retryAfter = num(v['retryAfterSeconds']);
  const parts = [
    label(v['reason']),
    typeof v['openReport'] === 'string' ? v['openReport'] : null,
    v['reason'] === 'LIMIT_WAIT' && retryAfter !== null ? `${Math.max(1, Math.ceil(retryAfter / 60))} min left` : null,
    limit !== null && minutes !== null ? `limit ${limit} per ${minutes === 1440 ? 'day' : `${minutes} min`}` : null,
    typeof v['device'] === 'string' ? `Phone ${v['device']}` : null,
    place !== null && place > 1 ? `${place} from this network at this place in 10 min` : null,
    network !== null && network > 1 ? `${network} from this network in 10 min` : null,
  ].filter((p): p is string => Boolean(p));
  return parts.join(' · ') || '—';
}

/** Short, non-sensitive summary of `new_values` (reason, method, lock duration). */
function detailOf(entry: AuditLogEntry): string {
  const v = entry.new_values ?? {};
  if (GUEST_ACTIONS.has(entry.action)) return guestDetailOf(v);
  const parts = [
    label(v['reason']),
    label(v['method'] ?? v['change']),
    typeof v['durationMinutes'] === 'number' ? `Locked ${v['durationMinutes']} min` : null,
    typeof v['sessionsRevoked'] === 'number' && v['sessionsRevoked'] > 0
      ? `${v['sessionsRevoked']} session${v['sessionsRevoked'] === 1 ? '' : 's'} ended`
      : null,
  ].filter((p): p is string => Boolean(p));
  // Admin actions carry a free-text reason; show it whole only in the Audit Log.
  return [...new Set(parts)].join(' · ') || '—';
}

interface AccountFilter {
  id: string;
  name: string;
}

/**
 * Security Events (MOD-46/49): failed sign-ins, lockouts, password and MFA changes,
 * revoked sessions, denied permissions, and guest reports (with IP), read from GET /audit.
 */
export function SecurityEvents(): JSX.Element {
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(PER_PAGE);
  const [action, setAction] = useState('ALL');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [account, setAccount] = useState<AccountFilter | null>(null);
  const [ip, setIp] = useState<string | null>(null);

  const params: AuditLogParams = {
    page,
    perPage,
    action: action === 'ALL' ? SECURITY_ACTIONS.join(',') : action,
    ...(from && { from: new Date(from).toISOString() }),
    ...(to && { to: new Date(to + 'T23:59:59').toISOString() }),
    ...(account && { entityId: account.id }),
    ...(ip && { ip }),
  };

  const { data, isLoading, isError, isFetching } = useAuditLog(params);
  const rows = data?.data ?? [];
  const total = data?.meta.total ?? 0;
  const totalPages = Math.max(1, data?.meta.totalPages ?? 1);
  const hasFilters = action !== 'ALL' || from !== '' || to !== '' || account !== null || ip !== null;

  function resetFilters() {
    setAction('ALL');
    setFrom('');
    setTo('');
    setAccount(null);
    setIp(null);
    setPage(1);
  }

  const columns: Column<AuditLogEntry>[] = [
    {
      key: 'occurred_at',
      header: 'Time',
      accessor: (row) => <span className="whitespace-nowrap text-xs text-agap-textMid">{fmtDateTime(row.occurred_at)}</span>,
    },
    {
      key: 'action',
      header: 'Event',
      accessor: (row) => <Badge variant={ACTION_VARIANT[row.action] ?? 'default'}>{actionLabel(row.action)}</Badge>,
    },
    {
      key: 'account',
      header: 'Account',
      accessor: (row) => {
        if (GUEST_ACTIONS.has(row.action)) {
          const ref = row.new_values?.['publicReference'];
          return (
            <div className="min-w-0">
              <p className="text-xs font-semibold text-agap-textMain">Guest (no account)</p>
              {typeof ref === 'string' && <p className="text-[11px] text-agap-textSub">{ref}</p>}
            </div>
          );
        }
        const u = row.entity_user;
        if (!u) {
          return (
            <span className="text-xs text-agap-textSub">
              {row.action === 'LOGIN_FAILED' ? 'Unknown account' : '—'}
            </span>
          );
        }
        const name = u.full_name ?? 'Unnamed account';
        return (
          <div className="flex items-center gap-1.5">
            <div className="min-w-0">
              <Link
                href={`/administration/users?search=${encodeURIComponent(u.full_name ?? '')}`}
                className="block truncate font-semibold text-agap-textMain hover:text-agap-green hover:underline"
              >
                {name}
              </Link>
              <p className="text-[11px] text-agap-textSub">{titleCase(u.role)}</p>
            </div>
            {account?.id !== u.id && (
              <button
                type="button"
                onClick={() => { setAccount({ id: u.id, name }); setPage(1); }}
                title={`Show only ${name}`}
                aria-label={`Show only events for ${name}`}
                className="shrink-0 rounded-lg p-1 text-agap-textSub transition-colors hover:bg-agap-surface hover:text-agap-textMain"
              >
                <Filter size={12} />
              </button>
            )}
          </div>
        );
      },
    },
    {
      key: 'actor',
      header: 'Done by',
      accessor: (row) => {
        if (!row.actor_id) return <span className="text-xs text-agap-textSub">—</span>;
        if (row.actor_id === row.entity_id) return <span className="text-xs text-agap-textMid">The user</span>;
        return <span className="text-xs text-agap-textMid">{row.users?.full_name ?? titleCase(row.actor_role ?? 'Staff')}</span>;
      },
    },
    {
      key: 'detail',
      header: 'Detail',
      accessor: (row) => <span className="text-xs text-agap-textMid">{detailOf(row)}</span>,
    },
    {
      key: 'ip',
      header: 'IP address',
      accessor: (row) => {
        if (!row.ip_address) return <code className="text-[11px] text-agap-textSub">—</code>;
        const address = row.ip_address;
        return (
          <div className="flex items-center gap-1.5">
            <code className="text-[11px] text-agap-textSub">{address}</code>
            {ip !== address && (
              <button
                type="button"
                onClick={() => { setIp(address); setPage(1); }}
                title={`Show only ${address}`}
                aria-label={`Show only events from IP ${address}`}
                className="shrink-0 rounded-lg p-1 text-agap-textSub transition-colors hover:bg-agap-surface hover:text-agap-textMain"
              >
                <Filter size={12} />
              </button>
            )}
          </div>
        );
      },
    },
  ];

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-[rgba(168,181,193,0.20)] bg-white p-4 shadow-card">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-agap-textSub">Event</label>
            <Select value={action} onValueChange={(v) => { setAction(v); setPage(1); }}>
              <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="All security events" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All security events</SelectItem>
                {SECURITY_ACTIONS.map((a) => <SelectItem key={a} value={a}>{actionLabel(a)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label htmlFor="sec-from" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-agap-textSub">From</label>
            <input id="sec-from" type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} className={INPUT_CLASS} />
          </div>
          <div>
            <label htmlFor="sec-to" className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-agap-textSub">To</label>
            <input id="sec-to" type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} className={INPUT_CLASS} />
          </div>
        </div>

        {hasFilters && (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              {account && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-agap-greenSoft px-3 py-1 text-xs font-semibold text-agap-green">
                  Account: {account.name}
                  <button type="button" onClick={() => { setAccount(null); setPage(1); }} aria-label="Clear account filter">
                    <X size={12} />
                  </button>
                </span>
              )}
              {ip && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-agap-greenSoft px-3 py-1 text-xs font-semibold text-agap-green">
                  IP: {ip}
                  <button type="button" onClick={() => { setIp(null); setPage(1); }} aria-label="Clear IP filter">
                    <X size={12} />
                  </button>
                </span>
              )}
            </div>
            <button type="button" onClick={resetFilters} className="text-xs font-semibold text-agap-green hover:underline">
              Clear filters
            </button>
          </div>
        )}
      </div>

      {isError ? (
        <p className="rounded-xl bg-agap-dangerSoft px-4 py-3 text-sm text-agap-danger">Couldn&apos;t load security events.</p>
      ) : (
        <DataTable
          columns={columns}
          data={rows}
          getRowKey={(row) => row.id}
          loading={isLoading}
          emptyTitle="No security events"
          emptyDescription={hasFilters ? 'Nothing matches these filters.' : 'Failed sign-ins, lockouts, account changes and guest reports will appear here.'}
        />
      )}

      {data && (
        <Pagination
          page={page}
          totalPages={totalPages}
          total={total}
          perPage={perPage}
          onPageChange={setPage}
          onPerPageChange={(n) => { setPerPage(n); setPage(1); }}
          noun={total === 1 ? 'event' : 'events'}
          fetching={isFetching && !isLoading}
        />
      )}
    </div>
  );
}
