// ─── הדוח השנתי: גרסאות שמורות (233) ───────────────────────────────────────────
// ‼ כתיבה רק דרך RPC. במצב הדגמה — אותו חוזה מהמדמה (__fakeTaxYear.ts).
// ‼ «הוגש בפועל» הוא רישום ידני (תאריך + אסמכתה) — אין כאן שידור לרשות.
import { supabase } from '../../lib/supabase';
import type { EstimateVersion } from '../taxEstimate/types';
import { loadEstimates } from '../taxEstimate/api';
import type { ReturnDraft, ReturnOutputs, ReturnVersion } from './types';

type Row = Record<string, unknown>;
const fromRow = (r: Row): ReturnVersion => ({
  id: String(r.id), requestId: String(r.request_id), clientId: String(r.client_id), taxYear: Number(r.tax_year), version: Number(r.version), revision: Number(r.revision ?? 1),
  status: r.status as ReturnVersion['status'], draft: r.draft as ReturnDraft, outputs: (r.outputs ?? undefined) as ReturnOutputs | undefined,
  inputFacts: (r.input_facts ?? []) as ReturnVersion['inputFacts'], approvedAt: r.approved_at ? String(r.approved_at) : undefined,
  filedAt: r.filed_on ? String(r.filed_on) : undefined, filedRef: r.filed_ref ? String(r.filed_ref) : undefined, createdAt: String(r.created_at),
});

export async function loadReturns(requestId: string): Promise<ReturnVersion[]> {
  const { data, error } = await supabase.from('annual_returns').select('*').eq('request_id', requestId).order('version');
  if (error) throw new Error(error.message);
  return ((data ?? []) as Row[]).map(fromRow);
}

/** הערכת המס המאושרת האחרונה לאותו לקוח ושנה — לכיסוי ולהשוואה. אין — undefined (הדוח נבנה מהנתונים הסופיים). */
export async function loadApprovedEstimate(clientId: string, taxYear: number): Promise<EstimateVersion | undefined> {
  const { data } = await supabase.from('onboarding_steps').select('id, step_type, payload, client_id').eq('client_id', clientId).eq('step_type', 'tax_estimate');
  const reqs = ((data ?? []) as Row[]).filter(r => Number(((r.payload ?? {}) as Row).taxYear) === taxYear);
  let best: EstimateVersion | undefined;
  for (const r of reqs) {
    const vs = await loadEstimates(String(r.id)).catch(() => [] as EstimateVersion[]);
    for (const v of vs) if (v.status === 'approved' && (!best || (v.approvedAt ?? '') > (best.approvedAt ?? ''))) best = v;
  }
  return best;
}

type Res<T> = ({ ok: true } & T) | { ok: false; error: string; blockers?: unknown; current?: unknown };
async function call<T>(fn: string, args: Row): Promise<Res<T>> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) return { ok: false, error: error.message };
  const r = (data ?? {}) as Row;
  if (r.ok === false) return { ok: false, error: String(r.error ?? 'error'), blockers: r.blockers, current: r.current };
  return { ok: true, ...(r as T) };
}

export type SaveBase = { draftId: string; revision: number } | { latestVersion: number };
export const baseOf = (vs: ReturnVersion[]): SaveBase => {
  const d = vs.find(v => v.status === 'draft');
  return d ? { draftId: d.id, revision: d.revision } : { latestVersion: vs.reduce((m, v) => Math.max(m, v.version), 0) };
};
export const saveReturn = (requestId: string, draft: ReturnDraft, outputs: ReturnOutputs, inputFacts: { id: string; value: unknown }[], base: SaveBase) =>
  call<{ id: string; version: number; revision: number; created: boolean }>('save_annual_return', { p_request_id: requestId, p_draft: draft, p_outputs: outputs, p_input_facts: inputFacts, p_base: base });
export const approveReturn = (returnId: string, revision: number) => call<{ id: string; version: number }>('approve_annual_return', { p_return_id: returnId, p_revision: revision });
export const recordFiled = (returnId: string, filedOn: string, ref: string, evidenceId?: string) =>
  call<{ id: string; filedOn: string }>('record_annual_return_filed', { p_return_id: returnId, p_filed_on: filedOn, p_ref: ref, p_evidence_id: evidenceId ?? null });

// ── 257 · שורות מקור ממסמך אחד (docTemplates.ts ⇒ record_source_lines) ──
export interface NewEvidence { docKind: string; subjectRole: string; entityKind?: string; entityRef?: string; taxYear: number; fileName?: string; documentId?: string; note?: string }
/** שמירת שורות המקור של מסמך: מסמך קיים (evidenceId) או חדש (evidence); replacesEvidenceId — אישור מתקן שמחליף את שורות המסמך הקודם. */
export const recordSourceLines = (clientId: string, lines: unknown[], target: { evidenceId?: string; evidence?: NewEvidence; replacesEvidenceId?: string }) =>
  call<{ evidenceId: string; factIds: string[]; superseded: number }>('record_source_lines', {
    p_client_id: clientId, p_evidence_id: target.evidenceId ?? null, p_evidence: target.evidence ?? null, p_lines: lines, p_replaces_evidence_id: target.replacesEvidenceId ?? null,
  });

/** בקשות «דוח שנתי» של הלקוח (לפתיחה ממפת הטופס): המזהה והשנה. */
export async function loadReturnRequests(clientId: string): Promise<{ stepId: string; taxYear: number; open: boolean }[]> {
  const { data, error } = await supabase.from('onboarding_steps').select('id, status, payload').eq('client_id', clientId).eq('step_type', 'annual_return');
  if (error) return [];
  return ((data ?? []) as Row[]).map(r => ({ stepId: String(r.id), taxYear: Number(((r.payload ?? {}) as Row).taxYear), open: !['completed', 'verified', 'skipped', 'cancelled', 'failed'].includes(String(r.status)) }));
}
