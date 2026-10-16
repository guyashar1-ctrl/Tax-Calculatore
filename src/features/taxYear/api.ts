// ─── שנת מס: קריאה וכתיבה מול השרת (229) ──────────────────────────────────────
// ‼ כל כתיבה דרך RPC (allowlist, בעלות, מצבים). אין insert/update ישיר לטבלאות.
// במצב פיתוח בלי מסד, אותן קריאות נענות מהמדמה (__fakeTaxYear.ts) — אותו חוזה.

import { supabase } from '../../lib/supabase';
import type { AskAnswer } from './asks';
import type { Evidence, FactAnswer, InfoAsk, Purpose, YearFact } from './types';
import type { GateEngagement } from '../../utils/clientPageGate';

type Row = Record<string, unknown>;
const s = (v: unknown) => (v == null ? undefined : String(v));
const d = (v: unknown) => (v == null ? undefined : String(v).slice(0, 10));

export const factFromRow = (r: Row): YearFact => ({
  id: String(r.id), clientId: String(r.client_id), taxYear: Number(r.tax_year), itemKey: String(r.item_key),
  subjectRole: r.subject_role as YearFact['subjectRole'], entityKind: s(r.entity_kind) as YearFact['entityKind'], entityRef: s(r.entity_ref),
  periodKind: r.period_kind as YearFact['periodKind'], periodFrom: d(r.period_from), periodTo: d(r.period_to),
  answer: r.answer as FactAnswer, value: r.value ?? undefined, basis: r.basis as YearFact['basis'],
  forecastBy: s(r.forecast_by) as YearFact['forecastBy'], assumption: s(r.assumption), isOneOff: !!r.is_one_off,
  source: r.source as YearFact['source'], clientAssertion: s(r.client_assertion) as YearFact['clientAssertion'],
  confirmsFactId: s(r.confirms_fact_id), requestId: s(r.request_id), evidenceId: s(r.evidence_id), askId: s(r.ask_id),
  status: r.status as YearFact['status'], decidedBy: s(r.decided_by), decidedAt: s(r.decided_at), supersedes: s(r.supersedes),
  note: s(r.note), createdAt: String(r.created_at),
});

export const evidenceFromRow = (r: Row): Evidence => ({
  id: String(r.id), clientId: String(r.client_id), taxYear: r.tax_year == null ? undefined : Number(r.tax_year),
  docKind: r.doc_kind as Evidence['docKind'], subjectRole: r.subject_role as Evidence['subjectRole'],
  entityKind: s(r.entity_kind) as Evidence['entityKind'], entityRef: s(r.entity_ref), periodFrom: d(r.period_from), periodTo: d(r.period_to),
  documentId: s(r.document_id), fileName: s(r.file_name), receivedAt: String(r.received_at), receivedVia: r.received_via as Evidence['receivedVia'],
  extraction: r.extraction as Evidence['extraction'], identityMatch: r.identity_match as Evidence['identityMatch'],
  periodMatch: r.period_match as Evidence['periodMatch'], review: r.review as Evidence['review'],
  reviewedBy: s(r.reviewed_by), reviewedAt: s(r.reviewed_at), note: s(r.note), askId: s(r.ask_id),
});

export const askFromRow = (r: Row): InfoAsk & { officeNote?: string; noteResolvedAt?: string } => ({
  id: String(r.id), clientId: String(r.client_id), taxYear: Number(r.tax_year), stepId: String(r.step_id), parentStepId: String(r.parent_step_id),
  itemKey: String(r.item_key), subjectRole: r.subject_role as InfoAsk['subjectRole'], entityKind: s(r.entity_kind) as InfoAsk['entityKind'],
  entityRef: s(r.entity_ref), prompt: r.prompt as InfoAsk['prompt'], state: r.state as InfoAsk['state'],
  savedDraft: r.saved_draft ?? undefined, unavailable: (r.unavailable ?? undefined) as InfoAsk['unavailable'],
  createdAt: String(r.created_at), answeredAt: s(r.answered_at), officeNote: s(r.office_note), noteResolvedAt: s(r.note_resolved_at),
});

