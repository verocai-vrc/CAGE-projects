import { chromium } from 'playwright';

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
await page.click('button:has-text("Today\'s prospect")');
await page.waitForSelector('#career-screen h2');

console.log('--- persistence: reload mid-career ---');
await page.waitForTimeout(600); // let debounced persist flush
const before = await page.textContent('#career-screen');
await page.reload();
await page.waitForSelector('#career-screen');
const after = await page.textContent('#career-screen');
console.log('MATCHES AFTER RELOAD:', before.replace(/\s+/g,' ').trim() === after.replace(/\s+/g,' ').trim());
console.log('before:', before.replace(/\s+/g,' ').trim());
console.log('after: ', after.replace(/\s+/g,' ').trim());

console.log('--- corrupt localStorage: fail-safe check ---');
await page.evaluate(() => {
  const keys = Object.keys(localStorage);
  for (const k of keys) if (k.toLowerCase().includes('cage')) localStorage.setItem(k, '{not valid json');
});
await page.reload();
await page.waitForSelector('#career-screen').catch((e) => console.log('FAILED TO LOAD AFTER CORRUPTION:', e.message));
const corruptText = await page.textContent('#career-screen').catch(() => 'ERROR');
console.log('after corruption, career-screen text:', corruptText);
console.log('errors so far:', JSON.stringify(consoleErrors));

console.log('--- drive to retirement (many fights) ---');
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.waitForSelector('#career-screen');
await page.click('button:has-text("Skip: random prospect")');
await page.waitForSelector('#career-screen h2');

let retiredAt = null;
for (let i = 0; i < 30; i++) {
  const retired = await page.locator('#career-screen:has-text("Career over")').count();
  if (retired > 0) { retiredAt = i; break; }
  const fightBtn = page.locator('#career-screen button:has-text("Find opponent")');
  if ((await fightBtn.count()) === 0) { console.log('no fight button at', i); break; }
  if (await fightBtn.isDisabled()) { console.log('fight button disabled at', i); break; }
  await fightBtn.click();
  await page.waitForTimeout(120);
}
console.log('retired at fight index:', retiredAt);
const finalText = await page.textContent('#career-screen');
console.log('final career-screen text:', finalText.replace(/\s+/g,' ').trim());
await page.screenshot({ path: 'C:/Users/arthur/AppData/Local/Temp/claude/c--Users-arthur-Desktop-CAGE-Project-CAGE-projects/ac524616-9086-4bd8-852b-f66b38a824b5/scratchpad/playtest/15-retired.png', fullPage: true });

if (retiredAt !== null) {
  await page.click('a[href="#/card"]');
  await page.waitForSelector('#career-card-screen');
  const cardText = await page.textContent('#career-card-screen');
  console.log('retired career card text:', cardText.replace(/\s+/g,' ').trim());
  await page.screenshot({ path: 'C:/Users/arthur/AppData/Local/Temp/claude/c--Users-arthur-Desktop-CAGE-Project-CAGE-projects/ac524616-9086-4bd8-852b-f66b38a824b5/scratchpad/playtest/16-retired-card.png', fullPage: true });
  const fightBtnStillThere = await page.locator('button:has-text("Find opponent")').count();
  console.log('fight button still visible after retirement (should be gone):', fightBtnStillThere > 0);
}

console.log('ALL CONSOLE ERRORS:', JSON.stringify(consoleErrors, null, 2));
await browser.close();
