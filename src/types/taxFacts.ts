// ─── תיק מס — הצעות שינוי ומעברים על עובדות מקצועיות ──────────────────────────
// הערך המקובל של כל עובדה נשאר על Client (השדות הקיימים). הטיפוס הזה מתאר
// רק מעברים: הצעה ממתינה, החלטה, והיסטוריה. ראה supabase/90-tax-fact-reconciliation.sql.

export type TaxFactSource = 'questionnaire' | 'manual' | 'institution_alignment' | 'import';
export type TaxFactStatus = 'pending' | 'accepted' | 'rejected';

/** מה שרואים בעמודת "לפני"/"אחרי" — לא בהכרח ערך גולמי, לפעמים תיאור אנושי. */
export interface TaxFactValue {
  display: string;
  /**
   * ב-new_value: הפאץ' שיוחל בפועל אם ההצעה תאושר. חסר = הצעה מידעית בלבד
   * (למשל "מספר ילדים השתנה" — לא ניתן ליישם אוטומטית, דורש עריכה ידנית).
   *
   * ב-old_value: תמונת מצב של הערך המקובל *באותם מפתחות* בזמן שההצעה נוצרה
   * (לא רק טקסט לתצוגה). השרת (accept_tax_fact_change) משווה אותה מול הערך
   * המקובל בפועל בזמן האישור — אם הוא כבר השתנה, האישור נדחה כ-stale_conflict
   * במקום לדרוס בשקט ערך שהתעדכן בינתיים.
   */
  patch?: Record<string, unknown>;
}

export interface TaxFactChange {
  id: string;
  userId?: string;
  clientId: string;
  fieldKey: string;
  label: string;
  oldValue?: TaxFactValue;
  newValue: TaxFactValue;
  source: TaxFactSource;
  sourceRef?: string;
  status: TaxFactStatus;
  decidedBy?: string;
  decidedAt?: string;
  note?: string;
  createdAt: string;
}

export const TAX_FACT_SOURCE_LABELS: Record<TaxFactSource, string> = {
  questionnaire: 'שאלון נתוני מס',
  manual: 'עריכה ידנית',
  institution_alignment: 'יישור קו מול הרשויות',
  import: 'יבוא',
};

/** פריט להצעה — נשלח כמו שהוא ל-propose_tax_facts. */
export interface ProposedFact {
  fieldKey: string;
  label: string;
  oldValue?: TaxFactValue;
  newValue: TaxFactValue;
  note?: string;
}

// ─── allowlist השדות המקצועיים המנוהלים ─────────────────────────────────────
// ‼ מקור אמת יחיד — זהה בדיוק ל-allowlist בשרת (_tax_fact_field_op ב-
// supabase/91-tax-fact-transactions.sql). כל כותב client-side (השאלון,
// עורך "עדכן בכרטיס" באמצע השאלון, עריכה ידנית בתיק המס, ומסכי העריכה
// המלאה הישנים — ClientDossierTab/PersonalContactsTab/TaxFilesSection)
// חייב לבדוק מול הרשימה הזו, לא להמציא רשימה משלו — סטייה בין שני מקורות
// היא בדיוק הבאג שקרה כשהיה עותק שני ב-AnnualReport.tsx.
export const GOVERNED_FACT_KEYS: ReadonlySet<string> = new Set([
  'familyStatus', 'isNewImmigrant', 'aliyahYear', 'isReturningResident', 'disabilityPercentage',
  'hasAcademicDegree', 'academicDegreeYear', 'completedIdf', 'idfReleaseYear',
  'completedNationalService', 'nationalServiceYear', 'donationsAnnual', 'lifeInsuranceAnnual',
  'hasLifeInsurance', 'isFamilyCompanyMember', 'isForeignControllingShareholder', 'isKibbutzMember',
  'isSubstantialShareholder', 'hasResidentialProperty', 'numberOfProperties', 'hasCapitalIncome',
  'hasGamblingIncome', 'hasForeignAssets', 'spouseWorking', 'rentalTaxTrack', 'hasInvestments',
  'hasPension', 'taxFiles', 'bankAccounts', 'investmentAccounts', 'children', 'employers', 'pensionFunds',
  // ── M2: היו בכוונה מחוץ לרשימה ב-M1 ("טריטוריית יישור קו") — נכנסו עכשיו ──
  'vatFrequency', 'pitAdvancePercent', 'pitAdvanceFrequency', 'bookStatus', 'withholdingRate',
  'hasExemptFromWithholding', 'niAdvanceMonthly', 'taxOfficeName',
  // ── M2: שדות חדשים לחלוטין ──
  'niBalance', 'niOccupations', 'niDebitAuthorization',
  'vatBalance', 'vatDebitAuthorization', 'vatFileType', 'vatOpeningDate', 'vatPrimaryIndustry', 'vatLastReportPeriod',
  'incomeTaxBalance', 'incomeTaxFileType', 'incomeTaxUnit', 'incomeTaxEconomicIndustry',
  'incomeTaxDebitAuthorization', 'withholdingDetail', 'capitalDeclarationRequired', 'capitalDeclarationDeadline',
  // ── M2 — תיקון נאמנות: היו payload-בלבד, עכשיו עובדות מנוהלות כמו כולן ──
  'niIncomeBasisMonthly', 'incomeTaxReportingStatus',
  // ── M3 — מצב אישור הניכוי במקור, בלעדיו "אין אישור תקף" אינו דגל (146) ──
  'withholdingStatus',
]);

