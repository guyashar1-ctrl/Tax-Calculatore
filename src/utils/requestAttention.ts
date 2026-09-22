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

import type { NiTracking, RepresentationStatus } from '../types';
import type { OnboardingStep, OnboardingStepType } from '../types/onboarding';
import { isStepOpen, LEGACY_AUTO_OFFICE_TYPES } from '../types/onboarding';
import type { AutomationJob } from '../types/automation';
import { OPEN_AUTOMATION_STATUSES } from '../types/automation';

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
  /** משימות אוטומציה חיות של הלקוח (ב"ל) — לפי תפקיד. */
  niJobs?: { client?: AutomationJob | null; spouse?: AutomationJob | null };
}

/** שלבים שמסך אחר מנהל — לא מוצגים במשטח הבקשות בשום מקטע (ראה clientFacingRows). */
const EXECUTION_OWNED: OnboardingStepType[] = ['rep_client_approval'];

/** מוצג במשטח הבקשות? יישור קו מיוצג בכרטיס קבוע אחד ב«העבודה שלי». */
export function isOnRequestsSurface(step: Pick<OnboardingStep, 'stepType' | 'status'>): boolean {
  if (step.status === 'cancelled') return false;
  if (LEGACY_AUTO_OFFICE_TYPES.includes(step.stepType)) return false;
  if (EXECUTION_OWNED.includes(step.stepType)) return false;
  if (step.stepType.startsWith('institution_alignment_')) return false;
  return true;
}

/** משימה פנימית שהרו"ח הוסיף בעצמו — «העבודה שלי», לא בקשה מלקוח. */
export const isManualInternal = (s: Pick<OnboardingStep, 'stepType' | 'ball'>): boolean =>
  s.stepType === 'custom_request' && s.ball === 'me';

const todayIso = () => new Date().toISOString().slice(0, 10);

function niTrackAttention(track: NiTracking | undefined, job: AutomationJob | null | undefined): Attention {
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
  // אסמכתא בלי הוראות = החלטה שלי (לשלוח); בלי אסמכתא = להזין (אוטומציה) — שתיהן פעולה.
  return { kind: 'mine', tone: 'blue' };
}

function repStatusAttention(status: RepresentationStatus): Attention {
  switch (status) {
    case 'awaiting_accountant':
    case 'awaiting_stamp': return { kind: 'mine', tone: 'blue' };
    case 'pending_fill':
    case 'pending_signature': return { kind: 'waiting', tone: 'gray', waitingOn: 'client' };
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
      return ctx.repStatus ? repStatusAttention(ctx.repStatus) : defaultByBall(step);

    case 'authority_representation': {
      const role = step.payload?.subjectRole === 'spouse' ? 'spouse' : 'client';
      const a = niTrackAttention(ctx.niExecution?.[role], ctx.niJobs?.[role]);
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
      if (isManualInternal(step)) return { kind: 'internal', tone: 'gray' };
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
 * המספר על תג «בקשות» = כרטיסים ב«לטיפולי» שמוצגים בפועל. שלבים מוסתרים
 * ועבודה פנימית אינם נספרים — הם לא בקשות מלקוח, ואי אפשר לפתוח אותם מהתג.
 */
export function countRequestsNeedingMe(steps: OnboardingStep[], ctx: AttentionContext = {}): number {
  return steps.filter(s => isOnRequestsSurface(s) && !isManualInternal(s) && stepNeedsMe(s, ctx)).length;
}

/** האם יש בקשה במצב בעיה אמיתית (אדום) — לתג ולמסך המשימות. */
export function hasRedRequest(steps: OnboardingStep[], ctx: AttentionContext = {}): boolean {
  return steps.some(s => isOnRequestsSurface(s) && stepAttention(s, ctx).tone === 'red');
}

export const isLiveJob = (job: AutomationJob | null | undefined): boolean =>
  !!job && OPEN_AUTOMATION_STATUSES.has(job.status);
