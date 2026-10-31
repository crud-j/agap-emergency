import { ConflictException, ForbiddenException } from '@nestjs/common';
import { IncidentStatus, NOTIFICATION_EVENT_TYPES } from '@agap/shared';
import { RespondersService } from '../../src/responders/responders.service';

/** POST /v1/responders/assignments/:id/help-request (plan UNIT_FIELD_FLOW Phase 2, F9). */

const INCIDENT = 'incident-1';
const DISPATCH = 'dispatch-fire';
const CREW = 'crew-fire';
const NOTE = 'Two trapped on the 2nd floor, one burned';

function setup() {
  const prisma = {
    dispatches: {
      findUnique: jest.fn().mockResolvedValue({
        id: DISPATCH,
        incident_id: INCIDENT,
        status: 'ACCEPTED',
        dispatch_crew: [{ user_id: CREW }],
        incidents: { id: INCIDENT, public_reference: 'INC-2026-000321', status: IncidentStatus.ON_SCENE },
      }),
      create: jest.fn(),
    },
    resourceRequest: { create: jest.fn() },
    incidentEvent: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({}),
    },
    user: {
      findMany: jest.fn().mockResolvedValue([
        { id: 'dispatcher-1', full_name: 'D One' },
        { id: 'dispatcher-2', full_name: 'D Two' },
      ]),
    },
  };
  const realtime = { incidentUpdated: jest.fn() };
  const audit = { log: jest.fn().mockResolvedValue(undefined) };
  const notifications = { create: jest.fn().mockResolvedValue({ id: 'n-1' }) };
  const responders = new RespondersService(
    prisma as any,
    realtime as any,
    audit as any,
    {} as any,
    {} as any,
    {} as any,
    undefined,
    notifications as any,
  );
  return { prisma, realtime, audit, notifications, responders };
}

describe('RespondersService.requestHelp', () => {
  it('notifies every dispatcher, writes an incident event and an ops event, and dispatches nothing', async () => {
    const { prisma, realtime, notifications, responders } = setup();

    await expect(responders.requestHelp(DISPATCH, CREW, { need: 'AMBULANCE', count: 2, note: NOTE }))
      .resolves.toEqual({ deduplicated: false, incidentId: INCIDENT });

    expect(notifications.create).toHaveBeenCalledTimes(2);
    expect(notifications.create).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'dispatcher-1',
      eventType: NOTIFICATION_EVENT_TYPES.CREW_HELP_REQUESTED,
      body: 'INC-2026-000321: AMBULANCE (2)',
      incidentId: INCIDENT,
    }));
    expect(prisma.incidentEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ incident_id: INCIDENT, notes: 'Crew asked dispatch for help: AMBULANCE (2)' }),
    });
    expect(realtime.incidentUpdated).toHaveBeenCalledWith(INCIDENT, expect.objectContaining({
      type: NOTIFICATION_EVENT_TYPES.CREW_HELP_REQUESTED, need: 'AMBULANCE', count: 2,
    }));
    // Rule 8: a person decides. No dispatch, no MOD-35 request.
    expect(prisma.dispatches.create).not.toHaveBeenCalled();
    expect(prisma.resourceRequest.create).not.toHaveBeenCalled();
  });

  it('keeps the free-text note out of the notice body, the WS payload, the audit row and the citizen-visible event', async () => {
    const { prisma, realtime, audit, notifications, responders } = setup();

    await responders.requestHelp(DISPATCH, CREW, { need: 'FIRE_UNIT', note: NOTE });

    const notice = notifications.create.mock.calls[0][0];
    expect(notice.body).not.toContain(NOTE);
    expect(notice.title).not.toContain(NOTE);
    // Only the recipient's own notice record holds it (notification.created carries no dataPayload).
    expect(notice.dataPayload).toEqual(expect.objectContaining({ note: NOTE }));
    expect(JSON.stringify(realtime.incidentUpdated.mock.calls)).not.toContain(NOTE);
    expect(JSON.stringify(audit.log.mock.calls)).not.toContain(NOTE);
    expect(JSON.stringify(prisma.incidentEvent.create.mock.calls)).not.toContain(NOTE);
  });

  it('a second request for the same need within 5 minutes is deduplicated: no notice, no event', async () => {
    const { prisma, notifications, realtime, responders } = setup();
    prisma.incidentEvent.findFirst.mockResolvedValue({ id: 'earlier' });

    await expect(responders.requestHelp(DISPATCH, CREW, { need: 'AMBULANCE' }))
      .resolves.toEqual({ deduplicated: true, incidentId: INCIDENT });
    expect(prisma.incidentEvent.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        incident_id: INCIDENT,
        notes: { startsWith: 'Crew asked dispatch for help: AMBULANCE' },
        occurred_at: { gte: expect.any(Date) },
      }),
    }));
    expect(notifications.create).not.toHaveBeenCalled();
    expect(prisma.incidentEvent.create).not.toHaveBeenCalled();
    expect(realtime.incidentUpdated).not.toHaveBeenCalled();
  });

  it('a failed notice never fails the request (the event is already saved)', async () => {
    const { prisma, notifications, responders } = setup();
    notifications.create.mockRejectedValue(new Error('push down'));

    await expect(responders.requestHelp(DISPATCH, CREW, { need: 'MORE_PERSONNEL' }))
      .resolves.toEqual({ deduplicated: false, incidentId: INCIDENT });
    expect(prisma.incidentEvent.create).toHaveBeenCalled();
  });

  it('refuses a responder who is not on the crew, and a finished assignment', async () => {
    const { prisma, responders } = setup();
    await expect(responders.requestHelp(DISPATCH, 'someone-else', { need: 'AMBULANCE' }))
      .rejects.toBeInstanceOf(ForbiddenException);

    prisma.dispatches.findUnique.mockResolvedValueOnce({
      ...(await prisma.dispatches.findUnique()),
      status: 'COMPLETED',
    });
    await expect(responders.requestHelp(DISPATCH, CREW, { need: 'AMBULANCE' }))
      .rejects.toBeInstanceOf(ConflictException);
    expect(prisma.incidentEvent.create).not.toHaveBeenCalled();
  });
});
