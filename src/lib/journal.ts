import { createStore, del, entries, set } from 'idb-keyval';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getBrowserClient } from './supabase/client';

export type Note = { key: string; tone: 'good' | 'warn' | 'info'; text: string };
export type TradeDoc = {
  side: 1 | -1; qty: number; entryTime: number; exitTime: number; entry: number; exit: number;
  points: number | null; gross: number | null; commission: number | null; net: number; r: number | null;
  mfe: number | null; mae: number | null; riskPts: number | null; reason: string; notes: Note[]; ai: string | null;
};
export type SessionDoc = {
  id: string; kind: 'session'; v: 1; startedAt: number; updatedAt: number; ended: boolean;
  date: string; blind: boolean; dataset: string; instrument: string; startEt: number; trades: TradeDoc[];
};
export type LessonProgress = Record<string, { completedAt: number; score: number }>;

/** Where sessions and lesson progress are kept: this browser, or the signed-in account. */
export interface JournalStore {
  kind: 'local' | 'cloud';
  list(): Promise<SessionDoc[]>;
  save(doc: SessionDoc): Promise<void>;
  remove(id: string): Promise<void>;
  lessons(): Promise<LessonProgress>;
  saveLesson(slug: string, score: number): Promise<void>;
}

const byNewest = (a: SessionDoc, b: SessionDoc) => b.startedAt - a.startedAt;

/** Guest journal in IndexedDB (falls back to memory when the browser blocks storage). */
export class LocalJournal implements JournalStore {
  kind = 'local' as const;
  private mem = new Map<string, SessionDoc>();
  private store = (() => {
    try { return typeof indexedDB !== 'undefined' ? createStore('tradingtrainer-journal', 'sessions') : null; }
    catch { return null; }
  })();

  async list() {
    if (this.store) {
      try {
        const all = await entries<string, SessionDoc>(this.store);
        all.forEach(([k, v]) => { if (v && v.kind === 'session') this.mem.set(String(k), v); });
      } catch { /* storage blocked: memory only */ }
    }
    return [...this.mem.values()].sort(byNewest);
  }
  async save(doc: SessionDoc) {
    this.mem.set(doc.id, doc);
    if (this.store) { try { await set(doc.id, doc, this.store); } catch { /* memory only */ } }
  }
  async remove(id: string) {
    this.mem.delete(id);
    if (this.store) { try { await del(id, this.store); } catch { /* memory only */ } }
  }
  async lessons(): Promise<LessonProgress> {
    try { return JSON.parse(localStorage.getItem('tt.lessons') || '{}'); } catch { return {}; }
  }
  async saveLesson(slug: string, score: number) {
    const p = await this.lessons();
    p[slug] = { completedAt: Date.now(), score: Math.max(score, p[slug]?.score ?? 0) };
    try { localStorage.setItem('tt.lessons', JSON.stringify(p)); } catch { /* not saved */ }
  }
}

const iso = (ms: number) => new Date(ms).toISOString();
const secs = (s: string) => Math.round(Date.parse(s) / 1000);
const num = (x: unknown) => (x == null ? null : Number(x));

type SessionRow = {
  id: string; started_at: string; updated_at: string; ended: boolean; trade_date: string; blind: boolean;
  dataset: string; instrument: string; start_et: number; trades?: TradeRow[];
};
type TradeRow = {
  seq: number; side: number; qty: number; entry_time: string; exit_time: string; entry: number; exit: number;
  points: number | null; gross: number | null; commission: number | null; net: number; r: number | null;
  mfe: number | null; mae: number | null; risk_pts: number | null; reason: string; notes: Note[] | null; ai_review: string | null;
};

function rowToDoc(s: SessionRow): SessionDoc {
  const trades = (s.trades || []).slice().sort((a, b) => a.seq - b.seq).map(t => ({
    side: (t.side === 1 ? 1 : -1) as 1 | -1, qty: t.qty, entryTime: secs(t.entry_time), exitTime: secs(t.exit_time),
    entry: Number(t.entry), exit: Number(t.exit), points: num(t.points), gross: num(t.gross), commission: num(t.commission),
    net: Number(t.net), r: num(t.r), mfe: num(t.mfe), mae: num(t.mae), riskPts: num(t.risk_pts), reason: t.reason,
    notes: Array.isArray(t.notes) ? t.notes : [], ai: t.ai_review
  }));
  return {
    id: s.id, kind: 'session', v: 1, startedAt: Date.parse(s.started_at), updatedAt: Date.parse(s.updated_at), ended: s.ended,
    date: s.trade_date, blind: s.blind, dataset: s.dataset, instrument: s.instrument, startEt: s.start_et, trades
  };
}

