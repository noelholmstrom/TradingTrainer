import TrainerClient from '@/components/TrainerClient';
import { LESSONS } from '@/lib/lessons';
import { getUser } from '@/lib/supabase/server';

export const metadata = { title: 'Replay' };

export default async function ReplayPage({ searchParams }: { searchParams: Promise<{ lesson?: string }> }) {
  const { lesson: slug } = await searchParams;
  const user = await getUser();
  const l = slug ? LESSONS.find(x => x.slug === slug) : undefined;
  return (
    <main>
      <h1 className="sr">Replay trainer</h1>
      <TrainerClient
        signedIn={!!user}
        aiCoach={Boolean(process.env.ANTHROPIC_API_KEY)}
        lesson={l ? { slug: l.slug, title: l.title, task: l.practice.task } : null}
      />
    </main>
  );
}
