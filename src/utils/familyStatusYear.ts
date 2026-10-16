// ─── מצב משפחתי לפי שנת המס ─────────────────────────────────────────────────
// ‼ הכרטיס שומר את המצב **היום** ואת שנת האירוע שקבע אותו (נישואין / גירושין / פטירה).
// כל חישוב לשנת מס שואל כאן «מה היה המצב ב-Y» — לא את familyStatus ישירות.
// כשהשנה חסרה והמצב היום לא מוכיח מה היה ב-Y — «לא ידוע» (לבדיקה), לא הנחה
// (docs/TAX-FILE-TEMPORAL-RELEVANCE-2026-10-13.md: אישור היום אינו הוכחה לשנה קודמת).
// שנת האירוע עצמה: נישואין — בחירה בין דוח משותף לנפרד בהצהרה (מדריך 1301 לשנת 2025);
// גירושין ופטירה — לא נמצא מקור לחלוקת השנה ⇒ פתוח (OPEN_ITEMS: family.eventYear).

import type { Client, FamilyStatus } from '../types';
import { FAMILY_STATUS_LABELS, FAMILY_STATUS_YEAR_LABELS } from '../types';

type FamilySource = Pick<Client, 'familyStatus' | 'marriageYear' | 'divorceYear' | 'widowhoodYear'>;
type YearKey = 'marriageYear' | 'divorceYear' | 'widowhoodYear';

/** איזה שדה בכרטיס שומר את שנת האירוע, לפי המצב. רווק/ה והורה יחיד — אין. */
export const FAMILY_STATUS_YEAR_KEY: Partial<Record<FamilyStatus, YearKey>> = {
  married: 'marriageYear',
  divorced: 'divorceYear',
  widowed: 'widowhoodYear',
};

const EVENT_NAME: Partial<Record<FamilyStatus, string>> = { married: 'הנישואין', divorced: 'הגירושין', widowed: 'הפטירה' };

/** כללי שנת האירוע — מה שיש לו מקור נאמר עם המקור; מה שאין — «פתוח». */
export const FAMILY_EVENT_YEAR_NOTES: Partial<Record<FamilyStatus, { text: string; open: boolean; ruleId?: string }>> = {
  married: {
    text: 'שנת הנישואין: בני הזוג רשאים לבחור אם להגיש לשנה הזו דוח משותף או דוחות נפרדים, ועליהם להצהיר על כך לפקיד השומה לפני ההגשה (טופס 5329 או האזור האישי) — בלי הצהרה הדוח לא ישודר (מדריך רשות המסים למילוי 1301 לשנת 2025, «בני זוג»). ההערכה חושבה כנשואים; ההשפעה של הגשה נפרדת על המס לא חושבה.',
    open: false, ruleId: 'spouse.marriageYearFiling',
  },
  divorced: {
    text: 'שנת הגירושין: איך מחלקים את השנה (נקודות שתלויות בבן/בת הזוג, חישוב משותף לחלק מהשנה) — לא נמצא מקור במרשם הכללים. חושב לפי המצב בסוף השנה — פתוח, לבדיקת המשרד.',
    open: true,
  },
  widowed: {
    text: 'שנת הפטירה: מה נכלל בדוח לשנה הזו (הכנסות בן/בת הזוג עד הפטירה) ואיזה מצב משפחתי חל עליה — לא נמצא מקור במרשם הכללים. חושב לפי המצב בסוף השנה — פתוח, לבדיקת המשרד.',
    open: true,
  },
};

/** אלמן/ה עם ילדים — «ילד להורה אחד» תלוי בכך שבן/בת הזוג שנפטר/ה הוא ההורה השני. הכרטיס לא יודע. */
export const WIDOWED_CHILDREN_NOTE = 'אלמן/ה עם ילדים: אם בן/בת הזוג שנפטר/ה הוא/היא ההורה השני של הילדים — «ילד להורה אחד» (שני טורי נקודות הילדים ועוד נקודה, שדה 022; «דע זכויותיך» 2025, עמ׳ 67). בכרטיס לא רשום מי ההורה השני — לא חושב; לבדיקה.';

/**
 * שנה תקינה לאירוע: מספר שלם, לא עתידית ולא לפני 1900. אחרת — כאילו לא נרשמה. ‼ «עתידית» — ביחס להיום האמיתי
 * או ל-`today`, המאוחר: הערכה ישנה שמחושבת מחדש רואה נישואין שנרשמו אחרי שהוכנה.
 */
function validYear(y: unknown, thisYear: number): number | undefined {
  return typeof y === 'number' && Number.isInteger(y) && y >= 1900 && y <= Math.max(thisYear, new Date().getFullYear()) ? y : undefined;
}

/** שנת האירוע הרשומה למצב הנוכחי (או undefined — לא נרשמה / אין שנה למצב הזה). */
export function familyStatusEventYear(c: FamilySource, today: Date = new Date()): number | undefined {
  const key = FAMILY_STATUS_YEAR_KEY[c.familyStatus];
  return key ? validYear(c[key], today.getFullYear()) : undefined;
}

