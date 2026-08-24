// ─── בקשת "הקמת הרשאה לחיוב חשבון" ─────────────────────────────────────────
// הלקוח פותח בבנק שלו הרשאה לחיוב חשבון לטובת הרשויות שנבחרו, ומעלה אסמכתה
// לכל אחת. ‼ זו אינה מערכת בקשות שנייה: זו **תבנית** מעל הבקשה החופשית
// (custom_request) — בדיוק כמו רצף הפייפרלס. מה שהיא מרכיבה הוא payload רגיל,
// ולכן העריכה, הפרסום, ההעלאה, ההשלמה ושער סגירת הקליטה ממשיכים לעבוד בלי
// שאף אחד מהם יודע שקיימת בקשה כזאת.
//
// ‼ הרשויות אינן מסומנות מראש — הרו"ח בוחר לכל לקוח מה נדרש ממנו בפועל.

import type { InstitutionKey, StepPayload } from '../types/onboarding';
import { INSTITUTION_DEBIT_CODES, INSTITUTION_NAMES } from '../types/onboarding';

export const BANK_DEBIT_TITLE = 'הקמת הרשאה לחיוב חשבון';

/**
 * הסבר "למה" ו"איפה" — לשון הלקוח, בלי מונחים פנימיים.
 * ‼ שורות ריקות הן חלק מהניסוח: הדף האישי מרנדר את הטקסט כמו שהוא
 * (white-space: pre-line), ולכן הפסקאות נשמרות.
 */
const NOTE = [
  'כדי שנוכל לבצע עבורך תשלומים לרשויות בצורה פשוטה ומהירה, יש להקים הרשאה לחיוב חשבון עבור הרשויות שמופיעות מטה.',
  '',
  'איך עושים את זה?',
  'נכנסים לאפליקציה או לאתר הבנק, מחפשים «הקמת הרשאה לחיוב חשבון», ומקימים הרשאה לפי קוד המוסד המתאים:',
].join('\n');

const NOTE_AFTER = [
  'לאחר שסיימת, פשוט מעלים כאן צילום מסך או אישור מהבנק עבור כל הרשאה.',
  '',
  'אנחנו כבר נדאג לכל השאר 🙂',
].join('\n');

/** מפתח הדרישה נגזר מהרשות, כדי שהקובץ שיועלה יישאר קשור למוסד הנכון. */
export const debitRequirementKey = (k: InstitutionKey) => `debit_${k}`;

/**
 * ה-payload של הבקשה. דרישה אחת לכל רשות שנבחרה — כך הלקוח רואה בדיוק כמה
 * אסמכתאות נדרשות, וכל קובץ שמגיע יודע לאיזה מוסד הוא שייך. הבקשה נסגרת
 * מעצמה כשכל הדרישות מולאו (portal-upload-document), כמו כל בקשה חופשית.
 */
export function buildBankDebitPayload(selected: InstitutionKey[]): StepPayload {
  return {
    title: BANK_DEBIT_TITLE,
    clientTitle: BANK_DEBIT_TITLE,
    clientSub: 'מעבר לתשלומים מקוונים למוסדות - בלי שיקים',
    clientNote: NOTE,
    clientRefs: selected.map(k => ({
      label: INSTITUTION_NAMES[k],
      value: `קוד מוסד ${INSTITUTION_DEBIT_CODES[k]}`,
    })),
    clientNoteAfter: NOTE_AFTER,
    clientCta: 'להקמת ההרשאה',
    bankDebitAuthorities: selected,
    requirements: selected.map(k => ({
      key: debitRequirementKey(k),
      kind: 'file' as const,
      label: `אסמכתה - ${INSTITUTION_NAMES[k]}`,
      done: false,
      required: true,
    })),
  };
}
