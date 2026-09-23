// ─── יסוד האוטומציה — עטיפות RPC דקות, בלי תלות ב-React ─────────────────────
// נקראות מ-useAutomationJobs. ראה supabase/150-automation-jobs.sql לסמנטיקה
// המלאה ו-docs/PIVO-AUTOMATION-FOUNDATION.html לארכיטקטורה.

import { supabase } from './supabase';
import { automationJobFromDb, automationWorkerFromDb } from './dbMappers';
import type { AutomationJob, AutomationWorker } from '../types/automation';
import { jobIsLive, jobIsActionable } from './automationJobLease';

export { jobIsLive, jobIsActionable };

export interface AutomationJobRpcResult {
  ok: boolean;
  error?: string;
  created?: boolean;
  job?: AutomationJob;
}

/**
 * יוצרת משימה, או מחזירה את הפתוחה הקיימת לאותו (לקוח, פעולה) — לא כפילות.
 * `clientId: null` ⇒ משימת מערכת שאינה שייכת ללקוח (חיבור/ניתוק לרשות).
 */
export async function createAutomationJob(
  clientId: string | null,
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

/**
 * מבטלת משימה שאין מי שמחזיק אותה: queued, needs_human, או running שהחכירה
 * שלו פקעה (170). משימה חיה מוחזרת כ-not_cancellable.
 */
export async function cancelAutomationJob(
  jobId: string,
  /**
   * 196: אישור מפורש לביטול פעולה שכבר **נגעה בשע״ם**. בלעדיו השרת דוחה —
   * וזה בכוונה: «בטל-ואז-נסה-שוב» השקט היה הדרך שבה פנייה חיצונית שנייה
   * נולדת בלי שאף אחד החליט. מועבר רק ממסך שהציג לרו"ח מה קרה ומה הסיכון.
   */
  acknowledgeExternal = false,
): Promise<AutomationJobRpcResult> {
  const { data, error } = await supabase.rpc('cancel_automation_job', {
    p_job_id: jobId, p_acknowledge_external: acknowledgeExternal,
  });
  if (error) return { ok: false, error: error.message };
  const r = data as { ok: boolean; error?: string; job?: Record<string, any> };
  if (!r.ok) return { ok: false, error: r.error };
  return { ok: true, job: r.job ? automationJobFromDb(r.job) : undefined };
}

/**
 * 168: מבקשת ביטול של job שכבר running — ה-worker בודק את הדגל בין
 * capabilities ומסיים בעצמו. ‼ לא מבטלת מיידית: זו בקשה, לא פעולה סופית.
 */
export async function requestJobCancellation(jobId: string): Promise<AutomationJobRpcResult> {
  const { data, error } = await supabase.rpc('request_job_cancellation', { p_job_id: jobId });
  if (error) return { ok: false, error: error.message };
  const r = data as { ok: boolean; error?: string; job?: Record<string, any> };
  if (!r.ok) return { ok: false, error: r.error };
  return { ok: true, job: r.job ? automationJobFromDb(r.job) : undefined };
}

/** 168: "דלג כרגע" על capability בודדת — ה-worker לא בודק אותה שוב באותו job. */
export async function deferJobCapability(jobId: string, capability: string): Promise<AutomationJobRpcResult> {
  const { data, error } = await supabase.rpc('defer_job_capability', {
    p_job_id: jobId,
    p_capability: capability,
  });
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
