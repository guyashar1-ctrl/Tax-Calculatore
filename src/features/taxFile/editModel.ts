// ─── תיק מס · מודל העריכה — שש משפחות לפי משמעות מס ──────────────────────
// מקור UX מחייב: docs/prototypes/tax-file-edit-v1.html
// ניתוח המיפוי: docs/PLAN-TAX-FILE-EDIT.md
//
// ‼ למה קובץ נפרד ולא JSX: הארגון לפי משמעות-מס הוא **החלטת מוצר**, לא פרט
// עיצוב. כשהוא יושב בטבלה אחת אפשר לקרוא אותו, לבקר אותו ולשנות סדר בלי
// לגעת ברינדור — ואפשר גם לבדוק אותו (איזה שדה משפיע על נקודות זיכוי?
// מה מגיע מהרשויות?) בלי לפרש קומפוננטה בת אלף שורות.
//
// ‼ שלוש תכונות שקובעות התנהגות ולא רק תצוגה:
//   · governed — נכתב דרך record_manual_fact_change, כלומר מקבל field_meta
//     ופרובננס 'manual'. שדה שאינו governed נשמר בשמירה הרגילה.
//   · credit   — משנה נקודות זיכוי; מסומן ★ במסך.
//   · authority— מקורו יישור קו. עריכה ידנית שם היא דריסה מוצהרת.

import type { Client } from '../../types';
import { FAMILY_STATUS_LABELS } from '../../types';
import { isValidIsraeliId } from '../../utils/israeliId';
import { isValidEmail } from '../../utils/email';
import { hasNonHebrewLetters, HEBREW_ONLY_HINT } from '../../utils/hebrewText';
import { engagementFromDb } from '../../lib/dbMappers';
import { currentEngagement } from '../../utils/engagementSelectors';
import { kindHoldPending, type KindHold } from '../../types/onboarding';
import { retryKindHoldErrorText as kindHoldRetryErrorText } from '../flows/api';

export type FamilyKey = 'auth' | 'income' | 'family' | 'assets' | 'deductions' | 'foreign';

export interface TaxFamily {
  key: FamilyKey;
  /** הכותרת במסך — זהה בקריאה ובעריכה, כדי שהמעבר יורגש כאותו מקום. */
  title: string;
  /** משפט אחד: למה השדות האלה יושבים יחד. זה מה שהופך את הקיבוץ למובן. */
  why: string;
  /** משתנה ה-CSS של גוון המשפחה. הגוון הוא סימן ניווט בלבד, לא סטטוס. */
  tone: string;
}

export const TAX_FAMILIES: TaxFamily[] = [
  { key: 'auth',       title: 'זהות ומצב מול הרשויות', why: 'עובדות תפעוליות — תיקים, מקדמות, יתרות ואישורים', tone: 'auth' },
  { key: 'income',     title: 'הכנסות',                 why: 'מה נכנס — עסק, שכר, שכירות והון',                  tone: 'inc' },
  { key: 'family',     title: 'משפחה, זכאות ונקודות זיכוי', why: 'עובדות שמשנות נקודות זיכוי',                 tone: 'fam' },
  { key: 'assets',     title: 'נכסים, השקעות והון',     why: 'נדל״ן, תיקי השקעות, קריפטו וחשבונות',             tone: 'ast' },
  { key: 'deductions', title: 'הפקדות, ביטוחים וניכויים', why: 'מה שמקטין את המס',                              tone: 'ded' },
  { key: 'foreign',    title: 'חו״ל ומצבים מיוחדים',    why: 'נכסי חוץ, מס זר ומבנים מיוחדים',                   tone: 'for' },
];

export const FAMILY_BY_KEY: Record<FamilyKey, TaxFamily> =
  Object.fromEntries(TAX_FAMILIES.map(f => [f.key, f])) as Record<FamilyKey, TaxFamily>;

/** איזו משפחה שייכת לאיזו שורת-קריאה בתיק — כך «עריכה» נוחתת במקום הנכון. */
export const ROW_TO_FAMILY: Record<string, FamilyKey> = {
  // מול הרשויות
  income_tax: 'auth', vat: 'auth', national_insurance: 'auth', deductions: 'auth',
  // הכנסות
  biz: 'income', sal: 'income', rent: 'income', cap: 'income',
  // משפחה
  family: 'family', credits: 'family', 'dom-reserve': 'family',
  // נכסים
  prop: 'assets', crypto: 'assets', bank: 'assets',
  'dom-capital': 'assets', 'dom-crypto': 'assets', 'dom-realestate': 'assets',
  // ניכויים
  pen: 'deductions', ins: 'deductions', don: 'deductions',
  'dom-pension': 'deductions', 'dom-donations': 'deductions', 'dom-insurance': 'deductions',
  // חו"ל
  abroad: 'foreign', 'dom-foreign': 'foreign', 'dom-rental': 'income',
};

// ‼ 'date' הוא שדה תאריך אמיתי (‎<input type="date">‎) ולא טקסט חופשי:
// תאריך פתיחת תיק מע״מ נקרא מהפורטל ומוקלד, והקלדה חופשית של תאריך היא
// הזמנה לפורמט שגוי. הערך נשמר כמחרוזת, כמו שהוא נשמר היום.
export type FieldKind = 'text' | 'number' | 'money' | 'bool' | 'select' | 'date';

export interface EditField {
  /** מפתח על Client. חייב להיות ב-GOVERNED_FACT_KEYS אם governed=true. */
  key: keyof Client & string;
  label: string;
  kind: FieldKind;
  /** אפשרויות ל-select: [ערך, תווית]. */
  options?: [string, string][];
  /** הערת עזר קצרה מתחת לשדה. */
  note?: string;
  /** משנה נקודות זיכוי — מסומן ★. */
  credit?: boolean;
  /** מקורו יישור קו; עריכה ידנית היא דריסה. */
  authority?: boolean;
  /** נשמר דרך מסלול העובדות (field_meta + פרובננס). */
  governed?: boolean;
  /** עברית בלבד — יישוב וכתובת נוסעים כמות שהם לטפסי הרשויות. */
  hebrew?: boolean;
}

