'use client';

import { useMemo, useRef, useState, type JSX } from 'react';
import {
  Search, Plus, Pencil, ShieldCheck, X, Lock, Info, Building2, Check, CheckCircle2, Loader2,
} from 'lucide-react';
import { DEPLOYED_RESOURCE_STATUSES, ResourceStatus, UNAVAILABLE_RESOURCE_STATUSES } from '@agap/shared';
import {
  Badge, Button, DataTable,
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
  useCapabilityCatalog,
  useAddCapability,
  useRemoveCapability,
  useVerifyCapability,
} from '@/features/resources/hooks';
import { useOrganizations } from '@/features/organizations/hooks';
import type { Resource, ResourceCapability } from '@/features/resources/api';
import { capabilityChipLabel, groupAddableCapabilities } from '@/features/resources/capabilities';
import { resourceStatusLabel } from '@/features/resources/status';
import { RESOURCE_TYPES, resourceTypeHint, resourceTypeLabel } from '@/features/resources/resource-type';
import {
  resourceCreateBody,
  resourceFormFor,
  resourceUpdateBody,
  validateResourceForm,
  type ResourceFormErrors,
  type ResourceFormState,
} from '@/features/resources/resource-form';
import { resourceTypeIcon } from './resource-type-icon';
import { cn } from '@/lib/utils';

// ─── Constants ───────────────────────────────────────────────────────────────

// Exactly the database's resource_status values (shared enum).
const RESOURCE_STATUSES = Object.values(ResourceStatus);

const ALL = 'ALL';

// 44 px controls; the border keeps 3:1 contrast on white (same as SelectTrigger).
const inputCls =
  'h-11 w-full rounded-xl border border-agap-textSub bg-white px-3 text-sm text-agap-textMain shadow-sm placeholder:text-slate-500 hover:border-agap-textMid focus:outline-none focus-visible:border-agap-green focus-visible:ring-2 focus-visible:ring-agap-green/30 aria-[invalid=true]:border-agap-danger';

const labelCls = 'block text-sm font-medium text-agap-textMain';
const filterLabelCls = 'block text-xs font-semibold text-agap-textMid';
const helpCls = 'text-xs text-slate-600';

// ─── Helpers ─────────────────────────────────────────────────────────────────

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

/** A value the user can see but not change here, in place of a disabled dropdown. */
function ReadOnlyField({ labelId, value, help }: { labelId: string; value: string; help: string }): JSX.Element {
  return (
    <>
      <div
        role="group"
        aria-labelledby={labelId}
        className="flex min-h-11 items-center gap-3 rounded-xl border border-agap-track bg-agap-surface px-3 py-2"
      >
        <Building2 size={16} aria-hidden="true" className="shrink-0 text-agap-textMid" />
        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-agap-textMain">{value}</span>
        <Lock size={14} aria-hidden="true" className="shrink-0 text-slate-500" />
      </div>
      <p className={helpCls}>{help}</p>
    </>
  );
}

// ─── Form ────────────────────────────────────────────────────────────────────

interface ResourceFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: Resource | null;
  defaultOrgId?: string | undefined;
  onSaved: (message: string) => void;
}

/**
 * The parent remounts this dialog (a new key) every time it opens, so the form starts
 * from the unit being edited. Radix never calls onOpenChange(true) for a dialog its
 * parent opens, and filling the form there left Edit blank with the organization locked.
 */
