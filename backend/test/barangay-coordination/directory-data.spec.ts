import * as fs from 'fs';
import * as path from 'path';
import { normalizePhPhone } from '@agap/shared';

/**
 * Guards the two data files the barangay alert feature depends on. A bad number
 * or a missing boundary here means a barangay is never alerted, so these checks
 * run in CI rather than being discovered during an emergency.
 */

const AUTOMATION_DIR = path.resolve(__dirname, '../../../docs/automation');
const directory = JSON.parse(
  fs.readFileSync(path.join(AUTOMATION_DIR, 'bocaue-barangay-hotlines.json'), 'utf8'),
);
const boundaries = JSON.parse(
  fs.readFileSync(path.join(AUTOMATION_DIR, 'bocaue-barangay-boundaries.osm.geojson'), 'utf8'),
);

interface Contact {
  raw: string;
  e164: string | null;
  kind: 'MOBILE' | 'LANDLINE' | 'INVALID';
  can_sms: boolean;
  role: 'PRIMARY' | 'BACKUP' | 'OTHER';
  is_demo?: boolean;
  source: string;
  issue?: string;
}
interface Barangay {
  barangay_id: string;
  name: string;
  demo_override?: boolean;
  contacts: Contact[];
  original_contacts?: Contact[];
}
const barangays: Barangay[] = directory.barangays;

describe('barangay hotline directory', () => {
  it('lists exactly the 19 Bocaue barangays, once each', () => {
    expect(barangays).toHaveLength(19);
    expect(new Set(barangays.map((b) => b.barangay_id)).size).toBe(19);
  });

  it('uses the same barangay ids as the boundary file', () => {
    const boundaryIds = boundaries.features.map((f: any) => f.properties.barangay_id).sort();
    expect(barangays.map((b) => b.barangay_id).sort()).toEqual(boundaryIds);
  });

  it('records source provenance and that the numbers are not yet verified', () => {
    expect(directory._meta.source.verified_by_mdrrmo).toBe(false);
    expect(directory._meta.source.posted).toBe('2026-08-29');
    for (const contact of barangays.flatMap((b) => b.contacts)) {
      expect(contact.source).toBeTruthy();
    }
  });

  it.each(barangays.map((b) => [b.name, b] as const))(
    '%s: every stored number matches normalizePhPhone()',
    (_name, barangay) => {
      for (const contact of [...barangay.contacts, ...(barangay.original_contacts ?? [])]) {
        const expected = normalizePhPhone(contact.raw);
        expect({ e164: contact.e164, kind: contact.kind, can_sms: contact.can_sms }).toEqual({
          e164: expected.e164,
          kind: expected.kind,
          can_sms: expected.canSms,
        });
        if (expected.kind === 'INVALID') expect(contact.issue).toBe(expected.issue);
      }
    },
  );

  it.each(barangays.map((b) => [b.name, b] as const))(
    '%s: has a reachable PRIMARY and valid role assignments',
    (_name, barangay) => {
      const active = barangay.contacts.filter((c) => c.kind !== 'INVALID');
      const primaries = active.filter((c) => c.role === 'PRIMARY');
      const backups = active.filter((c) => c.role === 'BACKUP');
      expect(primaries).toHaveLength(1);
      expect(backups.length).toBeLessThanOrEqual(1);
      // Alert targets must be able to receive an SMS.
      for (const target of [...primaries, ...backups]) {
        expect(target.can_sms).toBe(true);
        expect(target.kind).toBe('MOBILE');
      }
      // No number twice in one barangay.
      const numbers = active.map((c) => c.e164);
      expect(new Set(numbers).size).toBe(numbers.length);
    },
  );

  it('keeps the unusable poster numbers out of the alert path', () => {
    const invalid = barangays.flatMap((b) => b.contacts.filter((c) => c.kind === 'INVALID'));
    expect(invalid.map((c) => c.raw).sort()).toEqual(['(044) 07924300', '769-2412']);
    for (const contact of invalid) {
      expect(contact.e164).toBeNull();
      expect(contact.can_sms).toBe(false);
      expect(contact.role).toBe('OTHER');
    }
  });

  it('flags demo data and keeps the real numbers restorable', () => {
    const demoBarangays = barangays.filter((b) => b.demo_override);
    expect(demoBarangays.map((b) => b.barangay_id)).toEqual(['BATIA']);

    for (const barangay of barangays) {
      const demo = barangay.contacts.filter((c) => c.is_demo);
      if (barangay.demo_override) {
        expect(demo).toHaveLength(barangay.contacts.length);
        expect(barangay.original_contacts?.length).toBeGreaterThan(0);
        expect(barangay.original_contacts?.every((c) => !c.is_demo)).toBe(true);
      } else {
        expect(demo).toHaveLength(0);
      }
    }
  });
});

describe('barangay boundary file (OpenStreetMap)', () => {
  it('carries the ODbL attribution', () => {
    expect(boundaries.attribution).toMatch(/OpenStreetMap contributors/);
    expect(boundaries.attribution).toMatch(/ODbL/);
  });

  it('has 19 closed polygons inside the Bocaue area', () => {
    expect(boundaries.features).toHaveLength(19);
    for (const feature of boundaries.features) {
      expect(['Polygon', 'MultiPolygon']).toContain(feature.geometry.type);
      const rings: number[][][] =
        feature.geometry.type === 'Polygon'
          ? [feature.geometry.coordinates[0]]
          : feature.geometry.coordinates.map((p: number[][][]) => p[0]);
      for (const ring of rings) {
        expect(ring.length).toBeGreaterThanOrEqual(4);
        expect(ring[0]).toEqual(ring[ring.length - 1]);
        for (const [lng, lat] of ring) {
          expect(lng).toBeGreaterThan(120.88);
          expect(lng).toBeLessThan(121.0);
          expect(lat).toBeGreaterThan(14.74);
          expect(lat).toBeLessThan(14.87);
        }
      }
    }
  });
});
