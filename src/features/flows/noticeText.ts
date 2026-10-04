// ─── מה קרה למייל ללקוח — במשפט, בלי קודים ─────────────────────────────────
// ‼ מודול טהור (בלי supabase) — כדי שאפשר יהיה לבדוק אותו בלי דפדפן. api.ts
// מייצא מכאן, והמגש, «שלח בקשות» וחלון התצוגה המקדימה קוראים מכאן.
// ‼ ארבעה דברים שהמסך לא אומר בלי שהשרת אמר:
//   · «לא ידוע אם יצא» אינו «לא נשלח» — אולי יצא. ההכרעה בשורה שבכרטיס הלקוח.
//   · אין תשובה מהשרת (החיבור נפל, שער שלא ענה, תשובה בלי קוד מוכר) — אולי
//     יצא. «לא נשלח» רק על קוד שהשרת מחזיר לפני שמשהו יצא (DEFINITE_FAILURES).
//   · logged:false — המייל יצא, אבל לא נרשם ביומן. אין «נרשם ביומן».
//   · in_flight עם noticeId — המייל הזה עצמו יוצא ממש עכשיו; זה לא כשל. בלי
//     noticeId — מייל **אחר** ללקוח בתנועה (האוטומטי, תזכורת), והמייל הזה לא נשלח.

import { failureReasonText } from '../../lib/providerErrorText';
import { formatDate } from '../../utils/dateFormat';
import type { ReadyUnknownNotice, UnknownCause } from '../../hooks/readyToSendLoader';

export interface NoticeSendResult {
  ok?: boolean;
  alreadySent?: boolean;
  id?: string;
  noticeId?: string;
  logged?: boolean;
  transport?: string;
  error?: string;
  items?: unknown[];
  fingerprint?: string;
  detail?: { message?: string };
}

// ── הכפתורים בשורה «לא ידוע אם יצא המייל» שבמגש — אותן מילים בכל טקסט שמפנה אליהם ──
export const RETRY_SAME_LABEL = 'שלח שוב (אותו מייל)';
/** שחרור בתוך החלון — משני, ומאחורי אישור שמסביר את הכפילות. */
export const RELEASE_ANYWAY_LABEL = 'לשחרר בלי לשלוח…';
/** אחרי יממה — שליחה חוזרת כבר לא בטוחה, ולכן זו הפעולה הראשית. */
export const RELEASE_AFTER_LABEL = 'לשחרר לשליחה מחדש…';
/** הכתובת בכרטיס השתנתה — את הנוסח הישן לא שולחים לכתובת הישנה. */
export const RELEASE_NEW_ADDRESS_LABEL = 'לשחרר לכתובת החדשה…';
/** = SEND_MAIL_LABEL במגש (trayQueue.ts). ‼ לא מייבאים משם: features לא תלוי ב-components. */
const SEND_MAIL = 'שלח מייל…';

/** אותן מילים כמו בשורה שבמגש («לא ידוע אם יצא המייל מ-…») ובכפתור שלה. */
const DECIDE_IN_CARD = `ההכרעה בכרטיס הלקוח, בשורה «לא ידוע אם יצא המייל» — שם «${RETRY_SAME_LABEL}».`;

const LATIN = /[A-Za-z]/;

export const IN_FLIGHT_TEXT = 'נשלח ממש עכשיו מחלון אחר — רעננו בעוד רגע.';
/** in_flight בלי noticeId: השרת סירב כי מייל אחר ללקוח בתנועה — הלחיצה הזו לא שלחה. */
export const OTHER_IN_FLIGHT_TEXT = 'מייל אחר ללקוח יוצא ממש עכשיו — המייל הזה לא נשלח. נסו שוב בעוד רגע.';
export const ALREADY_SENT_TEXT = 'כבר נשלח קודם — לא נשלח שוב.';
export const SENT_LOGGED_TEXT = 'המייל נשלח · נרשם ביומן.';
/**
 * המייל יצא (200 מספק הדואר), אבל הרישום בשרת נכשל — ולכן גם שום דבר לא סומן.
 * ‼ ההמשך: ההודעה נשארת «בשליחה» עד שהחכירה פוקעת (10 דקות), ואז המגש מציג
 * אותה כ«לא ידוע». שחרור שם היה משחרר את הבקשות למייל כפול.
 */
