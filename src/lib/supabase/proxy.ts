import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { SUPABASE_KEY, SUPABASE_URL } from './config';

/** Refreshes the Supabase auth cookie on every request. Pages decide for themselves who may see them. */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  // Create a new client per request (never share it between requests).
  const supabase = createServerClient(SUPABASE_URL, SUPABASE_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => supabaseResponse.cookies.set(name, value, options));
        Object.entries(headers || {}).forEach(([key, value]) => supabaseResponse.headers.set(key, String(value)));
      }
    }
  });

  // Do not put code between createServerClient and getClaims(): getClaims() refreshes the session.
  const { data } = await supabase.auth.getClaims();

  if (!data?.claims && request.nextUrl.pathname.startsWith('/account')) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('next', '/account');
    const redirect = NextResponse.redirect(url);
    supabaseResponse.cookies.getAll().forEach(c => redirect.cookies.set(c));
    return redirect;
  }

  return supabaseResponse;
}
