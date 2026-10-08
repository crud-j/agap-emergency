'use client';

import { useState, type ReactElement } from 'react';
import { MapPin, User, Users, FileText, Truck, CheckCircle2, Loader2, Siren } from 'lucide-react';
import {
  useIncidentDetail,
  useAvailableUnits,
  useResponders,
  useAcknowledge,
  useAssess,
  useCreateDispatch,
  type Unit,
} from '@/hooks/useDispatch';
import {
  categoryIcon,
  priorityClasses,
  statusClasses,
  titleCase,
  DISPATCHABLE_STATUSES,
} from '@/lib/incident-format';

export function IncidentDetailPanel({ incidentId }: { incidentId: string | null }): ReactElement {
  const { data: incident, isLoading } = useIncidentDetail(incidentId);

  if (!incidentId) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center p-8">
        <Siren className="h-10 w-10 text-slate-700 mb-3" />
        <p className="text-slate-400 font-medium">Select an incident</p>
        <p className="text-slate-600 text-sm mt-1">Choose an emergency from the queue to review and dispatch.</p>
      </div>
    );
  }
  if (isLoading || !incident) {
    return <div className="p-6 text-sm text-slate-500">Loading incident…</div>;
  }

  const Icon = categoryIcon(incident.category);
  const prio = priorityClasses(incident.priority);
  const status = statusClasses(incident.status);
  const loc = incident.incident_locations;
  const address =
    loc?.formatted_address ??
    ([loc?.barangay, loc?.municipality, loc?.province].filter(Boolean).join(', ') ||
      'Address not available');
  const hasCoords = loc?.latitude != null && loc?.longitude != null && Number(loc.latitude) !== 0;
  const hasDispatch = (incident.dispatches?.length ?? 0) > 0;
  const dispatchable = DISPATCHABLE_STATUSES.includes(incident.status);

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {/* Header */}
      <div className="p-5 border-b border-slate-800">
        <div className="flex items-start gap-3">
          <div className={`h-12 w-12 rounded-xl ${prio.bg} flex items-center justify-center`}>
            <Icon className={`h-6 w-6 ${prio.text}`} />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-xl font-bold text-white">{titleCase(incident.category)}</h2>
            <p className="text-xs font-mono text-slate-500">{incident.public_reference}</p>
          </div>
          <div className="flex flex-col items-end gap-1">
            <span className={`text-[11px] font-bold uppercase px-2 py-0.5 rounded ${prio.bg} ${prio.text}`}>
              {titleCase(incident.priority)}
            </span>
            <span className={`text-[11px] font-semibold uppercase px-2 py-0.5 rounded ${status.bg} ${status.text}`}>
              {titleCase(incident.status)}
            </span>
          </div>
        </div>
      </div>

      {/* Info */}
      <div className="p-5 space-y-3">
        <InfoRow icon={MapPin} label="Location">
          <p className="text-slate-200">{address}</p>
          {hasCoords && (
            <p className="text-xs font-mono text-slate-500 mt-0.5">
              {Number(loc!.latitude).toFixed(5)}, {Number(loc!.longitude).toFixed(5)}
            </p>
          )}
        </InfoRow>

        {incident.description && (
          <InfoRow icon={FileText} label="Details">
            <p className="text-slate-200">{incident.description}</p>
          </InfoRow>
        )}

        {incident.number_of_patients != null && (
          <InfoRow icon={Users} label="Patients">
            <p className="text-slate-200">{incident.number_of_patients}</p>
          </InfoRow>
        )}

        <InfoRow icon={User} label="Reporter">
          <p className="text-slate-200">
            {incident.incident_reporters?.is_guest
              ? 'Guest / bystander'
              : incident.incident_reporters?.reporter_name ?? 'Registered citizen'}
          </p>
          {incident.incident_reporters?.reporter_phone && (
            <p className="text-xs text-slate-500 mt-0.5">{incident.incident_reporters.reporter_phone}</p>
          )}
        </InfoRow>
      </div>

      {/* Workflow + dispatch */}
      <div className="mt-auto border-t border-slate-800 p-5">
        {hasDispatch ? (
          <div className="flex items-center gap-2 text-emerald-400">
            <CheckCircle2 className="h-5 w-5" />
            <span className="font-semibold">Unit dispatched — tracking live.</span>
          </div>
        ) : dispatchable ? (
          <AssignUnitPanel incidentId={incident.id} />
        ) : (
          <WorkflowActions incidentId={incident.id} status={incident.status} />
        )}
      </div>
    </div>
  );
}

