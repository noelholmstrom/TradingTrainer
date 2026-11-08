// End-to-end check against a running server: node tests/e2e.mjs [http://localhost:3000] [shots]
// Needs Playwright: npm i -D playwright && npx playwright install chromium
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);
let pw;
try { pw = require('playwright'); } catch {
  console.error('Playwright is not installed. Run: npm i -D playwright && npx playwright install chromium');
  process.exit(1);
}
const BASE = (process.argv.find(a => /^https?:\/\//.test(a)) || process.env.BASE || 'http://localhost:3000').replace(/\/$/, '');
const SHOTS = process.argv.includes('shots');
const OUT = path.resolve('tests/shots');
fs.mkdirSync(OUT, { recursive: true });

let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log('FAIL:', m); } else console.log('ok  ', m); };

const browser = await pw.chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark' });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text() + ' ' + (m.location().url || '').replace(BASE, '')); });
page.on('response', r => { if (r.status() >= 400) errors.push(r.status() + ' ' + r.url().replace(BASE, '')); });

// landing
await page.goto(BASE + '/');
ok(await page.locator('h1').first().textContent().then(t => /Replay any Nasdaq session/.test(t)), 'landing headline');

// replay: mount, trade, journal
await page.goto(BASE + '/replay?debug=1');
await page.waitForFunction(() => window.__tt && window.__tt.st.agg && window.__tt.st.agg.time.length > 100, null, { timeout: 20000 });
ok(true, 'trainer mounted');
ok(await page.locator('#btnBuy').isEnabled(), 'ticket enabled');
await page.click('#btnPlay');
await page.waitForTimeout(1200);
await page.click('#btnPlay');
await page.click('#btnBuy');
for (let k = 0; k < 500; k++) {
  if (await page.evaluate(() => !window.__tt.st.broker.pos)) break;
  await page.keyboard.press('ArrowRight');
}
const t = await page.evaluate(() => { const x = window.__tt.st.broker.trades[0]; return x && { reason: x.reason, notes: x.notes.map(n => n.key), net: x.net }; });
ok(!!t, 'first trade closed: ' + JSON.stringify(t));
ok(await page.locator('[data-ai]').count() === 0, 'AI button hidden when the coach is off');
await page.waitForTimeout(600);
await page.click('#tabs [data-tab="journal"]');
await page.waitForTimeout(400);
ok(/saved session/.test(await page.locator('#panel-journal').textContent()), 'journal tab shows the saved session');
if (SHOTS) {
  await page.click('#btnBuy');
  for (let k = 0; k < 6; k++) await page.keyboard.press('ArrowRight');
  await page.click('#tabs [data-tab="trades"]');
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(OUT, 'replay-dark.png') });
}

// leave and come back (unmount + remount) without errors
await page.click('.site-nav a[href="/learn"]');
await page.waitForURL('**/learn');
await page.click('.site-nav a[href="/replay"]');
await page.waitForFunction(() => window.__tt === undefined || (window.__tt.st && window.__tt.st.agg), null, { timeout: 15000 });
await page.waitForTimeout(800);
ok(await page.locator('#chart canvas').count() > 0, 'trainer remounted after client navigation');

// stats page reads the browser journal
await page.goto(BASE + '/stats');
await page.waitForSelector('.tiles', { timeout: 15000 });
const tilesText = await page.locator('.tiles').first().textContent();
ok(/Net P\/L/.test(tilesText) && /Trades/.test(tilesText), 'stats tiles render');
ok(await page.locator('.panel-card svg').count() >= 2, 'stats charts render');
if (SHOTS) await page.screenshot({ path: path.join(OUT, 'stats-dark.png'), fullPage: true });

// lesson + quiz + progress
await page.goto(BASE + '/learn/the-contract');
for (const [q, o] of [[0, 1], [1, 0], [2, 1]]) await page.check(`#q${q}o${o}`);
await page.click('.quiz button[type="submit"]');
await page.waitForTimeout(300);
ok(/3 of 3 correct/.test(await page.locator('.quiz').textContent()), 'quiz scores 3 of 3');
await page.goto(BASE + '/learn');
await page.waitForTimeout(500);
ok(await page.locator('.done-chip').count() === 1, 'lesson marked done in the list');
if (SHOTS) await page.screenshot({ path: path.join(OUT, 'learn-dark.png') });

// lesson practice link opens a blind random day with the lesson card
await page.goto(BASE + '/learn/fair-value-gaps');
await page.click('.practice a');
await page.waitForFunction(() => window.__tt === undefined, null, { timeout: 3000 }).catch(() => {});
await page.waitForSelector('#lessonCard:not([hidden])', { timeout: 15000 });
ok(/Fair value gaps/.test(await page.locator('#lessonCard').textContent()), 'practice card shows the lesson');
ok(await page.locator('#tfGroup [data-tf="5"][aria-pressed="true"]').count() === 1, 'practice opens on the 5-minute chart');
ok(!(await page.locator('#hiddenDay').isHidden()), 'practice day is blind');

// sign-in page in guest mode
await page.goto(BASE + '/login');
ok(/Accounts are switched off/.test(await page.locator('main').textContent()), 'login explains guest mode');

// theme toggle
await page.goto(BASE + '/');
await page.click('.theme-btn');
ok(await page.evaluate(() => document.documentElement.getAttribute('data-theme')) === 'light', 'theme toggle sets light');
if (SHOTS) await page.screenshot({ path: path.join(OUT, 'home-light.png'), fullPage: true });
await page.click('.theme-btn');
await page.click('.theme-btn');

// phone
const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: 'dark' });
const pp = await phone.newPage();
pp.on('pageerror', e => errors.push('phone pageerror: ' + e.message));
await pp.goto(BASE + '/replay');
await pp.waitForSelector('#chart canvas', { timeout: 20000 });
const overflow = await pp.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
ok(overflow <= 1, 'no sideways scroll on a phone (' + overflow + 'px)');
if (SHOTS) { await pp.waitForTimeout(500); await pp.screenshot({ path: path.join(OUT, 'replay-phone.png') }); }
await pp.goto(BASE + '/');
const overflowHome = await pp.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
ok(overflowHome <= 1, 'home page fits a phone (' + overflowHome + 'px)');
if (SHOTS) await pp.screenshot({ path: path.join(OUT, 'home-phone.png'), fullPage: true });

ok(errors.length === 0, 'no page errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
await browser.close();
console.log(fails ? `\n${fails} failed` : '\nall passed');
process.exit(fails ? 1 : 0);
