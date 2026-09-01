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

// סוג נכס דיור
export type PropertyType = 'apartment' | 'house' | 'duplex' | 'commercial' | 'land' | 'other';

export const PROPERTY_TYPE_LABELS: Record<PropertyType, string> = {
  apartment:  'דירה',
  house:      'בית פרטי',
  duplex:     'דופלקס / קוטג׳',
  commercial: 'נכס מסחרי',
  land:       'קרקע / מגרש',
  other:      'אחר',
};

// ─── חשבונות והשקעות בחו"ל ──────────────────────────────────────────────
export type ForeignAccountType = 'bank' | 'brokerage' | 'crypto' | 'pension' | 'real_estate' | 'business' | 'other';

export const FOREIGN_ACCOUNT_TYPE_LABELS: Record<ForeignAccountType, string> = {
  bank:        'חשבון בנק',
  brokerage:   'חשבון השקעות / ברוקר',
  crypto:      'ארנק קריפטו / מטבעות וירטואליים',
  pension:     'פנסיה / קופ״ג זרה',
  real_estate: 'נכס נדל״ן בחו״ל',
  business:    'חברה / עסק זר (CFC)',
  other:       'אחר',
};

export interface ForeignAccount {
  id: string;
  type?: ForeignAccountType;
  country?: string;          // שם המדינה
  institutionName?: string;   // שם המוסד / הברוקר / הבנק
  accountNumber?: string;     // אופציונלי — מספר חשבון/IBAN
  estimatedValue?: number;    // שווי משוער (₪)
  annualIncome?: number;      // הכנסה שנתית מהחשבון (₪) — דיבידנד/ריבית/שכ״ד וכו'
  foreignTaxPaid?: number;    // מס ששולם בחו״ל על ההכנסה — לזיכוי מס זר
  notes?: string;
}

/** נכס דיור בודד — נכלל ברשימה של נכסי הלקוח */
export interface ResidentialProperty {
  id: string;
  type?: PropertyType;
  address: string;
  city?: string;
  sizeSqm?: number;             // שטח במ"ר
  rooms?: number;                // מספר חדרים
  purchaseYear?: number;
  purchasePrice?: number;        // מחיר רכישה (₪)
  isRented?: boolean;            // האם מושכר
  monthlyRent?: number;          // שכ״ד חודשי (₪)
  rentalTaxTrack?: RentalTaxTrack;
  notes?: string;
}

// ─── בתי השקעות / חשבונות מסחר בארץ ─────────────────────────────────────
export type InvestmentAccountKind =
  | 'self_managed'         // תיק עצמאי בבית השקעות
  | 'managed_portfolio'    // תיק מנוהל
  | 'kupat_gemel_ira'      // קופ״ג IRA (עצמאית)
  | 'kupat_hishtalmut_ira' // קרן השתלמות IRA
  | 'mutual_funds'         // קרנות נאמנות
  | 'broker_account'       // חשבון ברוקר רגיל
  | 'crypto'               // זירת מסחר/ארנק קריפטו בישראל (בחו״ל — foreignAccounts)
  | 'other';

export const INVESTMENT_ACCOUNT_KIND_LABELS: Record<InvestmentAccountKind, string> = {
  self_managed:           'תיק עצמאי',
  managed_portfolio:      'תיק מנוהל',
  kupat_gemel_ira:        'קופ״ג IRA',
  kupat_hishtalmut_ira:   'השתלמות IRA',
  mutual_funds:           'קרנות נאמנות',
  broker_account:         'חשבון ברוקר',
  crypto:                 'זירת קריפטו (ישראל)',
  other:                  'אחר',
};

/**
 * חשבון השקעות בארץ. כל חשבון = מסמך 867 נפרד בצ'ק-ליסט הסופי של 1301.
 *
 * שדות הסכומים נשאבים מטופס 867 של בית ההשקעות/הבנק. כולם אופציונליים.
 * מסוכמים אוטומטית ל-1301 (שדות 142 לריבית/דיבידנד, 053/054 לרווחי/הפסדי
 * הון, 040 לניכוי במקור).
 */
export interface InvestmentAccount {
  id: string;
  institutionName: string;     // 'מיטב דש', 'IBI', 'אקסלנס', 'פסגות'...
  kind?: InvestmentAccountKind;
  accountNumber?: string;       // 4-6 ספרות אחרונות לרוב מספיק
  isClosed?: boolean;
  closedYear?: number;
  notes?: string;

  // ── סכומי 867 (Wave ג') ──
  interestIncome?: number;             // ריבית מני"ע ופיקדונות → שדה 142
  dividendIncome?: number;             // דיבידנדים → שדה 142
  capitalGainsRealized?: number;       // רווחי הון ממומשים → שדה 054
  capitalLosses?: number;              // הפסדי הון → שדה 053
  taxWithheldOnInterest?: number;      // ניכוי מס שנוכה על ריבית → שדה 040
  taxWithheldOnDividends?: number;     // ניכוי מס שנוכה על דיבידנדים → שדה 040
  taxWithheldOnCapitalGains?: number;  // ניכוי מס שנוכה על רווחי הון → שדה 040
}

// ─── מעבידים ────────────────────────────────────────────────────────────
/**
 * מעביד של הנישום בשנה הנוכחית (או בעבר). כל מעביד = טופס 106 נפרד.
 *
 * שדות הסכומים נשאבים מטופס 106 של המעביד. כולם אופציונליים — נישום
 * שטרם הזין נתונים יראה ריק. אם הוזנו, הם מוצגים בעורך פרטי 106 ומסוכמים
 * לרמת 1301 (שדות 158/042/044/089/245/249/282/086).
 */
export interface EmployerInfo {
  id: string;
  name: string;
  taxId?: string;               // ע.מ / מספר חברה
  startDate?: string;            // ISO yyyy-mm-dd
  endDate?: string;              // ריק = עדיין מועסק שם
  role?: string;                 // תיאור התפקיד
  notes?: string;
  /** מעביד של בן/בת הזוג — 106 נפרד לכל בן זוג בתא המשפחתי. */
  belongsToSpouse?: boolean;

  // ── סכומי 106 (Wave ג') ──
  grossSalaryAnnual?: number;              // סך ברוטו שנתי → שדה 158 ב-1301
  mandatoryTaxWithheld?: number;           // מס שנוכה במקור → שדה 042
  niEmployeeWithheld?: number;             // ב"ל עובד שנוכה → שדה 044
  healthEmployeeWithheld?: number;         // מס בריאות שנוכה → שדה 089
  pensionEmployerContribution?: number;    // הפקדת מעביד לפנסיה
  pensionEmployeeContribution?: number;    // הפקדת עובד לפנסיה → שדה 245
  studyFundEmployerContribution?: number;  // הפקדת מעביד לקרן השתלמות
  studyFundEmployeeContribution?: number;  // הפקדת עובד לקרן השתלמות → שדה 249
  optionsValueGranted102?: number;         // שווי אופציות 102 שמומשו → שדה 282
  severancePayReceived?: number;           // פיצויי פיטורין → שדה 086
}

// ─── חשבונות בנק בארץ ──────────────────────────────────────────────────
export type BankAccountKind = 'checking' | 'savings' | 'investment' | 'other';

export const BANK_ACCOUNT_KIND_LABELS: Record<BankAccountKind, string> = {
  checking:   'עו״ש',
  savings:    'חיסכון / פיקדון',
  investment: 'השקעות',
  other:      'אחר',
};

/**
 * חשבון בנק בישראל. החשבון הראשי (isPrimary=true) הוא לקבלת החזרי מס.
 * נדרש 867 מהבנק לדיווח ריבית (שדה 043) אם היה.
 */
export interface BankAccountInfo {
  id: string;
  bankName: string;             // 'בנק הפועלים', 'מזרחי טפחות'...
  branchNumber?: string;
  branchName?: string;
  accountNumber?: string;        // 4-6 ספרות אחרונות מספיק
  kind?: BankAccountKind;
  isPrimary?: boolean;
  notes?: string;
}

// ─── קופות פנסיה / השתלמות / קופ״ג ────────────────────────────────────
export type PensionFundKind =
  | 'new_pension'        // קרן פנסיה חדשה
  | 'old_pension'        // קרן פנסיה ותיקה
  | 'manager_insurance'  // ביטוח מנהלים
  | 'kupat_gemel'        // קופ״ג רגילה (לא IRA)
  | 'study_fund'         // קרן השתלמות
  | 'other';

export const PENSION_FUND_KIND_LABELS: Record<PensionFundKind, string> = {
  new_pension:       'פנסיה חדשה',
  old_pension:       'פנסיה ותיקה',
  manager_insurance: 'ביטוח מנהלים',
  kupat_gemel:       'קופ״ג',
  study_fund:        'קרן השתלמות',
  other:             'אחר',
};

/**
 * חיסכון פנסיוני / השתלמות / קופ״ג של הנישום. אישור הפקדות = מסמך נדרש
 * נפרד לכל מוצר.
 */
export interface PensionFundInfo {
  id: string;
  institutionName: string;       // 'מנורה', 'הראל', 'כלל', 'מגדל', 'אלטשולר שחם'...
  productName?: string;           // שם מוצר ספציפי (אופציונלי)
  kind: PensionFundKind;
  isEmployerLinked?: boolean;    // הפקדה דרך מעביד
  hasSelfDeposits?: boolean;     // הפקדות עצמאיות בנוסף
  notes?: string;
}

export type ChildCustody = 'self' | 'spouse' | 'shared' | 'after_18';

export const CHILD_CUSTODY_LABELS: Record<ChildCustody, string> = {
  self:     'אצל הנישום',
  spouse:   'אצל בן/בת הזוג',
  shared:   'משמורת משותפת',
  after_18: 'מעל 18 (לא רלוונטי)',
};

