import { NextResponse, type NextRequest } from 'next/server';
import E from '@/lib/engine';
import { CONTINUOUS, looksLikeDatabentoKey, parseOhlcvJson, rangeForm, upstreamError } from '@/lib/databento';
import { isDataOwner, ownerDataEnabled } from '@/lib/realData';
import { supabaseConfigured } from '@/lib/supabase/config';
import { getUser } from '@/lib/supabase/server';

// Real 1-minute NQ/MNQ bars from Databento for a few Globex sessions.
// The key is either the trader's own (sent per request, never stored or logged)
// or the site's key, which only the owners in DATA_OWNER_EMAILS may use.

export const runtime = 'nodejs';
export const maxDuration = 30;

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_SPAN_DAYS = 14;
const hits = new Map<string, number[]>();

const fail = (error: string, status: number) =>
  NextResponse.json({ error }, { status, headers: { 'Cache-Control': 'no-store' } });

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const from = q.get('from') || '';
  const to = q.get('to') || '';
  const symbol = (q.get('symbol') || 'NQ').toUpperCase() as keyof typeof CONTINUOUS;
  if (!(symbol in CONTINUOUS)) return fail('Unknown symbol.', 400);
  if (!DATE.test(from) || !DATE.test(to) || from > to) return fail('Pick a valid date range.', 400);
  if (from < E.FIRST_REAL_DAY || to > E.msToDate(Date.now())) {
    return fail(`Real data covers ${E.FIRST_REAL_DAY} up to the last finished session.`, 400);
  }
  if ((E.dateToMs(to) - E.dateToMs(from)) / 86_400_000 > MAX_SPAN_DAYS) return fail(`Ask for at most ${MAX_SPAN_DAYS} days at a time.`, 400);

  const ip = (req.headers.get('x-forwarded-for') || 'local').split(',')[0].trim();
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter(t => now - t < 600_000);
  if (recent.length >= 120) return fail('Too many requests. Wait a few minutes and try again.', 429);
  recent.push(now);
  if (hits.size > 5000) hits.clear();
  hits.set(ip, recent);

  let apiKey = (req.headers.get('x-databento-key') || '').trim();
  if (apiKey) {
    if (!looksLikeDatabentoKey(apiKey)) return fail("That doesn't look like a Databento API key. Keys start with db-.", 400);
  } else {
    const user = supabaseConfigured ? await getUser() : null;
    if (!ownerDataEnabled() || !isDataOwner(user?.email)) return fail('Add your Databento API key under Data to load real days.', 401);
    apiKey = process.env.DATABENTO_API_KEY as string;
  }

  // Sessions run 18:00 ET the evening before to 17:00 ET.
  const start = new Date(E.etToUtc(E.addDays(from, -1), 18, 0) * 1000).toISOString();
  const end = new Date(E.etToUtc(to, 17, 0) * 1000).toISOString();
  const base = (process.env.DATABENTO_BASE_URL || 'https://hist.databento.com').replace(/\/+$/, '');

  let res: Response;
  try {
    res = await fetch(`${base}/v0/timeseries.get_range`, {
      method: 'POST',
      headers: {
        Authorization: 'Basic ' + Buffer.from(apiKey + ':').toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json'
      },
      body: rangeForm({ symbol: CONTINUOUS[symbol], start, end }),
      signal: AbortSignal.timeout(25_000),
      cache: 'no-store'
    });
  } catch {
    return fail('Databento did not answer in time. Try again.', 504);
  }

  if (!res.ok) {
    let detail = '';
    try {
      const j = await res.json();
      if (j && typeof j.detail === 'string') detail = j.detail;
    } catch { /* not JSON */ }
    const e = upstreamError(res.status, detail);
    return fail(e.error, e.status);
  }

  const { bars, skipped } = parseOhlcvJson(await res.text());
  return NextResponse.json(
    { symbol, from, to, count: bars.t.length, skipped, bars },
    // Private: the data is licensed to whoever's key fetched it, so no shared caches.
    { headers: { 'Cache-Control': 'private, max-age=604800' } }
  );
}
