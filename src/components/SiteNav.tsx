'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Logo from './Logo';
import ThemeToggle from './ThemeToggle';

type Props = { user: { id: string; email: string | null } | null; accounts: boolean };

export default function SiteNav({ user, accounts }: Props) {
  const path = usePathname() || '/';
  const current = (href: string) => (path === href || path.startsWith(href + '/') ? 'page' : undefined);
  return (
    <header className="site-nav">
      <Link href="/" className="brand" aria-label="TradingTrainer home">
        <Logo />
        <span className="brand-name">TradingTrainer</span>
      </Link>
      <nav className="nav-links" aria-label="Main">
        <Link href="/replay" aria-current={current('/replay')}>Replay</Link>
        <Link href="/learn" aria-current={current('/learn')}>Learn</Link>
        <Link href="/stats" aria-current={current('/stats')}>Stats</Link>
      </nav>
      <div className="nav-right">
        <ThemeToggle />
        {accounts && (user ? (
          <Link className="nav-user" href="/account" aria-current={current('/account')}>
            <span className="avatar-dot" aria-hidden="true">{(user.email || '?').slice(0, 1).toUpperCase()}</span>
            <span>{user.email || 'Account'}</span>
          </Link>
        ) : (
          <Link className="btn" href={`/login?next=${encodeURIComponent(path === '/login' ? '/replay' : path)}`}>Sign in</Link>
        ))}
      </div>
    </header>
  );
}