export const SENT_UNLOGGED_TEXT =
  'המייל יצא, אבל לא נרשם ביומן — הבקשות לא סומנו כנמסרו. בעוד כמה דקות הוא יופיע בכרטיס הלקוח בשורה «לא ידוע אם יצא המייל»: '
  + `שם בוחרים «${RETRY_SAME_LABEL}» — הוא לא יישלח פעמיים — ולא «${RELEASE_ANYWAY_LABEL}».`;
/** אין תשובה מהשרת על מייל ללקוח (הודעה) — אולי יצא. */
export const NO_ANSWER_TEXT = 'אין תשובה מהשרת — לא ידוע אם המייל יצא. רעננו בעוד רגע: אם יצא, הבקשות יסומנו כנמסרו.';
/** אותו דבר, בחלון שנשאר פתוח — לחיצה נוספת שם היא אותו מייל (אותו מפתח). */
export const NO_ANSWER_RETRY_TEXT = 'לחיצה נוספת על «שלח ללקוח» כאן לא תשלח אותו פעמיים.';
/** אין תשובה מהשרת על ההוראות לביטוח לאומי — אולי יצאו. */
export const NI_NO_ANSWER_TEXT = 'אין תשובה מהשרת — לא ידוע אם ההוראות יצאו. רעננו בעוד רגע: אם יצאו, הן יסומנו כנשלחו.';
/** אין תשובה מהשרת על מייל אחר (לא הודעה מהדף) — אין מפתח שמונע כפילות. */
export const EMAIL_NO_ANSWER_TEXT = 'אין תשובה מהשרת — לא ידוע אם המייל יצא. רעננו ובדקו ברשימת המיילים של הלקוח לפני ששולחים שוב.';
/** התצוגה המקדימה לא נבנתה — היא לא שולחת דבר, ולכן אין כאן «לא ידוע». */
export const PREVIEW_FAILED_TEXT = 'לא הצלחתי לבנות את התצוגה המקדימה. אפשר לנסות שוב.';

/**
 * קודים שהשרת מחזיר **לפני** שמשהו יצא (send-process-open-email ו-214) — רק
 * עליהם מותר «לא נשלח». כל קוד אחר (הודעת רשת באנגלית, שגיאה כללית 500) — לא ידוע.
 */
const DEFINITE_FAILURES = new Set([
  'in_flight', 'unknown_pending', 'items_changed', 'nothing_to_announce', 'nothing_to_say',
  'no client email', 'no_email', 'resend_failed', 'lost_claim', 'server_not_updated',
  'recipient_changed', 'retry_expired', 'never_sent', 'not_unknown', 'not_queued', 'retry_refused',
  'idempotency_key_conflict', 'forbidden', 'unauthorized', 'not found', 'not_found',
  'client_not_found', 'notice_not_found', 'missing clientId', 'missing noticeId',
  'token_save_failed', 'claim_failed', 'bad_kind', 'bad_origin',
]);

/** השרת אמר במפורש שהמייל לא יצא בלחיצה הזו. */
export function isDefiniteFailure(code: string | null | undefined): boolean {
  return !!code && DEFINITE_FAILURES.has(code);
}

