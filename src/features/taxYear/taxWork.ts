// ─── «עבודת מס» — מצב כל תהליך איסוף של כל הלקוחות, לתצוגת המשרד ──────────────────
// ‼ טהור (בלי React ובלי רשת), כדי שייבדק ב-node. אותן שורות כמו ב«בקשות» של הלקוח — לא רשימה חדשה:
//   קליטה והשלמת תיק המס, דוח שנתי, הצהרת הון (ראשונה / המשך), כל אחת עם «השלמת מידע» שלה.
// ‼ «מה חסר» = שאלות שפורסמו ללקוח ועוד לא נענו (כולל «אין לי עדיין»). «ממתין לבדיקתך» = תשובות ומסמכים
//   שהלקוח שלח והמשרד עוד לא החליט עליהם. לא מסיקים «הושלם» מספירה — רק ממצב הבקשה.

import type { OnboardingStep } from '../../types/onboarding';
import { AVAILABLE } from '../taxKnowledge/availability';

export type WorkKind = 'intake' | 'annual' | 'wealth' | 'estimate';
export type WorkBucket = 'mine' | 'client' | 'done';

export interface WorkAsk { id: string; stepId: string; state: string; title: string; subjectName?: string }
export interface WorkFact { askId?: string; status: string }
export interface WorkEvidence { askId?: string; review: string }

export interface WorkRow {
  parent: OnboardingStep;
  info?: OnboardingStep;
  kind: WorkKind;
  title: string;
  /** שאלות ללקוח שעוד לא נענו — פורסמו, או «אין לי עדיין». */
  missing: WorkAsk[];
  unavailable: number;
  /** טיוטות שהוכנו ועוד לא פורסמו. */
  drafts: number;
  /** תשובות ומסמכים שהתקבלו וממתינים לבדיקת המשרד. */
  toReview: number;
  answered: number;
  bucket: WorkBucket;
  /** הפעולה הבאה — במילים. */
  next: string;
}

const CLOSED = ['completed', 'verified', 'skipped', 'cancelled', 'failed'];
export const isOpenStep = (s: OnboardingStep) => !CLOSED.includes(s.status);

// ‼ הערכת מס — רק כשהיא זמינה (availability.ts): בחבילת האיסוף היא כבויה, ולכן לא מוצגת ולא נשאלת מהשרת.
export const WORK_STEP_TYPES: string[] = ['tax_file_intake', 'annual_return', 'wealth_declaration', ...(AVAILABLE.taxEstimate ? ['tax_estimate'] : [])];
export const kindOf = (s: OnboardingStep): WorkKind | null =>
  s.stepType === 'tax_file_intake' ? 'intake' : s.stepType === 'annual_return' ? 'annual' : s.stepType === 'wealth_declaration' ? 'wealth'
    : s.stepType === 'tax_estimate' && AVAILABLE.taxEstimate ? 'estimate' : null;

type P = { taxYear?: number; title?: string; asOfDate?: string; kind?: 'first' | 'followup'; parentStepId?: string };
const dmy = (iso?: string) => (iso ? iso.slice(0, 10).split('-').reverse().join('.') : '');

export function workTitle(s: OnboardingStep): string {
  const p = (s.payload ?? {}) as unknown as P;
  if (s.stepType === 'tax_file_intake') return 'קליטה והשלמת תיק המס';
  if (s.stepType === 'annual_return') return p.title || `דוח שנתי ${p.taxYear ?? ''}`.trim();
  if (s.stepType === 'tax_estimate') return p.title || `הערכת מס ${p.taxYear ?? ''}`.trim();
  if (s.stepType === 'wealth_declaration') {
    const d = p.asOfDate ? ` ליום ${dmy(p.asOfDate)}` : '';
    return `הצהרת הון${d}${p.kind === 'followup' ? ' · המשך' : p.kind === 'first' ? ' · ראשונה' : ''}`;
  }
  return p.title || 'בקשה';
}

const count = (n: number, one: string, many: string) => (n === 1 ? one : `${n} ${many}`);

export function buildWorkRows(
  steps: OnboardingStep[], asks: WorkAsk[], facts: WorkFact[], evidence: WorkEvidence[],
  firstNameOf: (clientId: string) => string,
): WorkRow[] {
  const parents = steps.filter(s => kindOf(s) && s.status !== 'cancelled');
  return parents.map(parent => {
    const info = steps.find(s => s.stepType === 'info_collection' && s.status !== 'cancelled'
      && ((s.payload ?? {}) as unknown as P).parentStepId === parent.id);
    const mine = info ? asks.filter(a => a.stepId === info.id) : [];
    const ids = new Set(mine.map(a => a.id));
    const missing = mine.filter(a => a.state === 'published' || a.state === 'unavailable');
    const unavailable = mine.filter(a => a.state === 'unavailable').length;
    const drafts = mine.filter(a => a.state === 'draft').length;
    const answered = mine.filter(a => a.state === 'answered').length;
    const toReview = facts.filter(f => f.askId && ids.has(f.askId) && f.status === 'pending').length
      + evidence.filter(e => e.askId && ids.has(e.askId) && e.review === 'needs_review').length;
    const who = firstNameOf(parent.clientId) || 'הלקוח';
    let bucket: WorkBucket; let next: string;
    if (!isOpenStep(parent)) { bucket = 'done'; next = 'הושלם'; }
    else if (toReview > 0) { bucket = 'mine'; next = `לבדוק ${count(toReview, 'פריט אחד שהתקבל', 'פריטים שהתקבלו')}`; }
    else if (drafts > 0) { bucket = 'mine'; next = `לפרסם בדף האישי ${count(drafts, 'שאלה אחת', 'שאלות')} שהוכנו`; }
    else if (missing.length - unavailable > 0) { bucket = 'client'; next = `ממתין ל${who}: ${count(missing.length - unavailable, 'שאלה פתוחה', 'שאלות פתוחות')}`; }
    else if (unavailable > 0) { bucket = 'client'; next = `ממתין למסמכים שעוד לא הגיעו (${unavailable})`; }
    else if (mine.length === 0) { bucket = 'mine'; next = `להכין שאלות ל${who}`; }
    else { bucket = 'mine'; next = 'להשלים במשרד ולסגור'; }
    return { parent, info, kind: kindOf(parent)!, title: workTitle(parent), missing, unavailable, drafts, toReview, answered, bucket, next };
  });
}

/** סדר בתוך כל קבוצה: מה שממתין לבדיקה קודם, אחר כך הישן יותר. */
export function sortWorkRows(rows: WorkRow[]): WorkRow[] {
  return [...rows].sort((a, b) => (b.toReview - a.toReview)
    || String(a.parent.updatedAt ?? a.parent.createdAt ?? '').localeCompare(String(b.parent.updatedAt ?? b.parent.createdAt ?? '')));
}
