// ─── הראיה האחרונה מרשימת ההכנסות בב"ל — לכל אדם, לאורך כל ההיסטוריה (219) ───
// ‼ «הקריאה האחרונה» אינה ראיה לכל אדם: משימה שהצליחה רק לבן/בת הזוג, או
// שמקטע ההכנסות שלה נכשל / חלקי, אינה מבטלת קריאה שלמה קודמת של הלקוח.
// לכן סורקים משימות שהצליחו מהחדשה לישנה — בלי תקרה שרירותית — עד שלכל אדם
// נמצאה קריאה שלמה, או שההיסטוריה נגמרה. המקור: automation_jobs.result (אותו
// מקור שממנו נגזר «מה ב"ל רושם»); לא מודל שני.
//
// הלוגיקה כאן טהורה (בלי React/רשת) כדי שאפשר לבדוק רצפים, טעינה ומעבר בין
// לקוחות; useBtlIncomeReads הוא עטיפה דקה.

import type { PersonRole } from '../../types';
import { latestCompleteIncomeReads, niIncomeReadsFromJob } from './niIncome';
import type { NiIncomeEvidenceJob, NiIncomeRead } from './niIncome';

export type NiIncomeReads = Partial<Record<PersonRole, NiIncomeRead>>;

export const INCOME_EVIDENCE_PAGE = 5;

/** עמוד משימות שהצליחו, מהחדשה לישנה. נכשל ⇒ error (לא עמוד ריק). */
export type IncomeJobsPage = { jobs: NiIncomeEvidenceJob[]; error?: string };
export type FetchIncomeJobsPage = (offset: number, limit: number) => Promise<IncomeJobsPage>;

/**
 * סורקת עד שלכל תפקיד יש קריאה שלמה, או עד שנגמרו המשימות. שגיאה בכל עמוד ⇒
 * זורקת: ראיה חלקית אינה «אין ראיה» (אולי הקריאה הסותרת בעמוד שלא נטען).
 */
export async function collectIncomeEvidence(
  fetchPage: FetchIncomeJobsPage, roles: readonly PersonRole[], pageSize = INCOME_EVIDENCE_PAGE,
): Promise<NiIncomeReads> {
  const found: NiIncomeReads = {};
  for (let offset = 0; ; offset += pageSize) {
    const page = await fetchPage(offset, pageSize);
    if (page.error) throw new Error(page.error);
    const reads = latestCompleteIncomeReads(page.jobs, roles);
    for (const r of roles) if (!found[r] && reads[r]) found[r] = reads[r];
    if (roles.every(r => found[r]) || page.jobs.length < pageSize) return found;
  }
}

/** מצב השליפה של לקוח אחד. `key` מזהה (לקוח + תפקידים) — מצב של לקוח אחר אינו שלו. */
export type IncomeEvidenceState =
  | { key: string; status: 'ready'; reads: NiIncomeReads }
  | { key: string; status: 'error' };

export const incomeEvidenceKey = (clientId: string, roles: readonly PersonRole[]) => `${clientId}|${roles.join(',')}`;

type CompleteRead = Extract<NiIncomeRead, { ok: true }>;
const isComplete = (r: NiIncomeRead | undefined): r is CompleteRead => !!r && r.ok && r.complete;
const readTime = (r: CompleteRead) => r.readAt ?? '';

/**
 * החדשה מבין שתי קריאות **שלמות** (לפי מועד הקריאה). חסרה / חלקית / נכשלה
 * לעולם אינה דוחקת שלמה. תיקו ⇒ `b` (זו שנצפתה מאוחר יותר).
 */
export function newestComplete(a: NiIncomeRead | undefined, b: NiIncomeRead | undefined): CompleteRead | undefined {
  const A = isComplete(a) ? a : undefined;
  const B = isComplete(b) ? b : undefined;
  if (!A) return B;
  if (!B) return A;
  return readTime(B) >= readTime(A) ? B : A;
}

/**
 * הזיכרון של המסך: הקריאה השלמה האחרונה שנצפתה לכל אדם (ממשימה חיה). ‼ כשמשימה
 * B מחליפה את A — בתור, רצה, רק לבן/בת הזוג, או עם מקטע הכנסות שנכשל — הראיה
 * של A נשארת. אותו אובייקט מוחזר כשאין שינוי (יציבות לרינדור).
 */
export function retainCompleteReads(prev: NiIncomeReads, incoming: NiIncomeReads, roles: readonly PersonRole[]): NiIncomeReads {
  let out = prev;
  for (const r of roles) {
    const next = newestComplete(prev[r], incoming[r]);
    if (next && next !== prev[r]) out = { ...out, [r]: next };
  }
  return out;
}

/**
 * מה נמסר למסכים. ‼ הכלל: ערך אוטומטי אינו מאומת בזמן שנשלפת הראיה או כשהשליפה
 * נכשלה — לא לפני שהגיעה, ולא מצב של לקוח אחר.
 *   · הקריאה השלמה **החדשה ביותר** לכל אדם — מההיסטוריה, מהזיכרון של המסך או
 *     מהמשימה החיה — גוברת, גם בטעינה. היסטוריה שהגיעה באיחור לא דורסת קריאה
 *     חיה חדשה ממנה.
 *   · אחרת: טעינה/שגיאה ⇒ סמן; מוכן ⇒ «אין ראיה».
 */
export function deriveIncomeReads(args: {
  clientId: string | undefined;
  roles: readonly PersonRole[];
  state: IncomeEvidenceState | null;
  liveReads: NiIncomeReads;
  /** קריאות שלמות שנצפו במסך הזה (retainCompleteReads) — של הלקוח הזה בלבד. */
  retained?: NiIncomeReads;
}): NiIncomeReads {
  const { clientId, roles, state, liveReads, retained = {} } = args;
  if (!clientId) return {};
  const mine = state && state.key === incomeEvidenceKey(clientId, roles) ? state : null;
  const out: NiIncomeReads = {};
  for (const r of roles) {
    const history = mine?.status === 'ready' ? mine.reads[r] : undefined;
    const best = newestComplete(newestComplete(history, retained[r]), liveReads[r]);
    if (best) out[r] = best;
    else if (!mine) out[r] = { ok: false, unavailable: 'loading' };
    else if (mine.status === 'error') out[r] = { ok: false, unavailable: 'error' };
    else out[r] = mine.reads[r] ?? { ok: false };
  }
  return out;
}

/** הקריאות של המשימה החיה — רק אם היא של הלקוח הזה (הוק משימה עלול להחזיק את הקודמת). */
export function liveIncomeReads(
  clientId: string | undefined,
  liveJob: { clientId?: string; status: string; result?: unknown; finishedAt?: string; updatedAt?: string } | null | undefined,
): NiIncomeReads {
  if (!clientId || !liveJob || liveJob.clientId !== clientId) return {};
  return niIncomeReadsFromJob(liveJob);
}
