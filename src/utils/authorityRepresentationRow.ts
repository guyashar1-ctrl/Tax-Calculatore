// ─── «ייצוג בביטוח לאומי · {שם}» — מצב ופעולה של חלק אחד, בלי React ──────────
// ‼ (סבב 4) אותו מודל משמש את השורה של החלק עצמו (בתוך «לפי רשות ואדם») ואת
// השורה הראשית «ייצוג מול הרשויות» כשהחלק הזה הוא מה שדורש אותך עכשיו. שני
// חישובים נפרדים היו אומרים «חסרים פרטים» בשורה אחת ו«לטיפולך» בשנייה.
// המצבים (מקור: ביצוע ב"ל של האדם — execution.nationalInsurance[Spouse], 157):
//   חסרים פרטים → להזין בב"ל → ממתין לאסמכתא → לשלוח הוראות (או: יוצא עם בקשת
//   החתימה) → נשלח, ממתין לאישור → אושר.  PIVO רץ / נתקע / האסמכתא פגה — לצד.

import type { NiTracking } from '../types';
import type { OnboardingStep } from '../types/onboarding';
import { lamed, type RowState } from './requestPresentation';
import { isShaamIdentityStep } from './clientFacingRows';

export interface AuthRepJob {
  status: string;
  actionType?: string;
  needsHuman?: string | null;
  errorDetail?: string | null;
}

export interface AuthRepInput {
  open: boolean;
  /** השם הפרטי **הנוכחי** מהכרטיס (לא העותק שנשמר על השלב). */
  first: string;
  track?: NiTracking;
  /** מ-stepAttention — אדום כשהאסמכתא פגה. */
  tone: 'red' | 'blue' | 'gray';
  job?: AuthRepJob | null;
  /** שדות קנוניים שחסרים בכרטיס (payload.prerequisites.missing, 165). */
  missing: string[];
  /** ההוראות ייצאו עם בקשת החתימה (niRidesWithSignature) — אין שליחה נפרדת. */
  ridesWithSignature?: boolean;
  /** סוג המשימה של בדיקת הקבלה — כדי לנסח «בודק» מול «מזין». */
  checkActionType?: string;
  today?: string;
}

/** הפעולה בשורה הסגורה — רק כשהתור שלך. */
export type AuthRepPrimary =
  | { kind: 'gate'; label: 'השלמת פרטים' }
  | { kind: 'send'; label: 'שלח הוראות' }
  | { kind: 'enter'; label: 'הזן בב״ל' | 'הזן מחדש' }
  | null;

export interface AuthRepRowModel {
  sent: boolean;
  confirmed: boolean;
  expired: boolean;
  /** יש אסמכתא, ההוראות לא יצאו, ואין להן מסלול אחר (לא עם בקשת החתימה). */
  readyToSend: boolean;
  /** יש אסמכתא וההוראות ייצאו עם בקשת החתימה. */
  withSignature: boolean;
  live: boolean;
  stuck: boolean;
  failed: boolean;
  gated: boolean;
  /** הפעולה האוטומטית המתאימה (NiNextActionButton) — אם יש. */
  autoAction: { kind: 'enter_btl' | 'check_btl'; label: string } | null;
  primary: AuthRepPrimary;
  /** המצב הקצר בשורה הסגורה; undefined ⇒ נגזר מ-stepAttention. */
  state?: RowState;
}

export function authRepRowModel(i: AuthRepInput): AuthRepRowModel {
  const t = i.track;
  const today = i.today ?? new Date().toISOString().slice(0, 10);
  const sent = !!t?.instructionsSentAt;
  const confirmed = !!t?.confirmedAt;
  const expired = i.tone === 'red' && !confirmed && !!t?.deadline && t.deadline < today;
  const hasRef = !!t?.referenceNumber;
  const withSignature = hasRef && !sent && !expired && !!i.ridesWithSignature;
  const readyToSend = hasRef && !sent && !expired && !i.ridesWithSignature;
  const live = !!i.job && (i.job.status === 'queued' || i.job.status === 'running');
  const stuck = !!i.job && i.job.status === 'needs_human';
  const failed = !!i.job && i.job.status === 'failed';
  const gated = i.open && i.missing.length > 0;
  const autoAction = expired
    ? { kind: 'enter_btl' as const, label: 'הזן מחדש בביטוח לאומי' }
    : sent && !confirmed
      ? { kind: 'check_btl' as const, label: 'בדוק קבלת הייצוג' }
      : !t?.referenceNumber && !t?.enteredAt
        ? { kind: 'enter_btl' as const, label: 'הזן ייפוי כוח בביטוח לאומי' }
        : null;

  const primary: AuthRepPrimary = !i.open ? null
    : gated ? { kind: 'gate', label: 'השלמת פרטים' }
    : readyToSend ? { kind: 'send', label: 'שלח הוראות' }
    : autoAction && !live && autoAction.kind === 'enter_btl' ? { kind: 'enter', label: expired ? 'הזן מחדש' : 'הזן בב״ל' }
    : null;

  const state: RowState | undefined = !i.open ? undefined
    : gated ? { text: 'חסרים פרטים', tone: 'amber' }
    : live ? { text: 'PIVO עובד', tone: 'gray' }
    : stuck && !autoAction ? { text: 'PIVO נתקע', tone: 'red' }
    : expired ? { text: 'האסמכתא פגה', tone: 'red' }
    : sent && !confirmed ? { text: `ממתין ${lamed(i.first)}`, tone: 'gray' }
    : withSignature ? { text: 'יוצא עם החתימה', tone: 'gray' }
    : t?.enteredAt && !t?.referenceNumber ? { text: 'ממתין לאסמכתא', tone: 'gray' }
    : undefined;

  return { sent, confirmed, expired, readyToSend, withSignature, live, stuck, failed, gated, autoAction, primary, state };
}

