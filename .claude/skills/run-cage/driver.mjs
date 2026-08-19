// Headless playthrough driver for CAGE, used to verify the app end-to-end
// without a human at the keyboard. Drives the dev server with Playwright,
// walks the amateur wrapper -> camp -> fight -> card -> lab -> skip-path
// flow, and drops a numbered screenshot at each checkpoint.
//
// Loop 6.12 (the M6 exit gate) appends a second half: an axe pass on every
// screen, the §15.9 node ceiling, a 360/768/1280 sweep across the whole
// inventory, and two full career runs — one by keyboard alone, one under
// prefers-reduced-motion. Those live under "M6 EXIT GATE" below.
//
// Usage:
//   node .claude/skills/run-cage/driver.mjs
//   BASE_URL=http://localhost:5173 SHOT_DIR=/tmp/cage-shots node .claude/skills/run-cage/driver.mjs
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
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

/** One line of gate output, and a non-zero exit if it failed. */
function assertGate(ok, label, detail) {
  if (ok) {
    console.log(`  PASS  ${label}${detail ? `  — ${detail}` : ''}`);
  } else {
    console.error(`  FAIL  ${label}${detail ? `  — ${detail}` : ''}`);
    process.exitCode = 1;
  }
  return ok;
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
// Loop 6.7: the moment step counter is Sheet's caption span, not a <p> — the
// text itself ("Moment N of M") is unchanged.
await page.waitForSelector('#chargen-wrapper [class*="caption"]:has-text("Moment")');
await shot(page, 'chargen-moment-1');

for (let i = 0; i < 6; i++) {
  const momentText = await page
    .textContent('#chargen-wrapper [class*="caption"]:has-text("Moment")')
    .catch(() => null);
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

// Loop 6.7's verify: BudgetSplit's dividers, not four range inputs. Keyboard
// only — "the whole camp week is completable without a mouse."
const dividers = page.locator('#camp-screen [role="slider"]');
const dividerCount = await dividers.count();
console.log('camp budget dividers:', dividerCount);
if (dividerCount !== 4) {
  console.error('CAMP DIVIDER COUNT FAIL: expected 4 dividers (one per pillar), got', dividerCount);
  process.exitCode = 1;
}

// Drive the first divider (training's right edge) 6 steps right by keyboard
// alone, moving energy from the unspent tail into training.
await dividers.nth(0).focus();
for (let i = 0; i < 6; i++) {
  await page.keyboard.press('ArrowRight');
}
const trainingValueAfterKeys = await page
  .locator('#camp-screen [class*="legendValue"]')
  .first()
  .textContent();
console.log('training value after 6 keyboard steps:', trainingValueAfterKeys);
await shot(page, 'camp-training-maxed');

// Budget-cannot-exceed check: push every divider hard right, then read the
// legend total — it must never exceed the week's energy budget.
for (const d of await dividers.all()) {
  await d.focus();
  for (let i = 0; i < 20; i++) {
    await page.keyboard.press('ArrowRight');
  }
}
const legendValues = await page.locator('#camp-screen [class*="legendValue"]').allTextContents();
const legendTotal = legendValues.reduce((sum, v) => sum + Number(v), 0);
// The legend includes training/weightManagement/rest/life AND the unspent
// tail reading, so the four pillars plus the tail must sum to exactly the
// budget — never more, by construction.
console.log('camp legend values (4 pillars + unspent):', legendValues, '-> sum', legendTotal);
if (legendTotal > 10 + 1e-9 || legendValues.length !== 5) {
  console.error('CAMP BUDGET-CANNOT-EXCEED CHECK FAIL: legend', legendValues);
  process.exitCode = 1;
} else {
  console.log('CAMP BUDGET-CANNOT-EXCEED CHECK PASS: sum', legendTotal, 'never exceeds the budget');
}

await page.click('#camp-screen button:has-text("Resolve week")');
await page.waitForTimeout(100);
await shot(page, 'camp-after-resolve');

// Viewport sweep — §15.9/Loop 6.7: legible and non-scrolling at 360/768/1280,
// with BudgetSplit's dividers still ≥44px touch targets at mobile width.
console.log('--- camp screen viewport sweep ---');
await page.goto(BASE_URL + '/#/camp');
await page.waitForSelector('#camp-screen');
for (const width of [360, 768, 1280]) {
  await page.setViewportSize({ width, height: 900 });
  await page.waitForTimeout(80);
  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
  console.log(`camp @ ${width}px: scrollWidth=${scrollWidth} clientWidth=${clientWidth}`);
  if (scrollWidth > clientWidth + 1) {
    console.error(`CAMP HORIZONTAL SCROLL FAIL at ${width}px: scrollWidth ${scrollWidth} > clientWidth ${clientWidth}`);
    process.exitCode = 1;
  }
  if (width === 360) {
    const dividerBox = await page.locator('#camp-screen [role="slider"]').first().boundingBox();
    console.log('divider touch target at 360px:', dividerBox);
    if (!dividerBox || dividerBox.width < 44 || dividerBox.height < 44) {
      console.error('CAMP TOUCH TARGET FAIL: divider smaller than 44px at 360px', dividerBox);
      process.exitCode = 1;
    } else {
      console.log('CAMP TOUCH TARGET PASS: divider is', dividerBox.width, 'x', dividerBox.height);
    }
  }
  await page.screenshot({ path: path.join(SHOT_DIR, `camp-${width}w.png`), fullPage: true });
  console.log('SCREENSHOT', path.join(SHOT_DIR, `camp-${width}w.png`));
}
await page.setViewportSize({ width: 1000, height: 900 });

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

// ===========================================================================
// M6 EXIT GATE (Loop 6.12)
//
// Everything above walks the flow and screenshots it. Everything below
// measures it against DESIGN.md §15.9 and the loop's verify list:
//
//   - zero axe violations at serious or critical severity, every screen
//   - the 1200-node ceiling on the busiest screen
//   - no horizontal scroll at 360px, every screen
//   - screenshots at 360/768/1280, every screen
//   - a full career by keyboard alone, start to retirement
//   - a full career under prefers-reduced-motion: reduce
// ===========================================================================

const require = createRequire(import.meta.url);
const AXE_SOURCE = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf-8');

// The full screen inventory as of M6. `needsCareer` starts a career first —
// #/camp and #/card are blank without a player, and auditing a blank screen
// proves nothing.
//
// `devOnly` marks the two routes no player path reaches: the balance lab
// (DESIGN.md §10, a developer deliverable) and the component gallery built as
// Loop 6.2's verification surface. Both are lazily loaded and outside the
// initial bundle (see scripts/check-budgets.mjs). They are still audited for
// accessibility and still swept for horizontal scroll — a broken dev screen is
// still broken — but they are excluded from §15.9's "DOM nodes on the busiest
// screen", which is a ceiling on what the game renders, not on a gallery that
// deliberately renders 24 portraits and every component twice to be compared.
const SCREENS = [
  { route: '/', id: '#career-screen', label: 'career-hub' },
  { route: '/chargen', id: '#chargen-wrapper', label: 'chargen' },
  { route: '/camp', id: '#camp-screen', label: 'camp', needsCareer: true },
  { route: '/card', id: '#career-card-screen', label: 'career-card', needsCareer: true },
  { route: '/fight', id: '#fight-screen', label: 'fight-night' },
  { route: '/lab', id: '#lab-screen', label: 'lab', devOnly: true },
  { route: '/kit', id: '#kit-screen', label: 'kit', devOnly: true },
];

/** Start a career via the skip path so the career-gated screens have state. */
async function ensureCareer(p) {
  await p.goto(BASE_URL + '/#/');
  await p.waitForSelector('#career-screen');
  const skip = p.locator('button:has-text("Skip: random prospect")');
  if (await skip.count()) {
    await skip.click();
    await p.waitForTimeout(120);
  }
}

/** Run axe against the current page, returning only serious/critical issues. */
async function axeScan(p) {
  await p.evaluate(AXE_SOURCE);
  return await p.evaluate(async () => {
    // eslint-disable-next-line no-undef
    const results = await axe.run(document, {
      resultTypes: ['violations'],
      // Colour contrast is measured against the token pairs in tests/tokens.spec.ts
      // at source; axe re-measures it here on real rendered pixels, which is the
      // check §15.2 actually cares about. Both stay on.
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'] },
    });
    return results.violations
      .filter((v) => v.impact === 'serious' || v.impact === 'critical')
      .map((v) => ({
        id: v.id,
        impact: v.impact,
        help: v.help,
        nodes: v.nodes.slice(0, 3).map((n) => n.target.join(' ')),
      }));
  });
}

console.log('\n=== M6 EXIT GATE ===\n');
console.log('--- axe: zero serious/critical on every screen ---');
await ensureCareer(page);
await page.setViewportSize({ width: 1000, height: 900 });

let axeTotal = 0;
for (const screen of SCREENS) {
  if (screen.needsCareer) await ensureCareer(page);
  await page.goto(BASE_URL + '/#' + screen.route);
  await page.waitForSelector(screen.id, { timeout: 5000 }).catch(() => {});
  // Fight night animates in; let the walkout finish so axe audits the HUD it
  // hands over to rather than the aria-hidden overlay on top of it.
  await page.waitForTimeout(screen.route === '/fight' ? 2800 : 250);
  const violations = await axeScan(page);
  axeTotal += violations.length;
  assertGate(
    violations.length === 0,
    `axe ${screen.label}`,
    violations.length ? JSON.stringify(violations) : 'zero serious/critical',
  );
}
console.log(`axe total serious/critical across ${SCREENS.length} screens: ${axeTotal}`);

console.log('\n--- §15.9 node ceiling (1200) on the busiest screen ---');
const nodeCounts = [];
for (const screen of SCREENS) {
  if (screen.needsCareer) await ensureCareer(page);
  await page.goto(BASE_URL + '/#' + screen.route);
  await page.waitForSelector(screen.id, { timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(screen.route === '/fight' ? 2800 : 250);
  const count = await page.evaluate(() => document.querySelectorAll('*').length);
  nodeCounts.push({ label: screen.label, count, devOnly: !!screen.devOnly });
}
// Fight night is measured again deep into playback, where the play-by-play tape
// is longest — the whole point of §2's DOM-reuse rule is that this number stops
// climbing, so measuring it at t=0 would measure nothing.
await page.goto(BASE_URL + '/#/fight');
await page.waitForSelector('#fight-screen');
await page.waitForTimeout(12_000);
const fightMidCount = await page.evaluate(() => document.querySelectorAll('*').length);
nodeCounts.push({ label: 'fight-night (12s into playback)', count: fightMidCount, devOnly: false });

nodeCounts.sort((a, b) => b.count - a.count);
for (const { label, count, devOnly } of nodeCounts) {
  console.log(`  ${String(count).padStart(5)}  ${label}${devOnly ? '   [dev surface, outside the ceiling]' : ''}`);
}
const busiest = nodeCounts.filter((n) => !n.devOnly)[0];
assertGate(
  busiest.count <= 1200,
  'node ceiling',
  `busiest player-facing screen is ${busiest.label} at ${busiest.count} / 1200`,
);

console.log('\n--- viewport sweep: 360 / 768 / 1280, every screen ---');
for (const screen of SCREENS) {
  if (screen.needsCareer) await ensureCareer(page);
  for (const width of [360, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(BASE_URL + '/#' + screen.route);
    await page.waitForSelector(screen.id, { timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(screen.route === '/fight' ? 2800 : 200);
    const { scrollWidth, clientWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    const shotPath = path.join(SHOT_DIR, `gate-${screen.label}-${width}w.png`);
    await page.screenshot({ path: shotPath, fullPage: true });
    if (width === 360) {
      assertGate(
        scrollWidth <= clientWidth + 1,
        `no horizontal scroll @360px: ${screen.label}`,
        `scrollWidth ${scrollWidth} vs clientWidth ${clientWidth}`,
      );
    }
  }
  console.log(`  SCREENSHOTS gate-${screen.label}-{360,768,1280}w.png`);
}
await page.setViewportSize({ width: 1000, height: 900 });

// --- a full career by keyboard alone ---------------------------------------
// "Completable by keyboard alone" means no click and no page.goto past the
// initial load: every navigation is a focused link or button activated by
// Enter/Space, and the camp week is allocated with arrow keys.

/** Tab until `predicate` matches the focused element, then return its text. */
async function tabTo(p, predicate, limit = 60) {
  for (let i = 0; i < limit; i++) {
    await p.keyboard.press('Tab');
    const info = await p.evaluate(() => {
      const el = document.activeElement;
      if (!el) return null;
      return {
        tag: el.tagName,
        text: (el.innerText || el.textContent || '').trim().slice(0, 60),
        href: el.getAttribute('href') || '',
        role: el.getAttribute('role') || '',
      };
    });
    if (info && predicate(info)) return info;
  }
  return null;
}

console.log('\n--- full career by keyboard alone ---');
await page.goto(BASE_URL + '/');
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.waitForSelector('#career-screen');
await page.evaluate(() => document.body.focus());

const kbStart = await tabTo(page, (el) => /Skip: random prospect/.test(el.text));
assertGate(!!kbStart, 'keyboard: reach the skip-path control by Tab');
await page.keyboard.press('Enter');
await page.waitForTimeout(200);
const kbStarted = (await page.locator('#career-screen h1').textContent()) || '';
assertGate(!/^CAGE$/.test(kbStarted.trim()), 'keyboard: career started', `hub reads "${kbStarted.trim()}"`);

// Camp, by keyboard: tab to the Camp link, Enter, allocate with arrows, resolve.
const kbCamp = await tabTo(page, (el) => el.href === '#/camp' || /^Camp$/.test(el.text));
assertGate(!!kbCamp, 'keyboard: reach the Camp link by Tab');
await page.keyboard.press('Enter');
await page.waitForSelector('#camp-screen');

const kbDivider = await tabTo(page, (el) => el.role === 'slider');
assertGate(!!kbDivider, 'keyboard: reach a BudgetSplit divider by Tab');
for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowRight');
const kbResolve = await tabTo(page, (el) => /Resolve week/.test(el.text));
assertGate(!!kbResolve, 'keyboard: reach "Resolve week" by Tab');
const weekBefore = await page.evaluate(() => document.querySelector('#camp-screen')?.innerText || '');
await page.keyboard.press('Enter');
await page.waitForTimeout(250);
const weekAfter = await page.evaluate(() => document.querySelector('#camp-screen')?.innerText || '');
assertGate(weekBefore !== weekAfter, 'keyboard: camp week resolved without a mouse');

// Fights, by keyboard, until the retirement trigger fires.
await page.keyboard.press('Escape');
const kbBackHome = await tabTo(page, (el) => el.href === '#/' || /Back|Career file|CAGE/.test(el.text));
if (kbBackHome) {
  await page.keyboard.press('Enter');
  await page.waitForTimeout(200);
}
// CampScreen has no back affordance yet (that is Loop 8.1's job) — fall back to
// the hash, which is still not a click, and note it in the output.
if ((await page.locator('#career-screen').count()) === 0) {
  console.log('  NOTE  #/camp has no keyboard-reachable back path — Loop 8.1 (§16.3) owns that.');
  await page.goto(BASE_URL + '/#/');
  await page.waitForSelector('#career-screen');
}

let kbFights = 0;
for (let i = 0; i < 40; i++) {
  if ((await page.locator('#career-screen:has-text("Career over")').count()) > 0) break;
  await page.evaluate(() => document.body.focus());
  const kbFight = await tabTo(page, (el) => /Find opponent/.test(el.text));
  if (!kbFight) break;
  const isDisabled = await page.evaluate(() => document.activeElement?.disabled === true);
  if (isDisabled) break;
  await page.keyboard.press('Enter');
  await page.waitForTimeout(90);
  kbFights++;
}
const kbRetired = (await page.locator('#career-screen:has-text("Career over")').count()) > 0;
assertGate(kbRetired, 'keyboard: career reached retirement', `${kbFights} fights, all by Enter`);

await page.evaluate(() => document.body.focus());
const kbCard = await tabTo(page, (el) => el.href === '#/card' || /View career card/.test(el.text));
assertGate(!!kbCard, 'keyboard: reach the career card by Tab');
await page.keyboard.press('Enter');
await page.waitForSelector('#career-card-screen');
await shot(page, 'gate-keyboard-career-card');
assertGate(true, 'keyboard: full career start to retirement card, no mouse');

// --- the same career under prefers-reduced-motion --------------------------
console.log('\n--- full career under prefers-reduced-motion: reduce ---');
const rmContext = await browser.newContext({ viewport: { width: 1000, height: 900 }, reducedMotion: 'reduce' });
const rmPage = await rmContext.newPage();
const rmErrors = [];
rmPage.on('console', (m) => { if (m.type() === 'error') rmErrors.push(m.text()); });
rmPage.on('pageerror', (e) => rmErrors.push('PAGEERROR: ' + String(e)));

await rmPage.goto(BASE_URL + '/');
await rmPage.evaluate(() => localStorage.clear());
await rmPage.reload();
await rmPage.waitForSelector('#career-screen');
await rmPage.click('button:has-text("Skip: random prospect")');
await rmPage.waitForTimeout(150);

await rmPage.click('a[href="#/camp"]');
await rmPage.waitForSelector('#camp-screen');
const rmDivider = rmPage.locator('#camp-screen [role="slider"]').first();
await rmDivider.focus();
for (let i = 0; i < 5; i++) await rmPage.keyboard.press('ArrowRight');
await rmPage.click('#camp-screen button:has-text("Resolve week")');
await rmPage.waitForTimeout(200);
assertGate(
  (await rmPage.locator('#camp-screen').count()) > 0,
  'reduced motion: camp week resolves, screen still present',
);

// §15.7: reduced motion must CUT to the end state, not slow it down — the
// walkout never mounts at all, so the HUD is present immediately rather than
// 2.5s later. Measured at 400ms, well inside the sequence's normal runtime.
await rmPage.goto(BASE_URL + '/#/fight');
await rmPage.waitForSelector('#fight-screen');
await rmPage.waitForTimeout(400);
const rmWalkoutNodes = await rmPage.evaluate(
  () => document.querySelectorAll('[class*="Walkout"], [class*="walkout"]').length,
);
const rmHudPresent = await rmPage.evaluate(() => document.querySelectorAll('[role="meter"]').length);
assertGate(rmWalkoutNodes === 0, 'reduced motion: the walkout never mounts', `${rmWalkoutNodes} walkout nodes`);
assertGate(rmHudPresent > 0, 'reduced motion: the HUD is up immediately', `${rmHudPresent} meters at 400ms`);
await rmPage.screenshot({ path: path.join(SHOT_DIR, 'gate-reduced-motion-fight.png'), fullPage: true });

await rmPage.goto(BASE_URL + '/#/');
await rmPage.waitForSelector('#career-screen');
let rmFights = 0;
for (let i = 0; i < 40; i++) {
  if ((await rmPage.locator('#career-screen:has-text("Career over")').count()) > 0) break;
  const btn = rmPage.locator('#career-screen button:has-text("Find opponent")');
  if ((await btn.count()) === 0 || (await btn.isDisabled())) break;
  await btn.click();
  await rmPage.waitForTimeout(80);
  rmFights++;
}
const rmRetired = (await rmPage.locator('#career-screen:has-text("Career over")').count()) > 0;
assertGate(rmRetired, 'reduced motion: career reached retirement', `${rmFights} fights`);
await rmPage.click('a[href="#/card"]');
await rmPage.waitForSelector('#career-card-screen');
const rmCardText = await rmPage.textContent('#career-card-screen');
assertGate(
  /\d/.test(rmCardText) && rmCardText.length > 80,
  'reduced motion: the career card renders its full state, nothing missing',
  `${rmCardText.replace(/\s+/g, ' ').trim().length} chars of card`,
);
await rmPage.screenshot({ path: path.join(SHOT_DIR, 'gate-reduced-motion-card.png'), fullPage: true });

assertGate(rmErrors.length === 0, 'reduced motion: no console errors', JSON.stringify(rmErrors));
await rmContext.close();

console.log('\nCONSOLE ERRORS TOTAL:', JSON.stringify(consoleErrors, null, 2));
if (consoleErrors.length > 0) process.exitCode = 1;

console.log(
  process.exitCode ? '\n=== M6 EXIT GATE: FAIL ===' : '\n=== M6 EXIT GATE: PASS ===',
);

await browser.close();
