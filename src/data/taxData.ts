import { TaxYearData } from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// נתוני מס לפי שנים
// מקורות: פקודת מס הכנסה, ביטוח לאומי, רשות המיסים
// ─────────────────────────────────────────────────────────────────────────────

export const TAX_YEARS: TaxYearData[] = [
  // ─── 2022 ─────────────────────────────────────────────────────────────────
  {
    year: 2022,
    creditPointValue: 2_616, // ₪2,616 לשנה לנקודת זיכוי
    incomeTaxBrackets: [
      { upTo:  75_720, rate: 10 },
      { upTo: 108_600, rate: 14 },
      { upTo: 174_360, rate: 20 },
      { upTo: 242_400, rate: 31 },
      { upTo: 501_960, rate: 35 },
      { upTo: 647_640, rate: 47 },
      { upTo: Infinity, rate: 50 },
    ],
    surtaxThreshold: 647_640,  // היטל יסף 3% מעל סף זה
    niAverageWage: 11_004,
    niThreshold60Monthly: 6_603,
    niMaxIncomeMonthly: 44_020,
    employeeNI: { lowRate: 3.5, highRate: 12, healthLowRate: 3.1, healthHighRate: 5 },
    selfEmployedNI: { lowRate: 9.82, highRate: 16.23, healthLowRate: 3.1, healthHighRate: 5 },
    nonQualifyingMonthlyNI: 175,
    rentalExemptMonthly: 5_196,
  },

  // ─── 2023 ─────────────────────────────────────────────────────────────────
  {
    year: 2023,
    creditPointValue: 2_820,
    incomeTaxBrackets: [
      { upTo:  75_960, rate: 10 },
      { upTo: 108_960, rate: 14 },
      { upTo: 174_960, rate: 20 },
      { upTo: 243_120, rate: 31 },
      { upTo: 502_920, rate: 35 },
      { upTo: 647_640, rate: 47 },
      { upTo: Infinity, rate: 50 },
    ],
    surtaxThreshold: 647_640,
    niAverageWage: 11_870,
    niThreshold60Monthly: 7_122,
    niMaxIncomeMonthly: 45_075,
    employeeNI: { lowRate: 3.5, highRate: 12, healthLowRate: 3.1, healthHighRate: 5 },
    selfEmployedNI: { lowRate: 9.82, highRate: 16.23, healthLowRate: 3.1, healthHighRate: 5 },
    nonQualifyingMonthlyNI: 185,
    rentalExemptMonthly: 5_471,
  },

  // ─── 2024 ─────────────────────────────────────────────────────────────────
  {
    year: 2024,
    creditPointValue: 2_820,
    incomeTaxBrackets: [
      { upTo:  81_480, rate: 10 },
      { upTo: 116_760, rate: 14 },
      { upTo: 187_440, rate: 20 },
      { upTo: 260_520, rate: 31 },
      { upTo: 539_760, rate: 35 },
      { upTo: 698_280, rate: 47 },
      { upTo: Infinity, rate: 50 },
    ],
    surtaxThreshold: 698_280,
    niAverageWage: 12_537,
    niThreshold60Monthly: 7_522,
    niMaxIncomeMonthly: 47_465,
    employeeNI: { lowRate: 3.5, highRate: 12, healthLowRate: 3.1, healthHighRate: 5 },
    selfEmployedNI: { lowRate: 9.82, highRate: 16.23, healthLowRate: 3.1, healthHighRate: 5 },
    nonQualifyingMonthlyNI: 193,
    rentalExemptMonthly: 5_654,
  },

  // ─── 2025 ─────────────────────────────────────────────────────────────────
  {
    year: 2025,
    creditPointValue: 2_904,
    incomeTaxBrackets: [
      { upTo:  84_120, rate: 10 },
      { upTo: 120_720, rate: 14 },
      { upTo: 193_800, rate: 20 },
      { upTo: 269_280, rate: 31 },
      { upTo: 558_240, rate: 35 },
      { upTo: 718_560, rate: 47 },
      { upTo: Infinity, rate: 50 },
    ],
    surtaxThreshold: 718_560,
    niAverageWage: 13_090,     // עדכון: שכר ממוצע 2025
    niThreshold60Monthly: 7_854,
    niMaxIncomeMonthly: 49_120,
    employeeNI: { lowRate: 3.5, highRate: 12, healthLowRate: 3.1, healthHighRate: 5 },
    selfEmployedNI: { lowRate: 9.82, highRate: 16.23, healthLowRate: 3.1, healthHighRate: 5 },
    nonQualifyingMonthlyNI: 199,
    rentalExemptMonthly: 5_840,
  },

  // ─── 2026 (מוערך - יש לאמת מול נתוני רשות המיסים/ביטוח לאומי) ──────────
  {
    year: 2026,
    isEstimated: true,
    creditPointValue: 3_006,   // הערכה: ~3.5% עליית ערך
    incomeTaxBrackets: [
      { upTo:  87_120, rate: 10 },
      { upTo: 125_040, rate: 14 },
      { upTo: 200_640, rate: 20 },
      { upTo: 278_760, rate: 31 },
      { upTo: 578_040, rate: 35 },
      { upTo: 744_120, rate: 47 },
      { upTo: Infinity, rate: 50 },
    ],
    surtaxThreshold: 744_120,
    niAverageWage: 13_550,
    niThreshold60Monthly: 8_130,
    niMaxIncomeMonthly: 50_890,
    employeeNI: { lowRate: 3.5, highRate: 12, healthLowRate: 3.1, healthHighRate: 5 },
    selfEmployedNI: { lowRate: 9.82, highRate: 16.23, healthLowRate: 3.1, healthHighRate: 5 },
    nonQualifyingMonthlyNI: 206,
    rentalExemptMonthly: 6_050,
  },
];

export function getTaxYearData(year: number): TaxYearData | undefined {
  return TAX_YEARS.find(ty => ty.year === year);
}

export const AVAILABLE_YEARS = TAX_YEARS.map(ty => ty.year).sort((a, b) => b - a);
