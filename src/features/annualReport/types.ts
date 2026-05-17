// ─── מודול דוח שנתי 1301 — טיפוסים ─────────────────────────────────────────
// המודל הקאנוני של הנישום + סכמת השאלון + מבנה דקלרטיבי של שדות טופס 1301.
//
// אסטרטגיה: form1301Fields.ts הוא מקור האמת — כל שדה מצהיר על modelPath
// ו-sourceQuestionIds, ומכאן נגזרים: dynamic coverage, document checklist,
// וצביעת השאלון. אין duplication ידני בשתי כיוונים.

export type IncomeSourceKind =
  | 'salary'
  | 'business'
  | 'rental'
  | 'capital'
  | 'interest'
  | 'dividend'
  | 'pension'
  | 'foreign'
  | 'other';

export type MaritalStatus = 'single' | 'married' | 'divorced' | 'widowed' | 'separated';

export type DisabilityBand = 'none' | 'low' | 'high' | 'full'; // 0/<40/40-89/90-100

export type RegisteredSpouseRole =
  | 'me_only'         // אני בן הזוג הרשום ומגיש לבד (בן/בת זוג לא מגיש/ה)
  | 'spouse_only'     // בן/בת הזוג הוא הרשום ומגיש/ה
  | 'file_jointly'    // אני הרשום, מגישים יחד (חישוב מאוחד)
  | 'separate_files'; // כל אחד מגיש בנפרד

export type BizRevenueBand = 'none' | 'under_300k' | '300k_plus';

export type WithholdingSource =
  | 'salary_106'        // משכר — שדה 042
  | 'business_clients'  // ניכוי במקור מלקוחות לעצמאי
  | 'interest_bank'     // מריבית מבנקים — שדה 043
  | 'securities'        // מרווחי הון — שדה 253
  | 'dividend'          // מדיבידנד — שדה 036/חלק ז'
  | 'foreign';          // מהכנסה חו"ל

export type OtherIncomeKind = 'gambling' | 'royalties' | 'prize' | 'other';

// ─── המודל הפנימי ────────────────────────────────────────────────────────────

export interface TaxpayerModel {
  taxYear: number;

  identity: {
    maritalStatus?: MaritalStatus;
    hasSpouse?: boolean;
    spouseHasIncome?: boolean;
    childrenCount?: number;
    childrenWithSpecialNeeds?: boolean;
    /** הורה יחיד שילדיו מתגוררים אצלו — שדה 029 ב-1301. */
    isCustodialSingleParent?: boolean;
    residencyType?: 'resident' | 'new_immigrant' | 'returning_resident';
    immigrationYear?: number;
    city?: string;
    livesInQualifyingSettlement?: boolean;
    hasDisability?: boolean;
    disabilityBand?: DisabilityBand;
  };

  spouse: {
    registeredRole?: RegisteredSpouseRole;
    eligibleSeparateCalc?: boolean;
    has106?: boolean;             // יש לבן/בת זוג טופס 106 שלו/ה
    hasBusinessIncome?: boolean;
  };

  income: {
    sources: IncomeSourceKind[];

    // שכר
    salaryEmployerCount?: number;
    hasMultipleEmployers?: boolean;
    receivedSeverance?: boolean;

    // עסק
    businessKind?: 'osek_patur' | 'osek_morshe' | 'family_company';
    bizRevenueBand?: BizRevenueBand;
    bizHasClientWithholding?: boolean;
    bizHasKerenHashtalmutSelf?: boolean;

    // שכ"ד
    rentalTrack?: 'exempt' | 'flat10' | 'regular';
    rentalGrossAnnual?: number;

    // הון
    capitalSubTypes?: Array<'securities' | 'crypto' | 'real_estate'>;
    capitalHasWithholding?: boolean;

    // דיבידנד
    isControllingShareholder?: boolean;

    // ריבית
    hasInterestIncome?: boolean;
    interestHasWithholding?: boolean;

    // פנסיה
    hasPensionIncome?: boolean;

    // חו"ל
    foreignCountries?: string;
    foreignIncomeKinds?: Array<'salary' | 'business' | 'capital' | 'rental' | 'pension'>;
    foreignPaidTaxAbroad?: boolean;

    // אחר
    hasOtherIncome?: boolean;
    otherIncomeKinds?: OtherIncomeKind[];

    // ── תקבולי ביטוח לאומי (חייבים במס לרוב) ──
    /** דמי לידה — שדה 194 ב-1301. */
    niMaternityReceived?: boolean;
    /** דמי אבטלה — שדה 196 ב-1301. */
    niUnemploymentReceived?: boolean;
    /** דמי מילואים — שדה 250 ב-1301. */
    niReserveDutyReceived?: boolean;
    /** תקבולי פגיעה בעבודה — שדה 270 ב-1301. */
    niWorkInjuryReceived?: boolean;

    // ── אופציות 102/3i ──
    /** התקבלו / מומשו אופציות 102 / 3i — שדה 282 ב-1301. */
    hasOptions102?: boolean;
  };

