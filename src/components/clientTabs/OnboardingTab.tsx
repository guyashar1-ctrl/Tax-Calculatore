// ─── קליטה — מסלול הכניסה של הלקוח ─────────────────────────────────────────
// שורה אחת למעלה אומרת אצל מי הכדור ומה הדבר הבא, ומתחתיה המסלולים.
//
// ‼ שלב נעול מוצג ולא מוסתר: התלות ("הרשאת תשלום רק אחרי חיבור פייפרלס")
// היא כלל עסקי שהרו"ח צריך לראות, אחרת הוא מחפש שלב שנעלם.

import { createContext, Fragment, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type {
  Engagement, InstitutionKey, OnboardingEvent, OnboardingStep, StepChecklistItem,
} from '../../types/onboarding';
import {
  ENGAGEMENT_STATUS_LABELS, REQUIREMENT_KIND_LABELS,
  STEP_BALL_LABELS, STEP_STATUS_LABELS, STEP_TYPE_LABELS, TRACK_LABELS,
  closeReadiness, isStepRequiredForClose, parseKindHold, type CloseReadiness,
  isStepOpen, stepAwaitsMe, stepStatusLabel,
  paperlessSetupItems,
  PAPERLESS_RETAINER_CARD_KEY as RETAINER_CARD_KEY,
  PAPERLESS_CARD_ENTERED_KEY as CARD_ENTERED_KEY,
  PAPERLESS_TAX_AUTHORITY,
  isBlockingOutstanding, unfiledBlocking,
  outstandingDeliverableLabel, deliverableKeyFor,
  portalShowsStep, officeSortOrder,
} from '../../types/onboarding';
import type { Client, NiExternalState, NiTracking, RepAuthorityKind, RepresentationStatus, TaxAuthority } from '../../types';
import type { Quotation, QuotationItem } from '../../types/quotations';
import { REP_AUTHORITY_LABELS, REPRESENTATION_STATUS_LABELS, NI_APPROVAL_PHONE, NI_EXTERNAL_STATE_LABELS } from '../../types';
import type { AdvanceResult } from '../../hooks/useOnboarding';
import InstitutionAlignmentGroup, { InstitutionFocus } from './InstitutionAlignment';
import AuthoritiesPanel from '../authorities/AuthoritiesPanel';
import { nextActionText, nextStepForClient } from '../../utils/onboardingNext';
import { representationAction, type RepSendPhase } from '../../utils/representationAction';
import { shaamPrepLine, type RepPrepFacts } from '../../features/representation/repPreparation';
import { relativeTime } from '../../utils/clientDerived';
import { formatDate } from '../../utils/dateFormat';
import { calcTotals, formatILS } from '../../utils/quotationCalc';
import { flushAccountantNotifications } from '../../lib/notifyAccountant';
import { intakeAcceptsRequired, intakeContext, releaseLetterAnchors, stepForCurrentWork, stepTypeTaken } from '../../lib/clientState';
import { templateEntryOwner } from '../../utils/templateEntryOwner';
import { currentEngagement } from '../../utils/engagementSelectors';
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
import { useEmailMessages, fetchEmailHtml } from '../../hooks/useEmailMessages';
import { EMAIL_STATUS_LABEL, EmailMessage, emailRowState, isUnknownEmailStatus, unknownEmailCause } from '../../types/emailActivity';
import SentEmailViewer from '../EmailActivity/SentEmailViewer';
import EmailPreviewDialog from '../EmailActivity/EmailPreviewDialog';
import ConfirmDialog from '../ui/ConfirmDialog';
import NiCancelRequest from '../NiCancelRequest';
import OnboardingJourneyMap from './OnboardingJourneyMap';
import Modal from '../ui/Modal';
import Sheet from '../ui/Sheet';
import './requestsSurface.css';
import {
  splitRequestTitle, rowStateFor, groupWaitingState, moreMineLabel, repShortAction, lamed, MINE_STATE_TEXT,
  type RowState,
} from '../../utils/requestPresentation';
import {
  authRepRowModel, niTrackLine, representationPartLabel, taxAuthorityScopeLine, type AuthRepRowModel,
} from '../../utils/authorityRepresentationRow';
import { niCancelledText } from '../../utils/niPersons';
import { targetsOf } from '../../utils/repScope';
import RepApprovalGuide, { RepApprovalGuideButton, type RepApprovalPerson } from '../portal/RepApprovalGuide';
import { REP_PORTAL_CARD_FIXED } from '../../../supabase/functions/_shared/repTemplates.ts';
import AddRequestDialog from './AddRequestDialog';
import type { RequestTemplate } from '../../lib/requestTemplates';
import { firstEntry, isSeedTemplate, saveRequestTemplate } from '../../lib/requestTemplates';
import { createPrevAccountantTrack, isPrevAccountantStep } from '../../lib/prevAccountantTrack';
import JourneyTemplatesDialog from './JourneyTemplatesDialog';
import SendPortalDialog from './SendPortalDialog';
import ClientFlowStrip from '../flows/ClientFlowStrip';
import { isSpouseConfirmTask, runTitle, spouseTaskName, type RowBucket } from '../flows/runSummary';
import NoticeTray from '../flows/NoticeTray';
import StartFlowDialog from '../flows/StartFlowDialog';
import { useClientFlowRuns } from '../../hooks/useClientFlowRuns';
import ClientPagePreviewDialog from './ClientPagePreviewDialog';
import type { PortalPreviewMode } from './ClientPagePreviewDialog';
import PortalPreviewPanel from './PortalPreviewPanel';
import PublishCasePrompt from './PublishCasePrompt';
import InlineComposer, { neverOnClientPage, skipPayloadFor, skippedLabel } from './InlineComposer';
import {
  SURFACE_HIDDEN_OFFICE_TYPES, buildClientFacingRows, CLIENT_FACING_TYPES, EXECUTION_OWNED_TYPES,
  isManualInternalTask, isRepresentationPart, representationRequestOf, belongsToRepresentationRequest,
  isStaleRepresentationPart, isShaamIdentityStep, isRepresentationUpgrade,
  rowNeedsGroupState,
  type ClientFacingRow, type RowSummary,
} from '../../utils/clientFacingRows';
import EmailInput from '../ui/EmailInput';
import InfoLines from '../ui/InfoLines';
import PrerequisiteGate, { PREREQUISITE_FIELD_LABELS, type PrerequisitePerson } from '../PrerequisiteGate';
import NiNextActionButton from '../NiNextActionButton';
import Btl6101Workspace from '../../features/smartForms/btl6101/Btl6101Workspace';
import { takePendingIntent, type SendOfficeDocsIntent } from '../../lib/pendingIntent';
import { BTL6101_PURPOSE_LABELS, type Btl6101Purpose } from '../../features/smartForms/btl6101/model';
import { filingErrorText, startFiling, type SmartFormProjection } from '../../features/smartForms/api';
import SendRequestsDialog from './SendRequestsDialog';
import { useReadyToSend, readyRecipientCount } from '../../hooks/useReadyToSend';
import { useAutomationJob } from '../../hooks/useAutomationJobs';
import { BTL_CHECK_REPRESENTATION_ACTION_TYPE, BTL_CREATE_REPRESENTATION_ACTION_TYPE } from '../../types/automation';
import type { AutomationJob } from '../../types/automation';
import {
  stepAttention, isManualInternal, hasRedRequest, requestRows, rowSummary, niRidesWithSignature, onClientPageSince,
  isCreationProblem, isLegacyInternalReview,
  hasCurrentNiStep as hasCurrentNiStepOf, niTrackOnlyRoles as niTrackOnlyRolesOf, niSendWithoutStepRoles,
  type Attention, type AttentionContext, type WaitingOn,
} from '../../utils/requestAttention';
import {
  creationProblemText, creationSkipConfirm, hideStepDoneText, hideStepErrorText, hideStepFromClient, retryCreationText, retryRequestCreation,
  CREATION_PROBLEM_STATUS, type CreationProblem,
} from '../../features/flows/api';
import { formatRoute } from '../../lib/appRoute';
import { awaitsPublication, carriedFromLine, engagementsOf, openIntake } from '../../utils/clientPageGate';

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
  /**
   * הלידים שהומרו ללקוח הזה — הצעה שנשלחה לליד (ולא ללקוח) מחזיקה גם היא את הבקשות עד
   * האישור (requests_held_until_approval, 217 D2).
   */
  clientLeadIds?: string[];
  /** מצב בקשת הייצוג בשפת הייצוג ("ממתין למילוי הלקוח") — לא בשפת השלב הגנרי. */
  repStatusLabel?: string;
  /** אותו מצב, גולמי — כדי לגזור ממנו את הפעולה עצמה ולא רק את שמו. */
  repStatus?: RepresentationStatus;
  /** 191: שורה אחת על הקליטה — עד איפה הלקוח הגיע / צילום תעודה שחסר. */
  repNote?: string;
  /** הטופס מוכן אבל המייל לא יצא — ראה repSendPhase. */
  repSendPhase?: RepSendPhase | null;
  /**
   * ‼ 04.10.2026 · מצב כל הגשה לשע״ם לפי אדם ורשות — אותן עובדות כמו במרכז הייצוג. בלעדיו
   * הפירוט «לפי רשות ואדם» מציג שורת רשות מסים אחת לכל משק הבית.
   */
  repFacts?: RepPrepFacts | null;
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
  /**
   * פתיחת "תמונת מצב מול הרשויות". ‼ נקראת כשנסגר המוסד האחרון — הרו"ח סיים
   * לאסוף, וזה הרגע שבו התוצר נהיה רלוונטי. נחיתה חזרה ברשימת הבקשות הייתה
   * מסתירה בדיוק את מה שהעבודה נעשתה בשבילו.
   */
  /**
   * פותח את תיק המס — היעד היחיד של יישור הקו. focus='dealerType' — «פרטי הנישום»
   * נפתחת בעריכה על «סוג העוסק» (מ«לקביעת סוג העוסק» במגש, 217).
   */
  onOpenTaxFile?: (focus?: 'dealerType') => void;
  /** מסלולי הביצוע של ב"ל (לקוח/בן-בת-זוג) — לכרטיס «ייצוג ברשות» (157). */
  niExecution?: { client?: NiTracking; spouse?: NiTracking };
  /** עדכון שדה פשוט על הכרטיס (spouseEmail) — לדיאלוג הוראות האישור העצמאיות. */
  onUpdateClientFields?: (patch: Partial<Client>) => Promise<void>;
  /** אחרי שליחה מוצלחת של הוראות האישור — קריאה מחדש של הביצוע והשלב (157). */
  onNiInstructionsSent?: () => Promise<void>;
  /**
   * v3: המונה של «לטיפולי» כפי שהמסך עצמו חישב — כולל מצב משימות ב"ל
   * (PIVO רץ ⇒ לא נספר; נתקע ⇒ אדום). התג בלשונית לא מכיר משימות, ולכן
   * הוא קורא מכאן כשהמסך מורכב, כדי ששני המספרים לא יסטו.
   */
  onAttentionSummary?: (summary: { n: number; red: boolean }) => void;
  /** "+ בקשה חדשה" ← "ייצוג ברשות - לאדם" — אותה קריאה כמו מתיק המס (157). */
  onRequestAuthorityRepresentation?: (role: 'client' | 'spouse') => Promise<{ error: string | null; stepId?: string }>;
  /** הכרטיס של בן/בת הזוג המקושר/ת — לתצוגת הרשויות הקומפקטית (ב"ל לכל אדם). */
  spouseClient?: Client;
  onOpenSpouseClient?: (clientId: string) => void;
  /**
   * בקשה מבחוץ (תיק המס) לפתוח את «תצוגה מפורטת»: המוסד המבוקש, ומאיפה
   * באו — כדי שהחזרה תנחת בהקשר המקורי. `tick` משתנה בכל בקשה.
   */
  detailedAlignment?: { key: InstitutionKey | null; origin: 'taxfile' | 'journey'; tick: number };
  /**
   * הבקשה טופלה — המארח מאפס אותה. ‼ בלי זה, כל חזרה ללשונית הבקשות הייתה
   * מרכיבה את הרכיב מחדש ופותחת שוב את אותו מסך מלא.
   */
  onDetailedAlignmentConsumed?: () => void;
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
  /**
   * ‼ ללקוח יש קליטה (פתוחה או שתיפתח) שאפשר לחסום את סגירתה — ולכן
   * ל«רשות/נדרש» יש בכלל משמעות. דרך ה-context ולא prop, מאותה סיבה כמו
   * openId: השורות עוברות דרך כמה עוטפים. ברירת המחדל false — מסך שלא
   * הצהיר על הקשר קליטה לא יבטיח חסימה שלא תקרה.
   */
  requiredApplies?: boolean;
  /**
   * משטח הבקשות המפושט (1.10.2026, «הבקשות עצמן ברורות מיד»): שורה בלי מסגרת —
   * שם בולט, משפט מצב אחד, פעולה אחת; כל השאר נפתח בלחיצה. כבוי ⇒ הכרטיס הישן
   * (המסך הלא-מוטבע), בלי שינוי.
   */
  compact?: boolean;
  /** המקטע והצבע של כל שלב (stepAttention) — מקור המצב הקצר בשורה הסגורה. */
  attnByStep?: Map<string, Attention>;
  /** שמות פרטיים — «ממתין לשרון», «ממתין לרותם». */
  firstNames?: { client: string; spouse: string };
  /** מצב «עריכת הבקשות»: סידור ו-⋯ עולים לשורה הסגורה. */
  editing?: boolean;
  /** שורת-המשך פתוחה בתוך שורה פתוחה (שרשרת) — נפרד מהשורה הראשית. */
  childOpenId?: string | null;
  toggleChild?: (id: string) => void;
  /**
   * סבב 4 — מצב השורה כולה (תהליך עם כמה חלקים): המצב, שורת המשנה והפעולה
   * בשורה הסגורה, כשהם של חלק אחר ולא של הראשי. ראה summarizeRow.
   */
  groupViewByStep?: Map<string, GroupRowView>;
  /** כותרת הפירוט בתוך השורה הפתוחה («לפי רשות ואדם» בייצוג). */
  nestedTitleByStep?: Map<string, string>;
  /** בקשות אוטומטיות שהמייל האחרון שלהן «לא ידוע אם יצא» (יומן המיילים) — עם המייל עצמו. */
  autoEmailUnknown?: Map<string, EmailMessage>;
  /** סיבת החסימה לכל שלב (מהיומן) — «חסום: …» בשורה ובפתיחה. */
  blockNotes?: Map<string, string>;
  /** מה קרה עכשיו בשורה (צור שוב / הסתרה / הערה) — משפט אחד בתוך הבקשה הפתוחה. */
  rowNote?: { stepId: string; text: string; err: boolean } | null;
  /** שדה «הוספת הערה» הפתוח — בתוך הבקשה הפתוחה, מעל הקישורים שבתחתית. */
  noteEditor?: { stepId: string; node: React.ReactNode } | null;
  /**
   * «ממתין לפרסום» (הכרעות 03.10): פורסמו, אבל השער של הדף סוגר אותן — קליטה חדשה
   * שטרם פורסמה (clientPageGate.awaitsPublication, התאום של client_step_gate_open).
   */
  awaitingPublish?: Set<string>;
}>({ openId: null, toggle: () => {} });

/** מה השורה הסגורה מציגה כשהמצב הוא של הקבוצה ולא של החלק הראשי. */
interface GroupRowView {
  /** חסר ⇒ מצב החלק הראשי (הכרטיס עצמו). */
  state?: RowState;
  /** שורה שקטה מתחת לשם: «ביטוח לאומי · רותם · ועוד: צילום תעודה…». */
  sub?: string;
  /** הכפתור — של החלק שדורש אותך. undefined ⇒ הכפתור של הכרטיס הראשי. */
  primary?: React.ReactNode;
  /** הכפתור רק פותח את החלק («פתח») — אז המצב נשאר גלוי לידו. */
  navOnly?: boolean;
}

/** שורה שמרונדרת בתוך גוף של שורה אחרת (שלב בשרשרת). */
const NestedRowContext = createContext(false);

/** שורת יומן המיילים כפי שנטענה — step_id נקרא (LIST_COLUMNS) גם כשאינו בטיפוס EmailMessage. */
type StepEmail = EmailMessage & { stepId?: string };

/** שם השורה. בקשה חופשית נושאת את השם שהרו"ח נתן לה, לא תווית גנרית. */
/* שם שניתן לבקשה גובר על השם הגנרי של הסוג — בכל סוג, לא רק בבקשה חופשית.
   בקשה ששמה לא מוצג היא בקשה שאי אפשר לזהות ברשימה של עשר שורות. */
function rowTitle(step: OnboardingStep): string {
  const named = String(step.payload?.title ?? '').trim();
  if (named) return named;
  return STEP_TYPE_LABELS[step.stepType];
}

/** שם קצר — לרשימות בתוך משפט («עוד לא בדף: …»). */
function shortTitle(step: OnboardingStep): string {
  const t = rowTitle(step);
  return t.length > 34 ? `${t.slice(0, 33)}…` : t;
}

// ‼ (168) הרשימה המקומית של "שלבים שאינם מוצגים ללקוח" (שני סוגים) הוחלפה
// ב-portalShowsStep מ-types/onboarding — הבבואה של build_client_portal בשרת.

/** טיוטה = הרו"ח הכין, הלקוח עוד לא רואה. published_at ריק במסד, או הסימון
 *  הישן ב-payload (בקשות שנוצרו לפני מיגרציה 77).
 *  ‼ משימה פנימית / אישור אישי של בן/בת הזוג אינם טיוטה: הם לעולם לא בדף
 *  (neverOnClientPage), ו«טיוטה — פרסם בדף» הבטיח פרסום שלא עושה דבר. */