/** Journal stored in Supabase for the signed-in user. Row-level security keeps it private. */
export class CloudJournal implements JournalStore {
  kind = 'cloud' as const;
  constructor(private sb: SupabaseClient) {}

  async list() {
    const { data, error } = await this.sb
      .from('sessions')
      .select('id, started_at, updated_at, ended, trade_date, blind, dataset, instrument, start_et, trades(seq, side, qty, entry_time, exit_time, entry, exit, points, gross, commission, net, r, mfe, mae, risk_pts, reason, notes, ai_review)')
      .order('started_at', { ascending: false })
      .limit(300);
    if (error) throw new Error(error.message);
    return ((data || []) as SessionRow[]).map(rowToDoc);
  }
  async save(doc: SessionDoc) {
    const net = doc.trades.reduce((a, t) => a + (t.net || 0), 0);
    const { error } = await this.sb.from('sessions').upsert({
      id: doc.id, started_at: iso(doc.startedAt), updated_at: iso(doc.updatedAt), ended: doc.ended, trade_date: doc.date,
      blind: doc.blind, dataset: doc.dataset, instrument: doc.instrument, start_et: doc.startEt,
      trade_count: doc.trades.length, net: Math.round(net * 100) / 100
    });
    if (error) throw new Error(error.message);
    if (!doc.trades.length) return;
    const rows = doc.trades.map((t, i) => ({
      session_id: doc.id, seq: i + 1, side: t.side, qty: t.qty, entry_time: iso(t.entryTime * 1000), exit_time: iso(t.exitTime * 1000),
      entry: t.entry, exit: t.exit, points: t.points, gross: t.gross, commission: t.commission, net: t.net, r: t.r,
      mfe: t.mfe, mae: t.mae, risk_pts: t.riskPts, reason: t.reason, notes: t.notes, ai_review: t.ai
    }));
    const { error: e2 } = await this.sb.from('trades').upsert(rows, { onConflict: 'session_id,seq' });
    if (e2) throw new Error(e2.message);
  }
  async remove(id: string) {
    const { error } = await this.sb.from('sessions').delete().eq('id', id);
    if (error) throw new Error(error.message);
  }
  async lessons(): Promise<LessonProgress> {
    const { data, error } = await this.sb.from('lesson_progress').select('lesson_slug, score, completed_at');
    if (error || !data) return {};
    const out: LessonProgress = {};
    for (const r of data as { lesson_slug: string; score: number; completed_at: string }[]) {
      out[r.lesson_slug] = { score: r.score, completedAt: Date.parse(r.completed_at) };
    }
    return out;
  }
  async saveLesson(slug: string, score: number) {
    const prev = (await this.lessons())[slug];
    const { error } = await this.sb.from('lesson_progress').upsert(
      { lesson_slug: slug, score: Math.max(score, prev?.score ?? 0), completed_at: iso(Date.now()) },
      { onConflict: 'user_id,lesson_slug' }
    );
    if (error) throw new Error(error.message);
  }
}

/** The right journal for this visitor: their account when signed in, otherwise this browser. */
export function getJournal(signedIn: boolean): JournalStore {
  const sb = signedIn ? getBrowserClient() : null;
  return sb ? new CloudJournal(sb) : new LocalJournal();
}

/** Copies sessions and lesson progress saved in this browser into the account, then clears them here. */
export async function moveLocalToCloud(cloud: JournalStore): Promise<number> {
  const local = new LocalJournal();
  const sessions = await local.list();
  for (const s of sessions) { await cloud.save(s); await local.remove(s.id); }
  const lessons = await local.lessons();
  for (const [slug, p] of Object.entries(lessons)) await cloud.saveLesson(slug, p.score);
  try { localStorage.removeItem('tt.lessons'); } catch { /* ignore */ }
  return sessions.length;
}
