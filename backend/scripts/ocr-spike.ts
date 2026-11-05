/**
 * PhilHealth ID verification, Phase 0 spike: how well does local tesseract.js read the cards?
 *
 * Sample ID images are personal data. Keep them outside the repo. Never commit the output.
 *
 *   npx ts-node --transpile-only scripts/ocr-spike.ts <folder outside the repo>
 *
 * Reads every .jpg/.jpeg/.png in the folder and prints, per file, the raw OCR text and the
 * time taken. It prints to the terminal only and writes nothing to disk: the English data is
 * read from the bundled @tesseract.js-data/eng package and caching is off, so nothing is
 * downloaded or saved. Copy only the layout (no names, no numbers) into the plan's Phase 0 notes.
 */
import { readdir, readFile } from 'fs/promises';
import { dirname, extname, join, relative, resolve, isAbsolute } from 'path';
import { createWorker, OEM } from 'tesseract.js';

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png']);
const REPO_ROOT = resolve(__dirname, '..', '..');

/** Bundled English LSTM data, so tesseract never fetches from a CDN. */
const LANG_PATH = join(dirname(require.resolve('@tesseract.js-data/eng/package.json')), '4.0.0_best_int');

function isInsideRepo(folder: string): boolean {
  const rel = relative(REPO_ROOT, folder);
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

async function main(): Promise<void> {
  const arg = process.argv[2];
  if (!arg) throw new Error('Usage: npx ts-node --transpile-only scripts/ocr-spike.ts <folder outside the repo>');

  const folder = resolve(arg);
  if (isInsideRepo(folder)) {
    throw new Error('Refusing to read a folder inside the repo. Keep sample ID images outside it.');
  }

  const files = (await readdir(folder))
    .filter((name) => IMAGE_EXTENSIONS.has(extname(name).toLowerCase()))
    .sort();
  if (files.length === 0) throw new Error(`No .jpg or .png files in ${folder}`);

  const startedAt = Date.now();
  const worker = await createWorker('eng', OEM.LSTM_ONLY, {
    langPath: LANG_PATH,
    gzip: true,
    cacheMethod: 'none',
  });
  console.log(`Worker ready in ${Date.now() - startedAt} ms (lang data: ${LANG_PATH})\n`);

  try {
    for (const name of files) {
      const image = await readFile(join(folder, name));
      const readStartedAt = Date.now();
      const { data } = await worker.recognize(image);
      console.log(`===== ${name} (${Date.now() - readStartedAt} ms, confidence ${data.confidence}) =====`);
      console.log(data.text.trimEnd());
      console.log('');
    }
  } finally {
    await worker.terminate();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
