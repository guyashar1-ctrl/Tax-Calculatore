// ─── דמי ביטוח לעצמאי: הכנסה ⇄ בסיס ⇄ מקדמה ──────────────────────────────────
// ‼ שש כמויות שונות, ואסור לבלבל ביניהן:
//
//   I  — ההכנסה המקורית (המוצהרת) לחודש, בשנת ההכנסה.        16,500
//   y  — אותה הכנסה אחרי קידום לשנת הביטוח (y = k·I).          16,584.15
//   b  — בסיס הביטוח החודשי, אחרי ניכוי 52% מדמי הביטוח הלאומי. 15,860.84
//   B  — הבסיס לתקופה כפי שהפורטל מציג (b·q, מעוגל).            47,583
//   N  — דמי הביטוח הלאומי על b;  H — דמי הבריאות על b.        1,390.98 · 670.57
//   מקדמה = N + H, מעוגלת לשקל.                                 2,062
//
// ‼ המנגנון:  b = k·I − D − 0.52·N(b)   ⇒   I = (b + 0.52·N(b) + D) / k
// ה-52% מנוכים מדמי הביטוח **הלאומי** בלבד — לא מדמי הבריאות.
//
// ‼ השחזור (B ⇒ I) אינו תמיד חד-ערכי: שנת מקור, מקדם קידום, ניכוי נוסף,
// תקרה, כמה מעמדות ועיגול — כל אחד מהם מוריד את הוודאות. התוצאה תמיד
// נושאת רמת ביטחון ורשימת סיבות, ולא מספר עירום.

import { getTaxYearData } from '../../data/taxData';
import { NI_ADVANCEMENT_FACTORS, NI_DEDUCTIBLE_SHARE_BY_YEAR } from '../../data/niContributionConfig';

/** הפרמטרים של שנת ביטוח אחת, בשברים (0.0447 ולא 4.47). */
export interface NiSelfEmployedYear {
  year: number;
  /** מדרגת הגבייה המופחתת לחודש. */
  thresholdMonthly: number;
  /** ההכנסה המרבית לחודש. */
  maxBasisMonthly: number;
  niLow: number;
  niHigh: number;
  healthLow: number;
  healthHigh: number;
  /** חלק דמי הביטוח הלאומי שמנוכה מההכנסה (0.52). */
  deductibleShare: number;
}

/** הפרמטרים לשנה — רק כשכולם ידועים. אחרת null, ולא הנחה משנה אחרת. */
export function niSelfEmployedYear(year: number): NiSelfEmployedYear | null {
  const td = getTaxYearData(year);
  const share = NI_DEDUCTIBLE_SHARE_BY_YEAR[year];
  if (!td || share == null) return null;
  const r = td.selfEmployedNI;
  return {
    year,
    thresholdMonthly: td.niThreshold60Monthly,
    maxBasisMonthly: td.niMaxIncomeMonthly,
    niLow: r.lowRate / 100,
    niHigh: r.highRate / 100,
    healthLow: r.healthLowRate / 100,
    healthHigh: r.healthHighRate / 100,
    deductibleShare: share,
  };
}

/** מקדם הקידום בין שנת ההכנסה לשנת הביטוח, רק כשאומת. */
export function niAdvancementFactor(insuranceYear: number, sourceIncomeYear: number): number | null {
  return NI_ADVANCEMENT_FACTORS[insuranceYear]?.[sourceIncomeYear] ?? null;
}

export interface NiComponents {
  /** דמי ביטוח לאומי (ללא בריאות) לחודש. */
  nationalInsurance: number;
  /** דמי ביטוח בריאות לחודש. */
  health: number;
  total: number;
}

