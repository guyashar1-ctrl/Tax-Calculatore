// ─── חישובים על המרשם ────────────────────────────────────────────────────────
// כל פונקציה עוברת בשער (registry.gate). אם השער נכשל — אין value, יש problems.
// ‼ אלה אבני בניין לידע ולהערכת המס, לא חישוב מס שלם. מה שלא מומש כאן (מסלול
// ב׳, גיל 50, הכנסה מזערית בב״ל) מחזיר בעיה במקום תוצאה שנראית מלאה.

import { gate, num, usedRule } from './registry';
import type { GatedResult, GateProblem, Scenario } from './types';
import type { GateMode } from './registry';

/**
 * אילו כללים כל חישוב קורא — לבדיקת השפעה כשכלל משתנה.
 * ‼ חישוב חדש נרשם כאן; בדיקת יחידה מוודאת שהרשימה תואמת את מה שהחישוב שומר.
 */
const SE_PENSION_RULES = ['pen.qualifying.nonWork', 'pen.qualifying.work', 'pen.additionalIncome.ceiling', 'pen.trackA.baseRate', 'pen.trackA.extraThreshold',
  'pen.trackA.extraRate', 'pen.beneficial.threshold', 'pen.trackB.tier1Rate', 'pen.credit.rate', 'pen.credit.nonWorkRate', 'pen.credit.extraRate', 'pen.credit.extraCeiling'];

export const CALC_RULES: Record<string, { label: string; ruleIds: string[] }> = {
  studyFundLimit: { label: 'מרחב הניכוי לקרן השתלמות', ruleIds: ['sf.se.rate', 'sf.se.ceiling', 'sf.mixed.formula'] },
  pensionTrackA: { label: 'ניכוי פנסיה, מסלול א׳', ruleIds: ['pen.qualifying.nonWork', 'pen.trackA.baseRate', 'pen.trackA.extraThreshold', 'pen.trackA.extraRate', 'pen.trackB'] },
  beneficialMember: { label: 'בדיקת עמית מוטב', ruleIds: ['pen.beneficial.threshold'] },
  selfEmployedPension: { label: 'פנסיה לעצמאי — ניכוי וזיכוי (מסלול א׳/ב׳)', ruleIds: SE_PENSION_RULES },
  niSelfEmployedQuarter: { label: 'ב״ל לעצמאי לרבעון', ruleIds: ['ni.se.lowRateNi', 'ni.se.highRateNi', 'ni.se.lowRateHealth', 'ni.se.highRateHealth', 'ni.se.reducedThreshold', 'ni.se.deductionShare'] },
  wealthDeadline: { label: 'הצהרת הון — הרצפה למועד שבדרישה', ruleIds: ['wealth.deadlineDays'] },
  microBusiness: { label: 'עסק זעיר', ruleIds: ['micro.turnoverCeiling', 'micro.normativeRate', 'micro.exceededCap', 'micro.coolingYears'] },
};

function result<T>(ids: string[], year: number, scenario: Scenario, mode: GateMode, compute: () => T): GatedResult<T> {
  const { hard, soft } = gate(ids, year, scenario, mode);
  // ‼ נשמר מה שנכנס בפועל — שנת הערך והביסוס שלו, לא השנה שביקשו.
  const usedRules = ids.map(id => usedRule(id, year));
  if (hard.length) return { ok: false, usedRules: [], problems: hard, illustrative: false };
  return { ok: true, value: compute(), usedRules, problems: soft, illustrative: soft.length > 0 };
}

export interface StudyFundLimit {
  ceiling: number;
  /** כמה מהתקרה «נוצל» כבר ע״י המעביד. */
  usedByEmployer: number;
  /** «סכום התקרה» — בסיס הניכוי כעצמאי. */
  cap: number;
  maxDeduction: number;
  /** כמה מההפקדה ינוכה בפועל. */
  deducted: number;
}

