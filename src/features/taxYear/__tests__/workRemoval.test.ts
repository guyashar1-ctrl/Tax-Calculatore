// ─── בדיקות: הסרת עבודת מס — מחיקה רק כשדבר לא יצא, אחרת ביטול שאפשר להחזיר (14.10.2026) ─────────
// ‼ מה נעול כאן (גיא: «אל תמחק בשקט מידע מאושר בתיק, מסמכים משותפים או היסטוריה»):
//   · מחיקה — רק כשהשאלון לא פורסם ואין תשובה, עובדה, מסמך, מייל או הערכה מאושרת/מפורסמת.
//   · כל דבר שיצא או התקבל הופך את ההסרה לביטול, וכל מה שנשאר כתוב במפורש בחלון.
//   · עבודה שהושלמה — לא נמחקת ולא מבוטלת.
//   · עבודה שבוטלה מופיעה ב«היסטוריה» ולא נספרת כפתוחה.

import { test, equal, assert } from '../../../testkit/tinyTest';
import type { TestCase } from '../../../testkit/tinyTest';
import { removalExplain, removalMode, type RemovalFacts } from '../workRemoval';
import { buildWorkRows } from '../taxWork';
import type { OnboardingStep } from '../../../types/onboarding';

const base: RemovalFacts = {
  status: 'in_progress', infoPublished: false, asksDraft: 3, asksOpen: 0, asksAnswered: 0, factsAccepted: 0, factsPending: 0,
  documents: 0, emails: 0, estimatesApproved: 0, estimatesPublished: 0, estimatesDraft: 0,
};
const f = (p: Partial<RemovalFacts>) => ({ ...base, ...p });

export const TESTS: TestCase[] = [
  test('נפתחה בטעות, רק טיוטה — מחיקה', () => {
    equal(removalMode(base), 'delete');
    equal(removalMode(f({ estimatesDraft: 1 })), 'delete');
    const ex = removalExplain(base);
    assert(ex.goes.some(x => x.includes('בטיוטה')), ex.goes.join('|'));
    assert(ex.stays.some(x => x.includes('הכרטיס')), 'הכרטיס לא משתנה');
  }),

  test('כל דבר שיצא מהמשרד או התקבל — ביטול, לא מחיקה', () => {
    const cases: Partial<RemovalFacts>[] = [
      { infoPublished: true }, { asksAnswered: 1 }, { factsAccepted: 1 }, { factsPending: 1 }, { documents: 1 },
      { emails: 1 }, { estimatesApproved: 1 }, { estimatesPublished: 1 },
    ];
    for (const c of cases) equal(removalMode(f(c)), 'cancel', JSON.stringify(c));
  }),

  test('בביטול — כל מה שנשאר כתוב במפורש', () => {
    const ex = removalExplain(f({ infoPublished: true, asksOpen: 2, asksAnswered: 3, factsAccepted: 2, factsPending: 1, documents: 4, emails: 1, estimatesApproved: 1 }));
    equal(ex.title, 'ביטול העבודה');
    const s = ex.stays.join(' | ');
    for (const w of ['3 תשובות', '2 פרטים שאושרו', 'פרט אחד שממתין לבדיקה', '4 מסמכים', 'גרסת הערכה מאושרת', 'מייל אחד', 'היסטוריית העבודה']) assert(s.includes(w), `${w} ⟵ ${s}`);
    assert(ex.goes.some(x => x.includes('2 שאלות פתוחות נסגרות')), ex.goes.join('|'));
    assert(!!ex.why && ex.why.includes('לא נמחקת'), ex.why ?? '');
  }),

  test('אפשר לבחור לבטל עבודה שאפשר היה למחוק — ואז היא נשמרת ב«היסטוריה»', () => {
    const ex = removalExplain(base, 'cancel');
    equal(ex.title, 'ביטול העבודה');
    assert(ex.why!.includes('«היסטוריה»'), "line 49");
  }),

  test('עבודה שהושלמה — לא מוסרת; שבוטלה — אפשר רק להחזיר', () => {
    for (const st of ['completed', 'verified', 'skipped']) equal(removalMode(f({ status: st })), 'none', st);
    equal(removalMode(f({ status: 'cancelled' })), 'none');
    assert(removalExplain(f({ status: 'completed' })).why!.includes('עבודה חדשה'), "line 55");
    assert(removalExplain(f({ status: 'cancelled' })).why!.includes('להחזיר'), "line 56");
  }),

  test('ברשימה: עבודה שבוטלה — ב«בוטלו», עם הסיבה, והשלמת המידע שלה נשמרת לתצוגה', () => {
    const parent = { id: 'p1', clientId: 'c1', stepType: 'annual_return', status: 'cancelled', payload: { taxYear: 2025, removal: { reason: 'נפתח ללקוח הלא נכון' } } } as unknown as OnboardingStep;
    const info = { id: 'i1', clientId: 'c1', stepType: 'info_collection', status: 'cancelled', payload: { parentStepId: 'p1' } } as unknown as OnboardingStep;
    const open = { id: 'p2', clientId: 'c1', stepType: 'annual_return', status: 'in_progress', payload: { taxYear: 2024 } } as unknown as OnboardingStep;
    const rows = buildWorkRows([parent, info, open], [{ id: 'a1', stepId: 'i1', state: 'cancelled', title: 'x' }], [], [], () => 'דנה');
    const r = rows.find(x => x.parent.id === 'p1')!;
    equal(r.bucket, 'cancelled');
    assert(r.next.includes('נפתח ללקוח הלא נכון'), r.next);
    equal(r.info?.id, 'i1');
    equal(r.missing.length, 0, 'שאלה שבוטלה אינה «חסר אצל הלקוח»');
    equal(rows.find(x => x.parent.id === 'p2')!.bucket === 'cancelled', false);
  }),
];
