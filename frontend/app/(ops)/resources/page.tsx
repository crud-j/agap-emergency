'use client';

import { useMemo, useState, type JSX } from 'react';
import {
  Package, Truck, Flame, Waves, Users, Search, Plus, Pencil,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import {
  Button, DataTable,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
  type Column,
} from '@/components/ui';
import { useAuthUser, hasRole } from '@/lib/use-auth';
import { titleCase } from '@/lib/incident-format';
import {
  useResources,
  useCreateResource,
  useUpdateResource,
} from '@/features/resources/hooks';
import { useOrganizations } from '@/features/organizations/hooks';
import type { Resource, CreateResourceBody } from '@/features/resources/api';
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
    case 'AMBULANCE':             return Truck;
    case 'FIRE_TRUCK':            return Flame;
    case 'RESCUE_BOAT':           return Waves;
    case 'RESCUE_VEHICLE':        return Truck;
    case 'FLOOD_RESPONSE_UNIT':   return Waves;
    case 'SEARCH_AND_RESCUE_UNIT': return Users;
    case 'PERSONNEL':             return Users;
    default:                      return Package;
  }
}

function resourceStatusClasses(status: string): string {
  switch (status) {
    case 'AVAILABLE':      return 'bg-agap-greenSoft text-agap-green';
    case 'DISPATCHED':     return 'bg-agap-amberSoft text-agap-amber';
    case 'EN_ROUTE':       return 'bg-agap-infoSoft text-agap-info';
    case 'ON_SCENE':       return 'bg-purple-50 text-purple-700';
    case 'OUT_OF_SERVICE': return 'bg-agap-dangerSoft text-agap-danger';
    case 'MAINTENANCE':    return 'bg-agap-surface text-agap-textMid';
    default:               return 'bg-agap-surface text-agap-textMid';
  }
}

// ─── Form ────────────────────────────────────────────────────────────────────

interface ResourceFormState {
  organizationId: string;
  name: string;
  callSign: string;
  resourceType: string;
  vehicleId: string;
}

const EMPTY_FORM: ResourceFormState = {
  organizationId: '',
  name: '',
  callSign: '',
  resourceType: '',
  vehicleId: '',
};

interface ResourceFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: Resource | null;
  defaultOrgId?: string | undefined;
}

