// ─── קליטה — מסלול הכניסה של הלקוח ─────────────────────────────────────────
// שורה אחת למעלה אומרת אצל מי הכדור ומה הדבר הבא, ומתחתיה המסלולים.
//
// ‼ שלב נעול מוצג ולא מוסתר: התלות ("הרשאת תשלום רק אחרי חיבור פייפרלס")
// היא כלל עסקי שהרו"ח צריך לראות, אחרת הוא מחפש שלב שנעלם.

import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type {
  Engagement, OnboardingEvent, OnboardingStep, StepChecklistItem,
} from '../../types/onboarding';
import {
  ENGAGEMENT_STATUS_LABELS, EVENT_ACTOR_LABELS, EVENT_TYPE_LABELS, REQUIREMENT_KIND_LABELS,
  STEP_BALL_LABELS, STEP_STATUS_LABELS, STEP_STATUS_TONE, STEP_TYPE_LABELS, TRACK_LABELS,
  isStepOpen,
} from '../../types/onboarding';
import type { RepAuthorityKind } from '../../types';
import { REP_AUTHORITY_LABELS } from '../../types';
import type { AdvanceResult } from '../../hooks/useOnboarding';
import { NEXT_ACTION, nextStepForClient } from '../../utils/onboardingNext';
import { relativeTime } from '../../utils/clientDerived';
import { formatDate } from '../../utils/dateFormat';
import { formatILS } from '../../utils/quotationCalc';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import type { DocCategory } from '../../hooks/useDocumentStore';
import { DOC_CATEGORY_LABELS, useDocumentStore } from '../../hooks/useDocumentStore';
import { useEmailMessages } from '../../hooks/useEmailMessages';
import { EMAIL_STATUS_LABEL } from '../../types/emailActivity';
import EmailPreviewDialog from '../EmailActivity/EmailPreviewDialog';
import ConfirmDialog from '../ui/ConfirmDialog';
import OnboardingJourneyMap from './OnboardingJourneyMap';
import OnboardingProcessBuilder from './OnboardingProcessBuilder';
import AddRequestDialog from './AddRequestDialog';
import JourneyTemplatesDialog from './JourneyTemplatesDialog';

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
  /** מצב בקשת הייצוג בשפת הייצוג ("ממתין למילוי הלקוח") — לא בשפת השלב הגנרי. */
  repStatusLabel?: string;
  /** קפיצה למרכז הייצוג — המסך שבו העבודה באמת נעשית. */
  onOpenRepresentation?: () => void;
  /** שם הלקוח לכותרת בונה התהליך. */
  clientDisplayName?: string;
  /**
   * מוטמע בדף המסע: פס הכדור, מפת המסע וציר הזמן מגיעים מהדף העוטף,
   * וכאן נשארות רק שורות הבקשות. בלי זה היו שתי כותרות שאומרות אותו דבר.
   */
  embedded?: boolean;
  /** סינון לפי אצל-מי-הכדור, מרצועת המונים בדף המסע. null = הכול. */
  ballFilter?: 'me' | 'client' | 'third' | 'stuck' | 'done' | null;
}

/**
 * איזו שורה פתוחה כרגע. דרך context ולא props, כי המעטפת נקראת מתוך שישה
 * כרטיסים מתמחים — העברה ידנית הייתה מוסיפה שני props לכל אחד מהם בלי סיבה.
 */
const RowOpenContext = createContext<{
  openId: string | null;
  toggle: (id: string) => void;
  /** הזזת השורה בסדר התצוגה. null ⇒ אין סידור במסך הזה. */
  onMove?: (id: string, dir: -1 | 1) => void;
  /** פתיחת בקשה שנשמרה כטיוטה, אל הדף האישי של הלקוח. */
  onPublish?: (id: string) => void;
}>({ openId: null, toggle: () => {} });

/** שם השורה. בקשה חופשית נושאת את השם שהרו"ח נתן לה, לא תווית גנרית. */
function rowTitle(step: OnboardingStep): string {
  if (step.stepType === 'custom_request') {
    const t = String(step.payload.title ?? '').trim();
    if (t) return t;
  }
  return STEP_TYPE_LABELS[step.stepType];
}

/** כמה זמן השורה עומדת במצב הזה — "9 ימים" ולא תאריך שצריך לחשב בראש. */
function ageLabel(step: OnboardingStep): string | null {
  const from = step.updatedAt ?? step.createdAt;
  if (!from) return null;
  const days = Math.floor((Date.now() - new Date(from).getTime()) / 86400000);
  if (!Number.isFinite(days) || days < 1) return null;
  return days === 1 ? 'יום אחד' : `${days} ימים`;
}

/** "2/3" — התקדמות פנימית של בקשה, כשיש לה פריטים. */
function progressLabel(step: OnboardingStep): string | null {
  const list = step.payload.requirements ?? step.payload.checklist;
  if (!Array.isArray(list) || list.length === 0) return null;
  return `${list.filter(i => i.done).length}/${list.length}`;
}

