// ─── «אצל מי הפעולה הבאה» — ההגדרה האחת של מסך הבקשות ─────────────────────────
// המודל המאושר (docs/prototypes/requests-v3-responsibility-v1.html):
//   לטיפולי  — יש כאן כפתור שצריך ללחוץ עכשיו (כחול; אדום כשזו בעיה אמיתית).
//   ממתינים  — אין מה לעשות עכשיו; מוצג אצל מי ומאז מתי (אפור).
//   העבודה שלי — עבודה פנימית של המשרד, לא בקשה מלקוח.
//   עבר      — הושלם.
//
// ‼ status/ball הם קלט, לא פלט: המסך לעולם לא מציג אותם כמו שהם. "הכדור אצלי"
// במסד נכתב מארבע סיבות שונות (החלטה אמיתית, עבודה פנימית, המתנה לפייפרלס,
// מראה של מסלול ביצוע) — וכאן הן מתפצלות למה שהרו"ח באמת צריך לדעת.
//
// ‼ מקור אחד לכל המונים: התג על לשונית «בקשות», מקטע «לטיפולי», ומסך המשימות
// קוראים את אותה פונקציה. מונה שסופר לפי הגדרה משלו הוא הבאג שהמהלך הזה תיקן
// (ראה docs/FINDINGS-REQUESTS-PAGE-MODEL-2026-09-19.md §C).
// ‼ (סבב 4) התג סופר **תהליכים** — שורות ברשימה, אחרי הקיבוץ (clientFacingRows):
// ייצוג עם שני חלקים שדורשים אותך הוא 1, לא 2; שרשרת פייפרלס היא 1.

import type { NiTracking, RepresentationStatus } from '../types';
import type { OnboardingStep, OnboardingStepType } from '../types/onboarding';
import { isStepOpen } from '../types/onboarding';
import type { AutomationJob } from '../types/automation';
import { OPEN_AUTOMATION_STATUSES } from '../types/automation';
import type { RepSendPhase } from './representationAction';
import { onClientPageFrom, type GateEngagement } from './clientPageGate';
import {
  buildClientFacingRows, summarizeRow, type ClientFacingRow, type RowSummary,
  isManualInternal, isSpouseConfirmTask, isCreationProblem, isLegacyInternalReview,
  neverOnClientPage, hasClientContent, representationRequestOf, isStaleRepresentationPart,
  belongsToRepresentationRequest, SURFACE_HIDDEN_OFFICE_TYPES,
} from './clientFacingRows';
import { niTrackNeedsSend } from './authorityRepresentationRow';

// ‼ ההגדרות של «מה השורה הזאת» יושבות ב-clientFacingRows (בלי מעגל ייבוא) —
// המסכים ממשיכים לייבא אותן מכאן.
export { isManualInternal, isSpouseConfirmTask, isCreationProblem, isLegacyInternalReview, neverOnClientPage, hasClientContent };

export type AttentionKind = 'mine' | 'waiting' | 'internal' | 'done';
export type AttentionTone = 'blue' | 'gray' | 'red';
/** אצל מי ממתינים — קובע את תת-הכותרת במקטע «ממתינים». */
export type WaitingOn = 'client' | 'spouse' | 'paperless' | 'authority' | 'prev_accountant' | 'external' | 'pivo' | 'locked';

export interface Attention {
  kind: AttentionKind;
  tone: AttentionTone;
  waitingOn?: WaitingOn;
}

