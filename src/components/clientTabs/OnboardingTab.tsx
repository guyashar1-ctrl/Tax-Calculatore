// ─── קליטה — מסלול הכניסה של הלקוח ─────────────────────────────────────────
// שורה אחת למעלה אומרת אצל מי הכדור ומה הדבר הבא, ומתחתיה המסלולים.
//
// ‼ שלב נעול מוצג ולא מוסתר: התלות ("הרשאת תשלום רק אחרי חיבור פייפרלס")
// היא כלל עסקי שהרו"ח צריך לראות, אחרת הוא מחפש שלב שנעלם.

import { useEffect, useMemo, useRef, useState } from 'react';
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
import { formatILS } from '../../utils/quotationCalc';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import { useEmailMessages } from '../../hooks/useEmailMessages';
import { EMAIL_STATUS_LABEL } from '../../types/emailActivity';
import EmailPreviewDialog from '../EmailActivity/EmailPreviewDialog';
import ConfirmDialog from '../ui/ConfirmDialog';

interface Props {
  clientId: string;
  engagements: Engagement[];
  steps: OnboardingStep[];
  events: OnboardingEvent[];
  loading?: boolean;
  advance: (stepId: string, action: string, payload?: Record<string, unknown>) => Promise<AdvanceResult>;
  /** טעינה מחדש אחרי פעולה שלא עברה דרך advance (מסלול פייפרלס, שליחת מייל). */
  refresh?: () => void;
  /** פרטי הרו"ח הקודם מכרטיס הלקוח — בלי מייל אי אפשר להכין מכתב שחרור. */
  prevAccountant?: { name?: string; email?: string; phone?: string };
  /** פתיחת חלון מכתב השחרור. חסר ⇒ הכפתור לא מוצג (מסך הבדיקה). */
  onPrepareReleaseLetter?: (stepId: string) => void;
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

// ─── מסלול הפייפרלס ────────────────────────────────────────────────────────
// שתי עובדות על הלקוח (האם הוא כבר בפייפרלס, ואיפה ההיסטוריה שלו) קובעות את
// כל השלבים. הן נשמרות פעם אחת, דרך set_paperless_path — אותה פונקציה בשרת
// שגם מרכיבה ומבטלת את שלבי הייבוא והאימות.

export type PaperlessStatus = 'none' | 'other_rep' | 'self';
export type PaperlessDataSource = 'none' | 'other_software';

const PAPERLESS_STATUS_OPTIONS: { value: PaperlessStatus; label: string }[] = [
  { value: 'none', label: 'לא' },
  { value: 'other_rep', label: 'כן, אצל מייצג אחר' },
  { value: 'self', label: 'כן, עצמאית' },
];

const DATA_SOURCE_OPTIONS: { value: PaperlessDataSource; label: string }[] = [
  { value: 'none', label: 'עסק חדש, אין' },
  { value: 'other_software', label: 'כן, מתוכנה אחרת' },
];

const PAPERLESS_RPC_ERROR: Record<string, string> = {
  bad_values: 'הערכים שנבחרו אינם תקינים.',
  no_paperless_steps: 'אין ללקוח הזה שלבי פייפרלס.',
  forbidden: 'אין הרשאה לשנות את המסלול של הלקוח הזה.',
};

const MONTH_NAMES = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];

/** 'YYYY-MM' → 'ספטמבר 2026'. */
function monthLabel(v?: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(String(v ?? '').trim());
  if (!m) return String(v ?? '').trim();
  const idx = Number(m[2]) - 1;
  return idx >= 0 && idx < 12 ? `${MONTH_NAMES[idx]} ${m[1]}` : String(v);
}

const isHttps = (v: string) => v.trim().startsWith('https://');

