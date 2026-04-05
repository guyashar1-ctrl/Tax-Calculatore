// ─── סיווגי מס ──────────────────────────────────────────────────────────────

/** סיווג לצורכי מס הכנסה */
export type IncomeTaxType =
  | 'employee'       // שכיר
  | 'selfEmployed'   // עצמאי
  | 'both'           // שכיר + עצמאי
  | 'rentalOnly'     // הכנסות שכירות בלבד
  | 'other';         // הכנסות פסיביות / אחרות

/** סיווג לצורכי ביטוח לאומי */
export type NIType =
  | 'employee'        // עובד שכיר
  | 'selfEmployed'    // עצמאי (עונה להגדרה)
  | 'nonQualifying'   // עוסק שאינו עונה להגדרה
  | 'employeeAndSE'   // שכיר + עצמאי
  | 'passive'         // לא עובד ולא עצמאי (הכנסות פסיביות)
  | 'pensioner';      // פנסיונר

export type VATStatus = 'authorizedDealer' | 'exemptDealer' | 'none';
export type FamilyStatus = 'single' | 'married' | 'divorced' | 'widowed' | 'singleParent';
export type Gender = 'male' | 'female';
export type RentalTaxTrack = 'exempt' | 'flat10' | 'regular';

export interface Child {
  id: string;
  birthYear: number;
  hasDisability: boolean;
  disabilityPercentage?: number;
}

export interface Client {
  id: string;

  // ── פרטים אישיים ──
  idNumber: string;
  firstName: string;
  lastName: string;
  birthDate: string;
  gender: Gender;
  phone: string;
  email: string;
  city: string;                     // עיר מגורים (dropdown)
  address: string;

  // ── סיווג מס הכנסה (נפרד מביטוח לאומי) ──
  incomeTaxType: IncomeTaxType;
  vatStatus: VATStatus;
  businessDescription: string;
  hasExemptFromWithholding: boolean;

  // ── סיווג ביטוח לאומי (נפרד ממס הכנסה) ──
  niType: NIType;
  hasTaxCoordination: boolean;
  taxCoordinationDetails: string;

  // ── מצב משפחתי ──
  familyStatus: FamilyStatus;
  spouseName: string;
  spouseIdNumber: string;
  spouseWorking: boolean;
  spouseIncome: number;

  // ── ילדים ──
  children: Child[];

  // ── נקודות זיכוי ──
  isNewImmigrant: boolean;
  aliyahYear: number;

  isReturningResident: boolean;
  returningYear: number;

  disabilityPercentage: number;
  disabilityType: string;

  hasAcademicDegree: boolean;
  academicDegreeYear: number;
  academicDegreeType: 'bachelor' | 'master' | 'phd' | '';

  completedIDF: boolean;
  idfReleaseYear: number;
  completedNationalService: boolean;
  nationalServiceYear: number;

  // ── ישוב מזכה ──
  qualifyingSettlementId: string;     // '' = לא ישוב מזכה
  qualifyingSettlementOverride: boolean; // האם הוגדר ידנית (ולא זוהה אוטומטית)
  qualifyingSettlementCreditPoints: number; // ניתן לשינוי ידני

  // ── נכסים ──
  hasResidentialProperty: boolean;
  propertyAddress: string;
  numberOfProperties: number;

  // ── פנסיה וחיסכון ──
  hasPension: boolean;
  pensionFundName: string;
  employeePensionPct: number;
  employerPensionPct: number;
  hasKupotGemel: boolean;
  hasKrenHashtalmut: boolean;
  krenHashtalmutMonthly: number;

  // ── הערות ──
  notes: string;

  createdAt: string;
  updatedAt: string;
}

// ─── מבני נתוני מס ──────────────────────────────────────────────────────────

export interface TaxBracket {
  upTo: number;
  rate: number;
}

export interface NIRates {
  lowRate: number;
  highRate: number;
  healthLowRate: number;
  healthHighRate: number;
}

export interface TaxYearData {
  year: number;
  isEstimated?: boolean;
  creditPointValue: number;
  incomeTaxBrackets: TaxBracket[];
  surtaxThreshold: number;
  niAverageWage: number;
  niThreshold60Monthly: number;
  niMaxIncomeMonthly: number;
  employeeNI: NIRates;
  selfEmployedNI: NIRates;
  nonQualifyingMonthlyNI: number;
  rentalExemptMonthly: number;
}

// ─── מחשבון מס ──────────────────────────────────────────────────────────────

export interface TaxCalcInput {
  client: Client;
  year: number;
  grossSalary: number;
  employeePensionPct: number;
  selfEmployedGrossIncome: number;
  recognizedExpenses: number;
  selfEmployedPensionAmount: number;
  rentalIncome: number;
  rentalExpenses: number;
  rentalTaxTrack: RentalTaxTrack;
  otherIncome: number;
  donationsSection46: number;
  krenHashtalmutSE: number;
  overrideCreditPoints: boolean;
  manualCreditPoints: number;
}

export interface CreditPointLine {
  description: string;
  legalBasis: string;
  points: number;
  valueNIS: number;
}

export interface BracketLine {
  from: number;
  to: number | null;
  rate: number;
  taxableInBracket: number;
  taxInBracket: number;
}

export interface TaxCalcResult {
  // הכנסות
  grossIncome: number;
  totalDeductions: number;
  taxableIncome: number;

  // נקודות זיכוי
  creditPointLines: CreditPointLine[];
  totalCreditPoints: number;
  totalCreditValue: number;

  // מס הכנסה
  bracketLines: BracketLine[];
  taxBeforeCredit: number;
  donationCredit: number;
  incomeTax: number;
  surtax: number;
  totalIncomeTax: number;
  marginalRate: number;
  effectiveIncomeTaxRate: number;

  // ביטוח לאומי
  niEmployee: number;
  healthEmployee: number;
  niSelfEmployed: number;
  healthSelfEmployed: number;
  niDeductionFromIncomeTax: number; // ניכוי 52% מביטוח לאומי עצמאי
  totalNI: number;
  niBreakdown: string[];

  // ניתוח נוסף
  unusedCreditValue: number;           // זיכוי לא מנוצל (₪)
  remainingFreeIncomeCapacity: number; // הכנסה נוספת שניתן להרוויח ב-0% מס
  distanceToNextBracket: number;       // מרחק למדרגה הבאה (₪)
  nextBracketRate: number;             // שיעור המדרגה הבאה
  taxWithoutCredits: number;           // מס ללא זיכויים

  // סיכום
  totalTaxBurden: number;
  netAnnualIncome: number;
  effectiveTotalRate: number;

  // הסברים
  deductionBreakdown: string[];
  rentalExplanation: string;
}
