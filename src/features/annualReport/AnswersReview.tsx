// ─── מסך צפייה בתשובות + טריגר לעריכה דרך עץ ההחלטות ─────────────────────
// טוען מ-Supabase את כל התשובות הפעילות של ה-session ומציג אותן לצפייה.
// כפתור "ערוך תשובות בעץ" מאפס את ה-currentQuestionId לשורש; השאלון
// יציג כל שאלה עם התשובה הקיימת מסומנת מראש (prefill) ויאפשר לשנותה.

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { AnnualReportSession, AnswerValue } from './types';
import { getQuestionById, formatAnswerForDisplay } from './engine';
import { getAnswersForSession, type StoredAnswer } from './repository';
import { annualReportTree } from './tree';

interface Props {
  session: AnnualReportSession;
  clientName: string;
  onStartEdit: () => Promise<void>;
  onBackToOutput: () => void;
}

export default function AnswersReview({ session, clientName, onStartEdit, onBackToOutput }: Props) {
  const [answers, setAnswers] = useState<StoredAnswer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await getAnswersForSession(session.id);
      setAnswers(list);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [session.id]);

  useEffect(() => { void reload(); }, [reload]);

  // סדר לפי הסדר הקאנוני בעץ
  const ordered = useMemo(() => {
    const orderInTree = Object.keys(annualReportTree.nodes);
    return answers.slice().sort((a, b) => {
      const ai = orderInTree.indexOf(a.questionId);
      const bi = orderInTree.indexOf(b.questionId);
      return ai - bi;
    });
  }, [answers]);

  async function handleEdit() {
    setStarting(true);
    try {
      await onStartEdit();
    } finally {
      setStarting(false);
    }
  }

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: '1rem 1.5rem 2rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.4rem' }}>📝 התשובות שניתנו — {clientName}, שנת {session.taxYear}</h2>
          <p style={{ margin: '.3rem 0 0', color: 'var(--gray-600)', fontSize: '.9rem' }}>
            צפייה בלבד. לעריכה — לחץ על "ערוך תשובות בעץ ההחלטות" למטה. השאלון ירוץ מההתחלה, התשובות הקיימות יהיו מסומנות מראש, ותוכל לשנות כל אחת — וגם להישאל שאלות חדשות אם השינוי פותח ענף חדש.
          </p>
        </div>
        <button className="btn btn-secondary" onClick={onBackToOutput}>חזרה לפלט ולמיפוי</button>
      </div>

      <div style={{ background: 'var(--blue-light)', padding: '1rem 1.25rem', borderRadius: 8, marginBottom: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontWeight: 600, color: 'var(--blue-dark, #1e40af)', marginBottom: '.25rem' }}>✏ ערוך תשובות בעץ ההחלטות</div>
          <div style={{ fontSize: '.85rem', color: 'var(--gray-700)' }}>
            השאלון יתחיל מהשורש. בכל שאלה תראה את התשובה הקודמת מסומנת. לחיצה על "המשך" משאירה אותה, או שנה לפני שתמשיך.
          </div>
        </div>
        <button
          className="btn btn-primary btn-lg"
          onClick={() => void handleEdit()}
          disabled={starting || loading}
        >
          {starting ? 'מתחיל…' : '✏ ערוך תשובות'}
        </button>
      </div>

      {error && (
        <div style={{ background: '#fee2e2', color: '#b91c1c', padding: '.75rem 1rem', borderRadius: 6, marginBottom: '1rem' }}>
          שגיאה: {error}
        </div>
      )}

      {loading ? (
        <div className="empty-state"><div className="empty-state-title">טוען תשובות…</div></div>
      ) : answers.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-title">אין עדיין תשובות שמורות</div>
          <div className="empty-state-desc">חזור לשאלון כדי להתחיל לענות.</div>
        </div>
      ) : (
        <div className="card">
          <div className="card-body" style={{ padding: 0 }}>
            <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
              {ordered.map((a) => {
                const node = getQuestionById(a.questionId);
                if (!node) return null;
                const display = formatAnswerForDisplay(a.questionId, a.value);
                return (
                  <li key={a.questionId} style={{ borderBottom: '1px solid var(--gray-100)', padding: '.75rem 1rem' }}>
                    <div style={{ fontWeight: 600 }}>{node.question}</div>
                    <div style={{ marginTop: '.25rem', color: 'var(--gray-700)' }}>
                      <span style={{ color: 'var(--gray-500)', fontSize: '.85rem' }}>תשובה: </span>
                      <span style={{ fontWeight: 500 }}>{display}</span>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

// AnswerValue re-exported for backwards type compatibility
export type { AnswerValue };
