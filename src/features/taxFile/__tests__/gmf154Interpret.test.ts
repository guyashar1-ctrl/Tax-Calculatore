// ─── בדיקות: קריאת מס הכנסה (154 + 134) ⇒ סט השוואה בכרטיס ─────────────────────
// ‼ הצהרת הון ויתרה מ-154; ריצה ישנה (134 בלבד) — הצהרת הון «לא נבדק», לא כשל.
import { test, equal, assert } from '../../../testkit/tinyTest';
import type { TestCase } from '../../../testkit/tinyTest';
import type { Client } from '../../../types';
import type { AutomationJob } from '../../../types/automation';
import { AUTHORITY_AUTOMATION } from '../authorityAutomation';

const spec = AUTHORITY_AUTOMATION.income_tax!;
const KEYS = ['capitalDeclarationRequired', 'capitalDeclarationDeadline', 'incomeTaxBalance', 'taxOfficeName', 'pitAdvancePercent'];
const job = (fields: Record<string, string>): AutomationJob =>
  ({ id: 'j', status: 'succeeded', result: { fields } } as unknown as AutomationJob);
const client = (over: Partial<Client> = {}): Client => ({ firstName: 'א', lastName: 'ב', ...over } as unknown as Client);
const run = (fields: Record<string, string>, c = client()) =>
  new Map(spec.interpret!(job(fields), c, KEYS).map(r => [r.fieldKey, r]));