function InfoRow({
  icon: Icon,
  label,
  children,
}: {
  icon: typeof MapPin;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-3">
      <div className="h-8 w-8 shrink-0 rounded-lg bg-slate-800 flex items-center justify-center">
        <Icon className="h-4 w-4 text-slate-400" />
      </div>
      <div className="min-w-0 flex-1 text-sm">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
        <div className="mt-0.5">{children}</div>
      </div>
    </div>
  );
}

/** Advance SUBMITTED/RECEIVED → ACKNOWLEDGED so the incident becomes dispatchable. */
function WorkflowActions({ incidentId, status }: { incidentId: string; status: string }) {
  const acknowledge = useAcknowledge();
  const assess = useAssess();

  const needsAck = status === 'SUBMITTED' || status === 'RECEIVED';

  return (
    <div className="space-y-2">
      <p className="text-xs text-slate-500">
        Acknowledge this emergency to begin the dispatch workflow.
      </p>
      <button
        onClick={() => (needsAck ? acknowledge : assess).mutate(incidentId)}
        disabled={acknowledge.isPending || assess.isPending}
        className="w-full h-11 rounded-lg bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white font-semibold flex items-center justify-center gap-2 transition-colors"
      >
        {acknowledge.isPending || assess.isPending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : null}
        {needsAck ? 'Acknowledge Incident' : 'Mark Assessed'}
      </button>
    </div>
  );
}

/** MOD-31 — explicit dispatcher authorization: pick a unit + crew, then confirm. */
function AssignUnitPanel({ incidentId }: { incidentId: string }) {
  const { data: units, isLoading: unitsLoading } = useAvailableUnits();
  const { data: responders } = useResponders();
  const createDispatch = useCreateDispatch();

  const [unitId, setUnitId] = useState<string | null>(null);
  const [crewIds, setCrewIds] = useState<string[]>([]);
  const [notes, setNotes] = useState('');

  function toggleCrew(id: string) {
    setCrewIds((prev) => (prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]));
  }

  function authorize() {
    if (!unitId) return;
    createDispatch.mutate({
      incidentId,
      resourceId: unitId,
      ...(crewIds.length ? { initialCrewIds: crewIds } : {}),
      ...(notes.trim() ? { dispatchNotes: notes.trim() } : {}),
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Truck className="h-4 w-4 text-sky-400" />
        <h3 className="font-semibold text-white">Assign a unit</h3>
      </div>

      {/* Available units */}
      {unitsLoading ? (
        <p className="text-sm text-slate-500">Loading available units…</p>
      ) : !units || units.length === 0 ? (
        <p className="text-sm text-amber-400">No units available right now.</p>
      ) : (
        <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
          {units.map((u: Unit) => (
            <button
              key={u.id}
              onClick={() => setUnitId(u.id)}
              className={`w-full text-left px-3 py-2 rounded-lg border transition-colors ${
                unitId === u.id
                  ? 'border-sky-500 bg-sky-500/10'
                  : 'border-slate-700 hover:border-slate-600 bg-slate-800/40'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-100">{u.call_sign ?? u.name}</span>
                <span className="text-[10px] uppercase font-bold text-slate-400">{titleCase(u.resource_type)}</span>
              </div>
              <p className="text-xs text-slate-500">
                {u.name}
                {u.base_barangay ? ` · ${u.base_barangay}` : ''}
              </p>
            </button>
          ))}
        </div>
      )}

      {/* Crew */}
      {responders && responders.length > 0 && (
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">
            Assign crew (receives it on mobile)
          </p>
          <div className="flex flex-wrap gap-1.5">
            {responders.map((r) => (
              <button
                key={r.id}
                onClick={() => toggleCrew(r.id)}
                className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                  crewIds.includes(r.id)
                    ? 'border-emerald-500 bg-emerald-500/15 text-emerald-300'
                    : 'border-slate-700 text-slate-400 hover:border-slate-600'
                }`}
              >
                {r.full_name}
              </button>
            ))}
          </div>
        </div>
      )}

      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Dispatch notes (optional)…"
        rows={2}
        className="w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-sky-500 resize-none"
      />

      {createDispatch.isError && (
        <p className="text-sm text-red-400">
          {(createDispatch.error as Error)?.message ?? 'Dispatch failed. Try another unit.'}
        </p>
      )}

      <button
        onClick={authorize}
        disabled={!unitId || createDispatch.isPending}
        className="w-full h-11 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold flex items-center justify-center gap-2 transition-colors"
      >
        {createDispatch.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Siren className="h-4 w-4" />}
        Authorize Dispatch
      </button>
    </div>
  );
}