export interface AttentionContext {
  /** מסלולי הביצוע של ב"ל לפי אדם — מקור המצב של «ייצוג ברשות» (157). */
  niExecution?: { client?: NiTracking; spouse?: NiTracking };
  /** מצב בקשת הייצוג — מקור המצב של שלב «ייצוג מול הרשויות». */
  repStatus?: RepresentationStatus | null;
  /** הטופס מוכן אבל מייל החתימה לא יצא ('unsent') — הפעולה אצלך, לא אצל הלקוח. */
  repSendPhase?: RepSendPhase | null;
  /**
   * בקשת הייצוג הנוכחית של הלקוח — קובעת מה מתקבץ תחת «ייצוג מול הרשויות».
   * undefined = לא ידוע (השולחן) ⇒ כל חלק מתקבץ תחת ההורה הפתוח.
   */
  representationRequestId?: string | null;
  /** משימות אוטומציה חיות של הלקוח (ב"ל) — לפי תפקיד. */
  niJobs?: { client?: AutomationJob | null; spouse?: AutomationJob | null };
  /**
   * אישור הייצוג באזור האישי **נדרש** (שע״ם מציגה «ממתין לאישור לקוח» — requiredBy 'shaam')
   * והלקוח עוד לא דיווח שאישר: מי צריך לאשר. «ייצוג מול הרשויות» ממתין לו — לא לרשות.
   * ‼ השלב עצמו (rep_client_approval) נשאר מחוץ לרשימה (הכרעת גיא); הוא רק מניע את מצב ההורה.
   * חסר/null ⇒ לא נדרש.
   */
  repApprovalWaitingOn?: 'client' | 'spouse' | null;
  /**
   * אנשים בלי שלב «ייצוג ברשות» (קליטה ראשונה — מסלול ב"ל חי רק בביצוע) שיש להם אסמכתא
   * וההוראות שלהם עוד לא יצאו: שורת «ביטוח לאומי · {שם}» בפירוט הייצוג, עם «שלח הוראות».
   * ‼ חלק שדורש אותך בשורת «ייצוג מול הרשויות» — נספר בתג כמו כל חלק אחר (rowSummary).
   */
  niSendWithoutStep?: ('client' | 'spouse')[];
}

/** שלבים שמסך אחר מנהל — לא מוצגים במשטח הבקשות בשום מקטע (ראה clientFacingRows). */
const EXECUTION_OWNED: OnboardingStepType[] = ['rep_client_approval'];

/** מוצג במשטח הבקשות? יישור קו מיוצג בכרטיס קבוע אחד ב«העבודה שלי». */
export function isOnRequestsSurface(step: Pick<OnboardingStep, 'stepType' | 'status'>): boolean {
  if (step.status === 'cancelled') return false;
  // ‼ «שדרוג לייצוג ראשי» כן מוצג — חלק של הייצוג (SURFACE_HIDDEN_OFFICE_TYPES).
  if (SURFACE_HIDDEN_OFFICE_TYPES.includes(step.stepType)) return false;
  if (EXECUTION_OWNED.includes(step.stepType)) return false;
  if (step.stepType.startsWith('institution_alignment_')) return false;
  return true;
}

/**
 * שלב שמוצג כשורה ברשימת הבקשות (ולא ב«עבודה פנימית»): כל מה שעל המשטח, חוץ
 * ממשימה פנימית — אבל משימת האישור האישי ו«לא נוצרה» הן כן שורות.
 * ‼ אותה הגדרה לתג, לשולחן, ל«מה עכשיו» ולרשימה עצמה.
 */
export const isRequestRowStep = (s: OnboardingStep): boolean =>
  isOnRequestsSurface(s) && (!isManualInternal(s) || isSpouseConfirmTask(s) || isCreationProblem(s));

/**
 * הגשת טופס חכם (206) — המצב נגזר ממה שהשרת כתב ב-payload.smartForm (היטל של
 * smart_form_filings). ממתינים = אצל הלקוח/בן-הזוג/הרשות; כל השאר = פעולה שלי.
 */
function smartFormAttention(step: OnboardingStep): Attention {
  const sf = step.payload?.smartForm as { state?: string; waitingOn?: string } | undefined;
  switch (sf?.state) {
    case 'waiting_client_info':
    case 'awaiting_client_submission':
      return { kind: 'waiting', tone: 'gray', waitingOn: 'client' };
    case 'awaiting_signatures':
      return { kind: 'waiting', tone: 'gray', waitingOn: sf.waitingOn === 'spouse' ? 'spouse' : 'client' };
    case 'submitted':
      return { kind: 'waiting', tone: 'gray', waitingOn: 'authority' };
    default:
      return { kind: 'mine', tone: 'blue' };
  }
}

