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
const CONNECT_WAIT_POLL_MS = 2_000;
const CONNECT_WAIT_POLL_LIMIT_MS = 10 * 60_000;
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
  /** שע״ם מחוברת; רק מערכת-המשנה לא נבדקה עדיין — הלחיצה תפתח אותה ותמשיך. */
  unverified: boolean;
  /** אין עובד — לחיצה לא יכולה לפתוח חלון, רק להסביר. */
  workerOffline: boolean;
  /** מריץ אם מוכן; אחרת פותח התחברות ומריץ לבד כשתהיה מוכנה. */
  runOrConnect: (run: () => void) => void;
  /**
   * 25.10.2026 (ליאת): מה קורה עם פתיחת השכבה החסרה — במילים, לא «ממתין לחיבור…» בלי סוף.
   * 'wait' = ממתינים לרו"ח בחלון שע״ם (נמשיך לבד) · 'error' = לא נפתחה; לחיצה נוספת מנסה שוב.
   */
  notice: { tone: 'wait' | 'error'; text: string } | null;
}

/** שכבות שע״ם שנפתחות בנפרד — שם קצר לטקסט שבכפתור. */
const LAYER_NAMES: Record<string, string> = {
  representation: 'רישום הייצוג', vat: 'מע״מ', nikui: 'מערכת הניכויים', gmf: 'גביית מס הכנסה',
};

/**
 * @param capability שם היכולת שהפעולה צריכה (מפתח ב-SHAAM_CAPABILITIES),
 *   למשל 'shaam.read_134' או 'btl.create_representation'.
 */
