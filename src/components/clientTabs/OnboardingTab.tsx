// ─── קליטה — מסלול הכניסה של הלקוח ─────────────────────────────────────────
// שורה אחת למעלה אומרת אצל מי הכדור ומה הדבר הבא, ומתחתיה המסלולים.
//
// ‼ שלב נעול מוצג ולא מוסתר: התלות ("הרשאת תשלום רק אחרי חיבור פייפרלס")
// היא כלל עסקי שהרו"ח צריך לראות, אחרת הוא מחפש שלב שנעלם.

import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type {
  Engagement, InstitutionKey, OnboardingEvent, OnboardingStep, OnboardingStepType, StepChecklistItem,
} from '../../types/onboarding';
import {
  ENGAGEMENT_STATUS_LABELS, REQUIREMENT_KIND_LABELS,
  STEP_BALL_LABELS, STEP_STATUS_LABELS, STEP_TYPE_LABELS, TRACK_LABELS,
  blockingStepsForClose, isStepRequiredForClose,
  isStepOpen, stepAwaitsMe, stepStatusLabel,
  paperlessSetupItems,
  PAPERLESS_RETAINER_CARD_KEY as RETAINER_CARD_KEY,
  PAPERLESS_CARD_ENTERED_KEY as CARD_ENTERED_KEY,
  PAPERLESS_TAX_AUTHORITY,
  isBlockingOutstanding, unfiledBlocking,
  outstandingDeliverableLabel, deliverableKeyFor,
} from '../../types/onboarding';
import type { Client, RepAuthorityKind, RepresentationStatus } from '../../types';
import type { Quotation, QuotationItem } from '../../types/quotations';
import { REP_AUTHORITY_LABELS, REPRESENTATION_STATUS_LABELS } from '../../types';
import type { AdvanceResult } from '../../hooks/useOnboarding';
import InstitutionAlignmentGroup, { InstitutionFocus } from './InstitutionAlignment';
import { NEXT_ACTION, nextStepForClient } from '../../utils/onboardingNext';
import { representationAction } from '../../utils/representationAction';
import { relativeTime } from '../../utils/clientDerived';
import { formatDate } from '../../utils/dateFormat';
import { calcTotals, formatILS } from '../../utils/quotationCalc';
import { flushAccountantNotifications } from '../../lib/notifyAccountant';
import { supabase } from '../../lib/supabase';
import { clientFromDb } from '../../lib/dbMappers';
import {
  RELEASE_MATERIALS, isOptionalMaterialKey, materialsFromStored, byPriorityFirst,
  outstandingFromStored, periodLabel, nextPeriod,
} from '../../utils/releaseLetter';
import { unseenUploads } from '../../utils/prevAccountantInbox';
import PrevAccountantDocsDrawer from './PrevAccountantDocsDrawer';
import { useAuth } from '../../hooks/useAuth';
import type { DocCategory } from '../../hooks/useDocumentStore';
import { DOC_CATEGORY_LABELS, useDocumentStore } from '../../hooks/useDocumentStore';
import { useEmailMessages } from '../../hooks/useEmailMessages';
import { EMAIL_STATUS_LABEL, EmailMessage } from '../../types/emailActivity';
import SentEmailViewer from '../EmailActivity/SentEmailViewer';
import EmailPreviewDialog from '../EmailActivity/EmailPreviewDialog';
import ConfirmDialog from '../ui/ConfirmDialog';
import OnboardingJourneyMap from './OnboardingJourneyMap';
import Modal from '../ui/Modal';
import AddRequestDialog from './AddRequestDialog';
import type { RequestTemplate } from '../../lib/requestTemplates';
import { firstEntry, isSeedTemplate, saveRequestTemplate } from '../../lib/requestTemplates';
import { createPrevAccountantTrack, isPrevAccountantStep } from '../../lib/prevAccountantTrack';
import JourneyTemplatesDialog from './JourneyTemplatesDialog';
import SendPortalDialog from './SendPortalDialog';
import ClientPagePreviewDialog from './ClientPagePreviewDialog';
import type { PortalPreviewMode } from './ClientPagePreviewDialog';
import PortalPreviewPanel from './PortalPreviewPanel';
import PublishCasePrompt from './PublishCasePrompt';
import InlineComposer from './InlineComposer';
import {
  AUTO_OFFICE_TYPES, buildClientFacingRows, CLIENT_FACING_TYPES, EXECUTION_OWNED_TYPES,
  isManualInternalTask,
  type ClientFacingRow,
} from '../../utils/clientFacingRows';
import EmailInput from '../ui/EmailInput';
import InfoLines from '../ui/InfoLines';

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
  /** פתיחת חלון מכתב השחרור — או עדכון המשך על אותו מסלול. חסר ⇒ אין כפתור. */
  onPrepareReleaseLetter?: (stepId: string, mode?: 'letter' | 'follow_up') => void;
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
  /** מעבר ללשונית המסמכים — משם ניגשים למה שהרו"ח הקודם שלח. */
  onOpenDocuments?: (folderId?: string) => void;
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

/** שלבים שאינם מוצגים ללקוח בדף האישי — ולכן "טיוטה/פורסם" אינו חל עליהם. */
const PORTAL_HIDDEN_TYPES: OnboardingStepType[] = ['release_letter', 'materials_received'];

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
  // ‼ פריט רשות ("חומר נוסף לפי שיקול דעתך") אינו נספר — אחרת ההתקדמות
  // לעולם לא מגיעה למלוא, ופריט שהוא בונוס נראה כחוסר.
  const list = step.payload.checklist?.filter(i => !(i.optional || isOptionalMaterialKey(i.key)));
  if (!Array.isArray(list) || list.length === 0) return null;
  return `${list.filter(i => i.done).length}/${list.length}`;
}

/**
 * התקדמות רשימת ההקמה בפייפרלס — חמישה סעיפים.
 *
 * ‼ למה לא progressLabel הגנרי: הסעיף החמישי ("הלקוח הזין כרטיס אשראי") חי
 * כחותמת על שלב התשלום ולא ברשימה של שלב החיבור, ולכן קורא שמסתמך על
 * payload.checklist לבדו הציג "4 מתוך 4" בעוד הכרטיס עצמו אומר "4 מתוך 5".
 */
function paperlessProgressLabel(step: OnboardingStep, retainer?: OnboardingStep): string | null {
  const items = paperlessSetupItems(step, retainer);
  if (items.length === 0) return null;
  return `${items.filter(i => i.done).length}/${items.length}`;
}

