// ─── «המשך» בביטוח לאומי — שורה אחת לשני בני הזוג, כפתור אחד ──────────────────
// גיא (25.10.2026): «בלחיצת כפתור אני מבין מה קורה עם ביטוח לאומי ומפעיל את האוטומציה».
// לכל אדם הצעד הבא שלו: לא הוזן ⇒ הזנה · יש אסמכתא ⇒ הוראות · נשלח ⇒ בדיקה אם אישר · פג ⇒
// הזנה מחדש. האוטומציות יוצאות כשרשרת (runChain, 270): משימה פתוחה אחת מכל סוג לכרטיס
// (automation_jobs_open_unique), ולכן השני נכנס לתור אחרי הראשון — לא נבלע.
// ‼ מייל ללקוח לעולם לא יוצא בלי שהרו"ח רואה: כשיש הוראות לשלוח, הלחיצה הראשונה מראה מה
// יקרה, ו«בצע» פותח את חלון השליחה (עם התצוגה המקדימה) — האוטומציות כבר בדרך.

import { useState } from 'react';
import type { Client, NiTracking, PersonRole } from '../types';
import { BTL_CREATE_REPRESENTATION_ACTION_TYPE, BTL_CHECK_REPRESENTATION_ACTION_TYPE } from '../types/automation';
import { useAutomationGate } from '../hooks/useAutomationGate';
import { niPersons } from '../utils/niPersons';
import { niCreateInput } from '../features/representation/repAutomationInputs';
import { runChain, chainsOf, type RunAllStep } from '../lib/runAllStart';
import { startAutomationJob } from '../lib/automationJobStart';
import { createAutomationJob, cancelAutomationJob, fetchLatestAutomationJob, jobIsLive } from '../lib/automationJobs';
import { createAutomationJobAfter } from '../lib/automationFollowups';

export type NiNextKind = 'enter' | 'check' | 'send' | null;

export interface NiPersonNext {
  role: PersonRole;
  first: string;
  track?: NiTracking;
  next: NiNextKind;
  /** «שלח»: מייל הדף (בן/בת זוג בלי מייל, 296) או מייל ייעודי — מפתח הקבוצה ב«שלח בקשות». */
  sendFocus?: string;
}

const deps = {
  start: (a: { clientId: string; actionType: string; input: Record<string, unknown> }) =>
    startAutomationJob({ fetchLatest: fetchLatestAutomationJob, cancel: cancelAutomationJob, create: createAutomationJob, isLive: jobIsLive }, a),
  fetchLatest: fetchLatestAutomationJob,
  after: createAutomationJobAfter,
};

/** מה «המשך» יעשה — במילים, לאישור לפני מייל. */
export function niContinueLines(persons: NiPersonNext[]): string[] {
  return persons.flatMap(p => p.next === 'check' ? [`בדיקה בביטוח לאומי אם ${p.first} אישר/ה`]
    : p.next === 'enter' ? [`הזנת ייפוי הכוח של ${p.first} בביטוח לאומי`]
    : p.next === 'send' ? [p.sendFocus === 'owner' ? `ההוראות של ${p.first} — במייל הדף (נפתח חלון השליחה)` : `מייל עם ההוראות ל${p.first} (נפתח חלון השליחה)`]
    : []);
}

/** הכיתוב הקצר מתחת לכפתור. */
export function niContinueHint(persons: NiPersonNext[]): string {
  const checks = persons.filter(p => p.next === 'check').length;
  const enters = persons.filter(p => p.next === 'enter').length;
  const sends = persons.filter(p => p.next === 'send');
  const viaPage = sends.filter(p => p.sendFocus === 'owner');
  const direct = sends.filter(p => p.sendFocus !== 'owner');
  return [
    enters ? 'הזנה' : null,
    checks ? (checks > 1 ? 'בדיקה לשניהם' : 'בדיקה') : null,
    viaPage.length ? `ההוראות של ${viaPage.map(p => p.first).join(' ושל ')} במייל הדף` : null,
    direct.length ? `מייל ל${direct.map(p => p.first).join(' ול')}` : null,
  ].filter(Boolean).join(' + ');
}

interface Props {
  client: Client;
  spouseClient?: Client;
  persons: NiPersonNext[];
  /** פותח את «שלח בקשות» על הקבוצה הזאת. */
  onSend: (focusKey: string) => void;
  onChanged?: () => void;
}

