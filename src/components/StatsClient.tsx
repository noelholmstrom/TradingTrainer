'use client';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import E from '@/lib/engine';
import { barChart, fmtUsd, hourBars, lineChart, signCls } from '@/lib/charts';
import { getJournal, LocalJournal, moveLocalToCloud, type SessionDoc, type TradeDoc } from '@/lib/journal';

const MINUS = '−';
const money = (x: number) => Math.abs(x).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const usdPlain = (x: number | null) => (x == null ? '—' : (x < 0 ? MINUS : '') + '$' + money(x));
const pct = (x: number | null) => (x == null ? '—' : Math.round(x * 100) + '%');
const fR = (x: number | null) => (x == null || !isFinite(x) ? '—' : (x > 0.004 ? '+' : x < -0.004 ? MINUS : '') + Math.abs(x).toFixed(2) + 'R');
const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dayLabel = (d: string) => { const dt = new Date(d + 'T00:00:00Z'); return `${WD[dt.getUTCDay()]} ${dt.getUTCDate()} ${MON[dt.getUTCMonth()]} ${dt.getUTCFullYear()}`; };

const R_BINS: { label: string; lo: number; hi: number; color: string }[] = [
  { label: `≤${MINUS}2`, lo: -Infinity, hi: -2, color: 'var(--down)' },
  { label: `${MINUS}2…${MINUS}1`, lo: -2, hi: -1, color: 'var(--down)' },
  { label: `${MINUS}1…0`, lo: -1, hi: 0, color: 'var(--down)' },
  { label: '0…1', lo: 0, hi: 1, color: 'var(--up)' },
  { label: '1…2', lo: 1, hi: 2, color: 'var(--up)' },
  { label: '2…3', lo: 2, hi: 3, color: 'var(--up)' },
  { label: '≥3', lo: 3, hi: Infinity, color: 'var(--up)' }
];

function Tile({ label, value, cls, sub }: { label: string; value: string | number; cls?: string; sub?: string }) {
  return <div className="tile"><span className="l">{label}</span><span className={`v ${cls || ''}`}>{value}</span>{sub && <span className="s">{sub}</span>}</div>;
}