/**
 * מרחב הניכוי לקרן השתלמות לעצמאי, כולל שכיר־עצמאי (מדריך 2025, סעיפים 51 עד 52):
 * סכום התקרה = הנמוך מבין ההכנסה מעסק לבין התקרה פחות המשכורת הקובעת.
 */
export function studyFundLimit(input: { year: number; businessIncome: number; employerDeterminingSalary: number; deposit?: number }, mode: GateMode = 'calculation'): GatedResult<StudyFundLimit> {
  const scenario: Scenario = { selfEmployed: true, employee: input.employerDeterminingSalary > 0, employerStudyFund: input.employerDeterminingSalary > 0 };
  const ids = ['sf.se.rate', 'sf.se.ceiling'];
  // ‼ נוסח השכיר־עצמאי הוא כלל בפני עצמו: השער בודק שהוא חל ושהוא מבוסס לשנה הזו.
  if (input.employerDeterminingSalary > 0) ids.push('sf.mixed.formula');
  return result(ids, input.year, scenario, mode, () => {
    const ceiling = num('sf.se.ceiling', input.year);
    const rate = num('sf.se.rate', input.year);
    const usedByEmployer = Math.min(Math.max(0, input.employerDeterminingSalary), ceiling);
    const cap = Math.max(0, Math.min(Math.max(0, input.businessIncome), ceiling - usedByEmployer));
    const maxDeduction = Math.round(cap * rate);
    const deducted = Math.min(Math.max(0, input.deposit ?? 0), maxDeduction);
    return { ceiling, usedByEmployer, cap, maxDeduction, deducted };
  });
}

export interface TrackAResult { qualifying: number; baseDeduction: number; extraDeduction: number; deduction: number; toCredit: number }

/**
 * פנסיה, מסלול א׳, למי שאין לו הכנסת עבודה ושטרם מלאו לו 50 (מדריך 2025, סעיף 53):
 * 7% מההכנסה המזכה, ועוד עד 4% אם ההפקדה עולה על 12% ממנה. מה שלא נוכה — לזיכוי.
 * ‼ שכיר, מסלול ב׳ וגיל 50 נחסמים בשער: לא מומשו.
 */
export function pensionTrackA(input: { year: number; nonWorkIncome: number; deposits: number; scenario: Scenario }, mode: GateMode = 'calculation'): GatedResult<TrackAResult> {
  const scenario: Scenario = { ...input.scenario };
  // ‼ החישוב כאן נכון רק למי שאין לו משכורת ואינו עמית מוטב — אחרת אין תוצאה.
  const extraProblems: GateProblem[] = [];
  if (scenario.noWorkIncome !== true) extraProblems.push({ kind: scenario.noWorkIncome === false ? 'outOfScope' : 'unknownScenario', ruleId: 'pen.qualifying.nonWork', tag: 'noWorkIncome' });
  if (scenario.beneficialMember === true) extraProblems.push({ kind: 'outOfScope', ruleId: 'pen.trackB', tag: 'beneficialMember' });
  const r = result(['pen.qualifying.nonWork', 'pen.trackA.baseRate', 'pen.trackA.extraThreshold', 'pen.trackA.extraRate'], input.year, scenario, mode, () => {
    const qualifying = Math.min(Math.max(0, input.nonWorkIncome), num('pen.qualifying.nonWork', input.year));
    const base = qualifying * num('pen.trackA.baseRate', input.year);
    const threshold = qualifying * num('pen.trackA.extraThreshold', input.year);
    const extraCap = qualifying * num('pen.trackA.extraRate', input.year);
    const extra = Math.min(Math.max(0, input.deposits - threshold), extraCap);
    const deduction = Math.round(Math.min(input.deposits, base + extra));
    return { qualifying, baseDeduction: Math.round(base), extraDeduction: Math.round(extra), deduction, toCredit: Math.max(0, Math.round(input.deposits - deduction)) };
  });
  if (extraProblems.length) return { ok: false, usedRules: [], problems: [...extraProblems, ...r.problems], illustrative: false };
  return r;
}