export const TESTS: TestCase[] = [
  test('דרישה פתוחה ⇒ הצעה «דרישה» + מועד בתצוגה dd.mm.yyyy', () => {
    const r = run({ wealthDemand: 'דרישה עד 31/12/2026 · שנת 2025', wealthDemandDue: '2026-12-31' });
    const req = r.get('capitalDeclarationRequired')!;
    equal(req.status, 'changed');
    equal(req.authorityValue, 'true');
    equal(req.authorityDisplay, 'דרישה עד 31/12/2026 · שנת 2025');
    const due = r.get('capitalDeclarationDeadline')!;
    equal(due.status, 'changed');
    equal(due.authorityValue, '2026-12-31');
    equal(due.authorityDisplay, '31.12.2026');
  }),
  test('דרישה שכבר בתיק ⇒ תואם', () => {
    const r = run({ wealthDemand: 'דרישה עד 31/12/2026 · שנת 2025', wealthDemandDue: '2026-12-31' },
      client({ capitalDeclarationRequired: true, capitalDeclarationDeadline: '2026-12-31' }));
    equal(r.get('capitalDeclarationRequired')!.status, 'match');
    equal(r.get('capitalDeclarationDeadline')!.status, 'match');
  }),
  test('«אין דרישה» ⇒ הצעה «אין דרישה פתוחה»; מועד שנרשם — הצעה לנקות; מועד ריק — ירוק', () => {
    const r = run({ wealthDemand: 'אין דרישה' }, client({ capitalDeclarationRequired: true, capitalDeclarationDeadline: '2026-11-30' }));
    equal(r.get('capitalDeclarationRequired')!.status, 'changed');
    equal(r.get('capitalDeclarationRequired')!.authorityValue, 'false');
    const due = r.get('capitalDeclarationDeadline')!;
    equal(due.status, 'changed');
    equal(due.patchValue, null);
    equal(due.authorityDisplay, 'אין דרישה');
    equal(run({ wealthDemand: 'אין דרישה' }).get('capitalDeclarationDeadline')!.status, 'match');
  }),
  test('טקסט לא מוכר ⇒ לא ממופה ולא מוצע', () => {
    const r = run({ wealthDemand: 'הוגשה · שנת 2024' });
    equal(r.get('capitalDeclarationRequired')!.status, 'failed');
    equal(r.get('capitalDeclarationRequired')!.authorityValue, undefined);
  }),
  test('ריצה ישנה של 134 בלבד ⇒ הצהרת הון «לא נבדק», והיתרה/פקיד השומה כרגיל', () => {
    const r = run({ taxOffice: '26 - רחובות', balance: '4,430' });
    equal(r.get('capitalDeclarationRequired')!.status, 'unsupported');
    equal(r.get('capitalDeclarationDeadline')!.status, 'unsupported');
    equal(r.get('taxOfficeName')!.authorityValue, '26 - רחובות');
    equal(r.get('incomeTaxBalance')!.authorityValue, '4430');
  }),
  test('יתרה מ-154 (חוב פחות זכות, כולל שלילי) ⇒ מספר; בלי מקדמות — 0% בלי 134', () => {
    const r = run({ balance: '-4430', advanceStatus: 'cancelled', advanceStatusRaw: 'בוטלה (שעור דו)', wealthDemand: 'אין דרישה' });
    equal(r.get('incomeTaxBalance')!.authorityValue, '-4430');
    equal(r.get('incomeTaxBalance')!.status, 'changed');
    equal(r.get('pitAdvancePercent')!.authorityValue, '0');
    assert(spec.supportedFieldKeys!.has('capitalDeclarationRequired'), 'נתמך');
  }),
  test('מספר תיק: הקריאה נפתחה לפי המספר שבכרטיס ⇒ ירוק, בלי הצעה', () => {
    const c = client({ taxFiles: [{ id: 't', authority: 'income_tax', owner: 'client', repStatus: 'active', fileNumber: '034605212' }] as Client['taxFiles'] });
    const j = { id: 'j', status: 'succeeded', input: { fileNumber: '034605212' }, result: { fields: {} } } as unknown as AutomationJob;
    const r = spec.interpret!(j, c, ['incomeTaxFileNumber'])[0];
    equal(r.status, 'match');
    equal(r.authorityValue, undefined);
  }),
  test('ייצוג: «מייצג ראשי» ירוק; ראשי אחר ⇒ «מייצג נוסף · ראשי: …»; ריצה ישנה ⇒ לא נבדק', () => {
    const c = client({ taxFiles: [{ id: 't', authority: 'income_tax', owner: 'client', repStatus: 'active', fileNumber: '1' }] as Client['taxFiles'] });
    const read = (fields: Record<string, string>) => spec.interpret!(job(fields), c, ['incomeTaxRepresentation'])[0];
    const me = read({ mainRepresentative: 'ישר גיא', representedByMe: 'yes' });
    equal(me.status, 'match');
    equal(me.authorityDisplay, 'מייצג ראשי');
    equal(me.showOnMatch, true, '«ראשי» כתוב גם כשירוק');
    const other = read({ mainRepresentative: 'כהן דנה', representedByMe: 'no' });
    equal(other.status, 'info');
    equal(other.authorityDisplay, 'מייצג נוסף · ראשי: כהן דנה');
    equal(read({ taxOffice: 'x' }).status, 'unsupported');
  }),
  test('ניכוי מס במקור: כמו בשע״ם — ירוק רק כשתואם, אחרת מידע; לעולם לא הצעה', () => {
    const run2 = (raw: string, status?: Client['withholdingStatus']) => spec.interpret!(
      { id: 'j', status: 'succeeded', result: { fields: {}, filing: { header: { withholdingApproval: raw } } } } as unknown as AutomationJob,
      client({ withholdingStatus: status }), ['withholdingStatus'])[0];
    equal(run2('קיים אישור', 'exempt').status, 'match');
    equal(run2('קיים אישור', 'rates').status, 'match');
    equal(run2('אין אישור', 'none').status, 'match');
    const pending = run2('ממתין לאישור יזום', undefined);
    equal(pending.status, 'info');
    equal(pending.authorityDisplay, 'ממתין לאישור יזום');
    equal(run2('קיים אישור', 'none').status, 'info', 'סותר — מידע, לא הצעה');
  }),
];
