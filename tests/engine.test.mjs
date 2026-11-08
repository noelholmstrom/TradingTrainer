// Engine tests. Run: npm test
import E from '../src/lib/engine.js';
import * as DB from '../src/lib/databento.js';
let fails = 0, passes = 0;
function ok(cond, msg) { if (cond) passes++; else { fails++; console.log('FAIL:', msg); } }
function near(a, b, eps, msg) { ok(Math.abs(a - b) <= (eps || 1e-9), `${msg} (got ${a}, want ${b})`); }

// ---- time
near(E.etOffset(Date.UTC(2024, 6, 1) / 1000), -14400, 0, 'EDT in July');
near(E.etOffset(Date.UTC(2024, 0, 15) / 1000), -18000, 0, 'EST in January');
ok(E.sessionDateOf(E.etToUtc('2024-03-07', 18, 0)) === '2024-03-08', '18:00 ET belongs to next session');
ok(E.sessionDateOf(E.etToUtc('2024-03-08', 16, 59)) === '2024-03-08', '16:59 ET same session');
ok(E.sessionDateOf(E.etToUtc('2024-03-10', 18, 0)) === '2024-03-11', 'Sunday evening -> Monday session (DST day)');
ok(E.etMinuteOfDay(E.etToUtc('2024-07-02', 9, 30)) === 570, 'etMinuteOfDay 09:30');
ok(E.etMinuteOfDay(E.etToUtc('2024-12-02', 9, 30)) === 570, 'etMinuteOfDay 09:30 winter');
near(E.cetToUtc('2024-07-02', 15, 30, 0), Date.UTC(2024, 6, 2, 13, 30) / 1000, 0, 'CEST to UTC');
near(E.cetToUtc('2024-01-02', 15, 30, 0), Date.UTC(2024, 0, 2, 14, 30) / 1000, 0, 'CET to UTC');

// ---- calendar
ok(!E.isTradingDay('2024-07-04'), 'July 4 closed');
ok(!E.isTradingDay('2024-11-28'), 'Thanksgiving closed');
ok(!E.isTradingDay('2024-03-29'), 'Good Friday 2024 closed');
ok(!E.isTradingDay('2025-04-18'), 'Good Friday 2025 closed');
ok(!E.isTradingDay('2026-06-19'), 'Juneteenth 2026 closed');
ok(E.isTradingDay('2024-07-05'), 'July 5 2024 open');
const ds = E.SampleDataset('2026-11-06');
ok(ds.days[0] === '2023-01-03', 'first sample day');
ok(ds.days[ds.days.length - 1] === '2026-11-06', 'last sample day');
console.log('sample days:', ds.days.length);

// ---- sessions
const idx = ds.days.indexOf('2025-03-12');
const s = ds.session(idx), sPrev = ds.session(idx - 1);
ok(s.t.length === 1380, 'session has 1380 bars');
ok(E.sessionDateOf(s.t[0]) === '2025-03-12' && E.etMinuteOfDay(s.t[0]) === 1080, 'session starts 18:00 ET previous evening');
let ohlcOk = true, tickOk = true, seqOk = true;
for (let i = 0; i < s.t.length; i++) {
  if (s.h[i] < Math.max(s.o[i], s.c[i]) || s.l[i] > Math.min(s.o[i], s.c[i])) ohlcOk = false;
  for (const k of ['o', 'h', 'l', 'c']) if (Math.abs(s[k][i] * 4 - Math.round(s[k][i] * 4)) > 1e-9) tickOk = false;
  if (i && s.t[i] - s.t[i - 1] !== 60) seqOk = false;
}
ok(ohlcOk, 'OHLC consistent'); ok(tickOk, 'prices on 0.25 ticks'); ok(seqOk, 'one bar per minute');
const gap = Math.abs(s.o[0] - sPrev.c[sPrev.c.length - 1]);
console.log('reopen gap pts:', gap, 'prev close', sPrev.c[1379], 'open', s.o[0]);
ok(gap < 60, 'reopen gap is small');
const cal = E.buildSampleCalendar('2026-11-06');
near(s.c[1379], cal.closes[idx], 0.13, 'session close matches calendar close');
// realism summary over 40 days
let rOpen = 0, rLunch = 0, rNight = 0, dayRange = 0, cnt = 0;
for (let d = idx - 40; d < idx; d++) {
  const x = ds.session(d);
  let hi = -1e9, lo = 1e9;
  for (let m = 930; m < 1320; m++) { hi = Math.max(hi, x.h[m]); lo = Math.min(lo, x.l[m]); }
  dayRange += hi - lo;
  for (let m = 930; m < 945; m++) rOpen += x.h[m] - x.l[m];
  for (let m = 1080; m < 1140; m++) rLunch += x.h[m] - x.l[m];
  for (let m = 200; m < 400; m++) rNight += x.h[m] - x.l[m];
  cnt++;
}
console.log('avg 1m range open/lunch/night:', (rOpen / cnt / 15).toFixed(1), (rLunch / cnt / 60).toFixed(1), (rNight / cnt / 200).toFixed(1), ' avg RTH range:', (dayRange / cnt).toFixed(0), ' level:', s.c[1379]);
// determinism
const ds2 = E.SampleDataset('2025-12-31');
ok(ds2.session(idx).c[700] === s.c[700], 'deterministic across end dates');

