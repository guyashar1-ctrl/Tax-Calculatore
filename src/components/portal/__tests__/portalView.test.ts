// ─── בדיקות מבנה: הדף האישי (PortalView) — תצוגה במשרד, כרטיס האישור, טלפון ─────────
// ‼ מה נעול כאן:
//   · X-2 — בלי טוקן (כל תצוגה במשרד: «הדף של …» ב«חי · עכשיו» ובתצוגה המקדימה) הפקדים
//     של הלקוח כבויים. הדף האמיתי (?portal=) תמיד מגיע עם טוקן.
//   · X-3 — כרטיס האישור נבנה מ-repApprovalCard (משפט + מה מסמנים, השאר בלחיצה), ולא
//     מקיר ההסבר השמור; כרטיס הזירוז (אופציונלי) אחרי מה שבאמת נדרש.
//   · X-5 — בטלפון הריפוד של העמוד/המסגרת/הכרטיסים קטן (portalPage.css), לא style קבוע.

import { test, assert } from '../../../testkit/tinyTest';
import type { TestCase } from '../../../testkit/tinyTest';
import PAGE_RAW from '../../PublicPortalPage.tsx?raw';
import PAGE_CSS from '../portalPage.css?raw';

/** ‼ הקובץ ב-CRLF — מנרמלים, כדי שהתבניות יבדקו תוכן ולא סופי שורות. */
const PAGE_SOURCE = PAGE_RAW.replace(/\r\n/g, '\n');

/** הגוף של פונקציה אחת במקור (עד הפונקציה הבאה ברמה העליונה). */
function body(name: string): string {
  const start = PAGE_SOURCE.indexOf(`function ${name}(`);
  assert(start >= 0, `לא נמצאה ${name}`);
  const next = PAGE_SOURCE.slice(start + 10).search(/\n(export )?(default )?function /);
  return next < 0 ? PAGE_SOURCE.slice(start) : PAGE_SOURCE.slice(start, start + 10 + next);
}

export const TESTS: TestCase[] = [
  test('X-2 · בלי טוקן — הפקדים כבויים בכל תצוגה במשרד, גם ב«חי · עכשיו»', () => {
    const view = body('PortalView');
    assert(/const inert = preview \|\| !token;/.test(view), 'inert נגזר מהיעדר טוקן');
    assert(/<PreviewCtx\.Provider value=\{inert\}>/.test(view), 'ההקשר שמכבה פקדים מקבל inert, לא רק preview');
    assert(/<PortalView data=\{data\} token=\{token\}/.test(PAGE_SOURCE), 'הדף האמיתי מעביר טוקן');
  }),

  test('X-3 · כרטיס האישור — repApprovalCard; «אין לך משתמש?» בלחיצה; בלי קיר ההסבר השמור', () => {
    const declare = body('DeclareBlock');
    assert(/repApprovalCard\(item\.approvals, item\.note, item\.noteAfter\)/.test(declare), 'מהשרת: approvals + ההסבר השמור');
    assert(/aria-expanded=\{moreOpen\}/.test(declare), 'ההסבר המלא נפתח לפי דרישה');
    const from = declare.indexOf('if (card)');
    const to = declare.indexOf("return (\n    <div style={{ display: 'grid', gap: 10 }}>");
    assert(from > 0 && to > from, 'שני ענפים: כרטיס האישור, ושאר ההצהרות');
    assert(!declare.slice(from, to).includes('<RequestGuide'), 'בכרטיס האישור אין RequestGuide (הקיר)');
    assert(/data-testid="rep-approval-awaiting"/.test(declare), 'H2.5b · למי שע״ם ממתינה');
  }),

  test('X-3 · כרטיס הזירוז (הכותרת הקבועה) אחרי מה שנדרש ב«מה צריך ממך»', () => {
    const view = body('PortalView');
    assert(/i\.key === 'rep_approval' && i\.label === REP_PORTAL_CARD_FIXED\.title/.test(view), 'מזוהה לפי הכותרת הקבועה של הזירוז');
    assert(/\.sort\(\(a, b\) => optionalLast\(a\) - optionalLast\(b\)\)/.test(view), 'ממוין לסוף, יציב');
  }),

  test('X-5 · הריפוד בטלפון קטן — מ-CSS, לא style קבוע', () => {
    const view = body('PortalView');
    assert(!/padding: '30px 30px 22px'/.test(view), 'אין יותר ריפוד קבוע במסגרת');
    assert(/className="pp-card"/.test(view) && /pp-page/.test(view), 'מחלקות הריפוד');
    assert(/className="pp-item"/.test(body('ActionItem')), 'גם הכרטיס הבודד');
    const phone = PAGE_CSS.slice(PAGE_CSS.indexOf('@media (max-width: 480px)'));
    assert(phone.length > 0, 'יש כלל לטלפון');
    for (const m of ['.pp-page', '.pp-card', '.pp-item']) assert(phone.includes(m), `בטלפון: ${m}`);
  }),
];
