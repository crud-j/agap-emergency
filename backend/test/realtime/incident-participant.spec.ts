import { ForbiddenException } from '@nestjs/common';
import { IncidentParticipantService } from '../../src/realtime/incident-participant.service';

function setup(reporterUserId: string | null, crewCount = 0) {
  const prisma = {
    incidentReporter: { findUnique: jest.fn().mockResolvedValue({ user_id: reporterUserId }) },
    dispatch_crew: { count: jest.fn().mockResolvedValue(crewCount) },
  };
  return { service: new IncidentParticipantService(prisma as any), prisma };
}

describe('IncidentParticipantService (shared WS + REST rule)', () => {
  it.each(['DISPATCHER', 'SUPERVISOR', 'SYSTEM_ADMINISTRATOR', 'ORG_ADMINISTRATOR'])(
    '%s is staff without any lookup',
    async (role) => {
      const { service, prisma } = setup(null);
      await expect(service.getParticipation({ id: 'u', role }, 'inc')).resolves.toBe('staff');
      expect(prisma.incidentReporter.findUnique).not.toHaveBeenCalled();
    },
  );

  it('recognises the reporter', async () => {
    const { service } = setup('citizen-1');
    await expect(service.getParticipation({ id: 'citizen-1', role: 'CITIZEN' }, 'inc')).resolves.toBe('reporter');
  });

  it('recognises assigned crew', async () => {
    const { service, prisma } = setup('citizen-1', 1);
    await expect(service.getParticipation({ id: 'resp-1', role: 'RESPONDER' }, 'inc')).resolves.toBe('crew');
    expect(prisma.dispatch_crew.count).toHaveBeenCalledWith({
      where: { user_id: 'resp-1', dispatches: { incident_id: 'inc' } },
    });
  });

  it('rejects another citizen', async () => {
    const { service } = setup('citizen-1');
    await expect(service.getParticipation({ id: 'citizen-2', role: 'CITIZEN' }, 'inc')).resolves.toBeNull();
    await expect(service.assertParticipant({ id: 'citizen-2', role: 'CITIZEN' }, 'inc')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('does not treat a guest report (no reporter account) as owned by anyone', async () => {
    const { service } = setup(null);
    await expect(service.getParticipation({ id: 'citizen-2', role: 'CITIZEN' }, 'inc')).resolves.toBeNull();
  });
});
