/* Small SVG charts with hover tooltips, used by the trainer and the stats page. */
const MINUS = '−';
const FONT_MONO = "'JetBrains Mono', ui-monospace, Menlo, Consolas, monospace";
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const pad2 = n => String(n).padStart(2, '0');
const money = x => Math.abs(x).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const fmtUsd = x => x == null || !isFinite(x) ? '—' : (x > 0.004 ? '+' : x < -0.004 ? MINUS : '') + '$' + money(x);
export const signCls = x => x > 0.004 ? 'pos-txt' : x < -0.004 ? 'neg-txt' : '';
const shortUsd = v => (v < 0 ? MINUS : '') + '$' + (Math.abs(v) >= 1000 ? (Math.abs(v) / 1000).toFixed(Math.abs(v) >= 10000 ? 0 : 1) + 'k' : Math.round(Math.abs(v)));

function niceTicks(min, max, count) {
  const span = max - min || 1, raw = span / count, mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => s >= raw) || raw;
  const out = [];
  for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) out.push(Math.round(v * 100) / 100);
  return out;
}
function gridAndAxis(ticks, y, L, R, W, fmt) {
  return ticks.map(t => `<line x1="${L}" x2="${W - R}" y1="${y(t)}" y2="${y(t)}" stroke="var(--grid)"/><text x="${L - 6}" y="${y(t) + 3.5}" text-anchor="end" font-size="10" fill="var(--muted)" font-family="${FONT_MONO}">${fmt(t)}</text>`).join('');
}

/** Line + area chart of a running total (e.g. equity after each trade). */
export function lineChart(host, vals, labelFn, opts) {
  const o = Object.assign({ height: 100, fmt: shortUsd, valueFmt: fmtUsd, xStart: 'Trade 0', xEnd: n => `Trade ${n}` }, opts || {});
  const W = Math.max(240, host.clientWidth), H = o.height, L = 46, R = 10, T = 8, B = 18;
  let min = Math.min(0, ...vals), max = Math.max(0, ...vals);
  if (max - min < 1) { max += 1; min -= 1; }
  const pad = (max - min) * 0.08; min -= pad; max += pad;
  const x = i => L + (vals.length > 1 ? i / (vals.length - 1) : 0.5) * (W - L - R);
  const y = v => T + (1 - (v - min) / (max - min)) * (H - T - B);
  const path = vals.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('');
  const area = `${path}L${x(vals.length - 1).toFixed(1)},${y(0).toFixed(1)}L${x(0).toFixed(1)},${y(0).toFixed(1)}Z`;
  const last = vals[vals.length - 1];
  host.insertAdjacentHTML('beforeend', `<svg viewBox="0 0 ${W} ${H}" height="${H}" role="img" aria-label="Running total, ending at ${o.valueFmt(last)}">` +
    gridAndAxis(niceTicks(min, max, 3), y, L, R, W, o.fmt) +
    `<line x1="${L}" x2="${W - R}" y1="${y(0)}" y2="${y(0)}" stroke="var(--line-strong)" stroke-dasharray="3 3"/>` +
    `<path d="${area}" fill="var(--series-1)" opacity="0.12"/>` +
    `<path d="${path}" fill="none" stroke="var(--series-1)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>` +
    `<circle cx="${x(vals.length - 1)}" cy="${y(last)}" r="4" fill="var(--series-1)" stroke="var(--surface)" stroke-width="2"/>` +
    `<text x="${L}" y="${H - 4}" font-size="10" fill="var(--muted)">${o.xStart}</text><text x="${W - R}" y="${H - 4}" font-size="10" fill="var(--muted)" text-anchor="end">${o.xEnd(vals.length - 1)}</text>` +
    `<g class="hov" opacity="0"><line y1="${T}" y2="${H - B}" stroke="var(--line-strong)"/><circle r="4" fill="var(--series-1)" stroke="var(--surface)" stroke-width="2"/></g>` +
    `<rect x="${L}" y="0" width="${W - L - R}" height="${H}" fill="transparent" class="hit"/></svg><div class="tip" hidden></div>`);
  const s = host.querySelector('svg'), hov = s.querySelector('.hov'), tip = host.querySelector('.tip');
  const hit = s.querySelector('.hit');
  hit.addEventListener('pointermove', ev => {
    const r = s.getBoundingClientRect(), px = (ev.clientX - r.left) * (W / r.width);
    const i = clamp(Math.round((px - L) / (W - L - R) * (vals.length - 1)), 0, vals.length - 1);
    hov.setAttribute('opacity', '1');
    hov.querySelector('line').setAttribute('x1', x(i)); hov.querySelector('line').setAttribute('x2', x(i));
    hov.querySelector('circle').setAttribute('cx', x(i)); hov.querySelector('circle').setAttribute('cy', y(vals[i]));
    tip.hidden = false;
    tip.innerHTML = `${labelFn(i)} · <b class="mono ${signCls(vals[i])}">${o.valueFmt(vals[i])}</b>`;
    tip.style.left = clamp(x(i) * r.width / W + 10, 0, r.width - tip.offsetWidth) + 'px';
    tip.style.top = Math.max(0, y(vals[i]) * r.height / H - 16) + 'px';
  });
  hit.addEventListener('pointerleave', () => { hov.setAttribute('opacity', '0'); tip.hidden = true; });
}

