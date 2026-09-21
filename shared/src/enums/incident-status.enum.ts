export enum IncidentStatus {
  DRAFT = 'DRAFT',
  SUBMITTED = 'SUBMITTED',
  RECEIVED = 'RECEIVED',
  ACKNOWLEDGED = 'ACKNOWLEDGED',
  ASSESSED = 'ASSESSED',
  DISPATCH_PENDING = 'DISPATCH_PENDING',
  DISPATCHED = 'DISPATCHED',
  EN_ROUTE = 'EN_ROUTE',
  ON_SCENE = 'ON_SCENE',
  TRANSPORTING = 'TRANSPORTING',
  ASSISTING = 'ASSISTING',
  RESOLVED = 'RESOLVED',
  CLOSED = 'CLOSED',
  CANCELLED = 'CANCELLED',
  FALSE_ALERT = 'FALSE_ALERT',
  DUPLICATE = 'DUPLICATE',
  UNABLE_TO_RESPOND = 'UNABLE_TO_RESPOND',
  REFERRED = 'REFERRED',
}

export const TERMINAL_INCIDENT_STATUSES: ReadonlySet<IncidentStatus> = new Set([
  IncidentStatus.CLOSED,
  IncidentStatus.FALSE_ALERT,
  IncidentStatus.DUPLICATE,
  IncidentStatus.CANCELLED,
]);

export const INCIDENT_STATUS_TRANSITIONS: Readonly<
  Record<IncidentStatus, readonly IncidentStatus[]>
> = {
  [IncidentStatus.DRAFT]: [IncidentStatus.SUBMITTED, IncidentStatus.CANCELLED],
  [IncidentStatus.SUBMITTED]: [IncidentStatus.RECEIVED, IncidentStatus.CANCELLED],
  [IncidentStatus.RECEIVED]: [
    IncidentStatus.ACKNOWLEDGED,
    IncidentStatus.CANCELLED,
    IncidentStatus.DUPLICATE,
  ],
  [IncidentStatus.ACKNOWLEDGED]: [
    IncidentStatus.ASSESSED,
    IncidentStatus.FALSE_ALERT,
    IncidentStatus.CANCELLED,
    IncidentStatus.DUPLICATE,
  ],
  [IncidentStatus.ASSESSED]: [
    IncidentStatus.DISPATCH_PENDING,
    IncidentStatus.FALSE_ALERT,
    IncidentStatus.CANCELLED,
    IncidentStatus.DUPLICATE,
    IncidentStatus.REFERRED,
  ],
  [IncidentStatus.DISPATCH_PENDING]: [
    IncidentStatus.DISPATCHED,
    IncidentStatus.UNABLE_TO_RESPOND,
    IncidentStatus.CANCELLED,
  ],
  [IncidentStatus.DISPATCHED]: [IncidentStatus.EN_ROUTE, IncidentStatus.UNABLE_TO_RESPOND],
  [IncidentStatus.EN_ROUTE]: [IncidentStatus.ON_SCENE, IncidentStatus.UNABLE_TO_RESPOND],
  [IncidentStatus.ON_SCENE]: [
    IncidentStatus.TRANSPORTING,
    IncidentStatus.ASSISTING,
    IncidentStatus.RESOLVED,
  ],
  [IncidentStatus.TRANSPORTING]: [IncidentStatus.RESOLVED],
  [IncidentStatus.ASSISTING]: [IncidentStatus.RESOLVED],
  [IncidentStatus.RESOLVED]: [IncidentStatus.CLOSED],
  [IncidentStatus.UNABLE_TO_RESPOND]: [IncidentStatus.DISPATCH_PENDING],
  [IncidentStatus.REFERRED]: [IncidentStatus.CLOSED],
  [IncidentStatus.CLOSED]: [],
  [IncidentStatus.CANCELLED]: [],
  [IncidentStatus.FALSE_ALERT]: [],
  [IncidentStatus.DUPLICATE]: [],
};
