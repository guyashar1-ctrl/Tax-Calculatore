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
}

export const NOTIFICATION_GROUPS = ['הלקוח', 'הרו״ח הקודם', 'תהליך הקליטה', 'המערכת'] as const;

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
