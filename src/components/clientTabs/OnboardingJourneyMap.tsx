// ─── מפת המסלול — הקליטה במבט אחד ────────────────────────────────────────────
// ‼ רשימת שלבים עונה על "מה קיים". מפה עונה על "איפה אנחנו" — וזו השאלה
// שנשאלת בפועל כשפותחים לקוח. כמה ירוק יש, איפה הנקודה שדורשת אותי, ומה נעול.
//
// ‼ מסלול שלא נוצר אינו מופיע כלל — לא כשורה ריקה ולא כ"לא רלוונטי". לקוח בלי
// רו"ח קודם לא צריך לראות מסלול שחרור מעומעם; הוא צריך לראות מפה קצרה יותר.
//
// ‼ בלי ספריות חדשות: div-ים, flex ו-CSS. הכול נגזר מטוקנים קיימים.

import type { OnboardingStep } from '../../types/onboarding';
import {
  STEP_BALL_LABELS, STEP_STATUS_LABELS, STEP_TYPE_LABELS, TRACK_LABELS, TRACK_ORDER,
  isStepOpen,
} from '../../types/onboarding';
import { urgency } from '../../utils/onboardingNext';

interface Props {
  /** שלבי הלקוח, בלי מבוטלים. */
  steps: OnboardingStep[];
  /** קפיצה לכרטיס השלב שמתחת למפה. */
  onSelect: (stepId: string) => void;
}

type NodeTone = 'done' | 'mine' | 'mineSoft' | 'waiting' | 'locked' | 'stuck' | 'skipped';

/**
 * מצב השלב → מראה העיגול. סדר הבדיקות הוא ההיררכיה: "תקוע" גובר על "נעול"
 * ועל "אצלי", כי הוא הדבר היחיד שדורש תגובה מיידית.
 *
 * ‼ `isNext` מפריד בין "אצלי" ל"אצלי, אבל לא עכשיו". בלי ההפרדה הזו רוב
 * העיגולים במפה נצבעים כחול מלא — ואז הצבע שנועד להגיד "כאן, זה אתה"
 * מפסיק להגיד משהו. מסלול מציג נקודה כחולה מלאה אחת לכל היותר.
 */
function toneOf(s: OnboardingStep, isNext: boolean): NodeTone {
  if (s.status === 'completed' || s.status === 'verified') return 'done';
  if (s.status === 'skipped') return 'skipped';
  if (s.status === 'blocked' || s.status === 'failed' || s.needsAttention) return 'stuck';
  if (s.status === 'locked') return 'locked';
  if (s.ball === 'me') return isNext ? 'mine' : 'mineSoft';
  return 'waiting';
}

const NODE_STYLE: Record<NodeTone, React.CSSProperties> = {
  done:     { background: 'var(--ok)', borderColor: 'var(--ok)', color: '#fff' },
  mine:     { background: 'var(--accent)', borderColor: 'var(--accent)', color: '#fff',
              boxShadow: '0 0 0 3px var(--soft)' },
  mineSoft: { background: 'var(--card)', borderColor: 'var(--accent)', color: 'var(--accent)' },
  stuck:    { background: 'var(--err)', borderColor: 'var(--err)', color: '#fff' },
  waiting:  { background: 'var(--card)', borderColor: 'var(--bd-strong)', color: 'var(--ink-3)' },
  locked:   { background: 'var(--s2)', borderColor: 'var(--bd-strong)', color: 'var(--ink-3)',
              borderStyle: 'dashed' },
  skipped:  { background: 'var(--s2)', borderColor: 'var(--bd)', color: 'var(--ink-4)' },
};

const NODE_GLYPH: Record<NodeTone, string> = {
  done: '✓', mine: '', mineSoft: '', stuck: '!', waiting: '', locked: '🔒', skipped: '✕',
};

