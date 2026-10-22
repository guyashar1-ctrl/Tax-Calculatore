// ─── בדיקות: עיסוקי ב"ל כרשומות, והמתאם שמשווה את קריאת הפורטל לכרטיס ─────────

import { test, assert, equal, deepEqual } from '../../../testkit/tinyTest';
import type { TestCase } from '../../../testkit/tinyTest';
import type { Client, NiOccupation } from '../../../types';
import {
  niOccupationsFromBtl, niOccupationOverlaps, niOccupationsInYear, niOccupationPeriod,
  niOccupationsCountText, niOccupationTypeFromBtl, niOccupationsForDisplay,
  niOccupationsKey, niOccupationsInline, niOccupationsWindowStart,
} from '../niOccupations';
import { pickWindowQuote, quoteYears } from '../occupationsWindow';
import type { QuotationItem } from '../../../types/quotations';
import type { BtlOccupationChain } from '../niOccupations';
import { AUTHORITY_AUTOMATION, buildAuthorityCheck } from '../../taxFile/authorityAutomation';
import type { AutomationJob } from '../../../types/automation';

const CHAINS: BtlOccupationChain[] = [
  { sourceLabel: 'עצמאי', fromDate: '2025-06-01', toDate: null, sourcePeriods: [{ fromDate: '2025-06-01', toDate: null }] },
  {
    sourceLabel: 'תלמיד להשכלה גבוהה', fromDate: '2024-10-01', toDate: '2026-09-30',
    sourcePeriods: [{ fromDate: '2024-10-01', toDate: '2025-09-30' }, { fromDate: '2025-10-01', toDate: '2026-09-30' }],
  },
];

const personResult = (role: 'client' | 'spouse', advance: number, extra: Record<string, unknown> = {}) => ({
  role, ok: true, representation: { found: true },
  sections: {
    advance: { ok: true, value: { year: 2026, fromMonth: 7, toMonth: 9, months: 3, basisCategory: 'עצמאי', periodBasis: 47583, advanceMonthly: advance } },
    occupations: { ok: true, value: CHAINS, warnings: [] },
    directIncome: {
      ok: true,
      value: { year: 2025, amount: 16500, monthlyAmount: 16500, infoSource: 'הצהרה', incomeSource: 'עצמאי', receivedDate: '2025-06-15', fromMonth: 6, toMonth: 6, status: 'תקף' },
      records: [{ year: 2025, amount: 16500, infoSource: 'הצהרה', incomeSource: 'עצמאי', receivedDate: '2025-06-15', fromMonth: 6, toMonth: 6, status: 'תקף' }],
    },
    debitAuthorization: { ok: true, value: true, source: 'table' },
    balance: { ok: true, value: 0, source: 'ledger' },
    ...extra,
  },
});

function job(persons: unknown[]): AutomationJob {
  return {
    id: 'j', userId: 'u', clientId: 'c', actionType: 'btl.sync_file', input: {}, status: 'succeeded',
    attempts: 1, maxAttempts: 3, artifacts: [], result: { persons },
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), finishedAt: new Date().toISOString(),
  };
}

const spec = AUTHORITY_AUTOMATION.national_insurance!;
const ALL_KEYS = [...spec.supportedFieldKeys!].map(k => ({ label: k, fieldKey: k }));

