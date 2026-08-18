// Headless playthrough driver for CAGE, used to verify the app end-to-end
// without a human at the keyboard. Drives the dev server with Playwright,
// walks the amateur wrapper -> camp -> fight -> card -> lab -> skip-path
// flow, and drops a numbered screenshot at each checkpoint.
//
// Usage:
//   node .claude/skills/run-cage/driver.mjs
//   BASE_URL=http://localhost:5173 SHOT_DIR=/tmp/cage-shots node .claude/skills/run-cage/driver.mjs
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE_URL = process.env.BASE_URL || 'http://localhost:5173';
const SHOT_DIR = process.env.SHOT_DIR || path.join(path.dirname(fileURLToPath(import.meta.url)), 'shots');

fs.mkdirSync(SHOT_DIR, { recursive: true });
let shotN = 0;
async function shot(page, label) {
  shotN++;
  const shotPath = path.join(SHOT_DIR, `${String(shotN).padStart(2, '0')}-${label}.png`);
  await page.screenshot({ path: shotPath, fullPage: true });
  console.log('SCREENSHOT', shotPath);
}

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1000, height: 900 } });
const page = await context.newPage();
const consoleErrors = [];
page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
page.on('pageerror', (err) => consoleErrors.push('PAGEERROR: ' + String(err)));

await page.goto(BASE_URL + '/');
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.waitForSelector('#career-screen');
await shot(page, 'career-start');

console.log('--- chargen wrapper flow ---');
await page.click('a[href="#/chargen"]');
await page.waitForSelector('#chargen-wrapper');
await shot(page, 'chargen-portrait-editor');

// Loop 6.5's verify: the portrait editor step renders no statline — §9.1's
// no-numbers rule extends to it. The cycler shows dot glyphs, not digits.
const portraitStepText = await page.textContent('#chargen-wrapper');
const hasDigits = /\d/.test(portraitStepText);
console.log('portrait editor step contains a digit:', hasDigits);
if (hasDigits) {
  console.error('PORTRAIT EDITOR NO-NUMBERS CHECK FAIL: found a digit in the step DOM');
  process.exitCode = 1;
} else {
  console.log('PORTRAIT EDITOR NO-NUMBERS CHECK PASS');
}

// Cycle a couple of features and randomize once, then confirm the face.
await page.click('#chargen-wrapper button[aria-label^="Next"]');
await page.click('#chargen-wrapper button:has-text("Randomize")');
await shot(page, 'chargen-portrait-edited');
await page.click('#chargen-wrapper button:has-text("Confirm face")');
await page.waitForSelector('#chargen-wrapper p:has-text("Moment")');
await shot(page, 'chargen-moment-1');

for (let i = 0; i < 6; i++) {
  const momentText = await page.textContent('#chargen-wrapper p:has-text("Moment")').catch(() => null);
  console.log('moment progress:', momentText);
  const buttons = page.locator('#chargen-wrapper button');
  const count = await buttons.count();
  if (count === 0) break;
  await buttons.first().click();
  await page.waitForTimeout(80);
}
await shot(page, 'chargen-done-or-reveal');

const revealVisible = await page.locator('#reveal-screen').count();
console.log('reveal screen visible:', revealVisible > 0);
if (revealVisible > 0) {
  await shot(page, 'reveal-screen');
  await page.click('#reveal-screen button:has-text("Begin pro career")');
}
await page.waitForSelector('#career-screen');
await shot(page, 'career-after-chargen');
const headerAfterChargen = await page.textContent('#career-screen h1');
console.log('career header after chargen:', headerAfterChargen);

console.log('--- camp week flow ---');
await page.click('a[href="#/camp"]');
await page.waitForSelector('#camp-screen');
await shot(page, 'camp-before-alloc');

const sliders = page.locator('#camp-screen input[type="range"]');
const sliderCount = await sliders.count();
console.log('camp sliders:', sliderCount);
// max out training
await sliders.nth(0).evaluate((el) => {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(el, el.max);
  el.dispatchEvent(new Event('input', { bubbles: true }));
});
await shot(page, 'camp-training-maxed');
await page.click('#camp-screen button:has-text("Resolve week")');
await page.waitForTimeout(100);
await shot(page, 'camp-after-resolve');

