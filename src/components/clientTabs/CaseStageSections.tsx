// ─── שלבי-העל של התיק: CASE → STAGE → TASK ──────────────────────────────────
// המודל המאושר של מרכז התיק: כל השלבים נראים תמיד; שלב פעיל פתוח ומציג את
// הבקשות שלו, שלב שהושלם או שטרם התחיל מקופל לשורת סיכום. ההיררכיה על המסך,
// לא רשימה שטוחה שבה לא ברור מה שייך למה.
//
// ‼ שלב-על בלי עמודת סטטוס: פעיל / הושלם / עתידי נגזרים תמיד מהבקשות שבתוכו
// (מיגרציה 79) — אין מה שיסתנכרן לא נכון.
// ‼ בקשת הייצוג היא שלב-על וירטואלי: היא מסונכרנת מטריגר ואינה ניתנת לעריכה,
// אבל בהיררכיה היא עומדת כשלב לעצמה — לא שורה שנבלעת בין המסמכים.
// ‼ תלות אינה היררכיה: בקשות שתלויות זו בזו יושבות באותה רמה בתוך השלב,
// והנעילה מוסברת על השורה עצמה ("ייפתח אחרי X").

import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { OnboardingStep } from '../../types/onboarding';
import { isStepOpen } from '../../types/onboarding';

export interface JourneyStageRow {
  id: string;
  title: string;
  sortOrder: number;
}

interface Section {
  key: string;
  title: string;
  /** שלב אמיתי מהמסד (ניתן לעריכה בהמשך) או דלי ברירת-מחדל נגזר. */
  stageId?: string;
  members: OnboardingStep[];        // כל החברים — לגזירת המצב
  visible: OnboardingStep[];        // אחרי מסנן הכדור — לרינדור
}

type StageState = 'active' | 'done' | 'future';

/** דלי ברירת-מחדל לבקשה שלא שויכה לשלב-על — גס בכוונה. קיבוץ לפי שבעת
 *  ה-tracks כבר נוסה ונפסל ("בקשה אחת בשש קופסאות"). */
function defaultBucket(step: OnboardingStep, clientBucketTitle: string): { key: string; title: string; order: number } {
  switch (step.track) {
    case 'prev_accountant': return { key: '__prev', title: 'חומרים מהרו״ח הקודם', order: 3 };
    case 'authorities':     return { key: '__auth', title: 'רשויות', order: 4 };
    case 'internal':
    case 'review':          return { key: '__office', title: 'עבודה פנימית', order: 5 };
    default:                return { key: '__client', title: clientBucketTitle, order: 2 };
  }
}

function sectionState(members: OnboardingStep[]): StageState {
  if (members.length === 0) return 'future';
  const open = members.filter(s => isStepOpen(s.status));
  if (open.length === 0) return 'done';
  if (open.every(s => s.status === 'locked')) return 'future';
  return 'active';
}

