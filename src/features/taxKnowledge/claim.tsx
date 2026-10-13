// ─── מעמד של טענה: מאומת / פרשנות / פתוח ──────────────────────────────────────
// ‼ קובץ נפרד בכוונה: גם הצהרת ההון (taxYear) מציגה את התג, בלי לטעון את מרשם הכללים.
import './claim.css';

/** מאומת = מקור רשמי שנקרא; פרשנות = הסבר שלנו, נוהג משרד או מקור משני; פתוח = לא הוכרע. */
export type ClaimStatus = 'verified' | 'interpretation' | 'open';

export const CLAIM_LABEL: Record<ClaimStatus, string> = {
  verified: 'מאומת',
  interpretation: 'פרשנות',
  open: 'פתוח',
};
const CLAIM_TITLE: Record<ClaimStatus, string> = {
  verified: 'נשען על מקור רשמי שנקרא (המקורות בלשונית «מקורות»)',
  interpretation: 'הסבר שלנו, נוהג משרד או מקור משני — לבדוק לפני שמסתמכים',
  open: 'שאלה שלא הוכרעה — המערכת לא מחשבת לפיה',
};

export function ClaimTag({ status }: { status: ClaimStatus }) {
  return <span className={`kn-claim ${status}`} title={CLAIM_TITLE[status]}>{CLAIM_LABEL[status]}</span>;
}
