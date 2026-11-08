import Anthropic from '@anthropic-ai/sdk';
import { NextResponse } from 'next/server';
import { supabaseConfigured } from '@/lib/supabase/config';
import { createClient } from '@/lib/supabase/server';
import { COACH_SYSTEM, buildCoachPrompt, validatePayload } from '@/lib/coachPrompt';

export const runtime = 'nodejs';
export const maxDuration = 30;

// Used only in guest mode (no Supabase): a per-server-instance limit by IP address.
const guestHits = new Map<string, number[]>();

const fail = (error: string, status: number) => NextResponse.json({ error }, { status });

export async function POST(req: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return fail('The AI coach is switched off on this site.', 503);

  const raw = await req.text();
  if (raw.length > 60_000) return fail('That trade is too large to review.', 413);
  let body: unknown;
  try { body = JSON.parse(raw); } catch { return fail('The request was not valid JSON.', 400); }
  const v = validatePayload(body);
  if (!v.ok) return fail(v.error, 400);

  const limit = Math.max(1, Number(process.env.COACH_DAILY_LIMIT) || 40);
  let supabase: Awaited<ReturnType<typeof createClient>> | null = null;

  if (supabaseConfigured) {
    supabase = await createClient();
    const { data } = await supabase.auth.getClaims();
    if (!data?.claims) return fail('Sign in to use the AI coach.', 401);
    const since = new Date(Date.now() - 86_400_000).toISOString();
    const { count, error } = await supabase.from('coach_requests').select('id', { count: 'exact', head: true }).gte('created_at', since);
    if (error) return fail('Could not check your AI review allowance. Try again in a moment.', 503);
    if ((count ?? 0) >= limit) return fail(`You have used all ${limit} AI reviews for the last 24 hours.`, 429);
  } else {
    const ip = (req.headers.get('x-forwarded-for') || 'local').split(',')[0].trim();
    const now = Date.now();
    const hits = (guestHits.get(ip) || []).filter(t => now - t < 86_400_000);
    if (hits.length >= limit) return fail(`You have used all ${limit} AI reviews for the last 24 hours.`, 429);
    hits.push(now);
    guestHits.set(ip, hits);
  }

  try {
    const client = new Anthropic({ apiKey });
    const msg = await client.messages.create({
      model: process.env.COACH_MODEL || 'claude-haiku-5-5',
      max_tokens: 600,
      system: COACH_SYSTEM,
      messages: [{ role: 'user', content: buildCoachPrompt(v.data) }]
    });
    const text = msg.content.map(b => (b.type === 'text' ? b.text : '')).join('').trim();
    if (supabase) await supabase.from('coach_requests').insert({});
    return NextResponse.json({ text });
  } catch (e) {
    console.error('AI coach request failed', e);
    return fail('The AI coach could not answer just now. Try again in a minute.', 502);
  }
}
