// ICT Levels Helper v5.0 (Noel's TradingView indicator), ported to run candle by candle in the replay.
// A context tool: no entry signals, stops or targets. It draws the map; the trader reads it.
//
//  · FVG (BISI/SIBI) with the CE midline. Mitigation (price came back in) and invalidation
//    (a body close beyond the far edge) are separate events.
//  · IFVG: an invalidated FVG flips direction and is watched from the other side.
//  · Rejection blocks: the wick of a swing pivot that swept liquidity.
//  · Asia / London / New York high and low, plotted only once each session has closed.
//  · New Week Opening Gap, previous day high/low, the 00:00 "true day open".
//  · Daily bias: six reads summed, locked at the New York open.
//
// Works on CLOSED candles only (like barstate.isconfirmed), so it never sees bars the trader hasn't.
// Input: an aggregate { time (New York wall-clock seconds), o, h, l, c } and a candle index.

export const ICT_DEFAULTS = {
  on: true,
  // Fair value gaps
  fvg: true, maxFvg: 12, fvgMinTicks: 0, fvgMinAtr: 0.25, fvgDisp: false, fvgDispX: 0.8, fvgCE: true,
  mit: 'ce',        // mitigated when: 'touch' | 'ce' (50%) | 'full'
  delMit: false,    // delete on mitigation (otherwise dim)
  inv: 'body',      // invalidated when: 'body' (close through) | 'wick'
  // Inverse FVGs
  ifvg: true, maxIfvg: 8, ifvgCE: false,
  // Rejection blocks
  rb: true, maxRb: 6, rbLeft: 8, rbRight: 3, rbWickPct: 50, rbSweep: true, rbSweepLook: 20, rbUseClose: true,
  rbMit: 'ce', rbDelMit: false, rbInv: 'body',
  // Overlap handling: IFVG > FVG > RB
  dedup: true, dedupPct: 50,
  // Sessions (New York time), drawn after they close
  asia: true, london: true, ny: true, sessKeep: 2, sessExt: true, sessMid: false, sessShade: true, sessLabels: true, sessDim: true,
  // Opening gaps and daily levels
  nwog: true, nwogKeep: 3, nwogMinTicks: 4, nwogCE: true, nwogDim: true,
  pd: true, mo: true,
  // Daily bias
  bias: true, biasLock: true, biasThr: 2, biasLevels: true, biasPos: 'tr', // panel: 'tr' | 'br' | 'tl' | 'bl'
  bTrend: true, bTrendN: 5, bMO: true, bPD: true, bAsia: true, bLdn: true, bNWOG: true
};

export const FVG = 0, IFVG = 1, RB = 4;
const RANK = { 0: 2, 1: 3, 4: 1 };
/** [key, label, start minute, end minute) in New York time: Asia 20:00-00:00, London 03:00-11:30, NY 09:30-16:00. */
export const SESSION_WINDOWS = [['asia', 'ASIA', 1200, 1440], ['ldn', 'LDN', 180, 690], ['ny', 'NY', 570, 960]];

const minuteOf = wall => Math.floor((((wall % 86400) + 86400) % 86400) / 60);
const dayOf = wall => Math.floor(wall / 86400);
/** Week of the Globex session (sessions start 18:00 the evening before), Monday-based. */
const weekOf = wall => Math.floor((Math.floor((wall + 21600) / 86400) + 3) / 7);
const sgn = (up, dn) => (up ? 1 : dn ? -1 : 0);
const last = arr => (arr.length ? arr[arr.length - 1] : null);

export function createIct(cfg, tick) {
  const sess = {};
  for (const [key, name] of SESSION_WINDOWS) sess[key] = { key, name, hi: NaN, lo: NaN, opn: NaN, start: -1, inPrev: false, hist: [] };
  return {
    cfg: Object.assign({}, ICT_DEFAULTS, cfg || {}),
    tick: tick || 0.25,
    i: -1, nextId: 1,
    atr: [], atrSum: 0,
    zones: [],
    day: { key: null, hi: NaN, lo: NaN, pdH: NaN, pdL: NaN, pdC: NaN, mo: NaN, start: -1, his: [], los: [] },
    sess,
    week: null, nwogs: [],
    fz: null
  };
}

