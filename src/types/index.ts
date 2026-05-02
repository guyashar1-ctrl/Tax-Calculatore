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

export interface Child {
  id: string;
  firstName?: string;   // שם פרטי (אופציונלי לתאימות לרשומות ישנות)
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
  investmentBrokerName?: string;      // ברוקר / בנק / בית השקעות
  investmentNotes?: string;

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

  hasWealthDeclaration?: boolean;
  lastWealthDeclarationYear?: number;

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

  // ── הכנסות במס נפרד (לא נכנסות למדרגות הרגילות) ──
  /** זכיות בהגרלות/הימורים — מס 35% (סעיף 124ב). פטור עד הסף ל-2026: 32,310 ש"ח לזכייה */
  gamblingIncome?: number;
  /** רווחי הון מני"ע, קריפטו וכו' — מס 25% (30% לבעל מניות מהותי) */
  capitalGains?: number;
  /** דיבידנד + ריבית — מס 25% (30% לבעל מניות מהותי) */
  dividendInterest?: number;
  /** מס ששולם בחו״ל — לזיכוי מס זר (עד גובה המס הישראלי על אותה הכנסה) */
  foreignTaxPaid?: number;
}

/** סף הפטור השנתי על זכיות בהגרלות (₪). מתעדכן מדי שנה. */
export const GAMBLING_EXEMPTION_THRESHOLD = 32310;

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

export type SignatureFieldKind = 'signature' | 'text';

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
