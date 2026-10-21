#!/usr/bin/env node
/*
  Send one SMS through Textbee and watch its status, to tell a carrier/phone problem apart
  from an AGAP problem. Uses TEXTBEE_API_KEY / TEXTBEE_DEVICE_ID from backend/.env.

  Run from the repo root:
    node scripts\dev\textbee-send.js +639694784013 "AGAP test 1, no link"
    node scripts\dev\textbee-send.js +639694784013 "AGAP test 2 https://example.com"
    node scripts\dev\textbee-send.js --status          last 8 sent texts and their status

  Textbee statuses: pending -> dispatched ("Handed to phone") -> sent (left the SIM)
  -> delivered (the network confirmed it) or failed.
*/
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', '..');

function loadEnv() {
  const env = {};
  const text = fs.readFileSync(path.join(root, 'backend', '.env'), 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return env;
}

const env = loadEnv();
const base = `https://api.textbee.dev/api/v1/gateway/devices/${env.TEXTBEE_DEVICE_ID}`;
const headers = { 'x-api-key': env.TEXTBEE_API_KEY, 'Content-Type': 'application/json' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const phTime = (iso) => (iso ? new Date(iso).toLocaleTimeString('en-PH', { timeZone: 'Asia/Manila' }) : '-');

async function sent(limit) {
  const res = await fetch(`${base}/messages?type=sent&limit=${limit}`, { headers });
  if (!res.ok) throw new Error(`Textbee HTTP ${res.status}`);
  return (await res.json()).data ?? [];
}

(async () => {
  if (!env.TEXTBEE_API_KEY || !env.TEXTBEE_DEVICE_ID) throw new Error('TEXTBEE_API_KEY / TEXTBEE_DEVICE_ID missing in backend/.env');
  const [to, message] = process.argv.slice(2);

  if (to === '--status' || !to) {
    if (!to) console.log('Usage: node scripts\\dev\\textbee-send.js <+63…> "<message>"   |   --status\n');
    for (const m of await sent(8)) {
      console.log(`${phTime(m.createdAt)}  ${String(m.status).padEnd(10)} ${m.recipient}  ${JSON.stringify((m.message || '').slice(0, 60))}`);
    }
    return;
  }
  if (!message) throw new Error('Give the message text in quotes.');

  const startedAt = Date.now();
  const res = await fetch(`${base}/send-sms`, { method: 'POST', headers, body: JSON.stringify({ recipients: [to], message }) });
  if (!res.ok) throw new Error(`Textbee refused: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
  console.log(`Queued   ${to}: ${JSON.stringify(message)} (${message.length} chars)`);

  let last = null;
  while (Date.now() - startedAt < 3 * 60 * 1000) {
    await sleep(3000);
    const m = (await sent(10)).find(
      (x) => x.recipient === to && x.message === message && new Date(x.createdAt).getTime() >= startedAt - 5000,
    );
    if (m && m.status !== last) {
      last = m.status;
      console.log(`${phTime(new Date().toISOString())}  ${last}`);
    }
    if (m && ['delivered', 'failed'].includes(m.status)) {
      if (m.status === 'failed') console.log(`Reason   ${m.errorMessage || '(none given)'}`);
      return;
    }
  }
  console.log(`Still "${last}" after 3 min. The Textbee phone has not sent it (asleep, no signal or no load?).`);
})().catch((e) => {
  console.error(`Error: ${e.message}`);
  process.exit(1);
});
