#!/usr/bin/env node
/*
  End-to-end test of the barangay alert SMS: submits a guest SOS inside Batia through the
  running backend, then waits until Textbee reports the alert text as delivered.

  Run from the repo root (backend on :3000 must be running, with Redis):
    node scripts\dev\test-barangay-sms.js
    node scripts\dev\test-barangay-sms.js --type FIRE
    node scripts\dev\test-barangay-sms.js --api http://localhost:3000 --lat 14.83221 --lng 120.94920
    node scripts\dev\test-barangay-sms.js --check         only show where texts would go, submit nothing

  It creates a real incident (marked "AGAP TEST" in its description). Outside production the
  backend sends every barangay text to BARANGAY_SMS_TEST_OVERRIDE_PHONE from backend/.env,
  so that is the number expected to receive it.
*/
const fs = require('fs');
const path = require('path');

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

const env = loadEnv();
const api = (option('--api') || 'http://localhost:3000').replace(/\/+$/, '');
const type = (option('--type') || 'MEDICAL').toUpperCase();
const latitude = Number(option('--lat') || 14.83221); // inside Batia
const longitude = Number(option('--lng') || 120.9492);
const TIMEOUT_MS = 4 * 60 * 1000;
const POLL_MS = 5000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Same normalisation idea as the backend: 09XXXXXXXXX / 9XXXXXXXXX / +639XXXXXXXXX -> +639XXXXXXXXX.
function toE164(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  if (/^639\d{9}$/.test(digits)) return `+${digits}`;
  if (/^09\d{9}$/.test(digits)) return `+63${digits.slice(1)}`;
  if (/^9\d{9}$/.test(digits)) return `+63${digits}`;
  return null;
}

async function textbeeSent() {
  const res = await fetch(
    `https://api.textbee.dev/api/v1/gateway/devices/${env.TEXTBEE_DEVICE_ID}/messages?type=sent&limit=20`,
    { headers: { 'x-api-key': env.TEXTBEE_API_KEY } },
  );
  if (!res.ok) throw new Error(`Textbee HTTP ${res.status}`);
  const j = await res.json();
  return Array.isArray(j?.data) ? j.data : [];
}

