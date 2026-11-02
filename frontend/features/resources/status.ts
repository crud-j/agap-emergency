import { ResourceStatus } from '@agap/shared';
import { titleCase } from '@/lib/incident-format';

/** What each unit status is called on the Fleet board and in the Registry. */
const RESOURCE_STATUS_LABEL: Record<ResourceStatus, string> = {
  [ResourceStatus.AVAILABLE]:      'Available',
  [ResourceStatus.DISPATCHED]:     'Dispatched',
  [ResourceStatus.EN_ROUTE]:       'En route',
  [ResourceStatus.ON_SCENE]:       'On scene',
  [ResourceStatus.TRANSPORTING]:   'Transporting',
  [ResourceStatus.RETURNING]:      'Returning',
  [ResourceStatus.RESERVED]:       'Reserved',
  // Maintenance and breakdowns: there is no separate MAINTENANCE status in the database.
  [ResourceStatus.OUT_OF_SERVICE]: 'Out of service (maintenance)',
  [ResourceStatus.OFFLINE]:        'Offline',
};

export function resourceStatusLabel(status: string): string {
  return RESOURCE_STATUS_LABEL[status as ResourceStatus] ?? titleCase(status);
}
