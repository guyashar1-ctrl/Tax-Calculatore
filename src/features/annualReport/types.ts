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

/** של מי ההכנסה — קובע לאיזה קוד בטופס היא מתנקזת (למשל 158 לרשום / 172 לבן הזוג). */
export type IncomeOwnership = 'registered' | 'spouse' | 'both';

/**
 * שכבת האיסוף של שדה — מודל שלוש השכבות:
 * - question:   הלקוח עונה על הערך ישירות בשאלון (מעט שדות, בעיקר סכומים קטנים).
 * - document:   השאלון רק מזהה שהמצב קיים; הערך מגיע ממסמך (106/867/1399...).
 * - accountant: מצב מורכב — נפתח דגל טיפול לרו"ח + טופס נלווה; הלקוח לא נשאל מעבר לטריגר.
 * - auto:       מחושב אוטומטית מהנתונים (מס יסף, נ"ז תושבות) — אין שאלה ואין מסמך.
 */
export type DataLayer = 'question' | 'document' | 'accountant' | 'auto';

/** קודי שדה רשמיים לפי בעלות — בן זוג רשום / בן זוג / משותף (טור שלישי בטופס). */
export interface OwnershipCodes {
  registered?: string;
  spouse?: string;
  joint?: string;
}

// ─── המודל הפנימי ────────────────────────────────────────────────────────────

/** סוג הזרימה שהסשן מריץ — קובע אילו שאלות נשאלות. */
export type FlowKind = 'full' | 'onboarding' | 'annual';

export interface TaxpayerModel {
  taxYear: number;

  /** מטא-נתוני זרימה (לא נתוני מס). flow חסר = 'full' (התנהגות היסטורית). */
  meta?: {
    flow?: FlowKind;
    /** סטטוס מסמכים לתיק השנה: קוד מסמך → מצב. */
    docStatuses?: Record<string, 'pending' | 'requested' | 'received' | 'not_relevant'>;
    /** שאלות שהלקוח ענה "לא בטוח" — ממתינות לבירור רו"ח בשער הכיסוי. */
    unknownQuestions?: string[];
  };

