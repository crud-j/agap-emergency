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

  describe('GET /incidents/:id', () => {
    function makeController(participation: 'staff' | 'reporter' | 'crew' | null) {
      const incidents = {
        findById: jest.fn().mockResolvedValue({ id: 'inc-1', status: 'EN_ROUTE' }),
        getReporterSex: jest.fn().mockResolvedValue('FEMALE'),
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

    it.each(['reporter', null] as const)('omits reporter_sex for %s (citizen-facing)', async (participation) => {
      const { controller, incidents } = makeController(participation);
      const result: any = await controller.findOne('inc-1', { user: { id: 'u', role: 'CITIZEN' } });
      expect(result).not.toHaveProperty('reporter_sex');
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
      const prisma = { dispatches: { findUnique: jest.fn().mockResolvedValue(dispatch) } };
      const service = new RespondersService(prisma as any, {} as any, {} as any, new IncidentStatusService());

      const result: any = await service.getAssignment('dispatch-1', 'resp-1');

      expect(result.incidents.reporter_sex).toBeNull();
      expect(result.incidents.incident_reporters).toEqual({ is_guest: false });
      expect(JSON.stringify(result)).not.toContain('PREFER_NOT_TO_SAY');
    });
  });
});
