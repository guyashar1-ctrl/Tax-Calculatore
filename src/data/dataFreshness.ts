// ─────────────────────────────────────────────────────────────────────────────
// מרשם עדכניות הנתונים — מקור אמת יחיד ל"מתי אומת כל מאגר ומול מה"
//
// המחזור: בדיקת עדכניות רבעונית (תחילת ינואר, אפריל, יולי, אוקטובר).
// בתחילת כל רבעון המערכת יוצרת אוטומטית משימת בדיקה (ראו freshnessTask.ts).
// הבדיקה עצמה: מחקר עומק מול מקורות רשמיים בלבד → דוח שינויים (ערך קודם,
// ערך חדש, קישור למקור) → אישור הרו"ח → רק אז עדכון בקוד + עדכון lastVerified.
//
// ⚠ שום נתון לא מתעדכן אוטומטית — האישור של הרו"ח הוא תנאי.
// ─────────────────────────────────────────────────────────────────────────────

export interface DatasetFreshness {
  id: string;
  label: string;
  icon: string;
  /** מה כלול במאגר — כדי שדוח הבדיקה יכסה הכל */
  covers: string;
  /** YYYY-MM — מתי אומת לאחרונה מול מקור רשמי */
  lastVerified: string;
  /** המקורות הרשמיים שמולם בודקים */
  officialSources: string[];
}

export const DATASETS: DatasetFreshness[] = [
  {
    id: 'taxData',
    label: 'נתוני מס ליבה',
    icon: '📊',
    covers: 'מדרגות מס, ערך נקודת זיכוי, מס יסף, תקרות ושיעורי ביטוח לאומי, פטור שכר דירה, שווי שימוש, פטור הגרלות',
    lastVerified: '2026-07',
    officialSources: ['לוח עזר לחישוב מס הכנסה — רשות המסים', 'חוזרי ביטוח לאומי (שיעורי דמי ביטוח)', 'קובץ התקנות'],
  },
  {
    id: 'settlements',
    label: 'יישובים מוטבים',
    icon: '🏡',
    covers: 'רשימת היישובים המזכים, אחוזי הזיכוי והתקרות לכל יישוב',
    lastVerified: '2026-07',
    officialSources: ['הודעות רשות המסים בקובץ התקנות (מתעדכן כל ינואר)', 'סעיף 11 לפקודה'],
  },
  {
    id: 'expenses',
    label: 'הוצאות מוכרות',
    icon: '💼',
    covers: '56 נושאי הוצאות: ורדיקטים מס הכנסה ומע"מ, תקרות (נסיעות חו"ל, מתנות, אש"ל), שיעורי קיזוז',
    lastVerified: '2026-07',
    officialSources: ['תקנות מס הכנסה (ניכוי הוצאות מסוימות)', 'תקנות מע"מ', 'חוזרי מס הכנסה', 'הוראות ביצוע'],
  },
  {
    id: 'savings',
    label: 'פנסיה וקרן השתלמות',
    icon: '🏦',
    covers: 'תקרת ההכנסה המזכה ושיעור הניכוי (47), שיעור הזיכוי וההפקדה המזכה (45א), פנסיית חובה לעצמאי, תקרת ההכנסה הקובעת והניכוי לקרן השתלמות (17(5א)), תקרת ההפקדה הפטורה ממס רווחי הון',
    lastVerified: '2026-07',
    officialSources: ['פקודת מס הכנסה — סעיפים 47, 45א, 17(5א)', 'רשות שוק ההון — תקרות הפקדה שנתיות', 'חוק ההתייעלות הכלכלית 2017–2018 (פנסיה חובה לעצמאים)'],
  },
  {
    id: 'bookkeeping',
    label: 'ניהול ספרים',
    icon: '📖',
    covers: 'ספי המחזור והמועסקים ב-15 התוספות, רשימות הספרים, סכומי הסף (710/2,150/3,400 ₪ וכו\')',
    lastVerified: '2026-07',
    officialSources: ['הוראות מס הכנסה (ניהול פנקסי חשבונות), תשל"ג-1973 — נוסח משולב מעודכן (נבו)'],
  },
  {
    id: 'topics',
    label: 'נושאים מקצועיים',
    icon: '📚',
    covers: 'פנסיה (תקרות הפקדה), פרישה, מע"מ (סף עוסק פטור), חברות, מקרקעין, מועדי דיווח',
    lastVerified: '2026-07',
    officialSources: ['רשות המסים', 'רשות שוק ההון', 'קובץ התקנות'],
  },
];

// ─── עזרי רבעונים ────────────────────────────────────────────────────────────

/** תחילת הרבעון הנוכחי (1 בינואר / אפריל / יולי / אוקטובר) */
export function currentQuarterStart(now = new Date()): Date {
  const q = Math.floor(now.getMonth() / 3) * 3;
  return new Date(now.getFullYear(), q, 1);
}

export function quarterLabel(d: Date): string {
  return `Q${Math.floor(d.getMonth() / 3) + 1}/${d.getFullYear()}`;
}

export function nextQuarterStart(now = new Date()): Date {
  const cur = currentQuarterStart(now);
  return new Date(cur.getFullYear(), cur.getMonth() + 3, 1);
}

/** האם המאגר אומת ברבעון הנוכחי */
export function isVerifiedThisQuarter(ds: DatasetFreshness, now = new Date()): boolean {
  const [y, m] = ds.lastVerified.split('-').map(Number);
  const verified = new Date(y, m - 1, 1);
  return verified >= currentQuarterStart(now);
}

export function fmtMonth(yyyyMm: string): string {
  const [y, m] = yyyyMm.split('-');
  return `${m}/${y}`;
}

export function fmtNextCheck(now = new Date()): string {
  const n = nextQuarterStart(now);
  return `${String(n.getMonth() + 1).padStart(2, '0')}/${n.getFullYear()}`;
}
