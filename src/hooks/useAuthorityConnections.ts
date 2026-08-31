import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { createAutomationJob } from '../lib/automationJobs';
import { automationWorkerFromDb } from '../lib/dbMappers';
import {
  SHAAM_CONNECT_ACTION_TYPE,
  SHAAM_DISCONNECT_ACTION_TYPE,
  WORKER_STALE_AFTER_MS,
} from '../types/automation';
import type { AutomationWorkerStatus } from '../types/automation';

const POLL_MS = 5000;

export interface AuthorityConnectionState {
  /** ירוק בכותרת. */
  connected: boolean;
  /** אין עובד מקומי חי — אי אפשר לדעת כלום, וגם אי אפשר להתחבר. */
  workerOffline: boolean;
  busy: boolean;
  /** הודעה אחרונה מהעובד כשנדרשת פעולה אנושית (אישור/PIN). */
  pendingMessage: string | null;
}

/**
 * מצב החיבור לרשויות עבור הכותרת. קורא את מה שהעובד המקומי מדווח —
 * הדפדפן לא יכול לדבר עם העובד ישירות, ולכן Supabase הוא הצינור.
 *
 * ‼ אין כאן שום מידע אימות. רק דגל "מחובר" וחותמת זמן.
 */
export function useAuthorityConnections(userId: string | undefined) {
  const [status, setStatus] = useState<AutomationWorkerStatus>({});
  const [workerOffline, setWorkerOffline] = useState(true);
  const [busy, setBusy] = useState(false);
  const [pendingMessage, setPendingMessage] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    if (!userId) return;
    const { data, error } = await supabase
      .from('automation_workers')
      .select('*')
      .order('last_seen_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error || !data) { setWorkerOffline(true); setStatus({}); return; }
    const w = automationWorkerFromDb(data);
    const age = Date.now() - new Date(w.lastSeenAt).getTime();
    const stale = !(age < WORKER_STALE_AFTER_MS);
    setWorkerOffline(stale);
    setStatus(stale ? {} : (w.status ?? {}));
  }, [userId]);

  useEffect(() => {
    void refresh();
    if (timer.current) clearInterval(timer.current);
    timer.current = setInterval(() => { void refresh(); }, POLL_MS);
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [refresh]);

  /** משימת מערכת — בלי לקוח. ראה supabase/153. */
  const runSystemJob = useCallback(async (actionType: string) => {
    setBusy(true);
    setPendingMessage(null);
    const r = await createAutomationJob(null, actionType, {});
    setBusy(false);
    if (!r.ok) setPendingMessage(r.error ?? 'הפעולה נכשלה');
    void refresh();
    return r;
  }, [refresh]);

  const connectShaam = useCallback(() => runSystemJob(SHAAM_CONNECT_ACTION_TYPE), [runSystemJob]);
  const disconnectShaam = useCallback(() => runSystemJob(SHAAM_DISCONNECT_ACTION_TYPE), [runSystemJob]);

  return {
    shaam: {
      connected: !!status.shaam?.connected,
      workerOffline,
      busy,
      pendingMessage,
    } as AuthorityConnectionState,
    connectShaam,
    disconnectShaam,
    refresh,
  };
}