const TONE_COLOR: Record<string, string> = {
  ok: 'var(--ok, #17845b)',
  warn: 'var(--warn)',
  err: 'var(--err)',
  muted: 'var(--ink-3)',
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

// ─── מסלול הפייפרלס ────────────────────────────────────────────────────────
// שתי עובדות על הלקוח (האם הוא כבר בפייפרלס, ואיפה ההיסטוריה שלו) קובעות את
// כל השלבים. הן נשמרות פעם אחת, דרך set_paperless_path — אותה פונקציה בשרת
// שגם מרכיבה ומבטלת את שלבי הייבוא והאימות.

// ‼ 'not_applicable' אינו "עדיין לא" אלא "לא יהיה": שכיר להחזר מס, בעל שליטה,
// לקוח שגובים ממנו בהוראת קבע. בלי המצב הזה נפתחו לו שלבי הזמנה וחיבור
// שלעולם לא ייסגרו, והכסף נשאר נעול מאחוריהם.
export type PaperlessStatus = 'none' | 'other_rep' | 'self' | 'not_applicable';
export type PaperlessDataSource = 'none' | 'other_software';

const PAPERLESS_STATUS_OPTIONS: { value: PaperlessStatus; label: string }[] = [
  { value: 'none', label: 'לא' },
  { value: 'other_rep', label: 'כן, אצל מייצג אחר' },
  { value: 'self', label: 'כן, עצמאית' },
  { value: 'not_applicable', label: 'לא יעבוד עם פייפרלס' },
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

/** איך גובים מלקוח שאינו בפייפרלס. רשימה סגורה — טקסט חופשי כאן היה הופך
 *  את השדה לבלתי ניתן לסינון בעוד שנה. */
const COLLECTION_METHODS = ['הוראת קבע בבנק', 'כרטיס אשראי', 'העברה בנקאית חודשית', 'המחאות', 'אחר'];

export default function OnboardingTab({
  clientId, engagements, steps, events, loading, advance, refresh,
  prevAccountant, onPrepareReleaseLetter, repStatusLabel, onOpenRepresentation,
  clientDisplayName, embedded, ballFilter,
}: Props) {
  const [error, setError] = useState<string | null>(null);
  const [closing, setClosing] = useState(false);
  const [busyStepId, setBusyStepId] = useState<string | null>(null);
  const [menuStepId, setMenuStepId] = useState<string | null>(null);
  // חלון המייל של שלב — נפתח מהכרטיס, נשלח דרך send-step-email
  const [emailDialog, setEmailDialog] = useState<{ stepId: string; kind: 'paperless_invite' | 'retainer_request' | 'step_reminder' | 'intake_questionnaire'; heading: string } | null>(null);
  const [confirmState, setConfirmState] = useState<{ stepId: string; title: string; message: string; confirmLabel: string } | null>(null);
  // "שנה מסלול" — פותח מחדש את הטריאז' על שלב שכבר נענה
  const [retriageStepId, setRetriageStepId] = useState<string | null>(null);
  const [triageBusy, setTriageBusy] = useState(false);
  const [triageError, setTriageError] = useState<string | null>(null);
  const [highlightStepId, setHighlightStepId] = useState<string | null>(null);
  // מה שהושלם לא נעלם, אבל גם לא תופס את המסך — הוא מקופל עד שמבקשים אותו.
  const [showDone, setShowDone] = useState(false);
  // שורה סגורה מראה שם, מצב ופעולה; פתיחה חושפת את הפרטים וההיסטוריה שלה.
  const [openRowId, setOpenRowId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [ordering, setOrdering] = useState(false);
  const highlightTimer = useRef<number | null>(null);

  useEffect(() => () => {
    if (highlightTimer.current) window.clearTimeout(highlightTimer.current);
  }, []);

  // ─── מילוי אוטומטי של ההקמה הפנימית ──────────────────────────────────────
  // ‼ מספרי התיקים והמטפל כבר ידועים למערכת מרגע הייצוג. לבקש מהרו"ח לסמן
  // אותם ביד זו בקשה לאשר מה שכבר נכון. הפונקציה בשרת אידמפוטנטית, ולכן
  // ה-ref כאן חוסך רק קריאת רשת מיותרת — לא מגן על נכונות.
  const autofilled = useRef(new Set<string>());
  useEffect(() => {
    if (!clientId || loading || autofilled.current.has(clientId)) return;
    if (!steps.some(s => s.clientId === clientId && s.stepType === 'internal_setup'
                    && isStepOpen(s.status))) return;
    autofilled.current.add(clientId);
    void (async () => {
      const { data } = await supabase.rpc('autofill_internal_setup', { p_client_id: clientId });
      const res = data as { ok?: boolean; noop?: boolean } | null;
      if (res?.ok && !res.noop) refresh?.();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, loading, steps]);

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

  // ‼ אותה פונקציה בדיוק שמניעה את השולחן ואת מסך הלקוחות — ראה
  // utils/onboardingNext.ts. שני מסכים שמחשבים "הבא בתור" אחרת סותרים זה את זה.
  const nextStep = useMemo(() => nextStepForClient(clientSteps), [clientSteps]);

  /** תוויות התנאים — בלשון "מה חסר", לא בשמות השדות של השרת. */
  const CLOSE_BLOCKERS: Record<string, string> = {
    retainer: 'הרשאת התשלום או הסדר הגבייה טרם הוקמו',
    releaseLetter: 'מכתב השחרור לרו״ח הקודם טרם נשלח או שחלון ההתנגדות לא עבר',
    intake: 'שאלון פתיחת התיק טרם נשלח',
  };

  async function closeOnboarding(force: boolean) {
    const eng = clientEngagements[0];
    if (!eng) return;
    setClosing(true);
    setError(null);
    const { data, error: rpcError } = await supabase.rpc('close_onboarding', {
      p_engagement_id: eng.id, p_force: force, p_reason: null,
    });
    const res = data as { ok?: boolean; error?: string; readiness?: Record<string, string> } | null;
    setClosing(false);

    if (rpcError) { setError('לא הצלחתי לסגור את הקליטה.'); return; }
    if (res?.ok) { refresh?.(); return; }

    if (res?.error === 'not_ready') {
      const missing = Object.keys(CLOSE_BLOCKERS)
        .filter(k => !['done', 'not_required', 'no_objection', 'sent'].includes(res.readiness?.[k] ?? ''))
        .map(k => CLOSE_BLOCKERS[k]);
      const blocking = Number((res.readiness as unknown as { blocking?: unknown[] })?.blocking?.length ?? 0);
      if (blocking > 0) missing.push(`${blocking} שלבים עדיין פתוחים`);
      const ok = window.confirm(
        `הקליטה עדיין לא סגורה:\n\n• ${missing.join('\n• ')}\n\nלסגור בכל זאת? הסיבה תירשם ביומן.`);
      if (ok) void closeOnboarding(true);
      return;
    }
    setError('לא הצלחתי לסגור את הקליטה.');
  }

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
        // ‼ מי שלא יעבוד עם פייפרלס — אין לו "היסטוריה בפייפרלס" לאמת.
        p_data_source: answers.paperlessStatus === 'none' ? answers.dataSource
          : answers.paperlessStatus === 'not_applicable' ? 'none' : 'paperless',
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

  // ─── הקישור האחיד ללקוח ──────────────────────────────────────────────────
  const [portalCopied, setPortalCopied] = useState(false);
  async function copyPortalLink() {
    setError(null);
    const { data, error: rpcError } = await supabase.rpc('mint_portal_token', { p_client_id: clientId });
    const token = (data as string | null) ?? null;
    if (rpcError || !token) {
      setError('לא הצלחתי להנפיק קישור ללקוח.');
      return;
    }
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/?portal=${token}`);
      setPortalCopied(true);
      window.setTimeout(() => setPortalCopied(false), 2200);
    } catch {
      // הדפדפן חסם גישה ללוח — מציגים את הקישור כדי שאפשר להעתיק ידנית
      window.prompt('העתק את הקישור:', `${window.location.origin}/?portal=${token}`);
    }
  }

  /** קפיצה לשלב אחר בעמוד, עם הדגשה קצרה — כדי שברור לאן הגענו. */
  function gotoStep(stepId: string) {
    setHighlightStepId(stepId);
    document.getElementById(`ob-step-${stepId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    if (highlightTimer.current) window.clearTimeout(highlightTimer.current);
    highlightTimer.current = window.setTimeout(() => setHighlightStepId(null), 2600);
  }

  // ‼ ללקוח ותיק אין התקשרות ואין שלבים — וזה הרוב אצל רו"ח שכבר עובד שנים.
  // המסך הזה היה מבוי סתום: הודעה שאומרת "אין קליטה" ואפס דרך לבקש ממנו משהו.
  // בקשה אינה שייכת רק לקליטה; אפשר לבקש מסמך מלקוח פעיל בכל רגע.
  if (clientEngagements.length === 0 && clientSteps.length === 0) {
    return (
      <div className="cw-tabpanel">
        <div className="cw-section">
          <div className="cw-section-head">
            <span>בקשות</span>
            <span style={{ display: 'flex', gap: '.4rem' }}>
              <button type="button" className="btn btn-sm btn-ghost" onClick={() => setTemplatesOpen(true)}>תבניות</button>
              <button type="button" className="btn btn-sm btn-ghost" onClick={() => setAddOpen(true)}>+ בקשה</button>
            </span>
          </div>
          <div className="cw-empty">
            אין בקשות פתוחות. אפשר לבקש מסמך או לשלוח בקשה חופשית בכל שלב —
            הלקוח יראה אותה בדף האישי שלו.
          </div>
        </div>

        {addOpen && (
          <AddRequestDialog
            clientId={clientId}
            steps={clientSteps}
            processPublished
            onClose={() => setAddOpen(false)}
            onCreated={() => refresh?.()}
          />
        )}
        {templatesOpen && (
          <JourneyTemplatesDialog
            clientId={clientId}
            clientName={clientDisplayName ?? 'הלקוח'}
            onClose={() => setTemplatesOpen(false)}
            onApplied={() => refresh?.()}
          />
        )}
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

  // ‼ רשימה אחת בסדר שהרו"ח קבע, לא קיבוץ למסלולים. הקיבוץ הישן פיזר בקשה
  // אחת לשש קופסאות ואילץ לקרוא את כולן כדי לדעת מה הדבר הבא; המסע הוא רצף.
  const matchesBall = (s: OnboardingStep) => {
    if (!ballFilter) return true;
    if (ballFilter === 'done') return !isStepOpen(s.status);
    if (!isStepOpen(s.status)) return false;
    if (ballFilter === 'stuck') return s.status === 'blocked' || s.status === 'failed' || s.needsAttention;
    if (ballFilter === 'third') return s.ball === 'authority' || s.ball === 'prev_accountant';
    return s.ball === ballFilter;
  };

  const visibleSteps = clientSteps.filter(matchesBall);
  const openSteps = visibleSteps.filter(s => isStepOpen(s.status));
  const doneSteps = visibleSteps.filter(s => !isStepOpen(s.status));

  /** הזזת שורה בסדר התצוגה. מסדרים את כל הפתוחות, לא רק את מה שמסונן. */
  async function moveRow(id: string, dir: -1 | 1) {
    const list = clientSteps.filter(s => isStepOpen(s.status)).map(s => s.id);
    const i = list.indexOf(id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    setOrdering(true);
    const { error: rpcError } = await supabase.rpc('reorder_onboarding_steps', {
      p_client_id: clientId, p_ids: list,
    });
    setOrdering(false);
    if (rpcError) { setError(rpcError.message); return; }
    refresh?.();
  }

  async function publishRequest(id: string) {
    const { data, error: rpcError } = await supabase.rpc('publish_onboarding_request', { p_step_id: id });
    const res = data as { ok?: boolean; error?: string } | null;
    if (rpcError || !res?.ok) { setError(rpcError?.message ?? 'פתיחת הבקשה נכשלה.'); return; }
    refresh?.();
    // הבקשה נחשפה — עכשיו אפשר להציע את המייל שמודיע עליה.
    setEmailDialog({ stepId: id, kind: 'step_reminder', heading: 'הודעה ללקוח על הבקשה' });
  }

  // ‼ אותו מסך, שני מצבים. כל עוד התהליך לא נפתח ללקוח — מצב בנייה: מרכיבים
  // מה מבקשים ממנו. אחרי הפתיחה — מצב ניהול. אין כאן שני מסכים שסותרים.
  if (activeEngagement && !activeEngagement.processPublishedAt) {
    return (
      <div className="cw-tabpanel">
        <OnboardingProcessBuilder
          clientName={clientDisplayName ?? 'הלקוח'}
          engagement={activeEngagement}
          steps={steps.filter(s => s.clientId === clientId)}
          advance={advance}
          refresh={refresh}
        />
      </div>
    );
  }

  return (
    <RowOpenContext.Provider value={{
      openId: openRowId,
      toggle: (id: string) => setOpenRowId(cur => (cur === id ? null : id)),
      onMove: ordering ? undefined : (id, dir) => void moveRow(id, dir),
      onPublish: (id) => void publishRequest(id),
    }}>
    <div className="cw-tabpanel">
      {error && (
        <div style={{
          padding: '.55rem .8rem', borderRadius: 'var(--radius)',
          background: 'var(--red-light)', color: 'var(--err)', fontSize: 'var(--fs-13)',
        }}>⚠ {error}</div>
      )}

      {/* ── שורת הכדור — אותו מבט של שורת המצב בייצוג ──
          מוטמע בדף המסע: רצועת המונים שם אומרת את אותו הדבר, ולכן היא יורדת. */}
      {!embedded && <div style={{
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
        <span style={{ fontSize: 'var(--fs-13)', color: 'var(--ink-3)', flex: 1 }}>{ballSub}</span>
        {/* ‼ הקישור האחיד ללקוח — אותו קישור תמיד, גם בוואטסאפ. הדף מציג את
            המצב העדכני, ולכן אין "איזה קישור שלחתי" — יש קישור אחד. */}
        <button type="button" className="btn btn-sm btn-ghost"
          onClick={() => void copyPortalLink()}
          title="קישור לדף האישי של הלקוח — מציג לו מה הושלם ומה ממתין">
          {portalCopied ? '✓ הועתק' : 'קישור ללקוח'}
        </button>
        {/* ‼ סגירת קליטה היא החלטה ולא תוצר לוואי. השרת בודק את התנאים
            ואומר מה חסר; לכפות אפשר, אבל עם סיבה שנרשמת ביומן. */}
        {activeEngagement?.status === 'onboarding' && (
          <button type="button" className="btn btn-sm btn-ghost" disabled={closing}
            onClick={() => void closeOnboarding(false)}
            title="מעביר את הלקוח לשוטף — אחרי בדיקת התנאים">
            {closing ? 'סוגר…' : 'סגור קליטה'}
          </button>
        )}
      </div>}

      {!embedded && clientSteps.length > 0 && (
        <OnboardingJourneyMap steps={clientSteps} onSelect={gotoStep} />
      )}

      {loading && clientSteps.length === 0 && <div className="cw-empty">טוען…</div>}

      {[
        { key: 'open', title: 'מה ביקשתי', list: openSteps },
        { key: 'done', title: 'הושלם', list: showDone ? doneSteps : [] },
      ].filter(g => g.key === 'open' ? true : doneSteps.length > 0).map(({ key, title, list }) => (
        <div key={key} className="cw-section">
          <div className="cw-section-head">
            {key === 'done' ? (
              <button type="button" onClick={() => setShowDone(v => !v)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '.35rem', color: 'inherit', font: 'inherit',
                  background: 'none', border: 'none', appearance: 'none', padding: 0, cursor: 'pointer',
                }}>
                <span aria-hidden="true">{showDone ? '▾' : '▸'}</span>
                <span>{title}</span>
              </button>
            ) : <span>{title}</span>}
            <span style={{ display: 'flex', alignItems: 'center', gap: '.5rem' }}>
              <span className="cw-section-count">{key === 'done' ? doneSteps.length : list.length}</span>
              {key === 'open' && (
                <>
                  <button type="button" className="btn btn-sm btn-ghost" onClick={() => setTemplatesOpen(true)}>
                    תבניות
                  </button>
                  <button type="button" className="btn btn-sm btn-ghost" onClick={() => setAddOpen(true)}>
                    + בקשה
                  </button>
                </>
              )}
            </span>
          </div>
          {key === 'open' && list.length === 0 && (
            <div className="cw-empty">{ballFilter ? 'אין בקשות שמתאימות לסינון.' : 'כל הבקשות הושלמו.'}</div>
          )}
          <div>
            {list.map(step => {
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
                      {/* ‼ שלב הייצוג מסונכרן מהשרת — "דלג" ו"חסום" ידניים היו
                          נדרסים בטריגר הבא ומשקרים עד אז. נשארת רק הערה. */}
                      {step.stepType !== 'representation' && (
                        <>
                          <button type="button" className="btn btn-sm btn-ghost" onClick={() => handleSkip(step)}>דלג</button>
                          <button type="button" className="btn btn-sm btn-ghost" onClick={() => handleBlock(step)}>חסום</button>
                        </>
                      )}
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

              if (step.stepType === 'representation_upgrade') {
                return (
                  <RepresentationUpgradeCard
                    key={step.id}
                    step={step}
                    stepById={stepById}
                    busy={busy}
                    highlight={highlightStepId === step.id}
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

              if (step.stepType === 'representation') {
                return (
                  <RepresentationStepCard
                    key={step.id}
                    step={step}
                    stepById={stepById}
                    highlight={highlightStepId === step.id}
                    statusLabel={repStatusLabel}
                    onOpen={onOpenRepresentation}
                    menu={menu}
                  />
                );
              }

              if (step.stepType === 'intake_questionnaire') {
                return (
                  <IntakeStepCard
                    key={step.id}
                    step={step}
                    stepById={stepById}
                    busy={busy}
                    highlight={highlightStepId === step.id}
                    onPrepareEmail={() => setEmailDialog({
                      stepId: step.id, kind: 'intake_questionnaire', heading: 'מייל שאלון פתיחת תיק',
                    })}
                    onRun={(action, payload) => void run(step, action, payload)}
                    menu={menu}
                  />
                );
              }

              if (step.stepType === 'kyc_identification') {
                return (
                  <KycStepCard
                    key={step.id}
                    step={step}
                    stepById={stepById}
                    clientId={clientId}
                    busy={busy}
                    highlight={highlightStepId === step.id}
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
                <JourneyRow
                  key={step.id}
                  step={step}
                  stepById={stepById}
                  highlight={highlightStepId === step.id}
                  menu={<>
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
                    {/* ‼ הכפתור נקרא על שם מי שבאמת מחזיק את הכדור. "הלקוח השלים"
                        על שלב שממתין לרו״ח הקודם או לרשות הוא פשוט לא נכון. */}
                    {step.status === 'waiting_client' && (
                      <button type="button" className="btn btn-sm btn-primary" disabled={busy}
                        onClick={() => void run(step, 'complete')}>
                        {step.ball === 'prev_accountant' ? 'החומרים הגיעו'
                          : step.ball === 'authority' ? 'התקבל מהרשות'
                          : 'הלקוח השלים'}
                      </button>
                    )}
                    {step.status === 'completed' && (
                      <button type="button" className="btn btn-sm btn-secondary" disabled={busy}
                        onClick={() => void run(step, 'verify')}>אמת</button>
                    )}
                    {(step.status === 'blocked' || step.status === 'failed') && (
                      <button type="button" className="btn btn-sm btn-secondary" disabled={busy}
                        onClick={() => void run(step, 'reopen')}>פתח מחדש</button>
                    )}

                    {/* ‼ תזכורת מוצעת רק כשהכדור בחוץ. שלב שהכדור בו אצלי
                        לא צריך תזכורת — הוא צריך שאעשה אותו. */}
                    {step.needsAttention && isStepOpen(step.status) && step.ball === 'client' && (
                      <button type="button" className="btn btn-sm btn-secondary" disabled={busy}
                        onClick={() => setEmailDialog({
                          stepId: step.id, kind: 'step_reminder', heading: 'תזכורת ללקוח',
                        })}>הכן תזכורת</button>
                    )}

                    {menu}
                  </>}
                >
                  {/* ‼ הסימון הידני נשאר גם כשהלקוח או הרו״ח הקודם מעלים בעצמם:
                      חומרים מגיעים גם בוואטסאפ ובמייל, ואי אפשר לתלות את המעקב
                      בערוץ אחד בלבד (הכרעת גיא 2026-08-05). */}
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
                          {item.documentId && (
                            <span style={{ color: 'var(--ink-4)', fontSize: 'var(--fs-12)' }}>· הועלה</span>
                          )}
                        </label>
                      ))}
                    </div>
                  )}
                  {step.stepType === 'custom_request' && <CustomRequestBody step={step} />}
                </JourneyRow>
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

      {addOpen && (
        <AddRequestDialog
          clientId={clientId}
          steps={clientSteps}
          processPublished={!!activeEngagement?.processPublishedAt}
          onClose={() => setAddOpen(false)}
          onCreated={() => refresh?.()}
        />
      )}

      {templatesOpen && (
        <JourneyTemplatesDialog
          clientId={clientId}
          clientName={clientDisplayName ?? 'הלקוח'}
          onClose={() => setTemplatesOpen(false)}
          onApplied={() => refresh?.()}
        />
      )}
    </div>
    </RowOpenContext.Provider>
  );
}

/**
 * גוף הבקשה החופשית אצל הרו"ח — מה בדיוק ביקשתי ומה הלקוח כבר מסר.
 * לקריאה בלבד: התשובות מגיעות מהדף האישי, ולא נערכות מכאן.
 */
function CustomRequestBody({ step }: { step: OnboardingStep }) {
  const reqs = step.payload.requirements ?? [];
  if (reqs.length === 0) return null;
  return (
    <div style={{ marginTop: '.45rem', display: 'flex', flexDirection: 'column', gap: '.25rem' }}>
      {step.payload.clientTitle && (
        <div style={{ fontSize: 'var(--fs-12)', color: 'var(--ink-4)' }}>
          הלקוח רואה: “{step.payload.clientTitle}”
        </div>
      )}
      {reqs.map(r => (
        <div key={r.key} style={{
          display: 'flex', gap: '.4rem', alignItems: 'baseline',
          fontSize: 'var(--fs-13)', color: r.done ? 'var(--ink-3)' : 'var(--ink-2)',
        }}>
          <span aria-hidden="true" style={{ color: r.done ? 'var(--ok, #17845b)' : 'var(--ink-4)' }}>
            {r.done ? '✓' : '○'}
          </span>
          <span>{r.label}</span>
          <span style={{ color: 'var(--ink-4)', fontSize: 'var(--fs-12)' }}>
            · {REQUIREMENT_KIND_LABELS[r.kind]}
          </span>
          {r.value && <span style={{ color: 'var(--ink-1)', fontWeight: 600 }}>· {r.value}</span>}
          {r.documentId && <span style={{ color: 'var(--ink-4)', fontSize: 'var(--fs-12)' }}>· קובץ הועלה</span>}
        </div>
      ))}
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
  // "לא יעבוד עם פייפרלס" מייתר את שאלת ההיסטוריה — אין לאן לייבא אותה.
  const asksHistory = status === 'none';

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

          {asksHistory && (
            <RadioRow
              label="יש היסטוריה לייבא?"
              name={`pl-source-${step.id}`}
              value={source}
              options={DATA_SOURCE_OPTIONS}
              onChange={v => setSource(v as PaperlessDataSource)}
            />
          )}

          {asksHistory && source === 'other_software' && (
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
  if (path === 'not_applicable') {
    return (
      <div style={cardNote}>
        הלקוח לא יעבוד עם פייפרלס. שלבי ההזמנה והחיבור ירדו מהמסלול, והגבייה
        החודשית מוסדרת ידנית בשלב התשלום.
      </div>
    );
  }
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
  if (path === 'not_applicable') {
    return (
      <div style={cardNote}>
        אין חיבור לפייפרלס ללקוח הזה. אם זה ישתנה — "שנה מסלול" יחזיר את
        ההזמנה והחיבור, והתשלום יחזור להיות תלוי בהם.
      </div>
    );
  }
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
  // ‼ לקוח שאינו עובד עם פייפרלס: אין קישור הרשאה, אין מייל, ואין מנעול —
  // אבל יש כסף. הכרטיס מתעד איך גובים במקום.
  const manual = step.payload.method === 'manual_arrangement';
  const [method, setMethod] = useState(String(step.payload.collectionMethod ?? ''));

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

      {manual ? (
        <>
          <div style={cardNote}>
            הלקוח לא עובד עם פייפרלס — אין כאן הרשאה דיגיטלית ואין מייל ללקוח.
            רושמים איך גובים בפועל, ומסמנים כשההסדר הוקם.
          </div>
          {isStepOpen(step.status) && (
            <div style={{ display: 'flex', gap: '.35rem', flexWrap: 'wrap', marginTop: '.55rem', alignItems: 'center' }}>
              <select value={method} onChange={e => setMethod(e.target.value)} style={{ maxWidth: 220 }}>
                <option value="">אופן הגבייה…</option>
                {COLLECTION_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
              <button type="button" className="btn btn-sm btn-primary" disabled={busy || !method}
                onClick={() => p.onRun('complete', {
                  completionMethod: 'manual', collectionMethod: method,
                  note: `הסדר גבייה הוקם — ${method}`,
                })}>ההסדר הוקם</button>
            </div>
          )}
          {step.status === 'completed' && (
            <div style={{ marginTop: '.5rem' }}>
              <button type="button" className="btn btn-sm btn-secondary" disabled={busy}
                onClick={() => p.onRun('verify')}>אומת</button>
            </div>
          )}
        </>
      ) : locked ? (
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

// ═══════════════ כרטיס שדרוג הייצוג ══════════════════════════════════════
// ‼ אין כאן כפתור "סיימתי": השלב נסגר מעצמו ברגע שאין יותר רשות שרשומה
// כמייצג משני. כל מה שהרו"ח עושה כאן הוא לקבוע מתי להזכיר לו לבדוק.

interface UpgradeCardProps {
  step: OnboardingStep;
  stepById: Map<string, OnboardingStep>;
  busy: boolean;
  highlight: boolean;
  onRun: (action: string, payload?: Record<string, unknown>) => void;
  menu: React.ReactNode;
}

function RepresentationUpgradeCard(p: UpgradeCardProps) {
  const { step, stepById, busy, highlight } = p;
  const [due, setDue] = useState(step.dueDate ?? '');

  const secondary = (step.payload.secondaryAuthorities ?? [])
    .filter((k): k is RepAuthorityKind => k in REP_AUTHORITY_LABELS)
    .map(k => REP_AUTHORITY_LABELS[k]);

  return (
    <StepCardShell step={step} stepById={stepById} highlight={highlight} menu={p.menu}
      danger={step.needsAttention}>
      {step.needsAttention && (
        <div style={{ marginTop: '.35rem', fontSize: 'var(--fs-13)', color: 'var(--err)', fontWeight: 600 }}>
          הגיע מועד התזכורת
        </div>
      )}

      {secondary.length > 0 && (
        <div style={{ marginTop: '.45rem', fontSize: 'var(--fs-13)', color: 'var(--ink-2)' }}>
          רשום כמייצג משני ב: <strong>{secondary.join(', ')}</strong>
        </div>
      )}

      <div style={cardNote}>
        הרו״ח הקודם עדיין רשום כמייצג הראשי. כשהוא ישוחרר — לשנות את רמת הייצוג
        בכרטיס ל״מייצג ראשי״, והשלב ייסגר מעצמו.
      </div>

      {isStepOpen(step.status) && (
        <div style={{ display: 'flex', gap: '.35rem', flexWrap: 'wrap', marginTop: '.55rem', alignItems: 'flex-end' }}>
          <label style={{ fontSize: 'var(--fs-12)', color: 'var(--ink-3)' }}>
            להזכיר לי בתאריך
            <input type="date" value={due} onChange={e => setDue(e.target.value)}
              disabled={busy} style={{ marginTop: 3, display: 'block' }} />
          </label>
          <button type="button" className="btn btn-sm btn-secondary"
            disabled={busy || !due || due === (step.dueDate ?? '')}
            onClick={() => p.onRun('set_due', { dueDate: due })}>
            עדכן תזכורת
          </button>
        </div>
      )}
    </StepCardShell>
  );
}

// ═══════════════ כרטיס הייצוג ════════════════════════════════════════════
// ‼ השלב הזה הוא מראה, לא מתג: הוא מסונכרן אוטומטית מבקשת הייצוג (טריגר
// sync_representation_step), ולכן אין עליו אף כפתור סימון ידני. הכפתור הגנרי
// "הלקוח השלים" שהיה כאן היה משקר — צובע את השלב ירוק בזמן שהבקשה עוד
// ממתינה, עד שהטריגר היה דורס אותו בשקט.
// מה שכן יש: הדלת למרכז הייצוג, כי משם עושים את העבודה — וגיא צדק שלא
// הגיוני לצאת למסך הלקוחות כדי למצוא אותה.

function RepresentationStepCard({ step, stepById, highlight, statusLabel, onOpen, menu }: {
  step: OnboardingStep;
  stepById: Map<string, OnboardingStep>;
  highlight: boolean;
  statusLabel?: string;
  onOpen?: () => void;
  menu: React.ReactNode;
}) {
  const open = isStepOpen(step.status);
  return (
    <StepCardShell step={step} stepById={stepById} highlight={highlight} menu={menu}
      statusLabel={statusLabel}>
      <div style={cardNote}>
        {open
          ? 'השלב מתעדכן מעצמו לפי התקדמות בקשת הייצוג — אין כאן מה לסמן ידנית. הבדיקה, החתימה וההגשה נעשות במרכז הייצוג.'
          : 'הייצוג הושלם. הפירוט המלא — במרכז הייצוג.'}
      </div>
      {onOpen && (
        <div style={{ marginTop: '.55rem' }}>
          <button type="button"
            className={`btn btn-sm ${open && step.ball === 'me' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={onOpen}>
            למרכז הייצוג ←
          </button>
        </div>
      )}
    </StepCardShell>
  );
}

// ═══════════════ כרטיס שאלון פתיחת התיק ══════════════════════════════════
// ‼ במסלול הפנימי ולא ב"כלים": העיתוי הוא החלטה של הרו"ח. לקוח שמקבל שאלון
// באותו יום שבו הוא חתם על ההצעה מרגיש שנפל עליו טופס; מי ששולח אותו יודע
// מתי הרגע הנכון, והמערכת לא מנחשת במקומו.
// ‼ נסגר לבד כשהלקוח מסיים למלא (close_intake_step_for_client) — אין צורך
// לשאול "האם הוא כבר מילא" ואין מה לסמן ידנית.

function IntakeStepCard({ step, stepById, busy, highlight, onPrepareEmail, onRun, menu }: {
  step: OnboardingStep;
  stepById: Map<string, OnboardingStep>;
  busy: boolean;
  highlight: boolean;
  onPrepareEmail: () => void;
  onRun: (action: string, payload?: Record<string, unknown>) => void;
  menu: React.ReactNode;
}) {
  const open = isStepOpen(step.status);
  const sent = step.status === 'waiting_client';
  return (
    <StepCardShell step={step} stepById={stepById} highlight={highlight} menu={menu}>
      <div style={cardNote}>
        {sent
          ? 'השאלון נשלח. ברגע שהלקוח יסיים למלא — השלב ייסגר מעצמו והתשובות יופיעו בכרטיס.'
          : 'שאלון שממפה את מצב המס של הלקוח: מצב משפחתי וילדים, מקורות הכנסה, הפקדות לפנסיה וקרן השתלמות, ונכסים להצהרת הון. מה שיענה כאן לא ייאסף שוב בדוח השנתי.'}
      </div>

      {open && (
        <div style={{ display: 'flex', gap: '.35rem', flexWrap: 'wrap', marginTop: '.55rem', alignItems: 'center' }}>
          <button type="button" className="btn btn-sm btn-primary" disabled={busy}
            onClick={onPrepareEmail}>
            {sent ? 'שלח שוב' : 'הכן מייל שאלון'}
          </button>
          {sent && (
            <button type="button" className="btn btn-sm btn-secondary" disabled={busy}
              onClick={() => onRun('complete', { completionMethod: 'manual', note: 'סומן ידנית כמולא' })}>
              הלקוח מילא
            </button>
          )}
        </div>
      )}
      {step.status === 'completed' && (
        <div style={{ marginTop: '.5rem' }}>
          <button type="button" className="btn btn-sm btn-secondary" disabled={busy}
            onClick={() => onRun('verify')}>עברתי על התשובות</button>
        </div>
      )}
    </StepCardShell>
  );
}

// ═══════════════ כרטיס הכרת הלקוח ════════════════════════════════════════
// ‼ מסמכי הזיהוי כבר בתיק — הלקוח העלה אותם כשמילא את טופס הייצוג. השלב הזה
// אינו איסוף אלא אישור: הרו"ח מסתכל ומאשר. לכן הכרטיס מביא את המסמכים אליו
// במקום לשלוח אותו לחפש אותם בלשונית אחרת.
// ‼ הלחיצה נשארת ידנית בכוונה. זו חובה רגולטורית (איסור הלבנת הון) — המערכת
// לא חותמת עליה במקום רואה החשבון, גם כשכל החומר לפניה.

const KYC_DOC_CATEGORIES: DocCategory[] = ['id_card', 'drivers_license'];

function KycStepCard({ step, stepById, clientId, busy, highlight, onRun, menu }: {
  step: OnboardingStep;
  stepById: Map<string, OnboardingStep>;
  clientId: string;
  busy: boolean;
  highlight: boolean;
  onRun: (action: string, payload?: Record<string, unknown>) => void;
  menu: React.ReactNode;
}) {
  const { getDocsByClient } = useDocumentStore();
  const [docs, setDocs] = useState<{ id: string; name: string; category: DocCategory }[]>([]);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const all = await getDocsByClient(clientId);
        if (cancelled) return;
        setDocs(all
          .filter(d => KYC_DOC_CATEGORIES.includes(d.category))
          .map(d => ({ id: d.id, name: d.fileName, category: d.category })));
      } catch { /* אין מסמכים / אין הרשאה — הכרטיס פשוט לא יציג רשימה */ }
      if (!cancelled) setChecked(true);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  const open = isStepOpen(step.status);

  return (
    <StepCardShell step={step} stepById={stepById} highlight={highlight} menu={menu}>
      <div style={cardNote}>
        {docs.length > 0 ? (
          <>נאספו בתהליך הייצוג — נשאר לוודא שהם קריאים ותואמים לפרטי הלקוח:</>
        ) : checked ? (
          <>לא נמצאו מסמכי זיהוי בתיק. אפשר להעלות אותם בלשונית המסמכים, או לאשר
            אם הזיהוי נעשה בדרך אחרת.</>
        ) : 'טוען מסמכים…'}
      </div>

      {docs.length > 0 && (
        <ul style={{
          margin: '.35rem 0 0', paddingInlineStart: '1.1rem',
          fontSize: 'var(--fs-13)', color: 'var(--ink-2)',
        }}>
          {docs.map(d => (
            <li key={d.id}>{DOC_CATEGORY_LABELS[d.category]} — {d.name}</li>
          ))}
        </ul>
      )}

      {open && (
        <div style={{ display: 'flex', gap: '.35rem', flexWrap: 'wrap', marginTop: '.55rem' }}>
          <button type="button" className="btn btn-sm btn-primary" disabled={busy}
            onClick={() => onRun('complete', { completionMethod: 'manual', note: 'הזיהוי נבדק ואושר' })}>
            בדקתי — מאושר
          </button>
        </div>
      )}
      {step.status === 'completed' && (
        <div style={{ marginTop: '.5rem' }}>
          <button type="button" className="btn btn-sm btn-secondary" disabled={busy}
            onClick={() => onRun('verify')}>אמת</button>
        </div>
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
  return (
    <JourneyRow step={step} stepById={stepById} highlight={highlight} danger={danger}
      statusLabel={statusLabel} menu={menu}>
      {children}
    </JourneyRow>
  );
}

/**
 * שורת תהליך — הצורה האחידה של כל בקשה במסע.
 * סגורה: שם · מצב · התקדמות · אצל מי הכדור וכמה זמן · הפעולה הבאה.
 * פתוחה: כל הפרטים של אותה בקשה. פותחים אחת בכל פעם, כדי שהמסך יישאר קריא.
 */
function JourneyRow({ step, stepById, highlight, danger, statusLabel, menu, children }: {
  step: OnboardingStep;
  stepById: Map<string, OnboardingStep>;
  highlight: boolean;
  danger?: boolean;
  statusLabel?: string;
  menu: React.ReactNode;
  children: React.ReactNode;
}) {
  const { openId, toggle, onMove, onPublish } = useContext(RowOpenContext);
  const open = openId === step.id;
  const tone = TONE_COLOR[STEP_STATUS_TONE[step.status]];
  const locked = step.status === 'locked';
  const age = ageLabel(step);
  const progress = progressLabel(step);
  const hasBody = Boolean(children);
  const isDraft = String(step.payload.published ?? 'true') === 'false';

  return (
    <div id={`ob-step-${step.id}`} style={{
      display: 'flex', gap: '.6rem', alignItems: 'flex-start',
      padding: danger || highlight || open ? '.55rem .6rem' : '.55rem 0',
      borderTop: '1px solid var(--hairline-2)',
      background: danger ? 'var(--red-light)' : (highlight || open) ? 'var(--surface-2)' : undefined,
      borderRadius: danger || highlight || open ? 'var(--radius)' : undefined,
      transition: 'background .3s ease',
    }}>
      <span aria-hidden="true" style={{
        width: 8, height: 8, borderRadius: 999, background: danger ? 'var(--err)' : tone,
        marginTop: '.4rem', flexShrink: 0,
      }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', gap: '.4rem', alignItems: 'flex-start' }}>
          <button
            type="button"
            onClick={() => hasBody && toggle(step.id)}
            aria-expanded={hasBody ? open : undefined}
            style={{
              flex: 1, minWidth: 0, textAlign: 'start', font: 'inherit', color: 'inherit',
              cursor: hasBody ? 'pointer' : 'default', padding: 0,
              background: 'none', border: 'none', appearance: 'none',
            }}
          >
            <div style={{ fontSize: 'var(--fs-14)', fontWeight: 600, color: locked ? 'var(--ink-3)' : 'var(--ink-1)' }}>
              {hasBody && <span aria-hidden="true" style={{ color: 'var(--ink-4)', marginInlineEnd: '.3rem' }}>{open ? '▾' : '▸'}</span>}
              {locked && '🔒 '}{rowTitle(step)}
              {/* ‼ טיוטה = הבקשה מוכנה אצלי והלקוח עוד לא רואה אותה. בלי הסימון
                  הזה אין דרך לדעת אם ביקשתי בפועל או רק הכנתי. */}
              {isDraft && (
                <span style={{
                  marginInlineStart: '.4rem', fontSize: 'var(--fs-12)', fontWeight: 600,
                  color: 'var(--warn)', border: '1px solid var(--warn)', borderRadius: 999,
                  padding: '0 .35rem',
                }}>טיוטה</span>
              )}
              {step.needsAttention && !danger && (
                <span style={{ color: 'var(--err)', marginInlineStart: '.4rem' }}>· דורש טיפול</span>
              )}
            </div>
            <div style={{
              display: 'flex', gap: '.5rem', flexWrap: 'wrap', alignItems: 'center',
              fontSize: 'var(--fs-12)', color: 'var(--ink-3)', marginTop: 2,
            }}>
              <span style={{ color: tone, fontWeight: 600 }}>{statusLabel ?? STEP_STATUS_LABELS[step.status]}</span>
              {progress && <span>· {progress}</span>}
              <span>· הכדור {STEP_BALL_LABELS[step.ball]}</span>
              {age && <span>· {age}</span>}
              {step.dueDate && <span>· עד {formatDate(step.dueDate, 'list')}</span>}
              {locked && <span>· {lockHint(step, stepById)}</span>}
            </div>
          </button>
          <div style={{ display: 'flex', gap: '.35rem', flexWrap: 'wrap', alignItems: 'flex-start' }}>
            {isDraft && onPublish && (
              <button type="button" className="btn btn-sm btn-primary"
                onClick={() => onPublish(step.id)}
                title="הבקשה תופיע בדף האישי של הלקוח">שלח ללקוח</button>
            )}
            {menu}
            {onMove && (
              <span style={{ display: 'inline-flex', gap: 2 }}>
                <button type="button" className="btn btn-sm btn-ghost" aria-label="הזז למעלה"
                  onClick={() => onMove(step.id, -1)} style={{ padding: '0 .3rem' }}>↑</button>
                <button type="button" className="btn btn-sm btn-ghost" aria-label="הזז למטה"
                  onClick={() => onMove(step.id, 1)} style={{ padding: '0 .3rem' }}>↓</button>
              </span>
            )}
          </div>
        </div>
        {open && children}
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
