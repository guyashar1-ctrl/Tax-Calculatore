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
//
// ‼ 27.09.2026: השורה מתחת לכפתור היא **התוצאה** («טרם אושר - ממתין לאישור
// המבוטח עד 23.11.2026 · נבדק היום 15:47»), לא «נבדק». והיא נקראת מהנתון
// השמור (ReconcileTarget.last), ולכן נשארת גם אחרי רענון.

import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { AutomationJob } from '../types/automation';
import {
  SHAAM_CHECK_REPRESENTATION_ACTION_TYPE, BTL_CHECK_REPRESENTATION_ACTION_TYPE, OPEN_AUTOMATION_STATUSES,
} from '../types/automation';
import { useAutomationJob } from '../hooks/useAutomationJobs';
import { useAutomationGate } from '../hooks/useAutomationGate';
import { NOTICE_STYLES, reconcileIsPremature, type ReconcileLine } from '../features/representation/representationCenter';

export interface ReconcileTarget {
  /** submissionKey (שע״ם) או role (ב״ל). */
  key: string;
  /** «שע״ם · הדסה סלע» — כך מופיעה השורה מתחת לכפתור. */
  label: string;
  /** הקלט למשימה; מחרוזת ⇒ חסר נתון, והבדיקה הזו לא יוצאת. */
  input: Record<string, unknown> | string;
  /** מה נקרא בבדיקה האחרונה, מהנתון השמור. null ⇒ עוד לא נבדק. */
  last?: ReconcileLine | null;
  /**
   * התוצאה ישר מהמשימה שהסתיימה, בלי לחכות לטעינה מחדש של הבקשה. בלעדיה
   * מוצג «טוען את התוצאה…» עד שהנתון השמור מתעדכן.
   */
  fromJob?: (result: unknown, finishedAt: string | undefined) => ReconcileLine | null;
  /** הבדיקה לא צפויה לשנות משהו עכשיו (ב״ל: ההוראות עוד לא יצאו) — ראה reconcileIsPremature. */
  premature?: boolean;
}

interface Props {
  /**
   * כותרת המרכז. ‼ 27.09.2026: הכפתור יושב צמוד לכותרת והתוצאה מתחתיה —
   * «איפה אנחנו מול הרשויות» ו«בדוק שוב» נקראים כיחידה אחת. קודם הכפתור
   * ישב בקצה השני של השורה, המקום האחרון שהעין מגיעה אליו בעברית.
   */
  heading: ReactNode;
  clientId: string | undefined;
  shaam: ReconcileTarget[];
  btl: ReconcileTarget[];
  onChanged?: () => void;
  /**
   * ‼ 28.09.2026 · במרכז החדש לכל רשות שורה עם המצב שלה, כולל הקריאה השמורה.
   * false ⇒ מתחת לכפתור רק מה שקורה עכשיו (רץ / תוצאה טרייה / שגיאה), בלי כפילות.
   */
  persistedLines?: boolean;
}

/** מה קרה בבדיקה שרצה עכשיו (בזיכרון בלבד — הנתון השמור הוא `last`). */
type RunResult =
  | { kind: 'line'; line: ReconcileLine }
  /** הצליחה, והתוצאה תגיע עם הנתון השמור שמתעדכן; `since` = מתי התחילה. */
  | { kind: 'fresh'; since: string }
  | { kind: 'error'; text: string };

const keyOf = (job: AutomationJob | null, field: 'submissionKey' | 'role') =>
  (job?.input as Record<string, unknown> | undefined)?.[field] as string | undefined;

const ms = (iso?: string) => (iso ? Date.parse(iso) : NaN);