// ---- replay assembly + aggregation
const rep = E.assembleReplay(ds, idx, 3);
ok(rep.bars.t.length === 1380 * 4 && rep.sessionStart === 1380 * 3, 'assemble 3 context days');
const at930 = E.indexAtEtMinute(rep, 570);
ok(E.etMinuteOfDay(rep.bars.t[at930]) === 570 && at930 >= rep.sessionStart, 'index at 09:30');
const agg5 = E.aggregate(rep.bars, rep.sessionStart, rep.sessionEnd - 1, 300);
ok(agg5.time.length === 276, '5m candles per session = 276 (got ' + agg5.time.length + ')');
const agg60 = E.aggregate(rep.bars, rep.sessionStart, rep.sessionEnd - 1, 3600);
ok(agg60.time.length === 23, 'hourly candles = 23 (got ' + agg60.time.length + ')');
ok(((agg60.time[0] % 3600) + 3600) % 3600 === 0, 'hourly aligned to the hour (ET)');

// ---- indicators
const c = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const e3 = E.ema(c, 3);
near(e3[2], 2, 1e-12, 'ema seed'); near(e3[3], 4 * 0.5 + 2 * 0.5, 1e-12, 'ema step');
const r = E.rsi(Array.from({ length: 30 }, (_, i) => 100 + i), 14);
near(r[29], 100, 1e-9, 'rsi of rising series');
const md = E.macd(Array.from(rep.bars.c.subarray(0, 300)), 12, 26, 9);
ok(isFinite(md.hist[299]) && !isFinite(md.signal[30]), 'macd warmup');
const vw = E.vwap(agg5, 'eth');
ok(isFinite(vw[0]) && isFinite(vw[275]), 'vwap eth defined');
const vr = E.vwap(agg5, 'rth');
ok(!isFinite(vr[0]) && isFinite(vr[200]), 'vwap rth blank overnight');

// ---- broker
const MNQ = E.INSTRUMENTS.MNQ;
function bar(t, o, h, l, c2, idx2) { return { t, o, h, l, c: c2, idx: idx2 }; }
let b = E.createBroker(MNQ, { slippageTicks: 1 });
E.bMark(b, 100, 0, 0);
let res = E.bPlace(b, { side: 1, type: 'market', qty: 1, sl: 10, tp: 20 });
ok(res.ok && res.fill.price === 100.25, 'market buy slips 1 tick');
ok(b.pos.sl === 90.25 && b.pos.tp === 120.25, 'brackets from fill price');
let f = E.bOnBar(b, bar(60, 100, 121, 99, 120, 1));
ok(f.length === 1 && f[0].reason === 'Target' && f[0].price === 120.25, 'target fills at limit');
const t1 = b.trades[0];
near(t1.net, (120.25 - 100.25) * 2 - 1.0, 1e-9, 'net P/L after commission');
near(t1.r, t1.net / ((100.25 - 90.25) * 2), 1e-9, 'R multiple');
ok(t1.mae === 1.25, 'MAE 1.25 pts (low 99 vs 100.25), got ' + t1.mae);

// ambiguous bar -> stop first
b = E.createBroker(MNQ, { slippageTicks: 1 });
E.bMark(b, 100, 0, 0);
E.bPlace(b, { side: 1, type: 'market', qty: 1, sl: 10, tp: 10 });
f = E.bOnBar(b, bar(60, 100, 112, 89, 111, 1));
ok(f.length === 1 && f[0].reason === 'Stop' && b.trades[0].ambiguous, 'both in one bar -> stop');
near(f[0].price, 90.25 - 0.25, 1e-9, 'stop fill slips 1 tick');

