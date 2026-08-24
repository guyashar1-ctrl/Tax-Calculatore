// ─── קליטות על השולחן — שורה אחת ללקוח ───────────────────────────────────────
// ‼ הגרסה הקודמת הציגה שורה לכל שלב פתוח. לקוח אחד בקליטה מילא שש שורות,
// ועשרה לקוחות היו ממלאים שישים — עומס שמסתיר בדיוק את מה שהוא אמור להבליט.
// עכשיו: שורה ללקוח, והיא אומרת את הפעולה הבאה שלו.
//
// ‼ שלושה מקטעים ולא אחד: "תקוע" קודם לכול, "אצלך" הוא העבודה של היום,
// ו"ממתינים לאחרים" מקופל לשורה אחת — כי אין בו מה לעשות, אבל צריך לדעת שהוא שם.

import { useState } from 'react';
import type { Client } from '../types';
import type { OnboardingStep } from '../types/onboarding';
import { STEP_BALL_LABELS, STEP_STATUS_LABELS, STEP_TYPE_LABELS } from '../types/onboarding';
import type { ClientOnboardingSummary } from '../utils/onboardingNext';
import { NEXT_ACTION, summarizeClientOnboarding } from '../utils/onboardingNext';

interface Props {
  steps: OnboardingStep[];
  clients: Client[];
  onOpen?: (clientId: string) => void;
  /** הכנת מייל תזכורת לשלב תקוע. חסר ⇒ הכפתור לא מוצג. */
  onRemind?: (step: OnboardingStep, clientId: string) => void;
}

/** מה כתוב בשורה של לקוח תקוע — הסיבה, לא רק העובדה. */
function stuckLine(s: OnboardingStep): string {
  const name = STEP_TYPE_LABELS[s.stepType];
  if (s.status === 'blocked') return `${name} - חסום`;
  if (s.status === 'failed') return `${name} - נכשל`;
  if (s.stepType === 'retainer_authorization') return `${name} - חודש החיוב מתקרב`;
  if (s.ball === 'client') return `${name} - הלקוח לא הגיב`;
  if (s.ball === 'prev_accountant') return `${name} - הרו״ח הקודם לא הגיב`;
  return `${name} - ${STEP_STATUS_LABELS[s.status]}`;
}

