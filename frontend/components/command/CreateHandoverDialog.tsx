'use client';

import { useState, type JSX } from 'react';
import { ArrowRightLeft } from 'lucide-react';
import {
  Button,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui';
import { titleCase } from '@/lib/incident-format';
import { useCreateHandover, useHandoverRecipients } from '@/features/incidents/command-hooks';

/**
 * MOD-44 — Create Handover. The incoming operator is picked by name from the
 * Dispatchers and Supervisors who can sign in (GET /incidents/handover/recipients).
 * Used by Multi-Agency → Handover and Command / ICS → Handover panel.
 */
export function CreateHandoverDialog({
  incidentId,
  open,
  onClose,
}: {
  incidentId: string;
  open: boolean;
  onClose: () => void;
}): JSX.Element {
  const [toUserId, setToUserId] = useState('');
  const [summary, setSummary] = useState('');
  const [actionsText, setActionsText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const create = useCreateHandover();
  const recipients = useHandoverRecipients(open);

  async function handleSubmit() {
    if (!toUserId || !summary.trim()) {
      setError('Choose the incoming operator and write a situation summary.');
      return;
    }
    const pendingActions = actionsText.split('\n').map(s => s.trim()).filter(Boolean);
    try {
      setError(null);
      await create.mutateAsync({
        incidentId,
        data: { toUserId, situationSummary: summary, pendingActions },
      });
      setToUserId(''); setSummary(''); setActionsText('');
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Handover failed.');
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowRightLeft size={16} className="text-agap-green" /> Create Handover
          </DialogTitle>
          <DialogDescription>
            Transfer situational awareness to an incoming operator. A handover is incomplete until the incoming user acknowledges.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-agap-textSub uppercase tracking-wide mb-1.5">
              Incoming operator <span className="text-agap-danger">*</span>
            </label>
            <Select value={toUserId} onValueChange={setToUserId}>
              <SelectTrigger aria-label="Incoming operator">
                <SelectValue placeholder={recipients.isLoading ? 'Loading…' : 'Choose a dispatcher or supervisor'} />
              </SelectTrigger>
              <SelectContent>
                {(recipients.data ?? []).map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.full_name} · {titleCase(u.role)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {recipients.data?.length === 0 && (
              <p className="mt-1 text-xs text-agap-textSub">No other active dispatcher or supervisor.</p>
            )}
          </div>
          <div>
            <label className="block text-xs font-semibold text-agap-textSub uppercase tracking-wide mb-1.5">
              Situation Summary <span className="text-agap-danger">*</span>
            </label>
            <textarea
              rows={3}
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="Current situation, responder positions, notable hazards…"
              className="w-full rounded-xl border border-[rgba(168,181,193,0.20)] bg-white px-3 py-2 text-sm text-agap-textMain placeholder:text-agap-textSub focus:outline-none focus:ring-2 focus:ring-agap-green resize-none"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-agap-textSub uppercase tracking-wide mb-1.5">
              Pending Actions <span className="text-agap-textSub font-normal normal-case">(one per line, optional)</span>
            </label>
            <textarea
              rows={3}
              value={actionsText}
              onChange={(e) => setActionsText(e.target.value)}
              placeholder="Await BFP ETD confirmation.&#10;Notify hospital of patient count."
              className="w-full rounded-xl border border-[rgba(168,181,193,0.20)] bg-white px-3 py-2 text-sm text-agap-textMain placeholder:text-agap-textSub focus:outline-none focus:ring-2 focus:ring-agap-green resize-none"
            />
          </div>
          {error && <p className="text-xs text-agap-danger">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={create.isPending} onClick={handleSubmit}>
            Create Handover
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
