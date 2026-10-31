import { test, equal, deepEqual, assert, type TestCase } from '../../../testkit/tinyTest';
import type { Engagement } from '../../../types/onboarding';
import type { AdditionalCharge } from '../../../types/charges';
import type { Client } from '../../../types';
import { clientLedger, dueAtFiling, periodToMonth, retainerClientFor, type RetainerSnapshot } from '../billingLedger';
import { matchPendingRows } from '../paperlessReads';

const eng = (extra: Partial<Engagement> = {}) => ({ id: 'e1', clientId: 'c1', status: 'onboarding', monthlyTotal: 200, billingStartMonth: '2026-10', effectiveFrom: '2026-10-01', ...extra }) as Engagement;
const snap = (period: string, fees: { period: string; charged: boolean }[] = [], id = '123456789'): RetainerSnapshot => ({
  period, invoiceDate: null,
  clients: [{ idNumber: id, name: 'לקוח', linked: true, paymentMethod: 'credit', amountBeforeVat: 200, cardEntered: true, fees: fees.map(f => ({ ...f, amount: 236, chargedAt: null })) }],
});
const filing = (amount = 800, status = 'pending'): AdditionalCharge => ({ id: 'ch', clientId: 'c1', description: 'השלמה לדוח שנתי', amount, currency: 'ILS', status, dueTrigger: 'עם הגשת הדוח השנתי' } as AdditionalCharge);

export const TESTS: TestCase[] = [
  test('period YYMM ⇒ YYYY-MM', () => { equal(periodToMonth('2610'), '2026-10'); equal(periodToMonth(null), null); equal(periodToMonth('26-10'), null); }),
  test('גיא: חודש שלא נגבה מתווסף להגשת הדוח — 800 + 200 = 1,000', () => {
    const s = snap('2611');
    const l = clientLedger({ engagements: [eng()], clientId: 'c1', snapshot: s, retainer: retainerClientFor(s, '123456789') });
    deepEqual(l.months.map(m => [m.month, m.state]), [['2026-10', 'not_charged'], ['2026-11', 'open']]);
    equal(dueAtFiling([filing()], 'c1', l).total, 1000);
  }),
  test('החודש הפתוח בריטיינר אינו «לא נגבה» — עדיין 800', () => {
    const s = snap('2610');
    const l = clientLedger({ engagements: [eng()], clientId: 'c1', snapshot: s, retainer: retainerClientFor(s, '123456789') });
    equal(l.current?.state, 'open'); equal(l.unpaidTotal, 0);
    equal(dueAtFiling([filing()], 'c1', l).total, 800);
  }),
  test('חודש שחויב לא מתווסף', () => {
    const s = snap('2611', [{ period: '2610', charged: true }]);
    const l = clientLedger({ engagements: [eng()], clientId: 'c1', snapshot: s, retainer: retainerClientFor(s, '123456789') });
    equal(l.months[0].state, 'charged'); equal(l.unpaidTotal, 0);
  }),
  test('בלי בדיקה בפייפרלס — «לא ידוע», שום דבר לא מתווסף', () => {
    const l = clientLedger({ engagements: [eng()], clientId: 'c1', snapshot: null, retainer: null, today: '2026-12' });
    assert(l.months.every(m => m.state === 'unknown'), 'unknown');
    equal(dueAtFiling([filing()], 'c1', l).total, 800);
  }),
  test('לקוח שלא בריטיינר: חודשים שעברו נחשבים «לא נגבה» (הכלל חל על כולם)', () => {
    const s = snap('2612', [], '999');
    const l = clientLedger({ engagements: [eng({ monthlyTotal: 365 })], clientId: 'c1', snapshot: s, retainer: retainerClientFor(s, '123456789') });
    equal(l.unpaid.length, 2); equal(l.unpaidTotal, 730);
  }),
  test('חיוב ששולם או חיוב שאינו של הדוח — לא בתשלום עם הגשת הדוח', () => {
    const l = clientLedger({ engagements: [eng()], clientId: 'c1', snapshot: null, retainer: null, today: '2026-10' });
    equal(dueAtFiling([filing(800, 'paid'), { ...filing(300), dueTrigger: undefined, dueDate: '2026-11-01' }], 'c1', l).total, 0);
  }),
  test('ת״ז עם אפס מוביל תואמת; שתי התאמות ⇒ אין התאמה', () => {
    const s = snap('2610', [], '012345678');
    equal(retainerClientFor(s, '12345678')?.idNumber, '012345678');
    const dup: RetainerSnapshot = { ...s, clients: [...s.clients, ...s.clients] };
    equal(retainerClientFor(dup, '012345678'), null);
  }),
  test('ממתינים: התאמה לפי שם בכל סדר או שם עסק; כפול ⇒ לא מותאם', () => {
    const cl = [{ id: 'a', firstName: 'יובל', lastName: 'גרוסמן' }, { id: 'b', firstName: 'אילן', lastName: 'סימנטוב', businessName: 'אילן סימנטוב מספרה' }] as Client[];
    const rows = [{ name: 'גרוסמן יובל', business: 'יובל גרוסמן', type: '', all: 10, upcoming: 0 }, { name: 'משהו אחר', business: 'אילן סימנטוב מספרה', type: '', all: 1, upcoming: 0 }, { name: 'לא קיים', business: 'x', type: '', all: 2, upcoming: 0 }];
    const m = matchPendingRows(rows, cl);
    equal(m.byClient.get('a')?.all, 10); equal(m.byClient.get('b')?.all, 1); equal(m.unmatched.length, 1);
  }),
];