// limit entry, then target later
b = E.createBroker(MNQ, { slippageTicks: 1 });
E.bMark(b, 100, 0, 0);
res = E.bPlace(b, { side: 1, type: 'limit', qty: 2, price: 95, sl: 5, tp: 10 });
ok(res.ok && res.order, 'limit rests');
f = E.bOnBar(b, bar(60, 100, 101, 96, 97, 1));
ok(f.length === 0, 'limit not touched');
f = E.bOnBar(b, bar(120, 97, 98, 94.5, 95.5, 2));
ok(f.length === 1 && f[0].price === 95 && b.pos && b.pos.qty === 2, 'limit fills on touch at limit');
ok(b.pos.sl === 90 && b.pos.tp === 105, 'limit brackets');

// trade-through mode
b = E.createBroker(MNQ, { slippageTicks: 1, limitThrough: true });
E.bMark(b, 100, 0, 0);
E.bPlace(b, { side: 1, type: 'limit', qty: 1, price: 95 });
f = E.bOnBar(b, bar(60, 100, 100, 95, 96, 1));
ok(f.length === 0, 'touch does not fill in trade-through mode');
f = E.bOnBar(b, bar(120, 96, 96, 94.75, 95, 2));
ok(f.length === 1 && f[0].price === 95, 'fills once traded through');

// gap through a stop
b = E.createBroker(MNQ, { slippageTicks: 1 });
E.bMark(b, 100, 0, 0);
E.bPlace(b, { side: 1, type: 'market', qty: 1, sl: 5 });
f = E.bOnBar(b, bar(60, 90, 91, 89, 90, 1));
ok(f.length === 1 && f[0].reason === 'Stop' && f[0].price === 89.75, 'gap through stop fills at open minus slippage, got ' + (f[0] && f[0].price));

// stop entry and its stop in the same bar
b = E.createBroker(MNQ, { slippageTicks: 0 });
E.bMark(b, 100, 0, 0);
res = E.bPlace(b, { side: 1, type: 'stop', qty: 1, price: 102, sl: 3 });
ok(res.ok && res.order, 'buy stop rests');
f = E.bOnBar(b, bar(60, 100, 103, 98, 98.5, 1)); // bearish bar: o,h,l,c -> up to 103 (entry 102), down to 98 (stop 99)
ok(f.length === 2 && f[0].reason === 'Stop' && f[1].reason === 'Stop' && !b.pos, 'stop entry then stop-loss within one bar');
ok(b.trades[0].mfe === 1 && b.trades[0].net === -3 * 2 - 1, 'excursion and P/L inside bar');

// invalid orders
b = E.createBroker(MNQ, {});
E.bMark(b, 100, 0, 0);
ok(!E.bPlace(b, { side: 1, type: 'stop', qty: 1, price: 99 }).ok, 'buy stop below market rejected');
res = E.bPlace(b, { side: 1, type: 'limit', qty: 1, price: 101 });
ok(res.ok && res.fill && res.fill.price === 100, 'marketable limit fills at market');
ok(!E.bSetBrackets(b, 100.5, undefined).ok, 'long stop above price rejected');
ok(E.bSetBrackets(b, 95, 110).ok && b.pos.riskUsd === 10, 'set brackets after entry');

// reverse
E.bMark(b, 104, 60, 1);
E.bReverse(b);
ok(b.trades.length === 1 && b.trades[0].reason === 'Reversed' && b.pos.side === -1 && b.pos.qty === 1, 'reverse closes and opens short');
E.bEndSession(b);
ok(!b.pos && b.trades.length === 2 && b.trades[1].reason === 'Session end', 'session end flattens');

// add to position and partial exit
b = E.createBroker(MNQ, { slippageTicks: 0 });
E.bMark(b, 100, 0, 0);
E.bPlace(b, { side: 1, type: 'market', qty: 1 });
E.bMark(b, 104, 60, 1);
E.bPlace(b, { side: 1, type: 'market', qty: 1 });
ok(b.pos.qty === 2 && b.pos.avg === 102, 'average price after add');
E.bMark(b, 110, 120, 2);
E.bPlace(b, { side: -1, type: 'market', qty: 1 });
ok(b.pos.qty === 1, 'partial exit');
E.bMark(b, 106, 180, 3);
E.bFlatten(b);
near(b.trades[0].gross, (110 - 102) * 2 + (106 - 102) * 2, 1e-9, 'gross P/L with add + scale out');

