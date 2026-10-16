// ─── בדיקות: «ידע מס» — רשימה ואז כלי, ומה בראש הכלי (4.10.2026) ────────────
// ‼ מה נעול כאן:
//   · בטלפון «ידע מס» נפתח ברשימת הכלים, וכלי נפתח במסך מלא עם «› ידע מס».
//     קודם המסילה נערמה מעל כל כלי: עשרה פריטים, השנה ו«חזרה» מילאו את המסך
//     הראשון, והכלי שנבחר נפתח מתחת לקפל (נראה כאילו הנגיעה לא עשתה כלום).
//   · הכותרת: בלי בחירה — «סקירה» (שם הפריט במסילה); כלי — השם והתיאור שלו.
//     בורר השנה רק בכלים שתלויים בשנה; תג העדכניות לכל כלי חוץ מהסקירה,
//     שיש בה לוח עדכניות מלא.

import { test, equal, assert } from '../../../testkit/tinyTest';
import type { TestCase } from '../../../testkit/tinyTest';
import { TOOLS, TOOL_DATASET, OVERVIEW_LABEL, taxCenterHead } from '../taxCenterNav';
// ‼ 14.10.2026: TaxCenter הוחלף ב«מס» (features/taxArea/TaxArea.tsx) — אותו דפוס בטלפון: רשימה, ואז עמוד עם «› מס».
import CENTER_SOURCE from '../../taxArea/TaxArea.tsx?raw';
import DESIGN_CSS from '../../../components/ui/pivo-design.css?raw';

export const TESTS: TestCase[] = [
  test('בלי בחירה: הסקירה, עם השנה בתיאור ובלי תג עדכניות', () => {
    const h = taxCenterHead(null, 2026);
    equal(h.tool, 'overview');
    equal(h.title, OVERVIEW_LABEL);
    assert(h.status.includes('2026'), `השנה בתיאור: ${h.status}`);
    equal(h.datasetId, null);
    equal(h.usesYear, true);
  }),

  test('«סקירה» שנבחרה במפורש זהה לכניסה בלי בחירה', () => {
    const a = taxCenterHead(null, 2025), b = taxCenterHead('overview', 2025);
    equal(b.title, a.title);
    equal(b.status, a.status);
  }),

  test('כל כלי: הכותרת והתיאור מהרשימה, ותג העדכניות של המאגר שלו', () => {
    for (const t of TOOLS) {
      const h = taxCenterHead(t.key, 2026);
      equal(h.title, t.label, t.key);
      equal(h.status, t.desc, t.key);
      equal(h.datasetId, TOOL_DATASET[t.key] ?? null, t.key);
      assert(h.datasetId !== null, `לכל כלי יש מאגר: ${t.key}`);
    }
  }),

  test('בורר השנה רק בכלים שתלויים בשנה', () => {
    equal(taxCenterHead('expenses', 2026).usesYear, false);
    equal(taxCenterHead('bookkeeping', 2026).usesYear, false);
    equal(taxCenterHead('map1301', 2026).usesYear, false);
    for (const k of ['ni', 'incomeTax', 'rental', 'wizard', 'settlements', 'deadlines', 'maintenance'] as const) {
      equal(taxCenterHead(k, 2026).usesYear, true, k);
    }
  }),

  test('המסך מסמן עמוד פתוח (has-tool) ויש «› מס» שחוזר לרשימה', () => {
    assert(CENTER_SOURCE.includes("${phoneList ? '' : ' has-tool'}"), 'has-tool נגזר מהרשימה בטלפון');
    assert(/className="tc-back" onClick=\{\(\) => \{ setPhoneList\(true\)/.test(CENTER_SOURCE), 'החזרה פותחת את הרשימה');
    assert(CENTER_SOURCE.includes('tax-center tax-area pg-split'), 'אותה מחלקה — אותם כללי טלפון');
  }),

  test('בטלפון: כלי פתוח מסתיר את הרשימה, ובלי כלי — רק הרשימה', () => {
    assert(
      /@media \(max-width: 900px\) \{\s*\.tax-center\.has-tool > \.pg-rail,\s*\.tax-center:not\(\.has-tool\) > \.pg-pane \{ display: none; \}/.test(DESIGN_CSS),
      'הכלל שמחליף בין הרשימה לכלי',
    );
    // ‼ אותו רוחב שבו המסילה נערמת — אחרת בין שני הרוחבים חוזרת הערימה.
    assert(/@media \(max-width: 900px\) \{\s*\.tax-center\.pg-split \{ grid-template-columns: 1fr;/.test(DESIGN_CSS), 'נקודת הקיפול 900px');
  }),
];
