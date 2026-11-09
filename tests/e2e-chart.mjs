// Browser test of the chart: drawings vs panning, panels, fullscreen, quick trade and the ICT overlay.
//   node tests/e2e-chart.mjs [http://localhost:3000] [shots]
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
const errors = [];
async function open(vp, url) {
  const ctx = await browser.newContext({ viewport: vp, colorScheme: 'dark' });
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto(BASE + (url || '/replay?debug=1&day=2024-03-12'));
  await page.waitForFunction(() => window.__tt && window.__tt.st.rep && window.__tt.st.agg, null, { timeout: 20000 });
  await page.waitForTimeout(300);
  return page;
}
const range = page => page.evaluate(() => { const r = window.__tt.chart.timeScale().getVisibleLogicalRange(); return r.from; });
async function chartBox(page) { return page.locator('#chart').boundingBox(); }
async function drag(page, x1, y1, x2, y2) {
  await page.mouse.move(x1, y1); await page.mouse.down();
  for (let k = 1; k <= 8; k++) await page.mouse.move(x1 + (x2 - x1) * k / 8, y1 + (y2 - y1) * k / 8);
  await page.mouse.up();
  await page.waitForTimeout(120);
}

// ---------------------------------------------------------------- drawings and panning
{
  const page = await open({ width: 1440, height: 900 });
  const b = await chartBox(page);
  const h = await page.evaluate(() => window.__tt.chart.panes()[0].getHeight());
  const L = b.x + 120, R = b.x + b.width - 260, T = b.y + h * 0.2, B = b.y + h * 0.8;

  await page.click('#tools [data-tool="rect"]');
  await drag(page, L, T, R, B);
  const rect = await page.evaluate(() => window.__tt.st.drawings[0]);
  ok(rect && rect.type === 'rect', 'rectangle drawn across most of the chart');
  await page.mouse.click(b.x + b.width - 140, b.y + 20);
  ok(await page.evaluate(() => window.__tt.st.selected) === null, 'click outside deselects');

  // drag inside the (unselected) rectangle: the chart pans, the rectangle stays
  let r0 = await range(page);
  await drag(page, (L + R) / 2, (T + B) / 2, (L + R) / 2 + 220, (T + B) / 2 + 10);
  let r1 = await range(page);
  const after = await page.evaluate(() => window.__tt.st.drawings[0]);
  ok(Math.abs(r1 - r0) > 10, `dragging inside a rectangle pans the chart (${(r1 - r0).toFixed(1)} bars)`);
  ok(after.p1.t === rect.p1.t && after.p1.p === rect.p1.p, 'the rectangle did not move');
  ok(await page.evaluate(() => window.__tt.st.selected) === null, 'panning does not select it');

  // a plain click inside selects it; then dragging the body moves it
  const mid = await page.evaluate(id => { const d = window.__tt.st.drawings.find(x => x.id === id); return { y: window.__tt.y((d.p1.p + d.p2.p) / 2) }; }, rect.id);
  const cx = (L + R) / 2 + 220;
  await page.mouse.click(cx, b.y + mid.y);
  ok(await page.evaluate(() => window.__tt.st.selected) === rect.id, 'a click inside selects the rectangle');
  r0 = await range(page);
  await drag(page, cx, b.y + mid.y, cx - 60, b.y + mid.y - 40);
  r1 = await range(page);
  const moved = await page.evaluate(() => window.__tt.st.drawings[0]);
  ok(moved.p1.p !== rect.p1.p && Math.abs(r1 - r0) < 0.5, 'once selected, dragging inside moves it (and the chart stays put)');

  // grab by the edge without selecting first
  await page.keyboard.press('Escape');
  const edgeY = await page.evaluate(() => { const d = window.__tt.st.drawings[0]; return window.__tt.y(Math.max(d.p1.p, d.p2.p)); });
  await drag(page, cx - 60, b.y + edgeY, cx - 60, b.y + edgeY + 30);
  ok(await page.evaluate(() => window.__tt.st.selected) !== null, 'the edge grabs the rectangle directly');
  await page.keyboard.press('Delete');
  ok(await page.evaluate(() => window.__tt.st.drawings.length) === 0, 'Delete removes it');

  // Fibonacci: the space between levels pans, a level line grabs it
  await page.click('#tools [data-tool="fib"]');
  await drag(page, L + 100, B - 20, R - 100, T + 20);
  await page.keyboard.press('Escape');
  const fib = await page.evaluate(() => window.__tt.st.drawings[0]);
  const ys = await page.evaluate(() => { const d = window.__tt.st.drawings[0]; return [0.236, 0.382].map(L => window.__tt.y(d.p2.p + (d.p1.p - d.p2.p) * L)); });
  const between = (ys[0] + ys[1]) / 2;
  r0 = await range(page);
  await drag(page, (L + R) / 2, b.y + between, (L + R) / 2 + 200, b.y + between);
  r1 = await range(page);
  const fibAfter = await page.evaluate(() => window.__tt.st.drawings[0]);
  ok(fib.type === 'fib' && Math.abs(r1 - r0) > 10 && fibAfter.p1.t === fib.p1.t, 'dragging between Fibonacci levels pans the chart');
  await page.mouse.click((L + R) / 2 + 200, b.y + ys[0]);
  ok(await page.evaluate(() => window.__tt.st.selected) === fib.id, 'clicking a Fibonacci level selects it');

  if (SHOTS) await page.screenshot({ path: path.join(OUT, 'chart-drawings.png') });
  await page.context().close();
}