/**
 * שורת קריאה בלבד מתוך ביצוע ב"ל — כשאין לאדם שלב «ייצוג ברשות» (קליטה ראשונה:
 * מסלול ב"ל חי רק במרכז הייצוג). ‼ בלי פעולה: הפעולות במרכז הייצוג.
 */
export function niTrackLine(t: NiTracking | undefined, first: string, opts: { ridesWithSignature?: boolean; today?: string } = {}): string | null {
  if (!t) return null;
  const today = opts.today ?? new Date().toISOString().slice(0, 10);
  if (t.confirmedAt) return 'אושר';
  if (t.referenceNumber && t.deadline && t.deadline < today) return `האסמכתא ${t.referenceNumber} פגה`;
  if (t.instructionsSentAt) return `ממתין לאישור של ${first}`;
  if (t.referenceNumber) return opts.ridesWithSignature
    ? `אסמכתא ${t.referenceNumber} · ההוראות יוצאות עם בקשת החתימה`
    : `אסמכתא ${t.referenceNumber} · ההוראות עוד לא נשלחו`;
  if (t.enteredAt) return 'הוזן · ממתין לאסמכתא';
  return null;
}

/**
 * לאדם בלי שלב «ייצוג ברשות»: יש אסמכתא, ההוראות לא יצאו, לא אושר ולא פג, ואין להן
 * מסלול אחר (לא יוצאות עם בקשת החתימה) ⇒ «שלח הוראות» בשורה שלו. אותם תנאים כמו
 * readyToSend של authRepRowModel — אדם עם שלב ואדם בלי שלב לא סותרים זה את זה.
 */
export function niTrackNeedsSend(t: NiTracking | undefined, opts: { ridesWithSignature?: boolean; today?: string } = {}): boolean {
  if (!t?.referenceNumber || t.instructionsSentAt || t.confirmedAt) return false;
  const today = opts.today ?? new Date().toISOString().slice(0, 10);
  if (t.deadline && t.deadline < today) return false;
  return !opts.ridesWithSignature;
}

const AUTH_SHORT: Record<string, string> = { incomeTax: 'מס הכנסה', withholding: 'ניכויים', vat: 'מע״מ' };

/**
 * «רשות המסים · מס הכנסה, מע״מ» — שורת ההורה ב«לפי רשות ואדם»: הרשויות של רשות
 * המסים שבהיקף הבקשה (ב"ל — שורה לכל אדם בנפרד).
 */
export function taxAuthorityScopeLine(areas: Record<string, { status?: string } | undefined> | undefined): string {
  const inScope = Object.keys(AUTH_SHORT).filter(k => {
    const rec = areas?.[k];
    return !!rec && rec.status !== 'none';
  });
  return inScope.length ? `רשות המסים · ${inScope.map(k => AUTH_SHORT[k]).join(', ')}` : 'רשות המסים';
}

/**
 * שם קצר של חלק בבקשת הייצוג — לשורת המשנה בשורה הראשית ולשורות «לפי רשות ואדם».
 * ‼ השם הפרטי הנוכחי מהכרטיס, לא subjectName שנשמר על השלב (עותק שמתיישן).
 */
export function representationPartLabel(
  step: Pick<OnboardingStep, 'stepType' | 'payload'>,
  names: { client: string; spouse: string },
): string | null {
  if (step.stepType === 'authority_representation') {
    const role = step.payload?.subjectRole === 'spouse' ? 'spouse' : 'client';
    return `ביטוח לאומי · ${names[role]}`;
  }
  if (isShaamIdentityStep(step)) {
    const person = (step.payload?.shaamIdentity as { person?: unknown } | undefined)?.person === 'spouse' ? 'spouse' : 'client';
    return `צילום תעודה לרשות המסים · ${names[person]}`;
  }
  return null;
}
