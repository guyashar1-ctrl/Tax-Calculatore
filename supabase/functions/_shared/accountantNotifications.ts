// ═══════════════════════════════════════════════════════════════════════════
//  קטלוג ההתראות למשרד — מקור האמת היחיד
// ═══════════════════════════════════════════════════════════════════════════
//  כל מייל שנשלח *אל* המשרד (ולא אל הלקוח) חייב להיות רשום כאן, ולעבור דרך
//  isNotificationEnabled לפני השליחה. אין מסלול שני.
//
//  נצרך משתי הסביבות מאותו קובץ ממש, כמו stepTemplates.ts:
//    • Frontend (Vite/TS):  '../../supabase/functions/_shared/accountantNotifications.ts'
//    • Edge Functions (Deno): '../_shared/accountantNotifications.ts'
//  ולכן הקובץ טהור: בלי React, בלי DOM, בלי Deno API, בלי ייבוא חיצוני.
//
//  ── להוסיף אירוע חדש בעתיד ────────────────────────────────────────────────
//  1. להוסיף רשומה למערך שלמטה (kind, תווית, הסבר, קבוצה, ברירת מחדל).
//  2. לרשום שורה בתור מהמקום שבו האירוע קורה — טריגר, פונקציית מסד או
//     Edge Function — עם אותו kind.
//  3. להוסיף בונה מייל ל-notify-accountant לפי אותו kind.
//  תיבת הסימון במסך "המשרד" נולדת לבד מהשלב הראשון. אין קוד UI להוסיף.
//
//  ‼ אירוע שנרשם בתור ואינו מופיע בקטלוג *כן* יישלח. שתיקה שקטה על אירוע
//  שלא הכרנו גרועה מהתראה מיותרת — עדיף מייל שגיא יכבה מאשר אירוע שנעלם.
// ═══════════════════════════════════════════════════════════════════════════

export interface AccountantNotificationDef {
  /** מזהה האירוע — זהה ל-accountant_notifications.kind ולמפתח בהגדרות */
  kind: string;
  /** התווית שמוצגת ליד תיבת הסימון */
  label: string;
  /** שורת הסבר מתחתיה — מתי בדיוק זה נשלח */
  hint: string;
  /** כותרת הקבוצה במסך */
  group: string;
  /** האם נשלח כשגיא לא נגע בכלום */
  defaultOn: boolean;
  /**
   * ‼ מי מקבל את המייל.
   *   'firm'   — מייל אל המשרד. זו ברירת המחדל וזה רוב הקטלוג.
   *   'client' — מייל אל **הלקוח**. חריג יחיד, ורק כדי שהמתג יופיע באותו מסך.
   *
   * השדה קיים כדי שההבחנה תהיה מפורשת בקוד ולא רק בראש של מי שקורא: מתג
   * שמפעיל מייל ללקוח חייב להיראות אחרת במסך, ואסור שייבלע בין ההתראות
   * הפנימיות. ראה docs/EMAIL-POLICY.md.
   */
  audience?: 'firm' | 'client';
}

export const NOTIFICATION_GROUPS =
  ['הלקוח', 'הרו״ח הקודם', 'תהליך הקליטה', 'המערכת', 'מיילים אוטומטיים ללקוח'] as const;

