// ─── «אוטומציות» · מה PIVO יודע לעשות מול הרשויות, ואיך יודעים מה קרה ───────
// לוגיקה טהורה (בלי React), כדי שתיבדק ב-node.
//
// ‼ הרשימה כאן היא תיאור של מה שקיים בקוד — לא תוכנית. כל פעולה מצביעה על
// action_type שיש לו handler ב-worker/src/dispatcher.mjs ונקודת כניסה במסך.
// פעולת פיתוח (ChecksTab) ופעולות חיבור (connect/ensure_capability) אינן כאן:
// הראשונות אינן מוצר, והאחרונות הן «חיבור», לא «פעולה».
// ‼ «לבד» מתואר רק כשיש בשרת מנגנון שיוצר את המשימה. יש בדיוק שלושה כאלה:
//   · 208 — בדיקה אחת אחרי הגשה מוצלחת, והמשך שליחה כשמסמך חסר הגיע.
//   · 215 — קריאה (ולא שום דבר אחר) כשנפתח שלב במסלול שבו הפעולה מסומנת «לבד»:
//     רק בריצה שהורשתה, ללקוח מיוצג, כשמחשב העבודה מחובר ופנוי, ולכל היותר
//     פעם בשבוע ללקוח (_flow_run_action). פעולה שמשנה אצל הרשות — תמיד בלחיצה.
// אין cron ואין בדיקות רקע.
// ‼ «הסתיימה» היא ריצה שהסתיימה — לא «הלקוח מיוצג». התוצאה נקראת מ-result,
// ו«לא ידוע» לעולם אינו מוצג כהצלחה.

import type { AutomationJob } from '../../types/automation';
import {
  SHAAM_SYNC_INCOME_TAX_ACTION_TYPE, SHAAM_CREATE_REPRESENTATION_ACTION_TYPE, SHAAM_SUBMIT_POA_ACTION_TYPE,
  SHAAM_CHECK_REPRESENTATION_ACTION_TYPE, BTL_SYNC_FILE_ACTION_TYPE, BTL_CREATE_REPRESENTATION_ACTION_TYPE,
  BTL_CHECK_REPRESENTATION_ACTION_TYPE,
} from '../../types/automation';
import { FLOW_ACTION_NAMES } from '../flows/types';

export type AutomationSystemId = 'shaam' | 'vat' | 'btl';

export interface AutomationSystem {
  id: AutomationSystemId;
  title: string;
  /** איזה חיבור בכותרת הפעולות האלה צריכות. */
  connection: 'shaam' | 'btl';
}

export const AUTOMATION_SYSTEMS: AutomationSystem[] = [
  { id: 'shaam', title: 'שע״ם · מס הכנסה וייפוי כוח', connection: 'shaam' },
  { id: 'vat', title: 'שע״ם · מע״מ וניכויים', connection: 'shaam' },
  { id: 'btl', title: 'ביטוח לאומי', connection: 'btl' },
];

export interface AutomationAction {
  id: string;
  system: AutomationSystemId;
  /** null — עוד לא נבנה. אין כפתור, אין הרצות. */
  actionType: string | null;
  name: string;
  /** שורה אחת ברשימה. */
  short: string;
  /** קורא בלבד, או משנה משהו אצל הרשות. */
  effect: 'read' | 'change' | 'none';
  /** תווית המצב: מתי זה רץ. */
  mode: string;
  modeAuto: boolean;
  /** «מה מפעיל» — שורה אחת ברשימה: איפה לוחצים, ומה (אם בכלל) מפעיל לבד. */
  trigger: string;
  what: string;
  /** איפה לוחצים. */
  manual: string | null;
  /** מה מפעיל את זה לבד — רק מה שקיים בשרת. */
  automatic: string | null;
  /**
   * ‼ 215: הפעולה יכולה להיות פריט בשלב של מסלול — רק פעולות קריאה
   * (flow_auto_action_allowed בשרת). חסר = לא נכנסת למסלולים בכלל.
   */
  flow?: string;
  needs: string[];
  /** איפה רואים את התוצאה. */
  results: string;
  /** לאיזו לשונית אצל הלקוח הקישור מהריצה מוביל. */
  clientTab: 'taxfile' | 'journey';
  /** ‼ איפה בתוך הלשונית — המקום שבו התוצאה והפעולה הבאה (ראה ClientTarget). */
  clientTarget?: ClientTarget;
}

