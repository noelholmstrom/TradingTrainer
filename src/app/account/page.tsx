import Link from 'next/link';
import { redirect } from 'next/navigation';
import PasswordForm from '@/components/PasswordForm';
import { supabaseConfigured } from '@/lib/supabase/config';
import { getUser } from '@/lib/supabase/server';

export const metadata = { title: 'Account' };

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ reset?: string }> }) {
  if (!supabaseConfigured) redirect('/login');
  const user = await getUser();
  if (!user) redirect('/login?next=/account');
  const { reset } = await searchParams;
  return (
    <main className="page">
      <div className="auth-wrap">
        <span className="eyebrow">Account</span>
        <h1>{user.email}</h1>
        <p className="lede">Your sessions, trades, coaching notes and lesson progress are saved to this account and visible only to you.</p>
        <div className="cta-row" style={{ marginBottom: 24 }}>
          <Link className="btn big" href="/stats">See your stats</Link>
          <form action="/auth/signout" method="post"><button className="btn big" type="submit">Sign out</button></form>
        </div>
        <PasswordForm highlight={reset === '1'} />
      </div>
    </main>
  );
}
