import * as fs from 'fs';
import * as path from 'path';
import { fitGsm7, gsm7Length, isGsm7, toGsm7 } from '@agap/shared';
import { AUTH_SMS } from '../../src/auth/auth-sms';
import { buildContactAlertSms } from '../../src/emergency-contacts/emergency-contact-notification.service';
import { SMS_OPT_OUT_CONFIRMATION, buildAnnouncementSms } from '../../src/announcements/announcements.service';
import { buildBarangayAlertSms, buildBarangayFollowupSms } from '../../src/barangay-coordination/barangay-notify.service';
import { replyText } from '../../src/barangay-coordination/barangay-reply.service';
import { citizenSosReply } from '../../src/emergency-alerts/sms-sos/citizen-sms-sos.service';

/**
 * Every SMS a person reads: plain GSM-7 (one non-GSM character drops a segment from 160
 * to 70 characters), one segment, no web address (PH carriers drop P2P SMS with one).
 */

const BARANGAY_NAMES: string[] = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '../../../docs/automation/bocaue-barangay-hotlines.json'), 'utf8'),
).barangays.map((b: { name: string }) => b.name);
const CATEGORIES = ['MEDICAL', 'ROAD_ACCIDENT', 'FLOOD', 'NATURAL_DISASTER', 'RESCUE', 'FIRE', 'INDUSTRIAL', 'DEBRIS', 'OTHER'];
const NO_URL = /https?:|www\.|\.(com|ph|net|org)\b/i;

function expectOneSegment(text: string) {
  expect(isGsm7(text)).toBe(true);
  expect(gsm7Length(text)).toBeLessThanOrEqual(160);
  expect(text).not.toMatch(NO_URL);
}

describe('people-facing SMS texts', () => {
  it('account codes put the code first and warn against sharing', () => {
    for (const text of [
      AUTH_SMS.verifyPhone('123456'),
      AUTH_SMS.resetPassword('123456'),
      AUTH_SMS.signIn('123456'),
      AUTH_SMS.secondStep('123456'),
    ]) {
      expectOneSegment(text);
      expect(text).toMatch(/^AGAP code: 123456\. Use it to /);
      expect(text).toContain('Never share it');
    }
    expectOneSegment(AUTH_SMS.locked);
  });

  it('emergency-contact alert: plain type, who, and the reference; only the name is ever shortened', () => {
    expect(buildContactAlertSms('Juan Dela Cruz', 'ROAD_ACCIDENT', 'INC-2026-001234')).toBe(
      'AGAP: Juan Dela Cruz reported an emergency (Road accident) and named you as their emergency contact. MDRRMO has been alerted. Ref INC-2026-001234.',
    );
    for (const category of CATEGORIES) {
      const text = buildContactAlertSms('Ma. Teresa “Tess” Villanueva-Dela Cruz Santiago', category, 'INC-2026-999999');
      expectOneSegment(text);
      expect(text).toMatch(/ Ref INC-2026-999999\.$/);
      expect(text).toMatch(/^AGAP: Ma\. Teresa "Tess"/);
    }
    expect(buildContactAlertSms(null, 'FIRE', 'INC-2026-000001')).toMatch(/^AGAP: Someone reported an emergency \(Fire\)/);
  });

  it('announcement: never loses the STOP line, makes pasted punctuation plain, shortens the summary first', () => {
    const text = buildAnnouncementSms(
      'Forced evacuation — Bocaue River at 11.6 m',
      '“Lolomboy, Bunlo, Igulot and Bambang” residents: go to the nearest evacuation center now… ' + 'x '.repeat(80),
    );
    expectOneSegment(text);
    expect(text).toMatch(/^Bocaue MDRRMO: Forced evacuation - Bocaue River at 11\.6 m\. "Lolomboy/);
    expect(text).toMatch(/\.\.\. Reply STOP to stop these texts\.$/);

    expect(buildAnnouncementSms('Road closed', 'MacArthur Highway northbound is closed until 6 PM.')).toBe(
      'Bocaue MDRRMO: Road closed. MacArthur Highway northbound is closed until 6 PM. Reply STOP to stop these texts.',
    );
    expectOneSegment(buildAnnouncementSms('T'.repeat(200), 'S'.repeat(500)));
    expectOneSegment(SMS_OPT_OUT_CONFIRMATION);
  });

  it('barangay alert and reminder fit for every Bocaue barangay and type, with GPS or without', () => {
    for (const barangayName of BARANGAY_NAMES) {
      for (const category of CATEGORIES) {
        for (const coords of [{ latitude: 14.832214, longitude: 120.949201 }, { latitude: null, longitude: null }]) {
          const text = buildBarangayAlertSms({
            shortCode: '4821', category, barangayName, isApproximate: true, ...coords,
            reference: 'INC-2026-999999', opsPhone: '+639171234567', accessCode: '4821-KXPM', replyCode: '4821',
          });
          expectOneSegment(text);
          expect(text).toContain('Page code 4821-KXPM.');
        }
      }
      expectOneSegment(buildBarangayFollowupSms({
        shortCode: '4821', barangayName, reference: 'INC-2026-999999', opsPhone: '+639171234567', accessCode: '4821-KXPM', replyCode: '4821',
      }));
    }
  });

  it('barangay reply acknowledgements', () => {
    for (const status of ['SEEN', 'ON_THE_WAY', 'ON_SCENE', 'HANDLED', 'NEEDS_BACKUP'] as const) {
      expectOneSegment(replyText('APPLIED', { status, code: '3526', letters: null } as any)!);
    }
    for (const outcome of ['UNPARSED', 'UNKNOWN_CODE', 'NOT_NOTIFIED'] as const) {
      expectOneSegment(replyText(outcome, { status: 'HANDLED', code: '3526', letters: null } as any)!);
    }
  });

  it('citizen SOS replies', () => {
    for (const outcome of ['SOS_CREATED', 'SOS_EXISTING', 'SOS_STALE', 'SOS_INVALID', 'SOS_LIMITED'] as const) {
      for (const hasLocation of [true, false]) expectOneSegment(citizenSosReply({ outcome, reference: 'INC-2026-999999', hasLocation }));
    }
  });
});

describe('GSM-7 helpers', () => {
  it('toGsm7 turns typographic punctuation into plain text and drops what GSM-7 cannot carry', () => {
    expect(toGsm7('“Hi” — it’s 30°C… 🌧️  ok')).toBe('"Hi" - it\'s 30 degC... ok');
    expect(toGsm7('Biñang 1st')).toBe('Biñang 1st');
  });

  it('fitGsm7 cuts at a word and ends with "..."', () => {
    expect(fitGsm7('short', 20)).toBe('short');
    expect(fitGsm7('Go to the nearest evacuation center now', 25)).toBe('Go to the nearest...');
    expect(gsm7Length(fitGsm7('a'.repeat(50), 20))).toBe(20);
  });

  it('gsm7Length counts extension characters twice', () => {
    expect(gsm7Length('a|b')).toBe(4);
    expect(isGsm7('ok €')).toBe(true);
    expect(isGsm7('ok — no')).toBe(false);
  });
});
