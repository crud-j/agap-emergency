import type { ComponentProps } from 'react';
import type { Ionicons } from '@expo/vector-icons';
import { en, type Translations } from '@/src/i18n/translations';
import { ApiError } from '@/src/services/api/http';
import { UNIT_FIELD_FLOWS, type UnitFieldFlow } from '@agap/shared';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

export interface DispatchFieldProgress {
  enRouteAt?: string | null;
  onSceneAt?: string | null;
  fieldDoneAt?: string | null;
  otherUnitsActive?: boolean;
}

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
  | { kind: 'arrive'; label: string; icon: IoniconName }
  /** Open the fire report form (plan Phase 3). Not a status step: it never moves the incident. */
  | { kind: 'fireReport'; label: string; icon: IoniconName }
  /** Open the rescue trip form (plan Phase 4). Not a status step: it never moves the incident. */
  | { kind: 'rescueTrip'; label: string; icon: IoniconName };

const TERMINAL_INCIDENT_STATUSES = new Set([
  'RESOLVED', 'CLOSED', 'CANCELLED', 'FALSE_ALERT', 'DUPLICATE', 'UNABLE_TO_RESPOND', 'REFERRED',
]);

type StatusAction = Extract<NextAction, { kind: 'status' }>;

const RESOLVE_ACTION: StatusAction = {
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

const FINISH_OWN_UNIT_CONFIRM = {
  title: 'Finish your unit’s work?',
  message:
    'Your unit becomes available again. Other units are still working on this incident, ' +
    'so it stays open until the last one finishes.',
};

const POST_SCENE_STATUSES = new Set(['TRANSPORTING', 'ASSISTING']);
const MOVING_STATUSES = new Set(['EN_ROUTE', 'ON_SCENE', 'TRANSPORTING', 'ASSISTING']);

/**
 * This crew's own step. The incident status is the furthest step of any unit, so
 * a second unit reads its dispatch stamps first; past the scene (transport,
 * treating) and at the end, the incident status is what this crew acts on.
 */
function unitStep(incidentStatus: string | null | undefined, progress?: DispatchFieldProgress) {
  if (!progress) return incidentStatus;
  if (incidentStatus && TERMINAL_INCIDENT_STATUSES.has(incidentStatus)) return incidentStatus;
  if (progress.onSceneAt) return incidentStatus && POST_SCENE_STATUSES.has(incidentStatus) ? incidentStatus : 'ON_SCENE';
  if (progress.enRouteAt) return 'EN_ROUTE';
  // No stamps while another unit moved the incident ahead: this unit hasn't left yet.
  // (A dispatch from before per-unit stamps, alone on its incident, still follows the incident.)
  if (progress.otherUnitsActive && incidentStatus && MOVING_STATUSES.has(incidentStatus)) return 'DISPATCHED';
  return incidentStatus;
}

/**
 * The dispatch row only ever moves PENDING/SENT → ACCEPTED → COMPLETED. The
 * responder's field progress (EN_ROUTE → ON_SCENE → TRANSPORTING/ASSISTING →
 * RESOLVED) is recorded on the dispatch and incident by PATCH
 * /responders/assignments/:id/status. Dispatch stamps take precedence so a
 * second unit can advance independently while the incident is already ahead.
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
  progress?: DispatchFieldProgress,
  flow: UnitFieldFlow = UNIT_FIELD_FLOWS.MEDICAL_TRANSPORT,
): NextAction[] {
  if (dispatchStatus === 'PENDING' || dispatchStatus === 'SENT') {
    return [{ kind: 'accept', label: 'Accept Assignment', icon: 'checkmark-circle' }];
  }
  if (dispatchStatus !== 'ACCEPTED') return [];

  const effectiveStatus = unitStep(incidentStatus, progress);
  const resolveAction: StatusAction = progress?.otherUnitsActive
    ? { ...RESOLVE_ACTION, label: 'Finish (your unit)', confirm: FINISH_OWN_UNIT_CONFIRM }
    : RESOLVE_ACTION;
  const finishAction: StatusAction = { ...resolveAction, secondary: true };
  const transportAction: StatusAction = { kind: 'status', label: 'Transporting', status: 'TRANSPORTING', icon: 'car' };
  const assistAction: StatusAction = {
    kind: 'status', label: 'Treating on Scene', status: 'ASSISTING', icon: 'medkit', secondary: true,
  };
  // A fire or rescue crew keeps its own on-scene tools while another unit transports or
  // treats (the incident is then TRANSPORTING / ASSISTING, but this unit is still working).
  const sceneWork: NextAction[] | null =
    flow === UNIT_FIELD_FLOWS.FIRE
      ? [{ kind: 'fireReport', label: 'Fire Report', icon: 'flame' }, finishAction]
      : flow === UNIT_FIELD_FLOWS.RESCUE
        ? [{ kind: 'rescueTrip', label: 'Record Rescue Trip', icon: 'boat' }, finishAction]
        : null;

  switch (effectiveStatus) {
    case 'EN_ROUTE':
      return [{ kind: 'status', label: 'Mark On Scene', status: 'ON_SCENE', icon: 'location' }];
    case 'ON_SCENE':
      if (sceneWork) return sceneWork;
      // Every flow can finish; the server refuses Transporting / Treating to the wrong unit type.
      switch (flow) {
        case UNIT_FIELD_FLOWS.MEDICAL_FIRST:
          return [{ ...assistAction, secondary: false }, finishAction];
        case UNIT_FIELD_FLOWS.GENERAL:
          return [resolveAction];
        default:
          return [transportAction, assistAction];
      }
    case 'TRANSPORTING':
      if (sceneWork) return sceneWork;
      if (transport === undefined) return [];
      if (transport?.open) return [{ kind: 'arrive', label: labels.arrivedAction, icon: 'medical' }];
      return [resolveAction];
    case 'ASSISTING':
      if (sceneWork) return sceneWork;
      // Treated on scene, then needs a hospital (ASSISTING → TRANSPORTING, D4).
      if (flow === UNIT_FIELD_FLOWS.MEDICAL_TRANSPORT) return [resolveAction, { ...transportAction, secondary: true }];
      return [resolveAction];
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
