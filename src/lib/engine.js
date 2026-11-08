/* TradingTrainer engine: market data, time, indicators, order simulation,
 statistics and coaching rules. Pure logic, no DOM. */

// ---------------------------------------------------------------- random
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hashStr(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
}
function makeGauss(rng) {
  let spare = null;
  return function () {
    if (spare !== null) { const s = spare; spare = null; return s; }
    let u = 0;
    while (u <= 1e-12) u = rng();
    const r = Math.sqrt(-2 * Math.log(u)), th = 2 * Math.PI * rng();
    spare = r * Math.sin(th);
    return r * Math.cos(th);
  };
}

// ---------------------------------------------------- dates, New York time
const DAY_MS = 86400000;
function dateToMs(d) { return Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)); }
function msToDate(ms) { return new Date(ms).toISOString().slice(0, 10); }
function addDays(d, n) { return msToDate(dateToMs(d) + n * DAY_MS); }
function dow(d) { return new Date(dateToMs(d)).getUTCDay(); }
function nthWeekday(y, m0, wd, n) {
  const f = new Date(Date.UTC(y, m0, 1)).getUTCDay();
  return 1 + ((wd - f + 7) % 7) + (n - 1) * 7;
}
// US daylight saving: 2nd Sunday of March 02:00 local -> 1st Sunday of November 02:00 local
const dstCache = new Map();
function dstRange(y) {
  let r = dstCache.get(y);
  if (!r) {
    r = {
      start: Date.UTC(y, 2, nthWeekday(y, 2, 0, 2), 7) / 1000,
      end: Date.UTC(y, 10, nthWeekday(y, 10, 0, 1), 6) / 1000
    };
    dstCache.set(y, r);
  }
  return r;
}
/** Seconds to add to a UTC timestamp to get New York wall-clock time. */
function etOffset(utc) {
  const r = dstRange(new Date(utc * 1000).getUTCFullYear());
  return utc >= r.start && utc < r.end ? -14400 : -18000;
}
function toET(utc) { return utc + etOffset(utc); }
/** New York wall-clock date + time -> UTC seconds. */
function etToUtc(d, hh, mm, ss) {
  const wall = dateToMs(d) / 1000 + hh * 3600 + mm * 60 + (ss || 0);
  let utc = wall + 18000;
  if (etOffset(utc) === -14400) utc = wall + 14400;
  return utc;
}
// Central European time (for CSV files exported in Swedish local time)
function lastSunday(y, m0) {
  const last = new Date(Date.UTC(y, m0 + 1, 0));
  return last.getUTCDate() - last.getUTCDay();
}
function cetToUtc(d, hh, mm, ss) {
  const y = +d.slice(0, 4);
  const wall = dateToMs(d) / 1000 + hh * 3600 + mm * 60 + (ss || 0);
  const s = Date.UTC(y, 2, lastSunday(y, 2), 1) / 1000, e = Date.UTC(y, 9, lastSunday(y, 9), 1) / 1000;
  let utc = wall - 3600;
  if (utc >= s && utc < e) utc = wall - 7200;
  return utc;
}
/** Futures session date: the Globex day that starts 18:00 ET the evening before. */
function sessionDateOf(utc) { return msToDate((toET(utc) + 6 * 3600) * 1000); }
/** Minutes since midnight, New York time. */
function etMinuteOfDay(utc) {
  const w = toET(utc);
  return Math.floor((((w % 86400) + 86400) % 86400) / 60);
}

function easter(y) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return msToDate(Date.UTC(y, month - 1, day));
}
function observed(d) { const w = dow(d); return w === 6 ? addDays(d, -1) : w === 0 ? addDays(d, 1) : d; }
const holidayCache = new Map();
function usHolidays(y) {
  let s = holidayCache.get(y);
  if (s) return s;
  const p = n => String(n).padStart(2, '0');
  const d = (m, dd) => `${y}-${p(m)}-${p(dd)}`;
  const nth = (m, wd, n) => d(m, nthWeekday(y, m - 1, wd, n));
  const lastMonday = (m) => {
    const ld = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const w = new Date(Date.UTC(y, m - 1, ld)).getUTCDay();
    return d(m, ld - ((w - 1 + 7) % 7));
  };
  s = new Set([
    observed(d(1, 1)), nth(1, 1, 3), nth(2, 1, 3), addDays(easter(y), -2), lastMonday(5),
    observed(d(7, 4)), nth(9, 1, 1), nth(11, 4, 4), observed(d(12, 25))
  ]);
  if (y >= 2022) s.add(observed(d(6, 19))); // Juneteenth, a market holiday since 2022
  holidayCache.set(y, s);
  return s;
}
function isTradingDay(d) {
  const w = dow(d);
  return w !== 0 && w !== 6 && !usHolidays(+d.slice(0, 4)).has(d);
}

// ------------------------------------------------------- sample sessions
// Generated, not historical. Shaped like Nasdaq-100 futures: quiet Asia
// session, London pick-up, 08:30 data spikes, a fast cash open, lunch lull,
// and a closing push. Each day is one of three types (trend, range, normal).
const SAMPLE_START = '2023-01-03';
const SESSION_MIN = 1380; // 18:00 -> 17:00 ET
const RTH_OPEN_M = 930;   // 09:30 in session minutes
const RTH_CLOSE_M = 1320; // 16:00
const PROFILE = (function () {
  const k = [
    [0, 0.55], [30, 0.32], [120, 0.38], [210, 0.28], [480, 0.26], [540, 0.62], [585, 0.48],
    [780, 0.38], [840, 0.48], [870, 0.62], [915, 0.55], [929, 0.6], [930, 1.75], [945, 1.4],
    [960, 1.2], [990, 1.0], [1050, 0.78], [1080, 0.6], [1140, 0.52], [1170, 0.62], [1200, 0.7],
    [1260, 0.82], [1310, 1.05], [1319, 1.15], [1320, 0.45], [1335, 0.3], [1379, 0.25]
  ];
  const out = new Float64Array(SESSION_MIN);
  let j = 0;
  for (let m = 0; m < SESSION_MIN; m++) {
    while (j < k.length - 2 && m >= k[j + 1][0]) j++;
    const [m0, v0] = k[j], [m1, v1] = k[j + 1];
    out[m] = m <= m0 ? v0 : m >= m1 ? v1 : v0 + (v1 - v0) * (m - m0) / (m1 - m0);
  }
  return out;
})();
const smoothstep = u => u * u * (3 - 2 * u);
const roundTo = (x, tick) => Math.round(x / tick) * tick;

function buildSampleCalendar(endDate) {
  const days = [];
  for (let d = SAMPLE_START; d <= endDate; d = addDays(d, 1)) if (isTradingDay(d)) days.push(d);
  const rng = mulberry32(911), g = makeGauss(rng);
  const n = days.length;
  const closes = new Float64Array(n), vols = new Float64Array(n), kinds = new Array(n);
  let lv = Math.log(10950), lvol = Math.log(0.0115);
  const t0 = dateToMs(days[0]);
  for (let i = 0; i < n; i++) {
    const yrs = (dateToMs(days[i]) - t0) / (365.25 * DAY_MS);
    const trend = Math.log(10950) + 0.21 * yrs;
    lvol = 0.93 * lvol + 0.07 * Math.log(0.0115) + 0.2 * g();
    const vol = Math.min(0.032, Math.max(0.0055, Math.exp(lvol)));
    lv += 0.0003 - 0.025 * (lv - trend) + vol * g();
    closes[i] = Math.exp(lv);
    vols[i] = vol;
    const u = rng();
    kinds[i] = u < 0.27 ? 'trend' : u < 0.72 ? 'range' : 'normal';
  }
  return { days, closes, vols, kinds };
}

