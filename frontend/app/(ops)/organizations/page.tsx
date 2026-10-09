'use client';

import { useMemo, useState, type JSX } from 'react';
import { Plus, Pencil, Search } from 'lucide-react';
import {
  Button, DataTable,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
  type Column,
} from '@/components/ui';
import { useAuthUser, hasRole } from '@/lib/use-auth';
import { titleCase } from '@/lib/incident-format';
import {
  useOrganizations,
  useCreateOrganization,
  useUpdateOrganization,
} from '@/features/organizations/hooks';
import type { Organization, CreateOrgBody } from '@/features/organizations/api';
import { cn } from '@/lib/utils';

// ─── Constants ───────────────────────────────────────────────────────────────

const ORG_TYPES = ['MDRRMO', 'BFP', 'HOSPITAL', 'BARANGAY', 'NGO', 'OTHER'] as const;
const ALL = 'ALL';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function orgTypeClasses(type: string): string {
  switch (type) {
    case 'MDRRMO':   return 'bg-agap-greenSoft text-agap-green';
    case 'BFP':      return 'bg-red-50 text-red-700';
    case 'HOSPITAL': return 'bg-agap-infoSoft text-agap-info';
    case 'BARANGAY': return 'bg-agap-amberSoft text-agap-amber';
    default:         return 'bg-agap-surface text-agap-textMid';
  }
}

// ─── Form ────────────────────────────────────────────────────────────────────

const EMPTY_FORM: CreateOrgBody = {
  name: '',
  shortName: '',
  organizationType: '',
  barangay: '',
  contactNumber: '',
  email: '',
  address: '',
};

interface OrgFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: Organization | null;
}

