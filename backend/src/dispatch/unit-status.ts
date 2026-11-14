import { Prisma } from '@prisma/client';

type Tx = Prisma.TransactionClient;

/** Mission steps a unit moves through, in order. Never set by hand (MISSION_RESOURCE_STATUSES). */
const MISSION_RANK: Record<string, number> = {
  DISPATCHED: 0,
  EN_ROUTE: 1,
  ON_SCENE: 2,
  TRANSPORTING: 3,
};

export type MissionStep = 'EN_ROUTE' | 'ON_SCENE' | 'TRANSPORTING';

/** A unit status change to broadcast (resource.status_changed) after the transaction commits. */
export interface UnitStatusChange {
  resourceId: string;
  previousStatus: string;
  newStatus: MissionStep;
}

/**
 * The fleet board follows the crew: when the crew reports En route, On scene (or
 * treating on scene) or starts a transport, its unit takes that status. Only forward
 * (a late "En route" never pulls an on-scene unit back), and only while the unit is
 * still on this incident (a recalled or replaced unit is left alone). Inside the
 * caller's transaction; returns the change to announce, or null.
 */
export async function advanceMissionUnit(
  tx: Tx,
  dispatch: { resource_id: string; incident_id: string },
  to: MissionStep,
): Promise<UnitStatusChange | null> {
  const unit = await tx.resources.findUnique({
    where: { id: dispatch.resource_id },
    select: { status: true, current_incident_id: true },
  });
  if (!unit || unit.current_incident_id !== dispatch.incident_id) return null;
  const from = String(unit.status);
  const fromRank = MISSION_RANK[from];
  if (fromRank === undefined || fromRank >= MISSION_RANK[to]!) return null;
  await tx.resources.update({ where: { id: dispatch.resource_id }, data: { status: to } });
  return { resourceId: dispatch.resource_id, previousStatus: from, newStatus: to };
}
