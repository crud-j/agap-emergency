'use client';

import { useMemo, useState, type JSX } from 'react';
import { Repeat, Undo2, Users } from 'lucide-react';
import {
  DISPATCH_CHANGE_NOTES_MAX,
  DISPATCH_CHANGE_NOTE_REQUIRED,
  DISPATCH_CHANGE_REASONS,
  DISPATCH_CHANGE_REASON_CODES,
  type DispatchChangeReason,
} from '@agap/shared';
import { Button } from '@/components/ui';
import { confirmAction, escapeHtml, notify } from '@/components/ui/alerts';
import { useAvailableUnits, useCancelDispatch, useReassignDispatch } from '@/features/dispatch/hooks';
import { homeCrew } from '@/features/dispatch/unit-selection';
import { resourceTypeLabel } from '@/features/resources/resource-type';
import { useResponders } from '@/features/responders/hooks';
import { isFreeForCrew } from '@/features/responders/readiness';
import type { IncidentDispatch } from '@/features/dispatch/api';

export type UnitChangeMode = 'recall' | 'replace';

interface UnitChangePanelProps {
  incidentId: string;
  reference: string;
  dispatch: IncidentDispatch;
  mode: UnitChangeMode;
  /** Responders crewing the incident's other active units; they can't ride the replacement. */
  busyResponderIds: ReadonlySet<string>;
  onClose: () => void;
}

/**
 * MOD-31 — recall a unit, or replace it with another, before it reaches the scene.
 * The dispatcher picks a reason (written to the timeline and audit trail), and for
 * a replacement the new unit; its on-duty home crew goes with it. The backend does
 * the swap in one transaction, so a failure leaves the original unit assigned.
 */
