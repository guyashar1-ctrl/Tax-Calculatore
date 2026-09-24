import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { createAutomationJob, cancelAutomationJob, requestJobCancellation, deferJobCapability } from '../lib/automationJobs';
import { automationJobFromDb } from '../lib/dbMappers';
import {
  SHAAM_CONNECT_ACTION_TYPE,
  SHAAM_DISCONNECT_ACTION_TYPE,
  BTL_CONNECT_ACTION_TYPE,
  BTL_DISCONNECT_ACTION_TYPE,
} from '../types/automation';
import type { AutomationJob } from '../types/automation';
import { useShaamReadiness } from './shaamReadiness';
import { keepIfSame } from './useLivePulse';
import {
  derivePhase, jobStatusFilter, selectAuthorityJob, mustCancelBeforeStart,
} from './authorityConnectionModel';
import type { ConnPhase, DerivedConnState } from './authorityConnectionModel';

export type { ConnPhase };

const POLL_MS = 4000;

// ‼ חמשת המצבים, הספים והגזירה עצמה יושבים ב-authorityConnectionModel.ts —
// לוגיקה טהורה שנבדקת ב-node (scripts/test-authority-connection-model.ts).
// כאן רק שליפה, state, וקריאות RPC.

export interface AuthorityConnState extends DerivedConnState {
  busy: boolean;
  /** אין עובד, או שפעימת הלב שלו ישנה מדי. הצבע לא משתנה בגלל זה — רק ההסבר בלחיצה. */
  workerOffline: boolean;
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
  const { status, workerOffline, btlWorkerOffline } = readiness;
  const [shaamJob, setShaamJob] = useState<AutomationJob | null>(null);
  const [btlJob, setBtlJob] = useState<AutomationJob | null>(null);
  const [busy, setBusy] = useState<'shaam' | 'btl' | null>(null);
  // ‼ השגיאה נושאת איתה את שם הרשות. `busy` אינו מספיק: הוא מתאפס באותה
  // מנת עדכון שבה השגיאה נקבעת, ולכן ברגע הרינדור כבר אי אפשר לדעת ממנו מי
  // נכשל — וכשל של ביטוח לאומי היה מוצג ככשל של שע״ם. זו שגיאת יצירה
  // מקומית (ה-RPC עצמו נכשל) — לא נוצרה משימה כלל, ולכן אין לה job id.
  const [uiError, setUiError] = useState<{ authority: 'shaam' | 'btl'; text: string } | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  // ‼ "המשימה שאני התחלתי בלשונית הזאת" — לא job id כלשהו. משימת failed
  // ישנה שקיימת מסבב קודם (או מלשונית אחרת) לא אמורה לפתוח פופאובר כשל
  // בטעינה טרייה של העמוד. needs_you לעומת זאת מוצג לכל לשונית שרואה אותה
  // (חלון אמיתי ממתין, לא משנה מי לחץ) — ראה derivePhase.
  const shaamJobIdRef = useRef<string | null>(null);
  const btlJobIdRef = useRef<string | null>(null);

  // ‼ המוכנות **אינה** נקראת כאן. היא מגיעה מ-ShaamReadinessProvider, מקור
  // האמת היחיד שגם פקדי השדות קוראים ממנו. כשהיו שני מקורות, הכותרת הייתה
  // ירוקה בזמן שהפקד בשדה הכריז "לא מוכן". כאן נשארות רק משימות ההתחברות.
  /**
   * ‼ הפונקציה בלבד, לא אובייקט ההקשר. `readiness` נבנה מחדש בכל רינדור של
   * הספק, ולכן החזקתו ברשימת התלויות של useCallback יצרה refresh חדש בכל
   * משיכה — וה-effect שלמטה משך שוב מיד. לולאה בלי סוף, ~22 בקשות בשנייה
   * בכל מסך. `refresh` של הספק יציב (useCallback על userId), ולכן בטוח.
   * ראה docs/AUDIT-STATE-CONSISTENCY-2026-09-04.md §7.
   */
  const refreshReadiness = readiness.refresh;