export interface Child {
  id: string;
  firstName?: string;   // שם פרטי (אופציונלי לתאימות לרשומות ישנות)
  birthDate: string;    // YYYY-MM-DD (תאריך לידה מלא)
  birthYear: number;    // מחושב מ-birthDate, נשמר לתאימות
  hasDisability: boolean;
  disabilityPercentage?: number;

  // ── שדות מס לפי גיל/משמורת (Wave ג') ──
  lastName?: string;                  // שונה מההורה במקרי גירושין
  idNumber?: string;                  // לחישוב זיכוי הורה יחיד (158)
  custody?: ChildCustody;             // קובע מי מקבל את נקודות הזיכוי
  livesWithTaxpayer?: boolean;        // קריטריון לסעיף 029 (הורה יחיד)
  monthlyAlimonyReceived?: number;    // דמי מזונות שמתקבלים (חייב חלקית במס)
  monthlyAlimonyPaid?: number;        // דמי מזונות ששולמו (זיכוי אם בפסק דין)
  educationCostsAnnual?: number;      // לזיכוי הוצאות לימוד (סעיף 45א)
}

// ─── קרובים תלויים — סעיף 44ב לפקודה ──────────────────────────────────────
/**
 * החזקה במוסד מיוחד של הורה/בן/בת זוג/אח נטול יכולת — מקנה זיכוי
 * של 35% מסכום ההוצאה.
 */
export type DependentRelation = 'parent' | 'spouse' | 'child_over_18' | 'sibling' | 'other';

export const DEPENDENT_RELATION_LABELS: Record<DependentRelation, string> = {
  parent:        'הורה',
  spouse:        'בן/בת זוג',
  child_over_18: 'ילד מעל 18',
  sibling:       'אח/אחות',
  other:         'אחר',
};

export interface DependentRelativeInfo {
  id: string;
  relation: DependentRelation;
  name?: string;
  idNumber?: string;
  isAtInstitution: boolean;      // האם מוחזק במוסד מיוחד
  institutionName?: string;
  monthlyContribution?: number;  // הוצאה חודשית (₪)
  notes?: string;
}

// ─── תיקי רשויות — התא המשפחתי מול כל רשות ─────────────────────────────
// תיק מס הכנסה מתנהל על ת.ז. של בן הזוג הרשום (לאו דווקא "הלקוח שלנו");
// במע"מ ובניכויים ייתכנו תיקים נפרדים לכל בן זוג; בב"ל — ייצוג לכל בן זוג
// בנפרד + ייצוג לתיק הניכויים אם קיים.

export type TaxAuthority = 'income_tax' | 'vat' | 'deductions' | 'national_insurance';

export const TAX_AUTHORITY_LABELS: Record<TaxAuthority, string> = {
  income_tax:         'מס הכנסה',
  vat:                'מע"מ',
  deductions:         'ניכויים',
  national_insurance: 'ביטוח לאומי',
};

export type TaxFileOwner = 'client' | 'spouse' | 'joint';

export const TAX_FILE_OWNER_LABELS: Record<TaxFileOwner, string> = {
  client: 'הלקוח/ה',
  spouse: 'בן/בת הזוג',
  joint:  'משותף',
};

export type TaxFileRepStatus = 'none' | 'pending' | 'active';

export const TAX_FILE_REP_STATUS_LABELS: Record<TaxFileRepStatus, string> = {
  none:    'אין ייצוג',
  pending: 'בתהליך',
  active:  'ייצוג פעיל',
};

export interface TaxFileInfo {
  id: string;
  authority: TaxAuthority;
  /** מספר התיק ברשות (במ"ה = ת.ז. של בן הזוג הרשום). */
  fileNumber?: string;
  /** על שם מי מתנהל התיק. */
  owner: TaxFileOwner;
  repStatus: TaxFileRepStatus;
  notes?: string;
}

// ─── עיסוקים בביטוח לאומי — M2, יישור קו ────────────────────────────────────
// מקור: "עיסוקים והכנסות → רשימת עיסוקים" באתר הביטוח הלאומי. חשיפה הדרגתית:
// שדות שכיר שונים משדות עצמאי; סוגים אחרים (סטודנט/פנסיה מוקדמת/לא עובד/אחר)
// לא דורשים פירוט נוסף.
export type NiOccupationType =
  | 'employee' | 'self_employed' | 'self_employed_non_qualifying'
  | 'student' | 'early_pension' | 'non_work_income' | 'not_working' | 'other';

export const NI_OCCUPATION_TYPE_LABELS: Record<NiOccupationType, string> = {
  employee: 'שכיר',
  self_employed: 'עצמאי',
  self_employed_non_qualifying: 'עצמאי שאינו עונה להגדרה',
  student: 'סטודנט / תלמיד',
  early_pension: 'פנסיה מוקדמת',
  non_work_income: 'הכנסה שאינה מעבודה',
  not_working: 'לא עובד',
  other: 'אחר',
};

export interface NiOccupation {
  id: string;
  type: NiOccupationType;
  // ── שכיר בלבד ──
  employerName?: string;
  withholdingFile?: string;
  // ── עצמאי / עצמאי שאינו עונה להגדרה בלבד ──
  weeklyHours?: number;
  definitionIncome?: number;
  // ── משותף לשכיר ולעצמאי ──
  fromDate?: string;
  toDate?: string;
}

// ─── עסקים — לעצמאי עם 2+ עסקים ────────────────────────────────────────
/**
 * עסק עצמאי של הנישום. כל עסק = נספח א' (1320) נפרד + שורת מחזור
 * נפרדת ב-1301 (שדה 150). שונה מ-EmployerInfo שמייצג מעבידים.
 */
export type BusinessKind =
  | 'osek_patur'
  | 'osek_morshe'
  | 'family_company'
  | 'partnership'
  | 'freelance';

export const BUSINESS_KIND_LABELS: Record<BusinessKind, string> = {
  osek_patur:     'עוסק פטור',
  osek_morshe:    'עוסק מורשה',
  family_company: 'חברה משפחתית',
  partnership:    'שותפות',
  freelance:      'פרילנס',
};

export interface BusinessInfo {
  id: string;
  name: string;
  taxId?: string;                 // ע.מ / מספר חברה
  kind: BusinessKind;
  description?: string;
  startYear?: number;
  isClosed?: boolean;
  closedYear?: number;
  vatFrequency?: 'monthly' | 'bi_monthly';
  notes?: string;

  // ── שדות נספח א' 1320 (Wave ג') ──
  /** אם true — שדה המחזור 150 מתחלף ב-170 (עסק של בן/בת זוג רשום). */
  belongsToSpouse?: boolean;
  revenueAnnual?: number;             // מחזור שנתי → שדה 150 או 170 ב-1301
  cogs?: number;                       // עלות המכר
  operatingExpenses?: number;          // הוצאות תפעוליות
  depreciation?: number;               // פחת
  netIncome?: number;                  // רווח/הפסד נטו — בסיס לחישוב 1301
  clientWithholdingTax857?: number;    // ניכוי במקור מלקוחות (857) → שדה 040
  selfPensionContribution?: number;    // הפקדת פנסיה עצמאי → שדה 268
  selfStudyFundContribution?: number;  // הפקדת קרן השתלמות עצמאי → שדה 249
}

// ─── נתוני בן/בת זוג (לחישוב תא משפחתי) ───────────────────────────────────

export interface SpouseData {
  // ── פרטים אישיים ──
  firstName: string;
  lastName: string;
  idNumber: string;
  birthDate: string;
  gender: Gender;
  phone: string;

  // ── סיווג מס הכנסה ──
  incomeTaxType: IncomeTaxType;
  vatStatus: VATStatus;
  businessDescription: string;

  // ── סיווג ביטוח לאומי ──
  niType: NIType;

  // ── הכנסות ──
  grossSalary: number;
  selfEmployedGrossIncome: number;
  recognizedExpenses: number;

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
  completedIdf: boolean;
  idfReleaseYear: number;
  completedNationalService: boolean;
  nationalServiceYear: number;

  // ── ישוב מזכה (יכול להיות שונה מבן הזוג הראשי) ──
  qualifyingSettlementId: string;
  qualifyingSettlementOverride: boolean;
  qualifyingSettlementCreditPoints: number;

  // ── פנסיה וחיסכון ──
  hasPension: boolean;
  pensionFundName: string;
  employeePensionPct: number;
  employerPensionPct: number;
  hasKrenHashtalmut: boolean;
  krenHashtalmutMonthly: number;
  selfEmployedPensionAmount: number;
  krenHashtalmutSE: number;
}

export const EMPTY_SPOUSE: SpouseData = {
  firstName: '', lastName: '', idNumber: '', birthDate: '', gender: 'female', phone: '',
  incomeTaxType: 'employee', vatStatus: 'none', businessDescription: '',
  niType: 'employee',
  grossSalary: 0, selfEmployedGrossIncome: 0, recognizedExpenses: 0,
  isNewImmigrant: false, aliyahYear: 0,
  isReturningResident: false, returningYear: 0,
  disabilityPercentage: 0, disabilityType: '',
  hasAcademicDegree: false, academicDegreeYear: 0, academicDegreeType: '',
  completedIdf: false, idfReleaseYear: 0,
  completedNationalService: false, nationalServiceYear: 0,
  qualifyingSettlementId: '', qualifyingSettlementOverride: false, qualifyingSettlementCreditPoints: 0,
  hasPension: false, pensionFundName: '',
  employeePensionPct: 0, employerPensionPct: 0,
  hasKrenHashtalmut: false, krenHashtalmutMonthly: 0,
  selfEmployedPensionAmount: 0, krenHashtalmutSE: 0,
};

/** סוג לקוח — עצמאי/יחיד היום, חברה בעתיד */
export type ClientType = 'individual' | 'company';

export interface Client {
  id: string;