export function UnitChangePanel({
  incidentId, reference, dispatch, mode, busyResponderIds, onClose,
}: UnitChangePanelProps): JSX.Element {
  const replacing = mode === 'replace';
  const unitName = dispatch.resources?.call_sign ?? dispatch.resources?.name ?? 'this unit';
  const unitType = dispatch.resources?.resource_type ?? null;

  const [reason, setReason] = useState<DispatchChangeReason | null>(null);
  const [notes, setNotes] = useState('');
  const [newUnitId, setNewUnitId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cancel = useCancelDispatch(incidentId);
  const reassign = useReassignDispatch(incidentId);
  const busy = cancel.isPending || reassign.isPending;

  const { data: availableUnits = [], isLoading: unitsLoading } = useAvailableUnits();
  const { data: responders = [] } = useResponders({ perPage: 100 });
  // Free to crew the replacement: on duty and riding no other unit. The replaced unit's
  // own crew counts as free (its dispatch is cancelled in the same transaction).
  const onDutyIds = useMemo(
    () => new Set(responders
      .filter((r) => isFreeForCrew(r) || (r.availability_status === 'AVAILABLE' && r.active_assignment?.dispatch_id === dispatch.id))
      .map((r) => r.id)),
    [responders, dispatch.id],
  );
  // The recalled unit's own crew is free again once it is replaced, but it rides its own unit.
  const replacements = useMemo(
    () => availableUnits
      .filter((u) => u.id !== dispatch.resource_id)
      .sort((a, b) => Number(b.resource_type === unitType) - Number(a.resource_type === unitType)),
    [availableUnits, dispatch.resource_id, unitType],
  );
  const chosen = replacements.find((u) => u.id === newUnitId) ?? null;
  const crewIds = useMemo(
    () => chosen
      ? homeCrew({ id: chosen.id, resourceType: chosen.resource_type, crewIds: (chosen.crew ?? []).map((c) => c.id) }, onDutyIds, new Set(busyResponderIds))
      : [],
    [chosen, onDutyIds, busyResponderIds],
  );
  const crewNames = chosen ? (chosen.crew ?? []).filter((c) => crewIds.includes(c.id)).map((c) => c.full_name) : [];

  const reasons = DISPATCH_CHANGE_REASON_CODES.filter((code) => !(replacing && code === 'NOT_NEEDED'));
  const noteRequired = !!reason && DISPATCH_CHANGE_NOTE_REQUIRED.has(reason);
  const trimmed = notes.trim();
  const ready = !!reason && (!noteRequired || trimmed.length > 0) && (!replacing || !!chosen);

  async function submit() {
    if (!ready || !reason || busy) return;
    const reasonText = DISPATCH_CHANGE_REASONS[reason] + (trimmed ? ` — ${trimmed}` : '');
    const body = { reason, ...(trimmed ? { notes: trimmed } : {}) };
    const ok = await confirmAction(
      replacing && chosen
        ? {
            title: `Replace ${unitName} with ${chosen.call_sign ?? chosen.name}?`,
            html: `<p class="text-[13px] text-agap-textMid"><span class="font-mono font-semibold text-agap-textMain">${escapeHtml(reference)}</span></p>
              <p class="mt-2 text-[13px] text-agap-textMid">Reason: ${escapeHtml(reasonText)}</p>
              <p class="mt-2 text-[13px] text-agap-textMid">${crewNames.length ? `New crew: ${escapeHtml(crewNames.join(', '))}` : '<strong>No crew on duty for this unit.</strong> Nobody will receive the assignment until crew is added.'}</p>
              <p class="mt-3 text-[12px] text-agap-hint">${escapeHtml(unitName)}'s crew is told to stand down.</p>`,
            confirmText: 'Replace unit',
            icon: 'warning',
          }
        : {
            title: `Recall ${unitName}?`,
            html: `<p class="text-[13px] text-agap-textMid"><span class="font-mono font-semibold text-agap-textMain">${escapeHtml(reference)}</span></p>
              <p class="mt-2 text-[13px] text-agap-textMid">Reason: ${escapeHtml(reasonText)}</p>
              <p class="mt-3 text-[12px] text-agap-hint">The crew is told to stand down. If no other unit is responding, the incident goes back to the dispatch queue.</p>`,
            confirmText: 'Recall unit',
            tone: 'danger',
            icon: 'warning',
          },
    );
    if (!ok) return;
    setError(null);
    try {
      if (replacing && chosen) {
        await reassign.mutateAsync({
          dispatchId: dispatch.id,
          body: { ...body, resourceId: chosen.id, ...(crewIds.length ? { crewIds } : {}) },
        });
        void notify('success', { title: `${unitName} replaced`, text: `${chosen.call_sign ?? chosen.name} → ${reference}. Waiting for the crew to accept.` });
      } else {
        const result = await cancel.mutateAsync({ dispatchId: dispatch.id, body });
        void notify('success', {
          title: `${unitName} recalled`,
          text: result.incidentStatus === 'DISPATCH_PENDING'
            ? `${reference} is back in the dispatch queue. Send another unit.`
            : `${reference} keeps its other units.`,
        });
      }
      onClose();
    } catch (err) {
      setError((err as Error)?.message ?? 'Not changed. Try again.');
    }
  }

  const Icon = replacing ? Repeat : Undo2;

  return (
    <div className="mt-2.5 space-y-3 rounded-lg border border-slate-200 bg-white p-3.5">
      <p className="flex items-center gap-1.5 text-[13px] font-bold text-slate-900">
        <Icon size={14} aria-hidden="true" />
        {replacing ? `Replace ${unitName}` : `Recall ${unitName}`}
      </p>

      <fieldset>
        <legend className="mb-1.5 text-[12px] font-semibold text-slate-600">Reason</legend>
        <div className="flex flex-wrap gap-1.5">
          {reasons.map((code) => (
            <button
              key={code}
              type="button"
              aria-pressed={reason === code}
              onClick={() => { setReason(code); setError(null); }}
              className={`rounded-full border px-2.5 py-1 text-[12px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 ${
                reason === code
                  ? 'border-emerald-600 bg-emerald-600 text-white'
                  : 'border-slate-200 bg-white text-slate-700 hover:border-emerald-300'
              }`}
            >
              {DISPATCH_CHANGE_REASONS[code]}
            </button>
          ))}
        </div>
      </fieldset>

      <label className="block">
        <span className="mb-1 block text-[12px] font-semibold text-slate-600">
          Note {noteRequired ? '(required)' : '(optional)'}
        </span>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          maxLength={DISPATCH_CHANGE_NOTES_MAX}
          rows={2}
          className="w-full resize-none rounded-lg border border-slate-200 px-3 py-2 text-[13px] text-slate-800 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
          placeholder={replacing ? 'e.g. AMB-2 is 3 minutes closer' : 'e.g. Flat tire on NLEX'}
        />
      </label>

      {replacing && (
        <fieldset>
          <legend className="mb-1.5 text-[12px] font-semibold text-slate-600">
            Replacement unit{unitType ? ` (${resourceTypeLabel(unitType)} listed first)` : ''}
          </legend>
          {unitsLoading ? (
            <p className="text-[12px] text-slate-500">Loading available units…</p>
          ) : replacements.length === 0 ? (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-[12px] font-medium text-amber-800">No unit is available right now.</p>
          ) : (
            <ul className="max-h-48 space-y-1.5 overflow-y-auto pr-1">
              {replacements.map((u) => (
                <li key={u.id}>
                  <button
                    type="button"
                    aria-pressed={newUnitId === u.id}
                    onClick={() => { setNewUnitId(u.id); setError(null); }}
                    className={`w-full rounded-lg border px-3 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 ${
                      newUnitId === u.id ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200 bg-white hover:border-emerald-300'
                    }`}
                  >
                    <span className="block text-[13px] font-bold text-slate-900">{u.call_sign ?? u.name}</span>
                    <span className="block text-[12px] text-slate-500">
                      {resourceTypeLabel(u.resource_type)}{u.base_barangay ? ` · ${u.base_barangay}` : ''}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {chosen && (
            <p className={`mt-2 flex items-center gap-1.5 text-[12px] ${crewNames.length ? 'text-slate-600' : 'font-semibold text-amber-700'}`}>
              <Users size={12} aria-hidden="true" className="shrink-0" />
              {crewNames.length ? `Crew: ${crewNames.join(', ')}` : 'No home crew on duty. Add crew after replacing, or pick another unit.'}
            </p>
          )}
        </fieldset>
      )}

      {error && <p role="alert" className="text-[12px] font-semibold text-red-600">{error}</p>}

      <div className="flex gap-2">
        <Button variant="secondary" size="sm" className="flex-1" onClick={onClose} disabled={busy}>Back</Button>
        <Button
          variant={replacing ? 'primary' : 'danger'}
          size="sm"
          className="flex-1"
          loading={busy}
          disabled={!ready || busy}
          onClick={() => void submit()}
        >
          {replacing ? 'Replace unit' : 'Recall unit'}
        </Button>
      </div>
    </div>
  );
}
