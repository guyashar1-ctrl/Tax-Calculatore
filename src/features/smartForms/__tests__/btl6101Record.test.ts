// ─── 6101 מול «מה ב"ל רושם» (207) — השוואה והשלמה, בלי דריסה ─────────────────
// הרצה: node scripts/run-unit-tests.mjs btl6101Record
// ‼ רשומות סינתטיות בלבד.

import { test, assert, equal, type TestCase } from '../../../testkit/tinyTest';
import { resolve6101, recordedBtl } from '../btl6101/resolve';
import { FX_FULL, FX_GAPS } from '../btl6101/fixtures';
import type { BtlPortalPerson, BtlPortalFact, BtlFactKey } from '../../nationalInsurance/btlPortalRecord';
import type { Client } from '../../../types';

const AS_OF = '2026-09-28';
const SEEN = '2026-09-23T17:30:00Z';

const fact = (value: Record<string, unknown>, history: BtlPortalFact['history'] = []): BtlPortalFact =>
  ({ value, since: '2026-01-05T08:00:00Z', lastSeen: SEEN, screen: 'ריכוז מידע', history });
const record = (facts: Partial<Record<BtlFactKey, BtlPortalFact>>): BtlPortalPerson => ({ facts, documents: [] });
const family = (code: string | undefined, raw: string) => record({ familyStatus: fact({ raw, ...(code ? { code } : {}) }) });

const run = (client: Client, btlRecord?: BtlPortalPerson, purposes: string[] = ['update_details']) =>
  resolve6101({ client, purposes: purposes as never, entered: {}, asOf: AS_OF, btlRecord });

