import { TaxYearData } from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// נתוני מס לפי שנים
// מקורות: פקודת מס הכנסה, ביטוח לאומי, רשות המיסים
//
// חשוב: שדות lowRate/highRate = ביטוח לאומי בלבד (ללא בריאות)
//        שדות healthLowRate/healthHighRate = מס בריאות בלבד
//        סה"כ ניכוי = lowRate + healthLowRate (מדרגה ראשונה)
//                     highRate + healthHighRate (מדרגה שנייה)
// ─────────────────────────────────────────────────────────────────────────────

export const TAX_YEARS: TaxYearData[] = [
  // ─── 2022 ─────────────────────────────────────────────────────────────────
  // מקור: רשות המיסים, ביטוח לאומי
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
    niAverageWage: 10_551,
    niThreshold60Monthly: 6_331,
    niMaxIncomeMonthly: 45_075,
    // שיעורי ביטוח לאומי — חלק עובד בלבד (ללא בריאות)
    employeeNI: { lowRate: 0.4, highRate: 7, healthLowRate: 3.1, healthHighRate: 5 },
    selfEmployedNI: { lowRate: 2.87, highRate: 12.83, healthLowRate: 3.1, healthHighRate: 5 },
    nonQualifyingMonthlyNI: 179,  // 73 ב"ל + 106 בריאות (btl.gov.il)
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
    niAverageWage: 11_870,
    niThreshold60Monthly: 7_122,
    niMaxIncomeMonthly: 47_465,
    employeeNI: { lowRate: 0.4, highRate: 7, healthLowRate: 3.1, healthHighRate: 5 },
    selfEmployedNI: { lowRate: 2.87, highRate: 12.83, healthLowRate: 3.1, healthHighRate: 5 },
    nonQualifyingMonthlyNI: 194,  // 82 ב"ל + 112 בריאות (btl.gov.il)
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
    niAverageWage: 12_536,
    niThreshold60Monthly: 7_522,
    niMaxIncomeMonthly: 49_030,
    employeeNI: { lowRate: 0.4, highRate: 7, healthLowRate: 3.1, healthHighRate: 5 },
    selfEmployedNI: { lowRate: 2.87, highRate: 12.83, healthLowRate: 3.1, healthHighRate: 5 },
    nonQualifyingMonthlyNI: 203,  // 87 ב"ל + 116 בריאות (btl.gov.il)
    rentalExemptMonthly: 5_654,
  },

  // ─── 2025 ─────────────────────────────────────────────────────────────────
  // מדרגות מס הוקפאו ברמת 2024
  // תיקון 252 לחוק ביטוח לאומי — שיעורים חדשים מ-1.2.2025
  // שכר ממוצע לגבייה הוקפא ברמת 2024
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
    niAverageWage: 12_536,        // הוקפא ברמת 2024 לצורכי גבייה
    niThreshold60Monthly: 7_522,  // הוקפא
    niMaxIncomeMonthly: 50_695,   // עודכן ל-2025 (btl.gov.il)
    // תיקון 252 — שיעורים חדשים מ-1.2.2025
    employeeNI: { lowRate: 1.04, highRate: 7, healthLowRate: 3.23, healthHighRate: 5.17 },
    selfEmployedNI: { lowRate: 4.47, highRate: 12.83, healthLowRate: 3.23, healthHighRate: 5.17 },
    nonQualifyingMonthlyNI: 250,  // 130 ב"ל + 120 בריאות (btl.gov.il)
    rentalExemptMonthly: 5_654,
  },

  // ─── 2026 ─────────────────────────────────────────────────────────────────
  // חוק הרחבת מדרגות 3-4 אושר 30.3.2026, רטרואקטיבי ל-1.1.2026
  // מקור: חוזר ביטוח לאומי 2026, רשות המיסים
  {
    year: 2026,
    creditPointValue: 2_888,
    incomeTaxBrackets: [
      { upTo:  84_120, rate: 10 },
      { upTo: 120_720, rate: 14 },
      { upTo: 228_000, rate: 20 },  // הורחב מ-193,800
      { upTo: 301_200, rate: 31 },  // הורחב מ-269,280
      { upTo: 560_280, rate: 35 },
      { upTo: 721_560, rate: 47 },
      { upTo: Infinity, rate: 50 },
    ],
    surtaxThreshold: 721_560,
    niAverageWage: 13_769,
    niThreshold60Monthly: 7_703,
    niMaxIncomeMonthly: 51_910,
    employeeNI: { lowRate: 1.04, highRate: 7, healthLowRate: 3.23, healthHighRate: 5.17 },
    selfEmployedNI: { lowRate: 4.47, highRate: 12.83, healthLowRate: 3.23, healthHighRate: 5.17 },
    nonQualifyingMonthlyNI: 266,  // 143 ב"ל + 123 בריאות
    rentalExemptMonthly: 5_654,
  },
];

export function getTaxYearData(year: number): TaxYearData | undefined {
  return TAX_YEARS.find(ty => ty.year === year);
}

export const AVAILABLE_YEARS = TAX_YEARS.map(ty => ty.year).sort((a, b) => b - a);
