'use client';
import { useState } from 'react';
import { getJournal } from '@/lib/journal';
import type { QuizQ } from '@/lib/lessons';

export default function LessonQuiz({ slug, questions, signedIn }: { slug: string; questions: QuizQ[]; signedIn: boolean }) {
  const [answers, setAnswers] = useState<(number | null)[]>(questions.map(() => null));
  const [checked, setChecked] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const score = answers.filter((a, i) => a === questions[i].answer).length;
  const all = answers.every(a => a != null);

  async function check(e: React.FormEvent) {
    e.preventDefault();
    setChecked(true);
    if (score === questions.length) {
      try {
        await getJournal(signedIn).saveLesson(slug, score);
        setSaved(signedIn ? 'Lesson marked as done on your account.' : 'Lesson marked as done in this browser.');
      } catch {
        setSaved('Could not save your progress just now.');
      }
    }
  }
  function retry() {
    setAnswers(questions.map(() => null));
    setChecked(false);
    setSaved(null);
  }

  return (
    <form className="quiz" onSubmit={check}>
      {questions.map((q, qi) => (
        <fieldset key={qi}>
          <legend>{qi + 1}. {q.q}</legend>
          {q.options.map((o, oi) => {
            const chosen = answers[qi] === oi;
            const cls = checked && chosen ? (oi === q.answer ? 'right' : 'wrong') : checked && oi === q.answer ? 'right' : '';
            return (
              <label key={oi} className={cls}>
                <input
                  type="radio" name={`q${qi}`} id={`q${qi}o${oi}`} checked={chosen} disabled={checked}
                  onChange={() => setAnswers(a => a.map((x, i) => (i === qi ? oi : x)))}
                />
                <span>{o}</span>
              </label>
            );
          })}
          {checked && <p className="why">{answers[qi] === q.answer ? 'Correct. ' : 'Not quite. '}{q.why}</p>}
        </fieldset>
      ))}
      {!checked ? (
        <div><button type="submit" className="btn primary big" disabled={!all}>Check answers</button></div>
      ) : (
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <span className="result">{score} of {questions.length} correct.</span>
          {score === questions.length ? <span className="pos-txt">{saved}</span> : <button type="button" className="btn" onClick={retry}>Try again</button>}
        </div>
      )}
    </form>
  );
}