export interface YearData { facts: YearFact[]; evidence: Evidence[]; asks: (InfoAsk & { officeNote?: string; noteResolvedAt?: string })[] }

/** כל מה ששנת המס צריכה ללקוח — עובדות, ראיות ושאלות (כל המצבים, להיסטוריה). */
/** שאלון הקליטה הישן שנקשר לבקשה (legacyStepId, 229) — האם עדיין פתוח אצל הלקוח, ומתי נשלח. */
/**
 * 236 · ההתקשרויות של הלקוח — לשער הדף האישי (clientPageGate.stepGateOpen, אותו כלל כמו build_client_portal).
 * ‼ לקוח בקליטה שהתהליך שלו עוד לא נפתח: «השלמת מידע» שפורסמה לא מופיעה בדף עד «פרסם בדף» — והמסך לא יאמר «פורסם».
 */
export async function loadGateEngagements(clientId: string): Promise<GateEngagement[]> {
  const { data, error } = await supabase.from('engagements').select('id, client_id, status, process_published_at, created_at').eq('client_id', clientId);
  if (error) throw new Error(error.message);
  return ((data ?? []) as Row[]).map(r => ({
    id: String(r.id), clientId: String(r.client_id), status: r.status as GateEngagement['status'],
    processPublishedAt: (r.process_published_at as string | null) ?? undefined, createdAt: String(r.created_at ?? ''),
  }));
}

export interface OpenLegacyIntake {
  id: string;
  /** מתי פורסם ללקוח (או נוצר, כשטרם פורסם). */
  since?: string;
  /** מתי נוצר — לזיהוי הסשן של השאלון הזה (ולא של שנה קודמת). */
  created?: string;
  /** פורסם בדף האישי — הלקוח רואה אותו. */
  published: boolean;
  /** הלקוח כבר התחיל לענות (יש סשן עם תשובות מאז שנוצר). */
  started: boolean;
}
export async function openIntakeStep(stepId: string | undefined): Promise<OpenLegacyIntake | null> {
  if (!stepId) return null;
  const { data } = await supabase.from('onboarding_steps').select('id, client_id, status, created_at, published_at').eq('id', stepId);
  const r = ((data ?? []) as Record<string, unknown>[])[0];
  if (!r || ['completed', 'verified', 'skipped', 'cancelled', 'failed'].includes(String(r.status))) return null;
  const created = String(r.created_at ?? '').slice(0, 10) || undefined;
  const { data: ss } = await supabase.from('annual_report_sessions').select('model, created_at').eq('client_id', String(r.client_id)).is('superseded_by', null);
  const started = ((ss ?? []) as Record<string, unknown>[]).some(x => (!created || String(x.created_at ?? '').slice(0, 10) >= created)
    && !!x.model && Object.keys(x.model as object).length > 0);
  return { id: String(r.id), since: String(r.published_at ?? r.created_at ?? '').slice(0, 10) || undefined, created, published: r.published_at != null, started };
}

export async function loadYearData(clientId: string, taxYear: number): Promise<YearData> {
  const [f, e, a] = await Promise.all([
    supabase.from('tax_year_facts').select('*').eq('client_id', clientId).eq('tax_year', taxYear).order('created_at'),
    supabase.from('tax_evidence').select('*').eq('client_id', clientId).eq('tax_year', taxYear).order('received_at'),
    supabase.from('tax_info_asks').select('*').eq('client_id', clientId).eq('tax_year', taxYear).order('created_at'),
  ]);
  const err = f.error ?? e.error ?? a.error;
  if (err) throw new Error(err.message);
  return {
    facts: ((f.data ?? []) as Row[]).map(factFromRow),
    evidence: ((e.data ?? []) as Row[]).map(evidenceFromRow),
    asks: ((a.data ?? []) as Row[]).map(askFromRow),
  };
}

type Res<T = Row> = { ok: true } & T | { ok: false; error: string };
async function call<T = Row>(fn: string, args: Row): Promise<Res<T>> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) return { ok: false, error: error.message };
  const r = (data ?? {}) as Row;
  if (r.ok === false) return { ok: false, error: String(r.error ?? 'error') };
  return { ok: true, ...(r as T) };
}

