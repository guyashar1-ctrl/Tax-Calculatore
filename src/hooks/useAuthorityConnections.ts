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
 * ‼ חמישה מצבים בלבד, ולכל אחד צבע אחד — ראה
 * docs/SPEC-HEADER-CONNECTION-CONTROLS.md. כתום הוא **אך ורק** "PIVO עצרה
 * וממתינה לך, בחלון שפתחת בעצמך". מוכנות חלקית שנצפית פסיבית (פורטל חי אבל
 * GMF/מע״מ/מגן עוד לא), משימת needs_human ישנה, "מתחבר", ו"נכשל" — כולם
 * אפור. אין מצב שישי.
 */
export type ConnPhase = 'idle' | 'connecting' | 'needs_you' | 'ready' | 'failed';

export interface AuthorityConnState {
  phase: ConnPhase;
  busy: boolean;
  /** אין עובד, או שפעימת הלב שלו ישנה מדי. הצבע לא משתנה בגלל זה — רק ההסבר בלחיצה. */
  workerOffline: boolean;
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
const NEEDS_YOU_MAX_AGE_MS = 20 * 60_000;
/** queued/running מעל זה בלי שהעובד הגיב — זו תקלה (timeout), לא "מתחבר...". */
const CONNECTING_TIMEOUT_MS = 45_000;
/** כמה אחורה שולפים משימות מערכת בכלל, כולל failed — לא כל ההיסטוריה. */
const JOB_LOOKBACK_MS = 30 * 60_000;

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
  const refresh = useCallback(async () => {
    if (!userId) return;
    // ‼ שאילתה אחת לשתי הרשויות, כולל failed — אחרת כשל אמיתי היה נשאר
    // בלתי-נראה (ראה docs/SPEC-HEADER-CONNECTION-CONTROLS.md §3.12). חסומה
    // בזמן כדי שלא תצטבר לשלוף היסטוריה שלמה: כל מה שרלוונטי לתצוגה כאן
    // ובלאו הכי מזדקן תוך 20 דקות (needs_you) או נגמר בלחיצה הבאה.
    const cutoff = new Date(Date.now() - JOB_LOOKBACK_MS).toISOString();
    const jobRes = await supabase.from('automation_jobs').select('*')
      .is('client_id', null)
      .in('action_type', [SHAAM_CONNECT_ACTION_TYPE, BTL_CONNECT_ACTION_TYPE])
      .in('status', ['queued', 'running', 'needs_human', 'failed'])
      .gte('created_at', cutoff)
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
  // אוטומציה אמיתית תיתקל אחריו בקיר סיסמה של אחת ממערכות ה-Tier-B. אותו
  // ערך בדיוק שפקדי השדות קוראים — לא חישוב מקביל.
  const ready = readiness.ready;
  // ‼ לביטוח לאומי אין שכבות משנה, ולכן "מחובר" הוא כל הסיפור.
  const btlConnected = !workerOffline && !!status.btl?.connected;

  /**
   * ‼ גוזר את חמשת המצבים ממקור אחד: מוכנות (ready) קודמת לכול, אחר כך
   * שגיאת יצירה מקומית, אחר כך המשימה האחרונה שנשלפה. **אין** כאן ענף
   * שממפה "פורטל חי אבל שכבה חסרה" לכתום — זה בדיוק הצימוד הפסיבי שהוסר.
   * ראה §1 ו-§3 בספק.
   */
  function derivePhase(
    connected: boolean,
    job: AutomationJob | null,
    localError: string | null,
    isOwnJobId: (id: string) => boolean,
  ): { phase: ConnPhase; errorCode: string | null; errorDetail: string | null; isTimeout: boolean } {
    if (connected) return { phase: 'ready', errorCode: null, errorDetail: null, isTimeout: false };
    // ‼ עובד כבוי גובר על הכול: כתום/failed בלי עובד שיכול להשלים אותם הם
    // הבטחה שקרית ("פועל על זה עכשיו") כשאין מי שיפעל. הלחיצה עדיין
    // מסבירה למה — ראה handleClick ב-AuthorityConnectionButtons — רק
    // הצבע/הפאזה הפנימית לא "נתקעים" כתום מאחורי מסך כבוי.
    if (workerOffline) return { phase: 'idle', errorCode: null, errorDetail: null, isTimeout: false };
    if (localError) return { phase: 'failed', errorCode: null, errorDetail: localError, isTimeout: false };

    if (job) {
      const ageMs = Date.now() - new Date(job.createdAt).getTime();

      if (job.status === 'needs_human') {
        // ‼ כל לשונית רואה needs_you אם החלון באמת ממתין עכשיו — לא רק
        // הלשונית שלחצה. משימה ישנה מדי נופלת בשקט ל-idle למטה.
        if (ageMs <= NEEDS_YOU_MAX_AGE_MS) {
          return { phase: 'needs_you', errorCode: job.errorCode ?? null, errorDetail: null, isTimeout: false };
        }
      } else if (job.status === 'queued' || job.status === 'running') {
        if (ageMs <= CONNECTING_TIMEOUT_MS) {
          return { phase: 'connecting', errorCode: null, errorDetail: null, isTimeout: false };
        }
        // ‼ העובד לא הגיב — זו תקלה, לא המתנה. מוצג רק למי שלחץ, ראה
        // isOwnJobId; אחרת לשונית טרייה הייתה מציגה כשל שלא ביקשה.
        if (isOwnJobId(job.id)) {
          return { phase: 'failed', errorCode: 'timeout', errorDetail: null, isTimeout: true };
        }
      } else if (job.status === 'failed') {
        // ‼ כשל אמיתי מוצג רק ללשונית שיזמה אותו — ראה §3.5 בספק: כשל
        // היסטורי/של לשונית אחרת לא אמור להטריד טעינה טרייה.
        if (isOwnJobId(job.id)) {
          return { phase: 'failed', errorCode: job.errorCode ?? null, errorDetail: job.errorDetail ?? null, isTimeout: false };
        }
      }
    }

    return { phase: 'idle', errorCode: null, errorDetail: null, isTimeout: false };
  }

  const shaamState = derivePhase(
    ready,
    shaamJob,
    uiError?.authority === 'shaam' ? uiError.text : null,
    (id) => shaamJobIdRef.current === id,
  );
  const btlState = derivePhase(
    btlConnected,
    btlJob,
    uiError?.authority === 'btl' ? uiError.text : null,
    (id) => btlJobIdRef.current === id,
  );

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
    // ‼ נרשם גם כשהיא לא-חדשה (created:false, למשל אם שתי לחיצות התחרו):
    // מה שחשוב הוא שהלשונית הזאת "מכירה" את המשימה, לא מי בדיוק יצר אותה.
    if (r.ok && r.job) {
      if (authority === 'shaam') shaamJobIdRef.current = r.job.id;
      else btlJobIdRef.current = r.job.id;
    }
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

  return {
    shaam: { ...shaamState, busy: busy === 'shaam', workerOffline } as AuthorityConnState,
    btl: { ...btlState, busy: busy === 'btl', workerOffline } as AuthorityConnState,
    connect,
    disconnect,
    connectBtl,
    disconnectBtl,
    refresh,
  };
}
