import type { ComponentProps } from 'react';
import type { Ionicons } from '@expo/vector-icons';
import { en, type Translations } from '@/src/i18n/translations';
import { ApiError } from '@/src/services/api/http';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

export type NextAction =
  | { kind: 'accept'; label: string; icon: IoniconName }
  | {
      kind: 'status';
      label: string;
      status: string;
      icon: IoniconName;
      /** Rendered as an outlined button beside the primary step. */
      secondary?: boolean;
      /** Ask before sending — used for steps that end the crew's field work. */
      confirm?: { title: string; message: string };
    }
  /** Record arrival at the hospital on this crew's open transport (confirmed first). */
  | { kind: 'arrive'; label: string; icon: IoniconName };

const TERMINAL_INCIDENT_STATUSES = new Set([
  'RESOLVED', 'CLOSED', 'CANCELLED', 'FALSE_ALERT', 'DUPLICATE', 'UNABLE_TO_RESPOND', 'REFERRED',
]);

const RESOLVE_ACTION: NextAction = {
  kind: 'status',
  label: 'Mark Resolved',
  status: 'RESOLVED',
  icon: 'checkmark-done-circle',
  confirm: {
    title: 'Mark incident resolved?',
    message:
      'Confirm that field work is finished — the patient was treated, handed over, or no further help is needed. ' +
      'Your unit becomes available again and the dispatcher will close the incident.',
  },
};

/**
 * The dispatch row only ever moves PENDING/SENT → ACCEPTED → COMPLETED. The
 * responder's field progress (EN_ROUTE → ON_SCENE → TRANSPORTING/ASSISTING →
 * RESOLVED) is recorded on the *incident* by PATCH /responders/assignments/:id/status.
 * So once the crew has accepted, the next step must be read from the incident
 * status — reading the dispatch status would leave "Mark En Route" showing forever.
 * The crew can resolve; closing stays the dispatcher's call (MOD-45).
 *
 * While TRANSPORTING, `transport` is this crew's transport: `{ open: true }` →
 * "Arrived at hospital" is the only action (the server refuses Resolve until
 * arrival, 409 TRANSPORT_OPEN); arrived or no record (`{ open: false }` / null) →
 * Mark Resolved; `undefined` = not loaded yet → nothing, so Resolve never flashes.
 */
export function nextAssignmentActions(
  dispatchStatus: string,
  incidentStatus?: string | null,
  transport?: { open: boolean } | null,
  labels: Translations['transport'] = en.transport,
): NextAction[] {
  if (dispatchStatus === 'PENDING' || dispatchStatus === 'SENT') {
    return [{ kind: 'accept', label: 'Accept Assignment', icon: 'checkmark-circle' }];
  }
  if (dispatchStatus !== 'ACCEPTED') return [];

  switch (incidentStatus) {
    case 'EN_ROUTE':
      return [{ kind: 'status', label: 'Mark On Scene', status: 'ON_SCENE', icon: 'location' }];
    case 'ON_SCENE':
      return [
        { kind: 'status', label: 'Transporting', status: 'TRANSPORTING', icon: 'car' },
        { kind: 'status', label: 'Treating on Scene', status: 'ASSISTING', icon: 'medkit', secondary: true },
      ];
    case 'TRANSPORTING':
      if (transport === undefined) return [];
      if (transport?.open) return [{ kind: 'arrive', label: labels.arrivedAction, icon: 'medical' }];
      return [RESOLVE_ACTION];
    case 'ASSISTING':
      return [RESOLVE_ACTION];
    default:
      if (incidentStatus && TERMINAL_INCIDENT_STATUSES.has(incidentStatus)) return [];
      return [{ kind: 'status', label: 'Mark En Route', status: 'EN_ROUTE', icon: 'navigate' }];
  }
}

/**
 * Location is shared from the moment the crew accepts until the incident ends.
 * Shared by the assignment screen and the Map tab so both agree on when the
 * citizen can see the responder.
 */
export function shouldShareLocation(
  dispatchStatus: string,
  incidentStatus?: string | null,
): boolean {
  if (dispatchStatus !== 'ACCEPTED') return false;
  return !(incidentStatus && TERMINAL_INCIDENT_STATUSES.has(incidentStatus));
}

/** The server refused Resolve because this crew's transport has no arrival yet (Prompt 08). */
export function isTransportOpenError(err: unknown): boolean {
  if (!(err instanceof ApiError) || err.status !== 409) return false;
  return (err.body as { code?: unknown } | undefined)?.code === 'TRANSPORT_OPEN';
}
