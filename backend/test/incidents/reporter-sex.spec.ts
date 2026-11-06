import { reporterSexFrom, toReporterSex } from '../../src/common/utils/reporter-sex';
import { IncidentsController } from '../../src/incidents/incidents.controller';
import { RespondersService } from '../../src/responders/responders.service';
import { IncidentStatusService } from '../../src/incidents/incident-status/incident-status.service';

describe('reporter_sex exposure (WP3.6, least privilege)', () => {
  describe('reporterSexFrom', () => {
    it('passes MALE / FEMALE through', () => {
      expect(reporterSexFrom({ is_guest: false, users: { sex: 'MALE' } })).toBe('MALE');
      expect(reporterSexFrom({ is_guest: false, users: { sex: 'FEMALE' } })).toBe('FEMALE');
    });

    it('maps PREFER_NOT_TO_SAY and never-asked to null', () => {
      expect(reporterSexFrom({ is_guest: false, users: { sex: 'PREFER_NOT_TO_SAY' } })).toBeNull();
      expect(reporterSexFrom({ is_guest: false, users: { sex: null } })).toBeNull();
      expect(toReporterSex('OTHER')).toBeNull();
    });

    it('is always null for guest reports and missing reporters', () => {
      expect(reporterSexFrom({ is_guest: true, users: { sex: 'FEMALE' } })).toBeNull();
      expect(reporterSexFrom({ is_guest: false, users: null })).toBeNull();
      expect(reporterSexFrom(null)).toBeNull();
    });
  });

  describe('GET /incidents/:id: the reporter\'s ID check (plan §8)', () => {
    function makeController(participation: 'staff' | 'reporter' | 'crew') {
      const incidents = {
        findById: jest.fn().mockResolvedValue({ id: 'inc-1', incident_patients: [{ id: 'p-1' }] }),
        findReporterView: jest.fn().mockResolvedValue({ id: 'inc-1' }),
        getReporterSex: jest.fn().mockResolvedValue(null),
        getReporterIdVerified: jest.fn().mockResolvedValue(false),
      };
      const participants = { getParticipation: jest.fn().mockResolvedValue(participation) };
      const controller = new IncidentsController(
        incidents as any, {} as any, {} as any, {} as any, {} as any, participants as any,
      );
      return { controller, incidents };
    }

    it('staff see it at the incident level, about the reporter, and on no patient', async () => {
      const { controller } = makeController('staff');
      const result: any = await controller.findOne('inc-1', { user: { id: 'u-1', role: 'DISPATCHER' } } as any);
      expect(result.reporterIdVerified).toBe(false);
      expect(result.incident_patients[0]).toEqual({ id: 'p-1' });
    });

    it.each(['crew', 'reporter'] as const)('%s do not get it', async (participation) => {
      const { controller, incidents } = makeController(participation);
      const result: any = await controller.findOne('inc-1', { user: { id: 'u-1', role: 'CITIZEN' } } as any);
      expect(result.reporterIdVerified).toBeUndefined();
      expect(incidents.getReporterIdVerified).not.toHaveBeenCalled();
    });
  });

  describe('GET /incidents/:id', () => {
    function makeController(participation: 'staff' | 'reporter' | 'crew' | null) {
      const incidents = {
        findById: jest.fn().mockResolvedValue({ id: 'inc-1', status: 'EN_ROUTE' }),
        findReporterView: jest.fn().mockResolvedValue({ id: 'inc-1', status: 'EN_ROUTE' }),
        getReporterSex: jest.fn().mockResolvedValue('FEMALE'),
        getReporterIdVerified: jest.fn().mockResolvedValue(true),
      };
      const participants = { getParticipation: jest.fn().mockResolvedValue(participation) };
      const controller = new IncidentsController(
        incidents as any, {} as any, {} as any, {} as any, {} as any, participants as any,
      );
      return { controller, incidents };
    }

    it.each(['staff', 'crew'] as const)('includes reporter_sex for %s', async (participation) => {
      const { controller } = makeController(participation);
      const result: any = await controller.findOne('inc-1', { user: { id: 'u', role: 'DISPATCHER' } });
      expect(result.reporter_sex).toBe('FEMALE');
    });

    it('omits reporter_sex for the reporter (citizen-facing view)', async () => {
      const { controller, incidents } = makeController('reporter');
      const result: any = await controller.findOne('inc-1', { user: { id: 'u', role: 'CITIZEN' } });
      expect(result).not.toHaveProperty('reporter_sex');
      expect(incidents.getReporterSex).not.toHaveBeenCalled();
    });

    it('refuses a signed-in user who is not staff, crew or the reporter', async () => {
      const { controller, incidents } = makeController(null);
      await expect(controller.findOne('inc-1', { user: { id: 'u', role: 'CITIZEN' } })).rejects.toThrow(
        'You do not have access to this incident',
      );
      expect(incidents.getReporterSex).not.toHaveBeenCalled();
    });
  });

  describe('responder assignments', () => {
    it('adds incidents.reporter_sex and strips the raw users.sex', async () => {
      const dispatch = {
        id: 'dispatch-1',
        dispatch_crew: [{ user_id: 'resp-1' }],
        incidents: {
          id: 'inc-1',
          incident_reporters: { is_guest: false, users: { sex: 'PREFER_NOT_TO_SAY' } },
        },
      };
      const prisma = {
        dispatches: {
          findUnique: jest.fn().mockResolvedValue(dispatch),
          count: jest.fn().mockResolvedValue(1),
        },
      };
      const service = new RespondersService(prisma as any, {} as any, {} as any, new IncidentStatusService());

      const result: any = await service.getAssignment('dispatch-1', 'resp-1');

      expect(result.incidents.reporter_sex).toBeNull();
      expect(result.incidents.incident_reporters).toEqual({ is_guest: false });
      expect(JSON.stringify(result)).not.toContain('PREFER_NOT_TO_SAY');
    });
  });
});