/** דמי הביטוח על בסיס חודשי b — שני הרכיבים בנפרד. */
export function niComponents(b: number, cfg: NiSelfEmployedYear): NiComponents {
  const base = Math.max(0, Math.min(b, cfg.maxBasisMonthly));
  const low = Math.min(base, cfg.thresholdMonthly);
  const high = Math.max(0, base - cfg.thresholdMonthly);
  const nationalInsurance = cfg.niLow * low + cfg.niHigh * high;
  const health = cfg.healthLow * low + cfg.healthHigh * high;
  return { nationalInsurance, health, total: nationalInsurance + health };
}

/** הפורטל מציג בסיס ומקדמה בשקלים שלמים. אומת: 47,582.53⇒47,583 · 2,061.54⇒2,062. */
export function niDisplayRound(x: number): number {
  return Math.round(x);
}

/**
 * «7-9», «9-7», «7–9» ⇒ חודשים 7..9, q=3. הסדר בטקסט לא קובע: בעמוד RTL
 * הטווח עשוי להיכתב הפוך, ולכן לוקחים מינימום ומקסימום. חודש יחיד ⇒ q=1.
 */
export function normalizeNiPeriod(text: string): { fromMonth: number; toMonth: number; months: number } | null {
  const nums = (String(text).match(/\d{1,2}/g) ?? []).map(Number).filter(n => n >= 1 && n <= 12);
  if (nums.length === 0 || nums.length > 2) return null;
  const fromMonth = Math.min(...nums);
  const toMonth = Math.max(...nums);
  return { fromMonth, toMonth, months: toMonth - fromMonth + 1 };
}

// ─── קדימה: הכנסה ⇒ בסיס ⇒ מקדמה ─────────────────────────────────────────────

export interface NiForwardInput {
  originalMonthlyIncome: number;
  insuranceYear: number;
  sourceIncomeYear: number;
  /** כמה חודשים מייצג הבסיס המוצג (רבעון = 3). */
  months: number;
  /** ניכוי נוסף ידוע, לחודש. חסר ⇒ 0 — וזה מסומן כהנחה. */
  additionalDeduction?: number;
}

export interface NiForwardResult {
  ok: true;
  advancementFactor: number;
  /** y — ההכנסה אחרי קידום, לפני ניכוי ה-52%. */
  advancedIncome: number;
  /** b — בסיס הביטוח החודשי. */
  monthlyBasis: number;
  /** b·q — לפני עיגול. */
  periodBasis: number;
  /** כפי שהפורטל יציג. */
  periodBasisDisplayed: number;
  components: NiComponents;
  advanceMonthly: number;
  advanceDisplayed: number;
  /** הבסיס הגיע לתקרה. */
  capped: boolean;
  assumptions: NiAssumption[];
}

export type NiCalcFailure =
  | 'unsupported_year'
  | 'missing_source_year'
  | 'unsupported_advancement'
  | 'invalid_input';

export interface NiCalcError { ok: false; reason: NiCalcFailure; detail: string }

/** הנחה שנעשתה בדרך — לא שגיאה, אבל מורידה את הוודאות. */
export type NiAssumption =
  | 'deduction_unknown'      // D לא נמסר ⇒ חושב כ-0
  | 'source_year_assumed'    // שנת המקור לא ידועה ⇒ הונחה השנה הקודמת
  | 'multiple_statuses'      // יותר ממעמד אחד בתקופה — ייתכן שהבסיס אינו מעצמאי בלבד
  | 'at_max_basis';          // הבסיס בתקרה ⇒ ההכנסה שמשוחזרת היא חסם תחתון

