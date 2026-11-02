'use client';

import { Suspense, useMemo, useState, type JSX, type ReactNode } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Truck, Users, Package,
  Search, CheckCircle2, Radio, MapPin, AlertCircle, Wrench, Undo2, Clock, WifiOff,
  UserCheck, UserX, UserMinus, X, RefreshCw,
} from 'lucide-react';
import { DEPLOYED_RESOURCE_STATUSES, ResourceStatus, UNAVAILABLE_RESOURCE_STATUSES } from '@agap/shared';
import type { LucideIcon } from 'lucide-react';
import {
  Button,
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui';
import { ConnectionIndicator } from '@/components/layout/ConnectionIndicator';
import { useWsState } from '@/lib/use-ws-state';
import { useAuthUser, hasRole } from '@/lib/use-auth';
import { titleCase } from '@/lib/incident-format';
import { useResources, useUpdateResourceStatus } from '@/features/resources/hooks';
import { useResponders } from '@/features/responders/hooks';
import { useOrganizations } from '@/features/organizations/hooks';
import type { Resource } from '@/features/resources/api';
import { capabilityChipLabel } from '@/features/resources/capabilities';
import { resourceStatusLabel } from '@/features/resources/status';
import type { Responder } from '@/features/responders/api';
import { cn } from '@/lib/utils';
import { RegistryTab } from '@/components/resources/RegistryTab';
import { resourceTypeIcon } from '@/components/resources/resource-type-icon';
import { RESOURCE_TYPES, resourceTypeLabel } from '@/features/resources/resource-type';

// ─── Constants ───────────────────────────────────────────────────────────────

// Exactly the database's resource_status values (shared enum). The select lists all of
// them, so a unit the system put in TRANSPORTING still shows its current status.
const RESOURCE_STATUSES = Object.values(ResourceStatus);

const ALL = 'ALL';

/** Readiness groups shown as the quick filters above each grid; the dashboard counts the same way. */
const UNIT_GROUPS: Record<string, readonly string[]> = {
  AVAILABLE:   [ResourceStatus.AVAILABLE],
  ACTIVE:      DEPLOYED_RESOURCE_STATUSES,
  UNAVAILABLE: UNAVAILABLE_RESOURCE_STATUSES,
};

const FOCUS_RING = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-agap-green/60 focus-visible:ring-offset-1';
const PANEL = 'rounded-2xl border border-agap-track/50 bg-white shadow-card';

// ─── Helpers ─────────────────────────────────────────────────────────────────

interface StatusStyle {
  badge: string;
  accent: string;
  icon: LucideIcon;
  label: string;
}

function resourceStatusStyle(status: string): StatusStyle {
  switch (status) {
    case 'AVAILABLE':      return { badge: 'bg-agap-greenSoft text-agap-green ring-agap-green/20', accent: 'bg-agap-green', icon: CheckCircle2, label: resourceStatusLabel(status) };
    case 'DISPATCHED':     return { badge: 'bg-amber-50 text-amber-800 ring-amber-200',            accent: 'bg-amber-500',  icon: Radio,        label: resourceStatusLabel(status) };
    case 'EN_ROUTE':       return { badge: 'bg-blue-50 text-blue-700 ring-blue-200',               accent: 'bg-blue-500',   icon: MapPin,       label: resourceStatusLabel(status) };
    case 'ON_SCENE':       return { badge: 'bg-purple-50 text-purple-700 ring-purple-200',         accent: 'bg-purple-500', icon: MapPin,       label: resourceStatusLabel(status) };
    case 'TRANSPORTING':   return { badge: 'bg-indigo-50 text-indigo-700 ring-indigo-200',         accent: 'bg-indigo-500', icon: Truck,        label: resourceStatusLabel(status) };
    case 'RETURNING':      return { badge: 'bg-sky-50 text-sky-700 ring-sky-200',                  accent: 'bg-sky-500',    icon: Undo2,        label: resourceStatusLabel(status) };
    case 'RESERVED':       return { badge: 'bg-amber-50 text-amber-800 ring-amber-200',            accent: 'bg-amber-400',  icon: Clock,        label: resourceStatusLabel(status) };
    case 'OUT_OF_SERVICE': return { badge: 'bg-red-50 text-red-700 ring-red-200',                  accent: 'bg-red-500',    icon: Wrench,       label: resourceStatusLabel(status) };
    case 'OFFLINE':        return { badge: 'bg-slate-100 text-slate-700 ring-slate-200',           accent: 'bg-slate-400',  icon: WifiOff,      label: resourceStatusLabel(status) };
    default:               return { badge: 'bg-slate-100 text-slate-700 ring-slate-200',           accent: 'bg-slate-300',  icon: Package,      label: resourceStatusLabel(status) };
  }
}

function responderAvailabilityStyle(status: string): StatusStyle {
  switch (status) {
    case 'AVAILABLE':   return { badge: 'bg-agap-greenSoft text-agap-green ring-agap-green/20', accent: 'bg-agap-green', icon: UserCheck, label: 'Available' };
    case 'OFF_DUTY':    return { badge: 'bg-slate-100 text-slate-700 ring-slate-200',           accent: 'bg-slate-400',  icon: UserMinus, label: 'Off duty' };
    case 'UNAVAILABLE': return { badge: 'bg-red-50 text-red-700 ring-red-200',                  accent: 'bg-red-500',    icon: UserX,     label: 'Unavailable' };
    default:            return { badge: 'bg-slate-100 text-slate-700 ring-slate-200',           accent: 'bg-slate-300',  icon: Users,     label: titleCase(status) };
  }
}

function StatusBadge({ style }: { style: StatusStyle }): JSX.Element {
  const Icon = style.icon;
  return (
    <span className={cn('inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset', style.badge)}>
      <Icon size={12} aria-hidden="true" />
      {style.label}
    </span>
  );
}

// ─── Readiness summary + quick filter ──────────────────────────────────────────

interface Segment {
  key: string;
  label: string;
  count: number;
  /** Bar and dot colour. */
  tone: string;
}

/**
 * The counts and the filter in one control: a proportion bar for the at-a-glance
 * picture, and chips (with the numbers, so colour is never the only cue) that filter the grid.
 */
function ReadinessFilter({
  label, total, segments, value, onChange,
}: {
  label: string;
  total: number;
  segments: Segment[];
  value: string;
  onChange: (key: string) => void;
}): JSX.Element {
  return (
    <div className="space-y-3">
      {total > 0 && (
        <div aria-hidden="true" className="flex h-2 w-full overflow-hidden rounded-full bg-agap-surface">
          {segments.map((s) =>
            s.count > 0 ? (
              <span key={s.key} className={cn('h-full first:rounded-l-full last:rounded-r-full', s.tone)} style={{ width: `${(s.count / total) * 100}%` }} />
            ) : null,
          )}
        </div>
      )}
      <div role="group" aria-label={label} className="flex flex-wrap gap-2">
        {[{ key: ALL, label: 'All', count: total, tone: 'bg-agap-textMid' }, ...segments].map((s) => {
          const pressed = value === s.key;
          return (
            <button
              key={s.key}
              type="button"
              aria-pressed={pressed}
              onClick={() => onChange(s.key)}
              className={cn(
                'inline-flex h-10 items-center gap-2 rounded-full border px-3.5 text-[13px] font-semibold transition-colors',
                FOCUS_RING,
                pressed
                  ? 'border-agap-green bg-agap-greenSoft text-agap-green'
                  : 'border-agap-track bg-white text-agap-textMid hover:border-agap-textSub/40 hover:bg-agap-surface/60',
              )}
            >
              <span aria-hidden="true" className={cn('h-2 w-2 rounded-full', s.tone)} />
              {s.label}
              <span className={cn('tabular-nums', pressed ? 'text-agap-green' : 'text-slate-500')}>{s.count}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function SearchField({
  value, onChange, placeholder, label,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  label: string;
}): JSX.Element {
  return (
    <div className="relative col-span-2 sm:w-64">
      <Search size={15} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={label}
        className="h-11 w-full rounded-xl border border-agap-textSub bg-white pl-9 pr-9 text-sm text-agap-textMain placeholder:text-slate-500 focus:border-agap-green/50 focus:outline-none focus:ring-2 focus:ring-agap-green/20 [&::-webkit-search-cancel-button]:hidden"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          aria-label="Clear search"
          className={cn('absolute right-1 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-slate-500 hover:bg-agap-surface hover:text-agap-textMain', FOCUS_RING)}
        >
          <X size={14} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

function SectionHeader({ id, title, detail, icon: Icon }: { id: string; title: string; detail: string; icon: LucideIcon }): JSX.Element {
  return (
    <div className="flex items-center gap-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-agap-greenSoft text-agap-green">
        <Icon size={18} aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <h2 id={id} className="text-base font-bold text-agap-textMain">{title}</h2>
        <p className="text-[13px] text-slate-500" aria-live="polite">{detail}</p>
      </div>
    </div>
  );
}

function EmptyPanel({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children: ReactNode }): JSX.Element {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-agap-track bg-white px-6 py-12 text-center">
      <Icon size={28} aria-hidden="true" className="mb-3 text-agap-textSub" />
      <p className="font-semibold text-agap-textMain">{title}</p>
      <div className="mt-1 text-sm text-slate-500">{children}</div>
    </div>
  );
}

function ErrorPanel({ message, onRetry }: { message: string; onRetry: () => void }): JSX.Element {
  return (
    <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-agap-danger/25 bg-agap-dangerSoft px-5 py-4">
      <p className="flex items-center gap-2 text-sm text-agap-danger">
        <AlertCircle size={16} aria-hidden="true" className="shrink-0" />
        {message}
      </p>
      <Button variant="secondary" size="md" onClick={onRetry}>
        <RefreshCw size={14} aria-hidden="true" />
        Retry
      </Button>
    </div>
  );
}

function CardGridSkeleton({ count, height }: { count: number; height: string }): JSX.Element {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4" aria-busy="true">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className={cn('animate-pulse rounded-2xl border border-agap-track/40 bg-agap-surface/70 motion-reduce:animate-none', height)} />
      ))}
    </div>
  );
}

// ─── Unit card ────────────────────────────────────────────────────────────────

function UnitCard({ resource, canChangeStatus }: { resource: Resource; canChangeStatus: boolean }): JSX.Element {
  const updateStatus = useUpdateResourceStatus();
  const style = resourceStatusStyle(resource.status);
  const TypeIcon = resourceTypeIcon(resource.resource_type);
  const capabilities = resource.capabilities ?? [];
  const meta = [resourceTypeLabel(resource.resource_type), resource.base_barangay].filter(Boolean).join(' · ');

  return (
    <article className={cn('relative flex flex-col gap-3 overflow-hidden p-4', PANEL)}>
      {/* Status accent: a quiet cue next to the labelled badge, never the only one. */}
      <span aria-hidden="true" className={cn('absolute inset-y-0 left-0 w-1', style.accent)} />

      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-agap-surface text-agap-textMid">
            <TypeIcon size={18} aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h3 className="truncate text-[15px] font-semibold leading-tight text-agap-textMain">{resource.name}</h3>
            {resource.call_sign && (
              <p className="mt-0.5 font-mono text-xs text-slate-500">{resource.call_sign}</p>
            )}
          </div>
        </div>
        <StatusBadge style={style} />
      </div>

      <div className="space-y-0.5 text-[13px]">
        <p className="truncate text-agap-textMid">{meta}</p>
        {resource.organization && <p className="truncate text-slate-500">{resource.organization.name}</p>}
      </div>

      {capabilities.length > 0 && (
        <ul aria-label="Capabilities" className="flex flex-wrap gap-1.5">
          {capabilities.slice(0, 4).map((c) => (
            <li
              key={c.id}
              className={cn(
                'rounded-md px-2 py-0.5 text-[11px] font-semibold',
                c.is_verified
                  ? 'bg-agap-surface text-agap-textMid'
                  : 'border border-dashed border-agap-amber/60 bg-white text-agap-amber',
              )}
            >
              {capabilityChipLabel(c)}
            </li>
          ))}
          {capabilities.length > 4 && (
            <li className="self-center text-[11px] font-medium text-slate-500">+{capabilities.length - 4} more</li>
          )}
        </ul>
      )}

      {/* Status change (Dispatcher / Supervisor only) */}
      {canChangeStatus && (
        <div className="mt-auto border-t border-agap-track/40 pt-3">
          <Select
            value={resource.status}
            onValueChange={(s) => updateStatus.mutate({ id: resource.id, status: s })}
            disabled={updateStatus.isPending}
          >
            <SelectTrigger aria-label={`Change status of ${resource.name}`} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RESOURCE_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {resourceStatusStyle(s).label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {updateStatus.isPending && <p className="mt-1.5 text-xs text-slate-500" role="status">Updating status…</p>}
          {updateStatus.isError && (
            <p className="mt-1.5 text-xs text-agap-danger" role="alert">
              {(updateStatus.error as Error)?.message ?? 'Could not change status. Try again.'}
            </p>
          )}
        </div>
      )}
    </article>
  );
}

// ─── Responder card ───────────────────────────────────────────────────────────

function ResponderCard({ responder }: { responder: Responder }): JSX.Element {
  const style = responderAvailabilityStyle(responder.availability_status);
  const initials = responder.full_name
    .split(' ')
    .map((p) => p[0] ?? '')
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <article className={cn('relative flex items-center gap-3 overflow-hidden p-4', PANEL)}>
      <span aria-hidden="true" className={cn('absolute inset-y-0 left-0 w-1', style.accent)} />
      <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-agap-surface text-sm font-bold text-agap-textMid">
        {initials}
      </span>
      <div className="min-w-0 flex-1">
        <h3 className="truncate text-[15px] font-semibold leading-tight text-agap-textMain">{responder.full_name}</h3>
        <p className="mt-0.5 truncate text-[13px] text-slate-500">
          {[responder.organization?.name, responder.phone_number].filter(Boolean).join(' · ') || '—'}
        </p>
      </div>
      <StatusBadge style={style} />
    </article>
  );
}

// ─── Units & Personnel tab ─────────────────────────────────────────────────────

function FleetUnitsView(): JSX.Element {
  const user = useAuthUser();
  const canChangeStatus = hasRole(user, 'DISPATCHER', 'SUPERVISOR');

  const { data: orgsData } = useOrganizations({ perPage: 200 });
  const orgs = orgsData?.data ?? [];

  const { data, isLoading, isError, refetch } = useResources({ perPage: 500 });
  const resources = useMemo<Resource[]>(() => data?.data ?? [], [data]);

  const {
    data: responders = [],
    isLoading: respondersLoading,
    isError: respondersError,
    refetch: refetchResponders,
  } = useResponders({ perPage: 200 });

  const [unitSearch, setUnitSearch]   = useState('');
  const [orgFilter, setOrgFilter]     = useState(ALL);
  const [typeFilter, setTypeFilter]   = useState(ALL);
  const [groupFilter, setGroupFilter] = useState(ALL);
  const [responderSearch, setResponderSearch] = useState('');
  const [responderAvailFilter, setResponderAvailFilter] = useState(ALL);

  const filtered = useMemo<Resource[]>(() => {
    const q = unitSearch.trim().toLowerCase();
    return resources
      .filter((r) => (orgFilter === ALL   ? true : r.organization_id === orgFilter))
      .filter((r) => (typeFilter === ALL  ? true : r.resource_type === typeFilter))
      .filter((r) => (groupFilter === ALL ? true : (UNIT_GROUPS[groupFilter] ?? []).includes(r.status)))
      .filter((r) =>
        q
          ? r.name.toLowerCase().includes(q) ||
            (r.call_sign ?? '').toLowerCase().includes(q) ||
            (r.organization?.name ?? '').toLowerCase().includes(q)
          : true,
      );
  }, [resources, unitSearch, orgFilter, typeFilter, groupFilter]);

  const filteredResponders = useMemo<Responder[]>(() => {
    const q = responderSearch.trim().toLowerCase();
    return responders
      .filter((r) => (responderAvailFilter === ALL ? true : r.availability_status === responderAvailFilter))
      .filter((r) =>
        q
          ? r.full_name.toLowerCase().includes(q) ||
            (r.organization?.name ?? '').toLowerCase().includes(q)
          : true,
      );
  }, [responders, responderSearch, responderAvailFilter]);

  const inGroup = (group: string) => resources.filter((r) => (UNIT_GROUPS[group] ?? []).includes(r.status)).length;
  const unitSegments: Segment[] = [
    { key: 'AVAILABLE',   label: 'Available',   count: inGroup('AVAILABLE'),   tone: 'bg-agap-green' },
    { key: 'ACTIVE',      label: 'Active',      count: inGroup('ACTIVE'),      tone: 'bg-amber-500' },
    { key: 'UNAVAILABLE', label: 'Unavailable', count: inGroup('UNAVAILABLE'), tone: 'bg-red-500' },
  ];

  const withAvailability = (s: string) => responders.filter((r) => r.availability_status === s).length;
  const responderSegments: Segment[] = [
    { key: 'AVAILABLE',   label: 'Available',   count: withAvailability('AVAILABLE'),   tone: 'bg-agap-green' },
    { key: 'OFF_DUTY',    label: 'Off duty',    count: withAvailability('OFF_DUTY'),    tone: 'bg-slate-400' },
    { key: 'UNAVAILABLE', label: 'Unavailable', count: withAvailability('UNAVAILABLE'), tone: 'bg-red-500' },
  ];

  const unitFiltersOn = unitSearch || orgFilter !== ALL || typeFilter !== ALL || groupFilter !== ALL;
  const total = resources.length;

  return (
    <div className="space-y-8">
      {/* ── Units ──────────────────────────────────────────────────────────── */}
      <section aria-labelledby="fleet-units" className="space-y-4">
        <SectionHeader
          id="fleet-units"
          icon={Truck}
          title="Units"
          detail={isLoading ? 'Loading units…' : `${filtered.length} of ${total} unit${total === 1 ? '' : 's'} shown`}
        />

        {!isLoading && !isError && total > 0 && (
          <div className={cn('space-y-4 p-4 sm:p-5', PANEL)}>
            <ReadinessFilter label="Filter units by readiness" total={total} segments={unitSegments} value={groupFilter} onChange={setGroupFilter} />

            <div className="grid grid-cols-2 gap-2 border-t border-agap-track/40 pt-4 sm:flex sm:flex-wrap sm:items-center">
              <SearchField value={unitSearch} onChange={setUnitSearch} placeholder="Name, call sign or organization" label="Search units" />
              {orgs.length > 0 && (
                <Select value={orgFilter} onValueChange={setOrgFilter}>
                  <SelectTrigger aria-label="Filter by organization" className="w-full sm:w-52"><SelectValue placeholder="All organizations" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>All organizations</SelectItem>
                    {orgs.map((o) => (
                      <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger aria-label="Filter by unit type" className="w-full sm:w-48"><SelectValue placeholder="All types" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All types</SelectItem>
                  {RESOURCE_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>{resourceTypeLabel(t)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {unitFiltersOn && (
                <Button
                  variant="ghost"
                  size="md"
                  className="col-span-2 sm:col-span-1"
                  onClick={() => {
                    setUnitSearch('');
                    setOrgFilter(ALL);
                    setTypeFilter(ALL);
                    setGroupFilter(ALL);
                  }}
                >
                  <X size={14} aria-hidden="true" />
                  Clear filters
                </Button>
              )}
            </div>
          </div>
        )}

        {isError && <ErrorPanel message="Could not load fleet data." onRetry={() => void refetch()} />}

        {isLoading && <CardGridSkeleton count={6} height="h-44" />}

        {!isLoading && !isError && filtered.length === 0 && (
          <EmptyPanel icon={Truck} title={total === 0 ? 'No units registered' : 'No units match these filters'}>
            {total === 0 ? (
              'Add response units in the Registry tab.'
            ) : (
              <button
                type="button"
                onClick={() => { setUnitSearch(''); setOrgFilter(ALL); setTypeFilter(ALL); setGroupFilter(ALL); }}
                className={cn('font-semibold text-agap-green hover:underline', FOCUS_RING)}
              >
                Clear filters
              </button>
            )}
          </EmptyPanel>
        )}

        {!isLoading && !isError && filtered.length > 0 && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {filtered.map((r) => (
              <UnitCard key={r.id} resource={r} canChangeStatus={canChangeStatus} />
            ))}
          </div>
        )}
      </section>

      {/* ── Personnel ──────────────────────────────────────────────────────── */}
      <section aria-labelledby="fleet-personnel" className="space-y-4 border-t border-agap-track/50 pt-6">
        <SectionHeader
          id="fleet-personnel"
          icon={Users}
          title="Responders"
          detail={
            respondersLoading
              ? 'Loading responders…'
              : `${filteredResponders.length} of ${responders.length} responder${responders.length === 1 ? '' : 's'} shown`
          }
        />

        {!respondersLoading && !respondersError && responders.length > 0 && (
          <div className={cn('space-y-4 p-4 sm:p-5', PANEL)}>
            <ReadinessFilter
              label="Filter responders by availability"
              total={responders.length}
              segments={responderSegments}
              value={responderAvailFilter}
              onChange={setResponderAvailFilter}
            />
            <div className="grid grid-cols-2 gap-2 border-t border-agap-track/40 pt-4 sm:flex sm:flex-wrap sm:items-center">
              <SearchField value={responderSearch} onChange={setResponderSearch} placeholder="Name or organization" label="Search responders" />
            </div>
          </div>
        )}

        {respondersError && <ErrorPanel message="Could not load responders." onRetry={() => void refetchResponders()} />}

        {respondersLoading && <CardGridSkeleton count={4} height="h-[76px]" />}

        {!respondersLoading && !respondersError && filteredResponders.length === 0 && (
          <EmptyPanel icon={Users} title={responders.length === 0 ? 'No responders registered' : 'No responders match'}>
            {responders.length === 0
              ? 'No responder accounts have been registered yet.'
              : 'Try another availability or search.'}
          </EmptyPanel>
        )}

        {!respondersLoading && !respondersError && filteredResponders.length > 0 && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {filteredResponders.map((r) => (
              <ResponderCard key={r.id} responder={r} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

// ─── Page: Fleet & Units ──────────────────────────────────────────────────────

type FleetTab = 'units' | 'registry';

const FLEET_TABS: { key: FleetTab; label: string; icon: LucideIcon }[] = [
  { key: 'units', label: 'Units & Personnel', icon: Truck },
  { key: 'registry', label: 'Registry', icon: Package },
];

/**
 * Operational unit status and the resource registry on one page. The System
 * Administrator maintains the registry only; unit status is an operational action
 * (PATCH /resources/:id/status allows Dispatcher, Supervisor and Responder).
 */
function FleetAndUnits(): JSX.Element {
  const user = useAuthUser();
  const wsState = useWsState();
  const router = useRouter();
  const searchParams = useSearchParams();
  const registryOnly = !hasRole(user, 'DISPATCHER', 'SUPERVISOR');
  const tab: FleetTab = registryOnly || searchParams.get('tab') === 'registry' ? 'registry' : 'units';

  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h1 className="text-[22px] font-bold leading-tight tracking-tight text-agap-textMain">Fleet &amp; Units</h1>
          <p className="mt-1 text-[13px] text-slate-600">
            {!registryOnly
              ? 'Unit readiness and responder availability'
              : hasRole(user, 'ORG_ADMINISTRATOR')
                ? "Register and maintain your organization's response units and their capabilities"
                : "Every organization's registered response units"}
          </p>
        </div>
        {!registryOnly && <ConnectionIndicator state={wsState} />}
      </header>

      {!registryOnly && (
        <div role="tablist" aria-label="Fleet views" className="flex w-full items-center gap-1 rounded-xl bg-agap-surface p-1 sm:w-fit">
          {FLEET_TABS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              onClick={() => router.replace(key === 'units' ? '/operations/fleet' : '/operations/fleet?tab=registry')}
              className={cn(
                'inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-lg px-4 text-sm font-semibold transition-colors sm:flex-none',
                FOCUS_RING,
                tab === key ? 'bg-white text-agap-green shadow-tile' : 'text-agap-textMid hover:text-agap-textMain',
              )}
            >
              <Icon size={15} aria-hidden="true" />
              {label}
            </button>
          ))}
        </div>
      )}

      {tab === 'units' ? <FleetUnitsView /> : <RegistryTab />}
    </div>
  );
}

export default function FleetPage(): JSX.Element {
  // useSearchParams needs a Suspense boundary in the App Router.
  return (
    <Suspense fallback={null}>
      <FleetAndUnits />
    </Suspense>
  );
}
