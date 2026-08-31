import { useCallback, useEffect, useRef, useState } from 'react';
import type { AutomationJob } from '../types/automation';
import { OPEN_AUTOMATION_STATUSES } from '../types/automation';
import { createAutomationJob, cancelAutomationJob, fetchLatestAutomationJob } from '../lib/automationJobs';

const POLL_MS = 2500;

/**
 * משימת אוטומציה אחת: (לקוח, פעולה). מרעננת אוטומטית כל 2.5 שניות כל עוד
 * המשימה פתוחה (queued/running/needs_human) — בדיוק כמו הרענון השקט של
 * useOnboarding, כדי שהמסך לא יהבהב "טוען…" על כל פעימה.
 */
export function useAutomationJob(clientId: string | undefined, actionType: string) {
  const [job, setJob] = useState<AutomationJob | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const reload = useCallback(async (silent: boolean) => {
    if (!clientId) { setLoading(false); return; }
    if (!silent) setLoading(true);
    const { job: j, error: e } = await fetchLatestAutomationJob(clientId, actionType);
    if (e) { setError(e); setLoading(false); return; }
    setJob(j);
    setError(null);
    setLoading(false);
  }, [clientId, actionType]);

  useEffect(() => { void reload(false); }, [reload]);

  // ‼ פעימת רענון רק כשיש מה לחכות לו — משימה סגורה לא זקוקה לתשאול חוזר.
  useEffect(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    if (job && OPEN_AUTOMATION_STATUSES.has(job.status)) {
      pollRef.current = setInterval(() => { void reload(true); }, POLL_MS);
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [job, reload]);

  const run = useCallback(async (input: Record<string, unknown> = {}) => {
    if (!clientId) return { ok: false, error: 'no_client' };
    setBusy(true);
    const r = await createAutomationJob(clientId, actionType, input);
    setBusy(false);
    if (r.ok && r.job) setJob(r.job);
    else if (!r.ok) setError(r.error ?? 'שגיאה לא ידועה');
    return r;
  }, [clientId, actionType]);

  const cancel = useCallback(async () => {
    if (!job) return;
    setBusy(true);
    const r = await cancelAutomationJob(job.id);
    setBusy(false);
    if (r.ok && r.job) setJob(r.job);
    else if (!r.ok) setError(r.error ?? 'שגיאה לא ידועה');
  }, [job]);

  return { job, loading, error, busy, run, cancel, reload: () => reload(false) };
}
