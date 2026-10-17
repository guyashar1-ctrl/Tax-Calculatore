// ─── שלושת הצעדים בשורת בקשת תיק מס (17.10.2026) ────────────────────────────────────────────────────────────
// ‼ מה נעול כאן: הצעד הראשון והשבב נגזרים מהבן ומהתשובות; הצעד השני — מיישור הקו האחרון שהושלם; השלישי — מההצעות
//   הממתינות של הבקשה הזו בלבד (לא של בקשה אחרת); בקשה שהושלמה — בלי שבב (המצב הרגיל «הושלם»).

import { test, equal, assert } from '../../../testkit/tinyTest';
import type { TestCase } from '../../../testkit/tinyTest';
import type { OnboardingStep } from '../../../types/onboarding';
import { buildWorkRows, type WorkAsk } from '../taxWork';
import { deriveRequestSteps, lastAlignment, pendingToCardFor } from '../requestStepsModel';

const step = (id: string, stepType: string, status: string, payload: Record<string, unknown> = {}, extra: Record<string, unknown> = {}) =>
  ({ id, clientId: 'c1', stepType, status, payload, createdAt: '2026-10-01T00:00:00Z', ...extra } as unknown as OnboardingStep);
const ask = (id: string, state: string): WorkAsk => ({ id, stepId: 'i1', state, title: id });
const intake = (status = 'in_progress') => [step('p1', 'tax_file_intake', status), step('i1', 'info_collection', 'waiting_client', { parentStepId: 'p1' })];
const rowOf = (steps: OnboardingStep[], asks: WorkAsk[], facts: { askId?: string; status: string }[] = []) => buildWorkRows(steps, asks, facts, [], () => 'דוד')[0];