function addZone(s, kind, dir, top, bot, left, ce, born) {
  const c = s.cfg;
  if (c.dedup) {
    let blocked = false;
    for (let k = s.zones.length - 1; k >= 0 && !blocked; k--) {
      const z = s.zones[k];
      if (z.dir !== dir) continue;
      const ov = Math.min(top, z.top) - Math.max(bot, z.bot);
      const hh = Math.min(top - bot, z.top - z.bot);
      if (hh > 0 && ov > 0 && (ov / hh) * 100 >= c.dedupPct) {
        if (RANK[z.kind] >= RANK[kind]) blocked = true;
        else s.zones.splice(k, 1);
      }
    }
    if (blocked) return null;
  }
  const z = { id: s.nextId++, kind, dir, top, bot, left, born, ce: !!ce, mit: false };
  s.zones.push(z);
  return z;
}

function trim(s, kind, max) {
  let n = 0;
  for (let k = s.zones.length - 1; k >= 0; k--) if (s.zones[k].kind === kind && ++n > max) s.zones.splice(k, 1);
}

/** Pine ta.atr(14): RMA of the true range, seeded with a 14-bar average. */
function stepAtr(s, a, i) {
  const tr = i === 0 ? a.h[0] - a.l[0]
    : Math.max(a.h[i] - a.l[i], Math.abs(a.h[i] - a.c[i - 1]), Math.abs(a.l[i] - a.c[i - 1]));
  let v = NaN;
  if (i < 13) s.atrSum += tr;
  else if (i === 13) { s.atrSum += tr; v = s.atrSum / 14; }
  else v = (s.atr[i - 1] * 13 + tr) / 14;
  s.atr[i] = v;
}

function isPivot(a, k, left, right, high) {
  const src = high ? a.h : a.l, v = src[k];
  for (let j = k - left; j < k; j++) if (high ? !(v > src[j]) : !(v < src[j])) return false;
  for (let j = k + 1; j <= k + right; j++) if (high ? !(v >= src[j]) : !(v <= src[j])) return false;
  return true;
}
function extreme(a, from, to, high) {
  let v = high ? -Infinity : Infinity;
  for (let j = from; j <= to; j++) v = high ? Math.max(v, a.h[j]) : Math.min(v, a.l[j]);
  return v;
}

