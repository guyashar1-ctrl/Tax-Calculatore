// ─── בדיקות: «עבודות לקוחות» — סקירה בלבד (16.10.2026) ─────────────────────────────────────────
// ‼ מה נעול כאן: סדר (באיחור ← מתקרב ← ממתין למשרד ← אצל הלקוח), סינון לפי סוג/מצב/מועד/שם, «בוטלו» לא בפתוחות,
//   ומספרי ההתראות = מספר השורות שהן מסננות.

import { test, equal, assert } from '../../../testkit/tinyTest';
import type { TestCase } from '../../../testkit/tinyTest';
import type { OnboardingStep } from '../../../types/onboarding';
import type { WorkRow } from '../../taxYear/taxWork';
import { filterOverview, overviewCounts, toOverview } from '../workOverviewModel';

const TODAY = '2026-10-16';
const row = (id: string, client: string, kind: WorkRow['kind'], bucket: WorkRow['bucket'], payload: Record<string, unknown>): WorkRow => ({
  parent: { id, clientId: client, stepType: kind === 'annual' ? 'annual_return' : kind === 'wealth' ? 'wealth_declaration' : 'tax_file_intake',
    status: bucket === 'cancelled' ? 'cancelled' : bucket === 'done' ? 'completed' : 'in_progress', payload, updatedAt: '2026-10-10T00:00:00Z' } as unknown as OnboardingStep,
  kind, title: String(payload.title ?? id), missing: [], unavailable: 0, drafts: 0, toReview: 0, answered: 0, bucket, next: bucket,
});
const due = (d: string) => ({ work: { deadline: { status: 'verified', due: d } } });
const ROWS = [
  row('a', 'c1', 'annual', 'client', { taxYear: 2025, ...due('2026-12-31') }),
  row('b', 'c2', 'annual', 'mine', { taxYear: 2025, ...due('2026-10-01') }),
  row('c', 'c3', 'wealth', 'mine', { asOfDate: '2025-12-31', internalTarget: '2026-10-25' }),
  row('d', 'c4', 'annual', 'cancelled', { taxYear: 2024, removal: { reason: 'בטעות' } }),
  row('e', 'c5', 'intake', 'mine', {}),
];
const names: Record<string, string> = { c1: 'דוד כהן', c2: 'מיכל לוי', c3: 'אורית', c4: 'נטשה', c5: 'רון' };

export const TESTS: TestCase[] = [
  test('סדר: באיחור ← מתקרב ← ממתין למשרד ← אצל הלקוח', () => {
    const all = toOverview(ROWS, TODAY);
    const ids = filterOverview(all, { kind: 'all', state: 'open', due: 'any', today: TODAY }).map(x => x.stepId);
    equal(ids.join(), 'b,c,e,a');
  }),
  test('«בוטלו» לא בפתוחות, ומופיעה עם מצב «בוטלו»', () => {
    const all = toOverview(ROWS, TODAY);
    assert(!filterOverview(all, { kind: 'all', state: 'open', due: 'any', today: TODAY }).some(x => x.stepId === 'd'), 'לא בפתוחות');
    equal(filterOverview(all, { kind: 'all', state: 'cancelled', due: 'any', today: TODAY }).map(x => x.stepId).join(), 'd');
    assert(toOverview(ROWS, TODAY).find(x => x.stepId === 'd')!.dueDate === undefined, 'אין מועד לעבודה שבוטלה');
  }),
  test('סינון לפי סוג, מועד ושם', () => {
    const all = toOverview(ROWS, TODAY);
    equal(filterOverview(all, { kind: 'annual', state: 'open', due: 'any', today: TODAY }).map(x => x.stepId).join(), 'b,a');
    equal(filterOverview(all, { kind: 'all', state: 'open', due: 'overdue', today: TODAY }).map(x => x.stepId).join(), 'b');
    equal(filterOverview(all, { kind: 'all', state: 'open', due: 'none', today: TODAY }).map(x => x.stepId).join(), 'e');
    equal(filterOverview(all, { kind: 'all', state: 'open', due: 'any', q: 'מיכל', nameOf: id => names[id], today: TODAY }).map(x => x.stepId).join(), 'b');
  }),
  test('מספרים = שורות; התקופה במילים', () => {
    const all = toOverview(ROWS, TODAY);
    const n = overviewCounts(all, 'all', TODAY);
    equal(`${n.open}/${n.overdue}/${n.soon}/${n.cancelled}`, '4/1/1/1');
    equal(all.find(x => x.stepId === 'c')!.period, 'ליום 31.12.2025');
    equal(all.find(x => x.stepId === 'e')!.period, 'פרטים קבועים');
    equal(all.find(x => x.stepId === 'b')!.days, -15);
  }),
];
