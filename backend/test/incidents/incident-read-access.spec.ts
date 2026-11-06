import { ForbiddenException } from '@nestjs/common';
import { IncidentsController } from '../../src/incidents/incidents.controller';
import { IncidentsService } from '../../src/incidents/incidents.service';

/**
 * Object-level access on incident reads (MOD-47/48, least privilege). Found on a
 * shared phone: a guest report's id, still in memory, was fetched with another
 * account's token and GET /incidents/:id returned patients, assessments and the
 * reporter's phone to a user who was not part of the incident.
 */

type Participation = 'staff' | 'crew' | 'reporter' | null;

function makeController(participation: Participation) {
  const incidents = {
    findById: jest.fn().mockResolvedValue({ id: 'inc-1', status: 'TRANSPORTING', barangay_notices: [] }),
    findReporterView: jest.fn().mockResolvedValue({ id: 'inc-1', status: 'TRANSPORTING' }),
    getReporterSex: jest.fn().mockResolvedValue(null),
    getReporterIdVerified: jest.fn().mockResolvedValue(null),
    listEvents: jest.fn().mockResolvedValue([]),
    getTimeline: jest.fn().mockResolvedValue({ timeline: [] }),
    getResolution: jest.fn().mockResolvedValue({ outcome: 'TRANSPORTED' }),
    listAssessments: jest.fn().mockResolvedValue([]),
  };
  const participants = { getParticipation: jest.fn().mockResolvedValue(participation) };
  const transport = { listTransports: jest.fn().mockResolvedValue([]) };
  const controller = new IncidentsController(
    incidents as any, {} as any, {} as any, {} as any, transport as any, participants as any,
  );
  return { controller, incidents, participants, transport };
}

const req = { user: { id: 'user-1', role: 'CITIZEN' } };

/** route → [controller call, the service read it guards, who may call it] */
const ROUTES: Array<[string, (c: IncidentsController) => Promise<unknown>, keyof ReturnType<typeof makeController>['incidents'], Participation[]]> = [
  ['GET :id/events', (c) => c.listEvents('inc-1', req), 'listEvents', ['staff', 'crew']],
  ['GET :id/timeline', (c) => c.timeline('inc-1', req), 'getTimeline', ['staff', 'crew', 'reporter']],
  ['GET :id/resolution', (c) => c.getResolution('inc-1', req), 'getResolution', ['staff', 'crew']],
  ['GET :id/assessments', (c) => c.listAssessments('inc-1', req), 'listAssessments', ['staff', 'crew']],
];

