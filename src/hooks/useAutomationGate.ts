// ─── שער האוטומציה: «לחיצה = התחבר אם צריך, ואז בצע» ─────────────────────────
// הכרעת מוצר (19.09.2026): כפתור אוטומציה הוא לעולם לא «מושבת כי לא מחובר».
//   ורוד מלא  · החיבור לרשות קיים ⇒ הלחיצה מריצה.
//   ורוד בהיר · החיבור לא קיים (הנורית בכותרת לא ירוקה) ⇒ הלחיצה **פותחת
//               את ההתחברות** (אותה משימה שהכפתור בכותרת יוצר), זוכרת מה
//               ביקשו, ומריצה אותו לבד ברגע שהחיבור מוכן. אחרי זה כל
//               האוטומציות שתלויות באותו חיבור הופכות ורוד מלא מעצמן —
//               כולן קוראות את אותה מוכנות (ShaamReadinessProvider).
// ‼ מנגנון אחד לכל האוטומציות (בדיקות בכרטיסי הרשות, ייפוי כוח בב״ל, וכל
// מה שיבוא) — לא «הכן והמשך» לכל מסך בנפרד.
// ‼ ההתחברות עצמה (אישור דיגיטלי, PIN, קוד חד-פעמי) נשארת של הרו"ח בחלון
// שנפתח. כאן רק יוצרים את משימת ההתחברות ומחכים לעדות שהיא הצליחה.

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { createAutomationJob, cancelAutomationJob } from '../lib/automationJobs';
import { automationJobFromDb } from '../lib/dbMappers';
import {
  SHAAM_CONNECT_ACTION_TYPE, BTL_CONNECT_ACTION_TYPE, SHAAM_ENSURE_CAPABILITY_ACTION_TYPE,
} from '../types/automation';
import { jobStatusFilter, selectAuthorityJob, mustCancelBeforeStart } from './authorityConnectionModel';
import { useShaamReadiness, capabilityAuthority } from './shaamReadiness';
import { useToast } from '../components/ui/Toast';

type Authority = 'shaam' | 'btl';

const CONNECT_ACTION: Record<Authority, string> = {
  shaam: SHAAM_CONNECT_ACTION_TYPE,
  btl: BTL_CONNECT_ACTION_TYPE,
};
const CONNECT_TOAST: Record<Authority, string> = {
  shaam: 'נפתח חלון ההתחברות לשע״ם — אחרי ההתחברות PIVO תמשיך את הפעולה לבד.',
  btl: 'נפתח חלון ההתחברות לביטוח לאומי — אחרי ההתחברות PIVO תמשיך את הפעולה לבד.',
};

/**
 * יוצר את משימת ההתחברות של הרשות — אותה לוגיקה בדיוק כמו הכפתור בכותרת
 * (useAuthorityConnections.start): משימה פתוחה תקועה מבוטלת קודם, אחרת
 * האינדקס הייחודי היה מחזיר אותה והעובד לא היה מרים כלום.
 * ‼ לא משתמש ב-useAuthorityConnections עצמו — לזה יש poll משלו, ואין טעם
 * שכל כפתור אוטומציה יפתח עוד אחד.
 */
async function startAuthorityConnect(authority: Authority): Promise<{ ok: boolean; error?: string }> {
  const actionType = CONNECT_ACTION[authority];
  const jobRes = await supabase.from('automation_jobs').select('*')
    .is('client_id', null)
    .eq('action_type', actionType)
    .or(jobStatusFilter())
    .order('created_at', { ascending: false });
  const open = selectAuthorityJob(actionType, (jobRes.data ?? []).map(automationJobFromDb));
  if (open && mustCancelBeforeStart(open)) await cancelAutomationJob(open.id);
  const r = await createAutomationJob(null, actionType, {});
  return r.ok ? { ok: true } : { ok: false, error: r.error ?? 'לא הצלחתי לפתוח את ההתחברות' };
}

export interface AutomationGate {
  /** החיבור שהפעולה צריכה קיים — לחיצה מריצה. */
  ready: boolean;
  /** לא מוכן: מה חסר (משמש ל-title בלבד; הלחיצה לא נחסמת). */
  blockedReason: string | null;
  /** ההתחברות נפתחה מהכפתור הזה ואנחנו ממתינים שתושלם כדי להריץ. */
  connecting: boolean;
  /** אין עובד — לחיצה לא יכולה לפתוח חלון, רק להסביר. */
  workerOffline: boolean;
  /** מריץ אם מוכן; אחרת פותח התחברות ומריץ לבד כשתהיה מוכנה. */
  runOrConnect: (run: () => void) => void;
}

/**
 * @param capability שם היכולת שהפעולה צריכה (מפתח ב-SHAAM_CAPABILITIES),
 *   למשל 'shaam.read_134' או 'btl.create_representation'.
 */
export function useAutomationGate(capability: string): AutomationGate {
  const readiness = useShaamReadiness();
  const { showToast } = useToast();
  const cap = readiness.capability(capability);
  const pending = useRef<(() => void) | null>(null);
  const [connecting, setConnecting] = useState(false);

  // ‼ הרגע שבו החיבור הפך מוכן — לא לפי ה-job של ההתחברות אלא לפי המוכנות
  // עצמה (אותו מקור שהופך את הנורית לירוקה). ריצה אחת, ואז שוכחים.
  useEffect(() => {
    if (!cap.ready || !pending.current) return;
    const run = pending.current;
    pending.current = null;
    setConnecting(false);
    run();
  }, [cap.ready]);

  const runOrConnect = useCallback((run: () => void) => {
    if (cap.ready) { run(); return; }
    if (readiness.workerOffline) {
      // ‼ בלי עובד אין למי לפתוח חלון — זו ההודעה היחידה שנשארת «הודעה».
      showToast(cap.blockedReason ?? 'מחשב האוטומציה אינו פעיל.');
      return;
    }
    const authority = capabilityAuthority(capability);
    pending.current = run;
    setConnecting(true);
    // ‼ פורטל שע״ם כבר מחובר אבל שכבה אחת חסרה (מע״מ/מגן/ייצוג) — שחזור
    // נקודתי של אותה שכבה (shaam.ensure_capability), לא התחברות מלאה מחדש.
    const targeted = authority === 'shaam' && readiness.ready && cap.missingLayer && cap.missingLayer !== 'portal' && cap.missingLayer !== 'gmf';
    const start = targeted
      ? createAutomationJob(null, SHAAM_ENSURE_CAPABILITY_ACTION_TYPE, { capability: cap.missingLayer })
          .then(r => (r.ok ? { ok: true as const } : { ok: false as const, error: r.error }))
      : startAuthorityConnect(authority);
    void start.then(r => {
      if (r.ok) { showToast(CONNECT_TOAST[authority]); void readiness.refresh(); return; }
      pending.current = null;
      setConnecting(false);
      showToast(r.error ?? 'לא הצלחתי לפתוח את ההתחברות');
    });
  }, [cap.ready, cap.blockedReason, cap.missingLayer, capability, readiness, showToast]);

  return { ready: cap.ready, blockedReason: cap.blockedReason, connecting, workerOffline: readiness.workerOffline, runOrConnect };
}
