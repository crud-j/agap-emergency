import { readFileSync } from 'fs';
import { join } from 'path';
import {
  citizenIconKind,
  isSignalLost,
  isWestbound,
  priorityRingColor,
  PRIORITY_RING_FALLBACK,
  RESPONDER_SIGNAL_LOST_MS,
} from '@agap/shared';
import { AMBULANCE_ICON_URL, citizenIconFor } from '@/lib/map-icons';

/** PNG width/height live in the IHDR chunk at bytes 16–23 (big-endian). */
function pngSize(path: string): { width: number; height: number } {
  const buf = readFileSync(path);
  expect(buf.subarray(1, 4).toString('ascii')).toBe('PNG');
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

const repoRoot = join(__dirname, '..', '..');

describe('WP4 map icons', () => {
  describe('citizen (reporter) icon selection', () => {
    it('maps MALE / FEMALE to their icons', () => {
      expect(citizenIconKind('MALE')).toBe('male');
      expect(citizenIconKind('FEMALE')).toBe('female');
      expect(citizenIconFor('MALE')).toBe('/map-icons/citizen-male.png');
      expect(citizenIconFor('FEMALE')).toBe('/map-icons/citizen-female.png');
    });

    it.each([null, undefined, 'PREFER_NOT_TO_SAY', 'OTHER', ''])('falls back to the neutral pin for %p', (sex) => {
      expect(citizenIconKind(sex)).toBeNull();
      expect(citizenIconFor(sex)).toBeNull();
    });
  });

  describe('ambulance orientation', () => {
    it.each([
      [0, false], [90, false], [180, false], // north / east / due south: faces right
      [181, true], [270, true], [359, true], // westbound: mirrored
      [360, false], [-90, true], [450, false], // normalised
    ])('heading %p → westbound %p', (heading, expected) => {
      expect(isWestbound(heading)).toBe(expected);
    });

    it('does not mirror when heading is unknown', () => {
      expect(isWestbound(null)).toBe(false);
      expect(isWestbound(undefined)).toBe(false);
      expect(isWestbound(Number.NaN)).toBe(false);
    });
  });

  describe('priority ring colour', () => {
    it('uses the priority palette and a neutral fallback', () => {
      expect(priorityRingColor('CRITICAL')).toBe('#DC2626');
      expect(priorityRingColor('LOW')).toBe('#16A34A');
      expect(priorityRingColor(null)).toBe(PRIORITY_RING_FALLBACK);
      expect(priorityRingColor('UNKNOWN')).toBe(PRIORITY_RING_FALLBACK);
    });
  });

  describe('signal lost', () => {
    const now = Date.parse('2026-10-18T12:00:00Z');
    it('is lost only after 60 s without an update', () => {
      expect(isSignalLost(new Date(now - RESPONDER_SIGNAL_LOST_MS).toISOString(), now)).toBe(false);
      expect(isSignalLost(new Date(now - RESPONDER_SIGNAL_LOST_MS - 1).toISOString(), now)).toBe(true);
      expect(isSignalLost(null, now)).toBe(true);
      expect(isSignalLost('not-a-date', now)).toBe(true);
    });
  });

  describe('generated assets', () => {
    it.each(['ambulance', 'citizen-male', 'citizen-female'])('web %s.png is 128×128', (name) => {
      expect(pngSize(join(repoRoot, 'frontend', 'public', 'map-icons', `${name}.png`))).toEqual({ width: 128, height: 128 });
    });

    it.each(['ambulance', 'citizen-male', 'citizen-female'])('mobile %s has 48 / 96 / 144 px density variants', (name) => {
      const dir = join(repoRoot, 'mobile', 'assets', 'map-icons');
      expect(pngSize(join(dir, `${name}.png`)).width).toBe(48);
      expect(pngSize(join(dir, `${name}@2x.png`)).width).toBe(96);
      expect(pngSize(join(dir, `${name}@3x.png`)).width).toBe(144);
    });

    it('ambulance URL points at the generated web copy', () => {
      expect(AMBULANCE_ICON_URL).toBe('/map-icons/ambulance.png');
    });
  });
});
