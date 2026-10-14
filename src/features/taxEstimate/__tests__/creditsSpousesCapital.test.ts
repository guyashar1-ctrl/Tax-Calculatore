// הערכת מס — ביטוח חיים, תרומות, בני זוג והכנסה הונית לפי סוג (13.10.2026).
// הצפוי כתוב ביד מהמקורות: זיכוי ביטוח חיים 25% × min(פרמיה, max(2,268, 5% × הכנסה מזכה עד 164,400))
// (מדריך 2025 עמ׳ 70–71; לוח העזר 2026 עמ׳ 12); תרומות — יותר מ-207 (לוח העזר 2026 עמ׳ 13); ריבית לא צמודה 15%,
// דיבידנד מחברה מהותית 30% (מדריך 2025 עמ׳ 40–42); שיוך הכנסה שאינה מיגיעה אישית לבעל היגיעה הגבוהה (עמ׳ 16, 37).
import { test, equal, assert } from '../../../testkit/tinyTest';
import type { TestCase } from '../../../testkit/tinyTest';
import type { Client, TaxCalcInput } from '../../../types';
import { computeEstimate } from '../engine';
import { buildSummary, summaryHtml } from '../summary';
import { calculateTax } from '../../../utils/taxCalculations';
import { getTaxYearData } from '../../../data/taxData';
import type { EstimateDraft, IncomeLine } from '../types';

const client = (p: Partial<Client> = {}): Client => ({
  id: 'c1', firstName: 'דוד', lastName: 'כהן', gender: 'male', familyStatus: 'single', birthDate: '1985-05-01', children: [], employers: [], businesses: [],
  properties: [], investmentAccounts: [], pensionFunds: [], foreignAccounts: [], fieldMeta: {}, spouse: null, ...p,
} as unknown as Client);
const spouse = { firstName: 'מיכל', gender: 'female', birthDate: '1987-01-01', grossSalary: 0, selfEmployedGrossIncome: 0, recognizedExpenses: 0, selfEmployedPensionAmount: 0, krenHashtalmutSE: 0, employeePensionPct: 0 } as unknown as Client['spouse'];
const married = client({ familyStatus: 'married', spouse });
const biz = (p: Partial<IncomeLine> = {}): IncomeLine => ({
  id: 'b1', person: 'client', source: 'business', entityRef: 'bz1', label: 'העסק', actualToCutoff: 270_000, turnoverToCutoff: 300_000,
  office: { method: 'runRate' }, chosen: 'office', turnoverForecast: 100_000, ...p,
});
const full = (id: string, p: Partial<IncomeLine>): IncomeLine => ({ id, person: 'client', source: 'salary', label: id, actualToCutoff: 0, office: { method: 'none' }, chosen: 'office', ...p });
const PAID0 = Array.from({ length: 9 }, (_, i) => ({ period: `2026-${String(i + 1).padStart(2, '0')}`, state: 'reported' as const, paid: 0 }));
const draft = (p: Partial<EstimateDraft> = {}): EstimateDraft => ({
  cutoffMonth: 9, preparedOn: '2026-10-11', lines: [biz()], oneOffs: [], adjustments: [],
  it: { via: 'manual', readOn: '2026-10-10', method: 'turnoverRate', ratePct: 5, frequency: 1, periods: PAID0 },
  ni: { via: 'manual', readOn: '2026-10-10', monthlyAdvance: 3_000, paidToCutoff: 27_000 },
  vat: { via: 'manual', periods: [] }, payments: [], savings: [], reconciliations: [], decisions: [], ...p,
});
const Y = { client: client(), taxYear: 2026 };
const near = (got: number, want: number, tol: number, what: string) => assert(Math.abs(got - want) <= tol, `${what}: התקבל ${got}, צפוי ${Math.round(want)} (±${tol})`);
const capDecisions = ['cap.interest.unlinkedRate', 'cap.dividend.substantialRate', 'cap.gain.realRate', 'cap.dividend.regularRate'].map(ruleId => ({ ruleId, text: 'שיעור קבוע בחוק — לפי מדריך 2025' }));