const todayIso = () => new Date().toISOString().slice(0, 10);

/**
 * הוראות האישור של ב"ל ייצאו **עם בקשת החתימה** — כמו במרכז הייצוג: הבקשה פתוחה
 * ומייל החתימה עוד לא יצא. אז אין «שלח הוראות» נפרד (מייל שני לאותו אדם).
 */
export function niRidesWithSignature(ctx: Pick<AttentionContext, 'repStatus' | 'repSendPhase'>): boolean {
  const s = ctx.repStatus;
  return s === 'pending_fill' || s === 'awaiting_accountant' || (s === 'pending_signature' && ctx.repSendPhase === 'unsent');
}

function niTrackAttention(track: NiTracking | undefined, job: AutomationJob | null | undefined, ridesWithSignature: boolean): Attention {
  if (track?.confirmedAt) return { kind: 'done', tone: 'gray' };
  if (track?.deadline && !track.confirmedAt && track.deadline < todayIso()) return { kind: 'mine', tone: 'red' };
  // ‼ PIVO עובד ⇒ ממתינים, גם כשה-ball במסד אומר "אצלי". נתקע ⇒ אדום, עם
  // פעולת ההתאוששות הקיימת (התחברות והרצה מחדש) על הכרטיס.
  if (job && (job.status === 'queued' || job.status === 'running')) return { kind: 'waiting', tone: 'gray', waitingOn: 'pivo' };
  if (job && job.status === 'needs_human' && !track?.instructionsSentAt) return { kind: 'mine', tone: 'red' };
  if (track?.instructionsSentAt) {
    // נשלח למבוטח — ממתינים לאישור שלו. job תקוע בבדיקה אינו חוסם אותו.
    return { kind: 'waiting', tone: 'gray' };
  }
  // ‼ אסמכתא שתצא עם בקשת החתימה — אין כאן פעולה נפרדת (מרכז הייצוג אומר אותו דבר).
  if (track?.referenceNumber && ridesWithSignature) return { kind: 'waiting', tone: 'gray' };
  // אסמכתא בלי הוראות = החלטה שלי (לשלוח); בלי אסמכתא = להזין (אוטומציה) — שתיהן פעולה.
  return { kind: 'mine', tone: 'blue' };
}

function repStatusAttention(status: RepresentationStatus, phase?: RepSendPhase | null): Attention {
  switch (status) {
    case 'awaiting_accountant':
    case 'awaiting_stamp': return { kind: 'mine', tone: 'blue' };
    // ‼ הטופס מוכן והמייל לא יצא ⇒ «לשלוח ללקוח לחתימה» — אצלך, לא אצל הלקוח.
    case 'pending_signature': return phase === 'unsent' ? { kind: 'mine', tone: 'blue' } : { kind: 'waiting', tone: 'gray', waitingOn: 'client' };
    case 'pending_fill': return { kind: 'waiting', tone: 'gray', waitingOn: 'client' };
    case 'awaiting_authorities': return { kind: 'waiting', tone: 'gray', waitingOn: 'authority' };
    case 'active': return { kind: 'done', tone: 'gray' };
  }
}

const ballWaiting = (ball: OnboardingStep['ball']): WaitingOn =>
  ball === 'authority' ? 'authority'
  : ball === 'prev_accountant' ? 'prev_accountant'
  : ball === 'external' ? 'external'
  : ball === 'system' ? 'pivo'
  : 'client';

/**
 * מה המקטע והצבע של שלב אחד. ‼ זו הפונקציה היחידה שמותר לגזור ממנה "כחול".
 */
