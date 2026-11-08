// Browser test of real data, against the app started with DATABENTO_BASE_URL pointing at
// tests/mock-databento.mjs:  node tests/e2e-real.mjs [http://localhost:3000] [http://localhost:4010]
import { createRequire } from 'node:module';
import E from '../src/lib/engine.js';

const require = createRequire(import.meta.url);
let pw;
try { pw = require('playwright'); } catch {
  console.error('Playwright is not installed. Run: npm i -D playwright && npx playwright install chromium');
  process.exit(1);
}
const urls = process.argv.filter(a => /^https?:\/\//.test(a));
const BASE = (urls[0] || 'http://localhost:3000').replace(/\/$/, '');
const MOCK = (urls[1] || 'http://localhost:4010').replace(/\/$/, '');
const KEY = 'db-' + 'Test1234'.repeat(3) + 'abcde';
const BAD = 'db-' + 'bad'.repeat(9) + 'xx';
let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log('FAIL:', m); } else console.log('ok  ', m); };
const mockCount = async () => (await (await fetch(MOCK + '/stats')).json()).requests;
const lastDay = E.lastCompletedTradingDay(Date.now());

const browser = await pw.chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark' });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
const loaded = async (pred, arg) => {
  try { await page.waitForFunction(pred, arg, { timeout: 20000 }); }
  catch (e) {
    const state = await page.evaluate(() => ({ kind: window.__tt && window.__tt.st.ds.kind, date: window.__tt && window.__tt.st.rep && window.__tt.st.rep.date, toasts: [...document.querySelectorAll('.toast')].map(t => t.textContent) }));
    throw new Error('timed out; state ' + JSON.stringify(state));
  }
};

await page.goto(BASE + '/replay?debug=1');
await loaded(() => window.__tt && window.__tt.st.rep);
ok(await page.evaluate(() => window.__tt.st.ds.kind) === 'sample', 'starts on sample data without a key');

// the Data panel offers real data and asks for a key
await page.click('#btnData');
ok(await page.locator('#popData [data-ds="real"][aria-disabled="true"]').count() === 1, 'real data needs a key first');
await page.fill('#dbnKey', 'not-a-key');
await page.click('#dbnSave');
ok(await page.locator('.toast', { hasText: 'Keys start with db-' }).count() > 0, 'rejects text that is not a key');

let before = await mockCount();
await page.fill('#dbnKey', KEY);
await page.click('#dbnSave');
await loaded(d => window.__tt.st.rep && window.__tt.st.rep.kind === 'real' && window.__tt.st.rep.date === d && !window.__tt.st.loading, lastDay);
const info = await page.evaluate(() => { const r = window.__tt.st.rep; return { n: r.sessionEnd - r.sessionStart, ctx: r.sessionStart, label: document.querySelector('#dataLabel').textContent }; });
ok(info.n > 1000 && info.ctx > 3000, `latest real day loaded with context (${info.n} bars, ${info.ctx} before)`);
ok(info.label === 'Real NQ data', 'data chip says real data');
const used = (await mockCount()) - before;
ok(used === 1, `one request for the day and its context (${used})`);

// pick a date, then restart it from memory
before = await mockCount();
await page.evaluate(() => { const i = document.querySelector('#dayInput'); i.value = '2024-03-12'; i.dispatchEvent(new Event('change', { bubbles: true })); });
await loaded(() => window.__tt.st.rep.kind === 'real' && window.__tt.st.rep.date === '2024-03-12' && !window.__tt.st.loading);
await page.click('#btnRestart');
await page.waitForTimeout(300);
ok((await mockCount()) - before === 1, 'picked day loads with one request; restart needs none');

// trade it
await page.click('#btnPlay'); await page.waitForTimeout(800); await page.click('#btnPlay');
await page.click('#btnBuy');
for (let k = 0; k < 600; k++) { if (await page.evaluate(() => !window.__tt.st.broker.pos)) break; await page.keyboard.press('ArrowRight'); }
const tr = await page.evaluate(() => window.__tt.st.broker.trades[0]);
ok(!!tr && isFinite(tr.net), 'a trade on real data closes with a result');

// holiday: falls forward to the next session
await page.evaluate(() => { const i = document.querySelector('#dayInput'); i.value = '2024-07-04'; i.dispatchEvent(new Event('change', { bubbles: true })); });
await loaded(() => window.__tt.st.rep.kind === 'real' && window.__tt.st.rep.date === '2024-07-05' && !window.__tt.st.loading);
ok(true, 'a closed day opens the next session');