function genSampleSession(cal, i) {
  const date = cal.days[i];
  const prevClose = i > 0 ? cal.closes[i - 1] : cal.closes[0] * 0.996;
  const target = cal.closes[i], dvol = cal.vols[i], kind = cal.kinds[i];
  const rng = mulberry32(hashStr('NQ|' + date)), g = makeGauss(rng);
  const N = SESSION_MIN;
  const v = Float64Array.from(PROFILE);
  const spike = (m0, peak, len) => {
    for (let k = 0; k < len && m0 + k < N; k++) v[m0 + k] *= 1 + (peak - 1) * Math.exp(-k / (len / 3));
  };
  if (rng() < 0.38) spike(870, 3.2, 14);  // 08:30 economic data
  if (rng() < 0.22) spike(960, 2.2, 12);  // 10:00 data
  if (rng() < 0.05) spike(1200, 3.5, 40); // 14:00 rate decision
  const cl = new Float64Array(N);
  let z = 0;
  for (let m = 0; m < N; m++) { z = 0.985 * z + 0.17 * g(); cl[m] = Math.exp(0.35 * z); }
  let S = 0;
  for (let m = 0; m < N; m++) S += (v[m] * cl[m]) ** 2;
  const k = 0.68 * dvol / Math.sqrt(S);
  const sig = new Float64Array(N);
  for (let m = 0; m < N; m++) sig[m] = k * v[m] * cl[m];
  const phi = kind === 'trend' ? 0.14 : kind === 'range' ? -0.1 : 0.03;
  const x = new Float64Array(N + 1), V = new Float64Array(N + 1);
  let r = 0;
  for (let m = 0; m < N; m++) {
    r = phi * r + sig[m] * g();
    x[m + 1] = x[m] + r;
    V[m + 1] = V[m] + sig[m] * sig[m];
  }
  const total = Math.log(target / prevClose);
  const bumpA = kind === 'range' ? (rng() < 0.5 ? -1 : 1) * (0.5 + 0.7 * rng()) * dvol : 0;
  const lp = new Float64Array(N + 1);
  const span = RTH_CLOSE_M - RTH_OPEN_M;
  for (let m = 0; m <= N; m++) {
    let D;
    if (kind === 'trend') {
      const on = Math.min(m, RTH_OPEN_M) / RTH_OPEN_M;
      const rt = m <= RTH_OPEN_M ? 0 : m >= RTH_CLOSE_M ? 1 : smoothstep((m - RTH_OPEN_M) / span);
      D = 0.18 * on + 0.82 * rt;
    } else D = V[m] / V[N];
    const bump = (m > RTH_OPEN_M && m < RTH_CLOSE_M) ? bumpA * Math.sin(Math.PI * (m - RTH_OPEN_M) / span) : 0;
    lp[m] = Math.log(prevClose) + total * D + (x[m] - (V[m] / V[N]) * x[N]) + bump;
  }
  const T = new Float64Array(N), O = new Float64Array(N), H = new Float64Array(N), L = new Float64Array(N);
  const C = new Float64Array(N), VOL = new Float64Array(N);
  const start = etToUtc(addDays(date, -1), 18, 0);
  const tick = 0.25, K = 8;
  let prevC = roundTo(prevClose, tick);
  const W = new Float64Array(K + 1);
  for (let m = 0; m < N; m++) {
    const P0 = Math.exp(lp[m]), P1 = Math.exp(lp[m + 1]);
    let op = prevC;
    if (m === 0) op = roundTo(P0 + (rng() - 0.5) * 6 * sig[m] * P0, tick);
    else if (rng() < 0.12) op = prevC + (rng() < 0.5 ? -tick : tick);
    const cls = roundTo(P1, tick);
    const sd = sig[m] * P0 / Math.sqrt(K);
    W[0] = 0;
    for (let j = 1; j <= K; j++) W[j] = W[j - 1] + sd * g();
    let hi = Math.max(op, cls), lo = Math.min(op, cls);
    for (let j = 1; j < K; j++) {
      const p = op + (cls - op) * j / K + (W[j] - (j / K) * W[K]);
      if (p > hi) hi = p;
      if (p < lo) lo = p;
    }
    T[m] = start + m * 60;
    O[m] = op; C[m] = cls;
    H[m] = Math.max(roundTo(hi, tick), op, cls);
    L[m] = Math.min(roundTo(lo, tick), op, cls);
    const move = Math.abs(cls - op) / (sig[m] * P0 + 1e-9);
    VOL[m] = Math.max(1, Math.round(1500 * Math.pow(v[m], 1.35) * Math.exp(0.35 * g()) * (1 + 0.5 * Math.min(4, move))));
    prevC = cls;
  }
  return { t: T, o: O, h: H, l: L, c: C, v: VOL };
}

function lastCompletedTradingDay(nowMs) {
  let d = sessionDateOf(Math.floor(nowMs / 1000));
  d = addDays(d, -1);
  while (!isTradingDay(d)) d = addDays(d, -1);
  return d;
}

function SampleDataset(endDate) {
  const cal = buildSampleCalendar(endDate);
  const cache = new Map();
  return {
    kind: 'sample',
    label: 'Sample data',
    baseSec: 60,
    days: cal.days,
    dayType(i) { return cal.kinds[i]; },
    session(i) {
      let s = cache.get(i);
      if (!s) {
        s = genSampleSession(cal, i);
        cache.set(i, s);
        if (cache.size > 30) cache.delete(cache.keys().next().value);
      }
      return s;
    }
  };
}

/** Split bars into Globex sessions: [[sessionDate, startIndex, endIndex), ...]. */
function splitSessions(bars) {
  const n = bars.t.length, ranges = [];
  let cur = null, start = 0;
  for (let i = 0; i < n; i++) {
    const d = sessionDateOf(bars.t[i]);
    if (d !== cur) {
      if (cur !== null) ranges.push([cur, start, i]);
      cur = d; start = i;
    }
  }
  if (cur !== null) ranges.push([cur, start, n]);
  return ranges;
}
const BAR_KEYS = ['t', 'o', 'h', 'l', 'c', 'v'];
/** Copy bars [a, b) into new arrays (safe to store on their own). */
function sliceBars(bars, a, b) {
  const out = {};
  for (const k of BAR_KEYS) out[k] = Float64Array.prototype.slice.call(bars[k], a, b);
  return out;
}
function emptyBars() {
  const out = {};
  for (const k of BAR_KEYS) out[k] = new Float64Array(0);
  return out;
}

function CsvDataset(name, bars) {
  const minBars = Math.max(6, Math.round(1800 / bars.baseSec));
  const kept = splitSessions(bars).filter(r => r[2] - r[1] >= minBars);
  const sub = (a, b) => ({
    t: bars.t.subarray(a, b), o: bars.o.subarray(a, b), h: bars.h.subarray(a, b),
    l: bars.l.subarray(a, b), c: bars.c.subarray(a, b), v: bars.v.subarray(a, b)
  });
  return {
    kind: 'csv',
    label: name,
    baseSec: bars.baseSec,
    days: kept.map(r => r[0]),
    dayType() { return null; },
    session(i) { return sub(kept[i][1], kept[i][2]); }
  };
}

// ------------------------------------------------------------ real data
// Real CME sessions fetched on demand (see /api/bars). The calendar lists
// every likely trading day; bars arrive later and are kept in a small cache.
const FIRST_REAL_DAY = '2010-06-07';
function RealDataset(startDate, endDate, maxCached) {
  const days = [];
  for (let d = startDate; d <= endDate; d = addDays(d, 1)) if (isTradingDay(d)) days.push(d);
  const cap = maxCached || 120;
  const cache = new Map();
  const EMPTY = emptyBars();
  return {
    kind: 'real',
    label: 'Real NQ futures (Databento)',
    baseSec: 60,
    days,
    dayType() { return null; },
    has(d) { return cache.has(d); },
    touch(d) { const v = cache.get(d); if (v) { cache.delete(d); cache.set(d, v); } },
    put(d, bars) {
      cache.delete(d);
      cache.set(d, bars);
      while (cache.size > cap) cache.delete(cache.keys().next().value);
    },
    bars(d) { return cache.get(d) || EMPTY; },
    session(i) { return cache.get(days[i]) || EMPTY; }
  };
}

/** Concatenate the replay day with up to `contextDays` earlier sessions. */
function assembleReplay(ds, dayIdx, contextDays) {
  const from = Math.max(0, dayIdx - contextDays);
  const parts = [];
  for (let i = from; i <= dayIdx; i++) parts.push(ds.session(i));
  let total = 0;
  for (const p of parts) total += p.t.length;
  const out = {
    t: new Float64Array(total), o: new Float64Array(total), h: new Float64Array(total),
    l: new Float64Array(total), c: new Float64Array(total), v: new Float64Array(total)
  };
  let off = 0, sessionStart = 0;
  parts.forEach((p, k) => {
    if (k === parts.length - 1) sessionStart = off;
    for (const key of ['t', 'o', 'h', 'l', 'c', 'v']) out[key].set(p[key], off);
    off += p.t.length;
  });
  return { bars: out, sessionStart, sessionEnd: total, date: ds.days[dayIdx], baseSec: ds.baseSec };
}