export function stepAttention(step: OnboardingStep, ctx: AttentionContext = {}): Attention {
  if (!isStepOpen(step.status)) return { kind: 'done', tone: 'gray' };
  if (!isOnRequestsSurface(step)) return { kind: 'internal', tone: 'gray' };
  if (step.status === 'blocked' || step.status === 'failed') return { kind: 'mine', tone: 'red' };
  if (step.status === 'locked') return { kind: 'waiting', tone: 'gray', waitingOn: 'locked' };

  switch (step.stepType) {
    case 'representation':
      // ‼ שע״ם ממתינה לאישור באזור האישי — הכדור אצל מי שצריך לאשר, לא אצל הרשות.
      if (ctx.repStatus === 'awaiting_authorities' && ctx.repApprovalWaitingOn) {
        return { kind: 'waiting', tone: 'gray', waitingOn: ctx.repApprovalWaitingOn };
      }
      return ctx.repStatus ? repStatusAttention(ctx.repStatus, ctx.repSendPhase) : defaultByBall(step);

    case 'representation_upgrade':
      // ‼ תזכורת לטווח ארוך: דורש אותך רק כשהגיע הזמן (המועד עבר, או שהרו״ח הקודם השלים
      // את מה שנשאר אצלו — שניהם מרימים needs_attention). עד אז — «בהמשך», לא «ממתין ל…».
      return step.needsAttention ? { kind: 'mine', tone: 'blue' } : { kind: 'waiting', tone: 'gray', waitingOn: 'locked' };

    case 'authority_representation': {
      // ‼ חלק של בקשת ייצוג קודמת: מסלול ב"ל שבמסך הוא של הבקשה הנוכחית — לא שלו. המצב
      // שלו מסונכרן בשרת מהבקשה שלו; בבקשה הנוכחית הוא לא דורש אותך ואינו ממתין לאיש.
      if (isStaleRepresentationPart(step, ctx.representationRequestId)) return { kind: 'waiting', tone: 'gray' };
      const role = step.payload?.subjectRole === 'spouse' ? 'spouse' : 'client';
      // ‼ «עם בקשת החתימה» רק לחלק של בקשת הייצוג הפתוחה — לא לבקשה ישנה.
      const ownReq = ctx.representationRequestId === undefined
        || (!!ctx.representationRequestId && representationRequestOf(step) === ctx.representationRequestId);
      const a = niTrackAttention(ctx.niExecution?.[role], ctx.niJobs?.[role], ownReq && niRidesWithSignature(ctx));
      if (a.kind === 'waiting' && !a.waitingOn) a.waitingOn = role;
      if (a.kind === 'done') return { kind: 'waiting', tone: 'gray', waitingOn: 'authority' }; // אושר אך השלב טרם סונכרן
      return a;
    }

    case 'retainer_authorization':
      // ‼ המסד אומר "אצלי", אבל מי שמחזיק את הכדור הוא פייפרלס (מבקשת מהלקוח
      // כרטיס). "הסדר ידני" הוא באמת עבודה של המשרד — נשאר לטיפולי.
      if (step.payload?.method === 'manual_arrangement') return { kind: 'mine', tone: 'blue' };
      return { kind: 'waiting', tone: 'gray', waitingOn: 'paperless' };

    case 'custom_request':
      if (step.payload?.smartForm) return smartFormAttention(step);
      // ‼ «לא נוצרה» — בעיה אמיתית של המשרד: אדום, גם כשהשלב במסלול עוד לא נפתח.
      if (isCreationProblem(step)) return { kind: 'mine', tone: 'red' };
      if (step.payload?.personalConfirmFor) return { kind: 'mine', tone: 'blue' };
      // ‼ משימה ישנה בלי תוכן שעדיין בדף הלקוח — המשרד מחליט (הסתר / ערוך).
      if (isLegacyInternalReview(step)) return { kind: 'mine', tone: 'blue' };
      if (isManualInternal(step)) {
        // ‼ משימה שהועברה ל«ממתין ללקוח» אומרת את זה; אחרת — פשוט פתוחה.
        return step.ball && step.ball !== 'me'
          ? { kind: 'internal', tone: 'gray', waitingOn: ballWaiting(step.ball) }
          : { kind: 'internal', tone: 'gray' };
      }
      if (step.payload?.externalParty) {
        // מייל לגורם חיצוני: עד שיצא — הפעולה שלי; אחרי — ממתינים לו.
        if (step.status === 'waiting_client') return { kind: 'waiting', tone: 'gray', waitingOn: step.payload.externalParty.kind === 'prev_accountant' ? 'prev_accountant' : 'external' };
        return { kind: 'mine', tone: 'blue' };
      }
      // ‼ הלקוח סיים ⇒ portal_submit_step מסמן in_progress+needs_attention — זו
      // בדיקה שלי (כחול), לא תקלה.
      if (step.needsAttention) return { kind: 'mine', tone: 'blue' };
      return { kind: 'waiting', tone: 'gray', waitingOn: 'client' };

    case 'client_documents':
    case 'paperless_tax_authority':
    case 'paperless_invite':
    case 'prev_accountant_details':
      if (step.needsAttention) return { kind: 'mine', tone: 'blue' };
      return { kind: 'waiting', tone: 'gray', waitingOn: 'client' };

    case 'intake_questionnaire':
      // העיתוי הוא של הרו"ח: עד השליחה — לטיפולי; אחריה — אצל הלקוח.
      if (step.status === 'waiting_client') return { kind: 'waiting', tone: 'gray', waitingOn: 'client' };
      if (step.needsAttention) return { kind: 'mine', tone: 'blue' };
      return { kind: 'mine', tone: 'blue' };

    case 'release_letter':
      if (step.status === 'waiting_client') return { kind: 'waiting', tone: 'gray', waitingOn: 'prev_accountant' };
      if (step.needsAttention) return { kind: 'mine', tone: 'blue' };
      return { kind: 'mine', tone: 'blue' };

    case 'materials_received':
      if (step.needsAttention) return { kind: 'mine', tone: 'blue' };
      return { kind: 'waiting', tone: 'gray', waitingOn: 'prev_accountant' };

    default:
      return defaultByBall(step);
  }
}

