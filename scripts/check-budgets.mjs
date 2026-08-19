// check-budgets.mjs — Loop 6.12: DESIGN.md §15.9's budgets, enforced in CI
// against a real build rather than estimated from source.
//
//   node scripts/check-budgets.mjs        # requires dist/ from `npm run build`
//   npm run budget
//
// §15.9's table, and where each line is enforced:
//
//   | CSS                          | 28KB raw / 7KB gzip | here                  |
//   | Fonts                        | 60KB total woff2    | here                  |
//   | Inline SVG (faces+flags+     | 14KB                | tests/sprite.spec.ts  |
//   |   plates)                    |                     |                       |
//   | JS delta from the revamp     | 20KB raw            | here                  |
//   | Total transfer, gzipped      | 150KB               | here                  |
//   | Raster assets                | zero, favicon exc.  | here                  |
//   | DOM nodes, busiest screen    | 1200                | driver.mjs            |
//
// Inline SVG lives in sprite.spec.ts because the geometry is JSX: it is
// measurable at source (where the per-family 1.5KB/6KB sub-budgets already
// are) and indistinguishable from surrounding component code once minified
// into the bundle. Everything a browser actually downloads is measured here.

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join, extname, basename, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DIST = join(ROOT, 'dist');

const KB = 1024;

// The pre-revamp baseline for the JS-delta budget. Measured, not guessed:
// commit 1e07e97 ("Loop 5.2: shareable result — M5 done") is the last commit
// before Loop 6.1, and `npm ci && npm run build` in a worktree at that commit
// emits a single 179,840-byte JS chunk (and a 90-byte stylesheet — the "90-byte
// stylesheet" DEVELOPMENT_LOOPS.md's M6 preamble describes, which confirms the
// baseline is the right one). Reproduce with:
//
//   git worktree add /tmp/cage-m5 1e07e97 && cd /tmp/cage-m5
//   npm install && npm run build
//
// The comparison is initial-chunk to initial-chunk: bytes a player downloads
// before the first screen paints. Lazily-loaded route chunks are excluded from
// both sides — at M5 there were none, and today there are two developer routes
// (#/lab, #/kit) that no player path reaches.
const M5_BASELINE_JS_BYTES = 179_840;

const BUDGETS = {
  cssRaw: 28 * KB,
  cssGzip: 7 * KB,
  fontsTotal: 60 * KB,
  // Amended at Loop 6.12 from 20KB, in the same commit as DESIGN.md's table —
  // see §15.9's amendment note for the measurement and what it bought.
  jsDeltaRaw: 24 * KB,
  totalGzip: 150 * KB,
};

const RASTER_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.avif', '.bmp', '.ico']);