export function useAutomationGate(capability: string): AutomationGate {
  const readiness = useShaamReadiness();
  const { showToast } = useToast();
  const cap = readiness.capability(capability);
  const pending = useRef<(() => void) | null>(null);
  // ‼ 203 · «אין מי שיריץ» נמדד לרשות של הפעולה: פעולת ב״ל ⇒ מחשב חי עם ב״ל.
  const offline = capabilityAuthority(capability) === 'btl' ? readiness.btlWorkerOffline : readiness.workerOffline;
  const [connecting, setConnecting] = useState(false);
  const [notice, setNotice] = useState<AutomationGate['notice']>(null);
  /** משימת השחזור הנקודתי שהכפתור הזה יצר — כדי לדעת אם נכשלה או ממתינה לרו"ח. */
  const [ensureJobId, setEnsureJobId] = useState<string | null>(null);

  // ‼ 27.09.2026: בזמן ההמתנה — שואלים כל 2 שניות, **גם כשהלשונית מוסתרת**.
  // הספק (ShaamReadinessProvider) לא מושך כשהלשונית ברקע, וזה בדיוק המצב
  // כאן: חלון ההתחברות של הרשות מכסה את PIVO. בלי זה הפעולה שהרו"ח ביקש
  // התחילה רק כשחזר ל-PIVO, אחרי שכבר התחבר מזמן. מוגבל ל-10 דקות, כדי
  // שהתחברות שננטשה לא תמשוך לנצח.
  const refreshReadiness = readiness.refresh;
  useEffect(() => {
    if (!connecting) return;
    const until = Date.now() + CONNECT_WAIT_POLL_LIMIT_MS;
    const t = setInterval(() => {
      if (Date.now() > until) { clearInterval(t); return; }
      void refreshReadiness();
    }, CONNECT_WAIT_POLL_MS);
    return () => clearInterval(t);
  }, [connecting, refreshReadiness]);

  // ‼ הרגע שבו החיבור הפך מוכן — לא לפי ה-job של ההתחברות אלא לפי המוכנות
  // עצמה (אותו מקור שהופך את הנורית לירוקה). ריצה אחת, ואז שוכחים.
  useEffect(() => {
    if (!cap.ready || !pending.current) return;
    const run = pending.current;
    pending.current = null;
    setConnecting(false);
    setNotice(null);
    setEnsureJobId(null);
    run();
  }, [cap.ready]);

  // ‼ מה עלה בגורל השחזור הנקודתי: נכשל ⇒ מפסיקים לחכות ואומרים למה; ממתין לרו"ח ⇒
  // ממשיכים לחכות, עם ההנחיה של העובד (למשל «השלימו את ההתחברות לרישום הייצוג בחלון שע״ם»).
  useEffect(() => {
    if (!ensureJobId || !connecting) return;
    let stop = false;
    const tick = async () => {
      const { data } = await supabase.from('automation_jobs').select('*').eq('id', ensureJobId).maybeSingle();
      if (stop || !data) return;
      const job = automationJobFromDb(data);
      if (job.status === 'failed' || job.status === 'cancelled') {
        pending.current = null;
        setConnecting(false);
        setEnsureJobId(null);
        // ‼ עובד ישן כותב «שחזור representation לא הצליח (…)» — לא מציגים לרו"ח שם טכני.
        const raw = job.errorDetail ?? '';
        const legacy = /^שחזור (\w+) לא הצליח/.exec(raw);
        setNotice({ tone: 'error', text: legacy
          ? `לא הצלחתי לפתוח את ${LAYER_NAMES[legacy[1]] ?? 'המערכת'} בחלון שע״ם. לחצו שוב כדי לנסות.`
          : raw || 'לא הצלחתי לפתוח את המערכת בשע״ם. לחצו שוב כדי לנסות.' });
      } else if (job.status === 'needs_human') {
        setNotice({ tone: 'wait', text: job.needsHuman || 'חלון שע״ם ממתין לך — אחרי ההתחברות אמשיך לבד.' });
      }
    };
    void tick();
    const t = setInterval(() => void tick(), CONNECT_WAIT_POLL_MS);
    return () => { stop = true; clearInterval(t); };
  }, [ensureJobId, connecting]);

  const runOrConnect = useCallback((run: () => void) => {
    if (cap.ready) { run(); return; }
    if (offline) {
      // ‼ בלי עובד אין למי לפתוח חלון — זו ההודעה היחידה שנשארת «הודעה».
      showToast(cap.blockedReason ?? 'מחשב האוטומציה אינו פעיל.');
      return;
    }
    const authority = capabilityAuthority(capability);
    pending.current = run;
    setConnecting(true);
    setNotice(null);
    // ‼ פורטל שע״ם כבר מחובר אבל שכבה אחת חסרה (מע״מ/מגן/ייצוג) — שחזור
    // נקודתי של אותה שכבה (shaam.ensure_capability), לא התחברות מלאה מחדש.
    // ‼ takeover: הלחיצה היא בקשה מפורשת של הרו"ח — העובד פותח את השכבה גם כשחלון
    // שע״ם עומד על מסך שהרו"ח פתח (בלי זה הוא דילג, והכפתור חיכה בלי סוף).
    const targeted = authority === 'shaam' && readiness.ready && cap.missingLayer && cap.missingLayer !== 'portal' && cap.missingLayer !== 'gmf';
    const layerName = targeted ? (LAYER_NAMES[cap.missingLayer as string] ?? cap.missingLayer) : null;
    const start = targeted
      ? createAutomationJob(null, SHAAM_ENSURE_CAPABILITY_ACTION_TYPE, { capability: cap.missingLayer, takeover: true })
          .then(r => (r.ok ? { ok: true as const, jobId: r.job?.id ?? null } : { ok: false as const, error: r.error }))
      : startAuthorityConnect(authority).then(r => ({ ...r, jobId: null as string | null }));
    void start.then(r => {
      if (r.ok) {
        if (layerName) {
          setEnsureJobId(r.jobId ?? null);
          setNotice({ tone: 'wait', text: `פותח את ${layerName} בחלון שע״ם — אם תתבקש התחברות, השלימו אותה שם, ואמשיך לבד.` });
        } else {
          showToast(CONNECT_TOAST[authority]);
        }
        void readiness.refresh();
        return;
      }
      pending.current = null;
      setConnecting(false);
      setNotice({ tone: 'error', text: r.error ?? 'לא הצלחתי לפתוח את ההתחברות' });
    });
  }, [cap.ready, cap.blockedReason, cap.missingLayer, capability, readiness, showToast]);

  return { ready: cap.ready, blockedReason: cap.blockedReason, connecting, unverified: !!cap.unverified, workerOffline: offline, runOrConnect, notice };
}