export interface EditSection {
  id: string;
  family: FamilyKey;
  title: string;
  /** מוצג כשהמקטע סגור. מקבל את הלקוח כדי לומר משהו אמיתי. */
  summary: (c: Client) => string;
  fields: EditField[];
  /** הערה בתחתית המקטע — כאן נאמרים גבולות בעלות (פייפרלס, יישור קו). */
  note?: string;
  /** למקטע יש רשימה שמנוהלת במקום אחר (נכסים, מעסיקים) — קישור במקום שדות. */
  listHint?: string;
}

const money = (n?: number) => (n ? `₪${Math.round(n).toLocaleString('he-IL')}` : '');
const join = (...p: (string | number | false | null | undefined)[]) =>
  p.filter(Boolean).join(' · ');

/**
 * ‼ «טרם ביררנו» ולא «אין»: מקטע בלי נתון אינו מקטע ריק — הוא מקטע שלא
 * נשאל. ההבחנה הזו היא לב המודל, והיא נשמרת גם בסיכומי העריכה.
 */
const UNKNOWN = 'טרם ביררנו';

/** סוג העוסק כפי שנשמר ב-clients.dealer_type. 'other' מגיע רק מהליד. */
export type DealerKind = 'exempt' | 'licensed' | 'company';

export const DEALER_KIND_LABELS: Record<DealerKind, string> = {
  exempt: 'עוסק פטור', licensed: 'עוסק מורשה', company: 'חברה',
};

const DEALER_KIND_OPTIONS: [string, string][] =
  (['exempt', 'licensed', 'company'] as DealerKind[]).map(k => [k, DEALER_KIND_LABELS[k]]);