export default function CaseStageSections({
  steps, visibleSteps, stages, renderStep, ballFilterActive, headActions,
  clientBucketTitle = 'קליטת הלקוח', composer,
}: {
  /** כל בקשות הלקוח (בלי מבוטלות), בסדר של הרו"ח. */
  steps: OnboardingStep[];
  /** אחרי מסנן הכדור — מה שמרונדר בפועל. */
  visibleSteps: OnboardingStep[];
  stages: JourneyStageRow[];
  renderStep: (s: OnboardingStep) => ReactNode;
  ballFilterActive: boolean;
  /** כפתורי "תבניות" / "+ בקשה" — יושבים על כותרת המקטע. */
  headActions?: ReactNode;
  /** שם דלי ברירת-המחדל של בקשות הלקוח: "קליטת הלקוח" בקליטה, "בקשות" ללקוח פעיל. */
  clientBucketTitle?: string;
  /**
   * הקומפוזר של "+ הוסף בקשה או משימה לשלב הזה". השלב נגזר מההקשר —
   * stageId של שלב-על אמיתי, או null לדליי ברירת-המחדל. חסר ⇒ אין כפתור הוספה.
   */
  composer?: (stageId: string | null, close: () => void) => ReactNode;
}) {
  /** דריסת קיפול ידנית; undefined = לפי המצב הנגזר. */
  const [openOverride, setOpenOverride] = useState<Record<string, boolean>>({});
  /** באיזה שלב-על פתוח כרגע קומפוזר. אחד בכל רגע — זה מסלול מהיר, לא טפסים. */
  const [composeIn, setComposeIn] = useState<string | null>(null);

  const sections = useMemo<Section[]>(() => {
    const visibleIds = new Set(visibleSteps.map(s => s.id));
    const byKey = new Map<string, Section>();
    // סדר: ייצוג (1) → שלבים בעלי-שם של גיא (1.5+) → קליטת הלקוח (2) →
    // רו"ח קודם (3) → רשויות (4) → עבודה פנימית (5).
    const ordered: { order: number; sec: Section }[] = [];
    const ensure = (key: string, title: string, order: number, stageId?: string) => {
      let sec = byKey.get(key);
      if (!sec) {
        sec = { key, title, stageId, members: [], visible: [] };
        byKey.set(key, sec);
        ordered.push({ order, sec });
      }
      return sec;
    };

    for (const st of stages) ensure(st.id, st.title, 1.5 + st.sortOrder / 1e6, st.id);

    for (const s of steps) {
      let sec: Section;
      if (s.stepType === 'representation') {
        sec = ensure('__rep', 'בקשת הייצוג', 1);
      } else if (s.stageId && byKey.has(s.stageId)) {
        sec = byKey.get(s.stageId)!;
      } else {
        const b = defaultBucket(s, clientBucketTitle);
        sec = ensure(b.key, b.title, b.order);
      }
      sec.members.push(s);
      if (visibleIds.has(s.id)) sec.visible.push(s);
    }

    ordered.sort((a, b) => a.order - b.order);
    return ordered.map(o => o.sec).filter(sec => sec.members.length > 0);
  }, [steps, visibleSteps, stages]);

  if (sections.length === 0) return null;

  return (
    <div className="cw-section">
      <div className="cw-section-head">
        <span>המסלול בתיק</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '.5rem' }}>{headActions}</span>
      </div>

      <div style={{ display: 'grid', gap: '.55rem' }}>
        {sections.map(sec => {
          const state = sectionState(sec.members);
          const doneCount = sec.members.filter(s => !isStepOpen(s.status)).length;
          const draftCount = sec.members.filter(s => s.payload.published === false).length;
          const open = openOverride[sec.key] ?? (state === 'active');
          // בסינון פעיל — שלב בלי התאמות פשוט לא מוצג; הרשימה חייבת לשקף את המונה.
          if (ballFilterActive && sec.visible.length === 0) return null;
          /* ‼ שלב-על שכל בקשותיו הושלמו יורד מאזור העבודה: הבקשות עצמן חיות
             במקטע "בקשות שהושלמו" המקופל, וכותרת שנפתחת אל גוף ריק היא בדיוק
             הרעש שהמסך הזה בא להוריד. */
          if (state === 'done' && sec.visible.length === 0) return null;

          const stateDot = state === 'done'
            ? { ch: '✓', color: 'var(--ink-4)' }        // הושלם = אפור, לא ירוק
            : state === 'future'
              ? { ch: '🔒', color: 'var(--ink-4)' }
              : { ch: '●', color: 'var(--accent)' };

          const nReq = sec.members.length === 1 ? 'בקשה אחת' : `${sec.members.length} בקשות`;
          const nDraft = draftCount === 1 ? 'טיוטה אחת' : `${draftCount} טיוטות`;
          const summary = state === 'done'
            ? `הושלם · ${nReq}`
            : state === 'future'
              ? 'ייפתח בהמשך'
              : `${doneCount} מתוך ${sec.members.length} הושלמו${draftCount > 0 ? ` · ${nDraft}` : ''}`;

          return (
            <section key={sec.key} style={{
              border: '1px solid var(--bd)', borderRadius: 'var(--r-panel, .7rem)',
              background: state === 'active' ? 'var(--card, #fff)' : 'var(--surface-2)',
              overflow: 'hidden',
            }}>
              <button
                type="button"
                onClick={() => setOpenOverride(o => ({ ...o, [sec.key]: !open }))}
                aria-expanded={open}
                style={{
                  display: 'flex', alignItems: 'center', gap: '.55rem', width: '100%',
                  minHeight: 44, padding: '.5rem .75rem', cursor: 'pointer',
                  background: 'none', border: 'none', font: 'inherit', textAlign: 'start',
                }}
              >
                <span aria-hidden="true" style={{ color: 'var(--ink-4)', fontSize: 'var(--fs-12)' }}>
                  {open ? '▾' : '▸'}
                </span>
                <span aria-hidden="true" style={{ color: stateDot.color, fontSize: 'var(--fs-12)' }}>{stateDot.ch}</span>
                <span style={{
                  fontWeight: 700, fontSize: 'var(--fs-14)',
                  color: state === 'active' ? 'var(--ink-1)' : 'var(--ink-3)',
                }}>{sec.title}</span>
                <span style={{ fontSize: 'var(--fs-12)', color: 'var(--ink-3)' }}>{summary}</span>
              </button>

              {open && (
                <div style={{ padding: '0 .75rem .55rem', borderTop: '1px solid var(--hairline-1, var(--bd))' }}>
                  {sec.visible.length === 0 && ballFilterActive
                    ? <div className="cw-empty">אין בקשות שמתאימות לסינון.</div>
                    : sec.visible.map(renderStep)}
                  {/* ‼ ההוספה בתוך השלב — ההקשר נגזר מאיפה שלחצו, בלי מודל
                      ובלי שאלת "לאיזה שלב?". שלב הייצוג מסונכרן ואינו נערך. */}
                  {composer && sec.key !== '__rep' && (
                    composeIn === sec.key
                      ? composer(sec.stageId ?? null, () => setComposeIn(null))
                      : (
                        <button type="button"
                          onClick={() => setComposeIn(sec.key)}
                          style={{
                            display: 'block', width: '100%', textAlign: 'start',
                            minHeight: 44, padding: '.45rem .2rem', marginTop: '.15rem',
                            background: 'none', border: 'none', cursor: 'pointer',
                            font: 'inherit', fontSize: 'var(--fs-13)', color: 'var(--accent)',
                          }}>
                          + הוסף בקשה או משימה לשלב הזה
                        </button>
                      )
                  )}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