/** הודעת שגיאה לאדם — בלי קודים. */
export function noticeErrorText(r: NoticeSendResult): string {
  switch (r.error) {
    case 'in_flight': return r.noticeId ? IN_FLIGHT_TEXT : OTHER_IN_FLIGHT_TEXT;
    // ‼ השרת מצא את המייל של החלון הזה (אותו מפתח) במצב «לא ידוע» — לחיצה נוספת
    // כאן לא תשלח. השליחה החוזרת של אותו מייל נמצאת רק בשורה שבמגש.
    case 'unknown': return `לא ידוע אם המייל הקודם מהחלון הזה יצא. ${DECIDE_IN_CARD}`;
    case 'unknown_outcome': return `לא ידוע אם המייל יצא (תקלה אצל ספק הדואר), ולכן הבקשות לא סומנו כנמסרו. ${DECIDE_IN_CARD}`;
    case 'unknown_pending': return 'יש מייל קודם שלא ידוע אם יצא, ועד שמכריעים עליו לא יוצא מייל חדש. ההכרעה בכרטיס הלקוח, בשורה «לא ידוע אם יצא המייל».';
    case 'items_changed': return 'משהו השתנה מאז שפתחת את החלון. רעננו את הרשימה — בדקו ושלחו שוב.';
    // ‼ התצוגה המקדימה מחזירה הסבר משלה («אין ללקוח דבר חדש… הדף עודכן») — הוא גובר.
    case 'nothing_to_announce': return r.detail?.message && !/[A-Za-z]{3}/.test(r.detail.message) ? r.detail.message : 'אין מה לשלוח — הכול כבר נמסר ללקוח.';
    case 'no client email':
    case 'no_email': return 'אין כתובת מייל בכרטיס. הבקשות נשארות בדף; אחרי שתוסיפו כתובת אפשר לשלוח.';
    case 'resend_failed': return 'ספק הדואר דחה את המייל' + (r.detail?.message ? ` — ${failureReasonText(r.detail.message)}` : '') + '. שום דבר לא סומן כנשלח — אפשר לנסות שוב.';
    case 'lost_claim': return 'השליחה נקטעה לפני שיצאה. אפשר לנסות שוב.';
    case 'server_not_updated': return 'השרת עוד לא עודכן לגרסה הזו — המייל לא נשלח.';
    // ‼ שני אלה לא משנים את המייל הקודם (217): הוא נשאר «לא ידוע», והבקשות לא שוחררו —
    // השחרור הוא החלטה של המשרד, בשורה שבמגש.
    case 'recipient_changed': return `כתובת המייל בכרטיס השתנתה מאז, ולכן המייל הקודם לא נשלח שוב לכתובת הישנה. ההכרעה בכרטיס הלקוח, בשורה «לא ידוע אם יצא המייל» — שם «${RELEASE_NEW_ADDRESS_LABEL}».`;
    case 'retry_expired': return `עברה יממה מהשליחה הראשונה — ספק הדואר כבר לא יזהה כפילות, ולכן המייל לא נשלח שוב. ההכרעה בכרטיס הלקוח, בשורה «לא ידוע אם יצא המייל» — שם «${RELEASE_AFTER_LABEL}».`;
    case 'never_sent': return 'המייל הקודם לא הגיע לספק הדואר בכלל — הוא סומן «לא נשלח», והבקשות פנויות לשליחה.';
    case 'not_unknown': return 'המצב של המייל כבר הוכרע — רעננו.';
    case 'not_queued': return 'המייל כבר לא בתור — רעננו.';
    case 'idempotency_key_conflict': return 'החלון הזה כבר שימש ללקוח אחר. סגרו ופתחו שוב.';
    case 'nothing_to_say': return 'אין בקשות שממתינות ללקוח ואין עבודה בטיפולכם — אין על מה לעדכן.';
    case 'forbidden': return 'אין הרשאה לשלוח מהחשבון הזה.';
    case 'unauthorized': return 'ההתחברות פגה — היכנסו מחדש. המייל לא נשלח.';
    case 'not found':
    case 'not_found':
    case 'client_not_found':
    case 'notice_not_found': return 'הלקוח או המייל לא נמצאו — רעננו. המייל לא נשלח.';
    default:
      if (isDefiniteFailure(r.error)) return 'המייל לא נשלח — אפשר לנסות שוב.';
      // ‼ אין קוד מהשרת (החיבור נפל, שער שלא ענה) או קוד שלא מוכר — אולי יצא.
      if (r.error) console.warn('[notices] אין קוד מוכר מהשרת — לא ידוע אם יצא:', r.error);
      return NO_ANSWER_TEXT;
  }
}

/**
 * מה קרה בשליחה — מתשובת השרת בלבד.
 * noanswer — אין תשובה מהשרת או קוד לא מוכר: לא ידוע אם יצא. השרת לא סימן
 * הודעה מסוימת כ«לא ידוע», ולכן לחיצה נוספת מאותו חלון (אותו מפתח) בודקת שוב.
 * nothing — אין מה להודיע: הכול כבר נמסר (מחלון אחר, או במייל שיצא לבד). לא נשלח, ולא כשל.
 * busy — מייל **אחר** ללקוח יוצא ממש עכשיו: הלחיצה הזו לא שלחה, אבל זו המתנה ולא כשל.
 */
