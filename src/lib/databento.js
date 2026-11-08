// Databento historical API helpers (used by /api/bars and the tests).
// Docs: https://databento.com/docs/api-historical (HTTP: POST /v0/timeseries.get_range,
// basic auth with the API key as the username and an empty password).

export const DATABENTO_DATASET = 'GLBX.MDP3';
/** Continuous front-month contracts (rolled by volume). */
export const CONTINUOUS = { NQ: 'NQ.v.0', MNQ: 'MNQ.v.0' };

/** Databento keys are 32 characters and start with "db-". Kept a little lenient. */
export function looksLikeDatabentoKey(key) {
  return typeof key === 'string' && /^db-[A-Za-z0-9]{16,64}$/.test(key);
}

/** Form body for one 1-minute bar request. start is inclusive, end exclusive (ISO 8601, UTC). */
export function rangeForm({ symbol, start, end }) {
  return new URLSearchParams({
    dataset: DATABENTO_DATASET,
    symbols: symbol,
    stype_in: 'continuous',
    schema: 'ohlcv-1m',
    start,
    end,
    encoding: 'json',
    pretty_px: 'true',
    pretty_ts: 'true'
  });
}

const num = x => (typeof x === 'number' ? x : typeof x === 'string' && x !== '' ? Number(x) : NaN);
/** Prices come as decimal strings with pretty_px; raw values are fixed-point 1e-9. */
const px = x => { const n = num(x); return Math.abs(n) >= 1e9 ? n / 1e9 : n; };
/** Timestamps come as ISO strings with nanoseconds (pretty_ts) or as nanosecond integers. */
function seconds(x) {
  if (typeof x === 'number') return Math.floor(x / 1e9);
  if (typeof x !== 'string') return NaN;
  if (/^\d+$/.test(x)) return x.length > 9 ? Number(x.slice(0, -9)) : 0;
  const m = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})/.exec(x);
  return m ? Date.parse(m[1] + 'Z') / 1000 : NaN;
}

/**
 * Parse Databento's JSON-lines OHLCV output into column arrays (time in UTC seconds).
 * One record per line: {"hd":{"ts_event":...},"open":...,"high":...,"low":...,"close":...,"volume":...}
 */
export function parseOhlcvJson(text) {
  const rows = [];
  let skipped = 0;
  for (const line of String(text).split('\n')) {
    const s = line.trim();
    if (!s) continue;
    let r;
    try { r = JSON.parse(s); } catch { skipped++; continue; }
    const hd = r && typeof r.hd === 'object' && r.hd ? r.hd : r;
    const t = seconds(hd.ts_event), o = px(r.open), h = px(r.high), l = px(r.low), c = px(r.close), v = num(r.volume);
    if (![t, o, h, l, c].every(Number.isFinite) || o <= 0 || c <= 0) { skipped++; continue; }
    rows.push([t, o, Math.max(h, o, c), Math.min(l, o, c), c, Number.isFinite(v) && v >= 0 ? v : 0]);
  }
  rows.sort((a, b) => a[0] - b[0]);
  const bars = { t: [], o: [], h: [], l: [], c: [], v: [] };
  for (let i = 0; i < rows.length; i++) {
    if (i + 1 < rows.length && rows[i + 1][0] === rows[i][0]) continue; // same minute twice: keep the later record
    const [t, o, h, l, c, v] = rows[i];
    bars.t.push(t); bars.o.push(o); bars.h.push(h); bars.l.push(l); bars.c.push(c); bars.v.push(v);
  }
  return { bars, skipped };
}

/** A message the trader can act on, for an error status from Databento. */
export function upstreamError(status, detail) {
  const d = typeof detail === 'string' ? detail.trim().slice(0, 200) : '';
  const tail = d ? `: ${d}` : '.';
  switch (status) {
    case 400: return { status: 400, error: `Databento rejected the request${tail}` };
    case 401: return { status: 401, error: "Databento didn't accept that API key. Check it on the API keys page of your Databento account." };
    case 402: return { status: 402, error: 'Databento needs payment details or more credit on the account before it sends data.' };
    case 403: return { status: 403, error: "That Databento key doesn't have access to CME futures data (GLBX.MDP3)." };
    case 404: return { status: 404, error: `Databento has no data for that request${tail}` };
    case 422: return { status: 422, error: `Databento can't provide that range${tail}` };
    case 429: return { status: 429, error: 'Databento is limiting requests right now. Try again in a few seconds.' };
    default: return { status: 502, error: `Databento returned an error (${status})${d ? ': ' + d : ''}. Try again in a moment.` };
  }
}
