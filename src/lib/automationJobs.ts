// ─── יסוד האוטומציה — עטיפות RPC דקות, בלי תלות ב-React ─────────────────────
// נקראות מ-useAutomationJobs. ראה supabase/150-automation-jobs.sql לסמנטיקה
// המלאה ו-docs/PIVO-AUTOMATION-FOUNDATION.html לארכיטקטורה.

import { supabase } from './supabase';
import { automationJobFromDb, automationWorkerFromDb } from './dbMappers';
import type { AutomationJob, AutomationWorker } from '../types/automation';

export interface AutomationJobRpcResult {
  ok: boolean;
  error?: string;
  created?: boolean;
  job?: AutomationJob;
}

/** יוצרת משימה, או מחזירה את הפתוחה הקיימת לאותו (לקוח, פעולה) — לא כפילות. */
export async function createAutomationJob(
  clientId: string,
  actionType: string,
  input: Record<string, unknown> = {},
): Promise<AutomationJobRpcResult> {
  const { data, error } = await supabase.rpc('create_automation_job', {
    p_client_id: clientId,
    p_action_type: actionType,
    p_input: input,
  });
  if (error) return { ok: false, error: error.message };
  const r = data as { ok: boolean; error?: string; created?: boolean; job?: Record<string, any> };
  if (!r.ok) return { ok: false, error: r.error };
  return { ok: true, created: r.created, job: r.job ? automationJobFromDb(r.job) : undefined };
}

/** מבטלת משימה שעוד לא נתפסה (queued/needs_human בלבד). */
export async function cancelAutomationJob(jobId: string): Promise<AutomationJobRpcResult> {
  const { data, error } = await supabase.rpc('cancel_automation_job', { p_job_id: jobId });
  if (error) return { ok: false, error: error.message };
  const r = data as { ok: boolean; error?: string; job?: Record<string, any> };
  if (!r.ok) return { ok: false, error: r.error };
  return { ok: true, job: r.job ? automationJobFromDb(r.job) : undefined };
}

/** המשימה הפתוחה (queued/running/needs_human) האחרונה לאותו (לקוח, פעולה), אם יש. */
export async function fetchOpenAutomationJob(
  clientId: string,
  actionType: string,
): Promise<{ job: AutomationJob | null; error?: string }> {
  const { data, error } = await supabase.from('automation_jobs')
    .select('*')
    .eq('client_id', clientId)
    .eq('action_type', actionType)
    .in('status', ['queued', 'running', 'needs_human'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return { job: null, error: error.message };
  return { job: data ? automationJobFromDb(data) : null };
}

/** המשימה האחרונה (בכל סטטוס) לאותו (לקוח, פעולה) — לשחזור אחרי succeeded/failed. */
export async function fetchLatestAutomationJob(
  clientId: string,
  actionType: string,
): Promise<{ job: AutomationJob | null; error?: string }> {
  const { data, error } = await supabase.from('automation_jobs')
    .select('*')
    .eq('client_id', clientId)
    .eq('action_type', actionType)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return { job: null, error: error.message };
  return { job: data ? automationJobFromDb(data) : null };
}

/** מתי לאחרונה נראה כל עובד רשום למשתמש הזה — כדי להבחין "רץ" מ"המחשב כבוי". */
export async function fetchAutomationWorkers(): Promise<{ workers: AutomationWorker[]; error?: string }> {
  const { data, error } = await supabase.from('automation_workers')
    .select('*')
    .order('last_seen_at', { ascending: false });
  if (error) return { workers: [], error: error.message };
  return { workers: (data ?? []).map(automationWorkerFromDb) };
}
