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
import type { Engagement, OnboardingStep } from '../types/onboarding';
import { isStepOpen } from '../types/onboarding';
import PrerequisiteGate, { type PrerequisitePerson } from './PrerequisiteGate';
import { supabase } from '../lib/supabase';
import { engagementFromDb } from '../lib/dbMappers';
import { formatRoute } from '../lib/appRoute';
import {
  clientProcessPublished, engagementsOf, isPublishedStep, openIntake, visibleOnClientPage,
} from '../utils/clientPageGate';
import {
  registeredFileInfo, registeredSpouseSentence, hasRegisteredSpouseChoice, registeredOwnerOf,
  clientDisplayName, spouseDisplayName,
} from '../features/annualReport/profile';
import { getRequestSigners, effectiveSignStatus } from '../utils/repSigners';
import { shaamSubmissions, requestScope, peopleFromClient, targetsOf } from '../utils/repScope';
import { signatureDocumentsOf, allDocumentsStamped } from '../utils/repDocuments';
import type { RepIdentityDocEntry } from '../types';
import { form2279BothSign, matchRegisteredPersonName, verifyForm2279Layout } from '../features/representation/shaamRepresentation';
import { readForm2279Layout } from '../utils/form2279Layout';
import { useDocumentDB, type StoredDoc } from '../hooks/useIndexedDB';
import { useEmailMessages } from '../hooks/useEmailMessages';
import {
  useRepApprovalStep, isRepApprovalClosed, isRepApprovalDeclared,
} from '../hooks/useRepApprovalStep';
import type { RepApprovalStep } from '../hooks/useRepApprovalStep';
import EmailStatusRow from './EmailActivity/EmailStatusRow';
import EmailPreviewDialog from './EmailActivity/EmailPreviewDialog';
import { isUnknownEmailStatus, isUnknownSendReply, unknownSendText } from '../types/emailActivity';
import { UNKNOWN_OUTCOME_TEXT } from '../../supabase/functions/_shared/resendResult.ts';
import type { RepSigner } from '../types';
import { ShaamRequiredDocsList } from './ShaamRequiredDocsList';
import ShaamDropAuthorityButton from './ShaamDropAuthorityButton';
import RepresentationReconcileButton, { type ReconcileTarget } from './RepresentationReconcileButton';
import NiNextActionButton from './NiNextActionButton';
import NiCancelRequest from './NiCancelRequest';
import { niPersons, niRepresentationOf, niRepresentationAction, niExternalEvidence } from '../utils/niPersons';
import { shaamRepresentationAction } from '../features/taxFile/shaamRepresentationAction';
import type { ShaamActionKind } from '../features/taxFile/shaamRepresentationAction';
import ShaamNextActionButton from './ShaamNextActionButton';
import type { ShaamSubmission } from '../utils/repScope';
import {
  shaamDocumentsBlocked,
  type ShaamRequestTracking,
} from '../features/representation/shaamRepresentation';
import {
  NOTICE_STYLES, columnAction, isReconcileAction, niTrackView, shaamSubmittedFacts, type NoticeTone,
  niReconcileLine, niReconcileLineFromJob, shaamReconcileLine, niInstructionsDelivered,
} from '../features/representation/representationCenter';
import { shaamPersonFacts } from '../features/representation/shaamPersonFacts';
import type { NiRepresentationLine } from '../utils/niPersons';
import { representationInsight } from '../utils/representationInsight';
import ConfirmDialog from './ui/ConfirmDialog';
import {
  shaamPreSigningDocs, shaamClientDocumentsPending, type ShaamPreSigningDoc,
} from '../features/representation/shaamPreSigningDocs';
import {
  prepareRequestForSigning, preparedDocumentsSentence, confirmShaamRequestCancelled,
} from '../lib/representationSigning';
import ShaamPreSigningDocsList from './ShaamPreSigningDocsList';
import { repCenterPlan, type RcPrepareItem } from '../features/representation/repCenterPlan';
import { shaamSettled } from '../features/representation/shaamRepresentation';
import RepDocuments, { PoaViewer, type PoaEntry, type IdEntry } from './RepDocuments';
import { signatureReadiness, placesSentence } from '../features/representation/signatureReadiness';
import { repPreparationFacts, shaamEnteredAt, type ShaamPrepFact } from '../features/representation/repPreparation';
import IdentityDocAttach from './IdentityDocAttach';
import { shaamDocumentsView } from '../features/representation/shaamDocumentsGate';
import type { ViewerFile } from './DocumentViewerDialog';
import { useDocumentPdfBuilds, pdfBuildFor } from '../hooks/useDocumentPdfBuilds';
import { currentPoaVersion, noPoaReason, clientFieldsOf, type PoaVersion } from '../features/representation/poaVersion';
import { burnSignaturesIntoPdf } from '../utils/signaturePdf';
import { decodeForDisplay, sniffFormat } from '../utils/imageToPdf';
import RepApprovalGuide, { RepApprovalGuideButton, repApprovalSummary, type RepApprovalPerson } from './portal/RepApprovalGuide';
import { REP_PORTAL_CARD_FIXED } from '../../supabase/functions/_shared/repTemplates.ts';
import './repCenter.css';

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
  /**
   * «מה מסמנים באזור האישי» — למסך הבדיקה בלבד, כמו repApprovalOverride. `undefined` =
   * מהשרת (הפריט rep_approval בדף, approvals). ‼ לא בקוד אמיתי.
   */
  repApprovalPeopleOverride?: RepApprovalPerson[] | null;
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
  /**
   * ‼ 03.10 · ההתקשרויות של הלקוח (אותו מקור כמו steps — onboarding.engagements) — כדי
   * שהמרכז יאמר «מופיע בדף האישי» רק כשהשער של הדף באמת פתוח (clientPageGate, התאום של
   * client_step_gate_open). חסר ⇒ נקראות כאן פעם אחת (קריאה בלבד), כמו useRepApprovalStep.
   */
  engagements?: Engagement[];
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
  /**
   * ‼ 218 · השרת מכין את מקומות החתימה כשהטופס מגיע (העובד בודק את התבנית). כשהעובד לא
   * בדק — המרכז בודק כאן ושולח את התוצאה, והשרת בונה (prepare_shaam_signature_documents).
   * מחזיר את מה שקרה לכל הגשה, או null כשהקריאה נכשלה.
   */
  onPrepareShaamForms?: (layouts: ShaamFormLayouts) => Promise<Record<string, string> | null>;
  /** «פרטי הלקוח להזנה ברשויות» — נפתח מעצמו רק כשמזינים (שלב ההכנה). */
  dataPanel?: React.ReactNode;
  /** «פרטי הבקשה» (מייל, סוג ייפוי הכוח, הערות) — סגור כברירת מחדל. */
  requestPanel?: React.ReactNode;
  /**
   * ‼ 01.10.2026 · הקובץ החתום נפתח מ«מסמכי הבקשה» (צפייה + הורדה). כאן רק
   * «יצירה מחדש» — פעולה נדירה שנשארה מהאזור הקודם.
   */
  onRegenerateSignedPdf?: () => void;
  regeneratingSignedPdf?: boolean;
  /**
   * מסך בדיקה בלבד: מאיפה נקראים הקבצים (טופס, צילום). במסך האמיתי — מאגר המסמכים.
   * ‼ בלי זה מסך בדיקה מבודד (בלי מסד) לא יכול להציג את הטופס ואת מקומות החתימה.
   */
  documentSourceOverride?: { getDoc: (id: string) => Promise<StoredDoc | undefined> };
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
/**
 * «לא ידוע אם המייל יצא» — גם כשהמארח עטף את המשפט של השרת במשפט משלו
 * («המייל לא נשלח (…)»). ‼ זה לעולם לא «נכשל»: ייתכן שהמייל כבר אצל הנמען.
 */
function isUnknownSendError(err: string | null | undefined): boolean {
  return !!err && (isUnknownSendReply(err) || err.includes(UNKNOWN_OUTCOME_TEXT));
}

/** צבע «לא ידוע אם יצא» — כתום, לא אדום (הכלל של EMAIL_STATUS_STYLE.unknown). */
const UNKNOWN_TEXT_STYLE: React.CSSProperties = { color: 'var(--chip-amber-tx)' };

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
 * שלב בציר של רשות. ‼ «נוכחי» = הראשון שלא הושלם — נקבע ב-CSS (repCenter.css),
 * כדי שכל רשימה תסמן את השלב הבא שלה בלי שכל קורא יחשב אותו.
 */
function Step({ title, done, hint, children }: {
  n?: number; title: string; done: boolean; hint?: string; children?: React.ReactNode;
}) {
  return (
    <div className="rc-step" data-done={done ? 'true' : 'false'}>
      <div className="rc-dot" aria-hidden="true">{done ? '✓' : ''}</div>
      <div style={{ minWidth: 0 }}>
        <div className="rc-step-title">{title}</div>
        {hint && <div className="rc-step-hint">{hint}</div>}
        {children && <div className="rc-step-body">{children}</div>}
      </div>
    </div>
  );
}

/**
 * נתיב מזורז — ענף של השלב שמעליו, לא שלב בשרשרת (בלי מספר, מוזח פנימה).
 * ‼ 201 · כששע״ם דורשת אותו («ממתין לאישור לקוח») הוא «חובה», לא «אופציונלי».
 */
function SideStep({ title, done, hint, required, children }: {
  title: string; done: boolean; tone?: 'wait' | 'attention'; hint?: string; required?: boolean; children?: React.ReactNode;
}) {
  return (
    <div className="rc-step rc-step-side" data-done={done ? 'true' : 'false'}>
      <div className="rc-dot" aria-hidden="true">{done ? '✓' : ''}</div>
      <div style={{ minWidth: 0 }}>
        <div className="rc-step-title">
          {title}
          <span className="rc-step-tag" data-required={required ? 'true' : 'false'}>{required ? 'חובה' : 'אופציונלי'}</span>
        </div>
        {hint && <div className="rc-step-hint">{hint}</div>}
        {children && <div className="rc-step-body">{children}</div>}
      </div>
    </div>
  );
}

function Chevron() {
  return (
    <svg className="rc-chevron" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M5 8l5 5 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * שורת רשות אחת: שם, מצב במשפט אחד, והפירוט המלא רק בלחיצה.
 * ‼ המצב הוא המידע; הצבע רק כשהוא אומר משהו (דורש תשומת לב / הושלם).
 */
function AuthRow({ name, scope, status, tone, defaultOpen, testId, children }: {
  name: string; scope?: string; status: string; tone?: 'attention' | 'danger' | 'done';
  defaultOpen?: boolean; testId?: string; children: React.ReactNode;
}) {
  const [open, setOpen] = useState(!!defaultOpen);
  return (
    <div className="rc-row" data-open={open ? 'true' : 'false'} data-testid={testId}>
      <button type="button" className="rc-row-head" aria-expanded={open} onClick={() => setOpen(o => !o)}>
        <div style={{ minWidth: 0 }}>
          <div className="rc-row-name">{name}{scope && <span className="rc-row-scope">{scope}</span>}</div>
          {/* ‼ פתוח — העובדות שבגוף מחליפות את שורת הסיכום (בלי לומר אותו דבר פעמיים). */}
          {!open && <div className="rc-row-status" data-tone={tone}>{status}</div>}
        </div>
        <span className="rc-row-end"><Chevron /></span>
      </button>
      {open && <div className="rc-row-body">{children}</div>}
    </div>
  );
}

/**
 * ‼ 01.10.2026 · גוף של שורת רשות: «מה חסר / הצעד הבא» (רק כשיש), עובדות קצרות
 * עם תווית, וכל השלבים, ההסברים והפעולות הידניות — מאחורי קישור אחד.
 * גיא: «פתיחת פירוט הרשויות מחזירה רשימה ארוכה של שלבים, הסברים, שמות קבצים ומידע חוזר».
 */
function Facts({ items }: { items: { label: string; value: React.ReactNode; tone?: 'done' | 'wait' }[] }) {
  return (
    <dl className="rc-facts-grid" data-testid="rc-facts">
      {items.map(f => (
        <div key={f.label}><dt>{f.label}</dt><dd data-tone={f.tone}>{f.value}</dd></div>
      ))}
    </dl>
  );
}

function NowBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rc-now" data-testid="rc-now">
      <div className="rc-now-title">{title}</div>
      {children}
    </div>
  );
}

