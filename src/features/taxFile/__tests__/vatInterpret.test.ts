// ─── בדיקות: קריאת «פרטי עוסק» במע״מ ⇒ סט השוואה בכרטיס ──────────────────────
// ‼ הקלטים הם הטקסטים שנצפו חי בשע״ם (25.10.2026, חמישה עוסקים מיוצגים).
import { test, equal } from '../../../testkit/tinyTest';
import type { TestCase } from '../../../testkit/tinyTest';
import type { Client } from '../../../types';
import type { AutomationJob } from '../../../types/automation';
import { AUTHORITY_AUTOMATION, VAT_FIELD_SOURCES, VAT_READ_ONLY_KEYS, vatOsekInput } from '../authorityAutomation';

const spec = AUTHORITY_AUTOMATION.vat!;
const KEYS = Object.keys(VAT_FIELD_SOURCES);
const RO = [...VAT_READ_ONLY_KEYS] as string[];
const job = (fields: Record<string, string>): AutomationJob =>
  ({ id: 'j', status: 'succeeded', result: { fields } } as unknown as AutomationJob);
const client = (over: Partial<Client> = {}): Client => ({ firstName: 'א', lastName: 'ב', ...over } as unknown as Client);
const run = (fields: Record<string, string>, c = client()) =>
  new Map(spec.interpret!(job(fields), c, KEYS).map(r => [r.fieldKey, r]));

const LICENSED = {
  fileType: '52 - עוסק מורשה,נמנה על', openingDate: '12/05/2026', primaryIndustry: '6921 - ראיית חשבון',
  reportingFrequency: 'דו חודשי', lastReport: '08/2026', debitAuthorization: 'קיימת הרשאה פעילה-מאומתת',
  balanceTotal: '0', balanceDebit: '0', balanceCredit: '0',
};

