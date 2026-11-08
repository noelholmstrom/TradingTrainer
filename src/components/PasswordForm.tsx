'use client';
import { useState } from 'react';
import { getBrowserClient } from '@/lib/supabase/client';

export default function PasswordForm({ highlight }: { highlight: boolean }) {
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const sb = getBrowserClient();
    if (!sb) return;
    if (pw.length < 8) { setMsg({ tone: 'err', text: 'Use a password of at least 8 characters.' }); return; }
    setBusy(true);
    const { error } = await sb.auth.updateUser({ password: pw });
    setBusy(false);
    setMsg(error ? { tone: 'err', text: error.message } : { tone: 'ok', text: 'Password changed.' });
    if (!error) setPw('');
  }
  return (
    <div className="auth-card" style={highlight ? { borderColor: 'var(--accent)' } : undefined}>
      <h2 style={{ margin: 0, fontSize: 18 }}>{highlight ? 'Choose a new password' : 'Change password'}</h2>
      <form onSubmit={submit}>
        <label>New password
          <input id="newPassword" type="password" autoComplete="new-password" minLength={8} required value={pw} onChange={e => setPw(e.target.value)} />
        </label>
        <button type="submit" className="btn primary" disabled={busy}>{busy ? 'Saving…' : 'Save password'}</button>
      </form>
      {msg && <div className={`auth-msg ${msg.tone}`} role="status">{msg.text}</div>}
    </div>
  );
}
