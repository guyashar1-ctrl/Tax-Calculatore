// ─── דרישה להצהרת הון: מצב ומועדים (230) — מקור אחד לכל המסכים ───────────────
// ‼ שלושה מצבים: אין דרישה (הכנה) · «טרם אומתה» (מידע חלקי, לא חוסם איסוף) · «מאומתת»
// (מקושרת לאסמכתה — מסמך בתיק או רשומה שנקראה מהרשות — עם מי אישר ומתי).
// ‼ ארבעה מועדים שאינם מתערבבים:
//   · «מועד בדרישה» — נקרא מהאסמכתה; «רשמי» רק כשהדרישה מאומתת.
//   · «ארכה» — רשומה נפרדת (אישית לבקשת הנישום, או כללית שפורסמה); לא עורכים את המועד שבדרישה.
//   · «רצפה חוקית» — wealthMinDue: סעיף 135(1)(א) — פקיד השומה לא רשאי לקבוע מועד לפני תום 120 יום
//     מהמאוחר מבין יום הדרישה ויום ההצהרה. בקרה בלבד («המועד במכתב לא אמור להיות מוקדם ממנה»), לא
//     מועד הגשה. הבסיס: תאריך המכתב, לא תאריך הקבלה. מחקר: docs/tax-foundation/wealth/deadline-rule-2026-10-11.md
//   · «יעד פנימי» — של המשרד, נבחר ידנית בכל תיק (אין ברירת מחדל משרדית).
// ‼ השרת (230, update_wealth_declaration) אוכף את אותם מצבים; כאן רק התצוגה והחישוב המקביל.

export type DemandSource = 'letter' | 'portal' | 'client' | 'alignment' | 'other';

export interface WealthDemand {
  status: 'reported' | 'verified';
  source?: DemandSource;
  letterDate?: string;
  receivedOn?: string;
  /** המועד שכתוב בדרישה — כפי שנקרא. */
  dueInLetter?: string;
  /** הרצפה החוקית שהשרת חישב מתאריך המכתב — בקרה, לא מועד. */
  computedDue?: string;
  extension?: { until: string; kind: 'personal' | 'general'; status: 'reported' | 'documented'; documentId?: string; note?: string; at?: string };
  note?: string;
  evidence?: { kind: 'document' | 'authority_record'; documentId?: string; recordId?: string; label?: string };
  reportedAt?: string;
  verifiedBy?: string;
  verifiedAt?: string;
  /** אימות קודם שבוטל כי הדרישה שונתה אחריו. */
  unverifiedFrom?: string;
}

export const DEMAND_SOURCE_LABEL: Record<DemandSource, string> = {
  letter: 'מכתב מפקיד השומה', portal: 'מסך המייצגים', client: 'הלקוח מסר', alignment: 'יישור קו מול הרשויות', other: 'אחר',
};

const he = (iso?: string) => (iso ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}` : '');
const addDays = (iso: string, n: number) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

/** אותו חישוב כמו _wealth_min_due בשרת: 120 יום מהמאוחר מבין תאריך הדרישה ויום ההצהרה.
 *  היום הראשון לא נספר (חוק הפרשנות 10(א)) ⇒ התאריך + 120. */
export function wealthMinDue(letterDate: string | undefined, asOf: string): string | undefined {
  if (!letterDate) return undefined;
  return addDays(letterDate > asOf ? letterDate : asOf, 120);
}

export type DemandState = 'none' | 'reported' | 'verified';

export interface DemandView {
  state: DemandState;
  /** תווית קצרה למצב — לשורה בבקשות ולכותרת. */
  label: string;
  tone: '' | 'amber' | 'green';
  /** המועד שאפשר לקרוא לו «רשמי» — רק מאסמכתה מאומתת. */
  officialDue?: string;
  /** מועד שנמסר ולא אומת. */
  reportedDue?: string;
  computedDue?: string;
  /** ארכה שנרשמה — מוצגת לצד המועד, לא במקומו. */
  extensionUntil?: string;
  extensionDocumented?: boolean;
  /** המועד שבמכתב מוקדם מהרצפה החוקית — לבדוק את הקריאה. */
  dueBelowFloor?: boolean;
  /** שורה אחת לכותרות ולרשימות. */
  short: string;
}

export function demandView(d: WealthDemand | null | undefined): DemandView {
  if (!d) return { state: 'none', label: 'הכנה בלי דרישה', tone: '', short: 'הכנה בלי דרישה — אין מועד רשמי' };
  const ext = d.extension;
  const extTxt = ext ? ` · ארכה עד ${he(ext.until)}${ext.status === 'documented' ? '' : ' (לא מתועדת)'}` : '';
  const dueBelowFloor = !!(d.dueInLetter && d.computedDue && d.dueInLetter < d.computedDue);
  const common = { computedDue: d.computedDue, extensionUntil: ext?.until, extensionDocumented: ext?.status === 'documented', dueBelowFloor };
  if (d.status === 'verified') {
    const officialDue = d.dueInLetter;
    return {
      state: 'verified', label: 'דרישה מאומתת', tone: 'green', officialDue, ...common,
      short: (officialDue ? `מועד בדרישה ${he(officialDue)}` : 'דרישה מאומתת · אין מועד במכתב') + extTxt,
    };
  }
  return {
    state: 'reported', label: 'דרישה — טרם אומתה', tone: 'amber', reportedDue: d.dueInLetter, ...common,
    short: `דרישה — טרם אומתה${d.dueInLetter ? ` · נמסר מועד ${he(d.dueInLetter)} (לא מאומת)` : ''}${extTxt}`,
  };
}
