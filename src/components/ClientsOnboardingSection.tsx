// ─── "לקוחות בתהליך" — המקטע העליון של מסך הלקוחות ───────────────────────────
// שורה ללקוח: מה קורה איתו, מה הפעולה הבאה, ואצל מי הכדור. שורה נפתחת ומראה
// את המסע המלא.
//
// ‼ זו התצוגה התפעולית **היחידה** לקליטה במסך הזה. אין טאב "בקליטה" ואין מתג
// "מבט תפעולי" — שניהם הציגו את אותם אנשים פעם שנייה. ראה
// docs/DECISIONS-CLIENTS-ONBOARDING-SECTION.md.
//
// ‼ ההתקדמות, הפעולה הבאה והכדור מגיעים מ-utils/onboardingNext — אותה פונקציה
// שמניעה את הכרטיס ואת השולחן. מסך שמחשב "הבא בתור" אחרת סותר את השאר.

import { useMemo, useState } from 'react';
import type { Client } from '../types';
import { REPRESENTATION_STATUS_LABELS } from '../types';
import type { Engagement, OnboardingStep } from '../types/onboarding';
import {
  STEP_TYPE_LABELS, STEP_STATUS_LABELS, STEP_BALL_LABELS, isStepOpen,
} from '../types/onboarding';
import {
  NEXT_ACTION, isStuckStep, summarizeClientOnboarding,
} from '../utils/onboardingNext';

interface Props {
  clients: Client[];
  steps: OnboardingStep[];
  engagements: Engagement[];
  /** פתיחת דף המסע של הלקוח. */
  onOpen: (clientId: string) => void;
}

/** כמה שורות לפני ש"הצג הכל" נדרש. מעבר לזה המקטע בולע את המסך. */
const COLLAPSED_ROWS = 5;

function daysSince(iso?: string | null): number | null {
  if (!iso) return null;
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  return d >= 0 ? d : null;
}

/** שלב פתוח שתאריך היעד שלו עבר. */
function isOverdue(s: OnboardingStep): boolean {
  if (!s.dueDate || !isStepOpen(s.status)) return false;
  return new Date(s.dueDate) < new Date(new Date().toDateString());
}

/* סדר העדיפות שגיא הכריע (ה-5 במסמך ההחלטות):
   1 דורש פעולת משרד · 2 חסום או באיחור · 3 ממתין ללקוח/גורם חיצוני · 4 השאר.
   ‼ לקוח שתקוע *וגם* הכדור אצלי הוא דרגה 1 — "דורש פעולת משרד" חל גם עליו,
   ולכן בדיקת הכדור קודמת לבדיקת התקיעות. */
type Priority = 1 | 2 | 3 | 4;