/** שלב התשלום מבין שלבי הלקוח — נושא את החותמות של רשימת ההקמה. */
function findRetainerStep(m: Map<string, OnboardingStep>): OnboardingStep | undefined {
  for (const s of m.values()) if (s.stepType === 'retainer_authorization') return s;
  return undefined;
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
    return 'ייפתח אחרי שנשלים את החיבור לפייפרלס';
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
  onOpenDocuments,
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
  /** תבנית שנבחרה מהקטלוג — פותחת את הקומפוזר על עותק שלה. */
  const [templateDraft, setTemplateDraft] = useState<RequestTemplate | null>(null);
  /** בקשה שנשמרת כרגע כתבנית — החלון מבקש רק שם. */
  const [saveTemplateFor, setSaveTemplateFor] = useState<OnboardingStep | null>(null);
  const [templateName, setTemplateName] = useState('');
  const [templateBusy, setTemplateBusy] = useState(false);
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

  // ‼ מ-118 יש ללקוח יותר מהתקשרות אחת (חידוש שאושר, הסכמים שהסתיימו).
  // הקליטה רצה רק על ההתקשרות החיה — הסכם שהסתיים או שטרם נכנס לתוקף אינו
  // מביא איתו קליטה חדשה.
  const clientEngagements = useMemo(
    () => engagements.filter(e => e.clientId === clientId
      && e.status !== 'ended' && e.status !== 'cancelled' && e.status !== 'scheduled'),
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

  /**
   * "עדכנתי את הריטיינר לכרטיס אשראי" — הסעיף הרביעי ברשימת החיבור.
   *
   * ‼ הפעולה הזאת קורית בפייפרלס, אבל מה שהיא משנה אצלנו יושב על שלב התשלום:
   * מרגע זה פייפרלס מבקשת מהלקוח כרטיס, ולכן ההנחיה נחשפת לו בדף האישי.
   * לכן הסימון בשלב אחד כותב חותמת בשלב אחר — ולא מוסיף מצב חדש לאף אחד מהם.
   * ‼ אידמפוטנטי: חותמת שכבר קיימת אינה נדרסת בתאריך חדש.
   */
  async function markRetainerCardUpdated() {
    const retainer = clientSteps.find(s => s.stepType === 'retainer_authorization');
    if (!retainer || retainer.payload.authorizationCreatedAt) return;
    await advance(retainer.id, 'note', {
      authorizationCreatedAt: new Date().toISOString(),
      note: 'הריטיינר עודכן בפייפרלס לתשלום בכרטיס אשראי - הלקוח יתבקש להזין כרטיס',
    });
    refresh?.();
  }

  /**
   * "הלקוח הזין כרטיס אשראי בפייפרלס" — הסעיף החמישי והאחרון ברשימת החיבור.
   *
   * ‼ הצהרה של המשרד ולא אימות מול פייפרלס: אין אינטגרציה, וגיא מסמן את מה
   * שראה בחשבון — בדיוק כמו שאר הסעיפים ברשימה.
   * ‼ אותה חותמת בדיוק שכפתור "הכרטיס הוזן" בכרטיס התשלום כותב, ולכן שני
   * המשטחים אינם יכולים לסתור זה את זה ואין כאן מצב חדש לתחזק.
   * ‼ הסימון הוא גם מה שסוגר את שלב החיבור, והשחרור של הרשאת התשלום מגיע
   * מהתלות הקיימת בשרת (unlock_dependent_steps) — לא ממנעול שני משלנו.
   * ‼ אידמפוטנטי: חותמת שכבר קיימת אינה נדרסת בתאריך חדש.
   */
  async function markCardEntered(connection: OnboardingStep) {
    const retainer = clientSteps.find(s => s.stepType === 'retainer_authorization');
    if (!retainer) return;
    setBusyStepId(connection.id);
    setError(null);
    try {
      if (!retainer.payload.cardEnteredAt) {
        const stamped = await advance(retainer.id, 'note', {
          cardEnteredAt: new Date().toISOString(),
          note: 'הכרטיס של הלקוח הוזן בפייפרלס',
        });
        if (!stamped.ok) { setError(stamped.message ?? 'סימון הכרטיס נכשל.'); return; }
      }
      // ‼ שלב שכבר נסגר בעבר (לקוח מלפני הסעיף הזה) אינו נפתח מחדש כדי להיסגר
      // שוב: החותמת נכתבה, וזה כל מה שהיה חסר.
      if (isStepOpen(connection.status) && connection.status !== 'locked') {
        const checklist = paperlessSetupItems(connection, retainer)
          .map(i => i.key === CARD_ENTERED_KEY ? { ...i, done: true } : i);
        const closed = await advance(connection.id, 'complete', {
          completionMethod: 'manual',
          checklist,
          note: 'הלקוח הזין כרטיס אשראי בפייפרלס - ההקמה בפייפרלס הושלמה',
        });
        if (!closed.ok) { setError(closed.message ?? 'סגירת החיבור נכשלה.'); return; }
      }
    } finally {
      setBusyStepId(null);
    }
    refresh?.();
  }

  /**
   * ביטול אישור הרשמה שגוי — RPC ייעודי (מיגרציה 114).
   * ‼ לא advance('reopen') הגנרי: צריך גם להחזיר את הכדור ללקוח וגם לנעול
   * בחזרה את שלב החיבור שנפתח בגלל האישור, ורק אם עוד לא נגעו בו.
   */
  async function reopenRegistration(step: OnboardingStep) {
    const yes = window.confirm(
      'הלקוח לא באמת נרשם לפייפרלס?\n\n' +
      'אישור = השלב חוזר ללקוח בדף האישי, ושלב החיבור ננעל שוב עד שיאשר.');
    if (!yes) return;
    setBusyStepId(step.id);
    setError(null);
    const { data, error: rpcError } = await supabase.rpc('reopen_paperless_registration', {
      p_step_id: step.id,
    });
    setBusyStepId(null);
    const res = data as { ok?: boolean; error?: string } | null;
    if (rpcError || !res?.ok) {
      setError(rpcError?.message ?? 'ביטול האישור נכשל.');
      return;
    }
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
  // ‼ שני הסעיפים האחרונים ברשימת החיבור נשמרים כחותמות על שלב התשלום, ולכן
  // כרטיס הפייפרלס צריך לקרוא אותו — לא רק לכתוב אליו.
  const retainerStep = clientSteps.find(s => s.stepType === 'retainer_authorization');
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
  /** ‼ נפרד מ-linkError: זה לא הודעת שגיאה אלא הקישור עצמו, להעתקה ידנית. */
  const [linkToCopyManually, setLinkToCopyManually] = useState<string | null>(null);
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
  /** "עדכן את דף הלקוח" — הפעולה היחידה ברמת הדף. הבחירה (רק לעדכן / לעדכן
   *  ולשלוח / העתק קישור) והפרסום עצמו חיים ב-PublishCasePrompt. */
  const [publishPromptOpen, setPublishPromptOpen] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
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
      ? `${STEP_TYPE_LABELS[nextStep.stepType]} - ${lockHint(nextStep, stepById, depParents.get(nextStep.id))}`
      : nextStep.ball === 'me'
        ? NEXT_ACTION[nextStep.stepType]
        : `${STEP_TYPE_LABELS[nextStep.stepType]} - ${stepStatusLabel(nextStep)}`;

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
    !AUTO_OFFICE_TYPES.includes(s.stepType)
    && !EXECUTION_OWNED_TYPES.includes(s.stepType)
    && !s.stepType.startsWith('institution_alignment_');

  const visibleSteps = clientSteps.filter(s => matchesBall(s) && onSurface(s));
  const openSteps = visibleSteps.filter(s => isStepOpen(s.status));
  /* ‼ הייצוג שהושלם מוצג כאבן-דרך גלויה מעל הבקשות, ולכן הוא יורד מהמקטע
     המקופל — אחרת אותו דבר היה מופיע פעמיים על אותו מסך. */
  /**
   * ‼ מסלול הרו"ח הקודם נשאר כרטיס אחד לאורך כל ההעברה. כשהמכתב נסגר (הרו"ח
   * הקודם חתם) אבל החומרים עדיין בדרך, השלב הסגור נשאר על המסך כפניו של
   * המסלול — אחרת הכרטיס שמנהל את ההעברה נעלם בדיוק ברגע שאוספים בו חומרים.
   */
  const releaseAnchor = visibleSteps.filter(s =>
    s.stepType === 'release_letter'
    && !isStepOpen(s.status)
    && s.status !== 'cancelled'
    && visibleSteps.some(o => o.stepType === 'materials_received' && isStepOpen(o.status)));

  const doneSteps = visibleSteps.filter(
    s => !isStepOpen(s.status) && s.stepType !== 'representation'
      && !releaseAnchor.some(a => a.id === s.id));

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
   *
   * ‼ «חומרים מרו״ח קודם» היא בקשה אחת בעיני הרו"ח, ולכן ההסרה חלה על שלושת
   * השלבים שמאחוריה. בלי זה נשארו שאריות: הסרת המכתב לבדו הציפה את שאלת
   * הפרטים ככרטיס עצמאי (renderRow מסתיר אותה רק כשהמכתב חי) והשאירה את
   * מעקב החומרים תלוי בשלב מבוטל.
   */
  async function removeRow(step: OnboardingStep) {
    const targets = isPrevAccountantStep(step.stepType)
      ? clientSteps.filter(s => isPrevAccountantStep(s.stepType) && s.status !== 'cancelled')
      : [step];
    /* ‼ המצב הרצוי נגזר מהשלב שעליו לחצו ומוחל על כולם. בלי זה חבר שכבר
       סומן היה מתהפך בחזרה, ובקשה אחת הייתה מתפצלת לשני מצבים. */
    const pending = !step.pendingCancel;
    for (const t of targets) {
      if (t.publishedAt == null) {
        if (pending) await run(t, 'cancel', { note: 'הוסר לפני שפורסם' });
        continue;
      }
      if (!!t.pendingCancel === pending) continue;
      setBusyStepId(t.id);
      const { error: rpcError } = await supabase.rpc('set_onboarding_step_pending_cancel', {
        p_step_id: t.id, p_pending: pending,
      });
      setBusyStepId(null);
      if (rpcError) { setError(rpcError.message); return; }
    }
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
    setLinkToCopyManually(null);
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
      setLinkToCopyManually(url);
    }
  }

  /* ‼ publishRequest (publish_onboarding_request על בקשה בודדת) הוסר.
     שתי סיבות, ושתיהן עקרוניות ולא סגנוניות:
     1. בקשת לקוח אינה נשלחת לבדה — היא מופיעה בדף האישי כשמפרסמים את התיק.
     2. הנתיב הזה גם עקף את execute_automatic_step (מיגרציה 83 חיברה אותו
        ל-publish_case_changes ול-unlock_dependent_steps בלבד), ולכן בקשה
        אוטומטית שנפתחה דרכו לא חימשה את המייל שלה. עכשיו יש נתיב פרסום אחד.
     הפונקציה בשרת נשארה — לא נמחק כלום מהמסד. */

  /* ‼ publish_case_changes נקראת מ-PublishCasePrompt ולא מכאן: הבחירה
     ("רק לעדכן" / "לעדכן ולשלוח קישור") חייבת לקדום את הפרסום, אחרת
     "רק לעדכן" הוא שם של כפתור סגירה. פרסום כל שינויי התיק בבת אחת —
     טיוטות, עריכות, סידור והסרות — נשאר קריאה אחת, שם. */

  async function setStepRequired(id: string, required: boolean) {
    const { data, error: rpcError } = await supabase.rpc('set_onboarding_step_required', {
      p_step_id: id, p_required: required,
    });
    const res = data as { ok?: boolean; error?: string } | null;
    if (rpcError || !res?.ok) {
      setError(res?.error === 'step_closed'
        ? 'השלב כבר נסגר - אי אפשר לשנות אם הוא נדרש.'
        : (rpcError?.message ?? 'עדכון הבקשה נכשל.'));
      return;
    }
    refresh?.();
  }

  /* ── פתיחת «חומרים מרו״ח קודם» כשהיא חסרה ─────────────────────────────────
     ‼ אותה יצירה בדיוק שרצה מ"+ בקשה" — היא חיה ב-lib/prevAccountantTrack
     כדי ששתי נקודות הכניסה לא יתפצלו. אין כאן אחסון טיוטה מקביל: הטיוטה
     תיוולד על השלב עצמו. */
  const [prevTrackBusy, setPrevTrackBusy] = useState(false);
  const needsPrevTrack =
    !!(client.hasPreviousAccountant || client.prevAccountantEmail || client.prevAccountantName)
    && !clientSteps.some(s => s.stepType === 'release_letter' && s.status !== 'cancelled');

  async function openPrevAccountantTrack() {
    setPrevTrackBusy(true);
    setError(null);
    const res = await createPrevAccountantTrack({
      clientId,
      steps: clientSteps,
      prevAccountantEmail: prevAccountant?.email,
      published: true,
    });
    setPrevTrackBusy(false);
    if (!res.ok) { setError(res.error); return; }
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
                          {/* ‼ במנוחה התפריט קטן בכוונה: הערה והסרה, ותו לא
                              (הכרעת גיא 2026-08-18 — "כל האפשרויות האלה מיותרות").
                              דלג/חסום/כרשות/תבניות/בקשת המשך הם בניית תהליך,
                              והם מופיעים רק במצב "עריכת הבקשות". */}
                          {/* עריכה בשורה — רק לבקשות שנבנות בקומפוזר. */}
                          {step.stepType === 'custom_request' && (
                            <button type="button" role="menuitem" className={mi}
                              onClick={() => { setMenuStepId(null); setEditingStepId(step.id); }}>עריכה והגדרות</button>
                          )}
                          <button type="button" role="menuitem" className={mi}
                            onClick={() => { setMenuStepId(null); handleNote(step); }}>הוסף הערה</button>
                          {editing && (
                            <>
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
                              {!['completed', 'verified', 'cancelled'].includes(step.status) && (
                                <button type="button" role="menuitem" className={mi}
                                  onClick={() => { setMenuStepId(null); void setStepRequired(step.id, !isStepRequiredForClose(step)); }}
                                  title={isStepRequiredForClose(step)
                                    ? 'השלב חוסם היום את סגירת הקליטה. סימון כרשות ישחרר אותה.'
                                    : 'השלב אינו חוסם היום את סגירת הקליטה.'}>
                                  {isStepRequiredForClose(step) ? 'סמן כרשות' : 'סמן כנדרש'}
                                </button>
                              )}

                              <div className="ob-menu-sep" />

                              {/* ‼ שתי שמירות שונות ולכן שתי שורות: הבקשה הזאת
                                  בלבד, או כל ההרכב של הלקוח עם התלויות ביניהן. */}
                              <button type="button" role="menuitem" className={mi}
                                onClick={() => { setMenuStepId(null); setSaveTemplateFor(step); }}
                                title="שמירת הבקשה הזאת בלבד כתבנית לשימוש חוזר">
                                שמור כתבנית
                              </button>
                              <button type="button" role="menuitem" className={mi}
                                onClick={() => { setMenuStepId(null); setTemplatesOpen(true); }}
                                title="שמירת הבקשות של הלקוח כתבנית - כולל התלות ביניהן">
                                שמור את כל המסע כתבנית
                              </button>
                            </>
                          )}
                          {/* ‼ "הסר" — רק על בקשות פונות-ללקוח (לא ייצוג, לא עבודה
                              פנימית — שם "דלג"/"חסום" שבמצב העריכה מספיקים). בקשה
                              שפורסמה מסומנת pending_cancel וממשיכה להופיע ללקוח עד
                              הפרסום הבא (מיגרציה 101); טיוטה שמעולם לא פורסמה מבוטלת מיד. */}
                          {CLIENT_FACING_TYPES.includes(step.stepType) && (
                            <button type="button" role="menuitem"
                              className={`${mi} ${step.pendingCancel ? '' : 'is-danger'}`} disabled={busy}
                              onClick={() => { setMenuStepId(null); void removeRow(step); }}
                              title={step.publishedAt == null ? 'הבקשה עוד לא פורסמה - ההסרה מיידית'
                                : step.pendingCancel ? 'ההסרה ממתינה לפרסום - לחיצה תבטל אותה'
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
                  title="נפתחת טיוטה לעריכה ואישור - שום דבר לא נשלח לפני שתלחץ שלח">
                  {extAlreadySent ? 'שלח תזכורת' : 'פתח טיוטת מייל לשליחה'}
                </button>
              ) : null;

              if (step.stepType === 'paperless_invite' || step.stepType === 'paperless_connection') {
                return (
                  <PaperlessStepCard
                    key={step.id}
                    step={step}
                    stepById={stepById}
                    client={client}
                    retainer={retainerStep}
                    onReopen={() => void reopenRegistration(step)}
                    onRetainerCardSet={() => void markRetainerCardUpdated()}
                    onCardEntered={() => void markCardEntered(step)}
                    busy={busy}
                    highlight={highlightStepId === step.id}
                    showTriage={retriageStepId === step.id || triageAnchorId === step.id}
                    triageBusy={triageBusy}
                    triageError={triageError}
                    onTriage={submitTriage}
                    onRetriage={() => { setTriageError(null); setRetriageStepId(step.id); }}
                    onCancelTriage={() => setRetriageStepId(null)}
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
                    materialsStep={clientSteps.find(
                      s => s.stepType === 'materials_received' && s.status !== 'cancelled')}
                    detailsStep={clientSteps.find(
                      s => s.stepType === 'prev_accountant_details' && s.status !== 'cancelled')}
                    stepById={stepById}
                    clientId={clientId}
                    client={client}
                    onClientPersisted={onClientPersisted}
                    busy={busy}
                    highlight={highlightStepId === step.id}
                    prevAccountant={prevAccountant}
                    blockNote={blockNoteByStep.get(step.id)}
                    onPrepare={onPrepareReleaseLetter
                      ? (mode) => onPrepareReleaseLetter(step.id, mode)
                      : undefined}
                    onBlock={() => handleBlock(step)}
                    onRun={(action, payload) => void run(step, action, payload)}
                    advance={advance}
                    refresh={refresh}
                    onOpenDocuments={onOpenDocuments}
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
                // ‼ הסכום מגיע מההצעה שאושרה — לא מעותק שנשמר בבקשה. עותק כזה
                // נמחק כשהבקשה הוסרה ונוספה מחדש דרך הקטלוג (המקרה של 2026-08-17).
                const retainerEng = clientEngagements.find(e => e.id === step.engagementId)
                  ?? clientEngagements[0];
                const retainerQuote = retainerEng?.quotationId
                  ? (quotations ?? []).find(q => q.id === retainerEng.quotationId)
                  : undefined;
                return (
                  <RetainerStepCard
                    key={step.id}
                    step={step}
                    stepById={stepById}
                    client={client}
                    engagement={retainerEng}
                    quotation={retainerQuote}
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
                    {/* ‼ "התחל" הוא כפתור של מי שעושה את העבודה. בחיבור לרשות
                        המסים העבודה היא של הלקוח, ולכן מה שצריך כאן הוא סגירה
                        בלחיצה אחת — לרוב אחרי שהוא אמר בטלפון שביצע. */}
                    {step.status === 'pending' && !extSendable
                      && step.stepType !== 'paperless_tax_authority' && (
                      <button type="button" className="btn btn-sm btn-secondary" disabled={busy}
                        onClick={() => void run(step, 'start')}>התחל</button>
                    )}
                    {step.status === 'pending' && step.stepType === 'paperless_tax_authority' && (
                      <button type="button" className="btn btn-sm btn-primary" disabled={busy}
                        title="הלקוח מסמן בעצמו בדף האישי - זה כאן למקרה שהוא עדכן אותך אחרת"
                        onClick={() => void run(step, 'complete')}>הלקוח השלים</button>
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
                    {/* ‼ סגירה בלחיצה אחת חייבת ביטול בלחיצה אחת. "החומרים
                        הגיעו" הוא כפתור ראשי ליד "ממתין ללקוח", ולחיצה בטעות
                        הקפיאה גם את הרשימה עצמה (itemsEditable). הביטול מחזיר
                        את השלב למי שהחזיק את הכדור, ולא ל"טרם התחיל". */}
                    {['completed', 'verified'].includes(step.status) && (
                      <button type="button" className="btn btn-sm btn-ghost" disabled={busy}
                        title="השלב חוזר להמתנה, בדיוק כפי שהיה לפני הסימון"
                        onClick={() => void (step.ball && step.ball !== 'me'
                          ? run(step, 'wait_client', { ball: step.ball })
                          : run(step, 'reopen'))}>
                        בטל סימון
                      </button>
                    )}
                    {(step.status === 'blocked' || step.status === 'failed') && (
                      <button type="button" className="btn btn-sm btn-secondary" disabled={busy}
                        onClick={() => void run(step, 'reopen')}>פתח מחדש</button>
                    )}

                    {/* ‼ "הכן תזכורת" הוסר מבקשת לקוח (2026-08-16). בקשה
                        ללקוח אינה מייל משלה — היא שורה בדף האישי, ומזכירים
                        עליה בשליחה אחת של הדף ("עדכן את דף הלקוח ← לעדכן
                        ולשלוח קישור"). תזכורת פר-בקשה החזירה בדיוק את המודל
                        של "שלחתי כמה בקשות" שהמסך הזה בא לבטל. */}

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
                  {step.stepType === 'paperless_tax_authority' && <TaxAuthorityBody step={step} />}
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
          title="הדף האישי כפי שהלקוח רואה אותו - כולל טיוטות שטרם פורסמו">
          הדף של הלקוח
        </button>
        <button type="button" className="btn btn-sm btn-ghost"
          onClick={() => setSendOpen(true)}
          title="מייל עם מה שממתין לו, או קישור לדף האישי לשליחה בוואטסאפ">
          שלח ללקוח
        </button>
        {/* ‼ מאז שהתפריט במנוחה קטן (הערה + הסרה בלבד), מצב העריכה הוא הדרך
            היחידה אל דלג/חסום/תבניות — ולכן הכפתור חייב להופיע גם במסך הזה. */}
        <button type="button" className={`btn btn-sm ${editing ? 'btn-primary' : 'btn-ghost'}`}
          onClick={() => setEditing(v => !v)}>
          {editing ? 'סיום עריכה' : 'עריכת הבקשות'}
        </button>
        {/* ‼ סגירת קליטה היא החלטה ולא תוצר לוואי. השרת בודק את התנאים
            ואומר מה חסר; לכפות אפשר, אבל עם סיבה שנרשמת ביומן. */}
        {activeEngagement?.status === 'onboarding' && (
          <button type="button" className="btn btn-sm btn-ghost" disabled={closing}
            onClick={() => void closeOnboarding(false)}
            title="מעביר את הלקוח לשוטף - אחרי בדיקת התנאים">
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
            הדף של {clientDisplayName ?? 'הלקוח'} - קישור קבוע אחד:
          </span>
          <button type="button" className="ui-linkbtn" disabled={linkBusy}
            onClick={() => void copyPortalLink()}
            title="מעתיק את הקישור לדף האישי - לוואטסאפ או לכל מקום אחר">
            {linkCopied ? 'הועתק ✓' : linkBusy ? 'מכין…' : 'העתק קישור'}
          </button>
          <button type="button" className="ui-linkbtn"
            onClick={() => setSendOpen(true)}
            title="מייל עם מה שממתין לו, או הקישור לשליחה בוואטסאפ">
            שלח שוב את הקישור
          </button>
          <button type="button" className="ui-linkbtn"
            onClick={() => setPreviewOpen(true)}
            title="הדף האישי כפי שהלקוח רואה אותו - כולל טיוטות שטרם פורסמו">
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
              title="מעביר את הלקוח לשוטף - אחרי בדיקת התנאים">
              {closing ? 'סוגר…' : 'סגור קליטה'}
            </button>
          )}
        </div>
      )}
      {/* ‼ המשפט שמסביר את המודל, מאב-הטיפוס המאושר. הוא לא קישוט: בלעדיו
          "למה אין כפתור שליחה על הבקשה הזאת" נשארת שאלה פתוחה על המסך. */}
      {embedded && (
        <InfoLines style={{ fontSize: 'var(--fs-12)', color: 'var(--ink-4)', marginTop: '-.15rem', lineHeight: 1.6 }} items={[
          'כל מה שמבקשים מהלקוח חי בדף האישי הזה',
          'בקשות לגורם חיצוני נשלחות בנפרד',
        ]} />
      )}
      {linkError && (
        <div style={{ fontSize: 'var(--fs-12)', color: 'var(--err)' }}>⚠ {linkError}</div>
      )}
      {linkToCopyManually && (
        <InfoLines style={{ fontSize: 'var(--fs-12)', color: 'var(--err)' }} items={[
          '⚠ העתקה נחסמה בדפדפן - אפשר להעתיק את הקישור מכאן',
          <span dir="ltr" style={{ display: 'block', textAlign: 'right', wordBreak: 'break-all' }}>{linkToCopyManually}</span>,
        ]} />
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
            {/* ‼ הבחירה קודמת לפרסום: "רק לעדכן" חייב להיות הפעולה עצמה,
                ולא "סגור" אחרי שכבר פורסם. הפעולה היחידה ברמת הדף. */}
            <button type="button" className="btn btn-sm btn-primary"
              onClick={() => { setPendingCount(dirty.length); setPublishPromptOpen(true); }}>
              עדכן את דף הלקוח
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
          [...openVisible, ...releaseAnchor].filter(s => !isManualInternalTask(s)), depParents);
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
          // ‼ "פרטי הרו״ח הקודם" אינה כרטיס במסך המשרד — מצבה מוצג בתוך כרטיס
          // המכתב עצמו (הכרעת גיא 2026-08-18: כרטיס אחד למסלול). בדף הלקוח
          // היא ממשיכה להופיע כרגיל. אם המכתב בוטל והיא נשארה לבד — היא
          // ה-primary ואז כן מוצגת, אחרת אין למסלול שום ייצוג על המסך.
          const rest = row.members.filter(m =>
            m.id !== row.primary.id && m.stepType !== 'prev_accountant_details');
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

            {/* ‼ ידוע שיש רו״ח קודם, ואין מסלול — קורה כשהכרטיס נפתח בלי הצעה
                שסומנה כמעבר, או כשהפרטים הוזנו ידנית אחר כך. כאן פותחים את
                אותו מסלול בדיוק (create_onboarding_request), לא מסלול שני. */}
            {needsPrevTrack && (
              <div className="ob-req">
                <span className="ob-req-dot" aria-hidden="true" />
                <div className="ob-card">
                  <div className="ob-card-row">
                    <div className="ob-card-main">
                      <div className="ob-card-title">רו״ח קודם</div>
                      <div className="ob-card-meta">
                        {prevAccountant?.name
                          ? `${prevAccountant.name} רשום בכרטיס - עוד לא נפתח מסלול העברה.`
                          : 'רשום שהלקוח הגיע מרו״ח אחר - עוד לא נפתח מסלול העברה.'}
                      </div>
                    </div>
                    <div className="ob-card-actions">
                      <button type="button" className="btn btn-sm btn-primary" disabled={prevTrackBusy}
                        onClick={() => void openPrevAccountantTrack()}>
                        {prevTrackBusy ? 'פותח…' : 'פתח מסלול רו״ח קודם'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ‼ הוספה ותבניות זמינות תמיד — לאורך כל חיי הלקוח, לא רק בקליטה
                ולא רק במצב עריכה. זו בקשה חדשה, לא תצורה. */}
            {/* ‼ תבנית שנבחרה נפתחת כאן כעותק לעריכה, ולא נוצרת מיד: מה
                שנשלח ללקוח הוא מה שערכת, והתבנית עצמה לא משתנה אלא אם
                ביקשת זאת במפורש בתחתית הקומפוזר. */}
            {templateDraft ? (
              <InlineComposer
                clientId={clientId}
                initialContent={firstEntry(templateDraft)?.payload}
                initialOwner={firstEntry(templateDraft)?.owner ?? 'client'}
                sourceTemplate={{
                  id: templateDraft.id,
                  name: templateDraft.name,
                  isSeed: isSeedTemplate(templateDraft),
                  entry: firstEntry(templateDraft),
                }}
                existingSteps={clientSteps}
                prevAccountant={prevAccountant}
                onCancel={() => setTemplateDraft(null)}
                onSaved={created => {
                  setTemplateDraft(null);
                  setOptimisticSteps(prev => [...prev, created]);
                  refresh?.();
                }}
              />
            ) : (
              <div className="ob-add-row">
                <button type="button" className="ob-add" onClick={() => setAddOpen(true)}>＋ בקשה חדשה</button>
                <button type="button" className="btn btn-secondary ob-tpl"
                  onClick={() => setTemplatesOpen(true)}>מתבנית</button>
              </div>
            )}

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
                        ? 'ביטוח לאומי, מע״מ ומס הכנסה - לאן להיכנס, מה להעתיק, מה חריג'
                        : alignDone
                          ? `הושלם${alignSteps[0]?.payload.checkedAt ? ' · נבדק לאחרונה ' + formatDate(String(alignSteps[0].payload.checkedAt), 'list') : ''}`
                          : 'בתהליך - נכנסים לכל רשות ומיישרים קו'}
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
                      {/* ‼ הדרך היחידה לבטל אישור הרשמה שגוי: בקשה שהושלמה
                          מוצגת כאן כשורה, בלי הכרטיס ובלי תפריט ⋯. בלי הכפתור
                          הזה "הלקוח לחץ בטעות" הוא מבוי סתום. */}
                      {s.stepType === 'paperless_invite' && (
                        <button type="button" className="btn btn-sm btn-ghost"
                          disabled={busyStepId === s.id}
                          title="הלקוח אישר שנרשם, אבל בפועל לא - השלב חוזר אליו"
                          onClick={e => { e.stopPropagation(); void reopenRegistration(s); }}>
                          בטל אישור
                        </button>
                      )}
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

      {/* ‼ ציר הזמן «מה קרה» הוסר מכאן. משטח הבקשות אומר מה **צריך לקרות** —
          אבני דרך שהובילו לכאן, בקשות פתוחות, בקשות נעולות והעבודה שלי; יומן
          של מה שכבר קרה הוא שאלה אחרת, ויש לה מסך: לשונית «פעילות». האירועים
          עצמם לא נגעו — ActivityTab מציג את אותם onboarding_events, מקובצים
          לפי יום ועם סינון. */}

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
          prevAccountantEmail={prevAccountant?.email}
          onUseTemplate={t => { setAddOpen(false); setTemplateDraft(t); }}
          onClose={() => setAddOpen(false)}
          onCreated={() => refresh?.()}
        />
      )}

      {saveTemplateFor && (
        <div className="modal-backdrop" onClick={e => { if (e.target === e.currentTarget) setSaveTemplateFor(null); }}>
          <div className="modal" style={{ maxWidth: 440 }} onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <h3 style={{ margin: 0, fontSize: 'var(--fs-16)' }}>שמירת הבקשה כתבנית</h3>
              <button type="button" className="btn btn-sm btn-ghost" onClick={() => setSaveTemplateFor(null)} aria-label="סגירה">✕</button>
            </div>
            <div className="modal-body" style={{ display: 'grid', gap: '.5rem' }}>
              <div style={{ fontSize: 'var(--fs-13)', color: 'var(--ink-3)' }}>
                התבנית תהיה זמינה לכל מי שעובד במשרד, ב«+ בקשה חדשה». הבקשה של הלקוח לא תשתנה.
              </div>
              <input className="input" autoFocus placeholder="שם התבנית" value={templateName}
                onChange={e => setTemplateName(e.target.value)} />
            </div>
            <div className="modal-foot" style={{ display: 'flex', gap: '.4rem', justifyContent: 'flex-end' }}>
              <button type="button" className="btn btn-ghost" onClick={() => setSaveTemplateFor(null)}>ביטול</button>
              <button type="button" className="btn btn-primary" disabled={templateBusy || !templateName.trim()}
                onClick={async () => {
                  setTemplateBusy(true);
                  const err = await saveRequestTemplate(saveTemplateFor.id, templateName.trim());
                  setTemplateBusy(false);
                  if (err) { setError('שמירת התבנית נכשלה.'); return; }
                  setSaveTemplateFor(null); setTemplateName('');
                }}>{templateBusy ? 'שומר…' : 'שמירה'}</button>
            </div>
          </div>
        </div>
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
          pendingCount={pendingCount}
          onPublished={() => refresh?.()}
          onClose={() => { setPublishPromptOpen(false); refresh?.(); }}
        />
      )}
    </div>
    </RowOpenContext.Provider>
  );
}

/**
 * חיבור פייפרלס לרשות המסים — מה שהלקוח רואה, מוצג גם כאן.
 *
 * ‼ טקסט ולא צ'קליסט: הצעדים הם שלו, ולא שלנו, וסימון שלנו על פעולה שקורית
 * בחשבון שלו היה מונה שאף אחד לא מתחזק. מה שסוגר את הבקשה הוא ההצהרה שלו
 * בדף האישי — או "הלקוח השלים" כשהוא מודיע בטלפון.
 * ‼ הניסוח מגיע מהקבוע המשותף ולא מה-payload: בקשה שנוצרה בגרסה קודמת
 * ממשיכה להציג את הנוסח המעודכן, בדיוק כמו רשימת ההקמה בפייפרלס.
 */
function TaxAuthorityBody({ step }: { step: OnboardingStep }) {
  const connectedAt = String(step.payload.connectedAt ?? '');
  return (
    <div style={{ marginTop: '.4rem', display: 'grid', gap: '.35rem' }}>
      <ol style={{
        margin: 0, paddingInlineStart: '1.1rem', display: 'grid', gap: '.15rem',
        fontSize: 'var(--fs-13)', color: 'var(--ink-2)', lineHeight: 1.6,
      }}>
        {PAPERLESS_TAX_AUTHORITY.steps.map(s => <li key={s}>{s}</li>)}
      </ol>
      <div style={{ fontSize: 'var(--fs-12)', color: 'var(--ink-3)' }}>
        {PAPERLESS_TAX_AUTHORITY.after}
      </div>
      {connectedAt && (
        <div style={{ fontSize: 'var(--fs-12)', color: 'var(--ink-3)' }}>
          הלקוח דיווח שביצע את החיבור ב-{new Date(connectedAt).toLocaleDateString('he-IL')}
        </div>
      )}
      <a href={PAPERLESS_TAX_AUTHORITY.guideUrl} target="_blank" rel="noopener noreferrer"
        style={{ fontSize: 'var(--fs-12)', color: 'var(--brand)', width: 'fit-content' }}>
        המדריך של פייפרלס, עם צילומי מסך ←
      </a>
    </div>
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

/**
 * מה שהמשרד עושה בפועל בתוך פייפרלס אחרי שהלקוח נרשם.
 *
 * ‼ ארבעה סעיפים תמיד — כולל משיכת עוסקים. היא חלק מההקמה הסטנדרטית גם
 * ללקוח חדש לגמרי, ולא רק בהעברה ממייצג קודם (הכרעת גיא 2026-08-17).
 * ‼ הסדר אינו קוסמטי: עדכון הריטיינר לכרטיס אשראי אפשרי רק אחרי שלושת
 * הראשונים, והוא זה שגורם לפייפרלס לבקש מהלקוח את הכרטיס. לכן הוא נעול
 * עד שהם סומנו, וברגע שהוא מסומן — ההנחיה נחשפת ללקוח בדף האישי.
 * ‼ הסעיף החמישי (2026-08-18) סוגר את הרצף: ההקמה אינה נגמרת בבקשה שיצאה
 * ללקוח אלא בכרטיס שהוא הזין בפועל, וזה מה שמשחרר את הרשאת התשלום.
 *
 * ‼ הרשימה עצמה ו-paperlessSetupItems עברו ל-types/onboarding.ts: גם המסך הזה
 * וגם רשת הבוקר סופרים אותה, ושתי ספירות נפרדות הן בדיוק איך שנוצר
 * "4 מתוך 4" מול "4 מתוך 5".
 */

/** ערך שצריך להעתיק לפייפרלס — מוצג מכרטיס הלקוח, לא מעותק שנשמר על השלב. */
function CopyValueRow({ label, value }: { label: string; value?: string }) {
  const [copied, setCopied] = useState(false);
  const has = !!value?.trim();
  return (
    <div style={{ display: 'flex', gap: '.5rem', alignItems: 'baseline', fontSize: 'var(--fs-13)' }}>
      <span style={{ color: 'var(--ink-3)', minWidth: 78 }}>{label}</span>
      <span style={{ fontWeight: 600, color: has ? 'var(--ink-1)' : 'var(--ink-4)' }}>
        {has ? value : 'חסר בכרטיס'}
      </span>
      {has && (
        <button type="button" className="btn btn-sm btn-ghost"
          onClick={() => {
            void navigator.clipboard?.writeText(value!.trim());
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1500);
          }}>{copied ? 'הועתק' : 'העתק'}</button>
      )}
    </div>
  );
}

interface PaperlessCardProps {
  step: OnboardingStep;
  stepById: Map<string, OnboardingStep>;
  /** ת״ז ושם העסק — מה שמזינים בפייפרלס, ישירות מהכרטיס. */
  client: Client;
  busy: boolean;
  highlight: boolean;
  /** שלב התשלום — נושא את החותמות של שני הסעיפים האחרונים ברשימת החיבור. */
  retainer?: OnboardingStep;
  /** ביטול אישור הרשמה שגוי — רק על שלב ההרשמה שכבר נסגר. */
  onReopen: () => void;
  /** הריטיינר עודכן לכרטיס אשראי — מסמן על שלב התשלום שההנחיה נחשפת ללקוח. */
  onRetainerCardSet: () => void;
  /** הלקוח הזין כרטיס — סוגר את החיבור ומשחרר את הרשאת התשלום. */
  onCardEntered: () => void;
  showTriage: boolean;
  triageBusy: boolean;
  triageError: string | null;
  onTriage: (a: { paperlessStatus: PaperlessStatus; dataSource: PaperlessDataSource; softwareName: string }) => void;
  onRetriage: () => void;
  onCancelTriage: () => void;
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

  // ‼ «סיימתי» חסום כל עוד הסעיף החמישי פתוח: סגירה ב-4 מתוך 5 הייתה משחררת
  // את הרשאת התשלום לפני שיש כרטיס לחייב, וזה בדיוק מה שהסעיף בא למנוע.
  // ‼ הכפתור נשאר גלוי ולא נעלם — כשהכרטיס כבר סומן והשלב עדיין פתוח (למשל
  // אם הסגירה האוטומטית לא עברה) הוא הדרך לסיים ידנית.
  // ‼ לקוח שאינו עובד עם פייפרלס, או שגובים ממנו ידנית, אינו מגיע לכאן בכלל —
  // אין לו רשימת חיבור, ולכן אין מה לחסום.
  const retainerIsDigital = !!p.retainer && p.retainer.payload.method !== 'manual_arrangement';
  const cardPending = !isInvite && path !== 'not_applicable' && retainerIsDigital
    && !paperlessSetupItems(step, p.retainer).find(i => i.key === CARD_ENTERED_KEY)?.done;
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
            <ConnectionBody path={path} softwareName={String(step.payload.softwareName ?? '')}
              step={step} client={p.client} retainer={p.retainer} busy={busy} onRun={p.onRun}
              onRetainerCardSet={p.onRetainerCardSet} onCardEntered={p.onCardEntered} />
          )}

          <div style={{ display: 'flex', gap: '.35rem', flexWrap: 'wrap', marginTop: '.55rem', alignItems: 'center' }}>
            {/* ‼ אין כאן יותר "הכן מייל הזמנה". קישור ההרשמה חי בדף האישי
                של הלקוח, ככל בקשה אחרת — לא במייל נפרד לבקשה הזאת. */}
            {isInvite && open && path !== 'none' && path !== undefined && (
              <button type="button" className="btn btn-sm btn-secondary" disabled={busy}
                onClick={() => p.onRun('skip', { reason: 'already_connected', note: 'הלקוח כבר בפייפרלס - אין צורך בהרשמה' })}>
                סמן שאין צורך בהרשמה
              </button>
            )}
            {/* ‼ ההשלמה הרגילה של השלב הזה היא של הלקוח ("נרשמתי לפייפרלס"
                בדף האישי). הכפתור כאן הוא המסלול הידני — הלקוח אמר בטלפון,
                או שראינו אותו בפייפרלס — בדיוק כמו "הלקוח השלים" בשאר הבקשות. */}
            {isInvite && open && (
              <button type="button" className="btn btn-sm btn-secondary" disabled={busy}
                title="לשימוש כשהלקוח הודיע מחוץ למערכת - בדרך כלל הוא מאשר בעצמו בדף האישי"
                onClick={() => p.onRun('complete', { completionMethod: 'manual' })}>הלקוח נרשם</button>
            )}

            {/* ‼ שלב החיבור הוא של המשרד: ברגע שנכנסים לחשבון של הלקוח,
                פייפרלס מבקשת מאיתנו את פרטי האשראי. ולכן ההשלמה כאן היא
                "סיימתי" — לא "אשר שהלקוח עשה". זה גם מה שפותח את ההרשאה. */}
            {/* ‼ כל עוד הסעיף החמישי פתוח הכפתור הזה יורד ולא מוצג מושבת:
                הפעולה שסוגרת את ההקמה היא «סמן כבוצע» שבשורה עצמה, וכפתור
                ראשי שני — מושבת — רק מתחרה בו על העין. הוא חוזר ברגע שהכרטיס
                סומן והשלב עדיין פתוח, כלומר בדיוק כשצריך מסלול סיום ידני. */}
            {!isInvite && open && step.status !== 'locked' && !cardPending && (
              <button type="button" className="btn btn-sm btn-primary" disabled={busy}
                onClick={() => p.onConfirm(
                  path === 'other_rep' ? 'אישור השלמת ההעברה' : 'סיום החיבור לפייפרלס',
                  // ‼ הניסוח הישן שאל "כולל פרטי האשראי שפייפרלס ביקשה" — זה
                  // המודל שבו המשרד מזין את הכרטיס, וכבר אינו נכון: הלקוח הוא
                  // שמזין אותו, אחרי שהריטיינר עודכן לכרטיס אשראי.
                  path === 'other_rep'
                    ? 'ההעברה מהמייצג הקודם הושלמה והלקוח מופיע ברשימה שלך?'
                    : 'כל הסעיפים בוצעו בחשבון הפייפרלס של הלקוח?',
                  'סיימתי',
                )}>
                סיימתי
              </button>
            )}
            {!isInvite && step.status === 'completed' && (
              <button type="button" className="btn btn-sm btn-secondary" disabled={busy}
                onClick={() => p.onRun('verify')}>אמת</button>
            )}

            {/* ‼ הלקוח יכול ללחוץ «נרשמתי» בטעות, ותפריט ⋯ מוצג רק על שלב
                פתוח — כלומר עד היום לא הייתה שום דרך להחזיר את השלב אליו.
                כאן, ורק על ההרשמה: שלב החיבור חוזר לנעול אם עוד לא נגעו בו. */}
            {isInvite && !open && step.status !== 'cancelled' && (
              <button type="button" className="btn btn-sm btn-ghost" disabled={busy}
                title="הלקוח אישר שנרשם, אבל בפועל לא - השלב חוזר אליו"
                onClick={p.onReopen}>בטל את אישור ההרשמה</button>
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
  if (path === 'other_rep') {
    return (
      <div style={cardNote}>
        הלקוח כבר קיים בפייפרלס אצל המייצג הקודם - אין לו מה להירשם. ההמשך
        נעשה בשלב החיבור, שהוא שלנו.
      </div>
    );
  }
  if (path === 'self') {
    return (
      <div style={cardNote}>
        ללקוח כבר יש חשבון פייפרלס. בדף האישי הוא מתבקש להוסיף את המשרד
        כמייצג, ומאשר כאן שעשה זאת.
      </div>
    );
  }
  return (
    <div style={cardNote}>
      {status === 'waiting_client' || status === 'pending'
        ? 'קישור ההרשמה מופיע ללקוח בדף האישי, יחד עם כפתור «נרשמתי לפייפרלס». ברגע שילחץ, שלב החיבור ייפתח אצלך מעצמו.'
        : 'הלקוח נרשם. אפשר להיכנס לחשבון שלו ולהשלים את החיבור.'}
    </div>
  );
}

/**
 * עבודת החיבור — רשימת סימון תפעולית ולא פסקת הוראות.
 *
 * ‼ ארבעת הסעיפים זהים בכל המסלולים (חוץ מ"לא יעבוד עם פייפרלס", שבו אין
 * עבודה בכלל): גם לקוח חדש לגמרי עובר משיכת עוסקים. מה שמשתנה בין המסלולים
 * הוא רק משפט ההקשר שמעל.
 * ‼ הת״ז ושם העסק מוצגים כאן להעתקה — מכרטיס הלקוח עצמו. אין עותק שלהם על
 * השלב: מה שיוצג הוא תמיד מה שבכרטיס, גם אם תוקן אחרי שהשלב נוצר.
 */
function ConnectionBody({ path, softwareName, step, client, retainer, busy, onRun, onRetainerCardSet, onCardEntered }: {
  path?: PaperlessStatus;
  softwareName: string;
  step: OnboardingStep;
  client: Client;
  /** שלב התשלום — נושא את החותמות, וקיומו הוא התנאי לסעיף החמישי. */
  retainer?: OnboardingStep;
  busy: boolean;
  onRun: (action: string, payload?: Record<string, unknown>) => void;
  /** סימון "עדכנתי את הריטיינר לכרטיס" — חושף ללקוח את ההנחיה להזין כרטיס. */
  onRetainerCardSet: () => void;
  /** סימון "הלקוח הזין כרטיס" — סוגר את החיבור ומשחרר את הרשאת התשלום. */
  onCardEntered: () => void;
}) {
  if (path === 'not_applicable') {
    return (
      <div style={cardNote}>
        אין חיבור לפייפרלס ללקוח הזה. אם זה ישתנה - "שנה מסלול" יחזיר את
        ההזמנה והחיבור, והתשלום יחזור להיות תלוי בהם.
      </div>
    );
  }

  const items = paperlessSetupItems(step, retainer);
  const doneCount = items.filter(i => i.done).length;
  const intro = path === 'other_rep'
    ? 'הלקוח קיים בפייפרלס אצל המייצג הקודם. נכנסים לחשבון, מושכים אותו אלינו, ומשלימים את ההקמה.'
    : path === 'self'
      ? 'ללקוח יש חשבון משלו והוא הוסיף אותנו כמייצג. נכנסים לחשבון ומשלימים את ההקמה.'
      : 'הלקוח נרשם. נכנסים לחשבון שלו בפייפרלס ומשלימים את ההקמה.';

  /** שלושת הראשונים — התנאי לסעיף הרביעי. */
  const setupReady = items
    .filter(i => i.key !== RETAINER_CARD_KEY && i.key !== CARD_ENTERED_KEY)
    .every(i => i.done);

  /** ארבעת הראשונים — התנאי לסעיף החמישי: פייפרלס מבקשת את הכרטיס רק אחרי
   *  שהריטיינר עודכן, ולכן "הלקוח הזין" לפני זה אינו יכול לקרות. */
  const cardStepReady = items
    .filter(i => i.key !== CARD_ENTERED_KEY)
    .every(i => i.done);

  const cardItem = items.find(i => i.key === CARD_ENTERED_KEY);

  function toggle(item: StepChecklistItem) {
    const next = items.map(x => x.key === item.key ? { ...x, done: !x.done } : x);
    onRun('note', {
      checklist: next,
      note: `${item.done ? 'בוטל סימון' : 'סומן'}: ${item.label}`,
    });
    // ‼ הסימון הזה הוא הרגע שבו פייפרלס מתחילה לבקש מהלקוח כרטיס — ולכן הוא
    // גם מה שחושף לו את ההנחיה בדף האישי. סימון בלבד, בלי כפתור נוסף.
    // ‼ הסרת הסימון אינה מבטלת את החשיפה: אי אפשר לבטל בקשה שפייפרלס כבר שלחה.
    if (item.key === RETAINER_CARD_KEY && !item.done) onRetainerCardSet();
  }

  return (
    <div style={cardNote}>
      <div style={{ marginBottom: '.45rem' }}>{intro}</div>

      <div style={{
        display: 'grid', gap: '.2rem', marginBottom: '.5rem',
        padding: '.4rem .55rem', border: '1px solid var(--line)', borderRadius: 6,
      }}>
        <CopyValueRow label="מספר זהות" value={client.idNumber} />
        <CopyValueRow label="שם העסק" value={client.businessName} />
      </div>

      <div style={{ fontWeight: 600, color: 'var(--ink-2)', marginBottom: '.3rem' }}>
        מה עושים בפייפרלס · {doneCount} מתוך {items.length}
      </div>
      <div style={{ display: 'grid', gap: '.25rem' }}>
        {items.map(item => {
          // ‼ הסעיף החמישי אינו צ'קבוקס: הוא נשען על חותמת בשלב אחר, ואי אפשר
          // לבטל כרטיס שהלקוח כבר הזין. לכן פעולה מפורשת אחת, וסימון לקריאה
          // בלבד — ולא פקד שנראה כמו שאר השורות אבל מתנהג אחרת בלחיצה חוזרת.
          if (item.key === CARD_ENTERED_KEY) {
            const waiting = !item.done && !cardStepReady;
            return (
              <div key={item.key} style={{
                display: 'flex', gap: '.45rem', alignItems: 'flex-start',
                color: waiting ? 'var(--ink-4)' : item.done ? 'var(--ink-3)' : 'var(--ink-1)',
              }}>
                <input type="checkbox" checked={item.done} disabled readOnly
                  style={{ marginTop: 2 }}
                  title={item.done ? 'סומן על ידך - אי אפשר לבטל כרטיס שהוזן' : undefined} />
                <span style={{
                  display: 'flex', gap: '.45rem', alignItems: 'baseline', flexWrap: 'wrap',
                  textDecoration: item.done ? 'line-through' : 'none',
                }}>
                  {item.label}
                  {waiting && <span style={{ color: 'var(--ink-4)' }}>· אחרי ארבעת הסעיפים שמעל</span>}
                  {!item.done && cardStepReady && (
                    <button type="button" className="btn btn-sm btn-primary" disabled={busy}
                      title="לסמן אחרי שראית בפייפרלס שהלקוח הזין כרטיס - זה מה שמשחרר את הרשאת התשלום"
                      onClick={onCardEntered}>סמן כבוצע</button>
                  )}
                </span>
              </div>
            );
          }

          // ‼ הרביעי חסום עד שהשלושה נעשו: בפועל אי אפשר לעדכן את הריטיינר
          // לפני שהלקוח הוקם ונמשך, וצ'קבוקס שנראה זמין הוא הזמנה לטעות.
          const blocked = item.key === RETAINER_CARD_KEY && !setupReady && !item.done;
          return (
            <label key={item.key} style={{
              display: 'flex', gap: '.45rem', alignItems: 'flex-start',
              cursor: busy || blocked ? 'default' : 'pointer',
              color: blocked ? 'var(--ink-4)' : item.done ? 'var(--ink-3)' : 'var(--ink-1)',
            }} title={blocked ? 'אפשר רק אחרי שלושת הסעיפים שמעל' : undefined}>
              <input type="checkbox" checked={item.done} disabled={busy || blocked}
                onChange={() => toggle(item)} style={{ marginTop: 2 }} />
              <span style={{ textDecoration: item.done ? 'line-through' : 'none' }}>
                {item.label}
                {blocked && <span style={{ color: 'var(--ink-4)' }}> · אחרי שלושת הסעיפים שמעל</span>}
              </span>
            </label>
          );
        })}
      </div>

      {/* ‼ עדכון הריטיינר לכרטיס הוא מה שגורם לפייפרלס לבקש מהלקוח את הכרטיס,
          והכרטיס שהוזן הוא מה שסוגר את ההקמה. לכן שורת ההמשך אומרת על מה
          ממתינים כרגע — ולא "אחרי «סיימתי»", שכבר אינו הפעולה שסוגרת כאן. */}
      <div style={{ marginTop: '.45rem' }}>
        {!cardItem
          ? 'אחרי «סיימתי» נפתח כרטיס התשלום החודשי, ושם ממשיכים: הכרטיס שהלקוח מזין, והחיוב עצמו.'
          : cardItem.done
            ? 'הכרטיס הוזן וההקמה בפייפרלס הושלמה. ההמשך בכרטיס התשלום החודשי - החיוב עצמו.'
            : items.find(i => i.key === RETAINER_CARD_KEY)?.done
              ? 'הריטיינר עודכן לכרטיס - מכאן פייפרלס מבקשת מהלקוח את הכרטיס, והוא רואה על כך הנחיה בדף האישי. כשתראה שהכרטיס הוזן - לסמן כאן, וכרטיס התשלום החודשי ייפתח.'
              : 'אחרי עדכון הריטיינר פייפרלס תבקש מהלקוח את הכרטיס. הסימון שהוא הוזן הוא מה שיפתח את כרטיס התשלום החודשי.'}
      </div>

      {softwareName && (
        <div style={{ marginTop: '.3rem' }}>
          ההיסטוריה מ{softwareName} מיובאת בשלב נפרד ואינה מעכבת.
        </div>
      )}
    </div>
  );
}

// ═══════════════ כרטיס הרשאת התשלום ══════════════════════════════════════
// ‼ הסכום וחודש החיוב מוצגים גם כשהשלב נעול: זה מה שעומד על הפרק, והרו"ח
// צריך לראות אותו כדי להבין למה כדאי לו לזרז את הפייפרלס.
// ‼ אין כאן שום קישור לשליחה ואין מייל (הכרעת גיא §8): ההרשאה נוצרת בתוך
// חשבון הפייפרלס של הלקוח, לא דרך קישור שהמערכת שולחת.
//
// ‼ שלוש נקודות זמן ולא אחת (2026-08-17). עד כה השלב נסגר ב"הלקוח השלים",
// והחיוב עצמו — הדבר היחיד שבאמת מסיים את הקליטה — לא היה מיוצג בשום מקום:
//   1. authorizationCreatedAt — גיא יצר את ההרשאה בפייפרלס. **רק מכאן**
//      הלקוח רואה בדף האישי שפייפרלס תבקש ממנו כרטיס, ומה זה חיוב ה-₪1.
//   2. cardEnteredAt          — גיא ראה בפייפרלס שהכרטיס הוזן. הלקוח אינו
//      מאשר את זה בעצמו: אין לנו איך לאמת, והצהרה בלי כיסוי גרועה מכלום.
//   3. retainerChargedAt      — הריטיינר חויב. זה, ורק זה, סוגר את השלב.
// אף אחת מהן אינה נקראת מפייפרלס — אין אינטגרציה, וכולן הצהרות של גיא.

interface RetainerCardProps {
  step: OnboardingStep;
  stepById: Map<string, OnboardingStep>;
  /** שם העסק שהלקוח הזין — מה שמאשרים בפייפרלס, ולכן מוצג גם כאן. */
  client: Client;
  /** מקור האמת לסכום וחודש החיוב — לא העותק שנשמר בבקשה, שיכול להימחק. */
  engagement?: Engagement;
  /** ההצעה שאושרה — ממנה נגזר גם המע"מ, לפי סימון המע"מ של כל שורה. */
  quotation?: Quotation;
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
  const cardEnteredAt = String(step.payload.cardEnteredAt ?? '');
  const retainerChargedAt = String(step.payload.retainerChargedAt ?? '');

  const locked = step.status === 'locked';
  // ‼ הסכום מחושב מההצעה שאושרה בכל רינדור — כולל מע"מ לפי סימון המע"מ של
  // כל שורה חודשית. העותק שנשמר בבקשה (payload.amount) הוא נסיגה אחרונה
  // בלבד, לתיקים ישנים בלי הצעה טעונה.
  const monthlyFromQuote = useMemo(() => {
    if (!p.quotation) return undefined;
    const snap = p.quotation.snapshot;
    const items = (snap?.items ?? p.quotation.items ?? []) as QuotationItem[];
    const totals = calcTotals(items, snap?.vatRate ?? p.quotation.vatRate).monthly;
    return totals.beforeVat > 0 ? totals : undefined;
  }, [p.quotation]);
  const payloadAmount = typeof step.payload.amount === 'number' ? step.payload.amount : undefined;
  const beforeVat = monthlyFromQuote?.beforeVat ?? p.engagement?.monthlyTotal ?? payloadAmount;
  const withVat = monthlyFromQuote?.withVat;
  const month = monthLabel(p.engagement?.billingStartMonth
    ?? (step.payload.billingStartMonth as string | undefined));
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

      {/* ‼ שם העסק והת״ז כאן ולא רק בכרטיס החיבור: זה מה שמאשרים בפייפרלס
          בזמן שמעדכנים את הריטיינר, ואין סיבה לחזור אחורה כדי לקרוא אותם.
          אותו מקור בדיוק — הכרטיס של הלקוח. */}
      <div style={{
        display: 'grid', gap: '.2rem', marginTop: '.45rem',
        padding: '.4rem .55rem', border: '1px solid var(--line)', borderRadius: 6,
      }}>
        <CopyValueRow label="מספר זהות" value={p.client.idNumber} />
        <CopyValueRow label="שם העסק" value={p.client.businessName} />
      </div>

      <div style={{ display: 'flex', gap: '1.4rem', flexWrap: 'wrap', marginTop: '.45rem' }}>
        <div>
          <div style={{ fontSize: 'var(--fs-12)', color: 'var(--ink-3)' }}>שכר טרחה חודשי (לפני מע"מ)</div>
          <div style={{ fontSize: 'var(--fs-15)', fontWeight: 600 }}>{beforeVat ? formatILS(beforeVat) : '-'}</div>
        </div>
        <div>
          <div style={{ fontSize: 'var(--fs-12)', color: 'var(--ink-3)' }}>כולל מע"מ - לחיוב בפועל</div>
          <div style={{ fontSize: 'var(--fs-15)', fontWeight: 600 }}>{withVat ? formatILS(withVat) : '-'}</div>
        </div>
        <div>
          <div style={{ fontSize: 'var(--fs-12)', color: 'var(--ink-3)' }}>חודש חיוב ראשון</div>
          <div style={{ fontSize: 'var(--fs-15)', fontWeight: 600 }}>{month || '-'}</div>
        </div>
      </div>

      {manual ? (
        <>
          <div style={cardNote}>
            הלקוח לא עובד עם פייפרלס - אין כאן הרשאה דיגיטלית ואין מייל ללקוח.
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
                  note: `הסדר גבייה הוקם - ${method}`,
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
          {/* ‼ שורת מצב אחת שאומרת איפה עומדים מבין שלוש הנקודות, ולא שלושה
              משפטים שצריך לקרוא כדי להבין מה נשאר.
              ‼ מאז שהכרטיס שהוזן הוא הסעיף החמישי ברשימת החיבור, שלב זה נפתח
              כשהחותמות הראשונות כבר קיימות — ולכן שני המצבים הראשונים כאן
              נותרו בשביל תיקים שנסגרו לפני כן, ובשביל מסלולים שדילגו על
              רשימת החיבור (העברה ממייצג קודם, "אין צורך בהרשמה"). הם מסלול
              תיקון, לא הדרך הרגילה — ואסור להסיר אותם. */}
          <div style={cardNote}>
            {!authorizationCreatedAt
              ? <>הלקוח מחובר לפייפרלס. מה שפותח את בקשת הכרטיס אצלו הוא עדכון הריטיינר לתשלום בכרטיס אשראי - הסעיף הרביעי ברשימת החיבור, ואפשר לסמן אותו גם כאן.</>
              : !cardEnteredAt
                ? <>הריטיינר עודכן בפייפרלס לתשלום בכרטיס אשראי ({formatDate(authorizationCreatedAt, 'list')}). הלקוח רואה בדף האישי שפייפרלס תבקש ממנו כרטיס, וגם שייתכן חיוב אימות בסך 1 ₪. כשתראה בפייפרלס שהכרטיס הוזן - לסמן כאן.</>
                : !retainerChargedAt
                  ? <>הכרטיס הוזן {formatDate(cardEnteredAt, 'list')}. נשאר לחייב את הריטיינר שסוכם - ואז לסמן כאן. זה מה שסוגר את השלב.</>
                  : <>הריטיינר חויב {formatDate(retainerChargedAt, 'list')}.</>}
          </div>

          {isStepOpen(step.status) && (
            <div style={{ display: 'flex', gap: '.35rem', flexWrap: 'wrap', marginTop: '.55rem', alignItems: 'center' }}>
              {!authorizationCreatedAt && (
                <button type="button" className="btn btn-sm btn-primary" disabled={busy}
                  title="אותה פעולה בדיוק כמו הסעיף האחרון ברשימת החיבור"
                  onClick={() => p.onRun('note', {
                    authorizationCreatedAt: new Date().toISOString(),
                    note: 'הריטיינר עודכן בפייפרלס לתשלום בכרטיס אשראי - הלקוח יתבקש להזין כרטיס',
                  })}>
                  עדכנתי את הריטיינר לכרטיס אשראי
                </button>
              )}

              {/* ‼ "ראיתי בפייפרלס" ולא "הלקוח אישר": הלקוח אינו מאשר כאן
                  שהזין כרטיס, ולכן מה שנרשם הוא מה שגיא ראה בפועל. */}
              {authorizationCreatedAt && !cardEnteredAt && (
                <button type="button" className="btn btn-sm btn-primary" disabled={busy}
                  title="לסמן אחרי שראית בפייפרלס שהכרטיס של הלקוח הוזן"
                  onClick={() => p.onRun('note', { cardEnteredAt: new Date().toISOString(), note: 'הכרטיס של הלקוח הוזן בפייפרלס' })}>
                  הכרטיס הוזן
                </button>
              )}

              {/* ‼ הפעולה שסוגרת את השלב היא החיוב עצמו — לא ההרשאה ולא
                  הכרטיס. עד היום הקליטה נסגרה בלי שאיש אמר שהכסף נגבה. */}
              {cardEnteredAt && (
                <button type="button" className="btn btn-sm btn-primary" disabled={busy}
                  onClick={() => p.onRun('complete', {
                    completionMethod: 'manual',
                    retainerChargedAt: new Date().toISOString(),
                    note: 'הריטיינר חויב',
                  })}>הריטיינר חויב</button>
              )}
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
  // הרו"ח הקודם השלים את העבודה שהחזיקה אותו כראשי — נכתב מכרטיס המכתב.
  const ready = !!step.payload.upgradeReadyAt;

  return (
    <StepCardShell step={step} stepById={stepById} highlight={highlight} menu={p.menu}
      danger={step.needsAttention}>
      {step.needsAttention && (
        <div style={{ marginTop: '.35rem', fontSize: 'var(--fs-13)', color: 'var(--err)', fontWeight: 600 }}>
          {ready ? 'אפשר לעבור לייצוג ראשי - הרו״ח הקודם השלים את העבודה שנותרה אצלו' : 'הגיע מועד התזכורת'}
        </div>
      )}

      {secondary.length > 0 && (
        <div style={{ marginTop: '.45rem', fontSize: 'var(--fs-13)', color: 'var(--ink-2)' }}>
          רשום כמייצג משני ב: <strong>{secondary.join(', ')}</strong>
        </div>
      )}

      <div style={cardNote}>
        {ready
          ? 'העבודה שנותרה אצל הרו״ח הקודם הושלמה. לשנות את רמת הייצוג בכרטיס ל״מייצג ראשי״ - והשלב ייסגר מעצמו.'
          : 'הרו״ח הקודם עדיין רשום כמייצג הראשי. כשהוא ישוחרר - לשנות את רמת הייצוג בכרטיס ל״מייצג ראשי״, והשלב ייסגר מעצמו.'}
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
            : 'הייצוג הושלם. הפירוט המלא - במרכז הייצוג.'}
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

function IntakeStepCard({ step, stepById, busy, highlight, onRun, menu }: {
  step: OnboardingStep;
  stepById: Map<string, OnboardingStep>;
  busy: boolean;
  highlight: boolean;
  onRun: (action: string, payload?: Record<string, unknown>) => void;
  menu: React.ReactNode;
}) {
  const open = isStepOpen(step.status);
  const sent = step.status === 'waiting_client';
  return (
    <StepCardShell step={step} stepById={stepById} highlight={highlight} menu={menu}>
      <div style={cardNote}>
        {sent
          ? 'השאלון פתוח ללקוח בדף האישי. ברגע שיסיים למלא - השלב ייסגר מעצמו והתשובות יופיעו בכרטיס.'
          : 'שאלון שממפה את מצב המס של הלקוח: מצב משפחתי וילדים, מקורות הכנסה, הפקדות לפנסיה וקרן השתלמות, ונכסים להצהרת הון. מה שיענה כאן לא ייאסף שוב בדוח השנתי.'}
      </div>

      {/* ‼ "הכן מייל שאלון" הוסר (2026-08-16). השאלון הוא בקשה בדף האישי כמו
          כל בקשה אחרת, והוא נחשף בעדכון הדף — לא במייל ייעודי שמתחרה בו. */}
      {open && sent && (
        <div style={{ display: 'flex', gap: '.35rem', flexWrap: 'wrap', marginTop: '.55rem', alignItems: 'center' }}>
          <button type="button" className="btn btn-sm btn-secondary" disabled={busy}
            onClick={() => onRun('complete', { completionMethod: 'manual', note: 'סומן ידנית כמולא' })}>
            הלקוח מילא
          </button>
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
          <>נאספו בתהליך הייצוג - נשאר לוודא שהם קריאים ותואמים לפרטי הלקוח:</>
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
            <li key={d.id}>{DOC_CATEGORY_LABELS[d.category]} - {d.name}</li>
          ))}
        </ul>
      )}

      {open && (
        <div style={{ display: 'flex', gap: '.35rem', flexWrap: 'wrap', marginTop: '.55rem' }}>
          <button type="button" className="btn btn-sm btn-primary" disabled={busy}
            onClick={() => onRun('complete', { completionMethod: 'manual', note: 'הזיהוי נבדק ואושר' })}>
            בדקתי - מאושר
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

/**
 * חלון ההתייחסות עבר בשקט — ואיש לא הודיע על מניעה.
 * ‼ תצוגה בלבד, נגזרת מהתאריך ומהיעדר תגובה. אינה סוגרת את השלב ואינה מחליפה
 * החלטה של הרו"ח — היא רק אומרת בקול את מה שכללי הסגירה כבר יודעים
 * (isStepSatisfiedForClose): מכתב שחלון ההתייחסות שלו עבר נחשב מסופק.
 */
function objectionWindowPassed(step: OnboardingStep): boolean {
  const due = step.payload.objectionDueDate;
  if (!due || !step.payload.releaseSentAt) return false;
  if (step.payload.prevAccountantResponseNote) return false;
  const end = new Date(due);
  if (Number.isNaN(end.getTime())) return false;
  return end < new Date(new Date().toDateString());
}

/** תרגום הסטטוס הגנרי לשפה של מסלול השחרור. */
function releaseStatusLabel(step: OnboardingStep, hasEmail: boolean): string {
  const sentAt = step.payload.releaseSentAt;
  const responded = !!step.payload.prevAccountantResponseNote || !!step.payload.prevAccountantSignedAt;
  switch (step.status) {
    case 'pending':
    case 'in_progress':    return sentAt ? 'נשלח' : (hasEmail ? 'טיוטה · טרם נשלח' : 'טיוטה');
    case 'waiting_client':
      if (responded) return 'התקבלה תגובה';
      return objectionWindowPassed(step)
        ? 'עבר חלון ההתייחסות ללא מניעה'
        : 'נשלח · ממתין לרו״ח הקודם';
    case 'completed':      return 'התקבלה תגובה';
    case 'verified':       return 'הושלם';
    default:               return STEP_STATUS_LABELS[step.status];
  }
}

/** שורה אחת ברשימת "מה אנחנו מבקשים" — לפני השליחה ואחריה. */
interface HandoffItem {
  key: string;
  label: string;
  done: boolean;
  optional?: boolean;
  uploads: number;
  addedAfterSend?: boolean;
  notifiedAt?: string;
  /** חשוב במיוחד — ראשון ברשימה, ותג מאופק. אינו מחליש את השאר. */
  priority?: boolean;
  /** סומן על סמך הצהרת הרו"ח הקודם ("מה כלל המשלוח") ולא בהעלאה שקושרה לפריט. */
  declaredByRecipient?: boolean;
}

interface ReleaseCardProps {
  step: OnboardingStep;
  /** שלב קבלת החומרים — אחרי השליחה הצ'קליסט שלו הוא רשימת הבקשות. */
  materialsStep?: OnboardingStep;
  stepById: Map<string, OnboardingStep>;
  clientId: string;
  client: Client;
  onClientPersisted: (c: Client) => void;
  busy: boolean;
  highlight: boolean;
  prevAccountant?: { name?: string; email?: string; phone?: string };
  blockNote?: string;
  onPrepare?: (mode: 'letter' | 'follow_up') => void;
  onBlock: () => void;
  onRun: (action: string, payload?: Record<string, unknown>) => void;
  advance: (stepId: string, action: string, payload?: Record<string, unknown>) => Promise<AdvanceResult>;
  /** שלב "פרטי הרו״ח הקודם" הפתוח — נסגר ברגע שהפרטים הוזנו כאן. */
  detailsStep?: OnboardingStep;
  refresh?: () => void;
  onOpenDocuments?: (folderId?: string) => void;
  menu: React.ReactNode;
}

/**
 * מסלול הרו"ח הקודם — כרטיס אחד: מי, מה מבקשים, מה נשלח, מה חזר.
 * ‼ אין כאן מכונת מצבים שנייה: טיוטה/נשלח/התקבלה תגובה/הושלם הם הסטטוסים
 * הגנריים של השלב, ו"דורש טיפול" הוא needs_attention. מה שנוסף הוא שהמידע
 * שהיה פזור (פרטים בכרטיס, רשימה בתוך חלון, ראיות ביומן) נראה במקום אחד.
 */
function ReleaseStepCard(p: ReleaseCardProps) {
  const { step, materialsStep, stepById, busy, highlight, prevAccountant, client } = p;
  const email = (prevAccountant?.email ?? '').trim();
  const open = isStepOpen(step.status);
  const sentAt = step.payload.releaseSentAt;
  const sent = !!sentAt;
  const locked = step.status === 'locked';
  const closed = step.status === 'completed' || step.status === 'verified';
  // ‼ עריכת המכתב פתוחה תמיד — גם בלי אימייל וגם כשהשלב נעול. רק השליחה
  // עצמה דורשת כתובת (הכרעת גיא 2026-08-18: "במקביל אני יכול כבר לערוך").
  const canPrepare = !!p.onPrepare;
  const detailsOpen = !!p.detailsStep && isStepOpen(p.detailsStep.status);
  /**
   * ‼ המכתב נסגר (נחתם) אבל החומרים עדיין נאספים — וזה בדיוק הזמן שבו מתברר
   * שחסר עוד משהו. הרשימה נשארת פתוחה לעריכה כל עוד מעקב החומרים פתוח.
   */
  const materialsOpen = !!materialsStep && isStepOpen(materialsStep.status);
  const itemsEditable = !closed || materialsOpen;

  const [editingDetails, setEditingDetails] = useState(false);
  const [form, setForm] = useState({
    name: prevAccountant?.name ?? '', email: prevAccountant?.email ?? '', phone: prevAccountant?.phone ?? '',
  });
  const [saving, setSaving] = useState(false);
  /** קטע החומרים: המסמכים ופרטי המכתב — שניהם סגורים כברירת מחדל. */
  const [docsOpen, setDocsOpen] = useState(false);
  const [letterInfoOpen, setLetterInfoOpen] = useState(false);
  const [cardError, setCardError] = useState<string | null>(null);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [draftLabel, setDraftLabel] = useState('');
  const [adding, setAdding] = useState(false);
  const [newLabel, setNewLabel] = useState('');

  // ── רשימת הבקשות ─────────────────────────────────────────────────────────
  // לפני השליחה: הטיוטה ששמורה על השלב. אחרי: הצ'קליסט של קבלת החומרים —
  // שהוא בדיוק מה שנשלח, וגם מה שהרו"ח הקודם רואה בדף שלו.
  const draftMaterials = useMemo(
    () => materialsFromStored(
      (step.payload.releaseDraft as { materials?: unknown } | undefined)?.materials)
      ?? RELEASE_MATERIALS.map(m => ({ ...m })),
    [step.payload.releaseDraft]);

  // ‼ חשובים ראשונים — אותו סדר בדיוק שהנמען רואה במייל ובדף (השרת ממיין
  // באותו כלל). שלושה מקומות שמציגים סדר שונה היו שלושה מקורות אמת.
  const items: HandoffItem[] = useMemo(() => {
    const rows: HandoffItem[] = (sent && materialsStep)
      ? (materialsStep.payload.checklist ?? []).map(i => ({
          key: i.key,
          label: i.label,
          done: !!i.done,
          optional: i.optional || isOptionalMaterialKey(i.key),
          uploads: (i.documentIds?.length ?? 0) || (i.documentId ? 1 : 0),
          addedAfterSend: i.addedAfterSend,
          notifiedAt: typeof i.notifiedAt === 'string' ? i.notifiedAt : undefined,
          priority: i.priority,
          declaredByRecipient: i.declaredByRecipient,
        }))
      : draftMaterials.filter(m => m.checked).map(m => ({
          key: m.key, label: m.label, done: false,
          optional: m.optional || isOptionalMaterialKey(m.key), uploads: 0,
          priority: m.priority,
        }));
    return byPriorityFirst(rows);
  }, [sent, materialsStep, draftMaterials]);

  const required = items.filter(i => !i.optional);
  const receivedCount = required.filter(i => i.done).length;
  const pendingFollowUp = items.filter(i => i.addedAfterSend && !i.notifiedAt);
  /** קבצים שהרו"ח הקודם שלח בלי לשייך לפריט — הם לא סוגרים כלום מעצמם. */
  const bulkUploads = (materialsStep?.payload.bulkUploads ?? []).length;
  /** מה שהגיע ועוד לא נפתח — אותו חישוב שמזין את המונה בסרגל העליון. */
  const newUploads = unseenUploads(materialsStep);
  /**
   * ‼ שתי הרשימות הן אותם מסמכים בתיק — ההבדל הוא רק אם הרו"ח הקודם הוריד
   * אותם מהרשימה שלו (מיגרציה 119). שתיהן חיות בתיקייה אחת (מיגרציה 120).
   */
  const receivedDocs = materialsStep?.payload.bulkUploads ?? [];
  const removedDocs = materialsStep?.payload.removedUploads ?? [];
  const hasMaterialDocs = receivedDocs.length > 0 || removedDocs.length > 0;

  /**
   * מצב אחד לקטע החומרים, ומתוכו נגזרים גם הניסוח וגם הפעולה.
   * ‼ "הגיע הכול" אינו רק מעקב סגור: גם כשכל הפריטים המבוקשים סומנו, אין מה
   * לחכות לו. שני המסלולים מגיעים לאותה שורת מצב, אחרת אותו מצב עסקי היה
   * נראה אחרת לפי איך הגיע לשם.
   */
  const openRequired = Math.max(0, required.length - receivedCount);
  const materialsClosed = !!materialsStep && !materialsOpen && materialsStep.status !== 'cancelled';
  const matState: 'done' | 'partial' | 'wait' =
    materialsClosed || (required.length > 0 && openRequired === 0) ? 'done'
      : (bulkUploads > 0 || receivedCount > 0) ? 'partial'
        : 'wait';
  const matStatusText =
    matState === 'done' ? '✓ החומרים הגיעו'
      : matState === 'partial' ? 'התקבל חלק'
        : 'ממתין לחומרים';
  /**
   * ‼ עובדה אחת תומכת, לא שלוש. מה שפתוח כבר כתוב בכותרת "מה אנחנו מבקשים
   * — N מתוך M התקבלו" שממש מעל, וחזרה עליו כאן היא בדיוק הכפילות שהפכה את
   * הקטע ליומן. כשיש חדשים — הם העובדה; הסך הכול מצטרף רק אם הוא גדול מהם.
   */
  const matSubText = matState === 'wait' ? ''
    : newUploads.length > 0
      ? (bulkUploads > newUploads.length ? `${bulkUploads} בסך הכול` : '')
      : bulkUploads === 0 ? ''
        : bulkUploads === 1 ? 'קובץ אחד התקבל' : `${bulkUploads} קבצים התקבלו`;

  // ── חלוקת הטיפול והעבודות הפתוחות ──────────────────────────────────────
  // נכתבות בשליחת המכתב (מהחלון); כאן רק מציגים ומסמנים "הוגש". אין להן
  // סטטוס משלהן — עבודה פתוחה היא פריט עם filedAt ריק, ותו לא.
  const lastPeriodPrev = typeof step.payload.lastPeriodPrev === 'string' ? step.payload.lastPeriodPrev : '';
  const outstandingItems = useMemo(
    () => outstandingFromStored(step.payload.outstandingItems) ?? [],
    [step.payload.outstandingItems]);
  const blockingLeft = unfiledBlocking(outstandingItems);

  async function persistItems(next: HandoffItem[]) {
    setCardError(null);
    setSaving(true);
    if (sent && materialsStep) {
      const prev = new Map((materialsStep.payload.checklist ?? []).map(i => [i.key, i]));
      const checklist = next.map(i => ({
        ...(prev.get(i.key) ?? {}),
        key: i.key, label: i.label, done: i.done,
        ...(i.optional ? { optional: true } : {}),
        ...(i.addedAfterSend ? { addedAfterSend: true } : {}),
        ...(i.notifiedAt ? { notifiedAt: i.notifiedAt } : {}),
        priority: i.priority || undefined,
        // ‼ סימון שהמשרד תיקן ידנית מפסיק להיות "הצהרה של הנמען": הדגל יורד
        // כדי שהכרטיס לא ימשיך לטעון שהרו"ח הקודם אמר משהו שגיא כבר שינה.
        declaredByRecipient: i.declaredByRecipient || undefined,
        ...(i.done ? {} : { doneAt: undefined, documentId: undefined }),
      }));
      const res = await p.advance(materialsStep.id, 'note', { checklist });
      if (!res.ok) setCardError(res.message ?? 'השמירה נכשלה.');
    } else {
      // ‼ מיזוג לתוך הטיוטה הקיימת ולא דריסה שלה: הנוסח, התאריך והעותק
      // ללקוח חיים באותו אובייקט, ושמירה חלקית הייתה מוחקת אותם.
      const stored = (step.payload.releaseDraft ?? {}) as Record<string, unknown>;
      const byKey = new Map(next.map(i => [i.key, i]));
      // ‼ priority נלקח מהשורה שנערכה ולא מהטיוטה השמורה: אחרת סימון "חשוב"
      // לפני השליחה היה נבלע כאן בשקט (הפריט נשמר, הדגל נעלם).
      const kept = draftMaterials
        .filter(m => !m.checked || byKey.has(m.key))
        .map(m => (byKey.has(m.key)
          ? {
              ...m, label: byKey.get(m.key)!.label, checked: true,
              ...(byKey.get(m.key)!.priority ? { priority: true } : { priority: undefined }),
            }
          : m));
      const added = next
        .filter(i => !draftMaterials.some(m => m.key === i.key))
        .map(i => ({
          key: i.key, label: i.label, checked: true,
          ...(i.optional ? { optional: true } : {}),
          ...(i.priority ? { priority: true } : {}),
        }));
      const materials = [...kept, ...added];
      const res = await p.advance(step.id, 'note', { releaseDraft: { ...stored, materials } });
      if (!res.ok) setCardError(res.message ?? 'השמירה נכשלה.');
    }
    setSaving(false);
  }

  function addItem() {
    const label = newLabel.trim();
    if (!label) { setAdding(false); setNewLabel(''); return; }
    const key = `custom_${Date.now().toString(36)}`;
    void persistItems([...items, {
      key, label, done: false, uploads: 0, ...(sent ? { addedAfterSend: true } : {}),
    }]);
    setNewLabel('');
    setAdding(false);
  }

  /**
   * ‼ הוספה מהקטלוג. עד כה "הוסף פריט" היה שדה טקסט חופשי בלבד — פריט
   * שהקטלוג מכיר ("דוח שנתי אחרון") לא היה ניתן לבחירה כאן, והדרך היחידה
   * להוסיף אותו הייתה להקליד אותו מחדש. זה גם יצר לו מפתח custom_* במקום
   * last_return, כך שהוא מנותק מהקטלוג לכל אורך הדרך.
   */
  const catalogToAdd = RELEASE_MATERIALS.filter(m => !items.some(i => i.key === m.key));

  function addFromCatalog(m: { key: string; label: string; optional?: boolean }) {
    void persistItems([...items, {
      key: m.key, label: m.label, done: false, uploads: 0,
      ...(m.optional ? { optional: true } : {}),
      ...(sent ? { addedAfterSend: true } : {}),
    }]);
    setAdding(false);
    setNewLabel('');
  }

  function commitLabel(key: string) {
    const label = draftLabel.trim();
    setEditingKey(null);
    if (!label) return;
    if (items.find(i => i.key === key)?.label === label) return;
    void persistItems(items.map(i => (i.key === key ? { ...i, label } : i)));
  }

  // ── פרטי הרו"ח הקודם ─────────────────────────────────────────────────────
  // ‼ נשמרים על כרטיס הלקוח — אותם שדות בדיוק שהתיק מציג. אין כאן מקור שני.
  async function saveDetails() {
    setCardError(null);
    setSaving(true);
    const patch = {
      prev_accountant_name: form.name.trim() || null,
      prev_accountant_email: form.email.trim() || null,
      prev_accountant_phone: form.phone.trim() || null,
      has_previous_accountant: true,
    };
    const { data, error } = await supabase.from('clients').update(patch)
      .eq('id', p.clientId).select().single();
    setSaving(false);
    if (error || !data) { setCardError('שמירת הפרטים נכשלה.'); return; }
    p.onClientPersisted(clientFromDb(data));
    setEditingDetails(false);
    // הבקשה שביקשה מהלקוח את הפרטים סיימה את תפקידה — וסגירתה משחררת את
    // המכתב שתלוי בה. בלי זה הפרטים בכרטיס לא היו פותחים את השלב.
    if (patch.prev_accountant_email && p.detailsStep && isStepOpen(p.detailsStep.status)) {
      await p.advance(p.detailsStep.id, 'complete', {
        completionMethod: 'manual', note: 'פרטי הרו״ח הקודם הוזנו בכרטיס',
      });
    }
    p.refresh?.();
  }

  /**
   * "הדוח הוגש" / "ההצהרה הוגשה" — הפעולה היחידה של המשרד על עבודה פתוחה.
   * לחיצה אחת מפעילה את כל השרשרת הנגזרת (הכרעת גיא 2026-08-18):
   * 1. הפריט מסומן כהוגש, עם תאריך.
   * 2. נולד פריט החומר העתידי ("העתק הדוח כפי שהוגש") ברשימת המעקב — מסומן
   *    "נוסף אחרי השליחה", ולכן מייל ההמשך הקיים כבר יודע להציע אותו.
   * 3. כשלא נשארה עבודה חוסמת — שלב "שדרוג לייצוג ראשי" מקבל "דורש טיפול".
   * ‼ מה שלא קורה כאן: לא נשלח שום מייל, ולא משתנה רמת הייצוג בכרטיס —
   * שתי הפעולות האלה נשארות של הרו"ח (מדיניות המיילים + רישום ברשויות).
   */
  async function markOutstandingFiled(key: string) {
    const item = outstandingItems.find(i => i.key === key);
    if (!item || item.filedAt) return;
    setCardError(null);
    setSaving(true);
    const nowIso = new Date().toISOString();
    const next = outstandingItems.map(i => (i.key === key ? { ...i, filedAt: nowIso } : i));
    const verb = item.kind === 'capital_declaration' ? 'הוגשה' : item.kind === 'annual_report' ? 'הוגש' : 'הושלם';
    const res = await p.advance(step.id, 'note', {
      outstandingItems: next,
      note: `${item.label} - ${verb} על ידי הרו״ח הקודם`,
    });
    if (!res.ok) {
      setCardError(res.message ?? 'השמירה נכשלה.');
      setSaving(false);
      return;
    }

    // הפריט העתידי — רק לעבודה שמייצרת מסמך מוגש (דוח שנתי / הצהרת הון).
    if (isBlockingOutstanding(item) && materialsStep) {
      const dKey = deliverableKeyFor(item.key);
      const checklist = materialsStep.payload.checklist ?? [];
      if (!checklist.some(c => c.key === dKey)) {
        await p.advance(materialsStep.id, 'note', {
          checklist: [...checklist, {
            key: dKey,
            label: outstandingDeliverableLabel(item),
            done: false,
            // מופיע בדף הרו"ח הקודם ומסומן "טרם נמסר" עד שמייל ההמשך יוצא.
            addedAfterSend: true,
          }],
          note: `נוסף למעקב החומרים: ${outstandingDeliverableLabel(item)}`,
        });
      }
    }

    // כל העבודות החוסמות הושלמו ⇒ שלב השדרוג הקיים הופך לפעיל עכשיו.
    if (isBlockingOutstanding(item) && unfiledBlocking(next).length === 0) {
      const upgrade = [...p.stepById.values()].find(s =>
        s.stepType === 'representation_upgrade' && isStepOpen(s.status));
      if (upgrade) {
        await p.advance(upgrade.id, 'note', {
          upgradeReadyAt: nowIso,
          note: 'הרו״ח הקודם השלים את העבודה שנותרה אצלו - אפשר לעבור לייצוג ראשי',
        });
        await supabase.rpc('set_step_attention', { p_step_id: upgrade.id, p_on: true });
      }
    }
    setSaving(false);
    p.refresh?.();
  }

  const label13 = { fontSize: 'var(--fs-13)', color: 'var(--ink-2)' } as const;

  return (
    <StepCardShell step={step} stepById={stepById} highlight={highlight} menu={p.menu}
      statusLabel={releaseStatusLabel(step, email !== '')}
      always={
        <div className="ob-hand">
          {/* ── מי ── */}
          <div className="ob-hand-block">
            <div className="ob-hand-head">
              <span className="ob-hand-title">פרטי רו״ח קודם</span>
              {!editingDetails && itemsEditable && (
                <button type="button" className="ob-hand-link" disabled={saving}
                  onClick={() => {
                    setForm({
                      name: prevAccountant?.name ?? '', email: prevAccountant?.email ?? '',
                      phone: prevAccountant?.phone ?? '',
                    });
                    setEditingDetails(true);
                  }}>
                  {email ? 'עריכת פרטים' : 'הוספת פרטים'}
                </button>
              )}
            </div>
            {editingDetails ? (
              <div className="ob-hand-form">
                <input value={form.name} placeholder="שם הרו״ח או המשרד" disabled={saving}
                  aria-label="שם הרו״ח הקודם"
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
                <EmailInput value={form.email} placeholder="אימייל" disabled={saving}
                  aria-label="מייל הרו״ח הקודם"
                  onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
                <input value={form.phone} placeholder="טלפון" dir="ltr" disabled={saving}
                  aria-label="טלפון הרו״ח הקודם" style={{ textAlign: 'right' }}
                  onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
                <div style={{ display: 'flex', gap: '.35rem' }}>
                  <button type="button" className="btn btn-sm btn-primary" disabled={saving}
                    onClick={() => void saveDetails()}>{saving ? 'שומר…' : 'שמירה'}</button>
                  <button type="button" className="btn btn-sm btn-ghost" disabled={saving}
                    onClick={() => setEditingDetails(false)}>ביטול</button>
                </div>
              </div>
            ) : (
              <div className="ob-hand-contact">
                {prevAccountant?.name && <strong>{prevAccountant.name}</strong>}
                {email && <span dir="ltr">{email}</span>}
                {prevAccountant?.phone && <span dir="ltr">{prevAccountant.phone}</span>}
                {!prevAccountant?.name && !email && !prevAccountant?.phone && !detailsOpen && (
                  <span style={{ color: 'var(--err)' }}>עדיין אין פרטים - בלי אימייל אי אפשר לשלוח.</span>
                )}
              </div>
            )}
            {/* ‼ הבקשה מהלקוח אינה כרטיס נפרד — מצבה חי כאן, בתוך הבלוק.
                כשהיא פתוחה אין "חסר" ואין אדום: מישהו כבר עובד על זה. */}
            {detailsOpen && !email && !editingDetails && (
              <div style={{ fontSize: 'var(--fs-13)', color: 'var(--ink-3)' }}>
                ביקשנו מ{client.firstName || 'הלקוח'} את הפרטים - ממתין.
                אפשר לערוך את המכתב בינתיים; השליחה תיפתח כשיהיה אימייל.
              </div>
            )}
            {detailsOpen && email !== '' && !editingDetails && (
              <div style={{ fontSize: 'var(--fs-13)', color: 'var(--ink-3)' }}>
                {client.firstName || 'הלקוח'} התבקש/ה לאשר שהפרטים עדכניים.
              </div>
            )}
            {!email && !editingDetails && !detailsOpen && (prevAccountant?.name || prevAccountant?.phone) && (
              <div className="ob-hand-warn">חסר אימייל - בלעדיו אי אפשר לשלוח את המכתב.</div>
            )}
          </div>

          {/* ── חלוקת הטיפול ──
              מה שנשלח במכתב: גבול התקופה, העבודות הפתוחות והשלכת הייצוג.
              הפעולה היחידה כאן היא "הוגש" — כל השאר מידע נגזר. */}
          {sent && (lastPeriodPrev || outstandingItems.length > 0) && (
            <div className="ob-hand-block">
              <div className="ob-hand-head"><span className="ob-hand-title">חלוקת טיפול</span></div>
              {lastPeriodPrev && (
                <div className="ob-hand-contact" style={{ display: 'block' }}>
                  הקודם עד {periodLabel(lastPeriodPrev)} · אנחנו מ־{periodLabel(nextPeriod(lastPeriodPrev))}
                </div>
              )}
              {outstandingItems.length > 0 && (
                <ul className="ob-hand-list">
                  {outstandingItems.map(i => (
                    <li key={i.key} className={`ob-hand-item${i.filedAt ? ' is-done' : ''}`}>
                      {/* ‼ לא צ'קבוקס: ההגשה נסגרת בכפתור מפורש ("הדוח הוגש"),
                          כי היא גוררת מעבר ייצוג — לא סימון אגבי. נקודה = מצב. */}
                      <span className="ob-hand-mark" aria-hidden="true">{i.filedAt ? '✓' : '•'}</span>
                      <span className="ob-hand-label">{i.label}</span>
                      {i.filedAt ? (
                        <span className="ob-hand-tag">
                          {i.kind === 'capital_declaration' ? 'הוגשה' : i.kind === 'annual_report' ? 'הוגש' : 'הושלם'}
                          {' '}{formatDate(i.filedAt, 'list')}
                        </span>
                      ) : (
                        <>
                          <span className="ob-hand-tag">
                            {isBlockingOutstanding(i) ? 'ממתין להגשה' : 'בטיפולו'}
                          </span>
                          {itemsEditable && (
                            <button type="button" className="btn btn-sm btn-secondary"
                              disabled={saving || busy} style={{ flexShrink: 0 }}
                              onClick={() => void markOutstandingFiled(i.key)}>
                              {i.kind === 'annual_report' ? 'הדוח הוגש'
                                : i.kind === 'capital_declaration' ? 'ההצהרה הוגשה' : 'הושלם'}
                            </button>
                          )}
                        </>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {blockingLeft.length > 0 && (
                <div className="ob-hand-contact" style={{ display: 'block' }}>
                  ייצוג: מייצג משני עד השלמת {blockingLeft.map(i => i.label).join(' + ')}
                </div>
              )}
              {blockingLeft.length > 0 && (
                <div style={{ fontSize: 'var(--fs-12)', color: 'var(--ink-4)' }}>
                  לאחר ההגשה: {blockingLeft.map(i => outstandingDeliverableLabel(i)).join(' · ')} · מעבר לייצוג ראשי
                </div>
              )}
            </div>
          )}

          {/* ── מה מבקשים ── */}
          <div className="ob-hand-block">
            <div className="ob-hand-head">
              <span className="ob-hand-title">מה אנחנו מבקשים</span>
              <span className="ob-hand-count">
                {sent
                  ? `${receivedCount} מתוך ${required.length} התקבלו`
                  : `${items.length} פריטים`}
              </span>
            </div>
            <ul className="ob-hand-list">
              {items.map(i => (
                <li key={i.key} className={`ob-hand-item${i.done ? ' is-done' : ''}`}>
                  {/* ‼ הסימון לחיץ אחרי השליחה: חומרים מגיעים גם במייל ובוואטסאפ,
                      והצהרה של הרו"ח הקודם היא הצהרה — גיא חייב יכולת לתקן
                      לשני הכיוונים, בלי לחפש מסך אחר. */}
                  {sent && itemsEditable && !i.optional ? (
                    <button type="button" className="ob-hand-mark ob-hand-mark-btn" disabled={saving}
                      aria-label={i.done ? `סימון ${i.label} כלא התקבל` : `סימון ${i.label} כהתקבל`}
                      aria-pressed={i.done}
                      title={i.declaredByRecipient
                        ? 'סומן לפי הצהרת הרו״ח הקודם - לחיצה מבטלת'
                        : i.done ? 'התקבל - לחיצה מבטלת' : 'סימון כהתקבל'}
                      onClick={() => void persistItems(items.map(x =>
                        (x.key === i.key
                          ? { ...x, done: !x.done, declaredByRecipient: false }
                          : x)))}>
                      {i.done ? '✓' : '○'}
                    </button>
                  ) : i.optional ? (
                    /* ‼ הפריט הפתוח אינו צ'קבוקס: הוא הזמנה פתוחה שאינה
                       "מושלמת" לעולם ואינה נספרת. עיגול לצידו נראה כמו
                       סימון שלא עובד. רווח שומר על היישור, התג אומר "רשות". */
                    <span className="ob-hand-mark" aria-hidden="true" style={{ display: 'inline-block', width: 16 }} />
                  ) : (
                    <span className="ob-hand-mark" aria-hidden="true">{sent ? (i.done ? '✓' : '○') : '•'}</span>
                  )}
                  {editingKey === i.key ? (
                    <input
                      autoFocus value={draftLabel} aria-label="ניסוח הפריט" disabled={saving}
                      onChange={e => setDraftLabel(e.target.value)}
                      onBlur={() => commitLabel(i.key)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') commitLabel(i.key);
                        if (e.key === 'Escape') setEditingKey(null);
                      }} />
                  ) : (
                    <span className="ob-hand-label">{i.label || '-'}</span>
                  )}
                  {i.priority && <span className="ob-hand-tag is-priority">חשוב במיוחד</span>}
                  {i.optional && <span className="ob-hand-tag">רשות</span>}
                  {i.declaredByRecipient && <span className="ob-hand-tag">לפי הצהרתו</span>}
                  {i.addedAfterSend && !i.notifiedAt && <span className="ob-hand-tag is-new">נוסף - טרם נמסר</span>}
                  {i.optional && i.uploads > 0 && (
                    <span className="ob-hand-tag">{i.uploads} קבצים</span>
                  )}
                  {itemsEditable && editingKey !== i.key && (
                    <span className="ob-hand-rowbtns">
                      {!i.optional && (
                        <button type="button" disabled={saving}
                          aria-label={i.priority ? `ביטול חשוב: ${i.label}` : `סימון כחשוב: ${i.label}`}
                          aria-pressed={!!i.priority}
                          title={i.priority ? 'חשוב במיוחד - מופיע ראשון' : 'סימון כחשוב במיוחד'}
                          style={{ opacity: i.priority ? 1 : .45 }}
                          onClick={() => void persistItems(items.map(x =>
                            (x.key === i.key ? { ...x, priority: !x.priority } : x)))}>
                          {i.priority ? '★' : '☆'}
                        </button>
                      )}
                      <button type="button" aria-label={`עריכת ${i.label}`} title="עריכה" disabled={saving}
                        onClick={() => { setEditingKey(i.key); setDraftLabel(i.label); }}>✎</button>
                      <button type="button" aria-label={`הסרת ${i.label}`} title="הסרה" disabled={saving}
                        onClick={() => void persistItems(items.filter(x => x.key !== i.key))}>✕</button>
                    </span>
                  )}
                </li>
              ))}
              {items.length === 0 && (
                <li className="ob-hand-item"><span className="ob-hand-label" style={{ color: 'var(--ink-4)' }}>
                  אין פריטים ברשימה.
                </span></li>
              )}
            </ul>
            {itemsEditable && (adding ? (
              <div className="ob-hand-form" style={{ marginTop: '.35rem' }}>
                {/* ‼ הקטלוג קודם, טקסט חופשי אחריו. פריט מוכר נבחר בלחיצה
                    ושומר על המפתח שלו; ההקלדה נשארת למה שאין לו שם בקטלוג. */}
                {catalogToAdd.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.3rem' }}>
                    {catalogToAdd.map(m => (
                      <button key={m.key} type="button" className="btn btn-sm btn-secondary"
                        disabled={saving} onClick={() => addFromCatalog(m)}>
                        ＋ {m.label}
                      </button>
                    ))}
                  </div>
                )}
                <input autoFocus value={newLabel} placeholder="או פריט אחר - מה עוד מבקשים?" disabled={saving}
                  aria-label="פריט חדש"
                  onChange={e => setNewLabel(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') addItem();
                    if (e.key === 'Escape') { setAdding(false); setNewLabel(''); }
                  }} />
                <div style={{ display: 'flex', gap: '.35rem' }}>
                  <button type="button" className="btn btn-sm btn-primary" disabled={saving}
                    onClick={addItem}>הוספה</button>
                  <button type="button" className="btn btn-sm btn-ghost" disabled={saving}
                    onClick={() => { setAdding(false); setNewLabel(''); }}>ביטול</button>
                </div>
              </div>
            ) : (
              <button type="button" className="ob-hand-link" disabled={saving}
                onClick={() => setAdding(true)}>＋ הוסף פריט</button>
            ))}
            {sent && pendingFollowUp.length > 0 && (
              <div className="ob-hand-warn">
                {pendingFollowUp.length === 1
                  ? 'פריט אחד נוסף אחרי שהמכתב נשלח, והוא כבר מופיע בדף של הרו״ח הקודם'
                  : `${pendingFollowUp.length} פריטים נוספו אחרי שהמכתב נשלח, והם כבר מופיעים בדף של הרו״ח הקודם`}
                {' '}- כדאי לעדכן אותו במייל.
              </div>
            )}
          </div>

          {/* ── חומרים מהרו״ח הקודם ──────────────────────────────────────────
              ‼ מצב → פעולה → פרטים. הקטע הזה היה יומן: תאריך שליחה, כתובת,
              חלון התייחסות, מונה קבצים, סטטוס מעקב ומצב מסירה — שש שורות
              באותו משקל, ובלי לקרוא אותן אי אפשר היה לדעת אם הגיע משהו ומה
              ללחוץ. עכשיו: שורת מצב אחת, פעולה אחת, והשאר מאחורי "פרטים".
              ‼ מה שדורש טיפול (הערה מהרו״ח הקודם) נשאר גלוי — הוא לא פרט. */}
          {sent && (
            <div className="ob-hand-block">
              <div className="pa-mat-head">
                <span className="ob-hand-title">חומרים מהרו״ח הקודם</span>
                <span className={`pa-mat-status is-${matState}`}>{matStatusText}</span>
              </div>

              {(newUploads.length > 0 || matSubText) && (
                <div className="pa-mat-sub">
                  {newUploads.length > 0 && (
                    <strong>
                      {newUploads.length === 1 ? 'קובץ חדש' : `${newUploads.length} קבצים חדשים`}
                    </strong>
                  )}
                  {newUploads.length > 0 && matSubText && ' · '}
                  {matSubText}
                </div>
              )}

              <div className="pa-mat-actions">
                {hasMaterialDocs && (
                  <button type="button" className="btn btn-sm pa-mat-cta"
                    aria-expanded={docsOpen}
                    onClick={() => {
                      const next = !docsOpen;
                      setDocsOpen(next);
                      // ‼ פתיחה מכוונת היא נקודת ה"נצפה" של המונה בכותרת.
                      // מעבר מקרי במסך אינו מאפס אותו.
                      if (next && materialsStep && newUploads.length > 0) {
                        void p.advance(materialsStep.id, 'note', {
                          bulkSeenAt: new Date().toISOString(),
                        }).then(() => p.refresh?.());
                      }
                    }}>
                    {docsOpen ? 'הסתר מסמכים' : 'הצג מסמכים'}
                  </button>
                )}
                {/* ‼ תיקון טעות, לא פעולה בזרימה — ולכן נוכחות של קישור. */}
                {materialsStep && !materialsOpen && materialsStep.status !== 'cancelled' && (
                  <button type="button" className="pa-mat-quiet" disabled={busy || saving}
                    title="השלב חוזר להמתנה, בדיוק כפי שהיה לפני הסימון"
                    onClick={async () => {
                      setSaving(true);
                      await p.advance(materialsStep.id, 'wait_client', { ball: 'prev_accountant' });
                      setSaving(false);
                      p.refresh?.();
                    }}>
                    בטל סימון
                  </button>
                )}
                <button type="button" className="pa-mat-quiet" aria-expanded={letterInfoOpen}
                  onClick={() => setLetterInfoOpen(v => !v)}>
                  פרטים {letterInfoOpen ? '⌄' : '›'}
                </button>
              </div>

              {hasMaterialDocs && (
                <PrevAccountantDocsDrawer
                  clientId={p.clientId}
                  received={receivedDocs}
                  removed={removedDocs}
                  open={docsOpen}
                  onOpenFolder={p.onOpenDocuments
                    ? (folderId) => p.onOpenDocuments?.(folderId)
                    : undefined}
                />
              )}

              {/* ‼ הכל כאן הוא היסטוריה של המכתב, לא מצב החומרים. הוא נשמר
                  ונגיש, ואינו תופס את המסך כשאין בו צורך. */}
              {letterInfoOpen && (
                <div className="pa-mat-details">
                  <div>
                    נשלח {formatDate(sentAt!, 'list')}
                    {step.payload.releaseSentTo && <> · <span dir="ltr">{step.payload.releaseSentTo}</span></>}
                    {step.payload.objectionDueDate && !step.payload.prevAccountantSignedAt && (
                      <> · חלון התייחסות עד {formatDate(step.payload.objectionDueDate, 'list')}</>
                    )}
                  </div>
                  {/* ‼ לא מבקשים אישור, ולכן אין "טרם התקבל אישור" (הכרעת גיא
                      2026-08-18). חתימה שכבר נאספה ממשיכה להופיע — היסטוריה. */}
                  {step.payload.prevAccountantSignedAt && (
                    <div>
                      ✓ אישר/ה את ההעברה
                      {step.payload.prevAccountantSignerName && <> · {step.payload.prevAccountantSignerName}</>}
                      {' · '}{formatDate(step.payload.prevAccountantSignedAt, 'list')}
                    </div>
                  )}
                  {!step.payload.prevAccountantSignedAt && !step.payload.prevAccountantResponseNote && (
                    <div>
                      {objectionWindowPassed(step)
                        ? 'עבר חלון ההתייחסות ללא מניעה.'
                        : 'לא התקבלה מניעה. אם תגיע - היא תופיע כאן.'}
                    </div>
                  )}
                  <ReleaseDelivery clientId={p.clientId} />
                </div>
              )}
              {step.payload.prevAccountantResponseNote && (
                <div className={`ob-hand-note${step.payload.responseHandledAt ? '' : ' is-attention'}`}>
                  <div style={{ fontWeight: 700, marginBottom: '.15rem' }}>
                    הערה מהרו״ח הקודם
                    {step.payload.prevAccountantResponderName && ` · ${step.payload.prevAccountantResponderName}`}
                    {step.payload.prevAccountantRespondedAt &&
                      ` · ${formatDate(step.payload.prevAccountantRespondedAt, 'list')}`}
                  </div>
                  <div style={{ whiteSpace: 'pre-line' }}>{step.payload.prevAccountantResponseNote}</div>
                  {!step.payload.responseHandledAt && (
                    <button type="button" className="btn btn-sm btn-secondary" disabled={busy || saving}
                      style={{ marginTop: '.4rem' }}
                      onClick={async () => {
                        setSaving(true);
                        // ‼ שתי כתיבות שונות: הראיה נשמרת ב-payload דרך advance,
                        // וסימון "דורש טיפול" הוא עמודה — ולה יש RPC משלה.
                        await p.advance(step.id, 'note', {
                          responseHandledAt: new Date().toISOString(),
                          note: 'ההערה של הרו״ח הקודם טופלה',
                        });
                        await supabase.rpc('set_step_attention', { p_step_id: step.id, p_on: false });
                        setSaving(false);
                        p.refresh?.();
                      }}>
                      סמן שטופל
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {cardError && (
            <div className="ob-hand-warn" role="alert">{cardError}</div>
          )}

          {/* ── הפעולות ──────────────────────────────────────────────────────
              ‼ אחרי שהמכתב נסגר נשארת פעולה אחת בלבד — עדכון על מה שנוסף.
              "שלח שוב" על מכתב שכבר נחתם היה מבלבל, אבל בקשת המשך היא בדיוק
              מה שקורה בפועל בזמן איסוף החומרים. */}
          {(!closed || (pendingFollowUp.length > 0 && materialsOpen)) && (
            <div className="ob-hand-actions">
              {!closed && (
                <>
                  <button type="button" className="btn btn-sm btn-secondary" disabled={busy || !canPrepare}
                    onClick={() => p.onPrepare?.('letter')}>
                    תצוגה ועריכת המכתב
                  </button>
                  <button type="button" className="btn btn-sm btn-primary"
                    disabled={busy || !canPrepare || !email}
                    title={email ? undefined : 'השליחה תיפתח כשיהיה אימייל של הרו״ח הקודם'}
                    onClick={() => p.onPrepare?.('letter')}>
                    {sent ? 'שלח מכתב שוב' : 'שלח לרו״ח הקודם'}
                  </button>
                </>
              )}
              {sent && pendingFollowUp.length > 0 && (
                <button type="button" className="btn btn-sm btn-primary" disabled={busy || !canPrepare}
                  onClick={() => p.onPrepare?.('follow_up')}>
                  שלח עדכון לרו״ח הקודם
                </button>
              )}
            </div>
          )}
        </div>
      }>
      {locked && (
        <div style={{ ...cardNote, color: 'var(--warn)' }}>
          השליחה ממתינה לפרטי הרו״ח הקודם - המכתב והרשימה פתוחים לעריכה כבר עכשיו.
          {email && (
            <button type="button" className="btn btn-sm btn-secondary" style={{ marginInlineStart: '.4rem' }}
              disabled={busy || saving || !p.detailsStep}
              onClick={async () => {
                if (!p.detailsStep) return;
                setSaving(true);
                await p.advance(p.detailsStep.id, 'complete', {
                  completionMethod: 'manual', note: 'פרטי הרו״ח הקודם כבר בכרטיס',
                });
                setSaving(false);
                p.refresh?.();
              }}>
              הפרטים כבר כאן - פתח את המכתב
            </button>
          )}
        </div>
      )}

      {step.status === 'blocked' && p.blockNote && (
        <div style={{ marginTop: '.4rem', fontSize: 'var(--fs-13)', color: 'var(--err)' }}>
          חסום: {p.blockNote}
        </div>
      )}

      <InfoLines style={{ ...label13, marginTop: '.3rem' }} items={[
        'המכתב נשלח ידנית בלבד',
        `עותק שלו נשמר במסמכי ${client.firstName || 'הלקוח'} אחרי כל שליחה`,
      ]} />

      <div style={{ display: 'flex', gap: '.35rem', flexWrap: 'wrap', marginTop: '.55rem', alignItems: 'center' }}>
        {!sent && !locked && !closed && (
          <button type="button" className="btn btn-sm btn-secondary" disabled={busy}
            onClick={() => p.onRun('wait_client', { ball: 'prev_accountant', note: 'המכתב נשלח מחוץ למערכת' })}>
            סמן שנשלח
          </button>
        )}
        {sent && !closed && (
          <button type="button" className="btn btn-sm btn-secondary" disabled={busy}
            onClick={() => p.onRun('complete', { completionMethod: 'manual', note: 'התקבלה תשובה מהרו״ח הקודם' })}>
            סמן שהתקבלה תגובה
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
  /** ‼ אותו SentEmailViewer של לשונית הפעילות — לא תצוגה שנייה. */
  const [viewing, setViewing] = useState<EmailMessage | null>(null);
  const [fetching, setFetching] = useState(false);
  const [viewErr, setViewErr] = useState<string | null>(null);

  if (!last) return null;

  /** אין עותק שמור (מייל ישן) ⇒ נמשך מ-Resend ונפתח באותה לחיצה. */
  async function view() {
    if (last.html) { setViewing(last); return; }
    setFetching(true);
    setViewErr(null);
    try {
      const { data, error } = await supabase.functions.invoke('backfill-email-html', { body: { messageId: last.id } });
      if (error || !data?.ok || !data.html) setViewErr('העותק אינו זמין - אפשר לצפות מלשונית הפעילות.');
      else setViewing({ ...last, html: data.html });
    } catch {
      setViewErr('העותק אינו זמין - אפשר לצפות מלשונית הפעילות.');
    } finally { setFetching(false); }
  }

  return (
    <div style={{ ...cardNote, marginTop: '.4rem' }}>
      מכתב אחרון אל <span dir="ltr">{last.toEmail}</span> · {relativeTime(last.sentAt)} · {EMAIL_STATUS_LABEL[last.status] ?? last.status}
      {last.openedAt && <> · נפתח {relativeTime(last.openedAt)}</>}
      {' · '}
      <button type="button" className="pa-mat-quiet" disabled={fetching} onClick={() => void view()}>
        {fetching ? 'טוען…' : 'צפייה במייל'}
      </button>
      {viewErr && <span style={{ color: 'var(--warn)' }}> {viewErr}</span>}
      {viewing && <SentEmailViewer message={viewing} onClose={() => setViewing(null)} />}
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
        <div style={{ ...cardNote, marginTop: '.4rem' }}>הפריטים האלה נועדו לבירור בשיחה - לא בקשות ללקוח.</div>
      )}
    </StepCardShell>
  );
}

// ═══════════════ מעטפת משותפת לכרטיסים ═══════════════════════════════════

function StepCardShell({ step, stepById, highlight, danger, statusLabel, always, menu, children }: {
  step: OnboardingStep;
  stepById: Map<string, OnboardingStep>;
  highlight: boolean;
  danger?: boolean;
  /** ניסוח הסטטוס בשפת המסלול, כשהיא שונה מהניסוח הגנרי. */
  statusLabel?: string;
  /** תוכן שגלוי תמיד, גם כשהכרטיס סגור (ראה JourneyRow). */
  always?: React.ReactNode;
  menu: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <JourneyRow step={step} stepById={stepById} highlight={highlight} danger={danger}
      statusLabel={statusLabel} always={always} menu={menu}>
      {children}
    </JourneyRow>
  );
}

/**
 * כרטיס בקשה — הצורה האחידה של כל בקשה (אב-הטיפוס המאושר requests-v2-approved).
 * סגור: שם · משפט מצב אחד · פרטים משניים בשקט · פעולה אחת רלוונטית + ⋯.
 * פתוח: כל הפרטים של אותה בקשה. פותחים אחת בכל פעם, כדי שהמסך יישאר קריא.
 */
function JourneyRow({ step, stepById, highlight, danger, statusLabel, noteLine, always, menu, children }: {
  step: OnboardingStep;
  stepById: Map<string, OnboardingStep>;
  highlight: boolean;
  danger?: boolean;
  statusLabel?: string;
  /** שורת הסבר נוספת במטא — למשל דרישת-קשר של גורם חיצוני שטרם נפתרה. */
  noteLine?: string;
  /**
   * תוכן שגלוי גם כשהכרטיס סגור. ‼ חריג מכוון ויחיד: מסלול הרו"ח הקודם צריך
   * להראות את מי פונים ומה מבקשים בלי לחיצה — הרשימה היא הבקשה עצמה.
   */
  always?: React.ReactNode;
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
  // ‼ שלב החיבור נמדד מול חמישה סעיפים. רק כשיש כבר רשימה — שלב שטרם התחיל,
  // או לקוח שאינו עובד עם פייפרלס, ממשיכים בלי מונה בכלל כמו קודם.
  const progress = step.stepType === 'paperless_connection'
    && step.payload.paperlessStatus !== 'not_applicable'
    && (step.payload.checklist?.length ?? 0) > 0
    ? paperlessProgressLabel(step, findRetainerStep(stepById))
    : progressLabel(step);
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
    : step.payload.autoError ? '⚡ אוטומטי · הניסיון נכשל - יינסה שוב'
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
                  הזה אין דרך לדעת אם ביקשתי בפועל או רק הכנתי.
                  ‼ מסלול הרו"ח הקודם יוצא מהכלל: הוא לא מופיע בדף הלקוח לעולם,
                  ולכן "טרם פורסם ללקוח" חסר משמעות שם — והוא סתר את "נשלח". */}
              {isDraft && !PORTAL_HIDDEN_TYPES.includes(step.stepType) && (
                <span className="ob-pill is-draft">טיוטה</span>
              )}
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

      {always}

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

