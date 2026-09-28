// ─── טופס 6101 — נתוני ההגשה ותרחישיה ──────────────────────────────────────
// מה שנכתב על הטופס הוא «מה שמוגש בהגשה הזו» — לא המצב המאושר בביטוח לאומי
// ולא הכרטיס. שלושתם נשמרים בנפרד: הכרטיס (clients), המצב שנקרא מב"ל
// (niOccupations/niIncomeBasisMonthly עם field_meta), וההגשה (smart_form_*).
// ‼ טיוטת טופס לעולם אינה כותבת את המצב המאושר.

export type Btl6101Purpose =
  /** דין וחשבון רב שנתי: עיסוקים והכנסות בשנתיים האחרונות (סעיף 3). */
  | 'multi_year_report'
  /** פתיחת עיסוק עצמאי (סעיף 4 — התחלתי). */
  | 'start'
  /** שינוי בהיקף השעות/ההכנסה בשנה הנוכחית (סעיף 4 — שינוי). */
  | 'change'
  /** סגירת עיסוק עצמאי (סעיף 4 — חדלתי). */
  | 'end'
  /** הפסקת העסקת עובדים בתיק ניכויים (סעיף 4). */
  | 'stop_employees'
  /** בן/בת זוג עובד/ת בעסק (סעיף 4 + חתימת בן/בת הזוג). */
  | 'spouse_in_business'
  /** עדכון פרטים אישיים/כתובת/בנק בלבד. */
  | 'update_details';

export const BTL6101_PURPOSE_LABELS: Record<Btl6101Purpose, string> = {
  multi_year_report: 'דיווח עיסוקים בשנתיים האחרונות',
  start: 'התחלת עבודה כעצמאי',
  change: 'שינוי בהיקף השעות או ההכנסה',
  end: 'הפסקת עבודה כעצמאי',
  stop_employees: 'הפסקת העסקת עובדים',
  spouse_in_business: 'בן/בת זוג עובד/ת בעסק',
  update_details: 'עדכון פרטים אישיים',
};

export const BTL6101_PURPOSE_HINTS: Record<Btl6101Purpose, string> = {
  multi_year_report: 'סעיף 3 — מה עשה/תה בכל תקופה, מתאריך עד תאריך',
  start: 'סעיף 4 — תאריך התחלה, שעות, הכנסה חודשית ממוצעת, משלח יד',
  change: 'סעיף 4 — שעות והכנסה לפני ואחרי, עם תאריכים (שנה נוכחית בלבד)',
  end: 'סעיף 4 — תאריך הפסקה ועיסוק נוכחי',
  stop_employees: 'סעיף 4 — מספר תיק הניכויים ותאריך',
  spouse_in_business: 'סעיף 4 — מתאריך, חלק בעסק, שעות, וחתימה נפרדת של בן/בת הזוג',
  update_details: 'סעיפים 1–2 בלבד',
};

export type MaritalStatus6101 = '' | 'single' | 'married' | 'common_law' | 'divorced' | 'widowed';
export type HoursBand = '' | '1_11' | '12_19' | '20_plus';

export interface OccupationRow6101 {
  /** YYYY-MM-DD */
  from: string;
  /** YYYY-MM-DD, ריק = נמשך (לעולם לא «היום» שהוסק) */
  to: string;
  occupation: string;
  /** הכנסה שלא מעבודה — סכום כפי שהוצהר (טקסט, בלי המרה). */
  nonWorkIncome: string;
  /**
   * ‼ לטופס אין יחידה לעמודה «הכנסה ב-₪». לכן הסכום לא נכתב בלי פרשנות מפורשת —
   * לחודש או לכל התקופה — והיא נכתבת בתא לצד הסכום. אין המרה ואין ניחוש.
   */
  nonWorkIncomeBasis?: '' | 'monthly' | 'period_total';
  nonWorkSource: string;
}

/**
 * כל מה שנכתב על הטופס. מחרוזות ריקות = לא נכתב. ‼ ריק אינו אפס ואינו
 * «לא רלוונטי» — הסטטוס של כל שדה נשמר בנפרד (ResolvedField.status).
 * תאריכים נשמרים ISO (YYYY-MM-DD) ומוצגים בטופס dd/mm/yyyy.
 */