(async () => {
  const expected = toE164(env.BARANGAY_SMS_TEST_OVERRIDE_PHONE);
  console.log('Config (backend/.env)');
  console.log(`  BARANGAY_ALERTS_ENABLED          ${env.BARANGAY_ALERTS_ENABLED || '(unset)'}`);
  console.log(`  BARANGAY_SMS_TEST_OVERRIDE_PHONE ${env.BARANGAY_SMS_TEST_OVERRIDE_PHONE || '(unset)'}  ->  ${expected || 'INVALID'}`);
  console.log(`  Status page                      ${env.PUBLIC_APP_URL ? `${env.PUBLIC_APP_URL.replace(/\/+$/, '')}/b` : '<web app>/b'} (type the Code from the text)`);
  console.log(`  Textbee device                   ${env.TEXTBEE_DEVICE_ID ? 'set' : 'MISSING'}`);
  console.log('  Note: the backend reads .env at startup. Restart it after changing any of these.\n');

  if (env.BARANGAY_ALERTS_ENABLED !== 'true') throw new Error('BARANGAY_ALERTS_ENABLED is not true; no barangay text will be sent.');
  if (!expected) throw new Error('BARANGAY_SMS_TEST_OVERRIDE_PHONE is not a PH mobile number.');
  if (!env.TEXTBEE_API_KEY || !env.TEXTBEE_DEVICE_ID) throw new Error('TEXTBEE_API_KEY / TEXTBEE_DEVICE_ID missing.');
  if (flag('--check')) {
    console.log(`Check only: a Batia alert would be texted to ${expected}. Nothing submitted.`);
    return;
  }

  // 1. Submit the SOS exactly like the app does (guest, no login).
  const startedAt = Date.now();
  const res = await fetch(`${api}/v1/emergency-alerts/sos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      clientEventId: `test-barangay-sms-${startedAt}`,
      incidentType: type,
      latitude,
      longitude,
      accuracyMeters: 10,
      description: 'AGAP TEST - barangay SMS check, not a real emergency',
      patientIsUnknown: true,
    }),
  }).catch((e) => {
    throw new Error(`Backend not reachable at ${api} (${e.cause?.code || e.message}). Start it: cd backend; pnpm start:dev`);
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`SOS rejected: HTTP ${res.status} ${JSON.stringify(body).slice(0, 300)}`);
  // createFromSos() returns { incident, duplicate }; tolerate a { data } envelope too.
  const created = body?.data ?? body;
  const reference = created?.incident?.public_reference ?? created?.publicReference;
  if (!reference) throw new Error(`SOS accepted but no reference in the response: ${JSON.stringify(body).slice(0, 300)}`);
  console.log(`1. SOS created      ${reference} (${type} at ${latitude}, ${longitude})`);

  // 2. Wait for the barangay notice and its SMS result; 3. find the text in Textbee.
  const db = new Client({ connectionString: env.DATABASE_URL.replace(/\?.*$/, '') });
  await db.connect();
  try {
    let notice = null;
    let lastStatus = null;
    let message = null;
    let lastTextbee = null;
    while (Date.now() - startedAt < TIMEOUT_MS) {
      notice = (
        await db.query(
          `select n.short_code, n.sms_status, g.name as barangay
             from incident_barangay_notices n
             join incidents i on i.id = n.incident_id
             join geo_regions g on g.id = n.barangay_id
            where i.public_reference = $1`,
          [reference],
        )
      ).rows[0];
      if (!notice && Date.now() - startedAt > 20000) {
        throw new Error(`${reference} got no barangay notice. Is ${latitude}, ${longitude} inside a barangay?`);
      }
      if (notice && notice.sms_status !== lastStatus) {
        lastStatus = notice.sms_status;
        console.log(`2. Barangay notice  Brgy ${notice.barangay}, code ${notice.short_code}, sms_status ${lastStatus}`);
        if (['DISABLED', 'SKIPPED'].includes(lastStatus)) {
          throw new Error(`Backend did not send (${lastStatus}). Check BARANGAY_* in .env and restart the backend.`);
        }
      }

      if (notice) {
        const sent = await textbeeSent().catch(() => []);
        message = sent.find(
          (m) =>
            new Date(m.createdAt).getTime() >= startedAt - 5000 &&
            (m.message || '').includes(reference) &&
            !(m.message || '').startsWith('AGAP|'), // skip the MDRRMO ops text
        );
        if (message && message.status !== lastTextbee) {
          lastTextbee = message.status;
          console.log(`3. Textbee          to ${message.recipient}: ${lastTextbee}`);
        }
        if (message && ['delivered', 'failed'].includes(message.status)) break;
      }
      await sleep(POLL_MS);
    }

    console.log('');
    if (!message) {
      console.log(`RESULT: no alert text for ${reference} in Textbee after ${TIMEOUT_MS / 60000} min (sms_status ${lastStatus}).`);
      console.log('        Is Redis running? Is the Textbee phone online? Check the backend log.');
      process.exitCode = 1;
      return;
    }
    console.log(`Text     : ${message.message}`);
    const right = message.recipient === expected;
    if (message.status === 'delivered' && right) {
      console.log(`RESULT: PASS. Delivered to ${message.recipient}. Check that phone: the alert, then a text with only the coordinates.`);
    } else if (!right) {
      console.log(`RESULT: FAIL. Sent to ${message.recipient}, expected ${expected}. Restart the backend so it reloads .env.`);
      process.exitCode = 1;
    } else {
      console.log(`RESULT: FAIL. Textbee status "${message.status}" for ${message.recipient}. Check the Textbee phone and SIM load.`);
      process.exitCode = 1;
    }
  } finally {
    await db.end();
  }
})().catch((e) => {
  console.error(`\nError: ${e.message}`);
  process.exit(1);
});