  const refresh = useCallback(async () => {
    if (!userId) return;
    // ‼ שאילתה אחת לשתי הרשויות: **כל** משימה פתוחה (queued/running/
    // needs_human) בלי סינון גיל, ובנוסף failed מחלון מוגבל. חלון הזמן חל
    // על failed בלבד — משימה פתוחה שהוסתרה לפי גיל היא בדיוק מה שיצר את
    // מלכודת שע״ם (ראה OPEN_JOB_STATUSES במודל): המסד עדיין ראה אותה
    // כפתוחה וחסם יצירה, והכותרת לא ידעה שיש מה לבטל.
    const jobRes = await supabase.from('automation_jobs').select('*')
      .is('client_id', null)
      .in('action_type', [SHAAM_CONNECT_ACTION_TYPE, BTL_CONNECT_ACTION_TYPE])
      .or(jobStatusFilter())
      .order('created_at', { ascending: false });
    const rows = (jobRes.data ?? []).map(automationJobFromDb);
    // ‼ שומרים זהות כשהמשימה לא השתנתה: אובייקט חדש כל 4 שניות היה מריץ
    // מחדש את ה-effects שתלויים ב-shaamJob/btlJob ובונה מחדש את connect/connectBtl.
    // הבחירה עצמה (פתוחה קודמת ל-failed) עברה ל-selectAuthorityJob (מודל טהור).
    const nextShaam = selectAuthorityJob(SHAAM_CONNECT_ACTION_TYPE, rows);
    const nextBtl = selectAuthorityJob(BTL_CONNECT_ACTION_TYPE, rows);
    setShaamJob(prev => keepIfSame(prev, nextShaam));
    setBtlJob(prev => keepIfSame(prev, nextBtl));
    // ‼ המוכנות **אינה** נמשכת כאן. הספק מושך אותה בעצמו באותו קצב, ומשיכה
    // שנייה כאן רק הכפילה את התעבורה — וגם קשרה בין השניים, וזו הייתה
    // הלולאה. משיכה יזומה כן נשארת ב-start(), אחרי לחיצה אמיתית.
  }, [userId]);

  useEffect(() => {
    void refresh();
    if (timer.current) clearInterval(timer.current);
    // ‼ לשונית ברקע לא מושכת — כמו ב-ShaamReadinessProvider. בחזרה ללשונית
    // מושכים מיד, כי זה הרגע הכי סביר שהחלון שממתין לך כבר נסגר.
    timer.current = setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      void refresh();
    }, POLL_MS);
    const onVisible = () => { if (document.visibilityState === 'visible') void refresh(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      if (timer.current) clearInterval(timer.current);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refresh]);

  // ‼ תיקון מוצר (16.09.2026): ירוק = פורטל מאומת + החיבור הטרי עבר את שער
  // GMF (bootstrapped) — לא שארבע השכבות נבדקו. פעולה עסקית שדורשת
  // מע״מ/מגן/ייצוג עדיין נחסמת לבדה על השכבה שלה (capability() בספק), בלי
  // קשר לנורית הזו. אותו ערך בדיוק שפקדי השדות קוראים — לא חישוב מקביל.
  const ready = readiness.ready;
  // ‼ לביטוח לאומי אין שכבות משנה, ולכן "מחובר" הוא כל הסיפור.
  const btlConnected = !btlWorkerOffline && !!status.btl?.connected;

  // ‼ derivePhase עברה ל-authorityConnectionModel.ts (מודל טהור, נבדק ב-node
  // דרך scripts/test-authority-connection-model.ts) — כולל שמירת בדיקת
  // jobIsLive על running שהחכירה שלו פקעה (170/N5), שאוחדה לתוכה בסבב הזה.
  const shaamState = derivePhase({
    connected: ready,
    workerOffline,
    job: shaamJob,
    localError: uiError?.authority === 'shaam' ? uiError.text : null,
    isOwnJobId: (id) => shaamJobIdRef.current === id,
  });
  const btlState = derivePhase({
    connected: btlConnected,
    workerOffline: btlWorkerOffline,
    job: btlJob,
    localError: uiError?.authority === 'btl' ? uiError.text : null,
    isOwnJobId: (id) => btlJobIdRef.current === id,
  });

  // ‼ 168: הוסר במכוון — כאן ישב הבאג שפרק 16 מצביע עליו: הדפדפן ביטל job
  // שכבר "needs_human" ברגע ש-ready התהפך, על סמך **טבלה אחרת**
  // (automation_workers.status) ולא על סמך ראיית ה-job עצמו — מרוץ אמיתי
  // מול סיום ה-worker (שיכול לסיים את אותו job success באותו רגע ממש).
  // אין בכך צורך גם ללא המרוץ: ברגע ש-ready=true, derivePhase כבר מציג
  // 'ready' בלי קשר בכלל למצב ה-job (הענף הראשון בפונקציה). ניקוי job
  // תקוע-אבל-לא-מזיק קורה באופן עצלני ובטוח בלבד: ה-worker עצמו מחדש אותו
  // (resolve_needs_human_job, connectionMonitor.mjs) ברגע שהוא רואה עדות
  // ישירה שהאתגר נפתר; ואם בכל זאת נשאר תקוע, mustCancelBeforeStart+
  // clearStale ב-start() למטה מנקים אותו בלחיצה המפורשת הבאה — לא בפולינג.

