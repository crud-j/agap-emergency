#!/usr/bin/env node
/*
  AI Assist eval (AUTOMATION_NEEDS_PLAN Phase 3 / AI_ASSIST_PLAN Phase 2): runs the synthetic
  barangay reply fixtures through Gemini with the SAME code the backend uses
  (AiClientService.structured, redactForAi, BARANGAY_REPLY_INSTRUCTIONS and the JSON schema)
  and prints the accuracy, the mismatches and how many calls were BLOCKED or RATE_LIMITED.

  Run from the repo root (no backend, Redis or database needed):
    node scripts\dev\eval-barangay-replies.js
    node scripts\dev\eval-barangay-replies.js --delay 7000      ms between calls (default 6500)
    node scripts\dev\eval-barangay-replies.js --only backup-07  one fixture
    node scripts\dev\eval-barangay-replies.js --model <id>      try another model ID

  Reads GEMINI_API_KEY and GEMINI_MODEL from backend/.env (nothing else, never printed).
  FREE-TIER KEY: send only these synthetic fixtures, never a real barangay text (AI_ASSIST_PLAN
  Phase 0). The free tier allows few calls a minute, hence the delay; a RATE_LIMITED call is
  retried once after a minute.

  Pass mark: >= 90% of the AI fixtures correct, and 0 replies whose expected label is
  NEEDS_BACKUP read as a calm status. Exits 1 when either fails.
*/
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', '..');
const backend = path.join(root, 'backend');
const fromBackend = (name) => require(path.join(backend, 'node_modules', name));

const args = process.argv.slice(2);
const option = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

const CALM = new Set(['SEEN', 'ON_THE_WAY', 'ON_SCENE', 'HANDLED']);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function loadGeminiEnv() {
  const parsed = fromBackend('dotenv').parse(fs.readFileSync(path.join(backend, '.env')));
  return {
    GEMINI_API_KEY: parsed.GEMINI_API_KEY ?? '',
    GEMINI_MODEL: option('--model') ?? parsed.GEMINI_MODEL ?? '',
    AI_ASSIST_TIMEOUT_MS: parsed.AI_ASSIST_TIMEOUT_MS ?? '8000',
  };
}

