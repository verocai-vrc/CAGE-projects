import { chromium } from 'playwright';
import fs from 'node:fs';

const shotDir = 'C:/Users/arthur/AppData/Local/Temp/claude/c--Users-arthur-Desktop-CAGE-Project-CAGE-projects/ac524616-9086-4bd8-852b-f66b38a824b5/scratchpad/playtest';
fs.mkdirSync(shotDir, { recursive: true });
let shotN = 0;
async function shot(page, label) {
  shotN++;
  const path = `${shotDir}/${String(shotN).padStart(2, '0')}-${label}.png`;
  await page.screenshot({ path, fullPage: true });
  console.log('SCREENSHOT', path);
}

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1000, height: 900 } });
const page = await context.newPage();
const consoleErrors = [];
page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
page.on('pageerror', (err) => consoleErrors.push('PAGEERROR: ' + String(err)));

await page.goto('http://localhost:5183/');
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.waitForSelector('#career-screen');
await shot(page, 'career-start');

console.log('--- chargen wrapper flow ---');
await page.click('a[href="#/chargen"]');
await page.waitForSelector('#chargen-wrapper');
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
const headerAfterChargen = await page.textContent('#career-screen h2');
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
await page.goto('http://localhost:5183/#/');
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
await page.goto('http://localhost:5183/#/card');
await page.waitForSelector('#career-card-screen');
await shot(page, 'career-card');
const cardText = await page.textContent('#career-card-screen');
console.log('career card text:', cardText.replace(/\s+/g, ' ').trim());

console.log('--- standalone /fight demo screen ---');
await page.goto('http://localhost:5183/#/fight');
await page.waitForSelector('h1:has-text("Fight night")');
await shot(page, 'fight-screen-start');
await page.waitForTimeout(1500);
await shot(page, 'fight-screen-playing');

console.log('--- lab screen ---');
await page.goto('http://localhost:5183/#/lab');
await page.waitForTimeout(500);
await shot(page, 'lab-screen');
const labText = await page.textContent('body');
console.log('lab screen text (first 800 chars):', labText.replace(/\s+/g, ' ').trim().slice(0, 800));

console.log('--- skip path ---');
await page.goto('http://localhost:5183/');
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.waitForSelector('#career-screen');
await page.click('button:has-text("Skip: random prospect")');
await page.waitForSelector('#career-screen h2');
const skipHeader = await page.textContent('#career-screen h2');
console.log('skip path header:', skipHeader);
await shot(page, 'skip-path-started');

console.log('CONSOLE ERRORS TOTAL:', JSON.stringify(consoleErrors, null, 2));

await browser.close();
