'use client';

import { useState, type JSX } from 'react';
import { AlertTriangle, CheckCircle2, Landmark, Pencil, Phone, Plus, RotateCcw, ShieldCheck, X } from 'lucide-react';
import {
  Badge, Button, Skeleton, EmptyState,
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui';
import {
  useAddBarangayContact, useBarangayDirectory, useUpdateBarangayContact,
  type ContactChanges, type ContactRole, type DirectoryBarangay, type DirectoryContact,
} from '@/features/admin/barangay-contacts';
import { cn } from '@/lib/utils';

const ROLES: Array<{ role: ContactRole; label: string }> = [
  { role: 'PRIMARY', label: 'Primary' },
  { role: 'BACKUP', label: 'Backup' },
  { role: 'OTHER', label: 'Other' },
];
const ROLE_LABEL: Record<ContactRole, string> = { PRIMARY: 'Primary', BACKUP: 'Backup', OTHER: 'Other' };

const INPUT =
  'h-9 rounded-xl border border-[rgba(168,181,193,0.20)] bg-white px-3 text-sm text-agap-textMain ' +
  'placeholder:text-agap-textSub focus:outline-none focus:ring-2 focus:ring-agap-green';

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });

function errorText(err: unknown): string {
  if (!(err instanceof Error)) return 'Could not save. Try again.';
  return Array.isArray((err as { message: unknown }).message) ? 'Check the fields and try again.' : err.message;
}

/** What would stop the alert reaching this barangay, worst first. Null when it is fine. */
function barangayIssue(b: DirectoryBarangay): { label: string; tone: 'red' | 'amber' } | null {
  const active = b.contacts.filter((c) => c.is_active);
  if (!active.some((c) => c.role === 'PRIMARY')) return { label: 'No primary', tone: 'red' };
  if (!active.some((c) => c.role === 'BACKUP')) return { label: 'No backup', tone: 'amber' };
  if (active.some((c) => c.role !== 'OTHER' && !c.verified_at)) return { label: 'Unverified', tone: 'amber' };
  return null;
}

/**
 * MOD-34 / MOD-49, barangay plan Phase 6: the phone numbers barangay alerts go to. The
 * next alert reads them fresh, so a change here applies without a redeploy. Every change
 * is audited. Numbers are deactivated, never deleted.
 */
export function BarangayDirectoryTab(): JSX.Element {
  const { data, isLoading, isError } = useBarangayDirectory();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[0, 1, 2].map((i) => <Skeleton key={i} className="h-12 rounded-xl" />)}
      </div>
    );
  }
  if (isError || !data?.length) {
    return <EmptyState icon={Landmark} title="Barangay directory unavailable" description="The barangay list could not be loaded." />;
  }

  const selected = data.find((b) => b.id === selectedId) ?? data[0]!;

  return (
    <div className="space-y-3">
      <p className="text-sm text-agap-textSub">
        Barangay alerts text each barangay&apos;s <strong>primary</strong> and <strong>backup</strong> mobile numbers.
        Changes apply to the next alert. Every change is audited.
      </p>

      <div className="grid gap-4 md:grid-cols-[220px_1fr]">
        {/* Barangays */}
        <ul className="max-h-[560px] overflow-y-auto rounded-2xl border border-[rgba(168,181,193,0.20)] bg-white shadow-card">
          {data.map((b) => {
            const issue = barangayIssue(b);
            return (
              <li key={b.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(b.id)}
                  className={cn(
                    'flex w-full items-center gap-2 px-3 py-2 text-left text-sm',
                    b.id === selected.id ? 'bg-agap-surface font-semibold text-agap-green' : 'text-agap-textMain hover:bg-agap-surface/60',
                  )}
                >
                  <span className="min-w-0 flex-1 truncate">{b.name}</span>
                  {issue && <Badge variant={issue.tone}>{issue.label}</Badge>}
                </button>
              </li>
            );
          })}
        </ul>

        <BarangayContacts key={selected.id} barangay={selected} />
      </div>
    </div>
  );
}

function BarangayContacts({ barangay }: { barangay: DirectoryBarangay }): JSX.Element {
  const active = barangay.contacts.filter((c) => c.is_active);
  const inactive = barangay.contacts.filter((c) => !c.is_active);
  const [showInactive, setShowInactive] = useState(false);

  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-[rgba(168,181,193,0.20)] bg-white shadow-card">
        <div className="flex items-center gap-2 border-b border-[rgba(168,181,193,0.12)] px-4 py-3">
          <Landmark size={16} className="text-agap-textSub" />
          <h3 className="text-sm font-bold text-agap-textMain">Brgy {barangay.name}</h3>
          <span className="text-xs text-agap-textSub">{active.length} active number{active.length === 1 ? '' : 's'}</span>
        </div>
        {active.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-agap-textSub">No active numbers. Alerts cannot reach this barangay.</p>
        ) : (
          <ul className="divide-y divide-[rgba(168,181,193,0.12)]">
            {active.map((c) => <ContactRow key={c.id} contact={c} />)}
          </ul>
        )}
        {inactive.length > 0 && (
          <div className="border-t border-[rgba(168,181,193,0.12)]">
            <button
              type="button"
              onClick={() => setShowInactive((v) => !v)}
              className="w-full px-4 py-2 text-left text-xs font-semibold text-agap-textSub hover:text-agap-textMain"
            >
              {showInactive ? 'Hide' : 'Show'} inactive numbers ({inactive.length})
            </button>
            {showInactive && (
              <ul className="divide-y divide-[rgba(168,181,193,0.12)] opacity-70">
                {inactive.map((c) => <ContactRow key={c.id} contact={c} />)}
              </ul>
            )}
          </div>
        )}
      </div>

      <AddContact barangayId={barangay.id} />
    </div>
  );
}

