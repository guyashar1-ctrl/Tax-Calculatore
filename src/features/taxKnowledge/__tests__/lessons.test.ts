// ─── בדיקות: שכבת הלימוד (11.10.2026) ──────────────────────────────────────
// ‼ מה נעול כאן:
//   · כל מספר בשיעור נשלף מהמרשם — {{rule.id}} שאינו קיים, או שאין לו ערך לשנה
//     שהנושא מוצג בה, היה מציג «אין ערך» באמצע משפט.
//   · לכל טענה יש סטטוס (מאומת / פרשנות / פתוח). טענה בלי סטטוס נראית מאומתת.
//   · נושא עם פערים פתוחים לא מוצג כאילו הכול בו מאומת — לפחות טענה אחת «פתוח».
//   · אין ספרות בטקסט הסטטוסים «מאומת» שמחליפות כלל מהמרשם (מלבד ערכים
//     שמופיעים במדריך כדוגמה, כמו 269,280) — כדי שעדכון שנתי לא ישאיר מספר ישן.

import { test, equal, assert } from '../../../testkit/tinyTest';
import type { TestCase } from '../../../testkit/tinyTest';
import { PENSION_LESSON, STUDY_FUND_LESSON, WEALTH_LESSON } from '../topics/lessons';
import { NI_LESSON, ADVANCES_LESSON, MANDATORY_LESSON, MICRO_LESSON } from '../topics/lessonsMore';
import { ruleTokens, type Lesson } from '../topics/lesson';
import { ruleView } from '../../taxRules/registry';
import { TOPIC_BY_ID } from '../topics';
import { MATERNITY_LESSON } from '../topics/MaternityBody';

const LESSONS: [string, Lesson][] = [
  ['pensionSE', PENSION_LESSON], ['studyFund', STUDY_FUND_LESSON], ['wealth', WEALTH_LESSON],
  ['niSelfEmployed', NI_LESSON], ['advances', ADVANCES_LESSON], ['mandatoryPension', MANDATORY_LESSON], ['microBusiness', MICRO_LESSON],
  ['maternity', MATERNITY_LESSON],
];

function allTexts(l: Lesson): { text: string; status: string }[] {
  return [
    ...l.mustKnow,
    ...(l.action ? [l.action] : []),
    ...l.glossary.flatMap(g => [{ text: g.plain, status: g.status }, ...(g.where ? [{ text: g.where, status: g.status }] : [])]),
    ...l.thinking.flatMap(t => [{ text: t.q, status: t.status }, { text: t.why, status: t.status }]),
    ...l.mistakes.flatMap(m => [{ text: m.wrong, status: m.status }, { text: m.right, status: m.status }]),
  ];
}

// מספרים שמותר לכתוב בטקסט: דוגמאות מהמדריך, מספרי סעיפים וקודים בטופס.
const ALLOWED_NUMBERS = new Set(['1,000', '187', '180', '190', '31.1', '7', '269,280', '2025', '2026', '16.5%', '35%', '5%', '5.5%', '50', '1.1', '106', '218', '219', '5', '53', '58', '59', '76', '49', '50', '51', '52', '47', '45', '17', '120', '9', '16', '6', '3', '32', '14',
  // הצהרת הון: סעיפים, שורות בטופס, גיל, שנים
  '18', '135', '800', '1', '2027', '4', '2023', '0', '1219', '2', '31.12',
  // ב״ל, פנסיית חובה, עסק זעיר: סעיפים, טופס ושדות, גילים ותאריך תחולה
  '345', '1301', '54', '030', '089', '21', '55', '1.1.2017',
  // עסק זעיר: סעיפים (87, 17 עד 27), סוג תיק 44, שדה 279, שנת התחילה ומועדים — לא סכומים
  '87', '27', '44', '279', '2024', '31.3', '25.12', '1.1.2026', '31.8.2026',
  // דמי לידה: קודי שדות, טופס 116ג וסוג 9 בו, ימי זכאות (לפי האכשרה) — לא סכומים
  '250', '270', '194', '196', '158', '172', '040', '042', '150', '170', '105', '56', '116']);

export const TESTS: TestCase[] = [
  ...LESSONS.map(([id, l]) => test(`${id}: כל {{כלל}} קיים ויש לו ערך ל-2025 ול-2026`, () => {
    const missing: string[] = [];
    for (const { text } of allTexts(l)) {
      for (const r of ruleTokens(text)) {
        for (const y of [2025, 2026]) if (!ruleView(r, y)?.entry) missing.push(`${r}@${y}`);
      }
    }
    equal(missing.join(', '), '');
  })),
  ...LESSONS.map(([id, l]) => test(`${id}: לכל טענה יש סטטוס תקין`, () => {
    const bad = allTexts(l).filter(t => !['verified', 'interpretation', 'open'].includes(t.status));
    equal(bad.length, 0);
  })),
  ...LESSONS.map(([id, l]) => test(`${id}: הנושא לא נראה מושלם — יש פערים, ולפחות טענה אחת שאינה «מאומת»`, () => {
    const topic = TOPIC_BY_ID[id];
    assert(!!topic, 'הנושא קיים');
    assert(topic.gaps.length > 0, 'יש פערים פתוחים בנושא');
    assert(allTexts(l).some(t => t.status !== 'verified'), 'יש טענה שאינה מאומתת');
  })),
  ...LESSONS.map(([id, l]) => test(`${id}: «בקצרה» קצר — עד 7 נקודות`, () => {
    assert(l.mustKnow.length >= 3 && l.mustKnow.length <= 7, `${l.mustKnow.length} נקודות`);
  })),
  ...LESSONS.map(([id, l]) => test(`${id}: אין סכומים כתובים ביד במקום כלל מהמרשם`, () => {
    const found: string[] = [];
    for (const { text } of allTexts(l)) {
      const plain = text.replace(/\{\{[^}]+\}\}/g, '');
      for (const m of plain.matchAll(/\d+(?:[,.]\d+)*%?/g)) if (!ALLOWED_NUMBERS.has(m[0])) found.push(m[0]);
    }
    equal(found.join(' '), '');
  })),
];