// stats
const st = E.computeStats([
  { net: 100, gross: 101, commission: 1, side: 1, r: 1, mfe: 10, mae: 2, entryTime: E.etToUtc('2024-01-02', 9, 40), exitTime: E.etToUtc('2024-01-02', 9, 50) },
  { net: -50, gross: -49, commission: 1, side: -1, r: -0.5, mfe: 1, mae: 6, entryTime: E.etToUtc('2024-01-02', 10, 5), exitTime: E.etToUtc('2024-01-02', 10, 15) },
  { net: 30, gross: 31, commission: 1, side: 1, r: null, mfe: 4, mae: 1, entryTime: E.etToUtc('2024-01-02', 10, 30), exitTime: E.etToUtc('2024-01-02', 10, 40) }
]);
near(st.winRate, 2 / 3, 1e-9, 'win rate'); near(st.profitFactor, 130 / 50, 1e-9, 'profit factor');
near(st.maxDrawdown, 50, 1e-9, 'max drawdown'); near(st.expectancyR, 0.25, 1e-9, 'expectancy R');
ok(st.byHour.length === 2 && st.byHour[0].hour === 9, 'by hour');

// coach
const ctx = E.entryContext(rep.bars, at930 + 30, 60);
ok(isFinite(ctx.atrh) && isFinite(ctx.ema50h) && ctx.htfMin === 5, 'entry context computed');
const fakeTrade = { side: 1, qty: 1, riskUsd: 6, riskPts: 3, slAtEntry: 1, plannedRR: 0.5, mfeR: 1.5, r: -1, net: -7, mfe: 4.5, points: -3, reason: 'Stop', ctx: Object.assign({}, ctx, { price: ctx.ema50h - 10, ema20h: ctx.ema50h - 5 }), entryTime: 1000, exitTime: 1200 };
const notes = E.coachNotes(fakeTrade, { net: -10, exitTime: 900, qty: 1 }, 1);
console.log('coach notes:'); notes.forEach(n => console.log('  [' + n.tone + ']', n.text));
ok(notes.length >= 4, 'coach produced notes');

// ---- CSV
const lines = ['time,open,high,low,close,volume'];
for (let i = 0; i < 600; i++) lines.push(`${new Date(rep.bars.t[i] * 1000).toISOString()},${rep.bars.o[i]},${rep.bars.h[i]},${rep.bars.l[i]},${rep.bars.c[i]},${rep.bars.v[i]}`);
let p = E.parseBarsCSV(lines.join('\n'), 'utc');
ok(!p.error && p.rows === 600 && p.baseSec === 60 && p.bars.t[5] === rep.bars.t[5], 'ISO CSV parsed');
const tv = ['time,open,high,low,close,Volume'].concat(Array.from({ length: 400 }, (_, i) => `${rep.bars.t[i]},${rep.bars.o[i]},${rep.bars.h[i]},${rep.bars.l[i]},${rep.bars.c[i]},${rep.bars.v[i]}`));
p = E.parseBarsCSV(tv.join('\n'), 'utc');
ok(!p.error && p.rows === 400 && p.bars.c[10] === rep.bars.c[10], 'unix-seconds CSV parsed');
const nt = Array.from({ length: 300 }, (_, i) => {
  const d = new Date((rep.bars.t[i] + E.etOffset(rep.bars.t[i])) * 1000).toISOString();
  return `${d.slice(0, 4)}${d.slice(5, 7)}${d.slice(8, 10)} ${d.slice(11, 13)}${d.slice(14, 16)}00;${rep.bars.o[i]};${rep.bars.h[i]};${rep.bars.l[i]};${rep.bars.c[i]};${rep.bars.v[i]}`;
});
p = E.parseBarsCSV(nt.join('\n'), 'ny');
ok(!p.error && p.bars.t[0] === rep.bars.t[0], 'NinjaTrader-style CSV in New York time parsed');
const raw = ['ts_event,rtype,publisher_id,instrument_id,open,high,low,close,volume,symbol'].concat(Array.from({ length: 200 }, (_, i) => `${BigInt(rep.bars.t[i]) * 1000000000n},33,1,42,${Math.round(rep.bars.o[i] * 1e9)},${Math.round(rep.bars.h[i] * 1e9)},${Math.round(rep.bars.l[i] * 1e9)},${Math.round(rep.bars.c[i] * 1e9)},${rep.bars.v[i]},NQH5`));
p = E.parseBarsCSV(raw.join('\n'), 'utc');
ok(!p.error && Math.abs(p.bars.c[3] - rep.bars.c[3]) < 1e-6 && p.bars.t[3] === rep.bars.t[3], 'raw Databento fixed-point CSV parsed');
const csvDs = E.CsvDataset('test', E.parseBarsCSV(lines.join('\n'), 'utc').bars);
console.log('csv days:', csvDs.days);
ok(csvDs.days.length >= 1, 'csv sessions grouped');


