/* Builds the Claude prompt for one trade review from the facts the trainer sends.
   Everything is validated and trimmed here, because the payload comes from the browser. */

export const COACH_SYSTEM = `You are the trading coach inside TradingTrainer, a replay simulator for Nasdaq-100 futures (NQ and MNQ). A student has just closed one practice trade on a replayed session.

Review the trade using only the facts and candles you are given. Never invent prices, levels, news or events. Unless the data says it includes bars after the exit, do not say what price did after the exit.

Judge the process, not just the result: where the entry was relative to trend, key levels and fair value gaps, where the stop and target sat, and how the trade was managed. A losing trade can be a good trade and a winning trade can be a bad one.

Write plain text with no markdown, as exactly three short paragraphs starting with "What went well:", "What to change:" and "Next time, look for:". Keep the whole review under 130 words. Use concrete prices from the data where they help. Be direct and encouraging. This is education in a simulator, not investment advice, so never recommend real trades.`;

type Num = number | null;
export type CoachPayload = {
  instrument: 'MNQ' | 'NQ'; pointValue: number; date: string | null; dataset: string;
  trade: {
    side: 'long' | 'short'; contracts: number; entryTime: string; entry: number; exitTime: string; exit: number;
    points: Num; netUsd: Num; rMultiple: Num; riskPts: Num; plannedRR: Num; stopAtEntry: Num; targetAtEntry: Num;
    mfePts: Num; maePts: Num; exitReason: string;
  };
  context: {
    ema20_5m: Num; ema50_5m: Num; atr5m: Num; positionInTodaysRange: Num;
    levels: { name: string; price: number }[];
    fairValueGaps: { type: string; from: number; to: number; filled: boolean }[];
  };
  ruleNotes: string[];
  candles5m: [string, number, number, number, number][];
  includesAfterExit: boolean;
};

const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const n = (x: unknown): Num => (isNum(x) ? x : null);
const str = (x: unknown, max: number) => (typeof x === 'string' ? x.slice(0, max) : '');
const hm = (x: unknown) => (typeof x === 'string' && /^\d{2}:\d{2}$/.test(x) ? x : '');

export function validatePayload(body: unknown): { ok: true; data: CoachPayload } | { ok: false; error: string } {
  if (!body || typeof body !== 'object') return { ok: false, error: 'Missing trade data.' };
  const b = body as Record<string, unknown>;
  const t = (b.trade || {}) as Record<string, unknown>;
  const c = (b.context || {}) as Record<string, unknown>;
  if (b.instrument !== 'MNQ' && b.instrument !== 'NQ') return { ok: false, error: 'Unknown contract.' };
  if (t.side !== 'long' && t.side !== 'short') return { ok: false, error: 'Unknown trade side.' };
  if (!isNum(t.entry) || !isNum(t.exit) || !isNum(t.contracts)) return { ok: false, error: 'The trade is missing its prices.' };
  const candles = Array.isArray(b.candles5m) ? b.candles5m : [];
  const cleanCandles = candles.slice(-80).filter((r): r is [string, number, number, number, number] =>
    Array.isArray(r) && r.length === 5 && !!hm(r[0]) && r.slice(1).every(isNum));
  const levels = (Array.isArray(c.levels) ? c.levels : []).slice(0, 20)
    .filter((l: any) => l && isNum(l.price)).map((l: any) => ({ name: str(l.name, 40), price: l.price }));
  const gaps = (Array.isArray(c.fairValueGaps) ? c.fairValueGaps : []).slice(0, 15)
    .filter((g: any) => g && isNum(g.from) && isNum(g.to)).map((g: any) => ({ type: str(g.type, 30), from: g.from, to: g.to, filled: !!g.filled }));
  const notes = (Array.isArray(b.ruleNotes) ? b.ruleNotes : []).slice(0, 16).map(x => str(x, 400)).filter(Boolean);
  return {
    ok: true,
    data: {
      instrument: b.instrument, pointValue: b.instrument === 'NQ' ? 20 : 2,
      date: typeof b.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(b.date) ? b.date : null,
      dataset: str(b.dataset, 60) || 'replay',
      trade: {
        side: t.side, contracts: Math.max(1, Math.min(100, Math.round(t.contracts))), entryTime: hm(t.entryTime), entry: t.entry,
        exitTime: hm(t.exitTime), exit: t.exit, points: n(t.points), netUsd: n(t.netUsd), rMultiple: n(t.rMultiple),
        riskPts: n(t.riskPts), plannedRR: n(t.plannedRR), stopAtEntry: n(t.stopAtEntry), targetAtEntry: n(t.targetAtEntry),
        mfePts: n(t.mfePts), maePts: n(t.maePts), exitReason: str(t.exitReason, 30) || 'Manual'
      },
      context: {
        ema20_5m: n(c.ema20_5m), ema50_5m: n(c.ema50_5m), atr5m: n(c.atr5m), positionInTodaysRange: n(c.positionInTodaysRange),
        levels, fairValueGaps: gaps
      },
      ruleNotes: notes,
      candles5m: cleanCandles,
      includesAfterExit: !!b.includesAfterExit
    }
  };
}