/**
 * ‼ לאן בדיוק בכרטיס הלקוח קישור מ«אוטומציות» נוחת, מעבר ללשונית: כרטיס הרשות
 * בתיק המס (שם תוצאת הקריאה והכפתור לקרוא שוב), מרכז הייצוג (הזנה, הגשה, בדיקת
 * קבלה), או המייל עצמו ב«פעילות». המעטפת (App) היא שמממשת את הנחיתה.
 */
export type ClientTarget = 'taxfile:income_tax' | 'taxfile:national_insurance' | 'rep-center' | `log:${string}`;

const NEEDS_WORKER = 'מחשב עבודה פעיל, ו-PIVO פתוח בו';
const NEEDS_SHAAM = 'חיבור לשע״ם (כפתור «שע״ם» בכותרת — כרטיס חכם וקוד). בלי חיבור, הלחיצה פותחת את ההתחברות וממשיכה כשהיא מוכנה';
const FLOW_CAPABILITY = 'במסלול: בלחיצה שלך, או לבד כשהשלב נפתח — רק אם אישרת זאת כשהופעל המסלול ללקוח, רק ללקוח מיוצג, וכשמחשב העבודה פנוי';
const NEEDS_BTL = 'חיבור לביטוח לאומי (כפתור בכותרת — קוד משתמש, סיסמה וקוד מהנייד). בלי חיבור, הלחיצה פותחת את ההתחברות וממשיכה כשהיא מוכנה';

