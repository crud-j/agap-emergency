/// <reference types="jest" />
import { Linking } from 'react-native';
import { IncidentType, parseCitizenSosSms } from '@agap/shared';
import { ApiError, NetworkError } from '../../api/http';
import { buildSosSmsBody, openSosSms, smsCanHelp, sosSmsUrl } from '../sos-sms';

// MOD-17/19: the "Send by SMS" fallback when the report cannot go over data.

const KEY = '3f2b8c1e-9a4d-4e7f-8b2a-1c5d6e7f8a9b';
const NOW = new Date('2026-11-14T08:00:00Z');

describe('buildSosSmsBody', () => {
  it('encodes the draft so the server reads back the same event id, type and position', () => {
    const body = buildSosSmsBody(
      { idempotencyKey: KEY, type: IncidentType.FLOOD, triggerMethod: 'SOS_BUTTON', location: { lat: 14.7963, lng: 120.9272 } },
      NOW,
    )!;
    expect(body.length).toBeLessThanOrEqual(160);
    expect(parseCitizenSosSms(body, NOW)).toEqual({
      ok: true,
      value: { eventId: KEY, type: 'FLOOD', coords: { lat: 14.7963, lng: 120.9272 }, sentAt: NOW, trigger: 'SOS_BUTTON' },
    });
  });

  it('sends "no GPS" when there is no fix', () => {
    const body = buildSosSmsBody({ idempotencyKey: KEY, type: IncidentType.MEDICAL, triggerMethod: 'SHAKE_GESTURE', location: null }, NOW)!;
    expect(body).toContain('|0,0|');
    expect(body).toContain('|C:N|T:K');
  });

  it('is null without an event id or type', () => {
    expect(buildSosSmsBody({ idempotencyKey: null, type: IncidentType.FIRE, triggerMethod: 'SOS_BUTTON', location: null })).toBeNull();
    expect(buildSosSmsBody({ idempotencyKey: KEY, type: null, triggerMethod: 'SOS_BUTTON', location: null })).toBeNull();
  });
});

describe('sosSmsUrl', () => {
  it('uses ?body= on Android and &body= on iOS, with the text encoded', () => {
    expect(sosSmsUrl('09171234567', 'AGAP|a b', 'android')).toBe('sms:09171234567?body=AGAP%7Ca%20b');
    expect(sosSmsUrl('09171234567', 'AGAP|a b', 'ios')).toBe('sms:09171234567&body=AGAP%7Ca%20b');
  });
});

describe('openSosSms', () => {
  it('reports whether a messages app took the link', async () => {
    const open = jest.spyOn(Linking, 'openURL');
    open.mockResolvedValueOnce(true);
    await expect(openSosSms('09171234567', 'AGAP|x')).resolves.toBe(true);
    open.mockRejectedValueOnce(new Error('no handler'));
    await expect(openSosSms('09171234567', 'AGAP|x')).resolves.toBe(false);
    open.mockRestore();
  });
});

describe('smsCanHelp', () => {
  it('offers SMS for connection problems and server errors only', () => {
    expect(smsCanHelp(new NetworkError())).toBe(true);
    expect(smsCanHelp(new Error('Aborted'))).toBe(true);
    expect(smsCanHelp(new ApiError('down', 503))).toBe(true);
    expect(smsCanHelp(new ApiError('timeout', 408))).toBe(true);
    expect(smsCanHelp(new ApiError('limit', 429))).toBe(false);
    expect(smsCanHelp(new ApiError('outside Bocaue', 400))).toBe(false);
  });
});