export type SendOutcome = 'sent' | 'unlogged' | 'already' | 'nothing' | 'inflight' | 'busy' | 'unknown' | 'noanswer' | 'error';

export function sendOutcome(r: NoticeSendResult | null | undefined): SendOutcome {
  if (!r) return 'noanswer';
  if (r.alreadySent) return 'already';
  if (r.ok) return r.logged === false ? 'unlogged' : 'sent';
  // ‼ רק המייל הזה עצמו (noticeId) «יוצא מחלון אחר». מייל אחר בתנועה = הלחיצה הזו לא שלחה — מחכים.
  if (r.error === 'in_flight') return r.noticeId ? 'inflight' : 'busy';
  if (r.error === 'nothing_to_announce') return 'nothing';
  if (r.error === 'unknown' || r.error === 'unknown_outcome') return 'unknown';
  return isDefiniteFailure(r.error) ? 'error' : 'noanswer';
}

/**
 * «שלח שוב (אותו מייל)» במגש. ‼ מייל אחר בתנועה — הניסיון החוזר לא יצא, אבל על
 * המייל המקורי עדיין לא ידוע אם יצא: לא «המייל הזה לא נשלח».
 */
export const RETRY_OTHER_IN_FLIGHT_TEXT = 'מייל אחר ללקוח יוצא ממש עכשיו, ולכן הניסיון החוזר לא יצא. נסו שוב בעוד רגע.';

export function retryErrorText(r: NoticeSendResult | null | undefined): string {
  if (!r) return NO_ANSWER_TEXT;
  if (r.error === 'in_flight' && !r.noticeId) return RETRY_OTHER_IN_FLIGHT_TEXT;
  return noticeErrorText(r);
}

/**
 * תשובה ל«שלח שוב (אותו מייל)» — כשהמשרד כבר עומד בשורה עצמה. ‼ לא «בשורה…, שם
 * «שלח שוב»» (מעגלי), ולא «אפשר לשלוח מחדש» כשהשרת לא שחרר כלום: retry_expired ו-
 * recipient_changed משאירים את המייל «לא ידוע» (217) — ואומרים איזה כפתור עכשיו.
 */
export function trayRetryText(r: NoticeSendResult | null | undefined): string {
  switch (r?.error) {
    case 'unknown_outcome':
      return 'גם הפעם לא התקבלה תשובה ברורה — עדיין לא ידוע אם המייל יצא. אפשר לנסות שוב בעוד כמה דקות.';
    case 'retry_expired':
      return `עברה יממה — ספק הדואר כבר לא יזהה כפילות, ולכן המייל לא נשלח שוב. כדי לשלוח שוב: «${RELEASE_AFTER_LABEL}».`;
    case 'recipient_changed':
      return `הכתובת בכרטיס השתנתה, ולכן המייל הקודם לא נשלח שוב לכתובת הישנה — «${RELEASE_NEW_ADDRESS_LABEL}».`;
    // השרת מצא שאין גוף לשלוח — המייל נעצר לפני ספק הדואר, והשרת שחרר (ראיה, לא ניחוש).
    case 'never_sent':
      return `המייל לא יצא — הוא נעצר לפני ספק הדואר. הבקשות שוחררו — «${SEND_MAIL}» ישלח אותן.`;
    default:
      return retryErrorText(r);
  }
}

/** אחרי שחרור — מה יקרה עכשיו. */
export const RELEASED_TEXT = `הבקשות שוחררו — «${SEND_MAIL}» ישלח אותן מחדש.`;
export const RELEASED_NEW_ADDRESS_TEXT = `הבקשות שוחררו — «${SEND_MAIL}» ישלח אותן לכתובת החדשה.`;