  identity: {
    maritalStatus?: MaritalStatus;
    hasSpouse?: boolean;
    spouseHasIncome?: boolean;
    childrenCount?: number;
    childrenWithSpecialNeeds?: boolean;
    /**
     * הורה במשפחה חד-הורית שילדיו בחזקתו — שדה 026 (זיכוי חד-הורי).
     * הערה היסטורית: עד יולי 2026 מופה בטעות לקוד 029; 029/129 הם בעצם
     * "זיכוי כלכלת ילדים" להורה פרוד שמשתתף בכלכלה — ראה childEconomicsCredit.
     */
    isCustodialSingleParent?: boolean;
    /** הורה פרוד/גרוש שאינו משמורן אך משתתף בכלכלת הילדים — שדות 029/129. */
    paysChildEconomics?: boolean;
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
    /** של מי הכנסת השכר — מנתב 158 (רשום) / 172 (בן זוג). */
    salaryOwner?: IncomeOwnership;
    /** עבודה במשמרות בתעשייה — שדות 068/069 (זיכוי 15%). */
    hasShiftWork?: boolean;
    /** פריסת פיצויים — מספר שנות פריסה שנותרו, שדה 009 (+אישור פ"ש). */
    severanceSpreadYears?: number;

    // עסק
    businessKind?: 'osek_patur' | 'osek_morshe' | 'family_company';
    bizRevenueBand?: BizRevenueBand;
    bizHasClientWithholding?: boolean;
    bizHasKerenHashtalmutSelf?: boolean;
    /** של מי העסק — מנתב 150 (רשום) / 170 (בן זוג). */
    businessOwner?: IncomeOwnership;
    /** שותף בשותפות — מחייב טופס 1504 + ייחוס חלק יחסי במחזור. */
    isPartnershipMember?: boolean;
    /** השכרת נכס ששימש בעסק 10+ שנים — יגיעה אישית, שדות 120/220. */
    hasBusinessAssetRental10y?: boolean;

    // שכ"ד — הלקוח מדווח עובדות; המסלול (rentalTrack) הוא החלטת רו"ח
    // שמתקבלת בשער הכיסוי, בעזרת מחשבון האופטימיזציה הקיים.
    rentalTrack?: 'exempt' | 'flat10' | 'regular';
    rentalGrossAnnual?: number;
    /** הלקוח עצמו גר בשכירות — פותח ניכוי לפי סעיף 122(ו) ומשפיע על בחירת המסלול. */
    livesInRentedHome?: boolean;
    /** שכ"ד שנתי שהלקוח משלם על דירת מגוריו. */
    rentPaidAnnual?: number;
    /** של מי הנכס — מנתב 059/201/301 ומשפיע על חישוב נפרד. */
    rentalOwner?: IncomeOwnership;
    /** שכירות שאינה למגורים (עסקית / דמי מפתח) — שדות 059/201/301. */
    hasNonResidentialRental?: boolean;

    // הון
    capitalSubTypes?: Array<'securities' | 'crypto' | 'real_estate'>;
    capitalHasWithholding?: boolean;

    // דיבידנד
    isControllingShareholder?: boolean;
    /** דיבידנד ממפעל מועדף/מאושר (20%) — שדות 173/275/375 (לעומת רגיל 141). */
    hasPreferredEnterpriseDividend?: boolean;

    // ריבית
    hasInterestIncome?: boolean;
    interestHasWithholding?: boolean;
    /** של מי חשבונות הריבית/ני"ע — מנתב בין טורי הקודים. */
    interestOwner?: IncomeOwnership;

    // פנסיה, קצבאות ופרישה
    hasPensionIncome?: boolean;
    /** קצבאות ומענקי פרישה חייבים — שדות 258/272 (+161). */
    pensionOwner?: IncomeOwnership;
    /** קצבאות פטורות (נכות ממשרד הביטחון, שאירים...) — שדות 101/102/209. */
    hasExemptPensions?: boolean;

    // משיכות והכנסות מחברות בבעלות
    /** משיכת בעל מניות מהותי מחברה (סעיף 3(ט1), טופס 1350) — שדות 323/343/350. */
    hasOwnerWithdrawals?: boolean;
    /** הכנסה מועברת מחברת מעטים לפי סעיף 62א — שדה 351. */
    hasCloseCompanyPassthrough?: boolean;
    /** חברת בית לפי סעיף 64 — שדות 159/202/302. */
    isHouseCompanyMember?: boolean;
    /** מכירת פטנט / הכנסה לאחר פטירה (מס מוגבל 40%) — שדות 061/214/314. */
    hasPatentOrPostMortemIncome?: boolean;
    /** נבחר אריח "חברות ושותפויות" בשער — פותח את שאלת המצבים החברתיים. */
    hasCompanyInvolvement?: boolean;

    // חו"ל
    foreignCountries?: string;
    foreignIncomeKinds?: Array<
      'salary' | 'business' | 'capital' | 'rental' | 'pension'
      | 'interest' | 'dividend' | 'gambling' | 'annuity' | 'other'
    >;
    foreignPaidTaxAbroad?: boolean;

    // אחר
    hasOtherIncome?: boolean;
    otherIncomeKinds?: OtherIncomeKind[];

    // ── תקבולי ביטוח לאומי (חייבים במס לרוב) ──
    // הבהרת קודים (מדריך 2025 עמ' 11–12): בטופס ההבחנה היא לפי מעמד ובעלות —
    // 194/196 = תקבולים כשכיר (רשום/בן זוג), 250/270 = תקבולים כעצמאי (רשום/בן זוג).
    // סוגי הקצבה (לידה/אבטלה/מילואים/פגיעה) הם פירוט פנימי של אותם שדות.
    /** דמי לידה. */
    niMaternityReceived?: boolean;
    /** דמי אבטלה. */
    niUnemploymentReceived?: boolean;
    /** תגמולי מילואים. */
    niReserveDutyReceived?: boolean;
    /** תקבולי פגיעה בעבודה. */
    niWorkInjuryReceived?: boolean;
    /** מי קיבל את התקבולים — מנתב 194/196 מול 250/270 יחד עם מעמד שכיר/עצמאי. */
    niBenefitsOwner?: IncomeOwnership;
    /** בקשה לפריסת דמי לידה לשנה הבאה (הצהרה בראש הדוח). */
    requestsMaternitySpread?: boolean;

    // ── הימורים, הגרלות ופרסים — שדה 427 (35%, פטור עד תקרה) ──
    hasGamblingOrPrizes?: boolean;

    // ── אופציות 102/3i ──
    /** התקבלו / מומשו אופציות 102 / 3i — שדה 282 ב-1301. */
    hasOptions102?: boolean;
  };