// ---------------------------------------------------------------- panels, fullscreen, quick trade
{
  const page = await open({ width: 1366, height: 768 });
  const h0 = (await chartBox(page)).height, w0 = (await chartBox(page)).width;

  await page.click('#btnBottom');
  await page.waitForTimeout(250);
  const h1 = (await chartBox(page)).height;
  ok(h1 > h0 + 80, `folding the bottom panel makes the chart taller (${Math.round(h0)} → ${Math.round(h1)} px)`);
  await page.click('#tabs [data-tab="trades"]');
  await page.waitForTimeout(250);
  ok(!(await page.evaluate(() => document.querySelector('#trainer').classList.contains('bottom-min'))), 'clicking a tab unfolds it');

  const sp = await page.locator('#splitBottom').boundingBox();
  const bh0 = (await page.locator('.bottom').boundingBox()).height;
  await drag(page, sp.x + sp.width / 2, sp.y + 5, sp.x + sp.width / 2, sp.y + 5 - 90);
  const bh1 = (await page.locator('.bottom').boundingBox()).height;
  ok(Math.abs(bh1 - bh0 - 90) < 12, `the bottom panel resizes by dragging its edge (${Math.round(bh0)} → ${Math.round(bh1)} px)`);

  await page.click('#btnSide');
  await page.waitForTimeout(250);
  const w1 = (await chartBox(page)).width;
  ok(w1 > w0 + 250, `hiding the side panel widens the chart (${Math.round(w0)} → ${Math.round(w1)} px)`);
  ok(await page.locator('#quickTrade').isVisible(), 'the trade bar appears on the chart');
  await page.click('#quickTrade [data-qt="plus"]');
  await page.click('#quickTrade [data-qt="buy"]');
  await page.waitForTimeout(150);
  ok(await page.evaluate(() => window.__tt.st.broker.pos && window.__tt.st.broker.pos.qty === 2 && window.__tt.st.broker.pos.side === 1), 'trade bar: + then Buy opens a 2-lot long');
  ok(/Long 2/.test(await page.locator('#qtPos').textContent()), 'trade bar shows the position');

  // Shift+F is fullscreen, never Flatten
  await page.keyboard.press('Shift+F');
  await page.waitForTimeout(300);
  ok(await page.evaluate(() => document.querySelector('.trainer-host').classList.contains('tt-full')), 'Shift+F turns fullscreen on');
  ok(await page.evaluate(() => !!window.__tt.st.broker.pos), 'Shift+F did not flatten the position');
  const th = (await page.locator('#trainer').boundingBox()).height;
  ok(Math.abs(th - 768) < 2, `fullscreen fills the window (${Math.round(th)} px)`);
  if (SHOTS) await page.screenshot({ path: path.join(OUT, 'chart-full.png') });
  await page.click('#quickTrade [data-qt="flat"]');
  await page.waitForTimeout(150);
  ok(await page.evaluate(() => !window.__tt.st.broker.pos), 'trade bar: Flat closes it');
  await page.click('#btnFull');
  await page.waitForTimeout(250);
  ok(!(await page.evaluate(() => document.querySelector('.trainer-host').classList.contains('tt-full'))), 'the button leaves fullscreen');

  // layout survives a reload
  await page.reload();
  await page.waitForFunction(() => window.__tt && window.__tt.st.rep, null, { timeout: 20000 });
  await page.waitForTimeout(300);
  ok(await page.evaluate(() => document.querySelector('.workspace').classList.contains('side-off') && window.__tt.S.layout.bottomH > 0), 'panel layout is remembered');
  await page.click('#btnSide');
  await page.context().close();
}

