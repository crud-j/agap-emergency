import type { ComponentProps } from 'react';
import type { Ionicons } from '@expo/vector-icons';

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
    };

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
 */
export function nextAssignmentActions(
  dispatchStatus: string,
  incidentStatus?: string | null,
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