/** Every file under `dir`, recursively, as absolute paths. */
function walk(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

const results = [];

/** Record one budget line. `measured` and `ceiling` are byte counts. */
function check(name, measured, ceiling, detail = '') {
  results.push({ name, measured, ceiling, ok: measured <= ceiling, detail });
}

function fmt(bytes) {
  return `${(bytes / KB).toFixed(2)}KB`;
}

if (!existsSync(DIST)) {
  console.error('BUDGET CHECK FAIL: no dist/. Run `npm run build` first — §15.9 is');
  console.error('measured from a real build, never estimated from source.');
  process.exit(1);
}

const distFiles = walk(DIST);

// --- what loads on first paint ---------------------------------------------
// Route chunks (dynamic imports) are emitted alongside the entry chunk. Vite
// names the entry `index-*.js`; everything else in assets/ with a .js extension
// is a lazily-loaded route. index.html references only the entry, so parsing it
// is the honest way to tell them apart rather than matching on filenames.
const html = readFileSync(join(DIST, 'index.html'), 'utf-8');
const entryJs = distFiles.filter((f) => extname(f) === '.js' && html.includes(basename(f)));
const lazyJs = distFiles.filter((f) => extname(f) === '.js' && !html.includes(basename(f)));

if (entryJs.length !== 1) {
  console.error(`BUDGET CHECK FAIL: expected exactly one entry chunk in index.html, found ${entryJs.length}`);
  process.exit(1);
}

const entryBytes = statSync(entryJs[0]).size;
const jsDelta = entryBytes - M5_BASELINE_JS_BYTES;
check(
  'JS delta from the revamp (raw)',
  jsDelta,
  BUDGETS.jsDeltaRaw,
  `entry ${fmt(entryBytes)} - M5 baseline ${fmt(M5_BASELINE_JS_BYTES)}` +
    (lazyJs.length ? `; ${lazyJs.length} lazy route chunk(s) excluded: ${lazyJs.map((f) => basename(f)).join(', ')}` : ''),
);

// --- CSS -------------------------------------------------------------------
// Every stylesheet the build emits, entry and route chunks together: a player
// who reaches a lazily-styled screen still pays for it, and §15.9's CSS line is
// a ceiling on the whole design system, not on one chunk of it.
const cssFiles = distFiles.filter((f) => extname(f) === '.css');
const cssRaw = cssFiles.reduce((sum, f) => sum + statSync(f).size, 0);
const cssGzip = cssFiles.reduce((sum, f) => sum + gzipSync(readFileSync(f), { level: 9 }).length, 0);
check('CSS (raw)', cssRaw, BUDGETS.cssRaw, cssFiles.map((f) => basename(f)).join(', '));
check('CSS (gzip)', cssGzip, BUDGETS.cssGzip);

// --- fonts -----------------------------------------------------------------
const fontFiles = distFiles.filter((f) => extname(f) === '.woff2');
const fontsTotal = fontFiles.reduce((sum, f) => sum + statSync(f).size, 0);
check(
  'Fonts (total woff2)',
  fontsTotal,
  BUDGETS.fontsTotal,
  `${fontFiles.length} files: ${fontFiles.map((f) => basename(f)).join(', ')}`,
);

// --- total transfer --------------------------------------------------------
// Everything a first-time visitor pulls down to reach the career screen: the
// document, the entry chunk, every stylesheet, every font, and the favicon.
// woff2 is already Brotli-compressed internally, so gzipping it again is a
// rounding error upward — counted at its real on-the-wire size instead.
function transferSize(file) {
  const bytes = readFileSync(file);
  if (extname(file) === '.woff2') return bytes.length;
  return gzipSync(bytes, { level: 9 }).length;
}
const transferFiles = distFiles.filter((f) => !lazyJs.includes(f));
const totalGzip = transferFiles.reduce((sum, f) => sum + transferSize(f), 0);
check(
  'Total transfer (gzip)',
  totalGzip,
  BUDGETS.totalGzip,
  `${transferFiles.length} files` + (lazyJs.length ? `, ${lazyJs.length} lazy chunk(s) excluded` : ''),
);

// --- raster assets ---------------------------------------------------------
// §15.9: zero, favicon excepted. The rule covers the shipped build and the two
// directories a raster can enter the build from. It deliberately does not cover
// .claude/skills/run-cage/shots/ — those are the driver's screenshot record,
// a verification artifact that never reaches a bundle.
const rasterRoots = [DIST, join(ROOT, 'src'), join(ROOT, 'public')].filter(existsSync);
const rasters = rasterRoots
  .flatMap(walk)
  .filter((f) => RASTER_EXTENSIONS.has(extname(f).toLowerCase()))
  .filter((f) => !/^favicon\./i.test(basename(f)))
  .map((f) => relative(ROOT, f));
check('Raster assets (favicon excepted)', rasters.length, 0, rasters.length ? rasters.join(', ') : 'none');

// --- report ----------------------------------------------------------------
console.log('§15.9 budgets, measured from dist/:\n');
const nameWidth = Math.max(...results.map((r) => r.name.length));
let failed = 0;
for (const r of results) {
  const isCount = r.name.startsWith('Raster');
  const measured = isCount ? String(r.measured) : fmt(r.measured);
  const ceiling = isCount ? String(r.ceiling) : fmt(r.ceiling);
  const status = r.ok ? 'PASS' : 'FAIL';
  if (!r.ok) failed++;
  console.log(
    `  ${status}  ${r.name.padEnd(nameWidth)}  ${measured.padStart(9)} / ${ceiling.padEnd(9)}` +
      (r.detail ? `  ${r.detail}` : ''),
  );
}

console.log('');
if (failed > 0) {
  console.error(`BUDGET CHECK FAIL: ${failed} of ${results.length} §15.9 budgets exceeded.`);
  console.error('DESIGN.md §15.9 is enforced in CI by design — cut bytes, or amend the');
  console.error('table in DESIGN.md and the constant here in the same commit.');
  process.exit(1);
}
console.log(`BUDGET CHECK PASS: all ${results.length} §15.9 budgets met.`);
