import { NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { IncidentStatus } from '@agap/shared';
import { ACTIVE_DISPATCH_STATUSES } from '../incidents/field-report-access';

type Tx = Prisma.TransactionClient;

/** No unit has reached the scene yet, so an incident left without units can wait for a new one. */
const PRE_SCENE_STATUSES: readonly string[] = [IncidentStatus.DISPATCHED, IncidentStatus.EN_ROUTE];

export interface LockedDispatch {
  incidentStatus: string;
  dispatchStatus: string;
  onSceneAt: Date | null;
}

/**
 * Locks the incident, then the dispatch (the order every other writer uses:
 * DispatchService.create, RespondersService.applyStatus, TransportService), and
 * returns both current statuses so the caller decides under the lock.
 */
export async function lockIncidentAndDispatch(tx: Tx, incidentId: string, dispatchId: string): Promise<LockedDispatch> {
  const [incident] = await tx.$queryRaw<Array<{ status: string }>>`
    SELECT status::text AS status FROM incidents WHERE id = ${incidentId}::uuid FOR UPDATE`;
  if (!incident) throw new NotFoundException('Incident not found');
  const [dispatch] = await tx.$queryRaw<Array<{ status: string; on_scene_at: Date | null }>>`
    SELECT status::text AS status, on_scene_at FROM dispatches WHERE id = ${dispatchId}::uuid FOR UPDATE`;
  if (!dispatch) throw new NotFoundException('Dispatch not found');
  return { incidentStatus: incident.status, dispatchStatus: dispatch.status, onSceneAt: dispatch.on_scene_at };
}

export interface ReleaseResult {
  /** The unit was still on this incident and is AVAILABLE again. */
  released: boolean;
  /** Set when the incident went back to DISPATCH_PENDING because no unit is left. */
  revertedTo: IncidentStatus | null;
}

/**
 * After a dispatch leaves the incident (cancelled, replaced or declined), inside
 * the caller's transaction and lock:
 *  - frees the unit, only if it is still assigned to this incident;
 *  - moves the incident back to DISPATCH_PENDING when no other unit is active and
 *    none had reached the scene, so it returns to the dispatch queue instead of
 *    showing "help is on the way" with nobody coming. With `keepStatus` (a
 *    replacement unit is being sent in the same transaction) the status is kept.
 */
export async function releaseDispatchedUnit(
  tx: Tx,
  dispatch: { id: string; incident_id: string; resource_id: string },
  incidentStatus: string,
  opts: { keepStatus?: boolean } = {},
): Promise<ReleaseResult> {
  const freed = await tx.resources.updateMany({
    where: { id: dispatch.resource_id, current_incident_id: dispatch.incident_id },
    data: { status: 'AVAILABLE', current_incident_id: null },
  });

  let revertedTo: IncidentStatus | null = null;
  if (!opts.keepStatus && PRE_SCENE_STATUSES.includes(incidentStatus)) {
    const remaining = await tx.dispatches.count({
      where: { incident_id: dispatch.incident_id, id: { not: dispatch.id }, status: { in: ACTIVE_DISPATCH_STATUSES as any[] } },
    });
    if (remaining === 0) {
      await tx.incident.update({
        where: { id: dispatch.incident_id },
        data: { status: IncidentStatus.DISPATCH_PENDING as any },
      });
      revertedTo = IncidentStatus.DISPATCH_PENDING;
    }
  }

  return { released: freed.count > 0, revertedTo };
}
