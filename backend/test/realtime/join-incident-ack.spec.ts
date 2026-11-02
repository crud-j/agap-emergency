import { AgapGateway } from '../../src/realtime/agap.gateway';

/**
 * `join:incident` acknowledgement (testing-errors plan Phase 4, step 6). Clients that
 * pass an ack get `{ ok }`; the `error` event older clients rely on is unchanged.
 */
describe('AgapGateway join:incident ack', () => {
  const participants = { getParticipation: jest.fn(), isStaff: jest.fn() };
  const gateway = new AgapGateway({} as any, participants as any, {} as any);

  function client(user?: { sub: string; role: string }) {
    return { id: 'sock-1', data: { user }, emit: jest.fn(), join: jest.fn() };
  }

  beforeEach(() => jest.clearAllMocks());

  it('acks ok and joins the room for a participant', async () => {
    participants.getParticipation.mockResolvedValue({ kind: 'CREW' });
    const c = client({ sub: 'u-1', role: 'RESPONDER' });

    await expect(gateway.handleJoinIncident(c as any, { incidentId: 'inc-1' })).resolves.toEqual({ ok: true });
    expect(c.join).toHaveBeenCalledWith('incident:inc-1');
    expect(c.emit).not.toHaveBeenCalled();
  });

  it('acks NOT_PARTICIPANT and still emits the error event', async () => {
    participants.getParticipation.mockResolvedValue(null);
    const c = client({ sub: 'u-2', role: 'CITIZEN' });

    await expect(gateway.handleJoinIncident(c as any, { incidentId: 'inc-1' }))
      .resolves.toEqual({ ok: false, reason: 'NOT_PARTICIPANT' });
    expect(c.join).not.toHaveBeenCalled();
    expect(c.emit).toHaveBeenCalledWith('error', 'Forbidden: not a participant of this incident');
  });

  it('acks UNAUTHORIZED for an unauthenticated socket and still emits the error event', async () => {
    const c = client(undefined);

    await expect(gateway.handleJoinIncident(c as any, { incidentId: 'inc-1' }))
      .resolves.toEqual({ ok: false, reason: 'UNAUTHORIZED' });
    expect(c.emit).toHaveBeenCalledWith('error', 'Unauthorized');
    expect(participants.getParticipation).not.toHaveBeenCalled();
  });

  it('never returns an `event` key, which Nest would emit instead of acking', async () => {
    participants.getParticipation.mockResolvedValue({ kind: 'STAFF' });
    const result = await gateway.handleJoinIncident(client({ sub: 'u-3', role: 'DISPATCHER' }) as any, { incidentId: 'inc-1' });
    expect(result).not.toHaveProperty('event');
  });
});
