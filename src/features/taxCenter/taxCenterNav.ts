// ─── «ידע מס» · הכלים ומה מוצג בראש העמוד ──────────────────────────────────
// ‼ הכלי הפתוח הוא null עד שבוחרים: במחשב מוצגים הנושאים (המסילה בצד),
// ובטלפון — הרשימה, כמו «המשרד». ראה TaxCenter.tsx ו-pivo-design.css.
// ‼ 10.10.2026: «פנסיה וקרן השתלמות» הוחלף בנושאים על מרשם הכללים
// (features/taxKnowledge). הכלים הקיימים נשארו כמו שהם.

export type Tool =
  | 'overview' | 'expenses' | 'bookkeeping' | 'wizard' | 'rental' | 'incomeTax' | 'ni' | 'settlements' | 'topics' | 'map1301' | 'maintenance';

export interface ToolDef { key: Tool; label: string; desc: string; group: 'tools' | 'control' }

export const OVERVIEW_LABEL = 'נושאים';

export const TOOLS: ToolDef[] = [
  { key: 'expenses',     group: 'tools',   label: 'הוצאות מוכרות',       desc: '"אפשר לנכות את זה?" - תשובה בשניות: מס הכנסה, מע"מ, מקורות ופסיקה' },
  { key: 'bookkeeping',  group: 'tools',   label: 'ניהול ספרים',          desc: 'איזו תוספת ואילו ספרים כל עוסק חייב - אשף, 15 התוספות ומילון הספרים' },
  { key: 'wizard',       group: 'tools',   label: 'אשף נקודות זיכוי',   desc: 'עונים על שאלות - המערכת קובעת את הנקודות ומסבירה למה' },
  { key: 'rental',       group: 'tools',   label: 'מחשבון שכר דירה',     desc: 'השוואת פטור / 10% / שולי, כולל הפטור המתקפל ו-122(ו)' },
  { key: 'incomeTax',    group: 'tools',   label: 'מדרגות ומס יסף',      desc: 'מדרגות עדכניות, מס יסף דו-שכבתי וחישוב מהיר' },
  { key: 'ni',           group: 'tools',   label: 'ביטוח לאומי',          desc: 'שיעורים, תקרות ומחשבון לכל סוגי המבוטחים' },
  { key: 'settlements',  group: 'tools',   label: 'יישובים מוטבים',       desc: 'הרשימה הרשמית המלאה + מחשבון זיכוי' },
  { key: 'topics',       group: 'tools',   label: 'ערכים לפי נושא',       desc: 'פרישה, מע"מ, חברות, מקרקעין, רכב, מועדים ועוד' },
  { key: 'map1301',      group: 'control', label: 'טופס 1301',            desc: 'הגרסה ומה נקרא ממנה, מה השתנה, שדות ממופים, מוכנות לקוח ונספחים, וכיסוי לפי חלקים' },
  { key: 'maintenance',  group: 'control', label: 'עדכניות ותחזוקה',      desc: 'ביסוס לכל כלל, בדיקת הכיסוי, ופרומפט עדכון לכל המאגר או לנושא' },
];

/** מיפוי כלי → מאגר הנתונים שמזין אותו (לתג העדכניות) */
export const TOOL_DATASET: Partial<Record<Tool, string>> = {
  expenses: 'expenses',
  bookkeeping: 'bookkeeping',
  wizard: 'taxData',
  rental: 'taxData',
  incomeTax: 'taxData',
  ni: 'taxData',
  settlements: 'settlements',
  topics: 'topics',
  map1301: 'taxRules',
  maintenance: 'taxRules',
};

/** כלים שאינם תלויים בשנת המס — בטלפון אין טעם להציג בהם את בורר השנה. */
const YEARLESS: ReadonlySet<Tool> = new Set<Tool>(['expenses', 'bookkeeping', 'map1301']);

export interface TaxCenterHead {
  tool: Tool;
  title: string;
  status: string;
  /** בורר השנה ליד הכותרת (בטלפון; במחשב הוא במסילה). */
  usesYear: boolean;
  /** תג העדכניות ליד הכותרת. בנושאים — הביסוס מוצג בתוך כל נושא, ולכן אין תג. */
  datasetId: string | null;
}

/** מה מוצג בראש העמוד לכלי שנבחר (null = עוד לא נבחר ⇒ הנושאים). */
export function taxCenterHead(picked: Tool | null, year: number): TaxCenterHead {
  const tool: Tool = picked ?? 'overview';
  const def = TOOLS.find(t => t.key === tool);
  return {
    tool,
    title: def ? def.label : OVERVIEW_LABEL,
    status: def ? def.desc : `ללמוד נושא, להבין מתי הוא חל ומה עושים בתיק · ערכי ${year}`,
    usesYear: !YEARLESS.has(tool),
    datasetId: tool === 'overview' ? null : (TOOL_DATASET[tool] ?? null),
  };
}
