// ─── מפת הדרך: אילו לקוחות הם לבנים בקיר «המשרד מכניס», ובאיזה סכום ────────────
import { test, equal, deepEqual } from '../../testkit/tinyTest';
import type { TestCase } from '../../testkit/tinyTest';
import type { Client } from '../../types';
import type { Engagement } from '../../types/onboarding';
import { visionClients } from '../visionOffice';

const TODAY = '2026-10-07';
const client = (id: string, extra: Partial<Client> = {}): Client =>
  ({ id, firstName: 'דנה', lastName: id, vatStatus: 'authorizedDealer', ...extra } as unknown as Client);
const eng = (id: string, clientId: string, extra: Partial<Engagement>): Engagement =>
  ({ id, clientId, status: 'active', ...extra } as Engagement);

export const TESTS: TestCase[] = [
  test('לקוח עם ריטיינר בהסכם הנוכחי ⇒ לבנה, לפי הסכום והחודש שבהסכם', () => {
    const out = visionClients([client('a')], [
      eng('e1', 'a', { monthlyTotal: 400, approvedAt: '2026-09-15T10:00:00Z', billingStartMonth: '2026-10' }),
    ], TODAY);
    deepEqual(out, [{ id: 'a', name: 'דנה a', type: 'murshe', monthly: 400, approved: '2026-09-15', from: '2026-10', ended: null }]);
  }),

  test('בלי ריטיינר (הסכם חד־פעמי, בוטל, או בלי הסכם) ⇒ לא לבנה', () => {
    const out = visionClients([client('a'), client('b'), client('c')], [
      eng('e1', 'a', { monthlyTotal: 0, approvedAt: '2026-09-01' }),
      eng('e2', 'b', { status: 'cancelled', monthlyTotal: 500, approvedAt: '2026-09-01' }),
    ], TODAY);
    equal(out.length, 0);
  }),

  test('חידוש בסכום חדש: הלבנה מאז האישור הראשון, בסכום של ההסכם הנוכחי', () => {
    const out = visionClients([client('a')], [
      eng('old', 'a', { status: 'ended', monthlyTotal: 350, approvedAt: '2026-03-01', billingStartMonth: '2026-03', endedAt: '2026-08-31T00:00:00Z' }),
      eng('new', 'a', { status: 'active', monthlyTotal: 450, approvedAt: '2026-08-20', billingStartMonth: '2026-09' }),
    ], TODAY);
    equal(out[0].approved, '2026-03-01');
    equal(out[0].from, '2026-03');
    equal(out[0].monthly, 450);
    equal(out[0].ended, null);
  }),

  test('הסכם שהסתיים בלי הסכם חדש ⇒ לבנה של לקוח שעזב, עם תאריך הסיום', () => {
    const out = visionClients([client('a')], [
      eng('e1', 'a', { status: 'ended', monthlyTotal: 400, approvedAt: '2026-01-10', endedAt: '2026-09-30T12:00:00Z' }),
    ], TODAY);
    equal(out[0].ended, '2026-09-30');
    equal(out[0].monthly, 400);
  }),

  test('חידוש שאושר וטרם נכנס לתוקף — הלקוח ממשיך', () => {
    const out = visionClients([client('a')], [
      eng('e1', 'a', { status: 'ended', monthlyTotal: 400, approvedAt: '2026-01-10', endedAt: '2026-09-30' }),
      eng('e2', 'a', { status: 'scheduled', monthlyTotal: 500, approvedAt: '2026-09-25', effectiveFrom: '2026-11-01' }),
    ], TODAY);
    equal(out[0].ended, null);
    equal(out[0].monthly, 500);
  }),

  test('סוג: חברה (שם העסק), פטור, מורשה, ולא ידוע', () => {
    const e = (id: string) => eng('e' + id, id, { monthlyTotal: 100, approvedAt: '2026-09-01' });
    const out = visionClients([
      client('co', { type: 'company', businessName: 'ישר בע״מ' }),
      client('pt', { vatStatus: 'exemptDealer' }),
      client('lead', { vatStatus: 'none', dealerType: 'licensed' }),
      client('x', { vatStatus: 'none' }),
    ], [e('co'), e('pt'), e('lead'), e('x')], TODAY);
    const by = Object.fromEntries(out.map(c => [c.id, c]));
    equal(by.co.type, 'company');
    equal(by.co.name, 'ישר בע״מ');
    equal(by.pt.type, 'patur');
    equal(by.lead.type, 'murshe');
    equal(by.x.type, 'other');
  }),
];
