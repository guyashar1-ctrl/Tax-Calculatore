// ─── מרכז ביצוע הייצוג ─────────────────────────────────────────────────────
// שני מסלולים נפרדים לגמרי, ולכן שתי עמודות ולא רשימה אחת:
//   • מס הכנסה — הפרטים מוזנים בשע"ם, ייפוי הכוח נחתם דיגיטלית אצלנו והתהליך
//     מתקדם דרך סטטוס הבקשה. השלבים כאן משקפים את הסטטוס, לא קובעים אותו.
//   • ביטוח לאומי — הזנה ידנית באתר ב"ל שמנפיקה מספר אסמכתא עם מועד תפוגה,
//     ומי שמאשר בסוף הוא הלקוח. כל השלבים כאן נשמרים ב-execution.
// המטרה: להיכנס לבקשה ולדעת בשנייה מה נשאר לעשות ואצל מי הכדור.

import { useEffect, useRef, useState } from 'react';
import {
  RepresentationRequest,
  RepresentationExecution,
  NiTracking,
  NI_APPROVAL_PHONE,
  Client,
} from '../types';
import type { OnboardingStep } from '../types/onboarding';
import PrerequisiteGate, { type PrerequisitePerson } from './PrerequisiteGate';
import {
  registeredFileInfo, registeredSpouseSentence, hasRegisteredSpouseChoice, registeredOwnerOf,
  clientDisplayName, spouseDisplayName,
} from '../features/annualReport/profile';
import { getRequestSigners, effectiveSignStatus } from '../utils/repSigners';
import { shaamSubmissions, requestScope, peopleFromClient, targetsOf } from '../utils/repScope';
import { signatureDocumentsOf, allDocumentsStamped } from '../utils/repDocuments';
import type { RepSignatureDocument } from '../types';
import { buildForm2279Fields, form2279BothSign, matchRegisteredPersonName } from '../features/representation/shaamRepresentation';
import { useEmailMessages } from '../hooks/useEmailMessages';
import {
  useRepApprovalStep, isRepApprovalClosed, isRepApprovalDeclared,
} from '../hooks/useRepApprovalStep';
import type { RepApprovalStep } from '../hooks/useRepApprovalStep';
import EmailStatusRow from './EmailActivity/EmailStatusRow';
import EmailPreviewDialog from './EmailActivity/EmailPreviewDialog';
import type { RepSigner } from '../types';
import InfoLines from './ui/InfoLines';
import { ShaamRequiredDocsList } from './ShaamRequiredDocsList';
import RepresentationReconcileButton, { type ReconcileTarget } from './RepresentationReconcileButton';
import NiNextActionButton from './NiNextActionButton';
import NiDropSubjectButton from './NiDropSubjectButton';
import { niPersons, niRepresentationOf, niRepresentationAction, niExternalEvidence } from '../utils/niPersons';
import { shaamRepresentationAction } from '../features/taxFile/shaamRepresentationAction';
import type { ShaamActionKind } from '../features/taxFile/shaamRepresentationAction';
import ShaamNextActionButton from './ShaamNextActionButton';
import type { ShaamSubmission } from '../utils/repScope';
import {
  shaamRequestExists,
  type ShaamRequestTracking,
} from '../features/representation/shaamRepresentation';
import {
  NOTICE_STYLES, columnAction, isReconcileAction, niTrackView, shaamSubmittedFacts, type NoticeTone,
} from '../features/representation/representationCenter';
import { shaamPersonFacts } from '../features/representation/shaamPersonFacts';
import type { NiRepresentationLine } from '../utils/niPersons';
import { representationInsight } from '../utils/representationInsight';
import ConfirmDialog from './ui/ConfirmDialog';

interface Props {
  request: RepresentationRequest;
  /** האם התבקש ייצוג בביטוח לאומי — נגזר ממרשם הייצוג של הלקוח. */
  niIncluded: boolean;
  /** הייצוג בב"ל נלקח גם לבן/בת הזוג — שני מסלולים, שתי אסמכתאות. */
  niCoversSpouse?: boolean;
  onSaveExecution: (execution: RepresentationExecution) => Promise<void> | void;
  /** פותח את עורך הפקת הטופס — העלאת PDF של ייפוי הכוח וסימון אזורי החתימה. */
  onProduce: () => void;
  /** פותח את חדר החתימה של הרו"ח — חתימה + חותמת על הטופס שהלקוח חתם. */
  onStamp: () => void;
  /** סימון שהטופס החתום הוגש בשע"ם. */
  onMarkSentToShaam: () => void;
  /** סימון שהייצוג אושר בשע"ם. */
  onMarkActive: () => void;
  /** שולח מייל חתימה לחותם. null = הצלחה. */
  onSendToSigner: (s: RepSigner) => Promise<string | null>;
  /** בעל החשבון — לטעינת יומן המיילים של הבקשה. */
  userId: string | undefined;
  /**
   * דריסת הנתיב המזורז — למסך הבדיקה בלבד (__TestExecutionCenter), שרץ בלי
   * מסד ולכן ה-hook מחזיר בו null תמיד. `undefined` = התנהגות רגילה.
   * ‼ לא להשתמש בזה בקוד אמיתי: המקור היחיד הוא onboarding_steps.
   */
  repApprovalOverride?: RepApprovalStep | null;
  /** הלקוח המקושר — לשמות בני הזוג ולמצב "מי הרשום במ"ה". */
  linkedClient?: Client;
  /**
   * ‼ ההכרעה מי בן/בת הזוג הרשום/ה יושבת **בתוך** שלב "הפרטים הוזנו בשע״ם"
   * (הכרעת גיא 2026-08-27): זה הרגע שבו הרו"ח פותח את הבקשה בשע״ם ורואה מה
   * רשום שם באמת. אין שלב נוסף, אין מסך אימות שני — הבחירה **היא** הסימון.
   */
  onConfirmRegisteredSpouse?: (clientId: string, owner: 'client' | 'spouse') => Promise<void> | void;
  /**
   * ‼ 165: שלבי «בקשות» של הלקוח המקושר — המקור היחיד לתנאי-הקדם של מסלולי
   * הב"ל (payload.prerequisites, נגזר בשרת). בלעדיהם מרכז הביצוע לא יודע
   * שיש תנאי-קדם בכלל, וממשיך להציע הזנה/אסמכתא/שליחה גם כשחסרים פרטים —
   * משטח עוקף לגמרי לכרטיס ב«בקשות». ראה docs/PLAN-REQUEST-PREREQUISITES-
   * INFORMATION-COLLECTION.md.
   */
  steps?: OnboardingStep[];
  /** נקרא אחרי שתנאי-קדם הושלמו (משרד/קישור-משתתף) — לרענון onboarding.steps. */
  onStepsChanged?: () => void;
  /** לשמירת כתובת מייל קנונית מתוך דיאלוג קישור-המשתתף (165). */
  onUpdateClientFields?: (patch: Partial<Client>) => Promise<void>;
  /**
   * 194 · שמירת מסמכי החתימה אחרי שטופס 2279 הובא משע״ם ואזורי החתימה
   * סומנו אוטומטית. ‼ כתיבה שקטה של **המסמכים בלבד** — בכוונה לא
   * `onProduceWithSetup`, שגם מקדם את הסטטוס ל«נשלח לחתימה»: הבאת הטופס
   * אינה שליחה ללקוח, והשליחה נשארת פעולה מפורשת של הרו"ח.
   */
  onAttachShaamForms?: (docs: RepSignatureDocument[]) => Promise<void>;
}

const todayISO = () => new Date().toISOString().slice(0, 10);

function fmtDateTime(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return `${d.toLocaleDateString('he-IL')} ${d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}`;
}

function fmt(dateish?: string): string {
  if (!dateish) return '';
  const d = new Date(dateish);
  return isNaN(d.getTime()) ? dateish : d.toLocaleDateString('he-IL');
}

/**
 * הודעה במרכז. ‼ הצבע נגזר מ-NoticeTone בלבד (representationCenter) — ורוד
 * שמור לכפתורי אוטומציה, ולכן הודעה לעולם לא נראית כמו פעולה.
 */
function Notice({ tone, children, style }: { tone: NoticeTone; children: React.ReactNode; style?: React.CSSProperties }) {
  const t = NOTICE_STYLES[tone];
  return (
    <div data-tone={tone} style={{
      padding: '.35rem .6rem', borderRadius: 'var(--radius)', fontSize: 'var(--fs-13)', lineHeight: 1.6,
      background: t.background, color: t.color, border: t.border, borderInlineStart: t.borderInlineStart,
      fontWeight: t.fontWeight, ...style,
    }}>
      {children}
    </div>
  );
}

/**
 * נתיב מזורז — שלב ביניים שאינו חלק מהשרשרת.
 *
 * ‼ בלי מספר, ובכוונה: מספר היה הופך אותו לשלב שביעי שחייבים לעבור בו,
 * בעוד שהייצוג נכנס לתוקף גם בלעדיו. מוזח פנימה ונשען על קו, כדי שייקרא
 * כענף של השלב שמעליו ולא כשורה שווה לו.
 * ‼ גם אינו נספר במונה המסלול — "6 מתוך 8" היה מציג תהליך שלא הושלם
 * כשהוא למעשה הושלם.
 */
function SideStep({ title, done, tone, hint, required, children }: {
  title: string; done: boolean; tone?: 'wait' | 'attention';
  hint?: string;
  /** ‼ 201 · שע״ם דורשת את הצעד (למשל «ממתין לאישור לקוח») — אז הוא לא «אופציונלי». */
  required?: boolean;
  children?: React.ReactNode;
}) {
  const dot = done ? 'var(--success)'
    : tone === 'attention' ? 'var(--orange)' : 'var(--ink-4)';
  return (
    <div style={{
      display: 'flex', gap: '.65rem', padding: '.45rem 0 .45rem .9rem',
      marginInlineStart: '.55rem', borderInlineStart: '2px solid var(--hairline-2)',
    }}>
      <div style={{
        flex: '0 0 auto', width: 14, height: 14, borderRadius: '50%', marginTop: 4,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 9, fontWeight: 700,
        background: done ? 'var(--success)' : 'transparent',
        border: done ? 'none' : `1.5px solid ${dot}`,
        color: 'var(--on-accent)',
      }}>
        {done ? '✓' : ''}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 'var(--fs-13)', fontWeight: done ? 400 : 500,
          color: done ? 'var(--ink-3)' : 'var(--ink-2)',
        }}>
          {title}
          <span style={{
            marginInlineStart: '.4rem', fontSize: 'var(--fs-11)',
            fontWeight: required ? 600 : 400, color: required ? 'var(--chip-orange-tx)' : 'var(--ink-4)',
          }}>
            {required ? 'חובה' : 'אופציונלי'}
          </span>
        </div>
        {hint && <div style={{ fontSize: 'var(--fs-12)', color: 'var(--ink-3)', marginTop: 2 }}>{hint}</div>}
        {children && <div style={{ marginTop: '.4rem' }}>{children}</div>}
      </div>
    </div>
  );
}