export const EDIT_SECTIONS: EditSection[] = [
  // ═══ 1 · זהות ומצב מול הרשויות ═══
  {
    id: 'identity', family: 'auth', title: 'פרטי נישום',
    summary: c => join(c.idNumber && `ת.ז. ${c.idNumber}`, c.city),
    fields: [
      { key: 'idNumber', label: 'תעודת זהות', kind: 'text' },
      { key: 'birthDate', label: 'תאריך לידה', kind: 'date' },
      { key: 'phone', label: 'טלפון', kind: 'text' },
      { key: 'email', label: 'אימייל', kind: 'text' },
      { key: 'city', label: 'יישוב', kind: 'text', hebrew: true },
      { key: 'address', label: 'כתובת', kind: 'text', hebrew: true },
      // 206 · כתובת ותקשורת כפי שטופסי הרשויות מבקשים אותן (6101 ואחרים).
      { key: 'zipCode', label: 'מיקוד', kind: 'text' },
      { key: 'landlinePhone', label: 'טלפון קווי', kind: 'text' },
      // ‼ סוג העוסק — העמודה היחידה שיכולה לומר «חברה», והראשונה שהשרת קורא
      // (resolve_client_kind). כשהוא לא ידוע, בקשות שתלויות בו מוחזקות עד
      // שקובעים אותו כאן (217, kind_hold). אין ברירת מחדל: ריק = «טרם ביררנו».
      { key: 'dealerType', label: 'סוג העוסק', kind: 'select',
        options: DEALER_KIND_OPTIONS },
    ],
  },
  {
    id: 'authIncomeTax', family: 'auth', title: 'מס הכנסה — תפעולי',
    summary: c => join(
      c.pitAdvancePercent != null && `מקדמות ${c.pitAdvancePercent}%`,
      c.incomeTaxBalance === 0 ? 'אין יתרה' : c.incomeTaxBalance ? `חוב ${money(c.incomeTaxBalance)}` : '',
    ) || UNKNOWN,
    fields: [
      // ‼ ארבעת אלה הוצגו בכרטיס «מול הרשויות» אך לא היה להם שדה עריכה בשום
      // מודל — ולכן לא היה אפשר לתקן אותם במסך שבו רואים אותם. סוג התיק,
      // החוליה והענף הם גם השדות שיש להם מקור מוכח בשע״ם (שאילתה 134).
      { key: 'incomeTaxFileType', label: 'סוג תיק', kind: 'text', authority: true, governed: true,
        note: 'הקוד כפי שמופיע בשע״ם, למשל 52.' },
      { key: 'taxOfficeName', label: 'פקיד שומה', kind: 'text', authority: true, governed: true },
      { key: 'incomeTaxUnit', label: 'חוליה', kind: 'text', authority: true, governed: true },
      { key: 'incomeTaxEconomicIndustry', label: 'ענף כלכלי', kind: 'text', authority: true, governed: true },
      { key: 'incomeTaxReportingStatus', label: 'מצב דיווחים', kind: 'text', authority: true, governed: true },
      { key: 'withholdingDetail', label: 'פירוט ניכוי', kind: 'text', authority: true, governed: true,
        note: 'כפי שמופיע באישור, למשל «0% שירותים, 30% קבלנות».' },
      { key: 'incomeTaxDebitAuthorization', label: 'הרשאה לחיוב', kind: 'bool', authority: true, governed: true },
      { key: 'pitAdvancePercent', label: 'שיעור מקדמות', kind: 'number', authority: true, governed: true },
      { key: 'pitAdvanceFrequency', label: 'תדירות מקדמות', kind: 'select', authority: true, governed: true,
        options: [['monthly', 'חודשי'], ['bi_monthly', 'דו-חודשי']] },
      { key: 'incomeTaxBalance', label: 'יתרה', kind: 'money', authority: true, governed: true,
        note: 'חיובי = חוב · שלילי = יתרת זכות' },
      { key: 'withholdingStatus', label: 'ניכוי מס במקור', kind: 'select', authority: true, governed: true,
        options: [['exempt', 'פטור מניכוי'], ['rates', 'שיעורים לפי פעילות'], ['none', 'אין אישור תקף']],
        note: 'הערך הקנוני. הצ׳קבוקס הישן ירד מהעריכה (153).' },
      { key: 'bookStatus', label: 'ניהול ספרים', kind: 'select', authority: true, governed: true,
        options: [['kosher', 'תקין'], ['rejected', 'נפסל'], ['unknown', 'לא ידוע']] },
      { key: 'capitalDeclarationRequired', label: 'דרישת הצהרת הון', kind: 'bool', authority: true, governed: true },
      { key: 'capitalDeclarationDeadline', label: 'מועד להגשה', kind: 'date', authority: true, governed: true,
        note: 'רלוונטי רק כשיש דרישה פתוחה.' },
    ],
    note: 'השדות האלה מגיעים מהרשויות. הדרך הנכונה לרענן אותם היא יישור קו — עריכה ידנית כאן נרשמת כדריסה.',
  },
  {
    id: 'authVat', family: 'auth', title: 'מע״מ — תפעולי',
    summary: c => join(c.vatFileType, c.vatLastReportPeriod && `דוח אחרון ${c.vatLastReportPeriod}`) || UNKNOWN,
    fields: [
      { key: 'vatStatus', label: 'סיווג', kind: 'select',
        options: [['authorizedDealer', 'עוסק מורשה'], ['exemptDealer', 'עוסק פטור'], ['none', 'אין']] },
      // ‼ האפשרויות זהות תו-בתו לאלה שבמסך יישור הקו, והערך הנשמר הוא
      // התווית עצמה — כך זה נשמר שם היום. שתי רשימות שונות לאותו שדה היו
      // יוצרות ערכים שלא מתאימים זה לזה בין שני המסכים.
      { key: 'vatFileType', label: 'סוג תיק', kind: 'select', authority: true, governed: true,
        options: [['עוסק מורשה', 'עוסק מורשה'], ['עוסק פטור', 'עוסק פטור'],
          ['חברה', 'חברה'], ['מלכ״ר', 'מלכ״ר'], ['אחר', 'אחר']] },
      { key: 'vatOpeningDate', label: 'תאריך פתיחה', kind: 'date', authority: true, governed: true },
      { key: 'vatPrimaryIndustry', label: 'ענף עיקרי', kind: 'text', authority: true, governed: true,
        note: 'טקסט חופשי — אין עדיין תשתית קודי ענף לחיפוש.' },
      { key: 'vatFrequency', label: 'תדירות דיווח', kind: 'select', authority: true, governed: true,
        options: [['monthly', 'חודשי'], ['bi_monthly', 'דו-חודשי']] },
      { key: 'vatLastReportPeriod', label: 'דוח אחרון שהוגש', kind: 'text', authority: true, governed: true },
      { key: 'vatBalance', label: 'יתרה', kind: 'money', authority: true, governed: true },
      { key: 'vatDebitAuthorization', label: 'הרשאה לחיוב', kind: 'bool', authority: true, governed: true },
    ],
    note: 'מקור: יישור קו מול הרשויות.',
  },
  {
    id: 'authNi', family: 'auth', title: 'ביטוח לאומי — תפעולי',
    summary: c => join(c.niAdvanceMonthly && `מקדמה ${money(c.niAdvanceMonthly)}`) || UNKNOWN,
    fields: [
      { key: 'niAdvanceMonthly', label: 'מקדמה חודשית', kind: 'money', authority: true, governed: true },
      { key: 'niIncomeBasisMonthly', label: 'בסיס הכנסה לחודש', kind: 'money', authority: true, governed: true },
      { key: 'niBalance', label: 'יתרה', kind: 'money', authority: true, governed: true },
      { key: 'niDebitAuthorization', label: 'הרשאה לחיוב', kind: 'bool', authority: true, governed: true },
    ],
    note: 'מקור: יישור קו מול הרשויות.',
  },
  {
    // ‼ עותק מקביל ל-authNi (154, docs/PLAN-BTL-PER-PERSON.md §F). קיים
    // כדי ש-EDIT_FIELD_BY_KEY יכיר את מפתחות בן/בת הזוג — התיק עצמו עורך
    // אותם דרך בלוק האדם השני בכרטיס ב"ל, לא דרך המקטע הזה ישירות.
    id: 'authNiSpouse', family: 'auth', title: 'ביטוח לאומי — תפעולי (בן/בת הזוג)',
    summary: c => join(c.spouseNiAdvanceMonthly && `מקדמה ${money(c.spouseNiAdvanceMonthly)}`) || UNKNOWN,
    fields: [
      { key: 'spouseNiAdvanceMonthly', label: 'מקדמה חודשית', kind: 'money', authority: true, governed: true },
      { key: 'spouseNiIncomeBasisMonthly', label: 'בסיס הכנסה לחודש', kind: 'money', authority: true, governed: true },
      { key: 'spouseNiBalance', label: 'יתרה', kind: 'money', authority: true, governed: true },
      { key: 'spouseNiDebitAuthorization', label: 'הרשאה לחיוב', kind: 'bool', authority: true, governed: true },
    ],
    note: 'מקור: יישור קו מול הרשויות.',
  },
  {
    id: 'authNikui', family: 'auth', title: 'ניכויים — תפעולי',
    summary: c => join(c.withholdingRate != null && `ניכוי ${c.withholdingRate}%`) || UNKNOWN,
    fields: [
      { key: 'withholdingRate', label: 'שיעור ניכוי', kind: 'number', authority: true, governed: true,
        note: 'באחוזים. השיעור הפשוט; פירוט מורכב נרשם בשדה «פירוט» שבסעיף מס הכנסה.' },
    ],
    // ‼ «תוקף האישור» (withholdingValidUntil) אינו כאן, ובכוונה: הוא אינו
    // ב-GOVERNED_FACT_KEYS ולכן אין לו מסלול כתיבה מנוהל. הוספתו לרשימה
    // דורשת גם את allowlist השרת — הכרעת מוצר/נתונים, לא שינוי מסך.
    note: 'מקור: יישור קו מול הרשויות.',
  },

  // ═══ 2 · הכנסות ═══
  {
    id: 'business', family: 'income', title: 'עסק',
    summary: c => join(
      (c.businesses ?? [])[0]?.name || c.businessDescription,
      c.businessDataStatus === 'received' ? 'נתוני הנהלה התקבלו' : c.businessDataStatus === 'waiting' ? 'ממתין להנהלה' : '',
    ) || UNKNOWN,
    fields: [
      { key: 'businessDescription', label: 'תיאור העיסוק', kind: 'text', governed: true },
      { key: 'businessDataStatus', label: 'נתוני הנהלת חשבונות', kind: 'select', governed: true,
        options: [['received', 'התקבלו'], ['waiting', 'ממתינים'], ['not_applicable', 'לא רלוונטי']] },
    ],
    note: 'מחזור, הוצאות מוכרות ורווח — בפייפרלס, ולא כאן. כאן רק הסימון שהנתונים בידינו.',
  },
  {
    id: 'salary', family: 'income', title: 'שכר',
    summary: c => (c.employers ?? []).map(e => e.name).filter(Boolean).join(', ') || UNKNOWN,
    fields: [],
    listHint: 'מעסיקים מנוהלים כרשימה בפרטי הלקוח המלאים.',
  },
  {
    id: 'rental', family: 'income', title: 'שכירות',
    summary: c => join(c.rentalIncomeAnnual && `${money(c.rentalIncomeAnnual)} לשנה`,
      c.rentalTaxTrack === 'flat10' ? 'מסלול 10%' : c.rentalTaxTrack === 'exempt' ? 'פטור' : c.rentalTaxTrack === 'regular' ? 'מסלול רגיל' : '') || UNKNOWN,
    fields: [
      { key: 'hasRentalIncome', label: 'יש הכנסות שכירות', kind: 'bool', governed: true },
      { key: 'rentalIncomeAnnual', label: 'הכנסה שנתית', kind: 'money', governed: true },
      { key: 'rentalTaxTrack', label: 'מסלול מיסוי', kind: 'select', governed: true,
        options: [['exempt', 'פטור'], ['flat10', '10% על המחזור'], ['regular', 'מסלול רגיל']] },
      { key: 'rentalExpenses', label: 'הוצאות על הנכס', kind: 'money', governed: true,
        note: 'רלוונטי רק במסלול הרגיל' },
    ],
  },
  {
    id: 'capital', family: 'income', title: 'שוק ההון והכנסות אחרות',
    summary: c => join(
      c.capitalGainsAnnual && `רווח הון ${money(c.capitalGainsAnnual)}`,
      c.dividendInterestAnnual && `דיבידנד ${money(c.dividendInterestAnnual)}`,
      c.otherIncome && `אחר ${money(c.otherIncome)}`,
    ) || UNKNOWN,
    fields: [
      { key: 'hasInvestments', label: 'יש פעילות בשוק ההון', kind: 'bool', governed: true,
        note: 'עוגן הידיעה. הסכומים נכנסים לחישוב בלי תלות בו (153).' },
      { key: 'capitalGainsAnnual', label: 'רווחי הון שנתיים', kind: 'money', governed: true },
      { key: 'dividendInterestAnnual', label: 'דיבידנד וריבית', kind: 'money', governed: true },
      { key: 'otherIncome', label: 'הכנסה אחרת', kind: 'money', governed: true,
        note: 'שאינה עסק, שכר, שכירות או הון' },
      { key: 'gamblingIncomeAnnual', label: 'זכיות והגרלות', kind: 'money', governed: true },
    ],
  },

  // ═══ 3 · משפחה, זכאות ונקודות זיכוי ═══
  {
    id: 'famStatus', family: 'family', title: 'מצב משפחתי ובן/בת זוג',
    summary: c => join(
      FAMILY_STATUS_LABELS[c.familyStatus],
      c.spouseName,
      c.spouseNoIncomeEligible === true && 'זכאות סעיף 37',
    ),
    fields: [
      { key: 'familyStatus', label: 'מצב משפחתי', kind: 'select', credit: true, governed: true,
        options: [['single', 'רווק/ה'], ['married', 'נשוי/אה'], ['divorced', 'גרוש/ה'],
                  ['widowed', 'אלמן/ה'], ['singleParent', 'הורה עצמאי']] },
      // ‼ שם פרטי ושם משפחה — המקור היחיד שנערך. «שם בן/בת הזוג» (spouseName) נכתב
      // כשרשור שלהם בשמירה (withSpouseFullName), כמו בקליטה (110) — כך השניים לא נפרדים.
      { key: 'spouseFirstName', label: 'שם פרטי של בן/בת הזוג', kind: 'text' },
      { key: 'spouseLastName', label: 'שם משפחה של בן/בת הזוג', kind: 'text' },
      { key: 'spouseWorking', label: 'בן/בת הזוג עובד/ת', kind: 'bool', governed: true },
      { key: 'spouseNoIncomeEligible', label: 'זכאות לנקודה — בן/בת זוג ללא הכנסה', kind: 'bool',
        credit: true, governed: true,
        note: 'סעיף 37 — רק לנשואים, וכשאחד מבני הזוג בגיל פרישה או עיוור/נכה' },
    ],
  },
  {
    id: 'children', family: 'family', title: 'ילדים',
    summary: c => (c.children ?? []).length
      ? `${c.children.length} · שנתונים ${c.children.map(x => x.birthYear).sort().join(', ')}`
      : 'אין',
    fields: [],
    listHint: 'הילדים מנוהלים כרשימה בפרטי הלקוח המלאים. כל שנתון משנה נקודות זיכוי.',
  },
  {
    id: 'service', family: 'family', title: 'שירות, מילואים ולימודים',
    summary: c => join(
      c.completedIdf ? `צה״ל ${c.idfReleaseYear || ''}`.trim() : c.completedNationalService ? 'שירות לאומי' : '',
      c.reserveCombatDaysPrevYear ? `${c.reserveCombatDaysPrevYear} ימי מילואים` : '',
      c.hasAcademicDegree ? 'תואר' : '',
    ) || UNKNOWN,
    fields: [
      { key: 'completedIdf', label: 'שירת/ה בצה״ל', kind: 'bool', credit: true, governed: true },
      { key: 'idfReleaseYear', label: 'שנת שחרור', kind: 'number', credit: true, governed: true },
      { key: 'completedNationalService', label: 'שירות לאומי', kind: 'bool', credit: true, governed: true },
      { key: 'nationalServiceYear', label: 'שנת סיום שירות לאומי', kind: 'number', credit: true, governed: true },
      { key: 'reserveCombatDaysPrevYear', label: 'ימי מילואים כלוחם/ת (שנה קודמת)', kind: 'number',
        credit: true, governed: true, note: 'סעיף 39ב — מזכה משנת המס 2026' },
      { key: 'hasAcademicDegree', label: 'תואר אקדמי', kind: 'bool', credit: true, governed: true },
      { key: 'academicDegreeType', label: 'סוג התואר', kind: 'select', credit: true, governed: true,
        options: [['bachelor', 'ראשון'], ['master', 'שני'], ['phd', 'שלישי']] },
      { key: 'academicDegreeYear', label: 'שנת סיום התואר', kind: 'number', credit: true, governed: true },
    ],
  },
  {
    id: 'residency', family: 'family', title: 'עלייה, תושבות ויישוב מזכה',
    summary: c => join(
      c.isNewImmigrant ? `עולה — ${c.aliyahYear || ''}`.trim() : c.isReturningResident ? 'תושב/ת חוזר/ת' : 'תושב/ת ותיק/ה',
      c.qualifyingSettlementId ? 'יישוב מזכה' : '',
    ),
    fields: [
      { key: 'isNewImmigrant', label: 'עולה חדש/ה', kind: 'bool', credit: true, governed: true },
      { key: 'aliyahYear', label: 'שנת עלייה', kind: 'number', credit: true, governed: true },
      { key: 'isReturningResident', label: 'תושב/ת חוזר/ת', kind: 'bool', credit: true, governed: true },
      { key: 'qualifyingSettlementId', label: 'יישוב מזכה', kind: 'text', credit: true, governed: true,
        note: 'מזהה היישוב מרשימת היישובים המזכים' },
    ],
  },
  {
    id: 'disability', family: 'family', title: 'נכות',
    summary: c => (c.disabilityPercentage ? `${c.disabilityPercentage}%` : 'אין'),
    fields: [
      { key: 'disabilityPercentage', label: 'אחוז נכות', kind: 'number', credit: true, governed: true,
        note: '90% ומעלה ⇒ מועמדות לפטור לפי סעיף 9(5)' },
    ],
  },

  // ═══ 4 · נכסים, השקעות והון ═══
  {
    id: 'realestate', family: 'assets', title: 'נדל״ן',
    summary: c => {
      const n = (c.properties ?? []).length;
      const rented = (c.properties ?? []).filter(p => p.isRented).length;
      if (!n) return c.hasResidentialProperty ? 'ידוע שקיים נכס' : UNKNOWN;
      return join(`${n} ${n === 1 ? 'נכס' : 'נכסים'}`, rented > 0 && `${rented} מושכר`);
    },
    fields: [
      { key: 'hasResidentialProperty', label: 'יש נכס מקרקעין', kind: 'bool', governed: true },
    ],
    listHint: 'הנכסים מנוהלים כרשימה בפרטי הלקוח המלאים. נכס מושכר מזין את שורת «שכירות» בהכנסות.',
  },
  {
    id: 'cryptoSec', family: 'assets', title: 'קריפטו',
    summary: c => (c.hasCrypto ? 'מוחזקים מטבעות דיגיטליים' : UNKNOWN),
    fields: [
      { key: 'hasCrypto', label: 'מחזיק/ה מטבעות דיגיטליים', kind: 'bool', governed: true },
    ],
    note: 'החזקה אינה אירוע מס — רק מכירה. המכירות מדווחות ברווחי ההון שבמשפחת «הכנסות».',
  },
  {
    id: 'shareholder', family: 'assets', title: 'בעלות ושליטה',
    summary: c => (c.isSubstantialShareholder ? 'בעל/ת מניות מהותי/ת' : 'אין'),
    fields: [
      { key: 'isSubstantialShareholder', label: 'בעל/ת מניות מהותי/ת (10%+)', kind: 'bool', governed: true,
        note: 'משפיע על שיעור המס על דיבידנד ורווחי הון (30% במקום 25%)' },
    ],
  },

  // ═══ 5 · הפקדות, ביטוחים וניכויים ═══
  {
    id: 'pension', family: 'deductions', title: 'פנסיה וקרן השתלמות',
    summary: c => join(
      c.hasPension ? (c.pensionFundName || 'קיימת פנסיה') : '',
      c.selfEmployedPensionAmount && `הפקדה כעצמאי ${money(c.selfEmployedPensionAmount)}`,
      c.krenHashtalmutSE && `השתלמות ${money(c.krenHashtalmutSE)}`,
    ) || UNKNOWN,
    fields: [
      { key: 'hasPension', label: 'יש פנסיה', kind: 'bool', governed: true },
      { key: 'selfEmployedPensionAmount', label: 'הפקדה שנתית לפנסיה כעצמאי', kind: 'money', governed: true,
        note: 'ניכוי אישי לפי סעיף 47' },
      { key: 'hasKrenHashtalmut', label: 'יש קרן השתלמות', kind: 'bool', governed: true },
      { key: 'krenHashtalmutSE', label: 'הפקדה שנתית לקרן השתלמות כעצמאי', kind: 'money', governed: true,
        note: 'הסכום השנתי הוא הערך הקנוני (153)' },
    ],
  },
  {
    id: 'insurance', family: 'deductions', title: 'ביטוחים',
    summary: c => join(
      c.hasLifeInsurance ? (c.lifeInsuranceAnnual ? `חיים ${money(c.lifeInsuranceAnnual)}` : 'ביטוח חיים') : '',
      c.hasDisabilityInsurance ? (c.disabilityInsuranceAnnual ? `אכ״ע ${money(c.disabilityInsuranceAnnual)}` : 'אכ״ע') : '',
    ) || UNKNOWN,
    fields: [
      { key: 'hasLifeInsurance', label: 'ביטוח חיים', kind: 'bool', governed: true },
      { key: 'lifeInsuranceAnnual', label: 'ביטוח חיים — שנתי', kind: 'money', governed: true },
      { key: 'hasDisabilityInsurance', label: 'אובדן כושר עבודה', kind: 'bool', governed: true },
      { key: 'disabilityInsuranceAnnual', label: 'אכ״ע — שנתי', kind: 'money', governed: true },
      { key: 'hasMedicalInsurance', label: 'ביטוח בריאות', kind: 'bool', governed: true },
      { key: 'medicalInsuranceAnnual', label: 'ביטוח בריאות — שנתי', kind: 'money', governed: true },
    ],
  },
  {
    id: 'donations', family: 'deductions', title: 'תרומות',
    summary: c => (c.donationsAnnual ? `${money(c.donationsAnnual)} · סעיף 46` : UNKNOWN),
    fields: [
      { key: 'donationsAnnual', label: 'תרומות מוכרות — שנתי', kind: 'money', governed: true,
        note: 'מינימום 207 ₪ · זיכוי 35%' },
    ],
  },

  // ═══ 6 · חו"ל ומצבים מיוחדים ═══
  {
    id: 'foreignAssets', family: 'foreign', title: 'נכסים והכנסות בחו״ל',
    summary: c => join(
      c.hasForeignAssets ? 'נכסים בחו״ל' : '',
      c.foreignIncomeAnnual && `הכנסה ${money(c.foreignIncomeAnnual)}`,
      c.foreignTaxPaid && `מס זר ${money(c.foreignTaxPaid)}`,
    ) || UNKNOWN,
    fields: [
      { key: 'hasForeignAssets', label: 'יש נכסים או חשבונות בחו״ל', kind: 'bool', governed: true },
      { key: 'hasForeignIncome', label: 'יש הכנסה מחו״ל', kind: 'bool', governed: true },
      { key: 'foreignIncomeAnnual', label: 'הכנסה שנתית מחו״ל', kind: 'money', governed: true },
      { key: 'foreignTaxPaid', label: 'מס זר — דריסה ידנית', kind: 'money', governed: true,
        note: 'בדרך כלל נגזר מחשבונות החוץ. מלא כאן רק כדי לדרוס את הסכימה (153).' },
    ],
    note: 'חשבונות החוץ עצמם מנוהלים כרשימה בפרטי הלקוח המלאים.',
  },
  {
    id: 'special', family: 'foreign', title: 'מבנים ומצבים מיוחדים',
    summary: c => join(
      c.isFamilyCompanyMember && 'חברה משפחתית',
      c.isKibbutzMember && 'קיבוץ',
      c.isForeignControllingShareholder && 'בעל שליטה בחברה זרה',
    ) || 'אין',
    fields: [
      { key: 'isFamilyCompanyMember', label: 'חבר/ה בחברה משפחתית', kind: 'bool', governed: true },
      { key: 'isKibbutzMember', label: 'חבר/ת קיבוץ או מושב שיתופי', kind: 'bool', governed: true },
      { key: 'isForeignControllingShareholder', label: 'בעל/ת שליטה בחבר-בני-אדם זר', kind: 'bool', governed: true },
      { key: 'hasGamblingIncome', label: 'הכנסות מהגרלות והימורים', kind: 'bool', governed: true },
    ],
  },
];

