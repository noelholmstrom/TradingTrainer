import Link from 'next/link';

export const metadata = { title: 'Sign-in problem' };

export default async function AuthErrorPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <main className="page">
      <div className="auth-wrap">
        <h1>That link didn&apos;t work</h1>
        <p className="lede">{error || 'The sign-in link has expired or was already used.'}</p>
        <p className="lede" style={{ marginTop: 12 }}>Links work once and expire after a while. Request a new one and open it in the same browser.</p>
        <div className="cta-row"><Link className="btn primary big" href="/login">Back to sign in</Link></div>
      </div>
    </main>
  );
}
