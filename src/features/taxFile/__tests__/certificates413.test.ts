// ─── 297 · אישורים מ-413 בכרטיס מס הכנסה, ובן/בת הזוג הרשום/ה ─────────────────
// השורות «ניכוי מס במקור» / «ניהול ספרים» נשענות על field_meta.<שדה>.cert שהשרת רושם
// (record_authority_certificate); הכפתורים (צפה / הנפק) נגזרים מאותו מקום.

import { test, equal, assert } from '../../../testkit/tinyTest';
import type { TestCase } from '../../../testkit/tinyTest';
import type { Client } from '../../../types';
import type { AutomationJob } from '../../../types/automation';
import { buildAuthorityRows, certificateRatesShort } from '../../../utils/authorityRows';
import { AUTHORITY_AUTOMATION, certificateEntityInput } from '../authorityAutomation';
import { balanceWords } from '../../../utils/balanceWords';

const base = (over: Partial<Client> = {}): Client => ({
  id: 'c1', firstName: 'גיא', lastName: 'ישר', idNumber: '314667346', familyStatus: 'single',
  taxFiles: [{ id: 't', authority: 'income_tax', owner: 'client', repStatus: 'active', fileNumber: '314667346' }],
  ...over,
} as unknown as Client);
const incomeFacts = (c: Client) => buildAuthorityRows(c).find(r => r.authority === 'income_tax')!.facts;
const fact = (c: Client, k: string) => incomeFacts(c).find(f => f.k === k)!;

const certMeta = (cert: Record<string, unknown>) => ({ source: 'automation', cert });

