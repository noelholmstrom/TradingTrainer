import { NextResponse, type NextRequest } from 'next/server';
import { supabaseConfigured } from '@/lib/supabase/config';
import { createClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  if (supabaseConfigured) {
    const supabase = await createClient();
    await supabase.auth.signOut();
  }
  return NextResponse.redirect(new URL('/', request.url), { status: 303 });
}