  taxPaid: {
    paidAdvancePayments?: boolean;
    withholdingSources?: WithholdingSource[];
    /** מס שבח שנקבע בשומת מסמ"ק (קרן בלבד) — שדה 041. */
    hasLandAppreciationAssessment?: boolean;
    /** ריבית והפרשי הצמדה פטורים על החזרי מס — שדה 353. */
    hasTaxRefundInterest?: boolean;
  };

  deductionsCredits: {
    donationAmount?: number;
    hasLifeInsurance?: boolean;
    lifeInsuranceAnnual?: number;
    selfPensionDeposits?: number;
    /** יש הפקדות עצמאיות לקצבה — הסכום נקרא מאישור הקופה. */
    hasSelfPensionDeposits?: boolean;
    /** איפה מתנהלות ההפקדות — שמות בלבד. משם יגיעו האישורים השנתיים. */
    pensionProviders?: string;
    selfStudyFundDeposits?: number;
    hasKerenHashtalmutSelf?: boolean;
    isDischargedSoldier?: boolean;
    /** ימי מילואים כלוחם בשנה הקודמת — סעיף 39ב, מזכה מ-2026 ואילך. */
    reserveCombatDaysPrevYear?: number;
    hasAcademicDegree?: boolean;
    /** מזונות שהתקבלו (₪/שנה) — שדה 9(21). */
    alimonyReceivedAnnual?: number;
    /** מזונות ששולמו (₪/שנה) — שדה 25, זיכוי. */
    alimonyPaidAnnual?: number;

    // ── ניכויים (מדריך 2025 עמ' 27–29) ──
    /** ביטוח אובדן כושר עבודה — שדות 112/113 (עצמאי) או 206/207 (שכיר, טופס 134). */
    hasDisabilityInsurance?: boolean;
    /** דמי ב"ל ששולמו כעצמאי — ניכוי 52%, שדות 030/089. */
    paidNiSelfEmployed?: boolean;
    /** השקעות מיוחדות בנות ניכוי: מחקר מדעי (005/006), נפט (116/117 + 858), סרטים (118/119). */
    specialInvestments?: Array<'research' | 'oil' | 'film'>;

    // ── זיכויים (מדריך 2025 עמ' 30–36) ──
    /** ביטוח קצבת שאירים — זיכוי 35%, שדות 140/240. */
    hasSurvivorAnnuityInsurance?: boolean;
    /** החזקת בן משפחה במוסד — זיכוי 35% עד תקרה, שדות 132/232 (+127). */
    paysInstitutionCare?: boolean;
    /** תרומות למוסדות בארה"ב (אמנה, עד 25% מהכנסת ארה"ב) — שדות 046/048. */
    hasUsCharityDonations?: boolean;
    /** עודפי תרומות מ-3 שנים קודמות מעל התקרה — שדות 364/292. */
    hasDonationCarryover?: boolean;
    /** תושב אילת (זיכוי 10% עד תקרה) — שדות 139/183. */
    isEilatResident?: boolean;
    /** תואר: קוד סוג 1–5 (ראשון/שני/שלישי/הוראה) — שדות 181/182. */
    degreeTypeCode?: number;
    /** חודשי שירות סדיר (לחישוב מדויק של זיכוי חייל משוחרר) — שדות 024/124. */
    soldierServiceMonths?: number;
  };

  /**
   * נכסים והתחייבויות — נאספים בשאלון הקליטה ומלווים את התיק.
   * ‼ אלה עובדות קבע ולא נתוני שנה: הן נועדו להצהרת הון שתידרש בעתיד, ולכן
   * נשאלות פעם אחת בכניסה ולא בכל דוח מחדש. סכומים אינם נאספים כאן —
   * הצהרת הון דורשת שערוך ליום מסוים, וזו עבודה של רואה חשבון ולא של טופס.
   */
  wealthAssets?: {
    hasRealEstate?: boolean;
    realEstateCount?: number;
    hasVehicles?: boolean;
    hasLoans?: boolean;
  };

  /** הפסדים — פירוט לפי סוג (מדריך 2025 עמ' 26–27). מחליף את הדגל הבודד. */
  losses: {
    kinds?: Array<
      | 'business_carry'        // 079 — הפסד מעסק מועבר (+1344)
      | 'rental_property'       // 179 — הפסד מנכס בית (רק כנגד אותו בניין)
      | 'capital_carry'         // 166 — הפסדי הון מועברים (יחס 1:3.5)
      | 'securities_pre2006'    // 160 — הפסדי ני"ע עד 31.12.05
      | 'foreign_carry'         // 299 — הפסדי חו"ל (מנספח ד')
      | 'rnd_investment'        // 319 — השקעה מזכה בחברת מו"פ
    >;
  };

