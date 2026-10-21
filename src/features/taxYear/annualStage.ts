// ─── דוח שנתי: באיזה שלב הבקשה — פס השלבים בכרטיס הבקשה (21.10.2026) ─────────────────────────────────────
// ‼ טהור. מקור אחד לפס השלבים ולשורות «מה עליך לעשות» שתלויות בשלב (למשל «לעדכן בתיק» — רק ב«אישורך»).
// ‼ ההדמיה המאושרת: docs/proposals/2026-10-21-office-request-and-tax-file.html («1 · כרטיס הבקשה»).
//   הכנה ⇐ האיסוף נגמר ועוד לא נשמר דוח · אישורך ⇐ נשמרה טיוטת דוח (annual_returns, status='draft') ·
//   חתימת הלקוח ⇐ אושר «מוכן להגשה» · הוגש ⇐ נרשמה הגשה בפועל, או שהבקשה הושלמה.

export const ANNUAL_STAGES = ['שאלון', 'מסמכים', 'הכנה', 'אישורך', 'חתימת הלקוח', 'הוגש'] as const;
export const STAGE = { questions: 0, docs: 1, prepare: 2, approve: 3, sign: 4, filed: 5 } as const;

export interface AnnualStageInput {
  /** שאלות (לא מסמכים) בבקשה, וכמה מהן נענו. */
  questions: number;
  questionsDone: number;
  /** הלקוח עוד ממלא (שאלה שפורסמה ולא נשלחה). */
  filling: boolean;
  files: number;
  filesDone: number;
  /** הבקשה הושלמה (completed / verified). */
  closed: boolean;
  /** גרסאות הדוח השמורות של הבקשה. */
  returns: { status: string; filedAt?: string }[];
}

export function annualStage(i: AnnualStageInput): number {
  if (i.closed || i.returns.some(v => v.status === 'approved' && !!v.filedAt)) return STAGE.filed;
  // ‼ טיוטה חדשה אחרי אישור (תיקון) — חוזרים ל«אישורך»
  if (i.returns.some(v => v.status === 'draft')) return STAGE.approve;
  if (i.returns.some(v => v.status === 'approved')) return STAGE.sign;
  if (i.questions === 0 || i.filling || i.questionsDone < i.questions) return STAGE.questions;
  if (i.filesDone < i.files) return STAGE.docs;
  return STAGE.prepare;
}
