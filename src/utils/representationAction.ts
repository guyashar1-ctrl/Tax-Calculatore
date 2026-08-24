// ─── מה הפעולה הבאה בייצוג, במילים של מי שעושה אותה ─────────────────────────
// ‼ הסטטוס לבדו אינו הוראה. "דורש הפקת טופס" מתאר מצב, ומי שקורא אותו עדיין
// צריך לתרגם אותו לפעולה — ובדרך הוא מחפש כפתור שלא קיים במסך שהוא נמצא בו.
// הפירוט המדויק (מה הוזן, מה נשלח, מי חתם) חי במרכז הייצוג; כאן רק המשפט
// שאומר אצל מי הכדור ומה הצעד.

import type { RepresentationStatus } from '../types';

export interface RepresentationAction {
  /** הפעולה עצמה — פועל, לא סטטוס. */
  action: string;
  /** למה זה חוסם / למה אין מה לעשות עכשיו. */
  why: string;
  /** הכדור אצל הרו"ח. */
  mine: boolean;
  /** אצל מי הכדור — באותה שפה של שאר שורות המסע. */
  ball: string;
}

const ACTIONS: Record<RepresentationStatus, RepresentationAction> = {
  pending_fill: {
    action: 'ממתין שהלקוח ימלא את פרטיו',
    why: 'הקישור נשלח אליו. כשימלא - הפרטים ייכנסו לכרטיס מעצמם.',
    mine: false, ball: 'אצל הלקוח',
  },
  awaiting_accountant: {
    action: 'להזין ברשויות ולהפיק את טופס ייפוי הכוח',
    why: 'בלי הטופס הלקוח לא יכול לחתום, ואי אפשר לחתום אחריו.',
    mine: true, ball: 'אצלי',
  },
  pending_signature: {
    action: 'ממתין לחתימת הלקוח',
    why: 'הטופס נשלח אליו. אחרי שיחתום - תגיע החתימה והחותמת שלך.',
    mine: false, ball: 'אצל הלקוח',
  },
  awaiting_stamp: {
    action: 'לחתום ולהוסיף חותמת',
    why: 'הלקוח חתם. אחרי החתימה שלך אפשר להגיש בשע״ם.',
    mine: true, ball: 'אצלי',
  },
  awaiting_authorities: {
    action: 'ממתין לאישור הרשויות',
    why: 'הטופס הוגש בשע״ם. כשיאושר - לסמן כמיוצג פעיל.',
    mine: false, ball: 'אצל הרשות',
  },
  active: {
    action: 'הייצוג פעיל',
    why: '',
    mine: false, ball: 'הושלם',
  },
};

export function representationAction(status: RepresentationStatus): RepresentationAction {
  return ACTIONS[status];
}