/** Index of the first replay-day bar at or after a New York time (minutes). */
function indexAtEtMinute(rep, etMin) {
  const { bars, sessionStart, sessionEnd } = rep;
  const target = etMin >= 1080 ? etMin - 1080 : etMin + 360; // minutes since 18:00
  for (let i = sessionStart; i < sessionEnd; i++) {
    const m = etMinuteOfDay(bars.t[i]);
    const sm = m >= 1080 ? m - 1080 : m + 360;
    if (sm >= target) return i;
  }
  return sessionEnd - 1;
}

// ------------------------------------------------------------ aggregation
/** Start of the bucket (New York wall seconds) that a bar belongs to. */
function bucketStart(utc, tfSec) {
  const w = toET(utc);
  return w - (((w % tfSec) + tfSec) % tfSec);
}
function createAgg(tfSec) {
  return { tfSec, time: [], utc: [], o: [], h: [], l: [], c: [], v: [], first: [] };
}
/** Add base bar i; returns true when it starts a new candle. */
function aggPush(agg, bars, i) {
  const b = bucketStart(bars.t[i], agg.tfSec);
  const n = agg.time.length;
  if (n && agg.time[n - 1] === b) {
    if (bars.h[i] > agg.h[n - 1]) agg.h[n - 1] = bars.h[i];
    if (bars.l[i] < agg.l[n - 1]) agg.l[n - 1] = bars.l[i];
    agg.c[n - 1] = bars.c[i];
    agg.v[n - 1] += bars.v[i];
    return false;
  }
  agg.time.push(b);
  agg.utc.push(bars.t[i] - (toET(bars.t[i]) - b));
  agg.o.push(bars.o[i]); agg.h.push(bars.h[i]); agg.l.push(bars.l[i]);
  agg.c.push(bars.c[i]); agg.v.push(bars.v[i]);
  agg.first.push(i);
  return true;
}
function aggregate(bars, from, to, tfSec) {
  const agg = createAgg(tfSec);
  for (let i = from; i <= to; i++) aggPush(agg, bars, i);
  return agg;
}

// ------------------------------------------------------------- indicators
function ema(src, n, out) {
  const len = src.length;
  out = out || new Float64Array(len);
  const k = 2 / (n + 1);
  let e = NaN, sum = 0, cnt = 0;
  for (let i = 0; i < len; i++) {
    const x = src[i];
    if (!(x === x)) { out[i] = NaN; continue; }
    if (cnt < n) {
      sum += x; cnt++;
      if (cnt === n) { e = sum / n; out[i] = e; } else out[i] = NaN;
    } else {
      e = x * k + e * (1 - k);
      out[i] = e;
    }
  }
  return out;
}
function sma(src, n) {
  const len = src.length, out = new Float64Array(len);
  let sum = 0;
  for (let i = 0; i < len; i++) {
    sum += src[i];
    if (i >= n) sum -= src[i - n];
    out[i] = i >= n - 1 ? sum / n : NaN;
  }
  return out;
}
function bollinger(c, n, mult) {
  const mid = sma(c, n), len = c.length;
  const up = new Float64Array(len), lo = new Float64Array(len);
  for (let i = 0; i < len; i++) {
    if (i < n - 1) { up[i] = lo[i] = NaN; continue; }
    let s = 0;
    for (let j = i - n + 1; j <= i; j++) s += (c[j] - mid[i]) ** 2;
    const sd = Math.sqrt(s / n);
    up[i] = mid[i] + mult * sd;
    lo[i] = mid[i] - mult * sd;
  }
  return { mid, up, lo };
}
function rsi(c, n) {
  const len = c.length, out = new Float64Array(len).fill(NaN);
  if (len <= n) return out;
  let g = 0, l = 0;
  for (let i = 1; i <= n; i++) {
    const d = c[i] - c[i - 1];
    if (d > 0) g += d; else l -= d;
  }
  g /= n; l /= n;
  out[n] = l === 0 ? 100 : 100 - 100 / (1 + g / l);
  for (let i = n + 1; i < len; i++) {
    const d = c[i] - c[i - 1];
    g = (g * (n - 1) + (d > 0 ? d : 0)) / n;
    l = (l * (n - 1) + (d < 0 ? -d : 0)) / n;
    out[i] = l === 0 ? 100 : 100 - 100 / (1 + g / l);
  }
  return out;
}
function macd(c, fast, slow, signal) {
  const ef = ema(c, fast), es = ema(c, slow), len = c.length;
  const m = new Float64Array(len);
  for (let i = 0; i < len; i++) m[i] = ef[i] - es[i];
  const s = ema(m, signal);
  const h = new Float64Array(len);
  for (let i = 0; i < len; i++) h[i] = m[i] - s[i];
  return { macd: m, signal: s, hist: h };
}
function atr(h, l, c, n) {
  const len = c.length, out = new Float64Array(len).fill(NaN);
  let a = 0;
  for (let i = 0; i < len; i++) {
    const tr = i === 0 ? h[i] - l[i] : Math.max(h[i] - l[i], Math.abs(h[i] - c[i - 1]), Math.abs(l[i] - c[i - 1]));
    if (i < n) { a += tr; if (i === n - 1) { a /= n; out[i] = a; } }
    else { a = (a * (n - 1) + tr) / n; out[i] = a; }
  }
  return out;
}
/** Session VWAP. anchor 'eth' resets at 18:00 ET, 'rth' at 09:30 ET (blank outside 09:30-16:00). */
function vwap(agg, anchor) {
  const len = agg.time.length, out = new Float64Array(len).fill(NaN);
  let pv = 0, vv = 0, key = null;
  for (let i = 0; i < len; i++) {
    const w = agg.time[i];
    const mins = Math.floor((((w % 86400) + 86400) % 86400) / 60);
    let k;
    if (anchor === 'rth') {
      if (mins < 570 || mins >= 960) { out[i] = NaN; continue; }
      k = Math.floor(w / 86400);
    } else k = Math.floor((w + 21600) / 86400);
    if (k !== key) { key = k; pv = 0; vv = 0; }
    const tp = (agg.h[i] + agg.l[i] + agg.c[i]) / 3, vol = agg.v[i] || 1;
    pv += tp * vol; vv += vol;
    out[i] = pv / vv;
  }
  return out;
}

// -------------------------------------------------------- order simulator
const INSTRUMENTS = {
  MNQ: { code: 'MNQ', name: 'Micro E-mini Nasdaq-100', tick: 0.25, pointValue: 2, commission: 0.5 },
  NQ: { code: 'NQ', name: 'E-mini Nasdaq-100', tick: 0.25, pointValue: 20, commission: 2 }
};

function createBroker(inst, opts) {
  return {
    inst: Object.assign({}, inst),
    opts: Object.assign({ slippageTicks: 1, limitThrough: false, conservative: true }, opts || {}),
    pos: null, orders: [], trades: [], fills: [],
    realized: 0, commission: 0,
    last: null, seq: 1, tradeSeq: 1,
    onOpen: null, onClose: null
  };
}
function bMark(b, price, time, idx) { b.last = { price, time, idx }; }

function unrealized(b) {
  const p = b.pos;
  if (!p || !b.last) return 0;
  return (b.last.price - p.avg) * p.side * p.qty * b.inst.pointValue;
}
function updateExcursion(b, price) {
  const p = b.pos;
  if (!p) return;
  const fav = (price - p.avg) * p.side;
  if (fav > p.mfe) p.mfe = fav;
  if (-fav > p.mae) p.mae = -fav;
}