export default function OnboardingTab({
  clientId, engagements, steps, events, loading, advance, refresh,
  prevAccountant, onPrepareReleaseLetter,
}: Props) {
  const [error, setError] = useState<string | null>(null);
  const [busyStepId, setBusyStepId] = useState<string | null>(null);
  const [menuStepId, setMenuStepId] = useState<string | null>(null);
  // חלון המייל של שלב — נפתח מהכרטיס, נשלח דרך send-step-email
  const [emailDialog, setEmailDialog] = useState<{ stepId: string; kind: 'paperless_invite' | 'retainer_request'; heading: string } | null>(null);
  const [confirmState, setConfirmState] = useState<{ stepId: string; title: string; message: string; confirmLabel: string } | null>(null);
  // "שנה מסלול" — פותח מחדש את הטריאז' על שלב שכבר נענה
  const [retriageStepId, setRetriageStepId] = useState<string | null>(null);
  const [triageBusy, setTriageBusy] = useState(false);
  const [triageError, setTriageError] = useState<string | null>(null);
  const [highlightStepId, setHighlightStepId] = useState<string | null>(null);
  const highlightTimer = useRef<number | null>(null);

  useEffect(() => () => {
    if (highlightTimer.current) window.clearTimeout(highlightTimer.current);
  }, []);

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

  // סיבת החסימה נשמרת ביומן ולא על השלב, ולכן מחלצים אותה משם כדי להציג
  // "חסום — למה" ולא רק "חסום".
  const blockNoteByStep = useMemo(() => {
    const m = new Map<string, string>();
    for (const ev of clientEvents) {
      if (!ev.stepId || !ev.note || ev.meta?.to !== 'blocked') continue;
      if (!m.has(ev.stepId)) m.set(ev.stepId, ev.note);
    }
    return m;
  }, [clientEvents]);

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

  // ─── פייפרלס: מסלול, טריאז' וחיבור ──────────────────────────────────────
  const paperlessSteps = clientSteps.filter(
    s => s.stepType === 'paperless_invite' || s.stepType === 'paperless_connection');
  const connectionStep = clientSteps.find(s => s.stepType === 'paperless_connection');
  const triageUnanswered = (s: OnboardingStep) =>
    !s.payload.paperlessStatus || s.payload.paperlessStatus === 'unknown';
  // הטריאז' מוצג פעם אחת בלבד — על השלב הראשון שטרם נענה, לא על שניהם.
  const triageAnchorId = paperlessSteps.find(triageUnanswered)?.id ?? null;

  async function submitTriage(answers: { paperlessStatus: PaperlessStatus; dataSource: PaperlessDataSource; softwareName: string }) {
    setTriageBusy(true);
    setTriageError(null);
    try {
      const { data, error: rpcError } = await supabase.rpc('set_paperless_path', {
        p_client_id: clientId,
        p_paperless_status: answers.paperlessStatus,
        // לקוח שכבר בפייפרלס — ההיסטוריה שלו שם, ואין שאלה שנייה.
        p_data_source: answers.paperlessStatus === 'none' ? answers.dataSource : 'paperless',
        p_software_name: answers.softwareName.trim() || null,
      });
      if (rpcError) { setTriageError(rpcError.message); return; }
      const res = data as { ok?: boolean; error?: string } | null;
      if (!res?.ok) {
        setTriageError(PAPERLESS_RPC_ERROR[res?.error ?? ''] ?? 'שמירת המסלול נכשלה.');
        return;
      }
      setRetriageStepId(null);
      refresh?.();
    } finally {
      setTriageBusy(false);
    }
  }

  /** קפיצה לשלב אחר בעמוד, עם הדגשה קצרה — כדי שברור לאן הגענו. */
  function gotoStep(stepId: string) {
    setHighlightStepId(stepId);
    document.getElementById(`ob-step-${stepId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    if (highlightTimer.current) window.clearTimeout(highlightTimer.current);
    highlightTimer.current = window.setTimeout(() => setHighlightStepId(null), 2600);
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

              // תפריט הפעולות המשניות — זהה בכל סוגי הכרטיסים
              const menu = (
                <>
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
                </>
              );

              if (step.stepType === 'paperless_invite' || step.stepType === 'paperless_connection') {
                return (
                  <PaperlessStepCard
                    key={step.id}
                    step={step}
                    stepById={stepById}
                    busy={busy}
                    highlight={highlightStepId === step.id}
                    showTriage={retriageStepId === step.id || triageAnchorId === step.id}
                    triageBusy={triageBusy}
                    triageError={triageError}
                    onTriage={submitTriage}
                    onRetriage={() => { setTriageError(null); setRetriageStepId(step.id); }}
                    onCancelTriage={() => setRetriageStepId(null)}
                    onPrepareInvite={() => setEmailDialog({
                      stepId: step.id, kind: 'paperless_invite', heading: 'מייל הזמנה לפייפרלס',
                    })}
                    onConfirm={(title, message, confirmLabel) =>
                      setConfirmState({ stepId: step.id, title, message, confirmLabel })}
                    onRun={(action, payload) => void run(step, action, payload)}
                    menu={menu}
                  />
                );
              }

              if (step.stepType === 'release_letter') {
                return (
                  <ReleaseStepCard
                    key={step.id}
                    step={step}
                    stepById={stepById}
                    clientId={clientId}
                    busy={busy}
                    highlight={highlightStepId === step.id}
                    prevAccountant={prevAccountant}
                    blockNote={blockNoteByStep.get(step.id)}
                    onPrepare={onPrepareReleaseLetter ? () => onPrepareReleaseLetter(step.id) : undefined}
                    onBlock={() => handleBlock(step)}
                    onRun={(action, payload) => void run(step, action, payload)}
                    menu={menu}
                  />
                );
              }

              if (step.stepType === 'retainer_authorization') {
                return (
                  <RetainerStepCard
                    key={step.id}
                    step={step}
                    stepById={stepById}
                    busy={busy}
                    highlight={highlightStepId === step.id}
                    hasConnectionStep={!!connectionStep}
                    onGotoPaperless={() => connectionStep && gotoStep(connectionStep.id)}
                    onPrepareEmail={() => setEmailDialog({
                      stepId: step.id, kind: 'retainer_request', heading: 'מייל הרשאת תשלום',
                    })}
                    onRun={(action, payload) => void run(step, action, payload)}
                    menu={menu}
                  />
                );
              }

              return (
                <div key={step.id} id={`ob-step-${step.id}`} style={{
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

                    {menu}
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

      {emailDialog && (
        <EmailPreviewDialog
          heading={emailDialog.heading}
          fn="send-step-email"
          editable
          body={{ stepId: emailDialog.stepId, kind: emailDialog.kind }}
          onSent={() => refresh?.()}
          onClose={() => setEmailDialog(null)}
        />
      )}

      {confirmState && (
        <ConfirmDialog
          tone="normal"
          title={confirmState.title}
          message={confirmState.message}
          confirmLabel={confirmState.confirmLabel}
          onCancel={() => setConfirmState(null)}
          onConfirm={() => {
            const step = stepById.get(confirmState.stepId);
            setConfirmState(null);
            if (step) void run(step, 'complete', { completionMethod: 'manual' });
          }}
        />
      )}
    </div>
  );
}

// ═══════════════ כרטיס הפייפרלס ═══════════════════════════════════════════
// ‼ הכרטיס הזה הוא הצומת של כל הקליטה: החיבור לפייפרלס הוא מה שפותח את
// הרשאת התשלום. לכן הוא לא שורה בין שורות אלא כרטיס שאומר מה המצב, מה
// המסלול, ומה הפעולה הבאה.

interface PaperlessCardProps {
  step: OnboardingStep;
  stepById: Map<string, OnboardingStep>;
  busy: boolean;
  highlight: boolean;
  showTriage: boolean;
  triageBusy: boolean;
  triageError: string | null;
  onTriage: (a: { paperlessStatus: PaperlessStatus; dataSource: PaperlessDataSource; softwareName: string }) => void;
  onRetriage: () => void;
  onCancelTriage: () => void;
  onPrepareInvite: () => void;
  onConfirm: (title: string, message: string, confirmLabel: string) => void;
  onRun: (action: string, payload?: Record<string, unknown>) => void;
  menu: React.ReactNode;
}

function PaperlessStepCard(p: PaperlessCardProps) {
  const { step, stepById, busy, highlight, showTriage } = p;
  const [status, setStatus] = useState<PaperlessStatus | ''>((step.payload.paperlessStatus as PaperlessStatus) || '');
  const [source, setSource] = useState<PaperlessDataSource | ''>(
    step.payload.dataSource === 'other_software' ? 'other_software'
      : step.payload.dataSource === 'none' ? 'none' : '');
  const [softwareName, setSoftwareName] = useState(String(step.payload.softwareName ?? ''));

  const isInvite = step.stepType === 'paperless_invite';
  const path = (step.payload.paperlessStatus as PaperlessStatus | undefined);
  const open = isStepOpen(step.status);
  const canSubmit = status !== '' && (status !== 'none' || source !== '');

  return (
    <StepCardShell step={step} stepById={stepById} highlight={highlight} menu={p.menu}>
      {showTriage ? (
        <div style={{ marginTop: '.5rem', display: 'flex', flexDirection: 'column', gap: '.55rem' }}>
          <div style={{ fontSize: 'var(--fs-13)', color: 'var(--ink-2)' }}>
            שתי שאלות שקובעות את המסלול. נשאלות פעם אחת ללקוח.
          </div>

          <RadioRow
            label="הלקוח כבר עובד עם פייפרלס?"
            name={`pl-status-${step.id}`}
            value={status}
            options={PAPERLESS_STATUS_OPTIONS}
            onChange={v => setStatus(v as PaperlessStatus)}
          />

          {status === 'none' && (
            <RadioRow
              label="יש היסטוריה לייבא?"
              name={`pl-source-${step.id}`}
              value={source}
              options={DATA_SOURCE_OPTIONS}
              onChange={v => setSource(v as PaperlessDataSource)}
            />
          )}

          {status === 'none' && source === 'other_software' && (
            <label style={{ fontSize: 'var(--fs-12)', color: 'var(--ink-3)', maxWidth: 320 }}>
              שם התוכנה
              <input value={softwareName} onChange={e => setSoftwareName(e.target.value)}
                placeholder="חשבשבת, ריווחית…" style={{ marginTop: 3, width: '100%' }} />
            </label>
          )}

          {p.triageError && (
            <div style={{ fontSize: 'var(--fs-12)', color: 'var(--err)' }}>⚠ {p.triageError}</div>
          )}

          <div style={{ display: 'flex', gap: '.35rem' }}>
            <button type="button" className="btn btn-sm btn-primary"
              disabled={!canSubmit || p.triageBusy}
              onClick={() => status !== '' && p.onTriage({
                paperlessStatus: status,
                dataSource: status === 'none' ? (source || 'none') : 'none',
                softwareName,
              })}>
              {p.triageBusy ? 'שומר…' : 'שמור מסלול'}
            </button>
            {path && (
              <button type="button" className="btn btn-sm btn-ghost" onClick={p.onCancelTriage}>ביטול</button>
            )}
          </div>
        </div>
      ) : (
        <>
          {isInvite ? (
            <InviteBody path={path} status={step.status} />
          ) : (
            <ConnectionBody path={path} softwareName={String(step.payload.softwareName ?? '')} />
          )}

          <div style={{ display: 'flex', gap: '.35rem', flexWrap: 'wrap', marginTop: '.55rem', alignItems: 'center' }}>
            {isInvite && open && path === 'none' && (
              <button type="button" className="btn btn-sm btn-primary" disabled={busy} onClick={p.onPrepareInvite}>
                {step.status === 'waiting_client' ? 'שלח הזמנה שוב' : 'הכן מייל הזמנה'}
              </button>
            )}
            {isInvite && open && path !== 'none' && path !== undefined && (
              <button type="button" className="btn btn-sm btn-secondary" disabled={busy}
                onClick={() => p.onRun('skip', { reason: 'already_connected', note: 'הלקוח כבר בפייפרלס — אין צורך בהזמנה' })}>
                סמן שאין צורך בהזמנה
              </button>
            )}
            {isInvite && open && (
              <button type="button" className="btn btn-sm btn-secondary" disabled={busy}
                onClick={() => p.onRun('complete', { completionMethod: 'manual' })}>ההזמנה יצאה</button>
            )}

            {!isInvite && open && step.status !== 'locked' && (
              <button type="button" className="btn btn-sm btn-primary" disabled={busy}
                onClick={() => p.onConfirm(
                  path === 'other_rep' ? 'אישור השלמת ההעברה' : 'אישור חיבור לפייפרלס',
                  'ודאת שהלקוח קיים ומחובר בפייפרלס תחת הייצוג שלך?',
                  path === 'other_rep' ? 'אשר שההעברה הושלמה' : 'אשר חיבור',
                )}>
                {path === 'other_rep' ? 'אשר שההעברה הושלמה' : path === 'self' ? 'אשר קישור למשרד' : 'אשר חיבור'}
              </button>
            )}
            {!isInvite && step.status === 'completed' && (
              <button type="button" className="btn btn-sm btn-secondary" disabled={busy}
                onClick={() => p.onRun('verify')}>אמת</button>
            )}

            {path && (
              <button type="button" className="btn btn-sm btn-ghost" onClick={p.onRetriage}>שנה מסלול</button>
            )}
          </div>
        </>
      )}
    </StepCardShell>
  );
}

/** מה קורה בשלב ההזמנה, לפי המסלול שנבחר. */
function InviteBody({ path, status }: { path?: PaperlessStatus; status: string }) {
  if (path === 'other_rep' || path === 'self') {
    return (
      <div style={cardNote}>
        הלקוח כבר קיים בפייפרלס — אין צורך במייל הזמנה. ההמשך נעשה בשלב החיבור.
      </div>
    );
  }
  return (
    <div style={cardNote}>
      {status === 'waiting_client'
        ? 'ההזמנה נשלחה ללקוח. ברגע שיפתח חשבון, אפשר לאשר את החיבור בשלב הבא.'
        : 'המייל מסביר ללקוח מה פייפרלס נותן לו — צילום מסמכים מהטלפון, שליחה במייל, מעקב אחרי התשלומים לרשויות והפקת חשבוניות — ומצרף את קישור ההזמנה של המשרד.'}
    </div>
  );
}

/** הוראות החיבור, לפי המסלול. */
function ConnectionBody({ path, softwareName }: { path?: PaperlessStatus; softwareName: string }) {
  if (path === 'other_rep') {
    return (
      <div style={cardNote}>
        <div style={{ fontWeight: 600, color: 'var(--ink-2)', marginBottom: '.25rem' }}>
          משיכת הלקוח מהמייצג הקודם בפייפרלס
        </div>
        <ol style={{ margin: 0, paddingInlineStart: '1.1rem', display: 'flex', flexDirection: 'column', gap: '.15rem' }}>
          <li>לפתוח בפייפרלס בקשה להעברת הלקוח מהמייצג הקודם.</li>
          <li>ליידע את המייצג הקודם שהבקשה ממתינה לאישור שלו.</li>
          <li>לוודא שהלקוח מופיע ברשימת הלקוחות שלך, עם ההיסטוריה שלו.</li>
          <li>לאשר כאן שההעברה הושלמה — זה מה שפותח את הרשאת התשלום.</li>
        </ol>
      </div>
    );
  }
  if (path === 'self') {
    return (
      <div style={cardNote}>
        <div style={{ fontWeight: 600, color: 'var(--ink-2)', marginBottom: '.25rem' }}>
          קישור החשבון הקיים למשרד
        </div>
        <ol style={{ margin: 0, paddingInlineStart: '1.1rem', display: 'flex', flexDirection: 'column', gap: '.15rem' }}>
          <li>לבקש מהלקוח להוסיף את המשרד כמייצג בחשבון הפייפרלס שלו.</li>
          <li>לוודא שהלקוח מופיע ברשימת הלקוחות שלך בפייפרלס.</li>
          <li>לאשר כאן שהחשבון מחובר.</li>
        </ol>
      </div>
    );
  }
  return (
    <div style={cardNote}>
      אחרי שהלקוח פותח חשבון מקישור ההזמנה — לוודא שהוא מופיע ברשימת הלקוחות שלך בפייפרלס, ולאשר כאן.
      {softwareName && <> ההיסטוריה מ{softwareName} מיובאת בשלב נפרד ואינה מעכבת את האישור.</>}
    </div>
  );
}

// ═══════════════ כרטיס הרשאת התשלום ══════════════════════════════════════
// ‼ הסכום וחודש החיוב מוצגים גם כשהשלב נעול: זה מה שעומד על הפרק, והרו"ח
// צריך לראות אותו כדי להבין למה כדאי לו לזרז את הפייפרלס.
// ‼ אין כאן שום מסלול שמכין או שולח מייל בזמן שהשלב נעול. גם השרת חוסם.

interface RetainerCardProps {
  step: OnboardingStep;
  stepById: Map<string, OnboardingStep>;
  busy: boolean;
  highlight: boolean;
  hasConnectionStep: boolean;
  onGotoPaperless: () => void;
  onPrepareEmail: () => void;
  onRun: (action: string, payload?: Record<string, unknown>) => void;
  menu: React.ReactNode;
}

function RetainerStepCard(p: RetainerCardProps) {
  const { step, stepById, busy, highlight } = p;
  const savedUrl = String(step.payload.authUrl ?? '');
  const [url, setUrl] = useState(savedUrl);
  const [editingUrl, setEditingUrl] = useState(!savedUrl);
  const [providerRef, setProviderRef] = useState(String(step.payload.providerRef ?? ''));

  const locked = step.status === 'locked';
  const amount = typeof step.payload.amount === 'number' ? step.payload.amount : undefined;
  const month = monthLabel(step.payload.billingStartMonth as string | undefined);
  const urlInvalid = url.trim() !== '' && !isHttps(url);

  return (
    <StepCardShell step={step} stepById={stepById} highlight={highlight} menu={p.menu}
      danger={step.needsAttention}>
      {step.needsAttention && (
        <div style={{ marginTop: '.35rem', fontSize: 'var(--fs-13)', color: 'var(--err)', fontWeight: 600 }}>
          חודש החיוב הראשון מתקרב וההרשאה טרם הושלמה
        </div>
      )}

      <div style={{ display: 'flex', gap: '1.4rem', flexWrap: 'wrap', marginTop: '.45rem' }}>
        <div>
          <div style={{ fontSize: 'var(--fs-12)', color: 'var(--ink-3)' }}>שכר טרחה חודשי</div>
          <div style={{ fontSize: 'var(--fs-15)', fontWeight: 600 }}>{amount ? formatILS(amount) : '—'}</div>
        </div>
        <div>
          <div style={{ fontSize: 'var(--fs-12)', color: 'var(--ink-3)' }}>חודש חיוב ראשון</div>
          <div style={{ fontSize: 'var(--fs-15)', fontWeight: 600 }}>{month || '—'}</div>
        </div>
      </div>

      {locked ? (
        <>
          <div style={cardNote}>
            ההרשאה הקבועה נוצרת בתוך חשבון הפייפרלס של הלקוח, ולכן היא לא יכולה להיווצר לפני שהחשבון קיים ומחובר אליך.
          </div>
          {p.hasConnectionStep && (
            <div style={{ marginTop: '.5rem' }}>
              <button type="button" className="btn btn-sm btn-ghost" onClick={p.onGotoPaperless}>לשלב הפייפרלס ←</button>
            </div>
          )}
        </>
      ) : (
        <>
          <div style={{ marginTop: '.55rem', maxWidth: 460 }}>
            <div style={{ fontSize: 'var(--fs-12)', color: 'var(--ink-3)', marginBottom: 3 }}>
              קישור הרשאת התשלום מפייפרלס
            </div>
            {savedUrl && !editingUrl ? (
              <div style={{ display: 'flex', gap: '.4rem', alignItems: 'center', flexWrap: 'wrap' }}>
                <span dir="ltr" style={{
                  fontSize: 'var(--fs-12)', color: 'var(--ink-2)', background: 'var(--surface-2)',
                  padding: '.15rem .4rem', borderRadius: 'var(--radius)', maxWidth: 320,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>{savedUrl}</span>
                <button type="button" className="btn btn-sm btn-ghost" disabled={busy}
                  onClick={() => setEditingUrl(true)}>החלף קישור</button>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: '.35rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                <input value={url} onChange={e => setUrl(e.target.value)} dir="ltr"
                  placeholder="https://…" style={{ flex: 1, minWidth: 220, textAlign: 'left' }} />
                <button type="button" className="btn btn-sm btn-secondary"
                  disabled={busy || url.trim() === '' || urlInvalid}
                  onClick={() => { p.onRun('record_link', { authUrl: url.trim() }); setEditingUrl(false); }}>
                  שמור קישור
                </button>
                {savedUrl && (
                  <button type="button" className="btn btn-sm btn-ghost"
                    onClick={() => { setUrl(savedUrl); setEditingUrl(false); }}>ביטול</button>
                )}
              </div>
            )}
            {urlInvalid && (
              <div style={{ marginTop: 4, fontSize: 'var(--fs-12)', color: 'var(--err)' }}>
                הקישור חייב להתחיל ב-https://
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: '.35rem', flexWrap: 'wrap', marginTop: '.6rem', alignItems: 'center' }}>
            <button type="button" className="btn btn-sm btn-primary" disabled={busy || !savedUrl}
              onClick={p.onPrepareEmail}>
              {step.status === 'waiting_client' ? 'שלח שוב' : 'הכן מייל'}
            </button>
            {!savedUrl && (
              <span style={{ fontSize: 'var(--fs-12)', color: 'var(--ink-3)' }}>
                יש להזין את קישור ההרשאה מפייפרלס לפני הכנת המייל.
              </span>
            )}
          </div>

          {isStepOpen(step.status) && (
            <div style={{ display: 'flex', gap: '.35rem', flexWrap: 'wrap', marginTop: '.5rem', alignItems: 'center' }}>
              <input value={providerRef} onChange={e => setProviderRef(e.target.value)}
                placeholder="אסמכתא מהספק (לא חובה)" style={{ maxWidth: 220 }} />
              <button type="button" className="btn btn-sm btn-secondary" disabled={busy}
                onClick={() => p.onRun('complete', {
                  completionMethod: 'manual',
                  ...(providerRef.trim() ? { providerRef: providerRef.trim() } : {}),
                })}>הלקוח השלים</button>
            </div>
          )}

          {step.status === 'completed' && (
            <div style={{ marginTop: '.5rem' }}>
              <button type="button" className="btn btn-sm btn-secondary" disabled={busy}
                onClick={() => p.onRun('verify')}>אומת</button>
            </div>
          )}
        </>
      )}
    </StepCardShell>
  );
}

// ═══════════════ כרטיס מכתב השחרור ═══════════════════════════════════════
// ‼ מסלול הרו"ח הקודם מדבר בשפה שלו — טיוטה, מוכן, נשלח, נמסר, התקבלה
// תשובה, הושלם — אבל אין לו מכונת מצבים משלו: כל אחד מהמצבים האלה הוא
// סטטוס גנרי קיים של שלב. הכדור אצל הרו"ח הקודם הוא שהופך "ממתין" ל"נשלח".

/** תרגום הסטטוס הגנרי לשפה של מסלול השחרור. */
function releaseStatusLabel(step: OnboardingStep, hasEmail: boolean): string {
  switch (step.status) {
    case 'pending':        return hasEmail ? 'מוכן לשליחה' : 'טיוטה';
    case 'in_progress':    return 'מוכן לשליחה';
    case 'waiting_client': return 'נשלח';
    case 'completed':      return 'התקבלה תשובה';
    case 'verified':       return 'הושלם';
    default:               return STEP_STATUS_LABELS[step.status];
  }
}

interface ReleaseCardProps {
  step: OnboardingStep;
  stepById: Map<string, OnboardingStep>;
  clientId: string;
  busy: boolean;
  highlight: boolean;
  prevAccountant?: { name?: string; email?: string; phone?: string };
  blockNote?: string;
  onPrepare?: () => void;
  onBlock: () => void;
  onRun: (action: string, payload?: Record<string, unknown>) => void;
  menu: React.ReactNode;
}

function ReleaseStepCard(p: ReleaseCardProps) {
  const { step, stepById, busy, highlight, prevAccountant } = p;
  const email = (prevAccountant?.email ?? '').trim();
  const open = isStepOpen(step.status);
  const sent = step.status === 'waiting_client';
  // שלב נעול/חסום/דולג אינו מציע להכין מכתב — קודם פותחים אותו מחדש.
  const actionable = step.status === 'pending' || step.status === 'in_progress' || sent;
  const canPrepare = !!p.onPrepare && email !== '';

  return (
    <StepCardShell step={step} stepById={stepById} highlight={highlight} menu={p.menu}
      statusLabel={releaseStatusLabel(step, email !== '')}>
      <div style={cardNote}>
        {prevAccountant?.name
          ? <>הרו״ח הקודם: <strong style={{ color: 'var(--ink-2)' }}>{prevAccountant.name}</strong>{email && <> · <span dir="ltr">{email}</span></>}</>
          : email
            ? <>הרו״ח הקודם: <span dir="ltr">{email}</span></>
            : 'המכתב מבקש מהרו״ח הקודם את החומרים ואת שחרור הייצוג. הוא נפתח לעריכה ונשלח רק אחרי אישור.'}
      </div>

      {!email && step.status !== 'completed' && step.status !== 'verified' && (
        <div style={{ marginTop: '.4rem', fontSize: 'var(--fs-13)', color: 'var(--err)' }}>
          חסרה כתובת מייל של הרו״ח הקודם — יש להשלים אותה בתיק הלקוח, בקבוצה "עסקים".
        </div>
      )}

      {step.status === 'blocked' && p.blockNote && (
        <div style={{ marginTop: '.4rem', fontSize: 'var(--fs-13)', color: 'var(--err)' }}>
          חסום: {p.blockNote}
        </div>
      )}

      {(sent || step.status === 'completed' || step.status === 'verified') && (
        <ReleaseDelivery clientId={p.clientId} />
      )}

      <div style={{ display: 'flex', gap: '.35rem', flexWrap: 'wrap', marginTop: '.55rem', alignItems: 'center' }}>
        {actionable && (
          <button type="button" className="btn btn-sm btn-primary"
            disabled={busy || !canPrepare}
            title={email ? undefined : 'חסרה כתובת מייל של הרו״ח הקודם'}
            onClick={() => p.onPrepare?.()}>
            {sent ? 'שלח מכתב שוב' : 'הכן מכתב שחרור'}
          </button>
        )}
        {actionable && !sent && (
          <button type="button" className="btn btn-sm btn-secondary" disabled={busy}
            onClick={() => p.onRun('wait_client', { ball: 'prev_accountant', note: 'המכתב נשלח מחוץ למערכת' })}>
            סמן שנשלח
          </button>
        )}
        {sent && (
          <button type="button" className="btn btn-sm btn-primary" disabled={busy}
            onClick={() => p.onRun('complete', { completionMethod: 'manual', note: 'התקבלה תשובה מהרו״ח הקודם' })}>
            התקבלה תשובה
          </button>
        )}
        {step.status === 'completed' && (
          <button type="button" className="btn btn-sm btn-secondary" disabled={busy}
            onClick={() => p.onRun('verify')}>סמן כהושלם</button>
        )}
        {(step.status === 'blocked' || step.status === 'failed') && (
          <button type="button" className="btn btn-sm btn-secondary" disabled={busy}
            onClick={() => p.onRun('reopen')}>פתח מחדש</button>
        )}
        {open && step.status !== 'blocked' && (
          <button type="button" className="btn btn-sm btn-ghost" disabled={busy} onClick={p.onBlock}>חסום</button>
        )}
      </div>
    </StepCardShell>
  );
}

/** מה קרה למכתב אחרי השליחה — נמסר, נפתח, הוקפץ. מהיומן של המיילים היוצאים. */
function ReleaseDelivery({ clientId }: { clientId: string }) {
  const { user } = useAuth();
  const { messages } = useEmailMessages(user?.id);
  const last = useMemo(
    () => messages
      .filter(m => m.kind === 'release' && m.clientId === clientId)
      .slice()
      .sort((a, b) => (b.sentAt || '').localeCompare(a.sentAt || ''))[0],
    [messages, clientId]);

  if (!last) return null;
  return (
    <div style={{ ...cardNote, marginTop: '.4rem' }}>
      מכתב אחרון אל <span dir="ltr">{last.toEmail}</span> · {relativeTime(last.sentAt)} · {EMAIL_STATUS_LABEL[last.status] ?? last.status}
      {last.openedAt && <> · נפתח {relativeTime(last.openedAt)}</>}
    </div>
  );
}

// ═══════════════ מעטפת משותפת לכרטיסים ═══════════════════════════════════

function StepCardShell({ step, stepById, highlight, danger, statusLabel, menu, children }: {
  step: OnboardingStep;
  stepById: Map<string, OnboardingStep>;
  highlight: boolean;
  danger?: boolean;
  /** ניסוח הסטטוס בשפת המסלול, כשהיא שונה מהניסוח הגנרי. */
  statusLabel?: string;
  menu: React.ReactNode;
  children: React.ReactNode;
}) {
  const tone = TONE_COLOR[STEP_STATUS_TONE[step.status]];
  const locked = step.status === 'locked';
  return (
    <div id={`ob-step-${step.id}`} style={{
      display: 'flex', gap: '.6rem', alignItems: 'flex-start',
      padding: danger || highlight ? '.55rem .6rem' : '.55rem 0',
      borderTop: '1px solid var(--hairline-2)',
      background: danger ? 'var(--red-light)' : highlight ? 'var(--surface-2)' : undefined,
      borderRadius: danger || highlight ? 'var(--radius)' : undefined,
      transition: 'background .3s ease',
    }}>
      <span aria-hidden="true" style={{
        width: 8, height: 8, borderRadius: 999, background: danger ? 'var(--err)' : tone,
        marginTop: '.4rem', flexShrink: 0,
      }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', gap: '.4rem', alignItems: 'flex-start' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 'var(--fs-14)', fontWeight: 600, color: locked ? 'var(--ink-3)' : 'var(--ink-1)' }}>
              {locked && '🔒 '}{STEP_TYPE_LABELS[step.stepType]}
              {step.needsAttention && !danger && (
                <span style={{ color: 'var(--err)', marginInlineStart: '.4rem' }}>· דורש טיפול</span>
              )}
            </div>
            <div style={{
              display: 'flex', gap: '.5rem', flexWrap: 'wrap', alignItems: 'center',
              fontSize: 'var(--fs-12)', color: 'var(--ink-3)', marginTop: 2,
            }}>
              <span style={{ color: tone, fontWeight: 600 }}>{statusLabel ?? STEP_STATUS_LABELS[step.status]}</span>
              <span>· הכדור {STEP_BALL_LABELS[step.ball]}</span>
              {step.dueDate && <span>· עד {formatDate(step.dueDate, 'list')}</span>}
              {locked && <span>· {lockHint(step, stepById)}</span>}
            </div>
          </div>
          <div style={{ display: 'flex', gap: '.35rem', flexWrap: 'wrap' }}>{menu}</div>
        </div>
        {children}
      </div>
    </div>
  );
}

/** שורת בחירה אחת מתוך כמה — הטריאז' של הפייפרלס. */
function RadioRow({ label, name, value, options, onChange }: {
  label: string;
  name: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <div style={{ fontSize: 'var(--fs-13)', fontWeight: 600, color: 'var(--ink-2)', marginBottom: '.2rem' }}>{label}</div>
      <div style={{ display: 'flex', gap: '.8rem', flexWrap: 'wrap' }}>
        {options.map(o => (
          <label key={o.value} style={{ display: 'flex', alignItems: 'center', gap: '.3rem', fontSize: 'var(--fs-13)', color: 'var(--ink-2)' }}>
            <input type="radio" name={name} checked={value === o.value} onChange={() => onChange(o.value)} />
            {o.label}
          </label>
        ))}
      </div>
    </div>
  );
}

const cardNote: React.CSSProperties = {
  marginTop: '.45rem', fontSize: 'var(--fs-13)', color: 'var(--ink-3)', lineHeight: 1.7,
};

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