  /** סוג לקוח (ברירת מחדל: 'individual'). מכין לתמיכה בחברות בעתיד. */
  type?: ClientType;

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
  // שם בן/בת הזוג מפוצל + שנת לידה — ארבעת שדות ייפוי הכוח בב"ל (110).
  // spouseName נשאר כשרשור לתאימות; הקוראים החדשים מעדיפים את המפוצל.
  spouseFirstName?: string;
  spouseLastName?: string;
  spouseBirthYear?: number;
  /**
   * מייל בן/בת הזוג — פרט קשר קבוע, לא רק אמצעי לחתימה (113).
   * ‼ נאסף בטופס הייצוג (לשליחת קישור חתימה אישי) ונשמר גם כאן, כדי שכתובת
   * שנמסרה פעם אחת לא תיקבר בבקשת ייצוג ישנה. ניתן לעריכה ידנית בכרטיס.
   */
  spouseEmail?: string;
  /** טלפון בן/בת הזוג — פרט קשר קבוע, באותה מתכונת של spouseEmail. ניתן לעריכה ידנית בכרטיס. */
  spousePhone?: string;

  // שנת האירוע שקבע את המצב המשפחתי. רשויות המס דורשות אותה בטפסי הייצוג,
  // והיא קובעת ממתי הזוג/היחיד מדווח בנפרד. ריק = לא ידוע עדיין.
  marriageYear?: number;    // familyStatus === 'married'
  divorceYear?: number;     // familyStatus === 'divorced' — שנת הגירושין ברבנות
  widowhoodYear?: number;   // familyStatus === 'widowed' — שנת הפטירה

  /**
   * מי בן/בת הזוג הרשום/ה במס הכנסה **אומת בפועל** מול שע״ם.
   *
   * ‼ עובדה חיובית ולא היעדר סימון (מיגרציה 140). true נכתב אך ורק כשהרו"ח
   * הכריע בשלב "הפרטים הוזנו בשע״ם". חסר/false = טרם אומת — וזה מכסה גם
   * לקוח ותיק שמעולם לא נשאל וגם כוונה שנרשמה בפתיחת הייצוג. הניסוח ההפוך
   * (`registeredSpouseUnverified`) לא ידע להבחין בין השניים ולכן דילג בדיוק
   * על מי שהיה צריך להישאל.
   *
   * ‼ אינו אומר **מי** הרשום — זה נשאר `taxFiles[income_tax].owner`, מקור
   * האמת היחיד. השדה הזה אומר רק אם מותר להסתמך עליו.
   */
  registeredSpouseVerified?: boolean;

  /**
   * הכרטיס של בן/בת הזוג, כשהוא/היא לקוח/ה בפני עצמו/ה (150).
   *
   * ‼ סימטרי אך לא נאכף ב-DB: כשנקבע, שני הכרטיסים כותבים אותו זה על זה
   * באותה פעולה — ראה `linkSpouseClients`. עד שהוא נקבע, בן/בת הזוג הם
   * שדות שטוחים על הכרטיס הזה בלבד (`spouseName` וכו').
   *
   * ‼ הימצאו אינו קובע מי מיוצג במה — הוא רק **הכתובת**. הבעלות בפועל
   * (ייצוג של אדם / ייצוג של הזוג) נגזרת דרך `utils/personRepresentation.ts`.
   */
  spouseClientId?: string;

  /**
   * יש לבן/בת הזוג עסק, אבל הוא/היא **לא** לקוח/ה שלנו — מיוצג/ת במקום אחר.
   *
   * ‼ הבחנה מפורשת מ-`spouseClientId`: "יש עסק" אינו "הוא הלקוח שלנו". בלי
   * הדגל הזה, ייצוג ברמת אדם (מע"מ/ניכויים/ב"ל) עלול להיקרא כברירת מחדל
   * "אנחנו מנהלים את זה" — וזה בדיוק מה שאסור: לא מנהלים מע"מ/ב"ל של מישהו
   * שלא ביקשנו עליו במפורש. מס הכנסה משותף עדיין רלוונטי גם כשהדגל דלוק.
   */
  spouseRepresentedElsewhere?: boolean;

  // ── נתוני בן/בת זוג מלאים (לחישוב תא משפחתי) ──
  spouse: SpouseData | null;

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

  completedIdf: boolean;
  idfReleaseYear: number;
  completedNationalService: boolean;
  nationalServiceYear: number;

  // ── ישוב מזכה ──
  qualifyingSettlementId: string;     // '' = לא ישוב מזכה
  qualifyingSettlementOverride: boolean; // האם הוגדר ידנית (ולא זוהה אוטומטית)
  qualifyingSettlementCreditPoints: number; // ניתן לשינוי ידני

  // ── נכסים ──
  hasResidentialProperty: boolean;
  propertyAddress: string;       // נשמר לתאימות אחורה (סיכום) — הנתון העדכני נמצא ב-properties[]
  numberOfProperties: number;
  /** רשימה מפורטת של נכסי דיור — אופציונלי, מומלץ למלא במקום propertyAddress */
  properties?: ResidentialProperty[];

  // ── הכנסה משכירות (אופציונלי) ──
  hasRentalIncome?: boolean;
  rentalIncomeAnnual?: number;       // ₪ ברוטו לשנה
  rentalTaxTrack?: RentalTaxTrack;    // exempt / flat10 / regular
  rentalNotes?: string;

  // ── השקעות בשוק ההון (אופציונלי) ──
  hasInvestments?: boolean;
  /** @deprecated השתמש ב-investmentAccounts במקום. נשאר לתאימות לאחור עד שכל הלקוחות יעברו מיגרציה. */
  investmentBrokerName?: string;
  investmentNotes?: string;
  /** רשימת חשבונות השקעה בארץ. כל חשבון = אישור 867 נפרד בצ'ק-ליסט. */
  investmentAccounts?: InvestmentAccount[];

  // ── חשבונות בנק בארץ ──
  /** רשימת חשבונות בנק. החשבון עם isPrimary=true הוא לקבלת החזרי מס. */
  bankAccounts?: BankAccountInfo[];

  // ── מעבידים (שכירים) ──
  /** רשימת מעבידים. כל מעביד = טופס 106 נפרד בצ'ק-ליסט. */
  employers?: EmployerInfo[];

  // ── חשבונות והשקעות בחו"ל (חובת דיווח CRS/FATCA) ──
  hasForeignAssets?: boolean;
  foreignAccounts?: ForeignAccount[];
  isReturningResidentVeteran?: boolean;  // תושב חוזר ותיק (פטור 10 שנים על הכנסות חו״ל)

  // ── הגרלות, הימורים ופרסים (מס נפרד 35%) ──
  hasGamblingIncome?: boolean;
  gamblingIncomeAnnual?: number;        // סך הזכיות (₪)
  gamblingTaxWithheldAtSource?: boolean; // האם נוכה במקור (אז לא צריך דיווח/חישוב)

  // ── הכנסות הון מקומיות (מס נפרד 25%/30%) ──
  hasCapitalIncome?: boolean;
  capitalGainsAnnual?: number;          // רווחי הון (₪) — ני"ע, קריפטו וכו'
  dividendInterestAnnual?: number;       // דיבידנד + ריבית מקומיים (₪)
  isSubstantialShareholder?: boolean;    // בעל מניות מהותי (10%+) — מס 30% במקום 25%

  // ── תרומות וזיכויים נוספים ──
  donationsAnnual?: number;              // תרומות שנתיות מוכרות סעיף 46 (₪)
  hasLifeInsurance?: boolean;
  lifeInsuranceAnnual?: number;          // פרמיה שנתית לביטוח חיים/אכ״ע (₪)
  hasMedicalInsurance?: boolean;
  medicalInsuranceAnnual?: number;       // פרמיה שנתית לבריאות/סיעוד (₪)

  // ── פנסיה וחיסכון ──
  hasPension: boolean;
  /** @deprecated השתמש ב-pensionFunds. נשאר לתאימות. */
  pensionFundName: string;
  employeePensionPct: number;
  employerPensionPct: number;
  hasKupotGemel: boolean;
  hasKrenHashtalmut: boolean;
  krenHashtalmutMonthly: number;
  /** רשימה מפורטת של קופות פנסיה/השתלמות/קופ"ג. כל קופה = אישור הפקדות נפרד. */
  pensionFunds?: PensionFundInfo[];

  // ── אזרחויות נוספות (FATCA/CRS + אמנות מס) ──
  /** אזרחויות נוספות מעבר לישראלית. דוגמאות: 'ארה"ב', 'בריטניה'. */
  additionalCitizenships?: string[];

  // ── ביטוח אובדן כושר עבודה (שדה 112 ב-1301, נפרד מביטוח חיים) ──
  hasDisabilityInsurance?: boolean;
  disabilityInsuranceAnnual?: number;

  // ── קרובים תלויים במוסד (סעיף 44ב — זיכוי 35%) ──
  dependentRelatives?: DependentRelativeInfo[];

  // ── רשימת עסקים (לעצמאי עם 2+ עסקים) ──
  /** כל עסק = נספח א' (1320) נפרד. למשתמש עם עסק יחיד, שדות businessDescription/vatStatus ברמת הלקוח הם המקור. */
  businesses?: BusinessInfo[];

  // ── דיווחי חובה ומצבים מיוחדים ──
  isFamilyCompanyMember?: boolean;
  familyCompanyName?: string;
  isForeignControllingShareholder?: boolean;
  foreignCompanyDetails?: string;
  /** עסקאות עם צדדים קשורים בחו"ל — מחייב נספח 1385 (סעיף 85א). */
  hasRelatedPartyTransactionsAbroad?: boolean;
  isKibbutzMember?: boolean;
  kibbutzName?: string;
  /** סעיף 14 — פטור 10 שנים על הכנסות חו"ל לעולים/חוזרים ותיקים. */
  section14Elected?: boolean;
  section14StartYear?: number;