function isDraftStep(step: OnboardingStep): boolean {
  if (neverOnClientPage(step)) return false;
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

/** סוגים שמוצגים בשורה הכללית — שם «הלקוח סיים» הוא «בדוק וסגור». */
const GENERIC_REVIEW_TYPES: OnboardingStep['stepType'][] = [
  'custom_request', 'client_documents', 'prev_accountant_details', 'materials_received', 'paperless_tax_authority',
];

/**
 * «שדרוג לייצוג ראשי» בשורה הסגורה, כשהגיע הזמן: «אפשר לשדרג» (הרו״ח הקודם השלים את מה שנשאר
 * אצלו) או «הגיע מועד התזכורת». עד אז — undefined, והמצב «בהמשך» (stepAttention).
 */
function upgradeRowState(step: OnboardingStep): RowState | undefined {
  if (!isStepOpen(step.status) || !step.needsAttention) return undefined;
  return step.payload.upgradeReadyAt
    ? { text: 'אפשר לשדרג', tone: 'blue' }
    : { text: 'הגיע מועד התזכורת', tone: 'blue' };
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
    .filter(s => officeSortOrder(s) < officeSortOrder(step) && isStepOpen(s.status))
    .sort((a, b) => officeSortOrder(b) - officeSortOrder(a))[0];
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
  prevAccountant, onPrepareReleaseLetter, quotations, clientLeadIds, repStatusLabel, repStatus, repNote, repSendPhase, repFacts, onOpenRepresentation,
  onOpenDocuments,
  clientDisplayName, clientEmail, embedded, ballFilter, onOpenTaxFile,
  niExecution, onUpdateClientFields, onRequestAuthorityRepresentation, onNiInstructionsSent, onAttentionSummary,
  spouseClient, onOpenSpouseClient, detailedAlignment, onDetailedAlignmentConsumed,
}: Props) {
  // ‼ v3: הוראות האישור לב"ל יוצאות ממשטח הבקשות דרך «שלח בקשות» בלבד
  // (SendRequestsDialog · stage ni_approve). NiInstructionsDialog נשאר לתיק המס.
  /** השם של בעל הכרטיס — ושם העסק כשאין שם פרטי (חברה). ריק ⇒ אין שם בכלל. */
  const clientFirst = (client.firstName || '').trim() || (client.businessName || '').trim();
  /** בלי מילת יחס: «הדף של הלקוח», «אצל הלקוח». ‼ עם «ל» — lamed(…), לא «ל» + «הלקוח». */
  const clientFirstOrClient = clientFirst || 'הלקוח';
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
  const [confirmState, setConfirmState] = useState<{
    stepId: string; title: string; message: string; confirmLabel: string;
    /** בלי — «הושלם». עם — הפעולה הזאת (למשל «אין צורך» באישור אישי של בן/בת הזוג). */
    action?: { name: string; payload: Record<string, unknown> };
  } | null>(null);
  // "שנה מסלול" — פותח מחדש את הטריאז' על שלב שכבר נענה
  const [retriageStepId, setRetriageStepId] = useState<string | null>(null);
  const [triageBusy, setTriageBusy] = useState(false);
  const [triageError, setTriageError] = useState<string | null>(null);
  const [highlightStepId, setHighlightStepId] = useState<string | null>(null);
  // מה שהושלם לא נעלם, אבל גם לא תופס את המסך — הוא מקופל עד שמבקשים אותו.
  const [showDone, setShowDone] = useState(false);
  // שורה סגורה מראה שם, מצב ופעולה; פתיחה חושפת את הפרטים וההיסטוריה שלה.
  const [openRowId, setOpenRowId] = useState<string | null>(null);
  /** שלב בתוך שרשרת שנפתח בתוך השורה הפתוחה — לא סוגר את ההורה. */
  const [openChildId, setOpenChildId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  /** קבצים מספריית המשרד שהגיעו מ«המשרד ← מסמכים ← שליחה ללקוח». */
  const [presetOfficeDocs, setPresetOfficeDocs] = useState<SendOfficeDocsIntent['docs'] | null>(null);
  /** אחרי «הוספה לדף ושליחת מייל…» — חלון השליחה נפתח כשהמגש נטען מחדש. */
  const [emailAfterAdd, setEmailAfterAdd] = useState(false);
  useEffect(() => {
    const intent = takePendingIntent(clientId);
    if (intent) { setPresetOfficeDocs(intent.docs); setAddOpen(true); }
  }, [clientId]);
  /** הגשת טופס חכם (6101) פתוחה במסך הפירוט שלה. ‼ השורה ב«בקשות» היא היטל. */
  const [smartFilingId, setSmartFilingId] = useState<string | null>(null);
  /** תבנית שנבחרה מהקטלוג — פותחת את הקומפוזר על עותק שלה. */
  const [templateDraft, setTemplateDraft] = useState<RequestTemplate | null>(null);
  /** בקשה שנשמרת כרגע כתבנית — החלון מבקש רק שם. */
  const [saveTemplateFor, setSaveTemplateFor] = useState<OnboardingStep | null>(null);
  const [templateName, setTemplateName] = useState('');
  const [templateBusy, setTemplateBusy] = useState(false);
  /** «שמור את כל המסע כתבנית» והכפתור «תבניות» במסך הישן — עדיין דרך החלון הישן. */
  const [templatesOpen, setTemplatesOpen] = useState(false);
  /** «הפעלת מסלול» — null סגור; flowId = נבחר מראש (מ«בקשה חדשה ← מסלולים»). */
  const [startFlow, setStartFlow] = useState<{ flowId?: string } | null>(null);
  const [ordering, setOrdering] = useState(false);
  const [alignBusy, setAlignBusy] = useState(false);
  /** מוסד במיקוד — כשמוגדר, המסך משתלט לגמרי (המודל המאושר: בידוד חזותי וקוגניטיבי). */
  const [focusedInstitutionKey, setFocusedInstitutionKey] = useState<InstitutionKey | null>(null);
  /**
   * «תצוגה מפורטת» = המסך המלא של **אותה רשות**, ישירות — בלי מסך-ביניים
   * של בחירת מוסד (הכרעת גיא, 19.09.2026). ברירת המחדל בכרטיס יישור הקו
   * היא התצוגה הקומפקטית בלבד; רשימת המוסדות הישנה («כניסה») אינה מוצגת
   * שם יותר. מאיפה נפתח המיקוד קובע לאן חוזרים בסגירה.
   *
   * ‼ עוד אין שלבי יישור קו ⇒ יוצרים אותם באותה פעולה בדיוק כמו «התחל»
   * (ensure_institution_alignment_steps) ונכנסים למסך ברגע שהם מגיעים —
   * המשתמש כבר בחר רשות, ואין טעם להחזיר אותו לכפתור אחר.
   */
  const [focusOrigin, setFocusOrigin] = useState<'taxfile' | 'journey'>('journey');
  const pendingFocusKey = useRef<InstitutionKey | null>(null);
  const institutionKeyOf = (authority: TaxAuthority): InstitutionKey | null =>
    authority === 'income_tax' ? 'income' : authority === 'vat' ? 'vat'
    : authority === 'national_insurance' ? 'btl' : null;
  const openInstitutionDetailed = (key: InstitutionKey | null, origin: 'taxfile' | 'journey') => {
    if (!key) return;
    const instSteps = steps.filter(s => s.stepType.startsWith('institution_alignment_'));
    setFocusOrigin(origin);
    if (instSteps.some(s => s.payload.institution === key)) { setFocusedInstitutionKey(key); return; }
    pendingFocusKey.current = key;
    if (instSteps.length === 0 && !alignBusy) void startOrRerunAlignment([]);
  };
  // ‼ השלבים הגיעו אחרי יצירה ⇒ נכנסים למוסד שהתבקש, פעם אחת.
  useEffect(() => {
    const key = pendingFocusKey.current;
    if (!key) return;
    if (steps.some(s => s.stepType.startsWith('institution_alignment_') && s.payload.institution === key)) {
      pendingFocusKey.current = null;
      setFocusedInstitutionKey(key);
    }
  }, [steps]);
  const detailedTick = detailedAlignment?.tick ?? 0;
  useEffect(() => {
    if (!detailedAlignment || detailedTick === 0) return;
    openInstitutionDetailed(detailedAlignment.key, detailedAlignment.origin);
    onDetailedAlignmentConsumed?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detailedTick]);
  const openDetailedFor = (authority: TaxAuthority) => openInstitutionDetailed(institutionKeyOf(authority), 'journey');
  /** מסלול הרו"ח הקודם. ‼ חייב לשבת כאן ולא ליד המשתמשים בו (שורה ~940) —
      שם הוא אחרי ה-return המוקדם של מסך המיקוד, וכל כניסה למוסד קורסת. */
  const [prevTrackBusy, setPrevTrackBusy] = useState(false);
  const highlightTimer = useRef<number | null>(null);
  /**
   * סבב 4: לכל שלב — השורה העליונה שהוא חלק ממנה (id של הראשי). נכתב ברינדור
   * הרשימה; focusStep פותח דרכו את הקבוצה ואת החלק לפני הגלילה.
   * ‼ hook ⇒ כאן, לפני ה-return של מסך המיקוד.
   */
  const rowTopRef = useRef(new Map<string, string>());
  /** «צור שוב» / «הסתר מהדף» / הערה — מה קרה, בשורה עצמה (לא הודעה כללית). */
  const [rowNote, setRowNote] = useState<{ stepId: string; text: string; err: boolean } | null>(null);
  /** תוצאה שאין לה שורה להיות בה (השורה נסגרה בלי שורה אחרת במקומה) — מעל הרשימה. */
  const [listNote, setListNote] = useState<{ text: string; err: boolean } | null>(null);
  /** «הוספת הערה» — שדה בתוך הבקשה הפתוחה, במקום חלון הדפדפן. */
  const [noteDraft, setNoteDraft] = useState<{ stepId: string; text: string; busy?: boolean; error?: string } | null>(null);
  /**
   * אחרי פעולה שמזיזה שורה (הסתרה מהדף, «צור שוב» שיצר בקשה): כשהשורה מגיעה מהשרת —
   * פותחים אותה (ואת «עבודה פנימית» כשצריך), גוללים אליה ומדגישים.
   */
  const pendingFocusRef = useRef<{ stepId: string; internal?: boolean } | null>(null);
  /** ‼ מעורר את הבדיקה גם כשהשורה כבר הגיעה לפני שביקשנו (התשובה של השרת והרענון — בכל סדר). */
  const [focusTick, setFocusTick] = useState(0);
  const requestFocus = (p: { stepId: string; internal?: boolean }) => {
    pendingFocusRef.current = p;
    setFocusTick(t => t + 1);
  };

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
  // מביא איתו קליטה חדשה. (168) המסנן המקומי שהיה כאן הוחלף בהגדרה האחת
  // של utils/engagementSelectors — אותה הגדרה כמו current_engagement_id בשרת.
  const clientEngagements = useMemo(() => {
    const current = currentEngagement(engagements, clientId);
    return current ? [current] : [];
  }, [engagements, clientId]);
  /**
   * ‼ הקשר הקליטה — מקור אחד (lib/clientState), בבואה של client_intake_state
   * בשרת. הוא שקובע אם «נדרש לסגירת הקליטה» הוא בכלל מושג אצל הלקוח הזה:
   * לא סוג הבקשה, ולא מצב הייצוג. ראה docs/AUDIT-STATE-CONSISTENCY-2026-09-04.md.
   */
  const intake = useMemo(
    () => intakeContext({ id: clientId, lifecycleStage: client.lifecycleStage }, engagements,
      { quotations, leadIds: clientLeadIds }),
    [clientId, client.lifecycleStage, engagements, quotations, clientLeadIds]);
  const requiredApplies = intakeAcceptsRequired(intake);
  /**
   * שכבה אופטימית של הקומפוזר: בקשה שנשמרה מופיעה מיד, בלי לחכות לרענון
   * הכולל של useOnboarding. כשהנתונים מהשרת מגיעים — השכבה מתנקה.
   */
  const [optimisticSteps, setOptimisticSteps] = useState<OnboardingStep[]>([]);
  const [optimisticPatches, setOptimisticPatches] = useState<Record<string, Partial<OnboardingStep>>>({});
  useEffect(() => {
    // ‼ מחזירים את אותו אובייקט כשאין מה לנקות — אחרת כל פעימת רענון (20ש׳)
    // כפתה רינדור נוסף של כל הלשונית גם כשדבר לא השתנה.
    setOptimisticSteps(prev => { const n = prev.filter(o => !steps.some(s => s.id === o.id)); return n.length === prev.length ? prev : n; });
    setOptimisticPatches(prev => Object.keys(prev).length ? {} : prev);
  }, [steps]);

  const clientSteps = useMemo(() => {
    const base = steps.filter(s => s.clientId === clientId && s.status !== 'cancelled');
    const extras = optimisticSteps.filter(o =>
      o.clientId === clientId && !base.some(s => s.id === o.id));
    return [...base, ...extras].map(s =>
      optimisticPatches[s.id] ? { ...s, ...optimisticPatches[s.id] } : s);
  }, [steps, clientId, optimisticSteps, optimisticPatches]);

  /* ‼ בקשה אוטומטית (⚡ מייל) שהופעלה — «בוצע» רק כשהיומן לא אומר «לא ידוע אם יצא».
     send-step-email רושם שורה 'unknown' (עם step_id) ומשאיר את התביעה, כדי שלא ייצא פעמיים;
     בלי הבדיקה הזו השורה הייתה טוענת «בוצע אוטומטית» על מייל שאולי לא הגיע. היומן נטען רק
     כשיש בקשה כזו — לא שאילתה לכל לקוח. */
  const { user } = useAuth();
  const hasAutoRun = clientSteps.some(s => s.payload.autoAction?.kind === 'email' && !!s.payload.autoExecutedAt);
  const { messages: stepEmails } = useEmailMessages(hasAutoRun ? user?.id : undefined, { clientId });
  /** בקשה ← המייל האחרון שלה, כשהוא «לא ידוע אם יצא» — לסיבה ולצעד הבטוח (emailRowState). */
  const autoEmailUnknown = useMemo(() => {
    const latest = new Map<string, StepEmail>();
    for (const m of stepEmails as StepEmail[]) {
      if (!m.stepId) continue;
      const cur = latest.get(m.stepId);
      if (!cur || (m.sentAt || m.createdAt || '') > (cur.sentAt || cur.createdAt || '')) latest.set(m.stepId, m);
    }
    return new Map([...latest.entries()].filter(([, m]) => m.status === 'unknown'));
  }, [stepEmails]);

  /* ‼ חתימת מצב הבקשות עבור פאנל "מה הלקוח רואה". כל דבר שמשנה את הדף האישי
     נכנס לכאן — קיום, מצב, פרסום, עריכה ממתינה, הסרה ממתינה וסידור. בלי זה
     הפאנל נשלף פעם אחת בכניסה ללשונית ונשאר תקוע על תמונה ישנה. */
  const portalRefreshKey = useMemo(
    () => clientSteps
      .map(s => [s.id, s.status, s.publishedAt ?? '', s.draftPayload ? 'd' : '',
                 s.pendingCancel ? 'x' : '', s.pendingSortOrder ?? '', s.updatedAt ?? ''].join('~'))
      .sort()
      .join('|'),
    [clientSteps]);

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

  /* ── אישור הייצוג באזור האישי — כשהוא **נדרש** (שע״ם ממתינה לאישור) ─────────────
     ‼ השלב עצמו מחוץ לרשימה (הכרעת גיא) — אבל הוא מה שמחזיק עכשיו את «ייצוג מול הרשויות».
     מי צריך לאשר — מהשרת (_rep_approval_people דרך התצוגה של הדף האישי, אותה רשימה שהלקוח
     רואה בכרטיס ובמדריך), לא ניחוש מהכרטיס. נטען רק כשהאישור נדרש ופתוח. */
  const repApprovalStep = clientSteps.find(s => s.stepType === 'rep_client_approval' && isStepOpen(s.status));
  const repApprovalRequired = !!repApprovalStep && repApprovalStep.status !== 'locked'
    && String(repApprovalStep.payload?.requiredBy ?? '') === 'shaam'
    && !String(repApprovalStep.payload?.clientDeclaredAt ?? '').trim();
  const [approvalPeople, setApprovalPeople] = useState<RepApprovalPerson[] | null>(null);
  const approvalKey = repApprovalRequired && repApprovalStep ? `${clientId}|${repApprovalStep.id}` : '';
  useEffect(() => {
    if (!approvalKey) { setApprovalPeople(null); return; }
    let cancelled = false;
    void Promise.resolve(supabase.rpc('get_client_portal_preview', { p_client_id: clientId, p_mode: 'live' }))
      .then(({ data }) => {
        if (cancelled) return;
        const items = ((data as { items?: { key?: string; approvals?: RepApprovalPerson[] }[] } | null)?.items) ?? [];
        setApprovalPeople(items.find(i => i.key === 'rep_approval')?.approvals ?? []);
      }, () => { if (!cancelled) setApprovalPeople([]); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [approvalKey]);
  const [approvalGuideOpen, setApprovalGuideOpen] = useState(false);

  /* ‼ אחרי פעולה שמזיזה שורה — כשהשורה הגיעה מהשרת: פותחים, גוללים ומדגישים. ‼ hook ⇒
     כאן, לפני ה-return של מסך המיקוד. */
  useEffect(() => {
    const p = pendingFocusRef.current;
    if (!p) return;
    const s = clientSteps.find(x => x.id === p.stepId);
    if (!s || (p.internal && !isManualInternal(s))) return;
    pendingFocusRef.current = null;
    if (p.internal) setInternalOpenPref(true);
    window.setTimeout(() => focusStep(p.stepId), 60);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientSteps, focusTick]);

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
    const res = data as {
      ok?: boolean; error?: string;
      /** onboarding_close_readiness (217): kindHold — {since, held, count, failedAt?} או null. */
      readiness?: { kindHold?: { since?: string; held?: unknown; count?: number; failedAt?: string } | null };
    } | null;
    setClosing(false);

    if (rpcError) { setError('לא הצלחתי לסגור את הקליטה.'); return; }
    if (res?.ok) { flushAccountantNotifications(); refresh?.(); return; }

    /* ‼ השרת הוא שחוסם. המסך רק מציג מה חסר — ובחלון קטן שנפתח בלחיצה,
       לא כאזהרה קבועה על העמוד. */
    if (res?.error === 'not_ready') {
      // ‼ הבבואה (closeReadiness) אומרת מה חוסם; ההחזקה על סוג העוסק — כפי שהשרת ראה אותה
      // עכשיו, כשהחזיר אותה (שרת בלי 217 — מהעותק שבמסך).
      const mirror = closeReadiness(clientSteps, eng);
      const srv = res.readiness?.kindHold;
      const kindHold = srv === undefined ? mirror.kindHold
        : srv === null ? null
        : { since: srv.since, held: parseKindHold({ held: srv.held })?.held ?? [], count: srv.count ?? 0, failedAt: srv.failedAt };
      setCloseGate({ ...mirror, kindHold, ready: false });
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
    const retainer = stepForCurrentWork(clientSteps, 'retainer_authorization', clientEngagements[0]?.id);
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
    const retainer = stepForCurrentWork(clientSteps, 'retainer_authorization', clientEngagements[0]?.id);
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
    // ‼ בקשה של מסלול נסגרת כ«אין צורך» כדי שהשלב במסלול ימשיך — ראה skipPayloadFor.
    const payload = skipPayloadFor(step, window.prompt(step.flowRunId
      ? 'סיבת הדילוג (הבקשה תיסגר כ«אין צורך», והמסלול ימשיך בלעדיה):'
      : 'סיבת הדילוג:'));
    if (!payload) return;
    void run(step, 'skip', payload);
  }

  function handleBlock(step: OnboardingStep) {
    const reason = window.prompt('מה חוסם את השלב?');
    if (!reason || !reason.trim()) return;
    void run(step, 'block', { note: reason.trim() });
  }

  /**
   * «הוספת הערה». ‼ במשטח הבקשות — שדה בתוך הבקשה הפתוחה (לא חלון הדפדפן): השורה נפתחת,
   * השדה מתחת לפרטים, ואחרי השמירה נאמר איפה ההערה נשמרה. המסך הישן — כמו קודם.
   */
  function handleNote(step: OnboardingStep) {
    setMenuStepId(null);
    if (embedded) {
      setNoteDraft({ stepId: step.id, text: '' });
      setRowNote(r => (r?.stepId === step.id ? null : r));
      const top = rowTopRef.current.get(step.id);
      if (top && top !== step.id) { setOpenRowId(top); setOpenChildId(step.id); }
      else if (openRowId !== step.id) setOpenRowId(step.id);
      return;
    }
    const note = window.prompt('הערה לשלב:');
    if (!note || !note.trim()) return;
    void run(step, 'note', { note: note.trim() });
  }

  async function saveNote() {
    const d = noteDraft;
    const text = d?.text.trim();
    if (!d || !text) return;
    setNoteDraft({ ...d, busy: true, error: undefined });
    const res = await advance(d.stepId, 'note', { note: text });
    if (!res.ok) {
      setNoteDraft({ ...d, busy: false, error: res.message || 'ההערה לא נשמרה. אפשר לנסות שוב.' });
      return;
    }
    setNoteDraft(null);
    setRowNote({ stepId: d.stepId, text: 'ההערה נשמרה — היא מופיעה בלשונית «פעילות»', err: false });
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
  const retainerStep = stepForCurrentWork(clientSteps, 'retainer_authorization', clientEngagements[0]?.id);
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
  /**
   * «שלח בקשות» (המודל המאושר v3): מגש אחד לכל מה שמוכן לצאת, לפי נמען.
   * null = סגור; מחרוזת = מפתח הקבוצה שבמוקד ('owner' / 'ni:spouse').
   */
  const [sendRequestsFocus, setSendRequestsFocus] = useState<string | null>(null);
  const [readyTick, setReadyTick] = useState(0);
  const niSentKey = `${niExecution?.client?.instructionsSentAt ?? ''}|${niExecution?.spouse?.instructionsSentAt ?? ''}|${niExecution?.client?.referenceNumber ?? ''}|${niExecution?.spouse?.referenceNumber ?? ''}`;
  const { ready: readyToSend, reload: reloadReady } = useReadyToSend(
    embedded ? clientId : undefined, `${portalRefreshKey}|${niSentKey}|${readyTick}`);
  /* ‼ משימות ב"ל של הלקוח — לשורת PIVO בכרטיס «ייצוג ברשות» ולצבע שלו:
     משימה שרצה ⇒ ממתינים (לא כחול); נתקעה ⇒ אדום עם ההתחברות מחדש. */
  const btlCreateJob = useAutomationJob(embedded ? clientId : undefined, BTL_CREATE_REPRESENTATION_ACTION_TYPE);
  const btlCheckJob = useAutomationJob(embedded ? clientId : undefined, BTL_CHECK_REPRESENTATION_ACTION_TYPE);
  const jobForRole = (role: 'client' | 'spouse'): AutomationJob | null => {
    const pick = (j: AutomationJob | null) => (j && j.input?.role === role ? j : null);
    // המשימה החיה קודמת; אחרת האחרונה מבין השתיים.
    const c = pick(btlCreateJob.job), k = pick(btlCheckJob.job);
    const live = (j: AutomationJob | null) => !!j && (j.status === 'queued' || j.status === 'running' || j.status === 'needs_human');
    if (live(k)) return k; if (live(c)) return c;
    return (k?.updatedAt ?? '') > (c?.updatedAt ?? '') ? k : c;
  };
  /** ‼ ההוראות לב"ל ייצאו עם בקשת החתימה — אין «שלח הוראות» נפרד (כמו מרכז הייצוג). */
  const niWithSignature = niRidesWithSignature({ repStatus, repSendPhase });
  /* ── ב"ל לפי אדם בפירוט «ייצוג מול הרשויות» ──────────────────────────────────
     ‼ רק מי שברשימת ביטוח לאומי (targetsOf — אותו כלל כמו ni_targets_of בשרת). אדם שבוטל
     שומר את מסלול הביצוע כהיסטוריה (212) — הוא לא «ממתין לאישור», הבקשה שלו בוטלה. */
  const niTargetRoles = targetsOf(client.authorityRepresentations, 'nationalInsurance')
    .filter((r): r is 'client' | 'spouse' => r === 'client' || r === 'spouse');
  const roleOfPart = (s: OnboardingStep): 'client' | 'spouse' => (s.payload?.subjectRole === 'spouse' ? 'spouse' : 'client');
  const currentReqId = client.representationRequestId ?? null;
  /** לאדם יש שלב «ייצוג ברשות» של הבקשה הנוכחית — הוא חלק בפירוט, לא שורת קריאה. */
  const hasCurrentNiStep = (r: 'client' | 'spouse') => hasCurrentNiStepOf(clientSteps, r, currentReqId);
  /** אנשים בלי שלב (קליטה ראשונה — המסלול חי רק בביצוע) — שורת «ביטוח לאומי · {שם}». */
  const niTrackOnlyRoles = niTrackOnlyRolesOf(clientSteps, niTargetRoles, niExecution, currentReqId);
  /** …שההוראות שלהם מחכות לשליחה — «שלח הוראות» בשורה שלהם, ונספרים בתג (אותו מקור כמו התג). */
  const niSendWithoutStep = niSendWithoutStepRoles(clientSteps, niTargetRoles,
    { niExecution, representationRequestId: currentReqId, repStatus, repSendPhase });
  /** האנשים שבוטלו (ואינם ברשימה) ואין להם שלב של הבקשה הנוכחית — «הבקשה בוטלה ב-PIVO · …». */
  const niCancelledRoles = (['client', 'spouse'] as const).filter(r => !hasCurrentNiStep(r)
    && !!niCancelledText(client.authorityRepresentations, r));
  /**
   * אישור הייצוג נדרש — מי צריך לאשר: מי ששע״ם מציגה אצלו «ממתין לאישור» (awaiting), אחרת
   * מי שיש לו מה לסמן; בלי רשימה מהשרת — בעל הכרטיס.
   */
  const approvalWho = (() => {
    if (!repApprovalRequired) return [] as ('client' | 'spouse')[];
    const people = approvalPeople ?? [];
    const awaiting = people.filter(p => (p.awaiting?.length ?? 0) > 0);
    const list = (awaiting.length ? awaiting : people).map(p => p.person);
    const uniq = [...new Set(list)].filter((p): p is 'client' | 'spouse' => p === 'client' || p === 'spouse');
    return uniq.length ? uniq.sort((a, b) => (a === 'client' ? 0 : 1) - (b === 'client' ? 0 : 1)) : ['client' as const];
  })();
  const attnCtx: AttentionContext = {
    niExecution, repStatus, repSendPhase,
    // ‼ מה מתקבץ תחת «ייצוג מול הרשויות» — רק חלקים של בקשת הייצוג הנוכחית.
    representationRequestId: client.representationRequestId ?? null,
    niJobs: { client: jobForRole('client'), spouse: jobForRole('spouse') },
    // ‼ שני בני הזוג צריכים לאשר ⇒ «ממתין ל…» של הקבוצה אומר את שניהם (groupViewMap).
    repApprovalWaitingOn: approvalWho.length === 1 ? approvalWho[0] : approvalWho.length > 1 ? 'client' : null,
    niSendWithoutStep,
  };
  // ‼ (סבב 4) מקור אחד: stepAttention יודע כבר על משימת האישור האישי ועל «לא נוצרה».
  const attnOf = (s: OnboardingStep): Attention => stepAttention(s, attnCtx);
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
  // ‼ התג סופר **תהליכים** — בדיוק השורות שהרשימה מציגה כחולות/אדומות (אותו קיבוץ,
  // אותן תלויות). ייצוג עם שני חלקים שדורשים אותך = 1.
  const attentionN = requestRows(clientSteps, attnCtx, depParents)
    .filter(r => rowSummary(r, attnCtx).attn.kind === 'mine').length;
  const attentionRed = hasRedRequest(clientSteps, attnCtx);
  useEffect(() => { onAttentionSummary?.({ n: attentionN, red: attentionRed }); }, [onAttentionSummary, attentionN, attentionRed]);
  /** "עדכן את דף הלקוח" — הפעולה היחידה ברמת הדף. הבחירה (רק לעדכן / לעדכן
   *  ולשלוח / העתק קישור) והפרסום עצמו חיים ב-PublishCasePrompt. */
  const [publishPromptOpen, setPublishPromptOpen] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [pendingNames, setPendingNames] = useState<string[]>([]);
  /** עריכה בתוך השורה — אותו קומפוזר של ההוספה, מלא מראש. */
  const [editingStepId, setEditingStepId] = useState<string | null>(null);
  /** מצב עריכה — אותו מסך, פקדי ↑↓⋯ ותצורה נחשפים; במצב רגיל רק פעולה אחת. */
  const [editing, setEditing] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  /** מתג הפאנל המוטבע: חי (ברירת מחדל, אמין) מול אחרי עדכון. */
  const [sidebarPreviewMode, setSidebarPreviewMode] = useState<PortalPreviewMode>('live');
  /** «מה הלקוח רואה» — מגירה לפי דרישה (במקום עמודה קבועה לצד הבקשות). */
  const [previewSheetOpen, setPreviewSheetOpen] = useState(false);
  /**
   * «עבודה פנימית» מקופלת. null = אוטומטי (נפתחת לבד רק כשמשימה פנימית דורשת
   * טיפול); בחירה של גיא נשמרת בדפדפן הזה בלבד — נוחות, לא מצב.
   */
  const [internalOpenPref, setInternalOpenPref] = useState<boolean | null>(() => {
    try {
      const v = window.localStorage.getItem('pivo.requests.internalOpen');
      return v === '1' ? true : v === '0' ? false : null;
    } catch { return null; }
  });
  /** קומפוזר "משימה פנימית" — נפתח בתוך מקטע "העבודה שלי". */
  const [internalComposerOpen, setInternalComposerOpen] = useState(false);
  /** חלון הסגירה — נפתח רק כשהשרת חוסם, ונסגר איתו. */
  const [closeGate, setCloseGate] = useState<CloseReadiness | null>(null);

  /**
   * קפיצה לשלב אחר בעמוד, עם הדגשה קצרה — כדי שברור לאן הגענו.
   * ‼ (סבב 4) שלב שהוא חלק בתוך שורה אחרת (ייצוג, שרשרת) לא קיים במסך עד שהשורה
   * נפתחת — ולכן פותחים קודם את השורה ואת החלק, ואז גוללים (focusStep).
   */
  function gotoStep(stepId: string) {
    const top = rowTopRef.current.get(stepId);
    if (top && top !== stepId) { focusStep(stepId); return; }
    setHighlightStepId(stepId);
    document.getElementById(`ob-step-${stepId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    if (highlightTimer.current) window.clearTimeout(highlightTimer.current);
    highlightTimer.current = window.setTimeout(() => setHighlightStepId(null), 2600);
  }
  /** פותח את השורה שהשלב בתוכה ואת השלב עצמו, וגולל אליו. */
  function focusStep(stepId: string) {
    const top = rowTopRef.current.get(stepId) ?? stepId;
    setOpenRowId(top);
    setOpenChildId(top === stepId ? null : stepId);
    setHighlightStepId(stepId);
    if (highlightTimer.current) window.clearTimeout(highlightTimer.current);
    // ‼ החלק מצויר רק אחרי שהשורה נפתחה — גוללים ברינדור הבא.
    window.setTimeout(() => {
      document.getElementById(`ob-step-${stepId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 60);
    highlightTimer.current = window.setTimeout(() => setHighlightStepId(null), 2600);
  }

  // ‼ M2 — תיקון נאמנות: מוסד במיקוד משתלט על המסך, לא נפתח בתוך רשימת
  // הבקשות. זו הכרעת Product/UX מאושרת (בידוד חזותי וקוגניטיבי) — לא עיצוב
  // מחדש, אלא איזה תת-עץ מוחזר מהרכיב הזה. חוזרים ל"תהליך" (המסך הרגיל)
  // פשוט כשמאפסים את המצב — אין ניווט/מסלול חדש.
  // ‼ שני ה-hooks האלה חייבים לשבת לפני ה-return של מסך המיקוד שמתחת — אחרת
  // מעבר למסך המיקוד מקריס את הרכיב (סדר hooks משתנה).
  const readyNow = readyRecipientCount(readyToSend);
  useEffect(() => {
    if (!emailAfterAdd) return;
    if (readyNow > 0) { setEmailAfterAdd(false); setSendRequestsFocus('owner'); return; }
    const t = setTimeout(() => setEmailAfterAdd(false), 6000);
    return () => clearTimeout(t);
  }, [emailAfterAdd, readyNow]);
  const sendModeRef = useRef<'tray' | 'portal' | null>(null);
  /* ‼ המסלולים שרצים אצל הלקוח (215) — נטענים מחדש עם כל שינוי בבקשות
     (portalRefreshKey) ואחרי כל פעולה בפס. hook ⇒ חייב לשבת לפני ה-return
     של מסך המיקוד שמתחת. */
  const { runs: flowRuns, loading: flowRunsLoading, reload: reloadFlowRuns } = useClientFlowRuns(
    embedded ? clientId : undefined, portalRefreshKey);
  /** מייל הקישור לדף (עדכון מצב) או תזכורת — ישר לחלון המייל, בלי המגש. */
  const [portalSend, setPortalSend] = useState<'update' | 'reminder' | null>(null);
  /** «לפרטי המסלול» מהמגש — פותח את שורת הריצה מתחת לבקשות (n: כל לחיצה מחדש). */
  const [flowFocus, setFlowFocus] = useState<{ runId: string; n: number } | null>(null);

  if (embedded && focusedInstitutionKey) {
    const instStepsAll = clientSteps.filter(s => s.stepType.startsWith('institution_alignment_'));
    const focusStep = instStepsAll.find(s => s.payload.institution === focusedInstitutionKey);
    if (focusStep) {
      const openingCallStepForFocus = clientSteps.find(s => s.stepType === 'opening_call');
      // ‼ ניסוח חזרה אחד לכל שלב חיים. קודם היו שלושה ("קליטה"/"הקמת התיק"/
      // "תהליך") — אבל היעד הוא אותו מסך בדיוק, ושם שמשתנה לפי שלב החיים
      // מלמד את גיא שיש כאן שלושה מקומות. יש אחד: הבקשות.
      // ‼ נפתח מ«תצוגה מפורטת» בתיק המס ⇒ חוזרים לתיק המס, לא לבקשות.
      const returnLabel = focusOrigin === 'taxfile' ? 'חזרה לתיק המס' : 'חזרה לבקשות';
      const closeFocus = () => {
        setFocusedInstitutionKey(null);
        if (focusOrigin === 'taxfile') { setFocusOrigin('journey'); onOpenTaxFile?.(); }
      };
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
            onClose={closeFocus}
            /* ‼ נגמרו המוסדות ⇒ נוחתים בתיק המס. קודם נפתח כאן דף סטטוס
               נפרד, וזו בדיוק הכפילות ש-V6 ביטל: ליישור הקו אין יעד משלו,
               הוא מרענן את התיק והתשובה נקראת שם. */
            onAdvanceInstitution={next => {
              setFocusedInstitutionKey(next);
              if (next === null) onOpenTaxFile?.();
            }}
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
        ? nextActionText(nextStep)
        : `${STEP_TYPE_LABELS[nextStep.stepType]} - ${stepStatusLabel(nextStep)}`;

  const openCount = clientSteps.filter(s => isStepOpen(s.status)).length;
  const activeEngagement = clientEngagements[0];

  /* ── רצועת ההקשר (v3) ─────────────────────────────────────────────────────
     ‼ **אין מצב חדש כאן.** quotations.approvedAt, שלב ה-representation שנסגר,
     ו-execution.nationalInsurance.confirmedAt של הלקוח עצמו — מקורות קיימים. */
  const approvedQuotationForContext = (quotations ?? [])
    .filter(q => q.clientId === clientId && (q.status === 'approved' || !!q.approvedAt))
    .sort((a, b) => (a.id === activeEngagement?.quotationId ? 1 : 0) - (b.id === activeEngagement?.quotationId ? 1 : 0)
      || (a.approvedAt ?? '').localeCompare(b.approvedAt ?? ''))
    .slice(-1)[0];
  const doneRepStepForContext = clientSteps.find(
    s => s.stepType === 'representation' && (s.status === 'completed' || s.status === 'verified'));
  const contextBits: string[] = [];
  /* ‼ «מיוצג פעיל מ-…» ירד מכאן: השורה של «ייצוג מול הרשויות» ב«הושלמו» אומרת את זה, עם
     החלקים שלה (doneLine) — תהליך שהושלם מופיע פעם אחת. */
  /** מצב הייצוג שהושלם — «פעיל מ-…» / «הושלם …» (+ «ממתין לאישור הרשויות»). */
  const doneRepState = (s: OnboardingStep): string =>
    repStatus === 'active' || !repStatus
      ? `פעיל${s.completedAt ? ` מ-${formatDate(s.completedAt, 'list')}` : ''}`
      : `הושלם${s.completedAt ? ` ${formatDate(s.completedAt, 'list')}` : ''}${repStatus === 'awaiting_authorities' ? ' · ' + REPRESENTATION_STATUS_LABELS[repStatus] : ''}`;
  if (approvedQuotationForContext) {
    contextBits.push(`ההצעה אושרה${approvedQuotationForContext.approvedAt ? ` ${formatDate(approvedQuotationForContext.approvedAt, 'list')}` : ''}`);
  }
  // ‼ ב"ל של הלקוח — רק כשאין לו שורה אחרת שאומרת את זה: שלב «ייצוג ברשות» (בפירוט או
  // ב«הושלמו»), או הפירוט של «ייצוג מול הרשויות» הפתוח, או שורת הייצוג שהושלם (שם הוא מקופל).
  const niClientShownElsewhere =
    clientSteps.some(s => s.stepType === 'authority_representation' && s.status !== 'cancelled' && roleOfPart(s) === 'client')
    || (niTargetRoles.includes('client')
      && (!!doneRepStepForContext || clientSteps.some(s => s.stepType === 'representation' && isStepOpen(s.status))));
  if (niExecution?.client?.confirmedAt && !niClientShownElsewhere) {
    contextBits.push(`ייפוי הכוח של ${clientFirstOrClient} בביטוח לאומי אושר ${formatDate(niExecution.client.confirmedAt, 'list')}`);
  }
  const readyCount = readyRecipientCount(readyToSend);
  // ‼ איזה חלון שליחה נפתח — נקבע פעם אחת, בפתיחה. אחרי «שלח» המגש מתרוקן
  // (readyCount=0), ובלי ההקפאה חלון «שלח שוב את הקישור לדף» החליף את אישור
  // השליחה תוך פחות משנייה — ונראה כמו בקשה לשלוח שוב (סבב 3, ביקורת שימושיות).
  if (sendRequestsFocus === null) sendModeRef.current = null;
  else if (sendModeRef.current === null) sendModeRef.current = readyCount > 0 ? 'tray' : 'portal';
  const unsentStepIds = new Set(readyToSend.owner.items.map(i => i.stepId));
  /* ‼ השער של הדף האישי, לכל בקשה (clientPageGate — התאום של client_step_gate_open, 214).
     קליטה חדשה שטרם פורסמה: מה שנוצר בה «ממתין לפרסום» ונספר ב«עוד לא בדף»; מה שעבר
     מההתקשרות הקודמת (פורסם לפני הקליטה) — בדף, ואינו נספר. ‼ לא hook — אחרי מסך המיקוד. */
  const gateEngagements = engagementsOf(engagements, clientId);
  // הנוסח בוואטסאפ כשהקישור נשלח ידנית — כמו המייל: «פתחנו לך… הצטרפות» רק בקליטה פתוחה.
  const intakeOpen = !!openIntake(gateEngagements);
  const awaitingPublishIds = new Set(clientSteps
    .filter(s => isStepOpen(s.status) && awaitsPublication(s, gateEngagements))
    .map(s => s.id));

  /* ‼ עוד לא נמכר כלום ⇒ בקשה חדשה היא הכנה ולא שליחה, והשרת מחזיק אותה
     (מיגרציה 135). המסך חייב לומר את אותו דבר, אחרת הרו"ח מוסיף בקשה ולא
     מבין למה היא לא מגיעה. הגבול זהה לזה שבשרת: derive_lifecycle_stage.
     ‼ לקוח בלי הצעה ובלי התקשרות בכלל הוא 'active'/'onboarding' ולא נכנס
     לכאן - רוב הכרטיסים במסד הם כאלה, והם ממשיכים לעבוד כרגיל. */
  // ‼ 217 (D2): גם לקוח שחוזר — בלי התקשרות נוכחית, עם הצעה שנשלחה. אותו פרדיקט כמו בשרת
  // (requests_held_until_approval), דרך הקשר הקליטה — לא בדיקה שנייה כאן.
  const awaitingQuoteApproval = intake.state === 'pending';
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
  // ‼ «שדרוג לייצוג ראשי» כן כאן — חלק של הייצוג (SURFACE_HIDDEN_OFFICE_TYPES), ואינו חוסם סגירה.
  const onSurface = (s: OnboardingStep) =>
    !SURFACE_HIDDEN_OFFICE_TYPES.includes(s.stepType)
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
  // ‼ (217) «שלו»: החומרים שתלויים במכתב (או מאותה התקשרות) — מכתב ישן שהושלם
  // בהתקשרות קודמת לא חוזר להיות פני הכרטיס של מסלול חדש אצל לקוח שחוזר.
  const releaseAnchor = visibleSteps.filter(s => releaseLetterAnchors(s, visibleSteps, depParents));

  /* v3: הייצוג שהושלם עלה לרצועת ההקשר, ולכן הוא גם ב«עבר» כמו כל בקשה
     שנסגרה — שם הוא היסטוריה, לא כרטיס. */
  const doneSteps = visibleSteps.filter(
    s => !isStepOpen(s.status) && !releaseAnchor.some(a => a.id === s.id));

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
      // ‼ משימה פנימית לא בדף אף פעם — אין «הסרה בפרסום הבא»; מבוטלת מיד, כמו טיוטה.
      // הסרה ממתינה ישנה עליה (מלפני הכלל) — מתבטלת כרגיל.
      if (t.publishedAt == null || (neverOnClientPage(t) && !t.pendingCancel)) {
        if (pending) await run(t, 'cancel', { note: neverOnClientPage(t) ? 'משימה פנימית - הוסרה' : 'הוסר לפני שפורסם' });
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
        // ‼ השרת דוחה סימון כ"נדרש" כשאין קליטה פתוחה. אמור להיות בלתי-נגיש
        // מהמסך (הפריט מוסתר), ונשאר כאן בשביל לשונית ישנה שנשארה פתוחה.
        : res?.error === 'no_open_intake'
        ? 'אין ללקוח קליטה פתוחה, ולכן אין מה לחסום. הבקשה נשארת בקשה רגילה.'
        : (rpcError?.message ?? 'עדכון הבקשה נכשל.'));
      return;
    }
    refresh?.();
  }

  /* ── פתיחת «חומרים מרו״ח קודם» כשהיא חסרה ─────────────────────────────────
     ‼ אותה יצירה בדיוק שרצה מ"+ בקשה" — היא חיה ב-lib/prevAccountantTrack
     כדי ששתי נקודות הכניסה לא יתפצלו. אין כאן אחסון טיוטה מקביל: הטיוטה
     תיוולד על השלב עצמו.
     ‼ ה-useState של המסלול הזה יושב למעלה, עם שאר ה-hooks — לא כאן. הוא ישב
     כאן פיזית, אחרי ה-return המוקדם של מסך המיקוד (שורה ~722), וכל כניסה
     למוסד ביישור קו קרסה עם React #300: ברינדור הממוקד ה-hook לא רץ. */
  const needsPrevTrack =
    !!(client.hasPreviousAccountant || client.prevAccountantEmail || client.prevAccountantName)
    // ‼ (217) מכתב שהושלם בהתקשרות קודמת אינו «כבר יש מסלול» אצל לקוח שחוזר.
    && !stepTypeTaken(clientSteps, 'release_letter', activeEngagement?.id);

  async function openPrevAccountantTrack() {
    setPrevTrackBusy(true);
    setError(null);
    const res = await createPrevAccountantTrack({
      clientId,
      steps: clientSteps,
      prevAccountantEmail: prevAccountant?.email,
      published: true,
      currentEngagementId: activeEngagement?.id,
    });
    setPrevTrackBusy(false);
    if (!res.ok) { setError(res.error); return; }
    refresh?.();
  }

  // ─── ייצוג מול הרשויות — חלקים (סבב 4) ─────────────────────────────────────
  /** השמות הפרטיים **הנוכחיים** מהכרטיס — לא subjectName שנשמר על השלב ומתיישן. */
  const partNames = {
    client: (client.firstName || '').trim().split(/\s+/)[0] || clientFirstOrClient,
    spouse: (client.spouseFirstName || client.spouseName || 'בן/בת הזוג').trim().split(/\s+/)[0],
  };
  /** החלק שייך לבקשת הייצוג הנוכחית (ולכן ההורה הפתוח שלה מקבץ אותו). שדרוג לראשי — תמיד. */
  const ofCurrentRequest = (s: OnboardingStep): boolean =>
    belongsToRepresentationRequest(s, client.representationRequestId ?? null);
  /** חלק של בקשת ייצוג קודמת — לא קורא את הביצוע של הבקשה הנוכחית (F X-1). */
  const isStalePart = (s: OnboardingStep): boolean =>
    isStaleRepresentationPart(s, client.representationRequestId ?? null);
  /** מי בן/בת הזוג באישור האישי — השם הנוכחי מהכרטיס, אחרת מה שנשמר על המשימה. */
  const spouseWhoOf = (s: OnboardingStep): string =>
    partNames.spouse !== 'בן/בת הזוג' ? partNames.spouse : (String(s.payload.subjectName ?? '').trim() || 'בן/בת הזוג');
  /** חלק שהלקוח סיים ומחכה לבדיקה — «בדוק וסגור» (אותו תנאי של השורה עצמה). */
  const needsReview = (s: OnboardingStep): boolean =>
    GENERIC_REVIEW_TYPES.includes(s.stepType) && !s.payload.smartForm && !isCreationProblem(s)
    && attnOf(s).kind === 'mine' && (s.status === 'pending' || s.status === 'in_progress') && s.needsAttention
    && !isManualInternal(s) && !isLegacyInternalReview(s) && !s.payload.externalParty;
  /** (H2) אישור הייצוג באזור האישי נדרש ופתוח — מי צריך לאשר, בשמות. */
  const approvalActive = repApprovalRequired && repStatus === 'awaiting_authorities';
  const approvalNames = approvalWho.map(r => partNames[r]);
  const approvalNeedText = `נדרש אישור של ${approvalNames.join(' ושל ')} באזור האישי`;
  const approvalWaitText = `ממתין ${approvalNames.map(n => lamed(n)).join(' ו')}`;
  /** חלק של הייצוג שנסגר — «אושר 23.09.26» (ב"ל), «הושלם …», או סיבת הדילוג. */
  const donePartText = (s: OnboardingStep): string => {
    if (s.status === 'skipped') return skippedLabel(s.payload);
    const at = (s.stepType === 'authority_representation' && typeof s.payload?.confirmedAt === 'string' ? s.payload.confirmedAt : '')
      || s.completedAt || '';
    return `${s.stepType === 'authority_representation' ? 'אושר' : 'הושלם'}${at ? ` ${formatDate(at, 'list')}` : ''}`;
  };
  const openRepParent = clientSteps.find(s => s.stepType === 'representation' && isStepOpen(s.status));
  const doneRepParent = clientSteps
    .filter(s => s.stepType === 'representation' && (s.status === 'completed' || s.status === 'verified'))
    .sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''))[0];
  /**
   * חלק שעומד לבדו (ההורה נסגר / חסר / שייך לבקשה אחרת) — שורת ההקשר שלו.
   * null ⇒ החלק מתקבץ תחת «ייצוג מול הרשויות» ואין צורך בהקשר.
   */
  const repPartContext = (s: OnboardingStep): string | null => {
    if (!isRepresentationPart(s)) return null;
    if (openRepParent && ofCurrentRequest(s)) return null;
    if (!ofCurrentRequest(s) && representationRequestOf(s)) return 'חלק מבקשת ייצוג קודמת';
    if (doneRepParent) {
      return doneRepParent.completedAt
        ? `חלק מבקשת הייצוג שהושלמה ב-${formatDate(doneRepParent.completedAt, 'list')}`
        : 'חלק מבקשת הייצוג שהושלמה';
    }
    return 'חלק מבקשת הייצוג';
  };
  /** המודל של «ייצוג בביטוח לאומי · {שם}» — אותו לשורת החלק ולשורה הראשית. */
  const authRepModelFor = (s: OnboardingStep): AuthRepRowModel => {
    const role = s.payload?.subjectRole === 'spouse' ? 'spouse' : 'client';
    const open = isStepOpen(s.status);
    // ‼ חלק של בקשה קודמת: המסלול והמשימה שבמסך הם של הבקשה הנוכחית — לא שלו.
    const stale = isStalePart(s);
    return authRepRowModel({
      open,
      first: partNames[role],
      track: stale ? undefined : niExecution?.[role],
      tone: attnOf(s).tone,
      job: stale ? null : attnCtx.niJobs?.[role] ?? null,
      missing: open ? ((s.payload?.prerequisites as { missing?: string[] } | undefined)?.missing ?? []) : [],
      ridesWithSignature: niWithSignature && (openRepParent ? ofCurrentRequest(s) : false),
    });
  };

  /** שלבי «ייצוג מול הרשויות» שיש להם חלקים — נמלא ברינדור הרשימה (renderRow). */
  const repBreakdownIds = new Set<string>();

  /**
   * «צור שוב» על «לא נוצרה» — השרת מנסה שוב, והתוצאה נראית מיד:
   * נוצרה ⇒ השורה החדשה נפתחת ומודגשת, עם «נוצרה — …»; עדיין לא ⇒ השורה האדומה
   * נפתחת עם הסיבה המעודכנת; נסגרה בלי שורה חדשה ⇒ משפט מעל הרשימה.
   */
  async function retryCreation(step: OnboardingStep, itemTitle: string) {
    setBusyStepId(step.id);
    setRowNote(null);
    setListNote(null);
    const r = await retryRequestCreation(step.id);
    setBusyStepId(null);
    const t = retryCreationText(r, itemTitle);
    const created = r.ok !== false && !r.error && r.resolved && r.stepId && (r.how ?? 'created') === 'created';
    if (created && r.stepId) {
      setRowNote({ stepId: r.stepId, text: t.text, err: false });
      requestFocus({ stepId: r.stepId });
    } else if (r.ok !== false && !r.error && r.resolved) {
      setListNote({ text: `«${itemTitle}» — ${t.text}`, err: false });
    } else {
      setRowNote({ stepId: step.id, text: t.text, err: t.err });
      if (embedded) setOpenRowId(step.id);
    }
    refresh?.();
    void reloadFlowRuns();
  }

  /** «הסתר מהדף» על משימה ישנה בלי תוכן שעדיין בדף הלקוח (216 §9). */
  async function hideFromClient(step: OnboardingStep) {
    setBusyStepId(step.id);
    setRowNote(null);
    const res = await hideStepFromClient(step.id);
    setBusyStepId(null);
    // ‼ הקודים של hide_step_from_client (216 §9) — טקסט לכל אחד; לא ידוע — «לא הצלחנו — נסה שוב».
    if (res.ok === false || res.error) {
      setRowNote({ stepId: step.id, text: hideStepErrorText(res.error), err: true });
      return;
    }
    // ‼ השורה עוברת ל«עבודה פנימית» — שם היא נפתחת ומודגשת, עם המשפט שאומר מה קרה.
    setRowNote({ stepId: step.id, text: hideStepDoneText(res, clientFirstOrClient), err: false });
    requestFocus({ stepId: step.id, internal: true });
    refresh?.();
  }

  /** רינדור בקשה אחת — משותף לרשימה השטוחה (המסך הישן) ולשורות "מה אני צריך מהלקוח"/"העבודה שלי". */
  const renderStepInner = (step: OnboardingStep) => {
              // ‼ טופס חכם (206): השורה היא היטל של ההגשה — המצב נכתב בשרת, ומכאן
              // רק הדלת למסך הפירוט. אין עריכה בשורה ואין «סמן כהושלם» ידני.
              const smart = (step.stepType === 'custom_request' ? step.payload?.smartForm : undefined) as SmartFormProjection | undefined;
              if (smart?.filingId) {
                const purposes = (smart.purposes ?? []) as Btl6101Purpose[];
                return (
                  <JourneyRow
                    key={step.id}
                    step={step}
                    stepById={stepById}
                    highlight={highlightStepId === step.id}
                    statusLabel={embedded
                      ? [smart.stateLabel ?? 'טופס חכם', purposes.map(p => BTL6101_PURPOSE_LABELS[p]).join(' · '),
                         (smart.revision ?? 1) > 1 ? `גרסה ${smart.revision}` : ''].filter(Boolean).join(' · ')
                      : (smart.stateLabel ?? 'טופס חכם')}
                    menu={null}
                    primary={embedded && attnOf(step).kind === 'mine' ? (
                      <button type="button" className="btn btn-sm btn-primary" onClick={() => setSmartFilingId(smart.filingId)}>
                        פתח טופס
                      </button>
                    ) : undefined}
                    always={embedded ? undefined :
                      <div className="sf-card-line" style={{ marginTop: '.35rem' }}>
                        {purposes.length > 0 && <span>{purposes.map(p => BTL6101_PURPOSE_LABELS[p]).join(' · ')}</span>}
                        {(smart.revision ?? 1) > 1 && <span>· גרסה {smart.revision}</span>}
                        <span style={{ flex: 1 }} />
                        <button type="button" className="btn btn-sm btn-primary" onClick={() => setSmartFilingId(smart.filingId)}>
                          פתח טופס
                        </button>
                      </div>
                    }
                  >
                    {null}
                  </JourneyRow>
                );
              }
              // עריכה בתוך השורה — הקומפוזר מחליף את השורה עצמה. אין מודל.
              if (editingStepId === step.id && step.stepType === 'custom_request') {
                return (
                  <InlineComposer
                    key={step.id}
                    clientId={clientId}
                    intake={intake}
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
              const attn = attnOf(step);
              const unsent = unsentStepIds.has(step.id);
              /* ‼ (217) «לא נוצרה» — שורה של המשרד בלי בקשה מאחוריה: אין «סיימתי»,
                 «ממתין ללקוח», «פתח מחדש», עריכה, «שמור כתבנית» או הסרה. רק «צור שוב»
                 / «אין צורך» (ושאר מה שהסיבה מציעה). */
              const problem = isCreationProblem(step);
              /** חלק ב"ל של בקשת ייצוג קודמת — עומד לבד, בלי פעולות ב"ל של הבקשה הנוכחית. */
              const staleNi = step.stepType === 'authority_representation' && isStalePart(step);
              /** «חומרים / הגדרה של בקשה» — לא על שורת בעיה.
               *  ‼ ולא על «צילום תעודה לרשות המסים» (208): השרת בונה אותה (צילום שבתיק + אישור), ועורך
               *  כללי היה מאפשר לשנות בה את מה שהבקשה לייצוג צריכה — גם בשם בן/בת הזוג (§9). */
              const editable = step.stepType === 'custom_request' && !isSpouseConfirmTask(step) && !problem
                && !isShaamIdentityStep(step);
              /* ‼ חלק ב"ל של בקשה קודמת מופיע בדף של הלקוח (build_client_portal) — ההסרה הרגילה
                 («תוסר מהדף בפרסום הבא») היא הדרך לסגור אותו; «ביטול הבקשה» של ב"ל פועל על הבקשה
                 הנוכחית, לא עליו. */
              const removable = (CLIENT_FACING_TYPES.includes(step.stepType) || staleNi) && !isSpouseConfirmTask(step) && !problem;

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
              const menuDropdown = (
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
                          {editable && (
                            <button type="button" role="menuitem" className={mi}
                              onClick={() => { setMenuStepId(null); setEditingStepId(step.id); }}>עריכה והגדרות</button>
                          )}
                          {/* ‼ v3: הסגירה של בקשה ממתינה חיה כאן, לא ככפתור על
                              הכרטיס. הכפתור נקרא על שם מי שבאמת מחזיק את הכדור. */}
                          {attn.kind === 'waiting' && !locked && !isManualInternal(step)
                            && ['client_documents', 'custom_request', 'paperless_tax_authority',
                                'prev_accountant_details', 'materials_received'].includes(step.stepType) && (
                            <button type="button" role="menuitem" className={mi} disabled={busy}
                              onClick={() => { setMenuStepId(null); void run(step, 'complete'); }}>
                              {step.ball === 'prev_accountant' ? 'החומרים הגיעו'
                                : step.ball === 'authority' ? 'התקבל מהרשות'
                                : step.ball === 'external' ? 'התקבל מהגורם החיצוני'
                                : 'סמן שהתקבל / בוצע'}
                            </button>
                          )}
                          <button type="button" role="menuitem" className={mi}
                            onClick={() => { setMenuStepId(null); handleNote(step); }}>הוסף הערה</button>
                          {editing && !problem && (
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

                              {/* ‼ שלב הייצוג ושלב «ייצוג ברשות» (157) מסונכרנים מהשרת —
                                  "דלג" ו"חסום" ידניים היו נדרסים בטריגר הבא ומשקרים עד אז.
                                  נשארת רק הערה. */}
                              {step.stepType !== 'representation' && step.stepType !== 'authority_representation' && (
                                <>
                                  <button type="button" role="menuitem" className={mi}
                                    onClick={() => { setMenuStepId(null); handleSkip(step); }}>דלג על הבקשה</button>
                                  <button type="button" role="menuitem" className={mi}
                                    onClick={() => { setMenuStepId(null); handleBlock(step); }}>סמן כחסום</button>
                                </>
                              )}
                              {requiredApplies && !['completed', 'verified', 'cancelled'].includes(step.status) && (
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
                          {removable && (
                            <button type="button" role="menuitem"
                              className={`${mi} ${step.pendingCancel ? '' : 'is-danger'}`} disabled={busy}
                              onClick={() => { setMenuStepId(null); void removeRow(step); }}
                              title={neverOnClientPage(step) && !step.pendingCancel ? 'משימה פנימית - ההסרה מיידית'
                                : step.publishedAt == null ? 'הבקשה עוד לא פורסמה - ההסרה מיידית'
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
              /* ‼ משטח מפושט: אותן פעולות של ⋯ במנוחה (עריכה, «התקבל», הערה,
                 הסרה) — כקישורים שקטים בתחתית הבקשה הפתוחה, לא אייקון על כל שורה.
                 במצב «עריכת הבקשות» חוזר התפריט המלא עם הסידור. */
              const waitingCompleteLabel = attn.kind === 'waiting' && !locked && !isManualInternal(step)
                && ['client_documents', 'custom_request', 'paperless_tax_authority',
                    'prev_accountant_details', 'materials_received'].includes(step.stepType)
                ? (step.ball === 'prev_accountant' ? 'החומרים הגיעו'
                  : step.ball === 'authority' ? 'התקבל מהרשות'
                  : step.ball === 'external' ? 'התקבל מהגורם החיצוני'
                  : 'סמן שהתקבל / בוצע')
                : null;
              const menuLinks = isStepOpen(step.status) ? (
                <span className="rl-links">
                  {waitingCompleteLabel && (
                    <button type="button" className="rl-link" disabled={busy}
                      onClick={() => void run(step, 'complete')}>{waitingCompleteLabel}</button>
                  )}
                  {editable && (
                    <button type="button" className="rl-link" onClick={() => setEditingStepId(step.id)}>עריכה</button>
                  )}
                  {noteDraft?.stepId !== step.id && (
                    <button type="button" className="rl-link" onClick={() => handleNote(step)}>הוספת הערה</button>
                  )}
                  {removable && (
                    <button type="button" className={`rl-link${step.pendingCancel ? '' : ' is-danger'}`} disabled={busy}
                      onClick={() => void removeRow(step)}
                      title={neverOnClientPage(step) && !step.pendingCancel ? 'משימה פנימית - ההסרה מיידית'
                        : step.publishedAt == null ? 'הבקשה עוד לא פורסמה - ההסרה מיידית'
                        : step.pendingCancel ? 'ההסרה ממתינה לפרסום - לחיצה תבטל אותה'
                        : 'הבקשה תוסר מהדף של הלקוח בפרסום הבא'}>
                      {step.pendingCancel ? 'ביטול ההסרה' : 'הסרת הבקשה'}
                    </button>
                  )}
                </span>
              ) : null;
              const menu = embedded && !editing ? menuLinks : menuDropdown;

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
                    context={repPartContext(step)}
                    onOpenRepresentation={onOpenRepresentation}
                    menu={menu}
                  />
                );
              }

              if (step.stepType === 'release_letter') {
                return (
                  <ReleaseStepCard
                    key={step.id}
                    step={step}
                    /* ‼ (217) של המסלול הזה: החומרים שתלויים במכתב, ואחרת של העבודה
                       הנוכחית — לא מסלול שהושלם בהתקשרות קודמת. */
                    materialsStep={clientSteps.find(s => s.stepType === 'materials_received' && s.status !== 'cancelled'
                        && ((depParents.get(s.id) ?? (s.dependsOnStepId ? [s.dependsOnStepId] : [])).includes(step.id)))
                      ?? stepForCurrentWork(clientSteps, 'materials_received', clientEngagements[0]?.id)}
                    detailsStep={(step.dependsOnStepId ? clientSteps.find(s => s.id === step.dependsOnStepId
                        && s.stepType === 'prev_accountant_details' && s.status !== 'cancelled') : undefined)
                      ?? stepForCurrentWork(clientSteps, 'prev_accountant_details', clientEngagements[0]?.id)}
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
                    repNote={repNote}
                    repSendPhase={repSendPhase}
                    onOpen={onOpenRepresentation}
                    /* ‼ עם חלקים — «למרכז הייצוג ←» יושב בתחתית «לפי רשות ואדם». */
                    hasBreakdown={repBreakdownIds.has(step.id)}
                    approvalNeeded={approvalActive}
                    menu={menu}
                  />
                );
              }

              /* ── חלק ב"ל של בקשת ייצוג קודמת (F X-1) ─────────────────────────────────
                 ‼ מסלול ב"ל שבמסך הוא של הבקשה הנוכחית — לא שלו, ולכן לא מוצג עליו «אושר …»,
                 «שלח הוראות» או «ביטול הבקשה» (שפועלים על הבקשה הנוכחית). המצב שלו — מהשלב עצמו
                 (השרת מסנכרן אותו מהבקשה שלו); הפירוט העדכני — במרכז הייצוג. נסגר ב«הסרת הבקשה». */
              if (staleNi) {
                const role = step.payload?.subjectRole === 'spouse' ? 'spouse' : 'client';
                const ref = typeof step.payload?.referenceNumber === 'string' ? step.payload.referenceNumber : '';
                return (
                  <JourneyRow
                    key={step.id}
                    step={step}
                    stepById={stepById}
                    highlight={highlightStepId === step.id}
                    name={`ייצוג בביטוח לאומי · ${partNames[role]}`}
                    state={{ text: 'מבקשה קודמת', tone: 'gray' }}
                    statusLabel={[stepStatusLabel(step), ref ? `אסמכתא ${ref}` : null].filter(Boolean).join(' · ')}
                    menu={menu}
                  >
                    <p className="rl-part-context">
                      חלק מבקשת ייצוג קודמת
                      {onOpenRepresentation && (
                        <> · <button type="button" className="ui-linkbtn" onClick={onOpenRepresentation}>למרכז הייצוג ←</button></>
                      )}
                    </p>
                  </JourneyRow>
                );
              }

              if (step.stepType === 'authority_representation') {
                const subjectRole = step.payload?.subjectRole === 'spouse' ? 'spouse' : 'client';
                const track = subjectRole === 'spouse' ? niExecution?.spouse : niExecution?.client;
                return (
                  <AuthorityRepresentationStepCard
                    key={step.id}
                    step={step}
                    stepById={stepById}
                    highlight={highlightStepId === step.id}
                    track={track}
                    attn={attn}
                    model={authRepModelFor(step)}
                    first={partNames[subjectRole]}
                    context={repPartContext(step)}
                    onOpenRepresentation={onOpenRepresentation}
                    job={attnCtx.niJobs?.[subjectRole] ?? null}
                    clientRecord={client}
                    spouseClient={spouseClient}
                    /* ‼ v3: השליחה עוברת דרך המגש האחד — לא דיאלוג נסתר בתוך הכרטיס.
                       הקבוצה של האדם הזה נפתחת במוקד. */
                    onSendInstructions={() => setSendRequestsFocus(`ni:${subjectRole}`)}
                    onExecutionChanged={() => { void onNiInstructionsSent?.(); refresh?.(); setReadyTick(t => t + 1); }}
                    currentValues={{
                      spouseFirstName: client.spouseFirstName, spouseLastName: client.spouseLastName,
                      spouseIdNumber: client.spouseIdNumber,
                      spouseBirthYear: client.spouseBirthYear ? String(client.spouseBirthYear) : undefined,
                      firstName: client.firstName, lastName: client.lastName, idNumber: client.idNumber,
                      birthDate: client.birthDate,
                    }}
                    client={{
                      role: 'client',
                      name: `${client.firstName ?? ''} ${client.lastName ?? ''}`.trim() || 'הלקוח',
                      email: client.email || '',
                    }}
                    spouse={{
                      role: 'spouse',
                      name: `${client.spouseFirstName ?? ''} ${client.spouseLastName ?? ''}`.trim() || client.spouseName || 'בן/בת הזוג',
                      email: client.spouseEmail || '',
                    }}
                    onSaveEmail={async (role, email) => {
                      if (!onUpdateClientFields) return;
                      await onUpdateClientFields(role === 'spouse' ? { spouseEmail: email } : { email });
                    }}
                    onChanged={() => refresh?.()}
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

              /* ── «לא נוצרה — «X»» (217) ─────────────────────────────────────────
                 ‼ שורת משרד אדומה: הסיבה ומה עושים — מהקודים שנשמרו (creationProblemText,
                 api.ts — אין נוסח שני כאן). הכפתורים לפי מה שהסיבה מאפשרת, ו«אין צורך»
                 תמיד — בחלון אישור שאומר מה קורה למסלול ולסגירת הקליטה. */
              if (problem) {
                const cp = step.payload.creationProblem as CreationProblem;
                const txt = creationProblemText(cp);
                const itemTitle = String(cp.itemTitle ?? '').trim() || rowTitle(step);
                const askSkip = () => {
                  const c = creationSkipConfirm({
                    itemTitle, requiredForClose: requiredApplies && isStepRequiredForClose(step), inFlow: !!step.flowRunId,
                  });
                  setConfirmState({ stepId: step.id, title: c.title, message: c.message, confirmLabel: c.confirmLabel,
                    action: { name: 'skip', payload: c.payload } });
                };
                const runId = cp.runId ?? step.flowRunId ?? null;
                /* ‼ «פתח את המסלול» נוחת על השלב בבונה המסלולים במשרד — שם מחליפים את הפריט (לא בשורת
                   המסלול של הלקוח, שאין בה עריכה). בלי מזהה המסלול — השורה של הלקוח, כמו קודם. */
                const flowId = runId ? flowRuns.find(r => r.id === runId)?.flowId ?? null : null;
                const flowHref = flowId ? `#${formatRoute({ view: 'firmProfile', officePage: 'flows',
                  officeFocus: ['flow', flowId, cp.stageKey ?? step.flowStageKey ?? '', cp.itemKey ?? step.flowItemKey ?? ''].join(':').replace(/:+$/, '') })}` : null;
                const libraryHref = `#${formatRoute({ view: 'firmProfile', officePage: 'library',
                  ...(cp.ref?.templateId ? { officeFocus: `request:${cp.ref.templateId}` } : {}) })}`;
                const cardProblem = cp.cls === 'card' || cp.reason === 'spouse_name_missing';
                type ProblemAct = 'retry' | 'library' | 'add' | 'flow' | 'card' | 'skip';
                const act = (kind: ProblemAct, primaryBtn: boolean) => {
                  const cls = `btn btn-sm ${primaryBtn ? 'btn-primary' : 'btn-secondary'}`;
                  if (kind === 'retry') return (
                    <button type="button" className={cls} disabled={busy}
                      onClick={() => void retryCreation(step, itemTitle)}>{busy ? 'מנסה…' : 'צור שוב'}</button>);
                  if (kind === 'library') return <a className={cls} href={libraryHref}>פתח בספרייה</a>;
                  if (kind === 'card') return onOpenTaxFile ? (
                    <button type="button" className={cls} onClick={() => onOpenTaxFile()}>פתח את תיק המס</button>) : null;
                  if (kind === 'add') return (
                    <button type="button" className={cls} onClick={() => setAddOpen(true)}>＋ בקשה חדשה</button>);
                  if (kind === 'flow' && flowHref) return <a className={cls} href={flowHref}>פתח את המסלול</a>;
                  if (kind === 'flow') return runId ? (
                    <button type="button" className={cls}
                      onClick={() => setFlowFocus(f => ({ runId, n: (f?.n ?? 0) + 1 }))}>פתח את המסלול</button>) : null;
                  return <button type="button" className={cls} disabled={busy} onClick={askSkip}>אין צורך</button>;
                };
                /* ‼ הבקשה בספרייה ריקה / שבורה ⇒ «צור שוב» לא יצליח לפני התיקון — הפעולה הראשית היא
                   «פתח בספרייה», ו«צור שוב» אחריה. */
                const mainKind: ProblemAct = cardProblem && onOpenTaxFile ? 'card'
                  : cp.next === 'library' && txt.actions.includes('library') ? 'library'
                  : txt.actions.includes('retry') ? 'retry'
                  : txt.actions.includes('add') ? 'add' : txt.actions.includes('flow') && runId ? 'flow' : 'skip';
                const secondary = ([
                  ...txt.actions,
                  // ‼ «＋ בקשה חדשה» מוזכר גם בנוסח של «צור שוב» ושל «במסלול» — הכפתור ליד.
                  // ‼ חסר נתון בכרטיס — «＋ בקשה חדשה» הייתה יוצרת בקשה מחוץ למסלול; הדרך היא תיק המס.
                  ...(cardProblem ? ['card' as const] : cp.next === 'retry' || cp.next === 'flow' ? ['add' as const] : []),
                  'skip',
                ] as ProblemAct[]).filter((k, i, a) => k !== mainKind && a.indexOf(k) === i);
                return (
                  <JourneyRow
                    key={step.id}
                    step={step}
                    stepById={stepById}
                    highlight={highlightStepId === step.id}
                    /* ‼ שם הפריט — «לא נוצרה» הוא המצב (אדום), לא חלק מהשם. */
                    name={embedded ? itemTitle : rowTitle(step)}
                    state={{ text: 'לא נוצרה', tone: 'red' }}
                    statusLabel={embedded ? 'אצלך' : CREATION_PROBLEM_STATUS}
                    primary={embedded ? act(mainKind, true) : undefined}
                    menu={<>{!embedded && act(mainKind, true)}{menu}</>}
                  >
                    <div className="rl-problem">
                      <p className="rl-problem-why">{txt.reason}.</p>
                      <p className="rl-problem-next">{txt.next}</p>
                      {txt.lastTry && <p className="rl-facts">{txt.lastTry}</p>}
                      <div className="rl-problem-acts">
                        {secondary.map(k => <span key={k}>{act(k, false)}</span>)}
                      </div>
                    </div>
                  </JourneyRow>
                );
              }

              /** משימה ישנה בלי תוכן שעדיין בדף הלקוח — המשרד מחליט (216 §9). */
              const legacyReview = isLegacyInternalReview(step) && isStepOpen(step.status) && !locked;
              const hideBtn = legacyReview ? (
                <button type="button" className="btn btn-sm btn-primary" disabled={busy}
                  onClick={() => void hideFromClient(step)}>{busy ? 'מסתיר…' : 'הסתר מהדף'}</button>
              ) : null;
              /** «צילום תעודה לרשות המסים · {שם}» — שם קצר, בשם הנוכחי מהכרטיס. */
              const partLabel = representationPartLabel(step, partNames);
              const partContext = repPartContext(step);

              const reviewBtn = attn.kind === 'mine' && (step.status === 'pending' || step.status === 'in_progress')
                && !extSendable && !isManualInternal(step) && !legacyReview && step.needsAttention ? (
                <button type="button" className="btn btn-sm btn-primary" disabled={busy}
                  title="הלקוח סיים - בדיקה וסגירה"
                  onClick={() => void run(step, 'complete')}>בדוק וסגור</button>
              ) : null;
              const spouseConfirm = isSpouseConfirmTask(step);
              const spouseWho = spouseConfirm ? spouseWhoOf(step) : '';
              /* ‼ משימה פנימית נגמרת בכל מצב פתוח — גם כשהמשרד שם אותה בהמתנה (או כשהוסתרה מהדף
                 במצב «ממתין ללקוח»): בלי זה לא הייתה שום דרך לסיים אותה. */
              const internalTaskOpen = isManualInternal(step)
                && (step.status === 'pending' || step.status === 'in_progress' || step.status === 'waiting_client');
              const internalTaskWaiting = internalTaskOpen && step.status === 'waiting_client';
              const finishBtn = internalTaskOpen ? (
                <button type="button" className="btn btn-sm btn-primary" disabled={busy}
                  onClick={() => void run(step, 'complete')}>{spouseConfirm ? `התקבל האישור של ${spouseWho}` : 'סיימתי'}</button>
              ) : null;
              /* ‼ «פתח מחדש» אומר לאן הבקשה חוזרת: הכדור נשאר אצל מי שהחזיק אותו לפני החסימה
                 (advance 'reopen' משאיר את ball) — בקשה של הלקוח חוזרת אליו. */
              // ‼ «הלקוח סיים» (needsAttention) נשאר אצלך גם אחרי הפתיחה — שם זה «פתח מחדש».
              const backToOther = !step.needsAttention && !isManualInternal(step);
              const reopenLabel = backToOther && step.ball === 'client' ? `החזר ${lamed(clientFirst)}`
                : backToOther && step.ball === 'prev_accountant' ? 'החזר לרו״ח הקודם'
                : backToOther && step.ball === 'external' ? 'החזר לגורם החיצוני'
                : 'פתח מחדש';
              const reopenBtn = step.status === 'blocked' || step.status === 'failed' ? (
                <button type="button" className="btn btn-sm btn-secondary" disabled={busy}
                  onClick={() => void run(step, 'reopen')}>{reopenLabel}</button>
              ) : null;
              /* ‼ משטח מפושט: פעולה בשורה הסגורה רק כשהתור שלי (או בעיה). בקשה
                 שממתינה לאחר — בלי כפתור; «שלח תזכורת» וכדומה בפתיחה. */
              const myTurn = attn.kind === 'mine' || attn.tone === 'red';
              const genericPrimaryKey: 'ext' | 'review' | 'finish' | 'reopen' | 'hide' | null = !embedded || !myTurn ? null
                : externalSend && !extAlreadySent ? 'ext'
                : hideBtn ? 'hide'
                : reviewBtn ? 'review' : finishBtn ? 'finish' : reopenBtn ? 'reopen' : null;
              /* ‼ v3: בקשה שממתינה ללקוח אומרת מאז מתי היא בדף — לא "ממתין".
                 ‼ סבב 4: רק כשהיא באמת בדף (לא משימה פנימית ולא טיוטה).
                 ‼ 03.10: ורק כשהשער של הדף פתוח לה — בקשה של קליטה שטרם פורסמה
                 «ממתין לפרסום» (clientPageGate). */
              const pageSince = onClientPageSince(step, attn, isDraftStep(step), gateEngagements);
              const waitsPublish = awaitingPublishIds.has(step.id) && attn.kind === 'waiting'
                && (!attn.waitingOn || attn.waitingOn === 'client' || attn.waitingOn === 'spouse');
              return (
                <JourneyRow
                  key={step.id}
                  step={step}
                  stepById={stepById}
                  highlight={highlightStepId === step.id}
                  noteLine={contactNote ?? undefined}
                  unsent={unsent}
                  name={spouseConfirm ? spouseTaskName(rowTitle(step)) : partLabel ?? undefined}
                  /* ‼ בתוך הבקשה של בעל הכרטיס — הכותרת של ההורה כבר אומרת על מה האישור. */
                  nestedName={spouseConfirm ? `אישור אישי של ${spouseWho}` : undefined}
                  /* ‼ משימה ישנה בדף בלי מה למלא — המצב נשאר גלוי ליד «הסתר מהדף» (כתום: החלטה). */
                  state={legacyReview ? { text: 'בדף בלי מה למלא', tone: 'amber' } : undefined}
                  statusLabel={spouseConfirm && isStepOpen(step.status) && step.status !== 'locked'
                    ? 'אצלך — להשיג את האישור'
                    : legacyReview ? 'בדף בלי שום דבר למלא — להחליט'
                    /* ‼ משימה פנימית: המצב («פתוחה» / «בהמתנה») כבר בשורה — בפרטים רק מאז מתי. */
                    : internalTaskOpen ? ''
                    : waitsPublish ? 'ממתין לפרסום'
                    : pageSince
                    ? `בדף מ-${formatDate(pageSince, 'list')}`
                    : attn.kind === 'mine' && attn.tone === 'blue' && step.needsAttention && step.status === 'in_progress' && !isManualInternal(step)
                      ? `${clientFirstOrClient} סיים/ה — לבדיקה` : undefined}
                  primary={genericPrimaryKey === 'ext' ? externalSend
                    : genericPrimaryKey === 'hide' ? hideBtn
                    : genericPrimaryKey === 'review' ? reviewBtn
                    : genericPrimaryKey === 'finish' ? finishBtn
                    : genericPrimaryKey === 'reopen' ? reopenBtn : undefined}
                  menu={<>
                    {/* ‼ בבקשה לגורם חיצוני השליחה היא הפעולה — לא "התחל".
                        "התחל" על מייל שלא יצא הוא סימון עצמי שלא קרה כלום. */}
                    {genericPrimaryKey !== 'ext' && externalSend}
                    {genericPrimaryKey !== 'hide' && hideBtn}
                    {/* ‼ v3: אין «התחל» על בקשה ממתינה. הוא שינה pending→in_progress
                        בלבד — לא הודיע ללקוח, לא פתח תלות, לא שינה את הדף.
                        בקשה שממתינה לאחר נושאת רק ⋯ (ושם «סמן שהתקבל / בוצע»);
                        עבודה שלי מציגה את הפועל עצמו. */}
                    {genericPrimaryKey !== 'review' && reviewBtn}
                    {internalTaskOpen && (
                      <>
                        {genericPrimaryKey !== 'finish' && finishBtn}
                        {/* ‼ אישור אישי של בן/בת הזוג: «ממתין ללקוח» היה מעביר אותו לדף של
                            בעל הכרטיס — שיאשר במקום בן/בת הזוג (§9). במקומו: «אין צורך» —
                            ושואלים פעם אחת, כי הוא סוגר אישור שבעל הכרטיס לא יכול לתת. */}
                        {spouseConfirm ? (
                          <button type="button" className="btn btn-sm btn-secondary" disabled={busy}
                            onClick={() => {
                              setConfirmState({
                                stepId: step.id,
                                title: `אין צורך באישור של ${spouseWho}?`,
                                message: (isStepRequiredForClose(step) ? 'האישור נדרש לסגירת הקליטה. ' : '')
                                  + `«אין צורך» סוגר את «${spouseTaskName(rowTitle(step))}» בלי האישור של ${spouseWho} — וזה נרשם בהיסטוריה.`,
                                confirmLabel: 'אין צורך',
                                action: { name: 'skip', payload: { reason: 'not_applicable', note: 'אין צורך באישור האישי' } },
                              });
                            }}>
                            אין צורך
                          </button>
                        ) : internalTaskWaiting ? (
                          /* ‼ חזרה מהמתנה — המשימה שוב «פתוחה», אצלך (advance 'reopen' עם הכדור אצל המשרד). */
                          <button type="button" className="btn btn-sm btn-secondary" disabled={busy}
                            onClick={() => void run(step, 'reopen', { ball: 'me' })}>חזרה אליי</button>
                        ) : (
                          /* ‼ משימה פנימית לא נשלחת לאף אחד: «בהמתנה» רק אומר שמחכים למשהו מבחוץ. */
                          <button type="button" className="btn btn-sm btn-secondary" disabled={busy}
                            title="המשימה לא מופיעה בדף של הלקוח ושום דבר לא נשלח — רק מסמנים שמחכים למשהו"
                            onClick={() => void run(step, 'wait_client')}>העבר להמתנה</button>
                        )}
                      </>
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
                    {genericPrimaryKey !== 'reopen' && reopenBtn}

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
                  {/* ‼ מה חסר ואיך ממשיכים — השרת כתב את זה כשפתח את המשימה (215). */}
                  {spouseConfirm && typeof step.payload.officeNote === 'string' && (
                    <p className="cf-office-note">{step.payload.officeNote}</p>
                  )}
                  {/* ‼ 216 §9: נוצרה בלי ראיה שהיא משימה של המשרד — ולכן עדיין בדף. */}
                  {legacyReview && (
                    <p className="cf-office-note">
                      מופיעה בדף של {clientFirstOrClient} בלי שום דבר למלא או לאשר.
                      להסתיר מהדף, או לערוך ולהוסיף מה {clientFirstOrClient} צריך/ה לעשות?
                    </p>
                  )}
                  {/* ‼ חלק מבקשת ייצוג שאינה פתוחה — עומד לבדו, עם הדרך למרכז הייצוג. */}
                  {partContext && (
                    <p className="rl-part-context">
                      {partContext}
                      {onOpenRepresentation && (
                        <> · <button type="button" className="ui-linkbtn" onClick={onOpenRepresentation}>למרכז הייצוג ←</button></>
                      )}
                    </p>
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
          intake={intake}
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
  /** כותרת הפירוט לפי שורה («לפי רשות ואדם»); חסר ⇒ «שלבים בבקשה הזאת». */
  const nestedTitleMap = new Map<string, string>();
  /** סבב 4 — מצב השורה כולה כשהוא לא של החלק הראשי (נבנה ברינדור הרשימה). */
  const groupViewMap = new Map<string, GroupRowView>();

  /* «אצל מי» לכל שלב ממתין — משפט המצב של השורה מתחיל בו. מחליף את תת-הכותרות
     של הקבוצות («אצל שרון — בדף האישי», «אצל הרשות»…) שירדו. */
  const spouseFirstName = (client.spouseFirstName || client.spouseName || 'בן/בת הזוג').trim().split(/\s+/)[0];
  const WHO_LABEL: Record<WaitingOn, string> = {
    client: `אצל ${clientFirstOrClient}`,
    spouse: `אצל ${spouseFirstName}`,
    paperless: 'אצל פייפרלס',
    authority: 'אצל הרשות',
    prev_accountant: 'אצל הרו״ח הקודם',
    external: 'אצל גורם חיצוני',
    pivo: 'PIVO עובד',
    locked: '',
  };
  const attnByStep = new Map<string, Attention>();
  for (const s of clientSteps) if (isStepOpen(s.status)) attnByStep.set(s.id, attnOf(s));
  void WHO_LABEL;
  const HEAD_MENU = '__requests-head';
  const ownerLastSent = readyToSend.owner.lastSentAt;
  /* ── «עוד לא הגיע ללקוח» ─────────────────────────────────────────────────
     ‼ שני צעדים שונים, ולכן שתי פעולות — לא אחת:
       1. «פרסם בדף» — הבקשה מופיעה בדף האישי. לא נשלח מייל.
       2. «שלח מייל» — הלקוח (ובני המשפחה לב"ל) מקבלים מייל על מה שבדף.
     המילים כאן הן אותן מילים כמו בחלון הפרסום ובמגש השליחה. */
  /* ‼ שלב מסלול ב«הכול באישורך» שעוד נעול (השלב שלו לא נפתח) אינו טיוטה
     שאפשר לפרסם עכשיו — «פרסם בדף» היה מבטיח משהו שלא יקרה. הוא מופיע בפס
     המסלול כ«יחכה לאישורך כשייפתח», ונכנס לכאן כשהשלב נפתח. */
  /* ‼ משימה פנימית לא נכנסת כ«עוד לא בדף» — היא לעולם לא בדף (neverOnClientPage). עריכה,
     הסרה או סידור שממתינים לפרסום — כן: רק «פרסם בדף» מחיל אותם. */
  /* ‼ 03.10: וגם מה שפורסם בקליטה חדשה שטרם פורסמה (awaitingPublishIds) — «פרסם בדף» פותח
     את הקליטה (publish_case_changes). מה שעבר מההתקשרות הקודמת כבר בדף — לא כאן. */
  const unpublished = clientSteps.filter(s =>
    !(s.status === 'locked' && s.payload.delivery === 'hold')
    && ((!neverOnClientPage(s) && (s.publishedAt === null || s.payload.published === false)) || s.draftPayload
      || s.pendingCancel || s.pendingSortOrder != null || awaitingPublishIds.has(s.id)));
  // «בקשות» ולא «שינויים»: טיוטה, או בקשה של הקליטה שהלקוח עוד לא ראה.
  const unpublishedAllNew = unpublished.length > 0
    && unpublished.every(s => isDraftStep(s) || awaitingPublishIds.has(s.id));
  /* ‼ בלי שם פרטי — שם העסק (חברה); בלי שניהם — «הלקוח». ‼ «ל» + שם — רק דרך lamed(): «ללקוח», לא «להלקוח». */
  const firstName = clientFirstOrClient;
  /** אחרי כל פעולה בפס המסלול או במגש: הבקשות, «מה מוכן» והמסלולים — יחד. */
  const afterFlowAction = () => {
    refresh?.();
    setReadyTick(t => t + 1);
    void reloadReady();
    void reloadFlowRuns();
  };
  /* ── «הושלמו» — תהליך שהושלם מופיע פעם אחת (X-7) ───────────────────────────
     ‼ חלקי הייצוג של הבקשה הנוכחית: כשההורה פתוח הם בפירוט שלו («לפי רשות ואדם»); כשהוא נסגר
     — מקופלים לשורה שלו («ייצוג מול הרשויות · פעיל מ-… / ביטוח לאומי · שרון אושר …»). בלי זה
     אותו אישור הופיע עד שלוש פעמים על אותו מסך. */
  const foldedRepPart = (s: OnboardingStep) =>
    isRepresentationPart(s) && ofCurrentRequest(s) && (!!openRepParent || !!doneRepParent);
  const doneList = doneSteps.filter(s => !foldedRepPart(s));
  /** מה שמקופל לשורה של הייצוג שהושלם: החלקים שנסגרו, וב"ל של מי שאין לו שלב ואושר. */
  const repDoneExtras = (parent: OnboardingStep): string[] => {
    if (openRepParent || parent.id !== doneRepParent?.id) return [];
    const parts = doneSteps.filter(foldedRepPart)
      .map(s => `${representationPartLabel(s, partNames) ?? rowTitle(s)} ${donePartText(s)}`);
    const tracks = niTargetRoles.filter(r => !hasCurrentNiStep(r) && !!niExecution?.[r]?.confirmedAt)
      .map(r => `ביטוח לאומי · ${partNames[r]} אושר ${formatDate(String(niExecution?.[r]?.confirmedAt), 'list')}`);
    return [...parts, ...tracks];
  };
  /** ‼ B7 — לקוח שחוזר: בקשה שהושלמה בהתקשרות קודמת (או שעברה ממנה) — אומרת את זה, אחרת שתי
   *  «מסמכים מהלקוח · הושלם» נראות זהות. בקשה בלי התקשרות (ישנה) — בלי סימון. */
  const fromPrevEngagement = (s: OnboardingStep): boolean =>
    !!carriedFromLine(s) || (!!activeEngagement?.id && !!s.engagementId && s.engagementId !== activeEngagement.id);
  /** המונה — השורות שבאמת מוצגות (אבני הדרך והבקשות שהושלמו). */
  const doneCount = contextBits.length + doneList.length;
  /** «הוספת הערה» — השדה בתוך הבקשה הפתוחה. */
  const noteEditorNode = noteDraft ? (
    <div className="rl-note-edit">
      <textarea className="input rl-note-input" rows={2} autoFocus aria-label="הערה לבקשה"
        placeholder="ההערה נשמרת בהיסטוריה של הבקשה" value={noteDraft.text} disabled={noteDraft.busy}
        onChange={e => setNoteDraft(d => (d ? { ...d, text: e.target.value, error: undefined } : d))}
        onKeyDown={e => { if (e.key === 'Escape') setNoteDraft(null); }} />
      {noteDraft.error && <p className="rl-row-note is-err" role="alert">{noteDraft.error}</p>}
      <div className="rl-note-acts">
        <button type="button" className="btn btn-sm btn-primary" disabled={noteDraft.busy || !noteDraft.text.trim()}
          onClick={() => void saveNote()}>{noteDraft.busy ? 'שומר…' : 'שמירת ההערה'}</button>
        <button type="button" className="btn btn-sm btn-ghost" disabled={noteDraft.busy}
          onClick={() => setNoteDraft(null)}>ביטול</button>
      </div>
    </div>
  ) : null;

  return (
    <>
    <RowOpenContext.Provider value={{
      openId: openRowId,
      toggle: (id: string) => setOpenRowId(cur => (cur === id ? null : id)),
      depParents,
      depChildren,
      nestedByStep: nestedMap,
      requiredApplies,
      compact: !!embedded,
      attnByStep,
      firstNames: { client: clientFirst, spouse: spouseFirstName },
      editing,
      childOpenId: openChildId,
      toggleChild: (id: string) => setOpenChildId(cur => (cur === id ? null : id)),
      groupViewByStep: groupViewMap,
      nestedTitleByStep: nestedTitleMap,
      autoEmailUnknown,
      awaitingPublish: awaitingPublishIds,
      blockNotes: blockNoteByStep,
      rowNote,
      noteEditor: noteDraft ? { stepId: noteDraft.stepId, node: noteEditorNode } : null,
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

      {/* ── פס הפעולות של משטח הבקשות (סבב שני, 1.10.2026) ─────────────────────
          ‼ מעל הרשימה: «בקשה חדשה» ו«הדף של X» בלבד. השליחה והפרסום מופיעים
          רק כשיש מה לשלוח/לפרסם — בתיבה «עוד לא הגיע» שמתחת, ובשמות שאומרים
          מה קורה ללקוח. שאר הפעולות — בתפריט ⋯. */}
      {embedded && (
        <div className="rl-bar">
          <button type="button" className="btn btn-sm btn-secondary rl-new" onClick={() => setAddOpen(true)}>
            ＋ בקשה חדשה
          </button>
          {editing && (
            <button type="button" className="btn btn-sm btn-primary rl-editing" onClick={() => setEditing(false)}>
              סיום עריכה
            </button>
          )}
          {linkCopied && <span className="rl-flash" role="status">הקישור לדף הועתק ✓</span>}
          <span className="rl-bar-gap" />
          <button type="button" className="rl-link" onClick={() => { setSidebarPreviewMode('live'); setPreviewSheetOpen(true); }}
            title={`הדף האישי של ${firstName} — כפי שהוא רואה אותו עכשיו`}>
            הדף של {firstName}
          </button>
          <div className="ob-menu-wrap">
            <button type="button" className="rl-more" aria-haspopup="menu"
              aria-expanded={menuStepId === HEAD_MENU} aria-label="עוד פעולות"
              onClick={() => setMenuStepId(id => (id === HEAD_MENU ? null : HEAD_MENU))}>⋯</button>
            {menuStepId === HEAD_MENU && (
              <div className="ob-menu rl-head-menu" role="menu">
                <button type="button" role="menuitem" className="ob-menu-item" disabled={linkBusy}
                  onClick={() => { setMenuStepId(null); void copyPortalLink(); }}>
                  {linkBusy ? 'מכין קישור…' : 'העתקת הקישור לדף'}
                </button>
                {/* ‼ «שלח את הקישור שוב» — כשיש חדש, המגש (מייל על מה שחדש); כשאין,
                    מייל «עדכון» — הקישור ומצב, בלי לסמן כלום כחדש (214). */}
                <button type="button" role="menuitem" className="ob-menu-item"
                  onClick={() => {
                    setMenuStepId(null);
                    if (readyCount > 0) setSendRequestsFocus('owner'); else setPortalSend('update');
                  }}>
                  שליחת הקישור לדף במייל
                </button>
                <div className="ob-menu-sep" />
                {/* ‼ מחליף את «בקשה מתבנית»: מסלול מהמשרד, עם שלבים ומה קורה בכל אחד. */}
                <button type="button" role="menuitem" className="ob-menu-item"
                  onClick={() => { setMenuStepId(null); setStartFlow({}); }}>
                  הפעלת מסלול
                </button>
                {/* ‼ מצב העריכה הוא הדרך אל דלג/חסום/סידור/תבניות לכל בקשה. */}
                <button type="button" role="menuitem" className="ob-menu-item"
                  onClick={() => { setMenuStepId(null); setEditing(v => !v); }}>
                  {editing ? 'סיום עריכה' : 'עריכת הבקשות'}
                </button>
                {onOpenRepresentation && (
                  <button type="button" role="menuitem" className="ob-menu-item"
                    onClick={() => { setMenuStepId(null); onOpenRepresentation(); }}>
                    למרכז הייצוג
                  </button>
                )}
                {/* ‼ סגירת קליטה היא החלטה ולא תוצר לוואי — השרת בודק ואומר מה חסר. */}
                {activeEngagement?.status === 'onboarding' && (
                  <button type="button" role="menuitem" className="ob-menu-item" disabled={closing}
                    onClick={() => { setMenuStepId(null); void closeOnboarding(false); }}
                    title="מעביר את הלקוח לשוטף - אחרי בדיקת התנאים">
                    {closing ? 'סוגר…' : 'סגירת הקליטה'}
                  </button>
                )}
                <div className="ob-menu-sep" />
                {/* ‼ המשפט שמסביר את המודל — כאן, למי שתוהה, ולא על המסך. */}
                <div className="rl-menu-note">
                  <div>כל מה שמבקשים מ{firstName} מופיע בדף האישי שלו/ה — קישור קבוע אחד.</div>
                  <div>{ownerLastSent ? `מייל אחרון נשלח ${formatDate(ownerLastSent, 'list')}` : 'עוד לא נשלח מייל מ-PIVO'}</div>
                </div>
              </div>
            )}
          </div>
        </div>
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
            {/* ‼ 217: בקשות שמחכות לסוג העוסק עוד לא נוצרו — ולכן הן לא ברשימה. הסיבה
                שחוסמת היא סוג העוסק, והקישור מוביל לשדה עצמו. */}
            {closeGate.kindHold && (
              <li>
                {closeGate.kindHold.failedAt
                  ? 'הבקשות שחיכו לסוג העוסק לא נפתחו'
                  : closeGate.kindHold.count === 1 ? 'סוג העוסק — בקשה אחת מחכה לו'
                  : closeGate.kindHold.count > 1 ? `סוג העוסק — ${closeGate.kindHold.count} בקשות מחכות לו`
                  : 'סוג העוסק'}
                {onOpenTaxFile && (
                  <>
                    {' · '}
                    <button type="button" className="ui-linkbtn"
                      onClick={() => { setCloseGate(null); onOpenTaxFile('dealerType'); }}>
                      {closeGate.kindHold.failedAt ? 'לפתוח אותן בתיק המס' : 'לקביעת סוג העוסק'}
                    </button>
                  </>
                )}
              </li>
            )}
            {closeGate.blocking.map(s => <li key={s.id}>{rowTitle(s)}</li>)}
            {/* השרת חסם, והמסך לא רואה מה — משהו השתנה בינתיים. */}
            {!closeGate.kindHold && closeGate.blocking.length === 0 && <li>משהו השתנה בינתיים — רעננו ונסו שוב</li>}
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
              {closeGate.blocking.length > 0 ? `סגור בכל זאת · ${closeGate.blocking.length} נדרשים יישארו פתוחים` : 'סגור בכל זאת'}
            </button>
          </div>
        </Modal>
      )}

      {loading && clientSteps.length === 0 && <div className="cw-empty">טוען…</div>}

      {/* ── משטח הבקשות (1.10.2026) ─────────────────────────────────────────
          ‼ רשימה אחת: מה שמחכה לי קודם, אחריו מה שאצל אחרים, ובסוף מה שעוד
          נעול. בלי כותרות קבוצה, בלי מונים ובלי עמודת תצוגה קבועה — «אצל מי»
          נאמר בשורה עצמה, והתצוגה נפתחת במגירה. עבודה פנימית והיסטוריה —
          מקופלות בתחתית. כל הכרטיסים, הפעולות והחלונות הקודמים נשארו. */}
      {embedded && (
      <div className="rl">

      {/* ── «עוד לא הגיע ל…» — המגש: מה מחכה לך עכשיו. מופיע רק כשיש בו משהו ──
          ‼ סבב 3: הבקשות קודם — המגש מיד מתחת לפס הפעולות, והמסלולים בשורה
          קומפקטית מתחת לרשימה. שני צעדים ממוספרים (רק כששניהם קיימים), כל אחד
          עם הפועל שלו: «פרסם בדף» (לא נשלח כלום) ו«שלח מייל» (נשלח, אחרי סקירה).
          ומתחתם מצבי המיילים ומסלול בעצירה. */}
      <NoticeTray
        clientId={clientId}
        firstName={firstName}
        ready={readyToSend}
        unpublished={unpublished}
        unpublishedAllNew={unpublishedAllNew}
        awaitingQuoteApproval={awaitingQuoteApproval}
        titleOf={shortTitle}
        discarding={discarding}
        onPublish={() => { setPendingCount(unpublished.length); setPendingNames(unpublished.map(shortTitle)); setPublishPromptOpen(true); }}
        onPreviewPage={() => { setSidebarPreviewMode('preview'); setPreviewSheetOpen(true); }}
        onDiscard={() => void discardChanges()}
        onSend={focus => setSendRequestsFocus(focus)}
        onRemind={() => setPortalSend('reminder')}
        onChanged={afterFlowAction}
        paused={flowRuns.filter(r => r.status === 'paused').map(r => ({
          runId: r.id,
          name: runTitle(r),
          stepIds: clientSteps.filter(s => s.flowRunId === r.id).map(s => s.id),
        }))}
        onOpenFlow={runId => setFlowFocus(f => ({ runId, n: (f?.n ?? 0) + 1 }))}
        /* ‼ 217: בקשות שמחכות לסוג העוסק — של הקליטה הנוכחית (engagement.kindHold,
           engagementFromDb ⇒ parseKindHold). אין עותק שני כאן. */
        kindHold={activeEngagement?.kindHold ?? null}
        onOpenKindField={onOpenTaxFile ? () => onOpenTaxFile('dealerType') : undefined}
      />

      {/* ‼ תבנית שנבחרה נפתחת כעותק לעריכה בראש הרשימה — מה שנשלח הוא מה שערכת. */}
      {templateDraft && (
        <InlineComposer
          clientId={clientId}
          intake={intake}
          initialContent={firstEntry(templateDraft)?.payload}
          /* ‼ מי יבצע — אותו כלל כמו בשרת (templateEntryOwner), לא רק מה שנשמר בתבנית. */
          initialOwner={templateEntryOwner(firstEntry(templateDraft))}
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
      )}

      {(() => {
        const openVisible = visibleSteps.filter(s => isStepOpen(s.status));
        /* ‼ משימה פנימית יורדת מהרשימה ועולה ב«עבודה פנימית» — אחרת היא נקראת
           כבקשה מהלקוח. */
        /* ‼ סבב 3: משימת משרד שנפתחה במקום אישור אישי של בן/בת הזוג היא חלק
           מבקשה של הלקוח — ברשימה הראשית, לא מקופלת ב«עבודה פנימית».
           ‼ סבב 4: וגם «לא נוצרה» — בעיה של המשרד, באדום ברשימה הראשית. */
        const manualInternal = openVisible.filter(s => isManualInternalTask(s) && !isSpouseConfirmTask(s) && !isCreationProblem(s));
        /* ‼ סבב 4: «ייצוג מול הרשויות» הוא תהליך אחד — ב"ל לכל אדם וצילום התעודה
           לשע״ם של אותה בקשת ייצוג יורדים לתוכו (clientFacingRows). */
        const clientRows = buildClientFacingRows(
          [...openVisible, ...releaseAnchor].filter(s => !isManualInternalTask(s) || isSpouseConfirmTask(s) || isCreationProblem(s)),
          depParents, { representationRequestId: client.representationRequestId ?? null });
        const alignSteps = clientSteps.filter(s => s.stepType.startsWith('institution_alignment_'));

        /** שורה אחת עם נקודת המצב: כחול = יש מה ללחוץ עכשיו · אדום = בעיה · אפור = אצל אחרים. */
        const flowItem = (step: OnboardingStep, body: React.ReactNode, attn: Attention = attnOf(step)) => (
          <div
            key={step.id}
            className={[
              'rl-item',
              attn.kind === 'mine' && attn.tone === 'red' ? 'is-red'
                : attn.kind === 'mine' ? 'is-mine'
                  : attn.waitingOn === 'locked' || step.status === 'locked' ? 'is-locked' : 'is-wait',
            ].join(' ')}
          >
            <span className="rl-dot" aria-hidden="true" />
            {body}
          </div>
        );

        /* ── «לפי רשות ואדם» — הפירוט בתוך «ייצוג מול הרשויות» ─────────────────
           ‼ כל חלק שומר את המצב, שורת ה-PIVO, שער הפרטים, «בדוק קבלת הייצוג»,
           «שלח שוב» ו«מחיקת/ביטול הבקשה» שלו. חלק בלי שלב (קליטה ראשונה — ב"ל חי
           רק במרכז הייצוג) — שורת קריאה בלבד. מה שהושלם — אפור. */
        const renderRepBreakdown = (row: ClientFacingRow): React.ReactNode | null => {
          const parent = row.primary;
          const parts = row.members.filter(m => m.id !== parent.id);
          const act = repStatus ? representationAction(repStatus, repSendPhase) : null;
          // לפני השליחה בלבד: אחריה המצב הוא של הלקוח/הרשויות, והשורה האחת אומרת אותו.
          const shaamPrepRows = repFacts && repFacts.shaam.length > 0 && !approvalActive
            && (repStatus === 'awaiting_accountant' || (repStatus === 'pending_signature' && !!repSendPhase))
            ? repFacts.shaam : null;
          /* ‼ ב"ל בלי שלב — רק מי שברשימת ביטוח לאומי (niTrackOnlyRoles). מי שבוטל — שורה אפורה עם
             מה שקרה («הבקשה בוטלה ב-PIVO · …»), לא «ממתין לאישור» מתוך ההיסטוריה של המסלול. */
          const niLines = niTrackOnlyRoles
            .map(r => ({ r, text: niTrackLine(niExecution?.[r], partNames[r], { ridesWithSignature: niWithSignature }), send: niSendWithoutStep.includes(r) }))
            .filter((x): x is { r: 'client' | 'spouse'; text: string; send: boolean } => !!x.text);
          const cancelledLines = niCancelledRoles
            .map(r => ({ r, text: niCancelledText(client.authorityRepresentations, r) ?? '' }))
            .filter(x => !!x.text);
          const doneParts = clientSteps.filter(s => isRepresentationPart(s) && ofCurrentRequest(s)
            && (s.status === 'completed' || s.status === 'verified' || s.status === 'skipped'));
          if (parts.length === 0 && niLines.length === 0 && doneParts.length === 0 && cancelledLines.length === 0
              && !approvalActive) return null;
          repBreakdownIds.add(parent.id);
          return (
            <>
              {/* ‼ 04.10.2026 · לפני השליחה — שורה לכל הגשה בשע״ם (אדם + רשויות), מאותן עובדות
                  כמו במרכז הייצוג. אחרי השליחה / בלי עובדות — השורה האחת של משק הבית, כמו קודם. */}
              {shaamPrepRows ? shaamPrepRows.map(f => (
                <div key={`shaam-${f.key}`} className="rl-part" data-testid="rl-shaam-part">
                  <span className="rl-part-name">רשות המסים · {shaamPrepRows.length > 1 ? `${f.personName} · ` : ''}{f.authoritiesLabel}</span>
                  <span className="rl-part-state">{shaamPrepLine(f)}</span>
                </div>
              )) : (
              <div className="rl-part">
                <span className="rl-part-name">{taxAuthorityScopeLine(client.authorityRepresentations as Record<string, { status?: string } | undefined> | undefined)}</span>
                {/* ‼ (H2) שע״ם ממתינה לאישור באזור האישי — זה מה שמחזיק עכשיו, לא «ממתין לאישור הרשויות». */}
                <span className="rl-part-state">{approvalActive ? approvalNeedText : act ? act.action : (repStatusLabel ?? stepStatusLabel(parent))}</span>
                {approvalActive && (
                  <RepApprovalGuideButton onClick={() => setApprovalGuideOpen(true)} className="rl-part-guide" />
                )}
              </div>
              )}
              {parts.map(p => renderStep(p))}
              {niLines.map(x => (
                <div key={`ni-${x.r}`} className="rl-part">
                  <span className="rl-part-name">ביטוח לאומי · {partNames[x.r]}</span>
                  <span className="rl-part-state">{x.text}</span>
                  {/* ‼ האסמכתא כאן וההוראות לא יצאו — הפעולה בשורה של האדם, לא רק במגש. */}
                  {x.send && (
                    <button type="button" className="btn btn-sm btn-primary rl-part-btn"
                      onClick={() => setSendRequestsFocus(`ni:${x.r}`)}>שלח הוראות</button>
                  )}
                </div>
              ))}
              {cancelledLines.map(x => (
                <div key={`ni-cancelled-${x.r}`} className="rl-part is-done">
                  <span className="rl-part-name">ביטוח לאומי · {partNames[x.r]}</span>
                  <span className="rl-part-state">{x.text}</span>
                </div>
              ))}
              {doneParts.map(s => (
                <div key={s.id} className="rl-part is-done">
                  <span className="rl-part-name">{representationPartLabel(s, partNames) ?? rowTitle(s)}</span>
                  <span className="rl-part-state">{donePartText(s)}</span>
                </div>
              ))}
              {onOpenRepresentation && (
                <button type="button" className="ui-linkbtn rl-part-center" onClick={onOpenRepresentation}>למרכז הייצוג ←</button>
              )}
            </>
          );
        };

        /* ‼ שרשרת-מושג נשארת שורה אחת: החבר הפעיל הוא השורה, ושאר החברים
           יורדים לתוכה כשורות-המשך מוזחות. */
        const renderRow = (row: ClientFacingRow): React.ReactNode => {
          if (row.kind === 'representation') {
            const breakdown = renderRepBreakdown(row);
            const nestedNodes = [
              breakdown ? <Fragment key="rep-breakdown">{breakdown}</Fragment> : null,
              ...row.children.map(c => renderRow(c)),
            ].filter(Boolean);
            if (nestedNodes.length) nestedMap.set(row.primary.id, <>{nestedNodes}</>);
            if (breakdown) nestedTitleMap.set(row.primary.id, 'לפי רשות ואדם');
            return renderStep(row.primary);
          }
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

        /* ── מצב השורה כולה (סבב 4) ────────────────────────────────────────────
           ‼ שורה שמקבצת כמה חלקים מציגה את החלק הדחוף ביותר שדורש אותך — מצבו,
           שמו מתחת לשם השורה, והכפתור שלו. אף פעולה נדרשת לא נבלעת בתוך שורה
           שמצבה של החלק הראשי בלבד. אותו מצב קובע נקודה, סדר, ספירה במסלול ותג. */
        const leadState = (lead: OnboardingStep): RowState => {
          const a = attnOf(lead);
          if (lead.stepType === 'authority_representation') {
            const m = authRepModelFor(lead);
            if (m.state) return m.state;
          }
          if (isRepresentationUpgrade(lead)) {
            const u = upgradeRowState(lead);
            if (u) return u;
          }
          return rowStateFor({ kind: 'mine', tone: a.tone === 'red' ? 'red' : 'blue', status: lead.status, needsAttention: lead.needsAttention });
        };
        /**
         * הכפתור בשורה הסגורה — הפעולה של החלק עצמו, כמו בשורה שלו. navOnly = הכפתור רק פותח את
         * החלק (אין לו פעולה אחת) — ואז המצב נשאר גלוי לידו, כדי שיהיה ברור מה צריך.
         */
        const leadAction = (lead: OnboardingStep): { node: React.ReactNode; navOnly?: boolean } => {
          const open = {
            node: <button type="button" className="btn btn-sm btn-primary" onClick={() => focusStep(lead.id)}>פתח</button>,
            navOnly: true,
          };
          if (lead.stepType === 'authority_representation') {
            const m = authRepModelFor(lead);
            const role = lead.payload?.subjectRole === 'spouse' ? 'spouse' : 'client';
            if (m.primary?.kind === 'gate') return { node: (
              <button type="button" className="btn btn-sm btn-primary" onClick={() => focusStep(lead.id)}>השלמת פרטים</button>) };
            if (m.primary?.kind === 'send') return { node: (
              <button type="button" className="btn btn-sm btn-primary" onClick={() => setSendRequestsFocus(`ni:${role}`)}>שלח הוראות</button>) };
            if (m.primary?.kind === 'enter') return { node: (
              <NiNextActionButton client={client} spouseClient={spouseClient} role={role}
                action={{ kind: 'enter_btl', label: m.primary.label }} track={niExecution?.[role]}
                onChanged={() => { void onNiInstructionsSent?.(); refresh?.(); setReadyTick(t => t + 1); }}
                className="btn btn-sm" errorClassName="ob-pivo-line is-stuck" />) };
            return open;
          }
          // ‼ האישור האישי — בשמו של מי שאישר; אותו כפתור כמו בשורה של המשימה עצמה.
          if (isSpouseConfirmTask(lead) && (lead.status === 'pending' || lead.status === 'in_progress')) return { node: (
            <button type="button" className="btn btn-sm btn-primary" disabled={busyStepId === lead.id}
              onClick={() => void run(lead, 'complete')}>{`התקבל האישור של ${spouseWhoOf(lead)}`}</button>) };
          // ‼ הלקוח סיים חלק — «בדוק וסגור», בדיוק כמו בשורה של החלק עצמו.
          if (needsReview(lead)) return { node: (
            <button type="button" className="btn btn-sm btn-primary" disabled={busyStepId === lead.id}
              title={`${clientFirstOrClient} סיים/ה — בדיקה וסגירה`}
              onClick={() => void run(lead, 'complete')}>בדוק וסגור</button>) };
          return open;
        };
        const leadLabel = (lead: OnboardingStep): string =>
          representationPartLabel(lead, partNames)
          // ‼ בתוך הבקשה של בעל הכרטיס — «אישור אישי של רותם»; שם הבקשה כבר בשורה.
          ?? (isSpouseConfirmTask(lead) ? `אישור אישי של ${spouseWhoOf(lead)}` : splitRequestTitle(rowTitle(lead)).name);
        const sumByTop = new Map<string, RowSummary>();
        const summarize = (row: ClientFacingRow): RowSummary => {
          const sum = rowSummary(row, attnCtx);
          sumByTop.set(row.primary.id, sum);
          const isRep = row.kind === 'representation';
          /* ‼ (H2) אישור הייצוג באזור האישי נדרש — הוא מה שמחזיק את הייצוג עכשיו: «ממתין ל{מי}»,
             ומתחת לשם — מה בדיוק. כשחלק אחר דורש אותך, הוא קודם (הפירוט אומר את שניהם). */
          if (isRep && approvalActive && sum.attn.kind !== 'mine') {
            groupViewMap.set(row.primary.id, { state: { text: approvalWaitText, tone: 'gray' }, sub: approvalNeedText });
            return sum;
          }
          /* ‼ (F2c) אדם בלי שלב שההוראות שלו מחכות — חלק שדורש אותך גם בלי שלב. */
          const virtual = isRep ? niSendWithoutStep : [];
          const virtualLabel = (r: 'client' | 'spouse') => `ביטוח לאומי · ${partNames[r]}`;
          if (!sum.lead && virtual.length > 0) {
            const [first, ...restV] = virtual;
            groupViewMap.set(row.primary.id, {
              /* ‼ המצב של החלק שדורש אותך — לא «ממתין ל{שם}» של ההורה ליד «שלח הוראות». */
              state: { text: MINE_STATE_TEXT, tone: 'blue' },
              sub: [virtualLabel(first), moreMineLabel(restV.map(r => ({ label: virtualLabel(r) })))].filter(Boolean).join(' · '),
              primary: (
                <button type="button" className="btn btn-sm btn-primary" onClick={() => setSendRequestsFocus(`ni:${first}`)}>
                  שלח הוראות
                </button>
              ),
            });
            return sum;
          }
          if (!rowNeedsGroupState(row, sum) && virtual.length === 0) return sum;
          const lead = sum.lead;
          /* ‼ «ועוד: ביטוח לאומי · לקוח12 — חסרים פרטים» — החלק הנוסף בשמו, לא «ועוד 1 לטיפולך». */
          const more = lead ? moreMineLabel([
            ...sum.openParts.filter(s => s.id !== lead.id && attnOf(s).kind === 'mine')
              .map(s => ({ label: leadLabel(s), state: leadState(s).text })),
            ...virtual.map(r => ({ label: virtualLabel(r), state: 'ההוראות לא נשלחו' })),
          ]) : null;
          if (lead && lead.id === row.primary.id && isStepOpen(row.primary.status)) {
            if (more) groupViewMap.set(row.primary.id, { sub: more });
          } else if (lead) {
            const a = leadAction(lead);
            const ls = leadState(lead);
            groupViewMap.set(row.primary.id, {
              /* ‼ (F2b) הכפתור רק פותח את החלק — אז המצב אומר מה לעשות בו, לא «לטיפולך» הכללי. */
              state: a.navOnly && ls.text === MINE_STATE_TEXT ? { ...ls, text: nextActionText(lead) } : ls,
              sub: [leadLabel(lead), more].filter(Boolean).join(' · '),
              primary: a.node,
              navOnly: a.navOnly,
            });
          } else {
            groupViewMap.set(row.primary.id, { state: groupWaitingState(sum.waitingOn, sum.allLocked, partNames) });
          }
          return sum;
        };

        type Placed = { key: string; step: OnboardingStep; attn: Attention; node: React.ReactNode };
        const placed: Placed[] = clientRows.map(row => {
          const sum = summarize(row);
          return { key: row.primary.id, step: row.primary, attn: sum.attn, node: renderRow(row) };
        });
        /* סדר אחד: דורש טיפול (אדום) → לטיפולי → אצל אחרים → נעול. בתוך כל
           דרגה — הסדר שנקבע לבקשות (sort_order), כמו קודם. */
        const rank = (p: Placed) => p.attn.kind === 'mine' ? (p.attn.tone === 'red' ? 0 : 1)
          : p.attn.waitingOn === 'locked' ? 3 : 2;
        const ordered = placed.map((p, i) => ({ p, i }))
          .sort((a, b) => rank(a.p) - rank(b.p) || a.i - b.i).map(x => x.p);
        /* ‼ «2 ממתינים לדוד» בשורת המסלול נספר לפי השורות שכאן: תהליך מקופל הוא שורה
           אחת, ומצבו — של השורה כולה (summarizeRow), בדיוק מה שהשורה מציגה. */
        const rowTop = new Map<string, OnboardingStep>();
        const markRow = (row: ClientFacingRow, top: OnboardingStep) => {
          rowTop.set(row.primary.id, top);
          for (const m of row.members) rowTop.set(m.id, top);
          for (const c of row.children) markRow(c, top);
        };
        for (const row of clientRows) markRow(row, row.primary);
        rowTopRef.current = new Map([...rowTop].map(([id, top]) => [id, top.id]));
        const flowBucket = (row: OnboardingStep): RowBucket => {
          const sum = sumByTop.get(row.id);
          const a = sum ? sum.attn : isStepOpen(row.status) ? attnOf(row) : null;
          if (!a || a.kind === 'done') return null;
          // ‼ 03.10: בקשה של קליטה שטרם פורסמה — כמו טיוטה: «מחכה לאישורך», לא «ממתין ל{שם}».
          if (isStepOpen(row.status) && row.status !== 'locked'
              && (isDraftStep(row) || awaitingPublishIds.has(row.id))) return 'draft';
          if (a.kind === 'mine') return 'office';
          if (a.kind !== 'waiting' || a.waitingOn === 'locked' || a.waitingOn === 'pivo') return null;
          return !a.waitingOn || a.waitingOn === 'client' || a.waitingOn === 'spouse' ? 'client' : 'external';
        };

        const internalHot = manualInternal.some(s => attnOf(s).tone === 'red');
        const internalOpen = internalOpenPref ?? internalHot;
        const setInternalOpen = (v: boolean) => {
          setInternalOpenPref(v);
          try { window.localStorage.setItem('pivo.requests.internalOpen', v ? '1' : '0'); } catch { /* נוחות בלבד */ }
        };
        const alignOpen = openRowId === '__align';

        return (
          <>
            {/* ‼ תוצאה של פעולה שהשורה שלה נסגרה בלי שורה במקומה («צור שוב» ⇒ «כבר קיימת»). */}
            {listNote && (
              <p className={`rl-list-note${listNote.err ? ' is-err' : ''}`} role="status">
                {listNote.text}
                <button type="button" className="rl-link-s" onClick={() => setListNote(null)} aria-label="סגירת ההודעה">✕</button>
              </p>
            )}
            <div className="rl-list">
              {/* ‼ ידוע שיש רו״ח קודם ואין מסלול — פותחים את אותו מסלול בדיוק
                  (create_onboarding_request). החלטה של המשרד ⇒ בראש הרשימה. */}
              {needsPrevTrack && (
                <div className="rl-item is-mine">
                  <span className="rl-dot" aria-hidden="true" />
                  <div className="rl-row">
                    <div className="rl-line">
                      <div className="rl-hit is-static"
                        title={prevAccountant?.name
                          ? `${prevAccountant.name} רשום בכרטיס - עוד לא נפתח מסלול העברה`
                          : 'רשום שהלקוח הגיע מרו״ח אחר - עוד לא נפתח מסלול העברה'}>
                        <span className="rl-name">העברה מרו״ח קודם</span>
                        <span className="rl-state is-blue">עוד לא נפתחה</span>
                      </div>
                      <div className="rl-act">
                        <button type="button" className="btn btn-sm btn-primary" disabled={prevTrackBusy}
                          onClick={() => void openPrevAccountantTrack()}>
                          {prevTrackBusy ? 'פותח…' : 'פתח'}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
              {ordered.map(p => flowItem(p.step, p.node, p.attn))}
              {ordered.length === 0 && !needsPrevTrack && !loading && (
                <div className="rl-empty">
                  אין בקשות פתוחות.{' '}
                  <button type="button" className="ui-linkbtn" onClick={() => setAddOpen(true)}>＋ בקשה חדשה</button>
                </div>
              )}
            </div>

            {/* ── המסלולים שרצים אצל הלקוח — שורה לכל ריצה, מתחת לבקשות ─────────
                ‼ «איפה אנחנו ומה הבא». עצירה, גרסאות, הצעות וצירוף בקשה לשלב —
                בפתיחת השורה, לא מעל העבודה היומיומית. */}
            <ClientFlowStrip
              clientId={clientId}
              firstName={firstName}
              runs={flowRuns}
              loading={flowRunsLoading}
              steps={clientSteps}
              onboardingOpen={activeEngagement?.status === 'onboarding'}
              advance={advance}
              onChanged={afterFlowAction}
              onOpenTaxFile={onOpenTaxFile ? () => onOpenTaxFile() : undefined}
              /* אותו יעד כמו «לקביעת סוג העוסק» במגש: תיק המס, «פרטי הנישום», על השדה. */
              onOpenKindField={onOpenTaxFile ? () => onOpenTaxFile('dealerType') : undefined}
              focus={flowFocus}
              rowOf={s => rowTop.get(s.id) ?? s}
              bucketOf={flowBucket}
            />

            {/* ── עבודה פנימית — מקופלת ───────────────────────────────────
                ‼ שני דברים בלבד (הכרעת גיא): «יישור קו ללקוח» ומשימות שהרו"ח
                הוסיף. לא מופיעים בדף הלקוח. */}
            <section className="rl-fold">
              <button type="button" className="rl-fold-head" aria-expanded={internalOpen}
                onClick={() => setInternalOpen(!internalOpen)}>
                <span className="rl-fold-title">עבודה פנימית</span>
                <span className="rl-fold-cnt">{1 + manualInternal.length}</span>
                <span className="rl-fold-hint">לא מופיע בדף הלקוח</span>
                <svg className="rl-fold-chev" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9" /></svg>
              </button>
              {internalOpen && (
                <div className="rl-fold-body">
                  <div className={`rl-item ${alignSteps.length > 0 && !alignDone ? 'is-mine' : 'is-wait'}`}>
                    <span className="rl-dot" aria-hidden="true" />
                    <div className={`rl-row${alignOpen ? ' is-open' : ''}`}>
                      <div className="rl-line">
                        <button type="button" className="rl-hit" aria-expanded={alignOpen}
                          onClick={() => setOpenRowId(cur => (cur === '__align' ? null : '__align'))}>
                          <span className="rl-name">יישור קו ללקוח</span>
                          <span className={`rl-state${alignSteps.length > 0 && !alignDone ? ' is-blue' : ''}`}>
                            {alignSteps.length === 0 ? 'טרם התחיל' : alignDone ? 'הושלם' : 'בתהליך'}
                          </span>
                        </button>
                        <div className="rl-act">
                          {(alignSteps.length === 0 || alignDone) && (
                            <button type="button" className="btn btn-sm btn-secondary" disabled={alignBusy}
                              onClick={() => void startOrRerunAlignment(alignSteps)}>
                              {alignBusy ? 'מעדכן…' : alignSteps.length === 0 ? 'התחל יישור קו' : 'בצע מחדש'}
                            </button>
                          )}
                        </div>
                        <button type="button" className="rl-chev" aria-expanded={alignOpen}
                          aria-label={alignOpen ? 'סגירת הפרטים' : 'פתיחת הפרטים'}
                          onClick={() => setOpenRowId(cur => (cur === '__align' ? null : '__align'))}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9" /></svg>
                        </button>
                      </div>
                      {alignOpen && (
                        <div className="rl-body ob-auth-body">
                          <div className="rl-facts">
                            {alignSteps.length === 0
                              ? 'ביטוח לאומי, מע״מ ומס הכנסה - לאן להיכנס, מה להעתיק, מה חריג'
                              : alignDone
                                ? `הושלם${alignSteps[0]?.payload.checkedAt ? ' · נבדק לאחרונה ' + formatDate(String(alignSteps[0].payload.checkedAt), 'list') : ''}`
                                : 'בתהליך - נכנסים לכל רשות ומיישרים קו'}
                          </div>
                          {/* ‼ אותה תצוגה קומפקטית של תיק המס (AuthoritiesPanel) —
                              רכיב אחד, לא עותק. «תצוגה מפורטת» פותחת את מסך הרשות. */}
                          <AuthoritiesPanel
                            client={client}
                            spouseClient={spouseClient}
                            niExecution={niExecution}
                            alignedAt={alignSteps.map(s => String(s.payload.checkedAt ?? '')).filter(Boolean).sort().pop() || undefined}
                            onClientPersisted={onClientPersisted}
                            onFactsChanged={() => refresh?.()}
                            onOpenSpouseClient={onOpenSpouseClient}
                            onOpenRepresentation={onOpenRepresentation}
                            onAddNiTarget={onRequestAuthorityRepresentation}
                            onSendNiInstructions={t => setSendRequestsFocus(`ni:${t.role}`)}
                            hideRepresentationPlaceholder
                            hideNiRepresentationActions
                            onNiInstructionsSent={onNiInstructionsSent}
                            onOpenDetailed={openDetailedFor}
                            emptyState={(
                              <div className="ob-auth-empty">
                                עוד אין נתונים מהרשויות על הלקוח — «התחל» פותח את יישור הקו.
                              </div>
                            )}
                          />
                          {alignDone && onOpenTaxFile && (
                            <button type="button" className="ui-linkbtn" style={{ marginTop: 8 }}
                              onClick={() => onOpenTaxFile()}>לתיק המס ←</button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {manualInternal.map(s => flowItem(s, renderStep(s)))}

                  {/* ‼ משימה פנימית — נוצרת ידנית, ולעולם לא מופיעה בדף הלקוח. */}
                  {internalComposerOpen ? (
                    <InlineComposer
                      clientId={clientId}
                      intake={intake}
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
                    <button type="button" className="rl-add-quiet"
                      onClick={() => setInternalComposerOpen(true)}>
                      ＋ משימה פנימית
                    </button>
                  )}
                </div>
              )}
            </section>
          </>
        );
      })()}

      {/* ── הושלמו — מקופל, בתחתית ──────────────────────────────────────────
          ‼ «הושלם» אינו מצב לנהל. ההקשר (הצעה שאושרה, ייצוג פעיל, ב"ל שאושר)
          שישב ברצועה מעל הבקשות — כאן, בראש ההיסטוריה. דילוג נשאר מובחן. */}
      {doneCount > 0 && (
        <section className="rl-fold">
          <button type="button" className="rl-fold-head" aria-expanded={showDone}
            onClick={() => setShowDone(v => !v)}>
            <span className="rl-fold-title">הושלמו</span>
            <span className="rl-fold-cnt">{doneCount}</span>
            <svg className="rl-fold-chev" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9" /></svg>
          </button>
          {showDone && (
            <div className="rl-fold-body">
              {contextBits.length > 0 && (
                <div className="rl-context">
                  {contextBits.map(b => <div key={b}><span className="rl-ok" aria-hidden="true">✓</span> {b}</div>)}
                </div>
              )}
              {doneList.map(s => {
                const skipped = s.status === 'skipped';
                const isRep = s.stepType === 'representation';
                /* ‼ חלק של הייצוג — בשם הקצר והנוכחי («ביטוח לאומי · שרון»), לא בכותרת ששמורה על השלב. */
                const partLabel = representationPartLabel(s, partNames);
                const extras = isRep ? repDoneExtras(s) : [];
                return (
                  <div key={s.id} className="rl-done">
                    <span className="rl-done-mark" aria-hidden="true">{skipped ? '↷' : '✓'}</span>
                    <span className="rl-done-title">
                      {partLabel ?? rowTitle(s)}
                      {extras.length > 0 && <span className="rl-done-sub">{extras.join(' · ')}</span>}
                    </span>
                    <span className="rl-done-state">
                      {skipped ? skippedLabel(s.payload) : isRep ? doneRepState(s) : partLabel ? donePartText(s) : stepStatusLabel(s)}
                      {fromPrevEngagement(s) && ' · מההתקשרות הקודמת'}
                    </span>
                    {/* ‼ הדרך היחידה לבטל אישור הרשמה שגוי. */}
                    {s.stepType === 'paperless_invite' && (
                      <button type="button" className="btn btn-sm btn-ghost"
                        disabled={busyStepId === s.id}
                        title="הלקוח אישר שנרשם, אבל בפועל לא - השלב חוזר אליו"
                        onClick={() => void reopenRegistration(s)}>
                        בטל אישור
                      </button>
                    )}
                    {/* ‼ טופס חכם שהושלם: צפייה בלבד. */}
                    {s.stepType === 'custom_request' && (s.payload?.smartForm as SmartFormProjection | undefined)?.filingId && (
                      <button type="button" className="btn btn-sm btn-ghost"
                        onClick={() => setSmartFilingId((s.payload.smartForm as SmartFormProjection).filingId)}>
                        צפייה
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      </div>
      )}

      {embedded && previewSheetOpen && (
        <Sheet onClose={() => setPreviewSheetOpen(false)} ariaLabel={`מה ${client.firstName || 'הלקוח'} רואה`}>
          <div className="rl-sheet-head">
            <span className="rl-sheet-title">הדף של {clientDisplayName ?? client.firstName ?? 'הלקוח'}</span>
            <button type="button" className="pd-x" aria-label="סגירה" onClick={() => setPreviewSheetOpen(false)}>×</button>
          </div>
          <div className="rl-sheet-body">
            <PortalPreviewPanel clientId={clientId} mode={sidebarPreviewMode} onModeChange={setSidebarPreviewMode}
              refreshKey={portalRefreshKey} />
          </div>
        </Sheet>
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

      {/* ‼ אותו מדריך שהלקוח רואה בכרטיס בדף האישי — עם מה שכל אדם מסמן (מהשרת). */}
      {approvalGuideOpen && (
        <RepApprovalGuide onClose={() => setApprovalGuideOpen(false)} entryUrl={REP_PORTAL_CARD_FIXED.linkUrl}
          approvals={approvalPeople ?? undefined} />
      )}

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
            const action = confirmState.action;
            setConfirmState(null);
            if (step && action) void run(step, action.name, action.payload);
            else if (step) void run(step, 'complete', { completionMethod: 'manual' });
          }}
        />
      )}

      {addOpen && (
        <AddRequestDialog
          clientId={clientId}
          steps={clientSteps}
          processPublished={!!activeEngagement?.processPublishedAt}
          awaitingQuoteApproval={awaitingQuoteApproval}
          intake={intake}
          currentEngagementId={activeEngagement?.id}
          prevAccountantEmail={prevAccountant?.email}
          onUseTemplate={t => { setAddOpen(false); setTemplateDraft(t); }}
          presetDocuments={presetOfficeDocs ?? undefined}
          thenEmail={!!presetOfficeDocs}
          client={client}
          niExecution={niExecution}
          onRequestAuthorityRepresentation={onRequestAuthorityRepresentation}
          onStartSmartForm={async () => {
            // ‼ אידמפוטנטי בשרת: הגשה פתוחה קיימת ⇒ חוזרים אליה, לא פותחים שנייה.
            const r = await startFiling(clientId, []);
            if (!r.ok) return filingErrorText(r.error);
            setAddOpen(false);
            setSmartFilingId(r.filingId as string);
            refresh?.();
            return null;
          }}
          onStartFlow={flowId => { setAddOpen(false); setPresetOfficeDocs(null); setStartFlow({ flowId }); }}
          onClose={() => { setAddOpen(false); setPresetOfficeDocs(null); }}
          onCreated={() => {
            refresh?.();
            // ‼ החלון נפתח רק אחרי שהמגש נטען מחדש — אחרת הוא נפתח על פריט ישן בלי הקובץ החדש
            if (presetOfficeDocs) void Promise.resolve(reloadReady()).then(() => setEmailAfterAdd(true));
          }}
        />
      )}

      {smartFilingId && (
        <Btl6101Workspace
          filingId={smartFilingId}
          client={client}
          onClientPersisted={onClientPersisted}
          onChanged={() => refresh?.()}
          onClose={() => { setSmartFilingId(null); refresh?.(); }}
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

      {/* ‼ «בקשה מתבנית» ירדה מתפריט ⋯ — במקומה «הפעלת מסלול». סט ישן הופך
          למסלול ב«המשרד ← מסלולים ← סטים ישנים». החלון הישן נשאר רק לשמירת
          המסע כסט (תפריט השורה) ולמסך הלא-מוטבע, עד שיהיה «שמור כמסלול». */}
      {templatesOpen && (
        <JourneyTemplatesDialog
          clientId={clientId}
          clientName={clientDisplayName ?? 'הלקוח'}
          onClose={() => setTemplatesOpen(false)}
          onApplied={() => refresh?.()}
        />
      )}

      {startFlow && (
        <StartFlowDialog
          clientId={clientId}
          client={client}
          firstName={firstName}
          runs={flowRuns}
          preselectFlowId={startFlow.flowId}
          onClose={() => setStartFlow(null)}
          onStarted={afterFlowAction}
        />
      )}

      {portalSend && (
        <SendPortalDialog
          clientId={clientId}
          clientName={clientDisplayName ?? 'הלקוח'}
          clientEmail={clientEmail}
          openIntake={intakeOpen}
          heading={portalSend === 'reminder' ? `תזכורת ${lamed(clientFirst)}` : 'שליחת הקישור לדף'}
          emailKind={portalSend}
          onClose={() => setPortalSend(null)}
          onSent={afterFlowAction}
        />
      )}

      {sendOpen && (
        <SendPortalDialog
          clientId={clientId}
          clientName={clientDisplayName ?? 'הלקוח'}
          clientEmail={clientEmail}
          openIntake={intakeOpen}
          emailKind="new"
          onClose={() => setSendOpen(false)}
          onSent={() => { refresh?.(); setReadyTick(t => t + 1); }}
        />
      )}
      {/* ‼ v3: «שלח בקשות» — כשיש מה לשלוח, המגש לפי נמען; כשאין, המסלול
          הישן של הקישור (SendPortalDialog) — היכולת לא נמחקה, רק נכנסה פנימה. */}
      {sendRequestsFocus !== null && (sendModeRef.current === 'tray' ? (
        <SendRequestsDialog
          clientId={clientId}
          clientName={clientDisplayName ?? 'הלקוח'}
          ready={readyToSend}
          focusKey={sendRequestsFocus === 'none' ? undefined : sendRequestsFocus}
          onUpdateClientFields={onUpdateClientFields}
          onClose={() => setSendRequestsFocus(null)}
          onReload={() => reloadReady()}
          onSent={() => {
            refresh?.();
            void onNiInstructionsSent?.();
            setReadyTick(t => t + 1);
            void reloadReady();
            void reloadFlowRuns();
          }}
        />
      ) : (
        <SendPortalDialog
          clientId={clientId}
          clientName={clientDisplayName ?? 'הלקוח'}
          clientEmail={clientEmail}
          openIntake={intakeOpen}
          heading="שלח שוב את הקישור לדף"
          emailKind="update"
          onClose={() => setSendRequestsFocus(null)}
          onSent={() => { refresh?.(); setReadyTick(t => t + 1); }}
        />
      ))}
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
          openIntake={intakeOpen}
          pendingCount={pendingCount}
          pendingNames={pendingNames}
          onPublished={() => refresh?.()}
          onClose={() => { setPublishPromptOpen(false); refresh?.(); }}
        />
      )}
    </div>
    </RowOpenContext.Provider>
    </>
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
  const { awaitingPublish } = useContext(RowOpenContext);
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
            <InviteBody path={path} status={step.status} awaitingPublish={!!awaitingPublish?.has(step.id)} />
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

/** מה קורה בשלב ההזמנה, לפי המסלול שנבחר.
 *  ‼ awaitingPublish — הקליטה טרם פורסמה: מה שבדף «יופיע», לא «מופיע» (clientPageGate). */
function InviteBody({ path, status, awaitingPublish }: { path?: PaperlessStatus; status: string; awaitingPublish?: boolean }) {
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
        {awaitingPublish
          ? 'ללקוח כבר יש חשבון פייפרלס. אחרי «פרסם בדף» הוא יתבקש בדף האישי להוסיף את המשרד כמייצג, ויאשר שם שעשה זאת.'
          : 'ללקוח כבר יש חשבון פייפרלס. בדף האישי הוא מתבקש להוסיף את המשרד כמייצג, ומאשר כאן שעשה זאת.'}
      </div>
    );
  }
  return (
    <div style={cardNote}>
      {status === 'waiting_client' || status === 'pending'
        ? (awaitingPublish
          ? 'קישור ההרשמה יופיע ללקוח בדף האישי אחרי «פרסם בדף», יחד עם כפתור «נרשמתי לפייפרלס». ברגע שילחץ, שלב החיבור ייפתח אצלך מעצמו.'
          : 'קישור ההרשמה מופיע ללקוח בדף האישי, יחד עם כפתור «נרשמתי לפייפרלס». ברגע שילחץ, שלב החיבור ייפתח אצלך מעצמו.')
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

  /* ‼ v3: המסד אומר "אצלי", אבל מי שמחזיק את הכדור הוא פייפרלס — היא מבקשת
     מהלקוח כרטיס. משפט המצב אומר את זה במקום "ממתין". */
  const waitingLabel = !manual && isStepOpen(step.status) && step.status !== 'locked'
    ? `ממתינים ש${p.client.firstName || 'הלקוח'} יזין/תזין כרטיס אשראי בפייפרלס`
    : undefined;

  return (
    <StepCardShell step={step} stepById={stepById} highlight={highlight} menu={p.menu}
      statusLabel={waitingLabel}
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
  /** חלק שעומד לבדו (בקשת הייצוג נסגרה) — «חלק מבקשת הייצוג שהושלמה ב-…». */
  context?: string | null;
  onOpenRepresentation?: () => void;
  menu: React.ReactNode;
}

function RepresentationUpgradeCard(p: UpgradeCardProps) {
  const { step, stepById, busy, highlight } = p;
  const [due, setDue] = useState(step.dueDate ?? '');
  const { compact } = useContext(RowOpenContext);

  const secondary = (step.payload.secondaryAuthorities ?? [])
    .filter((k): k is RepAuthorityKind => k in REP_AUTHORITY_LABELS)
    .map(k => REP_AUTHORITY_LABELS[k]);
  // הרו"ח הקודם השלים את העבודה שהחזיקה אותו כראשי — נכתב מכרטיס המכתב.
  const ready = !!step.payload.upgradeReadyAt;
  /* ‼ משטח מפושט: עד שהגיע הזמן — «בהמשך» (המצב מ-stepAttention) ובפתיחה למה מחכים;
     כשהגיע — מה קרה, בשורה הסגורה. */
  const compactState = compact ? upgradeRowState(step) : undefined;
  const compactStatus = !isStepOpen(step.status) ? undefined
    : step.needsAttention ? (ready ? 'אפשר לעבור לייצוג ראשי' : 'הגיע מועד התזכורת')
    : 'ממתין לשחרור מהרו״ח הקודם';

  return (
    <StepCardShell step={step} stepById={stepById} highlight={highlight} menu={p.menu}
      danger={step.needsAttention}
      state={compactState} statusLabel={compact ? compactStatus : undefined}>
      {step.needsAttention && !compact && (
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
      {/* ‼ חלק שעומד לבדו — הבקשה שהוא חלק ממנה, והדרך למרכז הייצוג. */}
      {p.context && (
        <p className="rl-part-context">
          {p.context}
          {p.onOpenRepresentation && (
            <> · <button type="button" className="ui-linkbtn" onClick={p.onOpenRepresentation}>למרכז הייצוג ←</button></>
          )}
        </p>
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

function RepresentationStepCard({ step, stepById, highlight, statusLabel, repStatus, repNote, repSendPhase, onOpen, hasBreakdown, approvalNeeded, menu }: {
  step: OnboardingStep;
  stepById: Map<string, OnboardingStep>;
  highlight: boolean;
  statusLabel?: string;
  repStatus?: RepresentationStatus;
  repNote?: string;
  repSendPhase?: RepSendPhase | null;
  onOpen?: () => void;
  /** יש «לפי רשות ואדם» מתחת — ושם, בתחתית, «למרכז הייצוג ←». */
  hasBreakdown?: boolean;
  /**
   * שע״ם ממתינה לאישור באזור האישי (H2) — מי ומה נאמרים בשורה ובפירוט («נדרש אישור של…» +
   * המדריך). ‼ כאן לא «ממתין לאישור הרשויות» / «כשיאושר — לסמן כמיוצג פעיל»: זה לא מה שקורה עכשיו.
   */
  approvalNeeded?: boolean;
  menu: React.ReactNode;
}) {
  const open = isStepOpen(step.status);
  // ‼ הסטטוס אומר במה השלב נמצא; הפעולה אומרת מה לעשות. "אין כאן מה לסמן
  // ידנית" נכון לגבי השלב, ונקרא בטעות כ"אין מה לעשות" — ואז מחפשים במסכים.
  const act = open && repStatus ? representationAction(repStatus, repSendPhase) : null;
  const { compact } = useContext(RowOpenContext);
  /* ‼ «למרכז הייצוג» רק מנווט — ולכן המצב בשורה הסגורה אומר מה צריך לעשות שם
     («לחתום ולהוסיף חותמת»), ולא נבלע מאחורי הכפתור. */
  const shortAct = compact && act?.mine ? repShortAction(repStatus, repSendPhase) : null;
  return (
    <StepCardShell step={step} stepById={stepById} highlight={highlight} menu={menu}
      statusLabel={approvalNeeded && open ? 'הוגש בשע״ם' : act ? act.action : statusLabel}
      state={shortAct ? { text: shortAct, tone: 'blue' } : undefined}
      primary={compact && onOpen && open && act?.mine ? (
        <button type="button" className="btn btn-sm btn-primary" onClick={onOpen}>למרכז הייצוג</button>
      ) : undefined}
      /* ‼ v3: הפעולה גלויה גם כשהכרטיס סגור — כרטיס כחול בלי כפתור הוא בדיוק
         מה שגרם לחפש במסכים. */
      always={!compact && onOpen && open ? (
        <div style={{ marginTop: '.55rem' }}>
          <button type="button"
            className={`btn btn-sm ${act?.mine ? 'btn-primary' : 'btn-secondary'}`}
            onClick={onOpen}>
            למרכז הייצוג ←
          </button>
        </div>
      ) : undefined}>
      {!(approvalNeeded && open) && (
        <div style={cardNote}>
          {act ? act.why
            : open ? 'הבדיקה, החתימה וההגשה נעשות במרכז הייצוג.'
              : 'הייצוג הושלם. הפירוט המלא - במרכז הייצוג.'}
        </div>
      )}
      {compact && onOpen && open && !act?.mine && !hasBreakdown && (
        <div><button type="button" className="btn btn-sm btn-secondary" onClick={onOpen}>למרכז הייצוג ←</button></div>
      )}
      {/* 191: עד איפה הלקוח הגיע בקליטה, או צילום תעודה שחסר אחרי ההגשה. */}
      {open && repNote && (
        <div style={{ ...cardNote, color: repNote.startsWith('חסר') ? '#8A4B00' : undefined }}>
          {repNote.startsWith('חסר') ? '⚠ ' : '⏱ '}{repNote}
        </div>
      )}
      {onOpen && !open && (
        <div style={{ marginTop: '.55rem' }}>
          <button type="button" className="btn btn-sm btn-secondary" onClick={onOpen}>למרכז הייצוג ←</button>
        </div>
      )}
    </StepCardShell>
  );
}

/**
 * כרטיס «ייצוג ברשות×אדם» (157) — פעולה אחת מתאימה למצב, נגזרת תמיד
 * מ-`track` (מסלול הביצוע החי), לא מ-`step.payload` (שנושא ראיה רק
 * בסגירה — ראה sync_authority_representation_steps). חמישה מצבים:
 * הזנה בפורטל → ממתין לאסמכתא → מוכן לשליחה → נשלח וממתינים לאישור → פעיל.
 */
function AuthorityRepresentationStepCard({
  step, stepById, highlight, track, attn, model, first, context, onOpenRepresentation, job, clientRecord, spouseClient,
  onSendInstructions, onExecutionChanged,
  currentValues, client, spouse, onSaveEmail, onChanged, menu,
}: {
  step: OnboardingStep;
  stepById: Map<string, OnboardingStep>;
  highlight: boolean;
  track?: NiTracking;
  /** המקטע והצבע — מ-stepAttention, אותו מקור של התג. */
  attn: Attention;
  /** סבב 4: המצב והפעולה — authRepRowModel, אותו מודל שהשורה הראשית קוראת. */
  model: AuthRepRowModel;
  /** השם הפרטי הנוכחי מהכרטיס (לא subjectName שנשמר על השלב). */
  first: string;
  /** חלק שעומד לבדו (בקשת הייצוג נסגרה/אחרת) — «חלק מבקשת הייצוג…». */
  context?: string | null;
  onOpenRepresentation?: () => void;
  /** משימת ב"ל האחרונה של האדם הזה (הזנה/בדיקה) — לשורת PIVO. */
  job: AutomationJob | null;
  clientRecord: Client;
  spouseClient?: Client;
  /** פותח את «שלח בקשות» עם הקבוצה של האדם הזה במוקד. */
  onSendInstructions: () => void;
  /** משימת ב"ל הסתיימה בהצלחה — הביצוע והשלב נכתבו בשרת; לרענן. */
  onExecutionChanged: () => void;
  currentValues: Record<string, string | undefined>;
  client: PrerequisitePerson;
  spouse: PrerequisitePerson;
  onSaveEmail: (role: 'client' | 'spouse', email: string) => Promise<void>;
  onChanged: () => void;
  menu: React.ReactNode;
}) {
  const rowCtx = useContext(RowOpenContext);
  /* ‼ בתוך «לפי רשות ואדם» הכרטיס הוא חלק — פתיחה וסגירה שלו לא סוגרות את השורה. */
  const nestedHere = useContext(NestedRowContext);
  const isOpenHere = nestedHere ? rowCtx.childOpenId === step.id : rowCtx.openId === step.id;
  const toggleHere = () => (nestedHere ? rowCtx.toggleChild?.(step.id) : rowCtx.toggle(step.id));
  const open = isStepOpen(step.status);
  const role: 'client' | 'spouse' = step.payload?.subjectRole === 'spouse' ? 'spouse' : 'client';
  void attn;
  const { sent, confirmed, expired, readyToSend, withSignature, live, stuck, failed, gated, autoAction } = model;
  const deadline = track?.deadline ? formatDate(track.deadline, 'form') : null;
  const fmtStamp = (iso?: string) => (iso ? formatDate(iso, 'list') : '');

  /* ── משפט המצב — מה קרה, מי צריך לפעול ─────────────────────────────────
     ‼ בשפת האדם, לא בשפת המסלול: לא "האסמכתא התקבלה — נדרש לשלוח", אלא
     "PIVO הזין… · דין צריכה לאשר — ההוראות עוד לא נשלחו אליה". */
  const statusLine = confirmed
    ? `הייצוג של ${first} בביטוח לאומי אושר${track?.confirmedAt ? ` ${fmtStamp(track.confirmedAt)}` : ''}.`
    : expired
      ? `האסמכתא ${track?.referenceNumber ?? ''} פגה ב-${deadline} — ${first} לא אישר/ה בזמן.`
      : sent
        ? `נשלח ${lamed(first)} ${fmtStamp(track!.instructionsSentAt)} · ממתינים לאישור שלו/ה בביטוח לאומי${deadline ? ` עד ${deadline}` : ''}.`
        : readyToSend || withSignature
          // ‼ 195 — «PIVO הזין» נאמר רק כשזה מה שקרה. רישום שנוצר ידנית
          // בפורטל ונמצא ביישוב מסומן `foundExternally`, ואז המשפט מספר
          // מה **יש**, לא מי עשה.
          ? `${track!.foundExternally ? 'ייפוי הכוח קיים בביטוח לאומי' : 'PIVO הזין את ייפוי הכוח בביטוח לאומי'} · אסמכתא ${track!.referenceNumber}${deadline ? ` · לאשר עד ${deadline}` : ''}`
            // ‼ כמו מרכז הייצוג: לפני מייל החתימה ההוראות יוצאות איתו — לא במייל נפרד.
            + (withSignature ? ' · ההוראות יוצאות עם בקשת החתימה' : '')
          : track?.enteredAt
            ? 'הוזן בביטוח לאומי · ממתינים לאסמכתא.'
            : open
              ? 'טרם הוזן ייפוי כוח בביטוח לאומי — PIVO מזין מהחלון של ביטוח לאומי.'
              : 'הבקשה נסגרה.';
  const lead = readyToSend ? `${first} צריכ/ה לאשר את ייפוי הכוח — ההוראות עוד לא נשלחו אליו/ה.` : null;

  /* ── שורת PIVO — בתוך הכרטיס, לא קטגוריה משלה ─────────────────────────── */
  const jobVerb = job?.actionType === BTL_CHECK_REPRESENTATION_ACTION_TYPE
    ? `PIVO בודק בביטוח לאומי אם ${first} אישר/ה…`
    : 'PIVO מזין את ייפוי הכוח בביטוח לאומי…';
  // ‼ 195: כל מצב שאינו 'approved' הוא "עדיין לא אישר/ה" — לא רק 'pending'.
  // קודם נבדק `=== 'pending'` בלבד, ולכן בדיקה שחזרה 'unknown'/'not_found'
  // לא הותירה שום עקבה במסך, והרו"ח ראה מסך שנראה כאילו לא קרה כלום.
  const checkedState = (job?.result as { status?: string } | undefined)?.status;
  const checkedJustNow = !!job && job.status === 'succeeded' && job.actionType === BTL_CHECK_REPRESENTATION_ACTION_TYPE
    && !confirmed && !!checkedState && checkedState !== 'approved'
    && !!job.finishedAt && (Date.now() - new Date(job.finishedAt).getTime()) < 6 * 3600_000;
  const checkedLabel = checkedState && checkedState !== 'pending'
    ? NI_EXTERNAL_STATE_LABELS[checkedState as NiExternalState] ?? NI_EXTERNAL_STATE_LABELS.unknown
    : null;

  /* ‼ הפעולה האוטומטית — אותו רכיב של תיק המס ומרכז הביצוע (NiNextActionButton):
     גם החיבור לחלון ב"ל, גם ההרצה, גם השגיאה. כאן רק בוחרים איזו פעולה —
     ‼ סבב 4: הבחירה ב-authRepRowModel (utils/authorityRepresentationRow). */

  const alwaysBlock = (
    <>
        {lead && <div className="ob-card-lead">{lead}</div>}
        {open && readyToSend && (
          <div style={{ marginTop: '.55rem', display: 'flex', gap: '.4rem', flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-sm btn-primary" onClick={onSendInstructions}>
              שלח {lamed(first)} את ההוראות
            </button>
          </div>
        )}
        {open && autoAction && !live && (
          <div style={{ marginTop: '.55rem', display: 'flex', gap: '.4rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <NiNextActionButton client={clientRecord} spouseClient={spouseClient} role={role}
              action={autoAction} track={track} onChanged={onExecutionChanged}
              className="btn btn-sm" errorClassName="ob-pivo-line is-stuck" />
            {sent && !confirmed && !expired && (
              <button type="button" className="ui-linkbtn" onClick={onSendInstructions}>שלח שוב את ההוראות</button>
            )}
          </div>
        )}
        {live && (
          <div className="ob-pivo-line is-running">
            <span className="tag">PIVO</span><span className="ob-spin" aria-hidden="true" />
            <span className="grow">{jobVerb}</span>
            {job?.createdAt && <span style={{ fontSize: 11 }}>התחיל {new Date(job.createdAt).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}</span>}
          </div>
        )}
        {stuck && !live && !autoAction && (
          <div className="ob-pivo-line is-stuck">
            <span className="tag">PIVO</span>
            <span className="grow">⚠ {job?.needsHuman || 'המשימה נתקעה - נדרשת התערבות.'}</span>
          </div>
        )}
        {failed && !live && !autoAction && (
          <div className="ob-pivo-line is-stuck">
            <span className="tag">PIVO</span>
            <span className="grow">⚠ {job?.errorDetail || 'המשימה נכשלה.'}</span>
          </div>
        )}
        {checkedJustNow && !live && !stuck && (
          <div className="ob-pivo-line">
            <span className="tag">PIVO</span>
            <span className="grow">
              נבדק {new Date(job!.finishedAt!).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })} — {first} עדיין לא אישר/ה
              {checkedLabel ? ` (ב״ל: ${checkedLabel})` : ''}.
            </span>
          </div>
        )}
    </>
  );

  /* ── משטח מפושט: פעולה אחת בשורה הסגורה, השאר בפתיחה ──────────────────
     ‼ אותו שער תנאי-קדם (§9): כשחסרים פרטים — אין פעולת ביצוע בשורה, רק
     «השלמת פרטים» שפותחת את השער עצמו. */
  const missingPrereqs = open ? ((step.payload?.prerequisites as { missing?: string[] } | undefined)?.missing ?? []) : [];
  const compactStatus = gated
    ? `חסרים פרטים: ${missingPrereqs.map(k => PREREQUISITE_FIELD_LABELS[k] ?? k).join(', ')}`
    : live ? jobVerb
    : stuck && !autoAction ? `⚠ ${job?.needsHuman || 'המשימה נתקעה - נדרשת התערבות.'}`
    : statusLine;
  /* ‼ בשורה הסגורה — רק כשהתור שלי: השלמת פרטים / שליחת הוראות / הזנה. «בדוק
     קבלת הייצוג» כשממתינים לאדם — בפתיחה, לא בשורה. */
  const p = model.primary;
  const compactPrimary = !p ? null
    : p.kind === 'gate' ? (isOpenHere ? null : (
        <button type="button" className="btn btn-sm btn-primary" onClick={toggleHere}>{p.label}</button>))
    : p.kind === 'send' ? (
        <button type="button" className="btn btn-sm btn-primary" onClick={onSendInstructions}>{p.label}</button>)
    : autoAction ? (
        <NiNextActionButton client={clientRecord} spouseClient={spouseClient} role={role}
          action={{ ...autoAction, label: p.label }} track={track} onChanged={onExecutionChanged}
          className="btn btn-sm" errorClassName="ob-pivo-line is-stuck" />)
    : null;
  const compactState: RowState | undefined = model.state;
  const cancelNode = open ? (
    <div style={{ marginTop: '.6rem' }}>
      <NiCancelRequest clientId={clientRecord.id} role={role}
        name={String(step.payload?.subjectName ?? '').trim() || first}
        track={track} onChanged={onChanged} />
    </div>
  ) : null;
  const explain = (
    <div style={cardNote}>
      {confirmed
        ? 'הייצוג בביטוח לאומי פעיל. הפירוט המלא - במרכז הייצוג.'
        : readyToSend
          ? `המייל ${lamed(first)}: מספר האסמכתא, המועד האחרון, וקישור למסך האישור באתר ביטוח לאומי (או בטלפון ${NI_APPROVAL_PHONE}). כשיאושר - PIVO יזהה את זה בבדיקה, והבקשה תעבור ל«הושלמו».`
          : sent
            ? `אסמכתא ${track?.referenceNumber ?? ''}. ${first} מאשר/ת באתר ביטוח לאומי או בטלפון ⁨${NI_APPROVAL_PHONE}⁩. כשיאשר/תאשר — בודקים כאן ב«בדוק קבלת הייצוג». אין בדיקה אוטומטית ברקע.`
            : 'ביטוח לאומי מנפיק אסמכתא לכל מבוטח בנפרד; המבוטח מאשר אותה בעצמו, ואז הייצוג בב"ל פעיל עבורו.'}
    </div>
  );
  if (rowCtx.compact) {
    /* ‼ בפתיחה: עובדות בשורה אחת (לא משפט), הפעולות יחד, הערה של שורה אחת,
       ו«מחיקת/ביטול הבקשה» ליד «הוספת הערה» — לא קישור בודד באמצע. */
    const compactFacts = gated || live || (stuck && !autoAction) ? compactStatus : [
      confirmed ? `אושר ${fmtStamp(track?.confirmedAt)}` : null,
      sent && !confirmed ? `נשלח ${lamed(first)} ${fmtStamp(track!.instructionsSentAt)}` : null,
      track?.referenceNumber ? `אסמכתא ${track.referenceNumber}` : null,
      deadline && !confirmed ? (expired ? `פג ב-${deadline}` : `לאשר עד ${deadline}`) : null,
      !track?.referenceNumber && track?.enteredAt ? 'הוזן בביטוח לאומי · ממתינים לאסמכתא' : null,
      !track?.referenceNumber && !track?.enteredAt && open ? 'טרם הוזן ייפוי כוח בביטוח לאומי' : null,
      withSignature ? 'ההוראות יוצאות עם בקשת החתימה' : null,
      track?.foundExternally ? 'נמצא קיים בב״ל (לא הוזן מכאן)' : null,
    ].filter(Boolean).join(' · ');
    const shortNote = confirmed ? 'הפירוט המלא — במרכז הייצוג.'
      : withSignature ? `ההוראות ${lamed(first)} (אסמכתא, מועד וקישור לאישור) יוצאות במייל של בקשת החתימה — אין מייל נפרד.`
      : readyToSend ? `המייל ${lamed(first)} כולל את האסמכתא, המועד וקישור לאישור באתר ביטוח לאומי.`
      : sent ? `${first} מאשר/ת באתר ביטוח לאומי או בטלפון ⁨${NI_APPROVAL_PHONE}⁩. אחר כך — «בדוק קבלת הייצוג».`
      : 'PIVO מזין את ייפוי הכוח מהחלון של ביטוח לאומי; המבוטח מאשר את האסמכתא בעצמו.';
    return (
      <StepCardShell step={step} stepById={stepById} highlight={highlight}
        menu={<>{menu}{open && (
          <NiCancelRequest clientId={clientRecord.id} role={role}
            name={String(step.payload?.subjectName ?? '').trim() || first}
            track={track} onChanged={onChanged} />
        )}</>}
        statusLabel={compactFacts || compactStatus} primary={compactPrimary} state={compactState}
        /* ‼ בתוך «לפי רשות ואדם» — «ביטוח לאומי · {שם}»; לבד — עם «ייצוג». השם הנוכחי מהכרטיס. */
        name={nestedHere ? `ביטוח לאומי · ${first}` : `ייצוג בביטוח לאומי · ${first}`}
        always={gated ? (
          <PrerequisiteGate step={step} currentValues={currentValues} client={client} spouse={spouse}
            onSaveEmail={onSaveEmail} onChanged={onChanged}>{null}</PrerequisiteGate>
        ) : (
          <>
            {/* הפעולות שאינן «התור שלי» — בפתיחה בלבד, בשורה אחת. */}
            {((autoAction && !live && autoAction.kind === 'check_btl') || (sent && !confirmed && !expired)) && (
              <div style={{ display: 'flex', gap: '.6rem', flexWrap: 'wrap', alignItems: 'center' }}>
                {autoAction && !live && autoAction.kind === 'check_btl' && (
                  <NiNextActionButton client={clientRecord} spouseClient={spouseClient} role={role}
                    action={autoAction} track={track} onChanged={onExecutionChanged}
                    className="btn btn-sm" errorClassName="ob-pivo-line is-stuck" />
                )}
                {sent && !confirmed && !expired && (
                  <button type="button" className="ui-linkbtn" onClick={onSendInstructions}>שלח שוב את ההוראות</button>
                )}
              </div>
            )}
            {failed && !live && (
              <div className="ob-pivo-line is-stuck"><span className="tag">PIVO</span><span className="grow">⚠ {job?.errorDetail || 'המשימה נכשלה.'}</span></div>
            )}
            {checkedJustNow && !live && !stuck && (
              <div className="ob-pivo-line">
                <span className="tag">PIVO</span>
                <span className="grow">
                  נבדק {new Date(job!.finishedAt!).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })} — {first} עדיין לא אישר/ה
                  {checkedLabel ? ` (ב״ל: ${checkedLabel})` : ''}.
                </span>
              </div>
            )}
          </>
        )}>
        <div className="rl-facts">{shortNote}</div>
        {/* ‼ חלק שעומד לבדו — הבקשה שהוא חלק ממנה, והדרך למרכז הייצוג. */}
        {context && (
          <p className="rl-part-context">
            {context}
            {onOpenRepresentation && (
              <> · <button type="button" className="ui-linkbtn" onClick={onOpenRepresentation}>למרכז הייצוג ←</button></>
            )}
          </p>
        )}
      </StepCardShell>
    );
  }

  /* ‼ v3: משפט המצב הוא שורת המטא של הכרטיס; הפעולה ושורת PIVO גלויות גם
     כשהכרטיס סגור (always). מה שנפתח בלחיצה הוא ההסבר בלבד. */
  return (
    <StepCardShell step={step} stepById={stepById} highlight={highlight} menu={menu}
      statusLabel={statusLine}
      always={(
        <PrerequisiteGate step={step} currentValues={currentValues} client={client} spouse={spouse}
          onSaveEmail={onSaveEmail} onChanged={onChanged}>
          {alwaysBlock}
        </PrerequisiteGate>
      )}>
      {explain}
      {/* ‼ 212: מחיקה (לא נשלח) / ביטול (נשלח) — גם לאדם היחיד; השרת אוכף. */}
      {cancelNode}
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
  // ‼ 03.10: קליטה שטרם פורסמה — השאלון עוד לא בדף (clientPageGate).
  const awaitingPublish = !!useContext(RowOpenContext).awaitingPublish?.has(step.id);
  return (
    <StepCardShell step={step} stepById={stepById} highlight={highlight} menu={menu}>
      <div style={cardNote}>
        {sent
          ? (awaitingPublish
            ? 'השאלון יופיע ללקוח בדף האישי אחרי «פרסם בדף». ברגע שיסיים למלא - השלב ייסגר מעצמו והתשובות יופיעו בכרטיס.'
            : 'השאלון פתוח ללקוח בדף האישי. ברגע שיסיים למלא - השלב ייסגר מעצמו והתשובות יופיעו בכרטיס.')
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
  // ‼ 167: due_date היא המקור היחיד לחלון ההתייחסות; payload.objectionDueDate
  // הוא מראה שהשרת מחזיק מסונכרנת. קוראים את המקור.
  const due = step.dueDate ?? step.payload.objectionDueDate;
  if (!due || !step.payload.releaseSentAt) return false;
  if (step.payload.prevAccountantResponseNote) return false;
  const end = new Date(due);
  if (Number.isNaN(end.getTime())) return false;
  return end < new Date(new Date().toDateString());
}

/**
 * תרגום הסטטוס הגנרי לשפה של מסלול השחרור.
 * ‼ sendUnknown — ביומן יש למכתב שורה «לא ידוע אם יצא» (send-release-email לא כותב
 * releaseSentAt במקרה כזה). אז לא «טרם נשלח»: אין ראיה שלא יצא.
 */
function releaseStatusLabel(step: OnboardingStep, hasEmail: boolean, sendUnknown = false): string {
  const sentAt = step.payload.releaseSentAt;
  const responded = !!step.payload.prevAccountantResponseNote || !!step.payload.prevAccountantSignedAt;
  switch (step.status) {
    case 'pending':
    case 'in_progress':
      return sentAt ? 'נשלח' : sendUnknown ? 'לא ידוע אם המכתב יצא' : (hasEmail ? 'טיוטה · טרם נשלח' : 'טיוטה');
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

  /* ‼ מכתב שלא ידוע אם יצא: send-release-email רושם שורה 'unknown' (עם step_id) ולא כותב
     releaseSentAt — כדי לא לטעון «נשלח». בלי הבדיקה הזו הכרטיס היה אומר «טרם נשלח» ומציע
     לשלוח שוב כאילו כלום לא קרה. היומן נטען רק כשהמכתב פתוח ולא סומן שנשלח. */
  const { user } = useAuth();
  const { messages: letterMails } = useEmailMessages(!sent && open ? user?.id : undefined, { clientId: p.clientId });
  const letterUnknown = useMemo(() => {
    if (sent) return null;
    const last = (letterMails as StepEmail[])
      .filter(m => m.kind === 'release' && (m.stepId ? m.stepId === step.id : m.clientId === p.clientId))
      .sort((a, b) => (b.sentAt || b.createdAt || '').localeCompare(a.sentAt || a.createdAt || ''))[0];
    return last && isUnknownEmailStatus(last.status) ? last : null;
  }, [letterMails, sent, step.id, p.clientId]);

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
  /* ── משטח מפושט ──────────────────────────────────────────────────────────
     ‼ בשורה הסגורה: הפעולה אחת (שליחה / עדכון), ומה שחדש (קבצים, הערה).
     כל השאר — פרטי הרו״ח, הרשימה, חלוקת הטיפול — נפתח בלחיצה. */
  const { compact } = useContext(RowOpenContext);
  const responseOpen = !!step.payload.prevAccountantResponseNote && !step.payload.responseHandledAt;
  const compactStatus = [
    releaseStatusLabel(step, email !== '', !!letterUnknown),
    sent && required.length > 0 ? `${receivedCount}/${required.length} התקבלו` : null,
    newUploads.length > 0 ? (newUploads.length === 1 ? 'קובץ חדש' : `${newUploads.length} קבצים חדשים`) : null,
    responseOpen ? 'הערה חדשה מהרו״ח הקודם' : null,
    !email && !detailsOpen ? 'חסר אימייל של הרו״ח הקודם' : null,
  ].filter(Boolean).join(' · ');
  // ‼ מכתב שלא ידוע אם יצא — בלי כפתור שליחה בשורה: קודם מבררים עם הרו״ח הקודם (בפתיחה).
  const compactPrimary = !compact ? undefined
    : !closed && !sent && !letterUnknown && email && canPrepare ? (
        <button type="button" className="btn btn-sm btn-primary" disabled={busy} onClick={() => p.onPrepare?.('letter')}>
          שלח לרו״ח הקודם
        </button>)
    : sent && pendingFollowUp.length > 0 && materialsOpen && canPrepare ? (
        <button type="button" className="btn btn-sm btn-primary" disabled={busy} onClick={() => p.onPrepare?.('follow_up')}>
          שלח עדכון לרו״ח הקודם
        </button>)
    : undefined;

  // מה שחדש גובר על «ממתין»: הערה מהרו"ח הקודם, קבצים שהגיעו, אימייל שחסר.
  const compactState: RowState | undefined = !compact ? undefined
    : responseOpen ? { text: 'הערה חדשה', tone: 'red' }
    : newUploads.length > 0 ? { text: 'קבצים חדשים', tone: 'blue' }
    : letterUnknown ? { text: 'לא ידוע אם יצא', tone: 'amber' }
    : !sent && !email && !detailsOpen ? { text: 'חסר אימייל', tone: 'amber' }
    : undefined;

  return (
    <StepCardShell step={step} stepById={stepById} highlight={highlight} menu={p.menu}
      statusLabel={compact ? compactStatus : releaseStatusLabel(step, email !== '', !!letterUnknown)}
      primary={compactPrimary} state={compactState}
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
                    {(step.dueDate ?? step.payload.objectionDueDate) && !step.payload.prevAccountantSignedAt && (
                      <> · חלון התייחסות עד {formatDate((step.dueDate ?? step.payload.objectionDueDate) as string, 'list')}</>
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

          {/* ‼ «לא ידוע אם יצא» — ענבר, לא «נשלח» ולא «נכשל»: העובדות שיודעים, והצעד הבטוח. */}
          {letterUnknown && !closed && (
            <div className="ob-hand-note is-attention" role="status">
              <div style={{ fontWeight: 700, color: 'var(--warn)' }}>לא ידוע אם המכתב יצא</div>
              <div>
                ניסינו לשלוח אל <span dir="ltr">{letterUnknown.toEmail}</span>
                {letterUnknown.sentAt ? <> · {formatDate(letterUnknown.sentAt, 'list')}</> : null}
                {' · '}{unknownEmailCause(letterUnknown.error)}.
              </div>
              <div>לפני ששולחים שוב — כדאי לברר עם הרו״ח הקודם אם קיבל אותו. אם קיבל — «סמן שנשלח».</div>
            </div>
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
                  {!(compact && !sent && compactPrimary) && (
                    <button type="button" className={`btn btn-sm ${(compact && sent) || letterUnknown ? 'btn-secondary' : 'btn-primary'}`}
                      disabled={busy || !canPrepare || !email}
                      title={email ? undefined : 'השליחה תיפתח כשיהיה אימייל של הרו״ח הקודם'}
                      onClick={() => p.onPrepare?.('letter')}>
                      {sent || letterUnknown ? 'שלח מכתב שוב' : 'שלח לרו״ח הקודם'}
                    </button>
                  )}
                </>
              )}
              {sent && pendingFollowUp.length > 0 && !(compact && compactPrimary) && (
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

      {/* ‼ במשטח המפושט «חסום: …» מוצג בשורה עצמה (JourneyRow) — לא פעמיים. */}
      {step.status === 'blocked' && p.blockNote && !compact && (
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
        {/* ‼ כל עוד החומרים עוד בדרך — אין «סמן כהושלם» על המכתב: הוא נקרא כסגירת ההעברה כולה. */}
        {step.status === 'completed' && !materialsOpen && (
          <button type="button" className="btn btn-sm btn-secondary" disabled={busy}
            onClick={() => p.onRun('verify')}>סמן כהושלם</button>
        )}
        {(step.status === 'blocked' || step.status === 'failed') && (
          <button type="button" className="btn btn-sm btn-secondary" disabled={busy}
            onClick={() => p.onRun('reopen')}>פתח מחדש</button>
        )}
        {open && step.status !== 'blocked' && (
          <button type="button" className="btn btn-sm btn-ghost" disabled={busy} onClick={p.onBlock}>סמן כחסום…</button>
        )}
      </div>
    </StepCardShell>
  );
}

/** מה קרה למכתב אחרי השליחה — נמסר, נפתח, הוקפץ. מהיומן של המיילים היוצאים. */
function ReleaseDelivery({ clientId }: { clientId: string }) {
  const { user } = useAuth();
  // ‼ רק המיילים של הלקוח הזה, ובלי גוף ה-HTML (נמשך בלחיצה) — במקום 200
  // מיילים משרדיים עם גוף מלא בכל פתיחת כרטיס.
  const { messages } = useEmailMessages(user?.id, { clientId });
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
      const saved = await fetchEmailHtml(last.id);
      if (saved) { setViewing({ ...last, html: saved }); return; }
      const { data, error } = await supabase.functions.invoke('backfill-email-html', { body: { messageId: last.id } });
      if (error || !data?.ok || !data.html) setViewErr('העותק אינו זמין - אפשר לצפות מלשונית הפעילות.');
      else setViewing({ ...last, html: data.html });
    } catch {
      setViewErr('העותק אינו זמין - אפשר לצפות מלשונית הפעילות.');
    } finally { setFetching(false); }
  }

  return (
    <div style={{ ...cardNote, marginTop: '.4rem' }}>
      מכתב אחרון אל <span dir="ltr">{last.toEmail}</span> · {relativeTime(last.sentAt)} · {/* ‼ «לא ידוע אם יצא» — ענבר, לא «נשלח» ולא «נכשל». */}
      <span style={last.status === 'unknown' ? { color: 'var(--warn)', fontWeight: 600 } : undefined}>{EMAIL_STATUS_LABEL[last.status] ?? last.status}</span>
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

function StepCardShell({ step, stepById, highlight, danger, statusLabel, always, primary, menu, children, unsent, state, name }: {
  unsent?: boolean;
  /** הפעולה של עכשיו — גלויה גם כשהשורה סגורה (במשטח המפושט). */
  primary?: React.ReactNode;
  state?: RowState;
  name?: string;
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
      statusLabel={statusLabel} always={always} primary={primary} menu={menu} unsent={unsent} state={state} name={name}>
      {children}
    </JourneyRow>
  );
}

/**
 * כרטיס בקשה — הצורה האחידה של כל בקשה (אב-הטיפוס המאושר requests-v2-approved).
 * סגור: שם · משפט מצב אחד · פרטים משניים בשקט · פעולה אחת רלוונטית + ⋯.
 * פתוח: כל הפרטים של אותה בקשה. פותחים אחת בכל פעם, כדי שהמסך יישאר קריא.
 */
function JourneyRow({ step, stepById, highlight, danger, statusLabel, noteLine, always, primary, menu, children, unsent, state, name, nestedName }: {
  step: OnboardingStep;
  /** הפעולה של עכשיו — במשטח המפושט גלויה בשורה הסגורה; בישן נוספת לפני התפריט. */
  primary?: React.ReactNode;
  /** משטח מפושט: המצב הקצר בשורה הסגורה (גובר על הנגזר מ-stepAttention). */
  state?: RowState;
  /** משטח מפושט: שם קצר במקום הכותרת (למשל «ייצוג בביטוח לאומי · רותם»). */
  name?: string;
  /** השם כשהשורה בתוך שורה אחרת — ההורה כבר אומר על מה מדובר («אישור אישי של רותם»). */
  nestedName?: string;
  /** v3: הבקשה בדף האישי אבל הלקוח עוד לא קיבל עליה מייל — גלולת «בדף, בלי מייל». */
  unsent?: boolean;
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
  const { openId, toggle, depParents, depChildren, nestedByStep, requiredApplies, compact, attnByStep, firstNames, editing, childOpenId, toggleChild, groupViewByStep, nestedTitleByStep, autoEmailUnknown, awaitingPublish, blockNotes, rowNote, noteEditor } = useContext(RowOpenContext);
  const isNested = useContext(NestedRowContext);
  /** סיבת החסימה (מהיומן) — רק כשהשלב באמת חסום. */
  const blockNote = step.status === 'blocked' ? blockNotes?.get(step.id) : undefined;
  /** מה קרה עכשיו בשורה הזאת (צור שוב / הסתרה / הערה נשמרה). */
  const note = rowNote?.stepId === step.id ? rowNote : null;
  const editorHere = noteEditor?.stepId === step.id ? noteEditor.node : null;
  const open = compact && isNested ? childOpenId === step.id : openId === step.id;
  const nested = nestedByStep?.get(step.id);
  /* ‼ 03.10 — לקוח שחוזר: בקשה שעברה מההתקשרות הקודמת אומרת את זה בשורה שקטה אחת. */
  const carried = carriedFromLine(step);
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
  /** פורסמה, אבל הקליטה שלה טרם פורסמה — הלקוח עוד לא רואה אותה (clientPageGate). */
  const waitsPublish = !isDraft && !!awaitingPublish?.has(step.id);
  /** …ו«הדף» הוא הערוץ של הבקשה הזו (בב"ל ממתינים לאישור באתר ביטוח לאומי, לא לדף). */
  const pageWaitsPublish = waitsPublish && step.stepType !== 'authority_representation';
  const hasPendingEdit = !!step.draftPayload && !isDraft;
  const ext = step.payload.externalParty;
  const extName = ext
    ? (ext.kind === 'prev_accountant' ? 'רו״ח קודם' : (ext.contact?.name || 'גורם חיצוני'))
    : null;
  // ⚡ אוטומטי: מסומן בעדינות; אחרי הביצוע — "בוצע"; אחרי כישלון — יינסה שוב.
  // ‼ «בוצע» רק כשאין ביומן שורה «לא ידוע אם יצא» — אחרת ענבר, בלי טענה שהמייל יצא או נכשל.
  const isAutomatic = step.payload.autoAction?.kind === 'email';
  const autoUnknownMail = isAutomatic && !!step.payload.autoExecutedAt ? autoEmailUnknown?.get(step.id) : undefined;
  const autoUnknown = !!autoUnknownMail;
  const autoLabel = !isAutomatic || autoUnknown ? null
    : step.payload.autoExecutedAt ? '⚡ בוצע אוטומטית'
    : step.payload.autoError ? '⚡ אוטומטי · הניסיון נכשל - יינסה שוב'
    : '⚡ אוטומטי';
  const autoUnknownLabel = autoUnknown ? '⚡ אוטומטי · לא ידוע אם המייל יצא' : null;
  /** למה לא ידוע, ומה הצעד הבטוח — אותו משפט כמו ביומן המיילים (emailRowState). */
  const autoUnknownHint = autoUnknownMail ? emailRowState(autoUnknownMail).hint ?? null : null;
  // "משחרר:" — אילו שלבים פתוחים ממתינים לשלב הזה. רק כשפתוח, ובשקט.
  const releases = (depChildren?.get(step.id) ?? [])
    .map(id => stepById.get(id))
    .filter((d): d is OnboardingStep => !!d && isStepOpen(d.status));

  /* ── משפט המצב — שורה אחת שאומרת מה קורה ────────────────────────────────
     ‼ זה השינוי המרכזי מול הרשימה הצפופה שהייתה כאן: המטא לא נפרשת לרצועה
     של שישה פריטים מופרדים בנקודות. שורה ראשונה = מה קורה / למה ממתינים
     (בדיוק כמו .meta באב-הטיפוס), ושורה שנייה שקטה יותר לפרטים המשניים. */
  /* ‼ v3: "הכדור אצל X" ירד מהמשפט — המקטע ותת-הכותרת כבר אומרים אצל מי.
     נשאר: מה קורה (סטטוס בשפת המסלול), ומאז מתי. */
  const statusSentence = locked
    ? lockHint(step, stepById, depParents?.get(step.id))
    : [statusLabel ?? stepStatusLabel(step), age]
        .filter(Boolean).join(' · ');

  /* ‼ "כמה זמן" נכנס למשפט המצב ולא לשורה נפרדת: הוא חלק מ"מה קורה", ושורה
     שלישית שכתוב בה רק "14 ימים" הוסיפה גובה לכל כרטיס בלי להוסיף מידע.
     בשורה השנייה נשאר רק מה שבאמת משני ולא תמיד קיים. */
  const dimParts = [
    progress,
    step.dueDate ? `עד ${formatDate(step.dueDate, 'list')}` : null,
    autoLabel,
  ].filter(Boolean) as string[];

  if (compact) {
    /* ── שורה במשטח המפושט (סבב שני, 1.10.2026) ───────────────────────────
       ‼ סגורה: שם קצר · מצב של עד שלוש מילים · הפעולה — רק כשהתור שלי.
       בלי תאריכים, ספירות, תגיות, ⋯ ושלבים עתידיים. כל אלה — בפתיחה, יחד עם
       הניסוח המלא, הגוף של הכרטיס ושאר הפעולות. שום מידע לא ירד. */
    const draftForClient = isDraft && portalShowsStep(step.stepType);
    const shownName = isNested && nestedName ? nestedName : name;
    const split = shownName ? { name: shownName, detail: undefined as string | undefined } : splitRequestTitle(rowTitle(step));
    const a = attnByStep?.get(step.id);
    /* ‼ סבב 4: שורה שמקבצת כמה חלקים — המצב, השורה שמתחת לשם והכפתור של החלק
       שדורש אותך (summarizeRow). חלק בתוך הפירוט — תמיד המצב שלו עצמו. */
    const group = !isNested ? groupViewByStep?.get(step.id) : undefined;
    /* ‼ 03.10: «ממתין לפרסום» במקום «ממתין ל{שם}» — הלקוח עוד לא רואה אותה, כי הקליטה
       שלה טרם פורסמה. רק כשהיא ממתינה ללקוח/לבן הזוג: פעולה שלך או בעיה נשארות כמו שהן,
       ושורה שמקבצת כמה חלקים — מצב הקבוצה. ‼ לא ב«ייצוג בביטוח לאומי»: שם ממתינים לאישור
       באתר ביטוח לאומי (ההוראות יוצאות במייל), לא לדף. */
    const awaitingPage = pageWaitsPublish && !group && !locked
      && a?.kind === 'waiting' && (!a.waitingOn || a.waitingOn === 'client' || a.waitingOn === 'spouse');
    const st: RowState = group?.state ?? state ?? (awaitingPage ? { text: 'ממתין לפרסום', tone: 'amber' } : rowStateFor({
      kind: a?.kind === 'mine' ? 'mine' : a?.kind === 'internal' ? 'internal' : isStepOpen(step.status) ? 'waiting' : 'done',
      tone: a?.tone === 'red' ? 'red' : a?.tone === 'blue' ? 'blue' : 'gray',
      waitingOn: a?.waitingOn, status: step.status, draft: draftForClient,
      unsent: unsent && !isDraft && !waitsPublish, needsAttention: step.needsAttention,
      clientFirstName: firstNames?.client, spouseFirstName: firstNames?.spouse,
    }));
    /* ‼ הכפתור של החלק המוביל — רק כשהשורה סגורה. פתוחה ⇒ החלק עצמו גלוי בפירוט עם הכפתור
       שלו, ושני כפתורים זהים זה מעל זה נראים כמו שתי פעולות שונות. */
    const linePrimary = group && group.primary !== undefined ? (open ? null : group.primary) : primary;
    /* ‼ כשיש כפתור שאומר מה לעשות, «לטיפולך» מיותר. אבל מצב שאומר משהו («לחתום ולהוסיף חותמת»,
       «חסרים פרטים»), או כפתור שרק פותח («פתח») — המצב נשאר גלוי. */
    const showState = !(linePrimary && st.tone === 'blue' && st.text === MINE_STATE_TEXT && !group?.navOnly);
    const facts = [
      locked ? lockHint(step, stepById, depParents?.get(step.id)) : draftForClient ? 'טיוטה' : (statusLabel ?? stepStatusLabel(step)),
      draftForClient ? null : progress, age ? `${age} במצב הזה` : null,
      // ‼ ב«שדרוג לייצוג ראשי» התאריך הוא מועד התזכורת שהמשרד קבע — לא יעד.
      step.dueDate ? `${step.stepType === 'representation_upgrade' ? 'תזכורת' : 'יעד'} ${formatDate(step.dueDate, 'list')}` : null, autoLabel,
    ].filter(Boolean) as string[];
    const notes = [
      draftForClient || pageWaitsPublish ? 'הלקוח עוד לא רואה אותה — «פרסם בדף» למעלה' : null,
      hasPendingEdit ? (neverOnClientPage(step) ? 'העריכה תחול ב«פרסם בדף» למעלה' : 'יש עריכה שעוד לא פורסמה בדף') : null,
      unsent && !isDraft && !waitsPublish ? 'בדף, אבל הלקוח עוד לא קיבל עליה מייל' : null,
      step.pendingCancel ? 'תוסר מהדף בפרסום הבא' : null,
      extName ? `גורם חיצוני · ${extName}` : null,
      noteLine ? `חסר לפרטי קשר: ${noteLine}` : null,
      requiredApplies && !isStepRequiredForClose(step) ? 'רשות — לא חוסמת את סגירת הקליטה' : null,
      releases.length > 0 ? `משחרר: ${releases.map(d => rowTitle(d)).join(', ')}` : null,
    ].filter(Boolean) as string[];
    const doToggle = () => (isNested ? toggleChild?.(step.id) : toggle(step.id));
    return (
      <div id={`ob-step-${step.id}`}
        className={['rl-row', open ? 'is-open' : '', highlight ? 'is-highlight' : '', locked ? 'is-locked' : ''].filter(Boolean).join(' ')}>
        <div className="rl-line">
          <button type="button" className="rl-hit" onClick={doToggle} aria-expanded={open}
            title={split.detail ? rowTitle(step) : undefined}>
            {group?.sub || carried || blockNote ? (
              <span className="rl-namecol">
                <span className="rl-name">{split.name}</span>
                {group?.sub && <span className="rl-sub">{group.sub}</span>}
                {/* ‼ «חסום» לבד לא אומר למה — הסיבה שנרשמה ב«סמן כחסום», מתחת לשם (המצב כבר אומר «חסום»). */}
                {blockNote && !open && <span className="rl-sub rl-block">{blockNote}</span>}
                {carried && <span className="rl-sub rl-carried">{carried}</span>}
              </span>
            ) : <span className="rl-name">{split.name}</span>}
            {showState && <span className={`rl-state is-${st.tone}`}>{st.text}</span>}
          </button>
          {linePrimary ? <div className="rl-act">{linePrimary}</div> : !isNested && <span className="rl-act-slot" aria-hidden="true" />}
          {editing && !isNested && <div className="rl-edit">{menu}</div>}
          <button type="button" className="rl-chev" aria-label={open ? 'סגירת הפרטים' : 'פתיחת הפרטים'}
            aria-expanded={open} onClick={doToggle}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9" /></svg>
          </button>
        </div>
        {open && (
          <div className="rl-body">
            {split.detail && <p className="rl-detail">{split.detail}</p>}
            {(facts.length > 0 || autoUnknownLabel) && (
              <div className="rl-facts">
                {facts.join(' · ')}
                {autoUnknownLabel && <span style={{ color: 'var(--warn)', fontWeight: 600 }}>{facts.length ? ' · ' : ''}{autoUnknownLabel}</span>}
              </div>
            )}
            {/* ‼ «לא ידוע אם המייל יצא» — למה, ומה הצעד הבטוח (לא «נשלח» ולא «נכשל»). */}
            {autoUnknownHint && <p className="rl-warn-note">{autoUnknownHint}</p>}
            {blockNote && <p className="rl-block-note">חסום: {blockNote}</p>}
            {notes.length > 0 && <ul className="rl-notes">{notes.map(n => <li key={n}>{n}</li>)}</ul>}
            {always}
            {children}
            {note && <p className={`rl-row-note${note.err ? ' is-err' : ''}`} role="status">{note.text}</p>}
            {editorHere}
            {/* ‼ הפעולות של הבקשה עצמה — לפני החלקים שלה, כדי שיהיה ברור על מה הן פועלות. */}
            {!editing && menu && nested && <div className="rl-foot">{menu}</div>}
            {nested && (
              <div className="rl-steps">
                <div className="rl-steps-title">{nestedTitleByStep?.get(step.id) ?? 'שלבים בבקשה הזאת'}</div>
                <NestedRowContext.Provider value={true}>{nested}</NestedRowContext.Provider>
              </div>
            )}
            {!editing && menu && !nested && <div className="rl-foot">{menu}</div>}
          </div>
        )}
      </div>
    );
  }

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
              {/* ‼ ומופיעה רק כשיש קליטה: «רשות» מול «נדרש» הוא הבדל ביחס
                  לסגירת קליטה, וללקוח שאין לו קליטה אין כאן מה לומר. */}
              {requiredApplies && !isStepRequiredForClose(step) && <span className="ob-optional">רשות</span>}
              {extName && <span className="ob-pill is-ext">גורם חיצוני · {extName}</span>}
              {/* ‼ טיוטה = הבקשה מוכנה אצלי והלקוח עוד לא רואה אותה. בלי הסימון
                  הזה אין דרך לדעת אם ביקשתי בפועל או רק הכנתי.
                  ‼ מסלול הרו"ח הקודם יוצא מהכלל: הוא לא מופיע בדף הלקוח לעולם,
                  ולכן "טרם פורסם ללקוח" חסר משמעות שם — והוא סתר את "נשלח". */}
              {isDraft && portalShowsStep(step.stepType) && (
                <span className="ob-pill is-draft">טיוטה</span>
              )}
              {pageWaitsPublish && <span className="ob-pill is-draft">ממתין לפרסום</span>}
              {/* ‼ עריכה ממתינה: הלקוח ממשיך לראות את הנוסח הישן עד "עדכן את
                  דף הלקוח". בלי הסימון, עריכה נראית כאילו כבר פורסמה. */}
              {hasPendingEdit && <span className="ob-pill is-draft">עריכה ממתינה</span>}
              {unsent && !isDraft && !waitsPublish && <span className="ob-pill is-unsent" title="הבקשה בדף האישי, אבל הלקוח עוד לא קיבל עליה מייל - נכללת ב«שלח מייל»">בדף, בלי מייל</span>}
              {step.pendingCancel && <span className="ob-pill is-draft">יוסר בעדכון</span>}
            </div>
            <div className="ob-card-meta">{statusSentence}</div>
            {carried && <div className="ob-card-dim">{carried}</div>}
            {(dimParts.length > 0 || autoUnknownLabel || noteLine || (step.needsAttention && !danger && step.status !== 'in_progress')) && (
              <div className="ob-card-dim">
                {dimParts.join(' · ')}
                {autoUnknownLabel && (
                  <span style={{ color: 'var(--warn)' }}>{dimParts.length ? ' · ' : ''}{autoUnknownLabel}</span>
                )}
                {noteLine && (
                  <span style={{ color: 'var(--warn)' }}>
                    {dimParts.length ? ' · ' : ''}חסר לפרטי קשר: {noteLine}
                  </span>
                )}
                {/* ‼ v3: "דורש טיפול" באדום רק כשזו בעיה; "הלקוח סיים" הוא כחול
                    ונאמר במשפט המצב. */}
                {step.needsAttention && !danger && step.status !== 'in_progress' && (
                  <span style={{ color: 'var(--warn)' }}>
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
        <div className="ob-card-actions">{primary}{menu}</div>
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
          {note && <p className={`rl-row-note${note.err ? ' is-err' : ''}`} role="status">{note.text}</p>}
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

