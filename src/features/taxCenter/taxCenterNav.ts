// ─── «ידע מס» · הכלים ומה מוצג בראש העמוד ──────────────────────────────────
// ‼ הכלי הפתוח הוא null עד שבוחרים: במחשב מוצגת אז הסקירה (המסילה בצד),
// ובטלפון — רשימת הכלים, כמו «המשרד». ראה TaxCenter.tsx ו-pivo-design.css.

export type Tool =
  | 'overview' | 'expenses' | 'savings' | 'bookkeeping' | 'wizard' | 'rental' | 'incomeTax' | 'ni' | 'settlements' | 'topics';

export interface ToolDef { key: Tool; label: string; desc: string }

export const OVERVIEW_LABEL = 'סקירה';

export const TOOLS: ToolDef[] = [
  { key: 'expenses',     label: 'הוצאות מוכרות',       desc: '"אפשר לנכות את זה?" - תשובה בשניות: מס הכנסה, מע"מ, מקורות ופסיקה' },
  { key: 'savings',      label: 'פנסיה וקרן השתלמות',  desc: 'שתי ההטבות הגדולות של עצמאי - ניכוי, זיכוי ופטור ממס רווחי הון, כל אחד בנפרד' },
  { key: 'bookkeeping',  label: 'ניהול ספרים',          desc: 'איזו תוספת ואילו ספרים כל עוסק חייב - אשף, 15 התוספות ומילון הספרים' },
  { key: 'wizard',       label: 'אשף נקודות זיכוי',   desc: 'עונים על שאלות - המערכת קובעת את הנקודות ומסבירה למה' },
  { key: 'rental',       label: 'מחשבון שכר דירה',     desc: 'השוואת פטור / 10% / שולי, כולל הפטור המתקפל ו-122(ו)' },
  { key: 'incomeTax',    label: 'מדרגות ומס יסף',      desc: 'מדרגות עדכניות, מס יסף דו-שכבתי וחישוב מהיר' },
  { key: 'ni',           label: 'ביטוח לאומי',          desc: 'שיעורים, תקרות ומחשבון לכל סוגי המבוטחים' },
  { key: 'settlements',  label: 'יישובים מוטבים',       desc: 'הרשימה הרשמית המלאה + מחשבון זיכוי' },
  { key: 'topics',       label: 'נושאים מקצועיים',      desc: 'פנסיה, פרישה, מע"מ, חברות, מקרקעין, מועדים ועוד' },
];

/** מיפוי כלי → מאגר הנתונים שמזין אותו (לתג העדכניות) */
export const TOOL_DATASET: Partial<Record<Tool, string>> = {
  expenses: 'expenses',
  savings: 'savings',
  bookkeeping: 'bookkeeping',
  wizard: 'taxData',
  rental: 'taxData',
  incomeTax: 'taxData',
  ni: 'taxData',
  settlements: 'settlements',
  topics: 'topics',
};

/** כלים שאינם תלויים בשנת המס — בטלפון אין טעם להציג בהם את בורר השנה. */
const YEARLESS: ReadonlySet<Tool> = new Set<Tool>(['expenses', 'bookkeeping']);

export interface TaxCenterHead {
  tool: Tool;
  title: string;
  status: string;
  /** בורר השנה ליד הכותרת (בטלפון; במחשב הוא במסילה). */
  usesYear: boolean;
  /** תג העדכניות ליד הכותרת. בסקירה יש לוח עדכניות מלא, ולכן אין תג. */
  datasetId: string | null;
}

/** מה מוצג בראש העמוד לכלי שנבחר (null = עוד לא נבחר ⇒ הסקירה). */
export function taxCenterHead(picked: Tool | null, year: number): TaxCenterHead {
  const tool: Tool = picked ?? 'overview';
  const def = TOOLS.find(t => t.key === tool);
  return {
    tool,
    title: def ? def.label : OVERVIEW_LABEL,
    status: def ? def.desc : `ערכי המפתח של ${year} ועדכניות הנתונים`,
    usesYear: !YEARLESS.has(tool),
    datasetId: tool === 'overview' ? null : (TOOL_DATASET[tool] ?? null),
  };
}