export const TESTS: TestCase[] = [
  test('מצב משפחתי: בלי רשומת ב"ל — כמו קודם (מהכרטיס, מאומת)', () => {
    const r = run(FX_FULL);
    equal(r.data.maritalStatus, 'married');
    equal(r.fields.maritalStatus.status, 'verified');
    equal(r.fields.maritalStatus.sourceLabel, 'כרטיס הלקוח');
    equal(r.btl.recorded, undefined);
  }),
  test('מצב משפחתי: כרטיס «נשוי», ב"ל «רווק» ⇒ סתירה; הכרטיס נשאר, ב"ל כחלופה', () => {
    const r = run(FX_FULL, family('single', 'רווק'));
    equal(r.data.maritalStatus, 'married', 'לא נדרס');
    equal(r.fields.maritalStatus.status, 'conflict');
    equal(r.fields.maritalStatus.alternatives?.[0].value, 'single');
    assert(String(r.fields.maritalStatus.alternatives?.[0].sourceLabel).includes('23/09/2026'), 'תאריך הקריאה בחלופה');
  }),
  test('מצב משפחתי: תואם לב"ל ⇒ מאומת עם ציון ההתאמה', () => {
    const r = run(FX_FULL, family('married', 'נשוי'));
    equal(r.fields.maritalStatus.status, 'verified');
    assert(String(r.fields.maritalStatus.sourceLabel).includes('תואם לב"ל'), 'תואם');
  }),
  test('מצב משפחתי: אין בכרטיס ⇒ נלקח מב"ל כ«נגזר» (לאישור), לא כ«מאומת»', () => {
    const r = run({ ...FX_FULL, familyStatus: '' as never }, family('divorced', 'גרוש'));
    equal(r.data.maritalStatus, 'divorced');
    equal(r.fields.maritalStatus.status, 'derived');
  }),
  test('מצב משפחתי: «הורה יחיד» — ב"ל «גרוש» מוצע; ב"ל «נשוי» ⇒ לבירור, בלי ערך', () => {
    const sp = { ...FX_GAPS, familyStatus: 'singleParent' as never };
    const a = run(sp, family('divorced', 'גרוש'));
    equal(a.data.maritalStatus, 'divorced');
    equal(a.fields.maritalStatus.status, 'derived');
    const b = run(sp, family('married', 'נשוי'));
    equal(b.data.maritalStatus, '');
    // שדה חובה ריק ⇒ «חסר» (כמו בלי ב"ל) — וההסבר נשאר
    equal(b.fields.maritalStatus.status, 'missing');
    equal(run(sp).fields.maritalStatus.status, 'missing', 'אותו מצב בלי רשומת ב"ל');
    assert(String(b.fields.maritalStatus.note).includes('לברר'), 'הסבר הסתירה');
  }),
  test('מצב משפחתי: נוסח ב"ל שלא זוהה ⇒ רמז בלבד', () => {
    const r = run({ ...FX_FULL, familyStatus: '' as never }, family(undefined, 'מצב לא מוכר'));
    equal(r.data.maritalStatus, '');
    assert((r.hints.maritalStatus ?? []).some(h => h.includes('מצב לא מוכר')), 'רמז');
  }),

  test('תיק ניכויים: זהה (גם עם אפס מוביל) ⇒ מאומת; שונה ⇒ סתירה עם חלופה', () => {
    const same = run(FX_FULL, record({ withholdingFile: fact({ raw: '0912345678' }) }), ['stop_employees']);
    equal(same.fields.withholdingFile.status, 'verified');
    const diff = run(FX_FULL, record({ withholdingFile: fact({ raw: '923456789' }) }), ['stop_employees']);
    equal(diff.data.withholdingFile, '912345678', 'הכרטיס לא נדרס');
    equal(diff.fields.withholdingFile.status, 'conflict');
    equal(diff.fields.withholdingFile.alternatives?.[0].value, '923456789');
  }),
  test('תיק ניכויים: אין בכרטיס ⇒ מב"ל כ«נגזר»', () => {
    const r = run(FX_GAPS, record({ withholdingFile: fact({ raw: '934567890' }) }), ['stop_employees']);
    equal(r.data.withholdingFile, '934567890');
    equal(r.fields.withholdingFile.status, 'derived');
  }),

  test('חיוב שנתי: ב"ל חייב שנה כ«לא עובד» שאין בטבלה ⇒ רמז; סיווג שקיים בטבלה ⇒ שקט', () => {
    const years = [{ year: 2025, byAssessment: false, total: null, classes: [
      { classification: 'לא עובד', charge: '1,234 ₪', annualBase: null },
      { classification: 'עצמאי', charge: null, annualBase: null },
    ] }];
    const r = run(FX_FULL, record({ annualContributions: fact({ years }) }), ['multi_year_report']);
    const hints = r.hints.occupations ?? [];
    assert(hints.some(h => h.includes('2025') && h.includes('לא עובד')), 'רמז «לא עובד»');
    assert(!hints.some(h => h.includes('«עצמאי»')), 'עצמאי קיים בטבלה');
    assert(r.data.occupations.every(o => o.occupation !== 'לא עובד'), 'רמז — לא הוספת שורה');
  }),

  test('«רשום בב"ל»: חובת תשלום עם הערך הקודם, מצב משפחתי, וחיוב שנתי', () => {
    const rec = recordedBtl(record({
      paymentObligation: fact({ raw: 'חייב בתשלום' }, [{ value: { raw: 'פטור מתשלום' }, since: '2024-01-01T00:00:00Z', until: '2026-01-05T08:00:00Z' }]),
      familyStatus: fact({ raw: 'רווק', code: 'single' }),
      annualContributions: fact({ years: [{ year: 2025, byAssessment: false, total: null, classes: [{ classification: 'עצמאי', charge: '4,100 ₪', annualBase: null }] }] }),
    }));
    equal(rec?.paymentObligation?.value, 'חייב בתשלום');
    equal(rec?.paymentObligation?.previous, 'פטור מתשלום');
    equal(rec?.familyStatus, 'רווק/ה');
    equal(rec?.years?.[0].text, 'עצמאי 4,100 ₪ · טרם שומה');
    equal(rec?.readAt, SEEN);
  }),
  test('«רשום בב"ל»: רשומה ריקה ⇒ אין מקטע', () => {
    equal(recordedBtl(record({})), undefined);
    equal(recordedBtl(undefined), undefined);
  }),
];