export function niForward(input: NiForwardInput): NiForwardResult | NiCalcError {
  const { originalMonthlyIncome: I, insuranceYear, sourceIncomeYear, months } = input;
  if (!(I >= 0) || !(months >= 1)) return { ok: false, reason: 'invalid_input', detail: 'הכנסה או מספר חודשים אינם תקינים.' };
  const cfg = niSelfEmployedYear(insuranceYear);
  if (!cfg) return { ok: false, reason: 'unsupported_year', detail: `אין פרמטרים מאומתים לשנת ${insuranceYear}.` };
  const k = niAdvancementFactor(insuranceYear, sourceIncomeYear);
  if (k == null) {
    return { ok: false, reason: 'unsupported_advancement', detail: `אין מקדם קידום מאומת מ-${sourceIncomeYear} ל-${insuranceYear}.` };
  }
  const assumptions: NiAssumption[] = [];
  if (input.additionalDeduction == null) assumptions.push('deduction_unknown');
  const D = input.additionalDeduction ?? 0;
  const y = k * I;
  const s = cfg.deductibleShare;
  const m = cfg.thresholdMonthly;

  // ‼ b = y − D − s·N(b), כש-N ליניארית למקוטעין ⇒ פתרון סגור לכל מקטע.
  // הפונקציה מונוטונית עולה ב-b, ולכן בדיוק מקטע אחד מתאים.
  let b = (y - D) / (1 + s * cfg.niLow);
  if (b > m) b = (y - D - s * (cfg.niLow - cfg.niHigh) * m) / (1 + s * cfg.niHigh);
  b = Math.max(0, b);
  let capped = false;
  if (b > cfg.maxBasisMonthly) { b = cfg.maxBasisMonthly; capped = true; assumptions.push('at_max_basis'); }

  const components = niComponents(b, cfg);
  const periodBasis = b * months;
  return {
    ok: true,
    advancementFactor: k,
    advancedIncome: y,
    monthlyBasis: b,
    periodBasis,
    periodBasisDisplayed: niDisplayRound(periodBasis),
    components,
    advanceMonthly: components.total,
    advanceDisplayed: niDisplayRound(components.total),
    capped,
    assumptions,
  };
}

// ─── אחורה: בסיס מוצג ⇒ הכנסה מקורית ─────────────────────────────────────────

/**
 * רמת הביטחון בשחזור.
 *   complete     — כל הקלטים ידועים, אין מקרה קצה: השחזור מדויק עד כדי עיגול.
 *   estimate     — חושב, אבל על סמך הנחה (ראה `assumptions`).
 *   insufficient — אי אפשר לחשב בלי לנחש (שנה/מקדם לא מאומתים).
 */
export type NiReconstructionConfidence = 'complete' | 'estimate' | 'insufficient';

export interface NiReverseInput {
  /** B — הבסיס לתקופה כפי שהפורטל מציג. */
  periodBasis: number;
  /** q — מספר החודשים שהבסיס מייצג. */
  months: number;
  insuranceYear: number;
  /** שנת ההכנסה שעליה נשען הבסיס. חסר ⇒ insufficient, אלא אם `assumeSourceYear`. */
  sourceIncomeYear?: number;
  /** כשאין שנת מקור: להניח את השנה הקודמת — ולסמן זאת כהנחה. */
  assumeSourceYear?: boolean;
  additionalDeduction?: number;
  /** כמה מעמדות פעילים בתקופה (עצמאי + סטודנט וכו'). */
  statusesCount?: number;
  /** הבסיס שהוצג מעוגל לשקל — ברירת מחדל: כן. */
  basisIsRounded?: boolean;
}

export interface NiReverseResult {
  ok: true;
  confidence: Exclude<NiReconstructionConfidence, 'insufficient'>;
  assumptions: NiAssumption[];
  sourceIncomeYear: number;
  monthlyBasis: number;
  components: NiComponents;
  /** המקדמה שהבסיס הזה מייצר — לבדיקה מול הערך בפורטל. */
  advanceDisplayed: number;
  /** y — ההכנסה אחרי קידום. */
  advancedIncome: number;
  advancementFactor: number;
  /** I — ההכנסה המקורית לחודש. */
  originalMonthlyIncome: number;
  /** הטווח שנובע מעיגול הבסיס המוצג. */
  originalMonthlyIncomeRange: [number, number];
}

export interface NiReverseInsufficient {
  ok: false;
  confidence: 'insufficient';
  reason: NiCalcFailure;
  detail: string;
}

