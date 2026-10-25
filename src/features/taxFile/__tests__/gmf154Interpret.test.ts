// ─── בדיקות: קריאת מס הכנסה (154 + 134) ⇒ סט השוואה בכרטיס ─────────────────────
// ‼ הצהרת הון ויתרה מ-154; ריצה ישנה (134 בלבד) — הצהרת הון «לא נבדק», לא כשל.
import { test, equal, assert } from '../../../testkit/tinyTest';
import type { TestCase } from '../../../testkit/tinyTest';
import type { Client } from '../../../types';
import type { AutomationJob } from '../../../types/automation';
import { AUTHORITY_AUTOMATION } from '../authorityAutomation';
import { reportingStatusOk } from '../../../utils/reportingStatus';
import { buildAuthorityRows } from '../../../utils/authorityRows';

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
    equal(due.authorityDisplay, 'אין דרישה פתוחה');
    equal(run({ wealthDemand: 'אין דרישה' }).get('capitalDeclarationDeadline')!.status, 'match');
  }),
  test('«הענות» (הוגשה) ⇒ אין דרישה פתוחה, תאריך ההגשה מתחת לשדה, ואינו מועד', () => {
    // ‼ כך בדיוק החזיר העובד ב-25.10.2026: התאריך של ההגשה גם ב-wealthDemandDue.
    const read = { wealthDemand: 'הענות 22/07/2020 · שנת 2019', wealthDemandDue: '2020-07-22' };
    const r = run(read, client({ capitalDeclarationDeadline: '2020-07-22' }));
    const req = r.get('capitalDeclarationRequired')!;
    equal(req.status, 'changed');
    equal(req.authorityValue, 'false');
    equal(req.authorityDisplay, 'אין דרישה פתוחה · הוגשה 22.07.2020 · לשנת 2019');
    const due = r.get('capitalDeclarationDeadline')!;
    equal(due.status, 'changed', 'מועד שנרשם בטעות ⇒ הצעה לנקות');
    equal(due.patchValue, null);
    equal(due.provenance, undefined, 'לא ראיה של המקדמות');
    const ok = run(read, client({ capitalDeclarationRequired: false }));
    equal(ok.get('capitalDeclarationRequired')!.status, 'match');
    equal(ok.get('capitalDeclarationRequired')!.showOnMatch, true, 'מתי הוגשה — גם כשירוק');
    equal(ok.get('capitalDeclarationDeadline')!.status, 'match');
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
  test('מצב דיווחים = התראה: הצעה רק כשחסר דיווח, או לנקות חוסר שהושלם; «תקין»/«אין מקדמות» ⇒ תואם בלי לכתוב', () => {
    const read = (fields: Record<string, string>, c = client()) => spec.interpret!(job(fields), c, ['incomeTaxReportingStatus'])[0];
    equal(read({ advanceStatus: 'cancelled', advanceStatusRaw: 'בוטלה (שעור דו)' }).status, 'match', 'אין מקדמות ⇒ שקט');
    equal(read({ advanceStatus: 'active', reportingStatus: 'אין דיווחים חסרים' }).status, 'match', 'הכול תקין ⇒ שקט');
    equal(read({ advanceStatus: 'active' }).status, 'info', 'מקדמות פעילות בלי 134 ⇒ ניטרלי');
    const missing = read({ advanceStatus: 'active', reportingStatus: 'חסר דיווח: 07-08/2026' });
    equal(missing.status, 'changed');
    equal(missing.authorityValue, 'חסר דיווח: 07-08/2026');
    equal(read({ advanceStatus: 'active', reportingStatus: 'חסר דיווח: 07-08/2026' }, client({ incomeTaxReportingStatus: 'חסר דיווח: 07-08/2026' })).status, 'match');
    const filled = read({ advanceStatus: 'active', reportingStatus: 'אין דיווחים חסרים' }, client({ incomeTaxReportingStatus: 'חסר דיווח: 07-08/2026' }));
    equal(filled.status, 'changed', 'חוסר שהושלם ⇒ הצעה לנקות');
    equal(filled.patchValue, null);
    // ‼ 23.10: 134 על תיק שהמקדמות בו בוטלו אמר «אין דיווחים חסרים» — «אין מקדמות» גובר, ושניהם תקינים.
    equal(read({ advanceStatus: 'cancelled', reportingStatus: 'חסר דיווח: 01-02/2026' }).status, 'match');
  }),
  test('כרטיס: «מצב דיווחים» שקט כשתקין/ריק וכתום כשחסר; «תדירות» שקטה כשאין מקדמות', () => {
    const facts = (over: Partial<Client>) => buildAuthorityRows(client(over)).find(r => r.authority === 'income_tax')!.facts;
    const rep = (over: Partial<Client>) => facts(over).find(f => f.k === 'מצב דיווחים')!;
    equal(rep({ incomeTaxReportingStatus: 'אין דיווחים חסרים' }).quiet, true);
    equal(rep({ incomeTaxReportingStatus: 'אין מקדמות' }).quiet, true);
    equal(rep({}).quiet, true, 'ריק ⇒ שקט, אבל נשאר בהשוואה');
    const miss = rep({ incomeTaxReportingStatus: 'חסר דיווח: 07-08/2026' });
    equal(miss.quiet, undefined);
    equal(miss.tone, 'warn');
    const freq = (over: Partial<Client>) => facts(over).find(f => f.k === 'תדירות מקדמות')!;
    equal(freq({ pitAdvancePercent: 0 }).quiet, true, 'אין מקדמות ⇒ רק «שיעור מקדמות: אין מקדמות»');
    equal(freq({ pitAdvancePercent: 15, pitAdvanceFrequency: 'bi_monthly' }).quiet, undefined);
  }),
  test('«אין מקדמות» אינו חוסר — לא דגל ולא כתום', () => {
    assert(reportingStatusOk('אין מקדמות'), 'אין מקדמות');
    assert(reportingStatusOk(' אין דיווחים חסרים '), 'אין דיווחים חסרים');
    assert(!reportingStatusOk('חסר דיווח 07-08/2026'), 'חסר');
    assert(!reportingStatusOk(''), 'ריק');
  }),
  test('הרשאה לחיוב מ«רשימת מיוצגים»: קיימת/אין ⇒ הצעה; בלי הרשימה ⇒ לא נבדק', () => {
    const read = (fields: Record<string, string>, c = client()) => spec.interpret!(job(fields), c, ['incomeTaxDebitAuthorization'])[0];
    const yes = read({ debitAuthorization: 'קיימת · 12-170-48047' });
    equal(yes.status, 'changed');
    equal(yes.authorityValue, 'true');
    equal(yes.authorityDisplay, 'בנק הפועלים · סניף 170 · חשבון 48047');
    const known = read({ debitAuthorization: 'קיימת · 18-1-223167724' }, client({ incomeTaxDebitAuthorization: true }));
    equal(known.status, 'match');
    equal(known.showOnMatch, true, 'הבנק כתוב מתחת לשדה גם כשירוק');
    equal(known.authorityDisplay, 'One Zero — הבנק הדיגיטלי · סניף 1 · חשבון 223167724');
    equal(read({ debitAuthorization: 'קיימת · 99-5-1' }).authorityDisplay, 'בנק 99 · סניף 5 · חשבון 1', 'קוד לא מוכר — המספר');
    equal(read({ debitAuthorization: 'אין הרשאה' }, client({ incomeTaxDebitAuthorization: false })).status, 'match');
    // 181 «קיום הרשאה» (נצפה 25.10.2026): «יש הרשאה - מאומתת» / «אין הרשאה».
    equal(read({ debitAuthorization: 'יש הרשאה - מאומתת' }, client({ incomeTaxDebitAuthorization: true })).status, 'match');
    const no181 = read({ debitAuthorization: 'אין הרשאה' }, client({ incomeTaxDebitAuthorization: true }));
    equal(no181.status, 'changed');
    equal(no181.authorityValue, 'false');
    equal(read({ taxOffice: 'x' }).status, 'unsupported', 'מערכת הייצוג לא הייתה מחוברת');
    const skipped = (reason: string) => spec.interpret!(
      { id: 'j', status: 'succeeded', result: { fields: { taxOffice: 'x' }, unavailable: [{ key: 'representedList', reason }] } } as unknown as AutomationJob,
      client(), ['incomeTaxDebitAuthorization'])[0];
    equal(skipped('representation_not_connected').skippedReason, 'לא נבדק — פורטל המייצגים לא היה מחובר', '«—» לא נקרא «אין הרשאה»');
    equal(skipped('filters_active').skippedReason, 'לא נבדק — רשימת המיוצגים לא נקראה');
    equal(read({ taxOffice: 'x' }).skippedReason, undefined, 'ריצה ישנה בלי סיבה — בלי שורה');
  }),
  test('ייצוג: «ראשי»/«נוסף» מ«רשימת מיוצגים» גוברים על ההסקה', () => {
    const c = client({ taxFiles: [{ id: 't', authority: 'income_tax', owner: 'client', repStatus: 'active', fileNumber: '1' }] as Client['taxFiles'] });
    const read = (fields: Record<string, string>) => spec.interpret!(job(fields), c, ['incomeTaxRepresentation'])[0];
    const extra = read({ repType: 'נוסף', mainRepresentative: 'כהן דנה', representedByMe: 'no' });
    equal(extra.status, 'match');
    equal(extra.authorityDisplay, 'מייצג נוסף · ראשי: כהן דנה');
    equal(read({ repType: 'ראשי' }).authorityDisplay, 'מייצג ראשי');
  }),
];