export default function StatsClient({ signedIn, accounts }: { signedIn: boolean; accounts: boolean }) {
  const journal = useMemo(() => getJournal(signedIn), [signedIn]);
  const [sessions, setSessions] = useState<SessionDoc[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [localCount, setLocalCount] = useState(0);
  const [moving, setMoving] = useState(false);
  const [confirm, setConfirm] = useState<string | null>(null);
  const eqRef = useRef<HTMLDivElement>(null), rRef = useRef<HTMLDivElement>(null);
  const hrRef = useRef<HTMLDivElement>(null), wdRef = useRef<HTMLDivElement>(null);

  const load = useCallback(() => {
    journal.list().then(ss => { setSessions(ss); setError(null); }).catch(e => setError(e instanceof Error ? e.message : 'Could not load your journal.'));
  }, [journal]);
  useEffect(() => {
    load();
    if (journal.kind === 'cloud') new LocalJournal().list().then(l => setLocalCount(l.length)).catch(() => {});
  }, [journal, load]);

  const data = useMemo(() => {
    if (!sessions) return null;
    const ordered = sessions.slice().sort((a, b) => a.startedAt - b.startedAt);
    const trades: (TradeDoc & { date: string })[] = [];
    ordered.forEach(s => s.trades.forEach(t => trades.push({ ...t, date: s.date })));
    const stats = E.computeStats(trades);
    const rTrades = trades.filter(t => t.r != null && isFinite(t.r as number));
    const rBins = R_BINS.map(b => ({ ...b, n: rTrades.filter(t => (t.r as number) > b.lo && (t.r as number) <= b.hi || (b.lo === -Infinity && (t.r as number) <= b.hi)).length }));
    const wd = [1, 2, 3, 4, 5].map(d => {
      const ts = trades.filter(t => new Date(t.date + 'T00:00:00Z').getUTCDay() === d);
      return { d, n: ts.length, net: ts.reduce((a, t) => a + t.net, 0), wins: ts.filter(t => t.net > 0).length };
    });
    // Recurring problems: share of trades flagged, recent sessions vs earlier ones.
    const recentIds = new Set(sessions.slice(0, 10).map(s => s.id));
    const recent = ordered.filter(s => recentIds.has(s.id)).flatMap(s => s.trades);
    const older = ordered.filter(s => !recentIds.has(s.id)).flatMap(s => s.trades);
    const rate = (list: TradeDoc[], key: string) => (list.length ? list.filter(t => t.notes.some(n => n.key === key && n.tone === 'warn')).length / list.length : null);
    const themes = Object.entries(E.THEMES as Record<string, string>).map(([key, name]) => {
      const count = trades.filter(t => t.notes.some(n => n.key === key && n.tone === 'warn')).length;
      return { key, name, count, share: trades.length ? count / trades.length : 0, recent: rate(recent, key), older: rate(older, key) };
    }).filter(x => x.count > 0).sort((a, b) => b.count - a.count).slice(0, 6);
    const reasons = new Map<string, { n: number; wins: number; net: number; rs: number[] }>();
    trades.forEach(t => {
      const r = reasons.get(t.reason) || { n: 0, wins: 0, net: 0, rs: [] };
      r.n++; r.net += t.net; if (t.net > 0) r.wins++; if (t.r != null) r.rs.push(t.r);
      reasons.set(t.reason, r);
    });
    const maeR = trades.filter(t => t.riskPts && t.mae != null).map(t => (t.mae as number) / (t.riskPts as number));
    const mfeR = trades.filter(t => t.riskPts && t.mfe != null).map(t => (t.mfe as number) / (t.riskPts as number));
    const avg = (xs: number[]) => (xs.length ? xs.reduce((a, x) => a + x, 0) / xs.length : null);
    return { trades, stats, rBins, wd, themes, reasons, avgMaeR: avg(maeR), avgMfeR: avg(mfeR), rCount: rTrades.length };
  }, [sessions]);

  useEffect(() => {
    if (!data || !data.trades.length) return;
    const clear = (el: HTMLDivElement | null) => { if (el) el.querySelectorAll('svg, .tip').forEach(n => n.remove()); return el; };
    const eq = clear(eqRef.current), rh = clear(rRef.current), hr = clear(hrRef.current), wd = clear(wdRef.current);
    if (eq) lineChart(eq, data.stats.equity, (i: number) => (i === 0 ? 'Start' : `After trade ${i}`), { height: 150 });
    if (rh && data.rCount) barChart(rh, data.rBins.map(b => ({ label: b.label, value: b.n, color: b.color, tip: `${b.label}R · <b class="mono">${b.n}</b> trade${b.n === 1 ? '' : 's'}` })), { height: 120, fmt: (v: number) => String(Math.round(v)), aria: 'Distribution of trade results in R' });
    if (hr) hourBars(hr, data.stats.byHour);
    if (wd) barChart(wd, data.wd.map(x => ({ label: WD[x.d], value: x.net, tip: `${WD[x.d]} · ${x.n} trade${x.n === 1 ? '' : 's'}${x.n ? ` · ${Math.round(x.wins / x.n * 100)}% won` : ''} · <b class="mono ${signCls(x.net)}">${fmtUsd(x.net)}</b>` })), { aria: 'Net profit and loss by weekday' });
  }, [data]);

  async function remove(id: string) {
    try { await journal.remove(id); } catch { setError('Could not delete that session.'); }
    setConfirm(null);
    load();
  }
  async function moveLocal() {
    setMoving(true);
    try { await moveLocalToCloud(journal); setLocalCount(0); load(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not move the sessions.'); }
    setMoving(false);
  }

  const head = (
    <div className="stats-head">
      <div>
        <span className="eyebrow">Progress</span>
        <h1>Your trading stats</h1>
        <p className="lede">Every closed trade from every session you have traded{journal.kind === 'cloud' ? ' on your account' : ' in this browser'}.</p>
      </div>
      <Link className="btn primary big" href="/replay">Trade a session</Link>
    </div>
  );
  const banners = (
    <>
      {journal.kind === 'local' && accounts && (
        <div className="notice" style={{ marginTop: 14 }}><b>Your journal lives in this browser.</b> <Link href="/login?next=/stats">Sign in</Link> to keep it on your account and see it on any device.</div>
      )}
      {localCount > 0 && (
        <div className="notice" style={{ marginTop: 14, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <span><b>{localCount} session{localCount === 1 ? '' : 's'} from before you signed in</b> are saved in this browser.</span>
          <button type="button" className="btn" onClick={moveLocal} disabled={moving}>{moving ? 'Moving…' : 'Add them to my account'}</button>
        </div>
      )}
      {error && <div className="notice" style={{ marginTop: 14 }}><b>Something went wrong.</b> {error}</div>}
    </>
  );

  if (!sessions) return <>{head}{banners}<p className="hint" style={{ marginTop: 20 }}>Loading your journal…</p></>;
  if (!data || !data.trades.length) {
    return (
      <>{head}{banners}
        <div className="empty" style={{ marginTop: 18 }}>
          <b>No trades yet.</b>
          <span>Trade a session in the replay. Every closed trade is saved with its coaching notes, and this page fills in: equity, results in R, best and worst hours, and the mistakes that keep coming back.</span>
        </div>
      </>
    );
  }
  const s = data.stats;
  return (
    <>
      {head}{banners}
      <div className="tiles" style={{ marginTop: 18 }}>
        <Tile label="Net P/L" value={fmtUsd(s.net)} cls={signCls(s.net)} sub={`${usdPlain(s.commission)} commission`} />
        <Tile label="Trades" value={s.n} sub={`${sessions.length} session${sessions.length === 1 ? '' : 's'}`} />
        <Tile label="Win rate" value={pct(s.winRate)} sub={`${s.wins} won · ${s.losses} lost`} />
        <Tile label="Profit factor" value={s.profitFactor == null ? '—' : s.profitFactor === Infinity ? '∞' : s.profitFactor.toFixed(2)} />
        <Tile label="Expectancy" value={fR(s.expectancyR)} cls={signCls(s.expectancyR || 0)} sub={s.expectancy == null ? '' : `${fmtUsd(s.expectancy)} per trade`} />
        <Tile label="Max drawdown" value={s.maxDrawdown ? `${MINUS}$${money(s.maxDrawdown)}` : '$0.00'} sub="closed trades" />
        <Tile label="Avg MAE" value={data.avgMaeR == null ? '—' : data.avgMaeR.toFixed(2) + 'R'} sub="against you before exit" />
        <Tile label="Avg MFE" value={data.avgMfeR == null ? '—' : data.avgMfeR.toFixed(2) + 'R'} sub="in your favour before exit" />
      </div>
      <div className="stats-grid">
        <section className="panel-card wide mini" ref={eqRef}><h2>Equity across all trades</h2></section>
        <section className="panel-card mini" ref={rRef}>
          <h2>Results in R</h2>
          {!data.rCount && <p className="hint">Trades need a stop to have an R value. None of yours do yet.</p>}
        </section>
        <section className="panel-card">
          <h2>Mistakes that keep coming back</h2>
          {data.themes.length ? (
            <ul className="theme-list">
              {data.themes.map(t => {
                const trend = t.recent != null && t.older != null && Math.abs(t.recent - t.older) >= 0.05
                  ? (t.recent < t.older ? `${Math.round(t.recent * 100)}% lately, down from ${Math.round(t.older * 100)}%` : `${Math.round(t.recent * 100)}% lately, up from ${Math.round(t.older * 100)}%`)
                  : '';
                return (
                  <li key={t.key}>
                    <span>{t.name}</span>
                    <span className="mono">{t.count} · {Math.round(t.share * 100)}%</span>
                    <span className="meter" aria-hidden="true"><i style={{ width: `${Math.max(3, t.share * 100)}%` }} /></span>
                    {trend && <span className="trend">{trend}</span>}
                  </li>
                );
              })}
            </ul>
          ) : <p className="hint">No recurring warnings. The coach flags things like stops inside noise, chasing and trading against the trend.</p>}
        </section>
        <section className="panel-card mini" ref={hrRef}><h2>Net P/L by hour of entry (New York)</h2></section>
        <section className="panel-card mini" ref={wdRef}><h2>Net P/L by weekday</h2></section>
        <section className="panel-card wide">
          <h2>How trades ended</h2>
          <div className="table-wrap">
            <table className="data">
              <thead><tr><th>Exit</th><th className="n">Trades</th><th className="n">Win rate</th><th className="n">Avg R</th><th className="n">Net</th></tr></thead>
              <tbody>
                {[...data.reasons.entries()].sort((a, b) => b[1].n - a[1].n).map(([reason, r]) => (
                  <tr key={reason}>
                    <td>{reason}</td><td className="n">{r.n}</td><td className="n">{pct(r.wins / r.n)}</td>
                    <td className="n">{fR(r.rs.length ? r.rs.reduce((a, x) => a + x, 0) / r.rs.length : null)}</td>
                    <td className={`n ${signCls(r.net)}`}>{fmtUsd(r.net)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        <section className="panel-card wide">
          <h2>Sessions</h2>
          <div className="table-wrap">
            <table className="data">
              <thead><tr><th>Session</th><th>Data</th><th>Contract</th><th className="n">Trades</th><th className="n">Win rate</th><th className="n">Net</th><th className="n">Avg R</th><th>Traded</th><th /></tr></thead>
              <tbody>
                {sessions.map(x => {
                  const xs = E.computeStats(x.trades);
                  return (
                    <tr key={x.id}>
                      <td>{dayLabel(x.date)}{x.blind && <span className="muted"> (blind)</span>}</td>
                      <td>{x.dataset}</td><td>{x.instrument}</td>
                      <td className="n">{xs.n}</td><td className="n">{pct(xs.winRate)}</td>
                      <td className={`n ${signCls(xs.net)}`}>{fmtUsd(xs.net)}</td><td className="n">{fR(xs.expectancyR)}</td>
                      <td className="mono">{new Date(x.startedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</td>
                      <td>
                        {confirm === x.id ? (
                          <span className="confirm-inline">
                            <button type="button" className="btn" onClick={() => remove(x.id)}>Delete for good</button>
                            <button type="button" className="btn ghost" onClick={() => setConfirm(null)}>Keep</button>
                          </span>
                        ) : <button type="button" className="btn ghost" onClick={() => setConfirm(x.id)}>Delete</button>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </>
  );
}
