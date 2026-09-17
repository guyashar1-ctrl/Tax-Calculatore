// ─── תא הפעולה ההקשרית של מס הכנסה/שע״ם (פרק 17) ─────────────────────────────
// ‼ מוכן מבנית, לא מחובר לאוטומציה אמיתית — אין עדיין handler שמזין/שולח/
// בודק מול שע״ם, ולכן הפקד תמיד מושבת עם הסיבה (אותו דפוס כמו
// AuthorityCheckButton כש-available:false). שלוש תוויות מתוך ארבע; 'active'
// אינו מקבל פקד בכלל.
// ‼ פונקציה טהורה אחת לשני המשטחים — תיק המס (client.representationStatus)
// ומרכז ביצוע הייצוג (request.status) — כדי שהתווית לא תסטה ביניהם.
// ‼ הנגזרת היחידה שקיימת: סטטוס בקשת הייצוג. לא ממציאים «נשלח לשע״ם» בלי
// ראיה; awaiting_authorities כבר אומר את זה.

import type { RepresentationStatus } from '../../types';

export interface ShaamRepresentationAction {
  label: string;
  /** למה הפקד מושבת — משפט אחד, ב-title. */
  reason: string;
}

export function shaamRepresentationAction(
  status: RepresentationStatus | null | undefined,
): ShaamRepresentationAction | null {
  if (!status || status === 'active') return null;
  if (status === 'awaiting_stamp') {
    return { label: 'שלח טופס חתום לשע״ם', reason: 'שליחה אוטומטית לשע״ם עדיין לא נבנתה — יש להמשיך במרכז הייצוג.' };
  }
  if (status === 'awaiting_authorities') {
    return { label: 'בדוק קבלת הייצוג', reason: 'בדיקה אוטומטית מול שע״ם עדיין לא נבנתה — יש לבדוק ידנית ולסמן "הייצוג פעיל".' };
  }
  return { label: 'הזן את הפרטים בשע״ם', reason: 'הזנה אוטומטית בשע״ם עדיין לא נבנתה — יש להזין ידנית ולסמן "הפרטים הוזנו בשע״ם".' };
}