function invertBasis(b: number, cfg: NiSelfEmployedYear, k: number, D: number) {
  const components = niComponents(b, cfg);
  const y = b + cfg.deductibleShare * components.nationalInsurance + D;
  return { components, y, I: y / k };
}

export function niReverse(input: NiReverseInput): NiReverseResult | NiReverseInsufficient {
  const { periodBasis: B, months: q, insuranceYear } = input;
  if (!(B >= 0) || !(q >= 1)) {
    return { ok: false, confidence: 'insufficient', reason: 'invalid_input', detail: 'בסיס או מספר חודשים אינם תקינים.' };
  }
  const cfg = niSelfEmployedYear(insuranceYear);
  if (!cfg) {
    return { ok: false, confidence: 'insufficient', reason: 'unsupported_year', detail: `אין פרמטרים מאומתים לשנת ${insuranceYear}.` };
  }
  const assumptions: NiAssumption[] = [];
  let sourceIncomeYear = input.sourceIncomeYear;
  if (sourceIncomeYear == null) {
    if (!input.assumeSourceYear) {
      return { ok: false, confidence: 'insufficient', reason: 'missing_source_year', detail: 'לא ידוע על הכנסת איזו שנה נשען הבסיס.' };
    }
    sourceIncomeYear = insuranceYear - 1;
    assumptions.push('source_year_assumed');
  }
  const k = niAdvancementFactor(insuranceYear, sourceIncomeYear);
  if (k == null) {
    return {
      ok: false, confidence: 'insufficient', reason: 'unsupported_advancement',
      detail: `אין מקדם קידום מאומת מ-${sourceIncomeYear} ל-${insuranceYear}.`,
    };
  }
  if (input.additionalDeduction == null) assumptions.push('deduction_unknown');
  if ((input.statusesCount ?? 1) > 1) assumptions.push('multiple_statuses');
  const D = input.additionalDeduction ?? 0;

  const b = B / q;
  if (b >= cfg.maxBasisMonthly) assumptions.push('at_max_basis');
  const mid = invertBasis(b, cfg, k, D);

  const rounded = input.basisIsRounded ?? true;
  let range: [number, number] = [mid.I, mid.I];
  if (rounded) {
    const lo = invertBasis(Math.max(0, (B - 0.5) / q), cfg, k, D).I;
    const hi = invertBasis((B + 0.5) / q, cfg, k, D).I;
    range = [lo, hi];
  }

  return {
    ok: true,
    confidence: assumptions.length === 0 ? 'complete' : 'estimate',
    assumptions,
    sourceIncomeYear,
    monthlyBasis: b,
    components: mid.components,
    advanceDisplayed: niDisplayRound(mid.components.total),
    advancedIncome: mid.y,
    advancementFactor: k,
    originalMonthlyIncome: mid.I,
    originalMonthlyIncomeRange: range,
  };
}

/**
 * האם ההכנסה המשוחזרת מתיישבת עם ערך ישיר (רשימת הכנסות). ‼ הערך הישיר
 * תמיד גובר — זו בדיקת עקביות, לא תחליף.
 */
export function niCrossCheck(reconstructed: NiReverseResult, directMonthlyIncome: number, toleranceShekels = 5): boolean {
  const [lo, hi] = reconstructed.originalMonthlyIncomeRange;
  return directMonthlyIncome >= lo - toleranceShekels && directMonthlyIncome <= hi + toleranceShekels;
}

/** תיאור קצר לכל הנחה — לתצוגה ליד המספר המשוחזר. */
export const NI_ASSUMPTION_LABELS: Record<NiAssumption, string> = {
  deduction_unknown: 'בהנחה שאין ניכוי נוסף',
  source_year_assumed: 'בהנחה שהבסיס נשען על הכנסת השנה הקודמת',
  multiple_statuses: 'יותר ממעמד אחד בתקופה',
  at_max_basis: 'הבסיס בתקרה — ההכנסה לפחות כזו',
};