  // ── עובדות שנאספו בשיחת הליד ונשמרות על הלקוח ──
  // ‼ מכתב השחרור נשען על השדות האלה ולא על הליד: ליד שנמחק אחרי ההמרה
  // השאיר את זרימת השחרור בלי נמען ובלי שם עסק.
  businessName?: string;
  dealerType?: import('./quotations').LeadDealerType;
  hasPreviousAccountant?: boolean;
  prevAccountantName?: string;
  prevAccountantEmail?: string;
  prevAccountantPhone?: string;
  /** true = העברה מרו"ח אחר, false = עסק חדש. undefined = לא נשאל. */
  businessTransfer?: boolean;
  referralSource?: string;

  // ── הערות ──
  notes: string;

  // ── שלב חיים של הכרטיס (אדם אחד = כרטיס אחד) ──
  // ‼ נגזר בשרת (refresh_lifecycle_stages) — המסך לא כותב אותו, חוץ מהעברה
  // לארכיון והחזרה ממנו, שהן ההחלטה האנושית היחידה כאן.
  lifecycleStage?: LifecycleStage;
  /** הליד שממנו נוצר הכרטיס, אם היה כזה */
  mergedFromLeadId?: string;

  // ── סטטוס ייצוג (lifecycle של תהליך הייצוג) ──
  // ‼ null (ולא רק undefined) מציין ניקוי מפורש: מחיקת בקשת הייצוג המקושרת
  // (שלב 3) מנקה את השדות האלה בלי למחוק את הכרטיס עצמו. objectToRow שולח
  // undefined = "לא לגעת" ו-null = לכתוב NULL בפועל — ראה lib/dbMappers.ts.
  representationStatus?: RepresentationStatus | null; // ברירת מחדל: 'active' (לקוח שנוצר ידנית)
  representationRequestId?: string | null;            // קישור ל-RepresentationRequest אם הלקוח נוצר מבקשה

  // ── מרשם ייצוג לפי רשות — מצב הייצוג מול כל רשות בנפרד (RepresentationRecord) ──
  // מתוכנן להחזיק בעתיד גם היסטוריה, הגשות, אישורים וקישורי מסמכים לכל רשות.
  // ‼ לא null: העמודה NOT NULL DEFAULT '{}'::jsonb — ריקון כותב אובייקט ריק,
  // לא null (אומת ישירות מול המסד; ראה handleDeleteRequest).
  authorityRepresentations?: AuthorityRepresentations;

  // ── הרחבות תיק עבודה (אופציונלי, ראה types/clientWorkspace.ts) ──
  // השדות הבאים אופציונליים כדי לא לשבור רשומות קיימות.
  assignedAccountantId?: string;
  tags?: string[];
  pinnedNote?: string;
  additionalContacts?: import('./clientWorkspace').ClientContact[];

  vatFrequency?: import('./clientWorkspace').VATFrequency;
  vatDetailedReport?: boolean;
  vatDetailedReportStartDate?: string;

  pitAdvancePercent?: number;
  pitAdvanceFrequency?: import('./clientWorkspace').VATFrequency;

  withholdingFrequency?: import('./clientWorkspace').WithholdingFrequency;
  withholdingRate?: number;
  withholdingValidUntil?: string;
  bookStatus?: import('./clientWorkspace').BookStatus;

  niAdvanceMonthly?: number;

  shaamStatus?: import('./clientWorkspace').ShaamStatus;
  shaamCreatedAt?: string;
  shaamLastUsed?: string;
  shaamSource?: import('./clientWorkspace').FieldSource;

  taxOfficeName?: string;
  withholdingOfficeName?: string;
  niBranchName?: string;

  /** תיקי הרשויות של התא המשפחתי — מי הבעלים של כל תיק ומה סטטוס הייצוג. */
  taxFiles?: TaxFileInfo[];

  hasWealthDeclaration?: boolean;
  lastWealthDeclarationYear?: number;

  // ── M2 — יישור קו מול הרשויות: עובדות מקצועיות שנאספות ומנותבות דרך
  // תיק המס (propose_tax_facts/accept_tax_fact_change, source='institution_alignment').
  // כל רשות בנפרד — לא מוסקות זו מזו (הרשאת חיוב במע"מ ≠ הרשאת חיוב במס הכנסה).
  niBalance?: number;
  niOccupations?: NiOccupation[];
  niDebitAuthorization?: boolean;
  /** בסיס הכנסה למקדמות בביטוח לאומי — לחודש. עובדה מקצועית מאושרת (M2 fix, לא רק תיעוד). */
  niIncomeBasisMonthly?: number;

  vatBalance?: number;
  vatDebitAuthorization?: boolean;
  vatFileType?: string;
  vatOpeningDate?: string;
  vatPrimaryIndustry?: string;
  vatLastReportPeriod?: string;

  incomeTaxBalance?: number;
  incomeTaxFileType?: string;
  incomeTaxUnit?: string;
  incomeTaxEconomicIndustry?: string;
  incomeTaxDebitAuthorization?: boolean;
  /** תיאור חופשי כשהניכוי במקור אינו שיעור בודד (למשל "5% שירותים / 10% מוצרים"). withholdingRate נשאר לשיעור הפשוט. */
  withholdingDetail?: string;
  /**
   * מצב אישור הניכוי במקור. ‼ 'rates' ו-'none' אינם ניתנים להבחנה דרך
   * hasExemptFromWithholding (שניהם false) — ובלי ההבחנה הזו "אין אישור תקף"
   * אינו ניתן לזיהוי כדגל שדורש טיפול. ראה supabase/146.
   */
  withholdingStatus?: 'exempt' | 'rates' | 'none';
  /** מצב דיווחים במס הכנסה, כפי שנרשם ב-134 מקדמות (למשל "אין דיווחים חסרים" / "חסר דיווח"). עובדה מקצועית מאושרת (M2 fix). */
  incomeTaxReportingStatus?: string;

  capitalDeclarationRequired?: boolean;
  capitalDeclarationDeadline?: string;

  // ── V6 — עובדות מס אישיות שאינן הנהלת חשבונות של העסק (מיגרציה 152) ──
  // ‼ מחזור העסק והוצאות מוכרות **אינם כאן בכוונה**: הם שייכים לפייפרלס.
  // מה שכאן הוא ניכוי/הכנסה של הנישום עצמו, שנכנס לדוח בנפרד מספרי העסק.
  /** הכנסה אחרת שאינה עסק/שכר/שכירות/שוק ההון. */
  otherIncome?: number;
  /** הוצאות על נכס מושכר (מסלול רגיל) — הוצאה אישית, לא ספרי העסק. */
  rentalExpenses?: number;
  /** הפקדת עצמאי לפנסיה/גמל — ניכוי אישי לפי סעיף 47. */
  selfEmployedPensionAmount?: number;
  /** הפקדת עצמאי לקרן השתלמות — ניכוי אישי. */
  krenHashtalmutSE?: number;
  /** מס ששולם בחו״ל — לזיכוי מס זר. */
  foreignTaxPaid?: number;
  hasForeignIncome?: boolean;
  foreignIncomeAnnual?: number;
  /** ימי מילואים כלוחם בשנה הקודמת — סעיף 39ב, מ-2026. מזין את creditPoints. */
  reserveCombatDaysPrevYear?: number;
  /** עוגן ידיעה לקריפטו. הפירוט חי ב-investmentAccounts (ישראל) וב-foreignAccounts (חו״ל). */
  hasCrypto?: boolean;
  /**
   * האם נתוני הנהלת החשבונות של העסק בידינו. ‼ סימון בלבד — לא הנתונים
   * עצמם, ולא העמדת פנים שקיימת אינטגרציה לפייפרלס. חסר ⇒ נגזר משלב
   * data_verification בקליטה.
   */
  businessDataStatus?: 'received' | 'waiting' | 'not_applicable';

  fieldMeta?: Record<string, import('./clientWorkspace').FieldMeta>;
  activity?: import('./clientWorkspace').ActivityEntry[];

  createdAt: string;
  updatedAt: string;
}

// ─── בקשת ייצוג ─────────────────────────────────────────────────────────────

/**
 * רשויות שאפשר לבקש ייצוג מולן בטופס 2279א'5 (השעמ).
 * שים לב: ביטוח לאומי הוא טופס נפרד ולא נכלל כאן.
 */
export type AuthorityKind = 'incomeTax' | 'vat' | 'withholding';

/** סטטוס הבקשה (ה-lifecycle של תהליך הייצוג) */
export type RepresentationStatus =
  | 'pending_fill'         // נשלחה ללקוח, ממתינה למילוי
  | 'awaiting_accountant'  // הלקוח מילא — עליי להפיק את טופס השע"מ
  | 'pending_signature'    // הטופס נשלח ללקוח לחתימה
  | 'awaiting_stamp'       // הלקוח חתם — עליי לחתום ולהוסיף חותמת משרד
  | 'awaiting_authorities' // נשלח לשע"מ, ממתין לאישור הרשויות
  | 'active';              // מיוצג פעיל

/** מסמך אחד שהמייצג מבקש מהלקוח להעלות */
export interface RequestedDocItem {
  id: string;
  label: string;
  required: boolean;
  isDefault: boolean; // ברירת מחדל של המערכת (לא ניתן למחיקה)
}

/** קובץ שהלקוח העלה — מפנה לרשומה ב-IndexedDB */
export interface UploadedDocRef {
  docItemId: string;     // ה-id של ה-RequestedDocItem
  storedDocId: string;   // id ב-IndexedDB
  fileName: string;
  fileSize: number;
}

/** מה שהלקוח שלח */
export interface RequestSubmission {
  firstName: string;
  lastName: string;
  idNumber: string;
  birthDate: string;
  gender: Gender;
  phone: string;
  email: string;
  city: string;
  address: string;
  notes: string;
  uploadedDocs: UploadedDocRef[];
  signatureDataUrl: string;  // base64 PNG מה-canvas
  signedAt: string;
  allowSmsEmail: boolean;    // checkbox בטופס: אישור לקבלת הודעות
}