// ---- levels, sweeps, fair value gaps
{
  // Build a synthetic session: flat Asia/London, then a sharp 5-minute rally that leaves a bullish FVG.
  const d = '2025-06-11';
  const start = E.etToUtc('2025-06-10', 18, 0);
  const N = 1380, bars = { t: new Float64Array(N), o: new Float64Array(N), h: new Float64Array(N), l: new Float64Array(N), c: new Float64Array(N), v: new Float64Array(N).fill(100) };
  let px = 20000;
  for (let m = 0; m < N; m++) {
    bars.t[m] = start + m * 60;
    let step = Math.sin(m / 7) * 0.5;
    if (m >= 940 && m < 945) step = 6;      // 09:40-09:45 impulse candle
    if (m >= 935 && m < 940) step = 0.5;
    const o = px, c = px + step;
    bars.o[m] = o; bars.c[m] = c; bars.h[m] = Math.max(o, c) + 0.5; bars.l[m] = Math.min(o, c) - 0.5;
    px = c;
  }
  const idx = 960; // 10:00
  const fv = E.findFVGs(bars, idx, 60);
  const bull = fv.gaps.filter(g => g.dir === 1);
  console.log('fvgs:', fv.gaps.map(g => `${g.dir > 0 ? 'bull' : 'bear'} ${g.bottom.toFixed(2)}-${g.top.toFixed(2)} filled=${g.filled} inv=${g.inverted}`).join(' | '));
  ok(bull.length >= 1, 'bullish FVG found after an impulse');
  const lv = E.computeLevels(bars, idx);
  ok(lv.levels.some(l => l.key === 'lonh') && lv.levels.some(l => l.key === 'orh'), 'London and opening-range levels known at 10:00');
  ok(!E.computeLevels(bars, 600).levels.some(l => l.key === 'lonh'), 'London levels unknown before 08:30');
  const g = bull[bull.length - 1];
  const ctx = { atrh: 10, htfMin: 5, levels: lv.levels, sweeps: [], gaps: [g], rthPos: 0.9 };
  const notes = E.levelNotes({ side: 1, entry: g.top + 6, slAtEntry: g.bottom - 4 }, ctx);
  console.log('level notes:'); notes.forEach(n => console.log('  [' + n.tone + ']', n.key, '-', n.text));
  ok(notes.some(n => n.key === 'fvg-better'), 'suggests the gap as a better entry');
  ok(notes.some(n => n.key === 'premium'), 'flags buying at a premium');
  const inside = E.levelNotes({ side: 1, entry: (g.top + g.bottom) / 2, slAtEntry: g.bottom - 4 }, ctx);
  ok(inside.some(n => n.key === 'fvg-entry'), 'credits an entry inside the gap');
  const sw = E.findSweeps({ t: bars.t, o: bars.o, h: Float64Array.from(bars.h, (x, i) => i === 955 ? 99999 : x), l: bars.l, c: bars.c }, 958, [{ key: 'x', name: 'the test high', price: 50000, kind: 'high' }], 15);
  ok(sw.length === 1, 'detects a sweep that closed back below the level');
}