  // ‼ queued/running שהזדקנה מעל CONNECTING_TIMEOUT_MS **לא** מבוטלת כאן
  // באופן יזום. ניסיון קודם עשה בדיוק את זה ונתקל בתקלה אמיתית: הביטול
  // עצמו מוציא את המשימה מסטטוסי ה-refresh (queued/running/needs_human/
  // failed — 'cancelled' אינו ביניהם), ולכן ה-failed שהרגע הוצג נעלם ברגע
  // ה-poll הבא וקורס בחזרה ל-idle — פופאובר שנפתח ונסגר מיד, בלי שהרו"ח
  // הספיק לקרוא אותו. במקום זה: המשימה התקועה נשארת queued/running בשקט,
  // ה-phase ממשיך לחשב 'failed'+isTimeout בעקביות מגילה בכל סבב (יציב, לא
  // מהבהב), וה-popover נשאר פתוח. הביטול קורה רק כשהרו"ח בפועל מבקש לנסות
  // שוב — start() כבר עושה את זה (clearStale) לפני יצירת המשימה הבאה.
  // אם עובד אמיתי בכל זאת תופס אותה מאוחר יותר, זה תקין: ההצלחה תתגלה
  // דרך readiness כרגיל, לא משנה מה הכותרת הראתה בינתיים.

  // הייחודי יחזיר את הישנה והעובד לא ירים כלום. ‼ `open` חייב להיות המשימה
  // הפתוחה **בלי קשר לגילה** — זה מה ש-refresh() מבטיח עכשיו. הביטול הוא
  // דרך cancel_automation_job בלבד; לא עוקפים את מחזור החיים. ‼ (170/N5)
  // mustCancelBeforeStart מבטלת גם 'running' שהחכירה שלו פקעה — עובד שנהרג
  // באמצע ההתחברות השאיר אותה 'running' לנצח, והכפתור לא עשה כלום.
  const start = useCallback(async (
    authority: 'shaam' | 'btl',
    actionType: string,
    open: AutomationJob | null,
    clearStale: boolean,
  ) => {
    setBusy(authority);
    setUiError(null);
    if (clearStale && open && mustCancelBeforeStart(open)) {
      await cancelAutomationJob(open.id);
    }
    const r = await createAutomationJob(null, actionType, {});
    setBusy(null);
    // ‼ נרשם גם כשהיא לא-חדשה (created:false, למשל אם שתי לחיצות התחרו):
    // מה שחשוב הוא שהלשונית הזאת "מכירה" את המשימה, לא מי בדיוק יצר אותה.
    if (r.ok && r.job) {
      if (authority === 'shaam') shaamJobIdRef.current = r.job.id;
      else btlJobIdRef.current = r.job.id;
    }
    if (!r.ok) setUiError({ authority, text: r.error ?? 'לא הצלחתי ליצור את הפעולה' });
    await Promise.all([refresh(), refreshReadiness()]);
    return r;
  }, [refresh, refreshReadiness]);

  const connect = useCallback(
    () => start('shaam', SHAAM_CONNECT_ACTION_TYPE, shaamJob, true),
    [start, shaamJob],
  );

  // ‼ 168: ביטול job שכבר running (בעוד ה-worker באמצע warm-up) — לא היה
  // אפשרי בכלל לפני 168 (cancel_automation_job מכוון בלעדית ל-queued/
  // needs_human). מבקש בלבד; ה-worker מסיים בעצמו בין capabilities.
  const cancelRunningShaam = useCallback(async () => {
    if (!shaamJob) return;
    await requestJobCancellation(shaamJob.id);
    await refresh();
  }, [shaamJob, refresh]);

  // ‼ "דלג כרגע" על capability בודדת מתוך ה-job הנוכחי — לא מבטל את כל
  // ההכנה, רק מסמן שאין טעם לחכות לזאת יותר. ה-worker לא בודק אותה שוב.
  const deferShaamCapability = useCallback(async (capability: string) => {
    if (!shaamJob) return;
    await deferJobCapability(shaamJob.id, capability);
    await refresh();
  }, [shaamJob, refresh]);
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

  return {
    shaam: { ...shaamState, busy: busy === 'shaam', workerOffline } as AuthorityConnState,
    btl: { ...btlState, busy: busy === 'btl', workerOffline: btlWorkerOffline } as AuthorityConnState,
    connect,
    disconnect,
    connectBtl,
    disconnectBtl,
    cancelRunningShaam,
    deferShaamCapability,
    shaamJob,
    // ‼ 168: פירוט N/M לפי הרשימה שנבחרה להכנה — לא ready/לא-ready גלובלי
    // בלבד. אותו מקור אמת כמו הנורית עצמה (ShaamReadinessProvider).
    shaamWarmupSummary: readiness.warmupSummary,
    refresh,
  };
}