/** חלק ב' של הטופס — נמלא ע"י המייצג בעת ההחתמה */
export interface AccountantPartB {
  firmName: string;            // שם המשרד המייצג
  representativeNumber: string;// מספר מייצג
  representativeType: string;  // סוג המייצג (רו"ח / יועץ מס / עו"ד)
  // מספרי תיקים — אופציונליים, ימולאו אם ידועים
  incomeTaxFileNumber: string;
  vatDealerNumber: string;
  withholdingFileNumber: string;
  signatureDataUrl: string;    // חתימת המייצג
  signedAt: string;
}

// ── חותמים על ייפוי הכוח ──────────────────────────────────────────────────
// לקוח יחיד → חותם אחד. לקוח נשוי → שני חותמים (הנישום + בן/בת הזוג), שכל אחד
// מקבל בקשת חתימה ומצב חתימה נפרד, כדי שרואה החשבון יראה מי כבר חתם ומי ממתין.
export type RepSignerRole = 'client' | 'spouse';
export type RepSignStatus = 'pending' | 'signed';

export interface RepSigner {
  id: string;                    // 'client' | 'spouse' (או מזהה ייחודי בעתיד)
  role: RepSignerRole;
  name: string;
  email: string;                 // לאן נשלחת בקשת החתימה שלו
  signStatus: RepSignStatus;
  signedAt?: string | null;
  signToken?: string;            // טוקן חתימה ייחודי לחותם (לזרימת החתימה)
  /** מתי נשלח קישור חתימה ביוזמת הנישום ("לשלוח לבן/בת הזוג בנפרד") */
  inviteSentAt?: string;
  /** מי סיפק את כתובת המייל — הרו"ח בהקמה או הנישום בשלב החתימה */
  emailSource?: 'accountant' | 'client';
}

export const REP_SIGNER_ROLE_LABELS: Record<RepSignerRole, string> = {
  client: 'הנישום',
  spouse: 'בן/בת הזוג',
};

export interface RepresentationRequest {
  id: string;
  linkedClientId: string;       // ה-id של ה-Client הקשור (תמיד קיים מרגע היצירה)

  // ── הגדרות המייצג ──
  clientName: string;
  clientEmail: string;
  authorities: AuthorityKind[];
  requestedDocs: RequestedDocItem[];
  notes: string;

  // ── סטטוס ─
  status: RepresentationStatus;
  createdAt: string;
  updatedAt: string;

  // ── מילוי הלקוח ──
  submission: RequestSubmission | null;
  submittedAt: string | null;

  // ── חתימת המייצג + יצירת PDF ──
  partB: AccountantPartB | null;
  signedPdfStoredId: string | null; // id ב-IndexedDB של ה-PDF החתום הסופי

  // ── פרטים שחולצו מ-OCR (מהת.ז. ורישיון הנהיגה) ──
  ocrExtracted: {
    firstName?: string;
    lastName?: string;
    idNumber?: string;
    birthDate?: string;
    gender?: Gender;
    address?: string;
    city?: string;
  } | null;

  // ── אונבורדינג ציבורי (Phase 2): קישור הזדהות + הפרטים שהלקוח מילא ──
  onboardingToken?: string;
  onboardingStatus?: 'pending' | 'submitted';
  identification?: OnboardingIdentification | null;
  onboardingSubmittedAt?: string | null;
  /** מה שהרו"ח מילא במפורש בהפקת הקישור — רק אלה מדולגים בטופס הלקוח. */
  prefill?: OnboardingPrefill;
  /** מעקב הזנת הפרטים בפורטלים של הרשויות. ראה RepresentationExecution. */
  execution?: RepresentationExecution;

  // ── חותמים (נישום + בן/בת זוג אם נשוי) ──
  // אם ריק/לא קיים — נגזר חותם יחיד מ-clientName/clientEmail (תאימות לאחור).
  signers?: RepSigner[];

  // ── הגדרת מסמך החתימה (שלב "הפקת טופס"): ה-PDF שהרו"ח העלה + אזורי החתימה ──
  // קיום setup ⇒ הבקשה עובדת בזרימת החתימה החדשה (חדר חתימה על PDF אמיתי).
  signatureSetup?: SignatureSetup | null;
  /**
   * כל טופסי ה-2279 של הבקשה. חסר ⇒ בקשה מלפני המהלך, ואז המסמך היחיד נגזר
   * מ-`signatureSetup` + `signedPdfStoredId` (ראה `signatureDocumentsOf`).
   *
   * ‼ המסמך הראשון ממשיך להישמר גם בשדות הישנים, כדי שכל מי שקורא אותם —
   * `get_onboarding.has_setup`, `submit_signature`, מסכי הסטטוס — ימשיך
   * לעבוד בלי לדעת על הרשימה.
   */
  signatureDocuments?: RepSignatureDocument[] | null;
  // ערכי החתימות שנאספו מכל החותמים: fieldId → ערך (תמונה/טקסט).
  // ‼ מפתח שטוח על פני כל המסמכים — מזהי השדות ייחודיים גלובלית.
  signatureValues?: Record<string, SignatureValue> | null;
  /**
   * ההיקף שהתבקש — **תמונת מצב היסטורית**, נכתבת פעם אחת בפתיחת הבקשה.
   *
   * ‼ זה מקור האמת ל"מה ביקשנו ולמי", ולא `clients.authorityRepresentations`
   * (שממשיך לזוז עם הזמן) ולא `tax_files` (שמתאר תיקים בפועל, וגם הם
   * משתנים). פותחים בקשה אחרי חודש ורואים בדיוק מה ביקשנו אז.
   * ‼ חסר ⇒ בקשה שנוצרה לפני המהלך; נופלים למרשם של הכרטיס.
   */
  scope?: AuthorityRepresentations | null;
  /**
   * צילומי התעודות שהתקבלו בקליטה, לפי אדם. הקבצים עצמם נשמרים כמסמכים
   * רגילים בתיק הלקוח (category='id_card'); כאן רק המפתח, כדי לדעת מה הגיע.
   * נכתב ע"י `onboarding-upload-id` בלבד.
   */
  identityDocs?: Partial<Record<RepTarget, { documentId: string; docKind: string; fileName?: string; at?: string }[]>> | null;
}

/** הגדרת מסמך החתימה — נוצרת בשלב "הפקת טופס" אצל הרו"ח */
export interface SignatureSetup {
  pdfDocId: string;         // מזהה ה-PDF שהועלה במאגר המסמכים
  pdfFileName: string;
  fields: SignatureField[]; // signerId ∈ 'client' | 'spouse' | 'accountant'
  createdAt: string;
}

/**
 * טופס 2279 אחד מתוך הבקשה. בקשה של משק בית עשויה להוליד כמה טפסים: מע"מ
 * וניכויים מוגשים בנפרד לכל אדם, ואי אפשר לדחוס שני תיקי מע"מ לטופס אחד
 * (בחלק ב' יש שורת «שם העוסק» אחת).
 *
 * ‼ החותמים **אינם** משתנים בין המסמכים. לפי הכלל שאושר, מיקומי החתימה
 * נגזרים מיחסי בן-הזוג-הרשום ולא ממי שהתיק שלו: הרשום חותם תמיד במקום
 * «בן זוג רשום» והשני במקום «בן/בת הזוג», בכל טופס. מה שמשתנה הוא התיק
 * שהטופס מייצג. לכן `signers` נשאר ברמת הבקשה.
 */
export interface RepSignatureDocument {
  /** מפתח ההגשה — `ShaamSubmission.key`: 'person:client' | 'person:spouse'. */
  key: string;
  /** "מס הכנסה · משק הבית" / "מע\"מ · מיכל סלע" — התיק שהטופס מייצג. */
  title: string;
  pdfDocId: string;
  pdfFileName: string;
  fields: SignatureField[];
  createdAt: string;
  /** ה-PDF הסופי של המסמך הזה (חתימות + חותמת). ריק = טרם הוחתם. */
  signedPdfStoredId?: string | null;
}

/** פרטי הזדהות שהלקוח מילא בעמוד הציבורי */
export interface OnboardingIdentification {
  idNumber?: string;
  birthDate?: string;
  secondaryType?: OnboardingSecondaryType;
  secondaryValue?: string;
  spouseName?: string;          // שם בן/בת הזוג (נקלט בבקשת הייצוג)
  signatureDataUrl?: string;    // חתימת הלקוח על ייפוי הכוח (שלב pending_signature)
  signedAt?: string;

  // ── פרטים שהלקוח ממלא בעצמו בקישור הוואטסאפ ──
  // שם פרטי ומשפחה נשמרים בנפרד ולא כשדה אחד: טופס ייפוי הכוח בביטוח לאומי
  // ובשע"ם דורש כל אחד בשדה נפרד, ופיצול אוטומטי של "שם מלא" שוגה בשמות מורכבים.
  firstName?: string;
  lastName?: string;
  phone?: string;
  email?: string;
  city?: string;
  address?: string;
  familyStatus?: FamilyStatus;
  familyStatusYear?: number;    // שנת נישואין / גירושין ברבנות / פטירה, לפי המצב
  spouseEmail?: string;         // לשליחת בקשת חתימה נפרדת לבן/בת הזוג
  spouseIdNumber?: string;
  // שם בן/בת הזוג מפוצל + שנת לידה — ארבעת שדות ייפוי הכוח בב"ל, שהלקוח
  // ממלא בעצמו בקליטה (110). spouseName נשאר כשרשור לתאימות לאחור.
  spouseFirstName?: string;
  spouseLastName?: string;
  spouseBirthYear?: number;
  // ── פרטי הזדהות מלאים של בן/בת הזוג — נאספים רק כשיש לו/לה תיק ────────
  // ‼ הכרעת גיא (31.8): מי שיש לו הגשה בשע״ם צריך את ערכת ההזדהות שלו
  // (ת.ז. + רישיון/דרכון/ת.ז. הורה). אין תיק — לא מטריחים.
  spouseBirthDate?: string;
  spouseSecondaryType?: OnboardingSecondaryType;
  spouseSecondaryValue?: string;
  /** נמסר לבן/בת הזוג להשלמה עצמית (149). ממתינים = התבקש ולא הושלם. */
  spouseFillRequestedAt?: string;
  spouseFillSubmittedAt?: string;
}

