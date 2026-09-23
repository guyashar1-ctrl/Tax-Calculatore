// ─── הפעלת משימת אוטומציה מלחיצה מפורשת — טהורה, עם תלויות מוזרקות ──────────
//
// ‼ 23.09.2026 · נולד מאירוע אמיתי: אחרי שידור לשע״ם שנעצר אחרי שכבר נגע
// (external_outcome_unknown / ambiguous_submit_result), הרו"ח לחץ שש פעמים על
// «שלח טופס חתום לשע״ם». כל לחיצה ביקשה מהשרת לבטל את המשימה הישנה **בלי**
// אישור — השרת סירב (כך צריך, 196), ההודעה נמחקה אחרי 2.5 שניות בפעימת
// הרענון, ומבחינת הרו"ח «לא קרה כלום». כאן יושב הכלל כולו, במקום אחד שנבדק:
//   · משימה פתוחה-אבל-לא-חיה ⇒ מבטלים (עם אישור, אם נדרש) ואז יוצרים חדשה.
//   · כל סירוב/כשל ⇒ תוצאה מפורשת עם קוד. אף פעם לא «יצרנו» כשלא נוצר.
//   · לחיצה אחת ⇒ לכל היותר משימה חדשה אחת. אין לולאה, אין ניסיון שני.

import type { AutomationJob } from '../types/automation';
import { OPEN_AUTOMATION_STATUSES } from '../types/automation';

export interface StartJobDeps {
  fetchLatest: (clientId: string, actionType: string) => Promise<{ job: AutomationJob | null; error?: string | null }>;
  cancel: (jobId: string, acknowledgeExternal: boolean) => Promise<{ ok: boolean; error?: string }>;
  create: (clientId: string, actionType: string, input: Record<string, unknown>) =>
    Promise<{ ok: boolean; error?: string; created?: boolean; job?: AutomationJob }>;
  isLive: (job: AutomationJob) => boolean;
}

export type StartJobCode =
  | 'created'              // נוצרה משימה חדשה
  | 'already_running'      // יש משימה חיה — הוחזרה, לא נוצרה שנייה
  | 'requires_acknowledgement' // הקודמת נגעה ברשות; צריך אישור מפורש
  | 'cancel_failed'        // לא ניתן היה לסגור את הקודמת — לא יוצרים
  | 'create_failed'
  | 'not_created'          // השרת החזיר משימה קיימת שאינה רצה
  | 'fetch_failed';

export interface StartJobResult {
  ok: boolean;
  code: StartJobCode;
  job?: AutomationJob;
  /** המשימה הקודמת שנסגרה בדרך (נשארת בהיסטוריה כ-cancelled). */
  replacedJobId?: string;
  error?: string;
}

export async function startAutomationJob(
  deps: StartJobDeps,
  { clientId, actionType, input, acknowledgeExternal = false }:
    { clientId: string; actionType: string; input: Record<string, unknown>; acknowledgeExternal?: boolean },
): Promise<StartJobResult> {
  const existing = await deps.fetchLatest(clientId, actionType);
  if (existing.error) return { ok: false, code: 'fetch_failed', error: existing.error };

  let replacedJobId: string | undefined;
  const prev = existing.job;
  if (prev && OPEN_AUTOMATION_STATUSES.has(prev.status) && !deps.isLive(prev)) {
    const c = await deps.cancel(prev.id, acknowledgeExternal === true);
    if (!c.ok) {
      // ‼ לא ממשיכים ליצירה: האינדקס הייחודי היה מחזיר את הישנה, והלחיצה
      // הייתה «מצליחה» בלי שקרה דבר.
      return c.error === 'external_attempt_requires_acknowledgement'
        ? { ok: false, code: 'requires_acknowledgement', job: prev, error: c.error }
        : { ok: false, code: 'cancel_failed', job: prev, error: c.error };
    }
    replacedJobId = prev.id;
  }

  const r = await deps.create(clientId, actionType, input);
  if (!r.ok) return { ok: false, code: 'create_failed', error: r.error, replacedJobId };
  if (!r.created) {
    const running = !!r.job && (r.job.status === 'queued' || r.job.status === 'running');
    return running
      ? { ok: true, code: 'already_running', job: r.job, replacedJobId }
      : { ok: false, code: 'not_created', job: r.job, replacedJobId };
  }
  return { ok: true, code: 'created', job: r.job, replacedJobId };
}

/** המשפט שהרו"ח רואה — נשאר על המסך עד הלחיצה הבאה. */
export function startJobMessage(r: StartJobResult): string | null {
  switch (r.code) {
    case 'created': return null;
    case 'already_running': return null;
    case 'requires_acknowledgement':
      return 'הניסיון הקודם נעצר אחרי שהתחיל לפעול מול שע״ם. כדי לנסות שוב — אשרו זאת במפורש («כן, נסה שוב»).';
    case 'cancel_failed':
      return `לא ניתן היה לסגור את הניסיון הקודם (${r.error ?? 'לא ידוע'}), ולכן לא נפתח ניסיון חדש.`;
    case 'create_failed':
      return `לא נפתח ניסיון חדש: ${r.error ?? 'שגיאה לא ידועה'}`;
    case 'not_created':
      return 'לא נפתח ניסיון חדש — משימה קודמת עדיין פתוחה. רעננו את הדף ונסו שוב.';
    case 'fetch_failed':
      return `לא הצלחתי לקרוא את מצב המשימה (${r.error ?? 'לא ידוע'}). שום דבר לא הופעל.`;
    default:
      return null;
  }
}