function Step({ n, title, done, hint, children }: {
  n: number; title: string; done: boolean; hint?: string; children?: React.ReactNode;
}) {
  return (
    <div style={{ display: 'flex', gap: '.65rem', padding: '.55rem 0' }}>
      <div style={{
        flex: '0 0 auto', width: 22, height: 22, borderRadius: '50%', marginTop: 1,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 'var(--fs-12)', fontWeight: 600,
        background: done ? 'var(--success)' : 'var(--surface-2)',
        color: done ? 'var(--on-accent)' : 'var(--ink-4)',
      }}>
        {done ? '✓' : n}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 'var(--fs-14)', fontWeight: done ? 500 : 600, color: done ? 'var(--ink-3)' : 'var(--ink-1)' }}>
          {title}
        </div>
        {hint && <div style={{ fontSize: 'var(--fs-12)', color: 'var(--ink-3)', marginTop: 2 }}>{hint}</div>}
        {children && <div style={{ marginTop: '.5rem' }}>{children}</div>}
      </div>
    </div>
  );
}

function Track({ title, subtitle, done, total, tone, nextAction, children }: {
  title: string; subtitle: string; done: number; total: number; tone: string;
  /**
   * ‼ פרק 17: תא «הפעולה הבאה» של הרשות — פקד אחד, בכותרת העמודה, מתחת
   * לשם ולמונה. ב״ל: יצירה/בדיקה דרך העובד לאדם של העמודה הזאת. שע״ם: תא
   * מוכן ומושבת עד שתיבנה האוטומציה. ריק ⇒ אין פעולה (למשל ייצוג פעיל).
   */
  nextAction?: React.ReactNode;
  children: React.ReactNode;
}) {
  const complete = done >= total;
  return (
    /* עמודת רשות. "הושלם" הוא מידע ולכן הוא נושא צבע — אבל בקו העליון
       ובמונה, לא במסגרת ירוקה סביב הכול ובראש ירוק מלא. */
    <div style={{
      flex: '1 1 320px', minWidth: 0,
      borderTop: `1px solid ${complete ? 'var(--success)' : 'var(--hairline-1)'}`,
    }}>
      <div style={{ padding: '.65rem 0 .5rem', borderBottom: '1px solid var(--hairline-2)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem' }}>
          <span style={{ fontSize: 'var(--fs-17)' }}>{tone}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: 'var(--fs-14)', color: 'var(--ink-1)' }}>{title}</div>
            <div style={{ fontSize: 'var(--fs-12)', color: 'var(--ink-4)' }}>{subtitle}</div>
          </div>
          <span style={{
            fontSize: 'var(--fs-13)', fontWeight: 500,
            color: complete ? 'var(--success-text)' : 'var(--ink-3)',
            fontVariantNumeric: 'tabular-nums',
          }}>
            {done}/{total}
          </span>
        </div>
        {nextAction && (
          <div className="rep-track-next" style={{ marginTop: '.5rem', display: 'flex', flexDirection: 'column', gap: '.25rem', alignItems: 'flex-start' }}>
            {nextAction}
          </div>
        )}
      </div>
      <div style={{ padding: '.6rem 0 .8rem' }}>{children}</div>
    </div>
  );
}

