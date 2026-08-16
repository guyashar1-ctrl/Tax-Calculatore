// ─── קליטה — מסלול הכניסה של הלקוח ─────────────────────────────────────────
// שורה אחת למעלה אומרת אצל מי הכדור ומה הדבר הבא, ומתחתיה המסלולים.
//
// ‼ שלב נעול מוצג ולא מוסתר: התלות ("הרשאת תשלום רק אחרי חיבור פייפרלס")
// היא כלל עסקי שהרו"ח צריך לראות, אחרת הוא מחפש שלב שנעלם.

import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type {
  Engagement, InstitutionKey, OnboardingEvent, OnboardingStep, StepChecklistItem,
} from '../../types/onboarding';
import {
  ENGAGEMENT_STATUS_LABELS, EVENT_ACTOR_LABELS, EVENT_TYPE_LABELS, REQUIREMENT_KIND_LABELS,
  STEP_BALL_LABELS, STEP_STATUS_LABELS, STEP_TYPE_LABELS, TRACK_LABELS,
  blockingStepsForClose, isStepRequiredForClose,
  isStepOpen, stepAwaitsMe, stepStatusLabel,
} from '../../types/onboarding';
import type { Client, RepAuthorityKind, RepresentationStatus } from '../../types';
import type { Quotation } from '../../types/quotations';
import { REP_AUTHORITY_LABELS, REPRESENTATION_STATUS_LABELS } from '../../types';
import type { AdvanceResult } from '../../hooks/useOnboarding';
import InstitutionAlignmentGroup, { InstitutionFocus } from './InstitutionAlignment';
import { NEXT_ACTION, nextStepForClient } from '../../utils/onboardingNext';
import { representationAction } from '../../utils/representationAction';
import { relativeTime } from '../../utils/clientDerived';
import { formatDate } from '../../utils/dateFormat';
import { formatILS } from '../../utils/quotationCalc';
import { flushAccountantNotifications } from '../../lib/notifyAccountant';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import type { DocCategory } from '../../hooks/useDocumentStore';
import { DOC_CATEGORY_LABELS, useDocumentStore } from '../../hooks/useDocumentStore';
import { useEmailMessages } from '../../hooks/useEmailMessages';
import { EMAIL_STATUS_LABEL } from '../../types/emailActivity';
import EmailPreviewDialog from '../EmailActivity/EmailPreviewDialog';
import ConfirmDialog from '../ui/ConfirmDialog';
import OnboardingJourneyMap from './OnboardingJourneyMap';
import Modal from '../ui/Modal';
import AddRequestDialog from './AddRequestDialog';
import JourneyTemplatesDialog from './JourneyTemplatesDialog';
import SendPortalDialog from './SendPortalDialog';
import ClientPagePreviewDialog from './ClientPagePreviewDialog';
import type { PortalPreviewMode } from './ClientPagePreviewDialog';
import PortalPreviewPanel from './PortalPreviewPanel';
import PublishCasePrompt from './PublishCasePrompt';
import InlineComposer from './InlineComposer';
import {
  AUTO_OFFICE_TYPES, buildClientFacingRows, CLIENT_FACING_TYPES, isManualInternalTask,
  type ClientFacingRow,
} from '../../utils/clientFacingRows';

interface Props {
  clientId: string;
  /** נדרש ליישור קו (M2): תמונת מצב לפני הצעת עובדה, ומחזור החיים לניסוח הכרטיס. */
  client: Client;
  /** הלקוח המעודכן אחרי שעובדה מקצועית התקבלה — כדי לשקף מיד בלי לחכות לרענון. */
  onClientPersisted: (c: Client) => void;
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
  /**
   * הצעות המחיר של הלקוח — **קריאה בלבד**, מהמקור הקיים (`quotations`), כדי
   * להציג את אישור ההצעה כאבן-דרך שהושלמה מעל הבקשות. אין כאן מצב חדש:
   * `approvedAt` על ההצעה הוא כבר האמת היחידה, ולא משוכפל לשום מקום.
   */
  quotations?: Quotation[];
  /** מצב בקשת הייצוג בשפת הייצוג ("ממתין למילוי הלקוח") — לא בשפת השלב הגנרי. */
  repStatusLabel?: string;
  /** אותו מצב, גולמי — כדי לגזור ממנו את הפעולה עצמה ולא רק את שמו. */
  repStatus?: RepresentationStatus;
  /** קפיצה למרכז הייצוג — המסך שבו העבודה באמת נעשית. */
  onOpenRepresentation?: () => void;
  /** שם הלקוח לכותרת בונה התהליך. */
  clientDisplayName?: string;
  /** בלי מייל בכרטיס — השליחה ללקוח מציעה קישור בלבד. */
  clientEmail?: string;
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
  /* ‼ onMove / onPublish / onSetRequired ירדו מכאן: הפעולות האלה עברו לתפריט
     ⋯ שנבנה ב-renderStep, ולכן הן נקראות ישירות (moveRow / setStepRequired)
     ולא דרך ה-context. onPublish ירד לגמרי — אין יותר פרסום של בקשה בודדת;
     הפרסום הוא של התיק כולו ("עדכן את דף הלקוח"). */
  /** כל ההורים של כל שלב (מיגרציה 78) — לשורת "ממתין ל: X, Y" המלאה. */
  depParents?: Map<string, string[]>;
  /** ההיפוך — אילו שלבים משתחררים כשהשלב הזה יושלם ("משחרר:"). */
  depChildren?: Map<string, string[]>;
  /**
   * כרטיסי-המשך שמוצגים **בתוך** הכרטיס של השלב (אב-הטיפוס: childOf).
   * דרך ה-context ולא props מאותה סיבה כמו openId: שמונה כרטיסים מתמחים
   * עוברים דרך StepCardShell, והעברה ידנית הייתה מוסיפה prop לכל אחד מהם.
   */
  nestedByStep?: Map<string, React.ReactNode>;
}>({ openId: null, toggle: () => {} });

/** שם השורה. בקשה חופשית נושאת את השם שהרו"ח נתן לה, לא תווית גנרית. */
/* שם שניתן לבקשה גובר על השם הגנרי של הסוג — בכל סוג, לא רק בבקשה חופשית.
   בקשה ששמה לא מוצג היא בקשה שאי אפשר לזהות ברשימה של עשר שורות. */
function rowTitle(step: OnboardingStep): string {
  const named = String(step.payload?.title ?? '').trim();
  if (named) return named;
  return STEP_TYPE_LABELS[step.stepType];
}

/** טיוטה = הרו"ח הכין, הלקוח עוד לא רואה. published_at ריק במסד, או הסימון
 *  הישן ב-payload (בקשות שנוצרו לפני מיגרציה 77). */
function isDraftStep(step: OnboardingStep): boolean {
  return step.publishedAt === null || String(step.payload.published ?? 'true') === 'false';
}

/** כמה זמן השורה עומדת במצב הזה — "9 ימים" ולא תאריך שצריך לחשב בראש. */
function ageLabel(step: OnboardingStep): string | null {
  const from = step.updatedAt ?? step.createdAt;
  if (!from) return null;
  const days = Math.floor((Date.now() - new Date(from).getTime()) / 86400000);
  if (!Number.isFinite(days) || days < 1) return null;
  return days === 1 ? 'יום אחד' : `${days} ימים`;
}

/** "2/3 נדרשים" — התקדמות פנימית של בקשה. דרישות נספרות לפי חובה בלבד:
 *  רשות פתוחה לעולם לא חוסמת השלמה (הכרעת גיא, 6+7). */
function progressLabel(step: OnboardingStep): string | null {
  const reqs = step.payload.requirements;
  if (Array.isArray(reqs) && reqs.length > 0) {
    const required = reqs.filter(r => r.required !== false);
    if (required.length === 0) return null;
    return `${required.filter(r => r.done).length}/${required.length} נדרשים`;
  }
  const list = step.payload.checklist;
  if (!Array.isArray(list) || list.length === 0) return null;
  return `${list.filter(i => i.done).length}/${list.length}`;
}

const TONE_COLOR: Record<string, string> = {
  ok: 'var(--ok, #17845b)',
  warn: 'var(--warn)',
  err: 'var(--err)',
  muted: 'var(--ink-3)',
};

/** למה השלב נעול ומה יפתח אותו — במילים של הרו"ח, לא של המסד.
 *  תלות מרובת-הורים: מציגים את **כל** מה שעדיין חוסם — ורק אותו. הורה
 *  שכבר הושלם ירד מהרשימה (הכרעת גיא, שלב 8). */