export const SECTIONS_BY_FAMILY = (f: FamilyKey) => EDIT_SECTIONS.filter(s => s.family === f);

/** כל השדות שמשנים נקודות זיכוי — משמש גם למסך וגם לבדיקה. */
export const CREDIT_FIELDS: string[] =
  EDIT_SECTIONS.flatMap(s => s.fields.filter(f => f.credit).map(f => f.key));

// ─── עזרי ערך משותפים ───────────────────────────────────────────────────────
// ‼ יושבים כאן, ליד הגדרות השדות, כדי שיהיה עותק אחד: גם מסך תיק המס
// (עריכה במקום) וגם העורך הישן משתמשים בהם. שכפול היה מאפשר לשני המסכים
// לפרש את אותו שדה אחרת.

/**
 * שם בן/בת הזוג לשני השדות. ‼ כרטיס שנוצר מהצעה / מליד / מהטופס המלא נושא רק את השם
 * המשורשר — אז המילה הראשונה היא השם הפרטי והשאר שם המשפחה (כמו המילוי של 110), כדי
 * שהעריכה תיפתח עם מה שכתוב בכרטיס ולא עם שדות ריקים שנראים כמו «אין שם».
 */
export function spouseNameParts(c: Pick<Client, 'spouseFirstName' | 'spouseLastName' | 'spouseName'>): { first: string; last: string } {
  const first = c.spouseFirstName?.trim() ?? '';
  const last = c.spouseLastName?.trim() ?? '';
  if (first || last) return { first, last };
  const words = (c.spouseName ?? '').trim().split(/\s+/).filter(Boolean);
  return { first: words[0] ?? '', last: words.slice(1).join(' ') };
}