function ContactRow({ contact: c }: { contact: DirectoryContact }): JSX.Element {
  const update = useUpdateBarangayContact();
  const [editingLabel, setEditingLabel] = useState(false);
  const [label, setLabel] = useState(c.label ?? '');
  const save = (changes: ContactChanges, onDone?: () => void) =>
    update.mutate({ id: c.id, changes }, { onSuccess: () => onDone?.() });

  return (
    <li className="px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <Phone size={13} className="shrink-0 text-agap-textSub" />
        <span className="font-mono text-sm font-semibold text-agap-textMain">{c.phone_e164}</span>
        {c.kind === 'LANDLINE' && <Badge variant="muted">Landline · calls only</Badge>}
        {c.is_demo && <Badge variant="orange">Demo</Badge>}
        {c.verified_at ? (
          <Badge variant="green"><ShieldCheck size={11} /> Verified {fmtDate(c.verified_at)}</Badge>
        ) : c.is_active && c.role !== 'OTHER' ? (
          <Badge variant="amber"><AlertTriangle size={11} /> Not verified</Badge>
        ) : null}

        <div className="ml-auto flex items-center gap-1">
          {c.is_active && (
            <Select value={c.role} onValueChange={(role) => save({ role: role as ContactRole })} disabled={update.isPending}>
              <SelectTrigger aria-label="Role" className="h-8 w-[110px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROLES.map(({ role, label }) => (
                  <SelectItem key={role} value={role} disabled={role !== 'OTHER' && !c.can_sms}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      <div className="mt-1.5 flex flex-wrap items-center gap-2 pl-5 text-xs text-agap-textSub">
        {editingLabel ? (
          <>
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              maxLength={120}
              placeholder="Whose phone, e.g. BDRRMC chair"
              className={cn(INPUT, 'h-8 w-56')}
              autoFocus
            />
            <Button size="sm" variant="secondary" className="h-7" loading={update.isPending} onClick={() => save({ label }, () => setEditingLabel(false))}>
              Save
            </Button>
            <Button size="sm" variant="ghost" className="h-7" onClick={() => { setLabel(c.label ?? ''); setEditingLabel(false); }} aria-label="Cancel">
              <X size={12} />
            </Button>
          </>
        ) : (
          <button type="button" onClick={() => setEditingLabel(true)} className="inline-flex items-center gap-1 hover:text-agap-textMain">
            {c.label ?? <span className="italic">No label</span>} <Pencil size={11} />
          </button>
        )}
        <span>·</span>
        <span>{c.is_active ? ROLE_LABEL[c.role] : 'Inactive'}{c.source === 'admin' ? ' · added here' : ''}</span>

        <div className="ml-auto flex flex-wrap items-center gap-1">
          {c.is_active && (
            <Button size="sm" variant="ghost" className="h-7" disabled={update.isPending} onClick={() => save({ verified: !c.verified_at })}>
              {c.verified_at ? 'Clear verified' : <><CheckCircle2 size={12} /> Mark verified</>}
            </Button>
          )}
          {c.is_demo && (
            <Button size="sm" variant="ghost" className="h-7" disabled={update.isPending} onClick={() => save({ isDemo: false })}>
              Not a demo number
            </Button>
          )}
          {c.is_active ? (
            <Button size="sm" variant="ghost" className="h-7 text-agap-danger" disabled={update.isPending} onClick={() => save({ isActive: false })}>
              Deactivate
            </Button>
          ) : (
            <Button size="sm" variant="ghost" className="h-7" disabled={update.isPending} onClick={() => save({ isActive: true })}>
              <RotateCcw size={12} /> Reactivate
            </Button>
          )}
        </div>
      </div>
      {update.isError && <p className="mt-1 pl-5 text-xs text-agap-danger">{errorText(update.error)}</p>}
    </li>
  );
}

function AddContact({ barangayId }: { barangayId: string }): JSX.Element {
  const add = useAddBarangayContact();
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<ContactRole>('OTHER');
  const [label, setLabel] = useState('');

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!phone.trim()) return;
    add.mutate(
      { barangayId, phone, role, ...(label.trim() ? { label } : {}) },
      { onSuccess: () => { setPhone(''); setLabel(''); setRole('OTHER'); } },
    );
  }

  return (
    <form onSubmit={submit} className="rounded-2xl border border-dashed border-[rgba(168,181,193,0.40)] bg-white p-4">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-agap-textSub">Add a number</p>
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="0917 123 4567"
          inputMode="tel"
          maxLength={40}
          className={cn(INPUT, 'w-40 font-mono')}
          aria-label="Phone number"
        />
        <Select value={role} onValueChange={(v) => setRole(v as ContactRole)}>
          <SelectTrigger aria-label="Role" className="h-9 w-[110px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ROLES.map(({ role: r, label: l }) => <SelectItem key={r} value={r}>{l}</SelectItem>)}
          </SelectContent>
        </Select>
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Whose phone (optional)"
          maxLength={120}
          className={cn(INPUT, 'min-w-[160px] flex-1')}
          aria-label="Label"
        />
        <Button type="submit" size="sm" loading={add.isPending} disabled={!phone.trim()}>
          <Plus size={13} /> Add
        </Button>
      </div>
      <p className="mt-1.5 text-xs text-agap-textSub">
        Making it primary or backup moves the current holder. Landlines can only be &quot;Other&quot; (they cannot receive SMS).
      </p>
      {add.isError && <p className="mt-1 text-xs text-agap-danger">{errorText(add.error)}</p>}
    </form>
  );
}