  /**
   * הצהרות הפתיחה של הדוח — הצ'קבוקסים בעמוד הראשון של 1301.
   * רובן שכבת-רו"ח: טריגר מהלקוח → דגל טיפול + טופס נלווה.
   */
  openingDeclarations: {
    /** נאמנות: יוצר (151/148) / נהנה (142, שדה 271) / אין. */
    trustRole?: 'none' | 'settlor' | 'beneficiary' | 'both';
    /** העברת 500,000 ₪+ לחו"ל — חובת דיווח שנתיים. */
    transferredAbroad500k?: boolean;
    /** נכסי חו"ל בשווי מעל ~2,086,000 ₪ (כולל בן זוג וילדים עד 18). */
    hasForeignAssetsOverThreshold?: boolean;
    /** מחזור מכירות ני"ע בבורסה מעל ~2,810,000 ₪. */
    securitiesTurnoverOverThreshold?: boolean;
    /** עסקאות עם צדדים קשורים בחו"ל — טופס 1385 לכל עסקה. */
    hasRelatedPartyForeignTransactions?: boolean;
    /** חוות דעת חייבת בדיווח (1345) / עמדה חייבת בדיווח / תכנון מס (1213). */
    hasReportableOpinionOrPosition?: boolean;
    /** טוען לאי-תושבות למרות חזקת ימי שהייה — טופס 1348. */
    claimsNonResidencyDaysPresumption?: boolean;
    /** הכנסות מפעילות אינטרנט / אנרגיות מתחדשות — קודי שדה 307. */
    specialActivityCodes?: Array<'internet' | 'renewable_energy'>;
    /** קבלן — דיווח סיום בנייה (702). */
    hasConstructionCompletion?: boolean;
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

  /** איפה מתנהלים החשבונות — פרופיל קבוע, רלוונטי ל-867 ולהצהרת הון. */
  accounts?: {
    /** שמות הבנקים של חשבונות העו"ש (טקסט חופשי מהלקוח). */
    bankNames?: string;
    /** בתי השקעות / בנקים שבהם מנוהל תיק ני"ע. */
    investmentInstitutions?: string;
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
    losses: {},
    openingDeclarations: {},
    specialSituations: {},
  };
}

// ─── מיגרציית מודל ─────────────────────────────────────────────────────────
// משלימה נתיבים חסרים במודל ישן (שנשמר ב-DB לפני הוספת spouse/taxPaid).
// קוראים לזה ב-rowToSession ובכל מקום שמודל עלול להגיע ממקור חיצוני.
export function migrateModel(raw: Partial<TaxpayerModel> | null | undefined, taxYear: number): TaxpayerModel {
  const r = raw ?? {};
  const migrated: TaxpayerModel = {
    taxYear: r.taxYear ?? taxYear,
    meta: { ...(r.meta ?? {}) },
    identity: { ...(r.identity ?? {}) },
    spouse: { ...(r.spouse ?? {}) },
    income: { sources: [], ...(r.income ?? {}) },
    taxPaid: { ...(r.taxPaid ?? {}) },
    deductionsCredits: { ...(r.deductionsCredits ?? {}) },
    losses: { ...(r.losses ?? {}) },
    openingDeclarations: { ...(r.openingDeclarations ?? {}) },
    specialSituations: { ...(r.specialSituations ?? {}) },
    accounts: { ...(r.accounts ?? {}) },
  };
  // סשן ישן שסימן "יש הפסדים מועברים" בדגל בודד — ממופה לרשימת הסוגים החדשה
  // כ"עסק" (הנפוץ ביותר) כדי שהשדות החדשים לא ייעלמו לו.
  if (migrated.specialSituations.hasCarriedLosses && !(migrated.losses.kinds?.length)) {
    migrated.losses.kinds = ['business_carry'];
  }
  return migrated;
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
  completedNationalService?: boolean;
  nationalServiceYear?: number;
  hasAcademicDegree?: boolean;
  academicDegreeYear?: number;
  hasKrenHashtalmut?: boolean;
  isSubstantialShareholder?: boolean;

  // ─── סכומים שנתיים לזיכויים ──────────────────────────────────────────
  donationsAnnual?: number;
  lifeInsuranceAnnual?: number;
  reserveCombatDaysPrevYear?: number;

  // ─── ילדים — רשימה מפורטת ───────────────────────────────────────────
  children?: Array<{ id: string; firstName?: string; birthDate: string; birthYear: number; hasDisability: boolean }>;

  // ─── עסקים, נכסים, השקעות ────────────────────────────────────────────
  rentalTaxTrack?: 'exempt' | 'flat10' | 'regular';
  businesses?: Array<{ id: string; name: string; kind: string; revenueAnnual?: number; belongsToSpouse?: boolean; isClosed?: boolean }>;

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

/** פרקי השאלון החדש — כל שאלה משויכת לפרק; הפרקים נגזרים משער האריחים. */
export type ChapterKey =
  | 'identity_family'   // פרטים, בן/בת זוג, ילדים, תושבות — תמיד
  | 'salary'            // שכר ושכיר
  | 'business'          // עסק / משלח יד
  | 'rental'            // נדל"ן מושכר
  | 'capital'           // שוק ההון, ריבית, דיבידנד, קריפטו
  | 'pension_ni'        // פנסיה, פרישה, ביטוח לאומי
  | 'foreign'           // חו"ל — הכנסות ונכסים
  | 'companies'         // חברות בבעלות, שותפויות, משיכות
  | 'deductions'        // ניכויים וזיכויים — תמיד
  | 'special'           // מצבים מיוחדים, הפסדים, הצהרות — תמיד (מקוצר)
  | 'finish';           // סיכום, מסמכים והצהרה

export const CHAPTER_LABELS: Record<ChapterKey, string> = {
  identity_family: 'פרטים ומשפחה',
  salary: 'שכר',
  business: 'עסק עצמאי',
  rental: 'נדל"ן מושכר',
  capital: 'שוק ההון וחסכונות',
  pension_ni: 'פנסיה וביטוח לאומי',
  foreign: 'חו"ל',
  companies: 'חברות ושותפויות',
  deductions: 'ניכויים וזיכויים',
  special: 'מצבים מיוחדים',
  finish: 'סיכום ומסמכים',
};

/**
 * קהל היעד של שאלה — עיקרון "הלקוח מדווח עובדות, הרו"ח מקבל החלטות":
 * - client:     עובדה שהלקוח יודע (יש דירה? כמה שכ"ד?). מופיעה בכל הזרימות.
 * - accountant: החלטה מקצועית / בחירת מסלול (חישוב נפרד, פריסה, סעיף 14).
 *               מוצגת רק כשרו"ח מפעיל את השאלון; בזרימת לקוח עתידית — מדולגת
 *               והופכת לפריט "ממתין להחלטת רו"ח" בשער הכיסוי.
 */
export type QuestionAudience = 'client' | 'accountant';

/**
 * אורך חיים של עובדה — לב ארכיטקטורת "פרופיל מס חי":
 * - permanent: נשאל פעם אחת בקליטה, נשמר בפרופיל (תושבות, ילדים, נכסים...).
 * - annual:    נאסף כל שנת מס מחדש (סכומים, אירועי השנה, מסמכים).
 */
export type QuestionLifetime = 'permanent' | 'annual';

export interface QuestionNode {
  id: string;
  question: string;
  helpText?: string;
  type: QuestionType;
  /** הפרק שאליו שייכת השאלה בחוויית הפרקים החדשה. */
  chapter?: ChapterKey;
  /** ברירת מחדל: 'client'. */
  audience?: QuestionAudience;
  /** ברירת מחדל: 'annual'. */
  lifetime?: QuestionLifetime;
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

  // ─── הרחבות מודל שלוש השכבות (2026-07) ─────────────────────────────────
  /** שכבת האיסוף. ברירת מחדל כשלא צוין: 'question' (התנהגות היסטורית). */
  dataLayer?: DataLayer;
  /** קודי הטופס לפי בעלות (רשום/בן זוג/משותף), למשל {registered:'158', spouse:'172'}. */
  codes?: OwnershipCodes;
  /** הפניה למקור הרשמי — עמוד במדריך רשות המיסים 2025 + הערה. */
  officialRef?: string;
  /** דגל טיפול רו"ח: שם הטופס הנלווה / הפעולה שנדרשת מהמשרד כשהשדה נדלק. */
  accountantAction?: string;
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
