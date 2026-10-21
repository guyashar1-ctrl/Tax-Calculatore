// ─── «הפעל הכול» — הזנת הייצוג בכל הרשויות, לכל האנשים, בלחיצה אחת (269/270) ────
// ‼ גיא (21.10.2026): «לחיצה אחת, והוא ירוץ גם בשע״ם וגם בביטוח לאומי לשניהם».
// מה ירוץ — runAllPlan (אותן נגזרות וקלט כמו הכפתורים הבודדים). איך — runChain:
// הראשונה בכל סוג נפתחת כמו בכפתור הבודד, והשאר נכנסות לתור בשרת אחרי הקודמת (270),
// גם כשהמסך סגור. ‼ «נשלח» כאן = נכנס לתור של מחשב העבודה, לא «הוזן ברשות» —
// התוצאה של כל אחת מופיעה בשורה שלה במרכז הייצוג.
// ‼ החיבור לרשות — אותו שער כמו בכל כפתור אוטומציה (useAutomationGate): לא מחובר ⇒
// הלחיצה פותחת את ההתחברות, והשרשרת של אותה רשות מתחילה לבד כשהחיבור מוכן.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Client, RepresentationRequest } from '../types';
import { SHAAM_CREATE_REPRESENTATION_ACTION_TYPE, BTL_CREATE_REPRESENTATION_ACTION_TYPE } from '../types/automation';
import { useAutomationGate } from '../hooks/useAutomationGate';
import { runAllPlan, type RunAllItem } from '../features/representation/runAllPlan';
import { runChain, chainsOf, type RunAllOutcome, type RunAllStep } from '../lib/runAllStart';
import { startAutomationJob } from '../lib/automationJobStart';
import { createAutomationJob, cancelAutomationJob, fetchLatestAutomationJob, jobIsLive } from '../lib/automationJobs';
import { createAutomationJobAfter, fetchWaitingFollowups, type AutomationFollowup } from '../lib/automationFollowups';

interface Props {
  request: RepresentationRequest;
  client: Client;
  spouseClient?: Client;
  /** מתחת לכמה פריטים לא להציג (במרכז הייצוג יש כפתור לכל אחד — «הכול» מתחיל משניים). */
  minItems?: number;
  /** אחרי שמשהו נכנס לתור — הקורא מרענן. */
  onStarted?: () => void;
  className?: string;
}

const META: React.CSSProperties = { fontSize: 12.5, color: 'var(--ink-3)', lineHeight: 1.5 };
const AUTH_LABEL = { shaam: 'שע״ם', btl: 'ב״ל' } as const;

const OUTCOME_TEXT: Record<RunAllOutcome['kind'], string> = {
  started: 'נשלח למחשב העבודה',
  waiting: 'ממתין שהקודם יסתיים',
  already: 'כבר רץ',
  needs_confirm: 'הניסיון הקודם נעצר באמצע - ממשיכים מהשורה שלו במרכז הייצוג',
  error: 'לא נשלח',
};

const deps = {
  start: (a: { clientId: string; actionType: string; input: Record<string, unknown> }) =>
    startAutomationJob({ fetchLatest: fetchLatestAutomationJob, cancel: cancelAutomationJob, create: createAutomationJob, isLive: jobIsLive }, a),
  fetchLatest: fetchLatestAutomationJob,
  after: createAutomationJobAfter,
};