export interface SePensionInput {
  year: number;
  /** הכנסה מזכה שאינה מעבודה: הכנסה חייבת מעסק/משלח יד אחרי קרן השתלמות ואובדן כושר — לפני ב״ל ולפני הפנסיה. */
  nonWorkIncome: number;
  /** ההכנסה מעסק (לזיכוי הנוסף 0.5%). */
  businessIncome: number;
  /** הכנסת עבודה (משכורת) בשנה. */
  salary: number;
  /** ההכנסה המבוטחת (244/245). undefined = לא ידוע — חוסם כשיש משכורת. */
  insuredSalary?: number;
  /** הפקדות כעמית עצמאי — «הסכום ששולם» (135/180). */
  ownDeposits: number;
  /** הפקדות העובד והמעביד (כולל פיצויים) מטופס 106 — לבדיקת עמית מוטב (045, 248). */
  employeeDeposits?: number;
  employerDeposits?: number;
  /** הגיל ב-1.1 של שנת המס. undefined = לא ידוע. */
  ageOnJan1?: number;
  /** נדרש ניכוי ביטוח אובדן כושר — שולל את הזיכוי הנוסף 0.5%. */
  disabilityDeduction?: boolean;
  /** «מסלול א׳» במקום ב׳ לעמית מוטב (סימון 233/234 בהגשה). */
  forceTrackA?: boolean;
}
export interface SePensionTrack { track: 'A' | 'B'; deduction: number; creditBase: number; extraCreditBase: number; explain: string[] }
export interface SePensionResult extends SePensionTrack { beneficial: boolean; totalDeposits: number; credit: number; alternative?: SePensionTrack }

const heN = (x: number) => Math.round(x).toLocaleString('he-IL');

/**
 * פנסיה לעמית עצמאי — הניכוי (סעיף 47) והזיכוי (סעיף 45א) לפי פרק ד במדריך 2025 (סעיפים 53, 76).
 * ‼ לא «11% ניכוי + 5.5% זיכוי» גורף:
 *   מסלול א׳ — קודם ניכוי 7% מההכנסה המזכה, אחר כך זיכוי עד 5%, ואז תוספת ניכוי עד 4% רק על מה שמעל 12%;
 *   זיכוי נוסף 0.5% רק בלי ניכוי אובדן כושר, עם הכנסה מעסק ויתרת הפקדה. משכורת מקטינה את תקרת ההכנסה המזכה.
 *   מסלול ב׳ (עמית מוטב: כל ההפקדות בגינו ≥ הרף) — שני רבדים; רשות המסים בוחרת בו כברירת מחדל.
 * ‼ לא מחושב (בעיה, לא תוצאה): גיל 50 ומעלה (כלל פתוח), משכורת בלי הכנסה מבוטחת ידועה, ומשכורת שאינה מבוטחת
 *   במסלול א׳ (ניכוי 5% להכנסת עבודה — לא מומש). בדוח נרשם ב-135/180 כל הסכום ששולם; רשות המסים מפצלת.
 */