export const ensureYearRequest = (clientId: string, purpose: Purpose, taxYear: number, cutoffMonth?: number) =>
  call<{ stepId: string; created: boolean; legacySessionId?: string }>('ensure_tax_year_request',
    { p_client_id: clientId, p_purpose: purpose, p_tax_year: taxYear, p_cutoff_month: cutoffMonth ?? null });

// ── 230 · הכנה להצהרת הון ──
export const ensureWealthDeclaration = (clientId: string, asOfDate: string, kind?: 'first' | 'followup') =>
  call<{ stepId: string; created: boolean; kind?: string }>('ensure_wealth_declaration', { p_client_id: clientId, p_as_of: asOfDate, p_kind: kind ?? null });
export const updateWealthDeclaration = (stepId: string, patch: Record<string, unknown>, note?: string) =>
  call<{ basisChanges: number }>('update_wealth_declaration', { p_step_id: stepId, p_patch: patch, p_note: note ?? null });

// ── 236 · קליטה והשלמת תיק המס — בקשה פתוחה אחת ללקוח ──
export const ensureTaxFileIntake = (clientId: string) =>
  call<{ stepId: string; created: boolean }>('ensure_tax_file_intake', { p_client_id: clientId });

/**
 * מסמכים מאושרים מסוג שאינו שייך לתקופה (תעודת זהות, תעודת עוסק, חוזה רכישה…) — מכל שנה ומכל תהליך.
 * ‼ «בלי לבקש שוב מסמך מאושר»: התמונה (picture.ts) מסמנת אותם «כבר בתיק». מסמך לתקופה לא נטען כאן.
 */
export async function loadPriorEvidence(clientId: string, kinds: string[]): Promise<Evidence[]> {
  if (!kinds.length) return [];
  const { data, error } = await supabase.from('tax_evidence').select('*').eq('client_id', clientId).eq('review', 'accepted').in('doc_kind', kinds);
  if (error) return [];
  return ((data ?? []) as Row[]).map(evidenceFromRow);
}

export const addAsks = (parentStepId: string, asks: Pick<InfoAsk, 'itemKey' | 'subjectRole' | 'entityKind' | 'entityRef' | 'prompt'>[]) =>
  call<{ infoStepId: string; added: number; skipped: number }>('add_tax_info_asks', { p_parent_step_id: parentStepId, p_asks: asks });
export const cancelAsk = (askId: string) => call('cancel_tax_info_ask', { p_ask_id: askId });
export const resolveNote = (askId: string) => call('resolve_tax_info_note', { p_ask_id: askId });
export const publishInfo = (infoStepId: string) => call<{ published: number }>('publish_tax_info', { p_info_step_id: infoStepId });

export const decideFacts = (ids: string[], decision: 'accept' | 'reject', note?: string) =>
  call<{ decided: number }>('decide_tax_year_facts', { p_fact_ids: ids, p_decision: decision, p_note: note ?? null });
export const correctFact = (id: string, answer: FactAnswer, value: unknown, note?: string) =>
  call<{ factId: string }>('correct_tax_year_fact', { p_fact_id: id, p_answer: answer, p_value: answer === 'value' ? value : null, p_note: note ?? null });
export const recordFact = (clientId: string, fact: Partial<YearFact> & Pick<YearFact, 'taxYear' | 'itemKey' | 'subjectRole'>) =>
  call<{ factId: string }>('record_tax_year_fact', { p_client_id: clientId, p_fact: fact });
export const reviewEvidence = (id: string, identity: Evidence['identityMatch'], period: Evidence['periodMatch'], review: Evidence['review'], note?: string) =>
  call('review_tax_evidence', { p_evidence_id: id, p_identity: identity, p_period: period, p_review: review, p_note: note ?? null });

export interface TransferDecision {
  path: string; itemKey: string; subjectRole: string; entityKind?: string; entityRef?: string; original: number;
  suggestedYear?: number | null; evidence?: string | null; decision: 'year' | 'unknown_year' | 'skip'; year?: number;
}
export const decideTransfers = (clientId: string, items: TransferDecision[]) =>
  call<{ decided: number }>('decide_card_transfers', { p_client_id: clientId, p_items: items });
