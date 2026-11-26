'use client';

import { useState, type JSX } from 'react';
import { BarChart3, BellRing, Clock, Pencil, Timer, XCircle } from 'lucide-react';
import { Badge, Button, Card, CardHeader, CardTitle, EmptyState, PriorityBadge, Skeleton } from '@/components/ui';
import { titleCase } from '@/lib/incident-format';
import { useSlaPolicies, useUpdateSlaPolicy } from '@/features/sla-policies/hooks';
import type { SlaPolicy } from '@/features/sla-policies/api';
import { formFromPolicy, formatTarget, parseTargetForm, type SlaTargetForm } from '@/features/sla-policies/form';

const STEPS: { key: keyof SlaTargetForm; label: string; hint: string }[] = [
  { key: 'acknowledge', label: 'Acknowledge', hint: 'A dispatcher acknowledges the report' },
  { key: 'dispatch', label: 'Dispatch', hint: 'A unit is dispatched' },
  { key: 'onScene', label: 'First unit on scene', hint: 'The first unit reports on scene' },
];

function secsOf(p: SlaPolicy, key: keyof SlaTargetForm): number {
  return key === 'acknowledge' ? p.acknowledgeSecs : key === 'dispatch' ? p.dispatchSecs : p.onSceneSecs;
}

function AppliesTo({ policy }: { policy: SlaPolicy }): JSX.Element {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {policy.priority ? <PriorityBadge priority={policy.priority} /> : <Badge variant="muted">Any priority</Badge>}
      <span className="text-xs text-agap-textSub">{policy.category ? titleCase(policy.category) : 'Any category'}</span>
      {!policy.isActive && <Badge variant="muted">Inactive</Badge>}
    </div>
  );
}

function PolicyRow({ policy }: { policy: SlaPolicy }): JSX.Element {
  const update = useUpdateSlaPolicy();
  const [form, setForm] = useState<SlaTargetForm | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function save(): void {
    if (!form) return;
    const parsed = parseTargetForm(form);
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    setError(null);
    update.mutate(
      { id: policy.id, body: parsed.body },
      {
        onSuccess: () => {
          setForm(null);
          setSaved(true);
        },
        onError: (err) => setError(err instanceof Error && err.message ? err.message : 'Could not save. Retry.'),
      },
    );
  }

  return (
    <tr className="border-t border-[rgba(168,181,193,0.20)] align-top">
      <td className="py-3 pr-3">
        <AppliesTo policy={policy} />
      </td>
      {STEPS.map((step) => (
        <td key={step.key} className="py-3 pr-3">
          {form ? (
            <label className="flex items-center gap-1.5">
              <span className="sr-only">{step.label} target in minutes</span>
              <input
                type="number"
                inputMode="decimal"
                min={0.5}
                step={0.5}
                value={form[step.key]}
                onChange={(e) => setForm({ ...form, [step.key]: e.target.value })}
                className="h-8 w-20 rounded-lg border border-slate-300 px-2 text-sm tabular-nums focus:border-agap-green focus:outline-none"
              />
              <span className="text-xs text-agap-textSub">min</span>
            </label>
          ) : (
            <span className="text-sm font-semibold tabular-nums text-agap-textMain">{formatTarget(secsOf(policy, step.key))}</span>
          )}
        </td>
      ))}
      <td className="py-3 text-right">
        {form ? (
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => { setForm(null); setError(null); }} disabled={update.isPending}>
              Cancel
            </Button>
            <Button size="sm" onClick={save} loading={update.isPending}>
              Save
            </Button>
          </div>
        ) : (
          <Button size="sm" variant="secondary" onClick={() => { setForm(formFromPolicy(policy)); setSaved(false); }}>
            <Pencil size={14} />
            Edit
          </Button>
        )}
        {error && (
          <p role="alert" className="mt-2 max-w-xs text-left text-xs font-semibold text-agap-danger">
            {error}
          </p>
        )}
        {saved && !form && <p className="mt-2 text-xs text-agap-green">Saved. New targets apply now.</p>}
      </td>
    </tr>
  );
}

