// ─── סדר הרשימה ב«בקשות»: גרירה, קבוצה כגוש, ירוק עד סימון (310) ───
import { test, equal, assert, type TestCase } from '../../../testkit/tinyTest';
import { entryPosition, moveEntry, sortEntries, type ListEntry } from '../listOrder';
import { awaitingOfficeAck, countRequestsNeedingMe } from '../../../utils/requestAttention';
import type { OnboardingStep } from '../../../types/onboarding';

const E = (key: string, ...stepIds: string[]): ListEntry => ({ key, stepIds });
const list = [E('a', 'a'), E('g', 'g1', 'g2'), E('c', 'c')];
const all = ['a', 'g1', 'g2', 'c', 'done1'];

const step = (o: Partial<OnboardingStep>): OnboardingStep => ({
  id: 'x', userId: 'u', engagementId: 'e', clientId: 'c', stepType: 'custom_request', track: 'client',
  scope: 'client', title: 'בקשה', status: 'pending', ball: 'client', needsAttention: false,
  payload: {}, completionMethod: 'system', ...o,
} as OnboardingStep);

export const TESTS: TestCase[] = [
  test('גרירה למטה — אחרי היעד; קבוצה זזה כגוש', () => {
    equal(moveEntry(list, 'a', 'c', all)?.join(','), 'g1,g2,c,a,done1');
  }),
  test('גרירה למעלה — לפני היעד', () => {
    equal(moveEntry(list, 'c', 'a', all)?.join(','), 'c,a,g1,g2,done1');
    equal(moveEntry(list, 'g', 'a', all)?.join(','), 'g1,g2,a,c,done1');
  }),
  test('מה שלא מוצג נשאר אחרי, בסדר שלו — כל מזהה פעם אחת', () => {
    const out = moveEntry(list, 'c', 'g', all)!;
    equal(out.length, all.length);
    equal(new Set(out).size, all.length);
    equal(out[out.length - 1], 'done1');
  }),
  test('אותו פריט או מפתח לא מוכר — אין מה לשמור', () => {
    equal(moveEntry(list, 'a', 'a', all), null);
    equal(moveEntry(list, 'zz', 'a', all), null);
  }),
  test('מקום של פריט = הבקשה הראשונה שלו; חדשה — בסוף', () => {
    const order = new Map(all.map((id, i) => [id, i]));
    equal(entryPosition(E('g', 'g2', 'g1'), order), 1);
    equal(entryPosition(E('n', 'new'), order), Number.POSITIVE_INFINITY);
    equal(sortEntries([E('c', 'c'), E('a', 'a'), E('n', 'new'), E('g', 'g1')], all).map(e => e.key).join(','), 'a,g,c,n');
  }),
  test('ירוק עד סימון: רק הושלם + null מפורש', () => {
    assert(awaitingOfficeAck(step({ status: 'completed', officeAckAt: null })), 'הלקוח השלים — ירוק');
    assert(awaitingOfficeAck(step({ status: 'verified', officeAckAt: null })), 'אומת אבל לא סומן — ירוק');
    assert(!awaitingOfficeAck(step({ status: 'completed', officeAckAt: '2026-10-29T10:00:00Z' })), 'סומן — לא');
    assert(!awaitingOfficeAck(step({ status: 'completed' })), 'מסד בלי העמודה — נחשב נראה');
    assert(!awaitingOfficeAck(step({ status: 'pending', officeAckAt: null })), 'פתוחה — לא');
    assert(!awaitingOfficeAck(step({ status: 'skipped', officeAckAt: null })), 'דולגה — לא');
    assert(!awaitingOfficeAck(step({ status: 'completed', officeAckAt: null, stepType: 'rep_client_approval' })), 'מסך אחר מנהל — לא');
  }),
  test('התג סופר גם את מה שמחכה לסימון', () => {
    const green = step({ id: 'g', status: 'completed', officeAckAt: null });
    const seen = step({ id: 's', status: 'completed', officeAckAt: '2026-10-29T10:00:00Z' });
    equal(countRequestsNeedingMe([green, seen]), 1);
  }),
];