  taxPaid: {
    paidAdvancePayments?: boolean;
    withholdingSources?: WithholdingSource[];
  };

  deductionsCredits: {
    donationAmount?: number;
    hasLifeInsurance?: boolean;
    lifeInsuranceAnnual?: number;
    selfPensionDeposits?: number;
    selfStudyFundDeposits?: number;
    hasKerenHashtalmutSelf?: boolean;
    isDischargedSoldier?: boolean;
    hasAcademicDegree?: boolean;
    /** מזונות שהתקבלו (₪/שנה) — שדה 9(21). */
    alimonyReceivedAnnual?: number;
    /** מזונות ששולמו (₪/שנה) — שדה 25, זיכוי. */
    alimonyPaidAnnual?: number;
  };

  specialSituations: {
    isNewImmigrant?: boolean;
    electsSection14?: boolean;
    hasCarriedLosses?: boolean;
    wealthDeclarationRequired?: boolean;
    /** חבר בחברה משפחתית — סעיף 64א. */
    isFamilyCompanyMember?: boolean;
    /** חברה זרה נשלטת (CFC) — סעיף 75ב. */
    isForeignControllingShareholder?: boolean;
    /** חבר קיבוץ / מושב שיתופי — חישוב מס מיוחד. */
    isKibbutzMember?: boolean;
  };
}

export function emptyModel(taxYear: number): TaxpayerModel {
  return {
    taxYear,
    identity: {},
    spouse: {},
    income: { sources: [] },
    taxPaid: {},
    deductionsCredits: {},
    specialSituations: {},
  };
}

// ─── מיגרציית מודל ─────────────────────────────────────────────────────────
// משלימה נתיבים חסרים במודל ישן (שנשמר ב-DB לפני הוספת spouse/taxPaid).
// קוראים לזה ב-rowToSession ובכל מקום שמודל עלול להגיע ממקור חיצוני.
export function migrateModel(raw: Partial<TaxpayerModel> | null | undefined, taxYear: number): TaxpayerModel {
  const r = raw ?? {};
  return {
    taxYear: r.taxYear ?? taxYear,
    identity: { ...(r.identity ?? {}) },
    spouse: { ...(r.spouse ?? {}) },
    income: { sources: [], ...(r.income ?? {}) },
    taxPaid: { ...(r.taxPaid ?? {}) },
    deductionsCredits: { ...(r.deductionsCredits ?? {}) },
    specialSituations: { ...(r.specialSituations ?? {}) },
  };
}

// ─── שאלון — Decision Tree ───────────────────────────────────────────────────

export type AnswerValue = string | number | boolean | string[];

export type QuestionType =
  | 'single_select'
  | 'multi_select'
  | 'number'
  | 'boolean'
  | 'text';

export interface SelectOption {
  value: string;
  label: string;
}

// הקשר לתצוגת preview של נתונים קיימים מעל שאלה.
// מועבר ל-dataPreview של כל שאלה שמסמנת שהיא רוצה להציג נתון מהכרטיס.
export interface QuestionPreviewClient {
  idNumber?: string;
  firstName?: string;
  lastName?: string;
  birthDate?: string;
  city?: string;
  address?: string;
  phone?: string;
  email?: string;