export default function OnboardingJourneyMap({ steps, onSelect }: Props) {
  const live = steps.filter(s => s.status !== 'cancelled');
  if (live.length === 0) return null;

  const tracks = TRACK_ORDER
    .map(track => ({ track, list: live.filter(s => s.track === track) }))
    .filter(g => g.list.length > 0);   // מסלול בלי שלבים — לא קיים על המפה

  // ‼ החיבור החוצה-מסלולים היחיד: הרשאת התשלום תלויה בחיבור לפייפרלס, והם
  // בשתי שורות שונות. קו מצויר בין שורות היה נשבר בכל גלישה, ולכן הכלל נאמר
  // במילים מתחת למפה — במקום שבו הוא באמת רלוונטי.
  const lockedRetainer = live.find(
    s => s.stepType === 'retainer_authorization' && s.status === 'locked');
  const connection = live.find(s => s.stepType === 'paperless_connection');
  const showLockNote = !!lockedRetainer && !!connection
    && lockedRetainer.dependsOnStepId === connection.id;

  const doneCount = live.filter(s => !isStepOpen(s.status)).length;

  // ‼ נקודה כחולה מלאה אחת לכל מסלול — הדבר הבא שלו. אותו דירוג דחיפות
  // שמניע את שורת הכדור ואת השולחן, מוחל בתוך המסלול.
  const nextInTrack = new Map<string, string>();
  for (const { track, list } of tracks) {
    const mine = list.filter(s => isStepOpen(s.status) && s.ball === 'me' && s.status !== 'locked');
    const first = mine.slice().sort((a, b) => urgency(a) - urgency(b)
      || (a.createdAt || '').localeCompare(b.createdAt || ''))[0];
    if (first) nextInTrack.set(track, first.id);
  }

  return (
    <div style={{
      border: '1px solid var(--hairline-1)', borderRadius: 'var(--radius)',
      background: 'var(--surface-2)', padding: '.7rem .85rem',
    }}>
      <div style={{
        display: 'flex', alignItems: 'baseline', gap: '.5rem', flexWrap: 'wrap',
        marginBottom: '.6rem',
      }}>
        <span style={{ fontSize: 'var(--fs-13)', fontWeight: 600, color: 'var(--ink-2)' }}>
          מפת הקליטה
        </span>
        <span style={{ fontSize: 'var(--fs-12)', color: 'var(--ink-3)' }}>
          {doneCount} מתוך {live.length} שלבים הושלמו
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '.5rem' }}>
        {tracks.map(({ track, list }) => (
          <div key={track} style={{ display: 'flex', alignItems: 'center', gap: '.5rem' }}>
            <span style={{
              flex: '0 0 auto', width: 74, fontSize: 'var(--fs-12)', color: 'var(--ink-3)',
            }}>{TRACK_LABELS[track]}</span>

            <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 0, minWidth: 0 }}>
              {list.map((s, i) => {
                const tone = toneOf(s, s.id === nextInTrack.get(track));
                const prev = i > 0 ? list[i - 1] : null;
                const dependsOnPrev = !!prev && s.dependsOnStepId === prev.id;
                const prevDone = !!prev && !isStepOpen(prev.status);
                return (
                  <span key={s.id} style={{ display: 'inline-flex', alignItems: 'center' }}>
                    {prev && (
                      <span aria-hidden="true" style={{
                        width: 18, height: 0,
                        borderTop: `2px ${dependsOnPrev ? 'dashed' : 'solid'} ${prevDone ? 'var(--ok)' : 'var(--bd)'}`,
                      }} />
                    )}
                    <button
                      type="button"
                      onClick={() => onSelect(s.id)}
                      title={`${STEP_TYPE_LABELS[s.stepType]} - ${STEP_STATUS_LABELS[s.status]} · הכדור ${STEP_BALL_LABELS[s.ball]}`}
                      aria-label={`${STEP_TYPE_LABELS[s.stepType]} - ${STEP_STATUS_LABELS[s.status]}`}
                      style={{
                        width: 22, height: 22, borderRadius: 999, borderWidth: 1.5,
                        borderStyle: 'solid', padding: 0, cursor: 'pointer', flexShrink: 0,
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 11, lineHeight: 1, fontWeight: 700, fontFamily: 'inherit',
                        ...NODE_STYLE[tone],
                      }}>
                      {/* ‼ נעול ודחוף בו-זמנית הוא מצב אמיתי (חודש חיוב מתקרב
                          בזמן שהפייפרלס עוד לא חובר). הצבע אומר "דחוף",
                          והמנעול אומר "ולא בידיים שלך" — שניהם נחוצים. */}
                      {s.status === 'locked' ? '🔒' : NODE_GLYPH[tone]}
                    </button>
                  </span>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {showLockNote && (
        <div style={{
          marginTop: '.6rem', paddingTop: '.5rem', borderTop: '1px solid var(--hairline-2)',
          fontSize: 'var(--fs-12)', color: 'var(--ink-3)',
        }}>
          🔒 הרשאת התשלום נעולה עד שתאשר את החיבור לפייפרלס - ההרשאה נוצרת בתוך
          חשבון הפייפרלס של הלקוח.
        </div>
      )}

      <div style={{
        marginTop: '.5rem', paddingTop: '.45rem', borderTop: '1px solid var(--hairline-2)',
        display: 'flex', gap: '.9rem', flexWrap: 'wrap',
        fontSize: 11, color: 'var(--ink-4)',
      }}>
        <Legend tone="done" label="הושלם" />
        <Legend tone="mine" label="הבא בתור אצלך" />
        <Legend tone="mineSoft" label="אצלך, בהמשך" />
        <Legend tone="waiting" label="ממתין לאחר" />
        <Legend tone="locked" label="נעול" />
        <Legend tone="stuck" label="דורש טיפול" />
      </div>
    </div>
  );
}

/**
 * מפה מוקטנת לשורת טבלה — אותם צבעים, בלי תוויות ובלי מסלולים.
 * ‼ אותה שפה ויזואלית בדיוק כמו המפה המלאה. מסך מעקב שמדבר "טקסט" בזמן
 * שהכרטיס מדבר "מפה" מכריח את העין ללמוד שתי שפות לאותו מידע.
 */
export function MiniJourney({ steps }: { steps: OnboardingStep[] }) {
  const live = steps.filter(s => s.status !== 'cancelled');
  if (live.length === 0) return null;

  const ordered = TRACK_ORDER.flatMap(t => live.filter(s => s.track === t));
  const nextId = ordered.filter(s => isStepOpen(s.status) && s.ball === 'me' && s.status !== 'locked')
    .slice().sort((a, b) => urgency(a) - urgency(b))[0]?.id;

  return (
    <span style={{ display: 'inline-flex', gap: 3, flexWrap: 'wrap', alignItems: 'center' }}>
      {ordered.map(s => {
        const tone = toneOf(s, s.id === nextId);
        const st = NODE_STYLE[tone];
        return (
          <span key={s.id} aria-hidden="true"
            title={`${STEP_TYPE_LABELS[s.stepType]} - ${STEP_STATUS_LABELS[s.status]}`}
            style={{
              width: 10, height: 10, borderRadius: 999, borderWidth: 1.5, borderStyle: st.borderStyle ?? 'solid',
              display: 'inline-block', background: st.background, borderColor: st.borderColor,
            }} />
        );
      })}
    </span>
  );
}

function Legend({ tone, label }: { tone: NodeTone; label: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '.3rem' }}>
      <span aria-hidden="true" style={{
        width: 11, height: 11, borderRadius: 999, borderWidth: 1.5, borderStyle: 'solid',
        display: 'inline-block', ...NODE_STYLE[tone], boxShadow: 'none',
      }} />
      {label}
    </span>
  );
}