export function selfEmployedPension(input: SePensionInput, mode: GateMode = 'calculation'): GatedResult<SePensionResult> {
  const extra: GateProblem[] = [];
  if (input.ageOnJan1 == null) extra.push({ kind: 'unknownScenario', ruleId: 'pen.trackA.age50', tag: 'under50' });
  const age50 = input.ageOnJan1 != null && input.ageOnJan1 >= 50;
  // ‼ 14.10.2026 (research/pension-salary-ceilings): גיל 50 עם משכורת — מחושב (מסמך הרשות 2005, דוגמה י״א). פתוח רק המקרה הצר:
  //   מגיל 50, משכורת מעל 291,000 עם חלק לא מבוטח — האם 7.5% חל גם על המגבלה השנייה של 47(ב)(2)(ב). רק התרחיש הזה לא מחושב.
  if (age50 && input.salary > 0 && input.insuredSalary != null && input.salary > input.insuredSalary) {
    try { if (input.salary > num('pen.additionalIncome.ceiling', input.year)) extra.push({ kind: 'outOfScope', ruleId: 'pen.trackA.age50', tag: 'age50plusWithSalary' }); } catch { /* השער ידווח */ }
  }
  if (input.salary > 0 && input.insuredSalary == null) extra.push({ kind: 'unknownScenario', ruleId: 'pen.qualifying.work', tag: 'insuredSalary' });
  // עמית מוטב נקבע לפני השער: כללי מסלול ב׳ נכנסים רק כשהוא חל
  let isBeneficial = false;
  try { isBeneficial = Math.max(0, input.ownDeposits) + Math.max(0, input.employeeDeposits ?? 0) + Math.max(0, input.employerDeposits ?? 0) >= num('pen.beneficial.threshold', input.year); } catch { /* השער ידווח */ }
  if (age50 && isBeneficial && input.forceTrackA) extra.push({ kind: 'outOfScope', ruleId: 'pen.trackA.age50', tag: 'age50plusBeneficialTrackA' });
  const age50A = age50 && !isBeneficial;
  const uninsured = input.salary > 0 && (input.insuredSalary ?? 0) < input.salary;
  const ids = [...SE_PENSION_RULES.filter(id => id !== 'pen.trackB.tier1Rate' || isBeneficial), 'credit.45a.workRate',
    ...(uninsured ? ['pen.trackA.workRate'] : []), ...(age50A ? ['pen.trackA.age50.baseRate', 'pen.trackA.age50.extraRate', ...(uninsured ? ['pen.trackA.age50.workRate'] : [])] : [])];
  const scenario = { under50: input.ageOnJan1 != null && input.ageOnJan1 < 50, age50plus: age50, beneficialMember: isBeneficial, notBeneficialMember: !isBeneficial, noWorkIncome: input.salary <= 0, selfEmployed: true };
  const r = result(ids, input.year, scenario, mode, () => {
    const y = input.year, n = (id: string) => num(id, y);
    const D = Math.max(0, input.ownDeposits), W = Math.max(0, input.salary), I = Math.max(0, Math.min(input.insuredSalary ?? 0, W));
    const nonWork = Math.max(0, input.nonWorkIncome), T = nonWork + W;
    const qWork = n('pen.qualifying.work'), base = n('pen.trackA.baseRate'), thr = n('pen.trackA.extraThreshold'), top = n('pen.trackA.extraRate');
    const credRate = n('pen.credit.nonWorkRate'), extraRate = n('pen.credit.extraRate'), extraCeil = n('pen.credit.extraCeiling');
    const totalDeposits = D + Math.max(0, input.employeeDeposits ?? 0) + Math.max(0, input.employerDeposits ?? 0);
    const threshold = n('pen.beneficial.threshold');
    const beneficial = totalDeposits >= threshold;
    const r0 = (x: number) => Math.round(x);
    const trackA = (): SePensionTrack => {
      const capQ = n('pen.qualifying.nonWork');
      const QIw = Math.min(W, qWork);
      const Q = Math.max(0, Math.min(nonWork, capQ - QIw));
      // ‼ 14.10.2026 · שלב 1 — 47(ב)(2): ניכוי בשל משכורת שאינה מבוטחת (5%; מגיל 50 — 7.5%, עד 5% × 116,400). נחשב ראשון.
      //   עוגנים: מדריך 2025 דוגמה 3 (9,500); מסמך הרשות 2005 דוגמאות ט (4,260) ו-י״א (7,914).
      const U = Math.max(0, W - I), Uq = Math.min(U, qWork);
      const rW = U > 0 ? (age50A ? n('pen.trackA.age50.workRate') : n('pen.trackA.workRate')) : 0;
      const L2 = rW * Math.max(0, Math.min(W, n('pen.additionalIncome.ceiling')) - I);
      const dW = U > 0 ? Math.min(D, rW * Uq, L2, age50A ? n('pen.trackA.workRate') * qWork : Infinity) : 0;
      const Pr = D - dW;
      // שלב 2 — 47(ב)(1) מתוך היתרה. מגיל 50 (תקנה 2): 10.5% ועוד עד 6%, בתוך אותן תקרות בשקלים (7% ו-11% × 164,400) — לא מוקטנות במשכורת
      const rB = age50A ? n('pen.trackA.age50.baseRate') : base, rX = age50A ? n('pen.trackA.age50.extraRate') : top;
      const d7 = age50A ? Math.min(Pr, rB * Q, base * capQ) : Math.min(Pr, base * Q);
      // ‼ הסף לרובד הנוסף מושווה לכל ההפקדה (D), לא ליתרה — כך יוצאת דוגמה 3 במדריך (9,500)
      const thrAmount = age50A ? d7 + credRate * Q : thr * Q;
      const topUp = Math.min(Math.max(0, D - thrAmount), rX * Q, age50A ? Math.max(0, (base + top) * capQ - d7) : Infinity, Math.max(0, Pr - d7));
      const deduction = dW + d7 + topUp;
      // 45א — תקרה אחת: 7% מהכנסת עבודה + 5% מהכנסה אחרת; הפקדות העובד (106) תופסות את חלק העבודה קודם (מדריך 2025 דוגמה 2, עמ׳ 69)
      const workRoom = W > 0 ? n('credit.45a.workRate') * QIw : 0;
      const empUsed = Math.min(Math.max(0, input.employeeDeposits ?? 0), workRoom);
      const creditBase = Math.min(Math.max(0, D - deduction), Math.max(0, workRoom + credRate * Q - empUsed));
      const left = D - deduction - creditBase;
      const extraCreditBase = !input.disabilityDeduction && input.businessIncome > 0 && left > 0 ? Math.min(left, extraRate * Math.max(0, Math.min(extraCeil - I, input.businessIncome))) : 0;
      return { track: 'A', deduction: r0(deduction), creditBase: r0(creditBase), extraCreditBase: r0(extraCreditBase), explain: [
        `${dW ? `ניכוי בשל משכורת שאינה מבוטחת (${age50A ? '7.5%' : '5%'}, 47(ב)(2)) = ${heN(dW)}; ` : ''}${age50A
          ? `מסלול א׳ מגיל 50 (תקנה 2): הכנסה מזכה ${heN(Q)}; ניכוי בסיסי 10.5% עד ${heN(base * capQ)} = ${heN(d7)}${topUp ? `, ניכוי נוסף (עד 6%, הכול עד ${heN((base + top) * capQ)}) = ${heN(topUp)}` : ''}; לזיכוי ${heN(creditBase)}${extraCreditBase ? ` + זיכוי נוסף על ${heN(extraCreditBase)}` : ''}. מהכנסה מזכה של ${heN(capQ)} ומעלה — אין שינוי לעומת מי שמתחת לגיל 50`
          : `מסלול א׳: הכנסה מזכה ${heN(Q)}${W > 0 ? ' (התקרה הוקטנה במשכורת)' : ''}; ניכוי 7% = ${heN(d7)}${topUp ? `, תוספת על מה שמעל 12% = ${heN(topUp)}` : ''}; לזיכוי ${heN(creditBase)}${extraCreditBase ? ` + זיכוי נוסף על ${heN(extraCreditBase)}` : ''}`}`] };
    };
    const trackB = (): SePensionTrack => {
      const tier1 = Math.min(D, n('pen.trackB.tier1Rate') * Math.max(0, Math.min(T, qWork) - I));
      const A = Math.max(0, Math.min(Math.min(T - I, qWork), Math.min(T, n('pen.additionalIncome.ceiling')) - Math.max(I, qWork)));
      const B2 = Math.max(0, Math.min(totalDeposits - threshold, D - tier1));
      const tier2 = Math.min(B2, base * A) + Math.min(Math.max(0, B2 - thr * A), top * A);
      const deduction = tier1 + tier2;
      const creditBase = Math.min(Math.max(0, D - deduction), credRate * Math.max(0, Math.min(T - I, extraCeil - Math.min(qWork, I))));
      return { track: 'B', deduction: r0(deduction), creditBase: r0(creditBase), extraCreditBase: 0, explain: [
        `מסלול ב׳ (עמית מוטב — הפקדות ${heN(totalDeposits)} ≥ ${heN(threshold)}): רובד א׳ ${heN(tier1)}, רובד ב׳ ${heN(tier2)} מ«הכנסה נוספת» ${heN(A)}; לזיכוי ${heN(creditBase)}. הזיכוי הנוסף 0.5% לא מוחל (לא אומת במסלול ב׳)`] };
    };
    const a = trackA(), b = beneficial ? trackB() : undefined;
    const chosen = b && !input.forceTrackA ? b : a;
    const alternative = b ? (chosen === b ? a : b) : undefined;
    const credit = r0(n('pen.credit.rate') * (chosen.creditBase + chosen.extraCreditBase));
    return { ...chosen, beneficial, totalDeposits: r0(totalDeposits), credit, alternative };
  });
  if (!r.ok) return extra.length ? { ...r, problems: [...extra, ...r.problems] } : r;
  // 14.10.2026: משכורת שאינה מבוטחת במסלול א׳ — מחושבת (שלב 1 למעלה); החסימה הוסרה
  if (extra.length) return { ok: false, usedRules: [], problems: [...extra, ...r.problems], illustrative: false };
  return r;
}

