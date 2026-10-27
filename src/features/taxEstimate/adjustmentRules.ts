// ─── הנוהל: קטגוריית הוצאה בספרים ← כמה מוכר (27.10.2026) ──────────────────────────────────────────
// ‼ מקום אחד. ההתאמות בהערכה נגזרות מכאן לבד (forecastFlow.ts › deriveDraft) ומוצגות בטבלה «בספרים · התאמה · מוכרת».
//   גיא (27.10): «יהיה נוהל מסודר של מה מסמל כל קוד, ואם צריך התאמה — זה יבצע אותה». עד שהנוהל ייכתב — הכללים
//   הנפוצים, כל אחד עם המקור (מחקר 27.10.2026: נוסח התקנות בוויקיטקסט; סכומים מוצמדים — לאמת מול הודעת רשות המסים לשנה).
//   קטגוריה שאין לה כלל — מוכרת כולה. מתנות (עד סכום לכל מקבל) — אין כלל אוטומטי: תלוי במספר המקבלים, נבדק במשרד.
// ‼ ההתאמה היא על ההוצאה שבספרים, לא על מה שהלקוח רואה: ללקוח — המספרים כמו אצלו; ההתאמה — במשרד.

export interface AdjustmentRule {
  id: string;
  /** הטקסט בטבלה, למשל «מוכר 45%». */
  label: string;
  /** שם הקטגוריה בדוח (פייפרלס) — התאמה לפי מילים. */
  match: RegExp;
  /** כמה מההוצאה מוכר, באחוזים. */
  recognizedPct: number;
  /** תקרה שנתית לסכום המוכר (₪) — יחסית לחודשים עד החתך. */
  capPerYear?: number;
  /** המקור (תקנה / סעיף). */
  basis: string;
}

export const ADJUSTMENT_RULES: AdjustmentRule[] = [
  { id: 'vehicle', label: 'מוכר 45%', match: /רכב|דלק|ליסינג|חניה|כביש 6/, recognizedPct: 45,
    basis: 'תקנות מס הכנסה (ניכוי הוצאות רכב), תשנ״ה-1995, תקנה 2(1): הגבוה מבין 45% מההוצאות לבין ההוצאות פחות שווי השימוש — 45% הוא המינימום' },
  { id: 'refreshments', label: 'מוכר 80%', match: /כיבוד/, recognizedPct: 80,
    basis: 'תקנות מס הכנסה (ניכוי הוצאות מסוימות), תשל״ב-1972, תקנה 2(1): כיבוד קל במקום העסק — 80%' },
  { id: 'fines', label: 'לא מוכר', match: /קנס/, recognizedPct: 0,
    basis: 'פקודת מס הכנסה, סעיפים 17 ו-32: קנס אינו הוצאה בייצור ההכנסה' },
  { id: 'mobile', label: 'מוכר חצי, עד 1,380 ₪ לשנה', match: /סלולר|טלפון נייד|נייד/, recognizedPct: 50, capPerYear: 1380,
    basis: 'תקנות ניכוי הוצאות מסוימות, תקנה 2ב(ג): הנמוך מבין מחצית ההוצאה ל-1,380 ₪ לשנה (2023–2027)' },
  { id: 'hospitality', label: 'לא מוכר', match: /אירוח/, recognizedPct: 0,
    basis: 'תקנות ניכוי הוצאות מסוימות, תקנה 3: אירוח בארץ אינו מותר (אירוח אורח מחו״ל — מותר, נבדק במשרד)' },
];

export function ruleFor(category: string): AdjustmentRule | undefined {
  return ADJUSTMENT_RULES.find(r => r.match.test(category));
}

/** כמה מוכר מתוך הוצאה בספרים, עד חודש החתך. */
export function recognizedOf(rule: AdjustmentRule, book: number, cutoffMonth: number): number {
  const byPct = (book * rule.recognizedPct) / 100;
  return Math.round(rule.capPerYear != null ? Math.min(byPct, (rule.capPerYear * cutoffMonth) / 12) : byPct);
}