// random blind day
await page.evaluate(() => { window.__tt.S.blind = true; });
await page.click('#btnRandom');
await loaded(() => window.__tt.st.rep && window.__tt.st.rep.kind === 'real' && window.__tt.st.blindActive && !window.__tt.st.loading);
ok(await page.evaluate(() => window.__tt.st.ds.kind === 'real' && window.__tt.st.rep.sessionEnd - window.__tt.st.rep.sessionStart > 1000), 'random blind real day loads');

// reload: real data is remembered and cached days come from this browser
before = await mockCount();
await page.goto(BASE + '/replay?debug=1&day=2024-03-12');
await loaded(() => window.__tt && window.__tt.st.rep && window.__tt.st.rep.kind === 'real' && window.__tt.st.rep.date === '2024-03-12' && !window.__tt.st.loading);
ok(await page.evaluate(() => window.__tt.st.ds.kind) === 'real', 'real data stays selected after a reload');
ok((await mockCount()) === before, 'cached days load without a new request');

// removing the key goes back to sample data
await page.click('#btnData');
await page.click('#dbnForget');
await loaded(() => window.__tt.st.ds.kind === 'sample' && window.__tt.st.rep && window.__tt.st.rep.kind === 'sample');
ok(await page.evaluate(() => localStorage.getItem('tt.dbnKey')) === null, 'key removed from the browser');

// a key Databento rejects: clear message, sample data still works
const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 800 } });
await ctx2.addInitScript(([k]) => { localStorage.setItem('tt.dbnKey', k); localStorage.setItem('tt.settings', JSON.stringify({ dataset: 'real' })); }, [BAD]);
const p2 = await ctx2.newPage();
p2.on('pageerror', e => errors.push('bad-key pageerror: ' + e.message));
await p2.goto(BASE + '/replay?debug=1');
await p2.waitForFunction(() => window.__tt && window.__tt.st.rep, null, { timeout: 20000 });
await p2.waitForTimeout(300);
ok(await p2.locator('.toast', { hasText: "didn't accept that API key" }).count() > 0, 'explains a rejected key');
ok(await p2.evaluate(() => window.__tt.st.ds.kind) === 'sample', 'falls back to sample data');

// picking a day while real data is still loading: the newer choice wins
const ctx3 = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const p3 = await ctx3.newPage();
p3.on('pageerror', e => errors.push('race pageerror: ' + e.message));
await p3.goto(BASE + '/replay?debug=1');
await p3.waitForFunction(() => window.__tt && window.__tt.st.rep, null, { timeout: 20000 });
await p3.click('#btnData');
await p3.fill('#dbnKey', KEY);
await p3.click('#dbnSave');
await p3.evaluate(() => { const i = document.querySelector('#dayInput'); i.value = '2023-05-17'; i.dispatchEvent(new Event('change', { bubbles: true })); });
await p3.waitForFunction(() => window.__tt.st.rep.kind === 'real' && window.__tt.st.rep.date === '2023-05-17' && !window.__tt.st.loading, null, { timeout: 20000 })
  .then(() => ok(true, 'picking a day during a load ends on that real day'))
  .catch(async () => ok(false, 'picking a day during a load: ' + JSON.stringify(await p3.evaluate(() => ({ kind: window.__tt.st.ds.kind, rep: window.__tt.st.rep.kind, date: window.__tt.st.rep.date })))));

// the server refuses bad requests without calling Databento
const direct = async (q, h) => { const r = await fetch(BASE + '/api/bars?' + q, { headers: h || {} }); return [r.status, (await r.json()).error || '']; };
before = await mockCount();
ok((await direct('from=2024-03-12&to=2024-03-12'))[0] === 401, 'no key and not an owner: 401');
ok((await direct('from=2024-03-01&to=2024-03-30', { 'x-databento-key': KEY }))[0] === 400, 'more than 14 days: 400');
ok((await direct('from=2009-01-05&to=2009-01-06', { 'x-databento-key': KEY }))[0] === 400, 'before June 2010: 400');
ok((await direct('from=2024-03-12&to=2024-03-12&symbol=ES', { 'x-databento-key': KEY }))[0] === 400, 'other symbols: 400');
ok((await mockCount()) === before, 'none of those reached Databento');
const okRes = await fetch(BASE + '/api/bars?from=2024-03-12&to=2024-03-12&symbol=MNQ', { headers: { 'x-databento-key': KEY } });
ok(okRes.ok && /private/.test(okRes.headers.get('cache-control') || ''), 'responses are never cached for other people');

ok(errors.length === 0, 'no page errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
await browser.close();
console.log(fails ? `\n${fails} failed` : '\nall passed');
process.exit(fails ? 1 : 0);
