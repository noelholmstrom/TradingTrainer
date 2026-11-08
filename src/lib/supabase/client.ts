import { createBrowserClient } from '@supabase/ssr';
import { SUPABASE_KEY, SUPABASE_URL, supabaseConfigured } from './config';

/** Supabase client for the browser, or null in guest mode. */
export function getBrowserClient() {
  if (!supabaseConfigured) return null;
  return createBrowserClient(SUPABASE_URL, SUPABASE_KEY);
}
