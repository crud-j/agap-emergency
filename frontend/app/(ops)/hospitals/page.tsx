'use client';

import { useMemo, useState, type JSX } from 'react';
import {
  Building2, Plus, Search, HeartPulse, Droplet, BedDouble, Phone, Check, Ambulance,
} from 'lucide-react';
import {
  Button, Badge, DataTable,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
  EmptyState, Skeleton,
  type Column,
} from '@/components/ui';
import { useAuthUser, hasRole } from '@/lib/use-auth';
import { titleCase, timeAgo } from '@/lib/incident-format';
import { cn } from '@/lib/utils';
import {
  useHospitals,
  useHospitalReferrals,
  useCreateHospital,
  useAcknowledgeReferral,
  useMarkReferralArrived,
} from '@/features/hospitals/hooks';
import type { Hospital, HospitalReferral, CreateHospitalBody } from '@/features/hospitals/api';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function receivingVariant(status: string): 'green' | 'amber' | 'red' | 'muted' {
  switch (status) {
    case 'ACCEPTING':  return 'green';
    case 'LIMITED':    return 'amber';
    case 'DIVERTING':
    case 'FULL':       return 'red';
    default:           return 'muted';
  }
}

function referralVariant(status: string | null, arrived: boolean): 'green' | 'amber' | 'blue' {
  if (arrived) return 'green';
  return status === 'ACKNOWLEDGED' ? 'blue' : 'amber';
}

function locationLabel(h: Hospital): string {
  return [h.barangay, h.municipality, h.province].filter(Boolean).join(', ') || h.address || '—';
}

// ─── Create dialog ───────────────────────────────────────────────────────────

const EMPTY: CreateHospitalBody = {
  name: '', barangay: '', municipality: '', contactNumber: '', emergencyContact: '',
  hasEmergencyRoom: false, hasIcu: false, bloodBank: false,
};