// ‼ שם הפעולה — מקום אחד (FLOW_ACTIONS, features/flows/types.ts): אותו שם בבונה,
// ברצועה שבכרטיס, בחלונות ההפעלה ובעמוד הזה. היה כאן «עדכון נתוני…» — שם שלישי.
export const AUTOMATION_ACTIONS: AutomationAction[] = [
  {
    id: 'shaam-sync', system: 'shaam', actionType: SHAAM_SYNC_INCOME_TAX_ACTION_TYPE,
    name: FLOW_ACTION_NAMES[SHAAM_SYNC_INCOME_TAX_ACTION_TYPE],
    short: 'קורא את פרטי התיק בשע״ם ומשווה לכרטיס הלקוח.',
    effect: 'read', mode: 'בלחיצה', modeAuto: false,
    trigger: 'בלחיצה, בלשונית «תיק מס» של הלקוח',
    what: 'נכנס לתיק במערכת גביית מס הכנסה (שאילתה 134) וקורא את השדות שבראש התיק. לא משנה דבר בשע״ם, ולא כותב לכרטיס לבד.',
    manual: `«${FLOW_ACTION_NAMES[SHAAM_SYNC_INCOME_TAX_ACTION_TYPE]}» בכרטיס מס הכנסה, בלשונית «תיק מס» של הלקוח.`,
    automatic: null,
    flow: FLOW_CAPABILITY,
    needs: [NEEDS_WORKER, NEEDS_SHAAM, 'מספר תיק במס הכנסה בכרטיס הלקוח'],
    results: 'בלשונית «תיק מס»: כל שדה מול מה שבשע״ם. שינוי נכנס לכרטיס רק כשמאשרים אותו.',
    clientTab: 'taxfile', clientTarget: 'taxfile:income_tax',
  },
  {
    id: 'shaam-create', system: 'shaam', actionType: SHAAM_CREATE_REPRESENTATION_ACTION_TYPE,
    name: 'הזנת ייפוי כוח בשע״ם',
    short: 'פותח את בקשת הייצוג בשע״ם ומביא את טופס 2279 לחתימה.',
    effect: 'change', mode: 'בלחיצה', modeAuto: false,
    trigger: 'בלחיצה, במרכז הייצוג',
    what: 'בודק קודם אם כבר יש בקשה פתוחה לאותו אדם (ואם יש — לא פותח שנייה). אחרת מאמת את פרטי הישות, פותח בקשת ייפוי כוח למערכים שבבקשה (מס הכנסה, מע״מ, ניכויים), ושומר את טופס 2279 בתיק הלקוח.',
    manual: '«הזן ייפוי כוח בשע״ם» במרכז הייצוג — בלשונית «בקשות» של הלקוח.',
    automatic: null,
    needs: [NEEDS_WORKER, NEEDS_SHAAM, 'בקשת ייצוג פתוחה עם הפרטים שהרשות דורשת'],
    results: 'במרכז הייצוג: מספר הבקשה בשע״ם, והטופס שנשמר במסמכי הלקוח.',
    clientTab: 'journey', clientTarget: 'rep-center',
  },
  {
    id: 'shaam-submit', system: 'shaam', actionType: SHAAM_SUBMIT_POA_ACTION_TYPE,
    name: 'שליחת הטופס החתום לשע״ם',
    short: 'מעלה לשע״ם את טופס ייפוי הכוח אחרי החתימה והחותמת.',
    effect: 'change', mode: 'בלחיצה · ממשיך לבד כשמסמך חסר מגיע', modeAuto: true,
    trigger: 'בלחיצה במרכז הייצוג · ממשיך לבד כשמסמך חסר מגיע',
    what: 'מעלה את הטופס החתום (ומסמכים שהרשות דורשת) ושולח. «נשלח» נרשם רק כשמסך שע״ם אישר קליטה — לחיצה לבדה אינה ראיה.',
    manual: '«שלח טופס חתום לשע״ם» במרכז הייצוג.',
    automatic: 'אם השליחה נעצרה כי רשות המסים דרשה מסמך מזהה שעוד לא היה בתיק — כשהמסמך מגיע, PIVO מתחילה את השליחה שוב לבד, פעם אחת.',
    needs: [NEEDS_WORKER, NEEDS_SHAAM, 'הטופס נחתם בידי כל החותמים והוחתם בחותמת המשרד'],
    results: 'במרכז הייצוג: «נשלח לשע״ם» עם התאריך, או מה עצר את השליחה.',
    clientTab: 'journey', clientTarget: 'rep-center',
  },
  {
    id: 'shaam-check', system: 'shaam', actionType: SHAAM_CHECK_REPRESENTATION_ACTION_TYPE,
    name: 'בדיקת קבלת הייצוג בשע״ם',
    short: 'קורא את מצב הבקשה בשע״ם, לכל מערך.',
    effect: 'read', mode: 'בלחיצה · פעם אחת לבד אחרי השליחה', modeAuto: true,
    trigger: 'בלחיצה · ופעם אחת לבד, מיד אחרי ששע״ם קלטה את הטופס',
    what: 'קורא את «מצב בקשה» ו«מצב מערך» מרשימת הבקשות בתהליך, לפי מספר הבקשה. לא יוצר ולא שולח דבר.',
    manual: '«בדוק קבלת הייצוג» במרכז הייצוג (אותו כפתור בודק גם את ביטוח לאומי).',
    automatic: 'מיד אחרי ששע״ם אישרה קליטה של הטופס — בדיקה אחת. אין בדיקות חוזרות ברקע.',
    needs: [NEEDS_WORKER, NEEDS_SHAAM, 'מספר בקשה שמור (נוצר בהזנה)'],
    results: 'במרכז הייצוג, מתחת ל«בדוק קבלת הייצוג»: מה נקרא ומתי.',
    clientTab: 'journey', clientTarget: 'rep-center',
  },
  {
    id: 'vat-read', system: 'vat', actionType: null,
    name: 'קריאת תיק מע״מ או ניכויים',
    short: 'אין עדיין פעולה במערכות האלה.',
    effect: 'none', mode: 'עוד לא קיים', modeAuto: false,
    trigger: 'עוד לא קיים',
    what: 'החיבור לשע״ם מכין גם את מערכות מע״מ ומגן (ניכויים), אבל אין עדיין פעולה שקוראת או מבצעת בהן. ייפוי כוח למע״מ ולניכויים עובר ב«הזנת ייפוי כוח בשע״ם».',
    manual: null,
    automatic: null,
    needs: [],
    results: 'בכרטיס מע״מ בלשונית «תיק מס» — הכפתור מסומן «עוד לא נבנה».',
    clientTab: 'taxfile',
  },
  {
    id: 'btl-sync', system: 'btl', actionType: BTL_SYNC_FILE_ACTION_TYPE,
    name: FLOW_ACTION_NAMES[BTL_SYNC_FILE_ACTION_TYPE],
    short: 'קורא את תיק המבוטח בביטוח לאומי, לכל אדם, ומשווה לכרטיס.',
    effect: 'read', mode: 'בלחיצה', modeAuto: false,
    trigger: 'בלחיצה, בלשונית «תיק מס» של הלקוח',
    what: 'קורא בפורטל המייצגים את פרטי התיק של כל אדם בכרטיס שיש לו ת.ז. לא משנה דבר בביטוח לאומי, ולא כותב לכרטיס לבד.',
    manual: `«${FLOW_ACTION_NAMES[BTL_SYNC_FILE_ACTION_TYPE]}» בכרטיס ביטוח לאומי, בלשונית «תיק מס».`,
    automatic: null,
    flow: FLOW_CAPABILITY,
    needs: [NEEDS_WORKER, NEEDS_BTL, 'ת.ז. בכרטיס לפחות לאדם אחד'],
    results: 'בלשונית «תיק מס»: כל שדה מול מה שבביטוח לאומי. שינוי נכנס רק באישור.',
    clientTab: 'taxfile', clientTarget: 'taxfile:national_insurance',
  },
  {
    id: 'btl-create', system: 'btl', actionType: BTL_CREATE_REPRESENTATION_ACTION_TYPE,
    name: 'הזנת ייפוי כוח בביטוח לאומי',
    short: 'מזין ייפוי כוח למבוטח ומקבל מספר אסמכתא.',
    effect: 'change', mode: 'בלחיצה', modeAuto: false,
    trigger: 'בלחיצה, בכרטיס ביטוח לאומי של האדם',
    what: 'לאדם אחד בכל פעם: מוסיף ייפוי כוח מבוטח במערכת הייצוג, ושומר את מספר האסמכתא והמועד האחרון לאישור. את האישור עצמו המבוטח עושה בעצמו.',
    manual: '«הזן ייפוי כוח בביטוח לאומי» בכרטיס ביטוח לאומי של האדם — בלשונית «בקשות», «תיק מס» או במרכז הייצוג.',
    automatic: null,
    needs: [NEEDS_WORKER, NEEDS_BTL, 'ת.ז., שנת לידה, שם פרטי ושם משפחה של האדם'],
    results: 'בבקשת הייצוג: האסמכתא והמועד, ומשם — מייל האישור למבוטח (נשלח בלחיצה).',
    clientTab: 'journey', clientTarget: 'rep-center',
  },
  {
    id: 'btl-check', system: 'btl', actionType: BTL_CHECK_REPRESENTATION_ACTION_TYPE,
    name: 'בדיקת קבלת הייצוג בביטוח לאומי',
    short: 'קורא את מסך «מעקב ייפוי כוח» לפי האסמכתא.',
    effect: 'read', mode: 'בלחיצה', modeAuto: false,
    trigger: 'בלחיצה, בכרטיס ביטוח לאומי או במרכז הייצוג',
    what: 'מחפש את האסמכתא במסך המעקב וקורא את הסטטוס. רק «אושר» מסמן את הייצוג כפעיל; מצב לא מזוהה אינו נחשב אישור.',
    manual: '«בדוק קבלת הייצוג» בכרטיס ביטוח לאומי של האדם, או במרכז הייצוג (שם הוא בודק גם את שע״ם).',
    automatic: null,
    needs: [NEEDS_WORKER, NEEDS_BTL, 'מספר אסמכתא שמור לאדם'],
    results: 'בכרטיס ביטוח לאומי ובמרכז הייצוג: הסטטוס שנקרא ומתי.',
    clientTab: 'journey', clientTarget: 'rep-center',
  },
];