/**
 * מעקב אחרי ההזנה בפועל בפורטלים של הרשויות. שני המסלולים נפרדים לגמרי:
 * מס הכנסה עובד מול שע"ם וייפוי הכוח נחתם דיגיטלית אצלנו; ביטוח לאומי מנפיק
 * מספר אסמכתא עם מועד תפוגה, והלקוח הוא זה שמאשר אותו מול הביטוח הלאומי.
 * כל שדה תאריך = "בוצע ומתי". ריק = טרם בוצע.
 */
/**
 * מעקב ייפוי כוח בביטוח לאומי של אדם אחד. בב"ל לכל מבוטח תיק נפרד, ולכן זוג
 * נשוי שמיוצג בב"ל מקבל שתי אסמכתאות — כל אחד מאשר את שלו בנפרד.
 */
export interface NiTracking {
  /** ייפוי הכוח הוזן באתר הביטוח הלאומי */
  enteredAt?: string;
  /** מספר האסמכתא שהביטוח הלאומי הנפיק — המבוטח מאשר באמצעותו */
  referenceNumber?: string;
  /** המועד האחרון לאישור הטופס (YYYY-MM-DD). אחריו האסמכתא פגה. */
  deadline?: string;
  /** נשלחו למבוטח הוראות האישור */
  instructionsSentAt?: string;
  /** איך הן הגיעו: יחד עם בקשת החתימה (רצוי), או במייל נפרד (השלמה בדיעבד). */
  instructionsSentWith?: 'signature' | 'standalone';
  /** המבוטח אישר את ייפוי הכוח — הייצוג בב"ל פעיל עבורו */
  confirmedAt?: string;
}

export interface RepresentationExecution {
  /**
   * מתי יצא ללקוח מייל החתימה. פעולה מפורשת ונפרדת מהפקת הטופס, כדי שלא ייצא
   * מייל לפני שהוזנה אסמכתת ב"ל — אחרת הלקוח מקבל מייל חלקי ואז עוד אחד מלא.
   */
  signatureEmailSentAt?: string;
  incomeTax?: {
    /** הפרטים הוזנו בשע"ם ונפתחה בקשת ייצוג */
    enteredAt?: string;
  };
  /**
   * הזנות שע״ם נוספות, לפי מפתח `ShaamSubmission.key` (`person:spouse`).
   *
   * ‼ בשע״ם נכנסים עם ת.ז. אחת ומזינים את כל המוסדות של אותו אדם בבת אחת,
   * ולכן ההזנה היא **לכל אדם** ולא לכל רשות. ההזנה הראשונה נשמרת ב-
   * `incomeTax` לעיל (תאימות לאחור), והשאר כאן. בקשה ישנה שאין לה את המפה
   * הזאת מציגה בדיוק את מה שהציגה קודם.
   */
  shaamEntries?: Record<string, { enteredAt?: string }>;
  /** ב"ל של הנישום עצמו */
  nationalInsurance?: NiTracking;
  /** ב"ל של בן/בת הזוג — קיים רק כשנלקח ייצוג ב"ל גם עבורו/ה */
  nationalInsuranceSpouse?: NiTracking;
}

/** מפתח מעקב הב"ל לפי החותם — כדי שכל אחד יקבל את האסמכתא שלו ולא של השני. */
export const NI_EXEC_KEY: Record<RepSignerRole, 'nationalInsurance' | 'nationalInsuranceSpouse'> = {
  client: 'nationalInsurance',
  spouse: 'nationalInsuranceSpouse',
};

/** טלפון המענה הקולי לאישור ייפוי כוח בביטוח לאומי (מופיע גם במייל ללקוח). */
export const NI_APPROVAL_PHONE = '02-5393740';

/**
 * מסך אישור ייפוי הכוח באתר הביטוח הלאומי. קישור ישיר למסך עצמו ולא לדף
 * הבית — משם הלקוח צריך לחפש את השירות בעצמו, וזו הנקודה שבה הוא נוטש.
 * מופיע גם במייל (send-onboarding-email), שם הוא כפול כי Deno אינו מייבא מכאן.
 */
export const NI_APPROVAL_SITE = 'https://b2b.btl.gov.il/BTL.ILG.PAYMENTS/IshurIpuyKoachInfo.aspx';
export const NI_APPROVAL_SITE_LABEL = 'מסך אישור ייפוי כוח למייצג';

/**
 * מה שהרו"ח בחר במפורש בעת הפקת קישור הייצוג. שדה שמופיע כאן לא ייבחר שוב
 * ע"י הלקוח. נשמר בנפרד מכרטיס הלקוח כי שם לשדות יש ברירות מחדל, ואי אפשר
 * להבחין בין "הרו"ח בחר רווק" ל"אף אחד לא נגע בשדה".
 */
export interface OnboardingPrefill {
  firstName?: string;
  lastName?: string;
  email?: string;
  familyStatus?: FamilyStatus;
  familyStatusYear?: number;
  spouseName?: string;
  spouseIdNumber?: string;
  /** טופס "הוספת ייפוי כח מבוטח" בב"ל דורש שנת לידה. לא חובה אצל הרו"ח —
      מה שחסר, הלקוח משלים בקישור (110). */
  spouseBirthYear?: number;
  /** שם מפוצל — מגיע מהכרטיס דרך get_onboarding; הרו"ח מזין שם אחד מלא */
  spouseFirstName?: string;
  spouseLastName?: string;
  /**
   * על שם מי יתנהל תיק מס הכנסה — בן/בת הזוג הרשום/ה.
   * ‼ זו **כוונה ולא ידיעה** (הכרעת גיא 2026-08-27): ברגע פתיחת הבקשה עוד לא
   * ראינו מה רשום במ"ה. נכתב לכרטיס כ-`taxFiles[income_tax].owner` (מקור
   * האמת היחיד), ונשאר לא-מאומת עד ההכרעה בשלב "הפרטים הוזנו בשע״ם" —
   * ראה `Client.registeredSpouseVerified`.
   */
  registeredSpouse?: 'client' | 'spouse';
}

export type OnboardingSecondaryType = 'parentId' | 'driverLicense' | 'passport';

export const FAMILY_STATUS_LABELS: Record<FamilyStatus, string> = {
  single:       'רווק/ה',
  married:      'נשוי/אה',
  divorced:     'גרוש/ה',
  widowed:      'אלמן/ה',
  singleParent: 'הורה יחיד',
};

/** תווית שנת האירוע שקבע את המצב המשפחתי, לפי המצב. חסר = אין שנה רלוונטית. */
export const FAMILY_STATUS_YEAR_LABELS: Partial<Record<FamilyStatus, string>> = {
  married:  'שנת הנישואין',
  divorced: 'שנת הגירושין ברבנות',
  widowed:  'שנת הפטירה',
};

export const ONBOARDING_SECONDARY_LABELS: Record<OnboardingSecondaryType, string> = {
  parentId: 'תעודת זהות של הורה',
  driverLicense: 'מספר רישיון נהיגה',
  passport: 'מספר דרכון',
};

export const DEFAULT_REQUESTED_DOCS: RequestedDocItem[] = [
  { id: 'id_card', label: 'תצלום תעודת זהות + ספח', required: true, isDefault: true },
  { id: 'drivers_license', label: 'תצלום רישיון נהיגה', required: true, isDefault: true },
];

/** קטלוג של מסמכים נפוצים שאפשר להוסיף בלחיצה */
export const DOC_CATALOG: { id: string; label: string }[] = [
  { id: 'form_106', label: 'טופס 106 (מעסיק)' },
  { id: 'form_161', label: 'טופס 161 (הודעת מעביד על עזיבה)' },
  { id: 'form_867', label: 'טופס 867 (ני"ע / ריביות)' },
  { id: 'pension_cert', label: 'אישור פנסיה / קופות גמל' },
  { id: 'bank_account', label: 'אישור ניהול חשבון בנק / שיק מבוטל' },
  { id: 'donations', label: 'קבלות תרומות (סעיף 46)' },
  { id: 'aliyah', label: 'תעודת עולה חדש / תושב חוזר' },
  { id: 'life_insurance', label: 'אישור ביטוח חיים / אכ"ע' },
  { id: 'residence', label: 'אישור מגורים (ישוב מזכה)' },
  { id: 'tax_assessment', label: 'שומת מס שנה קודמת' },
  { id: 'business_pnl', label: 'דוח רווח והפסד (לעצמאי)' },
  { id: 'salary_slip', label: 'תלושי שכר אחרונים' },
];

export const AUTHORITY_LABELS: Record<AuthorityKind, string> = {
  incomeTax: 'מס הכנסה',
  vat: 'מע"מ',
  withholding: 'ניכויים',
};

// ─── שלב חיים של הכרטיס ─────────────────────────────────────────────────────
// אדם אחד, כרטיס אחד: אותו אדם עובר ליד → הצעה → קליטה → לקוח פעיל בלי
// שמוקם לו כרטיס נוסף. השלב נגזר בשרת מהליד, ההצעה, הקליטה והייצוג —
// 'archived' הוא היחיד שנקבע ידנית, והוא הסתרה בלבד (שום נתון לא נמחק).
export type LifecycleStage = 'lead' | 'quoted' | 'onboarding' | 'active' | 'archived';

export const LIFECYCLE_STAGE_LABELS: Record<LifecycleStage, string> = {
  lead: 'ליד',
  quoted: 'בהצעה',
  onboarding: 'בקליטה',
  active: 'לקוח פעיל',
  archived: 'בארכיון',
};