async function main() {
  const env = loadGeminiEnv();
  if (!env.GEMINI_API_KEY.trim() || !env.GEMINI_MODEL.trim()) {
    console.error('Set GEMINI_API_KEY and GEMINI_MODEL in backend/.env (or pass --model).');
    process.exit(2);
  }

  // The backend's TypeScript, loaded as-is, so the eval can't drift from the runner.
  fromBackend('ts-node').register({ project: path.join(backend, 'tsconfig.json'), transpileOnly: true });
  const { AiClientService } = require(path.join(backend, 'src/ai-assist/ai-client.service.ts'));
  const { redactForAi } = require(path.join(backend, 'src/ai-assist/redact.ts'));
  const prompt = require(path.join(backend, 'src/ai-assist/prompts/barangay-reply.prompt.ts'));
  const { parseBarangayReply } = require(path.join(backend, 'src/barangay-coordination/barangay-reply.parser.ts'));

  const config = { get: (key) => ({ ...env, AI_ASSIST_ENABLED: 'true', AI_ASSIST_DAILY_LIMIT: '100000' })[key] };
  const prismaStub = { ai_suggestions: { count: async () => 0 } };
  const ai = new AiClientService(prismaStub, config);

  const fixtures = JSON.parse(
    fs.readFileSync(path.join(backend, 'test/ai-assist/fixtures/barangay-replies.json'), 'utf8'),
  ).replies;
  const only = option('--only');
  const delay = Number(option('--delay') ?? 6500);

  // Exact codes never reach Gemini: check the rule parser instead.
  let ruleErrors = 0;
  for (const f of fixtures.filter((x) => x.path === 'RULE' && (!only || x.id === only))) {
    const got = parseBarangayReply(f.body)?.status ?? null;
    if (got !== f.expected) {
      ruleErrors++;
      console.log(`RULE MISMATCH ${f.id}: expected ${f.expected}, parser gave ${got}`);
    }
  }

  const aiFixtures = fixtures.filter((x) => x.path === 'AI' && (!only || x.id === only));
  console.log(`Model ${env.GEMINI_MODEL}: ${aiFixtures.length} AI fixtures, ${delay} ms apart\n`);

  let correct = 0;
  const mismatches = [];
  const critical = [];
  const errors = {};
  for (const [i, f] of aiFixtures.entries()) {
    if (parseBarangayReply(f.body)) {
      console.log(`SKIP ${f.id}: the rule parser reads it, so it would never reach Gemini`);
      continue;
    }
    if (i > 0) await sleep(delay);
    const input = redactForAi(f.body, prompt.BARANGAY_REPLY_MAX_INPUT);
    const call = () =>
      ai.structured('BARANGAY_REPLY', prompt.BARANGAY_REPLY_INSTRUCTIONS, input, prompt.BARANGAY_REPLY_JSON_SCHEMA, prompt.BarangayReplySchema);
    let res = await call();
    if (!res.ok && res.error === 'RATE_LIMITED') {
      console.log(`  ${f.id}: RATE_LIMITED, waiting 65 s and trying once more`);
      await sleep(65_000);
      res = await call();
    }

    if (!res.ok) {
      errors[res.error] = (errors[res.error] ?? 0) + 1;
      mismatches.push({ id: f.id, expected: f.expected, got: res.error, body: f.body });
      if (f.expected === 'NEEDS_BACKUP' && res.error === 'BLOCKED') critical.push({ id: f.id, got: 'BLOCKED' });
      console.log(`  ${f.id.padEnd(11)} ${res.error}`);
      continue;
    }
    const got = res.value.status;
    const ok = got === f.expected || (f.acceptable ?? []).includes(got);
    if (ok) correct++;
    else mismatches.push({ id: f.id, expected: f.expected, got, confidence: res.value.confidence, english: res.value.english, body: f.body });
    if (f.expected === 'NEEDS_BACKUP' && CALM.has(got)) critical.push({ id: f.id, got });
    console.log(`  ${f.id.padEnd(11)} ${ok ? 'ok ' : 'MISS'} ${got} (${res.value.confidence.toFixed(2)}, ${res.latencyMs} ms)`);
  }

  const total = aiFixtures.length;
  const accuracy = total ? correct / total : 0;
  console.log(`\nAccuracy: ${correct}/${total} = ${(accuracy * 100).toFixed(1)}% (pass: >= 90%)`);
  console.log(`NEEDS_BACKUP read as calm (or blocked): ${critical.length} (pass: 0)`);
  console.log(`BLOCKED: ${errors.BLOCKED ?? 0}, RATE_LIMITED: ${errors.RATE_LIMITED ?? 0}, other errors: ${
    Object.entries(errors).filter(([k]) => k !== 'BLOCKED' && k !== 'RATE_LIMITED').map(([k, v]) => `${k} ${v}`).join(', ') || 'none'
  }`);
  if (ruleErrors) console.log(`Rule parser mismatches: ${ruleErrors}`);
  if (mismatches.length) {
    console.log('\nMismatches:');
    for (const m of mismatches) {
      console.log(`  ${m.id}: expected ${m.expected}, got ${m.got}${m.english ? ` — "${m.english}"` : ''}`);
      console.log(`    "${m.body}"`);
    }
  }
  if (critical.length) console.log(`\nCRITICAL: ${critical.map((c) => `${c.id} → ${c.got}`).join(', ')}`);

  process.exit(accuracy >= 0.9 && critical.length === 0 && ruleErrors === 0 ? 0 : 1);
}

main().catch((err) => {
  // The error class only: messages can echo request content.
  console.error(`Eval failed: ${err && err.name ? err.name : 'unknown error'}`);
  process.exit(2);
});
