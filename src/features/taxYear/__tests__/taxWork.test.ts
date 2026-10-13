// ─── «עבודת מס» (ניהול המשרד) — מצב, מה חסר, מה ממתין לבדיקה, והפעולה הבאה ─────────
// ‼ מה נעול כאן: שלושת המסלולים בלבד (בלי הערכת מס); «ממתין לבדיקתך» = תשובות ומסמכים שהמשרד עוד לא החליט
//   עליהם, רק של הבקשה הזו; הבדיקה קודמת לכל דבר אחר; «הושלם» — רק ממצב הבקשה, לא מספירה.

import { test, equal, assert } from '../../../testkit/tinyTest';
import type { TestCase } from '../../../testkit/tinyTest';
import type { OnboardingStep } from '../../../types/onboarding';
import { buildWorkRows, workTitle, type WorkAsk } from '../taxWork';
import { AVAILABLE } from '../../taxKnowledge/availability';

const step = (id: string, stepType: string, status: string, payload: Record<string, unknown> = {}, clientId = 'c1') =>
  ({ id, clientId, stepType, status, payload, createdAt: '2026-10-01T00:00:00Z' } as unknown as OnboardingStep);
const ask = (id: string, stepId: string, state: string, title = id): WorkAsk => ({ id, stepId, state, title });
const names = (id: string) => (id === 'c1' ? 'דוד' : 'רחל');

export const TESTS: TestCase[] = [
  test('שלושת המסלולים, כל אחד עם הכותרת שלו; הערכת מס — רק כשהיא זמינה (בחבילת האיסוף — לא)', () => {
    const steps = [
      step('i', 'tax_file_intake', 'in_progress'), step('a', 'annual_return', 'in_progress', { taxYear: 2025, title: 'דוח שנתי 2025' }),
      step('w', 'wealth_declaration', 'in_progress', { asOfDate: '2025-12-31', kind: 'followup' }), step('e', 'tax_estimate', 'in_progress'),
    ];
    const rows = buildWorkRows(steps, [], [], [], names);
    equal(rows.map(r => r.kind).join(), AVAILABLE.taxEstimate ? 'intake,annual,wealth,estimate' : 'intake,annual,wealth');
    equal(rows.slice(0, 3).map(r => r.title).join(' | '), 'קליטה והשלמת תיק המס | דוח שנתי 2025 | הצהרת הון ליום 31.12.2025 · המשך');
    assert(rows.every(r => r.bucket === 'mine' && r.next.startsWith('להכין שאלות ל')), 'בלי שאלות — הבא: להכין');
  }),
  test('מה חסר, מה ממתין לבדיקה ומה הבא — רק של הבקשה הזו', () => {
    const steps = [
      step('a', 'annual_return', 'in_progress', { taxYear: 2025 }), step('ia', 'info_collection', 'waiting_client', { parentStepId: 'a' }),
      step('w', 'wealth_declaration', 'in_progress', { asOfDate: '2025-12-31', kind: 'first' }), step('iw', 'info_collection', 'waiting_client', { parentStepId: 'w' }),
    ];
    const asks = [ask('q1', 'ia', 'published'), ask('q2', 'ia', 'unavailable'), ask('q3', 'ia', 'answered'), ask('q4', 'ia', 'answered'), ask('w1', 'iw', 'published')];
    const rows = buildWorkRows(steps, asks, [{ askId: 'q3', status: 'pending' }, { askId: 'w9', status: 'pending' }], [{ askId: 'q4', review: 'needs_review' }, { askId: 'q3', review: 'accepted' }], names);
    const a = rows.find(r => r.kind === 'annual')!;
    equal(a.missing.length, 2); equal(a.unavailable, 1); equal(a.toReview, 2); equal(a.answered, 2);
    equal(a.bucket, 'mine'); equal(a.next, 'לבדוק 2 פריטים שהתקבלו');
    const w = rows.find(r => r.kind === 'wealth')!;
    equal(w.toReview, 0); equal(w.bucket, 'client'); equal(w.next, 'ממתין לדוד: שאלה פתוחה');
  }),
  test('טיוטה ⇒ «לפרסם»; רק «אין לי עדיין» ⇒ ממתין למסמכים; הכול נענה ונבדק ⇒ להשלים במשרד; בקשה שהושלמה ⇒ הושלם', () => {
    const mk = (state: string, parentStatus = 'in_progress') => buildWorkRows(
      [step('i', 'tax_file_intake', parentStatus), step('ii', 'info_collection', 'in_progress', { parentStepId: 'i' })], [ask('x', 'ii', state)], [], [], names)[0];
    equal(mk('draft').next, 'לפרסם בדף האישי שאלה אחת שהוכנו');
    equal(mk('unavailable').next, 'ממתין למסמכים שעוד לא הגיעו (1)'); equal(mk('unavailable').bucket, 'client');
    equal(mk('answered').next, 'להשלים במשרד ולסגור');
    const d = mk('published', 'completed'); equal(d.bucket, 'done'); equal(d.next, 'הושלם');
  }),
  test('בקשה שבוטלה — לא מוצגת; «השלמת מידע» מבוטלת — לא נספרת', () => {
    const rows = buildWorkRows([step('x', 'annual_return', 'cancelled'), step('a', 'annual_return', 'in_progress'), step('ia', 'info_collection', 'cancelled', { parentStepId: 'a' })],
      [ask('q', 'ia', 'published')], [], [], names);
    equal(rows.length, 1); equal(rows[0].missing.length, 0); assert(!rows[0].info, 'השלמת מידע מבוטלת נקשרה');
  }),
  test('כותרות: הצהרת הון ראשונה בלי יום — בלי «ליום»', () => {
    equal(workTitle(step('w', 'wealth_declaration', 'in_progress', { kind: 'first' })), 'הצהרת הון · ראשונה');
  }),
];