export const GOVERNED_FIELD_LABELS: Record<string, string> = {
  familyStatus: 'מצב משפחתי', isNewImmigrant: 'עולה חדש', aliyahYear: 'שנת עלייה',
  isReturningResident: 'תושב חוזר', disabilityPercentage: 'אחוז נכות',
  hasAcademicDegree: 'תואר אקדמי', academicDegreeYear: 'שנת קבלת התואר',
  completedIdf: 'שירות צבאי', idfReleaseYear: 'שנת שחרור',
  completedNationalService: 'שירות לאומי', nationalServiceYear: 'שנת סיום שירות לאומי',
  donationsAnnual: 'תרומות שנתיות', lifeInsuranceAnnual: 'ביטוח חיים שנתי',
  hasLifeInsurance: 'ביטוח חיים', isFamilyCompanyMember: 'חברה משפחתית',
  isForeignControllingShareholder: 'שליטה בחברה זרה', isKibbutzMember: 'חבר קיבוץ',
  isSubstantialShareholder: 'בעל מניות מהותי', spouseWorking: 'תעסוקת בן/בת הזוג',
  children: 'רשימת ילדים', employers: 'רשימת מעבידים', pensionFunds: 'קופות פנסיה',
  hasPension: 'פנסיה', investmentAccounts: 'חשבונות השקעה', hasInvestments: 'השקעות',
  bankAccounts: 'חשבונות בנק', taxFiles: 'תיקי רשויות', rentalTaxTrack: 'מסלול מיסוי שכירות',
  hasResidentialProperty: 'נכס דיור', numberOfProperties: 'מספר נכסים',
  hasCapitalIncome: 'פעילות בשוק ההון', hasGamblingIncome: 'הכנסות מהגרלות',
  hasForeignAssets: 'נכסים בחו״ל',
  vatFrequency: 'תדירות דיווח מע״מ', pitAdvancePercent: 'שיעור מקדמות מס הכנסה',
  pitAdvanceFrequency: 'תדירות מקדמות מס הכנסה', bookStatus: 'ניהול ספרים',
  withholdingRate: 'שיעור ניכוי במקור', hasExemptFromWithholding: 'פטור מניכוי במקור',
  niAdvanceMonthly: 'מקדמה חודשית בביטוח לאומי', taxOfficeName: 'פקיד שומה',
  niBalance: 'יתרה בביטוח לאומי', niOccupations: 'עיסוקים בביטוח לאומי',
  niDebitAuthorization: 'הרשאת חיוב - ביטוח לאומי',
  vatBalance: 'יתרה במע״מ', vatDebitAuthorization: 'הרשאת חיוב - מע״מ',
  vatFileType: 'סוג תיק מע״מ', vatOpeningDate: 'תאריך פתיחת תיק מע״מ',
  vatPrimaryIndustry: 'ענף עיקרי (מע״מ)', vatLastReportPeriod: 'דוח מע״מ אחרון שהוגש',
  incomeTaxBalance: 'יתרה במס הכנסה', incomeTaxFileType: 'סוג תיק מס הכנסה',
  incomeTaxUnit: 'חוליה', incomeTaxEconomicIndustry: 'ענף כלכלי',
  incomeTaxDebitAuthorization: 'הרשאת חיוב - מס הכנסה', withholdingDetail: 'פירוט ניכוי במקור',
  capitalDeclarationRequired: 'דרישת הצהרת הון פתוחה', capitalDeclarationDeadline: 'מועד להגשת הצהרת הון',
  niIncomeBasisMonthly: 'בסיס הכנסה למקדמות - ביטוח לאומי', incomeTaxReportingStatus: 'מצב דיווחים',
  withholdingStatus: 'מצב ניכוי במקור',
};

/** השוואה עמוקה מספיק לשדות מנוהלים — כולל מערכים/אובייקטים (ילדים, מעבידים וכו'). */
export function governedValuesEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null && b == null) return true;
  try { return JSON.stringify(a ?? null) === JSON.stringify(b ?? null); } catch { return false; }
}
