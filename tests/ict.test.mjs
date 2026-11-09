// Tests for the ICT Levels Helper port: hand-built candles with known answers.
import * as ICT from '../src/lib/ict.js';
import E from '../src/lib/engine.js';

let passes = 0, fails = 0;
const ok = (c, m) => { if (c) passes++; else { fails++; console.log('FAIL:', m); } };
const wallOf = (y, mo, d, h, mi) => Date.UTC(y, mo - 1, d, h, mi) / 1000;
/** Candles as [o, h, l, c], one per `stepMin` minutes from a New York wall time. */
function candles(rows, start, stepMin = 1) {
  const a = { time: [], o: [], h: [], l: [], c: [] };
  rows.forEach(([o, h, l, c], k) => { a.time.push(start + k * stepMin * 60); a.o.push(o); a.h.push(h); a.l.push(l); a.c.push(c); });
  return a;
}
const run = (a, cfg, upto) => ICT.ictRun(a, upto == null ? a.time.length : upto, cfg || {}, 0.25);
const kinds = s => s.zones.map(z => (z.kind === ICT.FVG ? 'FVG' : z.kind === ICT.IFVG ? 'IFVG' : 'RB') + (z.dir === 1 ? '+' : '-') + (z.mit ? 'm' : ''));

// ---- FVG: birth, CE mitigation, body-close invalidation, IFVG, IFVG removal
{
  const t0 = wallOf(2024, 3, 12, 10, 0);
  const a = candles([
    [100, 101, 99, 100.5],
    [100.5, 106, 100.3, 105.5],
    [105.5, 107, 103, 106],      // gap 101 → 103: bullish FVG
    [106, 106.5, 102.5, 104],    // touches the top, not the CE (102)
    [104, 104.2, 101.9, 103],    // reaches the CE: mitigated
    [103, 103.1, 100, 100.5],    // body closes below 101: invalidated → bearish IFVG
    [100.5, 102.2, 100.2, 101.5],// back up to the IFVG's CE: mitigated
    [101.5, 104, 101.4, 103.5]   // closes above 103: IFVG removed
  ], t0);
  let s = run(a, {}, 3);
  ok(s.zones.length === 1 && s.zones[0].kind === ICT.FVG && s.zones[0].dir === 1 && s.zones[0].top === 103 && s.zones[0].bot === 101 && s.zones[0].left === 0, 'bullish FVG from candle 1 high to candle 3 low');
  s = run(a, {}, 4); ok(!s.zones[0].mit, 'a touch is not mitigation in CE mode');
  ok(run(a, { mit: 'touch' }, 4).zones[0].mit, 'first-touch mode mitigates on the touch');
  s = run(a, {}, 5); ok(s.zones[0].mit, 'CE reached: mitigated, still drawn');
  s = run(a, {}, 6); ok(kinds(s).join() === 'IFVG-', 'body close through turns it into a bearish IFVG (' + kinds(s) + ')');
  ok(s.zones[0].left === 0 && s.zones[0].born === 5, 'IFVG keeps the original left edge');
  s = run(a, {}, 7); ok(kinds(s).join() === 'IFVG-m', 'IFVG mitigated at its CE');
  s = run(a, {}, 8); ok(s.zones.length === 0, 'IFVG removed when price closes back through it');
  ok(run(a, { ifvg: false }, 6).zones.length === 0, 'with IFVGs off the failed gap just disappears');
  ok(run(a, { inv: 'wick' }, 6).zones.length === 1, 'wick mode: invalidated on the wick as well');
  ok(run(a, { delMit: true }, 5).zones.length === 0, 'delete on mitigation');
}

// ---- bearish FVG, size filter, displacement filter
{
  const t0 = wallOf(2024, 3, 12, 10, 0);
  const a = candles([[110, 111, 109, 109.5], [109.5, 109.6, 104, 104.5], [104.5, 107, 103, 103.5]], t0);
  const s = run(a);
  ok(s.zones.length === 1 && s.zones[0].dir === -1 && s.zones[0].top === 109 && s.zones[0].bot === 107, 'bearish FVG from candle 1 low to candle 3 high');
  ok(run(a, { fvgMinTicks: 9 }).zones.length === 0, 'minimum size in ticks filters small gaps');
  ok(run(a, { fvgDisp: true }).zones.length === 1, 'displacement filter is off-by-default friendly (no ATR yet)');
}

