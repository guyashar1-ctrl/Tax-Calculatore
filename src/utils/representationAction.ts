// ─── מה הפעולה הבאה בייצוג, במילים של מי שעושה אותה ─────────────────────────
// ‼ הסטטוס לבדו אינו הוראה. "דורש הפקת טופס" מתאר מצב, ומי שקורא אותו עדיין
// צריך לתרגם אותו לפעולה — ובדרך הוא מחפש כפתור שלא קיים במסך שהוא נמצא בו.
// הפירוט המדויק (מה הוזן, מה נשלח, מי חתם) חי במרכז הייצוג; כאן רק המשפט
// שאומר אצל מי הכדור ומה הצעד.

import type { RepresentationRequest, RepresentationStatus } from '../types';
import { REPRESENTATION_STATUS_LABELS } from '../types';

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

/**
 * ‼ «ממתין לחתימה» מתחיל רק כשהמייל יצא. הפקת הטופס מעבירה את הבקשה ל-
 * pending_signature, אבל השליחה היא פעולה נפרדת — ועד שהיא קורית «נשלח
 * לחתימת הלקוח» הוא טענה שקרית. 'unsent' = הטופס מוכן, המייל עוד לא יצא.
 * null = אין פער (לא pending_signature, או שהמייל כבר יצא).
 */
export type RepSendPhase = 'unsent';

export function repSendPhase(
  req: Pick<RepresentationRequest, 'status' | 'execution'> | undefined | null,
): RepSendPhase | null {
  if (!req || req.status !== 'pending_signature' || req.execution?.signatureEmailSentAt) return null;
  return 'unsent';
}

const UNSENT: RepresentationAction = {
  action: 'לשלוח ללקוח לחתימה',
  why: 'הטופס מוכן, אבל המייל עוד לא יצא. השליחה במרכז הייצוג.',
  mine: true, ball: 'אצלי',
};

export function representationAction(status: RepresentationStatus, phase?: RepSendPhase | null): RepresentationAction {
  return phase === 'unsent' && status === 'pending_signature' ? UNSENT : ACTIONS[status];
}

/** תווית הסטטוס לתצוגה — «נשלח לחתימת הלקוח» רק כשהמייל באמת יצא. */
export function representationStatusLabel(status: RepresentationStatus, phase?: RepSendPhase | null): string {
  return phase === 'unsent' && status === 'pending_signature' ? 'מוכן לשליחה ללקוח' : REPRESENTATION_STATUS_LABELS[status];
}