function closeTrade(b, p, reason) {
  const pv = b.inst.pointValue;
  const net = p.gross - p.comm;
  const riskPts = p.riskUsd != null ? p.riskUsd / (pv * p.maxQty) : null;
  const t = {
    id: p.tradeId, side: p.side, qty: p.maxQty,
    entryTime: p.openTime, entryIdx: p.openIdx, exitTime: b.last.time, exitIdx: b.last.idx,
    entry: p.entryCost / p.entryQty, exit: p.exitCost / p.exitQty,
    points: p.gross / (pv * p.maxQty), gross: p.gross, commission: p.comm, net,
    riskUsd: p.riskUsd, riskPts, r: p.riskUsd ? net / p.riskUsd : null,
    mfe: p.mfe, mae: p.mae,
    mfeR: riskPts ? p.mfe / riskPts : null, maeR: riskPts ? p.mae / riskPts : null,
    reason, ambiguous: p.ambiguous, slAtEntry: p.slAtEntry, tpAtEntry: p.tpAtEntry,
    plannedRR: p.plannedRR, adds: p.adds, ctx: p.ctx || null, notes: [], after: null
  };
  b.trades.push(t);
  b.pos = null;
  if (b.onClose) b.onClose(t);
  return t;
}

function applyFill(b, side, qty, price, reason, br) {
  const inst = b.inst, pv = inst.pointValue, tick = inst.tick;
  const fee = inst.commission * qty;
  b.commission += fee;
  b.realized -= fee;
  const fill = { id: b.seq++, time: b.last.time, idx: b.last.idx, side, qty, price, reason };
  b.fills.push(fill);
  let remaining = qty, feeLeft = fee;
  const p = b.pos;
  if (p && p.side !== side) {
    const closeQty = Math.min(remaining, p.qty);
    const pnl = (price - p.avg) * p.side * closeQty * pv;
    const feePart = fee * closeQty / qty;
    feeLeft -= feePart;
    p.gross += pnl; p.comm += feePart;
    b.realized += pnl;
    p.exitCost += price * closeQty; p.exitQty += closeQty;
    p.qty -= closeQty;
    remaining -= closeQty;
    if (p.qty === 0) fill.closed = closeTrade(b, p, remaining > 0 ? 'Reversed' : reason);
  }
  if (remaining > 0) {
    const q = b.pos;
    if (q && q.side === side) {
      q.avg = (q.avg * q.qty + price * remaining) / (q.qty + remaining);
      q.qty += remaining;
      q.maxQty = Math.max(q.maxQty, q.qty);
      q.entryCost += price * remaining; q.entryQty += remaining;
      q.comm += feeLeft; q.adds++;
      if (q.sl == null && br && br.sl > 0) q.sl = roundTo(price - side * br.sl, tick);
      if (q.tp == null && br && br.tp > 0) q.tp = roundTo(price + side * br.tp, tick);
      if (q.sl != null) q.riskUsd = Math.max(q.riskUsd || 0, Math.abs(q.avg - q.sl) * pv * q.qty);
    } else {
      const n = {
        tradeId: b.tradeSeq++, side, qty: remaining, avg: price, maxQty: remaining,
        entryCost: price * remaining, entryQty: remaining, exitCost: 0, exitQty: 0,
        gross: 0, comm: feeLeft, openTime: b.last.time, openIdx: b.last.idx,
        sl: null, tp: null, riskUsd: null, mfe: 0, mae: 0, ambiguous: false, adds: 0,
        slAtEntry: null, tpAtEntry: null, plannedRR: null, ctx: null
      };
      if (br && br.sl > 0) n.sl = roundTo(price - side * br.sl, tick);
      if (br && br.tp > 0) n.tp = roundTo(price + side * br.tp, tick);
      n.slAtEntry = n.sl; n.tpAtEntry = n.tp;
      if (n.sl != null) n.riskUsd = Math.abs(price - n.sl) * pv * n.qty;
      if (n.sl != null && n.tp != null) n.plannedRR = Math.abs(n.tp - price) / Math.abs(price - n.sl);
      b.pos = n;
      fill.opened = n;
      if (b.onOpen) b.onOpen(n);
    }
  }
  return fill;
}

function sideWord(side) { return side === 1 ? 'buy' : 'sell'; }

/** Place an order. req: {side: 1|-1, type: 'market'|'limit'|'stop', qty, price?, sl?, tp?} (sl/tp = distance in points). */
function bPlace(b, req) {
  if (!b.last) return { ok: false, error: 'Start a replay before placing orders.' };
  const tick = b.inst.tick;
  const qty = Math.round(req.qty);
  if (!(qty >= 1 && qty <= 100)) return { ok: false, error: 'Quantity must be between 1 and 100 contracts.' };
  const br = { sl: req.sl > 0 ? req.sl : null, tp: req.tp > 0 ? req.tp : null };
  const last = b.last.price, side = req.side;
  if (req.type === 'market') {
    const px = roundTo(last + side * b.opts.slippageTicks * tick, tick);
    return { ok: true, fill: applyFill(b, side, qty, px, 'Market', br) };
  }
  const price = roundTo(+req.price, tick);
  if (!isFinite(price) || price <= 0) return { ok: false, error: 'Enter a valid price.' };
  if (req.type === 'limit') {
    if ((side === 1 && price >= last) || (side === -1 && price <= last)) {
      return { ok: true, fill: applyFill(b, side, qty, last, 'Limit', br), marketable: true };
    }
  } else if (req.type === 'stop') {
    if (side === 1 && price <= last) return { ok: false, error: 'A buy stop has to be above the current price. Use a buy limit to buy lower.' };
    if (side === -1 && price >= last) return { ok: false, error: 'A sell stop has to be below the current price. Use a sell limit to sell higher.' };
  } else return { ok: false, error: 'Unknown order type.' };
  const order = { id: b.seq++, side, type: req.type, qty, price, sl: br.sl, tp: br.tp, time: b.last.time, idx: b.last.idx };
  b.orders.push(order);
  return { ok: true, order };
}

function bCancel(b, id) {
  const i = b.orders.findIndex(o => o.id === id);
  if (i < 0) return false;
  b.orders.splice(i, 1);
  return true;
}
function bCancelAll(b) { const n = b.orders.length; b.orders.length = 0; return n; }

function bModify(b, id, newPrice) {
  const o = b.orders.find(x => x.id === id);
  if (!o) return { ok: false, error: 'That order is no longer working.' };
  const price = roundTo(newPrice, b.inst.tick), last = b.last.price;
  if (o.type === 'stop' && ((o.side === 1 && price <= last) || (o.side === -1 && price >= last))) {
    return { ok: false, error: `A ${sideWord(o.side)} stop has to be ${o.side === 1 ? 'above' : 'below'} the current price.` };
  }
  if (o.type === 'limit' && ((o.side === 1 && price >= last) || (o.side === -1 && price <= last))) {
    b.orders.splice(b.orders.indexOf(o), 1);
    return { ok: true, fill: applyFill(b, o.side, o.qty, last, 'Limit', { sl: o.sl, tp: o.tp }) };
  }
  o.price = price;
  return { ok: true, order: o };
}

/** Change the open position's stop/target (absolute prices; null removes, undefined keeps). */
function bSetBrackets(b, sl, tp) {
  const p = b.pos;
  if (!p) return { ok: false, error: 'No open position.' };
  const last = b.last.price, tick = b.inst.tick, long = p.side === 1;
  const nsl = sl === undefined ? p.sl : sl === null ? null : roundTo(sl, tick);
  const ntp = tp === undefined ? p.tp : tp === null ? null : roundTo(tp, tick);
  if (nsl != null && (long ? nsl >= last : nsl <= last)) {
    return { ok: false, error: `The stop has to be ${long ? 'below' : 'above'} the current price for a ${long ? 'long' : 'short'}. Use Flatten to exit now.` };
  }
  if (ntp != null && (long ? ntp <= last : ntp >= last)) {
    return { ok: false, error: `The target has to be ${long ? 'above' : 'below'} the current price for a ${long ? 'long' : 'short'}.` };
  }
  p.sl = nsl; p.tp = ntp;
  if (p.sl != null && p.riskUsd == null) p.riskUsd = Math.abs(p.avg - p.sl) * b.inst.pointValue * p.qty;
  return { ok: true };
}

function bFlatten(b, reason) {
  const p = b.pos;
  if (!p) return null;
  const px = roundTo(b.last.price - p.side * b.opts.slippageTicks * b.inst.tick, b.inst.tick);
  return applyFill(b, -p.side, p.qty, px, reason || 'Manual');
}
function bReverse(b) {
  const p = b.pos;
  if (!p) return null;
  const px = roundTo(b.last.price - p.side * b.opts.slippageTicks * b.inst.tick, b.inst.tick);
  return applyFill(b, -p.side, p.qty * 2, px, 'Reversed');
}