  // ─── זכאויות ומס ─────────────────────────────────────────────────────
  familyStatus?: 'single' | 'married' | 'divorced' | 'widowed' | 'singleParent';
  isNewImmigrant?: boolean;
  aliyahYear?: number;
  isReturningResident?: boolean;
  disabilityPercentage?: number;
  qualifyingSettlementId?: string;
  completedIdf?: boolean;
  idfReleaseYear?: number;
  hasAcademicDegree?: boolean;
  academicDegreeYear?: number;

  // ─── סכומים שנתיים לזיכויים ──────────────────────────────────────────
  donationsAnnual?: number;
  lifeInsuranceAnnual?: number;

  // ─── ילדים — רשימה מפורטת ───────────────────────────────────────────
  children?: Array<{ id: string; firstName?: string; birthDate: string; birthYear: number; hasDisability: boolean }>;

  // ─── עסקים, נכסים, השקעות ────────────────────────────────────────────
  rentalTaxTrack?: 'exempt' | 'flat10' | 'regular';
  businesses?: Array<{ id: string; name: string; kind: string; revenueAnnual?: number; belongsToSpouse?: boolean }>;

  // ─── דיווחי חובה ומצבים מיוחדים ──────────────────────────────────────
  isFamilyCompanyMember?: boolean;
  isForeignControllingShareholder?: boolean;
  isKibbutzMember?: boolean;
  section14Elected?: boolean;

  // ─── רשימות נוספות מהכרטיס (לדוגמה: מיטב דש, IBI, ...) ─────────────
  investmentAccounts?: Array<{ id: string; institutionName: string; kind?: string; isClosed?: boolean }>;
  bankAccounts?: Array<{ id: string; bankName: string; isPrimary?: boolean; kind?: string }>;
  employers?: Array<{ id: string; name: string; taxId?: string; endDate?: string }>;
  pensionFunds?: Array<{ id: string; institutionName: string; kind?: string; hasSelfDeposits?: boolean }>;
}

export interface QuestionPreviewContext {
  // המבנה כאן הוא subset של Client הראשי — אנחנו לוקחים רק את השדות שאנחנו
  // צריכים, כדי לא ליצור תלות הדוקה במודול הזה.
  client?: QuestionPreviewClient;
  model?: TaxpayerModel;
}

export interface QuestionPreviewItem {
  label: string;
  value: string;
  missing?: boolean;          // אם true — מסומן באדום ("(חסר)")
}

/**
 * סקציה בכרטיס הלקוח שמתאימה לאימות במצב validation. משמשת לכפתור
 * "ערוך" — פותח inline editor של אותה סקציה.
 */
export type CardEditSection =
  | 'identity'        // פרטי זיהוי (שם, ת.ז, כתובת)
  | 'spouse'          // בן/בת זוג
  | 'children'        // ילדים
  | 'employers'       // מעבידים
  | 'investmentAccounts' // חשבונות השקעה
  | 'bankAccounts'    // חשבונות בנק
  | 'pensionFunds'    // קופות פנסיה
  | 'businesses'      // עסקים
  | 'dependentRelatives' // קרובים תלויים
  | 'properties';     // נכסים

export interface QuestionNode {
  id: string;
  question: string;
  helpText?: string;
  type: QuestionType;
  options?: SelectOption[];
  required: boolean;
  applyToModel: (model: TaxpayerModel, answer: AnswerValue) => TaxpayerModel;
  next: (answer: AnswerValue, model: TaxpayerModel) => string | null;
  visibleWhen?: (model: TaxpayerModel) => boolean;

  // ─── קישור לטופס 1301 (אופציונלי — נשתמש לחישוב coverage) ──────────────
  // מספרי השדות בטופס 1301 שהשאלה הזו מזינה כשהיא נענית בחיוב.
  targetFieldCodes?: string[];

  // ─── תצוגת נתונים קיימים מעל השאלה ─────────────────────────────────────
  // אם השאלה רק "אישור" שנתון מסוים מעודכן בכרטיס הלקוח — מחזירה רשימת
  // שדות (תווית + ערך) שתוצג כקופסה לפני אפשרויות התשובה.
  dataPreview?: (ctx: QuestionPreviewContext) => QuestionPreviewItem[] | null;

