'use client';

import { useMemo, useState, type JSX } from 'react';
import {
  Package, Truck, Flame, Waves, Users, Search, Plus, Pencil, ShieldCheck, X, Lock, Info,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { DEPLOYED_RESOURCE_STATUSES, ResourceStatus, UNAVAILABLE_RESOURCE_STATUSES } from '@agap/shared';
import {
  Badge, Button, DataTable,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem, SelectGroup, SelectLabel,
  type Column,
} from '@/components/ui';
import { useAuthUser, hasRole } from '@/lib/use-auth';
import { titleCase } from '@/lib/incident-format';
import {
  useResources,
  useCreateResource,
  useUpdateResource,
  useCapabilityCatalog,
  useAddCapability,
  useRemoveCapability,
  useVerifyCapability,
} from '@/features/resources/hooks';
import { useOrganizations } from '@/features/organizations/hooks';
import type { Resource, CreateResourceBody, ResourceCapability } from '@/features/resources/api';
import { capabilityChipLabel, groupAddableCapabilities } from '@/features/resources/capabilities';
import { resourceStatusLabel } from '@/features/resources/status';
import { cn } from '@/lib/utils';

// ─── Constants ───────────────────────────────────────────────────────────────

const RESOURCE_TYPES = [
  'AMBULANCE', 'FIRE_TRUCK', 'RESCUE_BOAT', 'RESCUE_VEHICLE',
  'FLOOD_RESPONSE_UNIT', 'SEARCH_AND_RESCUE_UNIT', 'PERSONNEL', 'EQUIPMENT', 'OTHER',
] as const;

// Exactly the database's resource_status values (shared enum).
const RESOURCE_STATUSES = Object.values(ResourceStatus);

const ALL = 'ALL';

// 44 px controls; the border keeps 3:1 contrast on white (same as SelectTrigger).
const inputCls =
  'h-11 w-full rounded-xl border border-agap-textSub bg-white px-3 text-sm text-agap-textMain shadow-sm placeholder:text-slate-500 hover:border-agap-textMid focus:outline-none focus-visible:border-agap-green focus-visible:ring-2 focus-visible:ring-agap-green/30 aria-[invalid=true]:border-agap-danger';

const labelCls = 'block text-sm font-medium text-agap-textMain';
const filterLabelCls = 'block text-xs font-semibold text-agap-textMid';

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
    case 'TRANSPORTING':   return 'bg-indigo-50 text-indigo-700';
    case 'RETURNING':      return 'bg-sky-50 text-sky-700';
    case 'RESERVED':       return 'bg-agap-amberSoft text-agap-amber';
    case 'OUT_OF_SERVICE': return 'bg-agap-dangerSoft text-agap-danger';
    default:               return 'bg-agap-surface text-agap-textMid';
  }
}

function FieldError({ id, message }: { id: string; message: string | undefined }): JSX.Element | null {
  if (!message) return null;
  return <p id={id} className="text-xs font-medium text-agap-danger">{message}</p>;
}

// ─── Form ────────────────────────────────────────────────────────────────────

interface ResourceFormState {
  organizationId: string;
  name: string;
  callSign: string;
  resourceType: string;
  vehicleId: string;
}