/** Find the next order/stop/target that price reaches moving from cur to z. */
function nextTrigger(b, cur, z, through) {
  const up = z > cur;
  let best = null, bestD = Infinity;
  const test = (E, dir, kind, side, src, order) => {
    const ok = dir === 'down' ? (!up && E >= z && E <= cur) : (up && E <= z && E >= cur);
    if (!ok) return;
    const d = Math.abs(E - cur);
    if (d < bestD || (d === bestD && src !== 'order')) { bestD = d; best = { level: E, kind, side, src, order }; }
  };
  for (const o of b.orders) {
    if (o.type === 'limit') test(o.price - o.side * through, o.side === 1 ? 'down' : 'up', 'limit', o.side, 'order', o);
    else test(o.price, o.side === 1 ? 'up' : 'down', 'stop', o.side, 'order', o);
  }
  const p = b.pos;
  if (p) {
    if (p.sl != null) test(p.sl, p.side === 1 ? 'down' : 'up', 'stop', -p.side, 'sl');
    if (p.tp != null) test(p.tp + p.side * through, p.side === 1 ? 'up' : 'down', 'limit', -p.side, 'tp');
  }
  return best;
}

/** Advance the simulator through one bar. Returns the fills it produced. */
function bOnBar(b, bar) {
  const prevClose = b.last ? b.last.price : null;
  b.last = { price: bar.o, time: bar.t, idx: bar.idx };
  const tick = b.inst.tick, slip = b.opts.slippageTicks * tick, through = b.opts.limitThrough ? tick : 0;
  const fills = [];
  const p0 = b.pos;
  let path;
  const amb = p0 && p0.sl != null && p0.tp != null &&
    bar.l <= Math.min(p0.sl, p0.tp) && bar.h >= Math.max(p0.sl, p0.tp);
  if (amb && b.opts.conservative) {
    path = p0.side === 1 ? [bar.o, bar.l, bar.h, bar.c] : [bar.o, bar.h, bar.l, bar.c];
    p0.ambiguous = true;
  } else {
    path = bar.c >= bar.o ? [bar.o, bar.l, bar.h, bar.c] : [bar.o, bar.h, bar.l, bar.c];
  }
  const segs = [];
  if (prevClose != null && prevClose !== bar.o) segs.push([prevClose, bar.o, true]);
  for (let k = 0; k < 3; k++) if (path[k] !== path[k + 1]) segs.push([path[k], path[k + 1], false]);
  for (const [a, z, gap] of segs) {
    let cur = a;
    for (let guard = 0; guard < 64; guard++) {
      const ev = nextTrigger(b, cur, z, through);
      if (!ev) break;
      const at = gap ? z : ev.level;
      let px;
      if (ev.kind === 'stop') px = roundTo(at + ev.side * slip, tick);
      else if (gap) px = at;
      else px = ev.src === 'order' ? ev.order.price : b.pos.tp;
      b.last.price = at;
      if (ev.src === 'order') {
        b.orders.splice(b.orders.indexOf(ev.order), 1);
        fills.push(applyFill(b, ev.side, ev.order.qty, px, ev.order.type === 'limit' ? 'Limit' : 'Stop',
          { sl: ev.order.sl, tp: ev.order.tp }));
      } else {
        fills.push(applyFill(b, -b.pos.side, b.pos.qty, px, ev.src === 'sl' ? 'Stop' : 'Target'));
      }
      cur = at;
      updateExcursion(b, at);
    }
    updateExcursion(b, z);
  }
  b.last = { price: bar.c, time: bar.t, idx: bar.idx };
  return fills;
}

function bEndSession(b) {
  bCancelAll(b);
  return bFlatten(b, 'Session end');
}

// ------------------------------------------------------------- statistics
function computeStats(trades) {
  const n = trades.length;
  let wins = 0, losses = 0, gw = 0, gl = 0, net = 0, gross = 0, comm = 0;
  let eq = 0, peak = 0, mdd = 0, best = null, worst = null, mfe = 0, mae = 0, dur = 0;
  const rs = [], equity = [0];
  const side = { long: { n: 0, net: 0, wins: 0 }, short: { n: 0, net: 0, wins: 0 } };
  const byHour = new Map();
  for (const t of trades) {
    net += t.net; gross += t.gross; comm += t.commission;
    if (t.net > 0) { wins++; gw += t.net; } else { losses++; gl -= t.net; }
    eq += t.net; equity.push(eq);
    if (eq > peak) peak = eq;
    if (peak - eq > mdd) mdd = peak - eq;
    if (best === null || t.net > best.net) best = t;
    if (worst === null || t.net < worst.net) worst = t;
    if (t.r != null && isFinite(t.r)) rs.push(t.r);
    mfe += t.mfe; mae += t.mae; dur += Math.max(0, t.exitTime - t.entryTime);
    const s = t.side === 1 ? side.long : side.short;
    s.n++; s.net += t.net; if (t.net > 0) s.wins++;
    const hr = Math.floor(etMinuteOfDay(t.entryTime) / 60);
    const hb = byHour.get(hr) || { hour: hr, n: 0, net: 0, wins: 0 };
    hb.n++; hb.net += t.net; if (t.net > 0) hb.wins++;
    byHour.set(hr, hb);
  }
  return {
    n, wins, losses, net, gross, commission: comm,
    winRate: n ? wins / n : null,
    avgWin: wins ? gw / wins : null,
    avgLoss: losses ? -gl / losses : null,
    profitFactor: gl > 0 ? gw / gl : (gw > 0 ? Infinity : null),
    expectancy: n ? net / n : null,
    expectancyR: rs.length ? rs.reduce((a, x) => a + x, 0) / rs.length : null,
    rCount: rs.length,
    maxDrawdown: mdd, best, worst,
    avgMfe: n ? mfe / n : null, avgMae: n ? mae / n : null,
    avgMinutes: n ? dur / n / 60 : null,
    long: side.long, short: side.short,
    byHour: Array.from(byHour.values()).sort((a, b) => a.hour - b.hour),
    equity
  };
}

// ---------------------------------------------------------------- coaching
/** Market context at the bar where a position opened. Uses only bars up to idx. */
function entryContext(bars, idx, baseSec) {
  const from = Math.max(0, idx - 600);
  const c = Array.from(bars.c.subarray(from, idx + 1));
  const h = Array.from(bars.h.subarray(from, idx + 1));
  const l = Array.from(bars.l.subarray(from, idx + 1));
  const e20 = ema(c, 20), a14 = atr(h, l, c, 14);
  const last = c.length - 1;
  const tf = Math.max(300, baseSec);
  const agg = aggregate(bars, Math.max(0, idx - Math.round(tf / baseSec) * 160), idx, tf);
  const e20b = ema(agg.c, 20), e50b = ema(agg.c, 50), a14b = atr(agg.h, agg.l, agg.c, 14);
  const j = agg.c.length - 1;
  const ctx = {
    price: bars.c[idx], etMin: etMinuteOfDay(bars.t[idx]),
    ema20: e20[last], atr: a14[last],
    htfMin: tf / 60, ema20h: e20b[j], ema50h: e50b[j], atrh: a14b[j]
  };
  try {
    const lv = computeLevels(bars, idx);
    ctx.levels = lv.levels;
    ctx.rthPos = lv.rthPos;
    ctx.sweeps = findSweeps(bars, idx, lv.levels, Math.max(1, Math.round(900 / baseSec)));
    ctx.gaps = findFVGs(bars, idx, baseSec).gaps.filter(g => !g.filled || g.inverted).slice(-12);
  } catch (e) { ctx.levels = []; ctx.sweeps = []; ctx.gaps = []; ctx.rthPos = null; }
  return ctx;
}

// ---------------------------------------------------------------- levels
/** Minutes since the 18:00 ET Globex open. */
function sessionMinuteOf(utc) {
  const m = etMinuteOfDay(utc);
  return m >= 1080 ? m - 1080 : m + 360;
}