/** «מ-2019» · «ממתי? טרם נרשם» · '' (רווק/ה, הורה יחיד — אין שנת אירוע). */
export function familyStatusSince(c: FamilySource, today: Date = new Date()): string {
  if (!FAMILY_STATUS_YEAR_KEY[c.familyStatus]) return '';
  const y = familyStatusEventYear(c, today);
  return y ? `מ-${y}` : 'ממתי? טרם נרשם';
}

/** «אלמן/ה · מ-2019» — בכל מקום שמציג מצב משפחתי. בלי ריק שקט: חסר ⇒ «ממתי? טרם נרשם». */
export function familyStatusDisplay(c: FamilySource, today: Date = new Date()): string {
  const label = FAMILY_STATUS_LABELS[c.familyStatus] ?? '';
  const since = familyStatusSince(c, today);
  return since ? `${label} · ${since}` : label;
}

/** «היום» של תוצר שמור — מועד ההכנה (YYYY-MM-DD), כדי שגרסה שמורה תחושב מחדש אותו דבר. בלי מועד — עכשיו. */
export function asOfDate(preparedOn?: string): Date {
  return preparedOn && /^\d{4}-\d{2}-\d{2}/.test(preparedOn) ? new Date(`${preparedOn.slice(0, 10)}T12:00:00`) : new Date();
}

/** בדיקת שנה שהוקלדה. undefined = תקין (או ריק — ריק מותר, ומוצג «טרם נרשם»). */
export function familyStatusYearProblem(year: number | undefined, opts: { birthYear?: number; today?: Date } = {}): string | undefined {
  if (year == null) return undefined;
  const thisYear = (opts.today ?? new Date()).getFullYear();
  if (!Number.isInteger(year)) return 'שנה בארבע ספרות';
  if (year > thisYear) return 'שנה עתידית';
  if (year < 1930) return 'שנה לא סבירה';
  if (opts.birthYear && year < opts.birthYear + 14) return `לפני גיל 14 (נולד/ה ב-${opts.birthYear}) — לבדוק`;
  return undefined;
}

/** known = נגזר משנה רשומה או ממצב שאינו משתנה לאחור · review = ידוע, עם הסתייגות גלויה · unknown = לא ידוע — לא מחשבים כאילו ידוע. */
export type FamilyCertainty = 'known' | 'review' | 'unknown';

export interface FamilyStatusInYear {
  taxYear: number;
  /** המצב בכרטיס היום. */
  current: FamilyStatus;
  /** המצב בשנת המס. null = לא ידוע (לפני הנישואין — רווק/ה, גרוש/ה או אלמן/ה? או שנה חסרה). */
  status: FamilyStatus | null;
  /** נשוי/אה בשנת המס. null = לא ידוע. */
  married: boolean | null;
  /** שנת האירוע הרשומה למצב הנוכחי. */
  eventYear?: number;
  /** שנת המס היא שנת האירוע עצמה (נישואין / גירושין / פטירה). */
  isEventYear: boolean;
  certainty: FamilyCertainty;
  /** «נשוי/אה» / «לא נשוי/אה» / «לא ידוע». */
  label: string;
  /** מאיפה: «לפי שנת הנישואין 2019». */
  basis: string;
  /** השורה ל«מה בדקנו»: «מצב משפחתי בשנת המס 2025: נשוי/אה (לפי שנת הנישואין 2019)». */
  line: string;
  /** מה חסר או מה לבדוק — כש-certainty אינו known. */
  review?: string;
  /** כללי שנת האירוע (עם מקור, או «פתוח»). */
  eventNote?: string;
  /** שנת האירוע בלי מקור לכללים — פתוח. */
  eventOpen?: boolean;
}

/**
 * מה היה המצב המשפחתי בשנת המס. ‼ הפונקציה היחידה שמחשבים לפיה — נקודות זיכוי, הערכת מס,
 * דוח שנתי, המחשבון. `today` — לבדיקות; ברירת המחדל היא היום.
 */
