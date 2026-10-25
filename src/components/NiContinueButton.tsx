// ─── ביטוח לאומי בשורת «ייצוג מול הרשויות» — שורה אחת לשני בני הזוג ────────────
// גיא (25.10.2026, ליאת ואוריה): «ככה ניתן לבדוק אם התקבל או לא?». «המשך» ערבב בדיקה עם מייל.
// מעכשיו כל כפתור אומר מה הוא עושה:
//   · «בדוק בביטוח לאומי» — לכל מי שיש לו אסמכתא ועוד לא אושר (קריאה בלבד). התוצאה נכתבת
//     בשורה: מה ב״ל אמר ומתי נבדק (syncedAt, 195).
//   · «הזן בביטוח לאומי» — רק למי שלא הוזן או שהאסמכתא שלו פגה.
// ‼ שליחת ההוראות — רק מכרטיס «הדף של {שם}» בראש «בקשות» (גיא: קישור שני לאותו חלון מיותר).
// האוטומציות יוצאות כשרשרת (runChain, 270): משימה פתוחה אחת מכל סוג לכרטיס
// (automation_jobs_open_unique), ולכן השני נכנס לתור אחרי הראשון — לא נבלע.

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

export interface NiPersonNext {
  role: PersonRole;
  first: string;
  track?: NiTracking;
  /** יש אסמכתא ולא אושר ⇒ נכלל ב«בדוק בביטוח לאומי». */
  check?: boolean;
  /** לא הוזן / האסמכתא פגה ⇒ «הזן בביטוח לאומי». */
  enter?: boolean;
}

const deps = {
  start: (a: { clientId: string; actionType: string; input: Record<string, unknown> }) =>
    startAutomationJob({ fetchLatest: fetchLatestAutomationJob, cancel: cancelAutomationJob, create: createAutomationJob, isLive: jobIsLive }, a),
  fetchLatest: fetchLatestAutomationJob,
  after: createAutomationJobAfter,
};

/** «נבדק היום 14:20» / «נבדק 24.10 09:05» / «עוד לא נבדק» — מתי ב״ל נקרא לאחרונה לאדם הזה. */
export function niLastCheck(track: NiTracking | undefined, now: Date = new Date()): string {
  const d = track?.syncedAt ? new Date(track.syncedAt) : null;
  if (!d || Number.isNaN(d.getTime())) return 'עוד לא נבדק';
  const two = (n: number) => String(n).padStart(2, '0');
  const hm = `${two(d.getHours())}:${two(d.getMinutes())}`;
  return d.toDateString() === now.toDateString() ? `נבדק היום ${hm}` : `נבדק ${two(d.getDate())}.${two(d.getMonth() + 1)} ${hm}`;
}

interface Props {
  client: Client;
  spouseClient?: Client;
  persons: NiPersonNext[];
  onChanged?: () => void;
}

export default function NiContinueButton({ client, spouseClient, persons, onChanged }: Props) {
  const createGate = useAutomationGate(BTL_CREATE_REPRESENTATION_ACTION_TYPE);
  const checkGate = useAutomationGate(BTL_CHECK_REPRESENTATION_ACTION_TYPE);
  const [busy, setBusy] = useState<'check' | 'enter' | null>(null);
  const [note, setNote] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);

  const toCheck = persons.filter(p => p.check);
  const toEnter = persons.filter(p => p.enter);
  if (!toCheck.length && !toEnter.length) return null;

  function steps(kind: 'check' | 'enter'): { steps: RunAllStep[]; errors: string[] } {
    const out: RunAllStep[] = [];
    const errors: string[] = [];
    for (const p of kind === 'check' ? toCheck : toEnter) {
      if (kind === 'check') {
        const person = niPersons(client, spouseClient).find(x => x.role === p.role);
        if (!person?.idNumber || !p.track?.referenceNumber) { errors.push(`${p.first}: חסרים ת.ז. או אסמכתא`); continue; }
        out.push({ key: `check:${p.role}`, actionType: BTL_CHECK_REPRESENTATION_ACTION_TYPE, who: p.role,
          input: { role: p.role, idNumber: person.idNumber, referenceNumber: p.track.referenceNumber } });
      } else {
        const built = niCreateInput(client, p.role, spouseClient);
        if (!built.ok) { errors.push(`${p.first}: ${built.error}`); continue; }
        out.push({ key: `enter:${p.role}`, actionType: BTL_CREATE_REPRESENTATION_ACTION_TYPE, who: p.role, input: built.input });
      }
    }
    return { steps: out, errors };
  }

  function run(kind: 'check' | 'enter') {
    setNote(null);
    const { steps: list, errors } = steps(kind);
    if (errors.length) setNote({ tone: 'err', text: errors.join(' · ') });
    if (!list.length) return;
    const go = async () => {
      setBusy(kind);
      try {
        const results = (await Promise.all(chainsOf(list).map(c => runChain(client.id, c, deps)))).flat();
        const failed = results.filter(r => r.kind === 'error' || r.kind === 'needs_confirm');
        setNote(failed.length
          ? { tone: 'err', text: failed.map(r => r.kind === 'needs_confirm' ? 'ניסיון קודם נעצר באמצע — ממשיכים מ«פירוט»' : `לא יצא (${(r as { error: string }).error})`).join(' · ') }
          : { tone: 'ok', text: kind === 'check' ? 'בודק בביטוח לאומי — התוצאה תופיע כאן' : 'מזין בביטוח לאומי — האסמכתא תופיע כאן' });
        onChanged?.();
      } finally { setBusy(null); }
    };
    // ‼ אותו שער כמו בכל כפתור ב״ל: בלי חיבור — נפתחת ההתחברות, והשרשרת יוצאת לבד אחריה.
    (kind === 'enter' ? createGate : checkGate).runOrConnect(() => void go());
  }

  const gateNotice = createGate.notice ?? checkGate.notice;
  const connecting = createGate.connecting || checkGate.connecting;
  return (
    <div className="rep2-act">
      {toCheck.length > 0 && (
        <button type="button" className="btn btn-sm btn-primary btn-automation" disabled={!!busy || connecting}
          onClick={() => run('check')}>
          {busy === 'check' ? 'שולח…' : connecting ? 'מתחבר לביטוח לאומי…' : 'בדוק בביטוח לאומי'}
        </button>
      )}
      {toEnter.length > 0 && (
        <button type="button" className={`btn btn-sm ${toCheck.length ? 'btn-secondary' : 'btn-primary btn-automation'}`}
          disabled={!!busy || connecting} onClick={() => run('enter')}>
          {busy === 'enter' ? 'שולח…' : `הזן בביטוח לאומי${toEnter.length === 1 && persons.length > 1 ? ` (${toEnter[0].first})` : ''}`}
        </button>
      )}
      {note && <span className={`rep2-hint ${note.tone === 'err' ? 'is-err' : ''}`}>{note.text}</span>}
      {gateNotice && <span className={`rep2-hint ${gateNotice.tone === 'error' ? 'is-err' : ''}`}>{gateNotice.text}</span>}
    </div>
  );
}
