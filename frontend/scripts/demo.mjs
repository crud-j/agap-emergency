// `pnpm demo` — production build + start for demos, in any shell (cmd, PowerShell, bash).
// Sets PROXY_API=true so the browser keeps calling the API on this same origin
// (forwarded to the backend), exactly like `pnpm dev`. Port 3001, like `pnpm dev`.
// Usage: pnpm demo            build, then start
//        pnpm demo --no-build start the last build again
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const nextBin = require.resolve('next/dist/bin/next');
const env = { ...process.env, PROXY_API: 'true' };

function run(args) {
  const result = spawnSync(process.execPath, [nextBin, ...args], { stdio: 'inherit', env });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

if (!process.argv.includes('--no-build')) run(['build']);
run(['start', '-p', '3001']);
