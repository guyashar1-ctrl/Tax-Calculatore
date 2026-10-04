// ─── מה הפעולה הבאה בייצוג, במילים של מי שעושה אותה ─────────────────────────
// ‼ הסטטוס לבדו אינו הוראה. "דורש הפקת טופס" מתאר מצב, ומי שקורא אותו עדיין
// צריך לתרגם אותו לפעולה — ובדרך הוא מחפש כפתור שלא קיים במסך שהוא נמצא בו.
// הפירוט המדויק (מה הוזן, מה נשלח, מי חתם) חי במרכז הייצוג; כאן רק המשפט
// שאומר אצל מי הכדור ומה הצעד.

import type { Client, RepresentationRequest, RepresentationStatus } from '../types';
import { REPRESENTATION_STATUS_LABELS } from '../types';
import { signatureReadiness } from '../features/representation/signatureReadiness';
import { targetsOf } from './repScope';
import { repPreparationFacts, prepOpenItems } from '../features/representation/repPreparation';

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
 * איפה הבקשה עומדת לפני שהמייל לחתימה יצא — נגזר מהטופס עצמו, לא מהסטטוס לבדו.
 *
 * ‼ «ממתין לחתימה» מתחיל רק כשהמייל יצא. הפקת הטופס מעבירה את הבקשה ל-
 * pending_signature, אבל השליחה היא פעולה נפרדת — ועד שהיא קורית «נשלח
 * לחתימת הלקוח» הוא טענה שקרית.
 * ‼ 04.10.2026 · טופס שהגיע משע״ם ומקומות החתימה סומנו בו אוטומטית משאיר את
 * הבקשה ב-awaiting_accountant עד «שלח» (208). הסטטוס לבדו אמר «דורש הפקת טופס»
 * במסך הבקשות, בזמן שמרכז הייצוג אמר «מוכן לשליחה» — אצל עידן. שני המסכים קוראים
 * עכשיו את אותה הכרעה: signatureReadiness.
 *
 * 'unsent'          — הטופס מוכן לחתימה (וגם אסמכתת ב״ל, כשהתבקש), המייל עוד לא יצא.
 * 'prep_open'       — יש טופס, אבל נשאר צעד אחר לפני השליחה: הגשה שעוד לא נפתחה בשע״ם (אצל זוג —
 *                     גם השנייה), או אסמכתת ב״ל.
 * 'form_arrived'    — הטופס הגיע משע״ם ומקומות החתימה עוד לא נוצרו בו (השרת מכין אותם, 218).
 * 'form_incomplete' — יש טופס, אבל חסר בו מקום חתימה או שהשיוך לחותם שגוי.
 * null              — אין פער (אין טופס עדיין, או שהמייל כבר יצא).
 */
export type RepSendPhase = 'unsent' | 'prep_open' | 'form_arrived' | 'form_incomplete';

function incompletePhase(r: ReturnType<typeof signatureReadiness>): RepSendPhase {
  return r.problems.every(p => p.code === 'not_prepared') ? 'form_arrived' : 'form_incomplete';
}

function niRefMissing(req: Pick<RepresentationRequest, 'scope' | 'execution'>): boolean {
  const rec = req.scope?.nationalInsurance;
  if (!rec || rec.status === 'none') return false;
  const t = targetsOf(req.scope ?? undefined, 'nationalInsurance');
  const ex = req.execution ?? {};
  return (t.includes('client') && !ex.nationalInsurance?.referenceNumber)
    || (t.includes('spouse') && !ex.nationalInsuranceSpouse?.referenceNumber);
}

/**
 * ‼ שע״ם התבקשה ואין סימן שהבקשה נפתחה שם (מספר בקשה / «הוזן ידנית») — טופס שהועלה ידנית
 * עדיין אינו «מוכן לשליחה»: מרכז הייצוג מציג שם צעד פתוח. (רשימת ההגשות המלאה — לפי אדם —
 * נגזרת מהכרטיס; כאן הקירוב מהבקשה עצמה.)
 */
function shaamEntryMissing(req: Pick<RepresentationRequest, 'scope' | 'execution'>): boolean {
  const s = req.scope;
  const wanted = (['incomeTax', 'vat', 'withholding'] as const).some(a => s?.[a] && s[a]!.status !== 'none');
  if (!wanted) return false;
  const ex = req.execution ?? {};
  const tracks = Object.values(ex.shaam ?? {}).filter(t => t && !t.replacement);
  return !(tracks.some(t => !!t.requestNumber) || ex.incomeTax?.enteredAt || Object.keys(ex.shaamEntries ?? {}).length > 0);
}