/** Key levels that were complete at bar idx (prior day, Asia, London, overnight, opening range). */
function computeLevels(bars, idx) {
  const t = bars.t, sd = sessionDateOf(t[idx]), now = sessionMinuteOf(t[idx]);
  let s = idx;
  while (s > 0 && sessionDateOf(t[s - 1]) === sd) s--;
  const range = (a, b, fromM, toM) => {
    let hi = -Infinity, lo = Infinity, n = 0;
    for (let i = a; i <= b; i++) {
      const m = sessionMinuteOf(t[i]);
      if (m >= fromM && m < toM) { if (bars.h[i] > hi) hi = bars.h[i]; if (bars.l[i] < lo) lo = bars.l[i]; n++; }
    }
    return n ? { hi, lo } : null;
  };
  const levels = [];
  const add = (r, keyHi, keyLo, name) => {
    if (!r) return;
    levels.push({ key: keyHi, name: `the ${name} high`, price: r.hi, kind: 'high' });
    levels.push({ key: keyLo, name: `the ${name} low`, price: r.lo, kind: 'low' });
  };
  if (s > 0) {
    let ps = s - 1;
    const psd = sessionDateOf(t[ps]);
    while (ps > 0 && sessionDateOf(t[ps - 1]) === psd) ps--;
    add(range(ps, s - 1, RTH_OPEN_M, RTH_CLOSE_M), 'pdh', 'pdl', "prior day's");
  }
  if (now >= 540) add(range(s, idx, 0, 540), 'asiah', 'asial', 'Asia');
  if (now >= 870) add(range(s, idx, 540, 870), 'lonh', 'lonl', 'London');
  if (now >= RTH_OPEN_M) add(range(s, idx, 0, RTH_OPEN_M), 'onh', 'onl', 'overnight');
  if (now >= RTH_OPEN_M + 15) add(range(s, idx, RTH_OPEN_M, RTH_OPEN_M + 15), 'orh', 'orl', 'opening-range');
  let rthPos = null;
  if (now >= RTH_OPEN_M + 30) {
    const r = range(s, idx, RTH_OPEN_M, now + 1);
    if (r && r.hi > r.lo) rthPos = (bars.c[idx] - r.lo) / (r.hi - r.lo);
  }
  return { levels, rthPos, sessionStart: s };
}

/** Levels that price pushed through in the last `look` bars and then closed back inside of. */
function findSweeps(bars, idx, levels, look) {
  const out = [];
  const from = Math.max(0, idx - look), c = bars.c[idx];
  for (const lv of levels) {
    let swept = false;
    for (let i = from; i <= idx; i++) {
      if (lv.kind === 'high' ? bars.h[i] > lv.price : bars.l[i] < lv.price) { swept = true; break; }
    }
    if (swept && (lv.kind === 'high' ? c < lv.price : c > lv.price)) out.push(lv);
  }
  return out;
}

/** Fair value gaps on the 5-minute chart up to bar idx, with fill and inversion status. */
function findFVGs(bars, idx, baseSec) {
  const tf = Math.max(300, baseSec);
  const from = Math.max(0, idx - Math.round(tf / baseSec) * 48);
  const a = aggregate(bars, from, idx, tf);
  const n = a.time.length;
  const complete = ((toET(bars.t[idx]) + baseSec) % tf) === 0;
  const nC = complete ? n : n - 1;
  const at = atr(a.h, a.l, a.c, 14);
  const atr5 = nC > 0 && isFinite(at[nC - 1]) ? at[nC - 1] : null;
  const minSize = Math.max(1, (atr5 || 8) * 0.12);
  const gaps = [];
  for (let k = 2; k < nC; k++) {
    if (a.l[k] - a.h[k - 2] >= minSize) gaps.push({ dir: 1, bottom: a.h[k - 2], top: a.l[k], k, time: a.utc[k - 1] });
    if (a.l[k - 2] - a.h[k] >= minSize) gaps.push({ dir: -1, bottom: a.h[k], top: a.l[k - 2], k, time: a.utc[k - 1] });
  }
  for (const g of gaps) {
    g.filled = false; g.inverted = false;
    for (let j = g.k + 1; j < n; j++) {
      if (g.dir === 1) {
        if (a.l[j] <= g.bottom) g.filled = true;
        if (a.c[j] < g.bottom && (j < nC || complete)) { g.inverted = true; break; }
      } else {
        if (a.h[j] >= g.top) g.filled = true;
        if (a.c[j] > g.top && (j < nC || complete)) { g.inverted = true; break; }
      }
    }
    g.eff = g.inverted ? -g.dir : g.dir;
    delete g.k;
  }
  return { gaps, atr5 };
}

const f1 = x => (Math.round(x * 100) / 100).toLocaleString('en-US', { maximumFractionDigits: 2 });
const fp = x => x.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Notes about key levels, sweeps and fair value gaps around the entry. */
function levelNotes(t, c) {
  const notes = [];
  if (!c || !(c.atrh > 0)) return notes;
  const s = t.side, P = t.entry, A = c.atrh, long = s === 1;
  const levels = c.levels || [], gaps = c.gaps || [];
  const ahead = levels.filter(l => (l.price - P) * s > 0).sort((x, y) => Math.abs(x.price - P) - Math.abs(y.price - P))[0];
  if (ahead && Math.abs(ahead.price - P) <= 0.5 * A) {
    notes.push({ key: 'into-level', tone: 'warn', text: `${long ? 'Long' : 'Short'} ${f1(Math.abs(ahead.price - P))} pts ${long ? 'under' : 'above'} ${ahead.name} (${fp(ahead.price)}). Price often stalls at a level like that, which leaves little room before your target. A break and retest of it is the cleaner entry.` });
  }
  const sw = c.sweeps || [];
  const grab = sw.find(l => (long ? l.kind === 'low' : l.kind === 'high'));
  const failed = sw.find(l => (long ? l.kind === 'high' : l.kind === 'low'));
  if (grab) notes.push({ key: 'sweep', tone: 'good', text: `${long ? 'Long' : 'Short'} after price ran ${long ? 'below' : 'above'} ${grab.name} and closed back ${long ? 'above' : 'below'} it. That liquidity grab is a classic reversal setup.` });
  else if (failed) notes.push({ key: 'failed-break', tone: 'warn', text: `${long ? 'Long' : 'Short'} right after price failed ${long ? 'above' : 'below'} ${failed.name}. A rejected breakout often marks a short-term ${long ? 'top' : 'bottom'}, so this trade fought it.` });
  if (t.slAtEntry != null) {
    const guard = levels.find(l => (long ? l.kind === 'low' : l.kind === 'high') && (P - l.price) * s > 0 && (l.price - t.slAtEntry) * s > 0 && Math.abs(l.price - t.slAtEntry) <= 0.5 * A);
    if (guard) notes.push({ key: 'stop-level', tone: 'good', text: `Your stop sat just ${long ? 'below' : 'above'} ${guard.name} (${fp(guard.price)}), a level price had to break to prove the trade wrong.` });
  }
  const label = g => `${g.inverted ? 'inverted ' : ''}${g.eff === 1 ? 'bullish' : 'bearish'} ${c.htfMin}-minute fair value gap (${fp(g.bottom)}–${fp(g.top)})`;
  const inside = gaps.find(g => g.eff === s && P >= g.bottom && P <= g.top);
  if (inside) notes.push({ key: 'fvg-entry', tone: 'good', text: `Entered inside a ${label(inside)}, where price often reacts in your direction.` });
  else {
    const better = gaps.filter(g => g.eff === s && !g.filled && (long ? g.top < P : g.bottom > P) && Math.abs((long ? g.top : g.bottom) - P) <= 1.5 * A)
      .sort((x, y) => Math.abs((long ? x.top : x.bottom) - P) - Math.abs((long ? y.top : y.bottom) - P))[0];
    if (better) {
      const edge = long ? better.top : better.bottom;
      notes.push({ key: 'fvg-better', tone: 'info', text: `A ${label(better)} sat ${f1(Math.abs(P - edge))} pts ${long ? 'below' : 'above'} your entry. A limit order at ${fp(edge)} would have given a better price, with a natural stop ${long ? 'under' : 'over'} the gap.` });
    }
  }
  const against = gaps.filter(g => g.eff === -s && (long ? g.bottom > P : g.top < P) && Math.abs((long ? g.bottom : g.top) - P) <= 0.6 * A)[0];
  if (against) notes.push({ key: 'fvg-against', tone: 'warn', text: `${long ? 'Long' : 'Short'} ${f1(Math.abs((long ? against.bottom : against.top) - P))} pts ${long ? 'under' : 'above'} a ${label(against)}. Unfilled gaps ${long ? 'overhead' : 'below'} tend to act as ${long ? 'resistance' : 'support'}.` });
  if (c.rthPos != null) {
    if (long && c.rthPos > 0.82) notes.push({ key: 'premium', tone: 'info', text: `Long near the top of today's range (${Math.round(c.rthPos * 100)}% of the way up). Buying at a premium needs the range to break to pay off.` });
    if (!long && c.rthPos < 0.18) notes.push({ key: 'premium', tone: 'info', text: `Short near the bottom of today's range (${Math.round(c.rthPos * 100)}% of the way up). Selling at a discount needs the range to break to pay off.` });
  }
  return notes;
}