// ─── השורה «לא ידוע אם יצא המייל» במגש ──────────────────────────────────────
// ‼ אף פעם לא «לא נשלח» כעובדה. הדרך הבטוחה — «שלח שוב (אותו מייל)» בתוך החלון
// (אותו מפתח אצל ספק הדואר: אם יצא, לא ייצא שוב). שחרור — תמיד מאחורי אישור
// שמסביר שהבקשות עלולות להגיע פעמיים.

/** למה לא ידוע — משפט לכל סיבה שהשרת קובע (client_ready_to_send). */
export const UNKNOWN_CAUSE_TEXT: Record<UnknownCause, string> = {
  cut_off: 'השליחה התחילה ולא הסתיימה — ייתכן שהמייל יצא.',
  no_answer: 'החיבור לספק הדואר נקטע לפני שהגיעה תשובה.',
  provider_error: 'ספק הדואר ענה בתקלה, בלי לומר אם המייל יצא.',
  provider_busy: 'ספק הדואר עוד טיפל באותו מייל.',
  accepted_no_id: 'ספק הדואר קיבל את המייל, אבל בלי אישור מלא.',
  retry_rejected: 'הניסיון החוזר נדחה — זה לא אומר שהמייל המקורי לא יצא.',
};
/** סיבה שלא מוכרת (או שרת ישן) — בלי לנחש. */
export const UNKNOWN_CAUSE_FALLBACK = 'אין אישור שהמייל יצא.';

/** כמה זמן ספק הדואר מזהה כפילות — כמו בשרת (reclaim_unknown_client_notice). */
export const RETRY_WINDOW_MS = 23 * 3600_000;

/**
 * open — בתוך החלון: «שלח שוב (אותו מייל)» לא ישלח פעמיים.
 * closed — עברה יממה: רק שחרור (שעלול להביא כפילות).
 * recipient — הכתובת בכרטיס השתנתה: רק שחרור לכתובת החדשה.
 * unknown_window — שרת ישן בלי חלון: שליחה חוזרת קודם, ושחרור משני מאחורי אישור.
 */
export type UnknownRowState = 'open' | 'closed' | 'recipient' | 'unknown_window';
export type UnknownAction = 'retry' | 'release';

export interface UnknownRowModel {
  noticeId: string;
  state: UnknownRowState;
  /** «לא ידוע אם יצא המייל מ-{הניסיון הראשון}» */
  title: string;
  /** «{סיבה} הבקשות לא סומנו כנמסרו.» */
  why: string;
  /** עד מתי בטוח לשלוח שוב / למה לא. null — לא ידוע (שרת ישן). */
  window: string | null;
  /** «פרטים» — נפתח לפי צורך, כדי שהשורה תישאר קצרה בטלפון. */
  details: string[];
  primary: { action: UnknownAction; label: string };
  secondary: { action: 'release'; label: string } | null;
  /** לחלונות האישור. */
  firstAt: string;
  to: string | null;
  cardEmail: string | null;
  closedTitles: string[];
}

const clock = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
/** זמן שעבר: «14:05» היום, אחרת «02.10.26 14:05». */
function pastTime(iso: string, now: number): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return sameDay(d, new Date(now)) ? clock(d) : `${formatDate(d, 'list')} ${clock(d)}`;
}
/** זמן שעוד יבוא: «14:05» היום, «מחר 14:05», אחרת תאריך ושעה. */
function futureTime(iso: string, now: number): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const today = new Date(now);
  const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
  if (sameDay(d, today)) return clock(d);
  if (sameDay(d, tomorrow)) return `מחר ${clock(d)}`;
  return `${formatDate(d, 'list')} ${clock(d)}`;
}
const normEmail = (e: string | null | undefined) => (e ?? '').trim().toLowerCase();
const quoteList = (xs: string[]) => xs.map(x => `«${x}»`).join(', ');

/**
 * מה השורה אומרת ואיזה כפתור ראשי — לפי הזמן **עכשיו** (גם בזמן הלחיצה, לא רק בציור).
 * @param cardEmail הכתובת בכרטיס עכשיו (ready.owner.email). undefined — לא ידוע, ואז רק
 *   השרת (recipientChanged) קובע שהכתובת השתנתה.
 * ‼ שרת ישן (בלי retryUntil/cause/toEmail): `at` הוא הניסיון האחרון. אם גם הוא לפני
 * יממה — בטוח שהחלון נסגר (השרת הישן היה משחרר בשקט בשליחה חוזרת), ולכן הראשי הוא
 * שחרור מאחורי אישור; אחרת שליחה חוזרת קודם, ושחרור — משני ומאחורי אישור.
 */
