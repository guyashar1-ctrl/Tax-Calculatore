// ─── העלאה מהמשרד של צילום מזהה — שיוך נפרד לכל אדם (212) ────────────────────
// גיא: «קובץ זהה שהועלה לנישום ולבן הזוג אינו בהכרח מסמך תקין של שניהם … אל תסיק
// בעלות מתוך זהות הקבצים בלבד». כפילות = אותו קובץ שכבר משויך לאותו אדם.
import { test, equal } from '../../../testkit/tinyTest';
import type { TestCase } from '../../../testkit/tinyTest';
import { planOfficeUpload } from '../identityDedupePlan';

export const TESTS: TestCase[] = [
  test('אותו קובץ כבר משויך לאדם הזה ⇒ לא מעלים שוב', () => {
    equal(JSON.stringify(planOfficeUpload(['d1'], ['d1'], [])), JSON.stringify({ kind: 'already', documentId: 'd1' }));
  }),
  test('אותו קובץ בתיק בלי שיוך ⇒ משייכים את הקיים, בלי עותק נוסף', () => {
    equal(JSON.stringify(planOfficeUpload(['d1'], [], [])), JSON.stringify({ kind: 'reuse', documentId: 'd1' }));
  }),
  test('אותו קובץ משויך לבן/בת הזוג בלבד ⇒ רשומה חדשה לאדם הזה (שיוך ואישור משלו)', () => {
    equal(JSON.stringify(planOfficeUpload(['d1'], [], ['d1'])), JSON.stringify({ kind: 'new' }));
  }),
  test('שני זהים: אחד של בן/בת הזוג ואחד חופשי ⇒ החופשי', () => {
    equal(JSON.stringify(planOfficeUpload(['d1', 'd2'], [], ['d1'])), JSON.stringify({ kind: 'reuse', documentId: 'd2' }));
  }),
  test('אין זהה ⇒ רשומה חדשה', () => {
    equal(JSON.stringify(planOfficeUpload([], ['x'], ['y'])), JSON.stringify({ kind: 'new' }));
  }),
];
