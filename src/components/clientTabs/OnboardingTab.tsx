// ─── קליטה — מסלול הכניסה של הלקוח ─────────────────────────────────────────
// שורה אחת למעלה אומרת אצל מי הכדור ומה הדבר הבא, ומתחתיה המסלולים.
//
// ‼ שלב נעול מוצג ולא מוסתר: התלות ("הרשאת תשלום רק אחרי חיבור פייפרלס")
// היא כלל עסקי שהרו"ח צריך לראות, אחרת הוא מחפש שלב שנעלם.

import { useMemo, useState } from 'react';
import type {
  Engagement, OnboardingEvent, OnboardingStep, OnboardingStepType, StepChecklistItem,
} from '../../types/onboarding';
import {
  ENGAGEMENT_STATUS_LABELS, EVENT_ACTOR_LABELS, EVENT_TYPE_LABELS, STEP_BALL_LABELS,
  STEP_STATUS_LABELS, STEP_STATUS_TONE, STEP_TYPE_LABELS, TRACK_LABELS, TRACK_ORDER,
  isStepOpen,
} from '../../types/onboarding';
import type { AdvanceResult } from '../../hooks/useOnboarding';
import { relativeTime } from '../../utils/clientDerived';
import { formatDate } from '../../utils/dateFormat';

interface Props {
  clientId: string;
  engagements: Engagement[];
  steps: OnboardingStep[];
  events: OnboardingEvent[];
  loading?: boolean;
  advance: (stepId: string, action: string, payload?: Record<string, unknown>) => Promise<AdvanceResult>;
}

const TONE_COLOR: Record<string, string> = {
  ok: 'var(--ok, #17845b)',
  warn: 'var(--warn)',
  err: 'var(--err)',
  muted: 'var(--ink-3)',
};

// מה הפעולה הבאה כשהכדור אצלי — ניסוח של עשייה, לא של סטטוס
const NEXT_ACTION: Record<OnboardingStepType, string> = {
  representation: 'להמשיך את תהליך הייצוג',
  file_opening: 'לפתוח את התיקים ברשויות',
  release_letter: 'לשלוח מכתב שחרור לרו״ח הקודם',
  materials_received: 'לאסוף את החומרים מהרו״ח הקודם',
  paperless_invite: 'להזמין את הלקוח לפייפרלס',
  paperless_connection: 'לאשר את חיבור הלקוח לפייפרלס',
  data_import: 'לייבא את ההיסטוריה לפייפרלס',
  data_verification: 'לאמת את הנתונים בפייפרלס',
  retainer_authorization: 'להקים את הרשאת התשלום החודשי',
  internal_setup: 'להשלים את ההקמה הפנימית',
  kyc_identification: 'להשלים את הכרת הלקוח',
  first_month_review: 'לבצע את ביקורת החודש הראשון',
};

/** למה השלב נעול ומה יפתח אותו — במילים של הרו"ח, לא של המסד. */
function lockHint(step: OnboardingStep, byId: Map<string, OnboardingStep>): string {
  if (step.stepType === 'retainer_authorization') {
    return 'ייפתח אחרי שתאשר את חיבור הלקוח לפייפרלס';
  }
  const dep = step.dependsOnStepId ? byId.get(step.dependsOnStepId) : undefined;
  if (dep) return `ייפתח אחרי ${STEP_TYPE_LABELS[dep.stepType]}`;
  return 'ייפתח אחרי השלב שהוא תלוי בו';
}

/** דירוג דחיפות לשורת הכדור. נמוך = דחוף יותר. */
/** תאריך יעד רק אם הוא בטווח שבועיים — אחרת הוא אינו שיקול דחיפות. */
const SOON_DAYS = 14;
function soonDue(due?: string | null): string | null {
  if (!due) return null;
  const days = (new Date(due).getTime() - Date.now()) / 86400000;
  return days <= SOON_DAYS ? due : null;
}

function urgency(step: OnboardingStep): number {
  if (step.status === 'blocked' || step.status === 'failed') return 0;
  if (step.needsAttention) return 1;
  if (step.status === 'locked') return 5;
  if (step.ball === 'me') return 2;
  if (step.ball === 'client') return 3;
  return 4;
}

