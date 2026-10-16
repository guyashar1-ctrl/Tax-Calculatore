// תרחישים נתמכים מקצה לקצה על תיק מלא: «גיליון עבודה מלא» רק כשכל שדה ונספח רלוונטי מופק; קובץ לפי מבנה
// רשות המסים 2025 שנבנה ונקרא בחזרה זהה. ותרחישים שאינם נתמכים: נשארים «חלקי» גם עם השלמה מקצועית.
import { test, equal, assert } from '../../../testkit/tinyTest';
import type { TestCase } from '../../../testkit/tinyTest';
import type { Client } from '../../../types';
import { computeReturn } from '../engine';
import { buildFile1301, parseFile1301, verifyFile1301 } from '../file1301';
import { returnHtml, fileFromHtml, verifyReopened } from '../output';
import { baseCard, booksFor, draft, fact, filingFacts } from './fixtures';

const field = (o: ReturnType<typeof computeReturn>, code: string, person?: string) => o.fields.find(f => f.code === code && (person == null || f.person === person))?.amount;
const why = (o: ReturnType<typeof computeReturn>) => [...o.blockers.map(b => `חסר: ${b.text}`), ...o.unsupported.map(u => `לא מופק: ${u.text}`)].join(' | ');
const fileOk = (o: ReturnType<typeof computeReturn>, client: Client, d = draft()) => {
  const f = buildFile1301(o, { client, draft: d, savedOn: '2026-03-01' });
  const issues = verifyFile1301(f);
  return { f, issues, back: parseFile1301(f.text) };
};
const BIZ = { id: 'bz1', name: 'ייעוץ דוד', kind: 'osek_morshe', address: { street: 'הרצל', houseNumber: '10', city: 'תל אביב' } };
const SPOUSE = { firstName: 'רות', lastName: 'כהן', idNumber: '234567891', gender: 'female', birthDate: '1987-02-02', grossSalary: 0, selfEmployedGrossIncome: 0, recognizedExpenses: 0, selfEmployedPensionAmount: 0, krenHashtalmutSE: 0, employeePensionPct: 0 };