// ---- overlap handling: IFVG > FVG > RB, opposite directions left alone
{
  const s = ICT.createIct({}, 0.25);
  ok(ICT._addZone(s, ICT.FVG, 1, 103, 101, 0, true, 2), 'first bullish FVG added');
  ok(ICT._addZone(s, ICT.FVG, 1, 102.9, 101.3, 4, true, 6) === null && s.zones.length === 1, 'an overlapping FVG of equal rank is dropped');
  ok(ICT._addZone(s, ICT.IFVG, 1, 103, 101.3, 0, false, 7) && s.zones.length === 1 && s.zones[0].kind === ICT.IFVG, 'an IFVG replaces the FVG it overlaps');
  ok(ICT._addZone(s, ICT.RB, 1, 102.5, 101.5, 8, false, 11) === null, 'a rejection block under an IFVG is dropped');
  ok(ICT._addZone(s, ICT.FVG, -1, 103, 101, 9, true, 11) && s.zones.length === 2, 'opposite-direction zones are kept (contested, not duplicates)');
  ok(ICT._addZone(s, ICT.FVG, 1, 110, 102.9, 10, true, 12) && s.zones.length === 3, 'a small overlap (under 50%) is kept');
  const off = ICT.createIct({ dedup: false }, 0.25);
  ICT._addZone(off, ICT.FVG, 1, 103, 101, 0, true, 2); ICT._addZone(off, ICT.FVG, 1, 102.9, 101.3, 4, true, 6);
  ok(off.zones.length === 2, 'with collapsing off both stay');
}

// ---- rejection block: swept swing low with a long lower wick
{
  const t0 = wallOf(2024, 3, 12, 10, 0);
  const rows = [];
  for (let k = 0; k < 25; k++) rows.push([101, 101.6, 100, 101.2]);          // lows at 100
  rows.push([101, 101.5, 98, 101]);                                         // k=25: sweeps 100, closes back above
  for (let k = 0; k < 3; k++) rows.push([101, 101.8, 100.5, 101.4]);        // right side stays higher
  const a = candles(rows, t0);
  let s = run(a, { fvg: false }, 28);
  ok(!s.zones.some(z => z.kind === ICT.RB), 'not confirmed before the third right-hand bar');
  s = run(a, { fvg: false }, 29);
  const rb = s.zones.find(z => z.kind === ICT.RB);
  ok(rb && rb.dir === 1 && rb.top === 101 && rb.bot === 98 && rb.left === 25 && rb.born === 28, 'bullish rejection block from the close down to the wick low');
  // A pivot low that does not take out the 20-bar low: no block unless the sweep rule is off.
  const rows2 = [];
  for (let k = 0; k < 25; k++) rows2.push(k >= 5 && k <= 16 ? [101, 101.6, 99, 101.2] : [101, 101.6, 100, 101.2]);
  rows2.push([101, 101.5, 99.5, 101]);
  for (let k = 0; k < 3; k++) rows2.push([101, 101.8, 100.5, 101.4]);
  ok(!run(candles(rows2, t0), { fvg: false }).zones.some(z => z.kind === ICT.RB), 'no sweep, no rejection block');
  ok(run(candles(rows2, t0), { fvg: false, rbSweep: false }).zones.some(z => z.kind === ICT.RB), 'sweep requirement can be switched off');
}