export interface Btl6101Data {
  lastName: string; firstName: string; idNumber: string;
  maritalStatus: MaritalStatus6101;
  maritalSinceMonth: string; maritalSinceYear: string;
  spouseLastName: string; spouseFirstName: string; spouseIdNumber: string;
  street: string; houseNumber: string; entrance: string; apartment: string; city: string; zip: string;
  landline: string; mobile: string; email: string;
  altContactLastName: string; altContactFirstName: string; altContactIdNumber: string;
  refuseDigital: boolean;
  mailRecipient: string; mailStreet: string; mailHouse: string; mailEntrance: string;
  mailApartment: string; mailCity: string; mailZip: string;

  bankName: string; bankBranchName: string; bankBranchNumber: string; bankAccount: string;

  occupations: OccupationRow6101[];

  startSelfEmployed: boolean; startDate: string;
  hoursBand: HoursBand; monthlyIncome: string; profession: string;

  changeHours: boolean;
  changeFromDate: string; hoursBefore: string; incomeBefore: string;
  changeToDate: string; hoursAfter: string; incomeAfter: string;

  spouseInBusiness: boolean; spouseFromDate: string; spouseSharePct: string; spouseWeeklyHours: string;

  endSelfEmployed: boolean; endDate: string; currentOccupation: string; currentOccupationFrom: string;

  stopEmployees: boolean; withholdingFile: string; stopEmployeesDate: string;

  bizStreet: string; bizHouse: string; bizApartment: string; bizCityZip: string; bizPhone: string;

  declarationDate: string;
}

export const EMPTY_6101: Btl6101Data = {
  lastName: '', firstName: '', idNumber: '',
  maritalStatus: '', maritalSinceMonth: '', maritalSinceYear: '',
  spouseLastName: '', spouseFirstName: '', spouseIdNumber: '',
  street: '', houseNumber: '', entrance: '', apartment: '', city: '', zip: '',
  landline: '', mobile: '', email: '',
  altContactLastName: '', altContactFirstName: '', altContactIdNumber: '',
  refuseDigital: false,
  mailRecipient: '', mailStreet: '', mailHouse: '', mailEntrance: '', mailApartment: '', mailCity: '', mailZip: '',
  bankName: '', bankBranchName: '', bankBranchNumber: '', bankAccount: '',
  occupations: [],
  startSelfEmployed: false, startDate: '', hoursBand: '', monthlyIncome: '', profession: '',
  changeHours: false, changeFromDate: '', hoursBefore: '', incomeBefore: '', changeToDate: '', hoursAfter: '', incomeAfter: '',
  spouseInBusiness: false, spouseFromDate: '', spouseSharePct: '', spouseWeeklyHours: '',
  endSelfEmployed: false, endDate: '', currentOccupation: '', currentOccupationFrom: '',
  stopEmployees: false, withholdingFile: '', stopEmployeesDate: '',
  bizStreet: '', bizHouse: '', bizApartment: '', bizCityZip: '', bizPhone: '',
  declarationDate: '',
};

/** אילו סעיפים רלוונטיים לאילו תרחישים — גילוי הדרגתי. */
export const SECTION_PURPOSES: Record<string, 'always' | Btl6101Purpose[]> = {
  identity: 'always',
  marital: 'always',
  spouse: 'always',          // מוצג רק כשיש בן/בת זוג (ראה spouseRelevant)
  address: 'always',
  contact: 'always',
  altContact: 'always',      // מוצג רק כשהטלפון/המייל אינם של המבוטח
  digital: 'always',
  mailing: 'always',         // מוצג רק כשיש מען נפרד
  bank: 'always',
  occupations: ['multi_year_report'],
  start: ['start'],
  change: ['change'],
  spouseBusiness: ['spouse_in_business'],
  end: ['end'],
  employees: ['stop_employees'],
  business: ['start', 'change', 'end', 'stop_employees', 'spouse_in_business'],
  declaration: 'always',
};

export function sectionApplies(section: string, purposes: readonly Btl6101Purpose[]): boolean {
  const rule = SECTION_PURPOSES[section];
  if (!rule || rule === 'always') return true;
  return rule.some(p => purposes.includes(p));
}

export const INCOME_BASIS_LABELS: Record<'monthly' | 'period_total', string> = {
  monthly: 'לחודש',
  period_total: 'לכל התקופה',
};

/** מפתחות שערכם תאריך ISO. */
export const DATE_KEYS = new Set<keyof Btl6101Data>([
  'startDate', 'changeFromDate', 'changeToDate', 'spouseFromDate', 'endDate', 'currentOccupationFrom',
  'stopEmployeesDate', 'declarationDate',
]);

/** מפתחות שערכם סכום בש"ח (שלם). */
export const MONEY_KEYS = new Set<keyof Btl6101Data>(['monthlyIncome', 'incomeBefore', 'incomeAfter']);
