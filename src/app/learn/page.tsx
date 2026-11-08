import LessonList from '@/components/LessonList';
import { LESSONS } from '@/lib/lessons';
import { getUser } from '@/lib/supabase/server';

export const metadata = { title: 'Learn' };

export default async function LearnPage() {
  const user = await getUser();
  const items = LESSONS.map(l => ({ slug: l.slug, title: l.title, minutes: l.minutes, summary: l.summary }));
  return (
    <main className="page">
      <span className="eyebrow">Module 1</span>
      <h1>Foundations of trading Nasdaq-100 futures</h1>
      <p className="lede">Six short lessons, each ending in an exercise in the replay and a three-question check. Work through them in order; each one builds on the last.</p>
      <LessonList items={items} signedIn={!!user} />
    </main>
  );
}
