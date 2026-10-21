#!/usr/bin/env node
/*
  Re-send the barangay alert SMS (with the status-page access code) for an existing
  incident, followed by the coordinates-only text, exactly as the backend sends them.

  Run from the backend folder (or anywhere):
    node ..\scripts\dev\send-barangay-link.js INC-2026-000021
    node ..\scripts\dev\send-barangay-link.js INC-2026-000021 --dry-run      show the SMS, send nothing
    node ..\scripts\dev\send-barangay-link.js INC-2026-000021 --to +639171234567

  Defaults: the recipients are the incident barangay's active SMS contacts, DEMO numbers
  only. Texting a real barangay number needs --real, so a test can never reach a real
  barangay by accident.

  No web address goes in the text: PH carriers drop P2P SMS containing one. The access code
  is the notice's 4-digit code + 4 letters from HMAC("access-code:" + notice id), the same
  recipe as backend/src/barangay-coordination/barangay-link.service.ts. Keep the two in step.
*/
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = path.resolve(__dirname, '..', '..');
const { Client } = require(path.join(root, 'backend', 'node_modules', 'pg'));

function loadEnv() {
  const env = {};
  const text = fs.readFileSync(path.join(root, 'backend', '.env'), 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return env;
}

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const option = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const reference = args.find((a) => /^INC-\d{4}-\d+$/i.test(a))?.toUpperCase();
if (!reference) {
  console.error('Usage: node send-barangay-link.js INC-2026-000021 [--dry-run] [--base <url>] [--to <+63…>] [--real]');
  process.exit(1);
}

const env = loadEnv();
const MAX = 160;

const CODE_LETTERS = 'ABCDEFGHJKMNPQRSTUVWXYZ';

function accessCode(notice) {
  const dedicated = (env.BARANGAY_LINK_SECRET || '').trim();
  const key =
    dedicated || crypto.createHmac('sha256', env.JWT_SECRET).update('agap-barangay-link-v1').digest('hex');
  const bytes = crypto.createHmac('sha256', key).update(`access-code:${notice.id}`).digest();
  const letters = Array.from(bytes.subarray(0, 4), (b) => CODE_LETTERS[b % CODE_LETTERS.length]).join('');
  return `${notice.short_code}-${letters}`;
}

function coordinates(loc) {
  const lat = Number(loc?.latitude);
  const lng = Number(loc?.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) return null;
  return `${lat.toFixed(5)},${lng.toFixed(5)}`;
}

function compose({ notice, incident, loc, code, ops }) {
  const where = coordinates(loc) ?? 'no GPS';
  const brgy = `Brgy ${notice.barangay_name}${notice.is_approximate ? ' (approx)' : ''}`;
  const core = `AGAP ${notice.short_code} ${incident.category} ${brgy} ${where} ${incident.public_reference}.`;
  const withCode = code ? `${core} Code ${code}.` : core;
  const candidates = [ops ? `${withCode} Call MDRRMO ${ops}` : withCode, withCode, core];
  const fit = candidates.find((c) => c.length < MAX);
  if (!fit) throw new Error(`Message is ${core.length} chars; must be under ${MAX}`);
  return fit;
}

(async () => {
  const db = new Client({ connectionString: env.DATABASE_URL.replace(/\?.*$/, '') });
  await db.connect();
  try {
    const inc = (
      await db.query(
        `select i.id, i.public_reference, i.category, i.status,
                l.latitude, l.longitude
           from incidents i left join incident_locations l on l.incident_id = i.id
          where i.public_reference = $1`,
        [reference],
      )
    ).rows[0];
    if (!inc) throw new Error(`No incident ${reference}`);

    const notice = (
      await db.query(
        `select n.id, n.short_code, n.barangay_id, n.is_approximate, n.closed_at, g.name as barangay_name
           from incident_barangay_notices n join geo_regions g on g.id = n.barangay_id
          where n.incident_id = $1`,
        [inc.id],
      )
    ).rows[0];
    if (!notice) throw new Error(`${reference} has no barangay notice (it was not inside a barangay)`);
    if (notice.closed_at) throw new Error(`${reference} is closed; the barangay is no longer alerted`);

    const loc = { latitude: inc.latitude, longitude: inc.longitude };
    const code = accessCode(notice);
    const message = compose({ notice, incident: inc, loc, code, ops: env.MDRRMO_OPS_PHONE });
    const coordsText = coordinates(loc);

    let recipients;
    const to = option('--to');
    if (to) {
      recipients = [to];
    } else {
      const contacts = (
        await db.query(
          `select phone_e164, is_demo, label from barangay_contacts
            where barangay_id = $1 and is_active and can_sms order by role, created_at`,
          [notice.barangay_id],
        )
      ).rows;
      const usable = flag('--real') ? contacts : contacts.filter((c) => c.is_demo);
      if (contacts.length > usable.length) {
        console.warn(`! Skipping ${contacts.length - usable.length} real barangay number(s). Use --real to text them.`);
      }
      recipients = usable.map((c) => c.phone_e164);
    }
    if (recipients.length === 0) throw new Error('No recipients (no demo SMS contact for this barangay). Use --to <number>.');

    console.log(`Incident : ${inc.public_reference} (${inc.category}, ${inc.status}) · Brgy ${notice.barangay_name}`);
    console.log(`To       : ${recipients.join(', ')}`);
    console.log(`Message  : ${message}`);
    console.log(`Length   : ${message.length} chars (limit ${MAX - 1})`);
    if (coordsText) console.log(`Then     : ${coordsText}`);
    const page = (env.PUBLIC_APP_URL || '').trim().replace(/\/+$/, '');
    console.log(`Open     : ${page ? `${page}/b` : '<web app>/b'}  and type ${code}`);
    if (flag('--dry-run')) {
      console.log('\nDry run: nothing was sent.');
      return;
    }

    if (!env.TEXTBEE_API_KEY || !env.TEXTBEE_DEVICE_ID) throw new Error('TEXTBEE_API_KEY / TEXTBEE_DEVICE_ID missing in backend/.env');
    for (const text of coordsText ? [message, coordsText] : [message]) {
      const res = await fetch(`https://api.textbee.dev/api/v1/gateway/devices/${env.TEXTBEE_DEVICE_ID}/send-sms`, {
        method: 'POST',
        headers: { 'x-api-key': env.TEXTBEE_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipients, message: text }),
      });
      const body = await res.text();
      if (!res.ok) throw new Error(`Textbee HTTP ${res.status}: ${body.slice(0, 300)}`);
      console.log(`Textbee  : queued ${JSON.stringify(text.slice(0, 40))}`);
    }
    console.log('Check delivery:  node scripts\\dev\\textbee-send.js --status');
  } finally {
    await db.end();
  }
})().catch((e) => {
  console.error(`\nError: ${e.message}`);
  process.exit(1);
});
