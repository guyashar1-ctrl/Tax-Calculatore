// הדוח השנתי (שלב 4) — תרחישים מייצגים מול חישוב ידני עצמאי (מדרגות 2025 מלוח העזר 2025; נקודת זיכוי 2,904;
// ב״ל לעצמאי: בסיס אחרי ניכוי 52% מהחלק הלאומי, סף מופחת 7,522 לחודש שהמשכורת מנצלת קודם).
import { test, equal, assert } from '../../../testkit/tinyTest';
import type { TestCase } from '../../../testkit/tinyTest';
import type { Client } from '../../../types';
import type { Evidence, YearFact } from '../../taxYear/types';
import { computeReturn } from '../engine';
import type { ReturnDraft } from '../types';

const BR25: [number, number][] = [[84_120, 0.10], [120_720, 0.14], [193_800, 0.20], [269_280, 0.31], [560_280, 0.35], [Infinity, 0.47]];
const brackets = (t: number) => { let tax = 0, prev = 0; for (const [top, r] of BR25) { if (t > prev) tax += (Math.min(t, top) - prev) * r; prev = top; } return tax; };
function niDed(I: number, salary = 0) {
  const L = Math.max(0, 7_522 * 12 - Math.min(salary, 7_522 * 12)), t1 = 0.0447, t2 = 0.1283;
  const low = I / (1 + 0.52 * t1);
  const B = low <= L ? low : (I + 0.52 * (t2 - t1) * L) / (1 + 0.52 * t2);
  return 0.52 * (Math.min(B, L) * t1 + Math.max(0, B - L) * t2);
}
const near = (a: number | undefined, b: number, tol: number, m: string) => assert(a != null && Math.abs(a - b) <= tol, `${m}: ${a} מול ${Math.round(b)}`);

let n = 0;
const ev: Evidence[] = [];
function fact(itemKey: string, role: YearFact['subjectRole'], value: unknown, o: { entityRef?: string; basis?: YearFact['basis']; periodTo?: string; status?: YearFact['status']; doc?: boolean; answer?: YearFact['answer'] } = {}): YearFact {
  const id = `f${++n}`;
  if (o.doc !== false && (o.basis ?? 'final') === 'final') ev.push({ id: `e${n}`, clientId: 'c1', taxYear: 2025, docKind: 'other', subjectRole: role, entityRef: o.entityRef } as unknown as Evidence);
  return { id, clientId: 'c1', taxYear: 2025, itemKey, subjectRole: role, entityRef: o.entityRef, periodKind: 'year', periodFrom: '2025-01-01', periodTo: o.periodTo ?? '2025-12-31',
    answer: o.answer ?? 'value', value, basis: o.basis ?? 'final', source: 'office', status: o.status ?? 'accepted', evidenceId: o.doc === false || (o.basis ?? 'final') !== 'final' ? undefined : `e${n}`, createdAt: `2026-02-0${(n % 9) + 1}T10:00:00Z` };
}
const client = (p: Partial<Client> = {}): Client => ({ id: 'c1', firstName: 'דוד', lastName: 'כהן', gender: 'male', familyStatus: 'single', birthDate: '1985-05-01', children: [], employers: [], businesses: [],
  properties: [], investmentAccounts: [], pensionFunds: [], foreignAccounts: [], fieldMeta: {}, spouse: null, ...p } as unknown as Client);
const draft = (p: Partial<ReturnDraft> = {}): ReturnDraft => ({ taxYear: 2025, preparedOn: '2026-03-01', persons: ['client'], completions: [], adjustments: [], micro: {}, decisions: [], ...p });
const field = (o: ReturnType<typeof computeReturn>, code: string) => o.fields.find(f => f.code === code)?.amount;
const BIZ = { id: 'bz1', name: 'ייעוץ' }, EMP = { id: 'em1', name: 'חברה בע״מ' };