// ---- real data: calendar, cache, session splitting
ok(E.isTradingDay('2021-06-18'), 'Juneteenth was not a market holiday before 2022');
ok(!E.isTradingDay('2022-06-20'), 'Juneteenth 2022 (observed Monday) closed');
{
  const real = E.RealDataset(E.FIRST_REAL_DAY, '2026-11-06', 3);
  ok(real.kind === 'real' && real.days[0] === '2010-06-07', 'real calendar starts June 2010');
  ok(real.days.includes('2021-06-18') && !real.days.includes('2024-07-04'), 'real calendar skips holidays only');
  ok(real.session(5).t.length === 0, 'uncached real day is empty');
  const sample = E.SampleDataset('2024-03-15');
  const si = sample.days.indexOf('2024-03-12');
  const days = ['2024-03-11', '2024-03-12', '2024-03-13', '2024-03-14'];
  days.forEach((d, k) => real.put(d, sample.session(sample.days.indexOf(d))));
  ok(!real.has('2024-03-11') && real.has('2024-03-14'), 'cache keeps only the newest entries');
  real.touch('2024-03-12'); real.put('2024-03-15', sample.session(sample.days.indexOf('2024-03-15')));
  ok(real.has('2024-03-12') && !real.has('2024-03-13'), 'touch keeps a day in the cache');
  const big = E.RealDataset(E.FIRST_REAL_DAY, '2024-03-15');
  for (const d of ['2024-03-08', '2024-03-11', '2024-03-12', '2024-03-13', '2024-03-14']) big.put(d, sample.session(sample.days.indexOf(d)));
  const idx = big.days.indexOf('2024-03-14');
  const rep = E.assembleReplay(big, idx, 4);
  ok(rep.date === '2024-03-14' && rep.sessionEnd - rep.sessionStart === 1380 && rep.sessionStart === 4 * 1380, 'replay of a real day has 4 context sessions');
  // join several sessions, then split them again
  const all = E.assembleReplay(big, idx, 4).bars;
  const ranges = E.splitSessions(all);
  ok(ranges.length === 5 && ranges[0][0] === '2024-03-08' && ranges[4][0] === '2024-03-14', 'splitSessions finds each Globex day');
  const one = E.sliceBars(all, ranges[2][1], ranges[2][2]);
  ok(one.t.length === 1380 && one.t.buffer !== all.t.buffer, 'sliceBars copies one session');
  ok(si >= 0, 'sample has the test day');
}

// ---- Databento parsing
{
  const line = (ts, o, h, l, c, v) => JSON.stringify({ hd: { ts_event: ts, rtype: 33, publisher_id: 1, instrument_id: 42140878 }, open: o, high: h, low: l, close: c, volume: v });
  const text = [
    line('2024-03-12T13:31:00.000000000Z', '18100.250000000', '18104.000000000', '18099.500000000', '18103.750000000', '412'),
    line('2024-03-12T13:30:00.000000000Z', '18098.000000000', '18101.000000000', '18096.250000000', '18100.250000000', '1290'),
    line('1710250320000000000', '18103750000000', '18106000000000', '18102000000000', '18105500000000', 230), // raw fixed-point + ns
    line('2024-03-12T13:30:00.000000000Z', '18098.000000000', '18101.500000000', '18096.250000000', '18100.250000000', '1300'), // duplicate minute
    'not json',
    line('2024-03-12T13:33:00.000000000Z', '0', '0', '0', '0', '0'),
    ''
  ].join('\n');
  const { bars, skipped } = DB.parseOhlcvJson(text);
  ok(bars.t.length === 3, 'parsed three distinct minutes (got ' + bars.t.length + ')');
  ok(bars.t[0] === Date.UTC(2024, 2, 12, 13, 30) / 1000 && bars.t[2] === Date.UTC(2024, 2, 12, 13, 32) / 1000, 'times sorted, in UTC seconds');
  near(bars.c[2], 18105.5, 1e-9, 'fixed-point prices scaled');
  ok(bars.v[0] === 1300 && bars.h[0] === 18101.5, 'duplicate minute keeps the later record');
  ok(skipped === 2, 'skips bad lines (got ' + skipped + ')');
  ok(DB.looksLikeDatabentoKey('db-' + 'A1'.repeat(14) + 'x') && !DB.looksLikeDatabentoKey('sk-abc') && !DB.looksLikeDatabentoKey('db-short'), 'key format check');
  const f = DB.rangeForm({ symbol: 'NQ.v.0', start: '2024-03-11T22:00:00.000Z', end: '2024-03-12T21:00:00.000Z' });
  ok(f.get('dataset') === 'GLBX.MDP3' && f.get('schema') === 'ohlcv-1m' && f.get('stype_in') === 'continuous' && f.get('encoding') === 'json', 'request form');
  ok(/key/.test(DB.upstreamError(401).error) && DB.upstreamError(422, 'end after available end').error.includes('available end') && DB.upstreamError(503).status === 502, 'upstream errors explained');
}

console.log(`\n${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