// ---- sessions, previous day, 00:00 open, London judas, bias lock (30-minute candles)
{
  // Monday 18:00 ET (Globex open for Tuesday) to Tuesday 16:30
  const t0 = wallOf(2024, 3, 11, 18, 0);
  const rows = [];
  const n = (24 - 18) * 2 + 16.5 * 2 + 1; // to 16:30
  for (let k = 0; k < n; k++) {
    const m = (18 * 60 + k * 30) % 1440;
    let p;
    if (m >= 1080 && m < 1200) p = 105;                 // Monday evening before Asia
    else if (m >= 1200) p = 105 + (m - 1200) / 60;      // Asia drifts up: 105 → 108.5
    else if (m < 180) p = 108;                          // after midnight
    else if (m < 570) p = m === 300 ? 99 : 106;         // London: one candle takes Asia's low at 05:00
    else if (m < 720) p = 107;                          // NY open, London still running until 11:30
    else p = 110;                                       // NY afternoon above Asia's high
    rows.push([p, p + 0.5, p - 0.5, p]);
  }
  const a = candles(rows, t0, 30);
  const idx = (h, mi) => (((h * 60 + mi) - 18 * 60 + 1440) % 1440) / 30;
  let s = run(a, {}, idx(0, 0));
  ok(s.sess.asia.hist.length === 0, 'Asia is not drawn while it is still open');
  s = run(a, {}, idx(0, 0) + 1);
  const A = s.sess.asia.hist[0];
  ok(A && A.hi === 109 && A.lo === 104.5 && A.start === idx(20, 0) && A.end === idx(23, 30), 'Asia range recorded after midnight (' + (A && [A.hi, A.lo, A.start, A.end]) + ')');
  ok(s.day.mo === 108 && s.day.start === idx(0, 0), '00:00 true day open');
  ok(s.day.pdH === 109 && s.day.pdL === 104.5, 'previous day high/low from the Monday evening (' + [s.day.pdH, s.day.pdL] + ')');
  s = run(a, {}, idx(11, 30) + 1);
  const L = s.sess.ldn.hist[0];
  ok(L && L.lo === 98.5 && L.hi === 107.5 && L.cls === 107, 'London range and close (' + (L && [L.hi, L.lo, L.cls]) + ')');
  ok(s.sess.asia.hist[0].loSwept && !s.sess.asia.hist[0].hiSwept, 'Asia low marked as swept');
  const r = ICT.biasReads(s, 107);
  ok(r.ldn === 1, 'London took Asia\'s low and closed back inside: bullish judas read');
  s = run(a, {}, idx(9, 30) + 1);
  ok(s.fz && s.fz.score === ICT.biasReads(s, 107).score, 'bias locked at the 09:30 candle');
  const p = ICT.biasPanel(s, 90);
  ok(p.locked && p.score === s.fz.score, 'locked panel ignores later prices');
  ok(!ICT.biasPanel(run(a, { biasLock: false }, idx(9, 30) + 1), 90).locked, 'lock can be switched off');
  s = run(a);
  ok(s.sess.ny.hist.length === 1 && s.sess.ny.hist[0].hi === 110.5 && s.sess.ny.hist[0].lo === 106.5, 'New York range recorded after 16:00');
  ok(ICT.biasReads(s, 110).asia === 1, 'price above Asia\'s high reads bullish');
}

// ---- New Week Opening Gap
{
  const fri = wallOf(2024, 3, 8, 16, 0), sun = wallOf(2024, 3, 10, 18, 0);
  const a = { time: [fri, fri + 1800, sun, sun + 1800, sun + 3600], o: [100, 100, 103, 103, 101], h: [100.5, 100.5, 103.5, 103.2, 101.2], l: [99.5, 99.5, 102.5, 101, 99.9], c: [100, 100, 103, 101.2, 100.5] };
  let s = run(a, {}, 3);
  const g = s.nwogs[0];
  ok(g && g.up && g.top === 103 && g.bot === 100 && g.ref === 100 && g.start === 2 && !g.filled, 'NWOG from Friday\'s close to Sunday\'s open');
  s = run(a);
  ok(s.nwogs[0].filled, 'NWOG filled once price trades back to Friday\'s close');
  ok(run(a, { nwogMinTicks: 13 }).nwogs.length === 0, 'gaps under the minimum are ignored');
}

// ---- engine integration: runs on real-looking sample candles without errors, deterministic
{
  const ds = E.SampleDataset('2024-03-15');
  const rep = E.assembleReplay(ds, ds.days.indexOf('2024-03-14'), 4);
  for (const tf of [60, 300, 900]) {
    const agg = E.aggregate(rep.bars, 0, rep.bars.t.length - 1, tf);
    const s1 = ICT.ictRun(agg, agg.time.length, {}, 0.25);
    const s2 = ICT.createIct({}, 0.25);
    for (let i = 0; i < agg.time.length; i++) ICT.ictStep(s2, agg, i);
    ok(JSON.stringify(s1.zones) === JSON.stringify(s2.zones), `incremental equals one-shot (${tf / 60}m)`);
    ok(s1.zones.filter(z => z.kind === ICT.FVG).length <= 12 && s1.zones.filter(z => z.kind === ICT.IFVG).length <= 8 && s1.zones.filter(z => z.kind === ICT.RB).length <= 6, `zone caps respected (${tf / 60}m)`);
    ok(s1.sess.asia.hist.length >= 1 && s1.sess.ldn.hist.length >= 1 && s1.sess.ny.hist.length >= 1, `sessions recorded (${tf / 60}m)`);
    ok(s1.zones.every(z => z.top > z.bot), `zones have positive height (${tf / 60}m)`);
  }
  let threw = false;
  try { const s = ICT.createIct({}, 0.25); ICT.ictStep(s, { time: [0], o: [1], h: [1], l: [1], c: [1] }, 1); } catch { threw = true; }
  ok(threw, 'candles out of order are refused');
}

console.log(`\n${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