/**
 * שמירה של «משפחה ובן/בת זוג»: שם פרטי או שם משפחה שהשתנו ⇒ שניהם נשמרים, ו«שם בן/בת
 * הזוג» = השרשור שלהם (110). כך שלושת השדות לא נפרדים — מה שהמסלולים, ביטוח לאומי והדף
 * האישי קוראים (השם הפרטי) ומה שהתיק מציג (השם המלא) הם אותו שם.
 */
export function withSpouseFullName(patch: Partial<Client>, drafts: Record<string, string>): Partial<Client> {
  if (!('spouseFirstName' in patch) && !('spouseLastName' in patch)) return patch;
  const first = (drafts.spouseFirstName ?? '').trim();
  const last = (drafts.spouseLastName ?? '').trim();
  return { ...patch, spouseFirstName: first, spouseLastName: last, spouseName: `${first} ${last}`.trim() };
}

/** ערך לתצוגה בשדה. ‼ undefined ⇒ ריק, ולא 0 — «לא ידוע» אינו אפס. */
export function editFieldValue(client: Client, f: EditField): string {
  if (f.key === 'spouseFirstName') return spouseNameParts(client).first;
  if (f.key === 'spouseLastName') return spouseNameParts(client).last;
  const raw = (client as unknown as Record<string, unknown>)[f.key];
  if (raw === undefined || raw === null) return '';
  if (typeof raw === 'boolean') return raw ? 'true' : 'false';
  // ‼ ‎<input type="date">‎ מקבל YYYY-MM-DD בלבד. ערך עם חותמת זמן היה
  // מוצג כשדה ריק, והרו"ח היה חושב שהתאריך נמחק.
  if (f.kind === 'date') return String(raw).slice(0, 10);
  return String(raw);
}

