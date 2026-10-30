import * as fs from 'fs';
import * as path from 'path';
import { redactForAi } from '../../src/ai-assist/redact';
import {
  BARANGAY_REPLY_INSTRUCTIONS,
  BARANGAY_REPLY_JSON_SCHEMA,
  BARANGAY_REPLY_LABELS,
  BarangayReplySchema,
} from '../../src/ai-assist/prompts/barangay-reply.prompt';
import { BARANGAY_LINK_STATUSES } from '../../src/barangay-coordination/dto/barangay-callback.dto';
import { parseBarangayReply } from '../../src/barangay-coordination/barangay-reply.parser';

/** AUTOMATION_NEEDS_PLAN Phase 3 (C4): what goes to Gemini, and the fixtures it is measured on. */

describe('redactForAi', () => {
  it.each([
    ['09171234567'],
    ['+639171234567'],
    ['0917-123-4567'],
    ['0917 123 4567'],
    ['639171234567'],
  ])('removes the PH mobile %s', (phone) => {
    expect(redactForAi(`tawag kayo sa ${phone} po`)).toBe('tawag kayo sa [removed] po');
  });

  it('removes emails, coordinates and long ID-like numbers', () => {
    expect(redactForAi('email kap.juan@example.com')).toBe('email [removed]');
    expect(redactForAi('nandito kami 14.83221, 120.94920')).toBe('nandito kami [location removed]');
    expect(redactForAi('plate 123456789')).toBe('plate [removed]');
  });

  it('keeps ordinary text, short numbers and 4-digit case codes', () => {
    expect(redactForAi('OTW 4821, 5 mins')).toBe('OTW 4821, 5 mins');
  });

  it('caps the length and handles empty input', () => {
    expect(redactForAi('x'.repeat(900), 500)).toHaveLength(500);
    expect(redactForAi(null)).toBe('');
    expect(redactForAi(undefined)).toBe('');
  });
});

describe('BarangayReplySchema and the Gemini JSON schema', () => {
  it('have the same status values: the barangay statuses plus UNCLEAR', () => {
    const zodValues = BarangayReplySchema.shape.status.options;
    expect([...BARANGAY_REPLY_JSON_SCHEMA.properties.status.enum]).toEqual([...zodValues]);
    expect([...zodValues]).toEqual([...BARANGAY_LINK_STATUSES, 'UNCLEAR']);
    expect(BARANGAY_REPLY_JSON_SCHEMA.required).toEqual(['status', 'confidence', 'english']);
  });

  it('name every label in the instructions', () => {
    for (const label of BARANGAY_REPLY_LABELS) expect(BARANGAY_REPLY_INSTRUCTIONS).toContain(`${label}:`);
  });
});

describe('barangay reply fixtures', () => {
  interface Fixture { id: string; path: 'RULE' | 'AI'; body: string; expected: string; acceptable?: string[] }
  const file = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/barangay-replies.json'), 'utf8'));
  const replies: Fixture[] = file.replies;
  const ai = replies.filter((r) => r.path === 'AI');

  it('cover the plan: at least 30 free-text replies, 5 asking for help, some unclear, some exact codes', () => {
    expect(ai.length).toBeGreaterThanOrEqual(30);
    expect(ai.filter((r) => r.expected === 'NEEDS_BACKUP').length).toBeGreaterThanOrEqual(5);
    expect(ai.filter((r) => r.expected === 'UNCLEAR').length).toBeGreaterThanOrEqual(3);
    expect(replies.filter((r) => r.path === 'RULE').length).toBeGreaterThanOrEqual(3);
    for (const label of BARANGAY_REPLY_LABELS) expect(ai.some((r) => r.expected === label)).toBe(true);
  });

  it('use only known labels, and unique ids', () => {
    expect(file.labels).toEqual([...BARANGAY_REPLY_LABELS]);
    for (const r of replies) {
      expect(BARANGAY_REPLY_LABELS).toContain(r.expected);
      for (const a of r.acceptable ?? []) expect(BARANGAY_REPLY_LABELS).toContain(a);
    }
    expect(new Set(replies.map((r) => r.id)).size).toBe(replies.length);
  });

  it('never accept a calm reading for a request for help (the eval counts that as critical)', () => {
    for (const r of ai.filter((x) => x.expected === 'NEEDS_BACKUP')) {
      for (const a of r.acceptable ?? []) expect(a).toBe('UNCLEAR');
    }
  });

  it('exact codes are read by the rule parser, so they never reach Gemini', () => {
    for (const r of replies.filter((x) => x.path === 'RULE')) {
      expect({ id: r.id, status: parseBarangayReply(r.body)?.status }).toEqual({ id: r.id, status: r.expected });
    }
  });

  it('every AI fixture is one the rule parser cannot read (it is what reaches Gemini)', () => {
    for (const r of ai) expect({ id: r.id, parsed: parseBarangayReply(r.body) }).toEqual({ id: r.id, parsed: null });
  });

  it('carry no real phone number once redacted', () => {
    for (const r of ai) expect(redactForAi(r.body)).not.toMatch(/(\+?63|0)9\d{9}/);
  });
});
