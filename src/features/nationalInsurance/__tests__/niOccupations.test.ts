// ─── בדיקות: עיסוקי ב"ל כרשומות, והמתאם שמשווה את קריאת הפורטל לכרטיס ─────────

import { test, assert, equal, deepEqual } from '../../../testkit/tinyTest';
import type { TestCase } from '../../../testkit/tinyTest';
import type { Client, NiOccupation } from '../../../types';
import {
  niOccupationsFromBtl, niOccupationOverlaps, niOccupationsInYear, niOccupationPeriod,
  niOccupationsCountText, niOccupationTypeFromBtl, niOccupationsForDisplay,
} from '../niOccupations';
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
    directIncome: { ok: true, value: { year: 2025, monthlyAmount: 16500, infoSource: 'הצהרה', incomeSource: 'עצמאי', receivedDate: '2025-06-15', fromMonth: 6, toMonth: 6 } },
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
    equal((basis.patchValue as { sourceIncomeYear: number }).sourceIncomeYear, 2025, 'שנת המקור מההכנסה הישירה');
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
      directIncome: { ok: true, value: null },
    })]), client, ALL_KEYS)!;
    const bal = check.fields.find(f => f.fieldKey === 'niBalance')!;
    equal(bal.status, 'failed');
    equal(bal.patchValue, undefined);
    const inc = check.fields.find(f => f.fieldKey === 'niIncomeBasisMonthly')!;
    equal(inc.status, 'info');
    equal(inc.patchValue, undefined, 'לא מוצע למחוק את 16,500');
  }),

  test('מתאם: בן/בת זוג עם כרטיס משלו/ה לא נשלח/ת לקריאה מכאן', () => {
    const client = { id: 'c', idNumber: '123456782', familyStatus: 'married', firstName: 'א', lastName: 'ב' } as unknown as Client;
    const spouseClient = { id: 's', idNumber: '300000007', firstName: 'ג', lastName: 'ד' } as unknown as Client;
    const r = spec.buildInput!(client, spouseClient);
    assert('input' in r, 'יש קלט');
    deepEqual((r.input.subjects as { role: string }[]).map(s => s.role), ['client']);
  }),
];