export function familyStatusForYear(c: FamilySource, taxYear: number, today: Date = new Date()): FamilyStatusInYear {
  const current = c.familyStatus as FamilyStatus;
  const thisYear = today.getFullYear();
  // ‼ בלי מצב בכרטיס (ב-staging: 29 מ-82 ב-16.10) — לא «רווק/ה». החישוב נשאר כמו קודם (בלי בן/בת זוג), עם «לבדיקה»
  if (!current) {
    return { taxYear, current, status: null, married: null, isEventYear: false, certainty: 'unknown', label: 'לא ידוע', basis: 'מצב משפחתי לא נרשם בכרטיס',
      review: 'מצב משפחתי לא נרשם בכרטיס — לרשום אותו (ואת שנת האירוע, אם יש)', line: `מצב משפחתי בשנת המס ${taxYear}: לא ידוע (לא נרשם בכרטיס)` };
  }
  const curLabel = FAMILY_STATUS_LABELS[current] ?? current;
  const yearLabel = FAMILY_STATUS_YEAR_LABELS[current];
  const ev = familyStatusEventYear({ ...c, familyStatus: current }, today);
  const make = (p: Omit<FamilyStatusInYear, 'taxYear' | 'current' | 'line' | 'isEventYear' | 'eventYear'> & { isEventYear?: boolean }): FamilyStatusInYear => ({
    taxYear, current, eventYear: ev, isEventYear: false, ...p,
    line: `מצב משפחתי בשנת המס ${taxYear}: ${p.label} (${p.basis})`,
  });

  // רווק/ה — לא נישא/ה מעולם, ולכן גם בכל שנה קודמת
  if (current === 'single') return make({ status: 'single', married: false, certainty: 'known', label: curLabel, basis: 'רווק/ה היום — גם בשנים קודמות' });

  // הורה יחיד — אין בכרטיס שנת אירוע. לשנה קודמת: אותו מצב, עם הסתייגות גלויה (אין שדה שאפשר להשלים)
  if (current === 'singleParent') {
    if (taxYear >= thisYear) return make({ status: current, married: false, certainty: 'known', label: curLabel, basis: 'לפי המצב היום' });
    return make({ status: current, married: false, certainty: 'review', label: curLabel, basis: 'לפי המצב היום',
      review: `הורה יחיד — בכרטיס אין ממתי; לאשר שזה היה המצב ב-${taxYear}` });
  }

  const evName = EVENT_NAME[current]!;
  const note = FAMILY_EVENT_YEAR_NOTES[current];

  if (ev == null) {
    // השנה לא נרשמה. לשנה הנוכחית (או אחריה) — המצב היום; לשנה שעברה — לא ידוע
    if (taxYear >= thisYear) {
      return make({ status: current, married: current === 'married', certainty: 'review', label: curLabel,
        basis: 'לפי המצב היום',
        review: `${yearLabel} לא נרשמה. אם האירוע (${evName}) היה ב-${taxYear}, חלים כללי שנת האירוע — לרשום בכרטיס` });
    }
    return make({ status: null, married: null, certainty: 'unknown', label: 'לא ידוע',
      basis: `היום ${curLabel}, ו${yearLabel} לא נרשמה`,
      review: `${curLabel} היום, אבל ${yearLabel} לא נרשמה — לא ידוע מה היה המצב ב-${taxYear}. לרשום בכרטיס את ${yearLabel}` });
  }

  const byYear = `לפי ${yearLabel} ${ev}`;
  if (taxYear > ev) return make({ status: current, married: current === 'married', certainty: 'known', label: curLabel, basis: byYear });
  if (taxYear === ev) {
    return make({ status: current, married: current === 'married', certainty: 'review', label: curLabel, basis: `${byYear} — שנת האירוע`,
      isEventYear: true, review: note?.text, eventNote: note?.text, eventOpen: note?.open });
  }

  // שנת המס לפני האירוע
  if (current === 'married') {
    return make({ status: null, married: false, certainty: 'review', label: 'לא נשוי/אה', basis: `לפני ${evName} (${ev})`,
      review: `לפני ${evName} (${ev}) — לא נשוי/אה; המצב הקודם (רווק/ה, גרוש/ה או אלמן/ה) לא רשום בכרטיס` });
  }
  const m = validYear(c.marriageYear, thisYear);
  if (m != null && m <= taxYear) {
    return make({ status: 'married', married: true, certainty: 'known', label: FAMILY_STATUS_LABELS.married,
      basis: `לפני ${evName} (${ev}), ואחרי שנת הנישואין ${m}` });
  }
  return make({ status: null, married: null, certainty: 'unknown', label: 'לא ידוע', basis: `לפני ${evName} (${ev})`,
    review: `לפני ${evName} (${ev}) — כנראה נשוי/אה, אבל שנת הנישואין לא רשומה. לאשר את המצב ב-${taxYear}` });
}

/**
 * המצב שהחישוב רץ לפיו: הידוע לשנה; «לא נשוי/אה» בלי מצב קודם ⇒ כמו רווק/ה (בלי בן/בת זוג);
 * לא ידוע ⇒ המצב היום — ‼ והקורא חייב להציג «לבדיקה» (familyStatusForYear(...).certainty).
 */
export function familyStatusForCalc(r: FamilyStatusInYear): FamilyStatus {
  return r.status ?? (r.married === false ? 'single' : r.current);
}

/** הלקוח כפי שהיה בשנת המס — familyStatus בלבד מוחלף. אותו אובייקט כשאין שינוי. */
export function clientForTaxYear<T extends FamilySource>(c: T, taxYear: number, today: Date = new Date()): T {
  if (!c) return c;
  const s = familyStatusForCalc(familyStatusForYear(c, taxYear, today));
  return s === c.familyStatus ? c : { ...c, familyStatus: s };
}
