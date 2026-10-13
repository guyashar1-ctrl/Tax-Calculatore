// דרישה להצהרת הון — מצבים ומועדים (230). ‼ «מועד רשמי» רק מדרישה מאומתת; הרצפה היא בקרה.
import { test, equal, assert } from '../../../testkit/tinyTest';
import type { TestCase } from '../../../testkit/tinyTest';
import { demandView, wealthMinDue } from '../wealthDemand';

export const TESTS: TestCase[] = [
  test('רצפה חוקית: 120 יום מהמאוחר מבין תאריך הדרישה ויום ההצהרה (סעיף 135(1)(א))', () => {
    equal(wealthMinDue('2026-09-14', '2025-12-31'), '2027-01-12');
    equal(wealthMinDue('2025-10-01', '2025-12-31'), '2026-04-30');
    equal(wealthMinDue(undefined, '2025-12-31'), undefined);
  }),
  test('אין דרישה ⇒ הכנה, בלי מועד', () => {
    const v = demandView(undefined);
    equal(v.state, 'none');
    assert(!v.officialDue && !v.computedDue, 'אין מועד');
  }),
  test('מידע שלא אומת: המועד מוצג «נמסר, לא מאומת» — לא כמועד רשמי', () => {
    const v = demandView({ status: 'reported', letterDate: '2026-09-14', dueInLetter: '2027-01-31', computedDue: '2027-01-12' });
    equal(v.state, 'reported');
    equal(v.officialDue, undefined);
    equal(v.reportedDue, '2027-01-31');
    assert(v.short.includes('לא מאומת'), v.short);
  }),
  test('דרישה מאומתת: המועד שבמכתב הוא הרשמי; ארכה מוצגת בנפרד', () => {
    const v = demandView({ status: 'verified', letterDate: '2026-09-14', dueInLetter: '2027-01-31', computedDue: '2027-01-12',
      extension: { until: '2027-03-31', kind: 'personal', status: 'documented' } });
    equal(v.officialDue, '2027-01-31');
    equal(v.extensionUntil, '2027-03-31');
    assert(v.short.includes('31.01.2027') && v.short.includes('ארכה עד 31.03.2027'), v.short);
  }),
  test('מועד במכתב מוקדם מהרצפה ⇒ אזהרה לבדוק את הקריאה', () => {
    equal(demandView({ status: 'verified', dueInLetter: '2026-12-01', computedDue: '2027-01-12' }).dueBelowFloor, true);
    equal(demandView({ status: 'verified', dueInLetter: '2027-01-31', computedDue: '2027-01-12' }).dueBelowFloor, false);
  }),
];
