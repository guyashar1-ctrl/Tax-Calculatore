import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { createAutomationJob, cancelAutomationJob } from '../lib/automationJobs';
import { automationJobFromDb } from '../lib/dbMappers';
import {
  SHAAM_CONNECT_ACTION_TYPE,
  SHAAM_DISCONNECT_ACTION_TYPE,
  BTL_CONNECT_ACTION_TYPE,
  BTL_DISCONNECT_ACTION_TYPE,
} from '../types/automation';
import type { AutomationJob } from '../types/automation';
import { useShaamReadiness } from './shaamReadiness';

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
  | 'awaiting_nikui_auth'
  | 'ready';

/**
 * ‼ שלבים משלה, לא שימוש חוזר בשל שע״ם: לביטוח לאומי יש שכבת אימות **אחת**
 * (קוד משתמש + סיסמה + קוד חד-פעמי לנייד), ואין לה GMF/מע״מ/מגן. איחוד
 * שתי הרשויות לרשימת שלבים אחת היה יוצר מצבים שאי אפשר להגיע אליהם.
 */
export type BtlPhase =
  | 'worker_offline'
  | 'btl_disconnected'
  | 'opening'
  | 'awaiting_btl_auth'
  | 'ready';

export interface AuthorityConnectionState<P = AuthorityPhase> {
  phase: P;
  busy: boolean;
  /** הסבר מה לעשות עכשיו — מוצג כשיש פעולה אנושית ממתינה או תקלה. */
  message: string | null;
}

/**
 * מצב החיבור לרשויות עבור הכותרת. הדפדפן לא יכול לדבר עם העובד המקומי
 * ישירות, ולכן Supabase הוא הצינור: העובד מדווח, המסך קורא.
 *
 * ‼ שתי רשויות בלתי תלויות. שע״ם וביטוח לאומי הן שני חלונות, שני סשנים
 * ושתי נוריות — מצב של אחת לעולם אינו משפיע על השנייה.
 *
 * ‼ אין כאן שום מידע אימות — רק דגל "מחובר" וחותמת זמן.
 */
