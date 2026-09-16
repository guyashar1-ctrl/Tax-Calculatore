// ─── מודל המצב של נוריות החיבור בכותרת — לוגיקה טהורה, בלי React ──────────
// מופרד מ-useAuthorityConnections כדי שאפשר יהיה להריץ עליו בדיקות ב-node
// (scripts/test-authority-connection-model.ts) בלי דפדפן ובלי Supabase.
// ההוק רק שולף, מחזיק state וקורא לכאן.

import type { AutomationJob, AutomationJobStatus } from '../types/automation';
import { jobIsLive } from '../lib/automationJobLease.ts';

/**
 * ‼ חמישה מצבים בלבד, ולכל אחד צבע אחד — ראה
 * docs/SPEC-HEADER-CONNECTION-CONTROLS.md. כתום הוא **אך ורק** "PIVO עצרה
 * וממתינה לך, בחלון שפתחת בעצמך". מוכנות חלקית שנצפית פסיבית (פורטל חי אבל
 * GMF/מע״מ/מגן עוד לא), משימת needs_human ישנה, "מתחבר", ו"נכשל" — כולם
 * אפור. אין מצב שישי.
 */
export type ConnPhase = 'idle' | 'connecting' | 'needs_you' | 'ready' | 'failed';

export interface DerivedConnState {
  phase: ConnPhase;
  /** רק ב-needs_you: איזו הוראה להראות (awaiting_shaam_auth / awaiting_gmf_auth / ...). */
  errorCode: string | null;
  /** רק ב-failed: משפט קריא-לאדם מהעובד, אם יש. */
  errorDetail: string | null;
  /** true כש-failed נגזר מ"העובד לא הגיב בזמן", לא מכשל מדווח. */
  isTimeout: boolean;
}

/**
 * ‼ משימת needs_human ישנה יותר מזה היא היסטוריה, לא מצב — לא הופכת עמוד
 * טרי לכתום. נדיב בכוונה: תהליך אימות אמיתי (כרטיס חכם + PIN + ניווט בין
 * שלוש מערכות Tier-B) יכול לקחת כמה דקות בעומס.
 */
export const NEEDS_YOU_MAX_AGE_MS = 20 * 60_000;
/** queued/running מעל זה בלי שהעובד הגיב — זו תקלה (timeout), לא "מתחבר...". */
export const CONNECTING_TIMEOUT_MS = 45_000;
/**
 * כמה אחורה שולפים משימות **failed** — לא כל ההיסטוריה. ל-failed אין חסם
 * כמות (האינדקס הייחודי חל רק על משימות פתוחות), ולכן חלון זמן הוא ההגנה.
 */
export const FAILED_LOOKBACK_MS = 30 * 60_000;

/**
 * ‼ משימה פתוחה נטענת **תמיד**, בלי קשר לגיל. זה הלקח מרגרסיית שע״ם של
 * ספטמבר 2026: הכותרת סיננה לפי 30 דקות, אבל האינדקס הייחודי במסד עדיין
 * ראה משימת needs_human בת 13 ימים כ"פתוחה". create_automation_job החזיר
 * אותה במקום ליצור חדשה, הכותרת לא הכירה אותה ולכן לא ביטלה אותה — ולחיצה
 * על «שע״ם» לא עשתה כלום, לצמיתות. יש לכל היותר משימה פתוחה אחת לרשות
 * (automation_jobs_open_system_unique), ולכן אין כאן סיכון של שליפה גדולה.
 */
export const OPEN_JOB_STATUSES: readonly AutomationJobStatus[] = ['queued', 'running', 'needs_human'];

export function failedCutoffIso(now: number = Date.now()): string {
  return new Date(now - FAILED_LOOKBACK_MS).toISOString();
}

/**
 * מסנן PostgREST לשאילתה אחת: כל משימה פתוחה, ובנוסף failed מהחלון בלבד.
 * מחרוזת אחת, בקשה אחת — לא שתי משיכות בכל poll (ראה סופת הבקשות
 * ב-docs/AUDIT-STATE-CONSISTENCY-2026-09-04.md).
 */
export function jobStatusFilter(now: number = Date.now()): string {
  return `status.in.(${OPEN_JOB_STATUSES.join(',')}),and(status.eq.failed,created_at.gte.${failedCutoffIso(now)})`;
}

