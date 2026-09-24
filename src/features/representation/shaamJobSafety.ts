// ─── «האוטומציה נעצרה» — מה זה אומר, ומה מותר לעשות הלאה ─────────────────────
//
// ‼ מיגרציה 196 קבעה את הכלל בשרת: פנייה חיצונית לשע״ם נעשית פעם אחת, וניסיון
// נוסף דורש החלטה אנושית. הקובץ הזה הוא **התרגום היחיד** של אותו כלל למסך:
// מה קרה, האם ייתכן ששע״ם כבר עשתה משהו, ומה הצעד הבטוח הבא.
//
// ‼ מקום אחד, כי אחרת כל מסך היה ממציא ניסוח משלו — ואז «לא ידוע אם נקלט»
// היה נראה באחד כמו כישלון רגיל, ומישהו היה לוחץ שוב.

import type { AutomationJob } from '../../types/automation';
import {
  SHAAM_CREATE_REPRESENTATION_ACTION_TYPE,
  SHAAM_SUBMIT_POA_ACTION_TYPE,
} from '../../types/automation';

/** הפעולות שמשנות מצב בשע״ם. חייב להתאים ל-`is_external_mutation_action` (196). */
export const SHAAM_MUTATION_ACTIONS: readonly string[] = [
  SHAAM_CREATE_REPRESENTATION_ACTION_TYPE,
  SHAAM_SUBMIT_POA_ACTION_TYPE,
];

export function isShaamMutation(actionType: string | undefined): boolean {
  return !!actionType && SHAAM_MUTATION_ACTIONS.includes(actionType);
}

/** האם המשימה כבר נגעה בשע״ם — הסימן שה-worker כותב לפני האינטראקציה. */
export function touchedShaam(job: AutomationJob | null | undefined): boolean {
  return !!job?.progress?.externalAttempt;
}

export type ShaamStopKind =
  /** נעצר לפני שנגענו ברשות — ניסיון נוסף בטוח. */
  | 'before_external'
  /** ייתכן ששע״ם כבר קלטה. קודם בודקים, לא משדרים שוב. */
  | 'outcome_unknown'
  /** חסימה/אבטחה/כרטיס. לא נוגעים יותר עד שאדם בודק. */
  | 'blocked'
  /** אימות זהות נדחה. הנתונים בכרטיס צריכים בדיקה. */
  | 'verification_rejected'
  /** מסך לא מזוהה. הקוד צריך תיקון לפני ניסיון נוסף. */
  | 'unexpected_screen'
  /** חסר חיבור לשע״ם. */
  | 'not_connected';

export interface ShaamStopState {
  kind: ShaamStopKind;
  /** כותרת קצרה למסך. */
  title: string;
  /** מה עושים עכשיו — משפט אחד. */
  next: string;
  /** ייתכן שהתבצעה פעולה בצד שע״ם. */
  mayHaveActed: boolean;
  /** מותר להציע «נסה שוב» ישירות (בלי לבדוק קודם). */
  allowDirectRetry: boolean;
  /** «בדוק קבלת הייצוג» הוא הצעד הנכון עכשיו. */
  suggestCheck: boolean;
}

const BLOCKED_PREFIX = 'shaam_';

/**
 * מצב העצירה של משימת שע״ם, או `null` כשאין עצירה.
 *
 * ‼ `mayHaveActed` הוא הדגל שמכתיב הכול: כשהוא דלוק, המסך **אינו** מציע
 * «נסה שוב» כפעולה ראשית — הוא מציע לבדוק מה נקלט. זה בדיוק ההבדל בין
 * «נסה עד שיעבוד» לבין עבודה בטוחה מול רשות.
 */
