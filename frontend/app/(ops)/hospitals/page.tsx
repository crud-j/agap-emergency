'use client';

import { useMemo, useState, type JSX } from 'react';
import {
  Building2, Plus, Search, HeartPulse, Droplet, BedDouble, Phone, Check, Ambulance, MapPin, X,
} from 'lucide-react';
import {
  Button, Badge, DataTable,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
  EmptyState, Skeleton,
  type Column,
} from '@/components/ui';
import { useAuthUser, hasRole, type AuthUser } from '@/lib/use-auth';
import { titleCase, timeAgo } from '@/lib/incident-format';
import { cn } from '@/lib/utils';
import {
  useHospitals,
  useHospitalReferrals,
  useCreateHospital,
  useSetHospitalLocation,
  useVerifyHospitalLocation,
  useAcknowledgeReferral,
  useMarkReferralArrived,
} from '@/features/hospitals/hooks';
import { useOrganization } from '@/features/organizations/hooks';
import type { Hospital, HospitalReferral, CreateHospitalBody } from '@/features/hospitals/api';
import {
  EMPTY_COORDINATES, canReviewLocation, coordinateText, describeHospitalError, formatCoordinates,
  hasCoordinates, locationStatusBadge, readCoordinates,
  type CoordinateText, type HospitalErrorView,
} from '@/features/hospitals/location';
import { HospitalLocationPicker } from '@/components/hospitals/HospitalLocationPicker';

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
  name: '', barangay: '', address: '', municipality: '', province: 'Bulacan', contactNumber: '', emergencyContact: '',
  hasEmergencyRoom: false, hasIcu: false, bloodBank: false,
};

const REVIEW_NOTICE = 'Will be reviewed by MDRRMO before ambulances can select it.';

/** The location error plus, for a swapped pair, the one-click fix. */
function LocationError({ error, onUseSuggested }: {
  error: HospitalErrorView;
  onUseSuggested: (next: CoordinateText) => void;
}): JSX.Element {
  const { suggested } = error;
  return (
    <div className="space-y-2 rounded-xl bg-agap-dangerSoft px-4 py-2 text-sm text-agap-danger" role="alert">
      <p>{error.message}</p>
      {suggested && (
        <Button variant="secondary" size="sm" type="button"
          onClick={() => onUseSuggested(coordinateText(suggested.latitude, suggested.longitude))}>
          Use suggested coordinates
        </Button>
      )}
    </div>
  );
}

/**
 * System Administrator: any hospital (location saved as Verified). Org Administrator:
 * only for their own HOSPITAL organization, saved as Pending review.
 */
