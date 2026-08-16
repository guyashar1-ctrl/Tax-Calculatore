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

/** הסבר "למה" ו"איפה" — לשון הלקוח, בלי מונחים פנימיים. */
const NOTE = [
  'לצורך שיפור השירות ומעבר לתשלומים מקוונים ללא צורך בשיקים, ועל מנת שנוכל',
  'לבצע עבורך תשלומים למוסדות — יש להקים הרשאה לחיוב חשבון באפליקציה או באתר',
  'הבנק, תחת «הקמת/פתיחת הרשאה לחיוב חשבון».',
].join(' ');

const NOTE_AFTER =
  'לאחר ההקמה בבנק — יש להעלות כאן את האסמכתה (צילום מסך או אישור מהבנק) לכל מוסד.';

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
    clientSub: 'מעבר לתשלומים מקוונים למוסדות — בלי שיקים',
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
      label: `אסמכתה — ${INSTITUTION_NAMES[k]}`,
      done: false,
      required: true,
    })),
  };
}
