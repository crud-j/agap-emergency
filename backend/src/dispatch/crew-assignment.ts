import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ACTIVE_DISPATCH_STATUSES } from '../incidents/field-report-access';

type Tx = Prisma.TransactionClient;

/**
 * Refuse crew who already ride an active unit (PENDING, SENT or ACCEPTED dispatch) on
 * ANY incident: one person can't be on two vehicles. Responder availability has no
 * "busy" state (it is the responder's own on/off-duty switch), so this is the check.
 * Call inside the dispatch transaction, after locking the responders' availability rows.
 */
export async function assertCrewFree(tx: Tx, userIds: readonly string[], incidentId: string): Promise<void> {
  if (userIds.length === 0) return;
  const busy = await tx.dispatch_crew.findFirst({
    where: {
      user_id: { in: [...userIds] },
      dispatches: { status: { in: ACTIVE_DISPATCH_STATUSES as any[] } },
    },
    select: {
      users: { select: { full_name: true } },
      dispatches: {
        select: {
          incident_id: true,
          resources: { select: { name: true, call_sign: true } },
          incidents: { select: { public_reference: true } },
        },
      },
    },
  });
  if (!busy) return;

  const who = busy.users?.full_name ?? 'A responder';
  const unit = busy.dispatches.resources?.call_sign ?? busy.dispatches.resources?.name ?? 'another unit';
  if (busy.dispatches.incident_id === incidentId) {
    throw new ConflictException({
      code: 'RESPONDER_ALREADY_ON_INCIDENT',
      message: `${who} is already crewing ${unit} on this incident.`,
    });
  }
  throw new ConflictException({
    code: 'RESPONDER_ON_ASSIGNMENT',
    message:
      `${who} is already crewing ${unit} on ${busy.dispatches.incidents?.public_reference ?? 'another incident'}. ` +
      'Choose someone else, or recall that unit first.',
  });
}