export const TESTS: TestCase[] = [
  test('קליטה חדשה בלי שאלות עדיין — «נשלח לבד», בלי שבב', () => {
    const v = deriveRequestSteps(rowOf(intake(), []), [], 0, { firstName: 'דוד' });
    equal(v.steps.map(s => s.key).join(), 'answers,alignment,card');
    assert(v.steps[0].line.includes('נשלח לבד'), v.steps[0].line);
    equal(v.chip, undefined);
    equal(v.steps[1].line, 'טרם בוצע · מכרטיס «זהות ורשויות»');
    equal(v.steps[2].tone, 'idle');
  }),
  test('אצל הלקוח · 3 מתוך 9 — שבב אפור, הצעד הראשון «ממתין»', () => {
    const asks = [...Array.from({ length: 3 }, (_, i) => ask(`a${i}`, 'answered')), ...Array.from({ length: 6 }, (_, i) => ask(`p${i}`, 'published'))];
    const v = deriveRequestSteps(rowOf(intake(), asks), [], 0, { firstName: 'דוד' });
    equal(v.chip?.text, 'אצל דוד · 3 מתוך 9');
    equal(v.chip?.tone, 'gray');
    equal(v.steps[0].tone, 'wait');
    equal(v.steps[0].line, 'אצל דוד · 3 מתוך 9');
  }),
  test('טרם נענה כלל — «בדף של דוד · טרם נענה»', () => {
    const v = deriveRequestSteps(rowOf(intake(), [ask('p', 'published')]), [], 0, { firstName: 'דוד' });
    equal(v.steps[0].line, 'בדף של דוד · טרם נענה');
    equal(v.chip?.text, 'אצל דוד · 0 מתוך 1');
  }),
  test('הגיעו תשובות לבדיקה — שבב כחול, הצעד «שלך»', () => {
    const v = deriveRequestSteps(rowOf(intake(), [ask('a', 'answered'), ask('b', 'answered')], [{ askId: 'a', status: 'pending' }]), [], 0, { firstName: 'דוד' });
    equal(v.chip?.text, 'הגיעו תשובות');
    equal(v.chip?.tone, 'blue');
    equal(v.steps[0].tone, 'mine');
    assert(v.steps[0].line.includes('לבדיקתך'), v.steps[0].line);
  }),
  test('הכול נענה ויש הצעות ממתינות — «לאישורך בתיק», הצעד השלישי סופר', () => {
    const v = deriveRequestSteps(rowOf(intake(), [ask('a', 'answered')]), [], 4, { firstName: 'דוד' });
    equal(v.chip?.text, 'לאישורך בתיק');
    equal(v.steps[2].tone, 'new');
    equal(v.steps[2].line, '4 עדכונים ממתינים לאישורך בתיק המס');
  }),
  test('«אין לי עדיין» — ממתין למסמכים, לא «נענה»', () => {
    const v = deriveRequestSteps(rowOf(intake(), [ask('a', 'answered'), ask('u', 'unavailable')]), [], 0, { firstName: 'דוד' });
    equal(v.chip?.text, 'ממתין למסמכים');
    assert(v.steps[0].line.includes('«אין לי עדיין»'), v.steps[0].line);
  }),
  test('הדף של הלקוח עוד לא פורסם — «ממתין לפרסום» גובר על «אצל הלקוח»', () => {
    const v = deriveRequestSteps(rowOf(intake(), [ask('p', 'published')]), [], 0, { firstName: 'דוד', awaitingPage: true });
    equal(v.chip?.text, 'ממתין לפרסום');
    equal(v.chip?.tone, 'amber');
  }),
  test('טיוטה (דוח שנתי שעוד לא פורסם) — «טיוטה» ענבר, הצעד «שלך»', () => {
    const steps = [step('p1', 'annual_return', 'in_progress', { taxYear: 2025 }), step('i1', 'info_collection', 'pending', { parentStepId: 'p1' })];
    const v = deriveRequestSteps(rowOf(steps, [ask('d', 'draft'), ask('e', 'draft')]), [], 0, { firstName: 'דוד' });
    equal(v.chip?.text, 'טיוטה');
    equal(v.steps[0].line, 'טיוטה: 2 שאלות — לפרסם');
  }),
  test('יישור קו אחרון — checkedAt גובר על completedAt, המאוחר מנצח, רק מה שהושלם נספר', () => {
    const al = [
      step('b', 'institution_alignment_btl', 'completed', { checkedAt: '2026-10-02T10:00:00Z' }, { completedAt: '2026-09-01T00:00:00Z' }),
      step('v', 'institution_alignment_vat', 'completed', {}, { completedAt: '2026-10-05T08:00:00Z' }),
      step('i', 'institution_alignment_income', 'in_progress', { checkedAt: '2026-10-09T00:00:00Z' }),
    ];
    const la = lastAlignment(al);
    equal(la.at, '2026-10-05T08:00:00Z');
    equal(la.done, 2);
    const v = deriveRequestSteps(rowOf(intake(), []), al, 0, { firstName: 'דוד' });
    equal(v.steps[1].line, 'אחרון: 05.10.2026 · 2 רשויות');
    equal(v.steps[1].tone, 'ok');
  }),
  test('הצעות ממתינות — רק של הבקשה הזו, רק מהשאלון', () => {
    const facts = [{ id: 'f1', requestId: 'p1' }, { id: 'f2', requestId: 'p2' }, { id: 'f3', requestId: 'p1' }];
    const pending = [
      { source: 'questionnaire', sourceRef: 'tax_year_fact:f1' }, { source: 'questionnaire', sourceRef: 'tax_year_fact:f2' },
      { source: 'institution_alignment', sourceRef: 'tax_year_fact:f3' }, { source: 'questionnaire', sourceRef: 'legacy-2024' },
    ];
    equal(pendingToCardFor('p1', pending, facts), 1);
    equal(pendingToCardFor('p2', pending, facts), 1);
    equal(pendingToCardFor('p9', pending, facts), 0);
  }),
  test('בקשה שהושלמה — בלי שבב (המצב הרגיל «הושלם»), «בתיק», הצעד הראשון סופר תשובות', () => {
    const v = deriveRequestSteps(rowOf(intake('completed'), [ask('a', 'answered'), ask('b', 'answered')]), [], 0, { firstName: 'דוד' });
    equal(v.chip, undefined);
    equal(v.steps[0].line, '2 תשובות · הושלם');
    equal(v.steps[2].line, 'בתיק');
  }),
  test('בקשה שבוטלה — נאמר', () => {
    const v = deriveRequestSteps(rowOf(intake('cancelled'), []), [], 0, { firstName: 'דוד' });
    equal(v.steps[0].line, 'הבקשה בוטלה');
    equal(v.steps[2].tone, 'idle');
  }),
];
