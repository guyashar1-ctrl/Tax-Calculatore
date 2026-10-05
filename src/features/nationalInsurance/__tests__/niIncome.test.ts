// ─── בדיקות: רשימת ההכנסות בב"ל — הצהרה חודשית ≠ שומה שנתית (219) ────────────
// שני המקרים האמיתיים (אושרו ע"י גיא, 05.10.2026):
//   א. הצהרה · יוני 2025 · 16,500 ⇒ הכנסה חודשית; בסיס 47,583 ליולי–ספטמבר 2026.
//   ב. שומה עצמי · ינואר–דצמבר 2025 · 47,800 ⇒ הכנסה שנתית (≈ 3,983.33 לחודש,
//      חישוב); בסיס 16,708 לאוקטובר–דצמבר 2026. ‼ נרשם בעבר «47,800 לחודש».

import { test, assert, equal, deepEqual } from '../../../testkit/tinyTest';
import type { TestCase } from '../../../testkit/tinyTest';
import type { Client, NiIncomeEntry, NiIncomeList, NiInsuranceBasis } from '../../../types';
import {
  niIncomeKind, niIncomeUnit, niIncomeMonthly, selectNiIncome, niIncomeTrust, niIncomeListKey,
  niIncomeEntryFromWorker, niClientIncomeTrust, niIncomeReadOf, niIncomeReadsFromJob,
} from '../niIncome';
// @ts-ignore — מודול העובד (JS בלי טיפוסים); הבדיקה מריצה את הקוד האמיתי שלו.
import { incomeEvidence, selectDeclaredIncome } from '../../../../worker/src/btlFileSync.mjs';
import { niBasisView, niBasisExplain } from '../niBasisDisplay';
import { AUTHORITY_AUTOMATION, buildAuthorityCheck } from '../../taxFile/authorityAutomation';
import { buildAuthorityRows } from '../../../utils/authorityRows';
import type { AuthorityRowFact } from '../../../utils/authorityRows';
import { clientFromDb, clientPatchToDb } from '../../../lib/dbMappers';
import { resolve6101 } from '../../smartForms/btl6101/resolve';
import { FX_FULL } from '../../smartForms/btl6101/fixtures';
import type { AutomationJob } from '../../../types/automation';

const row = (p: Partial<NiIncomeEntry>): NiIncomeEntry => ({
  year: 2025, fromMonth: 1, toMonth: 12, infoSource: 'שומה עצמי', incomeSource: 'עצמאי',
  amount: 0, receivedDate: null, status: 'תקף', ...p,
});

const DECL_A = row({ fromMonth: 6, toMonth: 6, infoSource: 'הצהרה', amount: 16500, receivedDate: '2025-06-15' });
const ASSESS_B = row({ amount: 47800, receivedDate: '2026-09-05' });

/** רשימת ההכנסות של מקרה ב' — כפי שהעובד מחזיר אותה (219). */
const RECORDS_B: NiIncomeEntry[] = [
  ASSESS_B,
  row({ year: 2024, amount: 21327, receivedDate: '2026-01-05' }),
  row({ year: 2023, amount: 0, receivedDate: '2025-12-05' }),
  row({ year: 2022, amount: 46800, receivedDate: '2023-08-05' }),
  row({ year: 2021, amount: 36400, receivedDate: '2022-11-05' }),
  row({ year: 2021, fromMonth: null, toMonth: null, infoSource: null, incomeSource: 'עובד', amount: 4860, status: null }),
  row({ year: 2020, amount: 28487, receivedDate: '2021-11-15' }),
  row({ year: 2020, amount: 19487, receivedDate: '2021-08-05' }),
];

const BASIS_A: NiInsuranceBasis = { year: 2026, fromMonth: 7, toMonth: 9, months: 3, periodBasis: 47583, advanceMonthly: 2062, category: 'עצמאי' };
const BASIS_B: NiInsuranceBasis = { year: 2026, fromMonth: 10, toMonth: 12, months: 3, periodBasis: 16708, advanceMonthly: 429, category: 'עצמאי' };

const spec = AUTHORITY_AUTOMATION.national_insurance!;
const ALL_KEYS = [...spec.supportedFieldKeys!].map(k => ({ label: k, fieldKey: k }));

function job(persons: unknown[]): AutomationJob {
  const now = new Date().toISOString();
  return {
    id: 'j', userId: 'u', clientId: 'c', actionType: 'btl.sync_file', input: {}, status: 'succeeded',
    attempts: 1, maxAttempts: 3, artifacts: [], result: { persons }, createdAt: now, updatedAt: now, finishedAt: now,
  };
}

const person = (role: 'client' | 'spouse', income: Record<string, unknown>, basis: NiInsuranceBasis = BASIS_B) => ({
  role, ok: true, representation: { found: true },
  sections: {
    advance: { ok: true, value: { year: basis.year, fromMonth: basis.fromMonth, toMonth: basis.toMonth, months: basis.months,
      basisCategory: 'עצמאי', periodBasis: basis.periodBasis, advanceMonthly: basis.advanceMonthly } },
    occupations: { ok: true, value: [], warnings: [] },
    directIncome: income,
    debitAuthorization: { ok: true, value: false, source: 'table' },
    balance: { ok: true, value: 0, source: 'ledger' },
  },
});

