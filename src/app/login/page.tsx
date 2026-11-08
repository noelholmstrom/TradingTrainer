import { redirect } from 'next/navigation';
import AuthForm from '@/components/AuthForm';
import { supabaseConfigured } from '@/lib/supabase/config';
import { getUser } from '@/lib/supabase/server';

export const metadata = { title: 'Sign in' };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next: rawNext } = await searchParams;
  const next = rawNext && rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : '/replay';
  const user = await getUser();
  if (user) redirect(next);
  return (
    <main className="page">
      <div className="auth-wrap">
        <span className="eyebrow">Your account</span>
        <h1>Sign in to keep your progress</h1>
        <p className="lede" style={{ marginBottom: 18 }}>
          An account saves every session, trade and coaching note, so your stats follow you to any device.
        </p>
        {supabaseConfigured ? (
          <AuthForm next={next} />
        ) : (
          <div className="notice">
            <b>Accounts are switched off on this site for now.</b> You can still trade the replay; your journal is kept in this browser.
            The site owner turns accounts on by connecting Supabase (see the README).
          </div>
        )}
      </div>
    </main>
  );
}
