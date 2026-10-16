// ─── עץ השאלון בשורת הבקשה (16.10.2026) ─────────────────────────────────────
// ‼ מה נעול: מצב אחד לכל פריט (נענה / לבדיקת משרד / מסמך הגיע / חסר …) נגזר מ-ItemState בלבד;
//   «לא חל» אינו בעץ; תחומים בסדר הקטלוג; בתוך תחום — מה שדורש את המשרד קודם; תחום עם בדיקה — פתוח.

import { test, equal, assert } from '../../../testkit/tinyTest';
import type { TestCase } from '../../../testkit/tinyTest';
import { buildQuestionTree, countsLine, markOf } from '../questionTree';
import { AREAS } from '../catalog';
import type { ItemStatus } from '../picture';

const st = (key: string, area: string, state: string) =>
  ({ item: { key, label: key }, area, state, detail: '', facts: [], evidence: [], askable: true, subjectRole: 'client' } as unknown as ItemStatus);

export const TESTS: TestCase[] = [
  test('כל מצב בתמונה ממופה לסימן אחד בעץ; «לא חל» — לא בעץ', () => {
    equal(markOf('known'), 'answered'); equal(markOf('partial'), 'answered'); equal(markOf('fromCard'), 'answered');
    equal(markOf('pendingReview'), 'review'); equal(markOf('docReceived'), 'docArrived');
    equal(markOf('asked'), 'asked'); equal(markOf('missing'), 'missing');
    equal(markOf('unavailable'), 'later'); equal(markOf('notYetAvailable'), 'later');
    equal(markOf('notApplicable'), null);
  }),
  test('תחומים לפי סדר הקטלוג, בדיקה לפני חסר לפני נענה; תחום עם בדיקה — פתוח', () => {
    const [a1, a2] = AREAS.map(a => a.id);
    const t = buildQuestionTree([st('x', a2, 'known'), st('y', a1, 'missing'), st('z', a1, 'known'), st('w', a1, 'pendingReview'), st('n', a1, 'notApplicable')]);
    equal(t.areas.map(a => a.area).join(), [a1, a2].join());
    equal(t.areas[0].items.map(i => i.status.item.key).join(), 'w,y,z');
    assert(t.areas[0].needsOffice && !t.areas[1].needsOffice, 'רק התחום עם תשובה לבדיקה פתוח');
    equal(t.notApplicable, 1);
    equal(t.totals.answered, 2); equal(t.totals.missing, 1); equal(t.totals.review, 1);
  }),
  test('שורת הספירה — רק מה שאינו אפס, ביחיד וברבים', () => {
    equal(countsLine({ answered: 3, review: 1, docArrived: 1, asked: 0, missing: 2, later: 0 }), '3 נענו · 1 לבדיקה · מסמך אחד הגיע · 2 חסרים');
    equal(countsLine({ answered: 1, review: 0, docArrived: 0, asked: 0, missing: 1, later: 0 }), 'אחד נענה · אחד חסר');
    equal(countsLine({ answered: 0, review: 0, docArrived: 0, asked: 0, missing: 0, later: 0 }), '');
  }),
];