/** האם ההפקדות לקצבה מגיעות לרף עמית מוטב. */
export function beneficialMember(input: { year: number; pensionDeposits: number }, mode: GateMode = 'calculation'): GatedResult<{ threshold: number; reached: boolean; missing: number }> {
  return result(['pen.beneficial.threshold'], input.year, {}, mode, () => {
    const threshold = num('pen.beneficial.threshold', input.year);
    return { threshold, reached: input.pensionDeposits >= threshold, missing: Math.max(0, threshold - input.pensionDeposits) };
  });
}

export interface NiQuarter { base: number; reducedPart: number; regularPart: number; ni: number; health: number; total: number }

/**
 * ב״ל לעצמאי בגיל העבודה — הנוסחה הרבעונית מדף ב״ל (מ-01.01.2026):
 * בסיס = (הכנסה לרבעון + סף×3×0.52×(רגיל−מופחת)) ÷ (1 + רגיל×0.52).
 * ‼ מתחת לסף השיעור המופחת הנוסחה של ב״ל מעריכה ביתר; שם הבסיס הוא הכנסה ÷ (1 + מופחת×0.52)
 * — אותו כלל ניכוי, רק בלי חלק בשיעור הרגיל (נגזר, לא מפורסם כנוסחה).
 * ‼ הכנסה מזערית, תקרה, גיל פרישה ועיסוקים מעורבים — לא כאן.
 */