export const AUTOMATION_ACTION_TYPES: string[] = AUTOMATION_ACTIONS
  .map(a => a.actionType).filter((t): t is string => !!t);

/**
 * ‼ מתי קריאה שבשלב של מסלול רצה לבד — במילים, לא בקודים. אותם שערים כמו
 * בשרת (_flow_run_action + _flow_authority_ready, 215): כולם, אחרת «ממתין לך».
 */
export const FLOW_AUTO_GATES: string[] = [
  'בפריט במסלול נבחר «לבד»',
  'המסלול הופעל עם אישור לרוץ לבד: לקוח חדש שאישר הצעה, או שסימנת «ירוצו לבד» כשהפעלת אותו',
  'למשרד יש ייצוג פעיל אצל הלקוח ברשות הזו',
  'מחשב העבודה מחובר לרשות, ולא עבדו בו ב-3 הדקות האחרונות',
  'אין קריאה אוטומטית אחרת בתור, והתיק לא נקרא השבוע',
];
export const FLOW_AUTO_FALLBACK = 'אחרת — הקריאה ממתינה לך בכרטיס הלקוח, עם הסיבה. קריאה שלא נלקחה תוך רבע שעה מתבטלת.';

// ─── ריצה אחת — מה לומר עליה ─────────────────────────────────────────────────