/** מחרוזת מהטופס ⇒ הערך שנשמר על Client, לפי סוג השדה. */
export function coerceEditField(f: EditField, v: string): unknown {
  if (f.kind === 'bool') return v === 'true';
  if (f.kind === 'number' || f.kind === 'money') {
    const n = Number(v.replace(/[^\d.-]/g, ''));
    // ‼ null ולא undefined. ‎JSON.stringify‎ משמיט מפתח שערכו undefined,
    // ולכן ניקוי שדה מספרי שלח patch **ריק**: ההיסטוריה נרשמה «7 ← —»
    // בזמן שהערך נשאר 7. שקר שקט בתיק, ונתפס בבדיקה בייצור.
    return v.trim() === '' || Number.isNaN(n) ? null : n;
  }
  // ‼ אותה סיבה, ובנוסף עמודת date במסד דוחה מחרוזת ריקה.
  if (f.kind === 'date') return v.trim() === '' ? null : v;
  return v;
}

/**
 * בדיקת ערך לפני שמירה של פרט נישום. ‼ ת.ז. שגויה כאן אינה טעות הקלדה
 * מקומית: היא נוסעת לייפוי הכוח ולבקשות הייצוג, והרשות דוחה אותה שם.
 * שדה שרוקן במכוון עובר — «טרם ביררנו» הוא מצב לגיטימי.
 * ‼ עבר לכאן מ-TaxFileTab כדי שייבדק: הלוכסנים ההפוכים בביטויים נשמטו שם
 * (‎/^d{5}…/‎), וכל מיקוד וכל טלפון קווי נדחו — השורה כולה לא נשמרה.
 */
