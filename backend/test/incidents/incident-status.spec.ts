import { BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { IncidentStatusService } from '../../src/incidents/incident-status/incident-status.service';
import { IncidentStatus } from '@agap/shared';

describe('IncidentStatusService', () => {
  let service: IncidentStatusService;

  beforeEach(() => {
    service = new IncidentStatusService();
  });

  describe('validateTransition', () => {
    it('allows valid transitions along the lifecycle', () => {
      expect(() => service.validateTransition(IncidentStatus.RECEIVED, IncidentStatus.ACKNOWLEDGED)).not.toThrow();
      expect(() => service.validateTransition(IncidentStatus.ACKNOWLEDGED, IncidentStatus.ASSESSED)).not.toThrow();
      expect(() => service.validateTransition(IncidentStatus.EN_ROUTE, IncidentStatus.ON_SCENE)).not.toThrow();
      expect(() => service.validateTransition(IncidentStatus.ON_SCENE, IncidentStatus.RESOLVED)).not.toThrow();
      expect(() => service.validateTransition(IncidentStatus.RESOLVED, IncidentStatus.CLOSED)).not.toThrow();
    });

    it('rejects invalid transitions', () => {
      expect(() => service.validateTransition(IncidentStatus.SUBMITTED, IncidentStatus.CLOSED)).toThrow();
      expect(() => service.validateTransition(IncidentStatus.CLOSED, IncidentStatus.SUBMITTED)).toThrow();
      expect(() => service.validateTransition(IncidentStatus.EN_ROUTE, IncidentStatus.SUBMITTED)).toThrow();
    });

    it('rejects any transition from terminal states', () => {
      expect(() => service.validateTransition(IncidentStatus.CLOSED, IncidentStatus.ACKNOWLEDGED)).toThrow();
      expect(() => service.validateTransition(IncidentStatus.FALSE_ALERT, IncidentStatus.SUBMITTED)).toThrow();
      expect(() => service.validateTransition(IncidentStatus.DUPLICATE, IncidentStatus.ACKNOWLEDGED)).toThrow();
    });

    it('allows cancellation from early states', () => {
      expect(() => service.validateTransition(IncidentStatus.SUBMITTED, IncidentStatus.CANCELLED)).not.toThrow();
      expect(() => service.validateTransition(IncidentStatus.ACKNOWLEDGED, IncidentStatus.CANCELLED)).not.toThrow();
    });

    it('allows the dispatch progression from operational states', () => {
      expect(() => service.validateTransition(IncidentStatus.DISPATCH_PENDING, IncidentStatus.DISPATCHED)).not.toThrow();
      expect(() => service.validateTransition(IncidentStatus.DISPATCHED, IncidentStatus.EN_ROUTE)).not.toThrow();
    });
  });

  describe('isTerminal', () => {
    it('identifies terminal states', () => {
      expect(service.isTerminal(IncidentStatus.CLOSED)).toBe(true);
      expect(service.isTerminal(IncidentStatus.FALSE_ALERT)).toBe(true);
      expect(service.isTerminal(IncidentStatus.DUPLICATE)).toBe(true);
      expect(service.isTerminal(IncidentStatus.CANCELLED)).toBe(true);
    });

    it('identifies non-terminal states', () => {
      expect(service.isTerminal(IncidentStatus.SUBMITTED)).toBe(false);
      expect(service.isTerminal(IncidentStatus.RESOLVED)).toBe(false);
      expect(service.isTerminal(IncidentStatus.EN_ROUTE)).toBe(false);
    });
  });

  describe('statusTimestampFields', () => {
    const at = new Date('2026-10-26T01:00:00.000Z');

    it('sets the column for statuses that have one', () => {
      expect(service.statusTimestampFields(IncidentStatus.ON_SCENE, at)).toEqual({ on_scene_at: at });
      expect(service.statusTimestampFields(IncidentStatus.RESOLVED, at)).toEqual({ resolved_at: at });
      expect(service.statusTimestampFields(IncidentStatus.ACKNOWLEDGED, at)).toEqual({ acknowledged_at: at });
      expect(service.statusTimestampFields(IncidentStatus.CLOSED, at)).toEqual({ closed_at: at });
    });

    it('sets nothing for TRANSPORTING and ASSISTING (no column)', () => {
      expect(service.statusTimestampFields(IncidentStatus.TRANSPORTING, at)).toEqual({});
      expect(service.statusTimestampFields(IncidentStatus.ASSISTING, at)).toEqual({});
    });
  });

  describe('recordTransition', () => {
    const at = new Date('2026-10-26T01:00:00.000Z');
    const updatedRow = { id: 'inc-1', status: IncidentStatus.ON_SCENE };

    function tx() {
      return {
        incident: { update: jest.fn().mockResolvedValue(updatedRow) },
        incidentEvent: { create: jest.fn().mockResolvedValue({}) },
      };
    }

    it('updates status + timestamp only if the status is still `from`, writes the event, returns the row', async () => {
      const client = tx();
      const result = await service.recordTransition(client as any, {
        incidentId: 'inc-1', from: IncidentStatus.EN_ROUTE, to: IncidentStatus.ON_SCENE,
        actorId: 'user-1', actorRole: 'RESPONDER', notes: 'arrived', at,
      });

      expect(result).toBe(updatedRow);
      expect(client.incident.update).toHaveBeenCalledWith({
        where: { id: 'inc-1', status: IncidentStatus.EN_ROUTE },
        data: { status: IncidentStatus.ON_SCENE, on_scene_at: at },
      });
      expect(client.incidentEvent.create).toHaveBeenCalledWith({
        data: {
          incident_id: 'inc-1',
          from_status: IncidentStatus.EN_ROUTE,
          to_status: IncidentStatus.ON_SCENE,
          triggered_by_id: 'user-1',
          triggered_by_role: 'RESPONDER',
          notes: 'arrived',
        },
      });
    });

    it('writes no timestamp column for TRANSPORTING', async () => {
      const client = tx();
      await service.recordTransition(client as any, {
        incidentId: 'inc-1', from: IncidentStatus.ON_SCENE, to: IncidentStatus.TRANSPORTING, actorId: 'user-1', at,
      });
      expect(client.incident.update.mock.calls[0][0].data).toEqual({ status: IncidentStatus.TRANSPORTING });
      expect(client.incidentEvent.create.mock.calls[0][0].data).toMatchObject({ triggered_by_role: null, notes: null });
    });

    it('throws on an invalid transition before any write', async () => {
      const client = tx();
      await expect(service.recordTransition(client as any, {
        incidentId: 'inc-1', from: IncidentStatus.ASSISTING, to: IncidentStatus.TRANSPORTING, actorId: 'user-1',
      })).rejects.toThrow(BadRequestException);
      expect(client.incident.update).not.toHaveBeenCalled();
      expect(client.incidentEvent.create).not.toHaveBeenCalled();
    });

    it('returns 409 INCIDENT_STATUS_CHANGED when the status moved concurrently, and writes no event', async () => {
      const client = tx();
      client.incident.update.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('No record was found for an update.', { code: 'P2025', clientVersion: 'test' }),
      );

      const error = await service.recordTransition(client as any, {
        incidentId: 'inc-1', from: IncidentStatus.ON_SCENE, to: IncidentStatus.TRANSPORTING, actorId: 'user-1',
      }).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ConflictException);
      expect((error as ConflictException).getResponse()).toMatchObject({ code: 'INCIDENT_STATUS_CHANGED' });
      expect(client.incidentEvent.create).not.toHaveBeenCalled();
    });

    it('rethrows other database errors unchanged', async () => {
      const client = tx();
      const failure = new Error('connection lost');
      client.incident.update.mockRejectedValue(failure);
      await expect(service.recordTransition(client as any, {
        incidentId: 'inc-1', from: IncidentStatus.ON_SCENE, to: IncidentStatus.TRANSPORTING, actorId: 'user-1',
      })).rejects.toBe(failure);
    });
  });
});