/**
 * המשימה שמייצגת רשות אחת מתוך תוצאת השליפה. פתוחה קודמת ל-failed: כל עוד
 * יש פתוחה, אי אפשר ליצור חדשה, ולכן היא **המצב** — גם אם היא ישנה ולא
 * מוצגת כתום. `rows` ממוינות מהחדשה לישנה.
 */
export function selectAuthorityJob(actionType: string, rows: AutomationJob[]): AutomationJob | null {
  const mine = rows.filter((j) => j.actionType === actionType);
  return mine.find((j) => OPEN_JOB_STATUSES.includes(j.status)) ?? mine[0] ?? null;
}

/**
 * לחיצה מפורשת חייבת לבטל את המשימה הפתוחה לפני יצירת חדשה — **בלי קשר
 * לגיל**, על כל שלושת הסטטוסים ש-cancel_automation_job מקבלת (170):
 * queued, needs_human, ו-running שהחכירה שלו פקעה (N5 — עובד שנהרג באמצע
 * ההתחברות השאיר משימה 'running' לנצח, והכפתור לא עשה כלום). running עם
 * חכירה חיה אינו מבוטל — העובד עדיין עשוי להשלים אותו.
 */
export function mustCancelBeforeStart(job: AutomationJob | null, now: number = Date.now()): boolean {
  if (!job) return false;
  if (job.status === 'needs_human' || job.status === 'queued') return true;
  return job.status === 'running' && !jobIsLive(job, now);
}

export interface DeriveInput {
  connected: boolean;
  workerOffline: boolean;
  job: AutomationJob | null;
  localError: string | null;
  isOwnJobId: (id: string) => boolean;
  now?: number;
}

/**
 * ‼ גוזר את חמשת המצבים ממקור אחד: מוכנות (connected) קודמת לכול, אחר כך
 * עובד כבוי, אחר כך שגיאת יצירה מקומית, אחר כך המשימה שנשלפה. **אין** כאן
 * ענף שממפה "פורטל חי אבל שכבה חסרה" לכתום — זה בדיוק הצימוד הפסיבי שהוסר.
 */
export function derivePhase(input: DeriveInput): DerivedConnState {
  const { connected, workerOffline, job, localError, isOwnJobId } = input;
  const now = input.now ?? Date.now();
  const idle: DerivedConnState = { phase: 'idle', errorCode: null, errorDetail: null, isTimeout: false };

  if (connected) return { ...idle, phase: 'ready' };
  // ‼ עובד כבוי גובר על הכול: כתום/failed בלי עובד שיכול להשלים אותם הם
  // הבטחה שקרית ("פועל על זה עכשיו") כשאין מי שיפעל.
  if (workerOffline) return idle;
  if (localError) return { phase: 'failed', errorCode: null, errorDetail: localError, isTimeout: false };

  if (job) {
    const ageMs = now - new Date(job.createdAt).getTime();

    if (job.status === 'needs_human') {
      // ‼ כל לשונית רואה needs_you אם החלון באמת ממתין עכשיו — לא רק
      // הלשונית שלחצה. משימה ישנה מדי נופלת בשקט ל-idle: היא נטענת (כדי
      // שהלחיצה הבאה תבטל אותה), אבל לא מוצגת.
      if (ageMs <= NEEDS_YOU_MAX_AGE_MS) {
        return { phase: 'needs_you', errorCode: job.errorCode ?? null, errorDetail: null, isTimeout: false };
      }
    } else if (job.status === 'queued' || job.status === 'running') {
      // ‼ (170) 'running' שהחכירה שלו פקעה אינו "מתחבר..." — אף אחד לא
      // מחזיק אותו. הוא נופל ישר לענף ה-timeout/idle כמו משימה שהזדקנה,
      // גם אם עדיין בתוך חלון ה-timeout מבחינת גיל.
      if (ageMs <= CONNECTING_TIMEOUT_MS && jobIsLive(job, now)) return { ...idle, phase: 'connecting' };
      // ‼ העובד לא הגיב — זו תקלה, לא המתנה. מוצג רק למי שלחץ.
      if (isOwnJobId(job.id)) return { phase: 'failed', errorCode: 'timeout', errorDetail: null, isTimeout: true };
    } else if (job.status === 'failed') {
      // ‼ כשל אמיתי מוצג רק ללשונית שיזמה אותו — כשל היסטורי/של לשונית
      // אחרת לא אמור להטריד טעינה טרייה.
      if (isOwnJobId(job.id)) {
        return { phase: 'failed', errorCode: job.errorCode ?? null, errorDetail: job.errorDetail ?? null, isTimeout: false };
      }
    }
  }

  return idle;
}
