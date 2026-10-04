// ─── בדיקות: משימה פנימית («אני») אינה טיוטה ──────────────────────────────────
// ‼ מה נעול כאן:
//   · «אני» נולדת מפורסמת — היא לעולם לא בדף ולא במייל של הלקוח (השרת מסנן internalTask),
//     ולכן «טיוטה» ו«עוד לא בדף — פרסם בדף» הבטיחו פרסום שלא עושה דבר. ללקוח/לגורם
//     חיצוני — טיוטה כמו קודם.
//   · הסימון internalTask נשאר על «אני»: הטריגר בשרת מסמן רק בקשת משרד בלי דרישות.
//   · משימה פנימית ומשימת האישור האישי של בן/בת הזוג — «לעולם לא בדף».

import { test, equal, deepEqual } from '../../../testkit/tinyTest';
import type { TestCase } from '../../../testkit/tinyTest';
import { bornPublished, internalTaskMarker, neverOnClientPage } from '../../clientTabs/InlineComposer';

export const TESTS: TestCase[] = [
  test('«אני» נולדת מפורסמת; ללקוח ולגורם חיצוני — טיוטה', () => {
    equal(bornPublished('me'), true);
    equal(bornPublished('client'), false);
    equal(bornPublished('external'), false);
  }),

  test('«אני» שומרת את הסימון internalTask ביצירה; בעריכה לא שולחים', () => {
    deepEqual(internalTaskMarker('me', false), { internalTask: true });
    deepEqual(internalTaskMarker('me', true), {});
    deepEqual(internalTaskMarker('client', false), {});
  }),

  test('לעולם לא בדף: משימה פנימית ומשימת האישור האישי; בקשה רגילה — לא', () => {
    equal(neverOnClientPage({ payload: { internalTask: true } }), true);
    equal(neverOnClientPage({ payload: { internalTask: 'true' } }), true, 'כמו השרת (::boolean)');
    equal(neverOnClientPage({ payload: { personalConfirmFor: 'i9' } }), true);
    equal(neverOnClientPage({ payload: { internalTask: false } }), false);
    equal(neverOnClientPage({ payload: { title: 'מסמכים' } }), false);
    equal(neverOnClientPage({ payload: undefined }), false);
  }),
];
