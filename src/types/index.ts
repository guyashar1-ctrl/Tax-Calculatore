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
  birthDate: string;    // YYYY-MM-DD (תאריך לידה מלא)
  birthYear: number;    // מחושב מ-birthDate, נשמר לתאימות
  hasDisability: boolean;
  disabilityPercentage?: number;
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
  completedIDF: boolean;
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
  completedIDF: false, idfReleaseYear: 0,
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

  // ── סטטוס ייצוג (lifecycle של תהליך הייצוג) ──
  representationStatus?: RepresentationStatus; // ברירת מחדל: 'active' (לקוח שנוצר ידנית)
  representationRequestId?: string;            // קישור ל-RepresentationRequest אם הלקוח נוצר מבקשה

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
  | 'awaiting_accountant'  // הלקוח מילא וחתם, דורש התייחסות והחתמה של המייצג
  | 'awaiting_authorities' // המייצג חתם, ה-PDF נוצר, ממתין לאישור הרשויות
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
}

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

export const REPRESENTATION_STATUS_LABELS: Record<RepresentationStatus, string> = {
  pending_fill: 'ממתין למילוי הלקוח',
  awaiting_accountant: 'דורש התייחסות שלי',
  awaiting_authorities: 'ממתין לאישור הרשויות',
  active: 'מיוצג פעיל',
};

export const REPRESENTATION_STATUS_BADGE: Record<RepresentationStatus, string> = {
  pending_fill: 'badge-orange',
  awaiting_accountant: 'badge-red',
  awaiting_authorities: 'badge-purple',
  active: 'badge-green',
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

// ─── משימות ותיקי עבודה ─────────────────────────────────────────────────────

/** קטגוריית המשימה — נושא העבודה */
export type TaskCategory =
  | 'income_tax'             // מס הכנסה
  | 'ni'                     // ביטוח לאומי
  | 'withholdings'           // ניכויים
  | 'vat_report'             // דיווח מע"מ
  | 'withholdings_report'    // דיווח ניכויים
  | 'audit'                  // ביקורת
  | 'cutoff'                 // חיתוך
  | 'economic_work'          // עבודה כלכלית
  | 'client_onboarding'      // קליטת לקוח
  | 'authority_contact'      // פנייה לרשויות
  | 'other';                 // אחר

/** אצל מי הכדור — איפה המשימה ממתינה כרגע */
export type BallWith =
  | 'me'         // אצלי — תורי לטפל
  | 'client'     // אצל הלקוח — מחכה ממנו
  | 'authority'  // אצל הרשות — מחכה מהם
  | 'stuck';     // תקועה — צריך חשיבה/התלבטות

export type TaskStatus = 'open' | 'done';
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
  priority: TaskPriority;
  dueDate?: string;              // YYYY-MM-DD
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

export interface Case {
  id: string;
  clientId: string;
  title: string;
  createdAt: string;
  closedAt?: string;
}

export const TASK_CATEGORY_LABELS: Record<TaskCategory, string> = {
  income_tax: 'מס הכנסה',
  ni: 'ביטוח לאומי',
  withholdings: 'ניכויים',
  vat_report: 'דיווח מע"מ',
  withholdings_report: 'דיווח ניכויים',
  audit: 'ביקורת',
  cutoff: 'חיתוך',
  economic_work: 'עבודה כלכלית',
  client_onboarding: 'קליטת לקוח',
  authority_contact: 'פנייה לרשויות',
  other: 'אחר',
};

export const TASK_CATEGORY_SHORT: Record<TaskCategory, string> = {
  income_tax: 'מ"ה',
  ni: 'ב"ל',
  withholdings: 'ניכ׳',
  vat_report: 'מע"מ',
  withholdings_report: 'דיו״נ',
  audit: 'ביק׳',
  cutoff: 'חיתוך',
  economic_work: 'כלכ׳',
  client_onboarding: 'קליטה',
  authority_contact: 'רשויות',
  other: 'אחר',
};

export const TASK_CATEGORY_BADGE: Record<TaskCategory, string> = {
  income_tax: 'badge-blue',
  ni: 'badge-purple',
  withholdings: 'badge-orange',
  vat_report: 'badge-green',
  withholdings_report: 'badge-gray',
  audit: 'badge-red',
  cutoff: 'badge-purple',
  economic_work: 'badge-blue',
  client_onboarding: 'badge-green',
  authority_contact: 'badge-orange',
  other: 'badge-gray',
};

export const BALL_WITH_LABELS: Record<BallWith, string> = {
  me: 'אצלי',
  client: 'אצל הלקוח',
  authority: 'אצל הרשות',
  stuck: 'תקועה',
};

export const BALL_WITH_ICON: Record<BallWith, string> = {
  me: '👤',
  client: '🧑',
  authority: '🏛',
  stuck: '🟡',
};

export const BALL_WITH_BADGE: Record<BallWith, string> = {
  me: 'badge-blue',
  client: 'badge-orange',
  authority: 'badge-purple',
  stuck: 'badge-red',
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