function defaultByBall(step: OnboardingStep): Attention {
  if (step.needsAttention) return { kind: 'mine', tone: 'blue' };
  if (step.ball === 'me') return { kind: 'mine', tone: 'blue' };
  return { kind: 'waiting', tone: 'gray', waitingOn: ballWaiting(step.ball) };
}

/** דורש אותי עכשיו — כרטיס כחול/אדום ב«לטיפולי». */
export const stepNeedsMe = (step: OnboardingStep, ctx: AttentionContext = {}): boolean =>
  stepAttention(step, ctx).kind === 'mine';

/**
 * השורות ברשימת הבקשות — אחרי הקיבוץ: תהליך אחד = שורה אחת. ‼ אותו קיבוץ
 * שהרשימה מציגה (OnboardingTab) — רק על השלבים הפתוחים.
 */
export function requestRows(steps: OnboardingStep[], ctx: AttentionContext = {}, depParents?: Map<string, string[]>): ClientFacingRow[] {
  return buildClientFacingRows(
    steps.filter(s => isStepOpen(s.status) && isRequestRowStep(s)),
    depParents,
    { representationRequestId: ctx.representationRequestId });
}

/** מצב השורה כולה (דורש אותך אם חלק כלשהו דורש; אדום אם חלק כלשהו אדום). */
export const rowSummary = (row: ClientFacingRow, ctx: AttentionContext = {}): RowSummary =>
  withVirtualParts(summarizeRow(row, s => stepAttention(s, ctx)), row, ctx);

export type RepRole = 'client' | 'spouse';

/** לאדם יש שלב «ייצוג ברשות» (לא מבוטל) של בקשת הייצוג הנוכחית — הוא חלק בפירוט, לא שורת קריאה. */
export function hasCurrentNiStep(steps: OnboardingStep[], role: RepRole, representationRequestId: string | null | undefined): boolean {
  return steps.some(s => s.stepType === 'authority_representation' && s.status !== 'cancelled'
    && (s.payload?.subjectRole === 'spouse' ? 'spouse' : 'client') === role
    && belongsToRepresentationRequest(s, representationRequestId));
}

/**
 * מי מופיע בפירוט «ייצוג מול הרשויות» כשורת קריאה מהביצוע (קליטה ראשונה — מסלול ב"ל חי רק
 * בבקשה): ברשימת ב"ל (targets — כמו ni_targets_of בשרת), בלי שלב של הבקשה הנוכחית, ויש לו מסלול.
 * ‼ אדם שבוטל אינו ברשימה — המסלול שלו נשאר כהיסטוריה (212), לא כ«ממתין לאישור».
 */