export const TESTS: TestCase[] = [
  test('ביטוח חיים בלי הפקדות לקצבה: זיכוי 25% × 3,000 = 750 (התקרה 5% × 164,400 = 8,220)', () => {
    const base = computeEstimate(draft(), Y).persons[0].incomeTax;
    const o = computeEstimate(draft({ credits: [{ person: 'client', lifeInsurance: 3_000 }] }), Y);
    near(base - o.persons[0].incomeTax, 750, 1, 'הזיכוי');
    equal(o.checks?.find(c => c.id === 'life-client')?.status, 'noSaving');
  }),

  // סדר המילוי (רשות המסים 2005, research/open-law-questions §4): פנסיה קודם, ביטוח חיים ביתרת התקרה 45א(ד).
  test('ביטוח חיים עם הפקדה לקצבה: הפנסיה ממלאת קודם — 10,000 כולם בניכוי 7% ⇒ כל התקרה (8,220) לריסק: זיכוי 750', () => {
    const d = draft({ credits: [{ person: 'client', lifeInsurance: 3_000 }], savings: [{ person: 'client', pensionToCutoff: 10_000 }] });
    const withPension = computeEstimate({ ...d, credits: [] }, Y).persons[0].incomeTax;
    const o = computeEstimate(d, Y);
    near(withPension - o.persons[0].incomeTax, 750, 1, 'הזיכוי');
    const c = o.checks?.find(x => x.id === 'life-client');
    equal(c?.status, 'noSaving'); assert(!!c?.detail.includes('סדר המילוי'), c?.detail ?? '');
  }),
  // 14.10.2026 · שכיר: תקרה אחת 7% מהמשכורת (עד 116,400); הפקדת העובד קודם, הריסק ביתרה; רצפה 2,268 (research/pension-salary-ceilings §4.3)
  test('שכיר עם 6% לפנסיה וריסק: S1 (150,000) — הריסק לא מזכה; S1״ (100,000) — 250; S3 (30,000) — הרצפה: 117', () => {
    const emp = (salary: number) => {
      const c = client({ employeePensionPct: 6, rentalTaxTrack: 'regular' } as Partial<Client>);
      const d = draft({ cutoffMonth: 12, lines: [full('s', { label: 'משכורת', actualToCutoff: salary })], it: { via: 'manual', method: 'none', frequency: 1, periods: [] }, ni: { via: 'manual' } });
      const w = computeEstimate({ ...d, credits: [{ person: 'client', lifeInsurance: salary === 30_000 ? 1_200 : 2_400 }] }, { client: c, taxYear: 2026 }).persons[0].incomeTax;
      const wo = computeEstimate(d, { client: c, taxYear: 2026 }).persons[0].incomeTax;
      return wo - w;
    };
    const lifeDetail = (salary: number, premium: number) => {
      const c = client({ employeePensionPct: 6, rentalTaxTrack: 'regular' } as Partial<Client>);
      const d = draft({ cutoffMonth: 12, lines: [full('s', { label: 'משכורת', actualToCutoff: salary })], it: { via: 'manual', method: 'none', frequency: 1, periods: [] }, ni: { via: 'manual' }, credits: [{ person: 'client', lifeInsurance: premium }] });
      return computeEstimate(d, { client: c, taxYear: 2026 }).checks?.find(x => x.id === 'life-client')?.detail ?? '';
    };
    near(emp(150_000), 0, 1, 'S1');
    near(emp(100_000), 250, 1, 'S1״ — 25% × 1,000');
    // S3: המס כבר 0 אחרי נקודות הזיכוי — בודקים את הסכום המזכה, לא את המס
    const d3 = lifeDetail(30_000, 1_200);
    assert(d3.includes('לביטוח החיים 468'), d3);
  }),
  // 14.10.2026 · שינוי מקדמה — ארבע שורות נפרדות (research/advances-topup-charges §ד): הפרש מחושב לפי הנוסחה, הצמדה/ריבית/קנס במעמד שלהן
  test('שינוי מקדמה: ב״ל — «הגדלת מקדמות» = (חדש − ישן) × חודשים שעברו, הצמדה «צפויה», אין ריבית, קנס «הסבר»; מ״ה — השלמה = הפרש השיעור × המחזור שדווח, בלי ריבית בתוך השנה', () => {
    const per = (m: number) => ({ period: `2026-${String(m).padStart(2, '0')}`, state: 'reported' as const, turnover: 40_000, paid: 400 });
    const d = draft({ it: { via: 'manual', readOn: '2026-10-10', method: 'turnoverRate', ratePct: 1, frequency: 1, periods: Array.from({ length: 9 }, (_, i) => per(i + 1)) },
      ni: { via: 'manual', readOn: '2026-10-10', monthlyAdvance: 500, paidToCutoff: 4_500 } });
    const o = computeEstimate(d, Y);
    const ni = o.advances.find(a => a.authority === 'ni')!, it = o.advances.find(a => a.authority === 'it')!;
    const niLines = Object.fromEntries((ni.changeCharges ?? []).map(c => [c.kind, c]));
    equal(niLines.difference.amount, (Math.round(ni.recommended!) - 500) * 9);
    equal(niLines.linkage.status, 'expected'); equal(niLines.interest.amount, 0); equal(niLines.fine.status, 'explain');
    const itLines = Object.fromEntries((it.changeCharges ?? []).map(c => [c.kind, c]));
    near(itLines.difference.amount!, 9 * 40_000 * (it.recommended! - 1) / 100, 1, 'השלמה מרצון');
    equal(itLines.interest.amount, 0); equal(itLines.fine.amount, 0);
    assert(itLines.linkage.text.includes('31.1') && itLines.fine.text.includes('0.2%'), 'הקלת 187א; קנס הפיגורים אינו חל על מקדמות');
  }),
  test('ביטוח חיים כשהפנסיה תפסה את התקרה: הפקדה 25,000 ⇒ בסיס זיכוי הפנסיה 8,220 = כל התקרה; הריסק לא מזכה', () => {
    const d = draft({ credits: [{ person: 'client', lifeInsurance: 3_000 }], savings: [{ person: 'client', pensionToCutoff: 25_000 }] });
    const withPension = computeEstimate({ ...d, credits: [] }, Y).persons[0].incomeTax;
    const o = computeEstimate(d, Y);
    equal(o.persons[0].incomeTax, withPension);
    assert(!!o.checks?.find(x => x.id === 'life-client')?.detail.includes('הריסק לא מזכה'), 'הסבר ללקוח');
  }),

  // 14.10.2026 · עמית מוטב (45א(ה)) — דוגמאות B1–B3 שחושבו ביד במחקר (research/pension-salary-ceilings §5.3), שנת 2025
  test('עמית מוטב, עצמאי בלבד: B1 (הפקדה 30,000) — הריסק לא מזכה; B2 (26,000, הכנסה מעל 232,800) — נשארים 375 ⇒ זיכוי 93.75; 2026 — 0', () => {
    const lifeGain = (deposit: number, income: number, year: number) => {
      const d = draft({ cutoffMonth: 12, lines: [biz({ actualToCutoff: income, turnoverToCutoff: income, office: { method: 'none' }, turnoverForecast: 0 })],
        savings: [{ person: 'client', pensionToCutoff: deposit }], credits: [{ person: 'client', lifeInsurance: 3_000 }] });
      const Yy = { client: client(), taxYear: year };
      const o = computeEstimate(d, Yy);
      return { gain: computeEstimate({ ...d, credits: [] }, Yy).persons[0].incomeTax - o.persons[0].incomeTax, check: o.checks?.find(x => x.id === 'life-client') };
    };
    const b1 = lifeGain(30_000, 200_000, 2025);
    near(b1.gain, 0, 1, 'B1'); assert(!!b1.check?.detail.includes('45א(ה)') && b1.check.status === 'noSaving', JSON.stringify(b1.check));
    near(lifeGain(26_000, 280_000, 2025).gain, 93.75, 1, 'B2 — 25% × (11,640 − 11,265)');
    near(lifeGain(30_000, 280_000, 2026).gain, 0, 1, '2026: הרף 26,436 ⇒ 13,632 לזיכוי, מעל 11,640');
  }),
  test('עמית מוטב, שכיר עם שכירות (B3): בחישוב 348 ⇒ 87; השנוי במחלוקת (2,500 ⇒ 625) מוצג בנפרד, לא נבחר', () => {
    const c = client({ employeePensionPct: 6, rentalTaxTrack: 'regular' } as Partial<Client>);
    const d = draft({ cutoffMonth: 12, lines: [full('s', { label: 'משכורת', actualToCutoff: 130_000 }), full('r', { source: 'rent', label: 'שכירות', actualToCutoff: 50_000 })],
      it: { via: 'manual', method: 'none', frequency: 1, periods: [] }, ni: { via: 'manual' },
      savings: [{ person: 'client', insuredSalary: 130_000, employeeDeposits: 7_800, employerDeposits: 19_279 }], credits: [{ person: 'client', lifeInsurance: 4_000 }] });
    const Yy = { client: c, taxYear: 2025 };
    const o = computeEstimate(d, Yy);
    const ch = o.checks?.find(x => x.id === 'life-client');
    near(computeEstimate({ ...d, credits: [] }, Yy).persons[0].incomeTax - o.persons[0].incomeTax, 87, 1, 'R2 — החלק שאינו שנוי במחלוקת');
    equal(ch?.status, 'undecided');
    assert(o.limits.some(x => x.includes('עד 625')), JSON.stringify(o.limits));
    // ‼ גם ללקוח (גיא, 14.10.2026): תרחיש פתוח לא מוצג כתוצאה סופית — בסיכום, בקובץ ובדף האישי, עם ההשפעה
    equal(o.openQuestions?.[0]?.impact, 625);
    const m = buildSummary({ clientName: 'דוד', taxYear: 2025, version: 1, draft: d, outputs: o });
    assert(m.open.some(x => x.includes('625')) && !!m.openNote, JSON.stringify(m.open));
    const html = summaryHtml(m);
    assert(html.includes('מה עוד לא הוכרע') && html.includes('625') && html.includes('שאלה מקצועית שעוד לא הוכרעה'), 'הקובץ ללקוח ודף הלקוח (אותו HTML)');
    // B3׳ — אותו אדם בלי הפקדות מעביד מעל הרף (45א(ד)): תקרה 10,548, לביטוח החיים 2,748 ⇒ 687
    const d2 = { ...d, savings: [{ person: 'client' as const, insuredSalary: 130_000, employeeDeposits: 7_800, employerDeposits: 8_000 }] };
    near(computeEstimate({ ...d2, credits: [] }, Yy).persons[0].incomeTax - computeEstimate(d2, Yy).persons[0].incomeTax, 687, 1, 'B3׳');
  }),
  test('תרומות: 207 בדיוק — אין זיכוי; 208 — זיכוי 35% (72.8)', () => {
    const td = getTaxYearData(2026)!;
    const input = (d: number): TaxCalcInput => ({ client: client({ incomeTaxType: 'employee' } as Partial<Client>), year: 2026, grossSalary: 200_000, employeePensionPct: 0, selfEmployedGrossIncome: 0, recognizedExpenses: 0,
      selfEmployedPensionAmount: 0, rentalIncome: 0, rentalExpenses: 0, rentalTaxTrack: 'regular', otherIncome: 0, donationsSection46: d, krenHashtalmutSE: 0,
      overrideCreditPoints: false, manualCreditPoints: 0 } as unknown as TaxCalcInput);
    const t0 = calculateTax(input(0), td).totalTaxBurden;
    equal(calculateTax(input(207), td).totalTaxBurden, t0);
    near(t0 - calculateTax(input(208), td).totalTaxBurden, 72.8, 0.5, 'זיכוי על 208');
  }),

  test('הכנסה הונית — בלי סוג: חוסם (לא מנחשים 25%)', () => {
    const o = computeEstimate(draft({ lines: [biz(), full('i1', { source: 'capital', label: 'ריבית בבנק', actualToCutoff: 10_000 })] }), Y);
    assert(o.blockers.some(b => b.code === 'capital_kind_missing'), 'חוסם');
  }),

  test('הכנסה הונית לפי סוג: ריבית לא צמודה 15% (1,500 על 10,000); דיבידנד מחברה מהותית 30% (3,000); רווח הון 25%', () => {
    const base = computeEstimate(draft({ decisions: capDecisions }), Y).persons[0].incomeTax;
    const with_ = (kind: IncomeLine['capitalKind']) => computeEstimate(draft({ decisions: capDecisions, lines: [biz(), full('c1', { source: 'capital', label: 'הון', actualToCutoff: 10_000, capitalKind: kind })] }), Y);
    near(with_('interestUnlinked').persons[0].incomeTax - base, 1_500, 1, 'ריבית 15%');
    near(with_('dividendSubstantial').persons[0].incomeTax - base, 3_000, 1, 'דיבידנד מהותי 30%');
    near(with_('gains').persons[0].incomeTax - base, 2_500, 1, 'רווח הון 25%');
    // ‼ דגל «בעל מניות מהותי» של הלקוח אינו מחיל 30% על הכול — רק השורה שסווגה כך
    const flagged = computeEstimate(draft({ decisions: capDecisions, lines: [biz(), full('c1', { source: 'capital', label: 'הון', actualToCutoff: 10_000, capitalKind: 'interestUnlinked' })] }), { client: client({ isSubstantialShareholder: true } as Partial<Client>), taxYear: 2026 });
    near(flagged.persons[0].incomeTax - base, 1_500, 1, 'דגל הלקוח לא משנה ריבית מבנק');
  }),

  // 14.10.2026: הסעיפים 91, 125ב, 125ג לא תוקנו מאז 2017/2012 (תגיות התיקון בנוסח) ⇒ 2026 נגזר מ-2025 הראשי — בלי הכרעת משרד
  test('הכנסה הונית 2026: השיעור נגזר מחוק שלא תוקן — מחושב בלי «הכרעת משרד» (ריבית לא צמודה 15%)', () => {
    const base = computeEstimate(draft(), Y).persons[0].incomeTax;
    const o = computeEstimate(draft({ lines: [biz(), full('c1', { source: 'capital', label: 'הון', actualToCutoff: 10_000, capitalKind: 'interestUnlinked' })] }), Y);
    assert(!o.blockers.some(b => b.code === 'rule_not_verified'), JSON.stringify(o.blockers.map(b => b.code)));
    near(o.persons[0].incomeTax - base, 1_500, 2, '15% × 10,000');
  }),

  test('ריבית מחברה שבשליטתו — במדרגות הרגילות (שולי 35% כאן), לא 15%/25%', () => {
    const base = computeEstimate(draft(), Y).persons[0].incomeTax;
    const o = computeEstimate(draft({ lines: [biz(), full('c1', { source: 'capital', label: 'ריבית מהחברה', actualToCutoff: 10_000, capitalKind: 'interestOwnCompany' })] }), Y);
    near(o.persons[0].incomeTax - base, 3_500, 2, 'בשולי 35%');
  }),

  test('בני זוג ששניהם עובדים: בלי סימון מקור משותף — חוסם ו«טרם בוצעה»; «אין מקור משותף» — הושווה במספרים; מקור משותף בלי התנאים — מאוחד מחושב', () => {
    const lines = [full('s1', { label: 'משכורת', actualToCutoff: 225_000, office: { method: 'runRate' } }), full('s2', { person: 'spouse', label: 'משכורת בת הזוג', actualToCutoff: 75_000, office: { method: 'runRate' } })];
    const Ym = { client: married, taxYear: 2026 };
    const o1 = computeEstimate(draft({ lines }), Ym);
    assert(o1.blockers.some(b => b.code === 'spouse_source_unknown') && o1.household.incomplete, 'חוסם, ומס משק הבית «חסר»');
    equal(o1.checks?.find(c => c.id === 'spouse-calc')?.status, 'notCompared');
    const o2 = computeEstimate(draft({ lines, spouseSource: 'none' }), Ym);
    assert(!o2.blockers.some(b => b.code === 'spouse_source_unknown'), 'לא חוסם');
    equal(o2.checks?.find(c => c.id === 'spouse-calc')?.status, 'compared');
    assert(o2.spouseCalc?.separate != null && o2.spouseCalc.jointLow > 0, JSON.stringify(o2.spouseCalc));
    const o3 = computeEstimate(draft({ lines, spouseSource: 'dependentNotMet' }), Ym);
    equal(o3.spouseCalc?.separate, null);
    assert(o3.spouseCalc?.applies === 'joint' && !o3.partial.some(p => p.code === 'joint_required'), 'המאוחד מחושב — לא «ביד»');
  }),

  test('שכ״ד אצל בן הזוג עם היגיעה הנמוכה — חוסם; רכוש מלפני הנישואים — מותר', () => {
    const Ym = { client: { ...married, rentalTaxTrack: 'flat10' } as Client, taxYear: 2026 };
    const lines = (attr?: IncomeLine['attribution']) => [
      full('s1', { label: 'משכורת', actualToCutoff: 225_000, office: { method: 'runRate' } }),
      full('s2', { person: 'spouse', label: 'משכורת בת הזוג', actualToCutoff: 75_000, office: { method: 'runRate' } }),
      full('r1', { person: 'spouse', source: 'rent', label: 'דירה בחיפה', actualToCutoff: 45_000, office: { method: 'runRate' }, attribution: attr }),
    ];
    assert(computeEstimate(draft({ lines: lines(), spouseSource: 'none' }), Ym).blockers.some(b => b.code === 'passive_attribution'), 'חוסם');
    assert(!computeEstimate(draft({ lines: lines('premarital'), spouseSource: 'none' }), Ym).blockers.some(b => b.code === 'passive_attribution'), 'מלפני הנישואים — מותר');
  }),

  test('בעל שליטה: משיכות והלוואה מהחברה — «לא חושב, ביד», והסיכום חלקי', () => {
    const o = computeEstimate(draft({ controlling: [{ person: 'client', company: 'כהן בע״מ', withdrawals: true, loans: true }] }), Y);
    assert(o.partial.some(p => p.code === 'ctrl_withdrawals') && o.partial.some(p => p.code === 'ctrl_loans'), 'שני הפריטים');
    assert(o.household.partial, 'חלקי');
  }),
];
