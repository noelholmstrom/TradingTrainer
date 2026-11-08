import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { SUPABASE_KEY, SUPABASE_URL, supabaseConfigured } from './config';

/** Supabase client for server components, route handlers and server actions. */
export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(SUPABASE_URL, SUPABASE_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a Server Component. Safe to ignore: the proxy refreshes sessions.
        }
      }
    }
  });
}

export type SiteUser = { id: string; email: string | null };

/** The signed-in user, or null (also null in guest mode). */
export async function getUser(): Promise<SiteUser | null> {
  if (!supabaseConfigured) return null;
  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getClaims();
    const claims = data?.claims;
    if (!claims) return null;
    return { id: String(claims.sub), email: typeof claims.email === 'string' ? claims.email : null };
  } catch {
    return null;
  }
}