describe('incident read access', () => {
  describe.each(ROUTES)('%s', (_route, call, read, allowed) => {
    it.each<Participation>(['staff', 'crew', 'reporter', null])('participation %p', async (participation) => {
      const { controller, incidents, participants } = makeController(participation);

      if (allowed.includes(participation)) {
        await expect(call(controller)).resolves.toBeDefined();
        expect(incidents[read]).toHaveBeenCalledWith('inc-1');
      } else {
        await expect(call(controller)).rejects.toThrow(new ForbiddenException('You do not have access to this incident'));
        expect(incidents[read]).not.toHaveBeenCalled();
      }
      expect(participants.getParticipation).toHaveBeenCalledWith({ id: 'user-1', role: 'CITIZEN' }, 'inc-1');
    });
  });

  describe('GET :id', () => {
    it('a non-participant gets 403 before anything is read', async () => {
      const { controller, incidents } = makeController(null);
      await expect(controller.findOne('inc-1', req)).rejects.toThrow(ForbiddenException);
      expect(incidents.findById).not.toHaveBeenCalled();
      expect(incidents.findReporterView).not.toHaveBeenCalled();
    });

    it('the reporter gets the reporter view, never the full record', async () => {
      const { controller, incidents } = makeController('reporter');
      await controller.findOne('inc-1', req);
      expect(incidents.findReporterView).toHaveBeenCalledWith('inc-1');
      expect(incidents.findById).not.toHaveBeenCalled();
    });

    it.each(['staff', 'crew'] as const)('%s gets the full record', async (participation) => {
      const { controller, incidents } = makeController(participation);
      await controller.findOne('inc-1', req);
      expect(incidents.findById).toHaveBeenCalledWith('inc-1');
      expect(incidents.findReporterView).not.toHaveBeenCalled();
    });
  });

  // Transport records carry patient names and the hospital. The write routes already
  // check crew; the list did not, so any responder could read any incident's transports.
  describe('GET :id/transport', () => {
    const asRole = (role: string) => ({ user: { id: 'user-1', role } });

    it.each<[string, Participation]>([
      ['RESPONDER', null],
      ['RESPONDER', 'reporter'],
      ['CITIZEN', 'reporter'],
    ])('%s with participation %p gets 403 before anything is read', async (role, participation) => {
      const { controller, transport } = makeController(participation);
      await expect(controller.listTransports('inc-1', asRole(role))).rejects.toThrow(
        new ForbiddenException('You do not have access to this incident'),
      );
      expect(transport.listTransports).not.toHaveBeenCalled();
    });

    it.each<[string, Participation]>([
      ['RESPONDER', 'crew'],
      ['DISPATCHER', 'staff'],
      ['SUPERVISOR', 'staff'],
    ])('%s with participation %p reads the list', async (role, participation) => {
      const { controller, transport, participants } = makeController(participation);
      await expect(controller.listTransports('inc-1', asRole(role))).resolves.toEqual([]);
      expect(participants.getParticipation).toHaveBeenCalledWith({ id: 'user-1', role }, 'inc-1');
      expect(transport.listTransports).toHaveBeenCalledWith('inc-1', { id: 'user-1', role });
    });

    it('a hospital user is not a participant; the service scopes them to their own facilities', async () => {
      const { controller, transport, participants } = makeController(null);
      await controller.listTransports('inc-1', asRole('HOSPITAL_USER'));
      expect(participants.getParticipation).not.toHaveBeenCalled();
      expect(transport.listTransports).toHaveBeenCalledWith('inc-1', { id: 'user-1', role: 'HOSPITAL_USER' });
    });
  });

  describe('IncidentsService.findReporterView', () => {
    const FORBIDDEN_RELATIONS = [
      'incident_reporters', 'incident_patients', 'incident_details', 'incident_attachments',
      'on_scene_assessments', 'dispatches', 'barangay_notices', 'incident_resolutions', 'notifications',
    ];

    function serviceWith(row: unknown) {
      const prisma = { incident: { findUnique: jest.fn().mockResolvedValue(row) } };
      const service = Object.create(IncidentsService.prototype) as IncidentsService;
      (service as any).prisma = prisma;
      return { service, prisma };
    }

    it('selects an allow-list only: no patient, assessment, contact, dispatch or note field', async () => {
      const { service, prisma } = serviceWith({
        id: 'inc-1', status: 'TRANSPORTING',
        incident_locations: { latitude: '14.7993000', longitude: '120.9266000', barangay: 'Igulot' },
        incident_events: [],
      });

      await service.findReporterView('inc-1');

      const args = prisma.incident.findUnique.mock.calls[0][0];
      expect(args).not.toHaveProperty('include');
      for (const relation of FORBIDDEN_RELATIONS) expect(args.select).not.toHaveProperty(relation);
      expect(args.select.incident_events.select).toEqual({ from_status: true, to_status: true, occurred_at: true });
      expect(args.select.incident_locations.select).not.toHaveProperty('accuracy_meters');
    });

    it('returns coordinates as numbers', async () => {
      const { service } = serviceWith({
        id: 'inc-1', incident_locations: { latitude: '14.7993000', longitude: '120.9266000' }, incident_events: [],
      });
      const view: any = await service.findReporterView('inc-1');
      expect(view.incident_locations).toMatchObject({ latitude: 14.7993, longitude: 120.9266 });
    });

    it('404 when the incident does not exist', async () => {
      const { service } = serviceWith(null);
      await expect(service.findReporterView('missing')).rejects.toThrow('Incident missing not found');
    });
  });
});