export function identityFieldError(def: EditField, raw: string): string | null {
  const v = raw.trim();
  if (!v) return null;
  if (def.key === 'idNumber' && !isValidIsraeliId(v)) return 'מספר תעודת הזהות אינו תקין';
  if (def.key === 'email' && !isValidEmail(v)) return 'כתובת המייל אינה תקינה';
  if (def.key === 'zipCode' && !/^\d{5}(\d{2})?$/.test(v.replace(/\s/g, ''))) return 'מיקוד: 7 ספרות';
  if (def.key === 'landlinePhone' && !/^0\d{8,9}$/.test(v.replace(/\D/g, ''))) return 'מספר טלפון קווי לא תקין';
  if (def.key === 'dealerType' && !['exempt', 'licensed', 'company', 'other'].includes(v)) return 'בחר מהרשימה';
  if (def.hebrew && hasNonHebrewLetters(v)) return HEBREW_ONLY_HINT;
  return null;
}

/** תווית לתצוגה של ערך שנשמר — לשורת ההיסטוריה של שינוי עובדה. */
export function editFieldDisplay(f: EditField, v: string): string {
  if (v === '' || v == null) return '—';
  if (f.kind === 'bool') return v === 'true' ? 'כן' : 'לא';
  if (f.options) return f.options.find(([val]) => val === v)?.[1] ?? v;
  return v;
}

/**
 * כל שדות העריכה לפי מפתח. ‼ מקור אחד: גם מסך תיק המס (עריכה במקום) וגם
 * העורך הישן שואבים מכאן, כדי שאותו שדה לא ייערך לפי שתי הגדרות שונות.
 */
export const EDIT_FIELD_BY_KEY: Record<string, EditField> =
  Object.fromEntries(EDIT_SECTIONS.flatMap(s => s.fields).map(f => [f.key, f]));

// ─── סוג העוסק והבקשות שמחכות לו (217) ──────────────────────────────────────
// ‼ סוג עוסק חסר אינו «עוסק מורשה» בשקט: בקשות שתלויות בסוג מוחזקות על
// ההתקשרות (engagements.kind_hold) עד שהמשרד קובע אותו כאן. השחרור קורה
// בשרת, בטריגר על הכרטיס ובאותה שמירה — ולכן אחרי השמירה קוראים את
// ההתקשרות מחדש, וכל הודעה כאן נגזרת רק ממה שהשרת רשם עליה.

/**
 * הסוג כפי שהשרת קורא אותו מהכרטיס — אותו סדר כמו resolve_client_kind
 * (בלי תבנית ההצעה, שאינה על הכרטיס). null = לא ידוע, ולא «מורשה».
 */
export function cardDealerKind(c: Pick<Client, 'dealerType' | 'vatStatus'>): DealerKind | null {
  if (c.dealerType === 'company') return 'company';
  if (c.dealerType === 'licensed' || c.vatStatus === 'authorizedDealer') return 'licensed';
  if (c.dealerType === 'exempt' || c.vatStatus === 'exemptDealer') return 'exempt';
  return null;
}

/**
 * «סוג העוסק» לקריאה. ‼ מציג את מה שהשרת יקרא, לא רק את השדה: עוסק פטור
 * בשדה עם סיווג מע״מ «מורשה» נחשב מורשה, וזה נאמר במפורש. 'other' מהליד
 * אינו סוג — הוא מוצג כ«טרם נקבע» ולא כקוד.
 */
export function dealerTypeDisplay(c: Pick<Client, 'dealerType' | 'vatStatus'>): { text: string; unknown: boolean } {
  const kind = cardDealerKind(c);
  if (!kind) return { text: c.dealerType === 'other' ? 'אחר — טרם נקבע' : UNKNOWN, unknown: true };
  return {
    text: c.dealerType === kind ? DEALER_KIND_LABELS[kind] : `${DEALER_KIND_LABELS[kind]} (לפי סיווג מע״מ)`,
    unknown: false,
  };
}

/** תווית לסוג שהשרת רשם (resolvedKind) — בשני הכתיבים שבשימוש. */
export function dealerKindLabel(kind: string | null | undefined): string | null {
  switch (kind) {
    case 'exempt': case 'exempt_dealer': return DEALER_KIND_LABELS.exempt;
    case 'licensed': case 'licensed_dealer': return DEALER_KIND_LABELS.licensed;
    case 'company': return DEALER_KIND_LABELS.company;
    default: return null;
  }
}

// ‼ הטיפוס, הקריאה מהמסד ו«ממתינה» — מקור אחד ב-types/onboarding (גם המגש והסגירה
// קוראים משם); כאן רק מייצאים מחדש, כדי שהמסך והבדיקות ימשיכו לייבא מכאן.
export { parseKindHold, kindHoldPending } from '../../types/onboarding';
export type { KindHold, KindHoldItem } from '../../types/onboarding';

/**
 * ההחזקה שעל ההתקשרות הנוכחית, מתוך שורות engagements כפי שהגיעו מהמסד.
 * ‼ «נוכחית» לפי ההגדרה היחידה (engagementSelectors = current_engagement_id):
 * החזקה על התקשרות שהסתיימה אינה ממתינה לאיש — השרת סוגר אותה בלי ליצור.
 * engagementFromDb קורא את kind_hold (parseKindHold) — אין קריאה שנייה כאן.
 */
