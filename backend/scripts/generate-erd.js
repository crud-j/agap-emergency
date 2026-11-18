/* eslint-disable no-console */
/**
 * Generates the database ERD from prisma/schema.prisma (docs/database/).
 *
 * The ERD generator is kept OUT of schema.prisma on purpose: `prisma generate`
 * runs on every install (postinstall), in CI and in Docker builds, and an `erd`
 * generator there would launch headless Chromium each time. This script copies
 * the schema to a temp file, appends the `erd` generator, and runs only that
 * generator against the copy.
 *
 * Usage: pnpm db:erd            → docs/database/AGAP_ERD.svg (+ .mmd)
 *        pnpm db:erd png        → docs/database/AGAP_ERD.png at full size (+ .svg, .mmd)
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const backendDir = path.resolve(__dirname, '..');
const schemaPath = path.join(backendDir, 'prisma', 'schema.prisma');
const outDir = path.resolve(backendDir, '..', 'docs', 'database');
const binDir = path.join(backendDir, 'node_modules', '.bin');
const format = (process.argv[2] || 'svg').toLowerCase();

if (!['svg', 'png', 'pdf'].includes(format)) {
  console.error(`Unsupported format "${format}". Use svg, png or pdf.`);
  process.exit(1);
}

fs.mkdirSync(outDir, { recursive: true });
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agap-erd-'));
// The generator import()s this file, so it must be a JS module, not JSON.
const configPath = path.join(tmpDir, 'mermaid-config.cjs');
// 80+ models: raise mermaid's text/edge limits so the diagram is not truncated.
fs.writeFileSync(configPath, 'module.exports = { maxTextSize: 5000000, maxEdges: 5000 };\n');

const prismaPath = (p) => p.split(path.sep).join('/');

function erdBlock(output) {
  return `

generator erd {
  provider      = "prisma-erd-generator"
  output        = "${prismaPath(output)}"
  mmdcPath      = "${prismaPath(binDir)}"
  mermaidConfig = "${prismaPath(configPath)}"
  disableEmoji  = true
}
`;
}

function runErd(output) {
  const tmpSchema = path.join(tmpDir, 'schema.prisma');
  fs.writeFileSync(tmpSchema, fs.readFileSync(schemaPath, 'utf8') + erdBlock(output));
  // Run the Prisma CLI through node directly: no shell, so paths are passed as-is.
  const prismaCli = require.resolve('prisma/build/index.js', { paths: [backendDir] });
  execFileSync(process.execPath, [prismaCli, 'generate', '--schema', tmpSchema, '--generator', 'erd'], {
    cwd: backendDir,
    stdio: 'inherit',
    // The temp schema sits outside backend/, so Prisma cannot find the generator
    // binary on its own; put backend/node_modules/.bin on PATH.
    env: { ...process.env, PATH: `${binDir}${path.delimiter}${process.env.PATH ?? ''}` },
  });
}

// pnpm-workspace.yaml skips puppeteer's install script (its Chrome download), so
// image output needs the browser installed once per machine.
function assertBrowserInstalled() {
  const cacheDir =
    process.env.PUPPETEER_CACHE_DIR || path.join(os.homedir(), '.cache', 'puppeteer');
  const shellDir = path.join(cacheDir, 'chrome-headless-shell');
  const installed = fs.existsSync(shellDir) && fs.readdirSync(shellDir).length > 0;
  if (!installed) {
    console.error(
      'Headless Chrome for the ERD is not installed. Run once, from backend/:\n' +
        '  node_modules/.bin/puppeteer browsers install chrome-headless-shell',
    );
    process.exit(1);
  }
}

/**
 * mermaid-cli renders PNGs at its 800px default viewport (an unreadable thumbnail
 * for 80+ tables), and librsvg (sharp) cannot load an SVG this large. So the PNG
 * is made from the SVG: headless Chrome screenshots it at full size in tiles, and
 * sharp stitches the tiles together.
 */
async function rasterizeSvg(svgPath, pngPath) {
  const { pathToFileURL } = require('url');
  const puppeteer = require(require.resolve('puppeteer', { paths: [backendDir] }));
  const sharp = require(require.resolve('sharp', { paths: [backendDir] }));
  const TILE = 4000;

  const browser = await puppeteer.launch({ headless: 'shell' });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: TILE, height: TILE });
    await page.goto(pathToFileURL(svgPath).href);
    // Draw the SVG at its natural size (the viewBox), not scaled to the window.
    const { width, height } = await page.evaluate(() => {
      const svg = document.documentElement;
      const vb = svg.viewBox.baseVal;
      const w = Math.ceil(vb.width);
      const h = Math.ceil(vb.height);
      svg.setAttribute('width', String(w));
      svg.setAttribute('height', String(h));
      svg.setAttribute('style', 'max-width:none;background:#ffffff');
      return { width: w, height: h };
    });

    const tiles = [];
    for (let top = 0; top < height; top += TILE) {
      for (let left = 0; left < width; left += TILE) {
        const clip = {
          x: left,
          y: top,
          width: Math.min(TILE, width - left),
          height: Math.min(TILE, height - top),
        };
        const input = Buffer.from(
          await page.screenshot({ type: 'png', clip, captureBeyondViewport: true }),
        );
        tiles.push({ input, left, top });
      }
    }

    await sharp({
      create: { width, height, channels: 3, background: '#ffffff' },
      limitInputPixels: false,
    })
      .composite(tiles)
      .png({ compressionLevel: 9 })
      .toFile(pngPath);
    console.log(`✔ Rasterized ERD to ${path.relative(process.cwd(), pngPath)} (${width}x${height}px)`);
  } finally {
    await browser.close();
  }
}

async function main() {
  assertBrowserInstalled();
  try {
    runErd(path.join(outDir, 'AGAP_ERD.mmd'));
    if (format === 'png') {
      const svgPath = path.join(outDir, 'AGAP_ERD.svg');
      runErd(svgPath);
      await rasterizeSvg(svgPath, path.join(outDir, 'AGAP_ERD.png'));
    } else {
      runErd(path.join(outDir, `AGAP_ERD.${format}`));
    }
    console.log(`\nERD written to ${path.relative(process.cwd(), outDir)}`);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
