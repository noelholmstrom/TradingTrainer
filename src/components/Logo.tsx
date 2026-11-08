export default function Logo() {
  return (
    <svg viewBox="0 0 26 26" aria-hidden="true">
      <rect x="0.5" y="0.5" width="25" height="25" rx="6" fill="var(--raised)" stroke="var(--line-strong)" />
      <path d="M8 5.5v15" stroke="var(--text-2)" strokeWidth="1.4" />
      <rect x="5.6" y="9" width="4.8" height="7.5" rx="1" fill="var(--up)" />
      <path d="M14.5 8.5l6.5 4.5-6.5 4.5z" fill="var(--accent)" />
    </svg>
  );
}