function OrgFormDialog({ open, onOpenChange, editing }: OrgFormDialogProps): JSX.Element {
  const [form, setForm] = useState<CreateOrgBody>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);

  const create = useCreateOrganization();
  const update = useUpdateOrganization();

  const pending = create.isPending || update.isPending;

  function handleOpen(next: boolean) {
    if (next) {
      setError(null);
      setForm(
        editing
          ? {
              name: editing.name,
              shortName: editing.short_name ?? '',
              organizationType: editing.organization_type,
              barangay: editing.barangay ?? '',
              contactNumber: editing.contact_number ?? '',
              email: editing.email ?? '',
              address: editing.address ?? '',
            }
          : EMPTY_FORM,
      );
    }
    onOpenChange(next);
  }

  function set(key: keyof CreateOrgBody, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!form.name.trim()) { setError('Name is required.'); return; }
    if (!form.organizationType) { setError('Organization type is required.'); return; }

    const body: CreateOrgBody = {
      name: form.name.trim(),
      organizationType: form.organizationType,
      ...(form.shortName?.trim()     && { shortName: form.shortName.trim() }),
      ...(form.barangay?.trim()      && { barangay: form.barangay.trim() }),
      ...(form.contactNumber?.trim() && { contactNumber: form.contactNumber.trim() }),
      ...(form.email?.trim()         && { email: form.email.trim() }),
      ...(form.address?.trim()       && { address: form.address.trim() }),
    };

    try {
      if (editing) {
        await update.mutateAsync({ id: editing.id, body });
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
          <DialogTitle>{editing ? 'Edit Organization' : 'New Organization'}</DialogTitle>
          <DialogDescription>
            {editing ? 'Update organization details.' : 'Register a new organization in AGAP.'}
          </DialogDescription>
        </DialogHeader>

        <form id="org-form" onSubmit={(e) => void handleSubmit(e)} className="space-y-4 py-2">
          {/* Name */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-agap-textMain">
              Name <span className="text-agap-danger">*</span>
            </label>
            <input
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              placeholder="e.g. Bocaue MDRRMO"
              className={inputCls}
            />
          </div>

          {/* Short name + Type (side by side) */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-agap-textMain">Short Name</label>
              <input
                value={form.shortName}
                onChange={(e) => set('shortName', e.target.value)}
                placeholder="e.g. MDRRMO"
                className={inputCls}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-agap-textMain">
                Type <span className="text-agap-danger">*</span>
              </label>
              <Select
                value={form.organizationType}
                onValueChange={(v) => set('organizationType', v)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  {ORG_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>{titleCase(t)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Barangay + Contact */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-agap-textMain">Barangay</label>
              <input
                value={form.barangay}
                onChange={(e) => set('barangay', e.target.value)}
                placeholder="e.g. Bocaue Proper"
                className={inputCls}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-agap-textMain">Contact Number</label>
              <input
                value={form.contactNumber}
                onChange={(e) => set('contactNumber', e.target.value)}
                placeholder="+63 …"
                className={inputCls}
              />
            </div>
          </div>

          {/* Email */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-agap-textMain">Email</label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => set('email', e.target.value)}
              placeholder="ops@example.gov.ph"
              className={inputCls}
            />
          </div>

          {/* Address */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-agap-textMain">Address</label>
            <input
              value={form.address}
              onChange={(e) => set('address', e.target.value)}
              placeholder="Full address"
              className={inputCls}
            />
          </div>

          {error && (
            <p className="rounded-xl bg-agap-dangerSoft px-4 py-2 text-sm text-agap-danger">
              {error}
            </p>
          )}
        </form>

        <DialogFooter>
          <Button variant="secondary" size="sm" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button variant="primary" size="sm" form="org-form" type="submit" loading={pending}>
            {editing ? 'Save changes' : 'Create organization'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

interface OrgRow {
  id: string;
  name: string;
  short_name: string | null;
  organization_type: string;
  barangay: string | null;
  contact_number: string | null;
  email: string | null;
  is_active: boolean;
}

export default function OrganizationsPage(): JSX.Element {
  const user = useAuthUser();
  const canCreate = hasRole(user, 'SYSTEM_ADMINISTRATOR');
  const canEdit   = hasRole(user, 'ORG_ADMINISTRATOR', 'SYSTEM_ADMINISTRATOR');

  const { data, isLoading, isError, refetch } = useOrganizations({ perPage: 200 });
  const orgs = useMemo<Organization[]>(() => data?.data ?? [], [data]);

  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState(ALL);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Organization | null>(null);

  const rows = useMemo<OrgRow[]>(() => {
    const q = search.trim().toLowerCase();
    return orgs
      .filter((o) => (typeFilter === ALL ? true : o.organization_type === typeFilter))
      .filter((o) =>
        q
          ? o.name.toLowerCase().includes(q) ||
            (o.barangay ?? '').toLowerCase().includes(q) ||
            (o.short_name ?? '').toLowerCase().includes(q)
          : true,
      )
      .map((o) => ({
        id: o.id,
        name: o.name,
        short_name: o.short_name,
        organization_type: o.organization_type,
        barangay: o.barangay,
        contact_number: o.contact_number,
        email: o.email,
        is_active: o.is_active,
      }));
  }, [orgs, search, typeFilter]);

  function openCreate() {
    setEditing(null);
    setDialogOpen(true);
  }

  function openEdit(id: string) {
    const org = orgs.find((o) => o.id === id) ?? null;
    // ORG_ADMIN can only edit their own org
    if (hasRole(user, 'ORG_ADMINISTRATOR') && !hasRole(user, 'SYSTEM_ADMINISTRATOR')) {
      if (org?.id !== user?.orgId) return;
    }
    setEditing(org);
    setDialogOpen(true);
  }

  const columns: Column<OrgRow>[] = [
    {
      key: 'name',
      header: 'Organization',
      accessor: (r) => (
        <div>
          <p className="font-semibold text-agap-textMain">{r.name}</p>
          {r.short_name && (
            <p className="text-xs text-agap-textSub">{r.short_name}</p>
          )}
        </div>
      ),
    },
    {
      key: 'type',
      header: 'Type',
      accessor: (r) => (
        <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold', orgTypeClasses(r.organization_type))}>
          {r.organization_type}
        </span>
      ),
    },
    {
      key: 'barangay',
      header: 'Barangay',
      accessor: (r) => <span className="text-sm text-agap-textMid">{r.barangay ?? '—'}</span>,
    },
    {
      key: 'contact',
      header: 'Contact',
      accessor: (r) => (
        <div className="space-y-0.5">
          {r.contact_number && <p className="text-sm text-agap-textMid">{r.contact_number}</p>}
          {r.email && <p className="text-xs text-agap-textSub">{r.email}</p>}
          {!r.contact_number && !r.email && <span className="text-sm text-agap-textSub">—</span>}
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      accessor: (r) => (
        <span className={cn(
          'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold',
          r.is_active ? 'bg-agap-greenSoft text-agap-green' : 'bg-agap-surface text-agap-textSub',
        )}>
          {r.is_active ? 'Active' : 'Inactive'}
        </span>
      ),
    },
    ...(canEdit ? [{
      key: 'actions',
      header: '',
      accessor: (r: OrgRow) => {
        const isOwnOrg = r.id === user?.orgId;
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
          <h1 className="text-2xl font-extrabold text-agap-textMain">Organizations</h1>
          <p className="mt-1 text-sm text-agap-textSub">
            {isLoading ? 'Loading…' : `${rows.length} organization${rows.length === 1 ? '' : 's'} registered`}
          </p>
        </div>
        {canCreate && (
          <Button variant="primary" size="md" onClick={openCreate}>
            <Plus size={16} className="mr-1.5" /> Create
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
            placeholder="Search name, barangay…"
            className="h-10 w-64 rounded-xl border border-[rgba(168,181,193,0.20)] bg-white pl-9 pr-3 text-sm text-agap-textMain shadow-tile placeholder:text-agap-textSub focus:outline-none focus:ring-2 focus:ring-agap-green"
          />
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-44"><SelectValue placeholder="All types" /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All types</SelectItem>
            {ORG_TYPES.map((t) => (
              <SelectItem key={t} value={t}>{titleCase(t)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Error */}
      {isError && (
        <div className="rounded-2xl border border-[rgba(212,72,88,0.22)] bg-agap-dangerSoft p-6 text-center">
          <p className="text-sm text-agap-danger">Could not load organizations.</p>
          <Button variant="secondary" size="sm" className="mt-3" onClick={() => void refetch()}>
            Retry
          </Button>
        </div>
      )}

      {/* Table */}
      {!isError && (
        <DataTable
          columns={columns}
          data={rows}
          getRowKey={(r) => r.id}
          loading={isLoading}
          emptyTitle="No organizations found"
          emptyDescription="Create the first organization or adjust the filters above."
        />
      )}

      <OrgFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editing={editing}
      />
    </div>
  );
}

// Shared input class
const inputCls =
  'h-10 w-full rounded-xl border border-[rgba(168,181,193,0.20)] bg-white px-3 text-sm text-agap-textMain shadow-tile placeholder:text-agap-textSub focus:outline-none focus:ring-2 focus:ring-agap-green';