type RequiredField = 'organizationId' | 'name' | 'resourceType';

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
  // Each required field shows its own message under it; a server error shows at the bottom.
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<RequiredField, string>>>({});
  const [error, setError] = useState<string | null>(null);

  const user = useAuthUser();
  const { data: orgsData } = useOrganizations({ perPage: 200 });
  // The server only accepts the Org Administrator's own organization (org-scope.ts).
  const orgs = (orgsData?.data ?? []).filter(
    (o) => !hasRole(user, 'ORG_ADMINISTRATOR') || o.id === user?.orgId,
  );

  const create = useCreateResource();
  const update = useUpdateResource();
  const pending = create.isPending || update.isPending;

  function handleOpen(next: boolean) {
    if (next) {
      setError(null);
      setFieldErrors({});
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
    if (key in fieldErrors) setFieldErrors((e) => ({ ...e, [key]: undefined }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const missing: Partial<Record<RequiredField, string>> = {};
    if (!form.organizationId) missing.organizationId = 'Choose the organization that owns this unit.';
    if (!form.name.trim())    missing.name = 'Enter a name, for example "Ambulance 1".';
    if (!form.resourceType)   missing.resourceType = 'Choose the unit type.';
    setFieldErrors(missing);
    if (Object.keys(missing).length > 0) return;

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

        <form id="resource-form" noValidate onSubmit={(e) => void handleSubmit(e)} className="space-y-4 py-2">
          {/* Organization */}
          <div className="space-y-1.5">
            <label id="resource-org-label" className={labelCls}>
              Organization <span className="text-agap-danger" aria-hidden="true">*</span>
            </label>
            {/* A unit's organization can't be changed after creation (the API ignores it). */}
            <Select value={form.organizationId} onValueChange={(v) => set('organizationId', v)} disabled={!!editing}>
              <SelectTrigger
                aria-labelledby="resource-org-label"
                aria-invalid={!!fieldErrors.organizationId}
                aria-describedby={fieldErrors.organizationId ? 'resource-org-error' : 'resource-org-help'}
                className={cn(fieldErrors.organizationId && 'border-agap-danger')}
              >
                <SelectValue placeholder="Select organization" />
              </SelectTrigger>
              <SelectContent>
                {orgs.map((o) => (
                  <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {fieldErrors.organizationId ? (
              <FieldError id="resource-org-error" message={fieldErrors.organizationId} />
            ) : (
              <p id="resource-org-help" className="text-xs text-slate-500">
                {editing ? "A unit's organization can't be changed." : 'You can only register units for organizations you manage.'}
              </p>
            )}
          </div>

          {/* Name + Call sign */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label htmlFor="resource-name" className={labelCls}>
                Name <span className="text-agap-danger" aria-hidden="true">*</span>
              </label>
              <input
                id="resource-name"
                value={form.name}
                onChange={(e) => set('name', e.target.value)}
                placeholder="e.g. Ambulance 1"
                aria-required="true"
                aria-invalid={!!fieldErrors.name}
                aria-describedby={fieldErrors.name ? 'resource-name-error' : undefined}
                className={inputCls}
              />
              <FieldError id="resource-name-error" message={fieldErrors.name} />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="resource-callsign" className={labelCls}>Call sign</label>
              <input
                id="resource-callsign"
                value={form.callSign}
                onChange={(e) => set('callSign', e.target.value)}
                placeholder="e.g. ALPHA-1"
                className={cn(inputCls, 'font-mono uppercase placeholder:normal-case placeholder:font-sans')}
              />
            </div>
          </div>

          {/* Type + Vehicle ID */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label id="resource-type-label" className={labelCls}>
                Type <span className="text-agap-danger" aria-hidden="true">*</span>
              </label>
              <Select value={form.resourceType} onValueChange={(v) => set('resourceType', v)}>
                <SelectTrigger
                  aria-labelledby="resource-type-label"
                  aria-invalid={!!fieldErrors.resourceType}
                  aria-describedby={fieldErrors.resourceType ? 'resource-type-error' : undefined}
                  className={cn(fieldErrors.resourceType && 'border-agap-danger')}
                >
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  {RESOURCE_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>{titleCase(t)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldError id="resource-type-error" message={fieldErrors.resourceType} />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="resource-vehicle" className={labelCls}>Vehicle / asset ID</label>
              <input
                id="resource-vehicle"
                value={form.vehicleId}
                onChange={(e) => set('vehicleId', e.target.value)}
                placeholder="Plate or serial number"
                className={inputCls}
              />
            </div>
          </div>

          {error && (
            <p role="alert" className="rounded-xl bg-agap-dangerSoft px-4 py-2.5 text-sm text-agap-danger">{error}</p>
          )}
        </form>

        <DialogFooter>
          <Button variant="secondary" className="h-11" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button variant="primary" className="h-11" form="resource-form" type="submit" loading={pending}>
            {editing ? 'Save changes' : 'Add resource'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Capabilities (MOD-29) ────────────────────────────────────────────────────

/** Verified: filled. Unverified: outlined and labelled, since the recommender ignores it. */
function CapabilityChip({ capability }: { capability: ResourceCapability }): JSX.Element {
  return (
    <span
      className={cn(
        'whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-semibold',
        capability.is_verified
          ? 'bg-agap-surface text-agap-textMid'
          : 'border border-dashed border-agap-amber/70 bg-white text-agap-amber',
      )}
    >
      {capabilityChipLabel(capability)}
    </span>
  );
}

interface CapabilitiesDialogProps {
  resource: Resource | null;
  onOpenChange: (open: boolean) => void;
  canManage: boolean;
  canVerify: boolean;
}

function CapabilitiesDialog({ resource, onOpenChange, canManage, canVerify }: CapabilitiesDialogProps): JSX.Element {
  const [selected, setSelected] = useState('');
  const [error, setError] = useState<string | null>(null);
  const { data: catalog = [], isLoading: catalogLoading } = useCapabilityCatalog({ enabled: !!resource && canManage });
  const add = useAddCapability();
  const remove = useRemoveCapability();
  const verify = useVerifyCapability();

  const capabilities = resource?.capabilities ?? [];
  const addable = groupAddableCapabilities(catalog, capabilities);
  const unitLabel = resource ? resource.call_sign ?? resource.name : '';

  async function run(action: () => Promise<unknown>) {
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    }
  }

  function handleOpen(next: boolean) {
    if (!next) {
      setSelected('');
      setError(null);
    }
    onOpenChange(next);
  }

  return (
    <Dialog open={!!resource} onOpenChange={handleOpen}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Capabilities · {unitLabel}</DialogTitle>
          <DialogDescription>
            Dispatch recommendations count verified capabilities only. A Supervisor or System Administrator verifies them.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {capabilities.length === 0 ? (
            <p className="rounded-xl border border-dashed border-agap-track px-4 py-3 text-sm text-slate-600">
              No capabilities recorded for this unit yet.
            </p>
          ) : (
            <ul className="divide-y divide-agap-track/60 rounded-xl border border-agap-track">
              {capabilities.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="text-sm font-semibold text-agap-textMain">{titleCase(c.name)}</span>
                    <Badge variant={c.is_verified ? 'green' : 'amber'}>{c.is_verified ? 'Verified' : 'Unverified'}</Badge>
                  </div>
                  <div className="flex items-center gap-1">
                    {canVerify && (
                      <Button
                        variant="secondary"
                        className="h-11"
                        loading={verify.isPending && verify.variables?.capabilityId === c.id}
                        onClick={() => void run(() => verify.mutateAsync({ resourceId: resource!.id, capabilityId: c.id, verified: !c.is_verified }))}
                      >
                        {c.is_verified ? 'Unverify' : 'Verify'}
                      </Button>
                    )}
                    {canManage && (
                      <Button
                        variant="ghost"
                        className="h-11 w-11 px-0"
                        aria-label={`Remove ${titleCase(c.name)}`}
                        title={`Remove ${titleCase(c.name)}`}
                        loading={remove.isPending && remove.variables?.capabilityId === c.id}
                        onClick={() => void run(() => remove.mutateAsync({ resourceId: resource!.id, capabilityId: c.id }))}
                      >
                        <X size={16} aria-hidden="true" />
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}

          {canManage && (
            <div className="space-y-1.5">
              <label id="capability-add-label" className={labelCls}>Add a capability</label>
              <div className="flex gap-2">
                <Select value={selected} onValueChange={setSelected} disabled={catalogLoading || addable.length === 0}>
                  <SelectTrigger aria-labelledby="capability-add-label" aria-describedby="capability-add-help">
                    <SelectValue
                      placeholder={
                        catalogLoading ? 'Loading capabilities…'
                        : addable.length === 0 ? 'Every capability is assigned'
                        : 'Select capability'
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {addable.map((group) => (
                      <SelectGroup key={group.category}>
                        <SelectLabel>{titleCase(group.category)}</SelectLabel>
                        {group.items.map((item) => (
                          <SelectItem key={item.id} value={item.id}>{titleCase(item.name)}</SelectItem>
                        ))}
                      </SelectGroup>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  variant="primary"
                  className="h-11 shrink-0"
                  disabled={!selected}
                  loading={add.isPending}
                  onClick={() =>
                    void run(async () => {
                      await add.mutateAsync({ resourceId: resource!.id, capabilityId: selected });
                      setSelected('');
                    })
                  }
                >
                  <Plus size={16} aria-hidden="true" /> Add
                </Button>
              </div>
              <p id="capability-add-help" className="text-xs text-slate-500">New capabilities start unverified.</p>
            </div>
          )}

          {error && (
            <p role="alert" className="rounded-xl bg-agap-dangerSoft px-4 py-2.5 text-sm text-agap-danger">{error}</p>
          )}
        </div>

        <DialogFooter>
          <Button variant="secondary" className="h-11" onClick={() => handleOpen(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Summary ─────────────────────────────────────────────────────────────────

interface SummaryTile {
  label: string;
  value: number;
  detail: string;
  tone: string;
}

function SummaryTiles({ tiles, scope }: { tiles: SummaryTile[]; scope: string }): JSX.Element {
  return (
    <section aria-label={`Unit summary for ${scope}`}>
      <dl className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-xl border border-agap-track bg-white p-4 shadow-card">
            <dt className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-600">
              <span aria-hidden="true" className={cn('h-2 w-2 shrink-0 rounded-full', t.tone)} />
              {t.label}
            </dt>
            <dd className="mt-2 text-2xl font-bold tabular-nums text-agap-textMain">{t.value}</dd>
            <dd className="mt-0.5 text-xs text-slate-600">{t.detail}</dd>
          </div>
        ))}
      </dl>
    </section>
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
  capabilities: ResourceCapability[];
}

export function RegistryTab(): JSX.Element {
  const user = useAuthUser();
  const canEdit = hasRole(user, 'ORG_ADMINISTRATOR', 'SYSTEM_ADMINISTRATOR');
  // MOD-29: the organization claims a capability; a Supervisor or System Administrator verifies it.
  const canVerify = hasRole(user, 'SUPERVISOR', 'SYSTEM_ADMINISTRATOR');
  const isOrgAdmin = hasRole(user, 'ORG_ADMINISTRATOR');

  // Org Administrator: reads every organization's units, edits its own (decision D6).
  // The list opens on its own organization; the server enforces the edit rule.
  const ownOrgDefault = isOrgAdmin ? user?.orgId : undefined;

  const { data: orgsData } = useOrganizations({ perPage: 200 });
  const orgs = orgsData?.data ?? [];
  const ownOrgName = orgs.find((o) => o.id === user?.orgId)?.name;

  const { data, isLoading, isError, refetch } = useResources({ perPage: 200 });
  const resources = useMemo<Resource[]>(() => data?.data ?? [], [data]);

  const [search, setSearch] = useState('');
  const [orgId, setOrgId] = useState(ownOrgDefault ?? ALL);
  const [typeFilter, setTypeFilter] = useState(ALL);
  const [statusFilter, setStatusFilter] = useState(ALL);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Resource | null>(null);
  // By id, so the dialog re-reads the unit after each change refetches the list.
  const [capabilitiesId, setCapabilitiesId] = useState<string | null>(null);
  const capabilitiesUnit = resources.find((r) => r.id === capabilitiesId) ?? null;

  // The summary follows the organization filter only, so it doesn't jump while typing a search.
  const inScope = useMemo(
    () => resources.filter((r) => (orgId === ALL ? true : r.organization_id === orgId)),
    [resources, orgId],
  );

  const rows = useMemo<ResourceRow[]>(() => {
    const q = search.trim().toLowerCase();
    return inScope
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
  }, [inScope, search, typeFilter, statusFilter]);

  const scopeName = orgId === ALL ? 'all organizations' : orgs.find((o) => o.id === orgId)?.name ?? 'this organization';
  const countIn = (statuses: readonly string[]) => inScope.filter((r) => statuses.includes(r.status)).length;
  const unverified = inScope.reduce((n, r) => n + (r.capabilities ?? []).filter((c) => !c.is_verified).length, 0);
  const tiles: SummaryTile[] = [
    { label: 'Units', value: inScope.length, detail: `Registered in ${scopeName}`, tone: 'bg-agap-textMid' },
    { label: 'Available', value: countIn([ResourceStatus.AVAILABLE]), detail: 'Ready to dispatch', tone: 'bg-agap-green' },
    { label: 'Deployed', value: countIn(DEPLOYED_RESOURCE_STATUSES), detail: 'On an incident', tone: 'bg-amber-500' },
    { label: 'Unavailable', value: countIn(UNAVAILABLE_RESOURCE_STATUSES), detail: 'Out of service or offline', tone: 'bg-red-500' },
    {
      label: 'Unverified',
      value: unverified,
      detail: unverified === 0 ? 'All capabilities verified' : 'Capabilities awaiting a Supervisor',
      tone: unverified === 0 ? 'bg-agap-green' : 'bg-agap-amber',
    },
  ];

  const filtersOn =
    search.trim() !== '' || orgId !== (ownOrgDefault ?? ALL) || typeFilter !== ALL || statusFilter !== ALL;

  function clearFilters() {
    setSearch('');
    setOrgId(ownOrgDefault ?? ALL);
    setTypeFilter(ALL);
    setStatusFilter(ALL);
  }

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
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-agap-surface">
              <Icon size={16} aria-hidden="true" className="text-agap-textMid" />
            </span>
            <div className="min-w-0">
              <p className="truncate font-semibold text-agap-textMain">{r.name}</p>
              {r.call_sign && (
                <p className="font-mono text-xs text-slate-600">{r.call_sign}</p>
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
        <span className="whitespace-nowrap text-sm text-agap-textMid">{titleCase(r.resource_type)}</span>
      ),
    },
    {
      key: 'org',
      header: 'Organization',
      accessor: (r) => (
        <span className="flex flex-wrap items-center gap-1.5 text-sm text-agap-textMid">
          {r.org_name}
          {isOrgAdmin && r.organization_id === user?.orgId && (
            <span className="rounded-full bg-agap-greenSoft px-2 py-0.5 text-[11px] font-semibold text-agap-green">Yours</span>
          )}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      accessor: (r) => (
        <span className={cn(
          'inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold',
          resourceStatusClasses(r.status),
        )}>
          {resourceStatusLabel(r.status)}
        </span>
      ),
    },
    {
      key: 'capabilities',
      header: 'Capabilities',
      accessor: (r) =>
        r.capabilities.length > 0 ? (
          <div className="flex max-w-xs flex-wrap gap-1">
            {r.capabilities.slice(0, 3).map((c) => (
              <CapabilityChip key={c.id} capability={c} />
            ))}
            {r.capabilities.length > 3 && (
              <span className="self-center text-xs font-medium text-slate-600">+{r.capabilities.length - 3} more</span>
            )}
          </div>
        ) : (
          <span className="text-sm text-slate-500">None recorded</span>
        ),
    },
    ...(canEdit || canVerify ? [{
      key: 'actions',
      header: 'Actions',
      headerClassName: 'text-right',
      accessor: (r: ResourceRow) => {
        const isOwnOrg = r.organization_id === user?.orgId;
        const canEditThis = hasRole(user, 'SYSTEM_ADMINISTRATOR') || (canEdit && isOwnOrg);
        if (!canEditThis && !canVerify) {
          return (
            <span className="flex items-center justify-end gap-1.5 whitespace-nowrap text-xs text-slate-600">
              <Lock size={13} aria-hidden="true" /> View only
            </span>
          );
        }
        return (
          <div className="flex items-center justify-end gap-1">
            <Button
              variant="ghost"
              className="h-11 w-11 px-0"
              onClick={(e) => { e.stopPropagation(); setCapabilitiesId(r.id); }}
              aria-label={`Capabilities of ${r.name}`}
              title="Capabilities"
            >
              <ShieldCheck size={17} aria-hidden="true" />
            </Button>
            {canEditThis && (
              <Button
                variant="ghost"
                className="h-11 w-11 px-0"
                onClick={(e) => { e.stopPropagation(); openEdit(r.id); }}
                aria-label={`Edit ${r.name}`}
                title="Edit"
              >
                <Pencil size={16} aria-hidden="true" />
              </Button>
            )}
          </div>
        );
      },
    }] : []),
  ];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
        <div className="min-w-0">
          <h2 className="text-lg font-bold text-agap-textMain">Resource Registry</h2>
          <p className="mt-1 text-sm text-slate-600">
            {isLoading
              ? 'Loading units…'
              : `${rows.length} of ${inScope.length} unit${inScope.length === 1 ? '' : 's'} shown · ${scopeName}`}
          </p>
        </div>
        {canEdit && (
          <Button variant="primary" className="h-11 w-full sm:w-auto" onClick={openCreate}>
            <Plus size={16} aria-hidden="true" /> Add resource
          </Button>
        )}
      </div>

      {/* What an Org Administrator can change here */}
      {isOrgAdmin && (
        <p className="flex items-start gap-2.5 rounded-xl border border-agap-info/20 bg-agap-infoSoft px-4 py-3 text-sm text-agap-textMid">
          <Info size={16} aria-hidden="true" className="mt-0.5 shrink-0 text-agap-info" />
          <span>
            You can add, edit and claim capabilities for <strong className="font-semibold text-agap-textMain">{ownOrgName ?? 'your organization'}</strong>&apos;s
            units. Other organizations&apos; units are view-only, and a Supervisor verifies new capabilities.
          </span>
        </p>
      )}

      {/* Summary for the selected organization */}
      {!isError && !isLoading && <SummaryTiles tiles={tiles} scope={scopeName} />}

      {/* Filters */}
      <section aria-label="Filter units" className="rounded-xl border border-agap-track bg-white p-4 shadow-card">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.5fr)_repeat(3,minmax(0,1fr))]">
          <div className="space-y-1.5">
            <label htmlFor="registry-search" className={filterLabelCls}>Search</label>
            <div className="relative">
              <Search size={16} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                id="registry-search"
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Name or call sign"
                className={cn(inputCls, 'pl-9')}
              />
            </div>
          </div>

          {orgs.length > 0 && (
            <div className="space-y-1.5">
              <label id="registry-org-label" className={filterLabelCls}>Organization</label>
              <Select value={orgId} onValueChange={setOrgId}>
                <SelectTrigger aria-labelledby="registry-org-label"><SelectValue placeholder="All organizations" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All organizations</SelectItem>
                  {orgs.map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.name}{isOrgAdmin && o.id === user?.orgId ? ' (yours)' : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-1.5">
            <label id="registry-type-label" className={filterLabelCls}>Type</label>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger aria-labelledby="registry-type-label"><SelectValue placeholder="All types" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All types</SelectItem>
                {RESOURCE_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>{titleCase(t)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <label id="registry-status-label" className={filterLabelCls}>Status</label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger aria-labelledby="registry-status-label"><SelectValue placeholder="All statuses" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All statuses</SelectItem>
                {RESOURCE_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>{resourceStatusLabel(s)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {filtersOn && (
          <div className="mt-3 flex items-center justify-between gap-3 border-t border-agap-track/60 pt-3">
            <p className="text-xs text-slate-600" role="status">
              {rows.length} matching unit{rows.length === 1 ? '' : 's'}
            </p>
            <Button variant="ghost" className="h-11" onClick={clearFilters}>
              <X size={15} aria-hidden="true" /> Clear filters
            </Button>
          </div>
        )}
      </section>

      {/* Error */}
      {isError && (
        <div role="alert" className="rounded-xl border border-agap-danger/25 bg-agap-dangerSoft p-6 text-center">
          <p className="text-sm text-agap-danger">Could not load resources.</p>
          <Button variant="secondary" className="mt-3 h-11" onClick={() => void refetch()}>Retry</Button>
        </div>
      )}

      {/* Table */}
      {!isError && (
        <DataTable
          columns={columns}
          data={rows}
          getRowKey={(r) => r.id}
          loading={isLoading}
          emptyTitle={filtersOn ? 'No units match these filters' : 'No units registered yet'}
          emptyDescription={
            filtersOn
              ? 'Clear the filters or try another search.'
              : canEdit ? 'Use "Add resource" to register the first unit.' : undefined
          }
        />
      )}

      <ResourceFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editing={editing}
        defaultOrgId={user?.orgId}
      />

      <CapabilitiesDialog
        resource={capabilitiesUnit}
        onOpenChange={(open) => { if (!open) setCapabilitiesId(null); }}
        canManage={
          !!capabilitiesUnit &&
          (hasRole(user, 'SYSTEM_ADMINISTRATOR') ||
            (isOrgAdmin && capabilitiesUnit.organization_id === user?.orgId))
        }
        canVerify={canVerify}
      />
    </div>
  );
}