console.log('--- back to career, fight loop ---');
await page.click('a[href="#/"]').catch(() => {});
await page.goto(BASE_URL + '/#/');
await page.waitForSelector('#career-screen');

let fightsPlayed = 0;
for (let i = 0; i < 6; i++) {
  const retired = await page.locator('#career-screen:has-text("Career over")').count();
  if (retired > 0) { console.log('retired early at fight', i); break; }
  const fightBtn = page.locator('#career-screen button:has-text("Find opponent")');
  if ((await fightBtn.count()) === 0) break;
  const disabled = await fightBtn.isDisabled();
  if (disabled) { console.log('fight button disabled at iteration', i); break; }
  await fightBtn.click();
  await page.waitForTimeout(150);
  fightsPlayed++;
}
console.log('fights played:', fightsPlayed);
await shot(page, 'career-after-fights');
const careerText = await page.textContent('#career-screen');
console.log('career screen text snapshot:', careerText.replace(/\s+/g, ' ').trim());

console.log('--- career card + share ---');
await page.goto(BASE_URL + '/#/card');
await page.waitForSelector('#career-card-screen');
await shot(page, 'career-card');
const cardText = await page.textContent('#career-card-screen');
console.log('career card text:', cardText.replace(/\s+/g, ' ').trim());

console.log('--- standalone /fight demo screen ---');
await page.goto(BASE_URL + '/#/fight');
await page.waitForSelector('h1:has-text("Fight night")');
await shot(page, 'fight-screen-start');
await page.waitForTimeout(1500);
await shot(page, 'fight-screen-playing');

console.log('--- component kit (#/kit) ---');
// Loop 6.2's verify: the kit must render correctly in both registers from the same
// props, and Meter's value column must not jitter as it counts. Both registers are
// on one page, handed one identical prop set, so a screenshot compares them directly.
await page.goto(BASE_URL + '/#/kit');
await page.waitForSelector('#kit-screen');
await page.locator('#kit-file').screenshot({ path: path.join(SHOT_DIR, '15-kit-file.png') });
console.log('SCREENSHOT', path.join(SHOT_DIR, '15-kit-file.png'));
await page.locator('#kit-broadcast').screenshot({ path: path.join(SHOT_DIR, '16-kit-broadcast.png') });
console.log('SCREENSHOT', path.join(SHOT_DIR, '16-kit-broadcast.png'));

// The jitter check, measured rather than eyeballed. §15.3 requires every number to
// be mono and tabular; if it is, the value box holds still while the digits change.
const sweepValue = page.locator('#kit-sweep [role="meter"]').first();
const sweepLabel = page.locator('#kit-sweep span').nth(1); // the numeric readout
const samples = [];
// 16 samples at a 7-per-tick step covers the full 0 → 100 sweep, so the column is
// measured across all three digit widths (0, 70, 100) — the 2→3 character boundary
// is where a non-tabular face jitters worst.
for (let i = 0; i < 16; i++) {
  const box = await sweepLabel.boundingBox();
  const now = await sweepValue.getAttribute('aria-valuenow');
  samples.push({ now, x: Math.round(box.x), w: Math.round(box.width) });
  await page.waitForTimeout(420);
}
const distinctValues = new Set(samples.map((s) => s.now)).size;
const distinctX = new Set(samples.map((s) => s.x));
const distinctW = new Set(samples.map((s) => s.width ?? s.w));
console.log('sweep samples:', JSON.stringify(samples));
console.log('distinct meter values observed:', distinctValues, '(needs > 3 to be a real sweep)');
console.log('distinct x positions:', [...distinctX], '| distinct widths:', [...distinctW]);
if (distinctValues <= 3) {
  console.error('METER JITTER CHECK INCONCLUSIVE: the meter did not sweep');
  process.exitCode = 1;
} else if (distinctX.size !== 1 || distinctW.size !== 1) {
  console.error('METER JITTER FAIL: the value column moved as the number changed');
  process.exitCode = 1;
} else {
  console.log('METER JITTER PASS: value column held still across', distinctValues, 'distinct readings');
}

