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

export const EDIT_SECTIONS: EditSection[] = [
  // ═══ 1 · זהות ומצב מול הרשויות ═══
  {
    id: 'identity', family: 'auth', title: 'פרטי נישום',
    summary: c => join(c.idNumber && `ת.ז. ${c.idNumber}`, c.city),
    fields: [
      { key: 'idNumber', label: 'תעודת זהות', kind: 'text' },
      { key: 'birthDate', label: 'תאריך לידה', kind: 'text' },
      { key: 'phone', label: 'טלפון', kind: 'text' },
      { key: 'email', label: 'אימייל', kind: 'text' },
      { key: 'city', label: 'יישוב', kind: 'text' },
      { key: 'address', label: 'כתובת', kind: 'text' },
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
      { key: 'spouseName', label: 'שם בן/בת הזוג', kind: 'text' },
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

/** ערך לתצוגה בשדה. ‼ undefined ⇒ ריק, ולא 0 — «לא ידוע» אינו אפס. */
export function editFieldValue(client: Client, f: EditField): string {
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
