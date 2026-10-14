// ─── נספח 1320 (נספח א׳) — חישוב ההכנסה החייבת מעסק, מהספרים ─────────────────────────
// ‼ השורות לפי הנספח לשנת 2025 (annexes-2025.catalog.json): 1 הכנסות · 2א–2ד עלות המכירות · 3א–17 הוצאות ·
//   18 סה״כ · 19 הכנסות פחות הוצאות · 20 התאמת הוצאות שאינן מותרות (+) · 21 ניכוי נוסף בשל פחת (−) · 22 הכנסה חייבת.
// ‼ שורות רו״ה מוקצות לשורות הנספח בהצעה לפי מילות מפתח — והמשרד מאשר. שורה שלא הוקצתה = הנספח לא מלא.
// ‼ פחת (17) מחייב 1342 ושורה 21 מחייבת 1343 — שניהם לא נתמכים, ולכן הנספח «מלא» רק בלעדיהם.

import type { Books1320 } from './types';
import type { PnlImport } from '../taxEstimate/importers';

export const LINES_1320: { key: string; label: string; derived?: boolean; count?: boolean }[] = [
  { key: '1', label: '1. סה״כ הכנסות (ללא מע״מ)' },
  { key: '2a', label: '2א. מלאי בתחילת השנה' }, { key: '2b', label: '2ב. קניות' }, { key: '2c', label: '2ג. מלאי בסוף השנה (מופחת)' },
  { key: '2d', label: '2ד. עלות המכירות', derived: true },
  { key: '3a', label: '3א. מספר עובדים (ממוצע)', count: true }, { key: '3b', label: '3ב. משכורת ושכר עבודה' }, { key: '3c', label: '3ג. הוצאות נלוות לשכר' },
  { key: '4', label: '4. עבודות חוץ וקבלנות משנה' }, { key: '5', label: '5. שירותים אחרים' }, { key: '6', label: '6. הוצאות מימון' },
  { key: '7', label: '7. הוצאות רכב — החלק המותר' }, { key: '8', label: '8. אחזקה ותיקונים' }, { key: '9', label: '9. הוצאות משרדיות' },
  { key: '10', label: '10. הנהלת חשבונות והגשת הדוח' }, { key: '11', label: '11. דמי שכירות וחכירה' }, { key: '12', label: '12. הוצאות מוכרות לפי התקנות' },
  { key: '13', label: '13. מיסים עירוניים, אגרות והיטלים' }, { key: '14', label: '14. ביטוח עסקי' }, { key: '15', label: '15. חובות רעים' },
  { key: '16', label: '16. הוצאות אחרות' }, { key: '17', label: '17. פחת מותר (לא כולל רכב)' },
  { key: '18', label: '18. סה״כ הוצאות מותרות', derived: true }, { key: '19', label: '19. הכנסות פחות הוצאות', derived: true },
  { key: '20', label: '20. התאמת הוצאות שאינן מותרות (+)' }, { key: '21', label: '21. ניכוי נוסף בשל פחת (−)' },
  { key: '22', label: '22. סה״כ הכנסה חייבת', derived: true },
];
export const EXPENSE_LINES = ['3b', '3c', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13', '14', '15', '16', '17'];
/** סעיף א׳ — ניהול ספרים (כן/לא), ושני שדות טקסט. */
export const BOOK_QUESTIONS: { key: string; label: string; kind: 'yesno' | 'text' }[] = [
  { key: 'basedOnBooks', label: 'הפירוט מבוסס על פנקסי החשבונות', kind: 'yesno' }, { key: 'mustDouble', label: 'חייב בניהול כפול', kind: 'yesno' },
  { key: 'double', label: 'ניהל ספרים בשיטה הכפולה', kind: 'yesno' }, { key: 'register', label: 'מפעיל קופה רושמת', kind: 'yesno' },
  { key: 'receipts', label: 'מנהל שוברי קבלות / חשבוניות', kind: 'yesno' }, { key: 'inventoryCount', label: 'ערך מפקד מצאי', kind: 'yesno' },
  { key: 'booksRule', label: 'תוספת / סעיף בהוראות ניהול ספרים', kind: 'text' }, { key: 'booksLocation', label: 'מקום הספרים', kind: 'text' },
];

/** הצעת הקצאה לשורת רו״ה — לפי מילות מפתח. המשרד מאשר או משנה. */
const KEYWORDS: [RegExp, string][] = [
  [/פחת/, '17'], [/רכב|דלק|חני[יה]|כביש 6|ליסינג|טסט|רישוי רכב/, '7'], [/שכר ד(י)?רה|שכירות|דמי שכירות|חכירה/, '11'],
  [/ביטוח לאומי מעביד|נלוות לשכר|הוצאות נלוות|פנסיה מעביד|פיצויים/, '3c'], [/שכר עבודה|משכורת|שכר עובדים/, '3b'],
  [/קבלני משנה|עבודות חוץ|קבלנות/, '4'], [/הנהלת חשבונות|רואה חשבון|רו״?ח|ראיית חשבון/, '10'], [/ייעוץ|יועצ|שירותים מקצועיים|עורך דין|משפטי/, '5'],
  [/ריבית|עמלות|מימון|הפרשי הצמדה/, '6'], [/אחזקה|תיקונים|תחזוקה/, '8'], [/משרד|תקשורת|טלפון|אינטרנט|דואר|ציוד משרדי|הדפסה|תוכנה|מחשוב/, '9'],
  [/כיבוד|מתנות|ספרות מקצועית|עיתונים|השתלמות מקצועית/, '12'], [/ארנונה|אגר|מיסים עירוניים|היטל/, '13'], [/ביטוח/, '14'],
  [/חובות אבודים|חובות רעים|חובות מסופקים/, '15'], [/קניות|חומרי גלם|סחורה|חומרים/, '2b'],
];
export const suggestLine = (label: string): string | undefined => KEYWORDS.find(([re]) => re.test(label))?.[1];

/** קליטה מרו״ה: הכנסות לשורה 1, כל קטגוריית הוצאה עם הצעת שורה. */
export function booksFromPnl(p: PnlImport, prev?: Books1320): Books1320 {
  const income = p.months.reduce((a, m) => a + (m.income ?? 0), 0);
  const imported = p.expenseCategories.map(c => ({ label: c.label, total: Math.round(c.total), line: prev?.imported?.find(x => x.label === c.label)?.line ?? suggestLine(c.label) }));
  return { ...(prev ?? { answers: {} }), lines: { ...(prev?.lines ?? {}), '1': Math.round(income) }, imported, importedRevenue: Math.round(income) };
}

/** השורות הסופיות: הקצאות רו״ה + הזנה ידנית, ושורות מחושבות. */
export function compute1320(b: Books1320, ctx: { profitFact?: number; label: string }): { lines: Record<string, number>; complete: boolean; problems: string[] } {
  const lines: Record<string, number> = {};
  for (const l of LINES_1320) if (!l.derived && b.lines[l.key] != null) lines[l.key] = b.lines[l.key];
  // שורות רו״ה שהוקצו מצטברות לשורה (מעל הזנה ידנית לאותה שורה — לא שתיהן)
  const assigned = (b.imported ?? []).filter(x => x.line);
  for (const k of new Set(assigned.map(x => x.line!))) lines[k] = assigned.filter(x => x.line === k).reduce((a, x) => a + x.total, 0);
  if (lines['7'] != null && b.carAllowed != null) lines['7'] = b.carAllowed; // שורה 7 נרשמת בחלק המותר לפי תקנות הרכב
  const v = (k: string) => lines[k] ?? 0;
  lines['2d'] = v('2a') + v('2b') - v('2c');
  lines['18'] = lines['2d'] + EXPENSE_LINES.reduce((a, k) => a + v(k), 0);
  lines['19'] = v('1') - lines['18'];
  lines['22'] = lines['19'] + v('20') - v('21');
  const problems: string[] = [];
  if (b.lines['1'] == null) problems.push('שורה 1 (הכנסות) — חסרה');
  const unassigned = (b.imported ?? []).filter(x => !x.line);
  if (unassigned.length) problems.push(`${unassigned.length} שורות רו״ה בלי שורה בנספח: ${unassigned.slice(0, 3).map(x => x.label).join(', ')}${unassigned.length > 3 ? '…' : ''}`);
  if (!b.basis) problems.push('בסיס הדיווח (מזומן / מצטבר) — לא נבחר');
  const missingAns = BOOK_QUESTIONS.filter(q => b.answers[q.key] === undefined || b.answers[q.key] === '');
  if (missingAns.length) problems.push(`ניהול ספרים (סעיף א׳): ${missingAns.length} פרטים חסרים`);
  if (v('7') > 0 && (b.carAllowed == null || !b.carDetails?.trim())) problems.push('שורה 7 — רכב: חסרים החלק המותר לפי התקנות ופרטי הרכב (סעיף ג׳)');
  if (v('11') > 0 && !b.landlord?.trim()) problems.push('שורה 11 — שכירות: חסרים פרטי המשכיר (סעיף ד׳)');
  if (v('20') > 0 && !b.addBackNote?.trim()) problems.push('שורה 20 — חסר פירוט ההוצאות שאינן מותרות (סעיף ה׳)');
  if (ctx.profitFact != null && Math.abs(lines['19'] - ctx.profitFact) > 1) problems.push(`שורה 19 (${Math.round(lines['19']).toLocaleString('he-IL')}) שונה מהרווח לפי הספרים בשנת המס (${Math.round(ctx.profitFact).toLocaleString('he-IL')})`);
  // ‼ 17 / 21 מחייבים נספחים שלא נתמכים — הנספח אינו «מלא» גם כשהשורות מולאו
  const complete = problems.length === 0 && v('17') === 0 && v('21') === 0;
  return { lines, complete, problems };
}
