// ─── דוח שנתי: השלב בפס (21.10.2026) ─────────────────────────────────────────────────────────────────────
// ‼ מה נעול כאן: «אישורך» רק אחרי שנשמרה טיוטת דוח — לא באמצע האיסוף; אישור ⇒ חתימה; הגשה ⇒ הוגש.

import { test, equal } from '../../../testkit/tinyTest';
import type { TestCase } from '../../../testkit/tinyTest';
import { annualStage, STAGE, type AnnualStageInput } from '../annualStage';

const base: AnnualStageInput = { questions: 5, questionsDone: 5, filling: false, files: 3, filesDone: 3, closed: false, returns: [] };

export const TESTS: TestCase[] = [
  test('הלקוח עוד ממלא — שאלון', () => {
    equal(annualStage({ ...base, filling: true, questionsDone: 2 }), STAGE.questions);
    equal(annualStage({ ...base, questions: 0, questionsDone: 0 }), STAGE.questions);
  }),
  test('נשלח, חסר מסמך — מסמכים; הכול הגיע — הכנה', () => {
    equal(annualStage({ ...base, filesDone: 2 }), STAGE.docs);
    equal(annualStage(base), STAGE.prepare);
  }),
  test('טיוטת דוח שמורה — אישורך, גם כשעוד חסר מסמך', () => {
    equal(annualStage({ ...base, filesDone: 1, returns: [{ status: 'draft' }] }), STAGE.approve);
  }),
  test('אושר — חתימת הלקוח; טיוטה מתקנת אחרי אישור — שוב אישורך', () => {
    equal(annualStage({ ...base, returns: [{ status: 'approved' }] }), STAGE.sign);
    equal(annualStage({ ...base, returns: [{ status: 'superseded' }, { status: 'approved' }, { status: 'draft' }] }), STAGE.approve);
  }),
  test('נרשמה הגשה, או שהבקשה הושלמה — הוגש', () => {
    equal(annualStage({ ...base, returns: [{ status: 'approved', filedAt: '2026-05-01' }] }), STAGE.filed);
    equal(annualStage({ ...base, filling: true, closed: true }), STAGE.filed);
  }),
];