/** Process closed candle i (call for i = 0, 1, 2, … in order). */
export function ictStep(s, a, i) {
  if (i !== s.i + 1) throw new Error('ICT candles must be processed in order');
  s.i = i;
  const c = s.cfg, o = a.o[i], h = a.h[i], l = a.l[i], cl = a.c[i], wall = a.time[i];
  stepAtr(s, a, i);

  // ── FVG: three-candle imbalance, evaluated on the closed third candle
  if (c.fvg && i >= 2) {
    const atrPrev = Number.isFinite(s.atr[i - 1]) ? s.atr[i - 1] : 0;
    const minSz = Math.max(c.fvgMinTicks * s.tick, c.fvgMinAtr * atrPrev);
    const dispOK = !c.fvgDisp || Math.abs(a.c[i - 1] - a.o[i - 1]) >= c.fvgDispX * atrPrev;
    const gapU = l - a.h[i - 2], gapD = a.l[i - 2] - h;
    if (gapU > 0 && gapU >= minSz && dispOK) addZone(s, FVG, 1, l, a.h[i - 2], i - 2, c.fvgCE, i);
    if (gapD > 0 && gapD >= minSz && dispOK) addZone(s, FVG, -1, a.l[i - 2], h, i - 2, c.fvgCE, i);
  }

  // ── Rejection blocks: wick of a confirmed swing pivot that swept the prior extreme
  if (c.rb) {
    const k = i - c.rbRight;
    if (k - c.rbLeft >= 0 && (!c.rbSweep || k - c.rbSweepLook >= 0)) {
      const rng = a.h[k] - a.l[k];
      if (rng > 0 && isPivot(a, k, c.rbLeft, c.rbRight, false)) {
        const bodyLo = c.rbUseClose ? a.c[k] : Math.min(a.o[k], a.c[k]);
        const wick = bodyLo - a.l[k];
        const lo = c.rbSweep ? extreme(a, k - c.rbSweepLook, k - 1, false) : NaN;
        const swpOK = !c.rbSweep || (a.l[k] < lo && a.c[k] > lo);
        if (wick > 0 && (wick / rng) * 100 >= c.rbWickPct && swpOK) addZone(s, RB, 1, bodyLo, a.l[k], k, false, i);
      }
      if (rng > 0 && isPivot(a, k, c.rbLeft, c.rbRight, true)) {
        const bodyHi = c.rbUseClose ? a.c[k] : Math.max(a.o[k], a.c[k]);
        const wick = a.h[k] - bodyHi;
        const hi = c.rbSweep ? extreme(a, k - c.rbSweepLook, k - 1, true) : NaN;
        const swpOK = !c.rbSweep || (a.h[k] > hi && a.c[k] < hi);
        if (wick > 0 && (wick / rng) * 100 >= c.rbWickPct && swpOK) addZone(s, RB, -1, a.h[k], bodyHi, k, false, i);
      }
    }
  }

  // ── Zone lifecycle: mitigate (dim), invalidate (remove; FVG → IFVG)
  const snapshot = s.zones.slice();
  for (let k = snapshot.length - 1; k >= 0; k--) {
    const z = snapshot[k];
    if (i <= z.born || s.zones.indexOf(z) < 0) continue;
    const mid = (z.top + z.bot) * 0.5;
    const touch = z.dir === 1 ? l <= z.top : h >= z.bot;
    const half = z.dir === 1 ? l <= mid : h >= mid;
    const full = z.dir === 1 ? l <= z.bot : h >= z.top;
    const mm = z.kind === RB ? c.rbMit : c.mit;
    const hit = mm === 'touch' ? touch : mm === 'ce' ? half : full;
    let drop = false;
    if (!z.mit && hit) { z.mit = true; drop = z.kind === RB ? c.rbDelMit : c.delMit; }
    const im = z.kind === RB ? c.rbInv : c.inv;
    const inv = im === 'wick' ? (z.dir === 1 ? l < z.bot : h > z.top) : (z.dir === 1 ? cl < z.bot : cl > z.top);
    let cv = -1;
    if (inv && !drop) { if (z.kind === FVG && c.ifvg) cv = IFVG; drop = true; }
    if (drop) {
      s.zones.splice(s.zones.indexOf(z), 1);
      if (cv >= 0) addZone(s, IFVG, -z.dir, z.top, z.bot, z.left, c.ifvgCE, i);
    }
  }
  trim(s, FVG, c.maxFvg);
  trim(s, IFVG, c.maxIfvg);
  trim(s, RB, c.maxRb);

  // ── New York calendar day: previous day H/L/C and the 00:00 open
  const D = s.day, dk = dayOf(wall);
  let newDay = false;
  if (D.key !== dk) {
    newDay = true;
    if (!Number.isNaN(D.hi)) {
      D.his.push(D.hi); D.los.push(D.lo);
      while (D.his.length > c.bTrendN) { D.his.shift(); D.los.shift(); }
    }
    D.pdH = D.hi; D.pdL = D.lo; D.pdC = i > 0 ? a.c[i - 1] : NaN;
    D.mo = o; D.start = i; D.hi = h; D.lo = l; D.key = dk;
  } else {
    D.hi = Math.max(D.hi, h); D.lo = Math.min(D.lo, l);
  }

  // ── New Week Opening Gap: last close of the old week to the first open of the new one
  const wk = weekOf(wall);
  if (c.nwog && s.week !== null && wk !== s.week && i > 0) {
    const pc = a.c[i - 1], gp = Math.abs(o - pc);
    if (gp >= c.nwogMinTicks * s.tick) {
      const act = last(s.nwogs);
      if (act && act.end == null) act.end = i - 1;
      s.nwogs.push({ top: Math.max(o, pc), bot: Math.min(o, pc), ref: pc, up: o > pc, filled: false, start: i, end: null, gap: gp });
      while (s.nwogs.length > c.nwogKeep) s.nwogs.shift();
    }
  }
  s.week = wk;
  const nw = last(s.nwogs);
  if (nw && nw.end == null && !nw.filled && (nw.up ? l <= nw.ref : h >= nw.ref)) nw.filled = true;

  // ── Sessions: tracked live, recorded once the session has closed
  const m = minuteOf(wall);
  let nyOpened = false;
  for (const [key, name, s0, s1] of SESSION_WINDOWS) {
    const R = s.sess[key];
    const inS = m >= s0 && m < s1;
    const opened = inS && !R.inPrev, closed = !inS && R.inPrev;
    if (opened) { R.hi = h; R.lo = l; R.opn = o; R.start = i; }
    else if (inS) { R.hi = Math.max(R.hi, h); R.lo = Math.min(R.lo, l); }
    if (closed && !Number.isNaN(R.hi)) {
      const prev = last(R.hist);
      if (prev && prev.stop == null) prev.stop = i - 1;
      R.hist.push({ name, hi: R.hi, lo: R.lo, opn: R.opn, cls: a.c[i - 1], start: R.start, end: i - 1, drawn: i, stop: null, hiSwept: false, loSwept: false });
      while (R.hist.length > c.sessKeep) R.hist.shift();
    }
    const cur = last(R.hist);
    if (cur && cur.stop == null) {
      if (!cur.hiSwept && h > cur.hi) cur.hiSwept = true;
      if (!cur.loSwept && l < cur.lo) cur.loSwept = true;
    }
    R.inPrev = inS;
    if (key === 'ny') nyOpened = opened;
  }

  // ── Daily bias: frozen at the New York open, reset at 00:00
  if (newDay) s.fz = null;
  if (c.biasLock && nyOpened) s.fz = biasReads(s, cl);
}

