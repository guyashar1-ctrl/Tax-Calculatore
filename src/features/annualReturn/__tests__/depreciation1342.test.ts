// ─── דוח הפחת (1342): חודשים, תקרה, יציאה, ומעבר לשנה הבאה (30.10.2026) ─────────────────────────

import { test, equal, assert } from '../../../testkit/tinyTest';
import type { TestCase } from '../../../testkit/tinyTest';
import { carryForward, compute1342, depForYear, depMonths, isDone1342, type DepAsset } from '../depreciation1342';

const A = (p: Partial<DepAsset>): DepAsset => ({ id: 'a', name: 'מחשב', acquired: '2025-01', cost: 12_000, rate: 33, accumulated: 0, ...p });

export const TESTS: TestCase[] = [
  test('חודשים: נכס משנה קודמת — 12; נרכש ביולי — 6 (יולי נספר); נרכש בשנה הבאה — 0; ההפעלה גוברת על הרכישה', () => {
    equal(depMonths(A({ acquired: '2023-05' }), 2025), 12);
    equal(depMonths(A({ acquired: '2025-07' }), 2025), 6);
    equal(depMonths(A({ acquired: '2026-01' }), 2025), 0);
    equal(depMonths(A({ acquired: '2025-02', started: '2025-10' }), 2025), 3);
  }),
  test('יצא השנה ⇒ עד חודש היציאה; יצא בשנה קודמת ⇒ 0', () => {
    equal(depMonths(A({ acquired: '2023-01', disposed: '2025-03' }), 2025), 3);
    equal(depMonths(A({ acquired: '2023-01', disposed: '2024-12' }), 2025), 0);
  }),
  test('פחת השנה: עלות × שיעור × חודשים/12, ולא יותר מהיתרה', () => {
    equal(depForYear(A({}), 2025), 3_960);
    equal(depForYear(A({ acquired: '2025-07', cost: 1_000, rate: 6 }), 2025), 30);
    equal(depForYear(A({ acquired: '2022-01', accumulated: 11_000 }), 2025), 1_000);
  }),
  test('מעבר לשנה הבאה: הנצבר גדל בפחת השנה, נכס שהופחת עד הסוף או שיצא — לא עובר; «אין רכוש» עובר כמו שהוא', () => {
    const next = carryForward({ assets: [A({ id: 'x' }), A({ id: 'done', acquired: '2022-01', accumulated: 11_000 }), A({ id: 'out', acquired: '2023-01', disposed: '2025-06' })] }, 2025)!;
    equal(next.assets.map(a => a.id).join(','), 'x');
    equal(next.assets[0].accumulated, 3_960);
    assert(next.assets[0].fromPrior === true, 'מסומן «מהשנה הקודמת»');
    equal(carryForward({ assets: [], none: true }, 2025)?.none, true);
    equal(carryForward(undefined, 2025), undefined);
  }),
  test('סה״כ ובדיקות: נכס בלי שם/עלות/שיעור ⇒ לא גמור; «אין רכוש» ⇒ גמור בלי נכסים', () => {
    const c = compute1342({ assets: [A({}), A({ id: 'b', name: '', cost: 0, rate: 0 })] }, 2025);
    equal(c.total, 3_960);
    equal(c.problems.length, 3);
    assert(!isDone1342({ assets: [A({ name: '' })] }, 2025), 'בלי שם');
    assert(isDone1342({ assets: [], none: true }, 2025), 'אין רכוש קבוע');
    assert(!isDone1342({ assets: [] }, 2025), 'רשימה ריקה בלי סימון');
  }),
];
