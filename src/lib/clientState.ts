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
import type { Engagement, OnboardingStep } from '../types/onboarding';

// ─── קליטה ───────────────────────────────────────────────────────────────────

/**
 * שלושה מצבים, ולא שניים. ההבחנה בין `pending` ל-`none` היא כל ההבדל בין
 * "עוד אין קליטה" לבין "אין ולא תהיה".
 *
 *   open    — יש התקשרות במצב קליטה. יש מה לסגור.
 *   pending — ליד/בהצעה: הקליטה עוד תיוולד, והשרת ממילא מחזיק את הבקשות עד
 *             אישור ההצעה. בקשה שמכינים עכשיו היא בקשת קליטה לכל דבר.
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

/** ההתקשרות הנוכחית: בקליטה או פעילה, החדשה מביניהן.
 *  ‼ מסנן אחד. קודם היו שניים — אחד סינן רק 'cancelled' והשני גם
 *  'ended'/'scheduled' — ולכן אותו לקוח קיבל processPublished שונה לפי המסך
 *  שממנו נפתח החלון. זהה בכוונה ל-current_engagement_id בשרת. */
export function currentEngagement(
  clientId: string, engagements: Engagement[] | undefined,
): Engagement | undefined {
  return (engagements ?? [])
    .filter(e => e.clientId === clientId && (e.status === 'onboarding' || e.status === 'active'))
    .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))[0];
}

export function intakeContext(
  client: Pick<Client, 'id' | 'lifecycleStage'>, engagements: Engagement[] | undefined,
): IntakeContext {
  const open = (engagements ?? [])
    .filter(e => e.clientId === client.id && e.status === 'onboarding')
    .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))[0];
  if (open) return { state: 'open', engagementId: open.id };
  const stage = client.lifecycleStage;
  if (stage === 'lead' || stage === 'quoted') return { state: 'pending' };
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
