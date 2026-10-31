import { Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { RealtimeService } from '../realtime/realtime.service';

/**
 * Adds an organization to an incident's participating agencies (MOD-34). The one
 * place this is written: a dispatcher's "Add agency" (IncidentsService.addAgency) and
 * a dispatch of another organization's unit (D5, DispatchService.create) both call it.
 *
 * Idempotent: an organization already on the incident is returned as it is, with no
 * second audit row or event. Only a new row is audited and announced.
 */
export async function addAgencyParticipant(
  deps: { prisma: PrismaService; audit: AuditService; realtime: RealtimeService },
  input: { incidentId: string; organizationId: string; actorId: string; roleInIncident?: string | null },
) {
  const where = {
    incident_id_organization_id: { incident_id: input.incidentId, organization_id: input.organizationId },
  };
  const existing = await deps.prisma.incident_agency_participants.findUnique({ where });
  if (existing) return { participant: existing, added: false };

  let participant;
  try {
    participant = await deps.prisma.incident_agency_participants.create({
      data: {
        incident_id: input.incidentId,
        organization_id: input.organizationId,
        invited_by_id: input.actorId,
        role_in_incident: input.roleInIncident ?? null,
      },
    });
  } catch (err) {
    // Added at the same moment by someone else: theirs stands.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return { participant: await deps.prisma.incident_agency_participants.findUniqueOrThrow({ where }), added: false };
    }
    throw err;
  }

  void deps.audit.log({
    action: 'CREATE',
    actorId: input.actorId,
    entityType: 'incident_agency_participant',
    entityId: participant.id,
    moduleId: 'MOD-34',
    incidentId: input.incidentId,
    newValues: {
      organization_id: input.organizationId,
      ...(input.roleInIncident ? { role_in_incident: input.roleInIncident } : {}),
    },
  });
  deps.realtime.incidentUpdated(input.incidentId, { agencyAdded: input.organizationId });
  return { participant, added: true };
}
