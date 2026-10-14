// ─── בדיקות: נושא העסק הזעיר (11.10.2026) ──────────────────────────────────
// ‼ מה נעול כאן:
//   · «שלוש שנים» אינו נאמר כדין: מותר רק כשמייחסים אותו למדריכים (הסתירה מול 87ה(ב)).
//   · הנושא מפנה לארבעת כללי העסק הזעיר, ולא מציג את סימוני 1301 כ«חדש ב-2025».
//   · הדף לא מציג «מעל התקרה ⇒ הוצאות בפועל» בלי להבחין ברישום בתחילת השנה.

import { test, assert } from '../../../testkit/tinyTest';
import type { TestCase } from '../../../testkit/tinyTest';
import { MICRO_LESSON } from '../topics/lessonsMore';
import { TOPIC_BY_ID } from '../topics';
import MICRO_BODY from '../topics/MicroBusinessBody.tsx?raw';

const lessonTexts = [
  ...MICRO_LESSON.mustKnow.map(p => p.text),
  ...(MICRO_LESSON.action ? [MICRO_LESSON.action.text] : []),
  ...MICRO_LESSON.glossary.flatMap(g => [g.plain, g.where ?? '']),
  ...MICRO_LESSON.thinking.flatMap(t => [t.q, t.why]),
  ...MICRO_LESSON.mistakes.flatMap(m => [m.wrong, m.right]),
];

/** «שלוש» ליד צינון/ויתור — רק כשהמשפט מייחס אותו למדריכים. */
function threeYearsAsLaw(text: string): boolean {
  return /שלוש/.test(text) && !/מדריכ/.test(text);
}

export const TESTS: TestCase[] = [
  test('שיעור: «שלוש שנים» מופיע רק כייחוס למדריכים, והצינון נשלף מהמרשם', () => {
    const bad = lessonTexts.filter(t => threeYearsAsLaw(t) && !/^«ויתור קושר לשלוש שנים»/.test(t));
    assert(bad.length === 0, bad.join(' | '));
    assert(lessonTexts.some(t => t.includes('{{micro.coolingYears}}')), 'מספר שנות הצינון מהמרשם');
    assert(lessonTexts.some(t => t.includes('{{micro.exceededCap}}')), 'תקרת הניכוי בחריגה מהמרשם');
  }),

  test('שיעור: המעמד במע״מ מוצג כנפרד, ולא כתנאי', () => {
    assert(lessonTexts.some(t => t.includes('עוסק מורשה יכול להיות עסק זעיר')), 'עוסק מורשה יכול להיות עסק זעיר');
  }),

  test('נושא: ארבעת הכללים, סימוני 1301 כבר ב-2024, ו-87ד(ג) ידני', () => {
    const t = TOPIC_BY_ID.microBusiness;
    for (const id of ['micro.turnoverCeiling', 'micro.normativeRate', 'micro.exceededCap', 'micro.coolingYears']) assert(t.ruleIds.includes(id), id);
    const f = JSON.stringify(t.form1301);
    assert(!f.includes('חדש ב-2025'), 'הסימונים מופיעים כבר במדריך 2024');
    assert(f.includes('87ד(ג)') && f.includes('ידני'), '87ד(ג) — טיפול ידני');
    assert(!t.gaps.some(g => g.includes('צינון')) && t.gaps.some(g => g.includes('באמצע השנה')), 'הצינון הוכרע — לא ברשימת הפתוחים; הפתוחים כן');
  }),

  test('דף: חריגה מוצגת לפי רישום בתחילת השנה, והמחשבון מקבל רישום והיסטוריה', () => {
    assert(MICRO_BODY.includes('registeredAtYearStart'), 'המחשבון מעביר רישום בתחילת השנה');
    assert(MICRO_BODY.includes('history'), 'המחשבון מעביר היסטוריית ניכוי');
    assert(!/לא חוזרים אליהם(?: בשלוש| שלוש)/.test(MICRO_BODY), 'אין «לא חוזרים שלוש שנים» כדין');
    assert(!MICRO_BODY.includes('זה לא עסק זעיר. מנכים'), 'דוגמת 130,000 הישנה (בלי הבחנה ברישום) הוסרה');
    assert(!/dealerType|vatStatus/.test(MICRO_BODY), 'המעמד במע״מ אינו קלט בדף');
  }),
];