/**
 * בסיס דמי הביטוח לעצמאי (סעיף 345 + 47א): ההכנסה לב״ל היא ההכנסה אחרי ניכוי 52% מדמי הביטוח הלאומי עצמם.
 * נפתר לפי נוסחת ב״ל: מתחת לסף — הכנסה ÷ (1 + 0.52 × מופחת); מעליו — (הכנסה + 0.52 × (רגיל − מופחת) × סף) ÷ (1 + 0.52 × רגיל).
 * ‼ פונקציה אחת: הנושא (רבעון, כאן למטה), המחשבון הכללי (calcNI) והערכת המס. lowAvail = הסף שנותר בתקופה; שיעורים כשבר.
 */
export function niSelfEmployedBase(income: number, lowAvail: number, lowRate: number, highRate: number, share = 0.52): number {
  if (income <= 0) return 0;
  const low = income / (1 + share * lowRate);
  return low <= lowAvail ? low : (income + share * (highRate - lowRate) * lowAvail) / (1 + share * highRate);
}

export interface NiNonWork { reduced345: number; chargeable: number; lowPart: number; highPart: number; ni: number; health: number }

/**
 * דמי ביטוח על הכנסה שלא מעבודה (שכירות חייבת — 059, עצמאי שאינו עונה להגדרה, הכנסה פסיבית אחרת) — לשנה.
 * דף ב״ל «עובד עצמאי ובעל הכנסה שלא מעבודה» ו«שיעורי דמי ביטוח להכנסה שלא מעבודה» (2026):
 *   345 — X = Y ÷ (1 + 0.52 × שיעור רגיל); 348 — מפחיתים את הסכום הפטור (3,442 לחודש) — הפחתה, לא מצוק;
 *   על היתרה — שיעור מופחת בתוך מה שנשאר מהסף אחרי הכנסת העבודה (אצל עצמאי מעל הסף — כלום), ורגיל מעליו; עד התקרה.
 * ‼ פונקציה אחת: המחשבון הכללי (calcNI) והערכת המס. כל הסכומים שנתיים; שיעורים כשבר.
 */