/** Rule-based review of one closed trade. Uses only information available at the exit. */
function coachNotes(t, prev, baseMin) {
  const notes = [];
  const c = t.ctx, long = t.side === 1, dir = long ? 'Long' : 'Short';
  if (t.riskUsd == null) {
    notes.push({ key: 'no-stop', tone: 'warn', text: 'There was no stop on this trade, so its risk was undefined. Set a stop when you enter, then size the position from it.' });
  } else if (t.slAtEntry == null) {
    notes.push({ key: 'stop-late', tone: 'info', text: 'The stop was added after entry. Decide where you are wrong before you click.' });
  }
  if (c && t.riskPts != null && c.atrh > 0) {
    const m = t.riskPts / c.atrh;
    if (m < 0.6) notes.push({ key: 'stop-tight', tone: 'warn', text: `Stop was ${f1(t.riskPts)} pts, only ${m.toFixed(1)}× the ${c.htfMin}-minute ATR (${f1(c.atrh)} pts). Ordinary noise reaches a stop that close.` });
    else if (m > 3) notes.push({ key: 'stop-wide', tone: 'info', text: `Wide stop: ${m.toFixed(1)}× the ${c.htfMin}-minute ATR. That works if you size down so the dollar risk stays the same.` });
    else notes.push({ key: 'stop-ok', tone: 'good', text: `Stop distance was ${m.toFixed(1)}× the ${c.htfMin}-minute ATR, outside normal noise.` });
  }
  if (t.plannedRR != null && t.plannedRR < 1) {
    notes.push({ key: 'rr-low', tone: 'warn', text: `The target was closer than the stop (${t.plannedRR.toFixed(2)}R planned). At that ratio you need to win more than ${Math.round(100 / (1 + t.plannedRR))}% of trades to break even.` });
  }
  if (t.mfeR != null && t.mfeR >= 1 && t.r != null && t.r <= 0) {
    notes.push({ key: 'gave-back', tone: 'warn', text: `Price was ${t.mfeR.toFixed(1)}R in your favour before this closed at ${t.r.toFixed(1)}R. A rule such as "stop to breakeven at +1R" would have protected it.` });
  } else if (t.net > 0 && t.mfe > 0 && t.reason !== 'Target' && t.points / t.mfe < 0.45) {
    notes.push({ key: 'kept-little', tone: 'info', text: `You kept ${Math.round(100 * t.points / t.mfe)}% of the best open profit (${f1(t.mfe)} pts).` });
  }
  if (c && isFinite(c.ema50h) && isFinite(c.ema20h)) {
    const above = c.price > c.ema50h && c.ema20h > c.ema50h;
    const below = c.price < c.ema50h && c.ema20h < c.ema50h;
    if ((long && below) || (!long && above)) {
      notes.push({ key: 'counter-trend', tone: 'warn', text: `${dir} against the ${c.htfMin}-minute trend: price was ${long ? 'below' : 'above'} the 50 EMA and the 20 EMA was ${long ? 'under' : 'over'} it.` });
    } else if ((long && above) || (!long && below)) {
      notes.push({ key: 'with-trend', tone: 'good', text: `${dir} with the ${c.htfMin}-minute trend (20 EMA ${long ? 'above' : 'below'} the 50 EMA).` });
    }
  }
  if (c && c.atr > 0 && isFinite(c.ema20)) {
    const ext = (c.price - c.ema20) / c.atr * t.side;
    if (ext > 2.2) notes.push({ key: 'chasing', tone: 'warn', text: `Entry was ${ext.toFixed(1)} ATR past the ${baseMin}-minute 20 EMA, chasing an extended move. A pullback usually gives a better price and a tighter stop.` });
  }
  if (c) {
    if (c.etMin >= 720 && c.etMin < 810) notes.push({ key: 'lunch', tone: 'info', text: 'Entered in the lunch lull (12:00–13:30 ET), when volume is thin and breakouts fail more often.' });
    else if (c.etMin >= 570 && c.etMin < 575) notes.push({ key: 'open', tone: 'info', text: 'Entered in the first five minutes of the cash open, when bars are widest and fills slip most.' });
  }
  if (prev && prev.net < 0 && t.entryTime - prev.exitTime <= 180 && t.qty >= prev.qty) {
    const mins = Math.max(1, Math.round((t.entryTime - prev.exitTime) / 60));
    notes.push({ key: 'revenge', tone: 'warn', text: `Re-entered ${mins} min after a loss with the same or larger size. A short pause after a loss stops one bad trade from turning into three.` });
  }
  for (const n of levelNotes(t, c)) notes.push(n);
  if (t.ambiguous) notes.push({ key: 'ambiguous', tone: 'info', text: 'Stop and target were both inside one bar, so the simulator assumed the stop filled first.' });
  return notes;
}

/** Coaching themes, used to group recurring problems in reviews and stats. */
const THEMES = {
  'no-stop': 'Trades without a stop', 'stop-tight': 'Stops inside normal noise', 'rr-low': 'Targets closer than stops',
  'gave-back': 'Winners that turned into losers', 'counter-trend': 'Trades against the trend', 'chasing': 'Chasing extended moves',
  'revenge': 'Quick re-entries after a loss', 'stop-then-target': 'Stopped out before the move came',
  'into-level': 'Entries right into a key level', 'failed-break': 'Trading into rejected breakouts', 'fvg-against': 'Entries into unfilled gaps'
};

/** What price did in the 30 minutes after the exit. Only call once those bars have been revealed. */
function afterExitNote(t, bars, endIdx, baseSec) {
  const N = Math.max(1, Math.round(1800 / baseSec));
  const from = t.exitIdx + 1, to = Math.min(endIdx, from + N - 1);
  if (from > to) return null;
  const long = t.side === 1;
  let fav = -Infinity, hitTp = -1;
  for (let i = from; i <= to; i++) {
    const ext = long ? bars.h[i] - t.entry : t.entry - bars.l[i];
    if (ext > fav) fav = ext;
    if (hitTp < 0 && t.tpAtEntry != null && (long ? bars.h[i] >= t.tpAtEntry : bars.l[i] <= t.tpAtEntry)) hitTp = i;
  }
  const mins = i => Math.max(1, Math.round((bars.t[i] - t.exitTime) / 60));
  if (t.reason === 'Stop') {
    if (hitTp >= 0) return { key: 'stop-then-target', tone: 'warn', text: `After your stop, price reached your original target ${mins(hitTp)} min later. The direction was right; the stop was too close or too early.` };
    if (t.riskPts && fav >= 2 * t.riskPts) return { key: 'stop-then-run', tone: 'info', text: `After your stop, price moved ${(fav / t.riskPts).toFixed(1)}R in your original direction within 30 min.` };
    return { key: 'stop-good', tone: 'good', text: 'Price did not recover after your stop. The stop did its job.' };
  }
  if (t.net > 0 && t.riskPts) {
    const beyond = fav - (long ? t.exit - t.entry : t.entry - t.exit);
    if (beyond >= t.riskPts) return { key: 'left-on-table', tone: 'info', text: `Price ran another ${(beyond / t.riskPts).toFixed(1)}R after you exited. A runner or trailing stop could have caught more.` };
  }
  return null;
}