/** «כל השלבים והפרטים» — הציר המלא, עריכה וסימונים ידניים. סגור, אלא אם צריך לפעול בתוכו. */
function History({ defaultOpen, children }: { defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(!!defaultOpen);
  return (
    <details className="rc-history" open={open} data-testid="rc-history"
      onToggle={e => setOpen((e.currentTarget as HTMLDetailsElement).open)}>
      <summary>{open ? 'הסתרת השלבים והפרטים' : 'כל השלבים והפרטים'}</summary>
      {open && children}
    </details>
  );
}

/**
 * פתיחה לפי דרישה — אותה שורה בדיוק כמו שורת רשות (שם, שורה משנית, חץ).
 * ‼ עד שהרו"ח לוחץ, הפתיחה עוקבת אחרי המצב (defaultOpen); אחרי לחיצה — הלחיצה גוברת.
 * קודם זה נקבע ברינדור הראשון בלבד, ולכן טבלת ההעתקה נשארה פתוחה גם אחרי שההכנה נגמרה.
 */
function More({ title, meta, defaultOpen, testId, children }: {
  title: string; meta?: string; defaultOpen?: boolean; testId?: string; children: React.ReactNode;
}) {
  const [userOpen, setUserOpen] = useState<boolean | null>(null);
  const open = userOpen ?? !!defaultOpen;
  return (
    <div className="rc-row" data-open={open ? 'true' : 'false'} data-testid={testId}>
      <button type="button" className="rc-row-head" aria-expanded={open} onClick={() => setUserOpen(!open)}>
        <div style={{ minWidth: 0 }}>
          <div className="rc-row-name">{title}</div>
          {meta && <div className="rc-row-meta">{meta}</div>}
        </div>
        <span className="rc-row-end"><Chevron /></span>
      </button>
      {open && <div className="rc-row-body rc-more-body">{children}</div>}
    </div>
  );
}

/** פריט אחד ברשימת «מה הלקוח יתבקש» / «מה פתוח אצל הלקוח». */
interface AskItem { key: string; title: string; detail?: string; state?: string; tone?: 'wait' | 'done'; done?: boolean }

function AskList({ title, items }: { title?: string; items: AskItem[] }) {
  if (items.length === 0) return null;
  return (
    <div data-testid="rc-asks">
      {title && <div className="rc-asks-title">{title}</div>}
      <ol className="rc-asks">
        {items.map((a, i) => (
          <li key={a.key} className="rc-ask" data-state={a.done ? 'done' : 'open'} data-testid="rc-ask">
            <span className="rc-ask-n">{a.done ? '✓' : i + 1}</span>
            <div style={{ minWidth: 0 }}>
              <div className="rc-ask-title">{a.title}{a.state && <span className="rc-ask-state" data-tone={a.tone}>{a.state}</span>}</div>
              {a.detail && <div className="rc-ask-detail">{a.detail}</div>}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

/** טופס האסמכתא של ב״ל — אותו רכיב בשורת «לפני השליחה» ובפירוט של ב״ל. */
function NiRefForm({ ni, busy, onSave }: {
  ni: NiTracking; busy: boolean; onSave: (ref: string, deadline?: string) => void;
}) {
  const [refNumber, setRefNumber] = useState(ni.referenceNumber || '');
  const [deadline, setDeadline] = useState(ni.deadline || '');
  // ‼ 195: useState קורא את הערך פעם אחת; מסתנכרנים כשהשרת שינה אותו.
  useEffect(() => { setRefNumber(ni.referenceNumber || ''); }, [ni.referenceNumber]);
  useEffect(() => { setDeadline(ni.deadline || ''); }, [ni.deadline]);
  return (
    <div className="rc-inline-form" data-testid="ni-ref-form">
      <label>מספר אסמכתא
        <input value={refNumber} dir="ltr" inputMode="numeric" placeholder="73882698"
          onChange={e => setRefNumber(e.target.value.replace(/\D/g, ''))} style={{ textAlign: 'left' }} />
      </label>
      <label>מועד אחרון לאישור
        <input type="date" value={deadline} min={todayISO()} onChange={e => setDeadline(e.target.value)} />
      </label>
      <button className="btn btn-primary btn-sm" disabled={busy || !refNumber.trim()}
        onClick={() => onSave(refNumber.trim(), deadline || undefined)}>
        {busy ? 'שומר…' : 'שמירה'}
      </button>
    </div>
  );
}

/**
 * 208 · רשות הוסרה אחרי שהבקשה נפתחה בשע״ם.
 * ‼ שע״ם מאפשרת לבטל לפני קבלת המסמכים רק את **כל** הבקשה, ו-PIVO לא מבטלת שם.
 * ביטול ידני ⇒ הבדיקה מול הרשויות רואה שבוטלה (או שהמשרד מאשר כאן) ⇒ הבקשה
 * עוברת להיסטוריה ⇒ «הזן» פותח חדשה רק למה שנשאר (ובודק שוב שאין פתוחה).
 */
function ReplacementBody({ replacement, remaining }: {
  replacement: NonNullable<ShaamRequestTracking['replacement']>; remaining: string;
}) {
  return (
    <div data-testid="shaam-replacement-notice">
      {replacement.stillOpenAt && (
        <p className="rc-err" data-testid="shaam-replacement-still-open" style={{ margin: '0 0 12px', fontWeight: 600 }}>
          סומן שהבקשה בוטלה, אבל בבדיקה ב-{fmtDateTime(replacement.stillOpenAt)} היא עדיין הופיעה פתוחה בשע״ם — לכן לא נפתחה בקשה חדשה.
        </p>
      )}
      <AskList items={[
        { key: 'cancel', title: `בשע״ם, ברשימת הבקשות: «ביטול הבקשה» ${replacement.requestNumber}`, detail: 'לפני שהמסמכים התקבלו, שע״ם מבטלת את כל הבקשה ולא תיק אחד.' },
        { key: 'mark', title: 'לסמן כאן שבוטלה', detail: 'או להריץ את הבדיקה מול הרשויות — היא מזהה ביטול.' },
        { key: 'new', title: `לפתוח בקשה חדשה רק ל${remaining}`, detail: 'הטופס החדש יגיע משע״ם ויסומן לחתימה אוטומטית.' },
      ]} />
    </div>
  );
}

/** «ביטלתי בשע״ם» — בטור הפעולה, כמו כל פעולה ראשית במסך. */
function ReplacementConfirm({ requestId, submissionKey, replacement, onChanged }: {
  requestId: string; submissionKey: string;
  replacement: NonNullable<ShaamRequestTracking['replacement']>; onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function confirm() {
    if (!window.confirm(`לאשר שבקשה ${replacement.requestNumber} בוטלה בשע״ם?\n\n`
      + 'אחרי האישור «הזן ייפוי כוח בשע״ם» יפתח בקשה חדשה. הוא בודק קודם ברשימת הבקשות בשע״ם - '
      + 'אם הבקשה הישנה עדיין פתוחה שם, לא תיפתח בקשה נוספת.')) return;
    setBusy(true); setErr(null);
    const e = await confirmShaamRequestCancelled(requestId, submissionKey);
    setBusy(false);
    if (e) setErr(e); else onChanged();
  }
  return (
    <>
      <button type="button" className="btn btn-primary" disabled={busy} data-testid="shaam-confirm-cancelled" onClick={() => void confirm()}>
        {busy ? 'שומר…' : 'ביטלתי בשע״ם'}
      </button>
      <div className="rc-aside-line">PIVO לא מבטלת בשע״ם — רק מסמנת כאן שבוטלה.</div>
      {err && <div className="rc-err">{err}</div>}
    </>
  );
}

/** בדיקת התבנית שהמרכז שולח לשרת — לכל הגשה שהעובד לא בדק. */
export type ShaamFormLayouts = Record<string, { ok: boolean; problems: string[]; bothSign: boolean; title: string }>;

/** מה שהשרת החזיר ואינו «הסתיים» — וההכנה נשארה פתוחה. */
const PREP_DONE = new Set(['prepared', 'exists', 'layout_mismatch', 'held_sent', 'signed_untouched']);

export default function RepresentationExecutionCenter({ request, niIncluded, niCoversSpouse, onSaveExecution, onProduce, onStamp, onMarkSentToShaam, onMarkActive, onSendToSigner, userId, repApprovalOverride, repApprovalPeopleOverride, linkedClient, onConfirmRegisteredSpouse, steps, engagements, onStepsChanged, onUpdateClientFields, onPrepareShaamForms, dataPanel, requestPanel, onRegenerateSignedPdf, regeneratingSignedPdf, documentSourceOverride }: Props) {
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
  const [note, setNote] = useState<{ kind: 'ok' | 'err' | 'unknown'; text: string } | null>(null);

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
  // ‼ 04.10.2026 · «מוכן לחתימה» = signatureReadiness: קובץ, מקום חתימה לכל חותם, שיוך
  // לחותם שקיים, ומקום לחתימה ולחותמת של המשרד. אותה הכרעה קובעת את מסך הבקשות
  // (repSendPhase), והשרת אוכף אותה לפני שליחה (218). קודם «יש קובץ» הספיק.
  const readiness = signatureReadiness(request);
  // ‼ 04.10.2026 · עם הכרטיס — אותן עובדות לפי אדם ורשות שהשורה ב«בקשות» קוראת (repPreparation):
  // טופס של בן/בת זוג שעוד לא הגיע אינו «חסר מקום חתימה», וטופס שחסר להגשה שנפתחה אינו «מוכן».
  const repFacts = linkedClient ? repPreparationFacts(request, linkedClient) : null;
  const readinessProblems = repFacts ? repFacts.problems : readiness.problems;
  const formReady = signed || (repFacts
    ? poaDocs.length > 0 && readinessProblems.length === 0
      && repFacts.shaam.every(f => !f.entered || f.form === 'ready' || f.form === 'signed')
    : readiness.state === 'ready');
  // מה חסר בטופס שכבר קיים. ‼ «עוד לא נוצרו מקומות» לבדו אינו תקלה — השרת מכין אותם עם
  // קבלת הטופס (218), ובלעדיו ההכנה למטה (או layoutProblems כשהתבנית שונה).
  const formProblems = signed ? [] : readinessProblems.filter(p => p.code !== 'not_prepared');
  /** הטופס הגיע משע״ם ועוד אין לו מקומות חתימה (ההכנה רצה, או נעצרה על תבנית שונה). */
  const formArrivedUnprepared = !signed && readinessProblems.some(p => p.code === 'not_prepared');
  const factOf = (key: string): ShaamPrepFact | undefined => repFacts?.shaam.find(f => f.key === key);
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
  const [heroPoa, setHeroPoa] = useState<PoaEntry | null>(null);
  const missingIds = representationInsight(request, linkedClient, steps).missingIdentity;
  const [confirmSendWithoutId, setConfirmSendWithoutId] = useState(false);
  /** «שלח» אחרי ניסיון שלא ידוע אם יצא — אישור שמסביר את הסיכון לכפילות. */
  const [confirmResendUnknown, setConfirmResendUnknown] = useState(false);
  /** 208 · השליחה נעצרה: בתיק יש צילום תעודה שלא שויך לאף אדם. */
  const [unassignedAsk, setUnassignedAsk] = useState<{ only?: string } | null>(null);
  /** null = לכל מי שיש לו מייל. מזהה חותם = רק אליו, והוא יעביר לשני. */
  const [sendOnlyTo, setSendOnlyTo] = useState<string | null>(null);
  /** המדריך המצולם שהלקוח רואה בכרטיס — כדי שהמשרד יוכל ללוות אותו בטלפון. */
  const [approvalGuideOpen, setApprovalGuideOpen] = useState(false);

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
  async function handleSendAll(only?: string, askUnassigned = false) {
    // ‼ 04.10.2026 · טופס שחסר בו מקום חתימה או ששויך לחותם שאינו ברשימה — לא נשלח.
    // השרת (218) עוצר גם הוא; כאן אומרים מה חסר לפני שמנסים.
    if (!formReady) {
      setNote({ kind: 'err', text: formProblems.length ? `הטופס לא מוכן לחתימה: ${formProblems.map(p => p.text).join(' ')}` : 'הטופס לא מוכן לחתימה.' });
      return;
    }
    setBusy('send');
    setNote(null);
    // ‼ 208 · לפני כל מייל: השרת מצרף לתהליך הלקוח את מה ששע״ם דורשת (העלאה /
    // אישור צילום), ומעביר את הבקשה ל«ממתין לחתימה» — בלי זה דף החתימה דוחה.
    const prep = await prepareRequestForSigning(request.id, { askUnassigned });
    if (!prep.ok) {
      if (prep.reason === 'unassigned_identity') setUnassignedAsk({ only });
      else setNote({ kind: 'err', text: prep.error });
      setBusy(null);
      return;
    }
    const prepSentence = preparedDocumentsSentence(prep.documents, p => nameOf(p) || (p === 'spouse' ? 'בן/בת הזוג' : 'הנישום'));
    // חותם בלי מייל אינו תקלה (110): בן/בת זוג בלי כתובת חותם יחד עם הנישום
    // באותו מכשיר, או מקבל קישור אחרי שהנישום יזין את המייל בשלב החתימה.
    const chosen = only ? pendingSigners.filter(s => s.id === only) : pendingSigners;
    const emailable = chosen.filter(s => s.email.trim());
    const skipped = pendingSigners.filter(s => !emailable.some(e => e.id === s.id));
    const sentIds = new Set<string>();
    const failures: string[] = [];
    /** ‼ לא ידוע אם יצא — לא «נכשל», ולא «נשלח». */
    const unknowns: RepSigner[] = [];
    for (const s of emailable) {
      const err = await onSendToSigner(s);
      if (!err) sentIds.add(s.id);
      else if (isUnknownSendError(err)) unknowns.push(s);
      else failures.push(`${s.name || s.email}: ${err}`);
    }
    if (failures.length > 0 || unknowns.length > 0) {
      const sentTo = emailable.filter(s => sentIds.has(s.id)).map(s => s.email);
      const unknownLine = unknowns.length === 0 ? null
        : `לא ידוע אם המייל יצא אל ${unknowns.map(s => s.email.trim()).join(', ')} — ספק הדואר לא החזיר תשובה ברורה. `
          + `לפני ששולחים שוב — כדאי לברר עם ${unknowns.map(s => s.name || 'הנמען').join(' ועם ')} אם קיבל אותו.`;
      setNote({
        kind: failures.length > 0 ? 'err' : 'unknown',
        text: [sentTo.length ? `נשלח ל-${sentTo.join(', ')}` : null, ...failures, unknownLine].filter(Boolean).join(' · '),
      });
      setBusy(null);
      // ‼ השרת רשם את הניסיון ביומן — השורה של החותם מציגה אותו (נשלח / לא ידוע אם יצא).
      void reloadEmails();
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
        : '') + (prepSentence ? ` · ${prepSentence}` : ''),
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
  /** כל הניסיונות לכתובת הזו, מהחדש לישן — «נשלח/נפתח» נקרא מהאחרון שבאמת יצא. */
  const signerEmails = (s: RepSigner) => {
    const addr = s.email.trim().toLowerCase();
    return addr ? signatureEmails.filter(m => m.toEmail.trim().toLowerCase() === addr) : [];
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
    const prep = await prepareRequestForSigning(request.id);
    if (!prep.ok) { setNote({ kind: 'err', text: prep.error }); return; }
    if (prep.status !== status) onStepsChanged?.();
    const track = role === 'spouse' ? niSpouse : ni;
    if (!track.referenceNumber || track.instructionsSentAt) return;
    const now = new Date().toISOString();
    const next = { ...track, instructionsSentAt: now, instructionsSentWith: 'link' as const };
    await onSaveExecution({
      ...exec,
      ...(role === 'spouse' ? { nationalInsuranceSpouse: next } : { nationalInsurance: next }),
    });
  }

  /**
   * הניסיון האחרון לכתובת של החותם — «לא ידוע אם יצא», ואין אחריו מייל שיצא.
   * ‼ שליחה נוספת עלולה להגיע פעמיים (במייל החתימה אין מפתח שמונע כפילות),
   * ולכן היא עוברת אישור מפורש.
   */
  const lastAttemptUnknown = (s: RepSigner) => isUnknownEmailStatus(signerEmails(s)[0]?.status);

  /**
   * תזכורת = אותו מייל שוב, לאותו חותם. בלי גרסה חלקית שתבלבל את הלקוח.
   * ‼ «לא ידוע אם יצא» חוזר כמשפט משלו (בלי «לא נשלח»), ומסומן — השורה מציגה אותו כתום.
   */
  async function handleRemind(m: { toEmail: string }): Promise<{ text: string; unknown: boolean } | null> {
    const signer = signers.find(s => s.email === m.toEmail) || signers[0];
    if (!signer) return { text: 'לא נמצא חותם לשליחה', unknown: false };
    const err = await onSendToSigner(signer);
    void reloadEmails();
    if (!err) return null;
    return isUnknownSendError(err)
      ? { text: unknownSendText({ recipient: signer.name || 'הנמען' }), unknown: true }
      : { text: err, unknown: false };
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
  const docStore = useDocumentDB();
  const formDocs = documentSourceOverride ?? docStore;
  // ‼ 218 · השרת מכין את המקומות עם קבלת הטופס. כאן — רק כשהעובד לא בדק את התבנית (גרסה ישנה /
  // הבדיקה לא רצה): בודקים בדפדפן באותו קוד, ושולחים לשרת שיבנה. השרת לבדו כותב — בלי מסמך כפול.
  // ‼ 28.09.2026 · נמצא בבדיקה בדפדפן: ההכנה רצה לפני שכרטיס הלקוח נטען, ולכן «נשוי» נקרא
  // כ-false וזוג קיבל טופס עם חתימה אחת. בלי כרטיס לא שולחים (bothSign נגזר ממנו).
  const [prepIssue, setPrepIssue] = useState<Record<string, string>>({});
  const [prepRound, setPrepRound] = useState(0);
  useEffect(() => {
    if (!onPrepareShaamForms || !linkedClient) return;
    const existing = signatureDocumentsOf(request);
    const pending = submissions.filter(sub => {
      const t = exec.shaam?.[sub.key];
      // ‼ השרת כבר הכריע (formPreparation) — לא חוזרים על זה מכאן.
      return !!t?.formDocumentId && !t.replacement && !t.formPreparation && !existing.some(d => d.key === sub.key)
        && !preparedRef.current.has(`${sub.key}:${t.formDocumentId}:${prepRound}`);
    });
    if (pending.length === 0) return;
    // ‼ 208 · המפתח כולל את הטופס: אחרי «הסר מהבקשה» ובקשה חדשה בשע״ם מגיע טופס חדש לאותה הגשה.
    for (const sub of pending) preparedRef.current.add(`${sub.key}:${exec.shaam![sub.key]!.formDocumentId}:${prepRound}`);
    void (async () => {
      const layouts: ShaamFormLayouts = {};
      for (const sub of pending) {
        const t = exec.shaam![sub.key]!;
        let check: { ok: boolean; problems: string[] };
        if (typeof t.formLayout?.ok === 'boolean') {
          check = { ok: t.formLayout.ok, problems: t.formLayout.problems ?? [] };
        } else {
          try {
            const stored = await formDocs.getDoc(t.formDocumentId!);
            check = stored && stored.fileData.byteLength > 0
              ? verifyForm2279Layout(await readForm2279Layout(stored.fileData.slice(0)))
              : { ok: false, problems: ['form_not_loaded'] };
          } catch {
            check = { ok: false, problems: ['form_not_read'] };
          }
        }
        layouts[sub.key] = {
          ...check,
          bothSign: form2279BothSign(sub, scopePeople.married),
          title: sub.title ? `${sub.title} · ${sub.authoritiesLabel}` : sub.authoritiesLabel,
        };
      }
      const res = await onPrepareShaamForms(layouts).catch(() => null);
      const issues: Record<string, string> = {};
      for (const sub of pending) {
        const s = res?.[sub.key];
        if (!res) issues[sub.key] = 'השרת לא הגיב';
        else if (s && !PREP_DONE.has(s)) issues[sub.key] = s;
      }
      setPrepIssue(p => ({ ...p, ...issues }));
    })();
  }, [request, exec.shaam, submissions, scopePeople.married, onPrepareShaamForms, formDocs, linkedClient, prepRound]);
  const retryPreparation = () => { setPrepIssue({}); setPrepRound(n => n + 1); };
  // ‼ טופס שלא עבר את בדיקת התבנית — נרשם בשרת (formPreparation) ומוצג מהמוכנות.
  const layoutProblems: Record<string, string> = Object.fromEntries(
    readinessProblems.filter(p => p.code === 'layout_mismatch' && p.docKey).map(p => [p.docKey!, p.text]));

  // ‼ הנתיב המזורז נטען כאן ואינו מגיע כ-prop — ראה useRepApprovalStep.
  // מרוענן כשהסטטוס משתנה, כי המעבר ל-awaiting_authorities הוא שיוצר אותו.
  // ‼ כרטיס שהגיע מבחוץ (מסך הבדיקה) — לא נטען שוב מהמסד.
  const { step: loadedRepApproval, reload: reloadRepApproval } = useRepApprovalStep(repApprovalOverride !== undefined ? null : request.linkedClientId);
  const repApproval = repApprovalOverride !== undefined ? repApprovalOverride : loadedRepApproval;
  const declared = isRepApprovalDeclared(repApproval);
  // ‼ 201 · «ממתין לאישור לקוח» בשע״ם ⇒ האישור הוא חובה, לא זירוז. שני מקורות,
  // שניהם שמורים: הסימון בשלב (השרת), ומה ששע״ם מציגה עכשיו בהגשה כלשהי.
  const approvalRequired = repApproval?.requiredBy === 'shaam'
    || submissions.some(sub => !!shaamSubmittedFacts(exec.shaam?.[sub.key])?.clientApprovalRequired);
  useEffect(() => { void reloadRepApproval(); }, [status, reloadRepApproval]);

  // ── H2.2 · «מה מסמנים באזור האישי» — אותה רשימה שהלקוח רואה בכרטיס ─────────────
  // ‼ מהשרת בלבד (build_client_portal ⇐ _rep_approval_people, approvals בפריט rep_approval);
  // לא מחשבים כאן שוב. 'preview' — גם כשהכרטיס עוד לא פורסם בדף. נקרא רק כשהאישור פתוח.
  // בלי רשימה (נכשל / השרת לא יודע / הלקוח כבר דיווח) — המדריך בנוסח הכללי, כמו בדף.
  const approvalPeopleClientId = linkedClient?.id ?? request.linkedClientId ?? null;
  const approvalPeopleWanted = repApprovalPeopleOverride === undefined && !!approvalPeopleClientId
    && !!repApproval && !isRepApprovalClosed(repApproval) && !declared;
  const [loadedApprovalPeople, setLoadedApprovalPeople] = useState<RepApprovalPerson[] | null>(null);
  useEffect(() => {
    if (!approvalPeopleWanted || !approvalPeopleClientId) return;
    let cancelled = false;
    void supabase.rpc('get_client_portal_preview', { p_client_id: approvalPeopleClientId, p_mode: 'preview' })
      .then(({ data, error }) => {
        if (cancelled) return;
        const row = data as { ok?: boolean; items?: { key?: string; approvals?: RepApprovalPerson[] }[] } | null;
        setLoadedApprovalPeople(!error && row?.ok
          ? (row.items ?? []).find(i => i.key === 'rep_approval')?.approvals ?? null
          : null);
      });
    return () => { cancelled = true; };
  }, [approvalPeopleWanted, approvalPeopleClientId, status]);
  const approvalPeople = repApprovalPeopleOverride !== undefined ? repApprovalPeopleOverride
    : approvalPeopleWanted ? loadedApprovalPeople : null;

  // ── האם זה באמת בדף האישי? (הכרעות גיא 03.10) ─────────────────────────────
  // ‼ «מופיע בדף האישי» רק כשהשער של הדף פתוח לבקשה שמאחורי השורה — clientPageGate, התאום
  // של client_step_gate_open. כרטיס אישור / בקשת צילום שנולדו בקליטה חדשה שטרם פורסמה —
  // לא בדף (ולא בתזכורת) עד «פרסם בדף» ב«בקשות». אין כאן מצב חדש: ההתקשרויות מהמארח,
  // ובלעדיהן — קריאה אחת מהמסד (כמו useRepApprovalStep). לא ידוע ⇒ בלי טענה על הדף.
  const pageClientId = linkedClient?.id ?? request.linkedClientId ?? undefined;
  const [loadedEngagements, setLoadedEngagements] = useState<Engagement[] | null>(null);
  useEffect(() => {
    if (engagements !== undefined || !pageClientId) return;
    let cancelled = false;
    void supabase.from('engagements').select('id, client_id, status, process_published_at, created_at')
      .eq('client_id', pageClientId)
      .then(({ data, error }) => {
        if (!cancelled) setLoadedEngagements(error ? null : (data ?? []).map(r => engagementFromDb(r as Record<string, unknown>)));
      });
    return () => { cancelled = true; };
  }, [engagements, pageClientId, status]);
  const gateEngagements: Engagement[] | null = engagements !== undefined
    ? engagementsOf(engagements, pageClientId) : loadedEngagements;
  /** השלבים של הלקוח המקושר (מ«בקשות»), שלא בוטלו. */
  const pageSteps = (steps ?? []).filter(s => (!pageClientId || s.clientId === pageClientId) && s.status !== 'cancelled');
  /**
   * 'shown' — בדף עכשיו · 'intake' — יופיע כשהקליטה תפורסם · 'draft' — יופיע אחרי «פרסם בדף» ·
   * null — לא ידוע. בלי השלב (טרם נטען, או שייווצר עכשיו ויתפרסם עכשיו) — השער ברמת הלקוח.
   */
  const pageStateOf = (step: OnboardingStep | null | undefined): 'shown' | 'intake' | 'draft' | null => {
    if (!gateEngagements) return null;
    const shown = step ? visibleOnClientPage(step, gateEngagements) : clientProcessPublished(gateEngagements);
    if (shown) return 'shown';
    const intake = openIntake(gateEngagements);
    return (!step || isPublishedStep(step)) && intake && !intake.processPublishedAt ? 'intake' : 'draft';
  };
  /** «יופיע בדף האישי כשתפרסם את הקליטה» — הסיומת של שורה שהלקוח עוד לא רואה. */
  const notYetOnPage = (st: 'intake' | 'draft') =>
    st === 'intake' ? 'כשתפרסם את הקליטה' : 'אחרי «פרסם בדף»';
  /** קישור שקט ל«בקשות» של הלקוח — שם «פרסם בדף». */
  const requestsLink = pageClientId ? (
    <a className="rc-quiet" data-testid="rc-to-requests"
      href={`#${formatRoute({ view: 'form', clientId: pageClientId, clientTab: 'journey' })}`}>לבקשות ←</a>
  ) : null;
  // כרטיס «אישור הייצוג באזור האישי» — השלב עצמו מ«בקשות» (בו זמן הפרסום); חסר ⇒ השער ברמת הלקוח.
  const repApprovalPage = repApproval ? pageStateOf(pageSteps.find(s => s.id === repApproval.id)) : null;
  /**
   * בקשת צילום התעודה (208) — באיזה שלב היא יושבת: אישור הצילום שבתיק = «צילום תעודה לרשות
   * המסים» (shaamIdentity.key); צילום שאין = פריט ב«מסמכים מהלקוח» האחרונה (ensure_shaam_identity_
   * document_request). עוד לא נוצר ⇒ ייווצר ויתפרסם עכשיו ⇒ השער ברמת הלקוח.
   */
  const latestDocsStep = pageSteps.filter(s => s.stepType === 'client_documents')
    .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))[0];
  /** בקשת העלאת צילום (אין בתיק) — הפריט נכתב ב«מסמכים מהלקוח» האחרונה, או בחדשה. */
  const uploadPage = pageStateOf(latestDocsStep);
  const idRequestPage = (d: ShaamPreSigningDoc) => {
    if (d.status === 'awaiting_confirmation') {
      const key = `${request.id}:${d.person}:${d.kind}`;
      return pageStateOf(pageSteps.find(s => s.stepType === 'custom_request' && isStepOpen(s.status)
        && (s.payload?.shaamIdentity as { key?: string } | undefined)?.key === key));
    }
    return uploadPage;
  };
  /** «האישור באזור האישי» — מה המשרד יודע על הכרטיס בדף. null ⇒ לא אומרים כלום על הדף. */
  const approvalPageLine = (lead: string): React.ReactNode =>
    repApprovalPage === 'shown' ? `${lead} מופיעה בדף האישי של הלקוח.`
      : repApprovalPage ? <>{`האישור יופיע בדף האישי ${notYetOnPage(repApprovalPage)}.`}{requestsLink && <> {requestsLink}</>}</>
      : null;

  // ── ספירת שלבים שהושלמו, להצגה בכותרת כל מסלול ──
  // ‼ הנתיב המזורז אינו כאן: הוא אופציונלי, וספירתו הייתה מציגה מסלול שהושלם
  // כאילו נשאר בו צעד.
  // ‼ 24.09.2026 · «הפרטים הוזנו בשע״ם» הושלם גם על ראיה מהרשות — בקשה שנוצרה
  // מכאן, או שנמצאה שם (הוזנה ידנית; «הזן» בדק ומצא, 202). ראיה גוברת על
  // היעדר סימון ידני; הסימון הידני נשאר לשורה שאין לה ראיה.
  // ‼ אותה הכרעה כמו בשורה ב«בקשות» (repPreparation.shaamEnteredAt).
  const enteredAtOf = (key: string, first: boolean) => shaamEnteredAt(exec, key, first);

  // שמות המבוטחים לכותרות המסלולים — כשיש שניים, "ביטוח לאומי" לבדו לא מספיק
  const nameOf = (role: 'client' | 'spouse') =>
    signers.find(s => s.role === role)?.name?.trim();

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
  const niNextActionNode = (role: 'client' | 'spouse') => linkedClient ? (
    <NiNextActionButton
      client={linkedClient} role={role} action={columnAction(niActionFor(role))} track={niExecutionByRole[role]}
      onChanged={onStepsChanged} className="btn btn-sm" errorClassName="rep-track-next-err"
    />
  ) : null;
  // ‼ 212: מחיקה (לא נשלח) / ביטול (נשלח) — לכל אדם, גם היחיד, עד שסומן כאושר.
  // לא תלוי בשלב ההזנה: אחרי שיש אסמכתא זה בדיוק המקרה שבו צריך אותו.
  // ‼ H1.b · «אושר» כמו בשרת (ni_subject_stage): confirmedAt **או** תיק ב״ל פעיל בכרטיס —
  // אותה נגזרת שאומרת «הייצוג פעיל» בשורה (niTrackView). פעיל ⇒ אין «ביטול הבקשה».
  const niCancelNode = (role: 'client' | 'spouse') => linkedClient ? (
    <NiCancelRequest
      clientId={linkedClient.id} role={role} track={niExecutionByRole[role]}
      approved={niTrackView(niExecutionByRole[role], niLineFor(role)).final}
      name={nameOf(role) || (role === 'spouse' ? 'בן/בת הזוג' : 'הנישום')}
      onChanged={onStepsChanged}
    />
  ) : null;

  // ── שע״ם: הפעולה ההקשרית, לכל הגשה בנפרד (194) ──────────────────────────
  // ‼ אותה נגזרת בדיוק כמו בתיק המס (shaamRepresentationAction), מאותו
  // סטטוס ומאותו מצב אינטגרציה — כדי ששני המשטחים לא יסטו. המצב של הגשה
  // אחת לעולם אינו נגזר מהשנייה: `submissionKey` מפורש בכל מקום.
  const shaamTrack = (key: string): ShaamRequestTracking | undefined => exec.shaam?.[key];
  // ‼ 208 · מה ששע״ם דרשה ביצירה, ומה מצבו — לכל הגשה. אותה נגזרת משמשת את
  // הרשימה במסך, את «מה יישלח ללקוח», ואת החסימה של «שלח טופס חתום לשע״ם».
  const preSigningDocsOf = (sub: ShaamSubmission): ShaamPreSigningDoc[] => shaamPreSigningDocs({
    tracking: shaamTrack(sub.key), submissionKey: sub.key, request,
    personName: sub.personName || nameOf(sub.target) || '', signed,
  });
  const shaamActionFor = (sub: ShaamSubmission) =>
    shaamRepresentationAction(status, shaamTrack(sub.key), stamped,
      { clientDocumentsPending: shaamClientDocumentsPending(preSigningDocsOf(sub)) });
  const shaamDemandsMissingId = submissions.some(sub => preSigningDocsOf(sub).some(d => d.status === 'missing'));
  const shaamNode = (sub: ShaamSubmission, only?: ShaamActionKind, className = 'btn btn-sm') => {
    // ‼ «בדוק» לעולם לא בעמודה — יש לו כפתור אחד ליד כותרת המרכז.
    const a = columnAction(shaamActionFor(sub));
    if (!a || (only && a.kind !== only)) return null;
    return (
      <ShaamNextActionButton
        request={request} linkedClient={linkedClient ?? null} submission={sub}
        action={a} tracking={shaamTrack(sub.key)} married={scopePeople.married}
        onChanged={onStepsChanged} className={className} errorClassName="rep-track-next-err"
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
        last: shaamReconcileLine(shaamTrack(sub.key)),
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
        last: niReconcileLine(niExecutionByRole[role]),
        fromJob: (result, finishedAt) => niReconcileLineFromJob(result, finishedAt, niExecutionByRole[role]),
        premature: !niInstructionsDelivered(niExecutionByRole[role]),
      };
    });
  // ‼ 04.10.2026 · כל רשות במצב שלה: הכפתור אומר מה הוא בודק, וכאן — מה לא, ולמה.
  // הפקת טופס אינה הגשה: בקשה שנפתחה בשע״ם ולא הוגשה אינה יעד לבדיקה, וזה לא חוסם את ב״ל.
  const shaamSkipped = submissions.filter(sub => !shaamReconcile.some(t => t.key === sub.key)
    && !shaamSettled(shaamTrack(sub.key)) && status !== 'active');
  const btlSkipped = (['client', 'spouse'] as const).filter(role => (role === 'client' ? niTargetsClient : niTargetsSpouse)
    && !btlReconcile.some(t => t.key === role) && !niExecutionByRole[role].confirmedAt);
  const reconcileNotChecked = [
    shaamSkipped.length > 0 && btlReconcile.length > 0
      ? `שע״ם לא נבדקת עכשיו: ${sentToShaam ? 'אין בקשה מוגשת לבדוק שם' : 'ייפוי הכוח עוד לא הוגש לשע״ם, ולכן אין שם מה לבדוק'}.` : '',
    btlSkipped.length > 0 && shaamReconcile.length > 0
      ? 'ביטוח לאומי לא נבדק עכשיו: אין עדיין רישום שמור לבדוק שם.' : '',
  ].filter(Boolean).join(' ') || null;

  // ── «מה עכשיו» — החלטה אחת למסך כולו (repCenterPlan) ─────────────────────
  // ‼ 28.09.2026 · במקום שני טורים של שלבים והפעולה בתחתית העמוד: כרטיס אחד
  // בראש, שאומר אצל מי הכדור, מה המצב במשפט, והפעולה היחידה שנדרשת עכשיו.
  // הפירוט המלא לכל רשות נשאר בשורה שלה, ונפתח לפי דרישה.
  const firstName = (linkedClient?.firstName || request.clientName || '').trim().split(/\s+/)[0] || '';
  const niRoles = (['client', 'spouse'] as const).filter(r => (r === 'client' ? niTargetsClient : niTargetsSpouse));
  const niNameOf = (role: 'client' | 'spouse') => nameOf(role) || (role === 'spouse' ? 'בן/בת הזוג' : 'הנישום');
  const prereqMissingOf = (st?: OnboardingStep | null) => !!st
    && !['completed', 'verified', 'skipped', 'cancelled'].includes(st.status)
    && (((st.payload?.prerequisites as { missing?: string[] } | undefined)?.missing) ?? []).length > 0;
  const niStepOf = (role: 'client' | 'spouse') => (role === 'spouse' ? niSpouseStep : niClientStep);
  const patchNi = (role: 'client' | 'spouse', p: Partial<NiTracking>, label: string) =>
    patch({ ...exec, ...(role === 'spouse' ? { nationalInsuranceSpouse: { ...niSpouse, ...p } } : { nationalInsurance: { ...ni, ...p } }) }, label);
  const allPreDocs = submissions.flatMap(sub => preSigningDocsOf(sub));
  const idDocs = allPreDocs.filter(d => d.kind !== 'poa' && d.kind !== 'other');
  const idDocsOpen = idDocs.filter(d => d.status === 'missing' || d.status === 'awaiting_confirmation');
  const shaamFactsOf = (sub: ShaamSubmission) => shaamSubmittedFacts(shaamTrack(sub.key));

  const plan = repCenterPlan({
    status, firstName, formReady, formNeedsMarking: Object.keys(layoutProblems).length > 0 || formProblems.length > 0,
    // ‼ אצל זוג — של מי הטופס שעוד לא מוכן, ולמה (אותן עובדות כמו בשורה ב«בקשות»).
    formProblems: [
      ...formProblems.map(p => p.text),
      ...(repFacts && repFacts.shaam.length > 1 ? repFacts.shaam
        .filter(f => f.entered && (f.form === 'none' || f.form === 'arrived'))
        .map(f => `${f.form === 'none' ? 'ממתין לטופס' : 'מכין את הטופס'} של ${f.personName} (${f.authoritiesLabel}) משע״ם.`) : []),
    ],
    sent: !!exec.signatureEmailSentAt, sentAt: exec.signatureEmailSentAt ?? null,
    signed, stamped, submitted: sentToShaam,
    shaam: submissions.map((sub, i) => {
      const t = shaamTrack(sub.key);
      const a = shaamActionFor(sub);
      const gate = shaamDocumentsBlocked(t);
      const f = shaamFactsOf(sub);
      return {
        key: sub.key, label: sub.authoritiesLabel,
        entered: !!enteredAtOf(sub.key, i === 0),
        replacementRequestNumber: t?.replacement?.requestNumber ?? null,
        replacementRemoved: t?.replacement?.removed ?? [],
        clientDocumentsPending: shaamClientDocumentsPending(preSigningDocsOf(sub)),
        documentsBlockedReason: gate ? (a?.reason ?? null) : null,
        documentsBlockedOfficeFix: !!gate && !!a && !a.disabled,
        settled: shaamSettled(t),
        awaitingClientApproval: !!f?.clientApprovalRequired,
        submittedStatus: f?.status
          ? `שע״ם: ${f.status}${f.suspensionEndsAt ? ` · צפי לסיום ההשהייה ${fmt(f.suspensionEndsAt)}` : ''}` : null,
        // ‼ H2.5a · של מי ההגשה — הכותרת נוקבת במי שהאישור שלו/ה חסר, לא בבעל הכרטיס.
        // בעל הכרטיס — אותו שם כמו בשאר הכותרות; בן/בת הזוג — מהכרטיס, אחרת מהחותם.
        // (sub.personName לבדו נופל ל«הלקוח/ה» כשאין כרטיס מקושר.)
        personName: sub.target === 'spouse'
          ? (scopePeople.spouseName.trim() || nameOf('spouse') || 'בן/בת הזוג')
          : firstName,
        checkedAt: t?.observedAt || t?.syncedAt || null,
      };
    }),
    ni: niRoles.map(role => ({
      role, name: niNameOf(role),
      prereqMissing: prereqMissingOf(niStepOf(role)),
      entered: !!niExecutionByRole[role].enteredAt,
      hasRef: !!niExecutionByRole[role].referenceNumber,
      delivered: niInstructionsDelivered(niExecutionByRole[role]),
      final: niTrackView(niExecutionByRole[role], niLineFor(role)).final,
    })),
    clientOpenItems: [...new Set(idDocsOpen.map(d => (d.status === 'missing' ? 'להעלות צילום תעודה' : 'לאשר את צילום התעודה שבתיק')))],
    clientApprovalRequiredOpen: !!repApproval && approvalRequired && !isRepApprovalClosed(repApproval),
    clientApprovalDeclaredAt: declared ? repApproval?.clientDeclaredAt ?? null : null,
  });

  // ── פקדים שמופיעים פעם אחת בדיוק (בכרטיס «מה עכשיו» או בפירוט — לא בשניהם) ──
  const createCell = (sub: ShaamSubmission) => <div className="rc-actioncell">{shaamNode(sub, 'create')}</div>;
  const inPrepare = plan.kind === 'prepare';

  // ── מסמכי הבקשה (01.10.2026): ייפוי הכוח בגרסה הנוכחית, והצילום המזהה + ה-PDF שלו ──
  // ‼ ה-PDF מוכן ברקע (211): השרת בונה JPG/PNG ברגע השיוך, ועובד האוטומציה במחשב המשרד
  // את השאר (HEIC/WebP/פריימים/גרסת הגשה). הדף הזה רק מציג ומחליט — לא ממיר. אין «הכן PDF».
  const pdf = useDocumentPdfBuilds({
    requestId: request.id, identityKey: JSON.stringify(request.identityDocs ?? {}),
    enabled: !!linkedClient && submissions.length > 0,
  });
  const loadDoc = async (id: string): Promise<ViewerFile> => {
    const d = await formDocs.getDoc(id);
    if (!d || !d.fileData || d.fileData.byteLength === 0) throw new Error('הקובץ לא נמצא באחסון.');
    const bytes = new Uint8Array(d.fileData);
    const fmt = sniffFormat(bytes);
    return { bytes, fileName: d.fileName, mime: fmt === 'pdf' ? 'application/pdf' : d.fileType || 'application/octet-stream' };
  };
  /** ‼ «חתום על ידי הלקוח» אינו קובץ שמור — הטופס + חתימות הלקוח בלבד, מורכב לתצוגה. */
  const composeClientSigned = async (v: PoaVersion): Promise<ViewerFile> => {
    const doc = poaDocs.find(d => d.pdfDocId === v.documentId);
    const form = await loadDoc(v.documentId);
    if (!doc) return { ...form, fileName: v.fileName };
    const buf = form.bytes.buffer.slice(form.bytes.byteOffset, form.bytes.byteOffset + form.bytes.byteLength) as ArrayBuffer;
    const bytes = await burnSignaturesIntoPdf(buf, clientFieldsOf(doc.fields), request.signatureValues ?? {});
    return { bytes, fileName: v.fileName, mime: 'application/pdf' };
  };
  /** HEIC — הדפדפן לא מציג; מפענחים לתצוגה בלבד (המקור לא משתנה), תמונה לכל עמוד שבקובץ. */
  const displayable = async (f: ViewerFile): Promise<ViewerFile[]> => {
    const fmt = sniffFormat(f.bytes);
    if (fmt === 'pdf') return [{ ...f, mime: 'application/pdf' }];
    if (fmt !== 'heic') return [{ ...f, mime: f.mime.startsWith('image/') ? f.mime : `image/${fmt === 'jpeg' ? 'jpeg' : fmt}` }];
    const jpgs = await decodeForDisplay(f.bytes).catch(() => [] as Uint8Array[]);
    if (!jpgs.length) return [f];
    return jpgs.map(bytes => ({ bytes, fileName: f.fileName, mime: 'image/jpeg',
      original: { bytes: f.bytes, fileName: f.fileName, mime: 'image/heic' } }));
  };

  const poaEntries: PoaEntry[] = poaDocs.length > 0
    ? poaDocs.map(d => ({
        key: d.key,
        name: poaDocs.length > 1 ? `ייפוי כוח · ${d.title}` : 'ייפוי הכוח',
        version: d.pdfDocId ? currentPoaVersion({
          doc: d, values: request.signatureValues, allSignersDone: signed,
          legacyFinalId: poaDocs.length === 1 ? request.signedPdfStoredId : null, clientName: firstName,
        }) : null,
        noneReason: d.pdfDocId ? undefined : noPoaReason({ entered: true }),
        doc: d,
        // ‼ 218 · נאמר מאיפה המקומות: נוצרו בשרת עם קבלת הטופס, או סומנו כאן.
        placesLine: placesSentence(readiness.docs.find(x => x.key === d.key) ?? { key: d.key, title: d.title, places: [] })
          + (exec.shaam?.[d.key]?.formPreparation?.state === 'prepared' ? ' · נוצרו אוטומטית עם קבלת הטופס' : ''),
        problems: formProblems.filter(p => !p.docKey || p.docKey === d.key).map(p => p.text),
      }))
    // ‼ הטופס הגיע ואין לו מסמך חתימה (בהכנה, נכשל, או שונה מהתבנית) — מציגים אותו כמו שהגיע.
    : submissions.some(s => !!shaamTrack(s.key)?.formDocumentId && !shaamTrack(s.key)?.replacement)
      ? submissions.filter(s => !!shaamTrack(s.key)?.formDocumentId && !shaamTrack(s.key)?.replacement).map(s => {
          const t = shaamTrack(s.key)!;
          // ‼ הקובץ כפי שהגיע, בלי סימונים — אין עדיין מקומות חתימה לצייר.
          return {
            key: s.key, name: submissions.length > 1 ? `ייפוי כוח · ${s.authoritiesLabel}` : 'ייפוי הכוח',
            version: {
              kind: 'to_sign' as const, label: 'הגיע משע״ם - מקומות החתימה טרם סומנו', documentId: t.formDocumentId!,
              burnClientSignatures: false, fileName: t.formFileName || 'ייפוי כוח לחתימה.pdf',
              caption: 'הטופס כפי שהגיע משע״ם. מקומות החתימה עוד לא סומנו עליו.',
            },
            ...(layoutProblems[s.key]
              ? { problems: [layoutProblems[s.key]] }
              : prepIssue[s.key]
                ? { problems: [`הכנת מקומות החתימה לא הושלמה (${prepIssue[s.key]}). אפשר לנסות שוב, או לסמן ידנית.`] }
                : { placesLine: 'נוצרים עכשיו אוטומטית…' }),
          };
        })
    : submissions.length > 0
      ? [{
          key: 'poa-none', name: 'ייפוי הכוח', version: null,
          noneReason: noPoaReason({
            replacementRequestNumber: submissions.map(s => shaamTrack(s.key)?.replacement?.requestNumber).find(Boolean) ?? null,
            entered: submissions.some((s, i) => !!enteredAtOf(s.key, i === 0)),
          }),
        }]
      : [];
  const ID_GROUPS: { label: string; kinds: string[] }[] = [
    { label: 'תעודה מזהה', kinds: ['idCard', 'driverLicense'] },
    { label: 'דרכון', kinds: ['passport'] },
  ];
  const idEntries: IdEntry[] = (['client', 'spouse'] as const).flatMap(person => {
    const list = (request.identityDocs?.[person] ?? []) as RepIdentityDocEntry[];
    return ID_GROUPS.flatMap(g => {
      // ‼ אותה הכרעה כמו בשרת: קבוצת הסוג הראשונה (לפי סדר ההעדפה) שיש לה מסמך.
      const kind = g.kinds.find(k => list.some(e => (e.docKind || 'idCard') === k));
      const docs = kind ? list.filter(e => (e.docKind || 'idCard') === kind) : [];
      if (!docs.length) return [];
      const confirmedDocs = docs.filter(e => !!e.clientConfirmedAt);
      const used = confirmedDocs.length ? confirmedDocs : docs;
      const who = nameOf(person) || (person === 'spouse' ? 'בן/בת הזוג' : firstName);
      return [{
        key: `${person}:${g.label}`,
        name: `${kind === 'driverLicense' ? 'רישיון נהיגה' : g.label} · ${who}`,
        sources: used.map(e => ({ documentId: e.documentId, fileName: e.fileName })),
        confirmed: confirmedDocs.length > 0,
        approvalRelevant: submissions.length > 0,
        build: pdfBuildFor(pdf.builds, person, used.map(e => e.documentId)),
      }];
    });
  });
  const regChoiceNode = (busyKey: string, mark: (owner?: 'client' | 'spouse') => void) => (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      {regNames.map(r => (
        <button key={r.owner}
          className={`btn btn-sm ${r.owner === regIntent ? 'btn-green' : 'btn-secondary'}`}
          disabled={busy === busyKey}
          title={regIntent === null ? 'טרם נקבע מי הרשום - הבחירה כאן היא שתקבע'
            : r.owner === regIntent ? 'זו הכוונה שנרשמה בפתיחת הייצוג' : 'שונה מהכוונה שנרשמה - יעדכן את התיק'}
          onClick={() => { setEditingKey(null); void mark(r.owner); }}>
          {busy === busyKey ? 'שומר…' : r.label}
        </button>
      ))}
    </div>
  );
  const entryCtl = (sub: ShaamSubmission) => {
    const i = submissions.findIndex(s => s.key === sub.key);
    const first = i === 0;
    return {
      busyKey: first ? 'it' : `entry-${sub.key}`,
      manualAt: first ? it.enteredAt : entryAt(sub.key),
      at: enteredAtOf(sub.key, first),
      asksHere: regChoice && !regVerified && sub.key === regRowKey,
      mark: (owner?: 'client' | 'spouse') => (first ? markEnteredInShaam(owner) : markEntry(sub.key, owner)),
      unmark: () => unmarkEntry(sub.key, first),
    };
  };
  const waitingForShaamForm = submissions.some(s => !!shaamTrack(s.key)?.requestNumber && !shaamTrack(s.key)?.formDocumentId);

  // ── «לפני השליחה»: שורה לכל צעד, והפקד שלו לידו ─────────────────────────
  const prepareRow = (item: RcPrepareItem) => {
    let ctl: React.ReactNode = null;
    let body: React.ReactNode = null;
    if (item.key.startsWith('shaam:')) {
      const sub = submissions.find(s => `shaam:${s.key}` === item.key);
      if (sub) {
        const c = entryCtl(sub);
        const t = shaamTrack(sub.key);
        if (c.asksHere) {
          body = (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <span className="rc-meta">מי מבין השניים רשום/ה במס הכנסה? הבחירה מעדכנת את התיק בכרטיס.</span>
              {regChoiceNode(c.busyKey, c.mark)}
            </div>
          );
        } else if (item.done) {
          ctl = <span className="rc-meta">{t?.requestNumber ? <>בקשה <span className="ltr-isolate">{t.requestNumber}</span></> : 'סומן כהוזן'}</span>;
        } else {
          ctl = (
            <>
              {createCell(sub)}
              <button type="button" className="rc-quiet" disabled={busy === c.busyKey} onClick={() => void c.mark()}>
                {busy === c.busyKey ? 'שומר…' : 'הוזן ידנית'}
              </button>
            </>
          );
        }
      }
    } else if (item.key === 'form') {
      if (item.done) {
        ctl = (
          <>
            {poaEntries[0]?.version && (
              <button type="button" className="rc-link" data-testid="rc-prepare-view-poa" onClick={() => setHeroPoa(poaEntries[0])}>צפייה במקומות החתימה</button>
            )}
            <button type="button" className="rc-quiet" onClick={onProduce}>עריכה</button>
          </>
        );
      } else if (formProblems.length > 0) {
        // ‼ טופס קיים שחסר בו מקום חתימה / שיוך שגוי — אומרים מה, ונותנים את הדרך לתקן.
        ctl = (
          <>
            {poaEntries[0]?.version && (
              <button type="button" className="rc-link" onClick={() => setHeroPoa(poaEntries[0])}>צפייה</button>
            )}
            <button type="button" className="btn btn-secondary btn-sm" data-testid="rc-fix-places-prepare" onClick={onProduce}>תיקון מקומות החתימה</button>
          </>
        );
      } else if (Object.keys(prepIssue).length > 0) {
        ctl = (
          <>
            <button type="button" className="btn btn-secondary btn-sm" data-testid="rc-prep-retry" onClick={retryPreparation}>נסה שוב</button>
            <button type="button" className="rc-quiet" onClick={onProduce}>סימון ידני</button>
          </>
        );
        body = (
          <span className="rc-meta" data-testid="rc-prep-issue">
            הכנת מקומות החתימה לא הושלמה ({Object.values(prepIssue).join(', ')}).
          </span>
        );
      } else if (Object.keys(layoutProblems).length > 0) {
        ctl = <button type="button" className="btn btn-secondary btn-sm" onClick={onProduce}>סימון אזורי חתימה</button>;
        body = (
          <span className="rc-meta" data-testid="form2279-layout-mismatch">
            הטופס שהגיע משע״ם שונה מהתבנית המוכרת, ולכן אזורי החתימה לא סומנו אוטומטית.
          </span>
        );
      } else {
        // ‼ הטופס מגיע משע״ם עם פתיחת הבקשה ומסומן אוטומטית (194); העלאה ידנית היא הדרך השנייה.
        ctl = <button type="button" className="rc-quiet" onClick={onProduce}>העלאה ידנית</button>;
        body = <span className="rc-meta">{waitingForShaamForm ? 'מגיע משע״ם — אזורי החתימה יסומנו אוטומטית.' : 'מגיע משע״ם אחרי פתיחת הבקשה, ואזורי החתימה מסומנים אוטומטית.'}</span>;
      }
    } else if (item.key.startsWith('ni-')) {
      const role = item.key.endsWith(':spouse') ? 'spouse' as const : 'client' as const;
      const track = niExecutionByRole[role];
      const k = role === 'spouse' ? 'nis' : 'ni';
      if (item.key.startsWith('ni-prereq')) {
        const st = niStepOf(role);
        body = st ? (
          <PrerequisiteGate step={st} currentValues={niPrereqValues} client={prereqClient} spouse={prereqSpouse}
            onSaveEmail={prereqOnSaveEmail} onChanged={() => onStepsChanged?.()}>{null}</PrerequisiteGate>
        ) : null;
      } else if (item.key.startsWith('ni-enter')) {
        ctl = item.done
          ? <span className="rc-meta">{track.foundExternally ? 'נמצא קיים באתר ב״ל' : `סומן ב-${fmt(track.enteredAt)}`}</span>
          : (
            <>
              <div className="rc-actioncell">{niNextActionNode(role)}</div>
              <button type="button" className="rc-quiet" disabled={busy === `${k}-entered`}
                onClick={() => patchNi(role, { enteredAt: new Date().toISOString() }, `${k}-entered`)}>
                {busy === `${k}-entered` ? 'שומר…' : 'הוזן ידנית'}
              </button>
            </>
          );
      } else if (item.key.startsWith('ni-ref')) {
        if (item.done) {
          ctl = <span className="rc-meta"><span className="ltr-isolate">{track.referenceNumber}</span>{track.deadline ? ` · עד ${fmt(track.deadline)}` : ''}</span>;
        } else {
          body = <NiRefForm ni={track} busy={busy === `${k}-ref`}
            onSave={(ref, deadline) => patchNi(role, { referenceNumber: ref, deadline }, `${k}-ref`)} />;
        }
      }
    }
    return (
      <div key={item.key} className="rc-check" data-done={item.done ? 'true' : 'false'} data-testid="rc-prepare-item">
        <span className="rc-check-icon" aria-hidden="true">{item.done ? '✓' : ''}</span>
        <div style={{ minWidth: 0 }}>
          <div className="rc-check-label">{item.label}</div>
          {item.detail && <div className="rc-check-detail">{item.detail}</div>}
        </div>
        {body && <div className="rc-check-body">{body}</div>}
        {ctl && <div className="rc-check-ctrl">{ctl}</div>}
      </div>
    );
  };

  // ── מה הלקוח יתבקש / מה עוד פתוח אצלו ─────────────────────────────────────
  const clientAsks = (withState: boolean): AskItem[] => {
    const items: AskItem[] = [];
    const signersLabel = signers.length > 1 ? signers.map(s => s.name).filter(Boolean).join(' ו') : '';
    items.push({
      key: 'sign', title: 'חתימה על ייפוי הכוח',
      detail: signersLabel || 'חתימה דיגיטלית — כדקה, גם מהטלפון',
      done: withState && signed,
      state: withState ? (signed ? 'נחתם' : 'טרם נחתם') : undefined,
      tone: withState ? (signed ? 'done' : 'wait') : undefined,
    });
    for (const d of idDocs) {
      if (!withState && d.status === 'confirmed') continue;
      const confirmed = d.status === 'confirmed';
      items.push({
        key: `doc:${d.key}`,
        title: d.status === 'missing' ? 'העלאת צילום תעודת זהות או רישיון נהיגה'
          : confirmed ? 'צילום התעודה אושר' : 'אישור צילום התעודה שבתיק',
        detail: `${d.person === 'spouse' ? `של ${d.personName} · ` : ''}רשות המסים דורשת אותו${withState ? '' : ' · אפשר גם אחרי החתימה'}`,
        done: withState && confirmed,
        state: withState ? (confirmed ? 'אושר' : 'ממתין') : undefined,
        tone: withState ? (confirmed ? 'done' : 'wait') : undefined,
      });
    }
    for (const role of niRoles) {
      const t = niExecutionByRole[role];
      if (!t.referenceNumber) continue;
      const final = niTrackView(t, niLineFor(role)).final;
      if (!withState && final) continue;
      items.push({
        key: `ni:${role}`,
        title: 'אישור הייצוג בביטוח הלאומי',
        detail: `${niRoles.length > 1 ? `${niNameOf(role)} · ` : ''}אסמכתא ${t.referenceNumber}${t.deadline ? ` · לאישור עד ${fmt(t.deadline)}` : ''}`,
        done: withState && final,
        state: withState ? (final ? 'אושר' : niInstructionsDelivered(t) ? 'ממתין' : 'לא נמסר') : undefined,
        tone: withState ? (final ? 'done' : 'wait') : undefined,
      });
    }
    return items;
  };

  const recipients = pendingSigners.filter(s => (sendOnlyTo ? s.id === sendOnlyTo : !!s.email.trim()));
  /** נמענים שהניסיון האחרון אליהם «לא ידוע אם יצא» — שליחה נוספת רק אחרי אישור. */
  const unknownRecipients = recipients.filter(lastAttemptUnknown);
  const proceedSend = () => (missingIds.length > 0 ? setConfirmSendWithoutId(true) : void handleSendAll(sendOnlyTo ?? undefined));
  const sendClick = () => (unknownRecipients.length > 0 ? setConfirmResendUnknown(true) : proceedSend());
  const toFirst = firstName ? `ל${firstName}` : 'ללקוח';
  const sendLabel = sendOnlyTo ? `שלח ל${pendingSigners.find(s => s.id === sendOnlyTo)?.name || 'חותם'}`
    : `שלח ${toFirst}${emailableSigners.length > 1 ? ` (${emailableSigners.length} חותמים)` : ''}`;
  const recipientLine = recipients.length > 0
    ? <div className="rc-aside-line">אל {recipients.map(s => <span key={s.id} className="ltr-isolate rc-addr">{s.email.trim()}</span>)}</div>
    : <div className="rc-aside-line" data-tone="warn">לאף חותם אין כתובת מייל</div>;

  // ── גוף ופעולה לכל מצב ────────────────────────────────────────────────────
  // ‼ 29.09.2026 · הכרטיס בשני טורים: מימין המצב (כותרת, משפט, רשימה), משמאל
  // «הפעולה» — תמיד באותו מקום. «שלח» יושב שם כבר בהכנה (כבוי) ונדלק במקום
  // כשהצעד האחרון נסגר. בטלפון הטור השמאלי יורד מתחת לגוף.
  let heroBody: React.ReactNode = null;
  let aside: { title: string; content: React.ReactNode } | null = null;
  const replacementSub = submissions.find(s => !!shaamTrack(s.key)?.replacement);

  switch (plan.kind) {
    case 'prepare': {
      const left = plan.prepare.filter(i => !i.done).length || 1;
      heroBody = <div className="rc-checklist" data-testid="rc-prepare">{plan.prepare.map(prepareRow)}</div>;
      aside = {
        title: `המייל ${toFirst}`,
        content: (
          <>
            <button className="btn btn-primary" disabled data-testid="rc-send-pending">{sendLabel}</button>
            <div className="rc-aside-line">{left === 1 ? 'ייפתח אחרי הצעד האחרון' : `ייפתח אחרי ${left} הצעדים`}</div>
            {recipients.length > 0 && recipientLine}
          </>
        ),
      };
      break;
    }
    case 'replacement':
      heroBody = replacementSub ? (
        <ReplacementBody replacement={shaamTrack(replacementSub.key)!.replacement!} remaining={replacementSub.authoritiesLabel} />
      ) : null;
      aside = replacementSub ? {
        title: `בקשה ${shaamTrack(replacementSub.key)!.replacement!.requestNumber} בשע״ם`,
        content: (
          <ReplacementConfirm requestId={request.id} submissionKey={replacementSub.key}
            replacement={shaamTrack(replacementSub.key)!.replacement!} onChanged={() => onStepsChanged?.()} />
        ),
      } : null;
      break;
    case 'send':
      heroBody = (
        <>
          <AskList title={`מה נבקש מ${firstName || 'הלקוח'}`} items={clientAsks(false)} />
          {poaEntries.filter(p => p.version).map(p => (
            <button key={p.key} type="button" className="rc-link" data-testid="rc-hero-view-poa" onClick={() => setHeroPoa(p)}>
              {poaEntries.length > 1 ? `צפייה ב${p.name} ובמקומות החתימה` : 'צפייה בטופס ובמקומות החתימה'}
            </button>
          ))}
        </>
      );
      aside = {
        title: `המייל ${toFirst}`,
        content: (
          <>
            {emailableSigners.length > 1 && (
              <div className="rc-aside-radios">
                <label><input type="radio" name="send-to" checked={sendOnlyTo === null} onChange={() => setSendOnlyTo(null)} />לכל אחד מייל נפרד</label>
                {emailableSigners.map(s => (
                  <label key={s.id}><input type="radio" name="send-to" checked={sendOnlyTo === s.id} onChange={() => setSendOnlyTo(s.id)} />רק ל{s.name || s.email}</label>
                ))}
              </div>
            )}
            <button className="btn btn-primary" data-testid="rc-send"
              disabled={busy === 'send' || niRefMissing || pendingSigners.length === 0} onClick={sendClick}>
              {busy === 'send' ? 'שולח…' : sendLabel}
            </button>
            {recipientLine}
            {unknownRecipients.length > 0 && (
              <div className="rc-aside-line" style={UNKNOWN_TEXT_STYLE} data-testid="rc-send-unknown">
                {unknownRecipients.map(s => (
                  <div key={s.id}>
                    המייל {fmtTime(signerEmails(s)[0].sentAt)} אל <span className="ltr-isolate">{s.email.trim()}</span> — לא ידוע אם יצא.
                  </div>
                ))}
                <div>לפני ששולחים שוב — כדאי לברר אם הגיע.</div>
              </div>
            )}
            {pendingSigners.length > 0 && (
              <button type="button" className="rc-link" onClick={() => setPreviewSignerId(pendingSigners[0].id)}>צפייה במייל לפני השליחה</button>
            )}
          </>
        ),
      };
      break;
    case 'waiting_client':
      heroBody = <AskList items={clientAsks(true)} />;
      aside = {
        title: signers.length > 1 ? 'המיילים לחותמים' : `המייל ${toFirst}`,
        content: (
          <div className="rc-signers" data-testid="rc-signers">
            {signers.map(s => {
              // ‼ תזכורת = אותו מייל שוב לאותה כתובת. מספיק שהבקשה נשלחה — גם בלי רשומה ביומן לכתובת הזו.
              const canRemind = !!s.email.trim() && (!!signerEmail(s) || !!exec.signatureEmailSentAt);
              return (
                <SignerLine key={s.id} signer={s} showName={signers.length > 1}
                  signed={effectiveSignStatus(request, s) === 'signed'}
                  emails={signerEmails(s)} track={niTrackFor(s)}
                  onRemind={canRemind ? () => handleRemind({ toEmail: s.email }) : undefined}
                  batchSentAt={exec.signatureEmailSentAt}
                  onCopiedLink={() => void markLinkHandedOver(s.role === 'spouse' ? 'spouse' : 'client')} />
              );
            })}
          </div>
        ),
      };
      break;
    case 'stamp': {
      heroBody = poaDocs.length > 1 ? (
        <AskList items={poaDocs.map(d => ({ key: d.key, title: d.title, done: !!d.signedPdfStoredId, state: d.signedPdfStoredId ? 'נחתם' : 'ממתין', tone: d.signedPdfStoredId ? 'done' : 'wait' }))} />
      ) : null;
      const signedAt = signers.map(s => s.signedAt).filter((x): x is string => !!x).sort().pop();
      aside = {
        title: 'החתימה שלך',
        content: (
          <>
            <button className="btn btn-primary" data-testid="rc-stamp" onClick={onStamp}>
              {poaDocs.length > 1 && nextToStamp ? `חתימה וחותמת · ${nextToStamp.title}` : 'חתימה וחותמת'}
            </button>
            {signedAt && <div className="rc-aside-line">הטופס נחתם בידי {firstName || 'הלקוח'} ב-{fmt(signedAt)}</div>}
          </>
        ),
      };
      break;
    }
    case 'waiting_docs':
    case 'blocked':
      heroBody = (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {plan.kind === 'waiting_docs' && <AskList items={clientAsks(true).filter(a => a.key.startsWith('doc:'))} />}
          {submissions.map(sub => (
            <ShaamRequiredDocsList key={sub.key} tracking={shaamTrack(sub.key)} requestId={request.id} clientId={linkedClient?.id}
              usedDocumentIds={Object.values(request.identityDocs ?? {}).flat().map(d => d?.documentId).filter((x): x is string => !!x)}
              onAttached={() => onStepsChanged?.()} />
          ))}
        </div>
      );
      // ‼ כמו «שלח» בהכנה: ההגשה יושבת בטור הפעולה גם כשהיא ממתינה ללקוח (כבויה, עם הסיבה),
      // כדי שיהיה ברור איפה היא תופיע ברגע שהצילום יאושר.
      aside = shaamLeadSubmission
        ? { title: 'ההגשה לשע״ם', content: <div className="rc-actioncell" data-testid="rc-submit">{shaamNode(shaamLeadSubmission, undefined, 'btn')}</div> }
        : null;
      break;
    case 'submit':
      aside = {
        title: 'ההגשה לשע״ם',
        content: (
          <>
            {shaamLeadSubmission && <div className="rc-actioncell" data-testid="rc-submit">{shaamNode(shaamLeadSubmission, undefined, 'btn')}</div>}
            <button type="button" className="rc-quiet" onClick={onMarkSentToShaam}>הוגש ידנית בשע״ם</button>
          </>
        ),
      };
      break;
    case 'waiting_authorities': {
      const notes = submissions.map(sub => ({ sub, f: shaamFactsOf(sub) })).filter(x => x.f?.note || x.f?.officeAction);
      const approvalOpen = !!repApproval && !isRepApprovalClosed(repApproval);
      // ‼ H2:X-4 · הדיווח של הלקוח כבר בכותרת (plan.approval) — לא שוב כאן. דיווח על זירוז
      // (לא חובה — הכותרת לא עוסקת בו) נשאר שורה אחת, כמו קודם.
      const declaredLine = approvalOpen && declared && !plan.approval;
      // ‼ המדריך — כשעוד צריך לסמן: לפני הדיווח, או כששע״ם עדיין ממתינה אחרי הדיווח.
      const guideNow = approvalOpen && (!declared || plan.approval === 'still_waiting');
      // ‼ H2.2 · מה מסמנים — אותה רשימה שבכרטיס של הלקוח (מהשרת), כדי ללוות אותו בטלפון.
      const what = guideNow ? repApprovalSummary(approvalPeople) : null;
      const pageLine = approvalOpen && !declared && repApprovalPage;
      heroBody = notes.length > 0 || declaredLine || guideNow || pageLine ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }} data-testid="rc-waiting-authorities">
          {notes.map(({ sub, f }) => (
            <div key={sub.key} className="rc-meta">
              {f!.note && <div data-testid="shaam-facts-note">{f!.note}</div>}
              {f!.officeAction && <Notice tone="required" style={{ marginTop: 6 }}>{f!.officeAction}</Notice>}
            </div>
          ))}
          {/* ‼ 03.10: «מופיעה בדף האישי» רק כשהכרטיס באמת בדף (pageStateOf); קליטה שטרם
              פורסמה — «יופיע… כשתפרסם את הקליטה» וקישור ל«בקשות». המדריך נשאר. */}
          {pageLine && (
            <span className="rc-meta" data-testid="rc-approval-page">{approvalPageLine('הבקשה לאישור')}</span>
          )}
          {declaredLine && (
            <span className="rc-meta" data-testid="rc-approval-page">{`לפי ${firstName || 'הלקוח'}, האישור באזור האישי כבר ניתן — ממתין לאימות בשע״ם.`}</span>
          )}
          {what && (
            <div className="rc-meta" data-testid="rc-approval-what">
              <div>מה מסמנים באזור האישי:</div>
              {what.lines.map(l => <div key={l} style={{ color: 'var(--ink-1)' }}>{l}</div>)}
            </div>
          )}
          {/* ‼ אותו מדריך שהלקוח רואה בכרטיס — כדי ללוות אותו בטלפון. */}
          {guideNow && (
            <div><RepApprovalGuideButton onClick={() => setApprovalGuideOpen(true)} accent="var(--accent)" /></div>
          )}
        </div>
      ) : null;
      // ‼ למה מחכים ועד מתי — שורה לכל רשות, במקום משפט אחד ארוך עם סוגריים.
      const waits = [
        ...submissions.filter(sub => !!shaamFactsOf(sub) && !shaamSettled(shaamTrack(sub.key))).map(sub => {
          const f = shaamFactsOf(sub)!;
          return {
            key: sub.key, who: `שע״ם${submissions.length > 1 ? ` · ${sub.personName}` : ''}`,
            what: f.clientApprovalRequired ? 'אישור הייצוג באזור האישי' : f.suspensionEndsAt ? 'סיום ההשהייה' : 'קליטת הייצוג',
            when: !f.clientApprovalRequired && f.suspensionEndsAt ? `צפי ${fmt(f.suspensionEndsAt)}` : '',
          };
        }),
        ...niRoles.filter(role => !niTrackView(niExecutionByRole[role], niLineFor(role)).final).map(role => {
          const t = niExecutionByRole[role];
          return { key: `ni:${role}`, who: 'ביטוח לאומי', what: `האישור של ${niNameOf(role).split(/\s+/)[0]}`, when: t.deadline ? `עד ${fmt(t.deadline)}` : '' };
        }),
      ];
      aside = waits.length > 0 || status === 'awaiting_authorities' ? {
        title: 'מה עוד פתוח',
        content: (
          <>
            {waits.length > 0 && (
              <dl className="rc-facts" data-testid="rc-waits">
                {waits.map(w => <div key={w.key}><dt>{w.who}</dt><dd>{w.what}{w.when && <span className="rc-facts-when">{w.when}</span>}</dd></div>)}
              </dl>
            )}
            {status === 'awaiting_authorities' && (
              <button type="button" className="rc-quiet" onClick={onMarkActive}>סימון ידני כמיוצג פעיל</button>
            )}
          </>
        ),
      } : null;
      break;
    }
    case 'active':
      heroBody = activeEmails.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '.4rem' }}>
          {activeEmails.map(m => <EmailStatusRow key={m.id} message={m} note="עדכון ללקוח: הייצוג אושר" onChanged={reloadEmails} />)}
        </div>
      ) : null;
      // ‼ ניסיון שנכשל בוודאות (failed) לא מסתיר את השליחה; «לא ידוע אם יצא» כן —
      // השורה שלמעלה אומרת לברר קודם, ושליחה נוספת עלולה להגיע פעמיים.
      aside = activeEmails.some(m => m.status !== 'failed') ? null : {
        title: `עדכון ${toFirst}`,
        content: (
          <>
            <button className="btn btn-secondary" onClick={() => setPreviewActive(true)}>צפייה במייל ושליחה</button>
            <div className="rc-aside-line">מייל קצר שהייצוג פעיל. לא יוצא אוטומטית.</div>
          </>
        ),
      };
      break;
  }

  // ── שורות הרשויות ─────────────────────────────────────────────────────────
  /** מצב הטופס של הגשה אחת לפני השליחה — מהעובדות לפי אדם (כשיש כרטיס). */
  const sentFormWhere = (key: string): string => {
    const f = factOf(key);
    if (!f) {
      return formReady ? 'הטופס מוכן לחתימה' : formProblems.length > 0 ? 'הטופס דורש השלמה'
        : formArrivedUnprepared ? 'הטופס הגיע · מקומות החתימה טרם סומנו' : 'ממתין לטופס';
    }
    switch (f.form) {
      case 'ready': return formProblems.length > 0 ? 'הטופס דורש השלמה' : 'הטופס מוכן לחתימה';
      case 'incomplete': return 'הטופס דורש השלמה';
      case 'layout_mismatch': return 'הטופס שונה מהתבנית — לסמן מקומות חתימה';
      case 'arrived': return 'הטופס הגיע · מקומות החתימה בהכנה';
      case 'signed': return 'נחתם';
      default: return 'ממתין לטופס משע״ם';
    }
  };
  const shaamRowStatus = (sub: ShaamSubmission, i: number): { text: string; tone?: 'attention' | 'danger' | 'done' } => {
    const t = shaamTrack(sub.key);
    const f = shaamFactsOf(sub);
    if (t?.replacement) return { text: `בקשה ${t.replacement.requestNumber} ממתינה לביטול בשע״ם`, tone: 'attention' };
    if (shaamSettled(t) || (status === 'active' && !f)) return { text: 'הייצוג נקלט', tone: 'done' };
    if (f) {
      return {
        text: [f.status ? `שע״ם: ${f.status}` : 'הוגש לשע״ם', f.suspensionEndsAt ? `צפי לסיום ההשהייה ${fmt(f.suspensionEndsAt)}` : ''].filter(Boolean).join(' · '),
        tone: f.clientApprovalRequired || f.officeAction ? 'attention' : undefined,
      };
    }
    if (shaamDocumentsBlocked(t)) return { text: 'השידור ממתין למסמך', tone: 'attention' };
    if (!enteredAtOf(sub.key, i === 0)) return { text: 'טרם נפתחה בקשה' };
    const docsPending = shaamClientDocumentsPending(preSigningDocsOf(sub));
    const num = t?.requestNumber ? `בקשה ${t.requestNumber}` : 'הבקשה קיימת בשע״ם';
    if (stamped && docsPending) return { text: `${t?.requestNumber ? `בקשה ${t.requestNumber} · ` : ''}חתום · ההגשה ממתינה לאישור הצילום`, tone: 'attention' };
    const where = stamped ? 'חתום ומוכן להגשה' : signed ? 'נחתם בידי הלקוח' : exec.signatureEmailSentAt ? 'נשלח לחתימה'
      : sentFormWhere(sub.key);
    return { text: `${num} · ${where}` };
  };
  const niRowStatus = (role: 'client' | 'spouse'): { text: string; tone?: 'attention' | 'danger' | 'done' } => {
    const t = niExecutionByRole[role];
    const view = niTrackView(t, niLineFor(role));
    if (view.final) return { text: 'הייצוג פעיל', tone: 'done' };
    if (prereqMissingOf(niStepOf(role))) return { text: 'חסרים פרטים להזנה', tone: 'attention' };
    if (!t.enteredAt) return { text: 'טרם הוזן' };
    if (!t.referenceNumber) return { text: 'הוזן · חסר מספר אסמכתא', tone: 'attention' };
    const base = `אסמכתא ${t.referenceNumber}${t.deadline ? ` · לאישור עד ${fmt(t.deadline)}` : ''}`;
    if (!niInstructionsDelivered(t)) return { text: `${base} · תצא ללקוח עם בקשת החתימה` };
    // ‼ הקריאה האחרונה מב״ל (מהנתון השמור) היא המצב — היא כבר לא מופיעה מתחת לכותרת.
    const read = t.syncedAt && t.externalState ? niReconcileLine(t) : null;
    if (read) return { text: read.text, tone: read.tone === 'success' ? 'done' : read.tone === 'warning' || read.tone === 'required' ? 'attention' : undefined };
    return { text: `${base} · ממתין לאישור הלקוח`, tone: view.deadlineNotice?.tone === 'warning' ? 'attention' : undefined };
  };

  const shaamDetail = (sub: ShaamSubmission, i: number) => {
    const c = entryCtl(sub);
    const t = shaamTrack(sub.key);
    const byEvidence = !c.manualAt && !!c.at;
    const foundThere = !!t?.foundBeforeCreateAt;
    const f = shaamFactsOf(sub);
    const hasPreDocs = preSigningDocsOf(sub).length > 0;
    return (
      <div className="rc-steps">
        <Step title="הבקשה נפתחה בשע״ם" done={!!c.at}
          hint={c.at
            ? [sub.carriesIncomeTax && regVerified && regSentence ? regSentence : '',
                t?.requestNumber ? `בקשה ${t.requestNumber}` : '',
                byEvidence ? (foundThere ? `הייתה קיימת בשע״ם (הוזנה שם) · נמצאה ב-${fmt(c.at)}` : fmt(c.at)) : `סומן ידנית ב-${fmt(c.at)}`,
                !t?.submittedAt && t?.rawRequestState ? `סטטוס בשע״ם: ${t.rawRequestState}` : '',
              ].filter(Boolean).join(' · ')
            : `הזנה אחת בשע״ם, על ת.ז. של ${sub.personName}`}>
          {(c.asksHere && !inPrepare) || editingKey === sub.key ? (
            <>
              {editingKey === sub.key && (
                <span className="rc-meta">מי רשום/ה במס הכנסה? הבחירה תעדכן את הבעלים ואת מספר התיק בכרטיס.</span>
              )}
              {regChoiceNode(c.busyKey, c.mark)}
              {editingKey === sub.key && <button type="button" className="rc-quiet" onClick={() => setEditingKey(null)}>ביטול</button>}
            </>
          ) : (sub.carriesIncomeTax && regChoice && regVerified) || c.manualAt ? (
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
              {sub.carriesIncomeTax && regChoice && regVerified && (
                <button type="button" className="rc-quiet" disabled={busy === c.busyKey} onClick={() => setEditingKey(sub.key)}>
                  שינוי בן/בת הזוג הרשום/ה
                </button>
              )}
              {c.manualAt && (
                <button type="button" className="rc-quiet" disabled={busy === c.busyKey} onClick={() => void c.unmark()}>
                  {busy === c.busyKey ? 'שומר…' : 'ביטול הסימון'}
                </button>
              )}
            </div>
          ) : null}
        </Step>

        <Step title="טופס ייפוי הכוח לחתימה" done={formReady}
          hint={formReady
            ? (poaDocs.length > 1 ? `${poaDocs.length} טפסים` : (poaDocs[0]?.pdfFileName || 'הטופס'))
            : waitingForShaamForm ? 'מגיע משע״ם עם פתיחת הבקשה' : 'העלאת הטופס וסימון אזורי החתימה'}>
          {!inPrepare && (
            <button type="button" className="rc-quiet" onClick={onProduce}>{formReady ? 'החלפת טופס או עריכת אזורים' : 'העלאת טופס וסימון אזורים'}</button>
          )}
          {/* ‼ 208 · מה ששע״ם כתבה ביצירה שיידרש — רשימה מקבילה, לא שלב בשרשרת. */}
          {hasPreDocs && !sentToShaam && (
            <ShaamPreSigningDocsList
              items={preSigningDocsOf(sub)}
              clientId={linkedClient?.id}
              requestId={request.id}
              usedDocumentIds={Object.values(request.identityDocs ?? {}).flat().map(d => d?.documentId).filter((x): x is string => !!x)}
              onChanged={() => onStepsChanged?.()}
            />
          )}
        </Step>


        <Step title="נשלח ללקוח לחתימה" done={!!exec.signatureEmailSentAt}
          hint={exec.signatureEmailSentAt ? fmtDateTime(exec.signatureEmailSentAt) : undefined} />
        <Step title="הלקוח חתם" done={signed} />
        <Step title="החתימה והחותמת שלך" done={stamped}
          hint={!stamped && poaDocs.length > 1 && poaDocs.some(d => d.signedPdfStoredId)
            ? poaDocs.filter(d => d.signedPdfStoredId).map(d => `✓ ${d.title}`).join(' · ') : undefined} />

        <Step title="הוגש לשע״ם" done={sentToShaam}
          hint={f ? (f.submittedAt ? `הוגש ${fmtDateTime(f.submittedAt)}` : 'הוגש מחוץ ל-PIVO') : undefined}>
          {f && (
            <div data-testid="shaam-submitted-facts" style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 'var(--fs-13)', color: 'var(--ink-2)' }}>
              {f.status && <div>סטטוס בשע״ם: <strong>{f.status}</strong></div>}
              {f.suspensionEndsAt && <div>צפי לסיום ההשהייה: {fmt(f.suspensionEndsAt)}</div>}
              {f.note && plan.kind !== 'waiting_authorities' && <div className="rc-meta">{f.note}</div>}
              {f.missingFileSystems.map(m => {
                const auth = m.authority && m.authority !== 'incomeTax' ? m.authority : undefined;
                const canDrop = !!auth && !!linkedClient && !!linkedClient.authorityRepresentations?.[auth]
                  && linkedClient.authorityRepresentations[auth]?.status !== 'active';
                const dropped = !!auth && !!linkedClient && !linkedClient.authorityRepresentations?.[auth];
                return (
                  <div key={m.label} data-testid="shaam-missing-file" className="rc-meta">
                    {m.label}: אין תיק — {dropped ? 'הוסר מהבקשה ב-PIVO (בשע״ם נשאר עד שיבוטל שם)' : <>ייקלט מעצמו אם ייפתח{m.deadline ? ` (שע״ם מבטלת אם לא ייפתח עד ${fmt(m.deadline)})` : ''}</>}
                    {canDrop && linkedClient && auth && (
                      <div><ShaamDropAuthorityButton clientId={linkedClient.id} authority={auth} label={m.label} onChanged={() => onStepsChanged?.()} /></div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          {stamped && !sentToShaam && plan.kind !== 'submit' && (
            <button type="button" className="rc-quiet" onClick={onMarkSentToShaam}>הוגש ידנית בשע״ם</button>
          )}
        </Step>

        {/* ‼ שם אחד בכל מקום (STEP_TYPE_LABELS); «זירוז» הוא שורת המשנה כשאינו חובה. */}
        {repApproval && i === 0 && (
          <SideStep
            title="אישור הייצוג באזור האישי"
            required={approvalRequired}
            done={isRepApprovalClosed(repApproval)}
            hint={isRepApprovalClosed(repApproval) ? undefined
              : declared ? (plan.approval === 'still_waiting'
                ? 'הלקוח דיווח שאישר, אבל בבדיקה שאחרי הדיווח שע״ם עדיין ממתינה'
                : 'הלקוח דיווח שאישר - ממתין לאימות בשע״ם')
              : [approvalRequired ? 'נדרש - רשות המסים ממתינה לאישור הלקוח' : 'זירוז - מקצר את ההמתנה, והייצוג ייקלט גם בלעדיו',
                 repApprovalPage === 'shown' ? (approvalRequired ? 'הבקשה מופיעה בדף האישי שלו' : 'הבקשה מופיעה בדף האישי של הלקוח')
                   : repApprovalPage ? `יופיע בדף האישי ${notYetOnPage(repApprovalPage)}` : null,
                ].filter(Boolean).join('. ')}>
            {!isRepApprovalClosed(repApproval) && (
              <RepApprovalGuideButton onClick={() => setApprovalGuideOpen(true)} accent="var(--accent)" />
            )}
            {!isRepApprovalClosed(repApproval) && !declared && repApprovalPage && repApprovalPage !== 'shown' && requestsLink}
          </SideStep>
        )}

        <Step title="הייצוג נקלט" done={status === 'active' || shaamSettled(t)}>
          {status === 'awaiting_authorities' && plan.kind !== 'waiting_authorities' && (
            <button type="button" className="rc-quiet" onClick={onMarkActive}>סימון ידני כמיוצג פעיל</button>
          )}
        </Step>
      </div>
    );
  };

  // ── גוף שורת שע״ם: מה חסר / הצעד הבא, ועובדות ─────────────────────────────
  const usedIdDocIds = Object.values(request.identityDocs ?? {}).flat().map(d => d?.documentId).filter((x): x is string => !!x);
  const shaamNow = (sub: ShaamSubmission): React.ReactNode => {
    const c = entryCtl(sub);
    const t = shaamTrack(sub.key);
    const f = shaamFactsOf(sub);
    const createHere = !c.at && !inPrepare && !t?.replacement;
    const missing = preSigningDocsOf(sub).filter(d => d.kind !== 'poa' && d.kind !== 'other'
      && (d.status === 'missing' || d.status === 'awaiting_confirmation'));
    const gate = !['waiting_docs', 'blocked'].includes(plan.kind) && !!shaamDocumentsView(t);
    const office = f?.officeAction && plan.kind !== 'waiting_authorities';
    const approval = f?.clientApprovalRequired && !repApproval;
    if (!createHere && !missing.length && !gate && !office && !approval) return null;
    return (
      <NowBlock title={createHere ? 'הצעד הבא' : 'מה חסר'}>
        {createHere && (
          <div className="rc-now-acts">
            {createCell(sub)}
            <button type="button" className="rc-quiet" disabled={busy === c.busyKey} onClick={() => void c.mark()}>
              {busy === c.busyKey ? 'שומר…' : 'הוזן ידנית'}
            </button>
          </div>
        )}
        {missing.map(d => {
          // ‼ 03.10: «מופיעה בדף האישי» רק כשהבקשה באמת בדף (idRequestPage); לא ידוע ⇒ בלי טענה.
          const pg = idRequestPage(d);
          const hidden = pg === 'intake' || pg === 'draft';
          const page = d.status === 'missing'
            ? (exec.signatureEmailSentAt
              ? (pg === 'shown' ? 'הבקשה להעלות מופיעה בדף האישי של הלקוח.' : hidden ? `הבקשה להעלות תופיע בדף האישי ${notYetOnPage(pg)}.` : '')
              : hidden ? `הלקוח יתבקש להעלות בדף האישי ${notYetOnPage(pg)}.` : 'הלקוח יתבקש להעלות יחד עם בקשת החתימה.')
            : (exec.signatureEmailSentAt
              ? (pg === 'shown' ? 'הבקשה מופיעה בדף האישי של הלקוח.' : hidden ? `הבקשה תופיע בדף האישי ${notYetOnPage(pg)}.` : '')
              : hidden ? `הלקוח יתבקש לאשר בדף האישי ${notYetOnPage(pg)}.` : 'הלקוח יתבקש לאשר יחד עם בקשת החתימה.');
          return (
          <div key={d.key} className="rc-now-line" data-testid="rc-now-missing">
            {d.status === 'missing'
              ? <>צילום תעודה מזהה של {d.personName} — אין בתיק.{page && ` ${page}`}</>
              : <>צילום תעודה מזהה של {d.personName} — ממתין לאישור הלקוח.{page && ` ${page}`}</>}
            {hidden && requestsLink && <> {requestsLink}</>}
            {d.status === 'missing' && linkedClient && (
              <IdentityDocAttach requestId={request.id} clientId={linkedClient.id}
                missing={[{ person: d.person, name: d.personName, kind: d.kind === 'passport' ? 'passport' : 'idOrLicense' }]}
                usedDocumentIds={usedIdDocIds} onAttached={() => onStepsChanged?.()} />
            )}
          </div>
          );
        })}
        {gate && (
          <ShaamRequiredDocsList tracking={t} requestId={request.id} clientId={linkedClient?.id}
            usedDocumentIds={usedIdDocIds} onAttached={() => onStepsChanged?.()} />
        )}
        {office && <Notice tone="required">{f!.officeAction}</Notice>}
        {approval && <Notice tone="required">רשות המסים ממתינה לאישור הלקוח באזור האישי. בלי האישור הייצוג לא ייקלט.</Notice>}
      </NowBlock>
    );
  };
  const shaamFacts = (sub: ShaamSubmission) => {
    const c = entryCtl(sub);
    const t = shaamTrack(sub.key);
    const f = shaamFactsOf(sub);
    const settledNow = shaamSettled(t) || (status === 'active' && !f);
    return [
      { label: 'הבקשה בשע״ם', value: c.at ? `${t?.requestNumber ? `מספר ${t.requestNumber}` : 'נפתחה'} · ${fmt(c.at)}` : 'טרם נפתחה' },
      {
        label: 'ייפוי הכוח',
        value: stamped ? 'חתום ומוחתם' : signed ? 'חתום על ידי הלקוח · נשארו החתימה והחותמת שלך'
          : formReady ? (exec.signatureEmailSentAt ? `נשלח לחתימה ב-${fmt(exec.signatureEmailSentAt)}` : 'מוכן לחתימה')
          : formProblems.length > 0 ? 'הטופס דורש השלמה'
          : formArrivedUnprepared ? 'הגיע משע״ם · מקומות החתימה טרם סומנו'
          : t?.replacement ? 'הטופס הקודם בוטל' : waitingForShaamForm ? 'ממתין לטופס משע״ם' : 'טרם הגיע',
        tone: stamped ? 'done' as const : undefined,
      },
      {
        label: 'הגשה',
        value: f ? [f.submittedAt ? `הוגש ${fmt(f.submittedAt)}` : 'הוגש', f.status ? `שע״ם: ${f.status}` : '',
          f.suspensionEndsAt ? `צפי ${fmt(f.suspensionEndsAt)}` : ''].filter(Boolean).join(' · ')
          : stamped ? 'מוכן להגשה' : 'טרם הוגש',
      },
      // עובדה ריקה («—») אינה מידע — הקליטה מופיעה רק מרגע ההגשה.
      ...(f || settledNow ? [{ label: 'קליטה', value: settledNow ? 'הייצוג נקלט' : 'ממתין לקליטה', tone: settledNow ? 'done' as const : undefined }] : []),
    ];
  };
  // ── גוף שורת ב״ל: עובדות; הציר והעריכה מאחורי הקישור ──────────────────────
  const niFacts = (role: 'client' | 'spouse') => {
    const t = niExecutionByRole[role];
    const view = niTrackView(t, niLineFor(role));
    const ext = niExternalEvidence(t);
    return [
      { label: 'ייפוי הכוח בב״ל', value: t.enteredAt ? (t.foundExternally ? 'נמצא קיים באתר ב״ל' : `הוזן ${fmt(t.enteredAt)}`) : 'טרם הוזן' },
      { label: 'אסמכתא', value: t.referenceNumber ? <span className="ltr-isolate">{t.referenceNumber}</span> : t.enteredAt ? 'חסרה' : '—' },
      {
        label: 'לאישור עד',
        value: t.deadline ? `${fmt(t.deadline)}${view.deadlineNotice ? ` · ${view.deadlineNotice.text}` : ''}` : '—',
        tone: view.deadlineNotice?.tone === 'warning' ? 'wait' as const : undefined,
      },
      {
        label: 'ההוראות ללקוח',
        value: t.instructionsSentWith === 'signature' ? 'נשלחו עם בקשת החתימה'
          : t.instructionsSentWith === 'link' ? `הקישור נמסר ידנית ${fmt(t.instructionsSentAt)}`
          : t.instructionsSentAt ? `נשלחו ${fmt(t.instructionsSentAt)}` : 'ייצאו עם בקשת החתימה',
      },
      {
        label: 'אישור הלקוח',
        value: view.final ? (t.confirmedAt ? `אושר ${fmt(t.confirmedAt)}` : 'הייצוג פעיל')
          : ext ? `${ext.label}${ext.at ? ` · נבדק ${fmt(ext.at)}` : ''}` : 'עוד לא נבדק',
        tone: view.final ? 'done' as const : undefined,
      },
    ];
  };
  /** ב״ל: כשצריך לפעול בתוך הציר (פרטים חסרים, הזנה, אסמכתא) — הוא נפתח מעצמו. */
  const niNeedsHands = (role: 'client' | 'spouse') => {
    const t = niExecutionByRole[role];
    return !inPrepare && (prereqMissingOf(niStepOf(role)) || !t.enteredAt || !t.referenceNumber);
  };

  return (
    <div id="rep-execution" className="rc">
      {/* ─────────── מה עכשיו ─────────── */}
      <section className="rc-hero" data-ball={plan.ball} data-kind={plan.kind} data-testid="rc-hero">
        <div className="rc-rail" aria-label="שלבי הייצוג">
          {plan.phases.map(p => (
            <div key={p.key} className="rc-rail-seg" data-state={p.state} aria-current={p.state === 'current' ? 'step' : undefined}>
              <div className="rc-rail-bar" />
              <span className="rc-rail-label">{p.label}</span>
            </div>
          ))}
        </div>
        {/* בטלפון: שורה אחת במקום תוויות דחוסות מתחת לכל קטע */}
        {(() => {
          const i = plan.phases.findIndex(p => p.state === 'current');
          return i >= 0 ? <div className="rc-rail-caption">שלב {i + 1} מתוך {plan.phases.length} · {plan.phases[i].label}</div> : null;
        })()}
        <div className="rc-hero-grid" data-aside={aside ? 'true' : 'false'}>
          <div className="rc-hero-main">
            <span className="rc-ball" data-testid="rc-ball">{plan.ballLabel}</span>
            <h2 className="rc-headline" data-testid="rc-headline">{plan.headline}</h2>
            <p className="rc-sub">{plan.sub}</p>
            {heroBody && <div className="rc-body">{heroBody}</div>}
          </div>
          {aside && (
            <aside className="rc-aside" data-testid="rc-aside" aria-label={aside.title}>
              <div className="rc-aside-title">{aside.title}</div>
              {aside.content}
            </aside>
          )}
        </div>
        {note && (
          <div className="rc-note" data-kind={note.kind} role="status"
            style={note.kind === 'unknown' ? { background: 'var(--chip-amber-bg)', ...UNKNOWN_TEXT_STYLE } : undefined}>
            {note.kind === 'ok' ? '✓ ' : ''}{note.text}
          </div>
        )}
      </section>

      {/* ─────────── מסמכי הבקשה — צפייה בלחיצה אחת ─────────── */}
      {/* ‼ «תיקון מקומות החתימה» נמצא כבר בשורת הטופס בהכנה — כאן רק כשאין הכנה (נשלח וכו'). */}
      <RepDocuments poa={poaEntries} signers={signers} signatureValues={request.signatureValues} onFixPlaces={inPrepare ? undefined : onProduce}
        ids={idEntries} loadDoc={loadDoc} composeClientSigned={composeClientSigned}
        displayable={displayable} onRetry={id => void pdf.retry(id)}
        onDecide={pdf.decide} officeOnline={pdf.officeOnline}
        onRegenerateFinal={onRegenerateSignedPdf} regeneratingFinal={regeneratingSignedPdf} />

      {/* ─────────── מול הרשויות ─────────── */}
      <section>
        <div className="rc-section-head">
          {/* ‼ הפעולה היחידה במסך שבודקת מול הרשויות — צמודה לכותרת, פעם אחת. */}
          <RepresentationReconcileButton heading={<div className="card-title rc-section-title">מול הרשויות</div>}
            clientId={linkedClient?.id} shaam={shaamReconcile} btl={btlReconcile} onChanged={onStepsChanged}
            persistedLines={false} notChecked={reconcileNotChecked} />
        </div>
        <div className="rc-list">
          {submissions.map((sub, i) => {
            const st = shaamRowStatus(sub, i);
            return (
              <AuthRow key={sub.key} testId="rc-row-shaam" name="רשות המסים · שע״ם"
                scope={`${sub.authoritiesLabel}${submissions.length > 1 ? ` · ${sub.personName}` : ''}`}
                status={st.text} tone={st.tone}>
                {shaamNow(sub)}
                <Facts items={shaamFacts(sub)} />
                <History>{shaamDetail(sub, i)}</History>
              </AuthRow>
            );
          })}
          {niRoles.map(role => {
            const st = niRowStatus(role);
            return (
              <AuthRow key={role} testId="rc-row-ni" name="ביטוח לאומי" scope={niNameOf(role)} status={st.text} tone={st.tone}>
                <Facts items={niFacts(role)} />
                <History defaultOpen={niNeedsHands(role)}>
                <NiDetail
                  ni={niExecutionByRole[role]} line={niLineFor(role)} busy={busy} busyPrefix={role === 'spouse' ? 'nis' : 'ni'}
                  inPrepare={inPrepare}
                  nextAction={niNextActionNode(role)}
                  onPatch={(p, label) => patchNi(role, p, label)}
                  resultShownAbove={false}
                  prereqStep={niStepOf(role)}
                  prereqCurrentValues={niPrereqValues}
                  prereqClient={prereqClient}
                  prereqSpouse={prereqSpouse}
                  prereqOnSaveEmail={prereqOnSaveEmail}
                  prereqOnChanged={() => onStepsChanged?.()}
                />
                </History>
                {/* ‼ 212: מחיקה/ביטול — מחוץ להיסטוריה המקופלת, כדי שלא יוסתר. */}
                <div className="rc-row-foot">{niCancelNode(role)}</div>
              </AuthRow>
            );
          })}
          {niRoles.length === 0 && submissions.length === 0 && (
            <div className="rc-meta" style={{ padding: '14px 20px' }}>לא התבקש ייצוג ברשויות.</div>
          )}
        </div>
        {niRoles.length === 0 && submissions.length > 0 && (
          <div className="rc-meta" style={{ marginTop: 8 }}>לא התבקש ייצוג בביטוח לאומי.</div>
        )}
      </section>

      {/* ─────────── פרטים — רשימה אחת, כל שורה נפתחת לפי דרישה ─────────── */}
      {(dataPanel || requestPanel || signatureEmails.length > 0) && (
        <section>
          <div className="rc-section-head"><div className="rc-section-title">פרטים</div></div>
          <div className="rc-list">
            {dataPanel && (
              <More title="פרטי הלקוח להזנה ברשויות" meta="להעתקה לאתר של כל רשות" defaultOpen={inPrepare} testId="rc-data">
                {dataPanel}
              </More>
            )}
            {signatureEmails.length > 0 && (
              <More title="המיילים ללקוח" testId="rc-emails"
                meta={signatureEmails.length === 1 ? 'מייל אחד · מסירה ופתיחה' : `${signatureEmails.length} מיילים · מסירה ופתיחה`}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '.4rem' }}>
                  {signatureEmails.map(m => {
                    // ‼ הניסיון האחרון לכתובת הזו «לא ידוע אם יצא» — בלי «תזכורת» בלחיצה אחת:
                    // השליחה מחדש עוברת אישור (בכרטיס «מה עכשיו» / בשורת החותם).
                    const addr = m.toEmail.trim().toLowerCase();
                    const latest = signatureEmails.find(x => x.toEmail.trim().toLowerCase() === addr);
                    return (
                      <EmailStatusRow key={m.id} message={m} onChanged={reloadEmails}
                        onRemind={isUnknownEmailStatus(latest?.status) ? undefined : async () => (await handleRemind(m))?.text ?? null} />
                    );
                  })}
                </div>
              </More>
            )}
            {requestPanel && (
              <More title="פרטי הבקשה" meta="מייל, סוג ייפוי הכוח וצילומי תעודות" testId="rc-request">{requestPanel}</More>
            )}
          </div>
        </section>
      )}

      {previewActive && (
        <EmailPreviewDialog
          heading="עדכון ללקוח - הייצוג אושר"
          body={{ requestId: request.id, stage: 'active' }}
          onSent={reloadEmails}
          onClose={() => setPreviewActive(false)}
        />
      )}

      {confirmResendUnknown && (
        <ConfirmDialog
          tone="normal"
          title="לא ידוע אם המייל הקודם יצא"
          message={<div data-testid="resend-unknown-dialog" style={{ lineHeight: 1.7 }}>
            {unknownRecipients.map(s => (
              <div key={s.id}>
                המייל {fmtTime(signerEmails(s)[0].sentAt)} אל <span className="ltr-isolate">{s.email.trim()}</span> — ספק הדואר לא החזיר תשובה ברורה.
              </div>
            ))}
            <div style={{ marginTop: '.4rem' }}>אם הוא כבר הגיע, שליחה נוספת תגיע פעמיים. כדאי לברר קודם עם {unknownRecipients.map(s => s.name || 'הנמען').join(' ועם ')}.</div>
          </div>}
          confirmLabel="שלח שוב בכל זאת"
          cancelLabel="אברר קודם"
          onCancel={() => setConfirmResendUnknown(false)}
          onConfirm={() => { setConfirmResendUnknown(false); proceedSend(); }}
        />
      )}

      {confirmSendWithoutId && (
        <ConfirmDialog
          tone="normal"
          title={shaamDemandsMissingId ? 'רשות המסים דורשת צילום תעודה שעוד אין בתיק' : 'צילום התעודה שביקשנו טרם התקבל'}
          message={<>
            <div>טרם התקבל צילום תעודה של: <b>{missingIds.map(m => m.name).join(', ')}</b>.</div>
            {shaamDemandsMissingId ? (
              <>
                <div style={{ marginTop: '.4rem' }}>{uploadPage === 'intake' || uploadPage === 'draft'
                  ? `רשות המסים דורשת את הצילום הזה לבקשה. בקשת ההעלאה תצורף לשליחה, ותופיע בדף האישי ${notYetOnPage(uploadPage)}.`
                  : 'רשות המסים דורשת את הצילום הזה לבקשה. בקשת ההעלאה תצורף לשליחה, והלקוח יראה אותה בדף האישי ליד החתימה.'}</div>
                <div style={{ marginTop: '.4rem' }}>אפשר לשלוח לחתימה עכשיו; השידור לשע״ם ימתין עד שהצילום יגיע.</div>
              </>
            ) : (
              <>
                <div style={{ marginTop: '.4rem' }}>זו בקשה של המשרד - היא לא עוצרת את החתימה או את הייצוג.</div>
                <div style={{ marginTop: '.4rem' }}>אפשר לשלוח לחתימה גם עכשיו; הצילום ימשיך להופיע כחסר עד שהלקוח יעלה אותו בדף האישי.</div>
              </>
            )}
          </>}
          confirmLabel="שלח בכל זאת"
          onCancel={() => setConfirmSendWithoutId(false)}
          onConfirm={() => { setConfirmSendWithoutId(false); void handleSendAll(sendOnlyTo ?? undefined); }}
        />
      )}

      {unassignedAsk && (
        <ConfirmDialog
          tone="normal"
          title="יש בתיק צילום תעודה שלא שויך לאף אדם"
          message={<div data-testid="unassigned-identity-dialog" style={{ lineHeight: 1.7 }}>
            <div>רשות המסים דורשת צילום תעודה, ובתיק יש צילום שלא ידוע של מי הוא. לא שלחנו עדיין כלום.</div>
            <div style={{ marginTop: '.4rem' }}>· אם הוא של האדם הנכון - סגרו את החלון ושייכו אותו בפירוט של רשות המסים («מה רשות המסים דורשת להגשה»). אחרי השיוך הלקוח יתבקש לאשר אותו.</div>
            <div style={{ marginTop: '.4rem' }}>{uploadPage === 'intake' || uploadPage === 'draft'
              ? `· אחרת - הלקוח יתבקש להעלות צילום בדף האישי ${notYetOnPage(uploadPage)}.`
              : '· אחרת - הלקוח יתבקש להעלות צילום בדף האישי, יחד עם בקשת החתימה.'}</div>
          </div>}
          confirmLabel="בקש מהלקוח צילום ושלח"
          cancelLabel="אשייך קודם"
          onCancel={() => setUnassignedAsk(null)}
          onConfirm={() => { const o = unassignedAsk.only; setUnassignedAsk(null); void handleSendAll(o, true); }}
        />
      )}

      {approvalGuideOpen && (
        <RepApprovalGuide onClose={() => setApprovalGuideOpen(false)} entryUrl={REP_PORTAL_CARD_FIXED.linkUrl}
          approvals={approvalPeople} />
      )}

      {heroPoa && (
        <PoaViewer entry={heroPoa} signers={signers} values={request.signatureValues} loadDoc={loadDoc}
          composeClientSigned={composeClientSigned} onClose={() => setHeroPoa(null)} />
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
 * חותם אחד בטור «המייל»: הכתובת, מה קרה למייל, ומה אפשר לעשות.
 * ‼ שתי עובדות נפרדות: **המייל** (נמסר/נפתח — מצב הכתובת; תיבה משותפת תיראה
 * פעמיים וזה נכון) ו**האסמכתא** (האם ההוראות של האדם הזה יצאו — עובדה פר-אדם).
 * ‼ 29.09.2026 · «נשלח» נקרא ממקור אחד: הרשומה ביומן לכתובת הזו, ובלעדיה — מועד
 * השליחה של הבקשה (נכתב רק אחרי שכל המיילים יצאו בהצלחה). כך הכותרת («המייל
 * יצא») והשורה של החותם לעולם לא סותרות זו את זו.
 */
function SignerLine({ signer, showName, signed, emails, track, onCopiedLink, onRemind, batchSentAt }: {
  signer: RepSigner;
  showName: boolean;
  signed: boolean;
  /** הניסיונות לכתובת הזו, מהחדש לישן. */
  emails: { toEmail: string; sentAt: string; openedAt?: string; clickedAt?: string; status: string }[];
  track?: NiTracking;
  onCopiedLink: () => void;
  onRemind?: () => Promise<{ text: string; unknown: boolean } | null>;
  batchSentAt?: string;
}) {
  const [copied, setCopied] = useState(false);
  const [reminded, setReminded] = useState<{ ok: boolean; unknown?: boolean; text: string } | null>(null);
  /** «שליחה חוזרת» אחרי ניסיון שלא ידוע אם יצא — שואלים פעם אחת לפני ששולחים. */
  const [confirmAgain, setConfirmAgain] = useState(false);
  const hasAddress = !!signer.email.trim();
  // ‼ «נכשל» = השליחה שלנו לא יצאה (למשל תקלה בספק המייל) — לא «המייל חזר». המצב נקרא
  // מהמייל האחרון שבאמת יצא, וניסיון אחרון שנכשל מוצג לצדו ולא במקומו.
  // ‼ «לא ידוע אם יצא» (unknown) גם אינו «נשלח»: הוא לא נספר כמייל שיצא, ומוצג כתום לצדו.
  const email = emails.find(m => m.status !== 'failed' && !isUnknownEmailStatus(m.status));
  const latest = emails[0];
  const lastFailed = latest?.status === 'failed';
  const lastUnknown = isUnknownEmailStatus(latest?.status);
  const opened = !!email && (!!email.openedAt || ['opened', 'clicked'].includes(email.status));
  const bounced = !!email && ['bounced', 'complained'].includes(email.status);
  const link = signer.signToken ? `${window.location.origin}/?sign=${signer.signToken}` : '';
  // ‼ האסמכתא לא נמסרה — הפער שאין לו שום סימן אחר במסך.
  const refPending = !!track?.referenceNumber && !track.instructionsSentAt;
  const handedByLink = track?.instructionsSentWith === 'link';
  const sentAt = email?.sentAt ?? batchSentAt;
  const who = signer.name?.trim().split(/\s+/)[0] || 'הנמען';

  const copy = async () => {
    if (!link) return;
    try { await navigator.clipboard.writeText(link); } catch { return; }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2500);
    onCopiedLink();
  };
  const remind = async () => {
    if (!onRemind) return;
    setConfirmAgain(false);
    setReminded({ ok: true, text: 'שולח…' });
    const r = await onRemind();
    // ‼ השגיאה כבר אומרת «המייל לא נשלח (…)» — בלי קידומת שנייה.
    setReminded(!r ? { ok: true, text: 'נשלח שוב ✓' } : { ok: false, unknown: r.unknown, text: r.text });
  };

  const state = signed ? 'החתימה התקבלה'
    : !hasAddress ? (handedByLink ? 'הקישור נמסר ידנית' : 'אין כתובת מייל')
    : bounced ? 'המייל חזר — כדאי לבדוק את הכתובת'
    : sentAt ? `נשלח ${fmtTime(sentAt)}${email ? (opened ? ' · נפתח' : ' · טרם נפתח') : ''}`
    : lastUnknown ? 'לא ידוע אם המייל יצא'
    : 'טרם נשלח';
  const tone = signed ? 'done' : bounced || (!hasAddress && !handedByLink) ? 'warn' : undefined;
  const stateUnknown = !signed && hasAddress && !bounced && !sentAt && lastUnknown;

  return (
    <div className="rc-signer" data-testid="rc-signer">
      {showName && <div className="rc-signer-name">{signer.name || signer.email}</div>}
      {hasAddress && <div className="rc-signer-addr"><span className="ltr-isolate">{signer.email.trim()}</span></div>}
      <div className="rc-signer-state" data-tone={stateUnknown ? 'unknown' : tone}
        style={stateUnknown ? UNKNOWN_TEXT_STYLE : undefined}>{state}</div>
      {hasAddress && handedByLink && !signed && <div className="rc-meta">הקישור נמסר גם ידנית</div>}
      {lastFailed && !signed && !reminded && <div className="rc-err">השליחה האחרונה נכשלה{latest?.sentAt ? ` ${fmtTime(latest.sentAt)}` : ''}</div>}
      {lastUnknown && !signed && !reminded && (
        <div className="rc-meta" style={UNKNOWN_TEXT_STYLE} data-testid="rc-signer-unknown">
          {sentAt ? 'לא ידוע אם השליחה החוזרת' : 'ניסיון'} {fmtTime(latest.sentAt)}{sentAt ? ' יצאה' : ' — ספק הדואר לא החזיר תשובה ברורה'}.
          {' '}לפני ששולחים שוב — כדאי לברר עם {who} אם קיבל אותו.
        </div>
      )}
      {refPending && <div className="rc-err">אסמכתא {track!.referenceNumber} של ביטוח לאומי טרם נמסרה</div>}
      {!signed && (onRemind || link) && (
        <div className="rc-signer-acts">
          {onRemind && (
            <button type="button" className="btn btn-secondary btn-sm"
              onClick={() => (lastUnknown && !confirmAgain ? setConfirmAgain(true) : void remind())}>
              {lastUnknown && confirmAgain ? 'שלח שוב בכל זאת' : 'שליחה חוזרת'}
            </button>
          )}
          {link && <button type="button" className="rc-link" onClick={() => void copy()}>{copied ? '✓ הועתק' : 'העתקת קישור אישי'}</button>}
        </div>
      )}
      {confirmAgain && (
        <div className="rc-meta" style={UNKNOWN_TEXT_STYLE} data-testid="rc-signer-confirm">
          אם המייל הקודם כבר הגיע, {who} יקבל אותו פעמיים.{' '}
          <button type="button" className="rc-link" onClick={() => setConfirmAgain(false)}>ביטול</button>
        </div>
      )}
      {reminded && (
        <div className={reminded.ok ? 'rc-meta' : reminded.unknown ? 'rc-meta' : 'rc-err'}
          style={reminded.unknown ? UNKNOWN_TEXT_STYLE : undefined}>{reminded.text}</div>
      )}
    </div>
  );
}

/** «28.9 בשעה 10:39» — לשורת החותם. */
function fmtTime(iso: string) {
  const d = new Date(iso);
  return `ב-${d.toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric' })} בשעה ${d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}`;
}

/**
 * הפירוט של ביטוח לאומי לאדם אחד. בב"ל לכל אדם תיק נפרד — לכל אחד אסמכתא,
 * מועד תפוגה ואישור משלו.
 * ‼ בזמן ההכנה, ההזנה והאסמכתא הן פקדים בכרטיס «מה עכשיו» — כאן הן רק מצב
 * (אותו פקד לא מופיע פעמיים). אחרי ההכנה — עריכה לפי דרישה.
 */
function NiDetail({
  ni, line, busy, busyPrefix, inPrepare, nextAction, onPatch, resultShownAbove,
  prereqStep, prereqCurrentValues, prereqClient, prereqSpouse, prereqOnSaveEmail, prereqOnChanged,
}: {
  ni: NiTracking;
  line?: NiRepresentationLine | null;
  busy: string | null;
  busyPrefix: string;
  inPrepare: boolean;
  nextAction?: React.ReactNode;
  onPatch: (p: Partial<NiTracking>, label: string) => void;
  /** מה שב״ל אמרה כבר מוצג בשורה שמתחת לכותרת «מול הרשויות» — לא חוזרים עליו. */
  resultShownAbove?: boolean;
  prereqStep?: OnboardingStep | null;
  prereqCurrentValues?: Record<string, string | undefined>;
  prereqClient?: PrerequisitePerson;
  prereqSpouse?: PrerequisitePerson;
  prereqOnSaveEmail?: (role: 'client' | 'spouse', email: string) => Promise<void>;
  prereqOnChanged?: () => void;
}) {
  const [editingRef, setEditingRef] = useState(false);
  const external = niExternalEvidence(ni);
  // ‼ סדר קדימות (representationCenter.niTrackView): סופי > נוכחי > היסטורי.
  const view = niTrackView(ni, line);
  const sentWithSignature = ni.instructionsSentWith === 'signature';
  const k = (suffix: string) => `${busyPrefix}-${suffix}`;

  const executionSteps = (
    <div className="rc-steps">
      {/* ‼ `foundExternally` (195): הרישום נמצא קיים בב"ל ולא נוצר מכאן. */}
      <Step title="ייפוי הכוח הוזן באתר ב״ל" done={!!ni.enteredAt}
        hint={!ni.enteredAt ? 'מסך «הוספת ייפוי כח מבוטח» — ארבעת השדות מ«פרטי הלקוח להזנה»'
          : ni.foundExternally ? `נמצא קיים באתר ב״ל (הוזן שם, לא מכאן) · ${fmt(ni.enteredAt)}`
          : `סומן ב-${fmt(ni.enteredAt)}`}>
        {!ni.enteredAt && !inPrepare && (
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <div className="rc-actioncell">{nextAction}</div>
            <button type="button" className="rc-quiet" disabled={busy === k('entered')}
              onClick={() => onPatch({ enteredAt: new Date().toISOString() }, k('entered'))}>
              {busy === k('entered') ? 'שומר…' : 'הוזן ידנית'}
            </button>
          </div>
        )}
      </Step>

      <Step title="מספר אסמכתא ומועד אחרון לאישור" done={!!ni.referenceNumber}
        hint={ni.referenceNumber ? `אסמכתא ${ni.referenceNumber}${ni.deadline ? ` · מועד אחרון ${fmt(ni.deadline)}` : ''}` : 'ב״ל מציג אותם במסך שאחרי ההזנה'}>
        {/* ‼ במצב סופי האסמכתא היא עובדה, לא טופס לעריכה. */}
        {view.editableReference && (editingRef || (!ni.referenceNumber && !inPrepare)) && (
          <NiRefForm ni={ni} busy={busy === k('ref')}
            onSave={(ref, deadline) => { onPatch({ referenceNumber: ref, deadline }, k('ref')); setEditingRef(false); }} />
        )}
        {view.editableReference && ni.referenceNumber && !editingRef && (
          <button type="button" className="rc-quiet" onClick={() => setEditingRef(true)}>עריכה</button>
        )}
        {view.deadlineNotice && (
          <Notice tone={view.deadlineNotice.tone}>{view.deadlineNotice.text} {ni.deadline && `(${fmt(ni.deadline)})`}</Notice>
        )}
      </Step>

      <Step title="ההוראות הגיעו למבוטח" done={sentWithSignature || !!ni.instructionsSentAt}
        hint={sentWithSignature ? 'נכללו במייל בקשת החתימה'
          : ni.instructionsSentWith === 'link' ? `הקישור האישי נמסר ידנית ב-${fmt(ni.instructionsSentAt)}`
          : ni.instructionsSentAt ? `נשלחו בנפרד ב-${fmt(ni.instructionsSentAt)}`
          : `יוצאות יחד עם בקשת החתימה: אסמכתא, מועד אחרון, ואישור באתר ב״ל או בטלפון ${NI_APPROVAL_PHONE}`} />

      <Step title="אושר — הייצוג בב״ל פעיל" done={view.final}
        hint={ni.confirmedAt ? `אושר ב-${fmt(ni.confirmedAt)}` : view.final ? 'פעיל לפי תיק ב״ל בכרטיס'
          // ‼ בלי ההוראות אין למבוטח מה לאשר — «ממתין לאישורו» מצביע על האדם הלא נכון.
          : ni.referenceNumber && !niInstructionsDelivered(ni) ? 'המבוטח יוכל לאשר רק אחרי שיקבל את ההוראות'
          : ni.referenceNumber ? 'ממתין לאישור המבוטח בב״ל' : undefined}>
        {/* ‼ 195 — מה שב״ל **אמרה** בקריאה האחרונה, במילים שלה (אם לא מוצג כבר למעלה). */}
        {external && view.showExternalEvidence && !resultShownAbove && (
          <Notice tone={external.tone === 'warn' ? 'warning' : 'info'}>
            ביטוח לאומי: <b>{external.label}</b>{external.raw && ` ("${external.raw}")`}{external.at && ` · נקרא ${fmt(external.at)}`}
          </Notice>
        )}
        {view.showManualConfirm && (
          <button type="button" className="rc-quiet" disabled={busy === k('conf')}
            onClick={() => onPatch({ confirmedAt: new Date().toISOString() }, k('conf'))}>
            {busy === k('conf') ? 'שומר…' : 'סימון כאושר'}
          </button>
        )}
      </Step>
    </div>
  );

  return prereqStep && prereqClient && prereqSpouse ? (
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
  ) : executionSteps;
}