export function niNonWorkIncome(i: { income: number; exempt: number; lowAvail: number; maxAvail: number; lowNi: number; highNi: number; health: number; share?: number }): NiNonWork {
  const zero = { reduced345: 0, chargeable: 0, lowPart: 0, highPart: 0, ni: 0, health: 0 };
  if (i.income <= 0) return zero;
  const reduced345 = i.income / (1 + (i.share ?? 0.52) * i.highNi);
  const chargeable = Math.max(0, Math.min(reduced345 - i.exempt, i.maxAvail));
  const lowPart = Math.min(chargeable, Math.max(0, i.lowAvail)), highPart = chargeable - lowPart;
  return { reduced345, chargeable, lowPart, highPart, ni: lowPart * i.lowNi + highPart * i.highNi, health: chargeable * i.health };
}

export function niSelfEmployedQuarter(input: { year: number; quarterlyIncome: number }, mode: GateMode = 'calculation'): GatedResult<NiQuarter> {
  const ids = ['ni.se.lowRateNi', 'ni.se.highRateNi', 'ni.se.lowRateHealth', 'ni.se.highRateHealth', 'ni.se.reducedThreshold', 'ni.se.deductionShare'];
  return result(ids, input.year, { beforeRetirementAge: true }, mode, () => {
    const y = input.year;
    const t1 = num('ni.se.lowRateNi', y), t2 = num('ni.se.highRateNi', y), z = num('ni.se.deductionShare', y);
    const m3 = num('ni.se.reducedThreshold', y) * 3;
    const base = Math.round(niSelfEmployedBase(input.quarterlyIncome, m3, t1, t2, z));
    const reducedPart = Math.min(base, m3);
    const regularPart = Math.max(0, base - m3);
    const ni = reducedPart * t1 + regularPart * t2;
    const health = reducedPart * num('ni.se.lowRateHealth', y) + regularPart * num('ni.se.highRateHealth', y);
    return { base, reducedPart, regularPart, ni: Math.round(ni * 10) / 10, health: Math.round(health * 10) / 10, total: Math.round(ni + health) };
  });
}

/** מועד הגשת הצהרת הון: 120 יום מהדרישה או מהיום הקובע — המאוחר. */
export function wealthDeadline(input: { demandDate: string; asOfDate: string }): GatedResult<string> {
  return result(['wealth.deadlineDays'], 2025, {}, 'calculation', () => {
    const days = num('wealth.deadlineDays', 2025);
    const later = new Date(Math.max(Date.parse(input.demandDate), Date.parse(input.asOfDate)));
    later.setUTCDate(later.getUTCDate() + days);
    return later.toISOString().slice(0, 10);
  });
}

/** שנה בהיסטוריית העסק הזעיר: האם ניכה 30% (שנת 87ד(ג) נחשבת «לא ניכה») והאם הייתה הכנסה מעסק. */
export interface MicroYear { year: number; deducted: boolean; hadBusinessIncome: boolean }

