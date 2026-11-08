'use client';
import { useEffect, useState } from 'react';

type Mode = 'system' | 'light' | 'dark';
const ORDER: Mode[] = ['system', 'light', 'dark'];
const LABEL: Record<Mode, string> = { system: 'Theme follows your device', light: 'Light theme', dark: 'Dark theme' };

export default function ThemeToggle() {
  const [mode, setMode] = useState<Mode>('system');
  useEffect(() => {
    try {
      const t = localStorage.getItem('tt.theme');
      if (t === 'light' || t === 'dark') setMode(t);
    } catch { /* storage blocked */ }
  }, []);
  const cycle = () => {
    const m = ORDER[(ORDER.indexOf(mode) + 1) % ORDER.length];
    setMode(m);
    try { if (m === 'system') localStorage.removeItem('tt.theme'); else localStorage.setItem('tt.theme', m); } catch { /* not saved */ }
    if (m === 'system') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', m);
  };
  return (
    <button type="button" className="btn icon theme-btn" onClick={cycle} aria-label={`${LABEL[mode]}. Change theme`} title={LABEL[mode]}>
      {mode === 'system' && (
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true"><rect x="1.5" y="2.5" width="13" height="9" rx="1.5" /><path d="M5.5 14h5M8 11.5V14" /></svg>
      )}
      {mode === 'light' && (
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true"><circle cx="8" cy="8" r="3" /><path d="M8 1v2M8 13v2M1 8h2M13 8h2M3 3l1.4 1.4M11.6 11.6 13 13M3 13l1.4-1.4M11.6 4.4 13 3" /></svg>
      )}
      {mode === 'dark' && (
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true"><path d="M13.5 9.5A5.8 5.8 0 0 1 6.5 2.5a5.8 5.8 0 1 0 7 7z" /></svg>
      )}
    </button>
  );
}