export default function RepresentationExecutionCenter({ request, niIncluded, niCoversSpouse, onSaveExecution, onProduce, onStamp, onMarkSentToShaam, onMarkActive, onSendToSigner, userId, repApprovalOverride, linkedClient, onConfirmRegisteredSpouse, steps, onStepsChanged, onUpdateClientFields, onAttachShaamForms }: Props) {
  const exec = request.execution || {};
  const it = exec.incomeTax || {};
  const ni = exec.nationalInsurance || {};
  const niSpouse = exec.nationalInsuranceSpouse || {};

  /**
   * ‼ ביטוח לאומי הוא "עבור מי" לכל דבר (31.8) — כולל התבקש *רק* לבן/בת
   * הזוג, בלי מסלול לנישום בכלל. `targetsOf` הוא מקור האמת; ה-props
   * `niIncluded`/`niCoversSpouse` נשארים לתאימות (הרמונים החיצוניים שעדיין
   * לא הועברו) ומשמשים נפילה-לאחור כש-`linkedClient` חסר (למשל בבדיקות).
   */
  const niTargets = linkedClient ? targetsOf(linkedClient.authorityRepresentations, 'nationalInsurance') : null;
  const niTargetsClient = niTargets ? niTargets.includes('client') : niIncluded;
  const niTargetsSpouse = niTargets ? niTargets.includes('spouse') : !!niCoversSpouse;

  /**
   * ‼ 165: הבקשה של כל מסלול ב"ל — לתנאי-הקדם. חיפוש ולא payload על
   * ה-request עצמו: תנאי-הקדם חיים על onboarding_steps, לא על
   * representation_requests (שני מקורות אמת נפרדים בכוונה — ראה 157/165).
   * status !== 'cancelled' כמו כל צריכה אחרת של שלבי «בקשות».
   */
  const niClientStep = linkedClient
    ? steps?.find(s => s.clientId === linkedClient.id && s.stepType === 'authority_representation'
        && s.payload?.authority === 'national_insurance' && s.payload?.subjectRole !== 'spouse'
        && s.status !== 'cancelled') ?? null
    : null;
  const niSpouseStep = linkedClient
    ? steps?.find(s => s.clientId === linkedClient.id && s.stepType === 'authority_representation'
        && s.payload?.authority === 'national_insurance' && s.payload?.subjectRole === 'spouse'
        && s.status !== 'cancelled') ?? null
    : null;
  const niPrereqValues = linkedClient ? {
    spouseFirstName: linkedClient.spouseFirstName, spouseLastName: linkedClient.spouseLastName,
    spouseIdNumber: linkedClient.spouseIdNumber,
    spouseBirthYear: linkedClient.spouseBirthYear ? String(linkedClient.spouseBirthYear) : undefined,
    firstName: linkedClient.firstName, lastName: linkedClient.lastName, idNumber: linkedClient.idNumber,
    birthDate: linkedClient.birthDate,
  } : {};
  // ‼ 167: שני הנמענים האפשריים לקישור-משתתף — בעל הכרטיס ובן/בת הזוג —
  // נגזרים כאן פעם אחת ומועברים לשני המסלולים כאחד (ראה PrerequisiteGate).
  const prereqClient: PrerequisitePerson = {
    role: 'client',
    name: linkedClient ? `${linkedClient.firstName ?? ''} ${linkedClient.lastName ?? ''}`.trim() || 'הלקוח' : 'הלקוח',
    email: linkedClient?.email || '',
  };
  const prereqSpouse: PrerequisitePerson = {
    role: 'spouse',
    name: linkedClient
      ? (`${linkedClient.spouseFirstName ?? ''} ${linkedClient.spouseLastName ?? ''}`.trim() || linkedClient.spouseName || 'בן/בת הזוג')
      : 'בן/בת הזוג',
    email: linkedClient?.spouseEmail || '',
  };
  const prereqOnSaveEmail = async (role: 'client' | 'spouse', email: string) => {
    if (!onUpdateClientFields) return;
    await onUpdateClientFields(role === 'spouse' ? { spouseEmail: email } : { email });
  };

  const [busy, setBusy] = useState<string | null>(null);
  /**
   * הזנה שנפתחה לתיקון. ‼ הלחיצה על שם היא לא רק סימון — היא קובעת מי הרשום
   * ומשנה את הבעלים ומספר התיק בכרטיס. טעות בלחיצה חייבת להיות הפיכה.
   */
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [note, setNote] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const status = request.status;
  const signers = getRequestSigners(request);
  const pendingSigners = signers.filter(s => effectiveSignStatus(request, s) === 'pending');
  /** מי מהממתינים באמת יכול לקבל מייל — רק להם יש טעם בבחירת נמען. */
  const emailableSigners = pendingSigners.filter(s => s.email.trim());
  const signed = ['awaiting_stamp', 'awaiting_authorities', 'active'].includes(status);
  const sentToShaam = ['awaiting_authorities', 'active'].includes(status);
  // ‼ "הופק" ו"הוחתם" הם **כל** הטפסים: בקשה עם מע"מ לשני בני הזוג מולידה
  // שני טפסים, ומסך שמראה "מוכן" אחרי אחד מהם היה שולח חצי בקשה.
  const poaDocs = signatureDocumentsOf(request);
  const formReady = (poaDocs.length > 0 && poaDocs.every(d => !!d.pdfDocId)) || signed;
  // ה-PDF הסופי (חתימות + חותמת המשרד) נוצר ונשמר
  const stamped = allDocumentsStamped(request) || sentToShaam;
  // בלי אסמכתא המייל ייצא בלי חלק הב"ל, והמבוטח יזדקק למייל שני. כשגם בן/בת
  // הזוג מיוצג — חסרה אסמכתא אחת מספיקה כדי לעצור, אחרת אחד מהם יקבל מייל חסר.
  // ‼ נבדק רק במסלולים שבאמת התבקשו (לא "הנישום תמיד") — ראה niTargets*.
  const niRefMissing = (niTargetsClient || niTargetsSpouse)
    && ((niTargetsClient && !ni.referenceNumber) || (niTargetsSpouse && !niSpouse.referenceNumber));

  // ── הזנות שע״ם: אחת לכל אדם ────────────────────────────────────────────────
  // ‼ בשע״ם נכנסים עם ת.ז. אחת ומזינים את כל המוסדות של אותו אדם בבת אחת
  // (הכרעת גיא 2026-08-28). שורה נפרדת לכל רשות תיארה עבודה שלא קיימת.
  // כשגם לבן/בת הזוג יש תיקים — הזנה שנייה, על ת.ז. שלו/ה.
  const scopePeople = peopleFromClient(linkedClient);
  const entryAt = (key: string) => exec.shaamEntries?.[key]?.enteredAt;

  // הטופס הבא שממתין לחתימה+חותמת שלי, וכמה נשארו. ‼ נגזר מהמסמכים ולא
  // מהסטטוס: הסטטוס מתקדם רק כשכולם נצרבו.
  const nextToStamp = poaDocs.find(d => !d.signedPdfStoredId) ?? null;
  const stampsLeft = poaDocs.filter(d => !d.signedPdfStoredId).length;

  /**
   * ביטול סימון ההזנה. ‼ אינו מבטל את ההכרעה מי הרשום: אלה שתי עובדות
   * נפרדות, ומי שרק טעה בסימון לא אמור לאבד גם את מה שראה בשע״ם.
   * ההזנה הראשונה נשמרת בשדה הישן `incomeTax` (תאימות), והשאר במפה.
   */
  async function unmarkEntry(key: string, isFirst: boolean) {
    if (isFirst) {
      await patch({ ...exec, incomeTax: { ...it, enteredAt: undefined } }, 'it');
      return;
    }
    const next = { ...(exec.shaamEntries ?? {}) };
    delete next[key];
    await patch({ ...exec, shaamEntries: next }, `entry-${key}`);
  }

  /** סימון הזנה של אדם. `owner` מסופק כשההזנה הזאת נושאת גם את ההכרעה במ"ה. */
  async function markEntry(key: string, owner?: 'client' | 'spouse') {
    if (owner && linkedClient && onConfirmRegisteredSpouse) {
      setBusy(`entry-${key}`);
      try {
        await onConfirmRegisteredSpouse(linkedClient.id, owner);
      } catch (e) {
        setNote({ kind: 'err', text: e instanceof Error ? e.message : 'השמירה נכשלה' });
        setBusy(null);
        return;
      }
    }
    if (entryAt(key)) { setBusy(null); return; }   // נתון ישן — רק ההכרעה נשמרת
    await patch({
      ...exec,
      shaamEntries: { ...(exec.shaamEntries ?? {}), [key]: { enteredAt: new Date().toISOString() } },
    }, `entry-${key}`);
  }

  // המיילים של הבקשה — מוצגים בתוך השלב שהם שייכים אליו
  const { messages, reload: reloadEmails } = useEmailMessages(userId, { requestId: request.id });
  const signatureEmails = messages.filter(m => m.requestId === request.id && m.kind === 'sign');
  const activeEmails = messages.filter(m => m.requestId === request.id && m.kind === 'active');

  // מייל "הייצוג אושר" — נשלח רק מכאן, ורק אחרי שראו אותו
  const [previewActive, setPreviewActive] = useState(false);
  // תצוגה מקדימה של מייל החתימה. השליחה עצמה נשארת בכפתור המשותף, שגם מסמן
  // שההוראות לב"ל יצאו — ולכן כאן צפייה בלבד.
  const [previewSignerId, setPreviewSignerId] = useState<string | null>(null);
  const missingIds = representationInsight(request, linkedClient, steps).missingIdentity;
  const [confirmSendWithoutId, setConfirmSendWithoutId] = useState(false);
  /** null = לכל מי שיש לו מייל. מזהה חותם = רק אליו, והוא יעביר לשני. */
  const [sendOnlyTo, setSendOnlyTo] = useState<string | null>(null);

  /**
   * שולח לחותמים שנבחרו, ומתעד שההוראות לב"ל יצאו — **רק למי שבאמת נשלח
   * אליו מייל**.
   *
   * ‼ הבאג שתוקן כאן (23.09.2026, הדסה ויאיר סלע): הסימון הוחל על שני
   * המסלולים בלי קשר למי קיבל. ליאיר לא הייתה כתובת, אף מייל לא יצא אליו,
   * והאסמכתא שלו (75074203) לא הופיעה בשום מקום — ובכל זאת הצעד "ההוראות
   * הגיעו למבוטח" נצבע ירוק. אותה משפחה של טענה בלי ראיה כמו «קיימת בקשה
   * ⇒ אושר» (195).
   *
   * @param only מזהה חותם יחיד — "לשלוח רק ל-X, והוא יעביר לשני". ריק = לכולם.
   */
  async function handleSendAll(only?: string) {
    setBusy('send');
    setNote(null);
    // חותם בלי מייל אינו תקלה (110): בן/בת זוג בלי כתובת חותם יחד עם הנישום
    // באותו מכשיר, או מקבל קישור אחרי שהנישום יזין את המייל בשלב החתימה.
    const chosen = only ? pendingSigners.filter(s => s.id === only) : pendingSigners;
    const emailable = chosen.filter(s => s.email.trim());
    const skipped = pendingSigners.filter(s => !emailable.some(e => e.id === s.id));
    const sentIds = new Set<string>();
    const failures: string[] = [];
    for (const s of emailable) {
      const err = await onSendToSigner(s);
      if (err) failures.push(`${s.name || s.email}: ${err}`);
      else sentIds.add(s.id);
    }
    if (failures.length > 0) {
      setNote({ kind: 'err', text: failures.join(' · ') });
      setBusy(null);
      return;
    }
    if (emailable.length === 0) {
      setNote({ kind: 'err', text: 'אין למי לשלוח - לאף חותם ממתין אין כתובת מייל.' });
      setBusy(null);
      return;
    }
    const now = new Date().toISOString();
    // ‼ מסמנים מסלול **רק** כשיצא מייל לחותם של אותו מסלול. `signerSent`
    // קושר תפקיד↔מסלול במפורש; בלעדיו "מישהו קיבל" נקרא כ"כולם קיבלו".
    const signerSent = (role: 'client' | 'spouse') =>
      [...sentIds].some(id => signers.find(s => s.id === id)?.role === role);
    const stampSent = (t: NiTracking, role: 'client' | 'spouse'): NiTracking =>
      signerSent(role) && t.referenceNumber && !t.instructionsSentAt
        ? { ...t, instructionsSentAt: now, instructionsSentWith: 'signature' as const }
        : t;
    await onSaveExecution({
      ...exec,
      signatureEmailSentAt: now,
      ...(niTargetsClient ? { nationalInsurance: stampSent(ni, 'client') } : {}),
      ...(niTargetsSpouse ? { nationalInsuranceSpouse: stampSent(niSpouse, 'spouse') } : {}),
    });
    setNote({
      kind: 'ok',
      text: `נשלח ל-${emailable.map(s => s.email).join(', ')}` + (skipped.length > 0
        ? ` · ל${skipped.map(s => s.name || 'בן/בת הזוג').join(', ')} לא נשלח - אפשר להזין מייל או להעתיק קישור בשורה שלו/ה`
        : ''),
    });
    setBusy(null);
    void reloadEmails();
  }

  /**
   * ההודעה שיצאה לכתובת של החותם הזה — למצב המסירה (נמסר/נפתח/נלחץ).
   * ‼ התאמה לפי כתובת בלבד, וזו **לא** ראיה שההוראות של האדם הזה יצאו:
   * שני חותמים יכולים לחלוק תיבה אחת (נצפה בייצור — בן/בת זוג שנותנים את
   * המייל של השני), ואז אותה הודעה תתאים לשניהם אף שהיא נשאה את האסמכתא
   * של אחד מהם. הראיה לכך שהוראות ב"ל של אדם מסוים יצאו היא
   * `track.instructionsSentAt`, שנכתב לפי תפקיד מפורש.
   */
  const signerEmail = (s: RepSigner) => {
    const addr = s.email.trim().toLowerCase();
    return addr ? signatureEmails.find(m => m.toEmail.trim().toLowerCase() === addr) : undefined;
  };
  /** מסלול הב"ל של החותם — לפי תפקיד מפורש, לעולם לא "הראשון". */
  const niTrackFor = (s: RepSigner): NiTracking | undefined =>
    s.role === 'spouse' ? (niTargetsSpouse ? niSpouse : undefined) : (niTargetsClient ? ni : undefined);

  /**
   * "נמסר קישור ידנית" — הרו"ח העתיק את הקישור האישי ומוסר אותו בעצמו
   * (וואטסאפ/טלפון). ‼ ראיה חלשה ומסומנת ככזו (`instructionsSentWith:'link'`):
   * יודעים שהקישור יצא מכאן, לא שהוא הגיע. בלי זה הצעד "ההוראות הגיעו
   * למבוטח" היה נשאר פתוח לנצח למי שלא מקבל מיילים.
   */
  async function markLinkHandedOver(role: 'client' | 'spouse') {
    const track = role === 'spouse' ? niSpouse : ni;
    if (!track.referenceNumber || track.instructionsSentAt) return;
    const now = new Date().toISOString();
    const next = { ...track, instructionsSentAt: now, instructionsSentWith: 'link' as const };
    await onSaveExecution({
      ...exec,
      ...(role === 'spouse' ? { nationalInsuranceSpouse: next } : { nationalInsurance: next }),
    });
  }

  /** תזכורת = אותו מייל שוב, לאותו חותם. בלי גרסה חלקית שתבלבל את הלקוח. */
  async function handleRemind(m: { toEmail: string }) {
    const signer = signers.find(s => s.email === m.toEmail) || signers[0];
    if (!signer) return 'לא נמצא חותם לשליחה';
    const err = await onSendToSigner(signer);
    if (!err) void reloadEmails();
    return err;
  }

  async function patch(next: RepresentationExecution, label: string) {
    setBusy(label);
    setNote(null);
    try {
      await onSaveExecution(next);
    } catch (e) {
      setNote({ kind: 'err', text: e instanceof Error ? e.message : 'השמירה נכשלה' });
    } finally {
      setBusy(null);
    }
  }

  // ── מי בן/בת הזוג הרשום/ה במס הכנסה ───────────────────────────────────────
  // ‼ ההכרעה נעשית כאן ורק כאן. עד הרגע הזה מה שיש בכרטיס הוא הכוונה שנרשמה
  // בפתיחת הייצוג, מסומנת «טרם אומת מול מ"ה»; פתיחת הבקשה בשע״ם היא הרגע
  // שבו רואים מי רשום באמת, ולכן הבחירה כאן היא גם הסימון של השלב.
  //
  // ‼ הצורך להכריע נגזר מהמצב העסקי — נשוי + ייצוג במ"ה + טרם הוכרע — ולא
  // מדגל שנכתב רק בפתיחת ייצוג חדשה. אחרת לקוח ותיק, שהבעלים שלו נולד
  // מברירת מחדל, היה מדלג על השאלה בדיוק כמו מי שכבר ענה עליה.
  const itRequested = request.authorities.includes('incomeTax');
  // ‼ "הוכרע" = ידוע **מי**, לא רק שהדגל נכתב. דגל בלי שורת תיק מ"ה אינו
  // תשובה, ולכן השלב שואל שוב במקום להצהיר על מי שאיש לא קבע.
  const regOwner = linkedClient ? registeredOwnerOf(linkedClient) : null;
  const regVerified = !!regOwner;
  const regChoice = !!linkedClient && !!onConfirmRegisteredSpouse
    && itRequested && hasRegisteredSpouseChoice(linkedClient);

  // הכוונה שנרשמה בפתיחת הייצוג, אם נרשמה. null = אין רמז, ואז אף כפתור
  // אינו מודגש — הדגשה בלי כיסוי הייתה נראית כהמלצה שמישהו נתן.
  const regIntent: 'client' | 'spouse' | null =
    linkedClient && (linkedClient.taxFiles ?? []).some(f => f.authority === 'income_tax')
      ? (registeredFileInfo(linkedClient)?.owner === 'spouse' ? 'spouse' : 'client')
      : null;

  // ‼ תיק מס הכנסה נכנס בהזנה של בן/בת הזוג הרשום/ה — מספרו הוא ת.ז. שלו/ה,
  // ושם הוא מופיע בשע״ם. כל עוד לא הוכרע, הוא נספר אצל הנישום, וזו בדיוק
  // השאלה שנשאלת בשלב הזה.
  const submissions = shaamSubmissions(
    requestScope(request, linkedClient), scopePeople, regOwner ?? undefined,
  );
  // ההזנה הראשונה היא שלב 1; השאר נספרים אחריה.
  const firstEntry = submissions[0] ?? null;
  const extraEntries = submissions.slice(1);

  // ‼ שאלת "מי הרשום" יושבת בהזנה שנושאת את תיק מ"ה — שם היא נענית בפועל.
  const regRowKey = submissions.find(x => x.carriesIncomeTax)?.key ?? firstEntry?.key ?? null;

  // ‼ המשפט נבנה אך ורק ממה שאומת. לפני האימות אין ניסוח בכלל — המערכת לא
  // מצהירה מי הרשום על סמך ברירת מחדל.
  const regSentence = linkedClient && regOwner
    ? registeredSpouseSentence(linkedClient, regOwner)
    : '';

  /** סימון "הוזן בשע״ם". `owner` מסופק כשיש שני בני זוג — ואז הוא גם ההכרעה. */
  async function markEnteredInShaam(owner?: 'client' | 'spouse') {
    if (owner && linkedClient && onConfirmRegisteredSpouse) {
      setBusy('it');
      try {
        await onConfirmRegisteredSpouse(linkedClient.id, owner);
      } catch (e) {
        setNote({ kind: 'err', text: e instanceof Error ? e.message : 'השמירה נכשלה' });
        setBusy(null);
        return;
      }
    }
    // שלב שכבר סומן (נתון ישן שנשאר לא-מאומת) — רק ההכרעה נשמרת, בלי לדרוס תאריך
    if (it.enteredAt) { setBusy(null); return; }
    await patch({ ...exec, incomeTax: { ...it, enteredAt: new Date().toISOString() } }, 'it');
  }

  /** שמות שני בני הזוג לכפתורי ההכרעה — השם עצמו הוא הכפתור. */
  const regNames: { owner: 'client' | 'spouse'; label: string }[] = linkedClient
    ? [
        { owner: 'client', label: clientDisplayName(linkedClient) },
        { owner: 'spouse', label: spouseDisplayName(linkedClient) },
      ]
    : [];

  // ── בן/בת הזוג הרשום/ה — הכרעה אוטומטית מראיה שנקראה משע״ם (23.09.2026) ────
  // ‼ «בדוק קבלת הייצוג» מחזירה «שם הלקוח» כפי שהוא מוצג ברשימת הבקשות
  // בשע״ם — ראיה חיצונית, לא ניחוש. כשההתאמה חד-משמעית (מתאימה לשם אחד
  // בדיוק מבין שני בני הזוג הידועים) — כותבים דרך **אותו נתיב** שהרו"ח
  // משתמש בו ידנית (`onConfirmRegisteredSpouse`, בדיוק כמו לחיצה על השם).
  // תוצאה מעורפלת (שני שמות, או אף אחד) — לא כותבים כלום; ההכרעה הידנית
  // נשארת כרגיל. ‼ שומר ref: לא כותבים פעמיים על אותה ראיה (StrictMode,
  // ורענוני progress חוזרים על אותו job שכבר טופל).
  const regAutoRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!linkedClient || !onConfirmRegisteredSpouse || regVerified || !regChoice) return;
    const rows = (exec.shaam?.[regRowKey ?? '']?.systems ?? []) as Array<{ clientName?: string }>;
    const shaamName = rows.find((r) => r?.clientName)?.clientName;
    if (!shaamName) return;
    const evidenceKey = `${regRowKey}:${shaamName}`;
    if (regAutoRef.current.has(evidenceKey)) return;
    const match = matchRegisteredPersonName(shaamName, clientDisplayName(linkedClient), spouseDisplayName(linkedClient) || null);
    if (match !== 'client' && match !== 'spouse') return; // ambiguous/no_match — לא כותבים
    regAutoRef.current.add(evidenceKey);
    void onConfirmRegisteredSpouse(linkedClient.id, match);
  }, [linkedClient, onConfirmRegisteredSpouse, regVerified, regChoice, regRowKey, exec.shaam]);

  // ── אזורי החתימה על טופס 2279 — אוטומטית (194) ────────────────────────────
  // ‼ הטופס מגיע משע״ם, וכל טופסי 2279 שנבדקו זהים במבנה (עמוד אחד,
  // 612×792 נק'). המיקומים ב-FORM_2279_TEMPLATE נמדדו מסימון ידני אמיתי
  // על טופס כזה, ולכן ההכנה כאן היא שחזור של מה שהרו"ח עשה — לא אומדן.
  // ‼ המיקום נגזר מהתפקיד בטופס: הרשום/ה חותם/ת ב«חתימת בן זוג רשום»,
  // והשני/ה ב«חתימת בן/בת הזוג». מגדר אינו משתתף בהחלטה.
  // ‼ רץ פעם אחת לכל הגשה, עם שומר ref: StrictMode מריץ אפקטים פעמיים,
  // וכתיבה כפולה כאן הייתה יוצרת שני מסמכים לאותו טופס.
  const preparedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!onAttachShaamForms) return;
    const existing = signatureDocumentsOf(request);
    const additions: RepSignatureDocument[] = [];
    for (const sub of submissions) {
      const t = exec.shaam?.[sub.key];
      if (!t?.formDocumentId) continue;
      if (existing.some(d => d.key === sub.key)) continue;
      if (preparedRef.current.has(sub.key)) continue;
      preparedRef.current.add(sub.key);
      additions.push({
        key: sub.key,
        title: sub.title ? `${sub.title} · ${sub.authoritiesLabel}` : sub.authoritiesLabel,
        pdfDocId: t.formDocumentId,
        pdfFileName: t.formFileName || 'ייפוי כוח לחתימה.pdf',
        fields: buildForm2279Fields(
          // ‼ מי חותם/ת ב«בן זוג רשום»: ההכרעה כשהיא קיימת, אחרת בעל/ת
          // ההגשה — הטופס הופק על שמו/ה, וזו התשובה הכי קרובה לוודאית.
          regOwner ?? sub.target,
          form2279BothSign(sub, scopePeople.married),
        ),
        createdAt: new Date().toISOString(),
        signedPdfStoredId: null,
      });
    }
    if (additions.length === 0) return;
    void onAttachShaamForms([...existing, ...additions]);
  }, [request, exec.shaam, submissions, regOwner, scopePeople.married, onAttachShaamForms]);

  // ‼ הנתיב המזורז נטען כאן ואינו מגיע כ-prop — ראה useRepApprovalStep.
  // מרוענן כשהסטטוס משתנה, כי המעבר ל-awaiting_authorities הוא שיוצר אותו.
  const { step: loadedRepApproval, reload: reloadRepApproval } = useRepApprovalStep(request.linkedClientId);
  const repApproval = repApprovalOverride !== undefined ? repApprovalOverride : loadedRepApproval;
  const declared = isRepApprovalDeclared(repApproval);
  // ‼ 201 · «ממתין לאישור לקוח» בשע״ם ⇒ האישור הוא חובה, לא זירוז. שני מקורות,
  // שניהם שמורים: הסימון בשלב (השרת), ומה ששע״ם מציגה עכשיו בהגשה כלשהי.
  const approvalRequired = repApproval?.requiredBy === 'shaam'
    || submissions.some(sub => !!shaamSubmittedFacts(exec.shaam?.[sub.key])?.clientApprovalRequired);
  useEffect(() => { void reloadRepApproval(); }, [status, reloadRepApproval]);

  // ── ספירת שלבים שהושלמו, להצגה בכותרת כל מסלול ──
  // ‼ הנתיב המזורז אינו כאן: הוא אופציונלי, וספירתו הייתה מציגה מסלול שהושלם
  // כאילו נשאר בו צעד.
  const itSteps = [!!it.enteredAt, ...extraEntries.map(s => !!entryAt(s.key)), formReady, !!exec.signatureEmailSentAt, signed, stamped, sentToShaam, status === 'active'];

  // שמות המבוטחים לכותרות המסלולים — כשיש שניים, "ביטוח לאומי" לבדו לא מספיק
  const nameOf = (role: 'client' | 'spouse') =>
    signers.find(s => s.role === role)?.name?.trim();
  const clientNiTitle = niTargetsSpouse ? `ב״ל - ${nameOf('client') || 'הנישום'}` : 'ביטוח לאומי';

  // ── הפעולה ההקשרית של ב״ל — לכל אדם בנפרד (פרק 17) ──────────────────────
  // ‼ אותה נגזרת בדיוק כמו בתיק המס (niRepresentationOf → niRepresentationAction),
  // מאותו כרטיס ומאותו מסלול ביצוע — כדי ששני המשטחים לא יסטו. המצב של
  // אדם אחד לעולם לא נגזר מהשני: role מפורש לכל עמודה.
  const niExecutionByRole = { client: ni, spouse: niSpouse };
  const niLineFor = (role: 'client' | 'spouse'): NiRepresentationLine | null => {
    if (!linkedClient) return null;
    const person = niPersons(linkedClient).find(p => p.role === role);
    return person ? niRepresentationOf(person, linkedClient, undefined, niExecutionByRole) : null;
  };
  const niActionFor = (role: 'client' | 'spouse') => {
    if (!linkedClient) return null;
    const person = niPersons(linkedClient).find(p => p.role === role);
    const line = niLineFor(role);
    if (!person || !line) return null;
    return niRepresentationAction(person, linkedClient, line, niExecutionByRole[role]);
  };
  // ‼ 200: «הסר מהבקשה» רק כששני האנשים בב"ל — הסרת האחרון אינה הסרה (השרת דוחה).
  const niNextActionNode = (role: 'client' | 'spouse') => linkedClient ? (
    <>
      <NiNextActionButton
        client={linkedClient} role={role} action={columnAction(niActionFor(role))} track={niExecutionByRole[role]}
        onChanged={onStepsChanged} className="btn btn-sm" errorClassName="rep-track-next-err"
      />
      {niTargetsClient && niTargetsSpouse && (
        <NiDropSubjectButton
          clientId={linkedClient.id} role={role} track={niExecutionByRole[role]}
          name={nameOf(role) || (role === 'spouse' ? 'בן/בת הזוג' : 'הנישום')}
          onChanged={onStepsChanged}
        />
      )}
    </>
  ) : null;

  // ── שע״ם: הפעולה ההקשרית, לכל הגשה בנפרד (194) ──────────────────────────
  // ‼ אותה נגזרת בדיוק כמו בתיק המס (shaamRepresentationAction), מאותו
  // סטטוס ומאותו מצב אינטגרציה — כדי ששני המשטחים לא יסטו. המצב של הגשה
  // אחת לעולם אינו נגזר מהשנייה: `submissionKey` מפורש בכל מקום.
  const shaamTrack = (key: string): ShaamRequestTracking | undefined => exec.shaam?.[key];
  const shaamActionFor = (sub: ShaamSubmission) =>
    shaamRepresentationAction(status, shaamTrack(sub.key), stamped);
  const shaamNode = (sub: ShaamSubmission, only?: ShaamActionKind) => {
    // ‼ «בדוק» לעולם לא בעמודה — יש לו כפתור אחד ליד כותרת המרכז.
    const a = columnAction(shaamActionFor(sub));
    if (!a || (only && a.kind !== only)) return null;
    return (
      <ShaamNextActionButton
        request={request} linkedClient={linkedClient ?? null} submission={sub}
        action={a} tracking={shaamTrack(sub.key)} married={scopePeople.married}
        onChanged={onStepsChanged} className="btn btn-sm" errorClassName="rep-track-next-err"
      />
    );
  };
  // ‼ הפעולה שבראש המסלול היא של ההגשה הראשונה שעוד יש בה עבודה — לא
  // «הראשונה ברשימה»: אצל זוג, אחת עשויה כבר להיות מוגשת והשנייה לא.
  const shaamLeadSubmission = submissions.find(s => {
    const a = columnAction(shaamActionFor(s));
    return !!a && !a.disabled;
  }) ?? submissions.find(s => !!columnAction(shaamActionFor(s))) ?? null;

  // ── «בדוק קבלת הייצוג» — פעולה אחת של המרכז (representationCenter) ──────
  const shaamReconcile: ReconcileTarget[] = submissions
    .filter(sub => isReconcileAction(shaamActionFor(sub)?.kind))
    .map(sub => {
      const person = linkedClient ? shaamPersonFacts(request, linkedClient, sub.target) : null;
      const entityId = person?.idNumber.replace(/\D/g, '') ?? '';
      return {
        key: sub.key,
        label: `שע״ם${sub.title ? ` · ${sub.title}` : ''}`,
        input: !person ? 'אין כרטיס לקוח מקושר לבקשה'
          : !entityId ? 'אין תעודת זהות תקינה לאדם הזה בכרטיס'
          : {
            submissionKey: sub.key, role: sub.target,
            requestNumber: shaamTrack(sub.key)?.requestNumber ?? '',
            entityId, personName: person.name,
          },
      };
    });
  const btlReconcile: ReconcileTarget[] = (['client', 'spouse'] as const)
    .filter(role => (role === 'client' ? niTargetsClient : niTargetsSpouse) && isReconcileAction(niActionFor(role)?.kind))
    .map(role => {
      const person = linkedClient ? niPersons(linkedClient).find(p => p.role === role) : undefined;
      const ref = niExecutionByRole[role].referenceNumber;
      return {
        key: role,
        label: `ב״ל · ${nameOf(role) || (role === 'spouse' ? 'בן/בת הזוג' : 'הנישום')}`,
        input: !person?.idNumber || !ref ? 'אין קוד אסמכתא שמור לאדם הזה'
          : { role, idNumber: person.idNumber, referenceNumber: ref },
      };
    });
  const shaamNextActionNode = shaamLeadSubmission ? shaamNode(shaamLeadSubmission) : null;
  // מי מבין השניים תקוע בלי אסמכתא — כדי שהחסימה תגיד לאן ללכת, ולא רק שנחסם
  const missingRefFor = !niTargetsSpouse ? '' : [
    !ni.referenceNumber && (nameOf('client') || 'הנישום'),
    !niSpouse.referenceNumber && (nameOf('spouse') || 'בן/בת הזוג'),
  ].filter(Boolean).join(' ו-');

  return (
    <div id="rep-execution" className="card" style={{ marginBottom: '1rem' }}>
      <div className="card-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '.75rem', flexWrap: 'wrap' }}>
        <div className="card-title">ביצוע הייצוג מול הרשויות</div>
        {/* ‼ הפעולה היחידה במסך שבודקת מול הרשויות. לא לשכפל בעמודה או בשלב. */}
        <RepresentationReconcileButton clientId={linkedClient?.id} shaam={shaamReconcile} btl={btlReconcile} onChanged={onStepsChanged} />
      </div>
      <div className="card-body">
        <p style={{ marginTop: 0, fontSize: 'var(--fs-12)', color: 'var(--ink-3)', lineHeight: 1.6 }}>
          העתיקו את הפרטים מהבלוק שמעל, הזינו אותם באתר של כל רשות, וסמנו כאן מה בוצע.
        </p>

        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
          {/* ─────────── מס הכנסה ─────────── */}
          <Track
            title="מס הכנסה"
            subtitle="שע״ם · ייפוי כוח בחתימה דיגיטלית"
            done={itSteps.filter(Boolean).length}
            total={itSteps.length}
            tone="🏛"
            nextAction={shaamNextActionNode}
          >
            {/* ‼ הזנה אחת לכל אדם, לא אחת לכל רשות: בשע״ם נכנסים עם ת.ז. אחת
                ומזינים את כל המוסדות של אותו אדם בבת אחת. השלב מפרט מה נכנס
                בהזנה הזאת, כדי שיהיה ברור מה כוסה בה.
                ‼ שאלת "מי הרשום במ״ה" יושבת בהזנה שנושאת את תיק מס הכנסה —
                שם היא נענית בפועל — והסימון של אותה הזנה **הוא** ההכרעה. */}
            {submissions.map((sub, i) => {
              const first = i === 0;
              const at = first ? it.enteredAt : entryAt(sub.key);
              const asksHere = regChoice && !regVerified && sub.key === regRowKey;
              const busyKey = first ? 'it' : `entry-${sub.key}`;
              const mark = (owner?: 'client' | 'spouse') => first
                ? markEnteredInShaam(owner)
                : markEntry(sub.key, owner);
              const what = sub.authoritiesLabel;
              return (
                <Step
                  key={sub.key}
                  n={i + 1}
                  title={sub.title
                    ? `הפרטים הוזנו בשע״ם · ${sub.title}`
                    : 'הפרטים הוזנו בשע״ם'}
                  done={!!at}
                  hint={at
                    ? (asksHere ? undefined
                        : sub.carriesIncomeTax && regVerified && regSentence
                          ? `${what} · ${regSentence} · סומן ב-${fmt(at)}`
                          : `${what} · סומן ב-${fmt(at)}`)
                    : asksHere
                      ? `${what}. מי מבין השניים רשום שם במס הכנסה?`
                      : `${what} · הזנה אחת בשע״ם, על ת.ז. של ${sub.personName}`}
                >
                  {asksHere || editingKey === sub.key ? (
                    <>
                      {at && (
                        <div style={{ fontSize: 'var(--fs-12)', color: 'var(--ink-3)', marginBottom: '.4rem' }}>
                          {editingKey === sub.key && regVerified
                            ? 'מי רשום במס הכנסה? הבחירה תעדכן את הבעלים ואת מספר התיק בכרטיס.'
                            : `סומן ב-${fmt(at)}, אבל טרם נרשם מי הרשום במ״ה. מי מבין השניים?`}
                        </div>
                      )}
                      {editingKey === sub.key && (
                        <button type="button" className="btn btn-ghost btn-sm" style={{ marginBottom: '.35rem' }}
                          onClick={() => setEditingKey(null)}>
                          ביטול
                        </button>
                      )}
                      <div style={{ display: 'flex', gap: '.4rem', flexWrap: 'wrap' }}>
                        {regNames.map(r => (
                          <button
                            key={r.owner}
                            className={`btn btn-sm ${r.owner === regIntent ? 'btn-green' : 'btn-secondary'}`}
                            disabled={busy === busyKey}
                            title={regIntent === null
                              ? 'טרם נקבע מי הרשום - הבחירה כאן היא שתקבע'
                              : r.owner === regIntent
                                ? 'זו הכוונה שנרשמה בפתיחת הייצוג'
                                : 'שונה מהכוונה שנרשמה - יעדכן את התיק'}
                            onClick={() => { setEditingKey(null); void mark(r.owner); }}
                          >
                            {busy === busyKey ? 'שומר…' : r.label}
                          </button>
                        ))}
                      </div>
                    </>
                  ) : !at ? (
                    /* ‼ שני מסלולים, ובמפורש: האוטומציה פותחת את הבקשה בשע״ם
                       ומביאה את הטופס; «סמן כהוזן» נשאר למי שעשה את זה ביד.
                       סימון ידני אינו מתחזה לראיה חיצונית — הוא לא כותב מספר
                       בקשה, ולכן גם לא פותח את השידור האוטומטי. */
                    <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap', alignItems: 'flex-start' }}>
                      {/* ‼ «הזן את הפרטים בשע״ם» יושב בראש העמודה — פעם אחת. */}
                      <button className="btn btn-ghost btn-sm" disabled={busy === busyKey}
                        onClick={() => void mark()}>
                        {busy === busyKey ? 'שומר…' : 'סמן כהוזן ידנית'}
                      </button>
                    </div>
                  ) : (
                    /* ‼ חזרה לאחור. קישורים שקטים ולא כפתורים: זו פעולת תיקון,
                       והיא לא צריכה להתחרות בשלב הבא על תשומת הלב. */
                    <div style={{ display: 'flex', gap: '.75rem', flexWrap: 'wrap' }}>
                      {sub.carriesIncomeTax && regChoice && regVerified && (
                        <button type="button" className="btn btn-ghost btn-sm" disabled={busy === busyKey}
                          onClick={() => setEditingKey(sub.key)}>
                          שינוי בן/בת הזוג הרשום/ה
                        </button>
                      )}
                      <button type="button" className="btn btn-ghost btn-sm" disabled={busy === busyKey}
                        onClick={() => void unmarkEntry(sub.key, first)}>
                        {busy === busyKey ? 'שומר…' : 'ביטול הסימון'}
                      </button>
                    </div>
                  )}
                  {/* ‼ המזהה החיצוני מוצג ברגע שהוא קיים: ממנו נגזרת כל
                      פעולה הבאה מול שע״ם, והוא גם מה שהרו"ח מחפש שם ידנית. */}
                  {shaamRequestExists(shaamTrack(sub.key)) && (
                    <div style={{ fontSize: 'var(--fs-12)', color: 'var(--ink-3)', marginTop: '.4rem' }}>
                      {shaamTrack(sub.key)?.requestNumber
                        ? <>מספר בקשה בשע״ם: <span className="ltr-isolate">{shaamTrack(sub.key)!.requestNumber}</span></>
                        : 'הבקשה נמצאה ברשימת הבקשות בשע״ם (מספר הבקשה לא מוצג שם)'}
                      {shaamTrack(sub.key)?.formDocumentId ? ' · טופס ייפוי הכוח הובא לתיק הלקוח' : ''}
                      {/* ‼ לפני ההגשה בלבד: אחריה המצב של שע״ם יושב בשלב 6, והקריאה הישנה לא מוצגת. */}
                      {!shaamTrack(sub.key)?.submittedAt && shaamTrack(sub.key)?.rawRequestState
                        ? ` · סטטוס בשע״ם: ${shaamTrack(sub.key)!.rawRequestState}`
                        : ''}
                    </div>
                  )}
                </Step>
              );
            })}

            <Step n={2 + extraEntries.length} title="טופס ייפוי הכוח הועלה ואזורי החתימה סומנו" done={formReady}
              hint={formReady
                ? (poaDocs.length > 1
                    ? `${poaDocs.length} טפסים - מוכנים לשליחה`
                    : `${poaDocs[0]?.pdfFileName || 'הטופס'} - מוכן לשליחה`)
                : extraEntries.length
                  ? 'טופס לכל אדם - כל אחד עם התיקים שלו'
                  : 'העלו את קובץ ייפוי הכוח וסמנו איפה כל אחד חותם'}>
              <button className="btn btn-secondary btn-sm" onClick={onProduce}>
                {formReady ? '↺ החלף טופס או ערוך אזורים' : 'העלה טופס וסמן אזורי חתימה'}
              </button>
            </Step>

            {/* ‼ אין כאן כפתור. השליחה שייכת לשתי הרשויות גם יחד ולכן היא יושבת
                בפס המשותף שמתחת לשתי המשבצות — כפתור אחד, במקום אחד. */}
            <Step n={3 + extraEntries.length} title="נשלח לחתימת הלקוח" done={!!exec.signatureEmailSentAt}
              hint={exec.signatureEmailSentAt ? undefined
                : formReady ? 'השליחה בפס המשותף שמתחת - מייל אחד לשתי הרשויות'
                  : 'אפשרי אחרי הפקת הטופס'} />

            {/* ‼ שורה אחת לכל חותם שמספרת את כל הסיפור: מי הוא, לאן יצא (או
                לא יצא) מייל, איזו אסמכתא שייכת לו, ומה אפשר לעשות עכשיו.
                עד 23.09.2026 הופיע כאן שם בלבד, ורשימת הכתובות ישבה מתחת
                לכפתור השליחה בלי שמות — ולכן "למי זה נשלח?" לא הייתה שאלה
                שאפשר היה לענות עליה מהמסך. */}
            <Step n={4 + extraEntries.length} title="כל החותמים חתמו" done={signed}>
              {signers.length > 0 && !signed && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '.55rem' }}>
                  {signers.map(s => (
                    <SignerLine
                      key={s.id}
                      signer={s}
                      signed={effectiveSignStatus(request, s) === 'signed'}
                      email={signerEmail(s)}
                      track={niTrackFor(s)}
                      onCopiedLink={() => void markLinkHandedOver(s.role === 'spouse' ? 'spouse' : 'client')}
                    />
                  ))}
                </div>
              )}
            </Step>

            {/* החתימה והחותמת שלי — הטופס אינו שלם בלעדיהן, ואסור להגיש לשע״ם לפני.
                ‼ כשיש כמה טפסים, כל אחד נחתם ונצרב בנפרד: השלב אומר על מה חותמים
                עכשיו וכמה נשארו, אחרת נראה כאילו לחיצה אחת לא עשתה כלום. */}
            <Step n={5 + extraEntries.length} title="חתמתי והוספתי חותמת" done={stamped}
              hint={stamped
                ? (poaDocs.length > 1 ? `${poaDocs.length} טפסים חתומים - מוכנים להגשה` : 'הטופס החתום מוכן להגשה')
                : signed
                  ? (nextToStamp && poaDocs.length > 1
                      ? `נשארו ${stampsLeft} מתוך ${poaDocs.length} - הבא: ${nextToStamp.title}`
                      : 'הלקוח חתם - נשארה החתימה והחותמת שלכם')
                  : 'אפשרי אחרי שכל החותמים חתמו'}>
              {signed && !stamped && (
                <button className="btn btn-green btn-sm" onClick={onStamp}>
                  {poaDocs.length > 1 && nextToStamp
                    ? `חתום + הוסף חותמת · ${nextToStamp.title}`
                    : 'חתום + הוסף חותמת'}
                </button>
              )}
              {/* מה כבר נצרב — כדי שאחרי כל טופס יהיה חיווי שהוא נשמר */}
              {poaDocs.length > 1 && poaDocs.some(d => d.signedPdfStoredId) && !stamped && (
                <div style={{ fontSize: 'var(--fs-12)', color: 'var(--ink-3)', marginTop: '.4rem' }}>
                  {poaDocs.filter(d => d.signedPdfStoredId).map(d => `✓ ${d.title}`).join(' · ')}
                </div>
              )}
            </Step>

            <Step n={6 + extraEntries.length} title="נשלח לשע״ם" done={sentToShaam}
              hint={stamped && !sentToShaam ? 'שדרו את הטופס החתום לשע״ם (הכפתור בראש העמודה)' : undefined}>
              {/* ‼ אחרי ההגשה: שלוש עובדות מהמקור של שע״ם, לכל הגשה. בלי פרוזה,
                  בלי «בדקו שוב» (יש כפתור אחד למעלה), ובלי קריאה מלפני ההגשה. */}
              {submissions.map(sub => {
                const f = shaamSubmittedFacts(shaamTrack(sub.key));
                const docs = shaamTrack(sub.key)?.requiredDocuments ?? [];
                if (!f && docs.length === 0) return null;
                return (
                  <div key={sub.key} data-testid="shaam-submitted-facts" style={{ marginBottom: '.4rem', fontSize: 'var(--fs-13)', color: 'var(--ink-2)', lineHeight: 1.7 }}>
                    {sub.title && submissions.length > 1 && (
                      <div style={{ fontSize: 'var(--fs-12)', color: 'var(--ink-3)' }}>{sub.title}</div>
                    )}
                    {f && (
                      <>
                        <div>הוגש לשע״ם: {fmtDateTime(f.submittedAt)}</div>
                        {f.status && <div>סטטוס בשע״ם: <strong>{f.status}</strong></div>}
                        {f.suspensionEndsAt && <div>צפי לסיום ההשהייה: {fmt(f.suspensionEndsAt)}</div>}
                        {/* ‼ פעולת החובה עצמה היא שלב האישור שמתחת. רק כשאין שלב כזה — היא כאן. */}
                        {f.clientApprovalRequired && !repApproval && (
                          <Notice tone="required" style={{ marginTop: '.3rem' }}>
                            אישור הייצוג באזור האישי - נדרש: רשות המסים ממתינה לאישור הלקוח. בלי האישור הייצוג לא ייקלט.
                          </Notice>
                        )}
                      </>
                    )}
                    <ShaamRequiredDocsList docs={docs} />
                  </div>
                );
              })}
              {stamped && !sentToShaam && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '.5rem' }}>
                  {/* ‼ הסימון הידני נשאר — אבל כקישור שקט, לא ככפתור ראשי:
                      «נשלח לשע״ם» אמיתי נכתב רק מאישור קליטה של הרשות (194).
                      מי שהגיש ביד עדיין צריך דרך לומר את זה. */}
                  <button className="btn btn-ghost btn-sm" onClick={onMarkSentToShaam}>
                    שודר ידנית - סמנו כנשלח
                  </button>
                </div>
              )}
            </Step>

            {/* ── נתיב מזורז: הלקוח מאשר אותנו באזור האישי ──────────────────
                ‼ נפתח עם ההגשה לשע"ם ולא לפני — קודם לכן אין לו שם מה לאשר.
                ‼ שני שלבי אימות: הצהרת הלקוח מזיזה את הכדור אלינו ואינה
                סוגרת (אין לנו גישה לאזור האישי שלו), והסגירה קורית בכפתור
                של שלב 7 — אותו כפתור, לא כפתור שני. */}
            {repApproval && (
              <SideStep
                title={approvalRequired ? 'אישור הלקוח באזור האישי' : 'זירוז אישור הייצוג באזור האישי'}
                required={approvalRequired}
                done={isRepApprovalClosed(repApproval)}
                tone={declared || approvalRequired ? 'attention' : 'wait'}
                hint={
                  isRepApprovalClosed(repApproval)
                    ? undefined
                    : declared
                      ? 'הלקוח דיווח שאישר - ממתין לאימות בשע״ם'
                      : approvalRequired
                        ? 'נדרש - רשות המסים ממתינה לאישור הלקוח. בלי האישור הייצוג לא ייקלט. הבקשה מופיעה בדף האישי שלו'
                        : 'ממתין ללקוח - הבקשה מופיעה בדף האישי שלו'
                } />
            )}

            {/* ‼ שלב 7 הוא היעד. אין כאן «בדקו מול שע״ם» ואין מצב ביניים — המצב
                הנוכחי של שע״ם בשלב 6, והבדיקה בכפתור אחד ליד הכותרת. */}
            <Step n={7 + extraEntries.length} title="הייצוג פעיל" done={status === 'active'}>
              {status === 'awaiting_authorities' && (
                <button className="btn btn-ghost btn-sm" onClick={onMarkActive}>סמן ידנית כמיוצג פעיל</button>
              )}

              {/* ‼ הסימון לבדו לא שולח דבר. עד היום יצא כאן מייל אוטומטית והרו"ח
                  לא ידע שיצא — עכשיו זו פעולה נפרדת, אחרי שרואים את המייל. */}
              {status === 'active' && (
                activeEmails.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '.4rem' }}>
                    {activeEmails.map(m => (
                      <EmailStatusRow key={m.id} message={m} note="עדכון ללקוח: הייצוג אושר" onChanged={reloadEmails} />
                    ))}
                  </div>
                ) : (
                  <div style={{ fontSize: 'var(--fs-13)', color: 'var(--ink-3)', lineHeight: 1.6 }}>
                    <InfoLines style={{ marginBottom: '.4rem' }} items={[
                      'ℹ הלקוח לא עודכן במייל',
                      'המערכת לא שולחת מעצמה - אפשר לשלוח עדכון אחרי שרואים בדיוק מה ייצא',
                    ]} />
                    <button className="btn btn-secondary btn-sm" onClick={() => setPreviewActive(true)}>
                      עדכון ללקוח - תצוגה מקדימה
                    </button>
                  </div>
                )
              )}
            </Step>
          </Track>

          {/* ─────────── ביטוח לאומי ─────────── */}
          {/* מסלול לכל מבוטח: בב"ל לכל אחד תיק ואסמכתא נפרדים, ואיחוד שלהם
              לעמודה אחת היה מסתיר איזה מהשניים עדיין לא אושר. */}
          {(niTargetsClient || niTargetsSpouse) ? (
            <>
              {niTargetsClient && (
                <NiTrack
                  title={clientNiTitle}
                  ni={ni}
                  line={niLineFor('client')}
                  busy={busy}
                  busyPrefix="ni"
                  nextAction={niNextActionNode('client')}
                  hasSignatureEmails={signatureEmails.length > 0}
                  onPatch={(p, label) => patch({ ...exec, nationalInsurance: { ...ni, ...p } }, label)}
                  prereqStep={niClientStep}
                  prereqCurrentValues={niPrereqValues}
                  prereqClient={prereqClient}
                  prereqSpouse={prereqSpouse}
                  prereqOnSaveEmail={prereqOnSaveEmail}
                  prereqOnChanged={() => onStepsChanged?.()}
                />
              )}
              {niTargetsSpouse && (
                <NiTrack
                  title={`ב״ל - ${nameOf('spouse') || 'בן/בת הזוג'}`}
                  ni={niSpouse}
                  line={niLineFor('spouse')}
                  busy={busy}
                  busyPrefix="nis"
                  nextAction={niNextActionNode('spouse')}
                  hasSignatureEmails={signatureEmails.length > 0}
                  onPatch={(p, label) => patch({ ...exec, nationalInsuranceSpouse: { ...niSpouse, ...p } }, label)}
                  prereqStep={niSpouseStep}
                  prereqCurrentValues={niPrereqValues}
                  prereqClient={prereqClient}
                  prereqSpouse={prereqSpouse}
                  prereqOnSaveEmail={prereqOnSaveEmail}
                  prereqOnChanged={() => onStepsChanged?.()}
                />
              )}
            </>
          ) : (
            <div style={{ flex: '1 1 320px', minWidth: 0, border: '1px dashed var(--hairline-1)', borderRadius: 'var(--radius)', padding: '1rem', color: 'var(--ink-3)', fontSize: 'var(--fs-13)', display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
              לא התבקש ייצוג בביטוח לאומי עבור לקוח זה.
            </div>
          )}
        </div>

        {/* ─────────── השליחה ללקוח — משותפת לשתי הרשויות ─────────── */}
        {/* מייל אחד נושא את שתי הפעולות, ולכן הוא לא שייך לאף אחת מהעמודות.
            פס רוחב מלא ביניהן, ממורכז, כדי שיהיה ברור שהוא של שתיהן. */}
        <div style={{
          marginTop: '1rem',
          /* קו עליון אחד נושא את המצב: נשלח · מוכן לשליחה · עוד לא מוכן.
             הקו המקווקו הוא הרמז שהמייל עדיין לא ניתן לשליחה. */
          borderTop: `1px ${exec.signatureEmailSentAt ? 'solid var(--success)' : formReady ? 'solid var(--accent)' : 'dashed var(--hairline-1)'}`,
          padding: '.9rem 0',
          textAlign: 'center',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '.5rem', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 'var(--fs-17)' }}>{exec.signatureEmailSentAt ? '✓' : '✉'}</span>
            <span style={{ fontWeight: 600, fontSize: 'var(--fs-14)' }}>
              {exec.signatureEmailSentAt ? 'המייל נשלח ללקוח' : 'שליחה ללקוח'}
            </span>
          </div>
          <div style={{ fontSize: 'var(--fs-13)', color: 'var(--ink-3)', marginTop: 3, lineHeight: 1.6 }}>
            {(niTargetsClient || niTargetsSpouse)
              ? 'מייל אחד לשתי הרשויות - קישור אישי לחתימה על ייפוי הכוח, ומתחתיו האסמכתא והוראות האישור בביטוח הלאומי.'
              : 'מייל עם קישור אישי לחתימה על ייפוי הכוח, לכל חותם.'}
          </div>

          {!formReady && (
            <div style={{ fontSize: 'var(--fs-13)', color: 'var(--ink-3)', marginTop: '.5rem' }}>
              יתאפשר אחרי שהטופס יופק ואזורי החתימה יסומנו (שלב 2 במס הכנסה).
            </div>
          )}

          {formReady && !exec.signatureEmailSentAt && (
            <div style={{ marginTop: '.7rem' }}>
              <button className="btn btn-green" disabled={busy === 'send' || niRefMissing || pendingSigners.length === 0}
                onClick={() => (missingIds.length > 0 ? setConfirmSendWithoutId(true) : void handleSendAll(sendOnlyTo ?? undefined))}>
                {busy === 'send' ? 'שולח…'
                  : sendOnlyTo
                    ? `שלח ל${pendingSigners.find(s => s.id === sendOnlyTo)?.name || 'חותם'}`
                    : `שלח ללקוח${emailableSigners.length > 1 ? ` (${emailableSigners.length} חותמים)` : ''}`}
              </button>
              {/* ‼ בחירת נמענים — קיימת רק כששני החותמים באמת יכולים לקבל.
                  שליחה לאחד בלבד היא בחירה לגיטימית: הוא מעביר לשני מדף
                  החתימה (חתימה יחד באותו מכשיר, מייל, או קישור). */}
              {emailableSigners.length > 1 && !niRefMissing && (
                <div style={{ marginTop: '.5rem', display: 'flex', gap: '.9rem', flexWrap: 'wrap', justifyContent: 'center', fontSize: 'var(--fs-13)', color: 'var(--ink-2)' }}>
                  <label style={{ display: 'flex', gap: '.3rem', alignItems: 'center', cursor: 'pointer' }}>
                    <input type="radio" name="send-to" checked={sendOnlyTo === null}
                      onChange={() => setSendOnlyTo(null)} />
                    לכל אחד מייל נפרד
                  </label>
                  {emailableSigners.map(s => (
                    <label key={s.id} style={{ display: 'flex', gap: '.3rem', alignItems: 'center', cursor: 'pointer' }}>
                      <input type="radio" name="send-to" checked={sendOnlyTo === s.id}
                        onChange={() => setSendOnlyTo(s.id)} />
                      רק ל{s.name || s.email}
                    </label>
                  ))}
                </div>
              )}
              {pendingSigners.length > 0 && !niRefMissing && (
                <>
                  <div style={{ fontSize: 'var(--fs-12)', color: 'var(--ink-3)', marginTop: '.4rem', lineHeight: 1.6 }}>
                    {pendingSigners.map(s => {
                      const skip = sendOnlyTo ? s.id !== sendOnlyTo : !s.email.trim();
                      return (
                        <div key={s.id} style={{ opacity: skip ? 0.55 : 1 }}>
                          {s.name || 'חותם'} — <span dir="ltr">{s.email.trim() || 'אין מייל'}</span>
                          {skip ? ' · לא ייכלל' : ''}
                        </div>
                      );
                    })}
                  </div>
                  <button
                    type="button"
                    onClick={() => setPreviewSignerId(pendingSigners[0].id)}
                    style={{
                      background: 'none', border: 'none', padding: 0, marginTop: '.3rem', font: 'inherit',
                      fontSize: 'var(--fs-13)', color: 'var(--accent)', textDecoration: 'underline', cursor: 'pointer',
                    }}
                  >
                    לראות מה ייצא ללקוח
                  </button>
                </>
              )}
              {niRefMissing && (
                <div style={{ margin: '.55rem auto 0', maxWidth: 460, padding: '.45rem .6rem', background: 'transparent', borderRadius: 'var(--radius)', fontSize: 'var(--fs-13)', color: 'var(--ink-1)', lineHeight: 1.6 }}>
                  חסום עד להזנת מספר האסמכתא{missingRefFor ? ` של ${missingRefFor}` : ''} במשבצת הביטוח הלאומי -
                  אחרת {niTargetsSpouse ? 'מי שחסרה לו אסמכתא יקבל מייל בלי חלק הב״ל' : 'הלקוח יקבל מייל בלי חלק הב״ל'}.
                </div>
              )}
            </div>
          )}

          {/* המייל שיצא — מוצג פעם אחת בלבד, כאן */}
          {signatureEmails.length > 0 && (
            <div style={{ marginTop: '.7rem', display: 'flex', flexDirection: 'column', gap: '.4rem', textAlign: 'start' }}>
              {signatureEmails.map(m => (
                <EmailStatusRow key={m.id} message={m} onRemind={() => handleRemind(m)} onChanged={reloadEmails} />
              ))}
            </div>
          )}
        </div>

        {note && (
          <Notice tone={note.kind === 'ok' ? 'success' : 'danger'} style={{ marginTop: '.9rem' }}>
            {note.kind === 'ok' ? '✓ ' : '⚠ '}{note.text}
          </Notice>
        )}
      </div>

      {previewActive && (
        <EmailPreviewDialog
          heading="עדכון ללקוח - הייצוג אושר"
          body={{ requestId: request.id, stage: 'active' }}
          onSent={reloadEmails}
          onClose={() => setPreviewActive(false)}
        />
      )}

      {confirmSendWithoutId && (
        <ConfirmDialog
          tone="normal"
          title="לשלוח לחתימה בלי צילום תעודה?"
          message={<>
            <div>טרם התקבל צילום תעודה של: <b>{missingIds.map(m => m.name).join(', ')}</b>.</div>
            <div style={{ marginTop: '.4rem' }}>אפשר לשלוח לחתימה גם עכשיו; הצילום ימשיך להופיע כחסר עד שיגיע - מהדף האישי של הלקוח או מהעלאה בתיק המסמכים.</div>
          </>}
          confirmLabel="שלח בכל זאת"
          onCancel={() => setConfirmSendWithoutId(false)}
          onConfirm={() => { setConfirmSendWithoutId(false); void handleSendAll(); }}
        />
      )}

      {previewSignerId && (
        <EmailPreviewDialog
          readOnly
          heading="תצוגה מקדימה - מייל החתימה"
          body={{ requestId: request.id, stage: 'sign', signerId: previewSignerId }}
          onSent={reloadEmails}
          onClose={() => setPreviewSignerId(null)}
        />
      )}
    </div>
  );
}

