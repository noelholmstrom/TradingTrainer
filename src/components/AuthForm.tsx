'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { getBrowserClient } from '@/lib/supabase/client';

type Mode = 'signin' | 'signup' | 'link' | 'reset';
type Msg = { tone: 'ok' | 'err'; text: string } | null;

export default function AuthForm({ next }: { next: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);

  const callback = (to: string) => `${window.location.origin}/auth/callback?next=${encodeURIComponent(to)}`;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const sb = getBrowserClient();
    if (!sb) return;
    setBusy(true);
    setMsg(null);
    try {
      if (mode === 'signin') {
        const { error } = await sb.auth.signInWithPassword({ email, password });
        if (error) throw error;
        router.push(next);
        router.refresh();
        return;
      }
      if (mode === 'signup') {
        if (password.length < 8) throw new Error('Use a password of at least 8 characters.');
        const { data, error } = await sb.auth.signUp({ email, password, options: { emailRedirectTo: callback(next) } });
        if (error) throw error;
        if (data.session) { router.push(next); router.refresh(); return; }
        setMsg({ tone: 'ok', text: `Check ${email} for a confirmation link. Open it in this browser to finish creating your account.` });
      } else if (mode === 'link') {
        const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: callback(next) } });
        if (error) throw error;
        setMsg({ tone: 'ok', text: `We sent a sign-in link to ${email}. Open it in this browser.` });
      } else {
        const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: callback('/account?reset=1') });
        if (error) throw error;
        setMsg({ tone: 'ok', text: `If ${email} has an account, a link to choose a new password is on its way.` });
      }
    } catch (err) {
      setMsg({ tone: 'err', text: err instanceof Error ? err.message : 'Something went wrong. Try again.' });
    } finally {
      setBusy(false);
    }
  }

  const pick = (m: Mode) => { setMode(m); setMsg(null); };
  const action = { signin: 'Sign in', signup: 'Create account', link: 'Email me a sign-in link', reset: 'Send reset link' }[mode];

  return (
    <div className="auth-card">
      <div className="auth-tabs" role="group" aria-label="Sign-in method">
        <button type="button" aria-pressed={mode === 'signin' || mode === 'reset'} onClick={() => pick('signin')}>Sign in</button>
        <button type="button" aria-pressed={mode === 'signup'} onClick={() => pick('signup')}>Create account</button>
        <button type="button" aria-pressed={mode === 'link'} onClick={() => pick('link')}>Email link</button>
      </div>
      <form onSubmit={submit}>
        <label>Email
          <input id="authEmail" type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} />
        </label>
        {(mode === 'signin' || mode === 'signup') && (
          <label>Password
            <input id="authPassword" type="password" autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} required minLength={mode === 'signup' ? 8 : undefined} value={password} onChange={e => setPassword(e.target.value)} />
          </label>
        )}
        {mode === 'reset' && <p className="hint" style={{ margin: 0 }}>Enter your email and we will send a link to choose a new password.</p>}
        <button type="submit" className="btn primary big" disabled={busy}>{busy ? 'Working…' : action}</button>
      </form>
      {mode === 'signin' && <button type="button" className="linkish" onClick={() => pick('reset')}>Forgot your password?</button>}
      {mode === 'reset' && <button type="button" className="linkish" onClick={() => pick('signin')}>Back to sign in</button>}
      {msg && <div className={`auth-msg ${msg.tone}`} role="status">{msg.text}</div>}
    </div>
  );
}
