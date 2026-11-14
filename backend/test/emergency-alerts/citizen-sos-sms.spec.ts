import { CITIZEN_SOS_SMS_MAX, encodeCitizenSosSms, IncidentType, parseCitizenSosSms } from '@agap/shared';

const ID = '3f2b8c1e-9a4d-4e7f-8b2a-1c5d6e7f8a9b';
const NOW = new Date('2026-11-14T08:00:00Z');
const UNIX = Math.floor(NOW.getTime() / 1000);

describe('citizen SOS SMS format', () => {
  it('round-trips a report with GPS', () => {
    const text = encodeCitizenSosSms({
      eventId: ID,
      type: IncidentType.ROAD_ACCIDENT,
      coords: { lat: 14.798772, lng: 120.926541 },
      sentAt: NOW,
      trigger: 'SHAKE_GESTURE',
    });
    expect(text).toBe(`AGAP|${ID}|14.79877,120.92654|${UNIX}|ROAD_ACCIDENT|C:Y|T:K`);
    expect(parseCitizenSosSms(text, NOW)).toEqual({
      ok: true,
      value: { eventId: ID, type: 'ROAD_ACCIDENT', coords: { lat: 14.79877, lng: 120.92654 }, sentAt: NOW, trigger: 'SHAKE_GESTURE' },
    });
  });

  it('carries "no GPS" as 0,0 and C:N', () => {
    const text = encodeCitizenSosSms({ eventId: ID, type: IncidentType.FLOOD, coords: null, sentAt: NOW, trigger: 'SOS_BUTTON' });
    expect(text).toBe(`AGAP|${ID}|0,0|${UNIX}|FLOOD|C:N|T:S`);
    const parsed = parseCitizenSosSms(text, NOW);
    expect(parsed).toMatchObject({ ok: true, value: { coords: null, trigger: 'SOS_BUTTON' } });
  });

  it('always fits one SMS segment, even with the longest type and negative coordinates', () => {
    const text = encodeCitizenSosSms({
      eventId: ID,
      type: IncidentType.NATURAL_DISASTER,
      coords: { lat: -89.123456, lng: -179.123456 },
      sentAt: NOW,
      trigger: 'MANUAL_REPORT',
    });
    expect(text.length).toBeLessThanOrEqual(CITIZEN_SOS_SMS_MAX);
  });

  it('keeps the event id exactly as sent (it must match the HTTPS resend key)', () => {
    const upper = ID.toUpperCase();
    const parsed = parseCitizenSosSms(`AGAP|${upper}|0,0|${UNIX}|MEDICAL|C:N`, NOW);
    expect(parsed).toMatchObject({ ok: true, value: { eventId: upper, trigger: 'MANUAL_REPORT' } });
  });

  it('tolerates spaces and a lowercase prefix/type', () => {
    const parsed = parseCitizenSosSms(`  agap| ${ID} |14.8,120.93|${UNIX}|fire|c:y|t:s \n`, NOW);
    expect(parsed).toMatchObject({ ok: true, value: { type: 'FIRE', coords: { lat: 14.8, lng: 120.93 } } });
  });

  it.each([
    ['DONE 1234'],
    ['STOP'],
    ['Hello AGAP|'],
    [`AGAP|INC-2026-001234|14.5995,120.9842|${UNIX}|FIRE|C:Y`],
  ])('returns null for text that is not a citizen SOS: %s', (body) => {
    expect(parseCitizenSosSms(body, NOW)).toBeNull();
  });

  it.each([
    ['too few fields', `AGAP|${ID}|0,0|${UNIX}|FIRE`, 'FIELDS'],
    ['too many fields', `AGAP|${ID}|0,0|${UNIX}|FIRE|C:N|T:S|x`, 'FIELDS'],
    ['bad id', `AGAP|not-a-uuid|0,0|${UNIX}|FIRE|C:N`, 'EVENT_ID'],
    ['unknown type', `AGAP|${ID}|0,0|${UNIX}|EARTHQUAKE|C:N`, 'TYPE'],
    ['bad time', `AGAP|${ID}|0,0|yesterday|FIRE|C:N`, 'TIME'],
    ['time in the future', `AGAP|${ID}|0,0|${UNIX + 3600}|FIRE|C:N`, 'TIME'],
    ['bad coords', `AGAP|${ID}|abc,def|${UNIX}|FIRE|C:Y`, 'COORDS'],
    ['coords out of range', `AGAP|${ID}|95.1,120.9|${UNIX}|FIRE|C:Y`, 'COORDS'],
    ['C:Y with 0,0', `AGAP|${ID}|0,0|${UNIX}|FIRE|C:Y`, 'COORDS'],
    ['bad coord flag', `AGAP|${ID}|0,0|${UNIX}|FIRE|C:X`, 'FIELDS'],
    ['bad trigger', `AGAP|${ID}|0,0|${UNIX}|FIRE|C:N|T:Z`, 'FIELDS'],
  ])('rejects %s', (_label, body, reason) => {
    expect(parseCitizenSosSms(body, NOW)).toEqual({ ok: false, reason });
  });

  it('accepts a phone clock a few minutes fast', () => {
    expect(parseCitizenSosSms(`AGAP|${ID}|0,0|${UNIX + 300}|FIRE|C:N`, NOW)).toMatchObject({ ok: true });
  });
});