export function niTrackOnlyRoles(
  steps: OnboardingStep[], targets: readonly string[], niExecution: AttentionContext['niExecution'],
  representationRequestId: string | null | undefined,
): RepRole[] {
  return (['client', 'spouse'] as const).filter(r => targets.includes(r)
    && !hasCurrentNiStep(steps, r, representationRequestId) && !!niExecution?.[r]);
}

/** …ומהם — מי שההוראות שלו מחכות לשליחה (ctx.niSendWithoutStep). מקור אחד למסך ולתג. */
export function niSendWithoutStepRoles(
  steps: OnboardingStep[], targets: readonly string[],
  ctx: Pick<AttentionContext, 'niExecution' | 'representationRequestId' | 'repStatus' | 'repSendPhase'>,
): RepRole[] {
  const ridesWithSignature = niRidesWithSignature(ctx);
  return niTrackOnlyRoles(steps, targets, ctx.niExecution, ctx.representationRequestId)
    .filter(r => niTrackNeedsSend(ctx.niExecution?.[r], { ridesWithSignature }));
}

/**
 * חלקים בלי שלב: בשורת «ייצוג מול הרשויות», אדם שההוראות שלו לב"ל מחכות לשליחה
 * (ctx.niSendWithoutStep) — השורה דורשת אותך גם כשאף שלב בה לא. ‼ lead נשאר null:
 * אין שלב שמוביל; המסך מציג את השורה של האדם ואת «שלח הוראות».
 */
export function withVirtualParts(sum: RowSummary, row: ClientFacingRow, ctx: AttentionContext = {}): RowSummary {
  if (row.kind !== 'representation' || !ctx.niSendWithoutStep?.length || sum.attn.kind === 'mine') return sum;
  return { ...sum, attn: { kind: 'mine', tone: 'blue' } };
}

/**
 * המספר על תג «בקשות» = **תהליכים** (שורות) ב«לטיפולי». שלבים מוסתרים ועבודה
 * פנימית אינם נספרים — הם לא בקשות מלקוח, ואי אפשר לפתוח אותם מהתג.
 */
export function countRequestsNeedingMe(steps: OnboardingStep[], ctx: AttentionContext = {}): number {
  return requestRows(steps, ctx).filter(r => rowSummary(r, ctx).attn.kind === 'mine').length;
}

/** האם יש בקשה במצב בעיה אמיתית (אדום) — לתג ולמסך המשימות. */
export function hasRedRequest(steps: OnboardingStep[], ctx: AttentionContext = {}): boolean {
  return steps.some(s => isOnRequestsSurface(s) && stepAttention(s, ctx).tone === 'red');
}

/**
 * «בדף מ-…» — רק על מה שבאמת בדף של הלקוח וממתין לו: לא טיוטה, ולא משימה
 * שהשרת לעולם לא מציג בדף (פנימית / אישור אישי).
 * ‼ (03.10) ועם `engagements` — רק כשהשער של הדף פתוח לה (התאום של client_step_gate_open):
 * בקשה של קליטה חדשה שטרם פורסמה אינה «בדף», גם כשפורסמה; ואחרי שהקליטה נפתחה — «בדף
 * מ-» מהפתיחה, לא מהיום שבו הוכנה (onClientPageFrom).
 * בלי `engagements` (מסך שאין לו את ההתקשרויות) — כמו קודם.
 */
export function onClientPageSince(
  step: OnboardingStep, attn: Attention, draft: boolean, engagements?: readonly GateEngagement[],
): string | null {
  if (attn.kind !== 'waiting' || attn.waitingOn !== 'client') return null;
  if (!step.publishedAt || draft || neverOnClientPage(step)) return null;
  return engagements ? onClientPageFrom(step, engagements) : step.publishedAt;
}

export const isLiveJob = (job: AutomationJob | null | undefined): boolean =>
  !!job && OPEN_AUTOMATION_STATUSES.has(job.status);