export const TESTS: TestCase[] = [
  test('עצמאי עם ספרים, פנסיה, קרן השתלמות, ב״ל ומקדמות ⇒ גיליון מלא; 135 = כל ההפקדה; קובץ 1301 נבנה ונקרא בחזרה זהה', () => {
    const client = baseCard({ businesses: [BIZ] } as unknown as Partial<Client>);
    const facts = [fact('business.profit', 'client', { profit: 300_000, turnover: 400_000 }, { entityRef: 'bz1' }), fact('payments.niPaid', 'client', 40_000), fact('payments.advances', 'client', 50_000),
      fact('savings.selfAmounts', 'client', { pension: 20_000, studyFund: 10_000 }), ...filingFacts({ extraDecl: { X6111: false } })];
    const d = draft({ books: { bz1: booksFor(400_000, 300_000) } });
    const o = computeReturn({ client, draft: d, facts, evidence: [] });
    equal(o.status, 'completeWorksheet', why(o));
    equal(field(o, '150'), 300_000); equal(field(o, '135'), 20_000); equal(field(o, '136'), 10_000); equal(field(o, '030'), 40_000);
    assert(o.formCoverage.counts.missing === 0 && o.formCoverage.counts.notSupported === 0, JSON.stringify(o.formCoverage.counts));
    assert(o.annex1320?.[0].complete && o.annex1320[0].lines['22'] === 300_000, 'נספח 1320 מלא, שורה 22 = 150');
    const { f, issues, back } = fileOk(o, client, d);
    equal(issues.length, 0, issues.join(' | '));
    equal(f.records[0].length, 4232); equal(f.records[1].length, 150);
    equal(back.header[4], '123456782'); equal(back.header[5], '2025'); equal(back.header[10], '123456782'); equal(back.header[11], 'כהן'); equal(back.header[13], 'משה');
    equal(back.header[101], '50000'); equal(back.header[21], 'הרצל 10, תל אביב'); equal(back.header[20], 'ייעוץ דוד');
    for (const [c, v] of [['150', '300000'], ['135', '20000'], ['136', '10000'], ['030', '40000'], ['238', '400000'], ['020', '1'], ['280', '1'], ['278', '12345']]) equal(back.codes.find(x => x.code === c)?.value, v, `קוד ${c}`);
    equal(back.header[8], '6', 'מחזור מעל הסף, לא חייב ב-6111');
    // מחזור מעל הסף ו«חייב ב-6111» — 6111 לא מופק ⇒ גיליון חלקי
    const o6111 = computeReturn({ client, draft: d, facts: facts.map(x => x.itemKey === 'filing.declarations' ? { ...x, value: { ...(x.value as object), X6111: true } } : x), evidence: [] });
    equal(o6111.status, 'partialWorksheet'); assert(o6111.unsupported.some(u => /6111/.test(u.text)), why(o6111));
  }),
  test('שכיר-עצמאי (מסלול ב׳): 244/045/248 מ-106, 135 = כל ההפקדה; גיליון מלא; הקובץ תקין', () => {
    const client = baseCard({ businesses: [BIZ], employers: [{ id: 'em1', name: 'חברת הייטק' }] } as unknown as Partial<Client>);
    const facts = [fact('salary.amounts', 'client', { gross: 120_000, withheld: 15_000, insured: 120_000, employeePension: 7_200, employerDeposits: 15_000 }, { entityRef: 'em1' }),
      fact('business.profit', 'client', { profit: 150_000, turnover: 200_000 }, { entityRef: 'bz1' }), fact('payments.niPaid', 'client', 12_000), fact('savings.selfAmounts', 'client', { pension: 20_000 }), ...filingFacts()];
    const d = draft({ books: { bz1: booksFor(200_000, 150_000) } });
    const o = computeReturn({ client, draft: d, facts, evidence: [] });
    equal(o.status, 'completeWorksheet', why(o));
    equal(field(o, '135'), 20_000); equal(field(o, '244'), 120_000); equal(field(o, '045'), 7_200); equal(field(o, '248'), 15_000); equal(field(o, '158'), 120_000); equal(field(o, '042'), 15_000);
    const p = o.persons[0].pension!;
    equal(p.track, 'B'); equal(p.deduction, 12_311); equal(p.creditBase, 5_820);
    equal(fileOk(o, client, d).issues.length, 0, fileOk(o, client, d).issues.join(' | '));
  }),
  test('בני זוג: עסק אצל בן הזוג הרשום, משכורת אצל בת הזוג — 150 ו-172, פרטי בת הזוג בכותרת; גיליון מלא', () => {
    // ‼ 16.10.2026: נשואים בשנת הדוח — לפי שנת הנישואין (בלי שנה: «מצב משפחתי ב-2025 לא ידוע», והדוח טיוטה)
    const client = baseCard({ familyStatus: 'married', marriageYear: 2012, businesses: [BIZ], employers: [{ id: 'em2', name: 'משרד החינוך', belongsToSpouse: true }], spouse: SPOUSE,
      spouseFirstName: 'רות', spouseLastName: 'כהן', spouseIdNumber: '234567891' } as unknown as Partial<Client>);
    const facts = [fact('business.profit', 'client', { profit: 200_000, turnover: 260_000 }, { entityRef: 'bz1' }), fact('payments.niPaid', 'client', 15_000),
      fact('salary.amounts', 'spouse', { gross: 150_000, withheld: 18_000 }, { entityRef: 'em2' }), ...filingFacts({ married: true, extraDecl: { X6111: false } })];
    const d = draft({ persons: ['client', 'spouse'], books: { bz1: booksFor(260_000, 200_000) } });
    const o = computeReturn({ client, draft: d, facts, evidence: [] });
    equal(o.status, 'completeWorksheet', why(o));
    equal(field(o, '150'), 200_000); equal(field(o, '172'), 150_000);
    const { issues, back } = fileOk(o, client, d);
    equal(issues.length, 0, issues.join(' | '));
    equal(back.header[25], '234567891'); equal(back.header[62], '1'); equal(back.header[57], '2'); equal(back.header[92], '18000');
  }),
  test('כמה מקורות: משכורת, שכ״ד פטור, ריבית ודיבידנד (הכרעה), תרומה ⇒ גיליון מלא; בלי הכרעה — טיוטה', () => {
    const client = baseCard({ employers: [{ id: 'em1', name: 'חברה' }], properties: [{ id: 'p1', address: 'הרצל 1', isRented: true, rentalTaxTrack: 'exempt' }], investmentAccounts: [{ id: 'a1', institutionName: 'בנק' }] } as unknown as Partial<Client>);
    const facts = [fact('salary.amounts', 'client', { gross: 120_000, withheld: 9_000 }, { entityRef: 'em1' }), fact('rent.income', 'couple', 50_000, { entityRef: 'p1' }),
      fact('capital.amounts', 'couple', { interest: 10_000, dividend: 5_000, withheld: 3_750 }, { entityRef: 'a1' }), fact('donations.given', 'client', true), fact('donations.amount', 'client', 2_000),
      ...filingFacts({ except: ['donations.given'] })];
    const without = computeReturn({ client, draft: draft(), facts, evidence: [] });
    equal(without.status, 'internalDraft');
    const o = computeReturn({ client, draft: draft({ decisions: [{ key: 'capital.rates', text: 'לא בעל מניות מהותי' }] }), facts, evidence: [] });
    equal(o.status, 'completeWorksheet', why(o));
    equal(field(o, '332'), 50_000); equal(field(o, '242'), 10_000); equal(field(o, '037'), 2_000);
    equal(fileOk(o, client).issues.length, 0, fileOk(o, client).issues.join(' | '));
  }),
  test('עסק זעיר (30%): בלי 1320 ובלי 030; קוד 255 = 441 בקובץ; גיליון מלא', () => {
    const client = baseCard({ businesses: [BIZ] } as unknown as Partial<Client>);
    const facts = [fact('business.profit', 'client', { profit: 60_000, turnover: 100_000 }, { entityRef: 'bz1' }), fact('payments.niPaid', 'client', 6_000), ...filingFacts()];
    const d = draft({ micro: { bz1: { track: 'micro', registeredAtYearStart: true, reporting: 'full' } } });
    const o = computeReturn({ client, draft: d, facts, evidence: [] });
    equal(o.status, 'completeWorksheet', why(o));
    equal(field(o, '150'), 70_000); equal(field(o, '030'), undefined);
    const { issues, back } = fileOk(o, client, d);
    equal(issues.length, 0, issues.join(' | '));
    equal(back.codes.find(c => c.code === '255')?.value, '441');
  }),
  test('שכ״ד 10% עם נספח 1321 (דירה יחידה, שכ״ד למגורים, גוש/חלקה) ⇒ גיליון מלא; 284 = נטו; בלי הפרטים — טיוטה', () => {
    const client = baseCard({ employers: [{ id: 'em1', name: 'חברה' }], properties: [{ id: 'p1', address: 'הרצל 1', city: 'חיפה', isRented: true, rentalTaxTrack: 'flat10' }] } as unknown as Partial<Client>);
    const facts = [fact('salary.amounts', 'client', { gross: 100_000, withheld: 8_000 }, { entityRef: 'em1' }), fact('rent.income', 'couple', 48_000, { entityRef: 'p1' }), ...filingFacts()];
    const bare = computeReturn({ client, draft: draft(), facts, evidence: [] });
    equal(bare.status, 'internalDraft'); assert(bare.blockers.some(b => /נספח 1321.*גוש וחלקה/.test(b.text)), why(bare));
    const d = draft({ rent1321: { singleApartment: true, ownHousingRent: 30_000, props: { p1: { block: '10234', parcel: '56' } } } });
    const o = computeReturn({ client, draft: d, facts, evidence: [] });
    equal(o.status, 'completeWorksheet', why(o));
    equal(field(o, '284'), 18_000); equal(o.annex1321?.net, 18_000);
    equal(fileOk(o, client, d).issues.length, 0);
  }),
  test('לא נתמך ⇒ «גיליון עבודה חלקי»: שכ״ד במסלול הרגיל (1321 + פחת), חו״ל, פחת בעסק (1342), 6111; השלמה מקצועית לא סוגרת', () => {
    const client = baseCard({ employers: [{ id: 'em1', name: 'חברה' }], properties: [{ id: 'p1', address: 'הרצל 1', isRented: true, rentalTaxTrack: 'regular' }] } as unknown as Partial<Client>);
    const facts = [fact('salary.amounts', 'client', { gross: 100_000, withheld: 8_000 }, { entityRef: 'em1' }), fact('rent.income', 'couple', 48_000, { entityRef: 'p1' }), ...filingFacts()];
    const o = computeReturn({ client, draft: draft(), facts, evidence: [] });
    equal(o.status, 'partialWorksheet', why(o));
    assert(o.unsupported.some(u => /1321|מסלול הרגיל/.test(u.text)), why(o));
    // חו״ל — שאלת פתיחה «כן»; השלמה מקצועית לפער מסוג נספח אינה נכנסת
    const facts2 = [fact('salary.amounts', 'client', { gross: 100_000, withheld: 8_000 }, { entityRef: 'em1' }), fact('foreign.income', 'couple', true), ...filingFacts({ except: ['foreign.income'] })];
    const c2 = baseCard({ employers: [{ id: 'em1', name: 'חברה' }] } as unknown as Partial<Client>);
    const comp = { id: 'k1', gap: 'foreign', person: 'client' as const, fields: [], taxAmount: 3_000, justification: 'חישוב ידני של הכנסות חו״ל', approvedAt: '2026-03-02' };
    const o2 = computeReturn({ client: c2, draft: draft({ completions: [comp] }), facts: facts2, evidence: [] });
    equal(o2.status, 'partialWorksheet', why(o2));
    equal(o2.household.manualTax, 0);
    assert(o2.limits.some(l => /נסגר רק במימוש/.test(l)), o2.limits.join(' | '));
    // פחת בספרים ⇒ 1342
    const c3 = baseCard({ businesses: [BIZ] } as unknown as Partial<Client>);
    const o3 = computeReturn({ client: c3, draft: draft({ books: { bz1: booksFor(200_000, 150_000, { lines: { '1': 200_000, '9': 45_000, '17': 5_000 } }) } }),
      facts: [fact('business.profit', 'client', { profit: 150_000, turnover: 200_000 }, { entityRef: 'bz1' }), fact('payments.niPaid', 'client', 10_000), ...filingFacts()], evidence: [] });
    equal(o3.status, 'partialWorksheet', why(o3));
    assert(o3.unsupported.some(u => /1342/.test(u.text)), why(o3));
  }),
  test('חסר נתון ⇒ טיוטה פנימית, לא «חלקי»: הצהרה שלא סומנה, שם אב, חשבון להחזר, שאלת פתיחה', () => {
    const client = baseCard({ employers: [{ id: 'em1', name: 'חברה' }] } as unknown as Partial<Client>);
    const f = [fact('salary.amounts', 'client', { gross: 100_000, withheld: 30_000 }, { entityRef: 'em1' })];
    const o = computeReturn({ client, draft: draft(), facts: f, evidence: [] });
    equal(o.status, 'internalDraft');
    for (const code of ['cov_declarations', 'cov_identity', 'cov_refund']) assert(o.blockers.some(b => b.code === code), `${code}: ${why(o)}`);
    assert(o.blockers.some(b => /לא ידוע אם יש/.test(b.text)), 'שאלת פתיחה שלא נענתה = «לא ידוע», לא «אין»');
  }),
  test('הגיליון: סטטוס מדויק, בדיקת כיסוי, מה לא מופק; נפתח מחדש זהה (כולל טקסט)', () => {
    const client = baseCard({ employers: [{ id: 'em1', name: 'חברה' }], properties: [{ id: 'p1', address: 'הרצל 1', isRented: true, rentalTaxTrack: 'regular' }] } as unknown as Partial<Client>);
    const o = computeReturn({ client, draft: draft(), facts: [fact('salary.amounts', 'client', { gross: 100_000, withheld: 8_000 }, { entityRef: 'em1' }), fact('rent.income', 'couple', 48_000, { entityRef: 'p1' }), ...filingFacts()], evidence: [] });
    const html = returnHtml(o, { clientName: 'דוד כהן', version: 1, approved: true });
    assert(html.includes('גיליון עבודה חלקי') && !html.includes('מוכן להגשה —'), 'אישור על גיליון חלקי אינו «מוכן להגשה»');
    assert(html.includes('בדיקת כיסוי') && html.includes('מה המערכת לא מפיקה'), 'כיסוי ומה לא מופק');
    equal(verifyReopened(o, fileFromHtml(html)).length, 0);
  }),
];
