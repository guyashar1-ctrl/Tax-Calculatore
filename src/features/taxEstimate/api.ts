// ─── הערכת מס: שמירה ואישור של גרסאות (231) ──────────────────────────────────
// ‼ כתיבה רק דרך RPC. במצב הדגמה — אותו חוזה מהמדמה (__fakeTaxYear.ts).
import { supabase } from '../../lib/supabase';
import type { EstimateDraft, EstimateOutputs, EstimateVersion } from './types';

type Row = Record<string, unknown>;
const fromRow = (r: Row): EstimateVersion => ({
  id: String(r.id), requestId: String(r.request_id), clientId: String(r.client_id), taxYear: Number(r.tax_year), version: Number(r.version), revision: Number(r.revision ?? 1),
  status: r.status as EstimateVersion['status'], draft: r.draft as EstimateDraft, outputs: (r.outputs ?? undefined) as EstimateOutputs | undefined,
  inputFacts: (r.input_facts ?? []) as EstimateVersion['inputFacts'], approvedAt: r.approved_at ? String(r.approved_at) : undefined,
  approvedBy: r.approved_by ? String(r.approved_by) : undefined, publishedAt: r.published_at ? String(r.published_at) : undefined, createdAt: String(r.created_at), updatedAt: r.updated_at ? String(r.updated_at) : undefined,
});

export async function loadEstimates(requestId: string): Promise<EstimateVersion[]> {
  const { data, error } = await supabase.from('tax_estimates').select('*').eq('request_id', requestId).order('version');
  if (error) throw new Error(error.message);
  return ((data ?? []) as Row[]).map(fromRow);
}

type Res<T> = ({ ok: true } & T) | { ok: false; error: string; blockers?: unknown; current?: unknown };
async function call<T>(fn: string, args: Row): Promise<Res<T>> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) return { ok: false, error: error.message };
  const r = (data ?? {}) as Row;
  if (r.ok === false) return { ok: false, error: String(r.error ?? 'error'), blockers: r.blockers, current: r.current };
  return { ok: true, ...(r as T) };
}

/** «מה ראיתי»: הטיוטה ומספר העדכון שלה, או הגרסה האחרונה כשאין טיוטה. */
export type SaveBase = { draftId: string; revision: number } | { latestVersion: number };
export const baseOf = (vs: EstimateVersion[]): SaveBase => {
  const d = vs.find(v => v.status === 'draft');
  return d ? { draftId: d.id, revision: d.revision } : { latestVersion: vs.reduce((m, v) => Math.max(m, v.version), 0) };
};
export const saveEstimate = (requestId: string, draft: EstimateDraft, outputs: EstimateOutputs, inputFacts: { id: string; value: unknown }[], base: SaveBase) =>
  call<{ id: string; version: number; revision: number; created: boolean }>('save_tax_estimate', { p_request_id: requestId, p_draft: draft, p_outputs: outputs, p_input_facts: inputFacts, p_base: base });
/** פרסום גרסה מאושרת בדף האישי (232). */
export const publishEstimate = (estimateId: string, publish: boolean) => call<{ id: string; publishedAt?: string }>('publish_tax_estimate', { p_estimate_id: estimateId, p_publish: publish });
export const approveEstimate = (estimateId: string, revision: number) => call<{ id: string; version: number }>('approve_tax_estimate', { p_estimate_id: estimateId, p_revision: revision });

/** מסמכים בתיק — לקישור קריאת 134 / ב״ל / מע״מ למקור (צילום מסך, תדפיס). */
export async function loadClientDocuments(clientId: string): Promise<{ id: string; label: string; date?: string }[]> {
  const { data } = await supabase.from('documents').select('id, file_name, description, uploaded_at').eq('client_id', clientId).order('uploaded_at', { ascending: false }).limit(80);
  return ((data ?? []) as Row[]).map(r => ({ id: String(r.id), label: String(r.description || r.file_name || 'מסמך'), date: r.uploaded_at ? String(r.uploaded_at).slice(0, 10) : undefined }));
}

/**
 * 30.10.2026 · עסק חדש: ההערכה האחרונה שאושרה ללקוח (draft.newBusiness) — ממנה ההכנסה הצפויה בטופס 6101 והשיעור לפתיחת התיק.
 * ‼ רק גרסה מאושרת: טיוטה אינה מספר שהמשרד עומד מאחוריו.
 */
export async function latestNewBusinessEstimate(clientId: string): Promise<EstimateVersion | null> {
  const { data, error } = await supabase.from('tax_estimates').select('*').eq('client_id', clientId).eq('status', 'approved').order('approved_at', { ascending: false }).limit(5);
  if (error) return null;
  return ((data ?? []) as Row[]).map(fromRow).find(v => !!v.draft?.newBusiness) ?? null;
}
/** מה עובר מההערכה לפתיחת התיקים: הכנסה בחודש (רווח לשנה ÷ 12), השיעור במס הכנסה, ומתי העסק מתחיל. */
export function newBusinessFigures(v: EstimateVersion, person: 'client' | 'spouse' = 'client') {
  const p = v.outputs?.persons.find(x => x.person === person);
  const it = v.outputs?.advances.find(a => a.authority === 'it' && a.person === person);
  return { monthlyIncome: p ? Math.round(p.businessTaxable / 12) : undefined, itRate: it?.recommended, start: v.draft.newBusiness?.start, at: v.approvedAt?.slice(0, 10) };
}