export default function OnboardingWaitingSection({ steps, clients, onOpen, onRemind }: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const [othersOpen, setOthersOpen] = useState(false);

  // ‼ שורה שאין לה כרטיס לקוח היא רוח רפאים — שאריות של קליטה שכרטיסה נמחק
  // ועוד לא נטענו מחדש. פעם היא הוצגה בשם "לקוח", וזה נראה כמו לקוח אמיתי
  // בלי שם. עדיף לא להציג אותה בכלל.
  const known = new Set(clients.map(c => c.id));
  const summaries = summarizeClientOnboarding(steps).filter(s => known.has(s.clientId));
  if (summaries.length === 0) return null;

  const nameOf = (clientId: string) => {
    const c = clients.find(x => x.id === clientId);
    return c ? `${c.firstName} ${c.lastName}`.trim() || 'לקוח ללא שם' : '';
  };

  const stuck = summaries.filter(s => s.bucket === 'stuck');
  const mine = summaries.filter(s => s.bucket === 'mine');
  const others = summaries.filter(s => s.bucket === 'others');

  const row = (sum: ClientOnboardingSummary, tone: 'stuck' | 'mine') => {
    const step = tone === 'stuck' ? sum.stuck : sum.next;
    if (!step) return null;
    return (
      <div key={sum.clientId} style={{
        display: 'flex', alignItems: 'center', gap: '.6rem', flexWrap: 'wrap',
        padding: tone === 'stuck' ? '.5rem .55rem' : '.45rem .2rem',
        borderTop: '1px solid var(--hairline-2)', fontSize: 'var(--fs-13)',
        background: tone === 'stuck' ? 'var(--red-light)' : undefined,
        borderRadius: tone === 'stuck' ? 'var(--radius)' : undefined,
      }}>
        <strong style={{ minWidth: 120 }}>{nameOf(sum.clientId)}</strong>
        <span style={{
          flex: 1, minWidth: 150,
          color: tone === 'stuck' ? 'var(--err)' : 'var(--ink-2)',
          fontWeight: tone === 'stuck' ? 600 : undefined,
        }}>
          {tone === 'stuck' ? stuckLine(step) : NEXT_ACTION[step.stepType]}
        </span>
        <span style={{ fontSize: 'var(--fs-12)', color: 'var(--ink-3)', whiteSpace: 'nowrap' }}>
          {sum.done}/{sum.total} הושלמו
        </span>
        {tone === 'stuck' && onRemind && step.ball !== 'me' && (
          <button type="button" className="btn btn-sm btn-secondary"
            onClick={() => onRemind(step, sum.clientId)}>הכן תזכורת</button>
        )}
        {onOpen && (
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => onOpen(sum.clientId)}>
            לקליטה ←
          </button>
        )}
      </div>
    );
  };

  return (
    <section className="task-group task-group-green">
      <header className="task-group-header" onClick={() => setCollapsed(c => !c)}>
        <span className={`task-group-arrow ${collapsed ? 'collapsed' : ''}`}>▾</span>
        <span className="task-group-icon">📥</span>
        <span className="task-group-title">קליטות</span>
        <span className="task-group-count">{summaries.length}</span>
      </header>

      {!collapsed && (
        <div className="task-group-body">
          {stuck.length > 0 && (
            <>
              <div style={{
                fontSize: 'var(--fs-12)', fontWeight: 600, color: 'var(--err)',
                padding: '.4rem .2rem .1rem',
              }}>⚠ תקוע - טפל היום</div>
              {stuck.map(s => row(s, 'stuck'))}
            </>
          )}

          {mine.length > 0 && (
            <>
              <div style={{
                fontSize: 'var(--fs-12)', fontWeight: 600, color: 'var(--ink-2)',
                padding: stuck.length > 0 ? '.7rem .2rem .1rem' : '.4rem .2rem .1rem',
              }}>הכדור אצלך</div>
              {mine.map(s => row(s, 'mine'))}
            </>
          )}

          {others.length > 0 && (
            <div style={{ borderTop: '1px solid var(--hairline-2)', marginTop: '.4rem' }}>
              <button type="button"
                onClick={() => setOthersOpen(o => !o)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '.4rem', width: '100%',
                  background: 'none', border: 'none', cursor: 'pointer', textAlign: 'start',
                  padding: '.5rem .2rem', fontSize: 'var(--fs-13)', color: 'var(--ink-3)',
                  font: 'inherit', fontFamily: 'inherit',
                }}>
                <span style={{ fontSize: 'var(--fs-12)' }}>{othersOpen ? '▾' : '◂'}</span>
                <span style={{ fontSize: 'var(--fs-13)' }}>
                  {others.length} {others.length === 1 ? 'קליטה ממתינה' : 'קליטות ממתינות'} לאחרים -
                  לקוח, רשות או רו״ח קודם. אין מה לעשות בהן כרגע.
                </span>
              </button>
              {othersOpen && others.map(sum => (
                <div key={sum.clientId} style={{
                  display: 'flex', alignItems: 'center', gap: '.6rem', flexWrap: 'wrap',
                  padding: '.4rem .2rem .4rem 1.2rem', fontSize: 'var(--fs-13)',
                  color: 'var(--ink-3)',
                }}>
                  <span style={{ minWidth: 120 }}>{nameOf(sum.clientId)}</span>
                  <span style={{ flex: 1, minWidth: 150 }}>
                    {sum.next ? STEP_TYPE_LABELS[sum.next.stepType] : '-'}
                    {sum.next && <> · הכדור {STEP_BALL_LABELS[sum.next.ball]}</>}
                  </span>
                  <span style={{ fontSize: 'var(--fs-12)', whiteSpace: 'nowrap' }}>
                    {sum.done}/{sum.total}
                  </span>
                  {onOpen && (
                    <button type="button" className="btn btn-sm btn-ghost"
                      onClick={() => onOpen(sum.clientId)}>לקליטה ←</button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
