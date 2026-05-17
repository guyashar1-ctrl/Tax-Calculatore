// ─── רישום השדות של טופס 1301 — מקור האמת ──────────────────────────────────
//
// כל שדה מצהיר על:
//   - מספרו הויזואלי בטופס (לפי PDF + מדריך רשות המיסים 2025)
//   - מתי הוא חי (always / conditional)
//   - איזה modelPath ב-TaxpayerModel מזין אותו
//   - אילו sourceQuestionIds נדרשים כדי להחיות אותו
//   - אילו מסמכים יידרשו בשלב איסוף הנתונים
//
// השינויים בטופס 1301 ו/או בעץ ההחלטות מתחילים תמיד מהקובץ הזה.

import type { Form1301FieldDef, TaxpayerModel } from './types';

// כל ה-helpers מוגנים נגד מודל חלקי (שמגיע מסשנים ישנים שלא עברו עוד מיגרציה).
const has = (m: TaxpayerModel, kind: string) =>
  (m.income?.sources ?? []).includes(kind as TaxpayerModel['income']['sources'][number]);

const isMarried = (m: TaxpayerModel) => m.identity?.maritalStatus === 'married';

// ─── הרישום ─────────────────────────────────────────────────────────────

export const form1301Fields: Form1301FieldDef[] = [
  // ═══ חלק 1 — פרטים אישיים ═══════════════════════════════════════════════
  {
    fieldNumber: '001',
    hebrewLabel: 'תעודת זהות הנישום',
    section: '1_identity',
    required: 'always',
    modelPath: 'identity.idNumber',
    sourceQuestionIds: ['identity_basics'],
    requiredDocuments: [
      { code: 'id_card', name: 'תעודת זהות + ספח', reason: 'אימות פרטי הנישום' },
    ],
  },
  {
    fieldNumber: '002',
    hebrewLabel: 'שם פרטי + שם משפחה',
    section: '1_identity',
    required: 'always',
    modelPath: 'identity.fullName',
    sourceQuestionIds: ['identity_basics'],
    requiredDocuments: [],
  },
  {
    fieldNumber: '003',
    hebrewLabel: 'תאריך לידה',
    section: '1_identity',
    required: 'always',
    modelPath: 'identity.dateOfBirth',
    sourceQuestionIds: ['identity_basics'],
    requiredDocuments: [],
  },
  {
    fieldNumber: '004',
    hebrewLabel: 'כתובת מגורים + עיר',
    section: '1_identity',
    required: 'always',
    modelPath: 'identity.address',
    sourceQuestionIds: ['identity_basics', 'qualifying_settlement'],
    requiredDocuments: [],
  },
  {
    fieldNumber: '113',
    hebrewLabel: 'מצב משפחתי',
    section: '1_identity',
    required: 'always',
    modelPath: 'identity.maritalStatus',
    sourceQuestionIds: ['marital_status'],
    requiredDocuments: [],
  },
  {
    fieldNumber: 'D-pct',
    hebrewLabel: 'אחוז נכות מוכרת',
    section: '1_identity',
    required: 'conditional',
    conditionalOn: (m) => m.identity?.hasDisability === true,
    modelPath: 'identity.disabilityBand',
    sourceQuestionIds: ['has_disability', 'disability_band'],
    requiredDocuments: [
      { code: 'disability_cert', name: 'אישור ועדה רפואית / ביטוח לאומי', reason: 'הוכחת אחוז הנכות לזיכוי מלא לפי סעיף 9(5)' },
    ],
    legalReference: 'סעיף 9(5) לפקודה',
  },

  // ═══ חלק 2 — בני בית ═════════════════════════════════════════════════════
  {
    fieldNumber: 'S-id',
    hebrewLabel: 'תעודת זהות בן/בת זוג',
    section: '2_family',
    required: 'conditional',
    conditionalOn: isMarried,
    modelPath: 'spouse.idNumber',
    sourceQuestionIds: ['marital_status', 'spouse_basics'],
    requiredDocuments: [
      { code: 'spouse_id', name: 'תעודת זהות בן/בת זוג', reason: 'נדרש לכל זוג נשוי' },
    ],
  },
  {
    fieldNumber: 'S-role',
    hebrewLabel: 'בן הזוג הרשום (מי משדר)',
    section: '2_family',
    required: 'conditional',
    conditionalOn: isMarried,
    modelPath: 'spouse.registeredRole',
    sourceQuestionIds: ['marital_status', 'registered_spouse_role'],
    requiredDocuments: [],
    legalReference: 'הוראות פקודה — בחירת בן זוג רשום',
  },
  {
    fieldNumber: 'S-calc',
    hebrewLabel: 'חישוב מאוחד או נפרד',
    section: '2_family',
    required: 'conditional',
    conditionalOn: (m) => isMarried(m) && m.identity?.spouseHasIncome === true,
    modelPath: 'spouse.eligibleSeparateCalc',
    sourceQuestionIds: ['marital_status', 'eligible_separate_calc'],
    requiredDocuments: [],
    legalReference: 'סעיף 66 לפקודה',
  },
  {
    fieldNumber: 'C-list',
    hebrewLabel: 'פירוט ילדים (שם, שנת לידה, החזקה)',
    section: '2_family',
    required: 'conditional',
    conditionalOn: (m) => (m.identity?.childrenCount ?? 0) > 0,
    modelPath: 'identity.children',
    sourceQuestionIds: ['children_count', 'children_details_required'],
    requiredDocuments: [
      { code: 'children_id', name: 'תעודות זהות ילדים + ספח', reason: 'אימות גילאי הילדים לחישוב נקודות זיכוי' },
    ],
  },
  {
    fieldNumber: 'C-special',
    hebrewLabel: 'ילד עם נכות / צרכים מיוחדים',
    section: '2_family',
    required: 'conditional',
    conditionalOn: (m) => m.identity?.childrenWithSpecialNeeds === true,
    modelPath: 'identity.childrenWithSpecialNeeds',
    sourceQuestionIds: ['children_count', 'children_special_needs'],
    requiredDocuments: [
      { code: 'special_child_cert', name: 'אישור נכות לילד', reason: 'נדרש לזיכוי לפי סעיף 40(ד)' },
    ],
    legalReference: 'סעיף 40(ד) לפקודה',
  },
  {
    fieldNumber: '029',
    hebrewLabel: 'הורה יחיד שילדיו בחזקתו',
    section: '2_family',
    required: 'conditional',
    conditionalOn: (m) => m.identity?.isCustodialSingleParent === true,
    modelPath: 'identity.isCustodialSingleParent',
    sourceQuestionIds: ['marital_status', 'is_custodial_single_parent'],
    requiredDocuments: [
      { code: 'custody_decree', name: 'פסק דין למשמורת / אישור עיריה', reason: 'הוכחת הורה יחיד לזיכוי 029' },
    ],
    legalReference: 'סעיף 40(ב) לפקודה',
  },

  // ═══ חלק 3 — הכנסות מעבודה ═══════════════════════════════════════════════
  {
    fieldNumber: '158',
    hebrewLabel: 'הכנסה ברוטו ממשכורת',
    section: '3_income_salary',
    required: 'conditional',
    conditionalOn: (m) => has(m, 'salary'),
    modelPath: 'income.salary.totalGross',
    sourceQuestionIds: ['salary_employer_count'],
    requiredDocuments: [
      { code: '106', name: 'טופס 106 מכל מעביד', reason: 'אישור שנתי על שכר ברוטו ומס שנוכה' },
    ],
  },
  {
    fieldNumber: '042',
    hebrewLabel: 'מס שנוכה במקור משכר',
    section: '3_income_salary',
    required: 'conditional',
    conditionalOn: (m) => has(m, 'salary'),
    modelPath: 'income.salary.totalWithheld',
    sourceQuestionIds: ['salary_employer_count', 'had_withholding_at_source'],
    requiredDocuments: [
      { code: '106', name: 'טופס 106', reason: 'הסכום מופיע על גבי הטופס' },
    ],
  },
  {
    fieldNumber: '170',
    hebrewLabel: 'מספר טפסי 106 שצורפו',
    section: '3_income_salary',
    required: 'conditional',
    conditionalOn: (m) => has(m, 'salary'),
    modelPath: 'income.salaryEmployerCount',
    sourceQuestionIds: ['salary_employer_count'],
    requiredDocuments: [],
  },
  {
    fieldNumber: '037-sev',
    hebrewLabel: 'מענק פרישה / פיצויי פיטורין',
    section: '3_income_salary',
    required: 'conditional',
    conditionalOn: (m) => m.income?.receivedSeverance === true,
    modelPath: 'income.severance.amount',
    sourceQuestionIds: ['received_severance'],
    requiredDocuments: [
      { code: 'severance_cert', name: 'אישור על מענק פרישה', reason: 'דיווח מענק חייב/פטור' },
      { code: '134', name: 'טופס 134 (אם בוצעה פריסה)', reason: 'פריסה למספר שנות מס' },
    ],
    legalReference: 'סעיף 9(7א) לפקודה',
  },
  {
    fieldNumber: 'S-spouse-salary',
    hebrewLabel: 'הכנסה ברוטו ממשכורת — בן/בת הזוג',
    section: '3_income_salary',
    required: 'conditional',
    conditionalOn: (m) => isMarried(m) && m.identity?.spouseHasIncome === true && m.spouse?.has106 === true,
    modelPath: 'spouse.salary.totalGross',
    sourceQuestionIds: ['marital_status', 'spouse_has_106'],
    requiredDocuments: [
      { code: '106_spouse', name: 'טופס 106 של בן/בת הזוג', reason: 'דיווח הכנסת התא המשפחתי' },
    ],
  },
  {
    fieldNumber: '282',
    hebrewLabel: 'הכנסה ממימוש אופציות 102 / 3i',
    section: '3_income_salary',
    required: 'conditional',
    conditionalOn: (m) => m.income?.hasOptions102 === true,
    modelPath: 'income.options102Total',
    sourceQuestionIds: ['has_options_102'],
    requiredDocuments: [
      { code: 'options_102_cert', name: 'אישור מהמעביד / נאמן על מימוש אופציות', reason: 'דיווח שווי המימוש' },
    ],
    legalReference: 'סעיף 102 / 3i לפקודה',
  },

  // ═══ חלק 4 — הכנסות מעסק ════════════════════════════════════════════════
  {
    fieldNumber: '150',
    hebrewLabel: 'הכנסה מעסק / משלח יד — הנישום',
    section: '4_income_business',
    required: 'conditional',
    conditionalOn: (m) => has(m, 'business'),
    modelPath: 'income.business.netIncome',
    sourceQuestionIds: ['business_kind', 'biz_revenue_band'],
    requiredDocuments: [
      { code: 'biz_pnl', name: 'דוח רווח-הפסד שנתי', reason: 'בסיס לחישוב הכנסה חייבת' },
      { code: 'annex_1320', name: 'נספח א\' (1320)', reason: 'פירוט ההכנסה מעסק לכל עסק בנפרד' },
    ],
    legalReference: 'סעיף 2(1) לפקודה',
  },
  {
    fieldNumber: '6111-req',
    hebrewLabel: 'חובת הגשת טופס 6111 (מחזור מעל 300K)',
    section: '4_income_business',
    required: 'conditional',
    conditionalOn: (m) => m.income?.bizRevenueBand === '300k_plus',
    modelPath: 'income.business.requires6111',
    sourceQuestionIds: ['biz_revenue_band'],
    requiredDocuments: [
      { code: '6111', name: 'טופס 6111 — מאזן ודוח רווח-הפסד מקודד', reason: 'חובה לעסק עם מחזור מעל 300,000 ₪ (הוראות 2025)' },
    ],
  },
  {
    fieldNumber: 'B-client-wh',
    hebrewLabel: 'ניכוי במקור מלקוחות (לעצמאי)',
    section: '4_income_business',
    required: 'conditional',
    conditionalOn: (m) => m.income?.bizHasClientWithholding === true,
    modelPath: 'income.business.clientWithholding',
    sourceQuestionIds: ['biz_has_client_withholding'],
    requiredDocuments: [
      { code: '857', name: 'טופס 857 — אישור ניכוי במקור', reason: 'סך הניכוי במקור מלקוחות לעצמאי' },
    ],
  },

  // ═══ חלק 5 — הכנסות פאסיביות ═════════════════════════════════════════════
  {
    fieldNumber: '077',
    hebrewLabel: 'הכנסה משכ"ד — מסלול פטור',
    section: '5_income_passive',
    required: 'conditional',
    conditionalOn: (m) => has(m, 'rental') && m.income?.rentalTrack === 'exempt',
    modelPath: 'income.rental.gross',
    sourceQuestionIds: ['rental_track', 'rental_gross'],
    requiredDocuments: [],
    legalReference: 'חוק פטור ממס על דמי שכירות התש"ן-1990',
  },
  {
    fieldNumber: '078',
    hebrewLabel: 'הכנסה משכ"ד — מסלול 10%',
    section: '5_income_passive',
    required: 'conditional',
    conditionalOn: (m) => has(m, 'rental') && m.income?.rentalTrack === 'flat10',
    modelPath: 'income.rental.gross',
    sourceQuestionIds: ['rental_track', 'rental_gross'],
    requiredDocuments: [
      { code: 'rental_contract', name: 'חוזה שכירות', reason: 'אסמכתא להכנסה' },
    ],
    legalReference: 'סעיף 122 לפקודה',
  },
  {
    fieldNumber: '080',
    hebrewLabel: 'הכנסה משכ"ד — מסלול שולי',
    section: '5_income_passive',
    required: 'conditional',
    conditionalOn: (m) => has(m, 'rental') && m.income?.rentalTrack === 'regular',
    modelPath: 'income.rental.gross',
    sourceQuestionIds: ['rental_track', 'rental_gross'],
    requiredDocuments: [
      { code: 'rental_contract', name: 'חוזה שכירות', reason: 'אסמכתא להכנסה' },
      { code: 'rental_expenses', name: 'קבלות הוצאות (פחת, ריבית משכנתא, תיקונים)', reason: 'דרישה להוצאות במסלול שולי' },
    ],
  },
  {
    fieldNumber: '126',
    hebrewLabel: 'ריבית מאגרות חוב / פיקדונות',
    section: '5_income_passive',
    required: 'conditional',
    conditionalOn: (m) => m.income?.hasInterestIncome === true,
    modelPath: 'income.interest.gross',
    sourceQuestionIds: ['has_interest_income'],
    requiredDocuments: [
      { code: '867', name: 'טופס 867 מהבנק', reason: 'אישור שנתי על ריבית ומס שנוכה' },
    ],
  },
  {
    fieldNumber: '043',
    hebrewLabel: 'ניכוי במקור מריבית',
    section: '5_income_passive',
    required: 'conditional',
    conditionalOn: (m) => m.income?.interestHasWithholding === true,
    modelPath: 'income.interest.withheld',
    sourceQuestionIds: ['has_interest_income', 'had_withholding_at_source'],
    requiredDocuments: [
      { code: '867', name: 'טופס 867 מהבנק', reason: 'הסכום מופיע ב-867' },
    ],
  },
  {
    fieldNumber: 'P-pension',
    hebrewLabel: 'פנסיה / קצבה',
    section: '5_income_passive',
    required: 'conditional',
    conditionalOn: (m) => m.income?.hasPensionIncome === true,
    modelPath: 'income.pension.gross',
    sourceQuestionIds: ['has_pension_income'],
    requiredDocuments: [
      { code: '161', name: 'אישור על קצבה / טופס 161', reason: 'דיווח קצבאות שוטפות' },
    ],
  },
  {
    fieldNumber: '194',
    hebrewLabel: 'דמי לידה מביטוח לאומי',
    section: '5_income_passive',
    required: 'conditional',
    conditionalOn: (m) => m.income?.niMaternityReceived === true,
    modelPath: 'income.niMaternityAmount',
    sourceQuestionIds: ['ni_maternity'],
    requiredDocuments: [
      { code: 'ni_maternity_cert', name: 'אישור ביטוח לאומי על תקבול דמי לידה', reason: 'תקבול חייב במס מלא' },
    ],
  },
  {
    fieldNumber: '196',
    hebrewLabel: 'דמי אבטלה מביטוח לאומי',
    section: '5_income_passive',
    required: 'conditional',
    conditionalOn: (m) => m.income?.niUnemploymentReceived === true,
    modelPath: 'income.niUnemploymentAmount',
    sourceQuestionIds: ['ni_unemployment'],
    requiredDocuments: [
      { code: 'ni_unemployment_cert', name: 'אישור ביטוח לאומי על תקבול דמי אבטלה', reason: 'תקבול חייב במס' },
    ],
  },
  {
    fieldNumber: '250',
    hebrewLabel: 'תגמולי מילואים מביטוח לאומי',
    section: '5_income_passive',
    required: 'conditional',
    conditionalOn: (m) => m.income?.niReserveDutyReceived === true,
    modelPath: 'income.niReserveDutyAmount',
    sourceQuestionIds: ['ni_reserve_duty'],
    requiredDocuments: [
      { code: 'ni_reserve_cert', name: 'אישור תגמולי מילואים', reason: 'תקבול חייב במס' },
    ],
  },
  {
    fieldNumber: '270',
    hebrewLabel: 'תקבולי פגיעה בעבודה מביטוח לאומי',
    section: '5_income_passive',
    required: 'conditional',
    conditionalOn: (m) => m.income?.niWorkInjuryReceived === true,
    modelPath: 'income.niWorkInjuryAmount',
    sourceQuestionIds: ['ni_work_injury'],
    requiredDocuments: [
      { code: 'ni_work_injury_cert', name: 'אישור פגיעה בעבודה מבט"ל', reason: 'דיווח תקבולי פיצוי' },
    ],
  },
  {
    fieldNumber: '9-21',
    hebrewLabel: 'דמי מזונות שהתקבלו',
    section: '5_income_passive',
    required: 'conditional',
    conditionalOn: (m) => (m.deductionsCredits?.alimonyReceivedAnnual ?? 0) > 0,
    modelPath: 'deductionsCredits.alimonyReceivedAnnual',
    sourceQuestionIds: ['alimony_received'],
    requiredDocuments: [
      { code: 'alimony_decree', name: 'פסק דין מזונות / הסכם', reason: 'דיווח תקבולי מזונות שחייבים חלקית' },
    ],
    legalReference: 'סעיף 9(21) לפקודה',
  },

  // ═══ חלק 6 — רווחי הון ודיבידנד ══════════════════════════════════════════
  {
    fieldNumber: '142',
    hebrewLabel: 'רווחי הון מניירות ערך סחירים',
    section: '6_capital',
    required: 'conditional',
    conditionalOn: (m) => (m.income?.capitalSubTypes ?? []).includes('securities'),
    modelPath: 'income.capital.securitiesGain',
    sourceQuestionIds: ['capital_has_securities'],
    requiredDocuments: [
      { code: '867_capital', name: 'טופס 867 (א+ב) מבית ההשקעות', reason: 'אישור על רווחי הון ומס שנוכה' },
      { code: 'annex_1322', name: 'נספח ג\' (1322)', reason: 'פירוט רווחי הון' },
    ],
  },
  {
    fieldNumber: '253',
    hebrewLabel: 'ניכוי במקור מרווחי הון',
    section: '6_capital',
    required: 'conditional',
    conditionalOn: (m) => m.income?.capitalHasWithholding === true,
    modelPath: 'income.capital.withheld',
    sourceQuestionIds: ['capital_has_securities', 'had_withholding_at_source'],
    requiredDocuments: [
      { code: '867_capital', name: 'טופס 867 (א+ב)', reason: 'הסכום מופיע ב-867' },
    ],
  },
  {
    fieldNumber: '054',
    hebrewLabel: 'רווחי הון ממקרקעין (שאינו דירת מגורים יחידה)',
    section: '6_capital',
    required: 'conditional',
    conditionalOn: (m) => (m.income?.capitalSubTypes ?? []).includes('real_estate'),
    modelPath: 'income.capital.realEstateGain',
    sourceQuestionIds: ['capital_has_real_estate'],
    requiredDocuments: [
      { code: 'land_appraisal', name: 'שומת מס שבח', reason: 'דיווח עסקת מקרקעין' },
      { code: 'sale_contract', name: 'חוזה מכר', reason: 'אסמכתא לעסקה' },
    ],
  },
  {
    fieldNumber: 'C-crypto',
    hebrewLabel: 'רווחי הון ממטבעות דיגיטליים',
    section: '6_capital',
    required: 'conditional',
    conditionalOn: (m) => (m.income?.capitalSubTypes ?? []).includes('crypto'),
    modelPath: 'income.capital.cryptoGain',
    sourceQuestionIds: ['capital_has_crypto'],
    requiredDocuments: [
      { code: 'crypto_history', name: 'דוח עסקאות מהבורסה (CSV/PDF)', reason: 'חישוב רווח/הפסד עסקה לעסקה' },
      { code: 'annex_1322', name: 'נספח ג\' עם קוד עסקה מאולצת 71', reason: 'דיווח קריפטו לפי הנחיות רשות המיסים' },
    ],
  },
  {
    fieldNumber: '036',
    hebrewLabel: 'דיבידנד',
    section: '6_capital',
    required: 'conditional',
    conditionalOn: (m) => has(m, 'dividend'),
    modelPath: 'income.dividend.amount',
    sourceQuestionIds: ['dividend_controlling'],
    requiredDocuments: [
      { code: '867', name: 'טופס 867', reason: 'אישור על דיבידנד ומס שנוכה' },
    ],
  },

  // ═══ חלק 7 — הכנסות חו"ל ═══════════════════════════════════════════════
  {
    fieldNumber: '249',
    hebrewLabel: 'הכנסות מחו"ל',
    section: '7_foreign',
    required: 'conditional',
    conditionalOn: (m) => has(m, 'foreign'),
    modelPath: 'income.foreign.total',
    sourceQuestionIds: ['foreign_countries', 'foreign_income_kinds'],
    requiredDocuments: [
      { code: 'foreign_income_proof', name: 'אישור הכנסה ממדינת המקור', reason: 'הוכחת ההכנסה לפני זיכוי מס זר' },
      { code: 'annex_1324', name: 'נספח ד\' (1324)', reason: 'פירוט הכנסות חו"ל' },
    ],
    legalReference: 'סעיף 5 לפקודה',
  },
  {
    fieldNumber: 'F-tax-credit',
    hebrewLabel: 'זיכוי מס זר',
    section: '7_foreign',
    required: 'conditional',
    conditionalOn: (m) => m.income?.foreignPaidTaxAbroad === true,
    modelPath: 'income.foreign.taxCreditClaimed',
    sourceQuestionIds: ['foreign_paid_tax_abroad'],
    requiredDocuments: [
      { code: 'foreign_tax_cert', name: 'אישור על מס זר ששולם', reason: 'בסיס לזיכוי לפי אמנת מס' },
      { code: 'annex_1325', name: 'טופס 1325 — בקשה לזיכוי מס זר', reason: 'תביעת זיכוי' },
    ],
  },

  // ═══ חלק 8 — ניכויים וזיכויים ═════════════════════════════════════════════
  {
    fieldNumber: '037',
    hebrewLabel: 'תרומות לפי סעיף 46',
    section: '8_deductions',
    required: 'conditional',
    conditionalOn: (m) => (m.deductionsCredits?.donationAmount ?? 0) > 0,
    modelPath: 'deductionsCredits.donationAmount',
    sourceQuestionIds: ['donations'],
    requiredDocuments: [
      { code: 'donation_46', name: 'אישורי תרומה לפי סעיף 46', reason: 'נדרש אישור מקורי לכל תרומה לזיכוי' },
    ],
    legalReference: 'סעיף 46 לפקודה',
  },
  {
    fieldNumber: '045',
    hebrewLabel: 'דמי ביטוח חיים — לזיכוי',
    section: '8_deductions',
    required: 'conditional',
    conditionalOn: (m) => (m.deductionsCredits?.lifeInsuranceAnnual ?? 0) > 0,
    modelPath: 'deductionsCredits.lifeInsuranceAnnual',
    sourceQuestionIds: ['life_insurance'],
    requiredDocuments: [
      { code: 'life_ins_cert', name: 'אישור ביטוח חיים', reason: 'הסכום ששולם השנה' },
    ],
    legalReference: 'סעיף 45א לפקודה',
  },
  {
    fieldNumber: '086',
    hebrewLabel: 'הפקדות עצמאיות לפנסיה',
    section: '8_deductions',
    required: 'conditional',
    conditionalOn: (m) => (m.deductionsCredits?.selfPensionDeposits ?? 0) > 0,
    modelPath: 'deductionsCredits.selfPensionDeposits',
    sourceQuestionIds: ['self_pension'],
    requiredDocuments: [
      { code: 'pension_self_cert', name: 'אישור הפקדות עצמאיות לפנסיה', reason: 'בסיס לניכוי/זיכוי' },
    ],
    legalReference: 'סעיף 47 / 45א לפקודה',
  },
  {
    fieldNumber: 'K-hashtalmut',
    hebrewLabel: 'הפקדות עצמאיות לקרן השתלמות (עצמאי)',
    section: '8_deductions',
    required: 'conditional',
    conditionalOn: (m) => m.deductionsCredits?.hasKerenHashtalmutSelf === true,
    modelPath: 'deductionsCredits.kerenHashtalmutSelfAmount',
    sourceQuestionIds: ['has_keren_hashtalmut_self'],
    requiredDocuments: [
      { code: 'keren_cert', name: 'אישור הפקדה לקרן השתלמות', reason: 'הוצאה מוכרת לעצמאי' },
    ],
    legalReference: 'סעיף 17(5א) לפקודה',
  },
  {
    fieldNumber: '25-alimony-paid',
    hebrewLabel: 'מזונות ששולמו (זיכוי)',
    section: '8_deductions',
    required: 'conditional',
    conditionalOn: (m) => (m.deductionsCredits?.alimonyPaidAnnual ?? 0) > 0,
    modelPath: 'deductionsCredits.alimonyPaidAnnual',
    sourceQuestionIds: ['alimony_paid'],
    requiredDocuments: [
      { code: 'alimony_decree_paid', name: 'פסק דין מזונות + אישורי תשלום', reason: 'זיכוי לפי סעיף 25 — בלבד אם מעוגן בפסק דין' },
    ],
    legalReference: 'סעיף 25 לפקודה',
  },
  {
    fieldNumber: 'S14',
    hebrewLabel: 'פטור לפי סעיף 14 (עולה חדש / תושב חוזר ותיק)',
    section: '8_deductions',
    required: 'conditional',
    conditionalOn: (m) => m.specialSituations?.electsSection14 === true,
    modelPath: 'specialSituations.electsSection14',
    sourceQuestionIds: ['elects_section_14'],
    requiredDocuments: [
      { code: 'aliyah_cert', name: 'תעודת עולה / אישור משרד הקליטה', reason: 'הוכחת זכאות לפטור 10 שנים' },
    ],
    legalReference: 'סעיף 14 לפקודה',
  },

  // ═══ חלק 9 — זיכויים נוספים ═════════════════════════════════════════════
  {
    fieldNumber: 'CR-soldier',
    hebrewLabel: 'זיכוי חייל משוחרר / שירות לאומי',
    section: '9_credits',
    required: 'conditional',
    conditionalOn: (m) => m.deductionsCredits?.isDischargedSoldier === true,
    modelPath: 'deductionsCredits.isDischargedSoldier',
    sourceQuestionIds: ['is_discharged_soldier'],
    requiredDocuments: [
      { code: 'discharge_cert', name: 'תעודת שחרור / אישור שירות', reason: 'הוכחת זכאות ל-2 נקודות זיכוי לשנתיים' },
    ],
    legalReference: 'סעיף 40(ג) לפקודה',
  },
  {
    fieldNumber: 'CR-academic',
    hebrewLabel: 'זיכוי תואר אקדמי',
    section: '9_credits',
    required: 'conditional',
    conditionalOn: (m) => m.deductionsCredits?.hasAcademicDegree === true,
    modelPath: 'deductionsCredits.hasAcademicDegree',
    sourceQuestionIds: ['has_academic_degree'],
    requiredDocuments: [
      { code: 'degree_cert', name: 'תעודת תואר', reason: 'הוכחת קבלת תואר בשנה אחרונה / 3 שנים אחרונות' },
    ],
    legalReference: 'סעיף 40(א) לפקודה',
  },

  // ═══ חלק 10 — מיסים ששולמו במהלך השנה ════════════════════════════════════
  {
    fieldNumber: '040',
    hebrewLabel: 'מקדמות מ"ה ששולמו במהלך השנה',
    section: '10_tax_paid',
    required: 'conditional',
    conditionalOn: (m) => m.taxPaid?.paidAdvancePayments === true,
    modelPath: 'taxPaid.advancePaymentsTotal',
    sourceQuestionIds: ['paid_advance_payments'],
    requiredDocuments: [
      { code: 'advance_payments', name: 'דוח מקדמות שנתי מאזור האישי בשע"ם', reason: 'סכום המקדמות לקיזוז כנגד חוב המס' },
    ],
  },
  {
    fieldNumber: 'WH-summary',
    hebrewLabel: 'סך ניכוי במקור מכל המקורות',
    section: '10_tax_paid',
    required: 'conditional',
    conditionalOn: (m) => (m.taxPaid?.withholdingSources ?? []).length > 0,
    modelPath: 'taxPaid.withholdingTotal',
    sourceQuestionIds: ['had_withholding_at_source'],
    requiredDocuments: [
      { code: '857_837_summary', name: 'אישורי ניכוי במקור (857/837/867)', reason: 'סכום כולל לקיזוז' },
    ],
  },

  // ═══ חלק 11 — נסיבות מיוחדות ═════════════════════════════════════════════
  {
    fieldNumber: '64a-fam-co',
    hebrewLabel: 'חבר בחברה משפחתית (סעיף 64א)',
    section: '11_special',
    required: 'conditional',
    conditionalOn: (m) => m.specialSituations?.isFamilyCompanyMember === true,
    modelPath: 'specialSituations.isFamilyCompanyMember',
    sourceQuestionIds: ['is_family_company_member'],
    requiredDocuments: [
      { code: 'family_company_decl', name: 'אישור חבר בחברה משפחתית + טופס 2152', reason: 'ייחוס ההכנסה לבעל המניות' },
    ],
    legalReference: 'סעיף 64א לפקודה',
  },
  {
    fieldNumber: '75b-cfc',
    hebrewLabel: 'חברה זרה נשלטת (CFC)',
    section: '11_special',
    required: 'conditional',
    conditionalOn: (m) => m.specialSituations?.isForeignControllingShareholder === true,
    modelPath: 'specialSituations.isForeignControllingShareholder',
    sourceQuestionIds: ['is_foreign_controlling_shareholder'],
    requiredDocuments: [
      { code: 'cfc_decl', name: 'דיווח על חברה זרה נשלטת + טופס 150', reason: 'דיווח רווחי CFC' },
    ],
    legalReference: 'סעיף 75ב לפקודה',
  },
  {
    fieldNumber: 'kibbutz',
    hebrewLabel: 'חבר קיבוץ / מושב שיתופי',
    section: '11_special',
    required: 'conditional',
    conditionalOn: (m) => m.specialSituations?.isKibbutzMember === true,
    modelPath: 'specialSituations.isKibbutzMember',
    sourceQuestionIds: ['is_kibbutz_member'],
    requiredDocuments: [
      { code: 'kibbutz_cert', name: 'אישור חברות קיבוץ + פירוט הכנסות', reason: 'חישוב מס שונה לחברי קיבוץ' },
    ],
    legalReference: 'סעיף 54-58 לפקודה',
  },
  {
    fieldNumber: 'L-losses',
    hebrewLabel: 'הפסדים מועברים משנים קודמות',
    section: '11_special',
    required: 'conditional',
    conditionalOn: (m) => m.specialSituations?.hasCarriedLosses === true,
    modelPath: 'specialSituations.carriedLosses',
    sourceQuestionIds: ['carried_losses'],
    requiredDocuments: [
      { code: 'last_year_assessment', name: 'שומה אחרונה / דוחות קודמים', reason: 'אסמכתא ליתרת ההפסד המועברת' },
    ],
  },
  {
    fieldNumber: 'W-decl',
    hebrewLabel: 'הצהרת הון (לפי דרישת פקיד שומה)',
    section: '11_special',
    required: 'conditional',
    conditionalOn: (m) => m.specialSituations?.wealthDeclarationRequired === true,
    modelPath: 'specialSituations.wealthDeclarationRequired',
    sourceQuestionIds: ['wealth_declaration_required'],
    requiredDocuments: [
      { code: 'wealth_declaration', name: 'טופס הצהרת הון', reason: 'מילוי הצהרת הון לפי דרישה' },
    ],
  },

  // ═══ חלק 12 — חתימה ═════════════════════════════════════════════════════
  {
    fieldNumber: 'SIG',
    hebrewLabel: 'הצהרה וחתימה',
    section: '12_signature',
    required: 'always',
    modelPath: 'signature',
    sourceQuestionIds: ['final_declaration'],
    requiredDocuments: [],
  },
];

// ─── עזרים ─────────────────────────────────────────────────────────────────

// אינדקס הפוך: questionId → fieldNumbers שהיא מזינה (מופק אוטומטית)
export function buildQuestionTargetIndex(): Record<string, string[]> {
  const idx: Record<string, string[]> = {};
  for (const f of form1301Fields) {
    for (const q of f.sourceQuestionIds) {
      if (!idx[q]) idx[q] = [];
      idx[q].push(f.fieldNumber);
    }
  }
  return idx;
}

export const SECTION_LABELS: Record<import('./types').SectionKey, string> = {
  '1_identity': 'פרטים אישיים',
  '2_family': 'בני בית',
  '3_income_salary': 'הכנסות מעבודה',
  '4_income_business': 'הכנסות מעסק',
  '5_income_passive': 'הכנסות פאסיביות',
  '6_capital': 'רווחי הון ודיבידנד',
  '7_foreign': 'הכנסות חו"ל',
  '8_deductions': 'ניכויים וזיכויים',
  '9_credits': 'זיכויים נוספים',
  '10_tax_paid': 'מיסים ששולמו',
  '11_special': 'נסיבות מיוחדות',
  '12_signature': 'חתימה',
};