/**
 * MOD-41 Response Targets (SLA): the targets the escalation alarm and Analytics use.
 * Supervisor (full page) and System Administrator (Settings tab, `embedded`: no page
 * header); every change is audited (Activity Log).
 */
export function ResponseTargets({ embedded = false }: { embedded?: boolean } = {}): JSX.Element {
  const { data, isLoading, isError } = useSlaPolicies();

  return (
    <div className="space-y-6">
      {!embedded && (
        <div>
          <h1 className="text-2xl font-extrabold text-agap-textMain">Response Targets (SLA)</h1>
          <p className="mt-1 text-sm text-agap-textSub">
            How fast the Operations Center should act on a report, by priority. Measured from the moment the report arrives.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card>
          <div className="flex gap-3">
            <Timer size={18} className="mt-0.5 shrink-0 text-agap-green" />
            <div>
              <p className="text-sm font-bold text-agap-textMain">Three steps are timed</p>
              <p className="mt-1 text-xs leading-relaxed text-agap-textSub">
                Acknowledge, dispatch, and first unit on scene. Each clock starts when the report is submitted, not when the
                previous step ends.
              </p>
            </div>
          </div>
        </Card>
        <Card>
          <div className="flex gap-3">
            <BellRing size={18} className="mt-0.5 shrink-0 text-agap-amber" />
            <div>
              <p className="text-sm font-bold text-agap-textMain">A missed target escalates</p>
              <p className="mt-1 text-xs leading-relaxed text-agap-textSub">
                If an incident is still waiting when a target passes, an escalation is raised and Supervisors are notified
                (acknowledge → Level 1, dispatch → Level 2, on scene → Level 3). See Escalations.
              </p>
            </div>
          </div>
        </Card>
        <Card>
          <div className="flex gap-3">
            <BarChart3 size={18} className="mt-0.5 shrink-0 text-blue-600" />
            <div>
              <p className="text-sm font-bold text-agap-textMain">Analytics measures against them</p>
              <p className="mt-1 text-xs leading-relaxed text-agap-textSub">
                Compliance % on Analytics and in the exports uses these same targets. Incidents still waiting past a target
                count as missed.
              </p>
            </div>
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Targets by priority</CardTitle>
        </CardHeader>
        {isLoading ? (
          <Skeleton className="h-48 w-full" />
        ) : isError || !data ? (
          <EmptyState icon={XCircle} title="Could not load the response targets" description="Check your connection and retry." />
        ) : data.policies.length === 0 ? (
          <EmptyState
            icon={Clock}
            title="No targets set"
            description={`Every incident uses the fallback: acknowledge ${formatTarget(data.fallback.acknowledge)}, dispatch ${formatTarget(data.fallback.dispatch)}, on scene ${formatTarget(data.fallback.onScene)}.`}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left">
              <thead>
                <tr className="text-xs font-semibold uppercase tracking-wide text-agap-textSub">
                  <th className="pb-2 pr-3">Applies to</th>
                  {STEPS.map((s) => (
                    <th key={s.key} className="pb-2 pr-3" title={s.hint}>{s.label}</th>
                  ))}
                  <th className="pb-2" />
                </tr>
              </thead>
              <tbody>
                {data.policies.map((p) => (
                  <PolicyRow key={p.id} policy={p} />
                ))}
              </tbody>
            </table>
          </div>
        )}
        {data && (
          <p className="mt-4 border-t border-[rgba(168,181,193,0.20)] pt-3 text-xs text-agap-textSub">
            When no target matches an incident: acknowledge {formatTarget(data.fallback.acknowledge)}, dispatch{' '}
            {formatTarget(data.fallback.dispatch)}, on scene {formatTarget(data.fallback.onScene)}. A change applies right
            away, including to open incidents, and is recorded in the Activity Log. Targets are for the Operations
            Center&apos;s own speed, not a promise of when help arrives.
          </p>
        )}
      </Card>
    </div>
  );
}
