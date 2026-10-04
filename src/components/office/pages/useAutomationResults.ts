// «אוטומציות» · מה קרה בפועל — שאילתה קטנה לכל מנגנון (סבב 4, 3.10.2026).
// ‼ לא חלון אחד של 200 המיילים / 200 הריצות האחרונים: מנגנון נדיר (תזכורת
// פקיעה, בדיקת ב״ל) היה נראה כאילו לא רץ מעולם. כל שורה — החמש האחרונות שלה.
// ‼ הודעות ללקוח מהדף (client_notices, 214) נקראות כאן גם כשלא יצא מייל:
// מתוזמנת, דולגה (אין כתובת), «לא ידוע אם יצאה» — זה המצב האמיתי.
// ‼ וקריאה במסלול שלא רצה (flow_runs, 215) — «ממתינה לך» עם הסיבה (waitsOf).
// קריאה בלבד (RLS: client_notices_own, email_messages, automation_jobs, flow_runs_own).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../../../lib/supabase';
import { automationJobFromDb } from '../../../lib/dbMappers';
import type { AutomationJob } from '../../../types/automation';
import type { EmailMessage } from '../../../types/emailActivity';
import type { FlowDefinition } from '../../../features/flows/types';
import {
  flowDefKey, flowWaits, type AutoRow, type FlowWait, type MailQuery, type NoticeRow, type WaitRun,
} from '../../../features/automation/automationList';
import { fetchEmails } from './recentSends';

/** null — עוד נטען · 'error' — לא נטען (וזה לא אומר שלא קרה). */
export type Loaded<T> = T[] | 'error' | null;

const SHOWN = 5;
const REFRESH_MS = 60_000;
const JOB_COLUMNS = 'id,user_id,client_id,action_type,input,status,result,error_code,error_detail,needs_human,attempts,max_attempts,created_at,updated_at,finished_at';
const NOTICE_COLUMNS = 'id,client_id,kind,status,reason,due_at,sent_at,created_at,updated_at,email_message_id,kick_attempts,lease_until';

function noticeFromDb(r: Record<string, unknown>): NoticeRow {
  return {
    id: String(r.id), clientId: String(r.client_id), kind: r.kind as NoticeRow['kind'], status: r.status as NoticeRow['status'],
    reason: (r.reason as string | null) ?? null, dueAt: (r.due_at as string | null) ?? null, sentAt: (r.sent_at as string | null) ?? null,
    createdAt: String(r.created_at ?? ''), updatedAt: (r.updated_at as string | null) ?? null,
    emailMessageId: (r.email_message_id as string | null) ?? null, kickAttempts: (r.kick_attempts as number | null) ?? null,
    leaseUntil: (r.lease_until as string | null) ?? null,
  };
}

async function noticesOf(kind: 'new' | 'reminder'): Promise<NoticeRow[] | 'error'> {
  // ‼ שתי שאילתות: החמש האחרונות, וכל מה ש«לא ידוע אם יצא» — הוא חוסם את
  // ההודעות הבאות ללקוח עד שמכריעים, גם כשהוא כבר לא בין האחרונות.
  // ‼ «בשליחה» שהחכירה שלו פקעה — גם הוא «לא ידוע» (השרת מעביר אותו רק בבדיקה הבאה),
  // ולכן נקרא כאן גם כשהוא לא בין האחרונות. «בשליחה» חי — רק אם הוא בין האחרונות.
  const [recent, unknown] = await Promise.all([
    supabase.from('client_notices').select(NOTICE_COLUMNS).eq('origin', 'auto').eq('kind', kind)
      .order('updated_at', { ascending: false }).limit(SHOWN),
    supabase.from('client_notices').select(NOTICE_COLUMNS).eq('origin', 'auto').eq('kind', kind).in('status', ['unknown', 'sending'])
      .order('updated_at', { ascending: false }).limit(20),
  ]);
  if (recent.error || unknown.error) return 'error';
  const seen = new Set<string>();
  const now = Date.now();
  return [...(recent.data ?? []), ...(unknown.data ?? []).filter(r => {
    const row = r as { status?: string; lease_until?: string | null };
    return row.status !== 'sending' || (!!row.lease_until && Date.parse(row.lease_until) < now);
  })]
    .map(r => noticeFromDb(r as Record<string, unknown>))
    .filter(n => (seen.has(n.id) ? false : (seen.add(n.id), true)));
}

async function jobsOf(actionType: string): Promise<AutomationJob[] | 'error'> {
  const { data, error } = await supabase.from('automation_jobs').select(JOB_COLUMNS)
    .eq('action_type', actionType).order('created_at', { ascending: false }).limit(SHOWN);
  if (error) return 'error';
  return (data ?? []).map(row => automationJobFromDb({ artifacts: [], ...(row as Record<string, unknown>) }));
}

