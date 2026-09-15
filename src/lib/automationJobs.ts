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
 * האם המשימה **באמת** רצה עכשיו — כלומר יש מי שמחזיק אותה.
 *
 * ‼ 'running' לבדו אינו הוכחה: העובד המקומי יכול להיהרג באמצע, והשורה נשארת
 * 'running' לנצח. ההוכחה היא החכירה (lease_until) שהעובד מאריך בכל פעימה —
 * חכירה שפקעה פירושה שאף אחד לא מחזיק. אותו כלל בדיוק שהשרת מפעיל כשהוא
 * תופס מחדש (claim_next_automation_job) וכשהוא מבטל (cancel_automation_job, 170).
 * 'queued' נחשב חי — הוא ממתין לעובד, וההתיישנות שלו היא עניין של המסך
 * (timeout בכותרת), לא של הבעלות.
 */
export function jobIsLive(job: AutomationJob | null | undefined, now: number = Date.now()): boolean {
  if (!job) return false;
  if (job.status === 'queued') return true;
  if (job.status !== 'running') return false;
  if (!job.leaseUntil) return false;
  const lease = new Date(job.leaseUntil).getTime();
  return !Number.isNaN(lease) && lease > now;
}

/**
 * האם לחיצה על «הרץ» היא פעולה — הכלל האחד לכל משפחת כרטיסי האוטומציה
 * (כרטיס הבדיקה, כרטיס הרשות בתיק המס, כפתורי החיבור בכותרת).
 *
 * ‼ needs_human ומשימה 'running' שהחכירה שלה פקעה הם **מבוי סתום**, לא ריצה:
 * שניהם ממתינים לאדם, והאדם בדיוק לחץ. לכן הם ניתנים לפעולה — `run` מבטל
 * אותם ויוצר משימה חדשה (בטל-ואז-נסה-שוב). רק משימה חיה חוסמת.
 * עד 170 שני המסכים התנהגו הפוך: כרטיס הבדיקה נעל את הכפתור על needs_human
 * (לנצח), ותיק המס ביטל ויצר חדשה.
 */
export function jobIsActionable(job: AutomationJob | null | undefined): boolean {
  return !jobIsLive(job);
}

/**
 * מבטלת משימה שאין מי שמחזיק אותה: queued, needs_human, או running שהחכירה
 * שלו פקעה (170). משימה חיה מוחזרת כ-not_cancellable.
 */
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