export const TESTS: TestCase[] = [
  test('אישור ניכוי בתוקף ⇒ «5% · עד 31.03.2027» + «צפה»; «פירוט ניכוי» שקט', () => {
    const c = base({
      withholdingStatus: 'rates', withholdingDetail: '5% · שירותים, שכר, שכירות',
      fieldMeta: { withholdingStatus: certMeta({ status: 'valid', validUntil: '2027-03-31', documentId: 'd1',
        rates: [{ section: 'שירותים', rate: 5 }, { section: 'שכר', rate: 5 }, { section: 'שכירות', rate: 5 }] }) },
    } as Partial<Client>);
    const w = fact(c, 'ניכוי מס במקור');
    equal(w.v, '5% · עד 31.03.2027');
    equal(w.tone, 'ok');
    equal(w.certAction?.kind, 'view');
    equal(fact(c, 'פירוט ניכוי').quiet, true);
  }),
  test('אין אישור ⇒ «אין אישור בתוקף» + «הנפק אישורים» פעם אחת (לא גם בניהול ספרים)', () => {
    const c = base({
      withholdingStatus: 'none',
      fieldMeta: {
        withholdingStatus: certMeta({ status: 'none', statusText: 'ממתין לייזום' }),
        bookStatus: certMeta({ status: 'none' }),
      },
    } as Partial<Client>);
    const w = fact(c, 'ניכוי מס במקור');
    equal(w.v, 'אין אישור בתוקף');
    equal(w.certAction?.kind, 'issue');
    const b = fact(c, 'ניהול ספרים');
    equal(b.v, 'אין אישור בתוקף', '«אין אישור» ≠ «נפסל»');
    equal(b.certAction, undefined, 'כפתור אחד בלבד');
  }),
  test('ניהול ספרים בתוקף ⇒ «תקין · עד …» + «צפה»; חסר רק ניהול ספרים ⇒ הכפתור שם', () => {
    const ok = base({ bookStatus: 'kosher', fieldMeta: { bookStatus: certMeta({ status: 'valid', validUntil: '2027-03-31', documentId: 'd2' }) } } as Partial<Client>);
    equal(fact(ok, 'ניהול ספרים').v, 'תקין · עד 31.03.2027');
    equal(fact(ok, 'ניהול ספרים').certAction?.kind, 'view');
    const onlyBooks = base({
      withholdingStatus: 'exempt',
      fieldMeta: {
        withholdingStatus: certMeta({ status: 'valid', validUntil: '2027-03-31', rates: [{ section: 'שירותים', rate: 'exempt' }] }),
        bookStatus: certMeta({ status: 'none' }),
      },
    } as Partial<Client>);
    equal(fact(onlyBooks, 'ניכוי מס במקור').v, 'פטור מלא · עד 31.03.2027');
    equal(fact(onlyBooks, 'ניהול ספרים').certAction?.kind, 'issue');
  }),
  test('עריכה ידנית אחרי האישור (בלי cert) ⇒ התצוגה הרגילה; «נפסל» נשאר «נפסל»', () => {
    equal(fact(base({ withholdingStatus: 'exempt' } as Partial<Client>), 'ניכוי מס במקור').v, 'פטור מניכוי');
    equal(fact(base({ bookStatus: 'rejected', fieldMeta: { bookStatus: certMeta({ status: 'none' }) } } as Partial<Client>), 'ניהול ספרים').v, 'נפסל');
  }),
  test('300 · אין אישור ולא ניתן להנפיק ⇒ ההודעה של שע״ם בשורה, בלי כפתור; הכפתור עובר לניהול ספרים', () => {
    const c = base({
      withholdingStatus: 'none',
      fieldMeta: {
        withholdingStatus: certMeta({ status: 'none', message: 'לא ניתן להנפיק אישור הקטנות - קיים חוב', blocked: true }),
        bookStatus: certMeta({ status: 'none', message: 'ממתין לייזום' }),
      },
    } as Partial<Client>);
    const w = fact(c, 'ניכוי מס במקור');
    equal(w.v, 'אין אישור בתוקף');
    equal((w.sub ?? [])[0], 'שע״ם: לא ניתן להנפיק אישור הקטנות - קיים חוב');
    equal(w.certAction, undefined, 'שע״ם סירבה — אין כפתור');
    const b = fact(c, 'ניהול ספרים');
    equal(b.certAction?.kind, 'issue', 'ניהול ספרים עדיין אפשרי');
    const both = base({ fieldMeta: {
      withholdingStatus: certMeta({ status: 'none', message: 'x', blocked: true }),
      bookStatus: certMeta({ status: 'none', message: 'לא ניתן להנפיק אישור גופים - לא קיים תיק מע״מ', blocked: true }),
    } } as Partial<Client>);
    equal(fact(both, 'ניהול ספרים').certAction, undefined);
    equal((fact(both, 'ניהול ספרים').sub ?? [])[0], 'שע״ם: לא ניתן להנפיק אישור גופים - לא קיים תיק מע״מ');
  }),
  test('יתרה במילים: לתשלום / לזכות הלקוח / אין יתרה — גם בכרטיס מס הכנסה', () => {
    equal(balanceWords(17176)!.text, 'לתשלום 17,176 ₪');
    equal(balanceWords(-17176)!.text, 'לזכות הלקוח 17,176 ₪');
    equal(balanceWords(0)!.text, 'אין יתרה');
    equal(fact(base({ incomeTaxBalance: -17176 } as Partial<Client>), 'יתרה').v, 'לזכות הלקוח 17,176 ₪');
    equal(fact(base({ incomeTaxBalance: 500 } as Partial<Client>), 'יתרה').tone, 'warn');
  }),
  test('שיעורים שונים — כל סעיף בשמו', () => {
    equal(certificateRatesShort({ status: 'valid', rates: [{ section: 'שירותים', rate: 5 }, { section: 'שכר', rate: 10 }] }), '5% שירותים · 10% שכר');
  }),
  test('בעל העסק ל-413 = מספר העוסק, לא מספר תיק מס הכנסה; בלי עסק — חסום', () => {
    const couple = base({
      taxFiles: [
        { id: 'i', authority: 'income_tax', owner: 'spouse', repStatus: 'active', fileNumber: '209422500' },
        { id: 'v', authority: 'vat', owner: 'client', repStatus: 'active', fileNumber: '314667346' },
      ],
    } as Partial<Client>);
    const r = certificateEntityInput(couple);
    equal('certEntity' in r ? r.certEntity : '', '314667346');
    const input = AUTHORITY_AUTOMATION.income_tax!.buildInput!(couple);
    equal((input as { input: Record<string, unknown> }).input.certEntity, '314667346');
    equal((input as { input: Record<string, unknown> }).input.fileNumber, '209422500');
    equal((input as { input: Record<string, unknown> }).input.issueMissing, true, 'מהכפתור — מנפיק מה שחסר');
    assert('blocked' in certificateEntityInput(base({ taxFiles: [] } as Partial<Client>)), 'שכיר — אין אישורים');
  }),
  test('«מספר תיק» בזוג: רשום על בן/בת הזוג — שם ות.ז. מתחת', () => {
    const c = base({
      familyStatus: 'married', spouseFirstName: 'דין', spouseLastName: 'וולוצקי ישר', spouseIdNumber: '209422500',
      registeredSpouseVerified: true,
      taxFiles: [{ id: 'i', authority: 'income_tax', owner: 'spouse', repStatus: 'active', fileNumber: '209422500' }],
    } as Partial<Client>);
    const sub = fact(c, 'מספר תיק').sub ?? [];
    assert(sub.length === 1 && sub[0].startsWith('רשום על דין') && sub[0].includes('209422500'), sub.join('|'));
    const unverified = base({ ...c, registeredSpouseVerified: false } as Partial<Client>);
    equal(fact(unverified, 'מספר תיק').sub, undefined, 'בלי הכרעה — לא מנחשים');
  }),
  test('בדיקת התיק: ניהול ספרים מ-413 — בתוקף ⇒ ירוק; אין ⇒ מידע עם ההודעה', () => {
    const mk = (bookkeeping: Record<string, unknown>) => ({ id: 'j', status: 'succeeded', input: { fileNumber: '1' },
      result: { fields: {}, certificates: { bookkeeping } } }) as unknown as AutomationJob;
    const read = (bk: Record<string, unknown>) => AUTHORITY_AUTOMATION.income_tax!.interpret!(mk(bk), base({ bookStatus: 'kosher' } as Partial<Client>), ['bookStatus'])[0];
    const ok = read({ ok: true, status: 'valid', validUntil: '2027-03-31' });
    equal(ok.status, 'match');
    equal(ok.authorityDisplay, 'תקין · עד 31.03.2027');
    const none = read({ ok: true, status: 'none', message: 'לא ניתן להנפיק אישור גופים - לא קיים תיק מע״מ' });
    equal(none.status, 'info');
    equal(none.authorityDisplay, 'לא ניתן להנפיק אישור גופים - לא קיים תיק מע״מ');
  }),
  test('אישור שהונפק אחרי הקריאה ⇒ תואם, בלי «ממתין לאישור יזום» הישן', () => {
    const job = { id: 'j', status: 'succeeded', finishedAt: '2026-10-25T22:23:17Z', input: { fileNumber: '1' },
      result: { fields: {}, certificates: { bookkeeping: { ok: true, status: 'none', statusText: 'ממתין לאישור יזום' } } } } as unknown as AutomationJob;
    const c = base({ bookStatus: 'kosher', fieldMeta: { bookStatus: certMeta({ status: 'valid', checkedAt: '2026-10-25T22:25:39Z' }) } } as Partial<Client>);
    const r = AUTHORITY_AUTOMATION.income_tax!.interpret!(job, c, ['bookStatus'])[0];
    equal(r.status, 'match');
    equal(r.authorityDisplay, undefined);
  }),
  test('בדיקת התיק: 413 גובר על kodIsur של 154 ומוצג תואם', () => {
    const job = { id: 'j', status: 'succeeded', input: { fileNumber: '1' },
      result: { fields: {}, filing: { header: { withholdingApproval: 'ממתין לאישור יזום' } },
        certificates: { withholding: { ok: true, status: 'valid', ratesText: '5% · שירותים', validUntil: '2027-03-31' } } } } as unknown as AutomationJob;
    const r = AUTHORITY_AUTOMATION.income_tax!.interpret!(job, base({ withholdingStatus: 'rates' } as Partial<Client>), ['withholdingStatus'])[0];
    equal(r.status, 'match');
    equal(r.authorityDisplay, '5% · שירותים · עד 31.03.2027');
  }),
];