/**
 * שורת חותם אחד: מי הוא, מה קרה למייל שלו, איזו אסמכתא שייכת לו, ומה אפשר
 * לעשות עכשיו. ‼ השורה הזאת היא התשובה לשאלה "למי זה נשלח?" — שעד
 * 23.09.2026 לא הייתה לה תשובה בשום מסך.
 *
 * ‼ שתי עובדות נפרדות שאסור לערבב:
 *   · **המייל** (נמסר/נפתח) — מצב המסירה לכתובת. תיבה משותפת לשני בני הזוג
 *     תיראה כאן פעמיים, וזה בסדר: זו באמת אותה תיבה.
 *   · **האסמכתא** — האם ההוראות של **האדם הזה** יצאו. זו עובדה פר-אדם,
 *     והיא זו שחשפה שיאיר סומן כמי שקיבל בלי שיצא אליו דבר.
 */
function SignerLine({ signer, signed, email, track, onCopiedLink }: {
  signer: RepSigner;
  signed: boolean;
  email?: { toEmail: string; sentAt: string; openedAt?: string; clickedAt?: string; status: string };
  track?: NiTracking;
  onCopiedLink: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const hasAddress = !!signer.email.trim();
  const opened = !!email && (!!email.openedAt || ['opened', 'clicked'].includes(email.status));
  const bounced = !!email && ['bounced', 'complained', 'failed'].includes(email.status);
  const link = signer.signToken ? `${window.location.origin}/?sign=${signer.signToken}` : '';
  // ‼ האסמכתא לא נמסרה — הפער שאין לו שום סימן אחר במסך.
  const refPending = !!track?.referenceNumber && !track.instructionsSentAt;
  const handedByLink = track?.instructionsSentWith === 'link';

  const copy = async () => {
    if (!link) return;
    try { await navigator.clipboard.writeText(link); } catch { return; }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2500);
    onCopiedLink();
  };

  const tone = signed ? 'var(--text-success, var(--success-text))'
    : bounced || (!hasAddress && !handedByLink) || refPending ? 'var(--danger)'
    : 'var(--ink-3)';

  const detail = signed
    ? 'חתם/ה'
    : [
        hasAddress ? signer.email : 'אין כתובת מייל',
        email ? `נשלח ${fmtTime(email.sentAt)}${opened ? ' · נפתח ✓' : ''}${bounced ? ' · חזר ✗' : ''}` : (hasAddress ? 'טרם נשלח' : 'לא נשלח אליו דבר'),
        handedByLink ? 'הקישור נמסר ידנית' : null,
        track?.referenceNumber
          ? (refPending ? `אסמכתא ${track.referenceNumber} טרם נמסרה` : `אסמכתא ${track.referenceNumber}`)
          : null,
      ].filter(Boolean).join(' · ');

  return (
    <div style={{ display: 'flex', gap: '.5rem', alignItems: 'flex-start' }}>
      <span style={{ color: tone, lineHeight: 1.5 }}>{signed ? '✓' : refPending || bounced || !hasAddress ? '⚠' : '⏳'}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 'var(--fs-13)', color: 'var(--ink-1)' }}>{signer.name || signer.email}</div>
        <div style={{ fontSize: 'var(--fs-12)', color: refPending ? 'var(--danger)' : 'var(--ink-3)', marginTop: 2, lineHeight: 1.6 }}>
          {detail}
        </div>
        {!signed && link && (
          <button type="button" onClick={() => void copy()}
            style={{
              background: 'none', border: 'none', padding: 0, marginTop: '.3rem', font: 'inherit',
              fontSize: 'var(--fs-12)', color: 'var(--accent)', textDecoration: 'underline', cursor: 'pointer',
            }}>
            {copied ? '✓ הקישור הועתק' : 'העתק קישור חתימה אישי'}
          </button>
        )}
      </div>
    </div>
  );
}