// ---------------------------------------------------------------- ICT overlay
{
  const page = await open({ width: 1440, height: 900 }, '/replay?debug=1&day=2024-03-12&tf=5');
  const s = await page.evaluate(() => { const s = window.__tt.ict(); const a = window.__tt.st.agg; return { on: !!s, i: s && s.i, n: a.time.length, zones: s ? s.zones.length : 0, asia: s ? s.sess.asia.hist.length : 0, pd: s ? s.day.pdH : null }; });
  ok(s.on && s.zones > 0 && s.asia > 0 && isFinite(s.pd), `ICT levels computed on load (${s.zones} zones, Asia ranges ${s.asia})`);
  ok(await page.locator('#ictPanel').isVisible() && /BIAS/.test(await page.locator('#ictPanel').textContent()), 'bias panel shows');
  // on 5-minute candles, a candle that is still forming is never used
  for (let k = 0; k < 3; k++) { await page.keyboard.press('ArrowRight'); }
  const partial = await page.evaluate(() => { const s = window.__tt.ict(), a = window.__tt.st.agg, B = window.__tt.st.rep.bars, E = window.__tt.E;
    const closed = E.toET(B.t[window.__tt.st.cursor]) + 60 >= a.time[a.time.length - 1] + a.tfSec;
    return { i: s.i, n: a.time.length, closed }; });
  ok(partial.closed ? partial.i === partial.n - 1 : partial.i === partial.n - 2, `forming candle excluded (processed ${partial.i + 1} of ${partial.n}, last closed: ${partial.closed})`);
  if (SHOTS) await page.screenshot({ path: path.join(OUT, 'chart-ict.png') });
  // switch it off from the Indicators menu
  await page.click('#btnIndicators');
  await page.uncheck('#popIndicators input[data-ict="on"]');
  await page.waitForTimeout(200);
  ok(await page.evaluate(() => window.__tt.ict() === null) && !(await page.locator('#ictPanel').isVisible()), 'ICT can be switched off');
  await page.check('#popIndicators input[data-ict="on"]');
  await page.selectOption('#popIndicators select[data-ict="mit"]', 'touch');
  await page.waitForTimeout(200);
  ok(await page.evaluate(() => window.__tt.S.ict.mit === 'touch' && window.__tt.S.ict.rbMit === 'touch' && !!window.__tt.ict()), 'mitigation setting applies to gaps and blocks');
  await page.selectOption('#popIndicators select[data-ict="mit"]', 'ce');
  await page.context().close();
}

// ---------------------------------------------------------------- phone fullscreen
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: 'dark', isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push('phone pageerror: ' + e.message));
  await page.goto(BASE + '/replay?debug=1&day=2024-03-12');
  await page.waitForFunction(() => window.__tt && window.__tt.st.rep, null, { timeout: 20000 });
  await page.tap('#btnFull');
  await page.waitForTimeout(400);
  const cb = await page.locator('#chart').boundingBox();
  ok(cb.height > 560, `phone fullscreen gives the chart most of the screen (${Math.round(cb.height)} px)`);
  ok(await page.locator('#quickTrade').isVisible(), 'phone fullscreen shows the trade bar');
  ok(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth) <= 1, 'no sideways scroll');
  if (SHOTS) await page.screenshot({ path: path.join(OUT, 'phone-full.png') });
  await ctx.close();
}

ok(errors.length === 0, 'no page errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
await browser.close();
console.log(fails ? `\n${fails} failed` : '\nall passed');
process.exit(fails ? 1 : 0);
