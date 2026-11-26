/**
 * MOD-01 profile photo check: print each photo's scores, to tune the cut-offs.
 *
 * Selfies are personal data. Keep them outside the repo; the output has scores only.
 *
 *   npx ts-node --transpile-only scripts/photo-check-scores.ts <folder outside the repo>
 *
 * Name files by what they show (cap-1.jpg, hijab-1.jpg, plain-1.jpg, sunglasses-1.jpg ...)
 * and pick each PROFILE_PHOTO_*_THRESHOLD between the highest "should pass" score and the
 * lowest "should be refused" score. Uses the same model and square crop as the server, and
 * the model cached in .cache/models (downloaded once if missing; no photo leaves this machine).
 */
import { readdir, readFile } from 'fs/promises';
import { extname, join, resolve } from 'path';
import sharp from 'sharp';
import type { ConfigService } from '@nestjs/config';
import { DEFAULT_THRESHOLDS, PhotoContentCheckService } from '../src/users/profile-photo/photo-content-check.service';

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp']);
/** Same as ProfilePhotoService (STORED_EDGE_PX). */
const EDGE = 640;

async function main() {
  const folder = process.argv[2];
  if (!folder) {
    console.error('Usage: npx ts-node --transpile-only scripts/photo-check-scores.ts <folder>');
    process.exit(1);
  }
  const values: Record<string, string> = { PROFILE_PHOTO_CHECKS: 'on', ...process.env } as Record<string, string>;
  const config = { get: (key: string, fallback?: string) => values[key] ?? fallback } as unknown as ConfigService;
  const checker = new PhotoContentCheckService(config);

  const files = (await readdir(resolve(folder))).filter((f) => IMAGE_EXTENSIONS.has(extname(f).toLowerCase())).sort();
  console.log(`Cut-offs: ${JSON.stringify(DEFAULT_THRESHOLDS)} (env overrides apply on the server)\n`);
  for (const file of files) {
    const square = await sharp(await readFile(join(resolve(folder), file)))
      .rotate()
      .resize(EDGE, EDGE, { fit: 'cover', position: 'centre' })
      .jpeg({ quality: 85 })
      .toBuffer();
    const result = await checker.check(square);
    if (result.status === 'passed' || result.status === 'rejected') {
      const scores = Object.entries(result.scores).map(([k, v]) => `${k} ${v.toFixed(3)}`).join('  ');
      const verdict = result.status === 'rejected' ? `REFUSED (${result.issues.join(', ')})` : 'passes';
      console.log(`${file.padEnd(28)} ${scores}  → ${verdict}`);
    } else {
      console.log(`${file.padEnd(28)} check ${result.status}`);
    }
  }
}

void main();
