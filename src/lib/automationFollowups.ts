// ─── «המשך» — משימה שנכנסת לתור כשהקודמת מאותו סוג מסתיימת (270) ───────────────
// ‼ automation_jobs_open_unique: משימה פתוחה אחת לכל (לקוח, סוג פעולה). ב״ל של שני בני
// הזוג הם אותו סוג — לכן השני נשמר כאן, והשרת מכניס אותו לתור כשהראשון מסתיים
// (הצליח / נכשל / בוטל). ‼ לא כשהוא «ממתין לך»: שם הרו"ח מכריע קודם.

import { supabase } from './supabase';
import { automationJobFromDb } from './dbMappers';
import type { AutomationJob } from '../types/automation';

export interface AutomationFollowup {
  id: string;
  actionType: string;
  input: Record<string, unknown>;
  afterJobId: string;
  status: 'waiting' | 'released' | 'cancelled' | 'skipped';
  createdAt: string;
}

const followupFromDb = (r: Record<string, any>): AutomationFollowup => ({
  id: r.id, actionType: r.action_type, input: r.input ?? {}, afterJobId: r.after_job_id,
  status: r.status, createdAt: r.created_at,
});

export type AfterResult =
  | { ok: true; job: AutomationJob; already?: boolean }
  | { ok: true; followup: AutomationFollowup }
  | { ok: false; error: string };

/** נכנסת לתור אחרי `afterJobId`; אם היא כבר לא פתוחה — עכשיו. */
export async function createAutomationJobAfter(
  clientId: string, actionType: string, input: Record<string, unknown>, afterJobId: string,
): Promise<AfterResult> {
  const { data, error } = await supabase.rpc('create_automation_job_after', {
    p_client_id: clientId, p_action_type: actionType, p_input: input, p_after_job_id: afterJobId,
  });
  if (error) return { ok: false, error: error.message };
  const r = data as { ok: boolean; error?: string; job?: Record<string, any>; followup?: Record<string, any>; already?: boolean };
  if (!r.ok) return { ok: false, error: r.error ?? 'create_failed' };
  // ‼ 272: already — לאותו אדם כבר יש משימה פתוחה; היא התשובה, לא נוצר דבר.
  if (r.job) return { ok: true, job: automationJobFromDb(r.job), already: !!r.already };
  return { ok: true, followup: followupFromDb(r.followup ?? {}) };
}

/** המשימות האחרונות של הלקוח מהסוגים האלה — מהחדשה לישנה (למצב החי של «הפעל הכול»). */
export async function fetchClientJobs(clientId: string, actionTypes: string[]): Promise<AutomationJob[]> {
  const { data, error } = await supabase.from('automation_jobs').select('*')
    .eq('client_id', clientId).in('action_type', actionTypes)
    .order('created_at', { ascending: false }).limit(40);
  if (error || !data) return [];
  return data.map(automationJobFromDb);
}

/** מה שממתין לתורו אצל הלקוח. */
export async function fetchWaitingFollowups(clientId: string): Promise<AutomationFollowup[]> {
  const { data, error } = await supabase.from('automation_job_followups')
    .select('*').eq('client_id', clientId).eq('status', 'waiting').order('created_at');
  if (error || !data) return [];
  return data.map(followupFromDb);
}

export async function cancelAutomationFollowup(id: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('cancel_automation_job_followup', { p_id: id });
  return !error && !!(data as { ok?: boolean })?.ok;
}