function CreateHospitalDialog({ open, onOpenChange }: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}): JSX.Element {
  const [form, setForm] = useState<CreateHospitalBody>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const create = useCreateHospital();

  function handleOpen(next: boolean) {
    if (next) { setForm(EMPTY); setError(null); }
    onOpenChange(next);
  }

  function set<K extends keyof CreateHospitalBody>(key: K, value: CreateHospitalBody[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!form.name.trim()) { setError('Name is required.'); return; }
    try {
      await create.mutateAsync({
        name: form.name.trim(),
        ...(form.barangay?.trim()        && { barangay: form.barangay.trim() }),
        ...(form.municipality?.trim()    && { municipality: form.municipality.trim() }),
        ...(form.contactNumber?.trim()   && { contactNumber: form.contactNumber.trim() }),
        ...(form.emergencyContact?.trim() && { emergencyContact: form.emergencyContact.trim() }),
        hasEmergencyRoom: !!form.hasEmergencyRoom,
        hasIcu: !!form.hasIcu,
        bloodBank: !!form.bloodBank,
      });
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add Hospital</DialogTitle>
          <DialogDescription>Register a receiving facility in the hospital registry.</DialogDescription>
        </DialogHeader>

        <form id="hospital-form" onSubmit={(e) => void handleSubmit(e)} className="space-y-4 py-2">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-agap-textMain">
              Name <span className="text-agap-danger">*</span>
            </label>
            <input value={form.name} onChange={(e) => set('name', e.target.value)}
              placeholder="e.g. Bocaue District Hospital" className={inputCls} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-agap-textMain">Barangay</label>
              <input value={form.barangay} onChange={(e) => set('barangay', e.target.value)} className={inputCls} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-agap-textMain">Municipality</label>
              <input value={form.municipality} onChange={(e) => set('municipality', e.target.value)} className={inputCls} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-agap-textMain">Contact number</label>
              <input value={form.contactNumber} onChange={(e) => set('contactNumber', e.target.value)} className={inputCls} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-agap-textMain">Emergency contact</label>
              <input value={form.emergencyContact} onChange={(e) => set('emergencyContact', e.target.value)} className={inputCls} />
            </div>
          </div>

          <div className="flex flex-wrap gap-4 pt-1">
            {([
              ['hasEmergencyRoom', 'Emergency Room'],
              ['hasIcu', 'ICU'],
              ['bloodBank', 'Blood Bank'],
            ] as const).map(([key, label]) => (
              <label key={key} className="flex items-center gap-2 text-sm text-agap-textMain">
                <input type="checkbox" checked={!!form[key]}
                  onChange={(e) => set(key, e.target.checked)}
                  className="h-4 w-4 rounded border-agap-track text-agap-green focus:ring-agap-green" />
                {label}
              </label>
            ))}
          </div>

          {error && (
            <p className="rounded-xl bg-agap-dangerSoft px-4 py-2 text-sm text-agap-danger">{error}</p>
          )}
        </form>

        <DialogFooter>
          <Button variant="secondary" size="sm" onClick={() => onOpenChange(false)} disabled={create.isPending}>Cancel</Button>
          <Button variant="primary" size="sm" form="hospital-form" type="submit" loading={create.isPending}>Add hospital</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Referral queue (right panel) ────────────────────────────────────────────

function ReferralQueue({ hospital }: { hospital: Hospital }): JSX.Element {
  const { data: referrals, isLoading, isError, refetch } = useHospitalReferrals(hospital.id);
  const acknowledge = useAcknowledgeReferral();
  const arrived = useMarkReferralArrived();

  const columns: Column<HospitalReferral>[] = [
    {
      key: 'incident',
      header: 'Incident',
      accessor: (r) => <span className="font-mono text-xs text-agap-textMid">{r.incident_id.slice(0, 8)}</span>,
    },
    {
      key: 'eta',
      header: 'ETA',
      accessor: (r) => (
        <span className="text-sm text-agap-textMid tabular-nums">
          {r.eta_minutes != null ? `~${r.eta_minutes} min` : '—'}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      accessor: (r) => {
        const isArrived = !!r.patient_arrived_at;
        return (
          <Badge variant={referralVariant(r.acknowledgment_status, isArrived)}>
            {isArrived ? 'Arrived' : titleCase(r.acknowledgment_status ?? 'PENDING')}
          </Badge>
        );
      },
    },
    {
      key: 'notes',
      header: 'Pre-arrival notes',
      accessor: (r) => (
        <span className="text-sm text-agap-textMid">{r.pre_arrival_notes ?? '—'}</span>
      ),
    },
    {
      key: 'actions',
      header: '',
      accessor: (r) => {
        const isArrived = !!r.patient_arrived_at;
        if (isArrived) {
          return <span className="text-xs text-agap-textSub">{timeAgo(r.patient_arrived_at!)}</span>;
        }
        return (
          <div className="flex justify-end gap-2">
            {r.acknowledgment_status !== 'ACKNOWLEDGED' && (
              <Button variant="secondary" size="sm"
                loading={acknowledge.isPending && acknowledge.variables === r.id}
                onClick={() => acknowledge.mutate(r.id)}>
                <Check size={13} className="mr-1" /> Acknowledge
              </Button>
            )}
            <Button variant="primary" size="sm"
              loading={arrived.isPending && arrived.variables === r.id}
              onClick={() => arrived.mutate(r.id)}>
              <Ambulance size={13} className="mr-1" /> Mark Arrived
            </Button>
          </div>
        );
      },
    },
  ];

  return (
    <div className="space-y-4">
      {/* Hospital header */}
      <div>
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-extrabold text-agap-textMain">{hospital.name}</h2>
          <Badge variant={receivingVariant(hospital.receiving_status)}>
            {titleCase(hospital.receiving_status)}
          </Badge>
        </div>
        <p className="mt-0.5 text-sm text-agap-textSub">{locationLabel(hospital)}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {hospital.has_emergency_room && <Capability icon={HeartPulse} label="ER" />}
          {hospital.has_icu && <Capability icon={BedDouble} label="ICU" />}
          {hospital.blood_bank && <Capability icon={Droplet} label="Blood bank" />}
          {hospital.capacity_available != null && hospital.capacity_total != null && (
            <Capability icon={BedDouble} label={`${hospital.capacity_available}/${hospital.capacity_total} beds`} />
          )}
          {hospital.emergency_contact && <Capability icon={Phone} label={hospital.emergency_contact} />}
        </div>
      </div>

      {(acknowledge.isError || arrived.isError) && (
        <p className="rounded-xl bg-agap-dangerSoft px-4 py-2 text-sm text-agap-danger">
          Action failed — please retry.
        </p>
      )}

      {isError ? (
        <div className="rounded-2xl border border-[rgba(212,72,88,0.22)] bg-agap-dangerSoft p-6 text-center">
          <p className="text-sm text-agap-danger">Could not load referrals.</p>
          <Button variant="secondary" size="sm" className="mt-3" onClick={() => void refetch()}>Retry</Button>
        </div>
      ) : (
        <DataTable
          columns={columns}
          data={referrals ?? []}
          getRowKey={(r) => r.id}
          loading={isLoading}
          emptyTitle="No referrals"
          emptyDescription="Inbound patient referrals for this hospital will appear here."
        />
      )}
    </div>
  );
}

function Capability({ icon: Icon, label }: { icon: typeof HeartPulse; label: string }): JSX.Element {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-agap-surface px-2.5 py-0.5 text-xs font-semibold text-agap-textMid">
      <Icon size={12} /> {label}
    </span>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function HospitalCoordinationPage(): JSX.Element {
  const user = useAuthUser();
  const canCreate = hasRole(user, 'SYSTEM_ADMINISTRATOR');

  const { data: hospitals, isLoading, isError, refetch } = useHospitals();
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const list = useMemo(() => {
    const q = search.trim().toLowerCase();
    const all = hospitals ?? [];
    return q
      ? all.filter((h) =>
          h.name.toLowerCase().includes(q) || locationLabel(h).toLowerCase().includes(q))
      : all;
  }, [hospitals, search]);

  const selected = useMemo(
    () => list.find((h) => h.id === selectedId) ?? list[0] ?? null,
    [list, selectedId],
  );

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-agap-textMain">Hospital Coordination</h1>
          <p className="mt-1 text-sm text-agap-textSub">
            {isLoading ? 'Loading…' : `${list.length} receiving facilit${list.length === 1 ? 'y' : 'ies'}`}
          </p>
        </div>
        {canCreate && (
          <Button variant="primary" size="md" onClick={() => setDialogOpen(true)}>
            <Plus size={16} className="mr-1.5" /> Add Hospital
          </Button>
        )}
      </div>

      {isError ? (
        <div className="rounded-2xl border border-[rgba(212,72,88,0.22)] bg-agap-dangerSoft p-6 text-center">
          <p className="text-sm text-agap-danger">Could not load hospitals.</p>
          <Button variant="secondary" size="sm" className="mt-3" onClick={() => void refetch()}>Retry</Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[320px_1fr]">
          {/* List */}
          <div className="space-y-3">
            <div className="relative">
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-agap-textSub" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search hospitals…"
                className="h-10 w-full rounded-xl border border-[rgba(168,181,193,0.20)] bg-white pl-9 pr-3 text-sm text-agap-textMain shadow-tile placeholder:text-agap-textSub focus:outline-none focus:ring-2 focus:ring-agap-green"
              />
            </div>

            {isLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
              </div>
            ) : list.length === 0 ? (
              <EmptyState icon={Building2} title="No hospitals" description="Add a receiving facility to begin." />
            ) : (
              <ul className="space-y-2">
                {list.map((h) => {
                  const active = selected?.id === h.id;
                  return (
                    <li key={h.id}>
                      <button
                        onClick={() => setSelectedId(h.id)}
                        className={cn(
                          'flex w-full items-start gap-3 rounded-2xl border p-3 text-left transition-colors',
                          active
                            ? 'border-agap-green bg-agap-greenSoft'
                            : 'border-[rgba(168,181,193,0.20)] bg-white hover:bg-agap-surface',
                        )}
                      >
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-agap-green">
                          <Building2 size={16} />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-semibold text-agap-textMain">{h.name}</p>
                          <p className="truncate text-xs text-agap-textSub">{locationLabel(h)}</p>
                        </div>
                        <Badge variant={receivingVariant(h.receiving_status)}>
                          {titleCase(h.receiving_status)}
                        </Badge>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Detail */}
          <div className="rounded-2xl border border-[rgba(168,181,193,0.20)] bg-white p-5 shadow-tile">
            {selected ? (
              <ReferralQueue hospital={selected} />
            ) : (
              <EmptyState
                icon={Ambulance}
                title="Select a hospital"
                description="Choose a receiving facility to review and coordinate inbound referrals."
              />
            )}
          </div>
        </div>
      )}

      <CreateHospitalDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </div>
  );
}

const inputCls =
  'h-10 w-full rounded-xl border border-[rgba(168,181,193,0.20)] bg-white px-3 text-sm text-agap-textMain shadow-tile placeholder:text-agap-textSub focus:outline-none focus:ring-2 focus:ring-agap-green';