/** Bars from a zero baseline; positive in the up colour, negative in the down colour. items: [{label, value, tip}] */
export function barChart(host, items, opts) {
  if (!items.length) return;
  const o = Object.assign({ height: 96, fmt: shortUsd, polarity: true }, opts || {});
  const W = Math.max(240, host.clientWidth), H = o.height, L = 46, R = 10, T = 8, B = 18;
  let min = Math.min(0, ...items.map(i => i.value)), max = Math.max(0, ...items.map(i => i.value));
  if (max - min < 1e-9) { max += 1; }
  const y = v => T + (1 - (v - min) / (max - min)) * (H - T - B);
  const slot = (W - L - R) / items.length, bw = Math.min(30, Math.max(5, slot - 2));
  let bars = '';
  items.forEach((it, k) => {
    const cx = L + slot * (k + 0.5), y0 = y(0), y1 = y(it.value), top = Math.min(y0, y1), h = Math.max(1.5, Math.abs(y1 - y0));
    const r = Math.min(4, h / 2, bw / 2), x0 = cx - bw / 2, up = it.value >= 0;
    const d = up
      ? `M${x0},${y0}V${top + r}Q${x0},${top} ${x0 + r},${top}H${x0 + bw - r}Q${x0 + bw},${top} ${x0 + bw},${top + r}V${y0}Z`
      : `M${x0},${y0}V${top + h - r}Q${x0},${top + h} ${x0 + r},${top + h}H${x0 + bw - r}Q${x0 + bw},${top + h} ${x0 + bw},${top + h - r}V${y0}Z`;
    const fill = it.color || (o.polarity ? (up ? 'var(--up)' : 'var(--down)') : 'var(--series-1)');
    bars += `<path d="${d}" fill="${fill}"/>`;
    if (it.label) bars += `<text x="${cx}" y="${H - 4}" text-anchor="middle" font-size="10" fill="var(--muted)">${it.label}</text>`;
    bars += `<rect x="${cx - slot / 2}" y="0" width="${slot}" height="${H}" fill="transparent" data-k="${k}"/>`;
  });
  host.insertAdjacentHTML('beforeend', `<svg viewBox="0 0 ${W} ${H}" height="${H}" role="img" aria-label="${o.aria || 'Bar chart'}">` +
    gridAndAxis(niceTicks(min, max, 3), y, L, R, W, o.fmt) +
    `<line x1="${L}" x2="${W - R}" y1="${y(0)}" y2="${y(0)}" stroke="var(--line-strong)"/>` + bars + '</svg><div class="tip" hidden></div>');
  const s = host.querySelector('svg'), tip = host.querySelector('.tip');
  s.querySelectorAll('rect[data-k]').forEach(rc => {
    rc.addEventListener('pointerenter', () => {
      const it = items[+rc.dataset.k], r = s.getBoundingClientRect();
      tip.hidden = false;
      tip.innerHTML = it.tip;
      const cx = (L + slot * (+rc.dataset.k + 0.5)) * r.width / W;
      tip.style.left = clamp(cx - tip.offsetWidth / 2, 0, r.width - tip.offsetWidth) + 'px';
      tip.style.top = '0px';
    });
    rc.addEventListener('pointerleave', () => { tip.hidden = true; });
  });
}

/** P/L by hour of entry, from computeStats().byHour. */
export function hourBars(host, byHour) {
  barChart(host, byHour.map(it => ({
    label: pad2(it.hour), value: it.net,
    tip: `${pad2(it.hour)}:00–${pad2((it.hour + 1) % 24)}:00 · ${it.n} trade${it.n > 1 ? 's' : ''} · ${Math.round(it.wins / it.n * 100)}% won · <b class="mono ${signCls(it.net)}">${fmtUsd(it.net)}</b>`
  })), { aria: 'Net profit and loss by hour of entry' });
}