/**
 * @param client הכרטיס — כשיש, ההגשות נגזרות ממנו בדיוק כמו במרכז הייצוג (לפי אדם ורשות),
 *   ושורת «בקשות» לא תאמר «מוכן לשליחה» כשהגשה של בן/בת הזוג עוד לא נפתחה. בלי כרטיס —
 *   קירוב מהבקשה עצמה.
 */
export function repSendPhase(
  req: (Pick<RepresentationRequest, 'status' | 'execution'> & Partial<RepresentationRequest>) | undefined | null,
  client?: Client | null,
): RepSendPhase | null {
  if (!req) return null;
  if (client && (req.status === 'awaiting_accountant' || (req.status === 'pending_signature' && !req.execution?.signatureEmailSentAt))) {
    const facts = repPreparationFacts(req as RepresentationRequest, client);
    // ‼ עוד אין שום טופס — הנוסח הרגיל («להזין ולהפיק טופס»).
    if (!facts.anyForm && req.status === 'awaiting_accountant') return null;
    if (facts.problems.some(p => p.code !== 'not_prepared')) return 'form_incomplete';
    const open = prepOpenItems(facts);
    if (open.some(o => o.kind !== 'form')) return 'prep_open';
    if (facts.problems.some(p => p.code === 'not_prepared')) return 'form_arrived';
    return open.length ? 'prep_open' : 'unsent';
  }
  if (req.status === 'pending_signature') {
    if (req.execution?.signatureEmailSentAt) return null;
    const sr = signatureReadiness(req as RepresentationRequest);
    return sr.state === 'incomplete' ? incompletePhase(sr) : 'unsent';
  }
  if (req.status !== 'awaiting_accountant') return null;
  const r = signatureReadiness(req as RepresentationRequest);
  if (r.state === 'incomplete') return incompletePhase(r);
  if (r.state !== 'ready') return null;
  return niRefMissing(req) || shaamEntryMissing(req) ? 'prep_open' : 'unsent';
}

const UNSENT: RepresentationAction = {
  action: 'לשלוח ללקוח לחתימה',
  why: 'הטופס מוכן, אבל המייל עוד לא יצא. השליחה במרכז הייצוג.',
  mine: true, ball: 'אצלי',
};
const PREP_OPEN: RepresentationAction = {
  action: 'להשלים את ההכנה ולשלוח ללקוח',
  why: 'הטופס מוכן לחתימה, ונשאר צעד לפני השליחה (פתיחת הבקשה בשע״ם או אסמכתת ביטוח לאומי) — הפירוט במרכז הייצוג.',
  mine: true, ball: 'אצלי',
};
const FORM_ARRIVED: RepresentationAction = {
  action: 'להכין את הטופס לחתימה',
  why: 'הטופס הגיע משע״ם. בפתיחת מרכז הייצוג נוצרים בו מקומות החתימה, ואז אפשר לבדוק ולשלוח.',
  mine: true, ball: 'אצלי',
};
const FORM_INCOMPLETE: RepresentationAction = {
  action: 'להשלים את מקומות החתימה בטופס',
  why: 'הטופס קיים, אבל חסר בו מקום חתימה או שהשיוך לחותם שגוי. התיקון במרכז הייצוג.',
  mine: true, ball: 'אצלי',
};

export function representationAction(status: RepresentationStatus, phase?: RepSendPhase | null): RepresentationAction {
  if (status === 'awaiting_accountant' || status === 'pending_signature') {
    if (phase === 'form_incomplete') return FORM_INCOMPLETE;
    if (phase === 'form_arrived') return FORM_ARRIVED;
    if (phase === 'prep_open') return PREP_OPEN;
    if (phase === 'unsent') return UNSENT;
  }
  return ACTIONS[status];
}

/** תווית הסטטוס לתצוגה — «נשלח לחתימת הלקוח» רק כשהמייל באמת יצא. */
export function representationStatusLabel(status: RepresentationStatus, phase?: RepSendPhase | null): string {
  if (status === 'awaiting_accountant' || status === 'pending_signature') {
    if (phase === 'form_incomplete') return 'הטופס דורש השלמה';
    if (phase === 'form_arrived') return 'הטופס הגיע · טרם הוכן לחתימה';
    if (phase === 'prep_open') return 'הטופס מוכן · נשאר צעד לפני השליחה';
    if (phase === 'unsent') return 'מוכן לשליחה ללקוח';
  }
  return REPRESENTATION_STATUS_LABELS[status];
}