/**
 * קריאות במסלול שלא רצו וממתינות לך (215: flow_runs.state.actions = waiting_office).
 * ‼ השרת לא יוצר משימה במצב הזה — לכן זה לא נמצא ב-automation_jobs. שלוש קריאות
 * קריאה-בלבד: הריצות הפעילות שיש בהן המתנה, ההגדרה של הגרסה שלהן (לאיזו פעולה
 * הפריט שייך), ומה הורץ מאז ללקוחות האלה. 'error' — לא נטען (וזה לא אומר שאין).
 */
async function waitsOf(actionTypes: string[]): Promise<FlowWait[] | 'error'> {
  const runs = await supabase.from('flow_runs').select('id,client_id,flow_id,flow_version,state')
    .eq('status', 'active').like('state->>actions', '%waiting_office%')
    .order('updated_at', { ascending: false }).limit(100);
  if (runs.error) return 'error';
  const list: WaitRun[] = ((runs.data ?? []) as Record<string, unknown>[]).map(r => ({
    id: String(r.id), clientId: String(r.client_id), flowId: String(r.flow_id), flowVersion: Number(r.flow_version), state: r.state,
  }));
  if (list.length === 0) return [];
  const flowIds = [...new Set(list.map(r => r.flowId))];
  const clientIds = [...new Set(list.map(r => r.clientId))];
  const [versions, flows, jobs] = await Promise.all([
    supabase.from('office_flow_versions').select('flow_id,version,definition').in('flow_id', flowIds),
    supabase.from('office_flows').select('id,name').in('id', flowIds),
    supabase.from('automation_jobs').select('client_id,action_type,status,created_at')
      .in('client_id', clientIds).in('action_type', actionTypes).order('created_at', { ascending: false }).limit(500),
  ]);
  if (versions.error || jobs.error) return 'error';
  const defs = new Map<string, FlowDefinition>();
  for (const v of (versions.data ?? []) as { flow_id: string; version: number; definition: FlowDefinition }[]) {
    defs.set(flowDefKey(v.flow_id, Number(v.version)), v.definition);
  }
  const names = Object.fromEntries(((flows.data ?? []) as { id: string; name: string }[]).map(f => [f.id, f.name]));
  const done = ((jobs.data ?? []) as { client_id: string | null; action_type: string; status: string; created_at: string }[])
    .map(j => ({ clientId: j.client_id, actionType: j.action_type, status: j.status, createdAt: j.created_at }));
  return flowWaits(list, defs, done, names).filter(w => actionTypes.includes(w.actionType));
}

export function useAutomationResults(rows: AutoRow[], actionTypes: string[]) {
  // ‼ המפתח הוא הסינון — לא השורות עצמן, שמתחלפות כשהמסלולים נטענים.
  const specs = useMemo(() => rows.flatMap(r => (r.source.type === 'emails'
    ? [{ id: r.id, mail: r.source.mail as MailQuery, notices: r.source.notices }] : [])), [rows]);
  const key = JSON.stringify(specs) + actionTypes.join(',');
  const specsRef = useRef(specs);
  specsRef.current = specs;

  const [mails, setMails] = useState<Record<string, Loaded<EmailMessage>>>({});
  const [notices, setNotices] = useState<Record<string, Loaded<NoticeRow>>>({});
  const [jobs, setJobs] = useState<Record<string, Loaded<AutomationJob>>>({});
  const [waits, setWaits] = useState<Loaded<FlowWait>>(null);
  const [now, setNow] = useState(() => Date.now());
  // ‼ StrictMode מרכיב, מפרק ומרכיב שוב — הדגל חוזר ל-true בכל הרכבה.
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  const load = useCallback(async () => {
    const list = specsRef.current;
    const kinds = [...new Set(list.map(s => s.notices).filter((k): k is 'new' | 'reminder' => !!k))];
    const [m, n, j, w] = await Promise.all([
      Promise.all(list.map(async s => [s.id, (await fetchEmails(s.mail, { limit: SHOWN })) ?? 'error'] as const)),
      Promise.all(kinds.map(async k => [k, await noticesOf(k)] as const)),
      Promise.all(actionTypes.map(async t => [t, await jobsOf(t)] as const)),
      // ‼ שאילתה חדשה (215) — כשל בה לא מפיל את שאר התוצאות.
      waitsOf(actionTypes).catch((): 'error' => 'error'),
    ]);
    if (!alive.current) return;
    setNow(Date.now());
    setMails(Object.fromEntries(m));
    setNotices(Object.fromEntries(n));
    setJobs(Object.fromEntries(j));
    setWaits(w);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    void load();
    const id = window.setInterval(() => { if (document.visibilityState === 'visible') void load(); }, REFRESH_MS);
    return () => window.clearInterval(id);
  }, [load]);

  const reloadJobs = useCallback(async () => {
    const [j, w] = await Promise.all([
      Promise.all(actionTypes.map(async t => [t, await jobsOf(t)] as const)),
      waitsOf(actionTypes).catch((): 'error' => 'error'),
    ]);
    if (alive.current) { setNow(Date.now()); setJobs(Object.fromEntries(j)); setWaits(w); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return { mails, notices, jobs, waits, now, reloadJobs };
}
