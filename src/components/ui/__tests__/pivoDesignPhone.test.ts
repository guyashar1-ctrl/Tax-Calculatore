// ─── בדיקות: פריסה בטלפון בשכבת העיצוב (4.10.2026) ──────────────────────────
// ‼ מה נעול כאן:
//   · ‎.table-wrap { overflow-x: visible }‎ חל במחשב בלבד. כשחל גם בטלפון,
//     טבלאות השיעורים ב«ידע מס › ביטוח לאומי» (459px) הרחיבו את העמוד ל-475px
//     ברוחב 360 — התצוגה הוקטנה והסרגל התחתון נחתך.
//   · כותרות המדרגות בטבלאות ב"ל נשברות לשורות (ב-th הכללי יש nowrap).
//   · במשימות בטלפון סוף הרשימה עולה מעל הכפתור הצף «+» — אחרת הוא כיסה את
//     שורת ההסבר האחרונה.

import { test, assert } from '../../../testkit/tinyTest';
import type { TestCase } from '../../../testkit/tinyTest';
import DESIGN_CSS from '../pivo-design.css?raw';
import INDEX_CSS from '../../../index.css?raw';
import NI_SOURCE from '../../NIReferenceSection.tsx?raw';

const DESKTOP_ONLY_VISIBLE = /@media \(min-width: 761px\) \{\s*\.table-wrap \{ overflow-x: visible; \}\s*\}/;

export const TESTS: TestCase[] = [
  test('table-wrap: גלילה פנימית בטלפון, visible רק מ-761px', () => {
    assert(DESKTOP_ONLY_VISIBLE.test(DESIGN_CSS), 'הכלל למחשב קיים');
    const rest = DESIGN_CSS.replace(new RegExp(DESKTOP_ONLY_VISIBLE.source, 'g'), '');
    assert(!/\.table-wrap\s*\{[^}]*overflow-x:\s*visible/.test(rest), 'אין overflow-x: visible נוסף על table-wrap');
    assert(/\.table-wrap \{ overflow-x: auto; \}/.test(INDEX_CSS), 'ברירת המחדל ב-index.css היא גלילה');
  }),

  test('כותרות המדרגות בטבלאות ב"ל נשברות לשורות', () => {
    const m = NI_SOURCE.match(/const greenSubHeader: React\.CSSProperties = \{([^}]*)\}/);
    assert(m, 'greenSubHeader קיים');
    assert(/whiteSpace: 'normal'/.test(m![1]), 'whiteSpace: normal בכותרת המדרגה');
  }),

  test('משימות בטלפון: סוף הרשימה מעל הכפתור הצף', () => {
    const fab = DESIGN_CSS.match(/\.tw-fab \{[^}]*?bottom: calc\((\d+)px[^}]*?height: (\d+)px/);
    const pad = DESIGN_CSS.match(/\.tasks-page\.tw-wrap \{ padding-bottom: (\d+)px; \}/);
    // ‼ המקום לסרגל התחתון: הכלל של pivo-design (96px) דורס את זה שב-index.css.
    const main = DESIGN_CSS.match(/@media \(max-width: 760px\) \{\s*\.app > \.main \{ padding-bottom: calc\((\d+)px/);
    assert(fab && pad && main, 'הערכים נמצאו');
    const fabTop = Number(fab![1]) + Number(fab![2]);
    const contentEnd = Number(main![1]) + Number(pad![1]);
    assert(contentEnd >= fabTop + 8, `סוף התוכן ${contentEnd}px מעל ראש הכפתור ${fabTop}px`);
  }),

  test('שורת ההסבר במשימות: «▲▼» בטלפון, גרירה במחשב — כלל הבסיס לפני בלוק הטלפון', () => {
    const base = DESIGN_CSS.indexOf('.tw-hint-touch { display: none; }');
    const touch = DESIGN_CSS.indexOf('.tw-hint-touch { display: inline; }');
    assert(base > -1 && touch > -1, 'שני הכללים קיימים');
    // ‼ באותה ספציפיות הכלל המאוחר גובר — כלל בסיס אחרי הבלוק היה מסתיר את «▲▼» גם בטלפון.
    assert(base < touch, 'כלל הבסיס קודם לבלוק הטלפון');
  }),
];
