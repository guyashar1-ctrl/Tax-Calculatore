// ─── מה PIVO עושה בפייפרלס ללקוח הזה — שורה אחת בבקשת ההקמה (304) ─────────────
// ‼ נגזר ממה שבאמת קרה: המשימות (הקמה / בדיקת כרטיס) והחותמות שהשרת כתב על השלבים
// (_apply_paperless_observation). המסך לא מסיק «הוקם» מלחיצה — רק מחותמת.
// סדר העדיפות: מה שצריך ממך קודם (התחברות, לא ידוע, פער), אחר כך מה שרץ, ואז המצב.

import type { AutomationJob } from '../../types/automation';
import type { OnboardingStep } from '../../types/onboarding';

export interface PaperlessConflict {
  paperlessBeforeVat: number | null;
  agreedBeforeVat: number;
  paperlessPayment?: string;
}

export type PivoPaperlessState =
  | { kind: 'login' }
  | { kind: 'running'; what: 'setup' | 'check' }
  | { kind: 'unknown' }
  | { kind: 'conflict'; conflict: PaperlessConflict }
  | { kind: 'failed'; detail: string }
  | { kind: 'cardEntered'; at: string; byPivo: boolean }
  | { kind: 'waitingCard'; setupAt: string; checkedAt?: string; byPivo: boolean }
  | { kind: 'idle' };

const OPEN = new Set(['queued', 'running', 'needs_human']);
const awaitsLogin = (j: AutomationJob | null) =>
  !!j && j.status === 'needs_human' && (j.errorCode ?? '').startsWith('awaiting_paperless');

/** ההקמה התחילה לכתוב בפייפרלס ונקטעה — ואין קריאה מאוחרת יותר שהכריעה. */
function outcomeUnknown(setup: AutomationJob | null, check: AutomationJob | null): boolean {
  if (!setup) return false;
  const touched = !!setup.progress && !!(setup.progress as Record<string, unknown>).externalAttempt;
  const stopped = setup.status === 'failed' || (setup.status === 'needs_human' && !awaitsLogin(setup));
  if (!(touched && stopped) && setup.errorCode !== 'external_outcome_unknown') return false;
  const decided = !!check && check.status === 'succeeded'
    && (check.finishedAt ?? check.updatedAt) > (setup.finishedAt ?? setup.updatedAt);
  return !decided;
}

export function pivoPaperlessState(p: {
  setupJob: AutomationJob | null;
  checkJob: AutomationJob | null;
  step: Pick<OnboardingStep, 'payload' | 'status'>;
  retainer?: Pick<OnboardingStep, 'payload'>;
}): PivoPaperlessState {
  const { setupJob, checkJob, step, retainer } = p;
  if (awaitsLogin(setupJob) || awaitsLogin(checkJob)) return { kind: 'login' };
  if (setupJob && OPEN.has(setupJob.status) && setupJob.status !== 'needs_human') return { kind: 'running', what: 'setup' };
  if (outcomeUnknown(setupJob, checkJob)) return { kind: 'unknown' };
  if (checkJob && (checkJob.status === 'queued' || checkJob.status === 'running')) return { kind: 'running', what: 'check' };

  const sp = (step.payload ?? {}) as Record<string, unknown>;
  const c = sp.paperlessConflict as PaperlessConflict | null | undefined;
  if (c && typeof c === 'object' && c.agreedBeforeVat != null) return { kind: 'conflict', conflict: c };

  const rp = (retainer?.payload ?? {}) as Record<string, unknown>;
  if (rp.cardEnteredAt) return { kind: 'cardEntered', at: String(rp.cardEnteredAt), byPivo: rp.cardEnteredBy === 'pivo' };

  // ‼ כשל ישן לא מסתיר חותמת חדשה יותר (בדיקה מאוחרת יותר הכריעה שהריטיינר נשמר).
  const stamp = rp.authorizationCreatedAt ? String(rp.authorizationCreatedAt) : '';
  const jobAt = setupJob ? (setupJob.finishedAt ?? setupJob.updatedAt) : '';
  if (setupJob && (setupJob.status === 'failed' || setupJob.status === 'needs_human') && (!stamp || jobAt > stamp)) {
    return { kind: 'failed', detail: (setupJob.status === 'needs_human' ? setupJob.needsHuman : null) ?? setupJob.errorDetail ?? '' };
  }

  if (rp.authorizationCreatedAt) {
    return {
      kind: 'waitingCard', setupAt: String(rp.authorizationCreatedAt),
      checkedAt: sp.pivoCheckedAt ? String(sp.pivoCheckedAt) : undefined,
      byPivo: rp.authorizationBy === 'pivo',
    };
  }
  return { kind: 'idle' };
}

/** «העברה בנקאית» וכו׳ — לשורת הפער. */
export const PAYMENT_NAMES: Record<string, string> = {
  credit: 'סליקת אשראי', bank: 'העברה בנקאית', masav: 'מס״ב', none: 'לא לתשלום', unknown: 'אמצעי תשלום לא מוכר',
};

/** משפט הפער — מה בפייפרלס מול מה בהסכם. */
export function conflictText(c: PaperlessConflict): string {
  const agreed = `${c.agreedBeforeVat.toLocaleString('he-IL')} ₪ + מע״מ`;
  if (c.paperlessPayment && c.paperlessPayment !== 'credit' && c.paperlessPayment !== 'none') {
    return `בפייפרלס מוגדר «${PAYMENT_NAMES[c.paperlessPayment] ?? c.paperlessPayment}», ובהסכם ${agreed} בכרטיס אשראי. PIVO לא שינה.`;
  }
  const there = c.paperlessBeforeVat != null ? `${c.paperlessBeforeVat.toLocaleString('he-IL')} ₪ + מע״מ` : 'סכום אחר';
  return `בפייפרלס כבר מוגדר ${there}, ובהסכם ${agreed}. PIVO לא שינה.`;
}

/**
 * מה הבדיקה האחרונה בפייפרלס ראתה — לשורה שליד «בדוק בפייפרלס».
 * ‼ «עוד אין כרטיס» הוא מה שנראה בקריאה; לא כישלון ולא «הלקוח לא הזין».
 */
export function lastCheckText(job: AutomationJob | null, fmt: (iso?: string) => string): { text: string; running: boolean } | null {
  if (!job) return null;
  if (job.status === 'queued' || job.status === 'running') return { text: 'בודק בפייפרלס…', running: true };
  if (job.status === 'needs_human') {
    return { text: (job.errorCode ?? '').startsWith('awaiting_paperless') ? 'צריך להתחבר לפייפרלס — הבדיקה תמשיך לבד' : 'הבדיקה נעצרה', running: false };
  }
  if (job.status === 'failed') return { text: `הבדיקה לא הצליחה${job.errorDetail ? `: ${job.errorDetail.split(/(?<=[.!?])\s/)[0]}` : ''}`, running: false };
  if (job.status !== 'succeeded') return null;
  const o = ((job.result ?? {}) as Record<string, unknown>).observed as Record<string, unknown> | undefined;
  const at = fmt(job.finishedAt ?? job.updatedAt);
  const charged = Array.isArray(o?.chargedPeriods) && o!.chargedPeriods.length > 0;
  const what = !o?.inRetainer ? 'הלקוח לא נמצא בטבלת הריטיינר'
    : o.cardEntered && charged ? 'הכרטיס הוזן והחודש חויב'
    : o.cardEntered ? 'הכרטיס הוזן · החודש עוד לא חויב'
    : 'עוד אין כרטיס בפייפרלס';
  return { text: `PIVO בדק ${at} · ${what}`, running: false };
}
