// ─── מצב הלקוח · מקור אחד לכל המסכים ────────────────────────────────────────
// הביקורת (docs/AUDIT-STATE-CONSISTENCY-2026-09-04.md) מצאה תשע דרכים שונות
// לחשב "האם הלקוח מיוצג", שני מסננים שונים ל"ההתקשרות הנוכחית", והשוואה אחת
// מול **תווית עברית**. כשאותה עובדה מחושבת בכמה מקומות, מסך אחד אומר "מיוצג
// פעיל" בזמן שהשני מציע "לפתוח ייצוג" — וזה קרה בפועל.
//
// הקובץ הזה הוא הבית של העובדות האלה. הוא אינו מנוע ואינו שכבה: ארבע פונקציות
// טהורות מעל נתונים שכבר נטענו, בלי שאילתה נוספת.
//
// ‼ שני מחזורי חיים נפרדים, והכרעת המוצר (2026-09-04) היא שהם נשארים נפרדים:
//   · מחזור חיי הייצוג   — של הלקוח. נגזר מבקשת הייצוג, ונשמר על הכרטיס.
//   · מחזור חיי הקליטה   — של ההתקשרות. נגזר מ-engagements.
//   בקשה אינה משנה אף אחד מהם, ולעולם לא מגדירה אותם מחדש.

import type { Client, RepresentationStatus } from '../types/index';
import type { Engagement, OnboardingStep, OnboardingStepType } from '../types/onboarding';
import { isStepOpen } from '../types/onboarding';
import { currentEngagement as selectCurrentEngagement } from '../utils/engagementSelectors';

// ─── קליטה ───────────────────────────────────────────────────────────────────

/**
 * שלושה מצבים, ולא שניים. ההבחנה בין `pending` ל-`none` היא כל ההבדל בין
 * "עוד אין קליטה" לבין "אין ולא תהיה".
 *
 *   open    — יש התקשרות במצב קליטה. יש מה לסגור.
 *   pending — ליד/בהצעה, או לקוח שחוזר (אין התקשרות נוכחית ונשלחה לו הצעה): הקליטה
 *             עוד תיוולד, והשרת ממילא מחזיק את הבקשות עד אישור ההצעה
 *             (requests_held_until_approval). בקשה שמכינים עכשיו היא בקשת קליטה לכל דבר.
 *   none    — מיוצג בלי התקשרות, התקשרות פעילה או שהסתיימה, לקוח ותיק.
 *             אין מה לסגור, ולכן אין משמעות ל"נדרש לסגירת הקליטה".
 *
 * ‼ בבואה מדויקת של public.client_intake_state בשרת. השרת הוא הסמכות — הוא
 *   זה שכופה את הערך בכתיבה — והעותק כאן קיים רק כדי שהמסך ידע *מראש* מה
 *   להציג, בלי שאילתה לכל לקוח. הבדיקה
 *   scripts/staging-test-domain-invariants.mjs משווה את השניים על כל מצב.
 */
export type IntakeState = 'open' | 'pending' | 'none';

export interface IntakeContext {
  state: IntakeState;
  /** ההתקשרות שנמצאת בקליטה. קיים רק ב-`open`. */
  engagementId?: string;
}

/** ההתקשרות הנוכחית: בקליטה או פעילה.
 *  ‼ מסנן אחד. קודם היו שניים — אחד סינן רק 'cancelled' והשני גם
 *  'ended'/'scheduled' — ולכן אותו לקוח קיבל processPublished שונה לפי המסך
 *  שממנו נפתח החלון. ואז היו שוב שניים: זה כאן בלי סינון תאריך, וזה
 *  ב-engagementSelectors עם (וההערה כאן טענה "זהה לשרת" בזמן שלא). מ-168
 *  יש הגדרה אחת — utils/engagementSelectors — וכאן רק מאצילים אליה. */
export function currentEngagement(
  clientId: string, engagements: Engagement[] | undefined,
): Engagement | undefined {
  return selectCurrentEngagement(engagements ?? [], clientId);
}

/** הצעת מחיר כפי שההחזקה צריכה אותה — ללקוח (clientId) או לליד שהומר אליו (leadId). */
export interface IntakeQuote { clientId?: string; leadId?: string; status: string }

/** ההצעות של הלקוח — מה שצריך כדי לדעת אם הבקשות מוחזקות עד אישור (217, D2). */
export interface IntakeQuotes {
  /** הצעות המחיר (אפשר את כולן — מסוננות כאן לפי הלקוח והלידים שלו). */
  quotations?: IntakeQuote[];
  /** הלידים שהומרו ללקוח הזה (leads.converted_client_id). */
  leadIds?: string[];
}

/**
 * «הבקשות מוחזקות עד אישור ההצעה» — ‼ בבואה מדויקת של public.requests_held_until_approval
 * (217, D2): ליד/בהצעה; או — אין התקשרות נוכחית, ויש הצעה שנשלחה/נצפתה, ללקוח עצמו
 * או לליד שהומר אליו. צר במכוון: לקוח פעיל עם הצעה לעדכון הסכם — לא מוחזק.
 * בלי quotes — רק הכלל הישן (ליד/בהצעה).
 */