export function currentKindHold(rows: Record<string, unknown>[], clientId: string): KindHold | null {
  return currentEngagement(rows.map(r => engagementFromDb(r)), clientId)?.kindHold ?? null;
}

/** כמה בקשות מחכות — לפי הרשימה הכנה של מה שהיה נוצר (held). */
export function kindHoldCount(h: KindHold | null | undefined): number {
  return kindHoldPending(h) ? h.held.length : 0;
}

/** שמות הבקשות שמחכות, בלי כפילויות. ‼ פריט בלי שם לא מוצג כמפתח. */
export function kindHoldTitles(h: KindHold | null | undefined): string[] {
  if (!h) return [];
  return [...new Set(h.held.map(x => x.title.trim()).filter(Boolean))];
}

/** עד שלושה שמות, ואחריהם «ועוד N» — כדי שהמשפט יישאר משפט. */
export function titleList(titles: string[]): string {
  if (titles.length <= 3) return titles.join(', ');
  return `${titles.slice(0, 3).join(', ')} ועוד ${titles.length - 3}`;
}

/**
 * הסימון על שורת «פרטים אישיים» כשהיא סגורה. null = אין מה לומר.
 * ‼ כשבכרטיס כבר יש סוג והבקשות עדיין מחכות (השחרור נכשל), «חסר סוג העוסק»
 * היה שקר — אומרים שהבקשות עדיין מחכות.
 */
export function kindHoldRowException(h: KindHold | null | undefined, kindKnown = false): string | null {
  const n = kindHoldCount(h);
  if (n === 0) return null;
  if (kindKnown) return n === 1 ? 'בקשה אחת עדיין מחכה לסוג העוסק' : `${n} בקשות עדיין מחכות לסוג העוסק`;
  return n === 1 ? 'חסר סוג העוסק — בקשה אחת מחכה לו' : `חסר סוג העוסק — ${n} בקשות מחכות לו`;
}

/** ההסבר מתחת לשדה בזמן העריכה, כשיש בקשות שמחכות. */
export function kindHoldFieldHint(h: KindHold | null | undefined): string | null {
  const n = kindHoldCount(h);
  if (n === 0) return null;
  const t = titleList(kindHoldTitles(h));
  const paren = t ? ` (${t})` : '';
  return n === 1
    ? `עם השמירה תיפתח הבקשה שחיכתה לסוג העוסק${paren} — רק אם היא מתאימה לסוג שבחרת.`
    : `עם השמירה ייפתחו הבקשות שחיכו לסוג העוסק${paren} — רק אלה שמתאימות לסוג שבחרת.`;
}

export interface KindHoldNotice {
  tone: 'ok' | 'warn';
  text: string;
  /** תווית לכפתור «לפתוח שוב» — רק כשהבקשות עדיין מחכות. */
  retryLabel?: string;
}

/**
 * מה לומר אחרי שמירה (או אחרי «לפתוח את הבקשות שחיכו»).
 * ‼ נגזר רק ממה שהשרת רשם על ההתקשרות אחרי הפעולה:
 *   · before  — המצב לפני; בלי בקשות שחיכו אין מה לדווח (null).
 *   · after   — undefined = הקריאה נכשלה (אומרים שלא בדקנו), null = אין רישום.
 * בקשה «נפתחה» רק כשהיא ב-created; «לא מתאימה» רק כשהשרת רשם notApplicable.
 */
export function kindHoldOutcome(
  before: KindHold | null | undefined,
  after: KindHold | null | undefined,
  mode: 'save' | 'retry',
  chosenKind?: string | null,
): KindHoldNotice | null {
  const n = kindHoldCount(before);
  if (n === 0) return null;
  const saved = mode === 'save' ? 'נשמר. ' : '';
  if (after === undefined) {
    return {
      tone: 'warn',
      text: `${saved}לא הצלחנו לבדוק אם ${n === 1 ? 'הבקשה שחיכתה' : 'הבקשות שחיכו'} לסוג העוסק ${n === 1 ? 'נפתחה' : 'נפתחו'} — בדוק בלשונית «בקשות».`,
    };
  }
  if (after === null) return null;
  if (after.resolvedAt) {
    const created = after.created.length;
    if (created === 1) return { tone: 'ok', text: `${saved}נפתחה בקשה אחת שחיכתה לסוג העוסק — היא בלשונית «בקשות».` };
    if (created > 1) return { tone: 'ok', text: `${saved}נפתחו ${created} בקשות שחיכו לסוג העוסק — הן בלשונית «בקשות».` };
    if (after.notApplicable.length > 0) {
      const label = dealerKindLabel(after.resolvedKind) ?? dealerKindLabel(chosenKind);
      const to = label ? `ל${label}` : 'לסוג שבחרת';
      return {
        tone: 'ok',
        text: n === 1
          ? `${saved}הבקשה שחיכתה לסוג העוסק לא מתאימה ${to} — לא נפתח דבר.`
          : `${saved}אף אחת מהבקשות שחיכו לסוג העוסק לא מתאימה ${to} — לא נפתח דבר.`,
      };
    }
    return { tone: 'ok', text: `${saved}סוג העוסק נקבע — לא נפתחו בקשות חדשות.` };
  }
  const what = n === 1 ? 'הבקשה שחיכתה לסוג העוסק' : 'הבקשות שחיכו לסוג העוסק';
  const notOpened = n === 1 ? 'לא נפתחה' : 'לא נפתחו';
  return {
    tone: 'warn',
    text: mode === 'save' ? `נשמר, אבל ${what} ${notOpened}.` : `${what} עדיין ${notOpened}.`,
    retryLabel: n === 1 ? 'לפתוח את הבקשה שחיכתה' : 'לפתוח את הבקשות שחיכו',
  };
}

/**
 * שגיאה מ-retry_kind_hold — בעברית, בלי קודים. ‼ הטקסטים של הקודים במקום אחד
 * (RETRY_KIND_HOLD_ERROR_TEXT ב-features/flows/api, גם למגש); כאן רק kind_unknown
 * מנוסח למי שכבר עומד על השדה.
 */
export function retryKindHoldErrorText(error: string | null | undefined): string {
  if (error === 'kind_unknown') return 'סוג העוסק עדיין לא נקבע בכרטיס — בחר אותו ושמור.';
  return `${kindHoldRetryErrorText(error)}.`;
}
