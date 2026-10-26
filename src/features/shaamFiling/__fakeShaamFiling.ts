// ─── הדגמה בלבד: 250 + 305 בזיכרון (16.10.2026 · 26.10.2026) ─────────────────────────────────────────
// ‼ פיתוח/הדגמה (מסד מדומה — ?office-app / ?test-office). אותם כללים כמו _shaam_plan / _shaam_filing_import /
//   undo_shaam_filing_source בשרת (250, 305) — המקור הוא ה-SQL (staging-test-305-shaam-hub.mjs). כאן — עותק להדגמה בלי רשת.
// ‼ הלקוחות והבקשות נקראים מהמסד המדומה (supabase.from בזמן הדגמה); בקשה אוטומטית — upsert_tax_work המדומה,
//   ביטול בקשה — remove_tax_work המדומה, בקשת עותק — create_onboarding_request המדומה.

import { supabase } from '../../lib/supabase';
import { SAMPLE_CLIENTS } from '../../data/sampleClients';
import { enrichClientsWithWorkspace } from '../../data/sampleClientWorkspace';
import type { Batch, BatchSource } from './parse/batch';
import { file9, plan, valuesOf, type PlanClient } from './planShaam';
import { GMF154_SOURCE_NAME } from './fromGmf154';
import type { Obligation, UndoSummary } from './model';

type Row = Record<string, unknown>;
type Client = PlanClient;
type Stored = Obligation & { values: string; sourceId?: string; history: unknown[] };
type Effect = { id: number; sourceId: string; obligationId: string; action: 'created' | 'updated' | 'unchanged'; prev?: Stored; linkedStepId?: string; openedStepId?: string; at: string; undoneAt?: string };
type Source = BatchSource & { id: string; uploadedAt: string; method: 'pdf' | 'manual'; note?: string; undoneAt?: string; undo?: UndoSummary };

export async function fakeActive(): Promise<boolean> {
  const m = await import('../../components/office/__fakeBackend');
  return !!m.FAKE_ACTIVE;
}

const store: { obligations: Stored[]; sources: Source[]; effects: Effect[] } = { obligations: [], sources: [], effects: [] };
let effectSeq = 0;
const uuid = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const CLOSED = ['completed', 'verified', 'skipped', 'cancelled', 'failed'];
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x)) as T;
const nowIso = () => new Date().toISOString();

// ‼ בהדגמה הלקוחות חיים בזיכרון (SAMPLE_CLIENTS, כמו useClients בהדגמה) — לא בטבלה המדומה
async function clients(): Promise<Client[]> {
  const { data } = await supabase.from('clients').select('*');
  if (data?.length) return data as Client[];
  return enrichClientsWithWorkspace(SAMPLE_CLIENTS).map(c => ({ id: c.id, first_name: c.firstName, last_name: c.lastName, id_number: c.idNumber, spouse_id_number: c.spouseIdNumber,
    spouse_name: c.spouseName, spouse_first_name: c.spouseFirstName, spouse_last_name: c.spouseLastName, tax_files: (c.taxFiles ?? []) as Client['tax_files'] }));
}
async function steps(): Promise<Row[]> { const { data } = await supabase.from('onboarding_steps').select('*'); return (data ?? []) as Row[]; }
const nameOf = (c?: Client) => (c ? `${c.first_name ?? ''} ${c.last_name ?? ''}`.trim() : undefined);
const dmyOf = (iso?: string) => (iso ? iso.slice(0, 10).split('-').reverse().join('.') : '');

