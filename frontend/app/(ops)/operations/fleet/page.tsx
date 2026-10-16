'use client';

import { useMemo, useState, type JSX } from 'react';
import {
  Truck, Flame, Waves, Users, Package,
  Search, CheckCircle2, Radio, MapPin, AlertCircle, Wrench,
  UserCheck, UserX, UserMinus,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import {
  Button, StatCard,
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
import type { Responder } from '@/features/responders/api';
import { cn } from '@/lib/utils';

// ─── Constants ───────────────────────────────────────────────────────────────

const RESOURCE_TYPES = [
  'AMBULANCE', 'FIRE_TRUCK', 'RESCUE_BOAT', 'RESCUE_VEHICLE',
  'FLOOD_RESPONSE_UNIT', 'SEARCH_AND_RESCUE_UNIT', 'PERSONNEL', 'EQUIPMENT', 'OTHER',
] as const;

const RESOURCE_STATUSES = [
  'AVAILABLE', 'DISPATCHED', 'EN_ROUTE', 'ON_SCENE', 'OUT_OF_SERVICE', 'MAINTENANCE',
] as const;

const ALL = 'ALL';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function resourceTypeIcon(type: string): LucideIcon {
  switch (type) {
    case 'AMBULANCE':              return Truck;
    case 'FIRE_TRUCK':             return Flame;
    case 'RESCUE_BOAT':            return Waves;
    case 'RESCUE_VEHICLE':         return Truck;
    case 'FLOOD_RESPONSE_UNIT':    return Waves;
    case 'SEARCH_AND_RESCUE_UNIT': return Users;
    case 'PERSONNEL':              return Users;
    default:                       return Package;
  }
}

interface StatusStyle {
  card: string;
  badge: string;
  icon: LucideIcon;
  label: string;
}

function resourceStatusStyle(status: string): StatusStyle {
  switch (status) {
    case 'AVAILABLE':
      return {
        card:  'border-[rgba(13,96,83,0.16)] bg-white',
        badge: 'bg-agap-greenSoft text-agap-green',
        icon:  CheckCircle2,
        label: 'Available',
      };
    case 'DISPATCHED':
      return {
        card:  'border-[rgba(217,119,6,0.22)] bg-agap-amberSoft',
        badge: 'bg-amber-100 text-amber-800',
        icon:  Radio,
        label: 'Dispatched',
      };
    case 'EN_ROUTE':
      return {
        card:  'border-[rgba(59,130,246,0.22)] bg-agap-infoSoft',
        badge: 'bg-blue-100 text-blue-700',
        icon:  MapPin,
        label: 'En Route',
      };
    case 'ON_SCENE':
      return {
        card:  'border-[rgba(126,34,206,0.18)] bg-purple-50',
        badge: 'bg-purple-100 text-purple-700',
        icon:  MapPin,
        label: 'On Scene',
      };
    case 'OUT_OF_SERVICE':
      return {
        card:  'border-[rgba(212,72,88,0.22)] bg-agap-dangerSoft',
        badge: 'bg-red-100 text-red-700',
        icon:  AlertCircle,
        label: 'Out of Service',
      };
    case 'MAINTENANCE':
      return {
        card:  'border-[rgba(168,181,193,0.24)] bg-agap-surface',
        badge: 'bg-slate-100 text-slate-600',
        icon:  Wrench,
        label: 'Maintenance',
      };
    default:
      return {
        card:  'border-[rgba(168,181,193,0.24)] bg-white',
        badge: 'bg-agap-surface text-agap-textMid',
        icon:  Package,
        label: titleCase(status),
      };
  }
}

// ─── Unit card ────────────────────────────────────────────────────────────────

interface UnitCardProps {
  resource: Resource;
  canChangeStatus: boolean;
}

function UnitCard({ resource, canChangeStatus }: UnitCardProps): JSX.Element {
  const updateStatus = useUpdateResourceStatus();
  const style = resourceStatusStyle(resource.status);
  const TypeIcon = resourceTypeIcon(resource.resource_type);
  const StatusIcon = style.icon;

  const nextStatuses = RESOURCE_STATUSES.filter((s) => s !== resource.status);

  return (
    <div
      className={cn(
        'flex flex-col gap-3 rounded-2xl border p-4 shadow-tile transition-colors duration-300',
        style.card,
      )}
    >
      {/* Top row: icon + name + status badge */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white shadow-tile">
            <TypeIcon size={16} className="text-agap-textMid" />
          </span>
          <div className="min-w-0">
            <p className="truncate font-bold text-agap-textMain leading-tight">{resource.name}</p>
            {resource.call_sign && (
              <p className="font-mono text-[11px] text-agap-textSub leading-tight">{resource.call_sign}</p>
            )}
          </div>
        </div>
        <span className={cn(
          'inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold',
          style.badge,
        )}>
          <StatusIcon size={11} />
          {style.label}
        </span>
      </div>

      {/* Organization */}
      {resource.organization && (
        <p className="text-xs text-agap-textSub truncate">{resource.organization.name}</p>
      )}

      {/* Capabilities */}
      {(resource.capabilities ?? []).length > 0 && (
        <div className="flex flex-wrap gap-1">
          {(resource.capabilities ?? []).slice(0, 4).map((c) => (
            <span
              key={c}
              className="rounded-md bg-white/70 px-1.5 py-0.5 text-[10px] font-semibold text-agap-textMid ring-1 ring-[rgba(168,181,193,0.20)]"
            >
              {c}
            </span>
          ))}
          {(resource.capabilities ?? []).length > 4 && (
            <span className="text-[10px] text-agap-textSub self-center">
              +{(resource.capabilities ?? []).length - 4}
            </span>
          )}
        </div>
      )}

      {/* Status change (Dispatcher/Supervisor/SysAdmin only) */}
      {canChangeStatus && (
        <Select
          value={resource.status}
          onValueChange={(s) => {
            updateStatus.mutate({ id: resource.id, status: s });
          }}
          disabled={updateStatus.isPending}
        >
          <SelectTrigger className="h-8 w-full text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {RESOURCE_STATUSES.map((s) => (
              <SelectItem key={s} value={s} className="text-xs">
                {titleCase(s)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {/* Suppress unused warning */}
      {nextStatuses.length === 0 && null}
    </div>
  );
}

// ─── Responder card ───────────────────────────────────────────────────────────

interface AvailabilityStyle {
  card: string;
  badge: string;
  icon: LucideIcon;
  label: string;
}

function responderAvailabilityStyle(status: string): AvailabilityStyle {
  switch (status) {
    case 'AVAILABLE':
      return {
        card:  'border-[rgba(13,96,83,0.16)] bg-white',
        badge: 'bg-agap-greenSoft text-agap-green',
        icon:  UserCheck,
        label: 'Available',
      };
    case 'OFF_DUTY':
      return {
        card:  'border-[rgba(168,181,193,0.24)] bg-agap-surface',
        badge: 'bg-slate-100 text-slate-500',
        icon:  UserMinus,
        label: 'Off Duty',
      };
    case 'UNAVAILABLE':
      return {
        card:  'border-[rgba(212,72,88,0.22)] bg-agap-dangerSoft',
        badge: 'bg-red-100 text-red-600',
        icon:  UserX,
        label: 'Unavailable',
      };
    default:
      return {
        card:  'border-[rgba(168,181,193,0.24)] bg-white',
        badge: 'bg-slate-100 text-slate-500',
        icon:  Users,
        label: titleCase(status),
      };
  }
}

function ResponderCard({ responder }: { responder: Responder }): JSX.Element {
  const style = responderAvailabilityStyle(responder.availability_status);
  const StatusIcon = style.icon;
  const initials = responder.full_name
    .split(' ')
    .map((p) => p[0] ?? '')
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <div
      className={cn(
        'flex flex-col gap-3 rounded-2xl border p-4 shadow-tile transition-colors duration-300',
        style.card,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white shadow-tile font-bold text-sm text-agap-textMid">
            {initials}
          </span>
          <div className="min-w-0">
            <p className="truncate font-bold text-agap-textMain leading-tight">{responder.full_name}</p>
            {responder.phone_number && (
              <p className="font-mono text-[11px] text-agap-textSub leading-tight">{responder.phone_number}</p>
            )}
          </div>
        </div>
        <span className={cn(
          'inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold',
          style.badge,
        )}>
          <StatusIcon size={11} />
          {style.label}
        </span>
      </div>
      {responder.organization && (
        <p className="text-xs text-agap-textSub truncate">{responder.organization.name}</p>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function FleetPage(): JSX.Element {
  const wsState = useWsState();
  const user = useAuthUser();
  const canChangeStatus = hasRole(user, 'DISPATCHER', 'SUPERVISOR', 'SYSTEM_ADMINISTRATOR');

  const { data: orgsData } = useOrganizations({ perPage: 200 });
  const orgs = orgsData?.data ?? [];

  const { data, isLoading, isError, refetch } = useResources({ perPage: 500 });
  const resources = useMemo<Resource[]>(() => data?.data ?? [], [data]);

  const { data: responders = [], isLoading: respondersLoading } = useResponders({ perPage: 200 });

  const [search, setSearch]       = useState('');
  const [orgFilter, setOrgFilter] = useState(ALL);
  const [typeFilter, setTypeFilter]     = useState(ALL);
  const [statusFilter, setStatusFilter] = useState(ALL);
  const [responderAvailFilter, setResponderAvailFilter] = useState(ALL);

  const filtered = useMemo<Resource[]>(() => {
    const q = search.trim().toLowerCase();
    return resources
      .filter((r) => (orgFilter === ALL    ? true : r.organization_id === orgFilter))
      .filter((r) => (typeFilter === ALL   ? true : r.resource_type === typeFilter))
      .filter((r) => (statusFilter === ALL ? true : r.status === statusFilter))
      .filter((r) =>
        q
          ? r.name.toLowerCase().includes(q) ||
            (r.call_sign ?? '').toLowerCase().includes(q) ||
            (r.organization?.name ?? '').toLowerCase().includes(q)
          : true,
      );
  }, [resources, search, orgFilter, typeFilter, statusFilter]);

  const filteredResponders = useMemo<Responder[]>(() => {
    const q = search.trim().toLowerCase();
    return responders
      .filter((r) => (responderAvailFilter === ALL ? true : r.availability_status === responderAvailFilter))
      .filter((r) =>
        q
          ? r.full_name.toLowerCase().includes(q) ||
            (r.organization?.name ?? '').toLowerCase().includes(q)
          : true,
      );
  }, [responders, search, responderAvailFilter]);

  // Summary counts — resources
  const total        = resources.length;
  const available    = resources.filter((r) => r.status === 'AVAILABLE').length;
  const active       = resources.filter((r) => ['DISPATCHED', 'EN_ROUTE', 'ON_SCENE'].includes(r.status)).length;
  const unavailable  = resources.filter((r) => ['OUT_OF_SERVICE', 'MAINTENANCE'].includes(r.status)).length;

  // Summary counts — personnel
  const totalPersonnel     = responders.length;
  const availPersonnel     = responders.filter((r) => r.availability_status === 'AVAILABLE').length;
  const offDutyPersonnel   = responders.filter((r) => r.availability_status === 'OFF_DUTY').length;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-agap-textMain">Fleet — Unit Availability</h1>
          <p className="mt-1 text-sm text-agap-textSub">
            {isLoading ? 'Loading…' : `${filtered.length} of ${total} unit${total === 1 ? '' : 's'} shown`}
          </p>
        </div>
        <ConnectionIndicator state={wsState} />
      </div>

      {/* Summary stats */}
      {!isLoading && total > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard
            label="Total Units"
            value={total}
            icon={<Truck size={16} />}
          />
          <StatCard
            label="Available"
            value={available}
            icon={<CheckCircle2 size={16} />}
            variant="success"
          />
          <StatCard
            label="Active"
            value={active}
            icon={<Radio size={16} />}
            variant="warning"
          />
          <StatCard
            label="Unavailable"
            value={unavailable}
            icon={<AlertCircle size={16} />}
            variant="critical"
          />
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-agap-textSub" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, call sign…"
            className="h-10 w-56 rounded-xl border border-[rgba(168,181,193,0.20)] bg-white pl-9 pr-3 text-sm text-agap-textMain shadow-tile placeholder:text-agap-textSub focus:outline-none focus:ring-2 focus:ring-agap-green"
          />
        </div>

        {orgs.length > 0 && (
          <Select value={orgFilter} onValueChange={setOrgFilter}>
            <SelectTrigger className="w-48"><SelectValue placeholder="All organizations" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All organizations</SelectItem>
              {orgs.map((o) => (
                <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-44"><SelectValue placeholder="All types" /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All types</SelectItem>
            {RESOURCE_TYPES.map((t) => (
              <SelectItem key={t} value={t}>{titleCase(t)}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40"><SelectValue placeholder="All statuses" /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All statuses</SelectItem>
            {RESOURCE_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>{titleCase(s)}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {(search || orgFilter !== ALL || typeFilter !== ALL || statusFilter !== ALL) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSearch('');
              setOrgFilter(ALL);
              setTypeFilter(ALL);
              setStatusFilter(ALL);
            }}
          >
            Clear filters
          </Button>
        )}
      </div>

      {/* Error */}
      {isError && (
        <div className="rounded-2xl border border-[rgba(212,72,88,0.22)] bg-agap-dangerSoft p-6 text-center">
          <p className="text-sm text-agap-danger">Could not load fleet data.</p>
          <Button variant="secondary" size="sm" className="mt-3" onClick={() => void refetch()}>
            Retry
          </Button>
        </div>
      )}

      {/* Loading skeleton */}
      {isLoading && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="h-40 animate-pulse rounded-2xl border border-[rgba(168,181,193,0.20)] bg-agap-surface"
            />
          ))}
        </div>
      )}

      {/* Card grid */}
      {!isLoading && !isError && filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-[rgba(168,181,193,0.20)] bg-white py-16 text-center shadow-tile">
          <Truck size={32} className="mb-3 text-agap-track" />
          <p className="font-semibold text-agap-textMain">No units found</p>
          <p className="mt-1 text-sm text-agap-textSub">Adjust the filters above or add resources via the Registry.</p>
        </div>
      )}

      {!isLoading && !isError && filtered.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((r) => (
            <UnitCard key={r.id} resource={r} canChangeStatus={canChangeStatus} />
          ))}
        </div>
      )}

      {/* ── Personnel section ──────────────────────────────────────────────── */}
      <div className="border-t border-[rgba(168,181,193,0.18)] pt-5 space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-extrabold text-agap-textMain">Personnel — Responder Availability</h2>
            <p className="mt-0.5 text-sm text-agap-textSub">
              {respondersLoading ? 'Loading…' : `${filteredResponders.length} of ${totalPersonnel} responder${totalPersonnel === 1 ? '' : 's'} shown`}
            </p>
          </div>
        </div>

        {/* Personnel stat cards */}
        {!respondersLoading && totalPersonnel > 0 && (
          <div className="grid grid-cols-3 gap-3">
            <StatCard
              label="Total Responders"
              value={totalPersonnel}
              icon={<Users size={16} />}
            />
            <StatCard
              label="Available"
              value={availPersonnel}
              icon={<UserCheck size={16} />}
              variant="success"
            />
            <StatCard
              label="Off Duty"
              value={offDutyPersonnel}
              icon={<UserMinus size={16} />}
            />
          </div>
        )}

        {/* Availability filter */}
        {!respondersLoading && totalPersonnel > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <Select value={responderAvailFilter} onValueChange={setResponderAvailFilter}>
              <SelectTrigger className="w-44"><SelectValue placeholder="All statuses" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All statuses</SelectItem>
                <SelectItem value="AVAILABLE">Available</SelectItem>
                <SelectItem value="OFF_DUTY">Off Duty</SelectItem>
                <SelectItem value="UNAVAILABLE">Unavailable</SelectItem>
              </SelectContent>
            </Select>
            {responderAvailFilter !== ALL && (
              <Button variant="ghost" size="sm" onClick={() => setResponderAvailFilter(ALL)}>
                Clear
              </Button>
            )}
          </div>
        )}

        {/* Loading skeleton */}
        {respondersLoading && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-28 animate-pulse rounded-2xl border border-[rgba(168,181,193,0.20)] bg-agap-surface" />
            ))}
          </div>
        )}

        {/* Empty state */}
        {!respondersLoading && filteredResponders.length === 0 && (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-[rgba(168,181,193,0.20)] bg-white py-12 text-center shadow-tile">
            <Users size={28} className="mb-3 text-agap-track" />
            <p className="font-semibold text-agap-textMain">No responders found</p>
            <p className="mt-1 text-sm text-agap-textSub">
              {totalPersonnel === 0
                ? 'No responder accounts have been registered yet.'
                : 'Adjust the filter above.'}
            </p>
          </div>
        )}

        {/* Responder card grid */}
        {!respondersLoading && filteredResponders.length > 0 && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filteredResponders.map((r) => (
              <ResponderCard key={r.id} responder={r} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
