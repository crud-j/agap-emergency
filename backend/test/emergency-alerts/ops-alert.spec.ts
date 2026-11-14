import { ConfigService } from '@nestjs/config';
import { buildOpsSmsPayload, OpsAlertService } from '../../src/emergency-alerts/ops-alert.service';

const INCIDENT = {
  id: 'b1c2d3e4-0000-4000-8000-000000000001',
  public_reference: 'INC-2026-001234',
  category: 'FIRE',
  priority: 'CRITICAL',
  submitted_at: new Date('2026-10-23T02:00:00Z'),
};

function build(env: Record<string, string | undefined>) {
  const smsQueue = { add: jest.fn().mockResolvedValue(undefined) };
  const slaSchedule = { scheduleForIncident: jest.fn().mockResolvedValue(undefined) };
  const config = { get: (key: string) => env[key] } as unknown as ConfigService;
  return { service: new OpsAlertService(config, smsQueue as any, slaSchedule as any), smsQueue, slaSchedule };
}

describe('buildOpsSmsPayload — MOD-17 SMS format', () => {
  it('matches AGAP|reference|lat,lng|unix time|category|C:Y', () => {
    expect(buildOpsSmsPayload(INCIDENT, { lat: 14.79631, lng: 120.92718 }))
      .toBe('AGAP|INC-2026-001234|14.7963,120.9272|1792720800|FIRE|C:Y');
  });

  it('marks a report without GPS with 0,0 and C:N', () => {
    expect(buildOpsSmsPayload(INCIDENT, null)).toBe('AGAP|INC-2026-001234|0,0|1792720800|FIRE|C:N');
  });

  it('always fits one 160-character segment', () => {
    const long = { ...INCIDENT, category: 'X'.repeat(300) };
    expect(buildOpsSmsPayload(long, null).length).toBeLessThanOrEqual(160);
  });
});

describe('OpsAlertService.onIncidentSaved', () => {
  it('queues the MDRRMO SMS and schedules the SLA checks for this incident', async () => {
    const { service, smsQueue, slaSchedule } = build({ MDRRMO_OPS_PHONE: '+639171234567' });
    await service.onIncidentSaved(INCIDENT, { lat: 14.7963, lng: 120.9272 });

    expect(smsQueue.add).toHaveBeenCalledWith('emergency-sms', expect.objectContaining({
      phone: '+639171234567', incidentId: INCIDENT.id,
    }));
    // Priority goes along so the checks run at this incident's own targets (MOD-41).
    expect(slaSchedule.scheduleForIncident).toHaveBeenCalledWith(INCIDENT);
  });

  it('skips the SMS when no MDRRMO phone is configured, but still schedules the SLA checks', async () => {
    const { service, smsQueue, slaSchedule } = build({});
    await service.onIncidentSaved(INCIDENT, null);
    expect(smsQueue.add).not.toHaveBeenCalled();
    expect(slaSchedule.scheduleForIncident).toHaveBeenCalledTimes(1);
  });

  it('never throws when the SMS queue fails (the incident is already saved)', async () => {
    const { service, smsQueue, slaSchedule } = build({ MDRRMO_OPS_PHONE: '+639171234567' });
    smsQueue.add.mockRejectedValue(new Error('redis down'));
    await expect(service.onIncidentSaved(INCIDENT, null)).resolves.toBeUndefined();
    expect(slaSchedule.scheduleForIncident).toHaveBeenCalledTimes(1);
  });
});