export default function RunAllAutomations({ request, client, spouseClient, minItems = 1, onStarted, className = 'btn btn-sm' }: Props) {
  const plan = useMemo(() => runAllPlan(request, client, spouseClient), [request, client, spouseClient]);
  const runnable = plan.filter(i => i.input);
  const blocked = plan.filter(i => i.blocked);
  const shaamGate = useAutomationGate(SHAAM_CREATE_REPRESENTATION_ACTION_TYPE);
  const btlGate = useAutomationGate(BTL_CREATE_REPRESENTATION_ACTION_TYPE);
  const [outcomes, setOutcomes] = useState<Record<string, RunAllOutcome>>({});
  const [busy, setBusy] = useState(false);
  const [waiting, setWaiting] = useState<AutomationFollowup[]>([]);
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);

  const loadWaiting = useCallback(async () => {
    const w = await fetchWaitingFollowups(client.id);
    if (mounted.current) setWaiting(w);
  }, [client.id]);
  useEffect(() => { void loadWaiting(); }, [loadWaiting]);

  if (runnable.length < minItems && waiting.length === 0) return null;

  const startAuthority = (items: RunAllItem[]) => async () => {
    setBusy(true);
    try {
      const steps: RunAllStep[] = items.map(i => ({ key: i.key, actionType: i.actionType, input: i.input!, who: i.who }));
      const results = (await Promise.all(chainsOf(steps).map(c => runChain(client.id, c, deps)))).flat();
      if (!mounted.current) return;
      setOutcomes(o => ({ ...o, ...Object.fromEntries(results.map(r => [r.key, r])) }));
      void loadWaiting();
      onStarted?.();
    } finally {
      if (mounted.current) setBusy(false);
    }
  };

  const shaamItems = runnable.filter(i => i.authority === 'shaam');
  const btlItems = runnable.filter(i => i.authority === 'btl');
  const connecting = shaamGate.connecting || btlGate.connecting;
  const soft = !busy && !connecting
    && (shaamItems.length === 0 || !shaamGate.ready) && (btlItems.length === 0 || !btlGate.ready);
  const offline = (shaamItems.length > 0 && shaamGate.workerOffline) || (btlItems.length > 0 && btlGate.workerOffline);

  const onClick = () => {
    setOutcomes({});
    if (shaamItems.length) shaamGate.runOrConnect(() => void startAuthority(shaamItems)());
    if (btlItems.length) btlGate.runOrConnect(() => void startAuthority(btlItems)());
  };

  const summary = (['shaam', 'btl'] as const)
    .map(a => {
      const names = runnable.filter(i => i.authority === a).map(i => i.label);
      return names.length ? `${AUTH_LABEL[a]}: ${names.join(' · ')}` : '';
    }).filter(Boolean);
  const nameOfWaiting = (f: AutomationFollowup) =>
    plan.find(i => i.actionType === f.actionType && i.who === String(f.input.submissionKey ?? f.input.role ?? ''))?.label
      ?? String(f.input.personName ?? f.input.firstName ?? '');

  return (
    <div data-testid="run-all" style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-start' }}>
      {runnable.length > 0 && (
        <button type="button" className={`${className} btn-automation ${soft ? 'is-soft' : ''}`}
          disabled={busy || connecting} aria-busy={busy || connecting || undefined}
          title={soft ? 'לא מחובר · לחיצה פותחת את ההתחברות, וההזנה ממשיכה לבד' : undefined}
          onClick={onClick}>
          {busy ? 'שולח…' : connecting ? 'ממתין לחיבור…' : 'הפעל הכול'}
        </button>
      )}
      {runnable.length > 0 && summary.map(line => <div key={line} style={META}>{line}</div>)}
      {runnable.map(i => outcomes[i.key] && (
        <div key={i.key} style={{ ...META, color: outcomes[i.key].kind === 'error' ? 'var(--danger)' : META.color }}>
          {AUTH_LABEL[i.authority]} · {i.label}: {OUTCOME_TEXT[outcomes[i.key].kind]}
          {outcomes[i.key].kind === 'error' ? ` (${(outcomes[i.key] as { error: string }).error})` : ''}
        </div>
      ))}
      {waiting.filter(f => !runnable.some(i => outcomes[i.key]?.kind === 'waiting' && i.actionType === f.actionType && i.who === String(f.input.submissionKey ?? f.input.role ?? ''))).map(f => (
        <div key={f.id} style={META}>
          {f.actionType.startsWith('btl.') ? 'ב״ל' : 'שע״ם'} · {nameOfWaiting(f)}: {OUTCOME_TEXT.waiting}
        </div>
      ))}
      {blocked.map(i => (
        <div key={i.key} style={{ ...META, color: '#8A4B00' }}>
          לא ירוץ - {AUTH_LABEL[i.authority]} · {i.label}: {i.blocked}
        </div>
      ))}
      {offline && runnable.length > 0 && (
        <div style={META}>אין כרגע מחשב עבודה פעיל, ולכן ההזנה לא תרוץ עכשיו.</div>
      )}
    </div>
  );
}
