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

  /**
   * ‼ לחיצה מפורשת פירושה «הרץ עכשיו», ולכן משימה מתה חוסמת אותה.
   *
   * create_automation_job מוגנת באינדקס ייחודי על משימה **פתוחה** אחת לכל
   * (לקוח, פעולה) — ו-needs_human נחשב פתוח. לכן לחיצה על לקוח שיש לו
   * needs_human מסבב קודם החזירה את המשימה הישנה (created=false) במקום
   * ליצור חדשה: הכפתור לא נכנס לטעינה (הסטטוס אינו queued/running),
   * וההודעה הישנה כבר התיישנה ולכן הוסתרה — כלומר **לחיצה שלא עשתה כלום
   * ולא אמרה כלום**. קרה בייצור עם משימה בת שש שעות.
   *
   * needs_human הוא מבוי סתום: הוא ממתין לאדם, והאדם בדיוק לחץ. מבטלים
   * אותו ויוצרים חדשה. משימה שבאמת רצה (queued/running) לא מבוטלת — שם
   * החזרת הקיימת היא ההתנהגות הנכונה, והכפתור מציג «⋯».
   */
  const run = useCallback(async (input: Record<string, unknown> = {}) => {
    if (!clientId) return { ok: false, error: 'no_client' };
    setBusy(true);
    setError(null);

    const existing = await fetchLatestAutomationJob(clientId, actionType);
    if (existing.job && existing.job.status === 'needs_human') {
      await cancelAutomationJob(existing.job.id);
    }

    const r = await createAutomationJob(clientId, actionType, input);
    setBusy(false);
    if (!r.ok) {
      setError(r.error ?? 'שגיאה לא ידועה');
      return r;
    }
    if (r.job) setJob(r.job);
    // ‼ שקט אינו תוצאה. אם אחרי הכול לא נוצרה משימה חדשה ולא רצה שום דבר,
    // אומרים זאת במקום להיראות כאילו הלחיצה נקלטה.
    if (!r.created && r.job && !OPEN_AUTOMATION_STATUSES.has(r.job.status)) {
      setError('לא נפתחה קריאה חדשה — נסו שוב.');
    }
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