export const REPRESENTATION_STATUS_LABELS: Record<RepresentationStatus, string> = {
  pending_fill: 'ממתין למילוי הלקוח',
  awaiting_accountant: 'דורש הפקת טופס',
  pending_signature: 'נשלח לחתימת הלקוח',
  awaiting_stamp: 'דרושה חתימה + חותמת שלי',
  awaiting_authorities: 'ממתין לאישור הרשויות',
  active: 'מיוצג פעיל',
};

export const REPRESENTATION_STATUS_BADGE: Record<RepresentationStatus, string> = {
  pending_fill: 'badge-orange',
  awaiting_accountant: 'badge-red',
  pending_signature: 'badge-blue',
  awaiting_stamp: 'badge-orange',
  awaiting_authorities: 'badge-purple',
  active: 'badge-green',
};

// ─── מרשם ייצוג לפי רשות ─────────────────────────────────────────────────────
// בניגוד ל-AuthorityKind (שמכסה רק את שלוש רשויות טופס 2279א'5 בשע"ם),
// המרשם מכסה את כל ארבע הרשויות — כולל ביטוח לאומי, שהוא ייצוג נפרד.

export type RepAuthorityKind = 'incomeTax' | 'withholding' | 'vat' | 'nationalInsurance';

/** סטטוס הייצוג מול רשות בודדת */
export type RepAreaStatus = 'none' | 'in_process' | 'active';

/** סוג/רמת הייצוג — רלוונטי למ"ה / ניכויים / מע"מ; ביטוח לאומי ללא סוג */
export type RepLevel = 'primary' | 'secondary';

/** עבור מי הייצוג — האדם, לא התיק. */
export type RepTarget = 'client' | 'spouse';

export const REP_TARGET_LABELS: Record<RepTarget, string> = {
  client: 'הלקוח/ה',
  spouse: 'בן/בת הזוג',
};

/**
 * הרשויות שבהן הייצוג שייך ל**אדם** ולא לתא המשפחתי, ולכן ייתכן תיק נפרד
 * לכל בן זוג ושתי הגשות/ייפויי כוח נפרדים.
 *
 * ‼ הכרעת גיא (31.8): ביטוח לאומי הצטרף לכאן — הוא בדיוק אותו מודל כמו
 * מע"מ וניכויים (תיק נפרד לכל אדם), ולא מודל שלישי. `coversSpouse` היה
 * הביטוי הישן והמצומצם ("הנישום, ואולי גם") לפני שהיה `targets[]` — ראה
 * את שדה `coversSpouse` למטה.
 *
 * ‼ מס הכנסה אינו כאן ולעולם לא יהיה: יש תיק אחד לתא המשפחתי, ומי שעליו
 * הוא מתנהל נקבע במחזור בן-הזוג-הרשום (`registeredSpouseVerified`).
 */
export const REP_AUTHORITIES_WITH_TARGETS: RepAuthorityKind[] = ['vat', 'withholding', 'nationalInsurance'];

/** רשומת הייצוג מול רשות בודדת. מתוכננת להתרחב (היסטוריה, הגשות, מסמכים). */
export interface AuthorityRepresentation {
  status: RepAreaStatus;
  level?: RepLevel;
  /**
   * @deprecated — סופח ל-`targets` (31.8). ביטוח לאומי הצטרף ל-רשויות עם
   * "עבור מי", ומאז נכתב תמיד `targets` במפורש. השדה הזה נשאר **לקריאה
   * בלבד**, לתאימות עם רשומות שנוצרו לפניו — ראה הנפילה-לאחור ב-`targetsOf`.
   * אין קורא שאמור לבדוק אותו ישירות; כולם עוברים דרך `targetsOf`.
   */
  coversSpouse?: boolean;
  /**
   * עבור מי התבקש הייצוג — לרשויות ברמת אדם (`REP_AUTHORITIES_WITH_TARGETS`).
   *
   * ‼ **חסר = `['client']`** — בדיוק מה שכל בקשה קיימת אמרה כשנוצרה, ולא
   * פרשנות חדשה. בקשות חדשות כותבות את השדה תמיד במפורש.
   * ‼ שני יעדים = **שתי הגשות נפרדות**, כל אחת על התיק של אותו אדם.
   */
  targets?: RepTarget[];
}

export type AuthorityRepresentations = Partial<Record<RepAuthorityKind, AuthorityRepresentation>>;

/** סדר התצוגה הקבוע של הרשויות */
export const REP_AUTHORITY_ORDER: RepAuthorityKind[] = ['incomeTax', 'withholding', 'vat', 'nationalInsurance'];

/** הרשויות שבהן בוחרים סוג ייצוג (ביטוח לאומי — ייצוג יחיד, ללא סוג) */
export const REP_AUTHORITIES_WITH_LEVEL: RepAuthorityKind[] = ['incomeTax', 'withholding', 'vat'];

export const REP_AUTHORITY_LABELS: Record<RepAuthorityKind, string> = {
  incomeTax: 'מס הכנסה',
  withholding: 'ניכויים',
  vat: 'מע"מ',
  nationalInsurance: 'ביטוח לאומי',
};

/** קיצורים לטבלת הלקוחות */
export const REP_AUTHORITY_SHORT: Record<RepAuthorityKind, string> = {
  incomeTax: 'מ"ה',
  withholding: 'ניכ׳',
  vat: 'מע"מ',
  nationalInsurance: 'ב"ל',
};

export const REP_LEVEL_LABELS: Record<RepLevel, string> = {
  primary: 'מייצג ראשי',
  secondary: 'מייצג משני',
};

export const REP_AREA_STATUS_LABELS: Record<RepAreaStatus, string> = {
  none: 'לא בייצוג',
  in_process: 'בתהליך',
  active: 'מיוצג',
};

// ─── חישוב תא משפחתי ────────────────────────────────────────────────────────

export interface FamilyTaxResult {
  primary: TaxCalcResult;
  spouse: TaxCalcResult | null;
  combinedGrossIncome: number;
  combinedTaxBurden: number;
  combinedNetIncome: number;
  combinedEffectiveRate: number;
  // היטל יסף מתוקן על הכנסה משולבת
  combinedSurtax: number;
  surtaxSavingVsSeparate: number;
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
  /** מס יסף נוסף על הכנסות שאינן מיגיעה אישית (סעיף 121ב(א1), תיקון 276) — 2% מ-2025 */
  surtaxCapitalExtraRate: number;
  niAverageWage: number;
  niThreshold60Monthly: number;
  niMaxIncomeMonthly: number;
  employeeNI: NIRates;
  selfEmployedNI: NIRates;
  /** דמי ביטוח על הכנסה פסיבית (שאינה מעבודה) — פטור עד 25% מהשכר הממוצע */
  passiveNI: NIRates;
  /** ניכוי דמי ביטוח מפנסיה מוקדמת (במקור ע"י משלם הפנסיה) */
  earlyPensionNI: NIRates;
  nonQualifyingMonthlyNI: number;
  rentalExemptMonthly: number;
  /** תקרת פטור זכיות בהגרלות (סעיף 9(28)); undefined = אין נתון מאומת לשנה */
  gamblingExemptionCeiling?: number;
  /** "הכנסה מזכה" חודשית לזיכוי פנסיה לשכיר (סעיף 45א) */
  qualifyingIncomeMonthly?: number;
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

  // ── הכנסות במס נפרד (לא נכנסות למדרגות הרגילות) ──
  /** זכיות בהגרלות/הימורים — מס 35% (סעיף 124ב). תקרת הפטור לפי שנה ב-TaxYearData */
  gamblingIncome?: number;
  /** רווחי הון מני"ע, קריפטו וכו' — מס 25% (30% לבעל מניות מהותי) */
  capitalGains?: number;
  /** דיבידנד + ריבית — מס 25% (30% לבעל מניות מהותי) */
  dividendInterest?: number;
  /** מס ששולם בחו״ל — לזיכוי מס זר (עד גובה המס הישראלי על אותה הכנסה) */
  foreignTaxPaid?: number;
}

export interface CreditPointLine {
  description: string;
  legalBasis: string;
  points: number;
  valueNIS: number;
  /** הסבר "למה" — מוצג באשף ובפירוט החישוב */
  explanation?: string;
}

export interface BracketLine {
  from: number;
  to: number | null;
  rate: number;
  taxableInBracket: number;
  taxInBracket: number;
}

// ─── משימות ותיקי עבודה ─────────────────────────────────────────────────────

/**
 * קטגוריית המשימה — נושא העבודה (לפי הקונבנציה של מונדיי במשרד).
 * עבור ערכים ישנים שעדיין קיימים באחסון — ראה LEGACY_CATEGORY_MAP.
 */
export type TaskCategory =
  | 'annual_report'        // דוח שנתי
  | 'institutions'         // מוסדות
  | 'management'           // ניהול
  | 'economic_work'        // עבודות כלכליות
  | 'personal_report'      // דוח אישי
  | 'cutoff'               // חיתוך
  | 'wealth_declaration'   // הצהרות הון
  | 'ongoing'              // שוטף
  | 'discussions'          // דיונים
  | 'special_approval'     // אישור מיוחד
  | 'not_selected';        // טרם נבחר (ברירת מחדל)

/** אצל מי הכדור — איפה המשימה ממתינה כרגע */
export type BallWith =
  | 'me'         // אצלי — תורי לטפל
  | 'client'     // אצל הלקוח — מחכה ממנו
  | 'authority'  // אצל הרשות — מחכה מהם
  | 'stuck';     // תקועה — צריך חשיבה/התלבטות

/**
 * סטטוס המשימה — איפה היא בצינור.
 * 'open' עדיין בשימוש במקומות רבים כשאלה בינארית (פתוח/סגור);
 * מבחינת UI "פתוח" מתחלק ל-new/in_progress לפי השדה `progress`.
 */
export type TaskStatus = 'open' | 'done';