// ‼ ברירות המחדל שומרות בדיוק על ההתנהגות שהייתה עד היום: שלוש ההתראות
// שכבר נשלחו — דולקות; החמש שנוספו כאן — כבויות, עד שגיא יבחר להדליק.
// כך הוספת המנגנון לא מציפה תיבת דואר קיימת במיילים שאיש לא ביקש.
export const ACCOUNTANT_NOTIFICATIONS: AccountantNotificationDef[] = [
  {
    kind: 'quotation_approved',
    label: 'לקוח אישר הצעת מחיר',
    hint: 'ברגע שהלקוח חותם על ההצעה בדף הציבורי. כולל הסכומים והרשויות שנכללו.',
    group: 'הלקוח',
    defaultOn: true,
  },
  {
    kind: 'onboarding_submitted',
    label: 'לקוח מילא את פרטי הייצוג',
    hint: 'הלקוח שלח את פרטי הזיהוי, והכדור עבר אליך להכנת ייפוי הכוח.',
    group: 'הלקוח',
    defaultOn: true,
  },
  {
    kind: 'poa_signed',
    label: 'לקוח חתם על בקשת ייצוג',
    hint: 'על כל חתימה. בתא משפחתי — גם על חתימת בן/בת הזוג בנפרד.',
    group: 'הלקוח',
    defaultOn: true,
  },
  {
    kind: 'client_document_uploaded',
    label: 'לקוח העלה מסמך',
    hint: 'מייל על כל קובץ שהלקוח מעלה בדף האישי שלו.',
    group: 'הלקוח',
    defaultOn: false,
  },
  {
    kind: 'lead_self_submitted',
    label: 'התקבלה הגשה מקישור מילוי פרטים',
    hint: 'מישהו מילא שם ואימייל בקישור הציבורי ("שליחת קישור למילוי פרטים") — ליד חדש ממתין לטיפול.',
    group: 'הלקוח',
    defaultOn: true,
  },
  {
    kind: 'client_request_completed',
    label: 'לקוח השלים בקשה',
    hint: 'כשכל הפריטים בבקשה סומנו, והבקשה נסגרה מצד הלקוח.',
    group: 'הלקוח',
    defaultOn: false,
  },
  {
    kind: 'release_letter_signed',
    label: 'רו״ח קודם חתם על מכתב השחרור',
    hint: 'החתימה בדף השחרור. אחריה נפתחים השלבים שתלויים בה.',
    group: 'הרו״ח הקודם',
    defaultOn: false,
  },
  {
    kind: 'release_letter_objection',
    // ‼ ברירת מחדל דלוקה, בשונה משאר ההתראות של המסלול: הסתייגות היא הדבר
    // היחיד כאן שמחייב תשובה, וגילוי מאוחר שלה עולה זמן ולקוח.
    label: 'רו״ח קודם השיב או הסתייג',
    hint: 'הערה שהרו״ח הקודם כתב בדף השחרור — הסתייגות, חוב פתוח או כל דבר שצריך לדעת.',
    group: 'הרו״ח הקודם',
    defaultOn: true,
  },
  {
    kind: 'prev_accountant_document_uploaded',
    label: 'רו״ח קודם העלה מסמכים',
    hint: 'מייל על כל חומר שהרו״ח הקודם מעלה בדף השחרור.',
    group: 'הרו״ח הקודם',
    defaultOn: false,
  },
  {
    kind: 'onboarding_closed',
    label: 'תהליך קליטה הושלם',
    hint: 'כשההתקשרות עוברת מקליטה לשוטף — כולל סגירה בכפייה עם סיבה.',
    group: 'תהליך הקליטה',
    defaultOn: false,
  },
  {
    // ‼ אין יותר מייל אוטומטי שיוצא מ-approve_quotation (הכרעת גיא, מיגרציה
    // 102): הלקוח עובר ישירות מהדף לטופס הייצוג באותו רגע, בלי צורך במייל.
    // ההתראה הזאת עברה מ"המייל לא יצא" ל"הלקוח לא סיים למלא" — אותו תנאי
    // בשרת (24 שעות + onboarding_status='pending'), רק שהוא כבר לא תלוי
    // בשליחת מייל שאינה קיימת יותר.
    kind: 'representation_link_missing',
    label: 'לקוח לא השלים את פרטי הייצוג',
    hint: 'עברו 24 שעות מאישור ההצעה והלקוח עדיין לא מילא את פרטי הייצוג. אפשר לשלוח לו תזכורת ממסך בקשת הייצוג.',
    group: 'תהליך הקליטה',
    defaultOn: true,
  },
  {
    // ‼ החריג היחיד בקטלוג: מתג שמפעיל מייל **ללקוח**, לא למשרד.
    // הכרעת גיא (D2): התזכורת אינה מאושרת כאוטומטית, ולכן כבויה כברירת מחדל.
    // כשהיא כבויה — משימת התזמון היומית לא שולחת כלום ולא תופסת תביעה.
    kind: 'quotation_expiry_reminder',
    label: 'תזכורת אוטומטית ללקוח לפני שהצעה פוקעת',
    hint: '‼ מייל שיוצא ללקוח עצמו, בלי שתאשר כל פעם — יום עסקים אחד לפני שההצעה פוקעת. כבוי כברירת מחדל.',
    group: 'מיילים אוטומטיים ללקוח',
    defaultOn: false,
    audience: 'client',
  },
  {
    // ‼ לא עובר בתור: הגיבוי השבועי שולח ישירות מהמתזמן. הוא רשום כאן כי
    // ההבטחה היא שכל מייל אל המשרד ניתן לכיבוי מהמסך הזה, ולא רק אלה שבתור.
    kind: 'weekly_backup',
    label: 'דוח הגיבוי השבועי',
    hint: 'סיכום שבועי — שם קובץ הגיבוי וספירת השורות. הגיבוי עצמו יירשם גם אם המייל כבוי.',
    group: 'המערכת',
    defaultOn: true,
  },
];

export const NOTIFICATION_BY_KIND: Record<string, AccountantNotificationDef> =
  Object.fromEntries(ACCOUNTANT_NOTIFICATIONS.map(n => [n.kind, n]));

/** המפתח שתחתיו יושבות ההגדרות ב-profiles.settings */
export const NOTIFICATION_SETTINGS_KEY = 'accountantNotifications';

export type NotificationPrefs = Record<string, boolean>;

/** ההגדרות השמורות מתוך profiles.settings, בלי להניח שהן קיימות או תקינות. */
export function readNotificationPrefs(settings: unknown): NotificationPrefs {
  const raw = (settings as Record<string, unknown> | null | undefined)?.[NOTIFICATION_SETTINGS_KEY];
  if (!raw || typeof raw !== 'object') return {};
  const out: NotificationPrefs = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === 'boolean') out[k] = v;
  }
  return out;
}

/** האם לשלוח את ההתראה הזו. אירוע לא מוכר — נשלח (ראה ההערה בראש הקובץ). */
export function isNotificationEnabled(settings: unknown, kind: string): boolean {
  const prefs = readNotificationPrefs(settings);
  if (typeof prefs[kind] === 'boolean') return prefs[kind];
  return NOTIFICATION_BY_KIND[kind]?.defaultOn ?? true;
}
