// ─── טיוטה מהמסד נשארת טיוטה (lib/dbMappers.ts · stepFromDb) ────────────────
// הבאג: rowToObject הופך null ל-undefined, והמסך מזהה טיוטה רק לפי
// publishedAt === null — כך כל בקשה שלא פורסמה נראתה בפרודקשן כמפורסמת.
import { test, equal, type TestCase } from '../../testkit/tinyTest';
import { stepFromDb } from '../dbMappers';

const base = { id: 's', client_id: 'c', step_type: 'custom_request', status: 'pending', ball: 'client', payload: {} };

export const TESTS: TestCase[] = [
  test('published_at ריק במסד ⇒ publishedAt === null (טיוטה)', () => {
    equal(stepFromDb({ ...base, published_at: null }).publishedAt, null);
  }),
  test('published_at מלא ⇒ התאריך', () => {
    equal(stepFromDb({ ...base, published_at: '2026-10-01T10:00:00Z' }).publishedAt, '2026-10-01T10:00:00Z');
  }),
  test('בלי עמודה בכלל ⇒ undefined (נתון ישן — לא טיוטה)', () => {
    equal(stepFromDb({ ...base }).publishedAt, undefined);
  }),
  test('שאר ה-null עדיין הופכים ל-undefined', () => {
    equal(stepFromDb({ ...base, published_at: null, due_date: null }).dueDate, undefined);
  }),
];