export const TESTS: TestCase[] = [
  test('רצפי הפורטל ⇒ שתי רשומות, השמות המדויקים, תקופות מלאות ורשומות מקור', () => {
    const occ = niOccupationsFromBtl(CHAINS);
    equal(occ.length, 2);
    equal(niOccupationsCountText(occ.length), '2 עיסוקים', 'הספירה נגזרת מהרשומות');
    const student = occ.find(o => o.sourceLabel === 'תלמיד להשכלה גבוהה')!;
    equal(student.type, 'student');
    equal(student.fromDate, '2024-10-01');
    equal(student.toDate, '2026-09-30', 'תאריך הסיום של הסטודנט לא אובד');
    equal(student.sourcePeriods!.length, 2);
    const self = occ.find(o => o.sourceLabel === 'עצמאי')!;
    equal(self.toDate, undefined, 'בלי סוף ⇒ ממשיך — לא מוסק מהיום');
    equal(niOccupationPeriod(self).to, 'היום');
  }),

  test('עיסוק שהתחיל לפני השנה עדיין רלוונטי אליה; חפיפה בין עיסוקים מותרת', () => {
    const occ = niOccupationsFromBtl(CHAINS);
    equal(niOccupationsInYear(occ, 2025).length, 2, 'שניהם חופפים ל-2025');
    equal(niOccupationsInYear(occ, 2026).length, 2, 'שניהם חופפים ל-2026');
    equal(niOccupationsInYear(occ, 2024).length, 1, 'ב-2024 רק הסטודנט');
    equal(niOccupationsInYear(occ, 2027).length, 1, 'ב-2027 רק העצמאי');
    const endsBefore: NiOccupation = { id: 'x', type: 'employee', fromDate: '2020-01-01', toDate: '2024-12-31' };
    equal(niOccupationOverlaps(endsBefore, '2025-01-01', '2025-12-31'), false);
  }),

  test('תקופה לא ידועה אינה «עד היום»', () => {
    const p = niOccupationPeriod({ id: 'm', type: 'student' });
    equal(p.unknown, true);
    equal(p.ongoing, false);
  }),

  test('מיפוי שמות: עצמאי/תלמיד/עובד; שם לא מוכר ⇒ other עם השם המקורי', () => {
    equal(niOccupationTypeFromBtl('עצמאי'), 'self_employed');
    equal(niOccupationTypeFromBtl('תלמיד להשכלה גבוהה'), 'student');
    equal(niOccupationTypeFromBtl('עובד'), 'employee');
    const o = niOccupationsFromBtl([{ sourceLabel: 'חייל קבע', fromDate: '2020-01-01', toDate: null, sourcePeriods: [] }]);
    equal(o[0].type, 'other');
    equal(o[0].sourceLabel, 'חייל קבע');
  }),

  test('שדות ידניים על עיסוק מאותו סוג נשמרים בעדכון', () => {
    const occ = niOccupationsFromBtl(CHAINS, [{ id: 'm1', type: 'self_employed', weeklyHours: 30, definitionIncome: 16500 }]);
    const self = occ.find(o => o.type === 'self_employed')!;
    equal(self.weeklyHours, 30);
    equal(self.id, 'm1');
  }),

  test('סדר תצוגה: מה שנמשך קודם', () => {
    deepEqual(niOccupationsForDisplay(niOccupationsFromBtl(CHAINS)).map(o => o.sourceLabel), ['עצמאי', 'תלמיד להשכלה גבוהה']);
  }),

  test('מתאם: לקוח עם «2 עיסוקים» בלי תקופות ⇒ הצעה לרשומות המלאות; 47,583 הולך לבסיס ולא להכנסה', () => {
    const client = {
      id: 'c', niOccupations: [{ id: 'm1', type: 'self_employed' }, { id: 'm2', type: 'student' }],
      niIncomeBasisMonthly: 16500, niAdvanceMonthly: 2055, niBalance: 0, niDebitAuthorization: true,
    } as unknown as Client;
    const check = buildAuthorityCheck(spec, job([personResult('client', 2062)]), client, ALL_KEYS)!;
    const by = (k: string) => check.fields.find(f => f.fieldKey === k)!;
    equal(by('niOccupations').status, 'changed');
    equal((by('niOccupations').patchValue as NiOccupation[]).length, 2);
    equal(by('niIncomeBasisMonthly').status, 'match', 'ההכנסה המוצהרת 16,500 — תואמת');
    equal(by('niAdvanceMonthly').status, 'changed');
    equal(by('niAdvanceMonthly').patchValue, 2062);
    const basis = by('niInsuranceBasis');
    equal(basis.status, 'changed');
    equal((basis.patchValue as { periodBasis: number }).periodBasis, 47583);
    equal((basis.patchValue as { sourceIncomeYear?: number }).sourceIncomeYear, undefined, 'שנת המקור אינה נגזרת מההכנסה שנבחרה (219)');
    assert(!check.fields.some(f => f.patchValue === 47583 && f.fieldKey === 'niIncomeBasisMonthly'), 'הבסיס לא נכתב לשדה ההכנסה');
  }),

  test('מתאם: בני זוג — כל תוצאה למפתחות של האדם שלה בלבד', () => {
    const client = { id: 'c', familyStatus: 'married' } as unknown as Client;
    const check = buildAuthorityCheck(spec, job([personResult('client', 2062), personResult('spouse', 1180)]), client, ALL_KEYS)!;
    equal(check.fields.find(f => f.fieldKey === 'niAdvanceMonthly')!.patchValue, 2062);
    equal(check.fields.find(f => f.fieldKey === 'spouseNiAdvanceMonthly')!.patchValue, 1180);
    equal(check.fields.find(f => f.fieldKey === 'spouseNiAdvanceMonthly')!.person, 'spouse');
  }),

  test('מתאם: אדם שנכשל ⇒ «לא נקרא», בלי הצעה לרוקן; השני מוצע כרגיל', () => {
    const client = { id: 'c', familyStatus: 'married', spouseNiAdvanceMonthly: 900 } as unknown as Client;
    const check = buildAuthorityCheck(spec, job([personResult('client', 2062),
      { role: 'spouse', ok: false, errorCode: 'not_found', error: 'לא נמצא ברשימת המיוצגים בביטוח לאומי' }]), client, ALL_KEYS)!;
    const sp = check.fields.find(f => f.fieldKey === 'spouseNiAdvanceMonthly')!;
    equal(sp.status, 'failed');
    equal(sp.patchValue, undefined, 'אין ערך לכתוב');
    equal(check.runErrorByPerson?.spouse, 'לא נמצא ברשימת המיוצגים בביטוח לאומי');
    equal(check.fields.find(f => f.fieldKey === 'niAdvanceMonthly')!.status, 'changed');
  }),

  test('מתאם: מקטע שנכשל ⇒ «לא נקרא»; «אין הכנסה» במקור ⇒ מידע, לא מחיקה', () => {
    const client = { id: 'c', niBalance: 500, niIncomeBasisMonthly: 16500 } as unknown as Client;
    const check = buildAuthorityCheck(spec, job([personResult('client', 2062, {
      balance: { ok: false, reason: 'ledger_table_not_found' },
      directIncome: { ok: true, value: null, records: [] },
    })]), client, ALL_KEYS)!;
    const bal = check.fields.find(f => f.fieldKey === 'niBalance')!;
    equal(bal.status, 'failed');
    equal(bal.patchValue, undefined);
    const inc = check.fields.find(f => f.fieldKey === 'niIncomeBasisMonthly')!;
    equal(inc.status, 'info');
    equal(inc.patchValue, undefined, 'לא מוצע למחוק את 16,500');
  }),

  test('עדכון לאדם אחד: השדות של האחר «לא נבדקו», לא «טרם נתמכים»', () => {
    const client = { id: 'c', familyStatus: 'married' } as unknown as Client;
    const cardFields = [...ALL_KEYS, { label: 'מספר תיק' }];
    const check = buildAuthorityCheck(spec, job([personResult('client', 2062)]), client, cardFields)!;
    equal(check.summary.notChecked, 8, 'שמונת השדות של בן/בת הזוג (כולל רשימת ההכנסות, 219)');
    equal(check.summary.unsupported, 1, 'רק השורה שאין לה מקור');
  }),

  test('כשל של אדם: ההסבר פעם אחת — לא על כל שדה', () => {
    const client = { id: 'c', familyStatus: 'married' } as unknown as Client;
    const check = buildAuthorityCheck(spec, job([personResult('client', 2062),
      { role: 'spouse', ok: false, errorCode: 'navigation_failed', error: 'לא הצלחתי לפתוח את התיק בביטוח לאומי' }]), client, ALL_KEYS)!;
    const spouseFields = check.fields.filter(f => f.person === 'spouse');
    assert(spouseFields.length === 8 && spouseFields.every(f => f.status === 'failed' && !f.error), 'אדום בלי משפט חוזר');
    equal(check.runErrorByPerson?.spouse, 'לא הצלחתי לפתוח את התיק בביטוח לאומי');
  }),

  test('מתאם: בן/בת זוג עם כרטיס משלו/ה לא נשלח/ת לקריאה מכאן', () => {
    const client = { id: 'c', idNumber: '123456782', familyStatus: 'married', firstName: 'א', lastName: 'ב' } as unknown as Client;
    const spouseClient = { id: 's', idNumber: '300000007', firstName: 'ג', lastName: 'ד' } as unknown as Client;
    const r = spec.buildInput!(client, spouseClient);
    assert('input' in r, 'יש קלט');
    deepEqual((r.input.subjects as { role: string }[]).map(s => s.role), ['client']);
  }),

  // ── «פירוט עיסוק» מב"ל (סינתטי; המבנה נצפה בבדיקה החיה 28.09.2026) ──
  test('פירוט עיסוק: נשמר כ-btlDetail, לא דורס שעות/הכנסה שהוזנו ביד, ונכנס למפתח ולתצוגה', () => {
    const detail = { hoursBand: '20_plus' as const, definitionIncome: 9000, definitionText: 'עצמאי לפי הגדרה של 12 שעות ו-15% מהשכר הממוצע',
      definitionRule: { weeklyHours: 12, averageWagePct: 15 }, profession: 'ייעוץ', registeredDate: '2025-06-16', status: 'תקף', periodFrom: '2025-06-01', periodTo: null };
    const withDetail: BtlOccupationChain[] = [{ ...CHAINS[0], detail }, CHAINS[1]];
    const manual: NiOccupation[] = [{ id: 'm1', type: 'self_employed', weeklyHours: 30, definitionIncome: 16500 }];
    const occ = niOccupationsFromBtl(withDetail, manual);
    const se = occ.find(o => o.type === 'self_employed')!;
    deepEqual(se.btlDetail, detail);
    equal(se.weeklyHours, 30, 'הידני נשאר — הטווח לא מומר למספר');
    equal(se.definitionIncome, 16500);
    assert(niOccupationsKey(occ) !== niOccupationsKey(niOccupationsFromBtl(CHAINS)), 'פירוט חדש ⇒ «שונה» בהשוואה');
    assert(String(niOccupationsInline(occ)).includes('20 שעות ומעלה בשבוע · הכנסה להגדרה 9,000 ₪'), '20 שעות ומעלה בשבוע · הכנסה להגדרה 9,000 ₪');
  }),

  test('פירוט עיסוק שלא נקרא הפעם — נשאר מהקריאה הקודמת (כשל חלקי אינו «אין»)', () => {
    const detail = { hoursBand: '12_19' as const, definitionIncome: null, definitionText: null, definitionRule: null,
      profession: null, registeredDate: null, status: null, periodFrom: '2025-06-01', periodTo: null };
    const prev = niOccupationsFromBtl([{ ...CHAINS[0], detail }, CHAINS[1]]);
    const again = niOccupationsFromBtl(CHAINS, prev);
    deepEqual(again.find(o => o.type === 'self_employed')!.btlDetail, detail);
    equal(niOccupationsKey(again), niOccupationsKey(prev), 'אין הצעת שינוי שמוחקת את הפירוט');
  }),

  test('מתאם: סטטוס הייצוג מתוצאות החיפוש מוצג כלשונו ליד «ייצוג»', () => {
    const client = { id: 'c', familyStatus: 'single' } as unknown as Client;
    const r = personResult('client', 2062);
    const check = buildAuthorityCheck(spec, job([{ ...r, representation: { found: true, receivedDate: '2026-08-04', status: 'ממתין לאישור', pendingAction: 'ממתין תוקף' } }]), client, ALL_KEYS)!;
    const rep = check.fields.find(f => (f.authorityDisplay ?? '').startsWith('מופיע ברשימת המיוצגים'))!;
    equal(rep.authorityDisplay, 'מופיע ברשימת המיוצגים · נקלט 04/08/2026 · סטטוס: ממתין לאישור · ממתין תוקף');
  }),
  test('(21.10) ייצוג: נפתח מרשימת המיוצגים בלי «ממתין» ⇒ ירוק בלי שורה; עם «ממתין» ⇒ ראיה', () => {
    const client = { id: 'c', familyStatus: 'single' } as unknown as Client;
    const ok = buildAuthorityCheck(spec, job([{ ...personResult('client', 0), representation: { found: true, receivedDate: '2026-10-13' } }]), client, ALL_KEYS)!;
    equal(ok.fields.find(f => (f.authorityDisplay ?? '').startsWith('מופיע ברשימת המיוצגים'))!.status, 'match');
    const pending = buildAuthorityCheck(spec, job([{ ...personResult('client', 0), representation: { found: true, status: 'ממתין לאישור' } }]), client, ALL_KEYS)!;
    equal(pending.fields.find(f => (f.authorityDisplay ?? '').startsWith('מופיע ברשימת המיוצגים'))!.status, 'info');
  }),

  test('(21.10) «ד"ב : 0» בלי בסיס ⇒ מקדמה 0, ובסיס «אין» תואם לכרטיס ריק — לא אדום', () => {
    const client = { id: 'c', familyStatus: 'single' } as unknown as Client;
    const r = personResult('client', 0, { advance: { ok: true, value: { year: 2026, fromMonth: 10, toMonth: 12, months: 3, basisCategory: null, periodBasis: null, advanceMonthly: 0 } } });
    const check = buildAuthorityCheck(spec, job([r]), client, ALL_KEYS)!;
    equal(check.fields.find(f => f.fieldKey === 'niInsuranceBasis')!.status, 'match');
    equal(check.fields.find(f => f.fieldKey === 'niAdvanceMonthly')!.patchValue, 0);
    assert(check.fields.find(f => f.fieldKey === 'niBalance')!.status !== 'failed', 'השדות שאחריו עדיין נבדקים');
    const stale = { ...client, niInsuranceBasis: { year: 2025, fromMonth: 1, toMonth: 3, months: 3, periodBasis: 9000 } } as unknown as Client;
    const c2 = buildAuthorityCheck(spec, job([r]), stale, ALL_KEYS)!.fields.find(f => f.fieldKey === 'niInsuranceBasis')!;
    equal(c2.status, 'changed');
    equal(c2.patchValue, null);
  }),

  test('(21.10) עובד אצל שני מעבידים ⇒ שתי רשומות עם שם ותיק ניכויים; המפתח מבחין ביניהן', () => {
    const emp = (wf: string, name: string) => ({ hoursBand: null, definitionIncome: null, definitionText: null, definitionRule: null,
      profession: null, registeredDate: null, status: 'תקף', periodFrom: '2025-10-01', periodTo: null, employerName: name, withholdingFile: wf });
    const occ = niOccupationsFromBtl([
      { sourceLabel: 'עובד', fromDate: '2025-10-01', toDate: null, sourcePeriods: [], detail: emp('911111111', 'מעביד א') },
      { sourceLabel: 'עובד', fromDate: '2025-10-01', toDate: null, sourcePeriods: [], detail: emp('922222222', 'מעביד ב') },
    ]);
    deepEqual(occ.map(o => o.withholdingFile), ['911111111', '922222222']);
    equal(new Set(occ.map(o => o.id)).size, 2);
    assert(niOccupationsInline(occ).includes('מעביד א · תיק ניכויים 911111111'), niOccupationsInline(occ));
    const again = niOccupationsFromBtl([
      { sourceLabel: 'עובד', fromDate: '2025-10-01', toDate: null, sourcePeriods: [], detail: emp('922222222', 'מעביד ב') },
    ], occ);
    equal(again[0].id, occ[1].id, 'הזהות לפי תיק הניכויים, לא לפי השם «עובד»');
  }),

  test('(21.10) חלון העיסוקים: השנה הראשונה בהצעה, כולל שנים קודמות; בלי הצעה — שנת המס של המשרד', () => {
    const items = [
      { category: 'annual', year: 2026 }, { category: 'one_time', year: 2024 },
    ] as unknown as QuotationItem[];
    equal(niOccupationsWindowStart(quoteYears({ status: 'approved', items, expires_at: null }), 2025), '2024-01-01');
    equal(niOccupationsWindowStart([], 2025), '2025-01-01');
    const q = pickWindowQuote([
      { status: 'draft', items: [], expires_at: null }, { status: 'sent', items: [], expires_at: null }, { status: 'approved', items, expires_at: null },
    ]);
    equal(q?.status, 'approved', 'מאושרת גוברת על חדשה יותר שנשלחה');
  }),
];
