import { useCallback, useEffect, useRef, useState } from 'react';
import type { AutomationJob } from '../types/automation';
import { OPEN_AUTOMATION_STATUSES } from '../types/automation';
import { createAutomationJob, cancelAutomationJob, fetchLatestAutomationJob, jobIsLive } from '../lib/automationJobs';

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
  // ‼ העותק העדכני של המשימה ל-callbacks — כדי שלא יבנו מחדש בכל פעימה.
  const jobRef = useRef<AutomationJob | null>(null);
  jobRef.current = job;

  // ‼ `actionType` ריק = לרשות הזו אין עדיין פעולה אוטומטית. ההוק נקרא
  // בכל זאת (סדר ההוקים חייב להיות קבוע), אבל אינו שולח שאילתה ואינו מריץ.
  const reload = useCallback(async (silent: boolean) => {
    if (!clientId || !actionType) { setLoading(false); return; }
    if (!silent) setLoading(true);
    const { job: j, error: e } = await fetchLatestAutomationJob(clientId, actionType);
    if (e) { setError(e); setLoading(false); return; }
    // שומרים זהות כשלא השתנה דבר — פעימה שקטה לא מרנדרת.
    setJob(prev => (JSON.stringify(prev) === JSON.stringify(j) ? prev : j));
    setError(null);
    setLoading(false);
  }, [clientId, actionType]);

  useEffect(() => { void reload(false); }, [reload]);

  // ‼ פעימת רענון רק כשיש מה לחכות לו — משימה סגורה לא זקוקה לתשאול חוזר.
  // ‼ התלות היא "האם פתוחה" ולא אובייקט המשימה: קודם כל פעימה שהחזירה אובייקט
  // חדש פירקה ובנתה את הטיימר מחדש — ולכן הוא לא פעם אף פעם בקצב שנקבע.
  const isOpen = !!job && OPEN_AUTOMATION_STATUSES.has(job.status);
  useEffect(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    if (isOpen) {
      pollRef.current = setInterval(() => {
        if (document.visibilityState !== 'visible') return;
        void reload(true);
      }, POLL_MS);
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [isOpen, reload]);

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
   * אותו ויוצרים חדשה. משימה שבאמת רצה (חיה — ראה jobIsLive) לא מבוטלת —
   * שם החזרת הקיימת היא ההתנהגות הנכונה, והכפתור מציג «⋯».
   *
   * ‼ (170) אותו דין ל-'running' שהחכירה שלו פקעה: עובד שנהרג באמצע השאיר
   * את המשימה 'running' לנצח, האינדקס הייחודי חסם משימה חדשה, והכפתור
   * הפך לכפתור שלא עושה כלום. הכלל האחד: פתוחה-אבל-לא-חיה ⇒ בטל ואז נסה שוב.
   */
  /**
   * @param opts.acknowledgeExternal 196 — הרו"ח ראה שהפעולה כבר נגעה בשע״ם
   *   ובכל זאת בחר לנסות שוב. בלי זה השרת דוחה את הביטול, ולכן גם לא
   *   תיווצר משימה חדשה: «בטל-ואז-נסה-שוב» השקט לא יכול להוליד פנייה שנייה.
   */
  const run = useCallback(async (
    input: Record<string, unknown> = {},
    opts: { acknowledgeExternal?: boolean } = {},
  ) => {
    if (!clientId) return { ok: false, error: 'no_client' };
    if (!actionType) return { ok: false, error: 'no_action_type' };
    setBusy(true);
    setError(null);

    const existing = await fetchLatestAutomationJob(clientId, actionType);
    if (existing.job && OPEN_AUTOMATION_STATUSES.has(existing.job.status) && !jobIsLive(existing.job)) {
      const c = await cancelAutomationJob(existing.job.id, opts.acknowledgeExternal === true);
      // ‼ הסירוב הזה הוא תכונה, לא תקלה: המשימה כבר נגעה בשע״ם, והמסך
      // חייב להציג לרו"ח מה קרה לפני שמותר לנסות שוב.
      if (!c.ok && c.error === 'external_attempt_requires_acknowledgement') {
        setBusy(false);
        setError('הפעולה הזו כבר נוסתה מול שע״ם ולא ידוע אם נקלטה. בדקו מה נקלט לפני ניסיון נוסף.');
        return { ok: false, error: 'external_attempt_requires_acknowledgement' };
      }
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
    const current = jobRef.current;
    if (!current) return;
    setBusy(true);
    const r = await cancelAutomationJob(current.id);
    setBusy(false);
    if (r.ok && r.job) setJob(r.job);
    else if (!r.ok) setError(r.error ?? 'שגיאה לא ידועה');
  }, []);

  return { job, loading, error, busy, run, cancel, reload: () => reload(false) };
}