export function unknownRowModel(u: ReadyUnknownNotice, now: number, cardEmail?: string | null, firstName?: string): UnknownRowModel {
  const until = u.retryUntil ? Date.parse(u.retryUntil) : NaN;
  const windowKnown = Number.isFinite(until);
  const legacy = u.retryUntil === undefined && u.lastTriedAt === undefined && u.cause === undefined;
  const lastAt = Date.parse(u.at);
  const recipient = u.recipientChanged === true
    || (!!u.toEmail && cardEmail !== undefined && normEmail(u.toEmail) !== normEmail(cardEmail));
  const state: UnknownRowState = recipient ? 'recipient'
    : windowKnown ? (now < until ? 'open' : 'closed')
    : legacy && Number.isFinite(lastAt) && lastAt <= now - RETRY_WINDOW_MS ? 'closed'
    : 'unknown_window';

  const cause = u.cause && (UNKNOWN_CAUSE_TEXT as Record<string, string>)[u.cause];
  const why = `${cause || UNKNOWN_CAUSE_FALLBACK} הבקשות לא סומנו כנמסרו.`;
  // ‼ אחרי החלון שחרור עלול להביא כפילות — ולכן קודם לברר עם הלקוח (מילים בלי מין דקדוקי).
  const window = state === 'recipient' ? 'הכתובת בכרטיס השתנתה מאז.'
    : state === 'closed' ? `עברה יממה — ספק הדואר כבר לא יזהה כפילות. כדאי לברר עם ${firstName?.trim() || 'הלקוח'} אם המייל הגיע, לפני השחרור.`
    : state === 'open' ? `עד ${futureTime(u.retryUntil!, now)} — «${RETRY_SAME_LABEL}» לא ישלח פעמיים.`
    : null;

  const list = u.itemList ?? [];
  const closedTitles = list.filter(i => !i.stillOpen).map(i => i.title);
  const details: string[] = [];
  if (u.toEmail) details.push(`אל: ${u.toEmail}`);
  if (u.subject) details.push(`נושא: «${u.subject}»`);
  if (list.length) details.push(`במייל: ${list.map(i => `«${i.title}»${i.stillOpen ? '' : ' (כבר נסגרה)'}`).join(', ')}`);
  else if (u.items) details.push(u.items === 1 ? 'במייל: פריט אחד' : `במייל: ${u.items} פריטים`);
  if ((u.attempts ?? 0) > 1) {
    details.push(`ניסיונות: ${u.attempts}${u.lastTriedAt ? ` · אחרון ${pastTime(u.lastTriedAt, now)}` : ''}`);
  }
  // ‼ לא «יצא לבד» — זה היה טוען שהמייל יצא. רק מי הפעיל את השליחה.
  if (u.origin === 'auto') details.push('השליחה הזו הופעלה לבד, לפי המסלול');

  const retry = { action: 'retry' as const, label: RETRY_SAME_LABEL };
  const primary = state === 'recipient' ? { action: 'release' as const, label: RELEASE_NEW_ADDRESS_LABEL }
    : state === 'closed' ? { action: 'release' as const, label: RELEASE_AFTER_LABEL }
    : retry;
  const secondary = state === 'open' || state === 'unknown_window'
    ? { action: 'release' as const, label: RELEASE_ANYWAY_LABEL } : null;

  return {
    noticeId: u.noticeId, state, title: `לא ידוע אם יצא המייל מ-${pastTime(u.at, now)}`, why, window, details,
    primary, secondary, firstAt: pastTime(u.at, now), to: u.toEmail ?? null,
    cardEmail: cardEmail === undefined ? null : (cardEmail?.trim() || null), closedTitles,
  };
}

export interface UnknownConfirm {
  kind: 'retry' | 'release_in_window' | 'release_after' | 'release_new_address';
  title: string;
  message: string;
  confirmLabel: string;
  tone: 'normal' | 'danger';
}