export type RunTone = 'ok' | 'warn' | 'bad' | 'muted' | 'live';

export interface RunSummary {
  label: string;
  tone: RunTone;
  /** משפט נוסף — רק כשיש בו מידע. */
  note?: string;
  /** נוצרה בשרת, לא בלחיצה. */
  auto: boolean;
}

/** ‼ פעולה שמשנה ונעצרה באמצע — ייתכן ששע״ם כבר קלטה. זה אינו כישלון ואינו הצלחה. */
const UNKNOWN_OUTCOME = new Set(['external_outcome_unknown', 'ambiguous_submit_result']);

const STALE_AFTER_MS = 7 * 24 * 3600_000;

/** פעולה שנעצרה באמצע ולא ידוע אם נקלטה — נשארת מול העיניים עד שבודקים, גם כשהיא ישנה. */
export const runOutcomeUnknown = (job: Pick<AutomationJob, 'errorCode'>) => UNKNOWN_OUTCOME.has(job.errorCode ?? '');

export function runIsAuto(job: Pick<AutomationJob, 'input'>): boolean {
  const input = (job.input ?? {}) as Record<string, unknown>;
  return input.reason === 'post_submission_reconciliation' || input.reason === 'flow_stage_opened'
    || input.resumeReason === 'required_documents_arrived';
}

export function runTime(job: Pick<AutomationJob, 'finishedAt' | 'updatedAt' | 'createdAt'>): string {
  return job.finishedAt || job.updatedAt || job.createdAt;
}

/** נתון שנקרא לפני יותר משבוע — עובדה היסטורית, לא מצב נוכחי. */
export function runIsStale(job: Pick<AutomationJob, 'finishedAt' | 'updatedAt' | 'createdAt'>, now: number): boolean {
  const t = Date.parse(runTime(job));
  return Number.isFinite(t) && now - t > STALE_AFTER_MS;
}

export function firstSentence(s: string | undefined, max = 140): string | undefined {
  const t = (s ?? '').trim();
  if (!t) return undefined;
  const cut = t.split(/(?<=[.!?])\s/)[0];
  return cut.length > max ? cut.slice(0, max - 1) + '…' : cut;
}

