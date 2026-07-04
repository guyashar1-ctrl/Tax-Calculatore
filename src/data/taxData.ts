import { TaxYearData } from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// נתוני מס לפי שנים
// מקורות: לוחות העזר הרשמיים של רשות המסים (ינואר 2025, ינואר 2026),
//          חוזרי ביטוח לאומי (כולל חוזר מעסיקים 1522 לשנת 2026),
//          הוראת ביצוע 5/2025 (מס יסף), כל-זכות.
// אומת מחדש מול המקורות ביולי 2026.
//
// הקפאת הצמדה: חוק ההתייעלות (הקפאת עדכוני מס) הקפיא לשנים 2025–2027 את
// ההצמדה למדד של מדרגות, נקודת הזיכוי, סף מס היסף ותקרות רבות — לכן ערכים
// רבים זהים בין 2024 ל-2026.
//
// שדות ביטוח לאומי: lowRate/highRate = דמי ביטוח לאומי בלבד;
//                    healthLowRate/healthHighRate = דמי בריאות בלבד.
// ─────────────────────────────────────────────────────────────────────────────

export const TAX_YEARS: TaxYearData[] = [
  // ─── 2022 ─────────────────────────────────────────────────────────────────
  {
    year: 2022,
    creditPointValue: 2_676,
    incomeTaxBrackets: [
      { upTo:  77_400, rate: 10 },
      { upTo: 110_880, rate: 14 },
      { upTo: 178_080, rate: 20 },
      { upTo: 247_440, rate: 31 },
      { upTo: 514_920, rate: 35 },
      { upTo: 663_240, rate: 47 },
      { upTo: Infinity, rate: 50 },
    ],
    surtaxThreshold: 663_240,
    surtaxCapitalExtraRate: 0,
    niAverageWage: 10_551,
    niThreshold60Monthly: 6_331,
    niMaxIncomeMonthly: 45_075,
    employeeNI: { lowRate: 0.4, highRate: 7, healthLowRate: 3.1, healthHighRate: 5 },
    selfEmployedNI: { lowRate: 2.87, highRate: 12.83, healthLowRate: 3.1, healthHighRate: 5 },
    passiveNI: { lowRate: 4.61, highRate: 7, healthLowRate: 5, healthHighRate: 5 },
    earlyPensionNI: { lowRate: 0.39, highRate: 6.79, healthLowRate: 3.1, healthHighRate: 5 },
    nonQualifyingMonthlyNI: 179,
    rentalExemptMonthly: 5_196,
  },

  // ─── 2023 ─────────────────────────────────────────────────────────────────
  {
    year: 2023,
    creditPointValue: 2_820,
    incomeTaxBrackets: [
      { upTo:  81_480, rate: 10 },
      { upTo: 116_760, rate: 14 },
      { upTo: 187_440, rate: 20 },
      { upTo: 260_520, rate: 31 },
      { upTo: 542_160, rate: 35 },
      { upTo: 698_280, rate: 47 },
      { upTo: Infinity, rate: 50 },
    ],
    surtaxThreshold: 698_280,
    surtaxCapitalExtraRate: 0,
    niAverageWage: 11_870,
    niThreshold60Monthly: 7_122,
    niMaxIncomeMonthly: 47_465,
    employeeNI: { lowRate: 0.4, highRate: 7, healthLowRate: 3.1, healthHighRate: 5 },
    selfEmployedNI: { lowRate: 2.87, highRate: 12.83, healthLowRate: 3.1, healthHighRate: 5 },
    passiveNI: { lowRate: 4.61, highRate: 7, healthLowRate: 5, healthHighRate: 5 },
    earlyPensionNI: { lowRate: 0.39, highRate: 6.79, healthLowRate: 3.1, healthHighRate: 5 },
    nonQualifyingMonthlyNI: 194,
    rentalExemptMonthly: 5_471,
  },

  // ─── 2024 ─────────────────────────────────────────────────────────────────
  {
    year: 2024,
    creditPointValue: 2_904,
    incomeTaxBrackets: [
      { upTo:  84_120, rate: 10 },
      { upTo: 120_720, rate: 14 },
      { upTo: 193_800, rate: 20 },
      { upTo: 269_280, rate: 31 },
      { upTo: 560_280, rate: 35 },
      { upTo: 721_560, rate: 47 },
      { upTo: Infinity, rate: 50 },
    ],
    surtaxThreshold: 721_560,
    surtaxCapitalExtraRate: 0,
    niAverageWage: 12_536,
    niThreshold60Monthly: 7_522,
    niMaxIncomeMonthly: 49_030,
    employeeNI: { lowRate: 0.4, highRate: 7, healthLowRate: 3.1, healthHighRate: 5 },
    selfEmployedNI: { lowRate: 2.87, highRate: 12.83, healthLowRate: 3.1, healthHighRate: 5 },
    passiveNI: { lowRate: 4.61, highRate: 7, healthLowRate: 5, healthHighRate: 5 },
    earlyPensionNI: { lowRate: 0.39, highRate: 6.79, healthLowRate: 3.1, healthHighRate: 5 },
    nonQualifyingMonthlyNI: 203,
    rentalExemptMonthly: 5_654,
  },

  // ─── 2025 ─────────────────────────────────────────────────────────────────
  // מדרגות, נקודת זיכוי, סף יסף ותקרת שכ"ד — הוקפאו ברמת 2024.
  // תיקון 252 לחוק ביטוח לאומי — שיעורים חדשים מ-1.2.2025 (הוראת שעה עד סוף 2026).
  // תיקון 276 לפקודה — מס יסף נוסף 2% על הכנסות שאינן מיגיעה אישית, מ-1.1.2025.
  {
    year: 2025,
    creditPointValue: 2_904,
    incomeTaxBrackets: [
      { upTo:  84_120, rate: 10 },
      { upTo: 120_720, rate: 14 },
      { upTo: 193_800, rate: 20 },
      { upTo: 269_280, rate: 31 },
      { upTo: 560_280, rate: 35 },
      { upTo: 721_560, rate: 47 },
      { upTo: Infinity, rate: 50 },
    ],
    surtaxThreshold: 721_560,
    surtaxCapitalExtraRate: 2,
    niAverageWage: 12_536,        // לגבייה — הוקפא ברמת 2024 (לקצבאות: 13,316)
    niThreshold60Monthly: 7_522,
    niMaxIncomeMonthly: 50_695,
    employeeNI: { lowRate: 1.04, highRate: 7, healthLowRate: 3.23, healthHighRate: 5.17 },
    selfEmployedNI: { lowRate: 4.47, highRate: 12.83, healthLowRate: 3.23, healthHighRate: 5.17 },
    passiveNI: { lowRate: 6.92, highRate: 7, healthLowRate: 5.17, healthHighRate: 5.17 },
    earlyPensionNI: { lowRate: 1.02, highRate: 6.79, healthLowRate: 3.23, healthHighRate: 5.17 },
    nonQualifyingMonthlyNI: 250,
    rentalExemptMonthly: 5_654,
    gamblingExemptionCeiling: 33_840,   // לוח עזר רשמי 2025
    qualifyingIncomeMonthly: 9_700,     // ⚠ אומת ל-2026; ל-2025 הונח זהה (הקפאה)
  },

  // ─── 2026 ─────────────────────────────────────────────────────────────────
  // הרחבת מדרגות 3–4 (תיקון במסגרת חוק ההתייעלות 2026): אושר 30.3.2026,
  // פורסם 31.3.2026, רטרואקטיבית מ-1.1.2026.
  // ביטוח לאומי: חוזר מעסיקים 1522. מ-2026 הסף המופחת הוא "מדרגת גבייה
  // מופחתת" צמודת מדד (7,703) — כבר לא 60% מהשכר הממוצע.
  {
    year: 2026,
    creditPointValue: 2_904,            // הוקפא — לוח עזר רשמי 2026
    incomeTaxBrackets: [
      { upTo:  84_120, rate: 10 },
      { upTo: 120_720, rate: 14 },
      { upTo: 228_000, rate: 20 },      // הורחב מ-193,800
      { upTo: 301_200, rate: 31 },      // הורחב מ-269,280
      { upTo: 560_280, rate: 35 },
      { upTo: 721_560, rate: 47 },
      { upTo: Infinity, rate: 50 },
    ],
    surtaxThreshold: 721_560,
    surtaxCapitalExtraRate: 2,
    niAverageWage: 13_769,
    niThreshold60Monthly: 7_703,        // "מדרגת גבייה מופחתת" — צמודת מדד
    niMaxIncomeMonthly: 51_910,
    employeeNI: { lowRate: 1.04, highRate: 7, healthLowRate: 3.23, healthHighRate: 5.17 },
    selfEmployedNI: { lowRate: 4.47, highRate: 12.83, healthLowRate: 3.23, healthHighRate: 5.17 },
    passiveNI: { lowRate: 6.92, highRate: 7, healthLowRate: 5.17, healthHighRate: 5.17 },
    earlyPensionNI: { lowRate: 1.02, highRate: 6.79, healthLowRate: 3.23, healthHighRate: 5.17 },
    nonQualifyingMonthlyNI: 266,        // 143 ב"ל + 123 בריאות
    rentalExemptMonthly: 5_654,         // הוקפא — אומת בכל-זכות ובפרסומי 2026
    gamblingExemptionCeiling: 33_840,   // לוח עזר רשמי 2026 (תוקן מ-32,310)
    qualifyingIncomeMonthly: 9_700,
  },
];

export function getTaxYearData(year: number): TaxYearData | undefined {
  return TAX_YEARS.find(ty => ty.year === year);
}

export const AVAILABLE_YEARS = TAX_YEARS.map(ty => ty.year).sort((a, b) => b - a);

/** שנת המס העדכנית ביותר שקיימים לה נתונים מאומתים */
export const CURRENT_TAX_YEAR = AVAILABLE_YEARS[0];
