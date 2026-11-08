/* TradingTrainer trainer: chart, replay, orders, drawings, panels and journal.
   mountTrainer(root, opts) runs inside a container that already holds TRAINER_MARKUP
   and returns { destroy } so React can unmount it cleanly.
   opts: { journal: JournalStore, coach: { enabled, request(payload) }, params, lesson, debug } */
import E from './engine.js';
import * as LWC from 'lightweight-charts';
import { lineChart, hourBars } from './charts.js';

export function mountTrainer(root, opts) {
  opts = opts || {};
  let destroyed = false;
  const cleanups = [];
  const on = (target, type, fn, o) => { target.addEventListener(type, fn, o); cleanups.push(() => target.removeEventListener(type, fn, o)); };
  const $ = (s, el) => (el || root).querySelector(s);
  const $$ = (s, el) => Array.from((el || root).querySelectorAll(s));
  const newUuid = () => (window.crypto && crypto.randomUUID) ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); });
  const MINUS = '−';
  const FONT_MONO = '"JetBrains Mono", ui-monospace, Menlo, Consolas, monospace';
  const FONT_UI = '"Barlow Semi Condensed", "Arial Narrow", system-ui, sans-serif';
  const CONTEXT_DAYS = 4;
  const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const pad2 = n => String(n).padStart(2, '0');
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

  // ------------------------------------------------------------ formatting
  const money = x => Math.abs(x).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  function fmtPx(x) { return x == null || !isFinite(x) ? '—' : x.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function fmtUsd(x) { if (x == null || !isFinite(x)) return '—'; return (x > 0.004 ? '+' : x < -0.004 ? MINUS : '') + '$' + money(x); }
  function fmtUsdPlain(x) { return x == null || !isFinite(x) ? '—' : (x < -0.004 ? MINUS : '') + '$' + money(x); }
  function fmtPts(x) { if (x == null || !isFinite(x)) return '—'; return (x > 0 ? '+' : x < 0 ? MINUS : '') + Math.abs(x).toFixed(2); }
  function fmtR(x) { if (x == null || !isFinite(x)) return '—'; return (x > 0.004 ? '+' : x < -0.004 ? MINUS : '') + Math.abs(x).toFixed(2) + 'R'; }
  function fmtPct(x) { return x == null || !isFinite(x) ? '—' : Math.round(x * 100) + '%'; }
  function fmtPF(x) { return x == null ? '—' : x === Infinity ? '∞' : x.toFixed(2); }
  function fmtNum(x, d) { return x == null || !isFinite(x) ? '—' : x.toFixed(d); }
  const signCls = x => x > 0.004 ? 'pos-txt' : x < -0.004 ? 'neg-txt' : '';
  function esc(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  function etHM(utc) { const d = new Date(E.toET(utc) * 1000); return pad2(d.getUTCHours()) + ':' + pad2(d.getUTCMinutes()); }
  function dayLabel(d) { const dt = new Date(E.dateToMs(d)); return `${WD[dt.getUTCDay()]} ${dt.getUTCDate()} ${MON[dt.getUTCMonth()]} ${dt.getUTCFullYear()}`; }
  function wallParts(t) { const d = new Date(t * 1000); return { y: d.getUTCFullYear(), mo: d.getUTCMonth(), d: d.getUTCDate(), wd: d.getUTCDay(), h: d.getUTCHours(), mi: d.getUTCMinutes() }; }
  const sessionMinute = utc => { const m = E.etMinuteOfDay(utc); return m >= 1080 ? m - 1080 : m + 360; };

  // --------------------------------------------------------------- storage
  const store = {
    get(k, d) { try { const v = localStorage.getItem('tt.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('tt.' + k, JSON.stringify(v)); } catch (e) { /* storage unavailable here */ } }
  };
  const IDB = {
    open() {
      return new Promise((res, rej) => {
        try {
          const r = indexedDB.open('tradingtrainer', 1);
          r.onupgradeneeded = () => r.result.createObjectStore('kv');
          r.onsuccess = () => res(r.result);
          r.onerror = () => rej(r.error);
        } catch (e) { rej(e); }
      });
    },
    timeout(p) { return Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 4000))]); },
    async put(k, v) {
      try {
        const db = await this.timeout(this.open());
        await this.timeout(new Promise((res, rej) => { const tx = db.transaction('kv', 'readwrite'); tx.objectStore('kv').put(v, k); tx.oncomplete = res; tx.onerror = () => rej(tx.error); }));
        return true;
      } catch (e) { return false; }
    },
    async get(k) {
      try {
        const db = await this.timeout(this.open());
        return await this.timeout(new Promise((res, rej) => { const rq = db.transaction('kv').objectStore('kv').get(k); rq.onsuccess = () => res(rq.result); rq.onerror = () => rej(rq.error); }));
      } catch (e) { return undefined; }
    }
  };

  // -------------------------------------------------------------- settings
  const DEFAULTS = {
    inst: 'MNQ', tf: 1, start: 570, speed: 5, blind: true, magnet: true, dataset: 'sample', csvTz: 'utc',
    type: 'market', qty: 1, slOn: true, sl: 20, tpOn: true, tp: 40,
    ind: {
      ema: [{ on: true, len: 9 }, { on: true, len: 21 }, { on: true, len: 50 }, { on: false, len: 200 }],
      vwap: { on: true, anchor: 'eth' }, bb: { on: false, len: 20, mult: 2 }, vol: { on: true },
      rsi: { on: true, len: 14 }, macd: { on: true, fast: 12, slow: 26, signal: 9 }
    },
    commission: { MNQ: 0.5, NQ: 2 }, slippage: 1, limitThrough: false, pauseOnFill: true, balance: 50000
  };
  function merge(a, b) {
    if (Array.isArray(a)) return Array.isArray(b) && b.length === a.length ? a.map((x, i) => merge(x, b[i])) : a;
    if (a && typeof a === 'object') { const o = {}; for (const k of Object.keys(a)) o[k] = b && typeof b === 'object' && k in b ? merge(a[k], b[k]) : a[k]; return o; }
    return b === undefined || b === null || typeof b !== typeof a ? a : b;
  }
  let S = merge(DEFAULTS, store.get('settings', {}));
  const saveSettings = () => store.set('settings', S);
  const instSpec = () => Object.assign({}, E.INSTRUMENTS[S.inst], { commission: S.commission[S.inst] });

  // ------------------------------------------------------------------ state
  const st = {
    sample: null, csv: null, ds: null, dayIndex: new Map(),
    dayIdx: -1, rep: null, cursor: -1, playing: false, ended: true, blindActive: false,
    agg: null, iv: null, broker: null, sessionId: null, startedAt: 0,
    hoverIdx: null, drawings: [], selected: null, tool: 'cursor', creating: null, drag: null, pickPrice: false,
    ticketPrice: null, lastTradeId: null, openRows: new Set(), tab: 'orders', lastPt: null
  };
  const tfSec = () => Math.max(S.tf * 60, st.rep ? st.rep.baseSec : 60);

  // ---------------------------------------------------------------- colours
  let C = {};
  function tok(n) { return getComputedStyle(document.documentElement).getPropertyValue(n).trim(); }
  function readColors() {
    C = {
      bg: tok('--surface'), raised: tok('--raised'), text: tok('--text-2'), textMain: tok('--text'), muted: tok('--muted'),
      line: tok('--line'), strong: tok('--line-strong'), grid: tok('--grid'), up: tok('--up'), down: tok('--down'),
      upSoft: tok('--up-soft'), downSoft: tok('--down-soft'), upVol: tok('--up-vol'), downVol: tok('--down-vol'),
      buy: tok('--buy'), accent: tok('--accent'), accentSoft: tok('--accent-soft'), good: tok('--good'), bad: tok('--bad'),
      s1: tok('--series-1'), s2: tok('--series-2'), s3: tok('--series-3'), s4: tok('--series-4'), sN: tok('--series-neutral')
    };
  }
  const emaColor = k => [C.s1, C.s2, C.s3, C.sN][k];

  // ================================================================== chart
  let chart, candle, markersApi, overlay, drawPrim;
  const ind = { vol: null, emas: [], vwap: null, bb: [], rsi: null, macdH: null, macdL: null, macdS: null };
  const isBlind = () => st.blindActive && !st.ended;

  function relDayLabel(t) {
    const p = wallParts(t);
    if (!isBlind()) return `${WD[p.wd]} ${p.d} ${MON[p.mo]}`;
    const ds = `${p.y}-${pad2(p.mo + 1)}-${pad2(p.d)}`;
    const i = st.dayIndex.get(ds);
    if (i == null) return '';
    const k = i - st.dayIdx;
    return k === 0 ? 'Replay day' : `Day ${MINUS}${-k}`;
  }
  function chartOptions() {
    return {
      autoSize: true,
      layout: {
        background: { type: LWC.ColorType.Solid, color: C.bg }, textColor: C.text, fontFamily: FONT_MONO, fontSize: 11,
        attributionLogo: true, panes: { separatorColor: C.line, separatorHoverColor: C.strong, enableResize: true }
      },
      grid: { vertLines: { color: C.grid }, horzLines: { color: C.grid } },
      crosshair: {
        mode: LWC.CrosshairMode.Normal,
        vertLine: { color: C.strong, labelBackgroundColor: C.strong, style: LWC.LineStyle.Dashed, width: 1 },
        horzLine: { color: C.strong, labelBackgroundColor: C.strong, style: LWC.LineStyle.Dashed, width: 1 }
      },
      rightPriceScale: { borderColor: C.line, scaleMargins: { top: 0.12, bottom: 0.1 } },
      timeScale: {
        borderColor: C.line, timeVisible: true, secondsVisible: false, rightOffset: 6, barSpacing: 7, minBarSpacing: 0.6,
        shiftVisibleRangeOnNewBar: true,
        tickMarkFormatter: (t, type) => {
          const p = wallParts(t);
          if (type === 3 || type === 4) return pad2(p.h) + ':' + pad2(p.mi);
          if (type === 2) return relDayLabel(t);
          if (type === 1) return isBlind() ? relDayLabel(t) : MON[p.mo];
          return isBlind() ? '' : String(p.y);
        }
      },
      localization: {
        priceFormatter: p => fmtPx(p),
        timeFormatter: t => {
          const p = wallParts(t), hm = pad2(p.h) + ':' + pad2(p.mi);
          return isBlind() ? hm : `${WD[p.wd]} ${p.d} ${MON[p.mo]} '${String(p.y).slice(2)}  ${hm}`;
        }
      }
    };
  }
  function candleOptions() {
    return {
      upColor: C.up, downColor: C.down, wickUpColor: C.up, wickDownColor: C.down, borderVisible: false,
      priceFormat: { type: 'price', precision: 2, minMove: 0.25 }, priceLineColor: C.strong
    };
  }
  function lineSeries(color, width, pane, extra) {
    return chart.addSeries(LWC.LineSeries, Object.assign({
      color, lineWidth: width, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false
    }, extra || {}), pane);
  }
  function buildIndicatorSeries() {
    const old = [ind.vol, ...ind.emas.map(e => e.s), ind.vwap, ...ind.bb, ind.rsi, ind.macdH, ind.macdL, ind.macdS].filter(Boolean);
    for (const s of old) chart.removeSeries(s);
    Object.assign(ind, { vol: null, emas: [], vwap: null, bb: [], rsi: null, macdH: null, macdL: null, macdS: null });
    const I = S.ind;
    if (I.vol.on) {
      ind.vol = chart.addSeries(LWC.HistogramSeries, { priceFormat: { type: 'volume' }, priceScaleId: 'vol', lastValueVisible: false, priceLineVisible: false }, 0);
      ind.vol.priceScale().applyOptions({ scaleMargins: { top: 0.84, bottom: 0 } });
    }
    if (I.bb.on) ind.bb = [lineSeries(C.sN, 1, 0), lineSeries(C.sN, 1, 0, { lineStyle: LWC.LineStyle.Dashed }), lineSeries(C.sN, 1, 0)];
    I.ema.forEach((e, k) => { if (e.on) ind.emas.push({ k, s: lineSeries(emaColor(k), 2, 0) }); });
    if (I.vwap.on) ind.vwap = lineSeries(C.s4, 2, 0);
    let pane = 1;
    if (I.rsi.on) {
      ind.rsi = lineSeries(C.s3, 2, pane, { lastValueVisible: true, priceFormat: { type: 'price', precision: 1, minMove: 0.1 } });
      for (const v of [70, 30]) ind.rsi.createPriceLine({ price: v, color: C.strong, lineStyle: LWC.LineStyle.Dashed, lineWidth: 1, axisLabelVisible: false });
      pane++;
    }
    if (I.macd.on) {
      ind.macdH = chart.addSeries(LWC.HistogramSeries, { priceLineVisible: false, lastValueVisible: false }, pane);
      ind.macdL = lineSeries(C.s1, 2, pane, { lastValueVisible: true });
      ind.macdS = lineSeries(C.s2, 2, pane);
      pane++;
    }
    let panes = chart.panes();
    for (let i = panes.length - 1; i >= pane; i--) chart.removePane(i);
    panes = chart.panes();
    panes.forEach((p, i) => p.setStretchFactor(i === 0 ? (panes.length > 2 ? 3.4 : 4) : 1));
  }

  function computeInd() {
    const a = st.agg, I = S.ind, c = a.c;
    st.iv = {
      emas: I.ema.map(e => e.on ? E.ema(c, e.len) : null),
      vwap: I.vwap.on ? E.vwap(a, I.vwap.anchor) : null,
      bb: I.bb.on ? E.bollinger(c, I.bb.len, I.bb.mult) : null,
      rsi: I.rsi.on ? E.rsi(c, I.rsi.len) : null,
      macd: I.macd.on ? E.macd(c, I.macd.fast, I.macd.slow, I.macd.signal) : null
    };
  }
  const pt = (t, v) => isFinite(v) ? { time: t, value: v } : { time: t };
  const seriesData = arr => st.agg.time.map((t, i) => pt(t, arr[i]));
  const histPt = (t, v) => isFinite(v) ? { time: t, value: v, color: v >= 0 ? C.upVol : C.downVol } : { time: t };

  function renderAll() {
    const a = st.agg;
    if (!a || !chart) return;
    computeInd();
    candle.setData(a.time.map((t, i) => ({ time: t, open: a.o[i], high: a.h[i], low: a.l[i], close: a.c[i] })));
    if (ind.vol) ind.vol.setData(a.time.map((t, i) => ({ time: t, value: a.v[i], color: a.c[i] >= a.o[i] ? C.upVol : C.downVol })));
    const iv = st.iv;
    ind.emas.forEach(({ k, s }) => s.setData(seriesData(iv.emas[k])));
    if (ind.vwap) ind.vwap.setData(seriesData(iv.vwap));
    if (ind.bb.length) { ind.bb[0].setData(seriesData(iv.bb.up)); ind.bb[1].setData(seriesData(iv.bb.mid)); ind.bb[2].setData(seriesData(iv.bb.lo)); }
    if (ind.rsi) ind.rsi.setData(seriesData(iv.rsi));
    if (ind.macdH) { ind.macdH.setData(a.time.map((t, i) => histPt(t, iv.macd.hist[i]))); ind.macdL.setData(seriesData(iv.macd.macd)); ind.macdS.setData(seriesData(iv.macd.signal)); }
    updateMarkers();
    requestOverlays();
    updateLegend();
  }
  function renderStep() {
    const a = st.agg, i = a.time.length - 1, t = a.time[i];
    computeInd();
    const iv = st.iv;
    candle.update({ time: t, open: a.o[i], high: a.h[i], low: a.l[i], close: a.c[i] });
    if (ind.vol) ind.vol.update({ time: t, value: a.v[i], color: a.c[i] >= a.o[i] ? C.upVol : C.downVol });
    ind.emas.forEach(({ k, s }) => s.update(pt(t, iv.emas[k][i])));
    if (ind.vwap) ind.vwap.update(pt(t, iv.vwap[i]));
    if (ind.bb.length) { ind.bb[0].update(pt(t, iv.bb.up[i])); ind.bb[1].update(pt(t, iv.bb.mid[i])); ind.bb[2].update(pt(t, iv.bb.lo[i])); }
    if (ind.rsi) ind.rsi.update(pt(t, iv.rsi[i]));
    if (ind.macdH) { ind.macdH.update(histPt(t, iv.macd.hist[i])); ind.macdL.update(pt(t, iv.macd.macd[i])); ind.macdS.update(pt(t, iv.macd.signal[i])); }
  }
  function rebuildAgg() { st.agg = E.aggregate(st.rep.bars, 0, st.cursor, tfSec()); }
  function fitRecent() {
    const n = st.agg.time.length;
    const w = ($('#chart').clientWidth || 900) - 70;
    const bars = clamp(Math.round(w / 7), 40, 400);
    chart.timeScale().setVisibleLogicalRange({ from: n - bars, to: n + 6 });
  }
  function updateMarkers() {
    if (!markersApi || !st.broker || !st.agg) return;
    const tf = st.agg.tfSec;
    const ms = st.broker.fills.map(f => ({
      time: E.bucketStart(f.time, tf), position: f.side === 1 ? 'belowBar' : 'aboveBar', color: f.side === 1 ? C.buy : C.down,
      shape: f.side === 1 ? 'arrowUp' : 'arrowDown', text: (f.side === 1 ? 'B' : 'S') + f.qty, size: 1
    })).sort((x, y) => x.time - y.time);
    markersApi.setMarkers(ms);
  }

  // ------------------------------------------------------------- legend
  function updateLegend() {
    const el = $('#legend'), a = st.agg;
    if (!a || !a.time.length || !st.iv) { el.innerHTML = ''; return; }
    let i = st.hoverIdx;
    if (i == null || i < 0 || i >= a.time.length) i = a.time.length - 1;
    const o = a.o[i], h = a.h[i], l = a.l[i], c = a.c[i], ref = i > 0 ? a.c[i - 1] : o, ch = c - ref, pct = ref ? ch / ref * 100 : 0;
    const tfLabel = S.tf >= 60 ? '1h' : S.tf + 'm';
    const kv = (k, v, cls, wrap) => `<span class="kv ${wrap || ''}">${k}<b class="${cls || ''}">${v}</b></span>`;
    const sw = col => `<span class="sw" style="background:${col}"></span>`;
    const sample = !st.ds || st.ds.kind === 'sample';
    let html = `<div class="row"><span class="sym">${S.inst}</span><span class="tag">${tfLabel} · CME</span>${sample ? '<span class="sample">Sample data · generated</span>' : ''}` +
      kv('O', fmtPx(o), '', 'ohl') + kv('H', fmtPx(h), '', 'ohl') + kv('L', fmtPx(l), '', 'ohl') + kv('C', fmtPx(c)) +
      `<span class="kv"><b class="${signCls(ch)}">${fmtPts(ch)} (${(ch >= 0 ? '+' : MINUS) + Math.abs(pct).toFixed(2)}%)</b></span></div>`;
    const iv = st.iv, parts = [];
    S.ind.ema.forEach((e, k) => { if (e.on && iv.emas[k]) parts.push(`<span class="kv">${sw(emaColor(k))}EMA ${e.len}<b>${fmtPx(iv.emas[k][i])}</b></span>`); });
    if (iv.vwap) parts.push(`<span class="kv">${sw(C.s4)}VWAP<b>${fmtPx(iv.vwap[i])}</b></span>`);
    if (iv.bb) parts.push(`<span class="kv">${sw(C.sN)}BB ${S.ind.bb.len}<b>${fmtPx(iv.bb.up[i])} / ${fmtPx(iv.bb.lo[i])}</b></span>`);
    if (iv.rsi) parts.push(`<span class="kv">${sw(C.s3)}RSI ${S.ind.rsi.len}<b>${fmtNum(iv.rsi[i], 1)}</b></span>`);
    if (iv.macd) parts.push(`<span class="kv">${sw(C.s1)}MACD<b>${fmtNum(iv.macd.macd[i], 2)}</b></span><span class="kv">${sw(C.s2)}Signal<b>${fmtNum(iv.macd.signal[i], 2)}</b></span>`);
    if (parts.length) html += `<div class="row ind-row">${parts.join('')}</div>`;
    el.innerHTML = html;
  }

  // ------------------------------------------------- coordinate helpers
  const priceToY = p => candle.priceToCoordinate(p);
  const yToPrice = y => candle.coordinateToPrice(y);
  const snapTick = p => E.roundTo(p, E.INSTRUMENTS[S.inst].tick);
  function timeToX(utc) {
    const a = st.agg;
    if (!a || !a.time.length) return null;
    const ct = E.toET(utc), T = a.time, n = T.length, tf = a.tfSec;
    let lg;
    if (ct >= T[n - 1]) lg = n - 1 + (ct - T[n - 1]) / tf;
    else if (ct <= T[0]) lg = (ct - T[0]) / tf;
    else {
      let lo = 0, hi = n - 1;
      while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (T[mid] <= ct) lo = mid; else hi = mid; }
      lg = lo + Math.min(1, (ct - T[lo]) / tf);
    }
    return chart.timeScale().logicalToCoordinate(lg);
  }
  function xToTime(x) {
    const a = st.agg, lg = chart.timeScale().coordinateToLogical(x);
    if (lg == null || !a.time.length) return null;
    const n = a.time.length, i = Math.round(lg);
    if (i < 0) return a.utc[0] + i * a.tfSec;
    if (i >= n) return a.utc[n - 1] + (i - (n - 1)) * a.tfSec;
    return a.utc[i];
  }
  function magnetPrice(p) {
    let price = yToPrice(p.y);
    if (price == null) return null;
    if (S.magnet && st.agg) {
      const lg = chart.timeScale().coordinateToLogical(p.x);
      const i = lg == null ? -1 : Math.round(lg);
      if (i >= 0 && i < st.agg.time.length) {
        let best = null, bd = 16;
        for (const v of [st.agg.o[i], st.agg.h[i], st.agg.l[i], st.agg.c[i]]) {
          const y = priceToY(v);
          if (y != null && Math.abs(y - p.y) < bd) { bd = Math.abs(y - p.y); best = v; }
        }
        if (best != null) price = best;
      }
    }
    return snapTick(price);
  }

  // ------------------------------------------------------ canvas helpers
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath(); ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  function hLine(ctx, x0, x1, y, color, width, dash) {
    ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = width; ctx.setLineDash(dash || []);
    const yy = Math.round(y) + (width % 2 ? 0.5 : 0);
    ctx.beginPath(); ctx.moveTo(x0, yy); ctx.lineTo(x1, yy); ctx.stroke(); ctx.restore();
  }
  function chip(ctx, x, y, text, fg, border, align) {
    ctx.font = `500 10.5px ${FONT_MONO}`;
    const w = ctx.measureText(text).width + 10, h = 16;
    const x0 = align === 'right' ? x - w : x;
    roundRect(ctx, x0, y - h / 2, w, h, 3);
    ctx.fillStyle = C.raised; ctx.fill();
    if (border) { ctx.strokeStyle = border; ctx.lineWidth = 1; ctx.stroke(); }
    ctx.fillStyle = fg; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    ctx.fillText(text, x0 + 5, y + 0.5);
    return { x0, x1: x0 + w, y0: y - h / 2, y1: y + h / 2 };
  }
  function handle(ctx, x, y) {
    ctx.beginPath(); ctx.arc(x, y, 4.5, 0, Math.PI * 2);
    ctx.fillStyle = C.bg; ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = C.accent; ctx.stroke();
  }

  // ------------------------------------------- orders / position overlay
  function overlayItems() {
    const b = st.broker, items = [];
    if (!b || !b.last) return items;
    const pv = b.inst.pointValue, D = overlay.drag;
    const dragged = (kind, id, price) => D && D.kind === kind && (id == null || D.id === id) ? D.price : price;
    for (const o of b.orders) {
      const price = dragged('order', o.id, o.price);
      items.push({ kind: 'order', id: o.id, price, color: o.side === 1 ? C.buy : C.down, dash: [6, 4], drag: true, close: true,
        text: `${o.side === 1 ? 'BUY' : 'SELL'} ${o.type === 'limit' ? 'LMT' : 'STP'} ${o.qty}`, value: fmtPx(price) });
      if (o.sl) {
        const sp = dragged('osl', o.id, o.price - o.side * o.sl);
        items.push({ kind: 'osl', id: o.id, price: sp, color: C.down, dash: [2, 4], drag: true, close: true, text: 'SL', value: Math.abs(price - sp).toFixed(2) + ' pts' });
      }
      if (o.tp) {
        const tp = dragged('otp', o.id, o.price + o.side * o.tp);
        items.push({ kind: 'otp', id: o.id, price: tp, color: C.up, dash: [2, 4], drag: true, close: true, text: 'TP', value: Math.abs(tp - price).toFixed(2) + ' pts' });
      }
    }
    const p = b.pos;
    if (p) {
      const u = (b.last.price - p.avg) * p.side * p.qty * pv;
      items.push({ kind: 'pos', price: p.avg, color: C.textMain, close: true, text: `${p.side === 1 ? 'LONG' : 'SHORT'} ${p.qty}`, value: fmtUsd(u), valueColor: u >= 0 ? C.good : C.bad });
      if (p.sl != null) {
        const sp = dragged('sl', null, p.sl);
        items.push({ kind: 'sl', price: sp, color: C.down, drag: true, close: true, text: 'SL', value: fmtUsd((sp - p.avg) * p.side * p.qty * pv) });
      }
      if (p.tp != null) {
        const tp = dragged('tp', null, p.tp);
        items.push({ kind: 'tp', price: tp, color: C.up, drag: true, close: true, text: 'TP', value: fmtUsd((tp - p.avg) * p.side * p.qty * pv) });
      }
    }
    return items;
  }
  class OverlayPrimitive {
    constructor() {
      this.hits = []; this.drag = null; this.req = null;
      this.views = [
        { zOrder: () => 'bottom', renderer: () => ({ draw: tg => this.drawZones(tg) }) },
        { zOrder: () => 'top', renderer: () => ({ draw: tg => this.drawLines(tg) }) }
      ];
    }
    attached(p) { this.req = p.requestUpdate; }
    detached() { this.req = null; }
    paneViews() { return this.views; }
    drawZones(tg) {
      const b = st.broker;
      if (!b || !b.pos || !st.agg) return;
      const p = b.pos;
      tg.useMediaCoordinateSpace(({ context: ctx, mediaSize }) => {
        const x0 = timeToX(p.openTime);
        const xl = chart.timeScale().logicalToCoordinate(st.agg.time.length - 1);
        if (x0 == null || xl == null) return;
        const x1 = Math.min(mediaSize.width, xl + 24);
        const yE = priceToY(p.avg);
        if (yE == null) return;
        if (p.tp != null) { const y = priceToY(p.tp); if (y != null) { ctx.fillStyle = C.upSoft; ctx.fillRect(x0, Math.min(y, yE), x1 - x0, Math.abs(y - yE)); } }
        if (p.sl != null) { const y = priceToY(p.sl); if (y != null) { ctx.fillStyle = C.downSoft; ctx.fillRect(x0, Math.min(y, yE), x1 - x0, Math.abs(y - yE)); } }
      });
    }
    drawLines(tg) {
      tg.useMediaCoordinateSpace(({ context: ctx, mediaSize }) => {
        const W = mediaSize.width, H = mediaSize.height;
        this.hits = [];
        const rows = overlayItems().map(it => ({ it, y: priceToY(it.price) })).filter(r => r.y != null && isFinite(r.y));
        rows.sort((a, b) => a.y - b.y);
        const placed = [];
        for (const { it, y } of rows) {
          hLine(ctx, 0, W, y, it.color, it.kind === 'pos' ? 1.5 : 1, it.dash);
          ctx.font = `600 11px ${FONT_UI}`;
          const tw = ctx.measureText(it.text).width;
          ctx.font = `500 10.5px ${FONT_MONO}`;
          const vw = ctx.measureText(it.value).width;
          const cw = it.close ? 17 : 0, h = 18, w = 7 + tw + 7 + vw + 7 + cw;
          let x1 = W - 10, x0 = x1 - w;
          for (let guard = 0; guard < 6; guard++) {
            const hit = placed.find(pl => Math.abs(pl.y - y) < h + 1 && x0 < pl.x1 + 4 && x1 > pl.x0 - 4);
            if (!hit) break;
            x1 = hit.x0 - 6; x0 = x1 - w;
          }
          const yy = clamp(y, h / 2, H - h / 2);
          roundRect(ctx, x0, yy - h / 2, w, h, 3);
          ctx.fillStyle = C.raised; ctx.fill(); ctx.strokeStyle = it.color; ctx.lineWidth = 1; ctx.stroke();
          ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
          ctx.font = `600 11px ${FONT_UI}`; ctx.fillStyle = it.kind === 'pos' ? C.textMain : it.color;
          ctx.fillText(it.text, x0 + 7, yy + 0.5);
          ctx.font = `500 10.5px ${FONT_MONO}`; ctx.fillStyle = it.valueColor || C.textMain;
          ctx.fillText(it.value, x0 + 7 + tw + 7, yy + 0.5);
          if (it.close) {
            const cx = x1 - cw;
            ctx.strokeStyle = C.line; ctx.beginPath(); ctx.moveTo(cx + 0.5, yy - h / 2 + 3); ctx.lineTo(cx + 0.5, yy + h / 2 - 3); ctx.stroke();
            ctx.strokeStyle = C.text; ctx.lineWidth = 1.3; ctx.beginPath();
            ctx.moveTo(cx + 5.5, yy - 3.5); ctx.lineTo(cx + 12.5, yy + 3.5); ctx.moveTo(cx + 12.5, yy - 3.5); ctx.lineTo(cx + 5.5, yy + 3.5); ctx.stroke();
          }
          placed.push({ x0, x1, y: yy });
          this.hits.push({ kind: it.kind, id: it.id, drag: !!it.drag, y, x0, x1, y0: yy - h / 2, y1: yy + h / 2, cx: it.close ? x1 - cw : null });
        }
      });
    }
    find(x, y) {
      for (const h of this.hits) if (h.cx != null && x >= h.cx && x <= h.x1 && y >= h.y0 && y <= h.y1) return Object.assign({ part: 'close' }, h);
      for (const h of this.hits) if (x >= h.x0 && x <= h.x1 && y >= h.y0 && y <= h.y1) return Object.assign({ part: 'label' }, h);
      let best = null, bd = 5;
      for (const h of this.hits) { const d = Math.abs(y - h.y); if (h.drag && d < bd) { bd = d; best = Object.assign({ part: 'line' }, h); } }
      return best;
    }
    hitTest(x, y) {
      const h = this.find(x, y);
      if (!h) return null;
      return { externalId: 'overlay', zOrder: 'top', cursorStyle: h.part === 'close' ? 'pointer' : h.drag ? 'ns-resize' : 'default' };
    }
  }

  // --------------------------------------------------------- drawings
  const FIB = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];
  const isPlan = d => d.type === 'long' || d.type === 'short';
  function planMetrics(d) {
    const spec = E.INSTRUMENTS[S.inst], pv = spec.pointValue * S.qty;
    const risk = Math.abs(d.entry - d.stop), reward = Math.abs(d.target - d.entry);
    return { risk, reward, rr: risk > 0 ? reward / risk : 0, riskUsd: risk * pv, rewardUsd: reward * pv };
  }
  function drawingGeom(d) {
    if (d.type === 'hline') return { y: priceToY(d.p1.p) };
    if (isPlan(d)) return { x1: timeToX(d.t1), x2: timeToX(d.t2), yE: priceToY(d.entry), yS: priceToY(d.stop), yT: priceToY(d.target) };
    return { x1: timeToX(d.p1.t), y1: priceToY(d.p1.p), x2: timeToX(d.p2.t), y2: priceToY(d.p2.p) };
  }
  const bad = (...v) => v.some(x => x == null || !isFinite(x));
  function renderDrawing(ctx, d, W, sel) {
    const g = drawingGeom(d), col = C.buy;
    ctx.save();
    if (d.type === 'hline') {
      if (bad(g.y)) { ctx.restore(); return; }
      hLine(ctx, 0, W, g.y, col, sel ? 2 : 1.5);
      chip(ctx, 8, g.y - 11, fmtPx(d.p1.p), C.textMain, col);
      if (sel) handle(ctx, W / 2, g.y);
    } else if (d.type === 'trend') {
      if (bad(g.x1, g.y1, g.x2, g.y2)) { ctx.restore(); return; }
      ctx.strokeStyle = col; ctx.lineWidth = sel ? 2.5 : 2; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(g.x1, g.y1); ctx.lineTo(g.x2, g.y2); ctx.stroke();
      if (sel) { handle(ctx, g.x1, g.y1); handle(ctx, g.x2, g.y2); }
    } else if (d.type === 'rect') {
      if (bad(g.x1, g.y1, g.x2, g.y2)) { ctx.restore(); return; }
      const x = Math.min(g.x1, g.x2), y = Math.min(g.y1, g.y2), w = Math.abs(g.x2 - g.x1), h = Math.abs(g.y2 - g.y1);
      ctx.globalAlpha = 0.13; ctx.fillStyle = col; ctx.fillRect(x, y, w, h);
      ctx.globalAlpha = 1; ctx.strokeStyle = col; ctx.lineWidth = sel ? 2 : 1.5; ctx.strokeRect(x + 0.5, y + 0.5, w, h);
      if (sel) { handle(ctx, g.x1, g.y1); handle(ctx, g.x2, g.y2); }
    } else if (d.type === 'fib') {
      if (bad(g.x1, g.y1, g.x2, g.y2)) { ctx.restore(); return; }
      const xa = Math.min(g.x1, g.x2), xb = Math.max(g.x1, g.x2, xa + 90);
      const lv = FIB.map(L => { const price = d.p2.p + (d.p1.p - d.p2.p) * L; return { L, price, y: priceToY(price) }; });
      const g5 = lv[3].y, g6 = lv[4].y;
      if (!bad(g5, g6)) { ctx.fillStyle = C.accentSoft; ctx.fillRect(xa, Math.min(g5, g6), xb - xa, Math.abs(g6 - g5)); }
      ctx.font = `500 10.5px ${FONT_MONO}`; ctx.textBaseline = 'bottom'; ctx.textAlign = 'left';
      for (const v of lv) {
        if (bad(v.y)) continue;
        const key = v.L === 0.5 || v.L === 0.618;
        hLine(ctx, xa, xb, v.y, key ? C.accent : C.text, 1);
        ctx.fillStyle = key ? C.accent : C.text;
        ctx.fillText(`${v.L} · ${fmtPx(v.price)}`, xa + 4, v.y - 2);
      }
      ctx.strokeStyle = C.text; ctx.globalAlpha = 0.6; ctx.setLineDash([3, 3]); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(g.x1, g.y1); ctx.lineTo(g.x2, g.y2); ctx.stroke();
      ctx.globalAlpha = 1; ctx.setLineDash([]);
      if (sel) { handle(ctx, g.x1, g.y1); handle(ctx, g.x2, g.y2); }
    } else if (isPlan(d)) {
      if (bad(g.x1, g.x2, g.yE, g.yS, g.yT)) { ctx.restore(); return; }
      const x = Math.min(g.x1, g.x2), w = Math.max(8, Math.abs(g.x2 - g.x1));
      ctx.globalAlpha = 0.17;
      ctx.fillStyle = C.up; ctx.fillRect(x, Math.min(g.yE, g.yT), w, Math.abs(g.yT - g.yE));
      ctx.fillStyle = C.down; ctx.fillRect(x, Math.min(g.yE, g.yS), w, Math.abs(g.yS - g.yE));
      ctx.globalAlpha = 1;
      hLine(ctx, x, x + w, g.yT, C.up, 1);
      hLine(ctx, x, x + w, g.yS, C.down, 1);
      hLine(ctx, x, x + w, g.yE, C.textMain, 1.5);
      const m = planMetrics(d), long = d.type === 'long';
      const tY = g.yT + (long ? 10 : -10), sY = g.yS + (long ? -10 : 10);
      chip(ctx, x + 4, tY, `Target ${fmtPx(d.target)} · ${m.reward.toFixed(2)} pts · ${fmtUsdPlain(m.rewardUsd)}`, C.good, C.up);
      chip(ctx, x + 4, sY, `Stop ${fmtPx(d.stop)} · ${m.risk.toFixed(2)} pts · ${fmtUsdPlain(m.riskUsd)}`, C.bad, C.down);
      chip(ctx, x + 4, g.yE + (long ? -10 : 10), `${long ? 'Long' : 'Short'} ${S.qty} ${S.inst} @ ${fmtPx(d.entry)} · R:R ${m.rr.toFixed(2)}`, C.textMain, C.strong);
      if (sel) { handle(ctx, x, g.yE); handle(ctx, x, g.yS); handle(ctx, x, g.yT); handle(ctx, x + w, g.yE); }
    }
    ctx.restore();
  }
  function distToSeg(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1, dy = y2 - y1, L = dx * dx + dy * dy;
    let t = L ? ((px - x1) * dx + (py - y1) * dy) / L : 0;
    t = clamp(t, 0, 1);
    return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
  }
  function hitDrawing(d, x, y) {
    const g = drawingGeom(d), near = (ax, ay) => ax != null && ay != null && Math.hypot(x - ax, y - ay) <= 8;
    if (d.type === 'hline') return !bad(g.y) && Math.abs(y - g.y) <= 6 ? { handle: null, cursor: 'ns-resize' } : null;
    if (isPlan(d)) {
      if (bad(g.x1, g.x2, g.yE, g.yS, g.yT)) return null;
      const x0 = Math.min(g.x1, g.x2), x1 = x0 + Math.max(8, Math.abs(g.x2 - g.x1));
      if (near(x0, g.yE)) return { handle: 'entry', cursor: 'move' };
      if (near(x0, g.yS)) return { handle: 'stop', cursor: 'ns-resize' };
      if (near(x0, g.yT)) return { handle: 'target', cursor: 'ns-resize' };
      if (near(x1, g.yE)) return { handle: 'right', cursor: 'ew-resize' };
      const top = Math.min(g.yS, g.yT), btm = Math.max(g.yS, g.yT);
      return x >= x0 && x <= x1 && y >= top && y <= btm ? { handle: null, cursor: 'move' } : null;
    }
    if (bad(g.x1, g.y1, g.x2, g.y2)) return null;
    if (near(g.x1, g.y1)) return { handle: 'p1', cursor: 'pointer' };
    if (near(g.x2, g.y2)) return { handle: 'p2', cursor: 'pointer' };
    if (d.type === 'trend') return distToSeg(x, y, g.x1, g.y1, g.x2, g.y2) <= 6 ? { handle: null, cursor: 'move' } : null;
    if (d.type === 'rect') {
      const x0 = Math.min(g.x1, g.x2), x1 = Math.max(g.x1, g.x2), y0 = Math.min(g.y1, g.y2), y1 = Math.max(g.y1, g.y2);
      return x >= x0 - 4 && x <= x1 + 4 && y >= y0 - 4 && y <= y1 + 4 ? { handle: null, cursor: 'move' } : null;
    }
    if (d.type === 'fib') {
      const xa = Math.min(g.x1, g.x2), xb = Math.max(g.x1, g.x2, xa + 90);
      return x >= xa && x <= xb && y >= Math.min(g.y1, g.y2) - 4 && y <= Math.max(g.y1, g.y2) + 4 ? { handle: null, cursor: 'move' } : null;
    }
    return null;
  }
  function drawingAt(x, y) {
    for (let k = st.drawings.length - 1; k >= 0; k--) {
      const h = hitDrawing(st.drawings[k], x, y);
      if (h) return Object.assign({ d: st.drawings[k] }, h);
    }
    return null;
  }
  class DrawingPrimitive {
    constructor() {
      this.req = null;
      this.views = [{ zOrder: () => 'top', renderer: () => ({ draw: tg => this.draw(tg) }) }];
    }
    attached(p) { this.req = p.requestUpdate; }
    detached() { this.req = null; }
    paneViews() { return this.views; }
    draw(tg) {
      if (!st.agg) return;
      tg.useMediaCoordinateSpace(({ context: ctx, mediaSize }) => {
        for (const d of st.drawings) renderDrawing(ctx, d, mediaSize.width, d.id === st.selected);
        if (st.creating) renderDrawing(ctx, st.creating.d, mediaSize.width, true);
      });
    }
    hitTest(x, y) {
      if (st.tool !== 'cursor') return { externalId: 'tool', zOrder: 'top', cursorStyle: 'crosshair' };
      const h = drawingAt(x, y);
      return h ? { externalId: 'drawing', zOrder: 'top', cursorStyle: h.cursor } : null;
    }
  }
  function requestOverlays() {
    if (overlay && overlay.req) overlay.req();
    if (drawPrim && drawPrim.req) drawPrim.req();
  }

  // ------------------------------------------------ chart interaction
  function localPt(e) {
    const r = $('#chart').getBoundingClientRect();
    const p = e.touches && e.touches.length ? e.touches[0] : e.changedTouches && e.changedTouches.length ? e.changedTouches[0] : e;
    return { x: p.clientX - r.left, y: p.clientY - r.top };
  }
  function inMain(p) {
    if (!chart) return false;
    const w = chart.timeScale().width(), h = chart.panes()[0].getHeight();
    return p.x >= 0 && p.x <= w && p.y >= 0 && p.y <= h;
  }
  function block(e) { e.stopPropagation(); if (e.cancelable) e.preventDefault(); }
  const newId = () => Math.random().toString(36).slice(2, 9);

  function onChartDown(e) {
    if (!st.agg || (e.type === 'mousedown' && e.button !== 0)) return;
    if (e.target && e.target.closest && e.target.closest('#drawActions, #dropHint')) return;
    const p = localPt(e);
    if (!inMain(p)) return;
    st.lastPt = p;
    if (st.pickPrice) {
      block(e);
      const price = yToPrice(p.y);
      if (price != null) { st.ticketPrice = snapTick(price); renderTicket(); }
      setPickPrice(false);
      return;
    }
    if (st.tool !== 'cursor') { block(e); creationDown(p); return; }
    const oh = overlay.find(p.x, p.y);
    if (oh) {
      block(e);
      if (oh.part === 'close') overlayClose(oh);
      else if (oh.drag) st.drag = { src: 'ovl', hit: oh, start: p, moved: false };
      return;
    }
    const dh = drawingAt(p.x, p.y);
    if (dh) {
      block(e);
      select(dh.d.id);
      st.drag = { src: 'draw', id: dh.d.id, handle: dh.handle, start: p, orig: JSON.parse(JSON.stringify(dh.d)), moved: false };
      return;
    }
    if (st.selected) select(null);
  }
  function onWindowMove(e) {
    if (!st.creating && !st.drag) return;
    const p = localPt(e);
    st.lastPt = p;
    if (st.creating) { creationMove(p); if (e.cancelable && e.type === 'touchmove') e.preventDefault(); return; }
    const D = st.drag;
    if (e.cancelable) e.preventDefault();
    if (Math.abs(p.x - D.start.x) + Math.abs(p.y - D.start.y) > 3) D.moved = true;
    if (!D.moved) return;
    if (D.src === 'ovl') {
      const price = yToPrice(p.y);
      if (price != null) { overlay.drag = { kind: D.hit.kind, id: D.hit.id, price: snapTick(price) }; requestOverlays(); }
    } else moveDrawing(D, p);
  }
  function onWindowUp() {
    if (st.creating) { creationUp(); return; }
    const D = st.drag;
    if (!D) return;
    st.drag = null;
    if (D.src === 'ovl') {
      const od = overlay.drag;
      overlay.drag = null;
      if (od && D.moved) commitOverlayDrag(od);
      requestOverlays();
    } else updateDrawActions();
  }
  function onChartHover(e) {
    if (st.creating && st.creating.phase === 'click') creationMove(localPt(e));
  }

  // creation
  function defaultPlanDist() {
    const a = st.agg, n = a.time.length;
    const at = E.atr(a.h.slice(-60), a.l.slice(-60), a.c.slice(-60), 14);
    const v = at[at.length - 1];
    return Math.max(2, snapTick(isFinite(v) ? v * 3 : 20));
  }
  function creationDown(p) {
    const t = xToTime(p.x), price = magnetPrice(p);
    if (t == null || price == null) return;
    const type = st.tool;
    if (type === 'hline') { addDrawing({ id: newId(), type, p1: { t, p: price } }); return; }
    if (type === 'long' || type === 'short') {
      const dist = defaultPlanDist(), s = type === 'long' ? 1 : -1;
      addDrawing({ id: newId(), type, t1: t, t2: t + st.agg.tfSec * 36, entry: price, stop: snapTick(price - s * dist), target: snapTick(price + s * 2 * dist) });
      return;
    }
    if (st.creating) { st.creating.d.p2 = { t, p: price }; commitCreating(); return; }
    st.creating = { d: { id: newId(), type, p1: { t, p: price }, p2: { t, p: price } }, down: p, phase: 'drag' };
    requestOverlays();
  }
  function creationMove(p) {
    const c = st.creating, t = xToTime(p.x), price = magnetPrice(p);
    if (t == null || price == null) return;
    c.d.p2 = { t, p: price };
    requestOverlays();
  }
  function creationUp() {
    const c = st.creating;
    if (c.phase !== 'drag') return;
    const p = st.lastPt || c.down;
    if (Math.hypot(p.x - c.down.x, p.y - c.down.y) > 6) commitCreating();
    else c.phase = 'click';
  }
  function commitCreating() {
    const d = st.creating.d;
    st.creating = null;
    addDrawing(d);
  }
  function addDrawing(d) {
    st.drawings.push(d);
    setTool('cursor');
    select(d.id);
  }
  function moveDrawing(D, p) {
    const d = st.drawings.find(x => x.id === D.id);
    if (!d) return;
    const o = D.orig, h = D.handle;
    const t = xToTime(p.x), price = magnetPrice(p);
    const p0 = yToPrice(D.start.y), p1 = yToPrice(p.y);
    if (t == null || price == null || p0 == null || p1 == null) return;
    const dp = snapTick(p1 - p0);
    const l0 = chart.timeScale().coordinateToLogical(D.start.x), l1 = chart.timeScale().coordinateToLogical(p.x);
    const dt = (l0 != null && l1 != null ? Math.round(l1 - l0) : 0) * st.agg.tfSec;
    if (d.type === 'hline') d.p1.p = snapTick(o.p1.p + dp);
    else if (isPlan(d)) {
      const s = d.type === 'long' ? 1 : -1, tick = E.INSTRUMENTS[S.inst].tick;
      if (h === 'entry') { d.entry = price; d.t1 = t; if ((d.entry - d.stop) * s <= 0) d.stop = snapTick(d.entry - s * tick); if ((d.target - d.entry) * s <= 0) d.target = snapTick(d.entry + s * tick); if (d.t2 <= d.t1) d.t2 = d.t1 + st.agg.tfSec * 10; }
      else if (h === 'stop') d.stop = (d.entry - price) * s > 0 ? price : snapTick(d.entry - s * tick);
      else if (h === 'target') d.target = (price - d.entry) * s > 0 ? price : snapTick(d.entry + s * tick);
      else if (h === 'right') d.t2 = Math.max(t, d.t1 + st.agg.tfSec * 2);
      else { d.t1 = o.t1 + dt; d.t2 = o.t2 + dt; d.entry = snapTick(o.entry + dp); d.stop = snapTick(o.stop + dp); d.target = snapTick(o.target + dp); }
    } else {
      if (h === 'p1') d.p1 = { t, p: price };
      else if (h === 'p2') d.p2 = { t, p: price };
      else { d.p1 = { t: o.p1.t + dt, p: snapTick(o.p1.p + dp) }; d.p2 = { t: o.p2.t + dt, p: snapTick(o.p2.p + dp) }; }
    }
    requestOverlays();
    updateDrawActions();
  }
  function select(id) {
    st.selected = id;
    requestOverlays();
    updateDrawActions();
  }
  function deleteSelected() {
    if (!st.selected) return;
    st.drawings = st.drawings.filter(d => d.id !== st.selected);
    select(null);
  }
  function updateDrawActions() {
    const box = $('#drawActions');
    const d = st.drawings.find(x => x.id === st.selected);
    if (!d || !st.agg || st.drag) { box.hidden = true; return; }
    const g = drawingGeom(d);
    let xr, yt;
    if (d.type === 'hline') { xr = chart.timeScale().width() / 2 + 40; yt = g.y; }
    else if (isPlan(d)) { xr = Math.max(g.x1, g.x2); yt = Math.min(g.yE, g.yS, g.yT); }
    else { xr = Math.max(g.x1, g.x2); yt = Math.min(g.y1, g.y2); }
    if (bad(xr, yt)) { box.hidden = true; return; }
    box.innerHTML = (isPlan(d) ? '<button type="button" class="btn primary" data-act="order">Place this order</button>' : '') +
      '<button type="button" class="btn" data-act="delete">Delete</button>';
    box.hidden = false;
    const wrap = $('#chartWrap');
    const bw = box.offsetWidth, bh = box.offsetHeight;
    const W = chart.timeScale().width(), H = chart.panes()[0].getHeight();
    box.style.left = clamp(xr + 8, 4, Math.max(4, W - bw - 4)) + 'px';
    box.style.top = clamp(yt - bh - 8, 4, Math.max(4, Math.min(H, wrap.clientHeight) - bh - 4)) + 'px';
  }
  function setTool(t) {
    st.tool = t;
    if (t !== 'cursor') { setPickPrice(false); select(null); }
    st.creating = null;
    $$('#tools [data-tool]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.tool === t)));
    requestOverlays();
  }

  // overlay actions
  function overlayClose(h) {
    const b = st.broker;
    if (!b) return;
    if (h.kind === 'order') { E.bCancel(b, h.id); toast('Order cancelled.'); }
    else if (h.kind === 'osl' || h.kind === 'otp') { const o = b.orders.find(x => x.id === h.id); if (o) o[h.kind === 'osl' ? 'sl' : 'tp'] = null; }
    else if (h.kind === 'pos') { const f = E.bFlatten(b, 'Manual'); if (f) onFills([f]); }
    else if (h.kind === 'sl') E.bSetBrackets(b, null, undefined);
    else if (h.kind === 'tp') E.bSetBrackets(b, undefined, null);
    afterBrokerChange();
  }
  function commitOverlayDrag(od) {
    const b = st.broker;
    if (!b) return;
    if (od.kind === 'order') {
      const r = E.bModify(b, od.id, od.price);
      if (!r.ok) toast(r.error, 'bad');
      else if (r.fill) onFills([r.fill]);
    } else if (od.kind === 'sl' || od.kind === 'tp') {
      const r = od.kind === 'sl' ? E.bSetBrackets(b, od.price, undefined) : E.bSetBrackets(b, undefined, od.price);
      if (!r.ok) toast(r.error, 'bad');
    } else {
      const o = b.orders.find(x => x.id === od.id);
      if (o) {
        const dist = (o.price - od.price) * o.side;
        if (od.kind === 'osl') { if (dist > 0) o.sl = dist; else toast('A stop has to sit on the losing side of the entry price.', 'bad'); }
        else { if (-dist > 0) o.tp = -dist; else toast('A target has to sit on the winning side of the entry price.', 'bad'); }
      }
    }
    afterBrokerChange();
  }

  // ================================================================ replay
  function setDataset(kind) {
    const ds = kind === 'csv' && st.csv ? st.csv.ds : st.sample;
    st.ds = ds;
    st.dayIndex = new Map(ds.days.map((d, i) => [d, i]));
    S.dataset = ds.kind;
    saveSettings();
    renderDataChip();
    const di = $('#dayInput');
    di.min = ds.days[0];
    di.max = ds.days[ds.days.length - 1];
  }
  function closeOutCurrent() {
    const b = st.broker;
    if (!b || st.ended) return;
    if (b.pos || b.orders.length) {
      const f = E.bEndSession(b);
      if (f) toast('Position closed when you left the session.', 'warn');
    }
    st.ended = true;
    if (b.trades.length) {
      for (const t of b.trades) if (!t.after) t.after = E.afterExitNote(t, st.rep.bars, st.rep.sessionEnd - 1, st.rep.baseSec);
      saveJournal(true);
    }
  }
  function loadSession(dayIdx, blind) {
    if (!st.ds || dayIdx < 0 || dayIdx >= st.ds.days.length) return;
    pause();
    closeOutCurrent();
    st.dayIdx = dayIdx;
    st.rep = E.assembleReplay(st.ds, dayIdx, CONTEXT_DAYS);
    if (S.tf * 60 < st.rep.baseSec) {
      S.tf = st.rep.baseSec / 60;
      $$('#tfGroup [data-tf]').forEach(x => x.setAttribute('aria-pressed', String(+x.dataset.tf === S.tf)));
    }
    const startIdx = E.indexAtEtMinute(st.rep, S.start);
    st.cursor = Math.max(0, startIdx - 1);
    st.ended = false;
    st.blindActive = !!blind;
    st.broker = E.createBroker(instSpec(), { slippageTicks: S.slippage, limitThrough: S.limitThrough, conservative: true });
    st.broker.onOpen = onPositionOpen;
    st.broker.onClose = onTradeClosed;
    const B = st.rep.bars;
    E.bMark(st.broker, B.c[st.cursor], B.t[st.cursor], st.cursor);
    st.sessionId = newUuid();
    st.startedAt = Date.now();
    st.openRows.clear();
    st.lastTradeId = null;
    st.drawings = []; st.selected = null; st.creating = null; st.drag = null;
    st.ticketPrice = null;
    st.hoverIdx = null;
    rebuildAgg();
    renderAll();
    fitRecent();
    $('#chartEmpty').hidden = true;
    renderSessionControls();
    renderStripStatic();
    renderEverything();
  }
  function step(render) {
    if (!st.rep || st.ended) return false;
    if (st.cursor >= st.rep.sessionEnd - 1) { endSession(); return false; }
    st.cursor++;
    const i = st.cursor, B = st.rep.bars;
    E.aggPush(st.agg, B, i);
    const fills = E.bOnBar(st.broker, { t: B.t[i], o: B.o[i], h: B.h[i], l: B.l[i], c: B.c[i], idx: i });
    if (render !== false) renderStep();
    if (fills.length) onFills(fills);
    if (st.cursor >= st.rep.sessionEnd - 1) endSession();
    else scheduleUI();
    return fills.length > 0;
  }
  let raf = 0, lastTs = 0, carry = 0;
  function loop(ts) {
    if (!st.playing) return;
    const dt = lastTs ? Math.min(0.25, (ts - lastTs) / 1000) : 0;
    lastTs = ts;
    carry += dt * S.speed;
    let n = 0;
    while (carry >= 1 && st.playing && n < 40) {
      carry -= 1; n++;
      if (step() && S.pauseOnFill) { pause(); toast('Paused: an order filled.', 'warn'); break; }
    }
    if (st.playing) raf = requestAnimationFrame(loop);
  }
  function play() {
    if (!st.rep || st.ended || st.playing) return;
    st.playing = true; lastTs = 0; carry = 1;
    raf = requestAnimationFrame(loop);
    renderTransport();
  }
  function pause() {
    if (!st.playing) return;
    st.playing = false;
    cancelAnimationFrame(raf);
    renderTransport();
  }
  const togglePlay = () => st.playing ? pause() : play();
  function skipTo(etMin) {
    if (!st.rep || st.ended) return;
    const target = E.indexAtEtMinute(st.rep, etMin);
    if (target <= st.cursor + 1) { toast('That time has already passed in this session.'); return; }
    pause();
    let stopped = false;
    while (st.cursor < target - 1 && !st.ended) {
      if (step(false) && S.pauseOnFill) { stopped = true; break; }
    }
    if (!st.ended) { renderAll(); scheduleUI(); }
    if (stopped) toast('Stopped early: an order filled.', 'warn');
  }
  function endSession() {
    if (!st.rep || st.ended) return;
    pause();
    const b = st.broker;
    const f = E.bEndSession(b);
    if (f) onFills([f]);
    st.ended = true;
    if (st.cursor < st.rep.sessionEnd - 1) {
      for (let i = st.cursor + 1; i < st.rep.sessionEnd; i++) E.aggPush(st.agg, st.rep.bars, i);
      st.cursor = st.rep.sessionEnd - 1;
      b.last = { price: st.rep.bars.c[st.cursor], time: st.rep.bars.t[st.cursor], idx: st.cursor };
    }
    for (const t of b.trades) t.after = E.afterExitNote(t, st.rep.bars, st.rep.sessionEnd - 1, st.rep.baseSec);
    chart.applyOptions(chartOptions());
    renderAll();
    renderSessionControls();
    renderEverything();
    saveJournal(true);
    showSummary();
  }

  // broker hooks
  function onPositionOpen(p) {
    const f = st.broker.fills[st.broker.fills.length - 1];
    const intrabar = !!f && f.reason !== 'Market' && f.idx === st.cursor && p.openIdx > 0;
    const idx = Math.max(0, intrabar ? p.openIdx - 1 : p.openIdx);
    try {
      p.ctx = E.entryContext(st.rep.bars, idx, st.rep.baseSec);
      p.ctx.price = p.avg;
    } catch (e) { p.ctx = null; }
  }
  function onTradeClosed(t) {
    const tr = st.broker.trades, prev = tr.length > 1 ? tr[tr.length - 2] : null;
    t.notes = E.coachNotes(t, prev, Math.round(st.rep.baseSec / 60));
    st.lastTradeId = t.id;
    saveJournal(false);
  }
  function onFills(fills) {
    for (const f of fills) {
      if (f.closed) {
        const t = f.closed;
        toast(`${t.side === 1 ? 'Long' : 'Short'} closed · ${t.reason}: ${fmtUsd(t.net)}${t.r != null ? ' (' + fmtR(t.r) + ')' : ''}`, t.net > 0 ? 'good' : 'bad');
      }
      if (f.opened || !f.closed) toast(`Filled: ${f.side === 1 ? 'bought' : 'sold'} ${f.qty} ${S.inst} @ ${fmtPx(f.price)} (${f.reason.toLowerCase()})`);
    }
    updateMarkers();
    afterBrokerChange();
  }
  function afterBrokerChange() {
    requestOverlays();
    renderTicket();
    renderAccount();
    renderCoach();
    renderPanels();
    renderStripMarks();
  }

  // ============================================================== UI render
  let uiQueued = false;
  function scheduleUI() {
    if (uiQueued) return;
    uiQueued = true;
    requestAnimationFrame(() => {
      uiQueued = false;
      if (destroyed) return;
      renderClock(); renderStrip(); renderTicket(); renderAccount(); updateLegend();
      if (st.selected) updateDrawActions();
    });
  }
  function renderEverything() {
    renderTransport(); renderClock(); renderStrip(); renderStripMarks(); renderTicket(); renderAccount(); renderCoach(); renderPanels(); updateLegend();
  }
  function renderDataChip() {
    const csv = st.ds && st.ds.kind === 'csv';
    $('#dataLabel').textContent = csv ? st.ds.label : 'Sample data';
    $('#dataDot').classList.toggle('real', csv);
    updateLegend();
  }
  function renderSessionControls() {
    const blind = isBlind();
    const di = $('#dayInput');
    di.hidden = blind;
    $('#hiddenDay').hidden = !blind;
    if (!blind && st.rep) di.value = st.rep.date;
    $('#chkBlind').checked = S.blind;
    $('#startSel').value = String(S.start);
    $('#speedSel').value = String(S.speed);
  }
  function renderTransport() {
    const playing = st.playing, can = !!st.rep && !st.ended;
    $('#playText').textContent = playing ? 'Pause' : 'Play';
    $('#btnPlay').setAttribute('aria-label', playing ? 'Pause' : 'Play');
    $('#playIcon').innerHTML = playing ? '<rect x="3.5" y="2.5" width="3" height="11" rx=".8"/><rect x="9.5" y="2.5" width="3" height="11" rx=".8"/>' : '<path d="M4 2.5l9 5.5-9 5.5z"/>';
    $('#btnPlay').disabled = !can;
    $('#btnStep').disabled = !can || playing;
    $('#btnEnd').disabled = !can;
  }
  function curTime() { return st.rep ? st.rep.bars.t[st.cursor] + st.rep.baseSec : null; }
  function renderClock() {
    if (!st.rep) return;
    $('#clockTime').textContent = etHM(curTime());
    const dateTxt = isBlind() ? 'Hidden day' : dayLabel(st.rep.date);
    $('#clockDate').textContent = (st.ended ? 'Ended · ' : '') + dateTxt + ' · NY';
  }
  const SEGS = [
    { a: 0, b: 540, name: 'Asia' }, { a: 540, b: 870, name: 'London' }, { a: 870, b: 930, name: '', title: 'Pre-market' },
    { a: 930, b: 1080, name: 'NY AM', rth: true }, { a: 1080, b: 1170, name: 'Lunch', rth: true },
    { a: 1170, b: 1320, name: 'NY PM', rth: true }, { a: 1320, b: 1380, name: '', title: 'After the close' }
  ];
  function renderStripStatic() {
    const track = $('#stripTrack'), labels = $('#stripLabels'), w = $('#strip').clientWidth || 300;
    track.innerHTML = SEGS.map(s => `<div class="strip-seg${s.rth ? ' rth' : ''}" style="width:${(s.b - s.a) / 13.8}%" title="${esc(s.name || s.title)}"></div>`).join('');
    labels.innerHTML = SEGS.filter(s => s.name && (s.b - s.a) / 1380 * w > s.name.length * 6.4 + 6)
      .map(s => `<span style="left:${(s.a + s.b) / 2 / 13.8}%">${s.name}</span>`).join('');
  }
  function stripFrac() {
    if (!st.rep || st.cursor < st.rep.sessionStart) return 0;
    return clamp(sessionMinute(curTime() - 1) / 1380 + 1 / 1380, 0, 1);
  }
  function renderStrip() {
    const f = stripFrac();
    $('#stripFill').style.width = (f * 100) + '%';
    $('#stripCursor').style.left = (f * 100) + '%';
    $('#strip').setAttribute('aria-valuenow', String(Math.round(f * 1380)));
    $('#strip').setAttribute('aria-valuetext', st.rep ? etHM(curTime()) + ' New York time' : '');
  }
  function renderStripMarks() {
    const el = $('#stripMarks'), b = st.broker;
    if (!b || !st.rep) { el.innerHTML = ''; return; }
    const t0 = st.rep.bars.t[st.rep.sessionStart];
    el.innerHTML = b.fills.filter(f => f.time >= t0).map(f =>
      `<span class="strip-mark" style="left:${sessionMinute(f.time) / 13.8}%;background:${f.side === 1 ? 'var(--buy)' : 'var(--down)'}"></span>`).join('');
  }

  // ticket
  function lastPrice() { return st.broker && st.broker.last ? st.broker.last.price : null; }
  function renderTicket() {
    const spec = E.INSTRUMENTS[S.inst], last = lastPrice(), active = !!st.broker && !st.ended;
    $('#instSpec').textContent = `${S.inst} · $${spec.pointValue}/pt · tick ${spec.tick}`;
    $('#lastPx').textContent = fmtPx(last);
    $$('#typeGroup [data-type]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.type === S.type)));
    const priced = S.type !== 'market';
    $('#priceCtl').hidden = !priced;
    $('#btnPickPrice').hidden = !priced;
    if (priced && st.ticketPrice == null && last != null) st.ticketPrice = last;
    const qIn = $('#qtyIn'), pIn = $('#priceIn'), sIn = $('#slIn'), tIn = $('#tpIn');
    if (document.activeElement !== qIn) qIn.value = S.qty;
    if (document.activeElement !== pIn) pIn.value = st.ticketPrice != null ? st.ticketPrice.toFixed(2) : '';
    if (document.activeElement !== sIn) sIn.value = S.sl;
    if (document.activeElement !== tIn) tIn.value = S.tp;
    $('#slOn').checked = S.slOn; $('#tpOn').checked = S.tpOn;
    sIn.disabled = !S.slOn; tIn.disabled = !S.tpOn;
    const pv = spec.pointValue * S.qty;
    const parts = [];
    parts.push(S.slOn ? `<span>Risk <b class="mono neg-txt">${fmtUsdPlain(S.sl * pv)}</b></span>` : '<span class="muted">No stop set</span>');
    if (S.tpOn) parts.push(`<span>Reward <b class="mono pos-txt">${fmtUsdPlain(S.tp * pv)}</b></span>`);
    if (S.slOn && S.tpOn && S.sl > 0) parts.push(`<span>R:R <b class="mono">${(S.tp / S.sl).toFixed(2)}</b></span>`);
    $('#riskLine').innerHTML = parts.join('');
    const slip = S.slippage * spec.tick;
    const typeWord = S.type === 'limit' ? 'limit' : S.type === 'stop' ? 'stop' : '';
    $('#buyLbl').textContent = typeWord ? `Buy ${typeWord}` : 'Buy';
    $('#sellLbl').textContent = typeWord ? `Sell ${typeWord}` : 'Sell';
    if (S.type === 'market') {
      $('#buySub').textContent = last != null ? '≈ ' + fmtPx(last + slip) : 'market';
      $('#sellSub').textContent = last != null ? '≈ ' + fmtPx(last - slip) : 'market';
    } else {
      $('#buySub').textContent = $('#sellSub').textContent = '@ ' + fmtPx(st.ticketPrice);
    }
    $('#btnBuy').disabled = $('#btnSell').disabled = !active;
  }
  function setPickPrice(on) {
    st.pickPrice = on;
    $('#btnPickPrice').setAttribute('aria-pressed', String(on));
    $('#btnPickPrice').classList.toggle('primary', on);
    if (on) toast('Click the chart to set the order price.');
  }
  function submit(side) {
    const b = st.broker;
    if (!b) return toast('Load a session first.', 'warn');
    if (st.ended) return toast('This session has ended. Restart it or pick another day.', 'warn');
    const req = { side, type: S.type, qty: S.qty, price: S.type === 'market' ? null : st.ticketPrice, sl: S.slOn ? S.sl : 0, tp: S.tpOn ? S.tp : 0 };
    const r = E.bPlace(b, req);
    if (!r.ok) { toast(r.error, 'bad'); return; }
    if (r.fill) onFills([r.fill]);
    else { toast(`Working: ${side === 1 ? 'buy' : 'sell'} ${S.type} ${S.qty} @ ${fmtPx(r.order.price)}`); afterBrokerChange(); }
  }
  function flatten() {
    const b = st.broker;
    if (!b || !b.pos || st.ended) return;
    const f = E.bFlatten(b, 'Manual');
    if (f) onFills([f]);
  }

  // account
  function renderAccount() {
    const b = st.broker, spec = E.INSTRUMENTS[S.inst];
    const realized = b ? b.realized : 0, unreal = b ? E.unrealized(b) : 0;
    const bal = S.balance + realized;
    $('#acctGrid').innerHTML =
      `<div><span>Balance</span><b>${fmtUsdPlain(bal)}</b></div>` +
      `<div><span>Equity</span><b>${fmtUsdPlain(bal + unreal)}</b></div>` +
      `<div><span>Session P/L</span><b class="${signCls(realized + unreal)}">${fmtUsd(realized + unreal)}</b></div>` +
      `<div><span>Commission</span><b>${fmtUsdPlain(b ? b.commission : 0)}</b></div>`;
    const box = $('#posBox');
    if (!b || !b.pos) {
      const n = b ? b.orders.length : 0;
      box.innerHTML = `<div class="pos-head"><span class="pill flat">Flat</span><span class="muted" style="font-size:12px">${n ? n + ' working order' + (n > 1 ? 's' : '') : 'No open position'}</span></div>`;
      return;
    }
    const p = b.pos, pts = (b.last.price - p.avg) * p.side, riskPts = p.riskUsd != null ? p.riskUsd / (spec.pointValue * p.qty) : null;
    const rNow = riskPts ? pts / riskPts : null;
    box.innerHTML =
      `<div class="pos-head"><span class="pill ${p.side === 1 ? 'long' : 'short'}">${p.side === 1 ? 'Long' : 'Short'} ${p.qty}</span><span class="mono">@ ${fmtPx(p.avg)}</span></div>` +
      `<dl class="kv-grid"><dt>Open P/L</dt><dd class="${signCls(unreal)}">${fmtUsd(unreal)} · ${fmtPts(pts)} pts${rNow != null ? ' · ' + fmtR(rNow) : ''}</dd>` +
      `<dt>Stop</dt><dd>${p.sl != null ? fmtPx(p.sl) : '<span class="muted">none</span>'}</dd>` +
      `<dt>Target</dt><dd>${p.tp != null ? fmtPx(p.tp) : '<span class="muted">none</span>'}</dd></dl>` +
      `<div class="pos-actions"><button type="button" class="btn" data-pos="flatten">Flatten <span class="k">F</span></button><button type="button" class="btn" data-pos="reverse">Reverse</button>` +
      (p.sl == null ? `<button type="button" class="btn" data-pos="addsl">Add stop</button>` : '') +
      (p.tp == null ? `<button type="button" class="btn" data-pos="addtp">Add target</button>` : '') + `</div>`;
  }
  function posAction(act) {
    const b = st.broker;
    if (!b || !b.pos || st.ended) return;
    const p = b.pos, last = b.last.price;
    if (act === 'flatten') return flatten();
    if (act === 'reverse') { const f = E.bReverse(b); if (f) onFills([f]); return; }
    if (act === 'addsl') {
      let sl = snapTick(p.avg - p.side * S.sl);
      if ((last - sl) * p.side <= 0) sl = snapTick(last - p.side * S.sl);
      const r = E.bSetBrackets(b, sl, undefined); if (!r.ok) toast(r.error, 'bad');
    }
    if (act === 'addtp') {
      let tp = snapTick(p.avg + p.side * S.tp);
      if ((tp - last) * p.side <= 0) tp = snapTick(last + p.side * S.tp);
      const r = E.bSetBrackets(b, undefined, tp); if (!r.ok) toast(r.error, 'bad');
    }
    afterBrokerChange();
  }

  // coach
  const ICONS = {
    good: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><circle cx="8" cy="8" r="6.5"/><path d="M5 8.2l2 2 4-4.4"/></svg>',
    warn: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M8 1.8l6.6 11.7H1.4z"/><path d="M8 6.2v3.4M8 11.6v.2"/></svg>',
    info: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><circle cx="8" cy="8" r="6.5"/><path d="M8 7.2v4M8 4.8v.2"/></svg>'
  };
  const TONE_WORD = { good: 'Good', warn: 'Watch', info: 'Note' };
  const notesHtml = list => `<ul class="notes">${list.map(n => `<li class="${n.tone}">${ICONS[n.tone]}<span><span class="sr">${TONE_WORD[n.tone]}: </span>${esc(n.text)}</span></li>`).join('')}</ul>`;
  function renderCoach() {
    const el = $('#coachBody'), b = st.broker;
    const t = b && b.trades.length ? b.trades[b.trades.length - 1] : null;
    if (!t) {
      el.innerHTML = '<p class="hint" style="font-size:13px;margin:0">After each trade you get notes on stop size against volatility, trend direction, chasing, timing and exits. What price did after your exit is reviewed when the session ends.</p>';
      return;
    }
    const list = (t.notes || []).concat(t.after ? [t.after] : []);
    el.innerHTML = `<div class="coach-head"><span>Trade ${b.trades.length} · ${t.side === 1 ? 'Long' : 'Short'} ${t.qty} · ${t.reason}</span><b class="mono ${signCls(t.net)}">${fmtUsd(t.net)}${t.r != null ? ' · ' + fmtR(t.r) : ''}</b></div>` +
      (list.length ? notesHtml(list) : '<p class="hint" style="margin:0">Nothing stood out on this trade.</p>') + aiBlock(t);
  }

  // ------------------------------------------------------------- panels
  function renderPanels() {
    const b = st.broker;
    $('#cntOrders').textContent = b ? b.orders.length : 0;
    $('#cntTrades').textContent = b ? b.trades.length : 0;
    if (st.tab === 'orders') renderOrdersPanel();
    else if (st.tab === 'trades') renderTradesPanel();
    else if (st.tab === 'stats') renderStatsPanel();
    else renderJournal();
  }
  function setTab(tab) {
    st.tab = tab;
    $$('#tabs [data-tab]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === tab)));
    for (const k of ['orders', 'trades', 'stats', 'journal']) $('#panel-' + k).hidden = k !== tab;
    renderPanels();
  }
  const emptyHtml = html => `<div class="empty">${html}</div>`;
  function renderOrdersPanel() {
    const el = $('#panel-orders'), b = st.broker;
    if (!b) { el.innerHTML = emptyHtml('Load a session to start trading.'); return; }
    let html = '';
    if (b.orders.length) {
      html += `<div class="table-wrap"><table class="data"><thead><tr><th>Side</th><th>Type</th><th class="n">Qty</th><th class="n">Price</th><th class="n">Stop</th><th class="n">Target</th><th>Placed</th><th></th></tr></thead><tbody>` +
        b.orders.map(o => `<tr><td class="${o.side === 1 ? 'pos-txt' : 'neg-txt'}">${o.side === 1 ? 'Buy' : 'Sell'}</td><td>${o.type === 'limit' ? 'Limit' : 'Stop'}</td><td class="n">${o.qty}</td><td class="n">${fmtPx(o.price)}</td><td class="n">${o.sl ? o.sl.toFixed(2) + ' pts' : '—'}</td><td class="n">${o.tp ? o.tp.toFixed(2) + ' pts' : '—'}</td><td class="mono">${etHM(o.time + st.rep.baseSec)}</td><td><button type="button" class="btn" data-cancel="${o.id}">Cancel</button></td></tr>`).join('') +
        `</tbody></table></div>`;
    } else html += emptyHtml('<b>No working orders.</b> Choose Limit or Stop in the ticket to rest an order at a price, or drag a long/short planner onto the chart and place it from there.');
    if (b.fills.length) {
      html += `<div class="table-wrap" style="margin-top:10px"><table class="data"><thead><tr><th>Fill time</th><th>Side</th><th class="n">Qty</th><th class="n">Price</th><th>How</th></tr></thead><tbody>` +
        b.fills.slice().reverse().map(f => `<tr><td class="mono">${etHM(f.time)}</td><td class="${f.side === 1 ? 'pos-txt' : 'neg-txt'}">${f.side === 1 ? 'Buy' : 'Sell'}</td><td class="n">${f.qty}</td><td class="n">${fmtPx(f.price)}</td><td>${f.reason}</td></tr>`).join('') +
        `</tbody></table></div>`;
    }
    el.innerHTML = html;
  }
  function renderTradesPanel() {
    const el = $('#panel-trades'), b = st.broker;
    if (!b || !b.trades.length) { el.innerHTML = emptyHtml('<b>No closed trades yet.</b> Each round trip, from flat to flat, shows here with its excursions, R multiple and coaching notes.'); return; }
    const rows = b.trades.map((t, k) => {
      const open = st.openRows.has(t.id), notes = (t.notes || []).concat(t.after ? [t.after] : []);
      return `<tr class="trade-row" data-trade="${t.id}" aria-expanded="${open}"><td class="n">${k + 1}</td><td class="${t.side === 1 ? 'pos-txt' : 'neg-txt'}">${t.side === 1 ? 'Long' : 'Short'}</td><td class="n">${t.qty}</td>` +
        `<td class="mono">${etHM(t.entryTime)}</td><td class="n">${fmtPx(t.entry)}</td><td class="mono">${etHM(t.exitTime)}</td><td class="n">${fmtPx(t.exit)}</td>` +
        `<td class="n ${signCls(t.points)}">${fmtPts(t.points)}</td><td class="n ${signCls(t.net)}">${fmtUsd(t.net)}</td><td class="n">${fmtR(t.r)}</td>` +
        `<td class="n">${t.mae.toFixed(2)}</td><td class="n">${t.mfe.toFixed(2)}</td><td>${t.reason}</td><td class="n">${(open ? '▾' : '▸') + ' ' + notes.length}${t.ai ? ' · AI' : ''}</td></tr>` +
        (open ? `<tr class="note-row"><td></td><td colspan="13">${notes.length ? notesHtml(notes) : '<span class="muted">No notes on this trade.</span>'}${aiBlock(t)}</td></tr>` : '');
    }).join('');
    el.innerHTML = `<div class="table-wrap"><table class="data"><thead><tr><th class="n">#</th><th>Side</th><th class="n">Qty</th><th>In</th><th class="n">Entry</th><th>Out</th><th class="n">Exit</th><th class="n">Points</th><th class="n">Net</th><th class="n">R</th><th class="n" title="Maximum adverse excursion, points">MAE</th><th class="n" title="Maximum favourable excursion, points">MFE</th><th>Exit</th><th class="n">Notes</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  }
  function tile(label, value, cls, sub) { return `<div class="tile"><span class="l">${label}</span><span class="v ${cls || ''}">${value}</span>${sub ? `<span class="s">${sub}</span>` : ''}</div>`; }
  function statTiles(s) {
    return tile('Net P/L', fmtUsd(s.net), signCls(s.net), `${fmtUsdPlain(s.commission)} commission`) +
      tile('Trades', s.n, '', `${s.wins} won · ${s.losses} lost`) +
      tile('Win rate', fmtPct(s.winRate)) +
      tile('Profit factor', fmtPF(s.profitFactor)) +
      tile('Expectancy', s.expectancy == null ? '—' : fmtUsd(s.expectancy), signCls(s.expectancy || 0), s.expectancyR != null ? `${fmtR(s.expectancyR)} per trade` : 'per trade') +
      tile('Avg win / loss', `${s.avgWin != null ? fmtUsdPlain(s.avgWin) : '—'}`, '', s.avgLoss != null ? `vs ${fmtUsdPlain(s.avgLoss)}` : '') +
      tile('Max drawdown', s.maxDrawdown ? MINUS + '$' + money(s.maxDrawdown) : '$0.00') +
      tile('Avg MAE / MFE', s.avgMae == null ? '—' : `${s.avgMae.toFixed(1)} / ${s.avgMfe.toFixed(1)}`, '', 'points against / for you') +
      tile('Long / short', `${s.long.n} / ${s.short.n}`, '', `${fmtUsd(s.long.net)} / ${fmtUsd(s.short.net)}`) +
      tile('Avg hold', s.avgMinutes == null ? '—' : s.avgMinutes.toFixed(1) + ' min');
  }
  function renderStatsPanel() {
    const el = $('#panel-stats'), b = st.broker;
    if (!b || !b.trades.length) { el.innerHTML = emptyHtml('<b>Session statistics appear after your first closed trade:</b> win rate, profit factor, expectancy in dollars and R, drawdown, excursions, and P/L by hour of the day.'); return; }
    const s = E.computeStats(b.trades);
    el.innerHTML = `<div class="stats-layout"><div class="tiles">${statTiles(s)}</div><div class="mini-charts"><div class="mini" id="eqSession"><h3>Equity, closed trades</h3></div><div class="mini" id="hrSession"><h3>Net P/L by hour (New York)</h3></div></div></div>`;
    lineChart($('#eqSession'), s.equity, i => i === 0 ? 'Start' : `After trade ${i}`);
    hourBars($('#hrSession'), s.byHour);
  }

  // ============================================================= journal
  const journal = { enabled: !!opts.journal, kind: opts.journal ? opts.journal.kind : 'none', loading: true, sessions: [], confirm: null, error: null };
  let saveChain = Promise.resolve();
  async function initJournal() {
    if (!opts.journal) { journal.loading = false; renderJournalIfVisible(); return; }
    try { journal.sessions = await opts.journal.list(); }
    catch (e) { journal.error = (e && e.message) || 'Could not open your journal.'; }
    if (destroyed) return;
    journal.loading = false;
    renderJournalIfVisible();
  }
  function refreshJournal() {
    if (!opts.journal) return;
    opts.journal.list().then(ss => { if (destroyed) return; journal.sessions = ss; journal.error = null; renderJournalIfVisible(); }).catch(() => {});
  }
  function renderJournalIfVisible() {
    if (destroyed) return;
    $('#cntJournal').textContent = journal.enabled && !journal.loading ? journal.sessions.length : '';
    if (st.tab === 'journal') renderJournal();
  }
  const r2 = x => x == null || !isFinite(x) ? null : Math.round(x * 100) / 100;
  function sessionDoc(final) {
    const b = st.broker;
    return {
      id: st.sessionId, kind: 'session', v: 1, startedAt: st.startedAt, updatedAt: Date.now(), ended: !!final,
      date: st.rep.date, blind: st.blindActive, dataset: st.ds.kind === 'sample' ? 'Sample data' : String(st.ds.label).slice(0, 80),
      instrument: S.inst, startEt: S.start,
      trades: b.trades.slice(0, 200).map(t => ({
        side: t.side, qty: t.qty, entryTime: t.entryTime, exitTime: t.exitTime, entry: r2(t.entry), exit: r2(t.exit),
        points: r2(t.points), gross: r2(t.gross), commission: r2(t.commission), net: r2(t.net), r: t.r == null ? null : Math.round(t.r * 1000) / 1000,
        mfe: r2(t.mfe), mae: r2(t.mae), riskPts: r2(t.riskPts), reason: t.reason,
        notes: (t.notes || []).concat(t.after ? [t.after] : []).map(n => ({ key: n.key || '', tone: n.tone, text: n.text })),
        ai: t.ai || null
      }))
    };
  }
  function saveJournal(final) {
    if (!opts.journal || !st.broker || !st.broker.trades.length || !st.rep) return;
    const doc = sessionDoc(final);
    saveChain = saveChain.then(() => opts.journal.save(doc)).then(() => { journal.saveError = null; refreshJournal(); }).catch(err => {
      journal.saveError = (err && err.message) || 'Could not save to the journal.';
      toast('Journal not saved: ' + journal.saveError, 'bad');
    });
  }
  function renderJournal() {
    const el = $('#panel-journal');
    if (journal.loading) { el.innerHTML = emptyHtml('Opening your journal…'); return; }
    if (!journal.enabled) { el.innerHTML = emptyHtml('The journal is not available here.'); return; }
    const where = journal.kind === 'cloud'
      ? 'Saved to your account'
      : 'Saved in this browser. <a href="/login">Sign in</a> to keep it across devices.';
    const ss = journal.sessions;
    if (journal.error && !ss.length) { el.innerHTML = emptyHtml(`<b>Could not open the journal.</b> ${esc(journal.error)}`); return; }
    if (!ss.length) {
      el.innerHTML = emptyHtml(`<b>No saved sessions yet.</b> Close a trade and the session is saved here automatically, with its coaching notes. ${where}.`);
      return;
    }
    const all = [];
    ss.slice().sort((a, b) => a.startedAt - b.startedAt).forEach(s => (s.trades || []).forEach(t => all.push(t)));
    const s = E.computeStats(all);
    const rows = ss.slice(0, 50).map(x => {
      const xs = E.computeStats(x.trades || []);
      const conf = journal.confirm === x.id;
      return `<tr><td>${dayLabel(x.date)}${x.blind ? ' <span class="muted">(blind)</span>' : ''}</td><td>${esc(x.dataset || '')}</td><td>${esc(x.instrument || '')}</td>` +
        `<td class="n">${xs.n}</td><td class="n">${fmtPct(xs.winRate)}</td><td class="n ${signCls(xs.net)}">${fmtUsd(xs.net)}</td><td class="n">${fmtR(xs.expectancyR)}</td>` +
        `<td class="mono">${new Date(x.startedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</td>` +
        `<td>${conf ? `<span class="confirm-inline"><button type="button" class="btn" data-jdel="${esc(x.id)}" data-yes="1">Delete for good</button><button type="button" class="btn ghost" data-jcancel="1">Keep</button></span>` : `<button type="button" class="btn ghost" data-jdel="${esc(x.id)}">Delete</button>`}</td></tr>`;
    }).join('');
    el.innerHTML = `<div class="journal-head"><span class="status-dot"><i class="on"></i>${ss.length} saved session${ss.length > 1 ? 's' : ''} · ${where}</span><a class="btn" href="/stats">Open full stats</a></div>` +
      `<div class="stats-layout"><div class="tiles">${statTiles(s)}</div><div class="mini-charts"><div class="mini" id="eqAll"><h3>Equity across all sessions</h3></div><div class="mini" id="hrAll"><h3>Net P/L by hour (New York)</h3></div></div></div>` +
      `<div class="table-wrap" style="margin-top:12px"><table class="data"><thead><tr><th>Session</th><th>Data</th><th>Contract</th><th class="n">Trades</th><th class="n">Win rate</th><th class="n">Net</th><th class="n">Avg R</th><th>Traded</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`;
    lineChart($('#eqAll'), s.equity, i => i === 0 ? 'Start' : `After trade ${i}`);
    hourBars($('#hrAll'), s.byHour);
  }
  async function deleteJournal(id) {
    if (!opts.journal) return;
    try { await opts.journal.remove(id); toast('Session deleted from your journal.'); }
    catch (e) { toast('Could not delete that session. Try again in a moment.', 'bad'); }
    journal.confirm = null;
    refreshJournal();
  }

  // ============================================================== AI coach
  const aiBusy = new Set();
  const aiOn = () => !!(opts.coach && opts.coach.enabled);
  function aiBlock(t) {
    if (!aiOn()) return '';
    if (t.ai) return `<div class="ai-review"><div class="ai-head">AI coach</div>${t.ai.split(/\n+/).filter(Boolean).map(p => `<p>${esc(p.replace(/\*\*/g, ''))}</p>`).join('')}</div>`;
    const busy = aiBusy.has(t.id);
    return `<div class="ai-row"><button type="button" class="btn" data-ai="${t.id}" ${busy ? 'disabled' : ''}>${busy ? 'Reviewing the trade…' : 'Ask the AI coach'}</button>${t.aiError ? `<span class="err">${esc(t.aiError)}</span>` : ''}</div>`;
  }
  function coachPayload(t) {
    const B = st.rep.bars, base = st.rep.baseSec, tf = Math.max(300, base);
    const endIdx = st.ended ? Math.min(st.rep.sessionEnd - 1, t.exitIdx + Math.round(1800 / base)) : Math.min(st.cursor, t.exitIdx);
    const fromIdx = Math.max(0, t.entryIdx - Math.round(7200 / base));
    const a = E.aggregate(B, fromIdx, endIdx, tf);
    const c = t.ctx || {};
    const r = x => x == null || !isFinite(x) ? null : Math.round(x * 100) / 100;
    return {
      instrument: S.inst, pointValue: E.INSTRUMENTS[S.inst].pointValue, date: isBlind() ? null : st.rep.date,
      dataset: st.ds.kind === 'sample' ? 'generated sample session' : 'imported market data',
      trade: {
        side: t.side === 1 ? 'long' : 'short', contracts: t.qty, entryTime: etHM(t.entryTime), entry: r(t.entry), exitTime: etHM(t.exitTime), exit: r(t.exit),
        points: r(t.points), netUsd: r(t.net), rMultiple: t.r == null ? null : Math.round(t.r * 100) / 100, riskPts: r(t.riskPts),
        plannedRR: t.plannedRR == null ? null : Math.round(t.plannedRR * 100) / 100, stopAtEntry: r(t.slAtEntry), targetAtEntry: r(t.tpAtEntry),
        mfePts: r(t.mfe), maePts: r(t.mae), exitReason: t.reason
      },
      context: {
        ema20_5m: r(c.ema20h), ema50_5m: r(c.ema50h), atr5m: r(c.atrh), positionInTodaysRange: c.rthPos == null ? null : Math.round(c.rthPos * 100) / 100,
        levels: (c.levels || []).map(l => ({ name: l.name.replace(/^the /, ''), price: r(l.price) })),
        fairValueGaps: (c.gaps || []).map(g => ({ type: (g.inverted ? 'inverted ' : '') + (g.eff === 1 ? 'bullish' : 'bearish'), from: r(g.bottom), to: r(g.top), filled: !!g.filled }))
      },
      ruleNotes: (t.notes || []).concat(t.after ? [t.after] : []).map(n => n.text),
      candles5m: a.time.map((x, i) => [etHM(a.utc[i]), r(a.o[i]), r(a.h[i]), r(a.l[i]), r(a.c[i])]).slice(-72),
      includesAfterExit: !!st.ended
    };
  }
  async function requestAiReview(id) {
    const b = st.broker, t = b && b.trades.find(x => x.id === id);
    if (!t || !aiOn() || aiBusy.has(id)) return;
    aiBusy.add(id); t.aiError = null;
    renderCoach(); if (st.tab === 'trades') renderTradesPanel();
    try {
      const res = await opts.coach.request(coachPayload(t));
      if (destroyed) return;
      t.ai = String(res && res.text || '').trim() || 'The coach had nothing to add on this trade.';
      saveJournal(st.ended);
    } catch (e) {
      t.aiError = (e && e.message) || 'The AI coach could not answer. Try again in a moment.';
    }
    aiBusy.delete(id);
    if (destroyed) return;
    renderCoach(); if (st.tab === 'trades') renderTradesPanel();
  }

  // ======================================================= session review
  const THEMES = E.THEMES;
  function showSummary() {
    const b = st.broker, s = E.computeStats(b.trades);
    const tally = new Map();
    for (const t of b.trades) for (const n of (t.notes || []).concat(t.after ? [t.after] : [])) if (n.tone === 'warn' && THEMES[n.key]) tally.set(n.key, (tally.get(n.key) || 0) + 1);
    const themes = Array.from(tally.entries()).sort((a, c) => c[1] - a[1]).slice(0, 3);
    const goods = b.trades.reduce((a, t) => a + (t.notes || []).filter(n => n.tone === 'good').length, 0);
    const dateTxt = dayLabel(st.rep.date) + (st.ds.kind === 'sample' ? ' · generated sample session' : '');
    const body = !b.trades.length
      ? `<p class="hint" style="font-size:13.5px;margin:0">No trades this session. Watching a full day is useful too: the chart now shows the rest of the day for review.</p>`
      : `<div class="big-net ${signCls(s.net)}">${fmtUsd(s.net)}</div>` +
        `<div class="tiles">${tile('Trades', s.n, '', `${s.wins} won · ${s.losses} lost`)}${tile('Win rate', fmtPct(s.winRate))}${tile('Avg R', fmtR(s.expectancyR))}${tile('Profit factor', fmtPF(s.profitFactor))}</div>` +
        (themes.length
          ? `<div><h3 class="lbl" style="margin:0 0 6px;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)">What to work on</h3><ul class="notes">${themes.map(([k, n]) => `<li class="warn">${ICONS.warn}<span>${THEMES[k]} <span class="muted">· ${n} trade${n > 1 ? 's' : ''}</span></span></li>`).join('')}</ul></div>`
          : `<ul class="notes"><li class="good">${ICONS.good}<span>No recurring problems flagged${goods ? `, and ${goods} positive note${goods > 1 ? 's' : ''}` : ''}. Open the Trades tab for trade-by-trade notes.</span></li></ul>`);
    openModal(`<h2 id="mTitle">Session review</h2><div class="sub">${dateTxt}${st.blindActive ? ' · the date was hidden while you traded' : ''}</div>${body}` +
      `<div class="actions"><button type="button" class="btn" data-m="same">Replay this day</button><button type="button" class="btn" data-m="random">Random day</button><button type="button" class="btn primary" data-m="close">Review the chart</button></div>`);
  }
  function openModal(html) {
    const root = $('#modalRoot');
    root.innerHTML = `<div class="modal-back" data-m="back"><div class="modal" role="dialog" aria-modal="true" aria-labelledby="mTitle">${html}</div></div>`;
    const btn = root.querySelector('.btn.primary') || root.querySelector('button');
    if (btn) btn.focus();
  }
  function closeModal() { $('#modalRoot').innerHTML = ''; }

  // ============================================================= popovers
  let openPop = null;
  function closePopovers() {
    if (!openPop) return;
    openPop.pop.hidden = true;
    openPop.btn.setAttribute('aria-expanded', 'false');
    openPop = null;
  }
  function togglePopover(popId, btn, render) {
    const pop = $(popId);
    if (openPop && openPop.pop === pop) { closePopovers(); return; }
    closePopovers();
    if (render) render(pop);
    pop.hidden = false;
    const r = btn.getBoundingClientRect(), pw = pop.offsetWidth, ph = pop.offsetHeight;
    let left = clamp(r.left, 16, window.innerWidth - pw - 16), top = r.bottom + 6;
    if (top + ph > window.innerHeight - 12) top = Math.max(12, window.innerHeight - ph - 12);
    pop.style.left = left + 'px'; pop.style.top = top + 'px';
    btn.setAttribute('aria-expanded', 'true');
    openPop = { pop, btn };
    const f = pop.querySelector('input, select, button');
    if (f) f.focus({ preventScroll: true });
  }
  function renderIndicatorsPop(pop) {
    const I = S.ind, sw = v => `<span class="sw" style="width:14px;height:3px;border-radius:2px;display:inline-block;background:var(${v})"></span>`;
    const num = (path, v, min, max, step) => `<input type="number" class="field small" data-ind="${path}" value="${v}" min="${min}" max="${max}" step="${step || 1}" aria-label="${path}">`;
    pop.innerHTML = `<h3>Indicators</h3><div class="grid">` +
      I.ema.map((e, k) => `<label class="chk"><input type="checkbox" data-ind="ema.${k}.on" ${e.on ? 'checked' : ''}> EMA</label>${num(`ema.${k}.len`, e.len, 2, 400)}${sw(['--series-1', '--series-2', '--series-3', '--series-neutral'][k])}`).join('') +
      `<label class="chk"><input type="checkbox" data-ind="vwap.on" ${I.vwap.on ? 'checked' : ''}> VWAP</label><select class="field small" style="width:auto" data-ind="vwap.anchor" aria-label="VWAP start"><option value="eth" ${I.vwap.anchor === 'eth' ? 'selected' : ''}>From 18:00</option><option value="rth" ${I.vwap.anchor === 'rth' ? 'selected' : ''}>From 09:30</option></select>${sw('--series-4')}` +
      `<label class="chk"><input type="checkbox" data-ind="bb.on" ${I.bb.on ? 'checked' : ''}> Bollinger</label><span style="display:flex;gap:4px">${num('bb.len', I.bb.len, 5, 200)}${num('bb.mult', I.bb.mult, 0.5, 5, 0.5)}</span>${sw('--series-neutral')}` +
      `<label class="chk"><input type="checkbox" data-ind="vol.on" ${I.vol.on ? 'checked' : ''}> Volume</label><span></span><span></span>` +
      `<label class="chk"><input type="checkbox" data-ind="rsi.on" ${I.rsi.on ? 'checked' : ''}> RSI</label>${num('rsi.len', I.rsi.len, 2, 100)}${sw('--series-3')}` +
      `<label class="chk"><input type="checkbox" data-ind="macd.on" ${I.macd.on ? 'checked' : ''}> MACD</label><span style="display:flex;gap:4px">${num('macd.fast', I.macd.fast, 2, 100)}${num('macd.slow', I.macd.slow, 3, 200)}${num('macd.signal', I.macd.signal, 2, 100)}</span>${sw('--series-1')}` +
      `</div><p>Indicators are calculated only from bars already revealed, on whichever timeframe you are viewing.</p>`;
  }
  function onIndicatorChange(e) {
    const t = e.target, path = t.dataset.ind;
    if (!path) return;
    const keys = path.split('.');
    let o = S.ind;
    for (let i = 0; i < keys.length - 1; i++) o = o[keys[i]];
    const k = keys[keys.length - 1];
    if (t.type === 'checkbox') o[k] = t.checked;
    else if (t.tagName === 'SELECT') o[k] = t.value;
    else {
      const v = parseFloat(t.value);
      if (!isFinite(v)) return;
      o[k] = k === 'mult' ? clamp(v, 0.5, 5) : Math.round(clamp(v, 2, 400));
    }
    if (S.ind.macd.fast >= S.ind.macd.slow) S.ind.macd.slow = S.ind.macd.fast + 1;
    saveSettings();
    if (chart) { buildIndicatorSeries(); renderAll(); }
  }
  function renderDataPop(pop) {
    const csv = st.csv, active = st.ds && st.ds.kind;
    const info = csv ? `${esc(csv.ds.label)} · ${csv.ds.days.length} sessions · ${csv.ds.days[0]} to ${csv.ds.days[csv.ds.days.length - 1]} · ${csv.ds.baseSec / 60}-minute bars` : 'Import a CSV of bars to replay real days.';
    pop.innerHTML = `<h3>Market data</h3>` +
      `<div class="opt" role="radio" tabindex="0" data-ds="sample" aria-checked="${active === 'sample'}"><span><b>Sample sessions</b><small>Generated Nasdaq-100 futures days with a quiet overnight, the London pick-up, 08:30 data spikes, a fast cash open and a lunch lull. Useful for practice. Not real history.</small></span></div>` +
      `<div class="opt" role="radio" tabindex="${csv ? 0 : -1}" data-ds="csv" aria-checked="${active === 'csv'}" ${csv ? '' : 'aria-disabled="true"'}><span><b>Your CSV</b><small>${info}</small></span></div>` +
      `<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><span class="btn primary file-btn">Choose CSV file<input type="file" accept=".csv,.txt,text/csv" id="csvFile" aria-label="Choose CSV file"></span>` +
      `<label class="chk" style="font-size:12.5px">Times without a zone are <select class="field small" style="width:auto" id="csvTz"><option value="utc">UTC</option><option value="ny">New York</option><option value="cet">Stockholm</option></select></label></div>` +
      `<p id="csvStatus" class="hint">You can also drop a file onto the chart.</p>` +
      `<p>Columns: <code>time, open, high, low, close, volume</code>. Times can be ISO 8601 or Unix seconds, milliseconds or nanoseconds. TradingView and NinjaTrader exports work, as does the CSV written by the Databento script in the project's <code>scripts</code> folder (NQ or MNQ 1-minute bars). The file stays in your browser.</p>`;
    $('#csvTz', pop).value = S.csvTz;
  }
  async function importFile(file) {
    const status = $('#csvStatus');
    const say = (msg, cls) => { if (status) { status.textContent = msg; status.className = cls || 'hint'; } };
    if (!file) return;
    if (file.size > 150e6) { say('That file is over 150 MB. Split it into smaller date ranges.', 'err'); toast('That file is too large to import here.', 'bad'); return; }
    say(`Reading ${file.name}…`);
    try {
      const text = await file.text();
      const res = E.parseBarsCSV(text, S.csvTz);
      if (res.error) { say(res.error, 'err'); toast(res.error, 'bad'); return; }
      const ds = E.CsvDataset(file.name, res.bars);
      if (!ds.days.length) { say('No full sessions were found in that file.', 'err'); return; }
      st.csv = { ds };
      IDB.put('csv', { name: file.name, bars: res.bars });
      setDataset('csv');
      loadSession(ds.days.length - 1, false);
      say(`Imported ${ds.days.length} sessions${res.skipped ? `, skipped ${res.skipped} unreadable rows` : ''}.`);
      toast(`Imported ${ds.days.length} sessions from ${file.name}.`, 'good');
      if (openPop && openPop.pop.id === 'popData') renderDataPop($('#popData'));
    } catch (e) {
      say('Could not read that file. Check that it is a plain-text CSV.', 'err');
    }
  }
  function renderSettingsPop(pop) {
    pop.innerHTML = `<h3>Simulation</h3><div class="grid" style="grid-template-columns:1fr auto">` +
      `<label for="setCm">Commission per side, MNQ ($)</label><input class="field small" type="number" id="setCm" data-set="commission.MNQ" min="0" max="20" step="0.01" value="${S.commission.MNQ}">` +
      `<label for="setCn">Commission per side, NQ ($)</label><input class="field small" type="number" id="setCn" data-set="commission.NQ" min="0" max="50" step="0.01" value="${S.commission.NQ}">` +
      `<label for="setSl">Slippage on market and stop orders (ticks)</label><input class="field small" type="number" id="setSl" data-set="slippage" min="0" max="20" step="1" value="${S.slippage}">` +
      `<label for="setBal">Starting balance ($)</label><input class="field small" style="width:90px" type="number" id="setBal" data-set="balance" min="1000" max="10000000" step="1000" value="${S.balance}">` +
      `</div>` +
      `<label class="chk"><input type="checkbox" data-set="limitThrough" ${S.limitThrough ? 'checked' : ''}> Limit orders fill only when price trades through them (stricter)</label>` +
      `<label class="chk"><input type="checkbox" data-set="pauseOnFill" ${S.pauseOnFill ? 'checked' : ''}> Pause the replay when an order fills</label>` +
      `<p>Changes apply from the next fill. One MNQ tick is $0.50 and one NQ tick is $5.00.</p>`;
  }
  function onSettingChange(e) {
    const t = e.target, path = t.dataset.set;
    if (!path) return;
    if (t.type === 'checkbox') S[path] = t.checked;
    else {
      const v = parseFloat(t.value);
      if (!isFinite(v) || v < 0) return;
      if (path.startsWith('commission.')) S.commission[path.split('.')[1]] = v;
      else if (path === 'slippage') S.slippage = Math.round(clamp(v, 0, 20));
      else if (path === 'balance') S.balance = clamp(v, 1000, 1e7);
    }
    saveSettings();
    if (st.broker) {
      st.broker.inst.commission = S.commission[S.inst];
      st.broker.opts.slippageTicks = S.slippage;
      st.broker.opts.limitThrough = S.limitThrough;
    }
    renderTicket(); renderAccount();
  }

  // ============================================================== toasts
  function toast(msg, tone) {
    const box = $('#toasts'), el = document.createElement('div');
    el.className = 'toast ' + (tone || '');
    el.textContent = msg;
    box.appendChild(el);
    while (box.children.length > 3) box.firstChild.remove();
    setTimeout(() => el.remove(), tone === 'bad' ? 5200 : 3400);
  }

  // ============================================================= wiring
  function pickDay(value) {
    const ds = st.ds;
    if (!ds || !value) return;
    let i = ds.days.findIndex(d => d >= value);
    if (i < 0) i = ds.days.length - 1;
    if (ds.days[i] !== value) toast(`No session on ${dayLabel(value)}. Loaded ${dayLabel(ds.days[i])} instead.`);
    loadSession(i, false);
  }
  function randomDay() {
    const n = st.ds.days.length, lo = Math.min(n - 1, CONTEXT_DAYS);
    let i = lo + Math.floor(Math.random() * (n - lo));
    if (n > lo + 1 && i === st.dayIdx) i = lo + ((i - lo + 1) % (n - lo));
    loadSession(i, S.blind);
  }
  function stepperClick(kind, dir) {
    const tick = E.INSTRUMENTS[S.inst].tick;
    if (kind === 'qty') S.qty = clamp(S.qty + dir, 1, 100);
    else if (kind === 'price') { if (st.ticketPrice == null) st.ticketPrice = lastPrice(); if (st.ticketPrice != null) st.ticketPrice = E.roundTo(st.ticketPrice + dir, tick); }
    else if (kind === 'sl') S.sl = Math.max(tick, E.roundTo(S.sl + dir, tick));
    else if (kind === 'tp') S.tp = Math.max(tick, E.roundTo(S.tp + dir, tick));
    saveSettings();
    renderTicket();
  }
  function wire() {
    $('#instGroup').addEventListener('click', e => {
      const b = e.target.closest('[data-inst]');
      if (!b || b.dataset.inst === S.inst) return;
      if (st.broker && !st.ended && (st.broker.pos || st.broker.orders.length)) { toast('Close your position and cancel working orders before switching contracts.', 'warn'); return; }
      S.inst = b.dataset.inst; saveSettings();
      $$('#instGroup [data-inst]').forEach(x => x.setAttribute('aria-pressed', String(x.dataset.inst === S.inst)));
      if (st.broker) { st.broker.inst = instSpec(); }
      updateLegend(); renderTicket(); renderAccount(); requestOverlays();
    });
    $('#tfGroup').addEventListener('click', e => {
      const b = e.target.closest('[data-tf]');
      if (!b) return;
      const tf = +b.dataset.tf;
      if (st.rep && tf * 60 < st.rep.baseSec) { toast(`This data has ${st.rep.baseSec / 60}-minute bars, so ${b.textContent} is not available.`, 'warn'); return; }
      S.tf = tf; saveSettings();
      $$('#tfGroup [data-tf]').forEach(x => x.setAttribute('aria-pressed', String(+x.dataset.tf === S.tf)));
      if (st.rep) { rebuildAgg(); renderAll(); fitRecent(); updateDrawActions(); }
    });
    $('#tools').addEventListener('click', e => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.tool) setTool(st.tool === b.dataset.tool && b.dataset.tool !== 'cursor' ? 'cursor' : b.dataset.tool);
      else if (b.id === 'btnMagnet') { S.magnet = !S.magnet; saveSettings(); b.setAttribute('aria-pressed', String(S.magnet)); }
      else if (b.id === 'btnClearDraw') { st.drawings = []; select(null); toast('Drawings removed.'); }
    });
    $('#btnIndicators').addEventListener('click', e => togglePopover('#popIndicators', e.currentTarget, renderIndicatorsPop));
    $('#btnData').addEventListener('click', e => togglePopover('#popData', e.currentTarget, renderDataPop));
    $('#btnSettings').addEventListener('click', e => togglePopover('#popSettings', e.currentTarget, renderSettingsPop));
    $('#btnHelp').addEventListener('click', e => togglePopover('#popHelp', e.currentTarget));
    $('#popIndicators').addEventListener('change', onIndicatorChange);
    $('#popSettings').addEventListener('change', onSettingChange);
    $('#popData').addEventListener('change', e => {
      if (e.target.id === 'csvFile') importFile(e.target.files[0]);
      if (e.target.id === 'csvTz') { S.csvTz = e.target.value; saveSettings(); }
    });
    const pickDs = el => {
      const opt = el.closest('[data-ds]');
      if (!opt || opt.getAttribute('aria-disabled') === 'true') return;
      if (opt.dataset.ds === (st.ds && st.ds.kind)) return;
      setDataset(opt.dataset.ds);
      loadSession(st.ds.days.length - 1, false);
      renderDataPop($('#popData'));
    };
    $('#popData').addEventListener('click', e => pickDs(e.target));
    $('#popData').addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target.closest('[data-ds]')) { e.preventDefault(); pickDs(e.target); } });
    on(document, 'mousedown', e => {
      if (openPop && !openPop.pop.contains(e.target) && !openPop.btn.contains(e.target)) closePopovers();
    });

    $('#dayInput').addEventListener('change', e => pickDay(e.target.value));
    $('#btnRandom').addEventListener('click', randomDay);
    $('#chkBlind').addEventListener('change', e => { S.blind = e.target.checked; saveSettings(); });
    $('#startSel').addEventListener('change', e => {
      S.start = +e.target.value; saveSettings();
      if (st.rep && st.broker && !st.broker.fills.length) loadSession(st.dayIdx, st.blindActive && !st.ended);
      else toast('The new start time applies when you restart or load another day.');
    });
    $('#btnRestart').addEventListener('click', () => { if (st.rep) loadSession(st.dayIdx, st.blindActive); });
    $('#btnPlay').addEventListener('click', togglePlay);
    $('#btnStep').addEventListener('click', () => step());
    $('#speedSel').addEventListener('change', e => { S.speed = +e.target.value; saveSettings(); });
    $('#btnEnd').addEventListener('click', endSession);

    const strip = $('#strip'), hover = $('#stripHover');
    const stripMin = ev => { const r = strip.getBoundingClientRect(); return clamp((ev.clientX - r.left) / r.width, 0, 1) * 1380; };
    strip.addEventListener('pointermove', ev => {
      const sm = stripMin(ev), et = (Math.round(sm) + 1080) % 1440;
      hover.hidden = false;
      hover.textContent = pad2(Math.floor(et / 60)) + ':' + pad2(et % 60);
      hover.style.left = (sm / 13.8) + '%';
    });
    strip.addEventListener('pointerleave', () => { hover.hidden = true; });
    strip.addEventListener('click', ev => {
      if (!st.rep || st.ended) return;
      const sm = Math.round(stripMin(ev));
      if (sm <= stripFrac() * 1380) { toast('You can only skip forward. Use Restart to go back.'); return; }
      skipTo((sm + 1080) % 1440);
    });

    $('#typeGroup').addEventListener('click', e => {
      const b = e.target.closest('[data-type]');
      if (!b) return;
      S.type = b.dataset.type; saveSettings();
      if (S.type !== 'market' && st.ticketPrice == null) st.ticketPrice = lastPrice();
      if (S.type === 'market') setPickPrice(false);
      renderTicket();
    });
    $('#ticketCard').addEventListener('click', e => {
      const s = e.target.closest('[data-step]');
      if (s) { const [k, d] = s.dataset.step.split(':'); stepperClick(k, +d); }
    });
    $('#qtyIn').addEventListener('change', e => { const v = parseInt(e.target.value, 10); S.qty = isFinite(v) ? clamp(v, 1, 100) : S.qty; saveSettings(); renderTicket(); });
    $('#priceIn').addEventListener('change', e => { const v = parseFloat(String(e.target.value).replace(/,/g, '')); if (isFinite(v) && v > 0) st.ticketPrice = snapTick(v); renderTicket(); });
    $('#slIn').addEventListener('change', e => { const v = parseFloat(e.target.value); if (isFinite(v) && v > 0) S.sl = snapTick(v); saveSettings(); renderTicket(); });
    $('#tpIn').addEventListener('change', e => { const v = parseFloat(e.target.value); if (isFinite(v) && v > 0) S.tp = snapTick(v); saveSettings(); renderTicket(); });
    $('#slOn').addEventListener('change', e => { S.slOn = e.target.checked; saveSettings(); renderTicket(); });
    $('#tpOn').addEventListener('change', e => { S.tpOn = e.target.checked; saveSettings(); renderTicket(); });
    $('#btnPickPrice').addEventListener('click', () => setPickPrice(!st.pickPrice));
    $('#btnBuy').addEventListener('click', () => submit(1));
    $('#btnSell').addEventListener('click', () => submit(-1));
    $('#posBox').addEventListener('click', e => { const b = e.target.closest('[data-pos]'); if (b) posAction(b.dataset.pos); });

    $('#tabs').addEventListener('click', e => { const b = e.target.closest('[data-tab]'); if (b) setTab(b.dataset.tab); });
    $('#tabs').addEventListener('keydown', e => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      const tabs = $$('#tabs [data-tab]'), i = tabs.findIndex(t => t.dataset.tab === st.tab);
      const n = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
      setTab(n.dataset.tab); n.focus();
    });
    $('#panel-orders').addEventListener('click', e => { const b = e.target.closest('[data-cancel]'); if (b && st.broker) { E.bCancel(st.broker, +b.dataset.cancel); afterBrokerChange(); } });
    $('#panel-trades').addEventListener('click', e => {
      const r = e.target.closest('[data-trade]');
      if (!r) return;
      const id = +r.dataset.trade;
      if (st.openRows.has(id)) st.openRows.delete(id); else st.openRows.add(id);
      renderTradesPanel();
    });
    $('#panel-journal').addEventListener('click', e => {
      const d = e.target.closest('[data-jdel]'), c = e.target.closest('[data-jcancel]');
      if (c) { journal.confirm = null; renderJournal(); return; }
      if (!d) return;
      if (d.dataset.yes) deleteJournal(d.dataset.jdel);
      else { journal.confirm = d.dataset.jdel; renderJournal(); }
    });
    $('#drawActions').addEventListener('click', e => {
      const b = e.target.closest('[data-act]');
      if (!b) return;
      const d = st.drawings.find(x => x.id === st.selected);
      if (!d) return;
      if (b.dataset.act === 'delete') deleteSelected();
      else if (b.dataset.act === 'order') placeFromPlanner(d);
    });
    $('#modalRoot').addEventListener('click', e => {
      const t = e.target.closest('[data-m]');
      if (!t) return;
      const m = t.dataset.m;
      if (m === 'back' && e.target !== t) return;
      closeModal();
      if (m === 'same') loadSession(st.dayIdx, false);
      if (m === 'random') randomDay();
    });

    const wrap = $('#chartWrap');
    wrap.addEventListener('mousedown', onChartDown, true);
    wrap.addEventListener('touchstart', onChartDown, { capture: true, passive: false });
    wrap.addEventListener('mousemove', onChartHover);
    on(window, 'mousemove', onWindowMove);
    on(window, 'touchmove', onWindowMove, { passive: false });
    on(window, 'mouseup', onWindowUp);
    on(window, 'touchend', onWindowUp);
    wrap.addEventListener('dragover', e => { if (e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files')) { e.preventDefault(); $('#dropHint').hidden = false; } });
    wrap.addEventListener('dragleave', e => { if (!wrap.contains(e.relatedTarget)) $('#dropHint').hidden = true; });
    wrap.addEventListener('drop', e => { e.preventDefault(); $('#dropHint').hidden = true; const f = e.dataTransfer && e.dataTransfer.files[0]; if (f) importFile(f); });

    on(document, 'keydown', onKey);
    on(root, 'click', e => { const b = e.target.closest('[data-ai]'); if (b) { e.stopPropagation(); requestAiReview(+b.dataset.ai); } }, true);
    const ro = new ResizeObserver(() => { renderStripStatic(); updateDrawActions(); });
    ro.observe($('#strip'));
    cleanups.push(() => ro.disconnect());
  }
  function placeFromPlanner(d) {
    const b = st.broker;
    if (!b || st.ended) { toast('Load a session first.', 'warn'); return; }
    const side = d.type === 'long' ? 1 : -1, last = b.last.price;
    const sl = Math.abs(d.entry - d.stop), tp = Math.abs(d.target - d.entry);
    let type;
    if (d.entry === last) type = 'market';
    else if (side === 1) type = d.entry < last ? 'limit' : 'stop';
    else type = d.entry > last ? 'limit' : 'stop';
    const r = E.bPlace(b, { side, type, qty: S.qty, price: d.entry, sl, tp });
    if (!r.ok) { toast(r.error, 'bad'); return; }
    if (r.fill) onFills([r.fill]);
    else { toast(`Working: ${side === 1 ? 'buy' : 'sell'} ${type} ${S.qty} @ ${fmtPx(d.entry)}, stop ${sl.toFixed(2)} pts, target ${tp.toFixed(2)} pts`); afterBrokerChange(); }
    st.drawings = st.drawings.filter(x => x.id !== d.id);
    select(null);
  }
  function onKey(e) {
    const tag = (e.target.tagName || '').toLowerCase();
    const typing = tag === 'input' || tag === 'select' || tag === 'textarea';
    if (e.key === 'Escape') {
      if ($('#modalRoot').firstChild) { closeModal(); return; }
      if (openPop) { const b = openPop.btn; closePopovers(); b.focus(); return; }
      if (st.creating || st.tool !== 'cursor') { setTool('cursor'); return; }
      if (st.pickPrice) { setPickPrice(false); return; }
      if (st.selected) select(null);
      return;
    }
    if (typing || $('#modalRoot').firstChild) return;
    if (e.altKey && !e.ctrlKey && !e.metaKey) {
      const map = { t: 'trend', h: 'hline', r: 'rect', f: 'fib', l: 'long', s: 'short' };
      const k = (e.code || '').replace('Key', '').toLowerCase();
      if (map[k]) { e.preventDefault(); setTool(map[k]); }
      return;
    }
    if (e.ctrlKey || e.metaKey) return;
    if (e.key === ' ' || e.code === 'Space') {
      e.preventDefault();
      if (document.activeElement && document.activeElement.tagName === 'BUTTON') document.activeElement.blur();
      togglePlay();
    } else if (e.key === 'ArrowRight' && !e.target.closest('#tabs')) { e.preventDefault(); if (!st.playing) step(); }
    else if (e.key === 'b' || e.key === 'B') submitMarket(1);
    else if (e.key === 's' || e.key === 'S') submitMarket(-1);
    else if (e.key === 'f' || e.key === 'F') flatten();
    else if ((e.key === 'Delete' || e.key === 'Backspace') && st.selected) { e.preventDefault(); deleteSelected(); }
  }
  function submitMarket(side) {
    const keep = S.type;
    S.type = 'market';
    submit(side);
    S.type = keep;
  }

  // ============================================================== theme
  function applyTheme() {
    if (!chart) return;
    readColors();
    chart.applyOptions(chartOptions());
    candle.applyOptions(candleOptions());
    buildIndicatorSeries();
    if (st.agg) renderAll();
    if (st.tab === 'stats' || st.tab === 'journal') renderPanels();
  }

  // ================================================================ boot
  async function boot() {
    readColors();
    $$('#instGroup [data-inst]').forEach(x => x.setAttribute('aria-pressed', String(x.dataset.inst === S.inst)));
    $$('#tfGroup [data-tf]').forEach(x => x.setAttribute('aria-pressed', String(+x.dataset.tf === S.tf)));
    $('#btnMagnet').setAttribute('aria-pressed', String(S.magnet));
    wire();
    renderStripStatic();
    if (!LWC || !LWC.createChart) {
      $('#chartEmpty').textContent = 'The chart library did not load. Check your connection and reload the page.';
      renderEverything();
      return;
    }
    chart = LWC.createChart($('#chart'), chartOptions());
    candle = chart.addSeries(LWC.CandlestickSeries, candleOptions());
    drawPrim = new DrawingPrimitive();
    candle.attachPrimitive(drawPrim);
    overlay = new OverlayPrimitive();
    candle.attachPrimitive(overlay);
    markersApi = LWC.createSeriesMarkers(candle, []);
    buildIndicatorSeries();
    chart.subscribeCrosshairMove(p => {
      const lg = p && p.logical != null && p.time != null ? Math.round(p.logical) : null;
      if (lg !== st.hoverIdx) { st.hoverIdx = lg; updateLegend(); }
    });
    chart.timeScale().subscribeVisibleLogicalRangeChange(() => { if (st.selected) updateDrawActions(); });
    on(window.matchMedia('(prefers-color-scheme: light)'), 'change', applyTheme);
    const mo = new MutationObserver(applyTheme);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    cleanups.push(() => mo.disconnect());
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if (chart && !destroyed) { chart.applyOptions({ layout: { fontFamily: FONT_MONO } }); requestOverlays(); renderStripStatic(); } });

    st.sample = E.SampleDataset(E.lastCompletedTradingDay(Date.now()));
    setDataset('sample');
    const P = opts.params || {};
    if (P.start != null && isFinite(+P.start) && [1080, 180, 480, 510, 540, 570, 600, 720, 840, 930].includes(+P.start)) S.start = +P.start;
    if (P.blind != null) S.blind = !!P.blind;
    if (P.tf != null && [1, 2, 3, 5, 15, 30, 60].includes(+P.tf)) {
      S.tf = +P.tf;
      $$('#tfGroup [data-tf]').forEach(x => x.setAttribute('aria-pressed', String(+x.dataset.tf === S.tf)));
    }
    if (opts.lesson) {
      const card = $('#lessonCard');
      card.innerHTML = `<h2>Practice <span class="aside">${esc(opts.lesson.title)}</span></h2><p class="lesson-task">${esc(opts.lesson.task)}</p><a class="btn" href="/learn/${encodeURIComponent(opts.lesson.slug)}">Back to the lesson</a>`;
      card.hidden = false;
    }
    if (P.random) randomDay();
    else if (P.day) pickDay(P.day);
    else loadSession(st.ds.days.length - 1, false);
    initJournal();

    const saved = await IDB.get('csv');
    if (destroyed) return;
    if (saved && saved.bars && saved.bars.t && saved.bars.t.length) {
      try {
        st.csv = { ds: E.CsvDataset(saved.name || 'Imported CSV', saved.bars) };
        if (S.dataset === 'csv' && st.csv.ds.days.length && st.broker && !st.broker.fills.length && !st.playing) {
          setDataset('csv');
          loadSession(st.ds.days.length - 1, false);
        }
      } catch (e) { st.csv = null; }
    }
    if (S.dataset === 'csv' && !st.csv) { S.dataset = 'sample'; saveSettings(); }
  }
  if (opts.debug) window.__tt = { st, S, E, get chart() { return chart; }, journal, y: p => priceToY(p) };
  boot();
  return {
    destroy() {
      destroyed = true;
      pause();
      closePopovers();
      cleanups.forEach(f => { try { f(); } catch (e) { /* already removed */ } });
      try { if (chart) chart.remove(); } catch (e) { /* already removed */ }
      chart = null;
      if (opts.debug && window.__tt) delete window.__tt;
    }
  };
}