/**
 * חלון האישור לפעולה בשורה. ‼ שחרור תמיד עובר כאן — גם כשהוא הכפתור הראשי — כי
 * אחריו הבקשות ייכללו במייל הבא, ואם הקודם הגיע הן יגיעו פעמיים.
 */
export function unknownConfirm(m: UnknownRowModel, action: UnknownAction, firstName: string): UnknownConfirm {
  if (action === 'retry') {
    const closed = m.closedTitles.length === 0 ? ''
      : m.closedTitles.length === 1 ? ` בנוסח המקורי מופיעה גם «${m.closedTitles[0]}», שכבר נסגרה.`
      : ` בנוסח המקורי מופיעות גם ${quoteList(m.closedTitles)}, שכבר נסגרו.`;
    const hedge = m.state === 'unknown_window'
      ? ' אם עברה יממה מהשליחה הראשונה, ספק הדואר כבר לא יזהה אותו — ואז ייתכן שיגיע פעמיים.' : '';
    return {
      kind: 'retry', tone: 'normal', confirmLabel: 'שלח שוב', title: 'לשלוח שוב את אותו מייל?',
      message: 'אם המייל כבר יצא — ספק הדואר יזהה אותו, לא ישלח שוב, ונרשום שנשלח. '
        + `אם לא יצא — הוא ייצא עכשיו, בנוסח המקורי${m.to ? `, ל-${m.to}` : ''}.${closed}${hedge}`,
    };
  }
  if (m.state === 'recipient') {
    const was = m.to ? `ל-${m.to}` : 'לכתובת הקודמת';
    const now = m.cardEmail
      ? `בכרטיס עכשיו ${m.cardEmail}. אחרי השחרור «${SEND_MAIL}» ישלח את הבקשות לכתובת החדשה.`
      : `בכרטיס עכשיו אין כתובת מייל. אחרי השחרור, וכשתוסיפו כתובת, «${SEND_MAIL}» ישלח את הבקשות אליה.`;
    return {
      kind: 'release_new_address', tone: 'normal', confirmLabel: 'לשחרר', title: 'לשחרר לכתובת החדשה?',
      message: `המייל מ-${m.firstAt} נשלח (אם בכלל) ${was}. ${now}`,
    };
  }
  if (m.state === 'closed') {
    return {
      kind: 'release_after', tone: 'danger', confirmLabel: 'לשחרר', title: 'לשחרר לשליחה מחדש?',
      message: `אי אפשר לדעת אם המייל מ-${m.firstAt} הגיע ל${firstName}, וספק הדואר כבר לא יזהה כפילות. `
        + `כדאי לברר עם ${firstName} קודם. `
        + `אחרי השחרור «${SEND_MAIL}» ישלח את הבקשות שוב — ואם הקודם הגיע, הן יגיעו פעמיים.`,
    };
  }
  return {
    kind: 'release_in_window', tone: 'danger', confirmLabel: 'לשחרר בכל זאת', title: 'לשחרר בלי לבדוק?',
    message: `ייתכן שהמייל כבר הגיע ל${firstName}. אחרי השחרור הבקשות ייכללו במייל הבא — ואם הקודם הגיע, הן יגיעו פעמיים. `
      + `«${RETRY_SAME_LABEL}» בודק את זה בלי לשלוח פעמיים${m.state === 'unknown_window' ? ' (בתוך יממה מהשליחה הראשונה)' : ''}.`,
  };
}

/** משפט ההצלחה — ‼ «נרשם ביומן» רק כשהשרת אמר שנרשם. */
export function noticeSuccessText(r: NoticeSendResult): string {
  if (r.alreadySent) return ALREADY_SENT_TEXT;
  return r.logged === false ? SENT_UNLOGGED_TEXT : SENT_LOGGED_TEXT;
}

/**
 * שגיאת תצוגה מקדימה של מייל ללקוח (הודעה). ‼ התצוגה לא שולחת — ולכן תשובה בלי
 * קוד מוכר היא «לא נבנתה», לא «לא ידוע אם יצא». קוד מוכר — אותו משפט כמו בשליחה.
 */
