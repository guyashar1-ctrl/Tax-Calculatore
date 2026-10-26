// ─── חובות הגשה מרשימות שע״ם — קריאות לשרת (250) ─────────────────────────────────────────────────────
// ‼ כל הכללים בשרת: שיוך, השוואה לקיים, קובץ ישן, מצב. הדפדפן רק מפענח את ה-PDF ומציג את מה שהשרת החליט.
// ‼ בהדגמה (מסד מדומה — ?office-app / ?test-office) הקריאות עוברות ל-__fakeShaamFiling, בלי רשת.

import { supabase } from '../../lib/supabase';
import type { Batch } from './parse/batch';
import type { ImportSummary, Obligation, PlanRow, SourceSummary, UndoSummary } from './model';
import type { WealthGroup } from './parse/parseShaam';

type Rpc = <T>(name: string, args: Record<string, unknown>) => Promise<T>;

let fake: Rpc | null | undefined;
async function fakeRpc(): Promise<Rpc | null> {
  if (fake !== undefined) return fake;
  fake = null;
  if (import.meta.env.DEV) {
    const m = await import('./__fakeShaamFiling');
    if (await m.fakeActive()) fake = m.fakeRpc as Rpc;
  }
  return fake;
}

async function rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const f = await fakeRpc();
  if (f) return f<T>(name, args);
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw new Error(error.message);
  return data as T;
}

export interface PreviewResult { ok: boolean; error?: string; plan: PlanRow[]; names: Record<string, string> }
export const previewImport = (batch: Batch) => rpc<PreviewResult>('shaam_filing_preview', { p_batch: batch });

// ‼ 305 · נכתב מיד: מזוהים לתיקים, לא ודאי «לבדיקה», וחובה פתוחה חדשה (דוח שנתי) פותחת בקשה פנימית — בשרת.
export interface ImportResult {
  ok: boolean; error?: string; counts: Record<string, number>; plan: PlanRow[]; sources?: Record<string, string>;
  summary?: ImportSummary;
  opened?: { obligationId: string; clientId: string; stepId: string; created: boolean }[];
  openFailed?: { obligationId: string; clientId: string; error: string }[];
}
export const saveImport = (batch: Batch) => rpc<ImportResult>('shaam_filing_import', { p_batch: batch });

export interface ListResult { ok: boolean; obligations: Obligation[]; sources: SourceSummary[] }
export const listObligations = (clientId?: string) => rpc<ListResult>('shaam_filing_list', { p_client_id: clientId ?? null });

export const resolveObligation = (id: string, clientId: string | null, role: 'client' | 'spouse' = 'client') =>
  rpc<{ ok: boolean; error?: string }>('resolve_shaam_obligation', { p_id: id, p_client_id: clientId, p_role: role });

export const linkObligationStep = (id: string, stepId: string) =>
  rpc<{ ok: boolean; error?: string; already?: boolean }>('link_shaam_obligation_step', { p_id: id, p_step_id: stepId });

export const requestCopy = (id: string) => rpc<{ ok: boolean; error?: string; stepId?: string; already?: boolean }>('request_shaam_filing_copy', { p_id: id });

/** 305 · «ביטול ההעלאה» — מחזיר בדיוק את מה שהמקור עשה; מה שאדם כבר עבד עליו נשאר (kept). קריאה שנייה — already. */
export const undoSource = (sourceId: string) =>
  rpc<{ ok: boolean; error?: string; already?: boolean; summary?: UndoSummary } & Partial<UndoSummary>>('undo_shaam_filing_source', { p_source_id: sourceId });

export const confirmGroupEmpty = (group: WealthGroup, note?: string) =>
  rpc<{ ok: boolean; error?: string }>('confirm_shaam_group_empty', { p_group: group, p_note: note ?? null });

/**
 * הקובץ המקורי → הדלי הפרטי של המשרד (office-imports/<משרד>/shaam-filing/<sha>.pdf). ‼ רשימה משרדית של לקוחות רבים —
 * לא לתיקי הלקוחות. אותו קובץ שוב — אותו נתיב («כבר קיים» = הצלחה).
 */
export async function uploadSource(file: File, sha: string): Promise<{ path?: string; error?: string }> {
  const { data } = await supabase.auth.getUser();
  const uid = data.user?.id;
  if (!uid) return { error: 'לא מחובר' };
  const path = `${uid}/shaam-filing/${sha}.pdf`;
  const { error } = await supabase.storage.from('office-imports').upload(path, file, { upsert: false, contentType: 'application/pdf' });
  if (error && !/exists|duplicate/i.test(error.message)) return { error: error.message };
  return { path };
}