export async function loadTransfers(clientId: string): Promise<Row[]> {
  const { data, error } = await supabase.from('tax_card_transfers').select('*').eq('client_id', clientId);
  if (error) throw new Error(error.message);
  return (data ?? []) as Row[];
}
export const recordLegacyFacts = (clientId: string, sessionId: string, facts: unknown[]) =>
  call<{ recorded: number }>('record_legacy_tax_year_facts', { p_client_id: clientId, p_session_id: sessionId, p_facts: facts });

// ── הדף האישי ────────────────────────────────────────────────────────────────
export interface PortalTaxInfo { stepId: string; taxYear: number; title: string; asks: (InfoAsk & { officeNote?: string })[] }
const portalView = (r: Row): PortalTaxInfo => ({
  stepId: String(r.stepId), taxYear: Number(r.taxYear), title: String(r.title ?? ''),
  asks: ((r.asks ?? []) as Row[]).map(a => ({
    id: String(a.id), clientId: '', taxYear: Number(r.taxYear), stepId: String(r.stepId), parentStepId: '', itemKey: String(a.itemKey),
    subjectRole: a.subjectRole as InfoAsk['subjectRole'], entityRef: s(a.entityRef), prompt: a.prompt as InfoAsk['prompt'],
    state: a.state as InfoAsk['state'], savedDraft: a.savedDraft ?? undefined, unavailable: (a.unavailable ?? undefined) as InfoAsk['unavailable'],
    createdAt: '', answeredAt: s(a.answeredAt),
  })),
});
export async function portalLoad(token: string, stepId: string): Promise<PortalTaxInfo> {
  const r = await call('portal_tax_info', { p_token: token, p_step_id: stepId });
  if (!r.ok) throw new Error(r.error);
  return portalView(r);
}
export async function portalPreview(clientId: string, stepId: string): Promise<PortalTaxInfo> {
  const r = await call('portal_tax_info_preview', { p_client_id: clientId, p_step_id: stepId });
  if (!r.ok) throw new Error(r.error);
  return portalView(r);
}
export const portalSaveDraft = (token: string, askId: string, draft: unknown) =>
  call('portal_save_tax_info_draft', { p_token: token, p_ask_id: askId, p_draft: draft });

/** תשובה מהדף האישי → השרת. הצורה תואמת את portal_submit_tax_info (229). */
export function answerPayload(a: AskAnswer): Row {
  switch (a.kind) {
    case 'yes': return { kind: 'yes', note: a.note };
    case 'no': return { kind: 'no' };
    case 'notSure': return { kind: 'notSure', note: a.note };
    case 'amount': return { kind: 'amount', amount: a.amount };
    case 'text': return { kind: 'text', text: a.text };
    case 'choice': return { kind: 'choice', value: a.value };
    case 'unchanged': return { kind: 'unchanged' };
    case 'changed': return { kind: 'changed', note: a.note };
    case 'file': return { kind: 'file', fileName: a.fileName, documentId: a.documentId };
    case 'unavailable': return { kind: 'unavailable', reason: a.reason, code: a.code };
    case 'who': return { kind: 'who', value: a.value };
    // 241 · רשומה מובנית — הערך נשמר בעובדה כפי שהוא (השרת בודק צורה וגודל)
    case 'record': return { kind: 'record', value: a.value, none: a.none, assertion: a.assertion, was: a.was };
    // 253 · מסך הרשת ו«של מי / איפה» — השרת שומר כן/לא לכל אריח, מאמת «איפה» מול הרשימה שלו
    case 'multi': return { kind: 'multi', selected: a.selected };
    case 'entity': return { kind: 'entity', items: a.items };
  }
}
export const portalSubmit = (token: string, askId: string, answer: AskAnswer) =>
  call<{ state?: string; already?: boolean }>('portal_submit_tax_info', { p_token: token, p_ask_id: askId, p_answer: answerPayload(answer) });

