// מפת הכיסוי (DRAFT_FILL_1301) והמנוע מסונכרנים: כל קוד שהמנוע ממלא מופיע במפה, וכל קוד במפה קיים בטופס.
import { test, assert } from '../../../testkit/tinyTest';
import type { TestCase } from '../../../testkit/tinyTest';
import type { Client } from '../../../types';
import type { YearFact } from '../../taxYear/types';
import { CATALOG_1301_2025, DRAFT_FILL_1301 } from '../../taxForms/coverage1301';
import { computeReturn } from '../engine';
import type { ReturnDraft } from '../types';

let n = 0;
const f = (itemKey: string, role: YearFact['subjectRole'], value: unknown, entityRef?: string): YearFact => ({ id: `d${++n}`, clientId: 'c1', taxYear: 2025, itemKey, subjectRole: role, entityRef,
  periodKind: 'year', periodFrom: '2025-01-01', periodTo: '2025-12-31', answer: 'value', value, basis: 'final', source: 'office', status: 'accepted', createdAt: '2026-02-01T10:00:00Z' });
const couple = { id: 'c1', firstName: 'דוד', lastName: 'כהן', gender: 'male', familyStatus: 'married', birthDate: '1980-01-01', children: [],
  spouse: { firstName: 'רות', birthDate: '1982-01-01', gender: 'female' },
  employers: [{ id: 'e1', name: 'א' }, { id: 'e2', name: 'ב', belongsToSpouse: true }], businesses: [{ id: 'b1', name: 'עסק' }, { id: 'b2', name: 'עסק2', belongsToSpouse: true }],
  properties: [{ id: 'p1', address: 'הגפן 1', isRented: true, rentalTaxTrack: 'exempt' }], investmentAccounts: [{ id: 'i1', institutionName: 'בנק' }], pensionFunds: [], foreignAccounts: [], fieldMeta: {} } as unknown as Client;

export const TESTS: TestCase[] = [
  test('כל קוד שהמנוע ממלא — במפת הכיסוי; כל קוד במפה — בטופס 2025', () => {
    const facts = [
      f('salary.amounts', 'client', { gross: 120_000, withheld: 9_000 }, 'e1'), f('salary.amounts', 'spouse', { gross: 90_000, withheld: 5_000 }, 'e2'),
      f('business.profit', 'client', { profit: 150_000, turnover: 260_000, customerWithholding: 4_000 }, 'b1'), f('business.profit', 'spouse', { profit: 40_000, turnover: 90_000 }, 'b2'),
      f('business.books', 'client', true, 'b1'), f('payments.niPaid', 'client', 20_000), f('payments.niPaid', 'spouse', 6_000),
      f('savings.selfAmounts', 'client', { pension: 12_000, studyFund: 8_000 }), f('savings.selfAmounts', 'spouse', { pension: 3_000, studyFund: 2_000 }),
      f('savings.insuranceAmounts', 'client', { life: 1_500 }), f('savings.insuranceAmounts', 'spouse', { life: 900 }),
      f('donations.amount', 'client', 2_000), f('donations.amount', 'spouse', 1_000),
      f('rent.income', 'couple', 48_000, 'p1'), f('capital.amounts', 'client', { interest: 3_000, dividend: 2_000, withheld: 1_250 }, 'i1'),
    ];
    const codes = new Set<string>();
    const micros: ReturnDraft['micro'][] = [{}, { b2: { track: 'micro', registeredAtYearStart: true, reporting: 'full' } }];
    for (const micro of micros) {
      const o = computeReturn({ client: couple, draft: { taxYear: 2025, preparedOn: '2026-03-01', persons: ['client', 'spouse'], completions: [], adjustments: [], micro, decisions: [{ key: 'capital.rates', text: '25%' }] }, facts, evidence: [] });
      for (const x of o.fields) if (x.source.kind !== 'completion' && x.source.kind !== 'card') codes.add(x.code); // שורות מהתיק (זהות, הצהרות, ילדים) — בדיקת הכיסוי, לא המנוע
    }
    for (const c of codes) assert(DRAFT_FILL_1301[c] != null, `קוד ${c} ממולא במנוע ואינו במפת הכיסוי`);
    const inForm = (c: string) => CATALOG_1301_2025.some(e => e.id === c || Object.values((e as { codes?: Record<string, string | null> | null }).codes ?? {}).includes(c));
    for (const c of Object.keys(DRAFT_FILL_1301)) assert(inForm(c), `קוד ${c} במפה אינו בקטלוג 1301/2025`);
    assert(codes.size >= 18, `המנוע מילא ${codes.size} קודים בתרחיש הרחב`);
  }),
];

TESTS.push(test('השלמה מקצועית לשדה משכורת אינה «שוברת» את בקרת 106 — היא מקור נפרד ומתועד', () => {
  const c = { ...couple, businesses: [], properties: [], investmentAccounts: [] } as unknown as Client;
  const facts = [f('salary.amounts', 'client', { gross: 120_000, withheld: 9_000 }, 'e1')];
  const o = computeReturn({ client: c, facts, evidence: [], draft: { taxYear: 2025, preparedOn: '2026-03-01', persons: ['client', 'spouse'], adjustments: [], micro: {}, decisions: [],
    completions: [{ id: 'k1', gap: 'salary_e2', person: 'spouse', fields: [{ code: '172', amount: 90_000 }], taxAmount: 4_000, justification: '106 של המעסיק, נבדק ידנית', approvedAt: '2026-03-02' }] } });
  assert(o.controls.find(x => x.id === 'salary_106')?.ok === true, 'בקרת 106 עוברת');
  assert(o.fields.some(x => x.code === '172' && x.source.kind === 'completion'), '172 מסומן «השלמה מקצועית»');
  assert(!o.blockers.some(b => b.code === 'salary_e2') && o.controls.every(x => x.ok !== false), o.blockers.map(b => b.text).join(' | '));
}));