const AUTO = { source: 'automation' as const, syncedAt: '2026-10-05T09:08:00Z' };

/** לקוח אחרי 219 ואחרי אישור: הצהרה 16,500 ושומה 47,800 שמורות, והסכום מאומת. */
const TRUSTED_CLIENT = () => ({
  id: 'c', familyStatus: 'single', niIncomeBasisMonthly: 16500, niInsuranceBasis: BASIS_A,
  niIncomeList: { declaration: DECL_A, assessment: ASSESS_B },
  fieldMeta: { niIncomeBasisMonthly: AUTO, niIncomeList: AUTO, niInsuranceBasis: AUTO },
}) as unknown as Client;

function niFacts(client: Client, role: 'client' | 'spouse' = 'client'): AuthorityRowFact[] {
  const ni = buildAuthorityRows(client).find(r => r.authority === 'national_insurance')!;
  return (ni.persons ?? []).find(p => p.role === role)!.facts;
}
const fact = (facts: AuthorityRowFact[], k: string) => facts.find(f => f.k === k)!;
const allText = (facts: AuthorityRowFact[]) =>
  JSON.stringify(facts.map(f => [f.v, f.sub, f.explain]));

export const TESTS: TestCase[] = [
  // ── פירוש השורה ──
  test('הצהרה 16,500 ⇒ הכנסה חודשית כלשונה, לא מחושבת', () => {
    equal(niIncomeKind(DECL_A), 'declaration');
    equal(niIncomeUnit(DECL_A), 'monthly');
    deepEqual(niIncomeMonthly(DECL_A), { amount: 16500, calculated: false });
  }),

  test('שומה ינואר–דצמבר 47,800 ⇒ שנתית; ממוצע 3,983.33 מחושב — לעולם לא 47,800 לחודש', () => {
    equal(niIncomeKind(ASSESS_B), 'assessment');
    equal(niIncomeUnit(ASSESS_B), 'annual');
    const m = niIncomeMonthly(ASSESS_B)!;
    equal(m.calculated, true);
    equal(Math.round(m.amount * 100) / 100, 3983.33);
  }),

  test('שומה לחלק משנה / בלי חודשים ⇒ יחידה לא ידועה, ואין ממוצע (לא מחלקים ב-12)', () => {
    equal(niIncomeUnit(row({ fromMonth: 3, toMonth: 12, amount: 30000 })), 'unknown');
    equal(niIncomeMonthly(row({ fromMonth: 3, toMonth: 12, amount: 30000 })), null);
    equal(niIncomeUnit(row({ fromMonth: null, toMonth: null })), 'unknown');
    // ‼ הצהרה בטווח של כמה חודשים — עדיין לחודש; לא מחלקים במספר החודשים.
    deepEqual(niIncomeMonthly(row({ infoSource: 'הצהרה', fromMonth: 1, toMonth: 6, amount: 12000 })), { amount: 12000, calculated: false });
    equal(niIncomeKind(row({ infoSource: 'דוח שנתי' })), 'other');
    equal(niIncomeMonthly(row({ infoSource: 'דוח שנתי' })), null, 'מקור לא מוכר ⇒ לא מנחשים');
  }),

  test('בחירה: מקרה ב׳ ⇒ השומה של 2025, אין הצהרה; שכיר ושורות היסטוריות אינם נבחרים', () => {
    const l = selectNiIncome(RECORDS_B);
    equal(l.declaration, null);
    equal(l.assessment!.amount, 47800);
    equal(l.assessment!.year, 2025);
    equal(l.ambiguous, undefined);
    deepEqual(selectNiIncome(RECORDS_B), selectNiIncome([...RECORDS_B].reverse()), 'בלתי תלוי בסדר הטבלה');
  }),

  test('בחירה: אפס תקף נשמר; מבוטל, שכיר בלבד ומקור לא מוכר אינם נבחרים', () => {
    equal(selectNiIncome([row({ amount: 0 })]).assessment!.amount, 0, 'אפס הוא ערך');
    deepEqual(selectNiIncome([row({ amount: 900, status: 'מבוטל' })]), { declaration: null, assessment: null });
    deepEqual(selectNiIncome([row({ incomeSource: 'עובד', infoSource: 'הצהרה', amount: 9000 })]), { declaration: null, assessment: null },
      'הכנסה כשכיר אינה הכנסה של עצמאי');
    deepEqual(selectNiIncome([row({ infoSource: 'דוח שנתי' })]), { declaration: null, assessment: null });
  }),

  test('בחירה: הצהרה ושומה נבחרות בנפרד; שומה חדשה אינה דוחקת את ההצהרה', () => {
    const l = selectNiIncome([ASSESS_B, DECL_A, row({ infoSource: 'הצהרה', fromMonth: 2, toMonth: 2, amount: 15000, receivedDate: '2025-02-01' })]);
    equal(l.declaration!.amount, 16500, 'התקופה האחרונה');
    equal(l.assessment!.amount, 47800);
  }),

  test('בחירה: שתי שורות מתחרות (אותה תקופה ואותו יום, סכום שונה) ⇒ לא נבחרת אף אחת', () => {
    const l = selectNiIncome([row({ amount: 47800, receivedDate: '2026-09-05' }), row({ amount: 40000, receivedDate: '2026-09-05' })]);
    equal(l.assessment, null);
    deepEqual(l.ambiguous, ['assessment']);
    equal(selectNiIncome([row({ amount: 47800, receivedDate: '2026-09-05' }), row({ amount: 40000, receivedDate: '2026-01-01' })]).assessment!.amount, 47800,
      'קבלה מאוחרת יותר מכריעה');
  }),

  test('שורה מהעובד: חדש (amount) וישן (monthlyAmount) — אותו «סכום הכנסה» כלשונו', () => {
    equal(niIncomeEntryFromWorker({ year: 2025, amount: 47800, infoSource: 'שומה עצמי' })!.amount, 47800);
    equal(niIncomeEntryFromWorker({ year: 2025, monthlyAmount: 47800, infoSource: 'שומה עצמי' })!.amount, 47800);
    equal(niIncomeEntryFromWorker({ year: 2025 }), null, 'בלי סכום ⇒ אין שורה (לא 0)');
  }),

  // ── אמון בערך שבכרטיס ──
  test('אמון: ערך אוטומטי בלי הצהרה שמורה ⇒ «טעון אימות»; עם הצהרה תואמת ⇒ הצהרה; ידני ⇒ נשמר', () => {
    equal(niIncomeTrust(47800, AUTO, undefined).kind, 'unverified');
    equal(niIncomeTrust(47800, AUTO, { declaration: null, assessment: ASSESS_B }).kind, 'unverified');
    equal(niIncomeTrust(16500, AUTO, { declaration: DECL_A, assessment: null }).kind, 'declaration');
    equal(niIncomeTrust(16000, AUTO, { declaration: DECL_A, assessment: null }).kind, 'unverified', 'לא תואם להצהרה השמורה');
    equal(niIncomeTrust(47800, { source: 'manual' }, undefined).kind, 'manual', 'ערך ידני לגיטימי — לא נפסל');
    equal(niIncomeTrust(12000, { source: 'institution_alignment' }, undefined).kind, 'manual');
    equal(niIncomeTrust(undefined, AUTO, undefined).kind, 'none');
  }),

  // ── מתאם הקריאה (sync review) ──
  test('קריאה, מקרה ב׳: 47,800 «לחודש» מקריאה ישנה ⇒ הצעה לנקות; השומה נשמרת בנפרד; בלי שנת מקור בבסיס', () => {
    const client = { id: 'c', niIncomeBasisMonthly: 47800, fieldMeta: { niIncomeBasisMonthly: AUTO } } as unknown as Client;
    const check = buildAuthorityCheck(spec, job([person('client', { ok: true, value: null, records: RECORDS_B })]), client, ALL_KEYS)!;
    const by = (k: string) => check.fields.find(f => f.fieldKey === k)!;
    const inc = by('niIncomeBasisMonthly');
    equal(inc.status, 'changed');
    equal(inc.patchValue, null, 'מתרוקן — לא 0 ולא 3,983');
    assert(/הכנסה שנתית/.test(inc.hint ?? ''), 'ההסבר אומר שזו הכנסה שנתית');
    const list = by('niIncomeList');
    equal(list.status, 'changed');
    const next = list.patchValue as NiIncomeList;
    equal(next.declaration, null);
    equal(next.assessment!.amount, 47800);
    assert(/47,800 ₪ לשנה/.test(list.authorityDisplay ?? ''), 'מוצג «לשנה»');
    const basis = by('niInsuranceBasis');
    equal((basis.patchValue as NiInsuranceBasis).sourceIncomeYear, undefined);
    assert(!check.fields.some(f => /47,800 ₪ לחודש/.test(f.authorityDisplay ?? '')), 'אף מקום לא מציג 47,800 לחודש');
  }),

  test('קריאה, מקרה ב׳: אותו 47,800 שהוזן ביד — לא מוצע לנקות (מידע בלבד)', () => {
    const client = { id: 'c', niIncomeBasisMonthly: 47800, fieldMeta: { niIncomeBasisMonthly: { source: 'manual' } } } as unknown as Client;
    const check = buildAuthorityCheck(spec, job([person('client', { ok: true, value: null, records: RECORDS_B })]), client, ALL_KEYS)!;
    const inc = check.fields.find(f => f.fieldKey === 'niIncomeBasisMonthly')!;
    equal(inc.status, 'info');
    equal(inc.patchValue, undefined);
  }),

  test('קריאה, מקרה א׳: ההצהרה 16,500 ⇒ «הכנסה מוצהרת» עם התקופה; רשימה מוצעת לשמירה', () => {
    const client = { id: 'c', niIncomeBasisMonthly: 16500, fieldMeta: { niIncomeBasisMonthly: AUTO } } as unknown as Client;
    const check = buildAuthorityCheck(spec, job([person('client', { ok: true, value: null, records: [DECL_A] }, BASIS_A)]), client, ALL_KEYS)!;
    const inc = check.fields.find(f => f.fieldKey === 'niIncomeBasisMonthly')!;
    equal(inc.status, 'match');
    assert(/הצהרה · יוני 2025/.test(inc.authorityDisplay ?? ''), 'התקופה גלויה');
    const list = check.fields.find(f => f.fieldKey === 'niIncomeList')!;
    equal(list.status, 'changed');
    equal((list.patchValue as NiIncomeList).declaration!.amount, 16500);
  }),

  test('קריאה מעובד ישן (שורה אחת, monthlyAmount=47,800 משומה) ⇒ ראיה חלקית: לא מוצע לנקות; הערך נשאר «טעון אימות»', () => {
    const client = { id: 'c', niIncomeBasisMonthly: 47800, fieldMeta: { niIncomeBasisMonthly: AUTO } } as unknown as Client;
    const legacy = { ok: true, value: { year: 2025, monthlyAmount: 47800, infoSource: 'שומה עצמי', incomeSource: 'עצמאי', receivedDate: '2026-09-05', fromMonth: 1, toMonth: 12 } };
    const check = buildAuthorityCheck(spec, job([person('client', legacy)]), client, ALL_KEYS)!;
    const inc = check.fields.find(f => f.fieldKey === 'niIncomeBasisMonthly')!;
    equal(inc.status, 'info', 'ראיה חלקית אינה מתירה ניקוי');
    equal(inc.patchValue, undefined);
    const list = check.fields.find(f => f.fieldKey === 'niIncomeList')!.patchValue as NiIncomeList;
    equal(list.partial, true, 'שורה אחת אינה ראיה ל«אין הצהרה»');
    equal(niIncomeTrust(47800, AUTO, undefined, niIncomeReadsFromJob(job([person('client', legacy)])).client).kind, 'unverified');
  }),

  test('קריאה שנכשלה ⇒ «לא נקרא» בשני השדות; קריאה שלמה וריקה ⇒ ערך אוטומטי מוצע לניקוי, בלי לגעת ברשימה שאין', () => {
    const client = { id: 'c', niIncomeBasisMonthly: 47800, fieldMeta: { niIncomeBasisMonthly: AUTO } } as unknown as Client;
    const failed = buildAuthorityCheck(spec, job([person('client', { ok: false, reason: 'table_not_found' })]), client, ALL_KEYS)!;
    for (const k of ['niIncomeBasisMonthly', 'niIncomeList']) {
      const f = failed.fields.find(x => x.fieldKey === k)!;
      equal(f.status, 'failed', k);
      equal(f.patchValue, undefined, k);
    }
    const empty = buildAuthorityCheck(spec, job([person('client', { ok: true, value: null, records: [], rows: 0, candidatesComplete: true, empty: true })]), client, ALL_KEYS)!;
    const inc = empty.fields.find(x => x.fieldKey === 'niIncomeBasisMonthly')!;
    equal(inc.status, 'changed');
    equal(inc.patchValue, null);
    const list = empty.fields.find(x => x.fieldKey === 'niIncomeList')!;
    equal(list.status, 'info', 'אין רשימה שמורה — אין מה לעדכן');
    // ‼ והכרטיס: «טעון אימות» לפני האישור.
    const facts = niFacts({ ...client, familyStatus: 'single' } as Client);
    equal(fact(facts, 'הכנסה מוצהרת').tone, 'warn');
  }),

  test('בני זוג: התוצאה של כל אדם למפתחות שלו בלבד; הסימון «טעון אימות» לפי field_meta של בן/בת הזוג', () => {
    const client = {
      id: 'c', familyStatus: 'married', spouseFirstName: 'ש', spouseIdNumber: '300000007',
      niIncomeBasisMonthly: 16500, spouseNiIncomeBasisMonthly: 47800,
      niIncomeList: { declaration: DECL_A, assessment: null },
      fieldMeta: { niIncomeBasisMonthly: AUTO, spouseNiIncomeBasisMonthly: AUTO },
    } as unknown as Client;
    const check = buildAuthorityCheck(spec, job([
      person('client', { ok: true, value: null, records: [DECL_A] }, BASIS_A),
      person('spouse', { ok: true, value: null, records: RECORDS_B }),
    ]), client, ALL_KEYS)!;
    equal(check.fields.find(f => f.fieldKey === 'niIncomeBasisMonthly')!.status, 'match');
    equal(check.fields.find(f => f.fieldKey === 'spouseNiIncomeBasisMonthly')!.patchValue, null);
    equal((check.fields.find(f => f.fieldKey === 'spouseNiIncomeList')!.patchValue as NiIncomeList).assessment!.amount, 47800);
    equal(check.fields.find(f => f.fieldKey === 'niIncomeList')!.status, 'match', 'ההצהרה של הלקוח כבר שמורה');
    equal(fact(niFacts(client, 'client'), 'הכנסה מוצהרת').tone, undefined, 'הלקוח — מאומת');
    equal(fact(niFacts(client, 'spouse'), 'הכנסה מוצהרת').tone, 'warn', 'בן/בת הזוג — טעון אימות');
  }),

  // ── הכרטיס ו-«?» ──
  test('כרטיס, מקרה ב׳ אחרי התיקון: שומה «לשנה» + ממוצע מחושב; הבסיס 16,708 ÷ 3 ≈ 5,569; בלי «שונה מההצהרה»', () => {
    const client = {
      id: 'c', familyStatus: 'single', niInsuranceBasis: BASIS_B,
      niIncomeList: { declaration: null, assessment: ASSESS_B },
      fieldMeta: { niInsuranceBasis: AUTO, niIncomeList: AUTO },
    } as unknown as Client;
    const facts = niFacts(client);
    equal(fact(facts, 'הכנסה מוצהרת').v, '—');
    const a = fact(facts, 'הכנסה לפי שומה');
    equal(a.v, '47,800 ₪ לשנה (2025)');
    deepEqual(a.sub, ['ממוצע מחושב ≈ 3,983 ₪ לחודש']);
    const b = fact(facts, 'בסיס לדמי ביטוח');
    equal(b.v, '16,708 ₪ · אוקטובר–דצמבר 2026');
    equal(b.sub![0], 'בסיס חודשי 5,569 ₪');
    assert(/^הערכת הכנסה ≈ [\d,]+ ₪ לחודש \(2025\)$/.test(b.sub![1]), `הערכה מסומנת: ${b.sub![1]}`);
    const text = allText(facts);
    assert(!/שונה מההצהרה|תואם להצהרה/.test(text), 'אין פסק דין «תואם/שונה»');
    assert(!/47,800 ₪ לחודש/.test(text), 'לא «47,800 לחודש»');
    const ex = b.explain!;
    deepEqual(ex.map(s => s.kind), ['read', 'calc', 'estimate', 'compare']);
    equal(ex[1].lines[0].formula, '16,708 ÷ 3 ≈ 5,569 ₪');
    assert(ex[0].lines.some(l => /16,708 ₪/.test(l.text) && /אוקטובר–דצמבר 2026/.test(l.text)), 'הבסיס והתקופה שנקראו');
    assert(ex[0].lines.some(l => /05\/10\/2026/.test(l.text)), 'מתי נשמר — מ-field_meta, לא מומצא');
    assert(ex[2].lines.some(l => /2025/.test(l.text) && /1\.0051/.test(l.text)), 'ההנחות: שנה ומקדם');
    assert(ex[2].lines.some(l => /הערכה/.test(l.text)), 'רמת הוודאות');
    assert(ex[3].lines.some(l => l.formula === '47,800 ÷ 12 = 3,983.33 ₪'), 'הממוצע של השומה — כחישוב');
  }),

  test('כרטיס: 47,583 ÷ 3 = 15,861; הצהרה מאומתת מאותה שנה ⇒ «קרוב להצהרה»', () => {
    const client = {
      id: 'c', familyStatus: 'single', niInsuranceBasis: BASIS_A, niIncomeBasisMonthly: 16500,
      niIncomeList: { declaration: DECL_A, assessment: null },
      fieldMeta: { niIncomeBasisMonthly: AUTO, niIncomeList: AUTO, niInsuranceBasis: AUTO },
    } as unknown as Client;
    const facts = niFacts(client);
    const inc = fact(facts, 'הכנסה מוצהרת');
    equal(inc.v, '16,500 ₪ לחודש');
    deepEqual(inc.sub, ['הצהרה · יוני 2025']);
    const b = fact(facts, 'בסיס לדמי ביטוח');
    equal(b.explain![1].lines[0].formula, '47,583 ÷ 3 ≈ 15,861 ₪');
    assert(/קרוב להצהרה$/.test(b.sub![1]), b.sub![1]);
  }),

  test('כרטיס: ערך ישן «טעון אימות» אינו נכנס להשוואה; שומה חלקית ⇒ «לא ידוע אם לשנה או לחודש»', () => {
    const client = {
      id: 'c', familyStatus: 'single', niInsuranceBasis: BASIS_A, niIncomeBasisMonthly: 16500,
      niIncomeList: { declaration: null, assessment: row({ fromMonth: 3, toMonth: 12, amount: 30000 }) },
      fieldMeta: { niIncomeBasisMonthly: AUTO },
    } as unknown as Client;
    const facts = niFacts(client);
    const inc = fact(facts, 'הכנסה מוצהרת');
    equal(inc.tone, 'warn');
    assert(/טעון אימות/.test(inc.sub![0]), 'הסבר');
    const b = fact(facts, 'בסיס לדמי ביטוח');
    assert(!/קרוב להצהרה/.test(b.sub!.join()), 'לא הושווה');
    assert(b.explain![3].lines.some(l => /טעונה אימות/.test(l.text)), 'ההסבר אומר למה לא הושווה');
    deepEqual(fact(facts, 'הכנסה לפי שומה').sub, ['לא ידוע אם הסכום לשנה או לחודש']);
  }),

  test('בסיס: שנת המקור תמיד הנחה — גם כשבסיס ישן נושא sourceIncomeYear', () => {
    const v = niBasisView({ ...BASIS_A, sourceIncomeYear: 2024 });
    assert(v.reconstruction!.assumptions.includes('source_year_assumed'), 'מסומן כהנחה');
    equal(v.reconstruction!.sourceIncomeYear, 2025);
    equal(v.nearDeclaration, null, 'בלי הצהרה — אין השוואה');
    const ex = niBasisExplain({ ...BASIS_B, year: 2031 });
    assert(ex[2].lines.some(l => /לא ניתן להעריך/.test(l.text)), 'שנה בלי פרמטרים ⇒ אי-ודאות כנה');
  }),

  test('בסיס: הצהרה משנה אחרת ⇒ לא «קרוב» ולא «רחוק»', () => {
    const v = niBasisView(BASIS_A, { declaration: { ...DECL_A, year: 2023 } });
    equal(v.nearDeclaration, null);
  }),

  // ── שמירה ו-6101 ──
  test('שמירה: niIncomeList ⇄ ni_income_list, ונקרא חזרה בלי אובדן', () => {
    const list: NiIncomeList = { declaration: DECL_A, assessment: ASSESS_B };
    const db = clientPatchToDb({ niIncomeList: list, spouseNiIncomeList: list });
    deepEqual(db.ni_income_list, list);
    deepEqual(db.spouse_ni_income_list, list);
    const back = clientFromDb({ id: 'x', ni_income_list: list });
    equal(niIncomeListKey(back.niIncomeList), niIncomeListKey(list));
  }),

  test('6101: הצהרה מאומתת ⇒ «הכנסה לפני» 16,500 מב"ל; ערך «טעון אימות» ⇒ חסר + רמז; שומה ⇒ רמז בלבד', () => {
    const AS_OF = '2026-10-05';
    const ok = resolve6101({ client: FX_FULL, purposes: ['change'], entered: {}, asOf: AS_OF });
    equal(ok.data.incomeBefore, '16500');
    assert(ok.fields.incomeBefore.status !== 'missing', 'נמצא');
    assert(/הצהרה · יוני 2025/.test(ok.fields.incomeBefore.sourceLabel), ok.fields.incomeBefore.sourceLabel);

    const legacy = { ...FX_FULL, niIncomeBasisMonthly: 47800, niIncomeList: { declaration: null, assessment: ASSESS_B } } as Client;
    equal(niClientIncomeTrust(legacy).kind, 'unverified');
    const bad = resolve6101({ client: legacy, purposes: ['change'], entered: {}, asOf: AS_OF });
    equal(bad.data.incomeBefore, '', '47,800 לא נכנס לטופס');
    equal(bad.fields.incomeBefore.status, 'missing', 'נשאר חסר — זרימת ההשלמה הרגילה');
    assert((bad.hints.incomeBefore ?? []).some(h => /טעון אימות/.test(h)), 'רמז על הערך הישן');
    assert((bad.hints.incomeBefore ?? []).some(h => /3,983/.test(h) && /לשנה/.test(h)), 'השומה — רמז שנתי עם ממוצע מחושב');
    equal(bad.btl.declaredIncomeMonthly, undefined, 'לא «הכנסה חודשית מוצהרת»');
  }),

  // ── (ביקורת 05.10) הצהרה שאושרה ונשמרה, ואז קריאה שלמה שלא מוצאת אותה ──
  test('הצהרה מאומתת + קריאה שלמה ריקה (או רק מבוטלות/שכיר) ⇒ אמון נשלל מיד; הצעות: רשימה ריקה + ניקוי', () => {
    const before = TRUSTED_CLIENT();
    equal(niClientIncomeTrust(before).kind, 'declaration', 'לפני הקריאה — מאומת');
    const variants: NiIncomeEntry[][] = [
      [],
      [row({ infoSource: 'הצהרה', fromMonth: 6, toMonth: 6, amount: 16500, status: 'מבוטל' }), row({ incomeSource: 'עובד', infoSource: null, amount: 9000, status: null })],
    ];
    for (const records of variants) {
      const read = { ok: true, value: null, records, rows: records.length, candidatesComplete: true };
      const j = job([person('client', read, BASIS_A)]);
      const latest = niIncomeReadsFromJob(j).client!;
      // לפני האישור: הכרטיס, ההסבר וה-6101 כבר לא סומכים על 16,500.
      const t = niClientIncomeTrust(before, latest);
      equal(t.kind, 'unverified');
      equal((t as { reason: string }).reason, 'contradicted');
      const facts = buildAuthorityRows(before, undefined, undefined, { client: latest })
        .find(r => r.authority === 'national_insurance')!.persons![0].facts;
      equal(fact(facts, 'הכנסה מוצהרת').tone, 'warn');
      assert(/לא נמצאה כתקפה/.test(fact(facts, 'הכנסה מוצהרת').sub![0]), fact(facts, 'הכנסה מוצהרת').sub![0]);
      assert(!/קרוב להצהרה/.test(fact(facts, 'בסיס לדמי ביטוח').sub!.join()), 'לא מושווה להצהרה שנסתרה');
      const f6101 = resolve6101({ client: before, purposes: ['change'], entered: {}, asOf: '2026-10-05', btlIncomeRead: latest });
      equal(f6101.data.incomeBefore, '', 'לא נכנס ל-6101');
      equal(f6101.fields.incomeBefore.status, 'missing');
      // ההצעות בכרטיס
      const check = buildAuthorityCheck(spec, j, before, ALL_KEYS)!;
      const list = check.fields.find(f => f.fieldKey === 'niIncomeList')!;
      equal(list.status, 'changed');
      deepEqual(list.patchValue, { declaration: null, assessment: null });
      const inc = check.fields.find(f => f.fieldKey === 'niIncomeBasisMonthly')!;
      equal(inc.status, 'changed');
      equal(inc.patchValue, null);
      assert(/כבר לא מופיעה כתקפה/.test(inc.hint ?? ''), inc.hint ?? '');
    }
  }),

  test('אחרי אישור — מלא או חלקי — אין אמון כוזב; טעינה מחדש בלי הקריאה ⇒ השמור קובע', () => {
    const before = TRUSTED_CLIENT();
    const empty: NiIncomeList = { declaration: null, assessment: null };
    const meta = { ...before.fieldMeta, niIncomeBasisMonthly: AUTO, niIncomeList: AUTO };
    const all = { ...before, niIncomeBasisMonthly: undefined, niIncomeList: empty, fieldMeta: meta } as Client;
    const listOnly = { ...before, niIncomeList: empty, fieldMeta: meta } as Client;
    const scalarOnly = { ...before, niIncomeBasisMonthly: undefined, fieldMeta: meta } as Client;
    equal(niClientIncomeTrust(all).kind, 'none');
    equal(niClientIncomeTrust(listOnly).kind, 'unverified', 'אושרה רק הרשימה — הסכום כבר לא נתמך');
    equal(niClientIncomeTrust(scalarOnly).kind, 'none', 'אושר רק הניקוי');
    for (const c of [all, listOnly, scalarOnly]) {
      const r = resolve6101({ client: c, purposes: ['change'], entered: {}, asOf: '2026-10-05' });
      equal(r.data.incomeBefore, '');
    }
    // ‼ טעינה מחדש לפני שהקריאה נשלפה ⇒ השמור קובע; ברגע שנטענת — שוב «טעון אימות».
    equal(niClientIncomeTrust(before, undefined).kind, 'declaration');
  }),

  test('הצהרה מאומתת + קריאה שנכשלה / חלקית / חתוכה ⇒ לא «אין»: האמון נשאר, ולא מוצע לנקות', () => {
    const before = TRUSTED_CLIENT();
    const cases: Record<string, unknown>[] = [
      { ok: false, reason: 'table_not_found' },
      { ok: true, value: { year: 2025, monthlyAmount: 47800, infoSource: 'שומה עצמי', incomeSource: 'עצמאי', fromMonth: 1, toMonth: 12, status: 'תקף' } },
      { ok: true, value: null, records: [ASSESS_B], rows: 260, omitted: 59, candidatesComplete: false },
    ];
    for (const section of cases) {
      const j = job([person('client', section, BASIS_A)]);
      const latest = niIncomeReadsFromJob(j).client;
      equal(niClientIncomeTrust(before, latest).kind, 'declaration', JSON.stringify(section).slice(0, 40));
      const check = buildAuthorityCheck(spec, j, before, ALL_KEYS)!;
      const inc = check.fields.find(f => f.fieldKey === 'niIncomeBasisMonthly')!;
      assert(inc.status === 'failed' || inc.status === 'info', `${inc.status}`);
      equal(inc.patchValue, undefined);
      const list = check.fields.find(f => f.fieldKey === 'niIncomeList')!;
      assert(list.patchValue === undefined || (list.patchValue as NiIncomeList).partial === true, 'לא רשימה «שלמה» מראיה חלקית');
    }
    // בלי הדגל (גרסת ביניים): חסרות שורות ⇒ לא שלמה.
    const r = niIncomeReadOf({ ok: true, records: [DECL_A], rows: 41 });
    assert(r.ok && !r.complete, 'records < rows ⇒ לא שלמה');
  }),

  test('קריאה שלמה עם הצהרה חדשה בסכום אחר ⇒ הישנה נסתרת והסכום החדש מוצע; אותו סכום ⇒ עדיין נתמך', () => {
    const before = TRUSTED_CLIENT();
    const newer = row({ infoSource: 'הצהרה', year: 2026, fromMonth: 3, toMonth: 3, amount: 21000, receivedDate: '2026-03-10' });
    const j = job([person('client', { ok: true, value: null, records: [DECL_A, newer], rows: 2, candidatesComplete: true }, BASIS_A)]);
    equal(niClientIncomeTrust(before, niIncomeReadsFromJob(j).client).kind, 'unverified');
    const inc = buildAuthorityCheck(spec, j, before, ALL_KEYS)!.fields.find(f => f.fieldKey === 'niIncomeBasisMonthly')!;
    equal(inc.patchValue, 21000);
    const same = row({ ...newer, amount: 16500 });
    const j2 = job([person('client', { ok: true, value: null, records: [DECL_A, same], rows: 2, candidatesComplete: true }, BASIS_A)]);
    equal(niClientIncomeTrust(before, niIncomeReadsFromJob(j2).client).kind, 'declaration');
  }),

  test('בני זוג: קריאה של בן/בת הזוג לא נוגעת באמון של הלקוח, ולהפך', () => {
    const base = TRUSTED_CLIENT();
    const before = {
      ...base, familyStatus: 'married', spouseFirstName: 'ש', spouseIdNumber: '300000007',
      spouseNiIncomeBasisMonthly: 9000,
      spouseNiIncomeList: { declaration: row({ infoSource: 'הצהרה', fromMonth: 1, toMonth: 1, amount: 9000 }), assessment: null },
      fieldMeta: { ...base.fieldMeta, spouseNiIncomeBasisMonthly: AUTO },
    } as unknown as Client;
    const j = job([
      person('client', { ok: true, value: null, records: [DECL_A], rows: 1, candidatesComplete: true }, BASIS_A),
      person('spouse', { ok: true, value: null, records: [], rows: 0, candidatesComplete: true }),
    ]);
    const reads = niIncomeReadsFromJob(j);
    const ni = buildAuthorityRows(before, undefined, undefined, reads).find(r => r.authority === 'national_insurance')!;
    equal(fact(ni.persons!.find(p => p.role === 'client')!.facts, 'הכנסה מוצהרת').tone, undefined, 'הלקוח — מאומת');
    equal(fact(ni.persons!.find(p => p.role === 'spouse')!.facts, 'הכנסה מוצהרת').tone, 'warn', 'בן/בת הזוג — נסתר');
    const check = buildAuthorityCheck(spec, j, before, ALL_KEYS)!;
    equal(check.fields.find(f => f.fieldKey === 'spouseNiIncomeBasisMonthly')!.patchValue, null);
    equal(check.fields.find(f => f.fieldKey === 'niIncomeBasisMonthly')!.status, 'match');
  }),

  // ── (ביקורת 05.10) יותר מ-40 שורות: הבחירה על הכול, בלי תלות בסדר ──
  test('עובד → PIVO, 60+ שורות: הצהרה ושורה מתחרה מעבר לשורה ה-40 נשמרות; סדר הטבלה לא משנה דבר', () => {
    const filler = Array.from({ length: 60 }, (_, i) => ({
      year: 1990 + (i % 30), fromMonth: null, toMonth: null, infoSource: null, incomeSource: 'עובד',
      amount: 1000 + i, receivedDate: null, status: null,
    }));
    const d1 = { year: 2025, fromMonth: 6, toMonth: 6, infoSource: 'הצהרה', incomeSource: 'עצמאי', amount: 16500, receivedDate: '2025-06-15', status: 'תקף' };
    const d2 = { ...d1, amount: 12000 }; // אותה תקופה, אותו יום ⇒ תחרות
    const outcome = (rows: unknown[]) => {
      const sec = { ok: true, value: selectDeclaredIncome(rows), ...incomeEvidence(rows) };
      const read = niIncomeReadOf(sec);
      const check = buildAuthorityCheck(spec, job([person('client', sec, BASIS_A)]),
        { id: 'c', niIncomeBasisMonthly: 16500, fieldMeta: { niIncomeBasisMonthly: AUTO } } as unknown as Client, ALL_KEYS)!;
      const inc = check.fields.find(f => f.fieldKey === 'niIncomeBasisMonthly')!;
      return JSON.stringify({
        complete: read.ok && read.complete, list: read.ok && niIncomeListKey(read.list),
        inc: [inc.status, inc.patchValue === null ? 'CLEAR' : inc.patchValue ?? 'none', inc.authorityDisplay],
      });
    };
    // רק הצהרה, אחרי 55 שורות שכיר ⇒ נמצאת.
    const onlyDecl = [...filler.slice(0, 55), d1, ...filler.slice(55)];
    const ev = incomeEvidence(onlyDecl);
    equal(ev.rows, 61);
    assert(ev.records.some((r: { amount: number }) => r.amount === 16500), 'ההצהרה בשורה 56 לא נחתכה');
    equal(ev.candidatesComplete, true);
    const a = outcome(onlyDecl);
    assert(a.includes('"match"'), a);
    equal(outcome([...onlyDecl].reverse()), a, 'סדר הפוך — אותה תוצאה');
    // הצהרה + מתחרה מעבר לגבול ⇒ «סותרות», לא בחירה, לא ניקוי.
    const competing = [...filler.slice(0, 45), d1, ...filler.slice(45, 58), d2, ...filler.slice(58)];
    const b = outcome(competing);
    assert(b.includes('סותרות') && !b.includes('CLEAR'), b);
    equal(outcome([...competing].reverse()), b);
    equal(outcome([d2, ...filler, d1]), b);
    equal(selectDeclaredIncome(competing), null, 'גם הצורה לאתר הישן אינה בוחרת');
  }),

  test('עובד: גם שורות הבחירה עברו את התקרה ⇒ candidatesComplete=false, ו-PIVO לא מסיק «אין» ולא מנקה', () => {
    const many = Array.from({ length: 205 }, (_, i) => ({
      year: 1800 + i, fromMonth: 1, toMonth: 12, infoSource: 'שומה עצמי', incomeSource: 'עצמאי', amount: i, receivedDate: null, status: 'תקף',
    }));
    const ev = incomeEvidence(many);
    equal(ev.candidatesComplete, false);
    equal(ev.omitted, 5);
    const sec = { ok: true, value: null, ...ev };
    const inc = buildAuthorityCheck(spec, job([person('client', sec, BASIS_A)]),
      { id: 'c', niIncomeBasisMonthly: 47800, fieldMeta: { niIncomeBasisMonthly: AUTO } } as unknown as Client, ALL_KEYS)!
      .fields.find(f => f.fieldKey === 'niIncomeBasisMonthly')!;
    equal(inc.status, 'info');
    equal(inc.patchValue, undefined);
  }),
];