async function afterChange(o: Stored, all: Row[]) {
  if (!o.clientId || ['needs_review', 'dismissed', 'context'].includes(o.state)) return;
  if (!o.stepId) {
    const cands = all.filter(s => s.client_id === o.clientId && !CLOSED.includes(String(s.status)) && (o.kind === 'annual'
      ? s.step_type === 'annual_return' && String((s.payload as Row)?.taxYear) === o.yearShown
      : s.step_type === 'wealth_declaration' && String((s.payload as Row)?.asOfDate ?? '').slice(0, 4) === o.yearShown));
    if (cands.length === 1) o.stepId = String(cands[0].id);
  }
  if (o.state === 'filed_per_shaam' && o.stepId) {
    const st = all.find(s => s.id === o.stepId);
    if (st && !CLOSED.includes(String(st.status))) {
      const payload = { ...(st.payload as Row ?? {}) }; const work = { ...((payload.work as Row) ?? {}) };
      if (!work.shaamFiled) { work.shaamFiled = { filedOn: o.filedOn, obligationId: o.id }; payload.work = work; await supabase.from('onboarding_steps').update({ payload }).eq('id', o.stepId); }
    }
  }
}

/** כמו _shaam_auto_open (305): דוח שנתי בלבד, שנה שהסתיימה, דרך upsert_tax_work — אותם פרטים כמו «פתח בקשה». */
async function autoOpen(o: Stored): Promise<{ stepId?: string; created?: boolean; skipped?: string; error?: string }> {
  if (o.kind !== 'annual') return { skipped: 'needs_as_of_date' };
  const year = Number(o.yearShown);
  if (!(year < new Date().getFullYear())) return { skipped: 'year_not_ended' };
  const note = `רשימת שע״ם · ${o.sourceName === GMF154_SOURCE_NAME ? 'מידע אודות שנות מס (154)' : 'מעקב הגשת דוחות (IDOM)'}${o.producedOn ? ` · הופקה ${dmyOf(o.producedOn)}` : ''}`;
  const meta: Row = { createdVia: 'tax_work', source: 'portal', sourceNote: note,
    ...(o.producedOn ? { lastAuthorityCheck: { at: o.producedOn.slice(0, 10) } } : {}),
    ...(o.legalDue ? { deadline: { status: 'reported', source: 'portal', due: o.legalDue.slice(0, 10) } } : {}) };
  const { data } = await supabase.rpc('upsert_tax_work', { p_client_id: o.clientId, p_kind: 'annual', p_tax_year: year, p_as_of: null, p_meta: meta });
  const r = data as { ok?: boolean; stepId?: string; created?: boolean; error?: string } | null;
  if (!r?.ok || !r.stepId) return { error: r?.error ?? 'failed' };
  o.stepId = r.stepId;
  return { stepId: r.stepId, created: !!r.created };
}

/** בקשה שנפתחה לבד ועוד לא נגעו בה (כמו _shaam_auto_request_untouched — בפשטות של ההדגמה). */
function untouched(st: Row | undefined, all: Row[], obligationId: string): string | null {
  if (!st) return 'gone';
  if (CLOSED.includes(String(st.status))) return 'closed';
  if (st.status !== 'in_progress' || st.ball !== 'me') return 'worked_on';
  if (store.obligations.some(x => x.stepId === st.id && x.id !== obligationId)) return 'shared';
  if (all.some(s => (s.payload as Row | undefined)?.parentStepId === st.id)) return 'worked_on';
  if ((((st.payload as Row | undefined)?.workLog as unknown[] | undefined) ?? []).length > 1) return 'worked_on';
  return null;
}

export async function fakeRpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  await new Promise(r => setTimeout(r, 150));
  const res = await handle(name, args);
  return JSON.parse(JSON.stringify(res)) as T;
}