export function shaamStopState(job: AutomationJob | null | undefined): ShaamStopState | null {
  if (!job || job.status !== 'needs_human' && job.status !== 'failed') return null;
  const code = job.errorCode ?? '';
  const touched = touchedShaam(job) || isMutation(job) && code === 'external_outcome_unknown';

  if (code === 'external_outcome_unknown' || code === 'ambiguous_submit_result') {
    return {
      kind: 'outcome_unknown',
      title: 'הפעולה נעצרה — ולא ידוע אם שע״ם קלטה אותה',
      next: 'הריצו «בדוק קבלת הייצוג» (קריאה בלבד) כדי לראות מה נקלט בפועל, ורק לפי זה החליטו.',
      mayHaveActed: true, allowDirectRetry: false, suggestCheck: true,
    };
  }
  if (code.startsWith(BLOCKED_PREFIX) && code !== 'shaam_unexpected_screen') {
    return {
      kind: 'blocked',
      title: 'האוטומציה נעצרה על הודעת גישה/אבטחה בשע״ם',
      next: 'בדקו את חלון שע״ם ואת הכרטיס. לא ננסה שוב מעצמנו — ניסיונות חוזרים עלולים לחסום.',
      mayHaveActed: touched, allowDirectRetry: false, suggestCheck: touched,
    };
  }
  if (code === 'shaam_unexpected_screen') {
    return {
      kind: 'unexpected_screen',
      title: 'המסך בשע״ם אינו זה שציפינו לו',
      next: 'לא נלחץ שום דבר. דווחו על כך — האוטומציה תתוקן לפני ניסיון נוסף.',
      mayHaveActed: touched, allowDirectRetry: false, suggestCheck: touched,
    };
  }
  if (code === 'entity_verification_failed') {
    return {
      kind: 'verification_rejected',
      title: 'שע״ם לא אישרה את פרטי אימות הישות',
      next: 'בדקו מול הלקוח תאריך לידה ואמצעי זיהוי נוסף, עדכנו בכרטיס, ורק אז הפעילו שוב.',
      mayHaveActed: true, allowDirectRetry: false, suggestCheck: false,
    };
  }
  if (code === 'awaiting_shaam_auth') {
    return {
      kind: 'not_connected',
      title: 'אין חיבור פעיל לשע״ם',
      next: 'התחברו לשע״ם מהכותרת, ואז הפעילו את הפעולה שוב.',
      mayHaveActed: false, allowDirectRetry: true, suggestCheck: false,
    };
  }
  // ‼ 24.09.2026 · «הזן ייפוי כוח בשע״ם» עצר בבדיקה שלפני היצירה (קריאה
  // בלבד): יש שורות שלא ניתן לייחס, או שהרשימה לא נקראה בוודאות. לא נגענו,
  // אבל גם «נסה שוב» לבדו לא יעזור — קודם מסתכלים ברשימה בשע״ם.
  if (code === 'preflight_ambiguous' || code === 'preflight_unreadable') {
    return {
      kind: 'before_external',
      title: 'לא נפתחה בקשה — לא ניתן היה לוודא שאין כבר בקשה בשע״ם',
      next: 'שום דבר לא נשלח לשע״ם. בדקו ב«בקשות בתהליך» בשע״ם מה קיים לאדם הזה. אם אין שם בקשה — אפשר להפעיל שוב.',
      mayHaveActed: false, allowDirectRetry: true, suggestCheck: false,
    };
  }
  if (code === 'worker_stopped_before_external' || code === 'progress_write_failed_before_external') {
    return {
      kind: 'before_external',
      title: 'הפעולה נעצרה לפני שנגעה בשע״ם',
      next: 'לא בוצעה שום פנייה לרשות. אפשר להפעיל שוב.',
      mayHaveActed: false, allowDirectRetry: true, suggestCheck: false,
    };
  }
  // ‼ כל כשל אחר של פעולה משנה שכבר נגעה — נחשב «לא ידוע». עדיף להניח
  // שמשהו קרה בצד הרשות מאשר לשדר שוב על סמך הנחה.
  if (touched) {
    return {
      kind: 'outcome_unknown',
      title: 'הפעולה נעצרה אחרי שכבר פנינו לשע״ם',
      next: 'הריצו «בדוק קבלת הייצוג» כדי לראות מה נקלט, ורק לפי זה החליטו אם לנסות שוב.',
      mayHaveActed: true, allowDirectRetry: false, suggestCheck: true,
    };
  }
  return {
    kind: 'before_external',
    title: 'הפעולה נעצרה',
    next: 'לא זוהתה פנייה לרשות. אפשר להפעיל שוב.',
    mayHaveActed: false, allowDirectRetry: true, suggestCheck: false,
  };
}

function isMutation(job: AutomationJob): boolean {
  return isShaamMutation(job.actionType);
}
