import { BadRequestException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { IncidentPriority, IncidentStatus } from '@agap/shared';
import { DispatchService } from '../../src/dispatch/dispatch.service';
import { SubmitTriageDto } from '../../src/dispatch/dto/submit-triage.dto';

/** POST /dispatch/triage/:incidentId — the dispatcher sets the priority (MOD-24, Rule 8). */
describe('DispatchService.submitTriage', () => {
  function build(status: IncidentStatus) {
    const prisma = {
      incident: {
        findUnique: jest.fn().mockResolvedValue({ id: 'inc-1', status, priority: IncidentPriority.MEDIUM }),
        update: jest.fn().mockResolvedValue({ id: 'inc-1', priority: IncidentPriority.CRITICAL }),
      },
      incidentEvent: { create: jest.fn() },
    };
    const audit = { log: jest.fn().mockResolvedValue(undefined) };
    const realtime = { incidentUpdated: jest.fn() };
    const service = new DispatchService(prisma as any, audit as any, realtime as any, {} as any);
    return { service, prisma, audit };
  }

  it('sets the priority and audits the old and new value', async () => {
    const { service, prisma, audit } = build(IncidentStatus.ACKNOWLEDGED);
    await service.submitTriage(
      { incidentId: 'inc-1', priorityAssessment: IncidentPriority.CRITICAL, notes: 'trapped occupants' },
      'dispatcher-1',
    );
    expect(prisma.incident.update).toHaveBeenCalledWith({ where: { id: 'inc-1' }, data: { priority: 'CRITICAL' } });
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({
      moduleId: 'MOD-25',
      oldValues: { priority: IncidentPriority.MEDIUM },
      newValues: { priority: IncidentPriority.CRITICAL, notes: 'trapped occupants' },
    }));
  });

  it.each([IncidentStatus.CLOSED, IncidentStatus.CANCELLED, IncidentStatus.FALSE_ALERT, IncidentStatus.DUPLICATE])(
    'refuses a %s incident',
    async (status) => {
      const { service, prisma } = build(status);
      await expect(service.submitTriage({ incidentId: 'inc-1', priorityAssessment: IncidentPriority.HIGH }, 'd-1'))
        .rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.incident.update).not.toHaveBeenCalled();
    },
  );
});

describe('SubmitTriageDto', () => {
  it('accepts a body without incidentId (it comes from the route)', async () => {
    expect(await validate(plainToInstance(SubmitTriageDto, { priorityAssessment: 'HIGH' }))).toHaveLength(0);
  });

  it('rejects an unknown priority', async () => {
    const errors = await validate(plainToInstance(SubmitTriageDto, { priorityAssessment: 'URGENT' }));
    expect(errors.map((e) => e.property)).toEqual(['priorityAssessment']);
  });
});
