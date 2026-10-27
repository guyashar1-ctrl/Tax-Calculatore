import { test, equal, assert } from '../../../testkit/tinyTest';
import type { TestCase } from '../../../testkit/tinyTest';
import type { Client } from '../../../types';
import type { OnboardingStep } from '../../../types/onboarding';
import type { WorkRow } from '../../taxYear/taxWork';
import type { Obligation } from '../../shaamFiling/model';
import { groupedHub, hubRows, matchesHub, visibleHub } from '../workHubModel';

const TODAY = '2026-10-27';
const clients = [{ id: 'c1', firstName: 'נועה', lastName: 'לוי', idNumber: '123456782' }, { id: 'c2', firstName: 'עמרי', lastName: 'ישראלי' }] as Client[];
const ob = (p: Partial<Obligation> = {}): Obligation => ({ id: 'o1', clientId: 'c1', kind: 'annual', yearShown: '2025', fileNumber: '100200300', state: 'open', shaamStatus: 'open', ...p });
const wr = (p: Record<string, unknown> = {}, bucket: WorkRow['bucket'] = 'mine'): WorkRow => ({ parent: { id: 'w1', clientId: 'c1', stepType: 'annual_return', status: bucket === 'done' ? 'completed' : 'in_progress', payload: { taxYear: 2025, ...p } } as unknown as OnboardingStep, kind: 'annual', title: 'דוח שנתי', missing: [], unavailable: 0, drafts: 0, toReview: 0, answered: 0, bucket, next: bucket === 'client' ? 'ממתין ללקוח' : 'בטיפול המשרד' });
export const TESTS: TestCase[] = [
  test('חובה בלי בקשה מופיעה בריכוז; אינה יוצרת בקשה או מנחשת מועד', () => {
    const rows = hubRows([], [ob()], clients, TODAY);
    equal(rows.length, 1); equal(rows[0].status, 'טרם נפתחה בקשה'); equal(rows[0].stepId, undefined); equal(rows[0].dueDate, undefined);
  }),
  test('קישור שרת מאחד חובה ובקשה לשורה אחת; שם ושנה לבדם אינם קישור', () => {
    equal(hubRows([wr()], [ob({ stepId: 'w1', stepStatus: 'in_progress' })], clients, TODAY).length, 1);
    equal(hubRows([wr()], [ob()], clients, TODAY).length, 2);
    equal(hubRows([wr()], [ob({ clientId: 'c2', stepId: 'w1' })], clients, TODAY).length, 2, 'קישור לכרטיס אחר אינו מחבר');
    const household = hubRows([wr()], [ob({ stepId: 'w1', role: 'client' }), ob({ id: 'spouse', stepId: 'w1', role: 'spouse' })], clients, TODAY);
    equal(household.length, 2, 'שתי רשומות רשות של בני זוג נשמרות בנפרד, עם תפקידן');
    equal(new Set(household.map(r => r.stepId)).size, 1, 'שתיהן מובילות לאותה בקשה משותפת, ללא בקשה כפולה');
  }),
  test('ארכה מאומתת גוברת על שע״ם; מועד שנמסר גובר על יעד פנימי', () => {
    const extension = wr({ work: { deadline: { status: 'verified', due: '2026-10-20', extension: { status: 'documented', until: '2026-12-31' } } } });

    equal(hubRows([extension], [ob({ stepId: 'w1', legalDue: '2026-11-01' })], clients, TODAY)[0].dueDate, '2026-12-31');
    equal(hubRows([wr({ internalTarget: '2027-01-01' })], [ob({ stepId: 'w1', legalDue: '2026-11-01' })], clients, TODAY)[0].dueDate, '2026-11-01');
  }),
  test('השלמה במשרד אינה הגשה; חובת שע״ם פתוחה נשארת גלויה', () => {
    const r = hubRows([wr({}, 'done')], [ob({ stepId: 'w1', stepStatus: 'completed' })], clients, TODAY)[0];
    equal(r.state, 'open'); assert(r.status.includes('הגשה טרם אומתה'), 'ניסוח מבחין בין משרד לרשות');
    equal(hubRows([wr({}, 'done')], [], clients, TODAY)[0].state, 'done');
    equal(hubRows([], [ob({ filedOn: '2026-06-01' })], clients, TODAY)[0].state, 'open', 'תאריך ישן שנשאר אחרי שחזור אינו גובר על המצב הנוכחי');
  }),
  test('הוגש לפי שע״ם מוצג בהיסטוריה עם מצב העותק, ולא כעבודה פתוחה כפולה', () => {
    const r = hubRows([wr()], [ob({ stepId: 'w1', state: 'filed_per_shaam', shaamStatus: 'filed', copyStepId: 'copy', copyStepStatus: 'pending' })], clients, TODAY);
    equal(r.length, 1); equal(r[0].state, 'filed'); equal(r[0].copyMissing, true); assert(r[0].status.includes('עותק'), 'מצב העותק גלוי');
    equal(groupedHub(r).length, 0);
  }),
  test('יום הצהרת ההון אינו נגזר משנת הרשימה', () => {
    const r = hubRows([], [ob({ kind: 'wealth', yearShown: '2025' })], clients, TODAY)[0];
    equal(r.year, null); equal(r.asOfDate, undefined); assert(r.period.includes('טרם אומת'), 'יום ההצהרה נשאר לא ידוע');
  }),
  test('חריגות והקשר נשארים בפאנל; אינם נחשבים חובה מזוהה בריכוז', () => {
    equal(hubRows([], [ob({ state: 'needs_review' }), ob({ state: 'context' }), ob({ state: 'dismissed' }), ob({ clientId: 'missing' })], clients, TODAY).length, 0);
  }),
  test('סינון לפי סוג/שם/תיק/שנה וקיבוץ באיחור עובדים על אותה רשימה', () => {
    const rows = hubRows([], [ob({ legalDue: '2026-10-20' }), ob({ id: 'o2', clientId: 'c2', kind: 'wealth', legalDue: '2026-12-01' })], clients, TODAY);
    assert(matchesHub(rows[0], 'annual', 'נועה 2025 100200300'), 'כל מילות החיפוש תואמות');
    equal(visibleHub(rows, 'wealth', '', 'all').length, 1);
    equal(visibleHub(rows, 'all', '', 'client').length, 1, 'איחור אינו נעלם במסנן אחריות');
    equal(groupedHub(rows)[0].id, 'overdue');
  }),
];