  // ─── מצב Validation-First (Wave ד') ────────────────────────────────────
  // אם true והנתונים בכרטיס מלאים — השאלה תוצג כ"אישור/עדכון/לא רלוונטי"
  // במקום שאלת חקירה רגילה.
  validationMode?: boolean;

  // איזה סקציה בכרטיס נפתחת לעריכה כשלוחצים "ערוך" במצב validation.
  editTarget?: CardEditSection;

  // ─── הסקה אוטומטית של תשובה מהכרטיס (Wave ד') ──────────────────────────
  // כאשר המשתמש לוחץ "מאשר ונכון" במצב validation, הפונקציה הזו ממירה את
  // הנתונים בכרטיס לתשובה תקפה לשאלה (למשל: רשימת 2 מעבידים → number 2).
  deriveAnswerFromCard?: (ctx: QuestionPreviewContext) => AnswerValue | null;
}

export interface QuestionTree {
  rootNodeId: string;
  nodes: Record<string, QuestionNode>;
}

// ─── סכמת שדות 1301 — דקלרטיבית ──────────────────────────────────────────

export type SectionKey =
  | '1_identity'
  | '2_family'
  | '3_income_salary'
  | '4_income_business'
  | '5_income_passive'
  | '6_capital'
  | '7_foreign'
  | '8_deductions'
  | '9_credits'
  | '10_tax_paid'
  | '11_special'
  | '12_signature';

export interface DocRequirement {
  code: string;
  name: string;
  reason: string;
}

export interface Form1301FieldDef {
  fieldNumber: string;
  hebrewLabel: string;
  section: SectionKey;
  required: 'always' | 'conditional' | 'optional';
  conditionalOn?: (m: TaxpayerModel) => boolean;

  // הקישור הקריטי: איפה הנתון נשמר במודל
  modelPath: string;
  // אילו שאלות מזינות את השדה (לזיהוי כיסוי דינמי + צביעת התרשים)
  sourceQuestionIds: string[];
  // המסמכים שצריך להכין כדי למלא את השדה בעתיד
  requiredDocuments: DocRequirement[];

  legalReference?: string;
}

// ─── דיווח כיסוי ─────────────────────────────────────────────────────────

export type FieldCoverageStatus =
  | 'covered'           // השדה נדרש וכל שאלות המקור נענו
  | 'partial'           // השדה נדרש וחלק נענו
  | 'missing'           // השדה נדרש ואף שאלת מקור לא נענתה
  | 'not_applicable';   // השדה לא נדרש עבור הפרופיל הזה

export interface FieldCoverage {
  field: Form1301FieldDef;
  status: FieldCoverageStatus;
  answeredSources: string[];
  missingSources: string[];
}

export interface CoverageReport {
  totalFields: number;
  applicable: number;        // = covered + partial + missing
  covered: number;
  partial: number;
  missing: number;
  notApplicable: number;
  percent: number;           // covered / applicable * 100
  bySection: Record<SectionKey, { covered: number; partial: number; missing: number; total: number }>;
  fields: FieldCoverage[];
}

// ─── trace למיפוי ────────────────────────────────────────────────────────

export type SourceTraceKind = 'questionnaire' | 'computed' | 'default' | 'empty' | 'document_pending';

export interface SourceTrace {
  kind: SourceTraceKind;
  detail: string;
  questionIds?: string[];
  formula?: string;
}

export interface MappedField {
  fieldNumber: string;
  hebrewLabel: string;
  section: SectionKey;
  legalReference?: string;
  value: string | null;
  trace: SourceTrace;
}

// ─── Session (כפי שמופיע ב-Supabase) ─────────────────────────────────────

export interface AnnualReportSession {
  id: string;
  userId: string;
  clientId: string;
  taxYear: number;
  status: 'in_progress' | 'review' | 'mapping_done' | 'archived';
  model: TaxpayerModel;
  currentQuestionId: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}
