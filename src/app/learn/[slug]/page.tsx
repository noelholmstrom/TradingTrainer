import Link from 'next/link';
import { notFound } from 'next/navigation';
import LessonQuiz from '@/components/LessonQuiz';
import { LESSONS, practiceHref, type Block } from '@/lib/lessons';
import { getUser } from '@/lib/supabase/server';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const l = LESSONS.find(x => x.slug === slug);
  return { title: l ? l.title : 'Lesson' };
}

function renderBlock(b: Block, k: number) {
  if ('h' in b) return <h2 key={k}>{b.h}</h2>;
  if ('p' in b) return <p key={k}>{b.p}</p>;
  if ('ul' in b) return <ul key={k}>{b.ul.map((x, i) => <li key={i}>{x}</li>)}</ul>;
  return (
    <div className="example" key={k}>
      <p><b>{b.ex.title}</b></p>
      {b.ex.lines.map((x, i) => <p key={i}>{x}</p>)}
    </div>
  );
}

export default async function LessonPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const i = LESSONS.findIndex(x => x.slug === slug);
  if (i < 0) notFound();
  const l = LESSONS[i], prev = LESSONS[i - 1], next = LESSONS[i + 1];
  const user = await getUser();
  return (
    <main className="page">
      <article className="lesson">
        <div className="crumbs"><Link href="/learn">Learn</Link> · Lesson {i + 1} of {LESSONS.length} · {l.minutes} min</div>
        <h1>{l.title}</h1>
        <p className="lede">{l.summary}</p>
        {l.blocks.map(renderBlock)}
        {l.terms && (
          <dl className="key-terms">
            {l.terms.map(([t, d]) => <div key={t} style={{ display: 'contents' }}><dt>{t}</dt><dd>{d}</dd></div>)}
          </dl>
        )}
        <section className="practice" aria-labelledby="practice-h">
          <h2 id="practice-h">Practice in the replay</h2>
          <p>{l.practice.task}</p>
          <div><Link className="btn primary big" href={practiceHref(l)}>Start the exercise</Link></div>
        </section>
        <h2>Check your understanding</h2>
        <LessonQuiz slug={l.slug} questions={l.quiz} signedIn={!!user} />
        <nav className="lesson-nav" aria-label="Lessons">
          {prev ? <Link className="btn" href={`/learn/${prev.slug}`}>← {prev.title}</Link> : <span />}
          {next ? <Link className="btn" href={`/learn/${next.slug}`}>{next.title} →</Link> : <Link className="btn" href="/stats">Go to your stats →</Link>}
        </nav>
      </article>
    </main>
  );
}