function succeeded(job: AutomationJob): Omit<RunSummary, 'auto'> {
  const r = (job.result ?? {}) as Record<string, unknown>;
  switch (job.actionType) {
    case BTL_CHECK_REPRESENTATION_ACTION_TYPE:
      if (r.status === 'approved') return { label: 'נקרא: אושר בביטוח לאומי', tone: 'ok' };
      if (r.status === 'pending') return { label: 'נקרא: עדיין ממתין לאישור המבוטח', tone: 'muted' };
      if (r.status === 'not_found') return { label: 'נקרא: האסמכתא לא נמצאה במסך המעקב', tone: 'warn', note: 'זה לא אומר שהייצוג נדחה.' };
      return { label: 'נקרא: מצב שלא זוהה', tone: 'warn', note: 'לא נקבע דבר לפי הבדיקה הזו.' };
    case SHAAM_CHECK_REPRESENTATION_ACTION_TYPE:
      if (r.found === false) return { label: 'נקרא: הבקשה לא ברשימת הבקשות בתהליך', tone: 'warn', note: 'ייתכן שכבר נקלטה — לא מסיקים מזה.' };
      if (r.allAccepted === true) return { label: 'נקרא: כל המערכים נקלטו', tone: 'ok' };
      if (r.settled === true) return { label: 'נקרא: נקלט בכל מערך שיש בו תיק', tone: 'ok', note: 'מערך בלי תיק ממתין לפתיחת התיק.' };
      return { label: 'נקרא: עדיין בתהליך', tone: 'muted' };
    case SHAAM_SUBMIT_POA_ACTION_TYPE:
      return r.submitted === true
        ? { label: 'שע״ם אישרה קליטה של הטופס', tone: 'ok' }
        : { label: 'הסתיימה בלי אישור קליטה', tone: 'warn', note: 'הפירוט במרכז הייצוג.' };
    case SHAAM_CREATE_REPRESENTATION_ACTION_TYPE:
      if (r.preflight === 'existing_found') return { label: 'כבר הייתה בקשה בשע״ם — לא נפתחה שנייה', tone: 'muted' };
      return r.requestNumber
        ? { label: 'הבקשה נפתחה בשע״ם והטופס נשמר', tone: 'ok' }
        : { label: 'הסתיימה', tone: 'muted' };
    case BTL_CREATE_REPRESENTATION_ACTION_TYPE:
      return r.referenceNumber
        ? { label: 'הוזן — התקבלה אסמכתא', tone: 'ok' }
        : { label: 'הסתיימה', tone: 'muted' };
    case SHAAM_SYNC_INCOME_TAX_ACTION_TYPE:
    case BTL_SYNC_FILE_ACTION_TYPE:
      return { label: 'הנתונים נקראו', tone: 'ok', note: 'שינויים נכנסים לכרטיס רק באישור.' };
    default:
      return { label: 'הסתיימה', tone: 'muted' };
  }
}

/**
 * ריצה שעצרה עד שמתחברים — לאיזה חיבור (שע״ם על כל מערכותיו, או ביטוח לאומי).
 * null — לא ממתינה להתחברות. ‼ מה שצריך כאן הוא להתחבר, לא לפתוח את הלקוח:
 * אחרי ההתחברות הריצה ממשיכה לבד.
 */
export function runAwaitsLogin(job: Pick<AutomationJob, 'status' | 'errorCode'>): 'shaam' | 'btl' | null {
  const code = job.errorCode ?? '';
  if (job.status !== 'needs_human' || !code.startsWith('awaiting_') || !code.endsWith('_auth')) return null;
  return code.startsWith('awaiting_btl') ? 'btl' : 'shaam';
}

export function summarizeRun(job: AutomationJob): RunSummary {
  const auto = runIsAuto(job);
  const code = job.errorCode ?? '';
  if (UNKNOWN_OUTCOME.has(code)) {
    return { label: 'לא ידוע אם נקלט', tone: 'warn', note: 'קודם בודקים קבלה — לא שולחים שוב.', auto };
  }
  switch (job.status) {
    case 'queued': return { label: 'ממתינה למחשב העבודה', tone: 'live', auto };
    case 'running': return { label: 'רצה עכשיו', tone: 'live', auto };
    case 'needs_human':
      if (runAwaitsLogin(job)) return { label: 'ממתינה להתחברות', tone: 'warn', auto };
      return { label: 'נעצרה — צריך אותך', tone: 'warn', note: firstSentence(job.needsHuman), auto };
    case 'failed': return { label: 'נכשלה', tone: 'bad', note: firstSentence(job.errorDetail), auto };
    case 'cancelled': return { label: 'בוטלה', tone: 'muted', auto };
    case 'succeeded': return { ...succeeded(job), auto };
    default: return { label: 'מצב לא מוכר', tone: 'warn', auto };
  }
}