/** שעה קצרה לשורת החותם. */
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
}

/**
 * מסלול הביטוח הלאומי של מבוטח אחד. בב"ל לכל אדם תיק נפרד, ולכן זוג שמיוצג
 * בב"ל מקבל שני מסלולים כאלה — לכל אחד אסמכתא, מועד תפוגה ואישור משלו.
 */
function NiTrack({
  title, ni, line, busy, busyPrefix, nextAction, hasSignatureEmails, onPatch,
  prereqStep, prereqCurrentValues, prereqClient, prereqSpouse, prereqOnSaveEmail, prereqOnChanged,
}: {
  title: string;
  ni: NiTracking;
  /** הראיה של הכרטיס (niRepresentationOf) — «פעיל» שם גובר על כל מצב ביניים. */
  line?: NiRepresentationLine | null;
  busy: string | null;
  /** מבדיל בין מצבי ה"שומר…" של שני המסלולים, שלא יידלקו יחד */
  busyPrefix: string;
  /** הפעולה ההקשרית של האדם הזה (פרק 17) — נגזרת בהורה לפי role מפורש. */
  nextAction?: React.ReactNode;
  hasSignatureEmails: boolean;
  onPatch: (p: Partial<NiTracking>, label: string) => void;
  /**
   * ‼ 165: שלב «בקשות» של המסלול הזה — כשיש תנאי-קדם חסרים, ארבעת הצעדים
   * למטה (הזנה/אסמכתא/הוראות/אישור) מוחלפים בשער תנאי-הקדם. הכותרת, הגבול
   * והמונה של העמודה עצמה (Track) נשארים — המסלול לא נעלם, רק הפקדים שלו.
   * חסר (undefined/null) ⇒ אין תנאי-קדם ידועים, מתנהג כמו לפני 165.
   */
  prereqStep?: OnboardingStep | null;
  prereqCurrentValues?: Record<string, string | undefined>;
  prereqClient?: PrerequisitePerson;
  prereqSpouse?: PrerequisitePerson;
  prereqOnSaveEmail?: (role: 'client' | 'spouse', email: string) => Promise<void>;
  prereqOnChanged?: () => void;
}) {
  const [refNumber, setRefNumber] = useState(ni.referenceNumber || '');
  const [deadline, setDeadline] = useState(ni.deadline || '');

  /* ‼ הבאג שהוליד את 195 בצד המסך: `useState(ni.x)` קורא את הערך **פעם
     אחת**, ברינדור הראשון — ובו הבקשה עדיין נטענת ו-`ni` הוא `{}`. כשהערך
     האמיתי הגיע (מהאוטומציה או משמירה), הצעד למעלה נצבע ירוק והשובל
     "נותרו N ימים" הופיע — ושני השדות נשארו ריקים עם ה-placeholder
     (73882698), כך שהם **נראו** ריקים גם אחרי רענון. כאן מסתנכרנים עם
     הערך שהשרת מחזיק; התלות היא הערך עצמו, ולכן הקלדה של הרו"ח נדרסת רק
     כשהשרת באמת שינה את הערך. ראה memory/stale-client-after-server-write. */
  useEffect(() => { setRefNumber(ni.referenceNumber || ''); }, [ni.referenceNumber]);
  useEffect(() => { setDeadline(ni.deadline || ''); }, [ni.deadline]);

  const external = niExternalEvidence(ni);
  // ‼ סדר קדימות (representationCenter.niTrackView): סופי > נוכחי > היסטורי.
  const view = niTrackView(ni, line);
  const steps = [!!ni.enteredAt, !!ni.referenceNumber, !!ni.instructionsSentAt, view.final];
  const sentWithSignature = ni.instructionsSentWith === 'signature';
  const k = (suffix: string) => `${busyPrefix}-${suffix}`;


  const executionSteps = (
    <>
      {/* ‼ `foundExternally` (195): הרישום נמצא קיים בב"ל ולא נוצר מכאן —
          כמעט תמיד כי הוזן ידנית בפורטל. הצעד בוצע, אבל לא "סומן" על ידינו,
          והמסך לא ייחס לעצמו פעולה שלא עשה. */}
      <Step n={1} title="ייפוי הכוח הוזן באתר ב״ל" done={!!ni.enteredAt}
        hint={!ni.enteredAt ? 'מסך "הוספת ייפוי כח מבוטח" - ארבעת השדות מהבלוק שמעל'
          : ni.foundExternally ? `נמצא קיים באתר ב״ל (הוזן שם, לא מכאן) · אותר ב-${fmt(ni.enteredAt)}`
          : `סומן ב-${fmt(ni.enteredAt)}`}>
        {!ni.enteredAt && (
          <button className="btn btn-secondary btn-sm" disabled={busy === k('entered')}
            onClick={() => onPatch({ enteredAt: new Date().toISOString() }, k('entered'))}>
            {busy === k('entered') ? 'שומר…' : 'סמן כהוזן'}
          </button>
        )}
      </Step>

      <Step n={2} title="מספר אסמכתא ומועד אחרון לאישור" done={!!ni.referenceNumber}
        hint={view.editableReference
          ? 'ב״ל מציג אותם במסך שאחרי ההזנה'
          : `אסמכתא ${ni.referenceNumber || '-'}${ni.deadline ? ` · מועד אחרון ${fmt(ni.deadline)}` : ''}`}>
        {/* ‼ במצב סופי האסמכתא היא עובדה, לא טופס לעריכה. */}
        {view.editableReference && (
        <div style={{ display: 'flex', gap: '.4rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ flex: '1 1 130px' }}>
            <div style={{ fontSize: 'var(--fs-12)', color: 'var(--ink-3)' }}>מספר אסמכתא</div>
            <input value={refNumber} dir="ltr" inputMode="numeric" placeholder="73882698"
              onChange={e => setRefNumber(e.target.value.replace(/\D/g, ''))}
              style={{ width: '100%', textAlign: 'left' }} />
          </div>
          <div style={{ flex: '1 1 130px' }}>
            <div style={{ fontSize: 'var(--fs-12)', color: 'var(--ink-3)' }}>מועד אחרון</div>
            <input type="date" value={deadline} min={todayISO()}
              onChange={e => setDeadline(e.target.value)} style={{ width: '100%' }} />
          </div>
          <button className="btn btn-primary btn-sm" disabled={busy === k('ref') || !refNumber.trim()}
            onClick={() => onPatch({ referenceNumber: refNumber.trim(), deadline: deadline || undefined }, k('ref'))}>
            {busy === k('ref') ? 'שומר…' : 'שמירה'}
          </button>
        </div>
        )}
        {view.deadlineNotice && (
          <Notice tone={view.deadlineNotice.tone} style={{ marginTop: '.45rem' }}>
            {view.deadlineNotice.text} {ni.deadline && `(${fmt(ni.deadline)})`}
          </Notice>
        )}
      </Step>

      <Step n={3} title="ההוראות הגיעו למבוטח" done={sentWithSignature || !!ni.instructionsSentAt}
        hint={
          sentWithSignature ? 'נכללו במייל בקשת החתימה - מייל אחד לשתי הפעולות'
          // ‼ קישור שנמסר ביד הוא ראיה חלשה יותר ממייל: יודעים שהוא יצא
          // מכאן, לא שהוא הגיע. הצעד נסגר, אבל אומר בדיוק מה קרה.
          : ni.instructionsSentWith === 'link' ? `הקישור האישי הועתק ונמסר ידנית ב-${fmt(ni.instructionsSentAt)}`
          : ni.instructionsSentAt ? `נשלחו בנפרד ב-${fmt(ni.instructionsSentAt)}`
          : `יישלחו יחד עם בקשת החתימה: אסמכתא, מועד אחרון, ואישור באתר ב״ל או בטלפון ${NI_APPROVAL_PHONE}`
        }>
        {/* ‼ אין כאן כפתור שליחה. ההוראות תמיד יוצאות עם מייל החתימה —
            שליחה נפרדת גורמת למבוטח לקבל שני מיילים על אותו תהליך. */}
        {/* ‼ הסבר «מה עוד יקרה» — רק כשזה עוד לא קרה. אחרי שההוראות יצאו (או
            שהייצוג כבר פעיל) זה הסבר על עבר. */}
        {/* ‼ בלי אסמכתא — השורה שמעל כבר אומרת בדיוק את זה; לא חוזרים עליה. */}
        {!hasSignatureEmails && !sentWithSignature && !ni.instructionsSentAt && !view.final && ni.referenceNumber && (
          <Notice tone="info">ℹ האסמכתא נשמרה. היא תיכלל במייל שנשלח מהפס המשותף שמתחת.</Notice>
        )}
      </Step>

      <Step n={4} title="אושר - הייצוג בב״ל פעיל" done={view.final}
        hint={ni.confirmedAt ? `אושר ב-${fmt(ni.confirmedAt)}` : view.final ? 'פעיל לפי תיק ב״ל בכרטיס' : ni.referenceNumber ? 'ממתין לאישור המבוטח בב״ל' : undefined}>
        {/* ‼ 195 — מה שביטוח לאומי **אמרה** בקריאה האחרונה, במילים שלה.
            הצעד נשאר לא-מסומן עד שהמצב שנקרא היה «מאושר»; השורה הזאת קיימת
            כדי שהמסך לא ישתוק על «ממתין לאישור» ויותיר את הרו"ח לנחש. */}
        {external && view.showExternalEvidence && (
          <Notice tone={external.tone === 'warn' ? 'warning' : 'info'} style={{ marginBottom: '.45rem' }}>
            ביטוח לאומי: <b>{external.label}</b>
            {external.raw && ` ("${external.raw}")`}
            {external.at && ` · נקרא ${fmt(external.at)}`}
          </Notice>
        )}
        {view.showManualConfirm && (
          <button className="btn btn-secondary btn-sm" disabled={busy === k('conf')}
            onClick={() => onPatch({ confirmedAt: new Date().toISOString() }, k('conf'))}>
            {busy === k('conf') ? 'שומר…' : 'סמן כאושר'}
          </button>
        )}
      </Step>
    </>
  );

  return (
    <Track
      title={title}
      subtitle="הזנה ידנית · המבוטח מאשר את האסמכתא"
      done={steps.filter(Boolean).length}
      total={steps.length}
      tone="🛡"
      nextAction={nextAction}
    >
      {prereqStep && prereqClient && prereqSpouse ? (
        <PrerequisiteGate
          step={prereqStep}
          currentValues={prereqCurrentValues ?? {}}
          client={prereqClient}
          spouse={prereqSpouse}
          onSaveEmail={prereqOnSaveEmail ?? (async () => {})}
          onChanged={() => prereqOnChanged?.()}
        >
          {executionSteps}
        </PrerequisiteGate>
      ) : executionSteps}
    </Track>
  );
}