/** תת-סטטוס עבור משימות פתוחות — האם טרם התחילה או בעיצומה */
export type TaskProgress = 'new' | 'in_progress';

export type TaskPriority = 'normal' | 'urgent';

export interface Task {
  id: string;
  clientId: string;              // חובה — כל משימה שייכת ללקוח
  contactId?: string;            // אופציונלי — איש הקשר הרלוונטי
  caseId?: string;               // אופציונלי — אם המשימה מקובצת לתיק
  category: TaskCategory;
  title: string;
  description?: string;
  ballWith: BallWith;
  status: TaskStatus;
  progress?: TaskProgress;       // ברירת מחדל 'new' אם 'open', לא רלוונטי אם 'done'
  priority: TaskPriority;
  dueDate?: string;              // YYYY-MM-DD
  sortOrder?: number;            // סדר ידני בתוך קבוצת סטטוס (קטן קודם); חסר = ברירת מחדל
  assigneeId?: string;           // מוכן לעתיד — הוספת עובדים (כרגע לא בשימוש)
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  signatureRequest?: SignatureRequest; // אופציונלי — בקשת חתימה על PDF מצורף
}

// ─── בקשת חתימה על PDF ────────────────────────────────────────────────
// שלב 1: הגדרת חותמים + סימון מיקומי חתימה/טקסט. שלב 2 (עתידי): שליחה ואוטומציה.

export type SignerSource = 'client_self' | 'client_contact' | 'manual';

export interface Signer {
  id: string;
  source: SignerSource;            // מאיפה הגיע — לקוח עצמו, איש קשר של הלקוח, או נוסף ידני
  sourceContactId?: string;        // אם source === 'client_contact' — מזהה איש הקשר
  name: string;
  email: string;
  phone?: string;
  order: number;                   // 1, 2, 3... — סדר חתימה אם requireOrder=true
  saveToClientContacts?: boolean;  // עבור 'manual' — לשמור גם ברשימת אנשי הקשר של הלקוח
}

export type SignatureFieldKind =
  | 'signature'  // חתימה — ממולאת ע"י חותם בחדר החתימה
  | 'stamp'      // חותמת — ממולאת ע"י חותם (בפועל: הרו"ח)
  | 'text'       // טקסט שהחותם מקליד (תאריך, שם...)
  | 'label'      // טקסט קבוע שהרו"ח כותב על הטופס בעת ההפקה
  | 'check'      // סימן קבוע שהרו"ח מוסיף בעת ההפקה
  | 'cross';     // סימן קבוע שהרו"ח מוסיף בעת ההפקה

/** סוגים "סטטיים" — תוכן קבוע שהרו"ח מניח בעת ההפקה; לא דורשים חותם */
export const STATIC_FIELD_KINDS: SignatureFieldKind[] = ['label', 'check', 'cross'];

export const SIGNATURE_FIELD_KIND_LABELS: Record<SignatureFieldKind, string> = {
  signature: 'חתימה',
  stamp: 'חותמת',
  text: 'טקסט למילוי החותם',
  label: 'טקסט שלי',
  check: 'סימן ✓',
  cross: 'סימן ✗',
};

export interface SignatureField {
  id: string;
  signerId: string;                // למי שייך — Signer.id
  kind: SignatureFieldKind;
  pageIndex: number;               // 0-based
  // אחוזים מהממדים של העמוד (0..1) — לא תלויים ב-zoom של תצוגה.
  xPct: number;
  yPct: number;
  widthPct: number;
  heightPct: number;
  placeholder?: string;            // לטקסט — טקסט עזר ("תאריך", "שם מלא"...)
  staticText?: string;             // ל-kind 'label' — הטקסט הקבוע שנכתב על הטופס
}

/**
 * ערך שמולא בשדה חתימה במהלך "חדר החתימה".
 * חתימה/חותמת → imageDataUrl (PNG/JPG). טקסט → text.
 */
export interface SignatureValue {
  fieldId: string;
  imageDataUrl?: string;
  text?: string;
  signedAt: string;
}

export type SignatureRequestStatus =
  | 'draft'           // עדיין בעריכה — לא נשלח
  | 'sent'            // נשלח לחותמים (Phase 2)
  | 'partial'         // חלק חתמו (Phase 2)
  | 'completed'       // כולם חתמו (Phase 2)
  | 'cancelled';

export interface SignatureRequest {
  id: string;
  pdfFileName: string;             // שם הקובץ שהועלה (לתצוגה)
  pdfDocId?: string;               // מזהה מסמך ב-IndexedDB (אם נשמר שם)
  signers: Signer[];
  fields: SignatureField[];
  requireOrder: boolean;           // האם סדר החתימה חשוב
  status: SignatureRequestStatus;
  createdAt: string;
  updatedAt: string;
}

export interface Case {
  id: string;
  clientId: string;
  title: string;
  createdAt: string;
  closedAt?: string;
}

export const TASK_CATEGORY_LABELS: Record<TaskCategory, string> = {
  annual_report: 'דוח שנתי',
  institutions: 'מוסדות',
  management: 'ניהול',
  economic_work: 'עבודות כלכליות',
  personal_report: 'דוח אישי',
  cutoff: 'חיתוך',
  wealth_declaration: 'הצהרות הון',
  ongoing: 'שוטף',
  discussions: 'דיונים',
  special_approval: 'אישור מיוחד',
  not_selected: 'טרם נבחר',
};

/** צבע הבאדג' לכל קטגוריה — בהשראת הצבעים של מונדיי */
export const TASK_CATEGORY_BADGE: Record<TaskCategory, string> = {
  annual_report: 'cat-green',
  institutions: 'cat-red',
  management: 'cat-yellow',
  economic_work: 'cat-orange',
  personal_report: 'cat-amber',
  cutoff: 'cat-blue',
  wealth_declaration: 'cat-brown',
  ongoing: 'cat-purple',
  discussions: 'cat-pink',
  special_approval: 'cat-black',
  not_selected: 'cat-gray',
};

/**
 * מיפוי מהערכים הישנים של הקטגוריות (לפני שינוי ל-monday-style)
 * לערכים החדשים. בשימוש בפונקציית migrateTasks.
 */
export const LEGACY_CATEGORY_MAP: Record<string, TaskCategory> = {
  income_tax: 'personal_report',        // מ"ה → דוח אישי
  ni: 'ongoing',                         // ב"ל → שוטף
  withholdings: 'ongoing',               // ניכויים → שוטף
  vat_report: 'ongoing',                 // דיווח מע"מ → שוטף
  withholdings_report: 'ongoing',        // דיווח ניכויים → שוטף
  audit: 'management',                   // ביקורת → ניהול
  client_onboarding: 'management',       // קליטת לקוח → ניהול
  authority_contact: 'institutions',     // פנייה לרשויות → מוסדות
  other: 'not_selected',                 // אחר → טרם נבחר
  // הבאות כבר קיימות גם בשמות חדשים: 'cutoff', 'economic_work'
};

/** תוויות לסטטוס (פתוחה מתפצלת ל-new/in_progress) */
export const TASK_STATUS_GROUP_LABELS = {
  new: 'חדשות',
  in_progress: 'בתהליך',
  done: 'הושלמו',
} as const;

export const TASK_PROGRESS_LABELS: Record<TaskProgress, string> = {
  new: 'חדשה',
  in_progress: 'בתהליך',
};

/**
 * לשון אחידה לכל המוצר — אפיון D7. שם המצב נכתב פעם אחת כאן;
 * שום מסך לא כותב וריאציה משלו ("אני", "תקוע", "אצל הרשות").
 */
export const BALL_WITH_LABELS: Record<BallWith, string> = {
  me: 'אצלי',
  client: 'הלקוח',
  authority: 'רשויות',
  stuck: 'תקועה',
};

/**
 * צבע לכל מצב כדור — אפיון D4. "תקועה" הוא המצב היחיד עם גוון ייחודי,
 * כי הוא היחיד שדורש החלטה ולא המתנה. אצלי נשאר ניטרלי: זה מצב ברירת המחדל,
 * וצביעה שלו הייתה הופכת את כל הרשימה לצבעונית ומאבדת את המשמעות.
 */
export const BALL_WITH_COLOR: Record<BallWith, string> = {
  me: 'var(--ink-3)',
  client: 'var(--warn)',
  authority: 'var(--warn)',
  stuck: 'var(--stuck)',
};

export const BALL_WITH_BADGE: Record<BallWith, string> = {
  me: 'badge-gray',
  client: 'badge-orange',
  authority: 'badge-orange',
  stuck: 'badge-purple',
};

// ─── מחשבון מס (ממשיך) ──────────────────────────────────────────────────────

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
  /** זיכוי תושב יישוב מוטב (סעיף 11): אחוז מההכנסה מיגיעה אישית עד תקרה */
  settlementCredit: number;
  settlementCreditExplanation: string;
  /** זיכוי 35% על הפקדות עובד לפנסיה (סעיף 45א) */
  pensionCredit: number;
  incomeTax: number;
  /** מס יסף בסיסי — 3% על הכנסה חייבת מעל הסף */
  surtax: number;
  /** מס יסף נוסף — 2% על הכנסות הוניות מעל הסף (מ-2025) */
  surtaxCapitalExtra: number;
  surtaxBreakdown: string[];
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

  // ── מסים נפרדים ──
  gamblingTax?: number;          // 35% על זכיות מעל הסף
  capitalGainsTax?: number;       // 25%/30% על רווחי הון
  dividendInterestTax?: number;   // 25%/30% על דיבידנד וריבית
  foreignTaxCredit?: number;      // זיכוי מס זר שנוצל בפועל
  separateTaxesTotal?: number;    // סך כל המסים הנפרדים
  separateTaxesBreakdown?: string[];

  // סיכום
  totalTaxBurden: number;
  netAnnualIncome: number;
  effectiveTotalRate: number;

  // הסברים
  deductionBreakdown: string[];
  rentalExplanation: string;
}