export function requestsHeldUntilApproval(
  client: Pick<Client, 'id' | 'lifecycleStage'>, engagements: Engagement[] | undefined, quotes?: IntakeQuotes,
): boolean {
  const stage = client.lifecycleStage;
  if (stage === 'lead' || stage === 'quoted') return true;
  if (currentEngagement(client.id, engagements)) return false;
  const leads = new Set(quotes?.leadIds ?? []);
  return (quotes?.quotations ?? []).some(q => (q.status === 'sent' || q.status === 'viewed')
    && (q.clientId === client.id || (!!q.leadId && leads.has(q.leadId))));
}

export function intakeContext(
  client: Pick<Client, 'id' | 'lifecycleStage'>, engagements: Engagement[] | undefined, quotes?: IntakeQuotes,
): IntakeContext {
  const open = (engagements ?? [])
    .filter(e => e.clientId === client.id && e.status === 'onboarding')
    .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))[0];
  if (open) return { state: 'open', engagementId: open.id };
  if (requestsHeldUntilApproval(client, engagements, quotes)) return { state: 'pending' };
  return { state: 'none' };
}

/** האם «נדרש לסגירת הקליטה» הוא בכלל מושג עבור הלקוח הזה.
 *  ‼ זה מה שקובע אם הפקד מוצג — לא סוג הבקשה ולא מצב הייצוג. */
export const intakeAcceptsRequired = (ctx: IntakeContext): boolean => ctx.state !== 'none';

/** יש קליטה פתוחה שאפשר לסגור עכשיו. */
export const hasOpenIntake = (ctx: IntakeContext): boolean => ctx.state === 'open';

// ─── ייצוג ───────────────────────────────────────────────────────────────────

/**
 * שלושה מצבים, ולא "פעיל או לא".
 *
 * ‼ הבאג שזה מחליף: `client.representationStatus ?? 'active'`. לקוח שמעולם לא
 *   נפתח לו ייצוג הוצג כ"מיוצג פעיל" — כי היעדר ערך פורש כ"פעיל". באותו זמן
 *   מסכים אחרים בדקו `!!client.representationStatus` והציגו "לפתוח ייצוג".
 *   אותו לקוח, שתי תשובות הפוכות, באותה שנייה.
 */
export type RepresentationState = 'not_represented' | 'in_process' | 'active';

const IN_PROCESS: RepresentationStatus[] = [
  'pending_fill', 'awaiting_accountant', 'pending_signature',
  'awaiting_stamp', 'awaiting_authorities',
];

export function representationState(
  client: Pick<Client, 'representationStatus'>,
): RepresentationState {
  const s = client.representationStatus;
  if (!s) return 'not_represented';
  if (s === 'active') return 'active';
  return IN_PROCESS.includes(s) ? 'in_process' : 'not_represented';
}

/** מיוצג בפועל. ‼ הכרעת מוצר: מרגע שזה true הוא נשאר true — אין מסלול ביטול. */
export const isRepresented = (client: Pick<Client, 'representationStatus'>): boolean =>
  representationState(client) === 'active';

/** תהליך ייצוג פתוח כרגע. */
export const representationInProcess = (client: Pick<Client, 'representationStatus'>): boolean =>
  representationState(client) === 'in_process';

/** אפשר לפתוח בקשת ייצוג חדשה. ‼ לקוח שכבר מיוצג — לא: ייצוג של אדם או רשות
 *  נוספים הוא בקשה רגילה במסע, ואינו נוגע בייצוג של הלקוח הראשי. */
export const canStartRepresentation = (client: Pick<Client, 'representationStatus'>): boolean =>
  representationState(client) === 'not_represented';

// ─── ברירות המחדל של בקשה חדשה ──────────────────────────────────────────────

export interface RequestDefaults {
  /** הערך ההתחלתי של «נדרש לסגירת הקליטה». */
  requiredForClose: boolean;
  /** האם להציג את הפקד בכלל. */
  showRequiredControl: boolean;
  /** האם הבקשה תיפתח ללקוח מיד. */
  sendNow: boolean;
  /** האם יש כאן בחירה, או שהשרת מכריע ממילא. */
  showSendControl: boolean;
}

/**
 * מקור אחד לשתי נקודות הכניסה (הקטלוג והקומפוזר). ה-UX שלהן שונה בכוונה —
 * אחת מוסיפה בלחיצה, השנייה מרכיבה טיוטה — אבל הכללים העסקיים זהים.
 *
 * ‼ `awaitingQuoteApproval` אינו בחירה: השרת מחזיק כל בקשה כזאת עד אישור
 *   ההצעה (מיגרציה 135), והמסך רק אומר את זה מראש במקום שיתגלה בדיעבד.
 */
