// ─── «הפעל הכול» — רשימה אחת: רשות×אדם, המצב החי של כל שורה, וכפתור (269–272) ────
// ‼ גיא (21.10.2026): «לחיצה אחת, שע״ם וב״ל לשניהם» · «רשימה קצרה עם מצב חי לכל אדם».
// מה בשורות ומה המצב — runAllRows (מהמשימות בשרת, לא ממה שהמסך זוכר). מה ירוץ — רק שורות
// שלא בדרך ולא הוזנו (runnableRows), ונבדק שוב מול השרת רגע לפני השליחה: לחיצה שנייה לא
// שולחת שוב (272 שומר גם בשרת). איך — runChain: הראשונה בכל סוג כמו בכפתור הבודד, והשאר
// «המשך» (270) שנכנס לתור בשרת כשהקודמת מסתיימת, גם כשהמסך סגור.
// ‼ «בתור» / «רץ» = אצל מחשב העבודה; «✓» רק עם ראיה (מספר בקשה / אסמכתא, או משימה שהצליחה).
// ‼ החיבור לרשות — אותו שער כמו בכל כפתור אוטומציה (useAutomationGate).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Client, RepresentationRequest } from '../types';
import type { AutomationJob } from '../types/automation';
import { SHAAM_CREATE_REPRESENTATION_ACTION_TYPE, BTL_CREATE_REPRESENTATION_ACTION_TYPE } from '../types/automation';
import { useAutomationGate } from '../hooks/useAutomationGate';
import { runAllRows, runnableRows, type RunAllRow, type RunAllRowState } from '../features/representation/runAllPlan';
import { runChain, chainsOf, type RunAllOutcome, type RunAllStep } from '../lib/runAllStart';
import { startAutomationJob } from '../lib/automationJobStart';
import { createAutomationJob, cancelAutomationJob, fetchLatestAutomationJob, jobIsLive } from '../lib/automationJobs';
import {
  createAutomationJobAfter, fetchClientJobs, fetchWaitingFollowups, type AutomationFollowup,
} from '../lib/automationFollowups';

interface Props {
  request: RepresentationRequest;
  client: Client;
  spouseClient?: Client;
  /** מתחת לכמה שורות לא להציג (במרכז הייצוג יש שורה לכל צעד — הרשימה מתחילה משתיים). */
  minRows?: number;
  /** משהו נכנס לתור / הסתיים — הקורא מרענן. */
  onChanged?: () => void;
}

const ACTION_TYPES = [SHAAM_CREATE_REPRESENTATION_ACTION_TYPE, BTL_CREATE_REPRESENTATION_ACTION_TYPE];
const POLL_MS = 3000;

const STATE_VIEW: Record<RunAllRowState, { icon: string; text: string; color: string }> = {
  idle:    { icon: '○', text: 'לא הופעל', color: 'var(--ink-3)' },
  blocked: { icon: '⚠', text: 'חסר בכרטיס', color: '#8A4B00' },
  queued:  { icon: '⏳', text: 'בתור', color: 'var(--ink-2)' },
  running: { icon: '⟳', text: 'רץ עכשיו…', color: 'var(--accent)' },
  stopped: { icon: '⚠', text: 'נעצר - ממתין לך', color: '#8A4B00' },
  failed:  { icon: '⚠', text: 'לא הצליח', color: 'var(--danger)' },
  done:    { icon: '✓', text: 'הוזן', color: 'var(--success, #2E7D32)' },
};

const deps = {
  start: (a: { clientId: string; actionType: string; input: Record<string, unknown> }) =>
    startAutomationJob({ fetchLatest: fetchLatestAutomationJob, cancel: cancelAutomationJob, create: createAutomationJob, isLive: jobIsLive }, a),
  fetchLatest: fetchLatestAutomationJob,
  after: createAutomationJobAfter,
};