export default function ClientsOnboardingSection({ clients, steps, engagements, onOpen }: Props) {
  const [showAll, setShowAll] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const byClient = useMemo(() => new Map(clients.map(c => [c.id, c])), [clients]);

  /* ‼ ההכללה נקבעת לפי ההתקשרות ולא לפי "יש שלבים פתוחים": קליטה שנסגרה
     יכולה להשאיר שלבי רשות פתוחים, ולקוח כזה כבר אינו בתהליך. */
  const onboardingEngByClient = useMemo(() => {
    const m = new Map<string, Engagement>();
    for (const e of engagements) {
      if (e.status !== 'onboarding') continue;
      const prev = m.get(e.clientId);
      if (!prev || (e.approvedAt ?? '') < (prev.approvedAt ?? '')) m.set(e.clientId, e);
    }
    return m;
  }, [engagements]);

  const rows = useMemo(() => {
    const summaries = summarizeClientOnboarding(steps);
    const byId = new Map(summaries.map(s => [s.clientId, s]));

    return [...onboardingEngByClient.entries()]
      .filter(([clientId]) => byClient.has(clientId))
      .map(([clientId, eng]) => {
        const s = byId.get(clientId);
        const client = byClient.get(clientId)!;
        const step = s?.next ?? null;
        const stuck = s?.stuck ?? null;
        const overdue = (s?.openSteps ?? []).some(isOverdue);
        const actionable = !!step && isStepOpen(step.status) && step.status !== 'locked';

        const priority: Priority =
          actionable && step.ball === 'me' ? 1
            : stuck || overdue ? 2
              : actionable ? 3
                : 4;

        return {
          clientId,
          client,
          steps: s?.steps ?? [],
          step,
          stuck,
          overdue,
          actionable,
          priority,
          done: s?.done ?? 0,
          total: s?.total ?? 0,
          days: daysSince(eng.approvedAt ?? eng.createdAt),
        };
      })
      .sort((a, b) => (a.priority - b.priority) || ((b.days ?? -1) - (a.days ?? -1)));
  }, [steps, byClient, onboardingEngByClient]);

  if (rows.length === 0) return null;

  const shown = showAll ? rows : rows.slice(0, COLLAPSED_ROWS);

  return (
    <section className="cob" aria-label="לקוחות בתהליך">
      <div className="cob-head">
        <h2 className="cob-title">לקוחות בתהליך</h2>
        <span className="cob-count">· {rows.length}</span>
        {rows.length > COLLAPSED_ROWS && (
          <button type="button" className="ui-linkbtn cob-all" onClick={() => setShowAll(v => !v)}>
            {showAll ? 'הצג פחות' : `הצג הכל · ${rows.length}`}
          </button>
        )}
      </div>

      <div className="cob-rows">
        {shown.map(r => {
          const name = `${r.client.firstName ?? ''} ${r.client.lastName ?? ''}`.trim() || 'לקוח ללא שם';
          const open = expanded === r.clientId;

          // ‼ הפעולה נוסחת עשייה כשהיא אצלי, ונוסחת המתנה כשהיא אצל מישהו אחר.
          const action = !r.step
            ? 'הכול ממתין למשהו אחר'
            : r.priority === 1
              ? NEXT_ACTION[r.step.stepType]
              : STEP_TYPE_LABELS[r.step.stepType];

          const ball = r.priority === 1
            ? 'אצלך'
            : !r.step
              ? null
              : r.actionable
                ? STEP_BALL_LABELS[r.step.ball]
                /* ‼ שלב נעול אינו "ממתין למישהו" — הוא ממתין לשלב אחר. בלי
                   המילה הזאת השורה מציגה שם שלב בלי הסבר למה הוא לא זז. */
                : 'נעול';

          const rep = r.client.representationStatus && r.client.representationStatus !== 'active'
            ? REPRESENTATION_STATUS_LABELS[r.client.representationStatus]
            : null;

          return (
            <div key={r.clientId} className={`cob-row${open ? ' is-open' : ''}`}>
              <div className="cob-main">
                {/* ‼ נקודה רק כשדרושה תשומת לב. "אצלי" אינו אזהרה — הוא עבודה. */}
                <span
                  className={`cob-dot${r.stuck ? ' is-stuck' : r.overdue ? ' is-late' : ''}`}
                  aria-hidden={!r.stuck && !r.overdue}
                  title={r.stuck ? 'תקוע' : r.overdue ? 'עבר תאריך היעד' : undefined}
                />

                <button type="button" className="cob-name" onClick={() => onOpen(r.clientId)}>
                  {name}
                </button>

                <span className="cob-meta">
                  {r.days === null ? '' : r.days === 0 ? 'נפתחה היום' : `יום ${r.days}`}
                  {r.total > 0 && ` · ${r.done} מתוך ${r.total}`}
                </span>

                <span className={`cob-action${r.priority === 1 ? ' is-mine' : ''}`}>
                  {action}
                  {ball && <span className="cob-ball">· {ball}</span>}
                </span>

                {rep && <span className="cob-rep">ייצוג: {rep}</span>}

                <button
                  type="button"
                  className="cob-toggle"
                  aria-expanded={open}
                  aria-label={open ? `סגור את המסע של ${name}` : `הצג את המסע של ${name}`}
                  onClick={() => setExpanded(v => (v === r.clientId ? null : r.clientId))}
                >
                  <span className={`cob-chev${open ? ' is-open' : ''}`} aria-hidden="true">⌄</span>
                </button>
              </div>

              {open && (
                <ol className="cob-journey">
                  {[...r.steps]
                    .sort((a, b) =>
                      (a.sortOrder ?? 0) - (b.sortOrder ?? 0) ||
                      (a.createdAt ?? '').localeCompare(b.createdAt ?? ''))
                    .map(s => {
                      const closed = !isStepOpen(s.status);
                      const bad = isStuckStep(s);
                      const late = isOverdue(s);
                      return (
                        <li
                          key={s.id}
                          className={`cob-step${closed ? ' is-done' : ''}${bad ? ' is-stuck' : late ? ' is-late' : ''}`}
                        >
                          <span className="cob-step-name">
                            {s.payload?.title || STEP_TYPE_LABELS[s.stepType]}
                          </span>
                          <span className="cob-step-status">{STEP_STATUS_LABELS[s.status]}</span>
                          {isStepOpen(s.status) && s.status !== 'locked' && (
                            <span className="cob-step-ball">{STEP_BALL_LABELS[s.ball]}</span>
                          )}
                          {s.requiredForClose === false && <span className="cob-step-opt">רשות</span>}
                        </li>
                      );
                    })}
                </ol>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