/** אסמכתאות אפשריות לאימות דרישה להצהרת הון: מסמכים בתיק, ורשומות מאושרות שנקראו מהרשות. */
export interface DemandEvidenceOption { kind: 'document' | 'authority_record'; id: string; label: string; date?: string }
export async function loadDemandEvidence(clientId: string): Promise<DemandEvidenceOption[]> {
  const [docs, recs] = await Promise.all([
    supabase.from('documents').select('id, file_name, description, uploaded_at').eq('client_id', clientId).order('uploaded_at', { ascending: false }).limit(60),
    supabase.from('tax_fact_changes').select('id, label, new_value, source, decided_at, created_at').eq('client_id', clientId).eq('status', 'accepted')
      .in('field_key', ['capitalDeclarationRequired', 'capitalDeclarationDeadline']).in('source', ['institution_alignment', 'automation']),
  ]);
  const out: DemandEvidenceOption[] = [];
  for (const r of ((docs.data ?? []) as Row[])) out.push({ kind: 'document', id: String(r.id), label: String(r.description || r.file_name || 'מסמך'), date: d(r.uploaded_at) });
  for (const r of ((recs.data ?? []) as Row[])) {
    const v = (r.new_value ?? {}) as { display?: string };
    out.push({ kind: 'authority_record', id: String(r.id), label: `${String(r.label ?? 'רשומה מהרשות')}: ${v.display ?? ''} (${r.source === 'automation' ? 'בדיקה אוטומטית' : 'יישור קו'})`, date: d(r.decided_at ?? r.created_at) });
  }
  return out;
}

/**
 * 241 · עקיבות לקבצי המקור של מסמך שנבנה מכמה חלקים (קדמי, אחורי, ספח…): מה צורף ובאיזה סדר — ליד הראיה.
 * ‼ רק רשימה (שם, סוג, גודל, חלק) — לא תוכן. כשל כאן אינו כשל ההעלאה.
 */
export const portalNoteEvidenceParts = (token: string, askId: string, parts: unknown) =>
  call('portal_note_tax_evidence_parts', { p_token: token, p_ask_id: askId, p_parts: parts });

// ── 241 · עבודות מס: הוספה (בודדת או מרוכזת) ופרטים — על אותה בקשה, בלי טבלה שנייה ──
/**
 * יוצר או מקשר עבודה (דוח שנתי / הצהרת הון) ושומר עליה מקור, מועדים ובדיקה אחרונה.
 * ‼ אידמפוטנטי בשרת לפי זהות העבודה (לקוח + סוג + שנה/יום + פתוחה). עבודה קיימת — לא נוצרת שוב, ופרט שכבר רשום
 *   עליה לא נדרס: הוא חוזר ב-`kept` כדי שהמסך יאמר זאת. אין כאן פרסום ללקוח ואין מייל.
 */
export const upsertTaxWork = (clientId: string, kind: 'annual' | 'wealth', period: { taxYear?: number; asOfDate?: string }, meta: Record<string, unknown>) =>
  call<{ stepId: string; created: boolean; kept?: string[] }>('upsert_tax_work',
    { p_client_id: clientId, p_kind: kind, p_tax_year: period.taxYear ?? null, p_as_of: period.asOfDate ?? null, p_meta: meta });
export const updateTaxWork = (stepId: string, patch: Record<string, unknown>, note?: string) =>
  call('update_tax_work', { p_step_id: stepId, p_patch: patch, p_note: note ?? null });

// ── 242 · הסרת עבודת מס: מחיקה כשכלום לא יצא, ביטול כשמשהו כבר יצא, החזרה של עבודה שבוטלה ──
// ‼ השרת קובע את המצב (workRemoval.ts הוא אותם כללים, להסבר במסך). 'changed' — המצב השתנה מאז שהחלון נפתח.
export const workRemovalCheck = (stepId: string) =>
  call<{ mode: 'delete' | 'cancel' | 'none'; facts: import('./workRemoval').RemovalFacts; restorable: boolean }>('tax_work_removal_check', { p_step_id: stepId });
export const removeTaxWork = (stepId: string, mode: 'delete' | 'cancel', reason?: string) =>
  call<{ mode: 'delete' | 'cancel'; asksClosed?: number }>('remove_tax_work', { p_step_id: stepId, p_mode: mode, p_reason: reason ?? null });
export const restoreTaxWork = (stepId: string) =>
  call<{ asksBack: number; asksKept: number }>('restore_tax_work', { p_step_id: stepId });