// --------------------------------------------------------------- CSV import
const CSV_TIME_NAMES = ['time', 'timestamp', 'ts_event', 'ts_recv', 'datetime', 'date_time', 'date/time', 'ts', 'unix', 'gmt time', 'local time', 'time (utc)'];
function parseClock(s, tzMode) {
  s = s.trim().replace(/^"|"$/g, '');
  if (/^-?\d+(\.\d+)?$/.test(s)) {
    const x = +s;
    if (x > 1e17) return x / 1e9;
    if (x > 1e14) return x / 1e6;
    if (x > 1e11) return x / 1e3;
    return x;
  }
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?)?\s*(Z|UTC|[+-]\d{2}:?\d{2})?$/i);
  let y, mo, d, hh = 0, mi = 0, ss = 0, zone = null;
  if (m) {
    [y, mo, d] = [+m[1], +m[2], +m[3]];
    hh = +(m[4] || 0); mi = +(m[5] || 0); ss = +(m[6] || 0); zone = m[7] || null;
  } else if ((m = s.match(/^(\d{4})(\d{2})(\d{2})[ T]?(\d{2})(\d{2})(\d{2})?$/))) {
    [y, mo, d, hh, mi, ss] = [+m[1], +m[2], +m[3], +m[4], +m[5], +(m[6] || 0)];
  } else if ((m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?$/i))) {
    [mo, d, y, hh, mi, ss] = [+m[1], +m[2], +m[3], +m[4], +m[5], +(m[6] || 0)];
    if (m[7]) { const pm = /pm/i.test(m[7]); if (pm && hh < 12) hh += 12; if (!pm && hh === 12) hh = 0; }
  } else return NaN;
  const ds = `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  if (zone) {
    const base = Date.UTC(y, mo - 1, d, hh, mi, ss) / 1000;
    if (/^(Z|UTC)$/i.test(zone)) return base;
    const zm = zone.match(/([+-])(\d{2}):?(\d{2})/);
    const off = (zm[1] === '-' ? -1 : 1) * (+zm[2] * 3600 + +zm[3] * 60);
    return base - off;
  }
  if (tzMode === 'ny') return etToUtc(ds, hh, mi, ss);
  if (tzMode === 'cet') return cetToUtc(ds, hh, mi, ss);
  return Date.UTC(y, mo - 1, d, hh, mi, ss) / 1000;
}

/** Parse OHLCV text (CSV, semicolon or tab separated). Returns bars or {error}. */
function parseBarsCSV(text, tzMode) {
  const lines = text.split(/\r?\n/).filter(x => x.trim().length);
  if (lines.length < 2) return { error: 'The file has no rows.' };
  const first = lines[0];
  const delim = first.includes('\t') ? '\t' : (first.split(';').length > first.split(',').length ? ';' : ',');
  const head = first.split(delim).map(x => x.trim().replace(/^"|"$/g, '').toLowerCase());
  const isHeader = head.some(x => /[a-z]{2,}/.test(x) && !/^\d/.test(x));
  let iT = -1, iD = -1, iClock = -1, iO, iH, iL, iC, iV;
  const find = names => head.findIndex(x => names.includes(x));
  if (isHeader) {
    iO = find(['open', 'o', 'open price']); iH = find(['high', 'h', 'high price']);
    iL = find(['low', 'l', 'low price']); iC = find(['close', 'c', 'close price', 'last', 'price']);
    iV = find(['volume', 'vol', 'v', 'total volume']);
    const hasDate = find(['date', 'day']), hasTime = find(['time']);
    if (hasDate >= 0 && hasTime >= 0) { iD = hasDate; iClock = hasTime; }
    else iT = find(CSV_TIME_NAMES.concat(['date', 'day']));
    if (iT < 0 && iD < 0) iT = 0;
  } else {
    if (head.length >= 7 && /^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}$/.test(head[0])) { iD = 0; iClock = 1; iO = 2; iH = 3; iL = 4; iC = 5; iV = 6; }
    else { iT = 0; iO = 1; iH = 2; iL = 3; iC = 4; iV = 5; }
  }
  if ([iO, iH, iL, iC].some(x => x == null || x < 0)) {
    return { error: 'Could not find open, high, low and close columns. Name them open, high, low, close (any case).' };
  }
  const rows = [];
  let skipped = 0;
  for (let li = isHeader ? 1 : 0; li < lines.length; li++) {
    const f = lines[li].split(delim);
    const ts = iD >= 0 ? parseClock(f[iD] + ' ' + f[iClock], tzMode) : parseClock(f[iT] || '', tzMode);
    const o = +f[iO], h = +f[iH], l = +f[iL], c = +f[iC], v = iV >= 0 ? +f[iV] : 0;
    if (!isFinite(ts) || !isFinite(o) || !isFinite(h) || !isFinite(l) || !isFinite(c)) { skipped++; continue; }
    rows.push([ts, o, h, l, c, isFinite(v) ? v : 0]);
  }
  if (rows.length < 30) return { error: `Only ${rows.length} usable rows were found. Check the time and price columns.` };
  rows.sort((a, b) => a[0] - b[0]);
  const closes = rows.slice(0, Math.min(rows.length, 2000)).map(r => r[4]).sort((a, b) => a - b);
  const scale = closes[closes.length >> 1] > 1e7 ? 1e-9 : 1;
  const dedup = [];
  for (const r of rows) {
    if (dedup.length && dedup[dedup.length - 1][0] === r[0]) dedup[dedup.length - 1] = r;
    else dedup.push(r);
  }
  const diffs = [];
  for (let i = 1; i < dedup.length && diffs.length < 6000; i++) {
    const d = dedup[i][0] - dedup[i - 1][0];
    if (d > 0 && d <= 3600) diffs.push(d);
  }
  diffs.sort((a, b) => a - b);
  const med = diffs.length ? diffs[diffs.length >> 1] : 60;
  const steps = [60, 120, 180, 300, 600, 900, 1800, 3600];
  let baseSec = med < 60 ? 60 : steps.reduce((a, s) => Math.abs(s - med) < Math.abs(a - med) ? s : a, 60);
  let src = dedup;
  if (med < 60) {
    const out = [];
    for (const r of dedup) {
      const bt = Math.floor(r[0] / 60) * 60;
      const lastRow = out[out.length - 1];
      if (lastRow && lastRow[0] === bt) {
        lastRow[2] = Math.max(lastRow[2], r[2]); lastRow[3] = Math.min(lastRow[3], r[3]);
        lastRow[4] = r[4]; lastRow[5] += r[5];
      } else out.push([bt, r[1], r[2], r[3], r[4], r[5]]);
    }
    src = out;
  }
  const n = src.length;
  const bars = {
    t: new Float64Array(n), o: new Float64Array(n), h: new Float64Array(n),
    l: new Float64Array(n), c: new Float64Array(n), v: new Float64Array(n), baseSec
  };
  for (let i = 0; i < n; i++) {
    const r = src[i];
    const o = r[1] * scale, c = r[4] * scale;
    bars.t[i] = r[0]; bars.o[i] = o; bars.c[i] = c;
    bars.h[i] = Math.max(r[2] * scale, o, c);
    bars.l[i] = Math.min(r[3] * scale, o, c);
    bars.v[i] = r[5];
  }
  return { bars, rows: n, skipped, baseSec, from: bars.t[0], to: bars.t[n - 1] };
}

const TTEngine = {
  mulberry32, hashStr, makeGauss,
  dateToMs, msToDate, addDays, dow, isTradingDay, usHolidays, easter,
  etOffset, toET, etToUtc, cetToUtc, sessionDateOf, etMinuteOfDay,
  SAMPLE_START, SESSION_MIN, buildSampleCalendar, genSampleSession, lastCompletedTradingDay,
  SampleDataset, CsvDataset, RealDataset, FIRST_REAL_DAY, splitSessions, sliceBars, emptyBars, assembleReplay, indexAtEtMinute,
  bucketStart, createAgg, aggPush, aggregate,
  ema, sma, bollinger, rsi, macd, atr, vwap, roundTo,
  INSTRUMENTS, createBroker, bMark, bPlace, bCancel, bCancelAll, bModify, bSetBrackets,
  bFlatten, bReverse, bOnBar, bEndSession, unrealized,
  computeStats, entryContext, coachNotes, afterExitNote, levelNotes, THEMES,
  computeLevels, findSweeps, findFVGs, sessionMinuteOf,
  parseClock, parseBarsCSV
};

export default TTEngine;