function lockHint(
  step: OnboardingStep,
  byId: Map<string, OnboardingStep>,
  parents?: string[],
): string {
  if (step.stepType === 'retainer_authorization') {
    return 'ייפתח אחרי שתאשר את חיבור הלקוח לפייפרלס';
  }
  const parentIds = (parents && parents.length > 0)
    ? parents
    : (step.dependsOnStepId ? [step.dependsOnStepId] : []);
  const blocking = parentIds
    .map(id => byId.get(id))
    .filter((d): d is OnboardingStep => !!d && isStepOpen(d.status));
  if (blocking.length > 0) {
    return `ממתין ל: ${blocking.map(d => rowTitle(d)).join(', ')}`;
  }
  const dep = step.dependsOnStepId ? byId.get(step.dependsOnStepId) : undefined;
  if (dep) return `ייפתח אחרי «${rowTitle(dep)}»`;
  /* ‼ בלי תלות מפורשת נופלים לשלב הפתוח שקודם לו בסדר — זה מה שחוסם אותו
     בפועל. "ייפתח אחרי השלב שהוא תלוי בו" הוא משפט שלא אומר כלום למי
     שמסתכל על המסך ומנסה להבין מה לעשות עכשיו. */
  const before = [...byId.values()]
    .filter(s => (s.sortOrder ?? 0) < (step.sortOrder ?? 0) && isStepOpen(s.status))
    .sort((a, b) => (b.sortOrder ?? 0) - (a.sortOrder ?? 0))[0];
  if (before) return `ייפתח אחרי «${STEP_TYPE_LABELS[before.stepType]}»`;
  return 'ייפתח כשהשלב שלפניו יושלם';
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

/** איך גובים מלקוח שאינו בפייפרלס. רשימה סגורה — טקסט חופשי כאן היה הופך
 *  את השדה לבלתי ניתן לסינון בעוד שנה. */
const COLLECTION_METHODS = ['הוראת קבע בבנק', 'כרטיס אשראי', 'העברה בנקאית חודשית', 'המחאות', 'אחר'];

export default function OnboardingTab({
  clientId, client, onClientPersisted, engagements, steps, events, loading, advance, refresh,
  prevAccountant, onPrepareReleaseLetter, quotations, repStatusLabel, repStatus, onOpenRepresentation,
  clientDisplayName, clientEmail, embedded, ballFilter,
}: Props) {
  const [error, setError] = useState<string | null>(null);
  const [closing, setClosing] = useState(false);
  const [busyStepId, setBusyStepId] = useState<string | null>(null);
  const [menuStepId, setMenuStepId] = useState<string | null>(null);
  // חלון המייל של שלב — נפתח מהכרטיס, נשלח דרך send-step-email.
  // subject/body: הנוסח ששמור על הבקשה עצמה (בקשה לגורם חיצוני). ריק ⇒
  // התצוגה המקדימה נטענת מהנוסח הנגזר בשרת, בדיוק כמו עד היום.
  const [emailDialog, setEmailDialog] = useState<{
    stepId: string;
    kind: 'paperless_invite' | 'step_reminder' | 'intake_questionnaire';
    heading: string;
    subject?: string;
    body?: string;
  } | null>(null);
  /** על איזו בקשה פתוח כרגע קומפוזר "בקשת המשך" — התלות נגזרת ממנה. */
  const [followUpFor, setFollowUpFor] = useState<string | null>(null);
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
  const [alignBusy, setAlignBusy] = useState(false);
  /** מוסד במיקוד — כשמוגדר, המסך משתלט לגמרי (המודל המאושר: בידוד חזותי וקוגניטיבי). */
  const [focusedInstitutionKey, setFocusedInstitutionKey] = useState<InstitutionKey | null>(null);
  const highlightTimer = useRef<number | null>(null);

  useEffect(() => () => {
    if (highlightTimer.current) window.clearTimeout(highlightTimer.current);
  }, []);

  /* ‼ תפריט ⋯ נסגר בלחיצה בחוץ וב-Escape. בלי זה הוא נשאר פתוח על כרטיס
     אחד בזמן שעובדים על אחר, ושתי שכבות פתוחות בו-זמנית נראות כתקלה. */
  useEffect(() => {
    if (!menuStepId) return;
    const onDown = (e: MouseEvent) => {
      if (!(e.target as HTMLElement | null)?.closest?.('.ob-menu-wrap')) setMenuStepId(null);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuStepId(null); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuStepId]);

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
  /**
   * שכבה אופטימית של הקומפוזר: בקשה שנשמרה מופיעה מיד, בלי לחכות לרענון
   * הכולל של useOnboarding. כשהנתונים מהשרת מגיעים — השכבה מתנקה.
   */
  const [optimisticSteps, setOptimisticSteps] = useState<OnboardingStep[]>([]);
  const [optimisticPatches, setOptimisticPatches] = useState<Record<string, Partial<OnboardingStep>>>({});
  useEffect(() => {
    setOptimisticSteps(prev => prev.filter(o => !steps.some(s => s.id === o.id)));
    setOptimisticPatches({});
  }, [steps]);

  const clientSteps = useMemo(() => {
    const base = steps.filter(s => s.clientId === clientId && s.status !== 'cancelled');
    const extras = optimisticSteps.filter(o =>
      o.clientId === clientId && !base.some(s => s.id === o.id));
    return [...base, ...extras].map(s =>
      optimisticPatches[s.id] ? { ...s, ...optimisticPatches[s.id] } : s);
  }, [steps, clientId, optimisticSteps, optimisticPatches]);

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
    if (res?.ok) { flushAccountantNotifications(); refresh?.(); return; }

    /* ‼ השרת הוא שחוסם. המסך רק מציג מה חסר — ובחלון קטן שנפתח בלחיצה,
       לא כאזהרה קבועה על העמוד. */
    if (res?.error === 'not_ready') {
      setCloseGate({ steps: blockingStepsForClose(clientSteps) });
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

  /**
   * הקמת יישור קו ללקוח שאין לו שלבי מוסדות (הקמת תיק במערכת), או ריצה מחדש
   * ללקוח שכבר יש לו — בלי לפתוח קליטה חדשה. שתי הפעולות דרך RPC ייעודי
   * (92-institution-alignment.sql) ולא UPDATE ישיר — עקבי עם שאר המסך.
   */
  async function startOrRerunAlignment(existing: OnboardingStep[]) {
    setAlignBusy(true);
    setError(null);
    if (existing.length === 0) {
      const { error: rpcError } = await supabase.rpc('ensure_institution_alignment_steps', {
        p_client_id: clientId, p_engagement_id: clientEngagements[0]?.id ?? null, p_include_opening_call: false,
      });
      if (rpcError) setError(rpcError.message);
    } else {
      for (const s of existing) {
        const { error: rpcError } = await supabase.rpc('reopen_institution_alignment', { p_step_id: s.id });
        if (rpcError) setError(rpcError.message);
      }
    }
    setAlignBusy(false);
    refresh?.();
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
  // ‼ "העתק קישור" לבדו הכריח את הרו"ח להרכיב את ההודעה בעצמו בכל פעם. אותו
  // קישור עדיין כאן — אבל כאפשרות בתוך שליחה, לצד המייל שמפרט מה ממתין.
  const [sendOpen, setSendOpen] = useState(false);
  /** תצוגה מקדימה של הדף האישי — הדף האמיתי, לא חיקוי. */
  const [previewOpen, setPreviewOpen] = useState(false);
  /** העתקת הקישור הקבוע לדף האישי — אותו טוקן שמונפק גם בשליחה במייל. */
  const [linkBusy, setLinkBusy] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  /** קשתות התלות (מיגרציה 78): שלב ← כל הוריו. */
  const [depEdges, setDepEdges] = useState<{ stepId: string; parentId: string }[]>([]);

  useEffect(() => {
    if (!embedded) return;
    const ids = steps.filter(s => s.clientId === clientId).map(s => s.id);
    if (ids.length === 0) { setDepEdges([]); return; }
    let cancelled = false;
    supabase.from('onboarding_step_dependencies')
      .select('step_id, depends_on_step_id')
      .in('step_id', ids)
      .then(({ data }) => {
        if (cancelled) return;
        setDepEdges((data ?? []).map(r => ({ stepId: r.step_id, parentId: r.depends_on_step_id })));
      });
    return () => { cancelled = true; };
  }, [clientId, embedded, steps]);

  const depParents = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const e of depEdges) m.set(e.stepId, [...(m.get(e.stepId) ?? []), e.parentId]);
    return m;
  }, [depEdges]);
  const depChildren = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const e of depEdges) m.set(e.parentId, [...(m.get(e.parentId) ?? []), e.stepId]);
    return m;
  }, [depEdges]);
  /** "עדכן את דף הלקוח" — פרסום כל השינויים, ואז השאלה על המייל (D4). */
  const [publishingCase, setPublishingCase] = useState(false);
  const [publishPromptOpen, setPublishPromptOpen] = useState(false);
  /** עריכה בתוך השורה — אותו קומפוזר של ההוספה, מלא מראש. */
  const [editingStepId, setEditingStepId] = useState<string | null>(null);
  /** מצב עריכה — אותו מסך, פקדי ↑↓⋯ ותצורה נחשפים; במצב רגיל רק פעולה אחת. */
  const [editing, setEditing] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  /** מתג הפאנל המוטבע: חי (ברירת מחדל, אמין) מול אחרי עדכון. */
  const [sidebarPreviewMode, setSidebarPreviewMode] = useState<PortalPreviewMode>('live');
  /** קומפוזר "משימה פנימית" — נפתח בתוך מקטע "העבודה שלי". */
  const [internalComposerOpen, setInternalComposerOpen] = useState(false);
  /** חלון הסגירה — נפתח רק כשהשרת חוסם, ונסגר איתו. */
  const [closeGate, setCloseGate] = useState<{ steps: OnboardingStep[] } | null>(null);

  /** קפיצה לשלב אחר בעמוד, עם הדגשה קצרה — כדי שברור לאן הגענו. */
  function gotoStep(stepId: string) {
    setHighlightStepId(stepId);
    document.getElementById(`ob-step-${stepId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    if (highlightTimer.current) window.clearTimeout(highlightTimer.current);
    highlightTimer.current = window.setTimeout(() => setHighlightStepId(null), 2600);
  }

  // ‼ M2 — תיקון נאמנות: מוסד במיקוד משתלט על המסך, לא נפתח בתוך רשימת
  // הבקשות. זו הכרעת Product/UX מאושרת (בידוד חזותי וקוגניטיבי) — לא עיצוב
  // מחדש, אלא איזה תת-עץ מוחזר מהרכיב הזה. חוזרים ל"תהליך" (המסך הרגיל)
  // פשוט כשמאפסים את המצב — אין ניווט/מסלול חדש.
  if (embedded && focusedInstitutionKey) {
    const instStepsAll = clientSteps.filter(s => s.stepType.startsWith('institution_alignment_'));
    const focusStep = instStepsAll.find(s => s.payload.institution === focusedInstitutionKey);
    if (focusStep) {
      const openingCallStepForFocus = clientSteps.find(s => s.stepType === 'opening_call');
      // ‼ ניסוח חזרה אחד לכל שלב חיים. קודם היו שלושה ("קליטה"/"הקמת התיק"/
      // "תהליך") — אבל היעד הוא אותו מסך בדיוק, ושם שמשתנה לפי שלב החיים
      // מלמד את גיא שיש כאן שלושה מקומות. יש אחד: הבקשות.
      const returnLabel = 'חזרה לבקשות';
      return (
        <div className="cw-tabpanel">
          <InstitutionFocus
            client={client}
            step={focusStep}
            allSteps={instStepsAll}
            advance={advance}
            onClientPersisted={onClientPersisted}
            openingCallStep={openingCallStepForFocus}
            returnLabel={returnLabel}
            onClose={() => setFocusedInstitutionKey(null)}
            onAdvanceInstitution={next => setFocusedInstitutionKey(next)}
          />
        </div>
      );
    }
  }

  /* ‼ אין כאן יותר מסך נפרד ללקוח ותיק (בלי התקשרות ובלי שלבים). הכרעת גיא:
     זהו משטח הבקשות של הלקוח לכל אורך חייו — לא תהליך קליטה. לקוח חדש ולקוח
     ותיק מקבלים בדיוק את אותו מסך; רק תוכן הבקשות שונה. המסך הראשי כבר יודע
     להציג מצב ריק, ו"בקשה חדשה"/"מתבנית" זמינים בו תמיד. */

  const ballTone = !nextStep
    ? { c: TONE_COLOR.ok, label: 'הושלם' }
    : nextStep.ball === 'me'
      ? { c: 'var(--accent)', label: 'הכדור אצלך' }
      : { c: 'var(--ink-3)', label: `הכדור ${STEP_BALL_LABELS[nextStep.ball]}` };

  const ballTitle = !nextStep
    ? 'הקליטה הושלמה'
    : nextStep.status === 'locked'
      ? `${STEP_TYPE_LABELS[nextStep.stepType]} — ${lockHint(nextStep, stepById, depParents.get(nextStep.id))}`
      : nextStep.ball === 'me'
        ? NEXT_ACTION[nextStep.stepType]
        : `${STEP_TYPE_LABELS[nextStep.stepType]} — ${stepStatusLabel(nextStep)}`;

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
    if (ballFilter === 'third') return s.ball === 'authority' || s.ball === 'prev_accountant' || s.ball === 'external';
    // הסינון חייב להחזיר בדיוק את מה שהמונה ספר, אחרת "אצלי 7" מציג 9 שורות
    if (ballFilter === 'me') return stepAwaitsMe(s);
    return s.ball === ballFilter;
  };

  /* ‼ העבודה הפנימית האוטומטית ושלבי יישור-הקו יורדים ממשטח הבקשות (הכרעת
     גיא). יישור קו מיוצג בכרטיס אחד קבוע ב"העבודה שלי" ונפתח למסך שלו;
     השאר פשוט לא מוצג כאן. הנתונים לא נמחקו — ראה AUTO_OFFICE_TYPES. */
  const onSurface = (s: OnboardingStep) =>
    !AUTO_OFFICE_TYPES.includes(s.stepType) && !s.stepType.startsWith('institution_alignment_');

  const visibleSteps = clientSteps.filter(s => matchesBall(s) && onSurface(s));
  const openSteps = visibleSteps.filter(s => isStepOpen(s.status));
  /* ‼ הייצוג שהושלם מוצג כאבן-דרך גלויה מעל הבקשות, ולכן הוא יורד מהמקטע
     המקופל — אחרת אותו דבר היה מופיע פעמיים על אותו מסך. */
  const doneSteps = visibleSteps.filter(
    s => !isStepOpen(s.status) && s.stepType !== 'representation');

  /**
   * הזזת שורה בסדר התצוגה. מסדרים את כל הפתוחות, לא רק את מה שמסונן.
   * ‼ כותב ל-pending_sort_order (מיגרציה 101), לא ל-sort_order החי — הסדר
   * הישן ממשיך להיות מה שהלקוח רואה עד "עדכן את דף הלקוח". reorder_onboarding_steps
   * הישנה (כתיבה מיידית) נשארת קיימת ולא בשימוש.
   */
  async function moveRow(id: string, dir: -1 | 1) {
    const list = clientSteps.filter(s => isStepOpen(s.status)).map(s => s.id);
    const i = list.indexOf(id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    setOrdering(true);
    const { error: rpcError } = await supabase.rpc('stage_onboarding_steps_order', {
      p_client_id: clientId, p_ids: list,
    });
    setOrdering(false);
    if (rpcError) { setError(rpcError.message); return; }
    refresh?.();
  }

  /**
   * "הסר" מ-⋯. שלב שכבר פורסם מסומן pending_cancel (ממתין לפרסום הבא —
   * מיגרציה 101); שלב טיוטה שמעולם לא פורסם מבוטל מיד (advance('cancel'),
   * כמו היום) — שום לקוח לא רואה אותו ממילא, ואין מה לגונן עליו.
   */
  async function removeRow(step: OnboardingStep) {
    if (step.publishedAt == null) {
      void run(step, 'cancel', { note: 'הוסר לפני שפורסם' });
      return;
    }
    setBusyStepId(step.id);
    const { error: rpcError } = await supabase.rpc('set_onboarding_step_pending_cancel', {
      p_step_id: step.id, p_pending: !step.pendingCancel,
    });
    setBusyStepId(null);
    if (rpcError) { setError(rpcError.message); return; }
    refresh?.();
  }

  /** "בטל שינויים" — מחזיר סידור/הסרה/עריכות ממתינים למצב שלפני העריכה. */
  async function discardChanges() {
    setDiscarding(true);
    const { error: rpcError } = await supabase.rpc('discard_case_changes', { p_client_id: clientId });
    setDiscarding(false);
    if (rpcError) { setError(rpcError.message); return; }
    refresh?.();
  }

  /** ‼ אותו mint_portal_token של חלון השליחה — קישור אחד ללקוח, לא שניים. */
  async function copyPortalLink() {
    setLinkBusy(true);
    setLinkError(null);
    const { data, error: rpcError } = await supabase.rpc('mint_portal_token', { p_client_id: clientId });
    const token = (data as string | null) ?? null;
    setLinkBusy(false);
    if (rpcError || !token) { setLinkError('לא הצלחתי להנפיק קישור ללקוח.'); return; }
    const url = `${window.location.origin}/?portal=${token}`;
    try {
      await navigator.clipboard.writeText(url);
      setLinkCopied(true);
      window.setTimeout(() => setLinkCopied(false), 2000);
    } catch {
      // דפדפן שחוסם גישה ללוח — לא משאירים את הרו"ח בלי הקישור.
      setLinkError(`העתקה נחסמה בדפדפן. הקישור: ${url}`);
    }
  }

  /* ‼ publishRequest (publish_onboarding_request על בקשה בודדת) הוסר.
     שתי סיבות, ושתיהן עקרוניות ולא סגנוניות:
     1. בקשת לקוח אינה נשלחת לבדה — היא מופיעה בדף האישי כשמפרסמים את התיק.
     2. הנתיב הזה גם עקף את execute_automatic_step (מיגרציה 83 חיברה אותו
        ל-publish_case_changes ול-unlock_dependent_steps בלבד), ולכן בקשה
        אוטומטית שנפתחה דרכו לא חימשה את המייל שלה. עכשיו יש נתיב פרסום אחד.
     הפונקציה בשרת נשארה — לא נמחק כלום מהמסד. */

  /** פרסום כל שינויי התיק בבת אחת — טיוטות + עריכות ממתינות. */
  async function publishCase() {
    setPublishingCase(true);
    const { data, error: rpcError } = await supabase.rpc('publish_case_changes', { p_client_id: clientId });
    setPublishingCase(false);
    const res = data as { ok?: boolean; error?: string } | null;
    if (rpcError || !res?.ok) { setError(rpcError?.message ?? 'הפרסום נכשל.'); return; }
    refresh?.();
    setPublishPromptOpen(true);
  }

  async function setStepRequired(id: string, required: boolean) {
    const { data, error: rpcError } = await supabase.rpc('set_onboarding_step_required', {
      p_step_id: id, p_required: required,
    });
    const res = data as { ok?: boolean; error?: string } | null;
    if (rpcError || !res?.ok) {
      setError(res?.error === 'step_closed'
        ? 'השלב כבר נסגר — אי אפשר לשנות אם הוא נדרש.'
        : (rpcError?.message ?? 'עדכון הבקשה נכשל.'));
      return;
    }
    refresh?.();
  }

  /** רינדור בקשה אחת — משותף לרשימה השטוחה (המסך הישן) ולשורות "מה אני צריך מהלקוח"/"העבודה שלי". */
  const renderStepInner = (step: OnboardingStep) => {
              // עריכה בתוך השורה — הקומפוזר מחליף את השורה עצמה. אין מודל.
              if (editingStepId === step.id && step.stepType === 'custom_request') {
                return (
                  <InlineComposer
                    key={step.id}
                    clientId={clientId}
                    editStep={step}
                    initialDeps={depParents.get(step.id)}
                    existingSteps={clientSteps}
                    prevAccountant={prevAccountant}
                    onCancel={() => setEditingStepId(null)}
                    onSaved={updated => {
                      setEditingStepId(null);
                      setOptimisticPatches(p => ({ ...p, [step.id]: updated }));
                      refresh?.();
                    }}
                  />
                );
              }

              // דרישת-הקשר של גורם חיצוני: נגזרת מהנתונים, נפרדת מהתלויות,
              // ולא ניתנת להסרה — הסרת תלות אינה עוקפת אותה (Correction 1).
              // בשורה: "חסר לפרטי קשר: <מה חסר>".
              const extCfg = step.payload.externalParty;
              const contactNote = extCfg && isStepOpen(step.status)
                ? (extCfg.kind === 'prev_accountant'
                    ? (prevAccountant?.email?.trim() ? null : 'מייל רו״ח קודם')
                    : (extCfg.contact?.email?.trim() ? null : 'מייל הגורם'))
                : null;

              const locked = step.status === 'locked';
              const busy = busyStepId === step.id;
              const checklist = step.payload.checklist ?? [];

              // ── תפריט הפעולות המשניות ────────────────────────────────────
              // ‼ כל מה שאינו "הפעולה של עכשיו" גר כאן. קודם ישבו על כל שורה,
              // תמיד, גם "סמן כרשות" וגם שני חצי סידור — ארבעה פקדי תצורה על
              // כל בקשה, בכל מסך. עכשיו השורה הסגורה נושאת פעולה אחת, והתצורה
              // נפתחת רק כשמבקשים אותה.
              /* ‼ תפריט צף, לא כפתורים בשורה. הבאג שהיה כאן: כל פריטי התפריט
                 רונדרו כאחים של ⋯ בתוך .ob-card-actions (שהוא flex-shrink:0),
                 ולכן שמונה כפתורים גזלו את כל רוחב הכרטיס — הכותרת והמצב
                 נמעכו לעמודה של מילה אחת. עכשיו זו שכבה מרחפת מעל הכרטיס. */
              const menuOpen = menuStepId === step.id;
              const mi = 'ob-menu-item';
              const menu = (
                <>
                  {/* ‼ "עריכת תהליך" מעלה את חצי הסידור אל השורה עצמה. במנוחה
                      הם חיים בתפריט ⋯ בלבד — פקדי סידור על כל כרטיס, תמיד, הם
                      בדיוק תחושת הטבלה שהמסך הזה בא להוריד. */}
                  {editing && !ordering && isStepOpen(step.status) && (
                    <>
                      <button type="button" className="ob-more" aria-label="הזז למעלה"
                        onClick={() => void moveRow(step.id, -1)}>↑</button>
                      <button type="button" className="ob-more" aria-label="הזז למטה"
                        onClick={() => void moveRow(step.id, 1)}>↓</button>
                    </>
                  )}
                  {isStepOpen(step.status) && (
                    <div className="ob-menu-wrap">
                      <button type="button" className="ob-more" disabled={busy}
                        aria-haspopup="menu" aria-expanded={menuOpen}
                        onClick={() => setMenuStepId(id => id === step.id ? null : step.id)}
                        aria-label="עריכה ואפשרויות">⋯</button>
                      {menuOpen && (
                        <div className="ob-menu" role="menu">
                          {/* עריכה בשורה — רק לבקשות שנבנות בקומפוזר. */}
                          {step.stepType === 'custom_request' && (
                            <button type="button" role="menuitem" className={mi}
                              onClick={() => { setMenuStepId(null); setEditingStepId(step.id); }}>עריכה והגדרות</button>
                          )}
                          {/* ‼ בקשת המשך — כאן נולדת התלות. הרו"ח לא בונה גרף ולא
                              בוחר "הורה" מרשימה: הוא עומד על «פתיחת חשבון פייפרלס»
                              ואומר "ואחריה צריך גם…". התלות נגזרת מהמקום שממנו לחץ. */}
                          <button type="button" role="menuitem" className={mi}
                            onClick={() => { setMenuStepId(null); setFollowUpFor(step.id); }}
                            title={`בקשה חדשה שתיפתח רק אחרי «${rowTitle(step)}»`}>
                            הוסף בקשת המשך
                          </button>

                          <div className="ob-menu-sep" />

                          {/* ‼ שלב הייצוג מסונכרן מהשרת — "דלג" ו"חסום" ידניים היו
                              נדרסים בטריגר הבא ומשקרים עד אז. נשארת רק הערה. */}
                          {step.stepType !== 'representation' && (
                            <>
                              <button type="button" role="menuitem" className={mi}
                                onClick={() => { setMenuStepId(null); handleSkip(step); }}>דלג על הבקשה</button>
                              <button type="button" role="menuitem" className={mi}
                                onClick={() => { setMenuStepId(null); handleBlock(step); }}>סמן כחסום</button>
                            </>
                          )}
                          <button type="button" role="menuitem" className={mi}
                            onClick={() => { setMenuStepId(null); handleNote(step); }}>הוסף הערה</button>
                          {!['completed', 'verified', 'cancelled'].includes(step.status) && (
                            <button type="button" role="menuitem" className={mi}
                              onClick={() => { setMenuStepId(null); void setStepRequired(step.id, !isStepRequiredForClose(step)); }}
                              title={isStepRequiredForClose(step)
                                ? 'השלב חוסם היום את סגירת הקליטה. סימון כרשות ישחרר אותה.'
                                : 'השלב אינו חוסם היום את סגירת הקליטה.'}>
                              {isStepRequiredForClose(step) ? 'סמן כרשות' : 'סמן כנדרש'}
                            </button>
                          )}
                          {/* ‼ בתפריט טקסט מלא ולא חץ בודד: "↑" ברשימה אנכית לא
                              אומר כלום. במצב עריכה הם ממילא עלו לשורה. */}
                          {!editing && !ordering && (
                            <>
                              <button type="button" role="menuitem" className={mi}
                                onClick={() => { setMenuStepId(null); void moveRow(step.id, -1); }}>הזז למעלה</button>
                              <button type="button" role="menuitem" className={mi}
                                onClick={() => { setMenuStepId(null); void moveRow(step.id, 1); }}>הזז למטה</button>
                            </>
                          )}

                          <div className="ob-menu-sep" />

                          <button type="button" role="menuitem" className={mi}
                            onClick={() => { setMenuStepId(null); setTemplatesOpen(true); }}
                            title="שמירת הבקשות של הלקוח כתבנית — כולל התלות ביניהן">
                            שמור כתבנית
                          </button>
                          {/* ‼ "הסר" — רק על בקשות פונות-ללקוח (לא ייצוג, לא עבודה
                              פנימית — שם "דלג"/"חסום" כבר מספיקים). בקשה שפורסמה
                              מסומנת pending_cancel וממשיכה להופיע ללקוח עד הפרסום
                              הבא (מיגרציה 101); טיוטה שמעולם לא פורסמה מבוטלת מיד. */}
                          {CLIENT_FACING_TYPES.includes(step.stepType) && (
                            <button type="button" role="menuitem"
                              className={`${mi} ${step.pendingCancel ? '' : 'is-danger'}`} disabled={busy}
                              onClick={() => { setMenuStepId(null); void removeRow(step); }}
                              title={step.publishedAt == null ? 'הבקשה עוד לא פורסמה — ההסרה מיידית'
                                : step.pendingCancel ? 'ההסרה ממתינה לפרסום — לחיצה תבטל אותה'
                                : 'הבקשה תוסר מדף הלקוח בעדכון הבא'}>
                              {step.pendingCancel ? 'בטל את ההסרה' : 'הסר את הבקשה'}
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </>
              );

              // ── שליחה לגורם חיצוני ───────────────────────────────────────
              // ‼ החריג היחיד למודל "דף אחד": בקשה לרו"ח קודם אינה יושבת בדף
              // של הלקוח — היא מייל עצמאי לאדם אחר, ולכן יש לה כפתור שליחה
              // משלה. נעול ⇒ אין כפתור: תנאי השליחה עדיין לא התקיים, והשרת
              // ממילא יחסום. טיוטה ⇒ אין כפתור: קודם מפרסמים.
              const extSendable = !!extCfg && isStepOpen(step.status)
                && step.status !== 'locked' && !isDraftStep(step) && !contactNote;
              const extAlreadySent = step.status === 'waiting_client';
              const externalSend = extSendable ? (
                <button type="button" className="btn btn-sm btn-secondary" disabled={busy}
                  onClick={() => setEmailDialog({
                    stepId: step.id, kind: 'step_reminder',
                    heading: extAlreadySent ? 'תזכורת לגורם החיצוני' : 'מייל לגורם החיצוני',
                    subject: String(step.payload.emailSubject ?? ''),
                    body: String(step.payload.emailBody ?? ''),
                  })}
                  title="נפתחת טיוטה לעריכה ואישור — שום דבר לא נשלח לפני שתלחץ שלח">
                  {extAlreadySent ? 'שלח תזכורת' : 'פתח טיוטת מייל לשליחה'}
                </button>
              ) : null;

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
                    repStatus={repStatus}
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
                      stepId: step.id, kind: 'intake_questionnaire', heading: 'מייל עדכון סטטוס מס',
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
                    onRun={(action, payload) => void run(step, action, payload)}
                    menu={menu}
                  />
                );
              }

              // ‼ M2: שלושת שלבי המוסדות מיוצגים בכרטיס קבוצה אחד — הוא מצויר פעם
              // אחת (על השלב הראשון שנתקלים בו לפי סדר יצירה) ולא שלוש פעמים.
              if (step.stepType === 'institution_alignment_btl' || step.stepType === 'institution_alignment_vat'
                || step.stepType === 'institution_alignment_income') {
                const instSteps = clientSteps.filter(s => s.stepType.startsWith('institution_alignment_'));
                if (instSteps[0]?.id !== step.id) return null;
                return (
                  <InstitutionAlignmentGroup
                    key="institution-alignment-group"
                    steps={instSteps}
                    onOpen={setFocusedInstitutionKey}
                  />
                );
              }

              if (step.stepType === 'opening_call') {
                return (
                  <OpeningCallCard
                    key={step.id}
                    step={step}
                    busy={busy}
                    highlight={highlightStepId === step.id}
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
                  noteLine={contactNote ?? undefined}
                  menu={<>
                    {/* ‼ בבקשה לגורם חיצוני השליחה היא הפעולה — לא "התחל".
                        "התחל" על מייל שלא יצא הוא סימון עצמי שלא קרה כלום. */}
                    {externalSend}
                    {locked && !extCfg && (
                      <button type="button" className="btn btn-sm btn-secondary" disabled>התחל</button>
                    )}
                    {step.status === 'pending' && !extSendable && (
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
                          : step.ball === 'external' ? 'התקבל מהגורם החיצוני'
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
            };

  /**
   * ‼ בקשת המשך נפתחת מתחת לבקשה שממנה ביקשו אותה, ולא במודל נפרד: המקום
   * על המסך הוא ההסבר. הקומפוזר נולד עם התלות כבר מסומנת, ועם אותו שלב-על
   * של ההורה — כלומר הרו"ח לא בוחר "אחרי מה" ולא "לאן", הוא רק כותב מה.
   */
  const renderStep = (step: OnboardingStep) => {
    const inner = renderStepInner(step);
    if (followUpFor !== step.id) return inner;
    return (
      <div key={`${step.id}-with-followup`}>
        {inner}
        <InlineComposer
          clientId={clientId}
          stageId={step.stageId ?? null}
          initialDeps={[step.id]}
          existingSteps={clientSteps}
          prevAccountant={prevAccountant}
          onCancel={() => setFollowUpFor(null)}
          onSaved={created => {
            setFollowUpFor(null);
            setOptimisticSteps(prev => [...prev, created]);
            refresh?.();
          }}
        />
      </div>
    );
  };

  /* ‼ נבנית תוך כדי הרינדור של רשימת הבקשות (renderRow) ונקראת מתוך
     JourneyRow דרך ה-context. מפה חדשה בכל רינדור — אחרת קינון שהוסר
     היה נשאר תקוע מהפעם הקודמת. */
  const nestedMap = new Map<string, React.ReactNode>();

  return (
    <RowOpenContext.Provider value={{
      openId: openRowId,
      toggle: (id: string) => setOpenRowId(cur => (cur === id ? null : id)),
      depParents,
      depChildren,
      nestedByStep: nestedMap,
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
          onClick={() => setPreviewOpen(true)}
          title="הדף האישי כפי שהלקוח רואה אותו — כולל טיוטות שטרם פורסמו">
          הדף של הלקוח
        </button>
        <button type="button" className="btn btn-sm btn-ghost"
          onClick={() => setSendOpen(true)}
          title="מייל עם מה שממתין לו, או קישור לדף האישי לשליחה בוואטסאפ">
          שלח ללקוח
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

      {/* ── הדף האישי: קישור אחד קבוע ─────────────────────────────────────
          ‼ זה המשפט שכל המסך הזה עומד עליו. בקשה ללקוח אינה נשלחת בנפרד —
          היא מופיעה בדף האישי שלו, שהוא אותו קישור מהיום הראשון ועד הסוף.
          לכן הפעולות של הקישור יושבות כאן, ברמת העמוד, ולא על שורה בודדת:
          יש דבר אחד לשלוח, ושולחים אותו פעם אחת (ואפשר לשלוח שוב).
          עד היום הפס הזה הופיע רק בזמן קליטה; אבל בקשה אינה שייכת לקליטה,
          ולקוח ותיק שמבקשים ממנו מסמך צריך בדיוק את אותו קישור. */}
      {embedded && (
        <div className="ob-clientpage">
          <span className="ob-clientpage-lead">
            הדף של {clientDisplayName ?? 'הלקוח'} — קישור קבוע אחד:
          </span>
          <button type="button" className="ui-linkbtn" disabled={linkBusy}
            onClick={() => void copyPortalLink()}
            title="מעתיק את הקישור לדף האישי — לוואטסאפ או לכל מקום אחר">
            {linkCopied ? 'הועתק ✓' : linkBusy ? 'מכין…' : 'העתק קישור'}
          </button>
          <button type="button" className="ui-linkbtn"
            onClick={() => setSendOpen(true)}
            title="מייל עם מה שממתין לו, או הקישור לשליחה בוואטסאפ">
            שלח שוב את הקישור
          </button>
          <button type="button" className="ui-linkbtn"
            onClick={() => setPreviewOpen(true)}
            title="הדף האישי כפי שהלקוח רואה אותו — כולל טיוטות שטרם פורסמו">
            מה הלקוח רואה
          </button>
          <span style={{ flex: 1 }} />
          {/* ‼ מסך אחד קבוע (המודל המאושר): "עריכת הבקשות" לא עוברת למסך אחר —
              היא מעלה את חצי הסידור אל הכרטיסים, על אותו מסך בדיוק. */}
          <button type="button" className={`btn btn-sm ${editing ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setEditing(v => !v)}>
            {editing ? 'סיום עריכה' : 'עריכת הבקשות'}
          </button>
          {activeEngagement?.status === 'onboarding' && (
            <button type="button" className="btn btn-sm btn-ghost" disabled={closing}
              onClick={() => void closeOnboarding(false)}
              title="מעביר את הלקוח לשוטף — אחרי בדיקת התנאים">
              {closing ? 'סוגר…' : 'סגור קליטה'}
            </button>
          )}
        </div>
      )}
      {/* ‼ המשפט שמסביר את המודל, מאב-הטיפוס המאושר. הוא לא קישוט: בלעדיו
          "למה אין כפתור שליחה על הבקשה הזאת" נשארת שאלה פתוחה על המסך. */}
      {embedded && (
        <div style={{ fontSize: 'var(--fs-12)', color: 'var(--ink-4)', marginTop: '-.15rem', lineHeight: 1.6 }}>
          כל מה שמבקשים מהלקוח חי בדף האישי הזה. בקשות לגורם חיצוני נשלחות בנפרד.
        </div>
      )}
      {linkError && (
        <div style={{ fontSize: 'var(--fs-12)', color: 'var(--err)' }}>⚠ {linkError}</div>
      )}

      {/* ── חלון הסגירה — נפתח רק כשהשרת חסם, ונסגר איתו ─────────────────── */}
      {closeGate && (
        <Modal title="סגירת הקליטה" onClose={() => setCloseGate(null)} width={440}>
          <p className="ob-gate-lead">עדיין נדרש להשלים:</p>
          <ul className="ob-gate-list">
            {closeGate.steps.map(s => <li key={s.id}>{rowTitle(s)}</li>)}
          </ul>
          <div className="ob-gate-actions">
            <button type="button" className="btn btn-primary" onClick={() => setCloseGate(null)}>
              חזרה להשלמה
            </button>
            {/* ‼ עקיפה — משנית בכוונה, ודורשת אישור נוסף. נרשמת ביומן. */}
            <button
              type="button"
              className="ui-linkbtn ob-gate-force"
              disabled={closing}
              /* ‼ אין אישור שני. החלון עצמו הוא האישור: מי שקרא את הרשימה
                 ולחץ כאן — החליט. שני חלונות ברצף מלמדים ללחוץ בלי לקרוא. */
              onClick={() => { setCloseGate(null); void closeOnboarding(true); }}
            >
              סגור בכל זאת · {closeGate.steps.length} נדרשים יישארו פתוחים
            </button>
          </div>
        </Modal>
      )}

      {loading && clientSteps.length === 0 && <div className="cw-empty">טוען…</div>}

      {/* ── גריד דו-טורי (המודל המאושר): מקטעי התהליך מימין, ופאנל "מה הלקוח
          רואה" מוטבע וקבוע לצד — לא דיאלוג שצריך לפתוח כדי לדעת. מתקפל לטור
          אחד במסך צר (ob-builder-grid, נבנתה במקור לבונה התהליך הישן). */}
      {embedded && (
      <div className="ob-builder-grid">
      <div style={{ display: 'grid', gap: '.7rem' }}>

      {/* ── פס הפרסום: "יש שינויים שלא פורסמו" (הכרעת D4) ──────────────────
          מופיע רק כשיש טיוטות או עריכות ממתינות. הפרסום לא שולח מייל —
          השאלה על המייל נשאלת מיד אחריו, בנפרד. */}
      {(() => {
        // טיוטה = published_at ריק במסד או המראה הישנה ב-payload; undefined
        // (נתוני בדיקה ישנים) אינו טיוטה. עריכה ממתינה = draft_payload מלא.
        // ‼ מיגרציה 101 מוסיפה סידור והסרה ממתינים לאותה רשימה — "עריכה אינה
        // פרסום" חל על כל שינוי, לא רק על ניסוח. הפס נשאר גלוי גם מחוץ למצב
        // עריכה (סטייה מכוונת מהפרוטוטייפ): עדיף שגיא ידע שיש טיוטות תלויות
        // גם אם יצא מ"עריכת תהליך" בטעות.
        const dirty = clientSteps.filter(s =>
          s.publishedAt === null || s.payload.published === false || s.draftPayload
          || s.pendingCancel || s.pendingSortOrder != null);
        if (dirty.length === 0) return null;
        return (
          <div style={{
            display: 'flex', alignItems: 'center', gap: '.6rem', flexWrap: 'wrap',
            padding: '.55rem .8rem', borderRadius: 'var(--radius)',
            border: '1px solid #fbbf77', background: 'var(--surface-2)',
          }}>
            <span aria-hidden="true" style={{ color: '#b45309' }}>●</span>
            <span style={{ fontSize: 'var(--fs-13)', fontWeight: 600, color: 'var(--ink-1)' }}>
              {dirty.length === 1 ? 'שינוי אחד שלא פורסם' : `${dirty.length} שינויים שלא פורסמו`}
            </span>
            <span style={{ fontSize: 'var(--fs-12)', color: 'var(--ink-3)', flex: 1 }}>
              {dirty.length === 1 ? 'הלקוח לא יראה אותו עד שמעדכנים את הדף' : 'הלקוח לא יראה אותם עד שמעדכנים את הדף'}
            </span>
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => setPreviewOpen(true)}>
              תצוגה מקדימה
            </button>
            <button type="button" className="btn btn-sm btn-ghost" disabled={discarding}
              onClick={() => void discardChanges()}>
              {discarding ? 'מבטל…' : 'בטל שינויים'}
            </button>
            <button type="button" className="btn btn-sm btn-primary" disabled={publishingCase}
              onClick={() => void publishCase()}>
              {publishingCase ? 'מפרסם…' : 'עדכן את דף הלקוח'}
            </button>
          </div>
        );
      })()}

      {/* ── מסך "תהליך" המאוחד: שני מקטעים שטוחים (המודל המאושר) ────────────
          "מה אני צריך מהלקוח" (ייצוג, פייפרלס, מסמכים, רו"ח קודם, הרשאת
          תשלום, בקשות חופשיות/שאלון) ו"העבודה שלי" (קמ"ל, הקמה פנימית,
          ביקורת חודש ראשון, יישור קו, שיחת פתיחה, פתיחת תיקים). אותו מסך,
          לפני שליחה ואחריה — אין יותר מעבר למסך "בונה" נפרד. שרשראות
          (פייפרלס, רו"ח קודם) ממוזגות לשורה אחת דרך buildClientFacingRows. */}
      {(() => {
        const openVisible = visibleSteps.filter(s => isStepOpen(s.status));
        const repStep = openVisible.find(s => s.stepType === 'representation');
        /* ‼ משימה פנימית שהרו"ח הוסיף יורדת מרשימת הבקשות ועולה ב"העבודה
           שלי" — היא custom_request בדיוק כמו בקשת לקוח, ומה שמפריד הוא
           הכדור. בלי ההפרדה הזאת משימה לעצמי הייתה נראית כבקשה מהלקוח. */
        const manualInternal = openVisible.filter(isManualInternalTask);
        const clientRows = buildClientFacingRows(
          openVisible.filter(s => !isManualInternalTask(s)), depParents);
        const alignSteps = clientSteps.filter(s => s.stepType.startsWith('institution_alignment_'));

        /** כרטיס אחד + פס הזמן שלו. active = יש בו מה לעשות עכשיו. */
        const flowItem = (step: OnboardingStep, body: React.ReactNode) => (
          <div
            key={step.id}
            className={[
              'ob-req',
              stepAwaitsMe(step) ? 'is-active' : '',
              step.status === 'blocked' || step.status === 'failed' || step.needsAttention ? 'is-danger' : '',
            ].filter(Boolean).join(' ')}
          >
            <span className="ob-req-dot" aria-hidden="true" />
            {body}
          </div>
        );

        /* ‼ שרשרת-מושג נשארת כרטיס אחד: החבר הפעיל הוא הכרטיס, ושאר החברים
           יורדים לתוכו ככרטיסי-המשך — בדיוק כמו בקשה תלויה. כך "פתיחת חשבון
           פייפרלס" ו"הרשאה לחיוב חודשי" נקראות כשלב ובן-שלב, ולא כשתי שורות. */
        const renderRow = (row: ClientFacingRow): React.ReactNode => {
          const rest = row.members.filter(m => m.id !== row.primary.id);
          const nestedNodes = [
            ...rest.map(m => renderStep(m)),
            ...row.children.map(c => renderRow(c)),
          ];
          if (nestedNodes.length) nestedMap.set(row.primary.id, <>{nestedNodes}</>);
          return renderStep(row.primary);
        };

        const alignDone = alignSteps.length > 0
          && alignSteps.every(s => s.status === 'completed' || s.status === 'verified');

        /* ── אבני-דרך שהובילו לכאן ────────────────────────────────────────
           ‼ בלעדיהן הרצף מתחיל באמצע: הכרטיס הראשון על המסך הוא "פתיחת
           חשבון פייפרלס", ואי אפשר להבין ממנו למה בכלל נפתחה קליטה. שתי
           אבני-דרך בלבד — אישור ההצעה וסגירת בקשת הייצוג — כי הן שתי
           הנקודות שיוצרות את כל מה שמתחתן.
           ‼ **אין מצב חדש כאן.** מקורות קיימים בלבד: `quotations.approvedAt`
           ושלב ה-representation עצמו. שום דבר לא משוכפל ולא נכתב. */
        const approvedQuotations = (quotations ?? [])
          .filter(q => q.clientId === clientId && (q.status === 'approved' || !!q.approvedAt))
          // ההצעה שממנה נולדה ההתקשרות הפעילה גוברת; אחרת האחרונה שאושרה.
          .sort((a, b) => (a.id === activeEngagement?.quotationId ? 1 : 0) - (b.id === activeEngagement?.quotationId ? 1 : 0)
            || (a.approvedAt ?? '').localeCompare(b.approvedAt ?? ''));
        const approvedQuotation = approvedQuotations[approvedQuotations.length - 1];

        const doneRepStep = clientSteps.find(
          s => s.stepType === 'representation' && (s.status === 'completed' || s.status === 'verified'));

        /** כרטיס אבן-דרך: ✓, שם, ומשפט אחד. בלי פעולות — אין מה לעשות בו. */
        const milestone = (key: string, title: string, sub: string) => (
          <div key={key} className="ob-req is-done">
            <span className="ob-req-dot" aria-hidden="true" />
            <div className="ob-card is-done">
              <div className="ob-card-row">
                <div className="ob-card-main">
                  <div className="ob-card-title">
                    <span className="ob-done-mark" aria-hidden="true">✓</span>{title}
                  </div>
                  <div className="ob-card-meta">{sub}</div>
                </div>
              </div>
            </div>
          </div>
        );

        return (
          <div className="ob-flow">
            {!repStep && clientRows.length === 0 && !approvedQuotation && !doneRepStep && (
              <div className="cw-empty">אין בקשות פתוחות כרגע.</div>
            )}

            {approvedQuotation && milestone('ms-quotation', 'הצעת מחיר',
              [
                'אושרה',
                approvedQuotation.approvedAt ? formatDate(approvedQuotation.approvedAt, 'list') : null,
                approvedQuotation.approvalSignerName || null,
              ].filter(Boolean).join(' · '))}

            {/* ‼ "הושלמה" ולא repStatusLabel: מצב בקשת הייצוג ממשיך לזוז אחרי
                שהשלב נסגר, ובפועל ראיתי כרטיס עם ✓ שכתוב עליו "ממתין למילוי
                הלקוח". רק מצב שהוא באמת אחרי ההשלמה מתווסף כזנב. */}
            {doneRepStep && milestone('ms-representation', 'בקשת ייצוג',
              [
                'הושלמה',
                doneRepStep.completedAt ? formatDate(doneRepStep.completedAt, 'list') : null,
                repStatus === 'awaiting_authorities' || repStatus === 'active'
                  ? REPRESENTATION_STATUS_LABELS[repStatus] : null,
              ].filter(Boolean).join(' · '))}

            {repStep && flowItem(repStep, renderStep(repStep))}
            {clientRows.map(row => flowItem(row.primary, renderRow(row)))}

            {/* ‼ הוספה ותבניות זמינות תמיד — לאורך כל חיי הלקוח, לא רק בקליטה
                ולא רק במצב עריכה. זו בקשה חדשה, לא תצורה. */}
            <div className="ob-add-row">
              <button type="button" className="ob-add" onClick={() => setAddOpen(true)}>＋ בקשה חדשה</button>
              <button type="button" className="btn btn-secondary ob-tpl"
                onClick={() => setTemplatesOpen(true)}>מתבנית</button>
            </div>

            {/* ── העבודה שלי ──────────────────────────────────────────────
                ‼ שני דברים בלבד (הכרעת גיא): "יישור קו ללקוח" כפריט הקבוע,
                ומשימות שהרו"ח הוסיף בעצמו. הכרטיסים האוטומטיים (הקמה פנימית,
                הכרת הלקוח, ביקורת חודש ראשון…) ירדו מהמסך — הם הפכו את משטח
                הבקשות ללוח מטלות. הם ממשיכים להתקיים במסד ובשער הסגירה. */}
            <div className="ob-flow-label">העבודה שלי · לא מופיע בדף הלקוח</div>

            <div className="ob-req">
              <span className="ob-req-dot" aria-hidden="true" />
              <div className="ob-card">
                <div className="ob-card-row">
                  <div className="ob-card-main">
                    <div className="ob-card-title">יישור קו ללקוח</div>
                    <div className="ob-card-meta">
                      {alignSteps.length === 0
                        ? 'ביטוח לאומי, מע״מ ומס הכנסה — לאן להיכנס, מה להעתיק, מה חריג'
                        : alignDone
                          ? `הושלם${alignSteps[0]?.payload.checkedAt ? ' · נבדק לאחרונה ' + formatDate(String(alignSteps[0].payload.checkedAt), 'list') : ''}`
                          : 'בתהליך — נכנסים לכל רשות ומיישרים קו'}
                    </div>
                  </div>
                  {(alignSteps.length === 0 || alignDone) && (
                    <div className="ob-card-actions">
                      <button type="button" className="btn btn-sm btn-secondary" disabled={alignBusy}
                        onClick={() => void startOrRerunAlignment(alignSteps)}>
                        {alignBusy ? 'מעדכן…' : alignSteps.length === 0 ? 'התחל' : 'בצע מחדש'}
                      </button>
                    </div>
                  )}
                </div>
                {alignSteps.length > 0 && (
                  <div className="ob-card-body">
                    <InstitutionAlignmentGroup steps={alignSteps} onOpen={setFocusedInstitutionKey} />
                  </div>
                )}
              </div>
            </div>

            {manualInternal.map(s => flowItem(s, renderStep(s)))}

            {/* ‼ משימה פנימית — נוצרת ידנית בלבד, ולעולם לא מופיעה בדף הלקוח
                (הכדור אצלי ⇒ build_client_portal לא מייצר לה פריט). */}
            {internalComposerOpen ? (
              <InlineComposer
                clientId={clientId}
                initialOwner="me"
                existingSteps={clientSteps}
                prevAccountant={prevAccountant}
                onCancel={() => setInternalComposerOpen(false)}
                onSaved={created => {
                  setInternalComposerOpen(false);
                  setOptimisticSteps(prev => [...prev, created]);
                  refresh?.();
                }}
              />
            ) : (
              <button type="button" className="ob-add ob-add-quiet"
                onClick={() => setInternalComposerOpen(true)}>
                ＋ משימה פנימית
              </button>
            )}
          </div>
        );
      })()}

      {/* ── בקשות שהושלמו — מקופל, בתחתית ────────────────────────────────
          ‼ "הושלם" אינו מצב שצריך לנהל, ולכן הוא גם לא צריך שורה מלאה עם
          פעולות. שורה שקטה אחת שאומרת כמה, ומי שרוצה — פותח.
          דילוג נשאר מובחן מהשלמה: "דולג" הוא החלטה שנרשמה, לא משהו שקרה. */}
      {doneSteps.length > 0 && (
        <>
          <div className="ob-flow-label">עבר</div>
          <div className="ob-card" style={{ opacity: .72, cursor: 'pointer' }}
            onClick={() => setShowDone(v => !v)}>
            <div className="ob-card-row">
              <div className="ob-card-title">בקשות שהושלמו · {doneSteps.length}</div>
              <span aria-hidden="true" style={{ color: 'var(--ink-4)', fontSize: 16 }}>
                {showDone ? '⌃' : '⌄'}
              </span>
            </div>
            {showDone && (
              <div style={{ marginTop: 12 }}>
                {doneSteps.map(s => {
                  const skipped = s.status === 'skipped';
                  return (
                    <div key={s.id} style={{
                      display: 'flex', gap: '.5rem', alignItems: 'baseline', padding: '.3rem 0',
                      fontSize: 'var(--fs-12)', color: 'var(--ink-4)',
                    }}>
                      <span aria-hidden="true">{skipped ? '↷' : '✓'}</span>
                      <span style={{ flex: 1, minWidth: 0 }}>{rowTitle(s)}</span>
                      <span>
                        {skipped
                          ? `דולג${s.payload.skipReason ? ` · ${s.payload.skipReason}` : ''}`
                          : stepStatusLabel(s)}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}

      </div>
      <aside>
        <PortalPreviewPanel clientId={clientId} mode={sidebarPreviewMode} onModeChange={setSidebarPreviewMode} />
      </aside>
      </div>
      )}

      {!embedded && [
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
            {list.map(renderStep)}
          </div>
        </div>
      ))}

      {/* ── ציר הזמן ──
          ‼ "מה קרה בקליטה" → "מה קרה": המסך הזה מלווה את הלקוח לכל אורך חייו,
          ולא רק בקליטה. אותו יומן בדיוק, בלי מילה שקושרת אותו לשלב חיים. */}
      <div className="cw-section">
        <div className="cw-section-head"><span>מה קרה</span></div>
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
          initialOverrides={{ subject: emailDialog.subject, body: emailDialog.body }}
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

      {sendOpen && (
        <SendPortalDialog
          clientId={clientId}
          clientName={clientDisplayName ?? 'הלקוח'}
          clientEmail={clientEmail}
          onClose={() => setSendOpen(false)}
          onSent={() => refresh?.()}
        />
      )}
      {previewOpen && (
        <ClientPagePreviewDialog
          clientId={clientId}
          clientName={clientDisplayName ?? 'הלקוח'}
          onClose={() => setPreviewOpen(false)}
        />
      )}
      {publishPromptOpen && (
        <PublishCasePrompt
          clientId={clientId}
          clientName={clientDisplayName ?? 'הלקוח'}
          clientEmail={clientEmail}
          onClose={() => { setPublishPromptOpen(false); refresh?.(); }}
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
// ‼ אין כאן שום קישור לשליחה ואין מייל (הכרעת גיא §8): ההרשאה נוצרת בתוך
// חשבון הפייפרלס של הלקוח, לא דרך קישור שהמערכת שולחת. authorizationCreatedAt
// הוא תיעוד פנימי בלבד — לא נוגע בדף הלקוח, ולא יודע (ולא מתיימר לדעת) אם
// הכרטיס כבר הוזן בפועל אצל פייפרלס.

interface RetainerCardProps {
  step: OnboardingStep;
  stepById: Map<string, OnboardingStep>;
  busy: boolean;
  highlight: boolean;
  hasConnectionStep: boolean;
  onGotoPaperless: () => void;
  onRun: (action: string, payload?: Record<string, unknown>) => void;
  menu: React.ReactNode;
}

function RetainerStepCard(p: RetainerCardProps) {
  const { step, stepById, busy, highlight } = p;
  const authorizationCreatedAt = String(step.payload.authorizationCreatedAt ?? '');
  const [providerRef, setProviderRef] = useState(String(step.payload.providerRef ?? ''));

  const locked = step.status === 'locked';
  const amount = typeof step.payload.amount === 'number' ? step.payload.amount : undefined;
  const month = monthLabel(step.payload.billingStartMonth as string | undefined);
  // ‼ לקוח שאינו עובד עם פייפרלס: אין הרשאה דיגיטלית, ואין מנעול —
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
          <div style={cardNote}>
            {authorizationCreatedAt
              ? <>ההרשאה נוצרה בפייפרלס {formatDate(authorizationCreatedAt, 'list')}. בפעם הבאה שהלקוח ייכנס — הוא יתבקש להזין כרטיס אשראי. אין קישור נוסף לשליחה.</>
              : <>אחרי שהלקוח מתחבר לפייפרלס, ההרשאה נוצרת בתוך פייפרלס עצמה — לא דרך קישור שהמערכת שולחת.</>}
          </div>

          {!authorizationCreatedAt && (
            <div style={{ marginTop: '.55rem' }}>
              <button type="button" className="btn btn-sm btn-primary" disabled={busy}
                onClick={() => p.onRun('note', { authorizationCreatedAt: new Date().toISOString(), note: 'ההרשאה נוצרה בפייפרלס' })}>
                יצרתי את ההרשאה בפייפרלס
              </button>
            </div>
          )}

          {isStepOpen(step.status) && (
            <div style={{ display: 'flex', gap: '.35rem', flexWrap: 'wrap', marginTop: '.5rem', alignItems: 'center' }}>
              <input value={providerRef} onChange={e => setProviderRef(e.target.value)}
                placeholder="אסמכתא מהספק (לא חובה)" style={{ maxWidth: 220 }} />
              <button type="button" className="btn btn-sm btn-secondary" disabled={busy || !authorizationCreatedAt}
                title={authorizationCreatedAt ? undefined : 'קודם יוצרים את ההרשאה בפייפרלס'}
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

function RepresentationStepCard({ step, stepById, highlight, statusLabel, repStatus, onOpen, menu }: {
  step: OnboardingStep;
  stepById: Map<string, OnboardingStep>;
  highlight: boolean;
  statusLabel?: string;
  repStatus?: RepresentationStatus;
  onOpen?: () => void;
  menu: React.ReactNode;
}) {
  const open = isStepOpen(step.status);
  // ‼ הסטטוס אומר במה השלב נמצא; הפעולה אומרת מה לעשות. "אין כאן מה לסמן
  // ידנית" נכון לגבי השלב, ונקרא בטעות כ"אין מה לעשות" — ואז מחפשים במסכים.
  const act = open && repStatus ? representationAction(repStatus) : null;
  return (
    <StepCardShell step={step} stepById={stepById} highlight={highlight} menu={menu}
      statusLabel={statusLabel}>
      {act && (
        <div style={{ fontSize: 'var(--fs-14)', fontWeight: act.mine ? 600 : 500, color: 'var(--ink-1)' }}>
          {act.action}
        </div>
      )}
      <div style={cardNote}>
        {act ? act.why
          : open ? 'הבדיקה, החתימה וההגשה נעשות במרכז הייצוג.'
            : 'הייצוג הושלם. הפירוט המלא — במרכז הייצוג.'}
      </div>
      {onOpen && (
        <div style={{ marginTop: '.55rem' }}>
          <button type="button"
            className={`btn btn-sm ${act?.mine ? 'btn-primary' : 'btn-secondary'}`}
            onClick={onOpen}>
            למרכז הייצוג ←
          </button>
        </div>
      )}
    </StepCardShell>
  );
}

// ═══════════════ כרטיס עדכון סטטוס מס ═══════════════════════════════
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

/**
 * שיחת הפתיחה — לא טופס. רשימת נקודות לבירור שהצטברו מיישור הקו (M2), ונעולה
 * עד ששלושת המוסדות הושלמו (תלות מרובת-הורים בשרת). פעולה ברורה אחת: קיימתי.
 */
function OpeningCallCard({ step, busy, highlight, onRun, menu }: {
  step: OnboardingStep;
  busy: boolean;
  highlight: boolean;
  onRun: (action: string, payload?: Record<string, unknown>) => void;
  menu: React.ReactNode;
}) {
  const clarifications = step.payload.clarifications ?? [];
  const open = isStepOpen(step.status);
  return (
    <StepCardShell step={step} stepById={new Map()} highlight={highlight} menu={
      <>
        {step.status === 'locked' && <button type="button" className="btn btn-sm btn-secondary" disabled>נעול</button>}
        {step.status === 'pending' && (
          <button type="button" className="btn btn-sm btn-secondary" disabled={busy}
            onClick={() => onRun('start')}>התחל</button>
        )}
        {step.status === 'in_progress' && (
          <button type="button" className="btn btn-sm btn-primary" disabled={busy}
            onClick={() => onRun('complete')}>קיימתי את השיחה</button>
        )}
        {step.status === 'completed' && (
          <button type="button" className="btn btn-sm btn-secondary" disabled={busy}
            onClick={() => onRun('verify')}>אמת</button>
        )}
        {menu}
      </>
    }>
      {clarifications.length === 0 ? (
        <div style={cardNote}>
          {step.status === 'locked' ? 'תיפתח אחרי שיישור הקו מול שלושת הרשויות יושלם.' : 'לא הצטברו נקודות לבירור מיישור הקו.'}
        </div>
      ) : (
        <ul style={{ margin: '.4rem 0 0', paddingInlineStart: '1.1rem', display: 'flex', flexDirection: 'column', gap: '.2rem' }}>
          {clarifications.map((c, i) => (
            <li key={i} style={{ fontSize: 'var(--fs-13)', color: 'var(--ink-2)' }}>{c.text}</li>
          ))}
        </ul>
      )}
      {open && step.status !== 'locked' && clarifications.length > 0 && (
        <div style={{ ...cardNote, marginTop: '.4rem' }}>הפריטים האלה נועדו לבירור בשיחה — לא בקשות ללקוח.</div>
      )}
    </StepCardShell>
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
 * כרטיס בקשה — הצורה האחידה של כל בקשה (אב-הטיפוס המאושר requests-v2-approved).
 * סגור: שם · משפט מצב אחד · פרטים משניים בשקט · פעולה אחת רלוונטית + ⋯.
 * פתוח: כל הפרטים של אותה בקשה. פותחים אחת בכל פעם, כדי שהמסך יישאר קריא.
 */
function JourneyRow({ step, stepById, highlight, danger, statusLabel, noteLine, menu, children }: {
  step: OnboardingStep;
  stepById: Map<string, OnboardingStep>;
  highlight: boolean;
  danger?: boolean;
  statusLabel?: string;
  /** שורת הסבר נוספת במטא — למשל דרישת-קשר של גורם חיצוני שטרם נפתרה. */
  noteLine?: string;
  menu: React.ReactNode;
  children: React.ReactNode;
}) {
  const { openId, toggle, depParents, depChildren, nestedByStep } = useContext(RowOpenContext);
  const open = openId === step.id;
  const nested = nestedByStep?.get(step.id);
  /* ‼ צבע הסטטוס ירד מהטקסט. באב-הטיפוס שורת המצב אפורה אחידה — הצבע חי
     בנקודת פס הזמן בלבד (.ob-req.is-active / .is-danger). שורת מטא צבעונית
     על כל כרטיס הייתה מחזירה בדיוק את תחושת הטבלה שהמסך הזה בא להוריד. */
  const locked = step.status === 'locked';
  const age = ageLabel(step);
  const progress = progressLabel(step);
  const hasBody = Boolean(children);
  const isDraft = isDraftStep(step);
  const hasPendingEdit = !!step.draftPayload && !isDraft;
  const ext = step.payload.externalParty;
  const extName = ext
    ? (ext.kind === 'prev_accountant' ? 'רו״ח קודם' : (ext.contact?.name || 'גורם חיצוני'))
    : null;
  // ⚡ אוטומטי: מסומן בעדינות; אחרי הביצוע — "בוצע"; אחרי כישלון — יינסה שוב.
  const isAutomatic = step.payload.autoAction?.kind === 'email';
  const autoLabel = !isAutomatic ? null
    : step.payload.autoExecutedAt ? '⚡ בוצע אוטומטית'
    : step.payload.autoError ? '⚡ אוטומטי · הניסיון נכשל — יינסה שוב'
    : '⚡ אוטומטי';
  // "משחרר:" — אילו שלבים פתוחים ממתינים לשלב הזה. רק כשפתוח, ובשקט.
  const releases = (depChildren?.get(step.id) ?? [])
    .map(id => stepById.get(id))
    .filter((d): d is OnboardingStep => !!d && isStepOpen(d.status));

  /* ── משפט המצב — שורה אחת שאומרת מה קורה ────────────────────────────────
     ‼ זה השינוי המרכזי מול הרשימה הצפופה שהייתה כאן: המטא לא נפרשת לרצועה
     של שישה פריטים מופרדים בנקודות. שורה ראשונה = מה קורה / למה ממתינים
     (בדיוק כמו .meta באב-הטיפוס), ושורה שנייה שקטה יותר לפרטים המשניים. */
  const statusSentence = locked
    ? lockHint(step, stepById, depParents?.get(step.id))
    : [statusLabel ?? stepStatusLabel(step), `הכדור ${STEP_BALL_LABELS[step.ball]}`, age]
        .filter(Boolean).join(' · ');

  /* ‼ "כמה זמן" נכנס למשפט המצב ולא לשורה נפרדת: הוא חלק מ"מה קורה", ושורה
     שלישית שכתוב בה רק "14 ימים" הוסיפה גובה לכל כרטיס בלי להוסיף מידע.
     בשורה השנייה נשאר רק מה שבאמת משני ולא תמיד קיים. */
  const dimParts = [
    progress,
    step.dueDate ? `עד ${formatDate(step.dueDate, 'list')}` : null,
    autoLabel,
  ].filter(Boolean) as string[];

  return (
    <div
      id={`ob-step-${step.id}`}
      className={[
        'ob-card',
        highlight || open ? 'is-highlight' : '',
        danger ? 'is-danger' : '',
      ].filter(Boolean).join(' ')}
    >
      <div className="ob-card-row">
        <div className="ob-card-main">
          <button
            type="button"
            onClick={() => hasBody && toggle(step.id)}
            aria-expanded={hasBody ? open : undefined}
            style={{
              display: 'block', width: '100%', textAlign: 'start', font: 'inherit', color: 'inherit',
              cursor: hasBody ? 'pointer' : 'default', padding: 0,
              background: 'none', border: 'none', appearance: 'none',
            }}
          >
            <div className={`ob-card-title${locked ? ' is-locked' : ''}`}>
              {locked && <span aria-hidden="true">🔒</span>}
              <span>{rowTitle(step)}</span>
              {/* ‼ מילה אחת אפורה, ורק על מה שאינו נדרש. הנדרש אינו מסומן —
                  סימון על הרוב הוא רעש, וסימון על המיעוט הוא מידע. */}
              {!isStepRequiredForClose(step) && <span className="ob-optional">רשות</span>}
              {extName && <span className="ob-pill is-ext">גורם חיצוני · {extName}</span>}
              {/* ‼ טיוטה = הבקשה מוכנה אצלי והלקוח עוד לא רואה אותה. בלי הסימון
                  הזה אין דרך לדעת אם ביקשתי בפועל או רק הכנתי. */}
              {isDraft && <span className="ob-pill is-draft">טיוטה</span>}
              {/* ‼ עריכה ממתינה: הלקוח ממשיך לראות את הנוסח הישן עד "עדכן את
                  דף הלקוח". בלי הסימון, עריכה נראית כאילו כבר פורסמה. */}
              {hasPendingEdit && <span className="ob-pill is-draft">עריכה ממתינה</span>}
              {step.pendingCancel && <span className="ob-pill is-draft">יוסר בעדכון</span>}
            </div>
            <div className="ob-card-meta">{statusSentence}</div>
            {(dimParts.length > 0 || noteLine || (step.needsAttention && !danger)) && (
              <div className="ob-card-dim">
                {dimParts.join(' · ')}
                {noteLine && (
                  <span style={{ color: 'var(--warn)' }}>
                    {dimParts.length ? ' · ' : ''}חסר לפרטי קשר: {noteLine}
                  </span>
                )}
                {step.needsAttention && !danger && (
                  <span style={{ color: 'var(--err)' }}>
                    {dimParts.length || noteLine ? ' · ' : ''}דורש טיפול
                  </span>
                )}
              </div>
            )}
          </button>
        </div>
        {/* ‼ מה יושב כאן: הפעולה של עכשיו, ו-⋯ דהוי. תצורה (עריכה, תלות,
            דלג/חסום, רשות/נדרש, סידור, תבנית) חיה מאחורי ⋯ בלבד — המסך
            במנוחה נשאר שקט. */}
        <div className="ob-card-actions">{menu}</div>
      </div>

      {open && (
        <div className="ob-card-body">
          {/* קשר, לא היררכיה: זו שורת מידע, לא מבנה. */}
          {releases.length > 0 && (
            <div style={{ fontSize: 'var(--fs-12)', color: 'var(--ink-4)', marginBottom: '.35rem' }}>
              משחרר: {releases.map(d => rowTitle(d)).join(', ')}
            </div>
          )}
          {children}
        </div>
      )}

      {/* ‼ צעד ההמשך — בתוך הכרטיס, וגלוי תמיד (לא מאחורי פתיחה). זה מה
          שגורם ל"הרשאה לחיוב חודשי" להיקרא כהמשך של הפייפרלס ולא כבקשה
          נפרדת ברשימה. אב-הטיפוס: card > card.child. */}
      {nested}
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