/** תור של סוג אחד (שע״ם או ב״ל): מריץ את היעדים אחד-אחד. */
function useReconcileQueue(clientId: string | undefined, actionType: string, field: 'submissionKey' | 'role',
  targets: ReconcileTarget[], onChanged?: () => void) {
  const hook = useAutomationJob(clientId, actionType);
  const gate = useAutomationGate(actionType);
  const [queue, setQueue] = useState<string[]>([]);
  const [results, setResults] = useState<Record<string, RunResult>>({});
  const current = queue[0];
  // ‼ רק המשימה שהלחיצה הזאת יצרה (או קיבלה פתוחה) — לא תוצאה ישנה של אותו אדם.
  const [jobId, setJobId] = useState<string | null>(null);
  const job = hook.job && hook.job.id === jobId && keyOf(hook.job, field) === current ? hook.job : null;
  const started = useRef<string | null>(null);

  const start = (key: string) => {
    const t = targets.find(x => x.key === key);
    if (!t) return;
    if (typeof t.input === 'string') {
      setResults(r => ({ ...r, [key]: { kind: 'error', text: t.input as string } }));
      setQueue(q => q.slice(1));
      return;
    }
    started.current = key;
    setJobId(null);
    void hook.run(t.input).then(r => {
      if (r.job) setJobId(r.job.id);
      if (!r.ok && !r.job) {
        setResults(x => ({ ...x, [key]: { kind: 'error', text: hook.error ?? 'הבדיקה לא יצאה' } }));
        setQueue(q => q.slice(1));
      }
    });
  };

  // התחלה של הראשון בתור, והמשך כשהמשימה שלו מסתיימת.
  useEffect(() => {
    if (!current) return;
    if (started.current !== current) { start(current); return; }
    if (!job || OPEN_AUTOMATION_STATUSES.has(job.status) && job.status !== 'needs_human') return;
    let result: RunResult;
    if (job.status === 'succeeded') {
      const line = targets.find(x => x.key === current)?.fromJob?.(job.result, job.finishedAt);
      result = line ? { kind: 'line', line } : { kind: 'fresh', since: job.createdAt };
    } else {
      result = {
        kind: 'error',
        text: job.status === 'needs_human' ? (job.needsHuman ?? 'נעצר וממתין להחלטה')
          : job.status === 'failed' ? (job.errorDetail ?? 'הבדיקה נכשלה')
          : 'בוטל',
      };
    }
    setResults(r => ({ ...r, [current]: result }));
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

/** מה מוצג בשורה של יעד אחד. null ⇒ אין שורה (עוד לא נבדק ולא רץ עכשיו). */
function lineFor(t: ReconcileTarget, r: RunResult | undefined, live: boolean): { text: string; color?: string } | null {
  const muted = NOTICE_STYLES.info.color;
  if (live && !r) return { text: 'הבדיקה רצה בעובד המקומי…', color: muted };
  if (r?.kind === 'error') return { text: r.text };
  const line = r?.kind === 'line' ? r.line
    // ‼ «fresh»: מציגים את הנתון השמור רק כשהוא כבר מהבדיקה הזו, אחרת זו
    // התוצאה הקודמת שנראית כאילו היא של עכשיו.
    : r?.kind === 'fresh' ? (t.last && ms(t.last.at) >= ms(r.since) ? t.last : null)
    : t.last ?? null;
  if (line) return { text: line.text, color: NOTICE_STYLES[line.tone].color };
  if (r?.kind === 'fresh') return { text: 'נבדק · טוען את התוצאה…', color: muted };
  return null;
}

export default function RepresentationReconcileButton({ heading, clientId, shaam, btl, onChanged, persistedLines = true }: Props) {
  const sh = useReconcileQueue(clientId, SHAAM_CHECK_REPRESENTATION_ACTION_TYPE, 'submissionKey', shaam, onChanged);
  const bt = useReconcileQueue(clientId, BTL_CHECK_REPRESENTATION_ACTION_TYPE, 'role', btl, onChanged);
  if (shaam.length === 0 && btl.length === 0) return <>{heading}</>;

  const running = sh.running || bt.running;
  const connecting = sh.gate.connecting || bt.gate.connecting;
  // ‼ «רך» רק כשאף מערכת שצריך לבדוק אינה מחוברת — אותה שפה כמו כל כפתור אוטומציה.
  const soft = !running && !connecting
    && (shaam.length === 0 || !sh.gate.ready) && (btl.length === 0 || !bt.gate.ready);
  // ‼ «שקט» גובר על «רך»: המסר החשוב כאן הוא שהבדיקה לא תקדם כלום עכשיו.
  const quiet = !running && !connecting && reconcileIsPremature([...shaam, ...btl]);
  const readOnly = `קריאה בלבד מול ${[shaam.length ? 'שע״ם' : '', btl.length ? 'ביטוח לאומי' : ''].filter(Boolean).join(' ו')} - לא נשלח ולא משתנה דבר ברשות`;
  const lines = [
    ...shaam.map(t => ({ t, now: sh.currentKey === t.key || !!sh.results[t.key], shown: lineFor(t, sh.results[t.key], sh.currentKey === t.key) })),
    ...btl.map(t => ({ t, now: bt.currentKey === t.key || !!bt.results[t.key], shown: lineFor(t, bt.results[t.key], bt.currentKey === t.key) })),
  ].filter(x => x.shown && (persistedLines || x.now));

  return (
    <div data-testid="rep-reconcile" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '.25rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '.75rem', flexWrap: 'wrap' }}>
        {heading}
        <button type="button" className={`btn btn-sm btn-automation ${quiet ? 'is-quiet' : soft ? 'is-soft' : ''}`}
          disabled={running || connecting} aria-busy={running || undefined}
          title={quiet ? `ההוראות עוד לא נשלחו למבוטח - סביר שעדיין אין מה לבדוק. ${readOnly}` : readOnly}
          onClick={() => { sh.runAll(); bt.runAll(); }}>
          {running ? 'בודק…' : connecting ? 'ממתין לחיבור…' : 'בדוק קבלת הייצוג'}
        </button>
      </div>
      {lines.map(({ t, shown }) => (
        <div key={`${t.label}`} className="rep-track-next-err" data-testid={`rep-reconcile-line-${t.key}`}
          style={shown!.color ? { color: shown!.color } : undefined}>
          {t.label}: {shown!.text}
        </div>
      ))}
    </div>
  );
}
