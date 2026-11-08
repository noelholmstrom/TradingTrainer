import { NextResponse, type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/proxy';
import { supabaseConfigured } from '@/lib/supabase/config';

export async function proxy(request: NextRequest) {
  if (!supabaseConfigured) return NextResponse.next();
  return await updateSession(request);
}

export const config = {
  matcher: [
    // Everything except static files and images.
    '/((?!_next/static|_next/image|favicon.ico|icons/|manifest.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|csv)$).*)'
  ]
};
