'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { getJournal, type LessonProgress } from '@/lib/journal';

type Item = { slug: string; title: string; minutes: number; summary: string };

export default function LessonList({ items, signedIn }: { items: Item[]; signedIn: boolean }) {
  const [progress, setProgress] = useState<LessonProgress>({});
  useEffect(() => {
    let live = true;
    getJournal(signedIn).lessons().then(p => { if (live) setProgress(p); }).catch(() => {});
    return () => { live = false; };
  }, [signedIn]);
  const done = items.filter(i => progress[i.slug]).length;
  return (
    <>
      <p className="hint" style={{ marginTop: 14 }}>{done} of {items.length} lessons completed{signedIn ? '' : ' in this browser'}.</p>
      <ol className="lesson-list">
        {items.map((l, i) => (
          <li key={l.slug}>
            <Link className="lesson-item" href={`/learn/${l.slug}`}>
              <span className="no">{String(i + 1).padStart(2, '0')}</span>
              <span>
                <h3>{l.title}</h3>
                <p>{l.summary}</p>
              </span>
              <span className="meta">
                <span>{l.minutes} min</span>
                {progress[l.slug] && <span className="done-chip">Done</span>}
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </>
  );
}