function ResourceFormDialog({ open, onOpenChange, editing, defaultOrgId, onSaved }: ResourceFormDialogProps): JSX.Element {
  const [form, setForm] = useState<ResourceFormState>(() => resourceFormFor(editing, defaultOrgId));
  // Each required field shows its own message under it; a server error shows at the bottom.
  const [fieldErrors, setFieldErrors] = useState<ResourceFormErrors>({});
  const [error, setError] = useState<string | null>(null);
  const orgTriggerRef = useRef<HTMLButtonElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const typeGroupRef = useRef<HTMLFieldSetElement>(null);

  const user = useAuthUser();
  const isSysAdmin = hasRole(user, 'SYSTEM_ADMINISTRATOR');
  const { data: orgsData } = useOrganizations({ perPage: 200 });
  const allOrgs = orgsData?.data ?? [];
  // The server only accepts the Org Administrator's own organization (org-scope.ts).
  const orgs = isSysAdmin ? allOrgs : allOrgs.filter((o) => o.id === user?.orgId);
  // Fixed when editing (a unit can't move) and for an Org Administrator (own organization only).
  const orgLocked = !!editing || !isSysAdmin;
  const orgName =
    allOrgs.find((o) => o.id === form.organizationId)?.name ??
    editing?.organization?.name ??
    'Your organization';

  const create = useCreateResource();
  const update = useUpdateResource();
  const pending = create.isPending || update.isPending;

  function set<K extends keyof ResourceFormState>(key: K, value: ResourceFormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    setFieldErrors((e) => (e[key as keyof ResourceFormErrors] ? { ...e, [key]: undefined } : e));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const missing = validateResourceForm(form);
    setFieldErrors(missing);
    // Move focus to the first field that needs attention.
    if (missing.organizationId) { orgTriggerRef.current?.focus(); return; }
    if (missing.resourceType)   { typeGroupRef.current?.querySelector('input')?.focus(); return; }
    if (missing.name)           { nameRef.current?.focus(); return; }

    try {
      if (editing) {
        await update.mutateAsync({ id: editing.id, body: resourceUpdateBody(form) });
        onSaved(`Saved changes to ${form.name.trim()}.`);
      } else {
        await create.mutateAsync(resourceCreateBody(form));
        onSaved(`${form.name.trim()} was added to ${orgName}.`);
      }
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Try again.');
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!pending) onOpenChange(next); }}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{editing ? `Edit ${editing.call_sign ?? editing.name}` : 'Add resource'}</DialogTitle>
          <DialogDescription className="text-slate-600">
            {editing
              ? 'Change the unit’s name, call sign or type. Status is set on the Fleet board.'
              : 'Register a unit so dispatchers can see it and assign it to incidents.'}
          </DialogDescription>
        </DialogHeader>

        <form id="resource-form" noValidate onSubmit={(e) => void handleSubmit(e)} className="space-y-5">
          {/* Organization */}
          <div className="space-y-1.5">
            <span id="resource-org-label" className={labelCls}>
              Organization {!orgLocked && <span className="text-agap-danger" aria-hidden="true">*</span>}
            </span>
            {orgLocked ? (
              <ReadOnlyField
                labelId="resource-org-label"
                value={orgName}
                help={
                  editing
                    ? 'A unit stays with the organization that registered it.'
                    : 'You register units for your own organization.'
                }
              />
            ) : (
              <>
                <Select value={form.organizationId} onValueChange={(v) => set('organizationId', v)}>
                  <SelectTrigger
                    ref={orgTriggerRef}
                    aria-labelledby="resource-org-label"
                    aria-invalid={!!fieldErrors.organizationId}
                    aria-describedby={fieldErrors.organizationId ? 'resource-org-error' : undefined}
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
                <FieldError id="resource-org-error" message={fieldErrors.organizationId} />
              </>
            )}
          </div>

          {/* Type: every option visible, one tap to choose */}
          <fieldset
            ref={typeGroupRef}
            className="min-w-0 space-y-1.5"
            aria-describedby={fieldErrors.resourceType ? 'resource-type-error' : undefined}
          >
            <legend className={labelCls}>
              Type <span className="text-agap-danger" aria-hidden="true">*</span>
            </legend>
            <div className="grid grid-cols-1 gap-2 pt-1.5 min-[440px]:grid-cols-2">
              {RESOURCE_TYPES.map((type) => {
                const Icon = resourceTypeIcon(type);
                const checked = form.resourceType === type;
                return (
                  <label
                    key={type}
                    className={cn(
                      'flex min-h-14 cursor-pointer items-center gap-3 rounded-xl border px-3 py-2',
                      'transition-colors duration-150 motion-reduce:transition-none',
                      'has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-agap-green has-[:focus-visible]:ring-offset-1',
                      checked
                        ? 'border-agap-green bg-agap-greenSoft'
                        : fieldErrors.resourceType
                          ? 'border-agap-danger/60 bg-white hover:border-agap-danger'
                          : 'border-agap-track bg-white hover:border-agap-textMid',
                    )}
                  >
                    <input
                      type="radio"
                      name="resource-type"
                      value={type}
                      checked={checked}
                      onChange={() => set('resourceType', type)}
                      className="sr-only"
                    />
                    <span
                      aria-hidden="true"
                      className={cn(
                        'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
                        checked ? 'bg-agap-green text-white' : 'bg-agap-surface text-agap-textMid',
                      )}
                    >
                      <Icon size={17} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-agap-textMain">{resourceTypeLabel(type)}</span>
                      <span className="block text-xs text-slate-600">{resourceTypeHint(type)}</span>
                    </span>
                    {checked && <Check size={16} aria-hidden="true" className="shrink-0 text-agap-green" />}
                  </label>
                );
              })}
            </div>
            <FieldError id="resource-type-error" message={fieldErrors.resourceType} />
          </fieldset>

          {/* Name + Call sign */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label htmlFor="resource-name" className={labelCls}>
                Name <span className="text-agap-danger" aria-hidden="true">*</span>
              </label>
              <input
                ref={nameRef}
                id="resource-name"
                value={form.name}
                onChange={(e) => set('name', e.target.value)}
                placeholder="e.g. Ambulance 3"
                autoComplete="off"
                aria-required="true"
                aria-invalid={!!fieldErrors.name}
                aria-describedby={fieldErrors.name ? 'resource-name-error' : undefined}
                className={inputCls}
              />
              <FieldError id="resource-name-error" message={fieldErrors.name} />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="resource-callsign" className={labelCls}>
                Call sign <span className="font-normal text-slate-600">(optional)</span>
              </label>
              <input
                id="resource-callsign"
                value={form.callSign}
                onChange={(e) => set('callSign', e.target.value.toUpperCase())}
                placeholder="e.g. ALPHA-3"
                autoComplete="off"
                maxLength={50}
                aria-describedby="resource-callsign-help"
                className={cn(inputCls, 'font-mono placeholder:font-sans')}
              />
              <p id="resource-callsign-help" className={helpCls}>Shown on the dispatch board and the crew’s phone.</p>
            </div>
          </div>

          {error && (
            <p role="alert" className="rounded-xl border border-agap-danger/25 bg-agap-dangerSoft px-4 py-2.5 text-sm text-agap-danger">
              {error}
            </p>
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
  const [error, setError] = useState<string | null>(null);
  const catalogQuery = useCapabilityCatalog({ enabled: !!resource });
  const catalog = catalogQuery.data ?? [];
  const add = useAddCapability();
  const remove = useRemoveCapability();
  const verify = useVerifyCapability();

  const capabilities = resource?.capabilities ?? [];
  const addable = groupAddableCapabilities(catalog, capabilities);
  const descriptionOf = new Map(catalog.map((c) => [c.id, c.description]));
  const unitLabel = resource ? resource.call_sign ?? resource.name : '';
  const busy = add.isPending || remove.isPending || verify.isPending;

  async function run(action: () => Promise<unknown>) {
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Try again.');
    }
  }

  function handleOpen(next: boolean) {
    if (!next) setError(null);
    onOpenChange(next);
  }

  return (
    <Dialog open={!!resource} onOpenChange={handleOpen}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Capabilities · {unitLabel}</DialogTitle>
          <DialogDescription className="text-slate-600">
            Dispatch recommendations count verified capabilities only. A Supervisor or System Administrator verifies them.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {/* Assigned */}
          <section aria-labelledby="capabilities-assigned" className="space-y-2">
            <h3 id="capabilities-assigned" className="text-sm font-semibold text-agap-textMain">
              Assigned <span className="font-normal text-slate-600">({capabilities.length})</span>
            </h3>
            {capabilities.length === 0 ? (
              <p className="rounded-xl border border-dashed border-agap-track px-4 py-3 text-sm text-slate-600">
                No capabilities recorded for this unit yet.
              </p>
            ) : (
              <ul className="divide-y divide-agap-track/60 rounded-xl border border-agap-track">
                {capabilities.map((c) => {
                  const description = descriptionOf.get(c.id);
                  return (
                    <li key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-semibold text-agap-textMain">{titleCase(c.name)}</span>
                          <Badge variant={c.is_verified ? 'green' : 'amber'}>{c.is_verified ? 'Verified' : 'Unverified'}</Badge>
                        </div>
                        {description && <p className="mt-0.5 text-xs text-slate-600">{description}</p>}
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        {canVerify && (
                          <Button
                            variant={c.is_verified ? 'secondary' : 'outline'}
                            className="h-11"
                            disabled={busy}
                            loading={verify.isPending && verify.variables?.capabilityId === c.id}
                            onClick={() => void run(() => verify.mutateAsync({ resourceId: resource!.id, capabilityId: c.id, verified: !c.is_verified }))}
                          >
                            {c.is_verified ? 'Unverify' : 'Verify'}
                          </Button>
                        )}
                        {canManage && (
                          <Button
                            variant="ghost"
                            className="h-11 w-11 px-0 hover:text-agap-danger"
                            aria-label={`Remove ${titleCase(c.name)}`}
                            title={`Remove ${titleCase(c.name)}`}
                            disabled={busy}
                            loading={remove.isPending && remove.variables?.capabilityId === c.id}
                            onClick={() => void run(() => remove.mutateAsync({ resourceId: resource!.id, capabilityId: c.id }))}
                          >
                            <X size={16} aria-hidden="true" />
                          </Button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* Add: every addable capability is a button, grouped by category (no dropdown) */}
          {canManage && (
            <section aria-labelledby="capabilities-add" className="space-y-2">
              <div>
                <h3 id="capabilities-add" className="text-sm font-semibold text-agap-textMain">Add a capability</h3>
                <p className={helpCls}>Tap one to add it. New capabilities start unverified.</p>
              </div>

              {catalogQuery.isLoading ? (
                <p role="status" className="flex items-center gap-2 text-sm text-slate-600">
                  <Loader2 size={15} aria-hidden="true" className="animate-spin motion-reduce:animate-none" />
                  Loading capabilities…
                </p>
              ) : catalogQuery.isError ? (
                <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-agap-danger/25 bg-agap-dangerSoft px-4 py-2.5">
                  <p className="text-sm text-agap-danger">Could not load the capability list.</p>
                  <Button variant="secondary" className="h-11" onClick={() => void catalogQuery.refetch()}>Retry</Button>
                </div>
              ) : addable.length === 0 ? (
                <p className="rounded-xl border border-dashed border-agap-track px-4 py-3 text-sm text-slate-600">
                  {catalog.length === 0
                    ? 'The capability catalog is empty. A System Administrator adds capabilities to it.'
                    : 'This unit already has every capability in the catalog.'}
                </p>
              ) : (
                <div className="space-y-3">
                  {addable.map((group) => (
                    <div key={group.category} role="group" aria-label={titleCase(group.category)}>
                      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                        {titleCase(group.category)}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {group.items.map((item) => {
                          const adding = add.isPending && add.variables?.capabilityId === item.id;
                          return (
                            <button
                              key={item.id}
                              type="button"
                              disabled={busy}
                              title={item.description ?? undefined}
                              aria-label={`Add ${titleCase(item.name)}`}
                              onClick={() => void run(() => add.mutateAsync({ resourceId: resource!.id, capabilityId: item.id }))}
                              className={cn(
                                'inline-flex min-h-11 items-center gap-1.5 rounded-full border border-agap-track bg-white px-3.5 text-sm font-medium text-agap-textMain',
                                'transition-colors duration-150 motion-reduce:transition-none',
                                'hover:border-agap-green hover:bg-agap-greenSoft hover:text-agap-green',
                                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-agap-green focus-visible:ring-offset-1',
                                'disabled:cursor-not-allowed disabled:opacity-60',
                              )}
                            >
                              {adding
                                ? <Loader2 size={15} aria-hidden="true" className="animate-spin motion-reduce:animate-none" />
                                : <Plus size={15} aria-hidden="true" />}
                              {titleCase(item.name)}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          {error && (
            <p role="alert" className="rounded-xl border border-agap-danger/25 bg-agap-dangerSoft px-4 py-2.5 text-sm text-agap-danger">{error}</p>
          )}
        </div>

        <DialogFooter>
          <Button variant="secondary" className="h-11" onClick={() => handleOpen(false)}>Done</Button>
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
  const isSysAdmin = hasRole(user, 'SYSTEM_ADMINISTRATOR');
  const canEdit = hasRole(user, 'ORG_ADMINISTRATOR', 'SYSTEM_ADMINISTRATOR');
  // MOD-29: the organization claims a capability; a Supervisor or System Administrator verifies it.
  const canVerify = hasRole(user, 'SUPERVISOR', 'SYSTEM_ADMINISTRATOR');
  const isOrgAdmin = hasRole(user, 'ORG_ADMINISTRATOR');

  // Org Administrator: reads every organization's units, edits its own (decision D6).
  // The list opens on its own organization; the server enforces the edit rule.
  const ownOrgDefault = isOrgAdmin ? user?.orgId : undefined;
  const canEditUnit = (organizationId: string) => isSysAdmin || (isOrgAdmin && organizationId === user?.orgId);

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
  // A new key each time the form opens, so it starts from the unit being edited.
  const [formKey, setFormKey] = useState(0);
  const [editing, setEditing] = useState<Resource | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
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

  function openForm(unit: Resource | null) {
    setNotice(null);
    setEditing(unit);
    setFormKey((k) => k + 1);
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
        <span className="whitespace-nowrap text-sm text-agap-textMid">{resourceTypeLabel(r.resource_type)}</span>
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
        const editable = canEditUnit(r.organization_id);
        if (!editable && !canVerify) {
          return (
            <span className="flex items-center justify-end gap-1.5 whitespace-nowrap text-xs text-slate-600">
              <Lock size={13} aria-hidden="true" /> View only
            </span>
          );
        }
        const pendingReview = r.capabilities.filter((c) => !c.is_verified).length;
        return (
          <div className="flex items-center justify-end gap-1">
            <Button
              variant="ghost"
              className="h-11 whitespace-nowrap px-3"
              onClick={(e) => { e.stopPropagation(); setCapabilitiesId(r.id); }}
              aria-label={`Capabilities of ${r.name}${pendingReview ? `, ${pendingReview} unverified` : ''}`}
            >
              <ShieldCheck size={16} aria-hidden="true" />
              Capabilities
              {pendingReview > 0 && (
                <span aria-hidden="true" className="rounded-full bg-agap-amberSoft px-1.5 text-[11px] font-bold tabular-nums text-agap-amber">
                  {pendingReview}
                </span>
              )}
            </Button>
            {editable && (
              <Button
                variant="ghost"
                className="h-11 whitespace-nowrap px-3"
                onClick={(e) => { e.stopPropagation(); openForm(resources.find((u) => u.id === r.id) ?? null); }}
                aria-label={`Edit ${r.name}`}
              >
                <Pencil size={15} aria-hidden="true" />
                Edit
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
          <Button variant="primary" className="h-11 w-full sm:w-auto" onClick={() => openForm(null)}>
            <Plus size={16} aria-hidden="true" /> Add resource
          </Button>
        )}
      </div>

      {/* Result of the last add or edit */}
      <div role="status" aria-live="polite">
        {notice && (
          <div className="flex items-center gap-2.5 rounded-xl border border-agap-green/25 bg-agap-greenSoft py-1 pl-4 pr-1 text-sm text-agap-green">
            <CheckCircle2 size={16} aria-hidden="true" className="shrink-0" />
            <span className="min-w-0 flex-1 font-medium">{notice}</span>
            <Button variant="ghost" className="h-11 w-11 shrink-0 px-0 text-agap-green" aria-label="Dismiss" onClick={() => setNotice(null)}>
              <X size={15} aria-hidden="true" />
            </Button>
          </div>
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
                  <SelectItem key={t} value={t}>{resourceTypeLabel(t)}</SelectItem>
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
        key={formKey}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editing={editing}
        defaultOrgId={user?.orgId}
        onSaved={setNotice}
      />

      <CapabilitiesDialog
        resource={capabilitiesUnit}
        onOpenChange={(open) => { if (!open) setCapabilitiesId(null); }}
        canManage={!!capabilitiesUnit && canEditUnit(capabilitiesUnit.organization_id)}
        canVerify={canVerify}
      />
    </div>
  );
}