function CreateHospitalDialog({ open, onOpenChange, ownOrg }: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** Set for an Org Administrator: the only organization they may create for. */
  ownOrg: { id: string; name: string } | null;
}): JSX.Element {
  const [form, setForm] = useState<CreateHospitalBody>(EMPTY);
  const [coords, setCoords] = useState<CoordinateText>(EMPTY_COORDINATES);
  const [organizationId, setOrganizationId] = useState('');
  const [error, setError] = useState<HospitalErrorView | null>(null);
  const [wasOpen, setWasOpen] = useState(open);
  const create = useCreateHospital();

  // Start empty each time the page opens the dialog (it opens through `open`, not onOpenChange).
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) { setForm(EMPTY); setCoords(EMPTY_COORDINATES); setOrganizationId(ownOrg?.id ?? ''); setError(null); }
  }

  function set<K extends keyof CreateHospitalBody>(key: K, value: CreateHospitalBody[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!form.name.trim()) { setError({ message: 'Name is required.' }); return; }
    if (ownOrg && !organizationId) { setError({ message: 'Choose your organization.' }); return; }
    const location = readCoordinates(coords);
    if (!location.ok) { setError({ message: location.error }); return; }
    try {
      await create.mutateAsync({
        name: form.name.trim(),
        ...(form.barangay?.trim()        && { barangay: form.barangay.trim() }),
        ...(form.address?.trim()         && { address: form.address.trim() }),
        ...(form.municipality?.trim()    && { municipality: form.municipality.trim() }),
        ...(form.province?.trim()        && { province: form.province.trim() }),
        ...(ownOrg && { organizationId }),
        ...(location.point && { location: { ...location.point, source: 'manual' as const } }),
        ...(form.contactNumber?.trim()   && { contactNumber: form.contactNumber.trim() }),
        ...(form.emergencyContact?.trim() && { emergencyContact: form.emergencyContact.trim() }),
        hasEmergencyRoom: !!form.hasEmergencyRoom,
        hasIcu: !!form.hasIcu,
        bloodBank: !!form.bloodBank,
      });
      onOpenChange(false);
    } catch (err) {
      setError(describeHospitalError(err));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add Hospital</DialogTitle>
          <DialogDescription>
            {ownOrg ? REVIEW_NOTICE : 'Register a receiving facility in the hospital registry.'}
          </DialogDescription>
        </DialogHeader>

        <form id="hospital-form" onSubmit={(e) => void handleSubmit(e)} className="space-y-4 py-2">
          <div className="space-y-1.5">
            <label htmlFor="hospital-name" className="text-sm font-medium text-agap-textMain">
              Name <span className="text-agap-danger">*</span>
            </label>
            <input id="hospital-name" value={form.name} onChange={(e) => set('name', e.target.value)}
              placeholder="e.g. Bocaue District Hospital" className={inputCls} />
          </div>

          {ownOrg && (
            <div className="space-y-1.5">
              <label htmlFor="hospital-org" className="text-sm font-medium text-agap-textMain">
                Organization <span className="text-agap-danger">*</span>
              </label>
              <select id="hospital-org" value={organizationId} onChange={(e) => setOrganizationId(e.target.value)}
                className={inputCls}>
                <option value="">Choose your organization…</option>
                <option value={ownOrg.id}>{ownOrg.name}</option>
              </select>
            </div>
          )}

          <div className="space-y-1.5">
            <label htmlFor="hospital-address" className="text-sm font-medium text-agap-textMain">Address</label>
            <input id="hospital-address" value={form.address} onChange={(e) => set('address', e.target.value)}
              placeholder="Street, landmark" className={inputCls} />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <label htmlFor="hospital-barangay" className="text-sm font-medium text-agap-textMain">Barangay</label>
              <input id="hospital-barangay" value={form.barangay} onChange={(e) => set('barangay', e.target.value)} className={inputCls} />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="hospital-municipality" className="text-sm font-medium text-agap-textMain">Municipality</label>
              <input id="hospital-municipality" value={form.municipality} onChange={(e) => set('municipality', e.target.value)} className={inputCls} />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="hospital-province" className="text-sm font-medium text-agap-textMain">Province</label>
              <input id="hospital-province" value={form.province} onChange={(e) => set('province', e.target.value)} className={inputCls} />
            </div>
          </div>

          <HospitalLocationPicker value={coords} onChange={setCoords} />

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

          {error && <LocationError error={error} onUseSuggested={setCoords} />}
        </form>

        <DialogFooter>
          <Button variant="secondary" size="sm" onClick={() => onOpenChange(false)} disabled={create.isPending}>Cancel</Button>
          <Button variant="primary" size="sm" form="hospital-form" type="submit" loading={create.isPending}>Add hospital</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Location dialogs ────────────────────────────────────────────────────────

function SetLocationDialog({ hospital, onClose, needsReview }: {
  hospital: Hospital | null;
  onClose: () => void;
  /** Org Administrator: the new location waits for MDRRMO review. */
  needsReview: boolean;
}): JSX.Element {
  const [coords, setCoords] = useState<CoordinateText>(EMPTY_COORDINATES);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<HospitalErrorView | null>(null);
  const [openedFor, setOpenedFor] = useState<string | null>(null);
  const setLocation = useSetHospitalLocation();

  // Prefill each time the dialog opens for a hospital.
  if (hospital && openedFor !== hospital.id) {
    setOpenedFor(hospital.id);
    setCoords(coordinateText(hospital.latitude, hospital.longitude));
    setReason('');
    setError(null);
  }
  if (!hospital && openedFor !== null) setOpenedFor(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!hospital) return;
    setError(null);
    const location = readCoordinates(coords);
    if (!location.ok) { setError({ message: location.error }); return; }
    if (!location.point) { setError({ message: 'Enter the latitude and longitude, or click the map.' }); return; }
    try {
      await setLocation.mutateAsync({
        id: hospital.id,
        body: { ...location.point, source: 'manual', ...(reason.trim() && { reason: reason.trim() }) },
      });
      onClose();
    } catch (err) {
      setError(describeHospitalError(err));
    }
  }

  return (
    <Dialog open={!!hospital} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Set location</DialogTitle>
          <DialogDescription>
            {hospital?.name}. {needsReview ? REVIEW_NOTICE : 'Saved as Verified.'}
          </DialogDescription>
        </DialogHeader>

        <form id="hospital-location-form" onSubmit={(e) => void handleSubmit(e)} className="space-y-4 py-2">
          <HospitalLocationPicker value={coords} onChange={setCoords}
            verified={hospital?.location_status === 'VERIFIED'} />
          <div className="space-y-1.5">
            <label htmlFor="location-reason" className="text-sm font-medium text-agap-textMain">
              Reason <span className="font-normal text-agap-textSub">(optional)</span>
            </label>
            <input id="location-reason" value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Moved pin to the ER entrance" className={inputCls} />
          </div>
          {error && <LocationError error={error} onUseSuggested={setCoords} />}
        </form>

        <DialogFooter>
          <Button variant="secondary" size="sm" onClick={onClose} disabled={setLocation.isPending}>Cancel</Button>
          <Button variant="primary" size="sm" form="hospital-location-form" type="submit" loading={setLocation.isPending}>
            Save location
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReviewLocationDialog({ review, onClose }: {
  review: { hospital: Hospital; decision: 'VERIFIED' | 'REJECTED' } | null;
  onClose: () => void;
}): JSX.Element {
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [openedFor, setOpenedFor] = useState<string | null>(null);
  const verify = useVerifyHospitalLocation();
  const verifying = review?.decision === 'VERIFIED';

  // A note typed for one decision must never be sent with the next one (it goes to the audit log).
  const reviewKey = review ? `${review.hospital.id}:${review.decision}` : null;
  if (reviewKey !== openedFor) {
    setOpenedFor(reviewKey);
    setNote('');
    setError(null);
  }

  async function handleConfirm() {
    if (!review) return;
    setError(null);
    try {
      await verify.mutateAsync({
        id: review.hospital.id,
        body: { decision: review.decision, ...(note.trim() && { note: note.trim() }) },
      });
      onClose();
    } catch (err) {
      setError(describeHospitalError(err).message);
    }
  }

  return (
    <Dialog open={!!review} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{verifying ? 'Verify location' : 'Reject location'}</DialogTitle>
          <DialogDescription>
            {review?.hospital.name}
            {review && hasCoordinates(review.hospital) && ` · ${formatCoordinates(review.hospital.latitude, review.hospital.longitude)}`}
            {verifying
              ? '. Ambulance crews can then select it as a destination.'
              : '. It stays hidden from ambulance crews until a new location is set and verified.'}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5 py-2">
          <label htmlFor="review-note" className="text-sm font-medium text-agap-textMain">
            Note <span className="font-normal text-agap-textSub">(optional)</span>
          </label>
          <input id="review-note" value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} className={inputCls} />
          {error && <p className="rounded-xl bg-agap-dangerSoft px-4 py-2 text-sm text-agap-danger" role="alert">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="secondary" size="sm" onClick={onClose} disabled={verify.isPending}>Cancel</Button>
          <Button variant={verifying ? 'primary' : 'danger'} size="sm" loading={verify.isPending}
            onClick={() => void handleConfirm()}>
            {verifying ? 'Verify' : 'Reject'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Location status, coordinates and the actions this user may take on them. */
function LocationPanel({ hospital, canSet, canReview, onSet, onReview }: {
  hospital: Hospital;
  canSet: boolean;
  canReview: boolean;
  onSet: () => void;
  onReview: (decision: 'VERIFIED' | 'REJECTED') => void;
}): JSX.Element {
  const badge = locationStatusBadge(hospital.location_status);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-agap-surface px-4 py-3">
      <div className="min-w-0 space-y-0.5">
        <div className="flex items-center gap-2">
          <MapPin size={14} className="text-agap-textSub" aria-hidden />
          <span className="text-sm font-semibold text-agap-textMain">Location</span>
          <Badge variant={badge.variant}>{badge.label}</Badge>
        </div>
        <p className="text-xs text-agap-textSub">
          {hasCoordinates(hospital)
            ? <span className="font-mono tabular-nums">{formatCoordinates(hospital.latitude, hospital.longitude)}</span>
            : 'No coordinates yet: ambulances cannot be routed here.'}
          {hospital.location_source && ` · ${hospital.location_source}`}
          {hospital.last_verified_at && ` · verified ${timeAgo(hospital.last_verified_at)}`}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {canSet && (
          <Button variant="secondary" size="sm" onClick={onSet}>
            <MapPin size={13} className="mr-1" /> Set location
          </Button>
        )}
        {canReview && canReviewLocation(hospital) && (
          <>
            {hasCoordinates(hospital) && (
              <Button variant="primary" size="sm" onClick={() => onReview('VERIFIED')}>
                <Check size={13} className="mr-1" /> Verify
              </Button>
            )}
            <Button variant="secondary" size="sm" onClick={() => onReview('REJECTED')}>
              <X size={13} className="mr-1" /> Reject
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Referral queue (right panel) ────────────────────────────────────────────

function ReferralQueue({ hospital, canAcknowledge }: { hospital: Hospital; canAcknowledge: boolean }): JSX.Element {
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
            {canAcknowledge && r.acknowledgment_status !== 'ACKNOWLEDGED' && (
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

/**
 * Who may do what with hospital locations. Mirrors the backend roles; the API
 * still checks organization membership.
 */
function useHospitalPermissions(user: AuthUser | null) {
  const isOrgAdmin = hasRole(user, 'ORG_ADMINISTRATOR');
  const orgQuery = useOrganization(isOrgAdmin ? user?.orgId ?? null : null);
  const org = orgQuery.data;
  // An Org Administrator of a hospital organization may create for it. If the
  // organization cannot be looked up, show the button and let the API decide.
  const orgAdminMayCreate = isOrgAdmin && !orgQuery.isLoading && (!org || org.organization_type === 'HOSPITAL');
  const isReviewer = hasRole(user, 'SYSTEM_ADMINISTRATOR', 'SUPERVISOR');
  return {
    isOrgAdmin,
    canCreate: hasRole(user, 'SYSTEM_ADMINISTRATOR') || orgAdminMayCreate,
    ownOrg: isOrgAdmin && user?.orgId
      ? { id: user.orgId, name: org?.name ?? user.orgName ?? 'My organization' }
      : null,
    isReviewer,
    seesUnreviewed: isReviewer || isOrgAdmin,
    canSetLocation: (h: Hospital) => isReviewer || (isOrgAdmin && !!h.organization_id && h.organization_id === user?.orgId),
  };
}

export default function HospitalCoordinationPage(): JSX.Element {
  const user = useAuthUser();
  const perms = useHospitalPermissions(user);
  // Matches the backend referral readers; the System Administrator manages facilities only.
  const canViewReferrals = hasRole(user, 'HOSPITAL_USER', 'DISPATCHER', 'SUPERVISOR');

  const { data: hospitals, isLoading, isError, refetch } = useHospitals({
    includeUnreviewed: perms.seesUnreviewed,
    enabled: !!user,
  });
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [locationFor, setLocationFor] = useState<Hospital | null>(null);
  const [review, setReview] = useState<{ hospital: Hospital; decision: 'VERIFIED' | 'REJECTED' } | null>(null);

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
        {perms.canCreate && (
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
                  const badge = locationStatusBadge(h.location_status);
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
                          {hasCoordinates(h) && (
                            <p className="truncate font-mono text-[11px] tabular-nums text-agap-textSub">
                              {formatCoordinates(h.latitude, h.longitude)}
                            </p>
                          )}
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1">
                          <Badge variant={receivingVariant(h.receiving_status)}>
                            {titleCase(h.receiving_status)}
                          </Badge>
                          <Badge variant={badge.variant}>{badge.label}</Badge>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Detail */}
          <div className="space-y-4 rounded-2xl border border-[rgba(168,181,193,0.20)] bg-white p-5 shadow-tile">
            {selected && (
              <LocationPanel
                hospital={selected}
                canSet={perms.canSetLocation(selected)}
                canReview={perms.isReviewer}
                onSet={() => setLocationFor(selected)}
                onReview={(decision) => setReview({ hospital: selected, decision })}
              />
            )}
            {selected && !canViewReferrals ? (
              <EmptyState
                icon={Ambulance}
                title={selected.name}
                description="Referrals carry patient details and are visible to MDRRMO and hospital staff only."
              />
            ) : selected ? (
              <ReferralQueue hospital={selected} canAcknowledge={hasRole(user, 'HOSPITAL_USER')} />
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

      <CreateHospitalDialog open={dialogOpen} onOpenChange={setDialogOpen} ownOrg={perms.ownOrg} />
      <SetLocationDialog hospital={locationFor} onClose={() => setLocationFor(null)} needsReview={perms.isOrgAdmin} />
      <ReviewLocationDialog review={review} onClose={() => setReview(null)} />
    </div>
  );
}

const inputCls =
  'h-10 w-full rounded-xl border border-[rgba(168,181,193,0.20)] bg-white px-3 text-sm text-agap-textMain shadow-tile placeholder:text-agap-textSub focus:outline-none focus:ring-2 focus:ring-agap-green';
