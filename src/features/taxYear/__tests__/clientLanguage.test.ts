// ─── שאלות בשפת הלקוח (16.10.2026) ───────────────────────────────────────────
// ‼ מה נעול: שאלה ללקוח (question / coupleQuestion / followupQuestion / whenEmpty) — בלי קודי טפסים
//   ובלי מונחי מס; שם הטופס, כשהוא עוזר למצוא את המסמך, עובר להסבר (why). ת.ז. ברשומה — עם ספרת ביקורת.
//   «מה השתנה מאז» — תקין דקדוקית (לא «בהמשפחה»).

import { test, equal, assert } from '../../../testkit/tinyTest';
import type { TestCase } from '../../../testkit/tinyTest';
import { ITEMS, ITEM_BY_KEY } from '../catalog';
import { schemaFor, validateRecord } from '../records';

const texts = ITEMS.flatMap(i => [i.question, i.coupleQuestion, i.followupQuestion, i.whenEmpty?.question]
  .filter((q): q is string => !!q).map(q => ({ key: i.key, q })));
// קוד טופס/נספח (3+ ספרות), «טופס 106», «נספח», «סעיף», וכמה מונחי מס שאינם שפת לקוח
// ‼ מילים — עם גבול מילה (בעברית אין \b): «שומה» לא תיתפס בתוך «שרשומה», «פחת» לא בתוך «משפחתי»
const W = (w: string) => String.raw`(?:^|[\s(«\-])` + w + String.raw`(?=$|[\s,.)?»])`;
const JARGON = new RegExp([String.raw`(?:^|[^\d])\d{3,4}(?:[^\d%]|$)`, String.raw`טופס\s*\d`,
  ...['נספח', 'סעיף', 'פחת', 'ני״ע', 'ניכוי במקור', 'הכנסה חייבת', 'רווח הון', 'שומה'].map(W)].join('|'));

export const TESTS: TestCase[] = [
  test('אף שאלה ללקוח אינה כוללת קוד טופס או מונח מס', () => {
    const bad = texts.filter(t => JARGON.test(t.q.replace(/\{[^}]+\}/g, '')));
    equal(bad.map(b => `${b.key}: ${b.q}`).join('\n'), '');
  }),
  test('שם הטופס עבר להסבר — 106, 867, 126', () => {
    assert(/106/.test(ITEM_BY_KEY['salary.form106'].why ?? ''), '106 בהסבר');
    assert(/867/.test(ITEM_BY_KEY['capital.form867'].why ?? ''), '867 בהסבר');
    assert(/126/.test(ITEM_BY_KEY['business.payrollReport'].why ?? ''), '126 בהסבר');
  }),
  test('«מה השתנה מאז» — שם התחום במירכאות, בלי «בה…»', () => {
    const q = ITEM_BY_KEY['household.changesSince'].question ?? '';
    assert(q.includes('«המשפחה והבית»') && !q.includes('בהמשפחה'), q);
  }),
  test('צפי לשאר השנה — בחירה, לא טקסט חופשי; אירוע חד-פעמי — כן/לא', () => {
    equal(ITEM_BY_KEY['business.forecast'].input, 'choice');
    equal(ITEM_BY_KEY['business.forecast'].options?.length, 3);
    equal(ITEM_BY_KEY['business.oneOffs'].input, 'yesno');
  }),
  test('ת.ז. של שותף — בדיקת ספרת ביקורת', () => {
    const s = schemaFor('partners');
    equal(validateRecord(s, { name: 'א', share: 50, idNumber: '123456782' }).idNumber, undefined);
    assert(!!validateRecord(s, { name: 'א', share: 50, idNumber: '123456789' }).idNumber, 'ספרת ביקורת שגויה נתפסת');
  }),
];