export default function RunAllAutomations({ request, client, spouseClient, minRows = 1, onChanged }: Props) {
  const [jobs, setJobs] = useState<AutomationJob[]>([]);
  const [waiting, setWaiting] = useState<AutomationFollowup[]>([]);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const shaamGate = useAutomationGate(SHAAM_CREATE_REPRESENTATION_ACTION_TYPE);
  const btlGate = useAutomationGate(BTL_CREATE_REPRESENTATION_ACTION_TYPE);
  const mounted = useRef(true);
  // ‼ גם בעלייה מחדש (StrictMode מעלה, מוריד ומעלה) — אחרת הדגל נשאר false והמצב לא מתעדכן.
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  const load = useCallback(async () => {
    const [j, w] = await Promise.all([fetchClientJobs(client.id, ACTION_TYPES), fetchWaitingFollowups(client.id)]);
    if (mounted.current) { setJobs(j); setWaiting(w); }
    return { j, w };
  }, [client.id]);
  useEffect(() => { void load(); }, [load]);

  const rows = useMemo(() => runAllRows(request, client, jobs, waiting, spouseClient),
    [request, client, jobs, waiting, spouseClient]);
  const active = rows.some(r => r.state === 'queued' || r.state === 'running');

  // ‼ רענון חי רק כשיש מה לחכות לו; ומעבר ל«הוזן» מרענן גם את הקורא (המעקב בבקשה נכתב בשרת).
  const doneCount = rows.filter(r => r.state === 'done').length;
  const prevDone = useRef(doneCount);
  useEffect(() => {
    if (doneCount > prevDone.current) onChanged?.();
    prevDone.current = doneCount;
  }, [doneCount, onChanged]);
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => { if (document.visibilityState === 'visible') void load(); }, POLL_MS);
    return () => clearInterval(t);
  }, [active, load]);

  if (rows.length < minRows) return null;
  const runnable = runnableRows(rows);

  /** ‼ נבדק שוב מול השרת רגע לפני השליחה — רק מה שעדיין לא בדרך ולא הוזן. */
  const startAuthority = (authority: RunAllRow['authority']) => async () => {
    setBusy(true);
    try {
      const { j, w } = await load();
      const fresh = runnableRows(runAllRows(request, client, j, w, spouseClient)).filter(r => r.authority === authority);
      const steps: RunAllStep[] = fresh.map(r => ({ key: r.key, actionType: r.actionType, input: r.input!, who: r.who }));
      const results: RunAllOutcome[] = (await Promise.all(chainsOf(steps).map(c => runChain(client.id, c, deps)))).flat();
      if (!mounted.current) return;
      setErrors(e => ({
        ...e,
        ...Object.fromEntries(results.map(r => [r.key,
          r.kind === 'error' ? `לא נשלח (${r.error})`
            : r.kind === 'needs_confirm' ? 'הניסיון הקודם נעצר באמצע - ממשיכים מהשורה במרכז הייצוג' : ''])),
      }));
      await load();
      onChanged?.();
    } finally {
      if (mounted.current) setBusy(false);
    }
  };

  const hasShaam = runnable.some(r => r.authority === 'shaam');
  const hasBtl = runnable.some(r => r.authority === 'btl');
  const connecting = shaamGate.connecting || btlGate.connecting;
  const soft = !busy && !connecting && (!hasShaam || !shaamGate.ready) && (!hasBtl || !btlGate.ready);
  const offline = (hasShaam && shaamGate.workerOffline) || (hasBtl && btlGate.workerOffline);
  const onClick = () => {
    setErrors({});
    if (hasShaam) shaamGate.runOrConnect(() => void startAuthority('shaam')());
    if (hasBtl) btlGate.runOrConnect(() => void startAuthority('btl')());
  };

  return (
    <div data-testid="run-all" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div role="list" style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {rows.map(r => {
          const v = STATE_VIEW[r.state];
          const note = errors[r.key] || (r.state === 'blocked' || r.state === 'stopped' || r.state === 'failed' ? r.detail : '');
          return (
            <div key={r.key} role="listitem" data-state={r.state} style={{ fontSize: 13, lineHeight: 1.5 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                <span title={r.hint} style={{ color: 'var(--ink-1)' }}>{r.label}</span>
                <span style={{ color: v.color, whiteSpace: 'nowrap' }}>
                  {v.icon} {r.state === 'done' && r.detail ? <span className="ltr-isolate">{r.detail}</span> : v.text}
                </span>
              </div>
              {note && <div style={{ fontSize: 12, color: '#8A4B00' }}>{note}</div>}
            </div>
          );
        })}
      </div>
      {runnable.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          {offline && <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>אין כרגע מחשב עבודה פעיל</span>}
          <button type="button" className={`btn btn-sm btn-automation ${soft ? 'is-soft' : ''}`}
            disabled={busy || connecting} aria-busy={busy || connecting || undefined}
            title={soft ? 'לא מחובר · לחיצה פותחת את ההתחברות, וההזנה ממשיכה לבד' : undefined}
            onClick={onClick}>
            {busy ? 'שולח…' : connecting ? 'ממתין לחיבור…' : 'הפעל הכול'}
          </button>
        </div>
      )}
    </div>
  );
}
