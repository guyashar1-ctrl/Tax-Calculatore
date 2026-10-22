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
  test('«אין דרישה» ⇒ הצעה «אין דרישה פתוחה»; המועד שנרשם ביד לא נמחק', () => {
    const r = run({ wealthDemand: 'אין דרישה' }, client({ capitalDeclarationRequired: true, capitalDeclarationDeadline: '2026-11-30' }));
    equal(r.get('capitalDeclarationRequired')!.status, 'changed');
    equal(r.get('capitalDeclarationRequired')!.authorityValue, 'false');
    equal(r.get('capitalDeclarationDeadline')!.status, 'info');
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
];
