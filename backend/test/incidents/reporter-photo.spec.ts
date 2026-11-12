import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { AuditAction } from '@agap/shared';
import {
  RESPONDER_PHOTO_CONSENT_TYPE,
  isReporterPhotoWindowOpen,
  reporterPhotoAvailable,
} from '../../src/common/utils/reporter-photo';
import { IncidentsController } from '../../src/incidents/incidents.controller';
import { ReporterPhotoService } from '../../src/incidents/reporter-photo/reporter-photo.service';
import { RespondersService } from '../../src/responders/responders.service';
import { IncidentStatusService } from '../../src/incidents/incident-status/incident-status.service';

const PHOTO_AT = new Date('2026-11-01T00:00:00Z');
const consented = { is_guest: false, users: { profile_photo_updated_at: PHOTO_AT, consent_records: [{ id: 'c-1' }] } };

describe('reporter photo on the map (MOD-01 / MOD-22 / MOD-32, least privilege)', () => {
  describe('reporterPhotoAvailable', () => {
    it('a registered reporter with a photo and consent, on an active incident', () => {
      expect(reporterPhotoAvailable(consented, 'EN_ROUTE')).toBe(true);
      expect(reporterPhotoAvailable(consented, 'SUBMITTED')).toBe(true);
    });

    it('never without consent', () => {
      expect(reporterPhotoAvailable({ ...consented, users: { ...consented.users, consent_records: [] } }, 'EN_ROUTE')).toBe(false);
    });

    it('never without a photo', () => {
      expect(reporterPhotoAvailable({ ...consented, users: { ...consented.users, profile_photo_updated_at: null } }, 'EN_ROUTE')).toBe(false);
    });

    it('never for a guest report or a missing reporter', () => {
      expect(reporterPhotoAvailable({ ...consented, is_guest: true }, 'EN_ROUTE')).toBe(false);
      expect(reporterPhotoAvailable({ is_guest: false, users: null }, 'EN_ROUTE')).toBe(false);
      expect(reporterPhotoAvailable(null, 'EN_ROUTE')).toBe(false);
    });

    it.each(['DRAFT', 'RESOLVED', 'CLOSED', 'CANCELLED', 'FALSE_ALERT', 'DUPLICATE', null])(
      'never once the incident is not active (%p)',
      (status) => {
        expect(isReporterPhotoWindowOpen(status)).toBe(false);
        expect(reporterPhotoAvailable(consented, status)).toBe(false);
      },
    );
  });

  describe('ReporterPhotoService', () => {
    function makeService(incident: unknown) {
      const prisma = { incident: { findUnique: jest.fn().mockResolvedValue(incident) } };
      const media = { getPrivateObject: jest.fn().mockResolvedValue(Buffer.from('jpeg')) };
      const audit = { log: jest.fn().mockResolvedValue(undefined) };
      return { service: new ReporterPhotoService(prisma as any, media as any, audit as any), prisma, media, audit };
    }
    const actor = { id: 'disp-1', role: 'DISPATCHER' };
    const withLocation = {
      status: 'EN_ROUTE',
      incident_reporters: {
        ...consented,
        users: { ...consented.users, profile_photo_location: 'agap-media:profile-photos/u/1.jpg' },
      },
    };

    it('serves the stored photo and audits who saw it, without the storage location', async () => {
      const { service, media, audit } = makeService(withLocation);

      await expect(service.read('inc-1', actor)).resolves.toEqual(Buffer.from('jpeg'));

      expect(media.getPrivateObject).toHaveBeenCalledWith('agap-media:profile-photos/u/1.jpg');
      expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({
        action: AuditAction.READ,
        actorId: 'disp-1',
        entityType: 'ReporterPhoto',
        incidentId: 'inc-1',
      }));
      expect(JSON.stringify(audit.log.mock.calls)).not.toContain('profile-photos');
    });

    it('checks the consent on every request: once withdrawn, 404 and nothing is read', async () => {
      const { service, media, audit } = makeService({
        ...withLocation,
        incident_reporters: { ...withLocation.incident_reporters, users: { ...withLocation.incident_reporters.users, consent_records: [] } },
      });

      await expect(service.read('inc-1', actor)).rejects.toBeInstanceOf(NotFoundException);
      expect(media.getPrivateObject).not.toHaveBeenCalled();
      expect(audit.log).not.toHaveBeenCalled();
    });

    it('404 once the incident is resolved', async () => {
      const { service, media } = makeService({ ...withLocation, status: 'RESOLVED' });
      await expect(service.read('inc-1', actor)).rejects.toBeInstanceOf(NotFoundException);
      expect(media.getPrivateObject).not.toHaveBeenCalled();
    });

    it('404 for an unknown incident', async () => {
      const { service } = makeService(null);
      await expect(service.read('inc-1', actor)).rejects.toBeInstanceOf(NotFoundException);
      await expect(service.isAvailable('inc-1')).resolves.toBe(false);
    });

    it('loads only the active responder-photo consent', async () => {
      const { service, prisma } = makeService(withLocation);
      await service.isAvailable('inc-1');
      const users = prisma.incident.findUnique.mock.calls[0][0].select.incident_reporters.select.users.select;
      expect(users.consent_records.where).toEqual({ consent_type: RESPONDER_PHOTO_CONSENT_TYPE, status: 'GRANTED' });
      expect(users).not.toHaveProperty('full_name');
    });
  });

  function makeController(participation: 'staff' | 'reporter' | 'crew' | null, available = true) {
    const incidents = {
      findById: jest.fn().mockResolvedValue({ id: 'inc-1', status: 'EN_ROUTE', incident_patients: [{ id: 'p-1' }] }),
      findReporterView: jest.fn().mockResolvedValue({ id: 'inc-1', status: 'EN_ROUTE' }),
      getReporterIdVerified: jest.fn().mockResolvedValue(false),
    };
    const reporterPhoto = {
      isAvailable: jest.fn().mockResolvedValue(available),
      read: jest.fn().mockResolvedValue(Buffer.from('jpeg')),
    };
    const participants = { getParticipation: jest.fn().mockResolvedValue(participation) };
    const controller = new IncidentsController(
      incidents as any, {} as any, {} as any, {} as any, {} as any, participants as any,
      {} as any, {} as any, reporterPhoto as any,
    );
    return { controller, incidents, reporterPhoto };
  }

  describe('GET /incidents/:id', () => {
    it.each(['staff', 'crew'] as const)('tells %s whether the reporter photo is available', async (participation) => {
      const { controller } = makeController(participation);
      const result: any = await controller.findOne('inc-1', { user: { id: 'u', role: 'DISPATCHER' } });
      expect(result.reporter_has_photo).toBe(true);
    });

    it('the reporter view has no reporter_has_photo', async () => {
      const { controller, reporterPhoto } = makeController('reporter');
      const result: any = await controller.findOne('inc-1', { user: { id: 'u', role: 'CITIZEN' } });
      expect(result).not.toHaveProperty('reporter_has_photo');
      expect(reporterPhoto.isAvailable).not.toHaveBeenCalled();
    });

    it('staff see the ID check at the incident level, not on a patient', async () => {
      const { controller } = makeController('staff');
      const result: any = await controller.findOne('inc-1', { user: { id: 'u', role: 'DISPATCHER' } });
      expect(result.reporterIdVerified).toBe(false);
      expect(result.incident_patients[0]).toEqual({ id: 'p-1' });
    });

    it.each(['crew', 'reporter'] as const)('%s do not get the ID check', async (participation) => {
      const { controller, incidents } = makeController(participation);
      const result: any = await controller.findOne('inc-1', { user: { id: 'u', role: 'CITIZEN' } });
      expect(result.reporterIdVerified).toBeUndefined();
      expect(incidents.getReporterIdVerified).not.toHaveBeenCalled();
    });
  });

  describe('GET /incidents/:id/reporter-photo', () => {
    const res = () => ({ setHeader: jest.fn() });

    it.each(['staff', 'crew'] as const)('serves %s, never cached', async (participation) => {
      const { controller, reporterPhoto } = makeController(participation);
      const response = res();
      const user = { id: 'u', role: 'RESPONDER' };

      const file = await controller.getReporterPhoto('inc-1', { user }, response as any);

      expect(file).toBeDefined();
      expect(reporterPhoto.read).toHaveBeenCalledWith('inc-1', user);
      expect(response.setHeader).toHaveBeenCalledWith('Cache-Control', 'private, no-store');
    });

    it.each(['reporter', null] as const)('refuses %p before anything is read', async (participation) => {
      const { controller, reporterPhoto } = makeController(participation);
      await expect(
        controller.getReporterPhoto('inc-1', { user: { id: 'u', role: 'CITIZEN' } }, res() as any),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(reporterPhoto.read).not.toHaveBeenCalled();
    });
  });

  describe('responder assignments', () => {
    it('adds incidents.reporter_has_photo and strips the account fields', async () => {
      const dispatch = {
        id: 'dispatch-1',
        dispatch_crew: [{ user_id: 'resp-1' }],
        incidents: { id: 'inc-1', status: 'EN_ROUTE', incident_reporters: consented },
      };
      const prisma = {
        dispatches: {
          findUnique: jest.fn().mockResolvedValue(dispatch),
          count: jest.fn().mockResolvedValue(1),
        },
      };
      const service = new RespondersService(prisma as any, {} as any, {} as any, new IncidentStatusService());

      const result: any = await service.getAssignment('dispatch-1', 'resp-1');

      expect(result.incidents.reporter_has_photo).toBe(true);
      expect(result.incidents.incident_reporters).toEqual({ is_guest: false });
      expect(JSON.stringify(result)).not.toContain('consent_records');
    });
  });
});