export const TESTS: TestCase[] = [
  test('מספר עוסק שנפתח = המספר בכרטיס ⇒ ירוק; ייצוג ראשי של המחובר ⇒ ירוק', () => {
    const c = client({ taxFiles: [{ id: '1', authority: 'vat', fileNumber: '314667346', owner: 'client', repStatus: 'active' }] } as Partial<Client>);
    const j = { id: 'j', status: 'succeeded', input: { osekNumber: '314667346' },
      result: { fields: { ...LICENSED, mainRepresentative: 'ישר גיא', representedByMe: 'yes' } } } as unknown as AutomationJob;
    const r = new Map(spec.interpret!(j, c, RO).map(x => [x.fieldKey, x]));
    equal(r.get('vatFileNumber')!.status, 'match');
    equal(r.get('vatRepresentation')!.status, 'match');
    equal(r.get('vatRepresentation')!.authorityDisplay, 'מייצג ראשי');
  }),
  test('מייצג ראשי אחר ⇒ «מייצג נוסף» כשורת מידע, בלי הצעה', () => {
    const c = client({ taxFiles: [{ id: '1', authority: 'vat', fileNumber: '209132901', owner: 'client', repStatus: 'active' }] } as Partial<Client>);
    const j = { id: 'j', status: 'succeeded', input: { osekNumber: '209132901' },
      result: { fields: { ...LICENSED, mainRepresentative: 'כהן דנה', representedByMe: 'no' } } } as unknown as AutomationJob;
    const rep = spec.interpret!(j, c, RO).find(x => x.fieldKey === 'vatRepresentation')!;
    equal(rep.status, 'info');
    equal(rep.authorityDisplay, 'מייצג נוסף · ראשי: כהן דנה');
  }),
  test('עוסק מורשה, כרטיס ריק ⇒ הצעה לכל שבעת השדות בערכי PIVO', () => {
    const r = run(LICENSED);
    equal(r.get('vatFileType')!.authorityValue, 'עוסק מורשה');
    equal(r.get('vatFileType')!.authorityDisplay, '52 - עוסק מורשה,נמנה על');
    equal(r.get('vatOpeningDate')!.authorityValue, '2026-05-12');
    equal(r.get('vatPrimaryIndustry')!.authorityValue, '6921 - ראיית חשבון');
    equal(r.get('vatFrequency')!.authorityValue, 'bi_monthly');
    equal(r.get('vatLastReportPeriod')!.authorityValue, '08/2026');
    equal(r.get('vatBalance')!.authorityValue, '0');
    equal(r.get('vatDebitAuthorization')!.authorityValue, 'true');
    for (const f of r.values()) equal(f.status, 'changed', f.fieldKey);
  }),
  test('כרטיס שכבר תואם ⇒ ירוק בכל השדות (כולל יתרה 0 ותאריך)', () => {
    const r = run(LICENSED, client({
      vatFileType: 'עוסק מורשה', vatOpeningDate: '2026-05-12', vatPrimaryIndustry: '6921 - ראיית חשבון',
      vatFrequency: 'bi_monthly', vatLastReportPeriod: '08/2026', vatBalance: 0, vatDebitAuthorization: true,
    }));
    for (const f of r.values()) equal(f.status, 'match', f.fieldKey);
  }),
  test('«לא חייב» ⇒ ניקוי התדירות; «לא קיימת הרשאה פעילה» ⇒ אין הרשאה', () => {
    const r = run({ ...LICENSED, reportingFrequency: 'לא חייב', debitAuthorization: 'לא קיימת הרשאה פעילה' },
      client({ vatFrequency: 'monthly', vatDebitAuthorization: true }));
    const freq = r.get('vatFrequency')!;
    equal(freq.status, 'changed');
    equal(freq.patchValue, null);
    equal(r.get('vatDebitAuthorization')!.authorityValue, 'false');
    equal(run({ ...LICENSED, reportingFrequency: 'לא חייב' }).get('vatFrequency')!.status, 'match');
  }),
  test('עוסק פטור בכרטיס שבשע״ם רשום מורשה ⇒ הצעה, לא תואם', () => {
    const r = run({ ...LICENSED, fileType: '48 - עוסק מורשה' }, client({ vatFileType: 'עוסק פטור' }));
    equal(r.get('vatFileType')!.status, 'changed');
    equal(r.get('vatFileType')!.authorityValue, 'עוסק מורשה');
  }),
  test('יתרה: חוב פחות זכות, מאומת מול «סך יתרה»; סתירה ⇒ לא מוצע', () => {
    const debt = run({ ...LICENSED, balanceDebit: '1,250', balanceCredit: '0', balanceTotal: '1,250' }).get('vatBalance')!;
    equal(debt.authorityValue, '1250');
    const credit = run({ ...LICENSED, balanceDebit: '0', balanceCredit: '300', balanceTotal: '-300' }).get('vatBalance')!;
    equal(credit.authorityValue, '-300');
    const odd = run({ ...LICENSED, balanceDebit: '100', balanceCredit: '0', balanceTotal: '700' }).get('vatBalance')!;
    equal(odd.status, 'failed');
  }),
  test('טקסט לא מוכר / שדה חסר ⇒ «לא נקרא», בלי הצעה', () => {
    const r = run({ ...LICENSED, reportingFrequency: 'שנתי', fileType: '99 - משהו אחר', lastReport: '' });
    equal(r.get('vatFrequency')!.status, 'failed');
    equal(r.get('vatFrequency')!.authorityValue, undefined);
    equal(r.get('vatFileType')!.status, 'failed');
    equal(r.get('vatLastReportPeriod')!.status, 'failed');
  }),
  test('מספר עוסק: מהתיק; בלעדיו ת.ז. לעוסק יחיד; לחברה — חסום', () => {
    equal(JSON.stringify(vatOsekInput(client({ taxFiles: [{ id: '1', authority: 'vat', fileNumber: '314-667-346', owner: 'client', repStatus: 'active' }] } as Partial<Client>))),
      JSON.stringify({ osekNumber: '314667346' }));
    equal(JSON.stringify(vatOsekInput(client({ dealerType: 'licensed', idNumber: '209132901' } as Partial<Client>))),
      JSON.stringify({ osekNumber: '209132901' }));
    equal('blocked' in vatOsekInput(client({ dealerType: 'company', idNumber: '209132901' } as Partial<Client>)), true);
  }),
];
