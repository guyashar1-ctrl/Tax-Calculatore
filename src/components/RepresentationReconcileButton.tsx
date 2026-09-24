// ─── «בדוק קבלת הייצוג» — פעולה אחת, ליד כותרת מרכז הביצוע ─────────────────
//
// ‼ החלטת מוצר (24.09.2026): יישוב מול הרשויות הוא רענון של המרכז כולו, לא
// של עמודה. קודם הופיעו שלושה כפתורים כאלה באותו מסך. עכשיו יש אחד, והוא
// מריץ לבד את כל הבדיקות הדרושות: שע״ם לכל הגשה, ב״ל לכל אדם.
//
// ‼ המנגנון מתחת לא השתנה: אותן משימות (shaam.check_representation,
// btl.check_representation), אותו קלט, אותם טריגרים בשרת. מה שהשתנה הוא רק
// שיש נקודת כניסה אחת.
//
// ‼ תור לכל סוג: משימה פתוחה אחת בלבד לכל (לקוח, פעולה) —
// automation_jobs_open_unique. לכן לזוג עם שתי הגשות בשע״ם הבדיקה השנייה
// יוצאת רק אחרי שהראשונה הסתיימה. שע״ם וב״ל רצים במקביל (סוגים שונים).

import { useEffect, useRef, useState } from 'react';
import type { AutomationJob } from '../types/automation';
import {
  SHAAM_CHECK_REPRESENTATION_ACTION_TYPE, BTL_CHECK_REPRESENTATION_ACTION_TYPE, OPEN_AUTOMATION_STATUSES,
} from '../types/automation';
import { useAutomationJob } from '../hooks/useAutomationJobs';
import { useAutomationGate } from '../hooks/useAutomationGate';

export interface ReconcileTarget {
  /** submissionKey (שע״ם) או role (ב״ל). */
  key: string;
  /** «שע״ם · הדסה סלע» — כך מופיעה השורה מתחת לכפתור. */
  label: string;
  /** הקלט למשימה; מחרוזת ⇒ חסר נתון, והבדיקה הזו לא יוצאת. */
  input: Record<string, unknown> | string;
}

interface Props {
  clientId: string | undefined;
  shaam: ReconcileTarget[];
  btl: ReconcileTarget[];
  onChanged?: () => void;
}

const keyOf = (job: AutomationJob | null, field: 'submissionKey' | 'role') =>
  (job?.input as Record<string, unknown> | undefined)?.[field] as string | undefined;

/** תור של סוג אחד (שע״ם או ב״ל): מריץ את היעדים אחד-אחד. */
function useReconcileQueue(clientId: string | undefined, actionType: string, field: 'submissionKey' | 'role',
  targets: ReconcileTarget[], onChanged?: () => void) {
  const hook = useAutomationJob(clientId, actionType);
  const gate = useAutomationGate(actionType);
  const [queue, setQueue] = useState<string[]>([]);
  const [results, setResults] = useState<Record<string, string>>({});
  const current = queue[0];
  // ‼ רק המשימה שהלחיצה הזאת יצרה (או קיבלה פתוחה) — לא תוצאה ישנה של אותו אדם.
  const [jobId, setJobId] = useState<string | null>(null);
  const job = hook.job && hook.job.id === jobId && keyOf(hook.job, field) === current ? hook.job : null;
  const started = useRef<string | null>(null);

  const start = (key: string) => {
    const t = targets.find(x => x.key === key);
    if (!t) return;
    if (typeof t.input === 'string') {
      setResults(r => ({ ...r, [key]: t.input as string }));
      setQueue(q => q.slice(1));
      return;
    }
    started.current = key;
    setJobId(null);
    void hook.run(t.input).then(r => {
      if (r.job) setJobId(r.job.id);
      if (!r.ok && !r.job) {
        setResults(x => ({ ...x, [key]: hook.error ?? 'הבדיקה לא יצאה' }));
        setQueue(q => q.slice(1));
      }
    });
  };

  // התחלה של הראשון בתור, והמשך כשהמשימה שלו מסתיימת.
  useEffect(() => {
    if (!current) return;
    if (started.current !== current) { start(current); return; }
    if (!job || OPEN_AUTOMATION_STATUSES.has(job.status) && job.status !== 'needs_human') return;
    const text = job.status === 'succeeded' ? 'נבדק'
      : job.status === 'needs_human' ? (job.needsHuman ?? 'נעצר וממתין להחלטה')
      : job.status === 'failed' ? (job.errorDetail ?? 'הבדיקה נכשלה')
      : 'בוטל';
    setResults(r => ({ ...r, [current]: text }));
    if (job.status === 'succeeded') onChanged?.();
    setQueue(q => q.slice(1));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, job?.id, job?.status]);

  const runAll = () => {
    if (targets.length === 0) return;
    setResults({});
    started.current = null;
    gate.runOrConnect(() => setQueue(targets.map(t => t.key)));
  };
  const running = queue.length > 0 || hook.busy;
  return { runAll, running, results, gate, currentKey: current };
}

export default function RepresentationReconcileButton({ clientId, shaam, btl, onChanged }: Props) {
  const sh = useReconcileQueue(clientId, SHAAM_CHECK_REPRESENTATION_ACTION_TYPE, 'submissionKey', shaam, onChanged);
  const bt = useReconcileQueue(clientId, BTL_CHECK_REPRESENTATION_ACTION_TYPE, 'role', btl, onChanged);
  if (shaam.length === 0 && btl.length === 0) return null;

  const running = sh.running || bt.running;
  const connecting = sh.gate.connecting || bt.gate.connecting;
  // ‼ «רך» רק כשאף מערכת שצריך לבדוק אינה מחוברת — אותה שפה כמו כל כפתור אוטומציה.
  const soft = !running && !connecting
    && (shaam.length === 0 || !sh.gate.ready) && (btl.length === 0 || !bt.gate.ready);
  const lines = [
    ...shaam.map(t => ({ t, r: sh.results[t.key], live: sh.currentKey === t.key })),
    ...btl.map(t => ({ t, r: bt.results[t.key], live: bt.currentKey === t.key })),
  ].filter(x => x.r || x.live);

  return (
    <div data-testid="rep-reconcile" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '.2rem' }}>
      <button type="button" className={`btn btn-sm btn-automation ${soft ? 'is-soft' : ''}`}
        disabled={running || connecting} aria-busy={running || undefined}
        title={`קריאה בלבד מול ${[shaam.length ? 'שע״ם' : '', btl.length ? 'ביטוח לאומי' : ''].filter(Boolean).join(' ו')} - לא נשלח ולא משתנה דבר ברשות`}
        onClick={() => { sh.runAll(); bt.runAll(); }}>
        {running ? 'בודק…' : connecting ? 'ממתין לחיבור…' : 'בדוק קבלת הייצוג'}
      </button>
      {lines.map(({ t, r, live }) => (
        <div key={`${t.label}`} className="rep-track-next-err"
          style={{ color: r === 'נבדק' || live ? 'var(--ink-3)' : undefined }}>
          {t.label}: {live && !r ? 'הבדיקה רצה בעובד המקומי…' : r}
        </div>
      ))}
    </div>
  );
}