export default function OnboardingTab({ clientId, engagements, steps, events, loading, advance }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [busyStepId, setBusyStepId] = useState<string | null>(null);
  const [menuStepId, setMenuStepId] = useState<string | null>(null);

  const clientEngagements = useMemo(
    () => engagements.filter(e => e.clientId === clientId),
    [engagements, clientId]);
  const clientSteps = useMemo(
    () => steps.filter(s => s.clientId === clientId && s.status !== 'cancelled'),
    [steps, clientId]);

  const stepById = useMemo(() => {
    const m = new Map<string, OnboardingStep>();
    clientSteps.forEach(s => m.set(s.id, s));
    return m;
  }, [clientSteps]);

  const clientEvents = useMemo(() => {
    const stepIds = new Set(clientSteps.map(s => s.id));
    const engIds = new Set(clientEngagements.map(e => e.id));
    return events
      .filter(ev => (ev.stepId && stepIds.has(ev.stepId)) || (ev.engagementId && engIds.has(ev.engagementId)))
      .slice()
      .sort((a, b) => (b.at || '').localeCompare(a.at || ''));
  }, [events, clientSteps, clientEngagements]);

  const nextStep = useMemo(() => {
    const open = clientSteps.filter(s => isStepOpen(s.status));
    if (open.length === 0) return null;
    // ‼ שורת הכדור מכריזה על הפעולה הבאה, ולכן היא לא יכולה להצביע על שלב
    // נעול — אין מה לעשות איתו. שלב נעול נבחר רק כשאין שום שלב פתיח, ואז
    // המסר הוא "הכול ממתין למשהו אחר".
    const actionable = open.filter(s => s.status !== 'locked');
    return (actionable.length > 0 ? actionable : open).slice().sort((a, b) => {
      const u = urgency(a) - urgency(b);
      if (u !== 0) return u;
      // ‼ תאריך יעד רחוק אינו דוחק. שלב בלי תאריך הוא העבודה של עכשיו, ואילו
      // "ביקורת חודש ראשון" בעוד חודש לא אמורה לדחוק את מכתב השחרור להיום.
      // רק יעד קרוב (שבועיים) מקפיץ שלב לראש.
      const ad = soonDue(a.dueDate) ?? '';
      const bd = soonDue(b.dueDate) ?? '';
      if (ad !== bd) return ad === '' ? 1 : bd === '' ? -1 : ad.localeCompare(bd);
      return (a.createdAt || '').localeCompare(b.createdAt || '');
    })[0];
  }, [clientSteps]);

  async function run(step: OnboardingStep, action: string, payload: Record<string, unknown> = {}) {
    setBusyStepId(step.id);
    setError(null);
    setMenuStepId(null);
    const res = await advance(step.id, action, payload);
    if (!res.ok) setError(res.message || 'הפעולה נכשלה.');
    setBusyStepId(null);
  }

  function handleSkip(step: OnboardingStep) {
    const isPaperless = step.stepType === 'paperless_invite' || step.stepType === 'paperless_connection';
    if (isPaperless) {
      // ‼ דילוג על פייפרלס מותר רק כשמשמעותו "הלקוח באמת מחובר" — אחרת הוא
      // היה פותח את הרשאת התשלום מהדלת האחורית (השרת דוחה כל סיבה אחרת).
      const already = window.confirm(
        'הלקוח כבר מחובר לפייפרלס (או הועבר אלינו ממייצג אחר)?\n\n' +
        'אישור = לדלג על השלב ולפתוח את הרשאת התשלום.');
      if (!already) return;
      void run(step, 'skip', { reason: 'already_connected', note: 'הלקוח כבר מחובר לפייפרלס' });
      return;
    }
    const reason = window.prompt('סיבת הדילוג:');
    if (!reason || !reason.trim()) return;
    void run(step, 'skip', { reason: reason.trim(), note: reason.trim() });
  }

  function handleBlock(step: OnboardingStep) {
    const reason = window.prompt('מה חוסם את השלב?');
    if (!reason || !reason.trim()) return;
    void run(step, 'block', { note: reason.trim() });
  }

  function handleNote(step: OnboardingStep) {
    const note = window.prompt('הערה לשלב:');
    if (!note || !note.trim()) return;
    void run(step, 'note', { note: note.trim() });
  }

  function toggleChecklistItem(step: OnboardingStep, item: StepChecklistItem) {
    const list = step.payload.checklist ?? [];
    const next = list.map(x => x.key === item.key ? { ...x, done: !x.done } : x);
    void run(step, 'note', {
      checklist: next,
      note: `${item.done ? 'בוטל סימון' : 'סומן'}: ${item.label}`,
    });
  }

  if (clientEngagements.length === 0 && clientSteps.length === 0) {
    return (
      <div className="cw-tabpanel">
        <div className="cw-section">
          <div className="cw-empty">
            עוד לא נפתחה קליטה ללקוח הזה. קליטה נפתחת אוטומטית כשהלקוח מאשר הצעת מחיר.
          </div>
        </div>
      </div>
    );
  }

  const ballTone = !nextStep
    ? { c: TONE_COLOR.ok, label: 'הושלם' }
    : nextStep.ball === 'me'
      ? { c: 'var(--accent)', label: 'הכדור אצלך' }
      : { c: 'var(--ink-3)', label: `הכדור ${STEP_BALL_LABELS[nextStep.ball]}` };

  const ballTitle = !nextStep
    ? 'הקליטה הושלמה'
    : nextStep.status === 'locked'
      ? `${STEP_TYPE_LABELS[nextStep.stepType]} — ${lockHint(nextStep, stepById)}`
      : nextStep.ball === 'me'
        ? NEXT_ACTION[nextStep.stepType]
        : `${STEP_TYPE_LABELS[nextStep.stepType]} — ${STEP_STATUS_LABELS[nextStep.status]}`;

  const openCount = clientSteps.filter(s => isStepOpen(s.status)).length;
  const activeEngagement = clientEngagements[0];
  const ballSub = !nextStep
    ? activeEngagement ? `ההתקשרות ${ENGAGEMENT_STATUS_LABELS[activeEngagement.status]}.` : ''
    : `${TRACK_LABELS[nextStep.track]} · נותרו ${openCount} שלבים פתוחים${nextStep.dueDate ? ` · עד ${formatDate(nextStep.dueDate, 'list')}` : ''}`;

  const tracks = TRACK_ORDER
    .map(track => ({ track, list: clientSteps.filter(s => s.track === track) }))
    .filter(g => g.list.length > 0);   // מסלול בלי שלבים לא מקבל קופסה ריקה

  return (
    <div className="cw-tabpanel">
      {error && (
        <div style={{
          padding: '.55rem .8rem', borderRadius: 'var(--radius)',
          background: 'var(--red-light)', color: 'var(--err)', fontSize: 'var(--fs-13)',
        }}>⚠ {error}</div>
      )}

      {/* ── שורת הכדור — אותו מבט של שורת המצב בייצוג ── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '.75rem', flexWrap: 'wrap',
        padding: '.7rem .9rem',
        borderInlineStart: `3px solid ${ballTone.c}`,
        background: 'var(--surface-2)', borderRadius: 'var(--radius)',
      }}>
        <span style={{
          fontSize: 'var(--fs-12)', fontWeight: 600, color: '#fff', background: ballTone.c,
          padding: '.1rem .5rem', borderRadius: 999, whiteSpace: 'nowrap',
        }}>{ballTone.label}</span>
        <strong style={{ fontSize: 'var(--fs-15)', color: 'var(--gray-900, #111)' }}>{ballTitle}</strong>
        <span style={{ fontSize: 'var(--fs-13)', color: 'var(--ink-3)' }}>{ballSub}</span>
      </div>

      {loading && clientSteps.length === 0 && <div className="cw-empty">טוען…</div>}

      {tracks.map(({ track, list }) => (
        <div key={track} className="cw-section">
          <div className="cw-section-head">
            <span>{TRACK_LABELS[track]}</span>
            <span className="cw-section-count">{list.filter(s => isStepOpen(s.status)).length}/{list.length}</span>
          </div>
          <div>
            {list.map(step => {
              const tone = TONE_COLOR[STEP_STATUS_TONE[step.status]];
              const locked = step.status === 'locked';
              const busy = busyStepId === step.id;
              const checklist = step.payload.checklist ?? [];
              return (
                <div key={step.id} style={{
                  display: 'flex', gap: '.6rem', alignItems: 'flex-start', flexWrap: 'wrap',
                  padding: '.55rem 0', borderTop: '1px solid var(--hairline-2)',
                }}>
                  <span aria-hidden="true" style={{
                    width: 8, height: 8, borderRadius: 999, background: tone,
                    marginTop: '.4rem', flexShrink: 0,
                  }} />
                  <div style={{ flex: 1, minWidth: 180 }}>
                    <div style={{ fontSize: 'var(--fs-14)', fontWeight: 600, color: locked ? 'var(--ink-3)' : 'var(--ink-1)' }}>
                      {locked && '🔒 '}{STEP_TYPE_LABELS[step.stepType]}
                      {step.needsAttention && <span style={{ color: 'var(--err)', marginInlineStart: '.4rem' }}>· דורש טיפול</span>}
                    </div>
                    <div style={{
                      display: 'flex', gap: '.5rem', flexWrap: 'wrap', alignItems: 'center',
                      fontSize: 'var(--fs-12)', color: 'var(--ink-3)', marginTop: 2,
                    }}>
                      <span style={{ color: tone, fontWeight: 600 }}>{STEP_STATUS_LABELS[step.status]}</span>
                      <span>· הכדור {STEP_BALL_LABELS[step.ball]}</span>
                      {step.dueDate && <span>· עד {formatDate(step.dueDate, 'list')}</span>}
                      {locked && <span>· {lockHint(step, stepById)}</span>}
                    </div>

                    {checklist.length > 0 && (
                      <div style={{ marginTop: '.4rem', display: 'flex', flexDirection: 'column', gap: '.15rem' }}>
                        {checklist.map(item => (
                          <label key={item.key} style={{
                            display: 'flex', alignItems: 'center', gap: '.4rem',
                            fontSize: 'var(--fs-13)', color: item.done ? 'var(--ink-3)' : 'var(--ink-2)',
                          }}>
                            <input
                              type="checkbox"
                              checked={item.done}
                              disabled={busy || locked}
                              onChange={() => toggleChecklistItem(step, item)}
                            />
                            <span style={{ textDecoration: item.done ? 'line-through' : undefined }}>{item.label}</span>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>

                  <div style={{ display: 'flex', gap: '.35rem', flexWrap: 'wrap', alignItems: 'flex-start' }}>
                    {locked && (
                      <button type="button" className="btn btn-sm btn-secondary" disabled>התחל</button>
                    )}
                    {step.status === 'pending' && (
                      <button type="button" className="btn btn-sm btn-secondary" disabled={busy}
                        onClick={() => void run(step, 'start')}>התחל</button>
                    )}
                    {step.status === 'in_progress' && (
                      <>
                        <button type="button" className="btn btn-sm btn-primary" disabled={busy}
                          onClick={() => void run(step, 'complete')}>סיימתי</button>
                        <button type="button" className="btn btn-sm btn-secondary" disabled={busy}
                          onClick={() => void run(step, 'wait_client')}>ממתין ללקוח</button>
                      </>
                    )}
                    {step.status === 'waiting_client' && (
                      <button type="button" className="btn btn-sm btn-primary" disabled={busy}
                        onClick={() => void run(step, 'complete')}>הלקוח השלים</button>
                    )}
                    {step.status === 'completed' && (
                      <button type="button" className="btn btn-sm btn-secondary" disabled={busy}
                        onClick={() => void run(step, 'verify')}>אמת</button>
                    )}
                    {(step.status === 'blocked' || step.status === 'failed') && (
                      <button type="button" className="btn btn-sm btn-secondary" disabled={busy}
                        onClick={() => void run(step, 'reopen')}>פתח מחדש</button>
                    )}

                    {isStepOpen(step.status) && (
                      <button type="button" className="btn btn-sm btn-ghost" disabled={busy}
                        onClick={() => setMenuStepId(id => id === step.id ? null : step.id)}
                        aria-label="פעולות נוספות">⋯</button>
                    )}
                    {menuStepId === step.id && (
                      <>
                        <button type="button" className="btn btn-sm btn-ghost" onClick={() => handleSkip(step)}>דלג</button>
                        <button type="button" className="btn btn-sm btn-ghost" onClick={() => handleBlock(step)}>חסום</button>
                        <button type="button" className="btn btn-sm btn-ghost" onClick={() => handleNote(step)}>הערה</button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {/* ── ציר הזמן ── */}
      <div className="cw-section">
        <div className="cw-section-head"><span>מה קרה בקליטה</span></div>
        {clientEvents.length === 0 ? (
          <div className="cw-empty">עדיין אין רישומים.</div>
        ) : (
          <div>
            {clientEvents.slice(0, 40).map(ev => (
              <div key={ev.id} className="cw-activity-row">
                <span className="cw-activity-text">
                  {describeEvent(ev, stepById)}
                  <span style={{ color: 'var(--ink-4)' }}> · {EVENT_ACTOR_LABELS[ev.actor] ?? ev.actor}</span>
                </span>
                <span className="cw-activity-when" title={formatDate(ev.at, 'form')}>{relativeTime(ev.at)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** תיאור אירוע בעברית: ההערה שנכתבה, אחרת מעבר הסטטוס, אחרת סוג האירוע. */
function describeEvent(ev: OnboardingEvent, stepById: Map<string, OnboardingStep>): string {
  const step = ev.stepId ? stepById.get(ev.stepId) : undefined;
  const stepName = step ? STEP_TYPE_LABELS[step.stepType] : '';
  const to = typeof ev.meta?.to === 'string' ? ev.meta.to : undefined;
  const statusPart = to && STEP_STATUS_LABELS[to as keyof typeof STEP_STATUS_LABELS]
    ? STEP_STATUS_LABELS[to as keyof typeof STEP_STATUS_LABELS]
    : EVENT_TYPE_LABELS[ev.type] ?? ev.type;
  const head = stepName ? `${stepName} — ${statusPart}` : statusPart;
  return ev.note ? `${head}: ${ev.note}` : head;
}