export interface MicroResult {
  /** המחזור בתקרה (≤) — תנאי אחד מתוך 87ב; שאר התנאים (87ה) נבדקים בנפרד. */
  eligibleByTurnover: boolean;
  /** 30% מהמחזור — בלי להתחשב בחריגה או בצינון (לשימוש בהסבר). */
  normativeExpenses: number;
  ceiling: number;
  rate: number;
  /** regular = בתקרה; exceeded87dc = חרג, רשום מתחילת השנה (87ד(ג)); exceededNoRelief = חרג בלי 87ד(ג); blockedCooling = צינון. */
  mode: 'regular' | 'exceeded87dc' | 'exceededNoRelief' | 'blockedCooling';
  /** הניכוי שמותר — 0 כשאין. ב-87ד(ג): 30% × תקרת השנה (מדויק, בלי עיגול). */
  deduction: number;
  deductionCap?: number;
  coolingBlockedBy?: { deductedIn: number; notDeductedIn: number };
  /** מה שלא ודאי בתוצאה (פתוח במקורות) — מוצג, לא מוסתר. */
  open: string[];
}

/**
 * עסק זעיר (87ב–87ז, מ-2024): ניכוי נורמטיבי, חריגה מהתקרה ו«צינון».
 * ‼ 87ד(ג): רק למי שהיה רשום בתחילת שנת המס; הניכוי עד 30% מתקרת «עוסק פטור» — לא 30% מהמחזור.
 *   הוצאות בפועל על היתרה לא משולבות (קריאה סבירה, לא כתוב בחוק): או הניכוי המוגבל, או הוצאות בפועל על הכול.
 * ‼ 87ה(ב): ניכה בשנה X, ובשנה X+1 הייתה הכנסה מעסק ולא ניכה ⇒ לא ינכה בשתי השנים שאחרי X+1.
 * ‼ המעמד במע״מ אינו קלט כאן — הזכאות לא נגזרת ממנו.
 */
export function microBusiness(input: { year: number; turnover: number; registeredAtYearStart?: boolean; history?: MicroYear[] }): GatedResult<MicroResult> {
  return result(['micro.turnoverCeiling', 'micro.normativeRate', 'micro.exceededCap', 'micro.coolingYears'], input.year, {}, 'calculation', () => {
    const y = input.year;
    const ceiling = num('micro.turnoverCeiling', y), rate = num('micro.normativeRate', y);
    const cool = num('micro.coolingYears', y);
    const open: string[] = [];
    const h = new Map((input.history ?? []).map(x => [x.year, x]));
    let coolingBlockedBy: MicroResult['coolingBlockedBy'];
    for (const x of input.history ?? []) {
      const next = h.get(x.year + 1);
      if (x.deducted && next && next.hadBusinessIncome && !next.deducted && y >= x.year + 2 && y <= x.year + 1 + cool) coolingBlockedBy = { deductedIn: x.year, notDeductedIn: x.year + 1 };
    }
    const base = { eligibleByTurnover: input.turnover <= ceiling, normativeExpenses: Math.round(input.turnover * rate), ceiling, rate, open };
    if (coolingBlockedBy) return { ...base, mode: 'blockedCooling' as const, deduction: 0, coolingBlockedBy };
    if (input.turnover <= ceiling) return { ...base, mode: 'regular' as const, deduction: Math.round(input.turnover * rate * 100) / 100 };
    if (input.registeredAtYearStart === true) {
      const cap = Math.round(ceiling * num('micro.exceededCap', y) * 100) / 100;
      open.push('87ד(ג) בדוח המקוון: במדריך 2025 השידור חוסם מחזור מעל התקרה עם סימון «עסק זעיר» — דרך הדיווח לא ידועה (טיפול ידני)');
      return { ...base, mode: 'exceeded87dc' as const, deduction: cap, deductionCap: cap };
    }
    if (input.registeredAtYearStart == null) open.push('לא ידוע אם היה רשום כעסק זעיר בתחילת השנה — בלעדיו אין 87ד(ג)');
    else open.push('נרשם אחרי תחילת השנה — לפי לשון 87ד(ג) אין ניכוי מוגבל (לא הוכרע אם רישום מאמצע השנה חל מתחילתה)');
    return { ...base, mode: 'exceededNoRelief' as const, deduction: 0 };
  });
}