/** The six bias reads at a given price (each −1, 0 or +1) and their sum. */
export function biasReads(s, price) {
  const c = s.cfg, D = s.day, A = last(s.sess.asia.hist), L = last(s.sess.ldn.hist), nw = last(s.nwogs);
  const eqN = D.his.length > 1 ? (Math.max(...D.his) + Math.min(...D.los)) * 0.5 : NaN;
  const trend = !c.bTrend || Number.isNaN(eqN) ? 0 : sgn(price > eqN, price < eqN);
  const mo = !c.bMO || Number.isNaN(D.mo) ? 0 : sgn(price > D.mo, price < D.mo);
  const pd = !c.bPD || Number.isNaN(D.pdH) ? 0
    : price > D.pdH ? 1 : price < D.pdL ? -1 : Number.isNaN(D.pdC) ? 0 : sgn(price > D.pdC, price < D.pdC);
  const asia = !c.bAsia || !A ? 0 : price > A.hi ? 1 : price < A.lo ? -1 : 0;
  let ldn = 0;
  if (c.bLdn && L) {
    const swpLo = !!A && L.lo < A.lo, swpHi = !!A && L.hi > A.hi;
    ldn = swpLo && !swpHi && L.cls > A.lo ? 1
      : swpHi && !swpLo && L.cls < A.hi ? -1
        : swpLo && swpHi ? 0
          : sgn(L.cls > L.opn, L.cls < L.opn);
  }
  const nwog = !c.bNWOG || !nw ? 0 : price > nw.top ? 1 : price < nw.bot ? -1 : 0;
  return { trend, mo, pd, asia, ldn, nwog, score: trend + mo + pd + asia + ldn + nwog, eqN };
}

/** What the bias panel shows: the locked reading after the NY open, otherwise the live one at `price`. */
export function biasPanel(s, price) {
  const c = s.cfg, locked = !!(c.biasLock && s.fz);
  const r = locked ? s.fz : biasReads(s, price);
  const text = r.score >= c.biasThr ? 'BULLISH' : r.score <= -c.biasThr ? 'BEARISH' : 'NEUTRAL';
  const counts = { fvg: 0, ifvg: 0, rb: 0 };
  for (const z of s.zones) counts[z.kind === FVG ? 'fvg' : z.kind === IFVG ? 'ifvg' : 'rb']++;
  return {
    text, score: r.score, locked, reads: r, counts,
    asia: last(s.sess.asia.hist), ldn: last(s.sess.ldn.hist), ny: last(s.sess.ny.hist)
  };
}

/** For tests: add a zone with the overlap rules applied. */
export const _addZone = addZone;

/** Run candles 0..upto-1 from scratch. */
export function ictRun(a, upto, cfg, tick) {
  const s = createIct(cfg, tick);
  for (let i = 0; i < upto; i++) ictStep(s, a, i);
  return s;
}