export function noticePreviewErrorText(r: NoticeSendResult | null | undefined): string {
  if (!r || !isDefiniteFailure(r.error)) return PREVIEW_FAILED_TEXT;
  return noticeErrorText(r);
}

/**
 * שגיאה מגוף התשובה של פונקציית מייל (לא הודעה ללקוח). ‼ in_flight קודם לכל:
 * השרת מצרף אליו את תשובת ספק הדואר הגולמית (באנגלית), והיא לא מוצגת.
 * ‼ הסבר מהשרת או קוד עם אותיות לטיניות (הודעת מסד נתונים, קוד בלי טקסט) לא
 * מוצגים — הטבלה, ואחריה ברירת המחדל.
 */
export function errorTextFromBody(
  body: { error?: string; detail?: { message?: string } | null } | null | undefined,
  table: Record<string, string>,
  fallback: string,
): string {
  const code = body?.error;
  if (code === 'in_flight') return IN_FLIGHT_TEXT;
  const said = body?.detail?.message;
  if (said && !LATIN.test(said)) return said;
  if (code && table[code]) return table[code];
  if (code && !LATIN.test(code)) return code;
  return fallback;
}

/**
 * מייל שאינו הודעה מהדף (הוראות ב"ל, מיילי ייצוג): האם לא ידוע אם יצא.
 * ‼ אין גוף (החיבור נפל, שער שלא ענה) או 5xx בלי קוד מוכר — אולי יצא.
 * 4xx וקוד מוכר — השרת סירב לפני השליחה. in_flight — אותו מייל בתנועה (מטופל לחוד).
 */
export function isUnknownEmailFailure(
  body: { error?: string } | null | undefined,
  status: number | null | undefined,
  table: Record<string, string>,
): boolean {
  if (!body || !body.error) return true;
  if (body.error === 'in_flight') return false;
  return (status ?? 0) >= 500 && !table[body.error];
}

/**
 * מצב נמען בחלון «שלח בקשות». nothing — הכול כבר נמסר (אין מה לשלוח); busy — מייל אחר
 * ללקוח יוצא ממש עכשיו. ‼ שניהם לא «לא נשלח דבר» באדום: התוצאה תקינה, או המתנה.
 */
export type SendStatus = 'sending' | 'ok' | 'unlogged' | 'already' | 'nothing' | 'inflight' | 'busy' | 'unknown' | 'err';

/** אין מה לשלוח — הכול כבר נמסר. כותרת, לא כשל. */
export const NOTHING_LEFT_TITLE = 'אין מה לשלוח — הכול כבר נמסר';
/** מייל אחר ללקוח יוצא עכשיו — המתנה. */
export const OTHER_BUSY_TITLE = 'מייל אחר ללקוח יוצא ממש עכשיו — נסו שוב בעוד רגע';

/**
 * כותרת הסיכום אחרי «שלח». ‼ «לא נשלח דבר» רק כשבאמת אף מייל לא יצא ולא
 * בתנועה — לא כשמייל נשלח מחלון אחר, לא כשלא ידוע אם יצא, ולא כשהכול כבר נמסר.
 */
export function sendSummary(statuses: readonly (SendStatus | undefined)[]): { title: string; tone: 'ok' | 'wait' | 'warn' | 'failed' } {
  const n = (s: SendStatus) => statuses.filter(x => x === s).length;
  const went = n('ok') + n('unlogged');
  if (went > 0) return { title: went === 1 ? 'מייל אחד נשלח' : `${went} מיילים נשלחו`, tone: 'ok' };
  if (n('unknown') > 0) return { title: 'לא ידוע אם המייל יצא', tone: 'warn' };
  if (n('inflight') > 0) return { title: 'נשלח ממש עכשיו מחלון אחר — רעננו בעוד רגע', tone: 'wait' };
  if (n('busy') > 0) return { title: OTHER_BUSY_TITLE, tone: 'wait' };
  if (n('already') > 0) return { title: 'לא נשלח מייל חדש — כבר נשלח קודם', tone: 'ok' };
  if (n('nothing') > 0) return { title: NOTHING_LEFT_TITLE, tone: 'ok' };
  return { title: 'לא נשלח דבר', tone: 'failed' };
}
