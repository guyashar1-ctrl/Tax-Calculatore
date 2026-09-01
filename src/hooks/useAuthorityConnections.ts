import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { createAutomationJob, cancelAutomationJob } from '../lib/automationJobs';
import { automationWorkerFromDb, automationJobFromDb } from '../lib/dbMappers';
import {
  SHAAM_CONNECT_ACTION_TYPE,
  SHAAM_DISCONNECT_ACTION_TYPE,
  WORKER_STALE_AFTER_MS,
} from '../types/automation';
import type { AutomationJob, AutomationWorkerStatus } from '../types/automation';

const POLL_MS = 4000;

/**
 * ‼ ארבעה מצבים, לא שניים. "לא ירוק" לבדו לא אומר לרו"ח מה לעשות:
 * מחשב כבוי, מחובר-אך-לא-מאומת, וממתין-לאימות-שלך הם שלוש פעולות שונות.
 */
export type AuthorityPhase =
  | 'worker_offline'
  | 'shaam_disconnected'
  | 'opening'
  | 'awaiting_shaam_auth'
  | 'awaiting_gmf_auth'
  | 'awaiting_vat_auth'
  | 'ready';

export interface AuthorityConnectionState {
  phase: AuthorityPhase;
  busy: boolean;
  /** הסבר מה לעשות עכשיו — מוצג כשיש פעולה אנושית ממתינה או תקלה. */
  message: string | null;
}

/**
 * מצב החיבור לרשויות עבור הכותרת. הדפדפן לא יכול לדבר עם העובד המקומי
 * ישירות, ולכן Supabase הוא הצינור: העובד מדווח, המסך קורא.
 *
 * ‼ אין כאן שום מידע אימות — רק דגל "מחובר" וחותמת זמן.
 */
export function useAuthorityConnections(userId: string | undefined) {
  const [status, setStatus] = useState<AutomationWorkerStatus>({});
  const [workerOffline, setWorkerOffline] = useState(true);
  const [job, setJob] = useState<AutomationJob | null>(null);
  const [busy, setBusy] = useState(false);
  const [uiError, setUiError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    if (!userId) return;
    const [workerRes, jobRes] = await Promise.all([
      supabase.from('automation_workers').select('*')
        .order('last_seen_at', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('automation_jobs').select('*')
        .is('client_id', null)
        .eq('action_type', SHAAM_CONNECT_ACTION_TYPE)
        .in('status', ['queued', 'running', 'needs_human'])
        .order('created_at', { ascending: false }).limit(1).maybeSingle(),
    ]);

    const w = workerRes.data ? automationWorkerFromDb(workerRes.data) : null;
    const stale = !w || !(Date.now() - new Date(w.lastSeenAt).getTime() < WORKER_STALE_AFTER_MS);
    setWorkerOffline(stale);
    setStatus(stale ? {} : (w?.status ?? {}));
    setJob(jobRes.data ? automationJobFromDb(jobRes.data) : null);
  }, [userId]);

  useEffect(() => {
    void refresh();
    if (timer.current) clearInterval(timer.current);
    timer.current = setInterval(() => { void refresh(); }, POLL_MS);
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [refresh]);

  // ‼ ירוק = **שתי** השכבות מוכנות. פורטל מאומת לבדו אינו "מוכן": כל
  // אוטומציה אמיתית תיתקל אחריו בקיר הסיסמה של מערכת הגבייה.
  const shaamAlive = !!status.shaam?.connected;
  const gmfReady = !!status.gmf?.ready;
  const vatReady = !!status.vat?.ready;
  const ready = shaamAlive && gmfReady && vatReady;

  // ‼ ברגע שהחיבור הושלם, משימת ה"התחברות" שנותרה פתוחה כבר לא מתארת כלום —
  // והיא חוסמת יצירת משימה חדשה (אינדקס ייחודי על משימה פתוחה אחת). בלי
  // הניקוי הזה הלחיצה הבאה על הכפתור הייתה מחזירה את אותה משימה ישנה ולא
  // עושה כלום — כפתור שנראה תקין ולא מגיב.
  useEffect(() => {
    if (ready && job && job.status === 'needs_human') {
      void cancelAutomationJob(job.id).then(() => refresh());
    }
  }, [ready, job, refresh]);

  // ‼ מצב החיבור שהעובד מדווח גובר על סטטוס המשימה: אחרי שהרו"ח מקליד PIN
  // העובד ממשיך ל-GMF לבד, והמשימה הישנה עדיין תקועה על "ממתין לאישור
  // הפורטל". בלי הקדימות הזאת הכותרת הייתה מציגה שלב שכבר עבר.
  // ‼ מצב החיבור שהעובד מדווח גובר על סטטוס המשימה: אחרי שהרו"ח מקליד
  // סיסמה העובד ממשיך לשכבה הבאה לבד, והמשימה הישנה עדיין תקועה על השלב
  // הקודם. בלי הקדימות הזאת הכותרת הייתה מציגה שלב שכבר עבר.
  const phase: AuthorityPhase =
    workerOffline ? 'worker_offline'
      : ready ? 'ready'
        : shaamAlive ? (gmfReady ? 'awaiting_vat_auth' : 'awaiting_gmf_auth')
          : job?.status === 'needs_human'
            ? (job.errorCode === 'awaiting_vat_auth' ? 'awaiting_vat_auth'
              : job.errorCode === 'awaiting_gmf_auth' ? 'awaiting_gmf_auth'
                : 'awaiting_shaam_auth')
            : job ? 'opening'
              : 'shaam_disconnected';

  const connect = useCallback(async () => {
    setBusy(true);
    setUiError(null);
    // משימה תקועה מסבב קודם — מנקים לפני שיוצרים חדשה, אחרת האינדקס
    // הייחודי יחזיר את הישנה והעובד לא ירים כלום.
    if (job && (job.status === 'needs_human' || job.status === 'queued')) {
      await cancelAutomationJob(job.id);
    }
    const r = await createAutomationJob(null, SHAAM_CONNECT_ACTION_TYPE, {});
    setBusy(false);
    if (!r.ok) setUiError(r.error ?? 'לא הצלחתי ליצור את הפעולה');
    await refresh();
    return r;
  }, [job, refresh]);

  const disconnect = useCallback(async () => {
    setBusy(true);
    setUiError(null);
    const r = await createAutomationJob(null, SHAAM_DISCONNECT_ACTION_TYPE, {});
    setBusy(false);
    if (!r.ok) setUiError(r.error ?? 'לא הצלחתי ליצור את הפעולה');
    await refresh();
    return r;
  }, [refresh]);

  const message =
    uiError
      ?? ((phase === 'awaiting_shaam_auth' || phase === 'awaiting_gmf_auth'
        || phase === 'awaiting_vat_auth')
        ? (job?.needsHuman ?? null) : null)
      ?? (job?.status === 'failed' ? (job.errorDetail ?? null) : null);

  return {
    shaam: { phase, busy, message } as AuthorityConnectionState,
    connect,
    disconnect,
    refresh,
  };
}
