'use client';
import { useEffect, useRef } from 'react';
import { getJournal } from '@/lib/journal';
import { mountTrainer } from '@/lib/trainer';
import { TRAINER_MARKUP } from '@/lib/trainerMarkup';

type Props = {
  signedIn: boolean;
  aiCoach: boolean;
  lesson: { slug: string; title: string; task: string } | null;
};

async function requestReview(payload: unknown) {
  const res = await fetch('/api/coach', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || 'The AI coach could not answer. Try again in a moment.');
  return json as { text: string };
}

export default function TrainerClient({ signedIn, aiCoach, lesson }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const lessonKey = lesson ? lesson.slug : '';

  useEffect(() => {
    const root = host.current;
    if (!root) return;
    root.innerHTML = TRAINER_MARKUP;
    const q = new URLSearchParams(window.location.search);
    const handle = mountTrainer(root, {
      journal: getJournal(signedIn),
      coach: { enabled: aiCoach, request: requestReview },
      params: {
        start: q.has('start') ? Number(q.get('start')) : undefined,
        blind: q.has('blind') ? q.get('blind') === '1' : undefined,
        random: q.get('random') === '1',
        day: q.get('day') || undefined,
        tf: q.has('tf') ? Number(q.get('tf')) : undefined
      },
      lesson,
      debug: q.has('debug')
    });
    return () => {
      handle.destroy();
      root.innerHTML = '';
    };
    // The lesson object is recreated on every render; its slug identifies it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signedIn, aiCoach, lessonKey]);

  return (
    <div ref={host} className="trainer-host">
      <div className="trainer-loading">Loading the replay…</div>
    </div>
  );
}