export function useAuthorityConnections(userId: string | undefined) {
  const readiness = useShaamReadiness();
  const { status, workerOffline } = readiness;
  const [shaamJob, setShaamJob] = useState<AutomationJob | null>(null);
  const [btlJob, setBtlJob] = useState<AutomationJob | null>(null);
  const [busy, setBusy] = useState<'shaam' | 'btl' | null>(null);
  // ‼ השגיאה נושאת איתה את שם הרשות. `busy` אינו מספיק: הוא מתאפס באותה
  // מנת עדכון שבה השגיאה נקבעת, ולכן ברגע הרינדור כבר אי אפשר לדעת ממנו מי
  // נכשל — וכשל של ביטוח לאומי היה מוצג ככשל של שע״ם.
  const [uiError, setUiError] = useState<{ authority: 'shaam' | 'btl'; text: string } | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  // ‼ המוכנות **אינה** נקראת כאן. היא מגיעה מ-ShaamReadinessProvider, מקור
  // האמת היחיד שגם פקדי השדות קוראים ממנו. כשהיו שני מקורות, הכותרת הייתה
  // ירוקה בזמן שהפקד בשדה הכריז "לא מוכן". כאן נשארות רק משימות ההתחברות.
  const refresh = useCallback(async () => {
    if (!userId) return;
    // ‼ שאילתה אחת לשתי הרשויות. האינדקס הייחודי על משימת מערכת פתוחה מבטיח
    // לכל היותר אחת פתוחה לכל action_type, ולכן די בראשונה שמתאימה.
    const jobRes = await supabase.from('automation_jobs').select('*')
      .is('client_id', null)
      .in('action_type', [SHAAM_CONNECT_ACTION_TYPE, BTL_CONNECT_ACTION_TYPE])
      .in('status', ['queued', 'running', 'needs_human'])
      .order('created_at', { ascending: false });
    const rows = (jobRes.data ?? []).map(automationJobFromDb);
    setShaamJob(rows.find((j) => j.actionType === SHAAM_CONNECT_ACTION_TYPE) ?? null);
    setBtlJob(rows.find((j) => j.actionType === BTL_CONNECT_ACTION_TYPE) ?? null);
    await readiness.refresh();
  }, [userId, readiness]);

  useEffect(() => {
    void refresh();
    if (timer.current) clearInterval(timer.current);
    timer.current = setInterval(() => { void refresh(); }, POLL_MS);
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [refresh]);

  // ‼ ירוק = **כל ארבע** השכבות מוכנות. פורטל מאומת לבדו אינו "מוכן": כל
  // אוטומציה אמיתית תיתקל אחריו בקיר סיסמה של אחת ממערכות ה-Tier-B.
  const shaamAlive = !!status.shaam?.connected;
  const gmfReady = !!status.gmf?.ready;
  const vatReady = !!status.vat?.ready;
  // ‼ אותו ערך בדיוק שפקדי השדות קוראים — לא חישוב מקביל.
  const ready = readiness.ready;
  // ‼ לביטוח לאומי אין שכבות משנה, ולכן "מחובר" הוא כל הסיפור.
  const btlConnected = !workerOffline && !!status.btl?.connected;

  // ‼ ברגע שהחיבור הושלם, משימת ה"התחברות" שנותרה פתוחה כבר לא מתארת כלום —
  // והיא חוסמת יצירת משימה חדשה (אינדקס ייחודי על משימה פתוחה אחת). בלי
  // הניקוי הזה הלחיצה הבאה על הכפתור הייתה מחזירה את אותה משימה ישנה ולא
  // עושה כלום — כפתור שנראה תקין ולא מגיב.
  useEffect(() => {
    if (ready && shaamJob && shaamJob.status === 'needs_human') {
      void cancelAutomationJob(shaamJob.id).then(() => refresh());
    }
  }, [ready, shaamJob, refresh]);

  useEffect(() => {
    if (btlConnected && btlJob && btlJob.status === 'needs_human') {
      void cancelAutomationJob(btlJob.id).then(() => refresh());
    }
  }, [btlConnected, btlJob, refresh]);

  // ‼ מצב החיבור שהעובד מדווח גובר על סטטוס המשימה: אחרי שהרו"ח משלים שלב,
  // העובד ממשיך לשכבה הבאה לבד בעוד המשימה הישנה עדיין תקועה על השלב הקודם.
  // בלי הקדימות הזאת הכותרת הייתה מציגה שלב שכבר עבר.
  const phase: AuthorityPhase =
    workerOffline ? 'worker_offline'
      : ready ? 'ready'
        : shaamAlive
          ? (!gmfReady ? 'awaiting_gmf_auth' : !vatReady ? 'awaiting_vat_auth' : 'awaiting_nikui_auth')
          : shaamJob?.status === 'needs_human'
            ? (shaamJob.errorCode === 'awaiting_vat_auth' ? 'awaiting_vat_auth'
              : shaamJob.errorCode === 'awaiting_nikui_auth' ? 'awaiting_nikui_auth'
                : shaamJob.errorCode === 'awaiting_gmf_auth' ? 'awaiting_gmf_auth'
                : 'awaiting_shaam_auth')
            : shaamJob ? 'opening'
              : 'shaam_disconnected';

  // ‼ אותה קדימות בדיוק: אחרי שהרו"ח סיים להזין את הקוד החד-פעמי, העובד
  // רואה סשן חי בסבב הבא — גם אם המשימה עדיין תקועה על "ממתין לך".
  const btlPhase: BtlPhase =
    workerOffline ? 'worker_offline'
      : btlConnected ? 'ready'
        : btlJob?.status === 'needs_human' ? 'awaiting_btl_auth'
          : btlJob ? 'opening'
            : 'btl_disconnected';

  // משימה תקועה מסבב קודם — מנקים לפני שיוצרים חדשה, אחרת האינדקס
  // הייחודי יחזיר את הישנה והעובד לא ירים כלום.
  const start = useCallback(async (
    authority: 'shaam' | 'btl',
    actionType: string,
    open: AutomationJob | null,
    clearStale: boolean,
  ) => {
    setBusy(authority);
    setUiError(null);
    if (clearStale && open && (open.status === 'needs_human' || open.status === 'queued')) {
      await cancelAutomationJob(open.id);
    }
    const r = await createAutomationJob(null, actionType, {});
    setBusy(null);
    if (!r.ok) setUiError({ authority, text: r.error ?? 'לא הצלחתי ליצור את הפעולה' });
    await refresh();
    return r;
  }, [refresh]);

  const connect = useCallback(
    () => start('shaam', SHAAM_CONNECT_ACTION_TYPE, shaamJob, true),
    [start, shaamJob],
  );
  const disconnect = useCallback(
    () => start('shaam', SHAAM_DISCONNECT_ACTION_TYPE, null, false),
    [start],
  );
  const connectBtl = useCallback(
    () => start('btl', BTL_CONNECT_ACTION_TYPE, btlJob, true),
    [start, btlJob],
  );
  const disconnectBtl = useCallback(
    () => start('btl', BTL_DISCONNECT_ACTION_TYPE, null, false),
    [start],
  );

  const message =
    (uiError?.authority === 'shaam' ? uiError.text : null)
      ?? ((phase === 'awaiting_shaam_auth' || phase === 'awaiting_gmf_auth'
        || phase === 'awaiting_vat_auth' || phase === 'awaiting_nikui_auth')
        ? (shaamJob?.needsHuman ?? null) : null)
      ?? (shaamJob?.status === 'failed' ? (shaamJob.errorDetail ?? null) : null);

  const btlMessage =
    (uiError?.authority === 'btl' ? uiError.text : null)
      ?? (btlPhase === 'awaiting_btl_auth' ? (btlJob?.needsHuman ?? null) : null)
      ?? (btlJob?.status === 'failed' ? (btlJob.errorDetail ?? null) : null);

  return {
    shaam: { phase, busy: busy === 'shaam', message } as AuthorityConnectionState,
    btl: { phase: btlPhase, busy: busy === 'btl', message: btlMessage } as AuthorityConnectionState<BtlPhase>,
    connect,
    disconnect,
    connectBtl,
    disconnectBtl,
    refresh,
  };
}
