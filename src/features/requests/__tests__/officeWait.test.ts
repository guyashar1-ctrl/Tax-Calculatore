// ─── «ממתין לך · N ימים» על בקשות פייפרלס שמחכות למשרד (23.10.2026) ───
import { test, equal, assert, type TestCase } from '../../../testkit/tinyTest';
import { paperlessOfficeWait, OFFICE_WAIT_LATE_DAYS } from '../officeWait';

const NOW = Date.parse('2026-10-23T12:00:00Z');
const ago = (d: number) => new Date(NOW - d * 86400000).toISOString();
const invite = { id: 'inv', completedAt: ago(18) };
const conn = (o: Record<string, unknown> = {}) => ({
  id: 'conn', stepType: 'paperless_connection' as const, status: 'pending' as const, ball: 'me' as const,
  createdAt: ago(30), dependsOnStepId: 'inv', ...o,
});

export const TESTS: TestCase[] = [
  test('החיבור נספר מאז שהלקוח נרשם — לא מאז היצירה', () => {
    const w = paperlessOfficeWait(conn(), [invite], undefined, NOW);
    equal(w?.days, 18);
    equal(w?.text, 'ממתין לך · 18 ימים');
    assert(w?.late === true, 'מעל הסף ⇒ מתבלט');
  }),
  test('הסף: 3 ימים', () => {
    equal(OFFICE_WAIT_LATE_DAYS, 3);
    equal(paperlessOfficeWait(conn(), [{ id: 'inv', completedAt: ago(2) }], undefined, NOW)?.late, false);
    equal(paperlessOfficeWait(conn(), [{ id: 'inv', completedAt: ago(3) }], undefined, NOW)?.late, true);
  }),
  test('ניסוח ליום אחד ולהיום', () => {
    equal(paperlessOfficeWait(conn(), [{ id: 'inv', completedAt: ago(1) }], undefined, NOW)?.text, 'ממתין לך · יום אחד');
    equal(paperlessOfficeWait(conn(), [{ id: 'inv', completedAt: ago(0) }], undefined, NOW)?.text, 'ממתין לך · מהיום');
  }),
  test('כמה הורים — מהאחרון שהושלם; בלי הורה — מהיצירה', () => {
    const w = paperlessOfficeWait(conn(), [invite, { id: 'files', completedAt: ago(4) }], ['inv', 'files'], NOW);
    equal(w?.days, 4);
    equal(paperlessOfficeWait(conn({ dependsOnStepId: undefined }), [], undefined, NOW)?.days, 30);
  }),
  test('רק מה שמחכה למשרד: לא נעול, לא אצל הלקוח, לא סגור, ורק חיבור / הרשאת תשלום', () => {
    equal(paperlessOfficeWait(conn({ status: 'locked' }), [invite], undefined, NOW), null);
    equal(paperlessOfficeWait(conn({ ball: 'client' }), [invite], undefined, NOW), null);
    equal(paperlessOfficeWait(conn({ status: 'completed' }), [invite], undefined, NOW), null);
    equal(paperlessOfficeWait(conn({ stepType: 'paperless_invite' }), [invite], undefined, NOW), null);
    assert(!!paperlessOfficeWait(conn({ stepType: 'retainer_authorization' }), [invite], undefined, NOW), 'הרשאת התשלום — כן');
  }),
];
