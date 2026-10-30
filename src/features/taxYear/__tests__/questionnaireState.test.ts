// ─── «נשלח · עוד לא התחיל» מול «באמצע השאלון» (30.10.2026) ─────────────────────────
// ‼ גיא מחק דוח ופתח חדש — והמסך כתב «באמצע השאלון» ברגע שהשאלון נשלח. «התחיל» = טיוטה בשרת על שאלה פתוחה.

import { test, equal } from '../../../testkit/tinyTest';
import type { TestCase } from '../../../testkit/tinyTest';
import { questionnaireState, questionnaireText } from '../questionnaireState';

type A = Parameters<typeof questionnaireState>[0][number];
const ask = (state: A['state'], kind = 'record', savedDraft?: unknown): A =>
  ({ state, prompt: { input: { kind } } as unknown as A['prompt'], savedDraft });

export const TESTS: TestCase[] = [
  test('בלי שאלות ⇒ לא נשלח', () => {
    equal(questionnaireState([]), 'notSent');
    equal(questionnaireText('notSent', 'גיא'), 'השאלון עוד לא נשלח');
  }),
  test('נשלח ואין טיוטה ⇒ «עוד לא התחיל» — גם כשיש בקשת קבצים פתוחה', () => {
    equal(questionnaireState([ask('published'), ask('published', 'confirm'), ask('published', 'file')]), 'notStarted');
    equal(questionnaireText('notStarted', 'גיא'), 'נשלח לגיא · עוד לא התחיל');
  }),
  test('טיוטה בשרת על שאלה פתוחה ⇒ «באמצע השאלון»', () => {
    equal(questionnaireState([ask('published', 'record', { v2: { 'household.address|couple': { choice: 'yes' } }, at: 1 }), ask('published')]), 'filling');
    equal(questionnaireText('filling', 'גיא'), 'גיא באמצע השאלון');
  }),
  test('טיוטה ריקה אינה התחלה', () => {
    equal(questionnaireState([ask('published', 'record', { v2: {}, at: 1 })]), 'notStarted');
  }),
  test('הכול נענה (נשארו רק קבצים) ⇒ אין משפט — המסך ממשיך עם המצב שלו', () => {
    equal(questionnaireState([ask('answered'), ask('published', 'file')]), 'answered');
    equal(questionnaireText('answered', 'גיא'), undefined);
  }),
  test('סבב שאלות נוסף אחרי שליחה ⇒ שוב «עוד לא התחיל»', () => {
    equal(questionnaireState([ask('answered'), ask('published')]), 'notStarted');
  }),
];