function ResourceFormDialog({ open, onOpenChange, editing, defaultOrgId }: ResourceFormDialogProps): JSX.Element {
  const [form, setForm] = useState<ResourceFormState>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);

  const { data: orgsData } = useOrganizations({ perPage: 200 });
  const orgs = orgsData?.data ?? [];

  const create = useCreateResource();
  const update = useUpdateResource();
  const pending = create.isPending || update.isPending;

  function handleOpen(next: boolean) {
    if (next) {
      setError(null);
      setForm(
        editing
          ? {
              organizationId: editing.organization_id,
              name: editing.name,
              callSign: editing.call_sign ?? '',
              resourceType: editing.resource_type,
              vehicleId: '',
            }
          : { ...EMPTY_FORM, organizationId: defaultOrgId ?? '' },
      );
    }
    onOpenChange(next);
  }

  function set(key: keyof ResourceFormState, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!form.name.trim())         { setError('Name is required.'); return; }
    if (!form.organizationId)      { setError('Organization is required.'); return; }
    if (!form.resourceType)        { setError('Resource type is required.'); return; }

    const body: CreateResourceBody = {
      organizationId: form.organizationId,
      name: form.name.trim(),
      resourceType: form.resourceType,
      ...(form.callSign.trim()  && { callSign: form.callSign.trim() }),
      ...(form.vehicleId.trim() && { vehicleId: form.vehicleId.trim() }),
    };

    try {
      if (editing) {
        await update.mutateAsync({ id: editing.id, body: { ...body } });
      } else {
        await create.mutateAsync(body);
      }
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit Resource' : 'Add Resource'}</DialogTitle>
          <DialogDescription>
            {editing ? 'Update resource details.' : 'Register a new unit or equipment in the fleet.'}
          </DialogDescription>
        </DialogHeader>

        <form id="resource-form" onSubmit={(e) => void handleSubmit(e)} className="space-y-4 py-2">
          {/* Organization */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-agap-textMain">
              Organization <span className="text-agap-danger">*</span>
            </label>
            <Select value={form.organizationId} onValueChange={(v) => set('organizationId', v)}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select organization" />
              </SelectTrigger>
              <SelectContent>
                {orgs.map((o) => (
                  <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Name + Call sign */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-agap-textMain">
                Name <span className="text-agap-danger">*</span>
              </label>
              <input
                value={form.name}
                onChange={(e) => set('name', e.target.value)}
                placeholder="e.g. Ambulance 1"
                className={inputCls}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-agap-textMain">Call Sign</label>
              <input
                value={form.callSign}
                onChange={(e) => set('callSign', e.target.value)}
                placeholder="e.g. ALPHA-1"
                className={inputCls}
              />
            </div>
          </div>

          {/* Type + Vehicle ID */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-agap-textMain">
                Type <span className="text-agap-danger">*</span>
              </label>
              <Select value={form.resourceType} onValueChange={(v) => set('resourceType', v)}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  {RESOURCE_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>{titleCase(t)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-agap-textMain">Vehicle / Asset ID</label>
              <input
                value={form.vehicleId}
                onChange={(e) => set('vehicleId', e.target.value)}
                placeholder="Plate / serial"
                className={inputCls}
              />
            </div>
          </div>

          {error && (
            <p className="rounded-xl bg-agap-dangerSoft px-4 py-2 text-sm text-agap-danger">{error}</p>
          )}
        </form>

        <DialogFooter>
          <Button variant="secondary" size="sm" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button variant="primary" size="sm" form="resource-form" type="submit" loading={pending}>
            {editing ? 'Save changes' : 'Add resource'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

interface ResourceRow {
  id: string;
  name: string;
  call_sign: string | null;
  resource_type: string;
  status: string;
  org_name: string;
  organization_id: string;
  capabilities: string[];
}

export default function ResourceRegistryPage(): JSX.Element {
  const user = useAuthUser();
  const canEdit = hasRole(user, 'ORG_ADMINISTRATOR', 'SYSTEM_ADMINISTRATOR');

  // ORG_ADMIN sees only their own org's resources
  const orgFilter = hasRole(user, 'ORG_ADMINISTRATOR') && !hasRole(user, 'SYSTEM_ADMINISTRATOR')
    ? user?.orgId
    : undefined;

  const { data: orgsData } = useOrganizations({ perPage: 200 });
  const orgs = orgsData?.data ?? [];

  const { data, isLoading, isError, refetch } = useResources({
    ...(orgFilter && { organization_id: orgFilter }),
    perPage: 200,
  });
  const resources = useMemo<Resource[]>(() => data?.data ?? [], [data]);

  const [search, setSearch] = useState('');
  const [orgId, setOrgId] = useState(ALL);
  const [typeFilter, setTypeFilter] = useState(ALL);
  const [statusFilter, setStatusFilter] = useState(ALL);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Resource | null>(null);

  const rows = useMemo<ResourceRow[]>(() => {
    const q = search.trim().toLowerCase();
    return resources
      .filter((r) => (orgId === ALL ? true : r.organization_id === orgId))
      .filter((r) => (typeFilter === ALL ? true : r.resource_type === typeFilter))
      .filter((r) => (statusFilter === ALL ? true : r.status === statusFilter))
      .filter((r) =>
        q
          ? r.name.toLowerCase().includes(q) ||
            (r.call_sign ?? '').toLowerCase().includes(q)
          : true,
      )
      .map((r) => ({
        id: r.id,
        name: r.name,
        call_sign: r.call_sign,
        resource_type: r.resource_type,
        status: r.status,
        org_name: r.organization?.name ?? '—',
        organization_id: r.organization_id,
        capabilities: r.capabilities ?? [],
      }));
  }, [resources, search, orgId, typeFilter, statusFilter]);

  function openCreate() {
    setEditing(null);
    setDialogOpen(true);
  }

  function openEdit(id: string) {
    setEditing(resources.find((r) => r.id === id) ?? null);
    setDialogOpen(true);
  }

  const columns: Column<ResourceRow>[] = [
    {
      key: 'name',
      header: 'Resource',
      accessor: (r) => {
        const Icon = resourceTypeIcon(r.resource_type);
        return (
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-agap-surface">
              <Icon size={15} className="text-agap-textMid" />
            </span>
            <div>
              <p className="font-semibold text-agap-textMain">{r.name}</p>
              {r.call_sign && (
                <p className="font-mono text-xs text-agap-textSub">{r.call_sign}</p>
              )}
            </div>
          </div>
        );
      },
    },
    {
      key: 'type',
      header: 'Type',
      accessor: (r) => (
        <span className="text-sm text-agap-textMid">{titleCase(r.resource_type)}</span>
      ),
    },
    {
      key: 'org',
      header: 'Organization',
      accessor: (r) => (
        <span className="text-sm text-agap-textMid">{r.org_name}</span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      accessor: (r) => (
        <span className={cn(
          'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold',
          resourceStatusClasses(r.status),
        )}>
          {titleCase(r.status)}
        </span>
      ),
    },
    {
      key: 'capabilities',
      header: 'Capabilities',
      accessor: (r) =>
        r.capabilities.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {r.capabilities.slice(0, 3).map((c) => (
              <span key={c} className="rounded-md bg-agap-surface px-1.5 py-0.5 text-[10px] font-semibold text-agap-textMid">
                {c}
              </span>
            ))}
            {r.capabilities.length > 3 && (
              <span className="text-xs text-agap-textSub">+{r.capabilities.length - 3}</span>
            )}
          </div>
        ) : (
          <span className="text-sm text-agap-textSub">—</span>
        ),
    },
    ...(canEdit ? [{
      key: 'actions',
      header: '',
      accessor: (r: ResourceRow) => {
        const isOwnOrg = r.organization_id === user?.orgId;
        const canEditThis = hasRole(user, 'SYSTEM_ADMINISTRATOR') || isOwnOrg;
        if (!canEditThis) return <span />;
        return (
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => { e.stopPropagation(); openEdit(r.id); }}
            aria-label={`Edit ${r.name}`}
          >
            <Pencil size={14} />
          </Button>
        );
      },
    }] : []),
  ];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-agap-textMain">Resource Registry</h1>
          <p className="mt-1 text-sm text-agap-textSub">
            {isLoading
              ? 'Loading…'
              : `${rows.length} resource${rows.length === 1 ? '' : 's'}${orgs.length > 0 ? ` across ${orgs.length} organization${orgs.length === 1 ? '' : 's'}` : ''}`}
          </p>
        </div>
        {canEdit && (
          <Button variant="primary" size="md" onClick={openCreate}>
            <Plus size={16} className="mr-1.5" /> Add Resource
          </Button>
        )}
      </div>

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

        {/* Org filter — only for roles that can see multiple orgs */}
        {!orgFilter && orgs.length > 0 && (
          <Select value={orgId} onValueChange={setOrgId}>
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
      </div>

      {/* Error */}
      {isError && (
        <div className="rounded-2xl border border-[rgba(212,72,88,0.22)] bg-agap-dangerSoft p-6 text-center">
          <p className="text-sm text-agap-danger">Could not load resources.</p>
          <Button variant="secondary" size="sm" className="mt-3" onClick={() => void refetch()}>Retry</Button>
        </div>
      )}

      {/* Table */}
      {!isError && (
        <DataTable
          columns={columns}
          data={rows}
          getRowKey={(r) => r.id}
          loading={isLoading}
          emptyTitle="No resources found"
          emptyDescription="Add a resource or adjust the filters above."
        />
      )}

      <ResourceFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editing={editing}
        defaultOrgId={user?.orgId}
      />
    </div>
  );
}

const inputCls =
  'h-10 w-full rounded-xl border border-[rgba(168,181,193,0.20)] bg-white px-3 text-sm text-agap-textMain shadow-tile placeholder:text-agap-textSub focus:outline-none focus:ring-2 focus:ring-agap-green';