export const TESTS: TestCase[] = [
  test('עצמאי: 150/238/030/135/136, מס ויתרה להחזר — מול חישוב ידני; נספח 1320 חלקי; מוכן להגשה', () => {
    const facts = [fact('business.profit', 'client', { profit: 300_000, turnover: 400_000 }, { entityRef: 'bz1' }), fact('business.books', 'client', true, { entityRef: 'bz1' }),
      fact('payments.niPaid', 'client', 40_000), fact('payments.advances', 'client', 50_000), fact('savings.selfAmounts', 'client', { pension: 20_000, studyFund: 10_000 })];
    const o = computeReturn({ client: client({ businesses: [BIZ] } as Partial<Client>), draft: draft(), facts, evidence: ev });
    // ביד (מדריך 2025, סעיפים 53, 76 — מסלול א׳; 20,000 < 24,069 ⇒ לא עמית מוטב): הכנסה מזכה = min(300,000 − 10,000 קרן, 164,400) = 164,400.
    //   ניכוי 7% = 11,508; זיכוי על min(20,000 − 11,508, 5% = 8,220) = 8,220; תוספת על מה שמעל 12% (19,728) = 272 ⇒ ניכוי 11,780.
    const want = brackets(300_000 - 11_780 - 10_000 - niDed(300_000)) - 2.25 * 2_904 - 0.35 * 8_220;
    near(o.persons[0].incomeTax, want, 2, 'מס');
    equal(field(o, '150'), 300_000); equal(field(o, '238'), 400_000); equal(field(o, '030'), 40_000); equal(field(o, '135'), 20_000); equal(field(o, '268'), undefined); // ‼ 135 = כל הסכום ששולם; רשות המסים מפצלת equal(field(o, '136'), 10_000);
    near(o.household.balance, want - 50_000, 2, 'יתרה (שלילי = החזר)');
    equal(o.annexes.find(a => a.formId === '1320')?.status, 'missing'); // בלי ספרים לנספח — חסר (סטטוסים מלאים: scenarios.test.ts)
    assert(o.controls.every(c => c.ok !== false), JSON.stringify(o.controls));
    const s = o.fields.find(f => f.code === '150')!.source;
    assert(s.kind === 'fact' && (s.factIds ?? []).length > 0 && s.trust === 'verified', JSON.stringify(s));
  }),
  test('שכיר ועצמאי: הסף המופחת נוצל במשכורת; 158/042/150 ויתרה לתשלום', () => {
    const facts = [fact('salary.amounts', 'client', { gross: 180_000, withheld: 25_000 }, { entityRef: 'em1' }), fact('business.profit', 'client', { profit: 100_000, turnover: 150_000 }, { entityRef: 'bz1' }),
      fact('business.books', 'client', true, { entityRef: 'bz1' }), fact('payments.niPaid', 'client', 8_000)];
    const o = computeReturn({ client: client({ businesses: [BIZ], employers: [EMP] } as Partial<Client>), draft: draft(), facts, evidence: ev });
    const want = brackets(280_000 - niDed(100_000, 180_000)) - 2.25 * 2_904;
    near(o.persons[0].incomeTax, want, 2, 'מס');
    equal(field(o, '158'), 180_000); equal(field(o, '042'), 25_000); equal(field(o, '150'), 100_000);
    near(o.household.balance, want - 25_000, 2, 'לתשלום');
  }),
  test('בני זוג: עסק אצל הלקוח, משכורת אצל בת הזוג — 150 ו-172, כל אחד במס שלו', () => {
    const facts = [fact('business.profit', 'client', { profit: 200_000, turnover: 260_000 }, { entityRef: 'bz1' }), fact('business.books', 'client', true, { entityRef: 'bz1' }),
      fact('payments.niPaid', 'client', 15_000), fact('salary.amounts', 'spouse', { gross: 150_000, withheld: 18_000 }, { entityRef: 'em2' })];
    const c = client({ familyStatus: 'married', businesses: [BIZ], employers: [{ id: 'em2', name: 'בית ספר', belongsToSpouse: true }],
      spouse: { firstName: 'מיכל', gender: 'female', birthDate: '1987-01-01', grossSalary: 0, selfEmployedGrossIncome: 0, recognizedExpenses: 0, selfEmployedPensionAmount: 0, krenHashtalmutSE: 0, employeePensionPct: 0 } } as unknown as Partial<Client>);
    const o = computeReturn({ client: c, draft: draft({ persons: ['client', 'spouse'] }), facts, evidence: ev });
    near(o.persons.find(p => p.person === 'client')!.incomeTax, brackets(200_000 - niDed(200_000)) - 2.25 * 2_904, 2, 'מס הלקוח');
    near(o.persons.find(p => p.person === 'spouse')!.incomeTax, brackets(150_000) - 2.75 * 2_904, 2, 'מס בת הזוג');
    equal(field(o, '150'), 200_000); equal(field(o, '172'), 150_000); equal(field(o, '158'), undefined); equal(field(o, '042'), 18_000);
  }),
  test('כמה מקורות: משכורת, שכ״ד פטור, ריבית ודיבידנד (אחרי הכרעה), תרומה — שדות, מס ובקרות', () => {
    const facts = [fact('salary.amounts', 'client', { gross: 120_000, withheld: 9_000 }, { entityRef: 'em1' }), fact('rent.income', 'couple', 50_000, { entityRef: 'p1' }),
      fact('capital.amounts', 'couple', { interest: 10_000, dividend: 5_000, withheld: 3_750 }, { entityRef: 'a1' }), fact('donations.amount', 'client', 2_000)];
    const c = client({ employers: [EMP], properties: [{ id: 'p1', address: 'הרצל 1', isRented: true, rentalTaxTrack: 'exempt' }], investmentAccounts: [{ id: 'a1', institutionName: 'בנק' }] } as unknown as Partial<Client>);
    const no = computeReturn({ client: c, draft: draft(), facts, evidence: ev });
    assert(no.blockers.some(b => b.code === 'capital_rates') && no.status === 'internalDraft', 'בלי הכרעה על שיעור ההון — חוסם');
    const o = computeReturn({ client: c, draft: draft({ decisions: [{ key: 'capital.rates', text: 'לא בעל מניות מהותי; פיצול לפי 867' }] }), facts, evidence: ev });
    equal(field(o, '158'), 120_000); equal(field(o, '332'), 50_000); equal(field(o, '242'), 10_000); equal(field(o, '241'), 5_000); equal(field(o, '043'), 3_750); equal(field(o, '037'), 2_000);
    const want = brackets(120_000) - 2.25 * 2_904 - 0.35 * 2_000 + 0.25 * 15_000;
    near(o.persons[0].incomeTax, want, 2, 'מס: משכורת − זיכוי תרומה + 25% על ההון; שכ״ד פטור');
    near(o.household.balance, want - 9_000 - 3_750, 2, 'יתרה');
  }),
  test('עסק זעיר (דוח מלא עם 30%): 150 = 70% × 238, סימון בחלק א׳, בלי 030 גם כשיש תשלום ב״ל', () => {
    const facts = [fact('business.profit', 'client', { profit: 60_000, turnover: 100_000 }, { entityRef: 'bz1' }), fact('payments.niPaid', 'client', 6_000)];
    const o = computeReturn({ client: client({ businesses: [BIZ] } as Partial<Client>), draft: draft({ micro: { bz1: { track: 'micro', registeredAtYearStart: true, reporting: 'full' } } }), facts, evidence: ev });
    equal(field(o, '150'), 70_000); equal(field(o, '238'), 100_000); equal(field(o, '030'), undefined);
    assert(o.fields.some(f => f.code === 'F010' && f.checked), 'סימון «בעל עסק זעיר»');
    near(o.persons[0].incomeTax, brackets(70_000) - 2.25 * 2_904, 1, 'מס');
    assert(o.controls.find(c => c.id.startsWith('micro_'))!.ok === true, 'בקרת זעיר');
  }),
  test('פערים: נתון עד ספטמבר (מההערכה) אינו שנה; מכירת נכס — לא נתמך; ממתין לאישור לא נכנס; 2026 — טיוטה פנימית', () => {
    const partial = fact('salary.amounts', 'client', { gross: 90_000, withheld: 6_000 }, { entityRef: 'em1', basis: 'actual_to_date', periodTo: '2025-09-30' });
    const sold = fact('sales.sold', 'client', true, { basis: 'declared' });
    const pend = fact('donations.amount', 'client', 5_000, { status: 'pending' });
    const o = computeReturn({ client: client({ employers: [EMP] } as Partial<Client>), draft: draft(), facts: [partial, sold, pend], evidence: ev });
    const g = o.gaps.map(x => x.text).join(' | ');
    assert(/עד 09\/2025.*מהערכת המס.*חסר נתון סופי/.test(g), g);
    assert(o.gaps.some(x => x.code === 'sales'), g);
    equal(field(o, '037'), undefined);
    assert(o.limits.some(l => l.includes('ממתין לאישור')), 'ממתין — במגבלות');
    equal(o.status, 'internalDraft');
    assert(o.nextAction.startsWith('להשלים'), o.nextAction);
    const y26 = computeReturn({ client: client(), draft: draft({ taxYear: 2026 }), facts: [], evidence: ev });
    assert(y26.gaps.some(x => x.code === 'form_version') && y26.unsupported.some(u => u.code === 'form_version'), 'טופס 2026 לא ממופה — «לא מופק», לא נסגר בהשלמה');
  }),
  test('השלמה מקצועית: רק מאושרת ומבוססת, רק לפער נתון/חישוב ורק בקודים שמופקים; מכירת נכס (נספח) — לא נסגרת', () => {
    const facts = [fact('salary.amounts', 'client', { gross: 100_000, withheld: 8_000 }, { entityRef: 'em1' }), fact('savings.insuranceAmounts', 'client', { life: 3_000 }), fact('sales.sold', 'client', true, { basis: 'declared' })];
    const life = { id: 'k1', gap: 'life_insurance_client', person: 'client' as const, fields: [], taxAmount: -750, justification: 'זיכוי 25% על 3,000 — חושב ידנית', approvedAt: '2026-03-02' };
    const sales = { id: 'k2', gap: 'sales', person: 'client' as const, fields: [{ code: '056', amount: 400_000 }], taxAmount: 12_000, justification: 'חישוב שבח ידני', approvedAt: '2026-03-02' };
    const pending = computeReturn({ client: client({ employers: [EMP] } as Partial<Client>), draft: draft({ completions: [{ ...life, approvedAt: undefined }] }), facts, evidence: ev });
    assert(pending.blockers.some(b => b.code === 'life_insurance_client'), 'השלמה בלי אישור — הפער פתוח');
    const o = computeReturn({ client: client({ employers: [EMP] } as Partial<Client>), draft: draft({ completions: [life, sales] }), facts, evidence: ev });
    assert(!o.blockers.some(b => b.code === 'life_insurance_client'), 'פער חישוב — נסגר');
    assert(o.unsupported.some(u => u.code === 'sales'), 'מכירת נכס — נשארת «לא מופק»');
    equal(field(o, '056'), undefined);
    equal(o.household.manualTax, -750);
    near(o.household.liability, brackets(100_000) - 2.25 * 2_904 - 750, 2, 'חבות — רק ההשלמה שנסגרה');
  }),
  test('ביטוח חיים: השדה נמלא, אבל הזיכוי לא מחושב — פער עד השלמה', () => {
    const o = computeReturn({ client: client({ employers: [EMP] } as Partial<Client>), draft: draft(), facts: [fact('salary.amounts', 'client', { gross: 100_000, withheld: 8_000 }, { entityRef: 'em1' }), fact('savings.insuranceAmounts', 'client', { life: 3_000 })], evidence: ev });
    equal(field(o, '036'), 3_000);
    assert(o.blockers.some(b => b.code === 'life_insurance_client'), JSON.stringify(o.blockers));
  }),
  test('בקרות: 158 = סך 106; 042 = סך הניכוי; 150 = ההכנסה מעסק בחישוב; לכל סכום מקור', () => {
    const facts = [fact('salary.amounts', 'client', { gross: 60_000, withheld: 2_000 }, { entityRef: 'em1' }), fact('salary.amounts', 'client', { gross: 40_000, withheld: 1_000 }, { entityRef: 'em3' })];
    const o = computeReturn({ client: client({ employers: [EMP, { id: 'em3', name: 'שני' }] } as Partial<Client>), draft: draft(), facts, evidence: ev });
    equal(field(o, '158'), 100_000); equal(field(o, '042'), 3_000);
    for (const id of ['salary_106', 'withheld_106', 'sources']) assert(o.controls.find(c => c.id === id)?.ok === true, id);
  }),
];