export function requestDefaults(opts: {
  intake: IntakeContext;
  /** התהליך כבר נפתח ללקוח בדף האישי. */
  processPublished: boolean;
  /** שליחת מסמך אינה עבודה של הלקוח, ולכן אינה חוסמת סגירה. */
  isDocumentSend?: boolean;
  /** הקומפוזר נולד תמיד כטיוטה, ומפרסם ב"עדכן את דף הלקוח". */
  alwaysDraft?: boolean;
}): RequestDefaults {
  const show = intakeAcceptsRequired(opts.intake);
  const awaitingQuote = opts.intake.state === 'pending';
  return {
    showRequiredControl: show,
    requiredForClose: show && !opts.isDocumentSend,
    showSendControl: !opts.alwaysDraft && opts.processPublished && !awaitingQuote,
    sendNow: opts.alwaysDraft ? false : (!opts.processPublished || !!opts.isDocumentSend),
  };
}

// ─── חסימת סגירה ─────────────────────────────────────────────────────────────

/**
 * האם השלב מציג בכלל תווית «נדרש/רשות». מחוץ לקליטה — לא: התווית מבטיחה
 * משהו על סגירה שלא תקרה.
 */
export function showsRequiredFlag(intake: IntakeContext, step: Pick<OnboardingStep, 'status'>): boolean {
  return intakeAcceptsRequired(intake) && step.status !== 'cancelled';
}

// ─── לקוח שחוזר: בקשה אחת לכל התקשרות (217) ───────────────────────────────

/**
 * סוגי בקשה שנפתחים מחדש בכל התקשרות (הכרעת גיא D4): מסמכים, שלושת חלקי
 * «חומרים מרו״ח קודם», השאלון והרשאת התשלום. כל השאר — פעם אחת ללקוח.
 * ‼ חייב להתאים ל-public.per_engagement_step_types() בשרת (217) — שינוי כאן, שם.
 */
export const PER_ENGAGEMENT_STEP_TYPES: OnboardingStepType[] = [
  'client_documents', 'prev_accountant_details', 'release_letter', 'materials_received',
  'intake_questionnaire', 'retainer_authorization',
];

const isPerEngagement = (type: string): boolean =>
  (PER_ENGAGEMENT_STEP_TYPES as string[]).includes(type);

/**
 * השלב של העבודה **הנוכחית** מסוג מסוים: פתוח קודם, אחר כך של ההתקשרות הנוכחית,
 * אחר כך החדש ביותר. ‼ במקום `steps.find(type)` — שאצל לקוח שחוזר תפס את השלב
 * הישן שהושלם (המיון הוא לפי סדר ותאריך יצירה עולה).
 */
export function stepForCurrentWork(
  steps: OnboardingStep[], type: string, currentEngagementId?: string | null,
): OnboardingStep | undefined {
  const rank = (s: OnboardingStep) =>
    (isStepOpen(s.status) ? 2 : 0) + (currentEngagementId && s.engagementId === currentEngagementId ? 1 : 0);
  return steps
    .filter(s => s.stepType === type && s.status !== 'cancelled')
    .sort((a, b) => rank(b) - rank(a) || (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))[0];
}

/**
 * האם אי אפשר להוסיף עוד בקשה מהסוג הזה (הקטלוג מסתיר אותה). ‼ אותו כלל כמו
 * step_type_exists ב-create_onboarding_request (217): סוג שנפתח בכל התקשרות
 * תפוס כשיש אחד פתוח, או אחד (לא מבוטל) בהתקשרות הנוכחית — ובלי התקשרות, אחד
 * שעוד לא שויך. כל סוג אחר — תפוס כשיש אחד לא מבוטל, איפה שהוא.
 */
export function stepTypeTaken(
  steps: OnboardingStep[], type: string, currentEngagementId?: string | null,
): boolean {
  const live = steps.filter(s => s.stepType === type && s.status !== 'cancelled');
  if (!isPerEngagement(type)) return live.length > 0;
  return live.some(s => isStepOpen(s.status)
    || (currentEngagementId ? s.engagementId === currentEngagementId : !s.engagementId));
}

/**
 * מכתב השחרור שנשאר פני הכרטיס אחרי שנסגר — כשהחומרים שלו עוד נאספים.
 * ‼ «שלו»: החומרים שתלויים במכתב, ובלי תלות ידועה — מאותה התקשרות. מכתב ישן
 * שהושלם בהתקשרות קודמת לא קם לתחייה כשנפתח מסלול חדש אצל לקוח שחוזר.
 */
export function releaseLetterAnchors(
  letter: OnboardingStep, steps: OnboardingStep[], depParents?: Map<string, string[]>,
): boolean {
  if (letter.stepType !== 'release_letter' || isStepOpen(letter.status) || letter.status === 'cancelled') return false;
  return steps.some(o => {
    if (o.stepType !== 'materials_received' || !isStepOpen(o.status)) return false;
    const parents = depParents?.get(o.id) ?? (o.dependsOnStepId ? [o.dependsOnStepId] : []);
    if (parents.length > 0) return parents.includes(letter.id);
    return (o.engagementId ?? null) === (letter.engagementId ?? null);
  });
}
