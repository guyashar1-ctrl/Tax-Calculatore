import { test, equal, assert, type TestCase } from '../../../testkit/tinyTest';
import type { Client } from '../../../types';
import { questionnaireClient } from '../knownClient';
import { buildYearPicture } from '../picture';
import { buildAskPlan } from '../asks';
import { initialFromCard, monthInText, monthInKey, answerValid, schemaFor } from '../records';
import { cardUpdateFor } from '../recordToCard';

const client = (extra: Partial<Client> = {}) => ({ id: 'c', firstName: 'ישראל', familyStatus: 'married',
  spouseFirstName: 'ישראלה', children: [], businesses: [], employers: [], properties: [], pensionFunds: [],
  investmentAccounts: [], foreignAccounts: [], fieldMeta: {}, ...extra } as unknown as Client);
export const TESTS: TestCase[] = [
  test('NI employers enter the confirmation journey, separately for each person and year', () => {
    const c = client({ niOccupations: [
      { id: 'past', type: 'employee', employerName: 'מעסיק קודם', fromDate: '2024-01-01', toDate: '2025-06-30' },
      { id: 'future', type: 'employee', employerName: 'מעסיק עתידי', fromDate: '2026-01-01' },
    ], spouseNiOccupations: [{ id: 'sp', type: 'employee', btlDetail: { employerName: 'מעסיק בת הזוג' } as never }] });
    const p = buildYearPicture({ client: c, taxYear: 2025, purpose: 'annual', facts: [], evidence: [], asks: [], today: '2026-10-23' });
    const plan = buildAskPlan([...p.toConfirm, ...p.toAsk], { client: c, taxYear: 2025, purpose: 'annual' });
    const mine = plan.find(a => a.itemKey === 'salary.employers' && a.subjectRole === 'client');
    const spouse = plan.find(a => a.itemKey === 'salary.employers' && a.subjectRole === 'spouse');
    assert(mine?.prompt.input.kind === 'confirm', 'client has a confirmation');
    assert(spouse?.prompt.input.kind === 'confirm', 'spouse has a separate confirmation');
    assert(JSON.stringify(mine.prompt).includes('מעסיק קודם'), 'employer during target year included');
    assert(!JSON.stringify(mine.prompt).includes('מעסיק עתידי'), 'future employer excluded');
    assert(!JSON.stringify(mine.prompt).includes('מעסיק בת הזוג'), 'spouse employer is not assigned to client');
    equal(c.employers?.length, 0);
  }),
  test('card identities survive deduplication and normalization is idempotent', () => {
    const c = client({ employers: [{ id: 'approved', name: 'משרד דוגמה', startDate: '2020-02-01' }],
      niOccupations: [{ id: 'n', type: 'employee', employerName: ' משרד  דוגמה ', fromDate: '2024-01-01' }] });
    const v = questionnaireClient(c, 2025);
    equal(v.employers?.length, 1); equal(v.employers?.[0].id, 'approved');
    equal(JSON.stringify(questionnaireClient(v, 2025)), JSON.stringify(v));
  }),
  test('missing dates and owners are not invented; partial records remain prefilled', () => {
    const c = client({ children: [{ id: 'k', firstName: 'ילד', birthYear: 2020 } as never],
      pensionFunds: [{ id: 'f', institutionName: 'חברה', kind: 'new_pension' }],
      bankAccounts: [{ id: 'closed', bankName: 'ישן', closedAt: '2024-01-01' }] });
    equal(initialFromCard('children', c, 'couple')[0].birthDate, '');
    const children = [...initialFromCard('children', c, 'couple'), { firstName: 'ילד נוסף', birthDate: '2025-04-15' }];
    assert(answerValid(schemaFor('children', c), { items: children }), 'known birth year does not block adding another child');
    const plan = cardUpdateFor(c, 'household.children', { items: children }, { factId: 'f', itemKey: 'household.children', year: 2025 });
    assert(plan && JSON.stringify(plan).includes('2025-04-15') && !JSON.stringify(plan).includes('2020-01-01'), 'office plan preserves known date precision');
    equal(initialFromCard('fund', c, 'couple')[0].owner, undefined);
    equal(initialFromCard('bank', c, 'client').length, 0);
    equal(monthInKey({ precision: 'unknown' }, 2025, 'end'), 'unknown');
    equal(monthInText({ precision: 'day', date: '2025-06-15' }, 2025, 'end'), 'עד יוני 2025');
  }),
];
