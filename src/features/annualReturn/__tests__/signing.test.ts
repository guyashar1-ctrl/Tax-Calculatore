// ─── חתימת הלקוח על סט הדוח השנתי (297) ──────────────────────────────────────────────────────────────────
// ‼ מה נעול כאן: מי חותם (נשואים — שניהם, עם המין להצהרה); הצילום מכיל רק מה שהלקוח רואה (בלי שורות מקור);
//   «השתנה מאז החתימה» — רק כשסכום/טקסט בטופס השתנה, לא כשרק מקור או סדר השתנו.
import { test, equal, assert } from '../../../testkit/tinyTest';
import type { TestCase } from '../../../testkit/tinyTest';
import type { Client } from '../../../types';
import type { ReturnOutputs } from '../types';
import { signSnapshot, signersOf, snapshotKey } from '../signing';

const out = (amount: number, extra: Record<string, unknown> = {}) => ({
  taxYear: 2025,
  fields: [{ code: '158', part: 'ג', label: 'משכורת', person: 'client', kind: 'amount', amount, source: { kind: 'fact', trust: 'verified', text: 'פירוט ארוך', lines: [{ factId: 'f1', amount, docLabel: 'טופס 106', person: 'client', itemKey: 'salary.amounts', year: 2025, enteredAt: '2026-10-25', trust: 'verified' }] } }],
  formCoverage: { produced: [], annexes: [{ formId: '1320', title: 'עסק', need: 'required', reason: 'יש עסק', produced: 'full' }], counts: { relevant: 10, filled: 5, missing: 5, notSupported: 0, office: 0 }, rows: [{ id: 'x' }] },
  annexes: [], household: { balance: -1200, incomplete: false, liability: 1, withheld: 2, advancesPaid: 0, manualTax: 0, explain: ['פירוט'] },
  gaps: [{ code: 'g' }], controls: [{ id: 'c' }], ...extra,
}) as unknown as ReturnOutputs;
const meta = { year: 2025, clientName: 'דוד', spouseName: 'רחל', docs: [{ title: 'טופס 106', who: 'דוד' }] };

export const TESTS: TestCase[] = [
  test('מי חותם: נשואים — הלקוח ובן/בת הזוג, עם המין להצהרה; רווק — רק הלקוח', () => {
    const married = { firstName: 'דוד', gender: 'male', familyStatus: 'married', spouseFirstName: 'רחל', spouse: { firstName: 'רחל', gender: 'female' } } as unknown as Client;
    equal(JSON.stringify(signersOf(married)), JSON.stringify([{ role: 'client', name: 'דוד', gender: 'm' }, { role: 'spouse', name: 'רחל', gender: 'f' }]));
    const single = { firstName: 'דנה', gender: 'female', familyStatus: 'single' } as unknown as Client;
    equal(signersOf(single).map(s => s.role).join(), 'client');
  }),
  test('הצילום: רק מה שהלקוח רואה — בלי פירוט החישוב, בלי בקרות ובלי שורות כיסוי', () => {
    const s = signSnapshot(out(96400), meta);
    const f = s.out.fields[0];
    equal(f.amount, 96400);
    equal(JSON.stringify(f.source.lines), JSON.stringify([{ docLabel: 'טופס 106' }]));
    const kept = Object.keys(s.out);
    assert(!kept.includes('gaps') && !kept.includes('controls'), 'נשארו בקרות/פערים');
    assert(!('rows' in (s.out.formCoverage as object)), 'נשארו שורות הכיסוי');
    equal(JSON.stringify(s.out.household), JSON.stringify({ balance: -1200, incomplete: false }));
    equal(s.names.spouse, 'רחל');
  }),
  test('«השתנה מאז החתימה» — רק כשסכום בטופס השתנה', () => {
    const a = signSnapshot(out(96400), meta);
    const sameValueOtherSource = signSnapshot(out(96400, {}), { ...meta, docs: [] });
    equal(snapshotKey(a), snapshotKey(sameValueOtherSource));
    assert(snapshotKey(a) !== snapshotKey(signSnapshot(out(97000), meta)), 'שינוי סכום לא זוהה');
  }),
];