export default function NiContinueButton({ client, spouseClient, persons, onSend, onChanged }: Props) {
  const createGate = useAutomationGate(BTL_CREATE_REPRESENTATION_ACTION_TYPE);
  const checkGate = useAutomationGate(BTL_CHECK_REPRESENTATION_ACTION_TYPE);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);

  const actionable = persons.filter(p => p.next);
  if (actionable.length === 0) return null;
  const sends = actionable.filter(p => p.next === 'send');
  const hint = niContinueHint(actionable);

  function buildSteps(): { steps: RunAllStep[]; errors: string[] } {
    const steps: RunAllStep[] = [];
    const errors: string[] = [];
    for (const p of actionable) {
      if (p.next === 'check') {
        const person = niPersons(client, spouseClient).find(x => x.role === p.role);
        if (!person?.idNumber || !p.track?.referenceNumber) { errors.push(`${p.first}: אין אסמכתא לבדיקה`); continue; }
        steps.push({ key: `check:${p.role}`, actionType: BTL_CHECK_REPRESENTATION_ACTION_TYPE, who: p.role,
          input: { role: p.role, idNumber: person.idNumber, referenceNumber: p.track.referenceNumber } });
      } else if (p.next === 'enter') {
        const built = niCreateInput(client, p.role, spouseClient);
        if (!built.ok) { errors.push(`${p.first}: ${built.error}`); continue; }
        steps.push({ key: `enter:${p.role}`, actionType: BTL_CREATE_REPRESENTATION_ACTION_TYPE, who: p.role, input: built.input });
      }
    }
    return { steps, errors };
  }

  async function runAutomations(steps: RunAllStep[]) {
    const results = (await Promise.all(chainsOf(steps).map(c => runChain(client.id, c, deps)))).flat();
    const failed = results.filter(r => r.kind === 'error' || r.kind === 'needs_confirm');
    setNote(failed.length
      ? { tone: 'err', text: failed.map(r => r.kind === 'needs_confirm' ? 'ניסיון קודם נעצר באמצע — ממשיכים מ«פירוט»' : `לא יצא (${(r as { error: string }).error})`).join(' · ') }
      : { tone: 'ok', text: 'יצא למחשב המשרד — המצב יתעדכן כאן' });
    onChanged?.();
  }

  function execute() {
    setConfirm(false);
    setNote(null);
    const { steps, errors } = buildSteps();
    if (errors.length) setNote({ tone: 'err', text: errors.join(' · ') });
    const go = async () => {
      setBusy(true);
      try { if (steps.length) await runAutomations(steps); } finally { setBusy(false); }
    };
    if (steps.length) {
      // ‼ אותו שער כמו בכל כפתור ב״ל: בלי חיבור — נפתחת ההתחברות, והשרשרת יוצאת לבד אחריה.
      const gate = steps.some(s => s.actionType === BTL_CREATE_REPRESENTATION_ACTION_TYPE) ? createGate : checkGate;
      gate.runOrConnect(() => void go());
    }
    if (sends.length) onSend(sends[0].sendFocus ?? `ni:${sends[0].role}`);
  }

  const gateNotice = createGate.notice ?? checkGate.notice;
  const connecting = createGate.connecting || checkGate.connecting;
  return (
    <div className="rep2-act">
      <button type="button" className="btn btn-sm btn-primary btn-automation" disabled={busy || connecting}
        onClick={() => (sends.length ? setConfirm(c => !c) : execute())}>
        {busy ? 'שולח…' : connecting ? 'מתחבר לביטוח לאומי…' : 'המשך'}
      </button>
      {hint && !confirm && <span className="rep2-hint">{hint}</span>}
      {confirm && (
        <div className="rep2-confirm" role="dialog" aria-label="מה «המשך» יעשה">
          <b>«המשך» יעשה עכשיו:</b>
          <ol>{niContinueLines(actionable).map(t => <li key={t}>{t}</li>)}</ol>
          <div className="rep2-confirm-acts">
            <button type="button" className="btn btn-sm btn-primary" onClick={execute}>בצע</button>
            <button type="button" className="btn btn-sm btn-secondary" onClick={() => setConfirm(false)}>ביטול</button>
          </div>
        </div>
      )}
      {note && <span className={`rep2-hint ${note.tone === 'err' ? 'is-err' : ''}`}>{note.text}</span>}
      {gateNotice && <span className={`rep2-hint ${gateNotice.tone === 'error' ? 'is-err' : ''}`}>{gateNotice.text}</span>}
    </div>
  );
}