async function handle(name: string, args: Record<string, unknown>): Promise<unknown> {
  switch (name) {
    case 'shaam_filing_preview': {
      const b = args.p_batch as Batch; const cs = await clients();
      const p = plan(b, cs, store.obligations);
      const ids = new Set(p.flatMap(x => [x.clientId, ...(x.candidates ?? [])]).filter(Boolean) as string[]);
      return { ok: true, plan: p, names: Object.fromEntries(cs.filter(c => ids.has(c.id)).map(c => [c.id, nameOf(c)])) };
    }
    case 'shaam_filing_import': {
      const b = args.p_batch as Batch; const cs = await clients(); let all = await steps();
      const srcIds: Record<string, string> = {};
      for (const s of b.sources) {
        const ex = s.sha256 ? store.sources.find(x => x.sha256 === s.sha256) : undefined;
        if (ex) { srcIds[s.key] = ex.id; ex.undoneAt = undefined; continue; }
        const id = uuid(); store.sources.unshift({ ...s, id, uploadedAt: nowIso(), method: s.method ?? 'pdf' }); srcIds[s.key] = id;
      }
      const p = plan(b, cs, store.obligations); const counts: Record<string, number> = {};
      const summary = { written: 0, unchanged: 0, review: 0, opened: 0, linked: 0, needDay: 0, openFailed: 0 };
      const opened: Row[] = [], openFailed: Row[] = [];
      for (const x of p) {
        counts[x.change] = (counts[x.change] ?? 0) + 1;
        if (!['new', 'updated', 'unchanged'].includes(x.change)) continue;
        const r = b.rows[x.i - 1]; const s = b.sources.find(y => y.key === r.sourceKey)!;
        const fields = { name: r.name || undefined, office: r.office, fileType: r.fileType, section: r.section, required: r.required, legalDue: r.legalDue, legalDueRaw: r.legalDueRaw,
          filedOn: r.filedOn, noAssessment: !!r.noAssessment, group: s.group, fine: s.group ? /(^|_)fine$/.test(s.group) && !s.group.endsWith('no_fine') : undefined,
          evidence: { sourceId: srcIds[s.key], page: r.page, line: r.line }, producedOn: s.producedOn, sourceName: s.fileName, sourceId: srcIds[s.key], values: valuesOf(r, s.group) };
        let o = x.existingId ? store.obligations.find(z => z.id === x.existingId) : undefined;
        const prev = o ? clone(o) : undefined; const prevState = o?.state; const prevStep = o?.stepId;
        if (o && x.change === 'updated') { o.history.push({ at: nowIso(), values: o.values }); Object.assign(o, fields, { updatedAt: nowIso() }); o.historyCount = o.history.length; }
        if (!o) { o = { id: uuid(), kind: s.kind, fileNumber: file9(r.fileNumber)!, yearShown: r.yearShown.trim(), shaamStatus: x.shaamStatus!, state: x.state!, history: [], firstSeenAt: nowIso(), updatedAt: nowIso(), ...fields } as Stored; store.obligations.push(o); }
        Object.assign(o, { state: x.state, shaamStatus: x.shaamStatus, reason: x.reason, candidates: x.candidates, lastSeenAt: nowIso() });
        if (!o.clientId && x.clientId) Object.assign(o, { clientId: x.clientId, role: x.role, matchKind: x.tier });
        await afterChange(o, all);
        // ‼ 305 · חובה שנעשתה «פתוחה» בייבוא הזה, עם לקוח ובלי בקשה ⇒ בקשה פנימית
        let auto: Awaited<ReturnType<typeof autoOpen>> | null = null;
        if (o.state === 'open' && o.clientId && !o.stepId && prevState !== 'open') {
          auto = await autoOpen(o);
          if (auto.stepId) { if (auto.created) summary.opened++; else summary.linked++; opened.push({ obligationId: o.id, clientId: o.clientId, stepId: auto.stepId, created: auto.created }); all = await steps(); }
          else if (auto.skipped === 'needs_as_of_date') summary.needDay++;
          else if (auto.error) { summary.openFailed++; openFailed.push({ obligationId: o.id, clientId: o.clientId, error: auto.error }); }
        }
        store.effects.push({ id: ++effectSeq, sourceId: srcIds[s.key], obligationId: o.id, action: x.change === 'new' ? 'created' : x.change as Effect['action'], prev,
          linkedStepId: o.stepId && o.stepId !== prevStep && !auto?.created ? o.stepId : undefined, openedStepId: auto?.created ? auto.stepId : undefined, at: nowIso() });
        if (o.state === 'needs_review') summary.review++;
        else if (o.state !== 'dismissed' && o.clientId) { if (x.change === 'unchanged') summary.unchanged++; else summary.written++; }
      }
      return { ok: true, counts, plan: p, sources: srcIds, summary, opened, openFailed };
    }
    case 'undo_shaam_filing_source': {
      const src = store.sources.find(s => s.id === args.p_source_id); if (!src) return { ok: false, error: 'not_found' };
      const mine = store.effects.filter(e => e.sourceId === src.id && !e.undoneAt).sort((a, b) => b.id - a.id);
      if (!mine.length) return src.undoneAt ? { ok: true, already: true, summary: src.undo } : { ok: false, error: 'not_recorded' };
      const u: UndoSummary = { deleted: 0, restored: 0, cancelledRequests: 0, gone: 0, kept: [], keptRequests: [] };
      const all = await steps();
      for (const ef of mine) {
        ef.undoneAt = nowIso();
        const o = store.obligations.find(x => x.id === ef.obligationId);
        if (!o) { u.gone = (u.gone ?? 0) + 1; continue; }
        const why = store.effects.some(x => x.obligationId === o.id && x.id > ef.id && x.sourceId !== src.id && !x.undoneAt) ? 'newer_upload'
          : o.updatedAt && o.updatedAt > ef.at ? 'office_changed' : null;
        if (why) { u.kept.push({ obligationId: o.id, clientId: o.clientId, reason: why }); continue; }
        let reqKept = false;
        if (ef.openedStepId) {
          const w = untouched(all.find(s => s.id === ef.openedStepId), all, o.id);
          if (w === null) {
            const { data } = await supabase.rpc('remove_tax_work', { p_step_id: ef.openedStepId, p_mode: 'cancel', p_reason: 'ביטול העלאת רשימת שע״ם' });
            if ((data as { ok?: boolean } | null)?.ok) u.cancelledRequests++; else { reqKept = true; u.keptRequests.push({ stepId: ef.openedStepId, clientId: o.clientId, reason: 'failed' }); }
          } else if (w !== 'gone' && w !== 'closed') { reqKept = true; u.keptRequests.push({ stepId: ef.openedStepId, clientId: o.clientId, reason: w }); }
        }
        if (ef.action === 'created') {
          if (reqKept || o.copyStepId || o.matchKind === 'manual' || o.state === 'dismissed' || (o.stepId && o.stepId !== ef.openedStepId && o.stepId !== ef.linkedStepId)) {
            u.kept.push({ obligationId: o.id, clientId: o.clientId, reason: reqKept ? 'request_worked_on' : 'office_changed' });
          } else { store.obligations = store.obligations.filter(x => x.id !== o.id); u.deleted++; }
        } else if (ef.prev) {
          const stepId = !reqKept && (o.stepId === ef.openedStepId || o.stepId === ef.linkedStepId) ? ef.prev.stepId : o.stepId;
          Object.assign(o, clone(ef.prev), { stepId, copyStepId: o.copyStepId });
          u.restored++;
        }
      }
      src.undoneAt = nowIso(); src.undo = u;
      return { ok: true, ...u };
    }
    case 'shaam_filing_list': {
      const cs = await clients(); const all = await steps(); const cid = args.p_client_id as string | null;
      const obligations = store.obligations.filter(o => !cid || o.clientId === cid).map(o => {
        const st = all.find(s => s.id === o.stepId), cp = all.find(s => s.id === o.copyStepId);
        const { values: _v, history: _h, sourceId: _s, ...rest } = o;
        return { ...rest, clientName: nameOf(cs.find(c => c.id === o.clientId)), stepStatus: st?.status, copyStepStatus: cp?.status, copyInOffice: o.copyInOffice ?? (o.state === 'history' || o.state === 'filed_per_shaam' ? false : undefined) };
      }).sort((a, b) => String(a.legalDue ?? '9999').localeCompare(String(b.legalDue ?? '9999')) || a.fileNumber.localeCompare(b.fileNumber));
      return { ok: true, obligations, sources: cid ? [] : store.sources.map(s => ({ id: s.id, method: s.method, fileName: s.fileName, kind: s.kind, group: s.group, taxYear: s.taxYear,
        producedRaw: s.producedRaw, producedOn: s.producedOn, pages: s.pages, status: s.status, note: s.note, uploadedAt: s.uploadedAt, hasFile: !!s.storagePath, sha256: s.sha256,
        canUndo: store.effects.some(e => e.sourceId === s.id && !e.undoneAt), undoneAt: s.undoneAt, undo: s.undo })) };
    }
    case 'resolve_shaam_obligation': {
      const o = store.obligations.find(x => x.id === args.p_id); if (!o) return { ok: false, error: 'not_found' };
      if (!args.p_client_id) { Object.assign(o, { state: 'dismissed', reason: 'not_ours', updatedAt: nowIso() }); return { ok: true, state: 'dismissed' }; }
      if (!(await clients()).some(c => c.id === args.p_client_id)) return { ok: false, error: 'forbidden' };
      if (o.reason === 'parse') return { ok: false, error: 'parse_problem' };
      Object.assign(o, { clientId: args.p_client_id, role: args.p_role ?? 'client', matchKind: 'manual', candidates: undefined, reason: undefined, state: o.shaamStatus === 'filed' ? 'history' : o.shaamStatus, updatedAt: nowIso() });
      await afterChange(o, await steps());
      return { ok: true };
    }
    case 'link_shaam_obligation_step': {
      const o = store.obligations.find(x => x.id === args.p_id); if (!o) return { ok: false, error: 'not_found' };
      const st = (await steps()).find(s => s.id === args.p_step_id);
      if (!st || st.client_id !== o.clientId || st.step_type !== (o.kind === 'annual' ? 'annual_return' : 'wealth_declaration')
        || (o.kind === 'annual' && String((st.payload as Row)?.taxYear) !== o.yearShown)) return { ok: false, error: 'step_mismatch' };
      if (o.stepId === st.id) return { ok: true, already: true };
      o.stepId = String(st.id); o.updatedAt = nowIso(); return { ok: true };
    }
    case 'request_shaam_filing_copy': {
      const o = store.obligations.find(x => x.id === args.p_id); if (!o) return { ok: false, error: 'not_found' };
      if (!o.clientId) return { ok: false, error: 'no_client' };
      if (o.state !== 'history' && o.state !== 'filed_per_shaam') return { ok: false, error: 'not_filed' };
      if (o.copyStepId) return { ok: true, stepId: o.copyStepId, already: true };
      const title = `${o.kind === 'wealth' ? 'עותק הצהרת ההון שהוגשה' : 'עותק הדוח השנתי שהוגש'} — ${o.yearShown}${o.role === 'spouse' ? ' (בן/בת הזוג)' : ''}`;
      const { data } = await supabase.rpc('create_onboarding_request', { p_client_id: o.clientId, p_step_type: 'custom_request',
        p_payload: { title, clientTitle: title, documentYear: o.yearShown, flagKey: `shaam_copy:${o.id}`, shaamObligationId: o.id, requirements: [{ key: 'doc', kind: 'file', label: title, done: false }] },
        p_due_date: null, p_depends_on: null, p_published: false, p_required_for_close: false, p_owner: 'client', p_stage_id: null });
      const r = data as { ok?: boolean; stepId?: string; error?: string } | null;
      if (!r?.ok) return { ok: false, error: r?.error ?? 'create_failed' };
      o.copyStepId = r.stepId; o.updatedAt = nowIso(); return { ok: true, stepId: r.stepId };
    }
    case 'confirm_shaam_group_empty': {
      store.sources.unshift({ id: uuid(), key: uuid(), method: 'manual', fileName: 'אישור ידני — הקבוצה נבדקה וריקה', kind: 'wealth', group: args.p_group as BatchSource['group'],
        producedOn: new Date().toISOString().slice(0, 10), status: 'empty_confirmed', pages: [], note: (args.p_note as string) ?? undefined, uploadedAt: nowIso() });
      return { ok: true };
    }
  }
  return { ok: false, error: 'unknown_rpc' };
}