const p2 = (x: Num) => (x == null ? 'n/a' : x.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

export function buildCoachPrompt(d: CoachPayload): string {
  const t = d.trade, c = d.context;
  const lines: string[] = [];
  lines.push(`Contract: ${d.instrument} ($${d.pointValue} per point, tick 0.25).`);
  lines.push(`Session: ${d.date ? d.date : 'date hidden from the student'} (${d.dataset}). Times are New York time.`);
  lines.push(`Trade: ${t.side} ${t.contracts} contract${t.contracts > 1 ? 's' : ''}. Entry ${p2(t.entry)} at ${t.entryTime}. Exit ${p2(t.exit)} at ${t.exitTime} (${t.exitReason}).`);
  lines.push(`Result: ${p2(t.points)} points, ${t.netUsd == null ? 'n/a' : (t.netUsd >= 0 ? '+$' : '-$') + Math.abs(t.netUsd).toFixed(2)} net, ${t.rMultiple == null ? 'no R (no stop was set)' : t.rMultiple.toFixed(2) + 'R'}.`);
  lines.push(`Risk: stop at entry ${p2(t.stopAtEntry)}, target at entry ${p2(t.targetAtEntry)}, risk ${p2(t.riskPts)} points, planned reward-to-risk ${t.plannedRR == null ? 'n/a' : t.plannedRR.toFixed(2)}.`);
  lines.push(`Excursions: best ${p2(t.mfePts)} points in favour, worst ${p2(t.maePts)} points against.`);
  lines.push(`Context at entry: 5-minute EMA20 ${p2(c.ema20_5m)}, EMA50 ${p2(c.ema50_5m)}, 5-minute ATR ${p2(c.atr5m)} points.` +
    (c.positionInTodaysRange == null ? '' : ` Entry sat at ${Math.round(c.positionInTodaysRange * 100)}% of today's cash-session range.`));
  if (c.levels.length) lines.push(`Key levels known at entry: ${c.levels.map(l => `${l.name} ${p2(l.price)}`).join('; ')}.`);
  if (c.fairValueGaps.length) lines.push(`5-minute fair value gaps open at entry: ${c.fairValueGaps.map(g => `${g.type} ${p2(g.from)}-${p2(g.to)}${g.filled ? ' (filled)' : ''}`).join('; ')}.`);
  if (d.ruleNotes.length) lines.push(`Rule-based notes already shown to the student (don't just repeat them; add judgement):\n- ${d.ruleNotes.join('\n- ')}`);
  lines.push(`5-minute candles (time, open, high, low, close), from up to 2 hours before entry until ${d.includesAfterExit ? '30 minutes after the exit (the session has ended)' : 'the exit'}:`);
  lines.push(d.candles5m.map(r => r.join(', ')).join('\n'));
  return lines.join('\n');
}
