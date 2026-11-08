import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// Email links (sign-up confirmation, sign-in link, password reset) land here with a one-time code.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  let next = searchParams.get('next') || '/replay';
  if (!next.startsWith('/') || next.startsWith('//')) next = '/replay';

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${next}`);
    return NextResponse.redirect(`${origin}/auth/error?error=${encodeURIComponent(error.message)}`);
  }
  const err = searchParams.get('error_description') || 'That link is missing its sign-in code. Request a new one.';
  return NextResponse.redirect(`${origin}/auth/error?error=${encodeURIComponent(err)}`);
}
