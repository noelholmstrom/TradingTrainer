// A stand-in for Databento's historical API, for testing the real-data flow without a key.
//   node tests/mock-databento.mjs [port]      (default 4010)
// Then start the app with DATABENTO_BASE_URL=http://localhost:4010.
// Keys must look like Databento keys; any key containing "bad" is rejected with 401.
import http from 'node:http';
import E from '../src/lib/engine.js';

const PORT = Number(process.argv[2] || process.env.PORT || 4010);
let requests = 0;

function hash(s) { let h = 2166136261; for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return h >>> 0; }
function rng(seed) { return () => { seed = (seed + 0x6D2B79F5) >>> 0; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const iso = sec => new Date(sec * 1000).toISOString().replace('.000Z', '.000000000Z');
const px = x => (Math.round(x * 4) / 4).toFixed(9);

function bars(startIso, endIso) {
  const out = [];
  const start = Math.ceil(Date.parse(startIso) / 60000) * 60, end = Date.parse(endIso) / 1000;
  let day = null, r, price;
  for (let t = start; t < end; t += 60) {
    const d = E.sessionDateOf(t), m = E.etMinuteOfDay(t);
    if (!E.isTradingDay(d) || (m >= 1020 && m < 1080)) continue; // closed days and the 17:00-18:00 halt
    if (d !== day) { day = d; r = rng(hash(d)); price = 15000 + (hash(d) % 4000); }
    const o = price, c = o + (r() - 0.5) * 12;
    const h = Math.max(o, c) + r() * 4, l = Math.min(o, c) - r() * 4;
    price = c;
    out.push(JSON.stringify({ hd: { ts_event: iso(t), rtype: 33, publisher_id: 1, instrument_id: 42140878 }, open: px(o), high: px(h), low: px(l), close: px(c), volume: String(50 + Math.floor(r() * 900)) }));
  }
  return out.join('\n') + (out.length ? '\n' : '');
}

const server = http.createServer((req, res) => {
  const send = (status, body, type) => { res.writeHead(status, { 'content-type': type || 'application/json' }); res.end(body); };
  if (req.method === 'GET' && req.url === '/stats') return send(200, JSON.stringify({ requests }));
  if (req.method !== 'POST' || req.url !== '/v0/timeseries.get_range') return send(404, JSON.stringify({ detail: 'Not found' }));
  let raw = '';
  req.on('data', c => { raw += c; });
  req.on('end', () => {
    requests++;
    const auth = req.headers.authorization || '';
    const key = auth.startsWith('Basic ') ? Buffer.from(auth.slice(6), 'base64').toString().replace(/:$/, '') : '';
    if (!/^db-[A-Za-z0-9]{16,64}$/.test(key) || key.includes('bad')) return send(401, JSON.stringify({ detail: 'Not authenticated' }));
    const f = new URLSearchParams(raw);
    const want = { dataset: 'GLBX.MDP3', schema: 'ohlcv-1m', stype_in: 'continuous', encoding: 'json', pretty_px: 'true', pretty_ts: 'true' };
    for (const [k, v] of Object.entries(want)) if (f.get(k) !== v) return send(400, JSON.stringify({ detail: `bad ${k}: ${f.get(k)}` }));
    if (!['NQ.v.0', 'MNQ.v.0'].includes(f.get('symbols'))) return send(400, JSON.stringify({ detail: 'bad symbols' }));
    const start = f.get('start'), end = f.get('end');
    if (!start || !end || isNaN(Date.parse(start)) || isNaN(Date.parse(end))) return send(400, JSON.stringify({ detail: 'bad range' }));
    send(200, bars(start, end), 'application/json');
  });
});
server.listen(PORT, () => console.log(`mock Databento on http://localhost:${PORT}`));