// Loop 6.4's node-budget verify: "a screen rendering six portraits stays under the
// §15.9 ceiling" (1200 DOM nodes on the busiest screen). The portrait grid in the
// kit has 24 — well past six — so this counts every node under a syntheic six-up
// row rather than trusting the whole kit page (which also has to hold buttons,
// meters and everything else built in 6.1-6.3) to stand in for a bare portrait
// screen.
const sixPortraitNodes = await page.evaluate(() => {
  const grid = document.querySelector('[class*="portraitGrid"]');
  const portraits = Array.from(grid.children).slice(0, 6);
  return portraits.reduce((sum, el) => sum + el.querySelectorAll('*').length + 1, 0);
});
console.log('DOM nodes for 6 portraits:', sixPortraitNodes, '(§15.9 ceiling for a full screen is 1200)');
if (sixPortraitNodes >= 1200) {
  console.error('PORTRAIT NODE BUDGET FAIL:', sixPortraitNodes, '>= 1200 for six portraits alone');
  process.exitCode = 1;
} else {
  console.log('PORTRAIT NODE BUDGET PASS');
}

// Loop 6.6's verify: "the same FaceCode at debut, mid-career, and after a
// brutal run — the three must be obviously distinguishable." The kit's Wear
// sheet holds all three side by side; a close-up crop for the screenshot
// record, plus an automated check on which wr-* overlay symbols each
// portrait actually references (not just eyeballing pixels).
const wearSheet = page.locator('#kit-file section', { hasText: 'one FaceCode, three points' });
await wearSheet.screenshot({ path: path.join(SHOT_DIR, '17-kit-wear.png') });
console.log('SCREENSHOT', path.join(SHOT_DIR, '17-kit-wear.png'));

const wearOverlayIds = await page.evaluate(() => {
  const sheets = Array.from(document.querySelectorAll('#kit-file section'));
  const sheet = sheets.find((s) => s.textContent.includes('one FaceCode, three points'));
  const portraits = Array.from(sheet.querySelectorAll('svg'));
  return portraits.map((svg) =>
    Array.from(svg.querySelectorAll('use'))
      .map((u) => u.getAttribute('href'))
      .filter((href) => href.startsWith('#wr-')),
  );
});
console.log('wear overlay ids (debut/mid/brutal):', JSON.stringify(wearOverlayIds));
const [debutWear, midWear, brutalWear] = wearOverlayIds;
if (debutWear.length !== 0) {
  console.error('WEAR DEBUT CHECK FAIL: expected zero overlays at debut, got', debutWear);
  process.exitCode = 1;
} else if (midWear.length === 0 || brutalWear.length === 0) {
  console.error('WEAR PROGRESSION CHECK FAIL: mid-career and brutal-run must both carry overlays');
  process.exitCode = 1;
} else if (brutalWear.length <= midWear.length) {
  console.error('WEAR PROGRESSION CHECK FAIL: brutal run should carry at least as many overlay layers as mid-career, and more of at least one severity');
  process.exitCode = 1;
} else {
  console.log('WEAR PROGRESSION CHECK PASS: debut has none, mid < brutal in overlay count');
}

console.log('--- lab screen ---');
await page.goto(BASE_URL + '/#/lab');
await page.waitForTimeout(500);
await shot(page, 'lab-screen');
const labText = await page.textContent('body');
console.log('lab screen text (first 800 chars):', labText.replace(/\s+/g, ' ').trim().slice(0, 800));

console.log('--- skip path ---');
await page.goto(BASE_URL + '/');
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.waitForSelector('#career-screen');
await page.click('button:has-text("Skip: random prospect")');
await page.waitForSelector('#career-screen h1');
const skipHeader = await page.textContent('#career-screen h1');
console.log('skip path header:', skipHeader);
await shot(page, 'skip-path-started');

console.log('CONSOLE ERRORS TOTAL:', JSON.stringify(consoleErrors, null, 2));
if (consoleErrors.length > 0) process.exitCode = 1;

await browser.close();
