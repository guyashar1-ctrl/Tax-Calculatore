// ─── הדגמה בלבד: 250 בזיכרון (16.10.2026) ──────────────────────────────────────────────────────────
// ‼ פיתוח/הדגמה (מסד מדומה — ?office-app / ?test-office). אותם כללים כמו _shaam_plan / shaam_filing_import בשרת
//   (250) — המקור הוא ה-SQL, ובדיקת PGlite מאמתת אותו. כאן — עותק להדגמה בלי רשת, עם בדיקת יחידה על אותם תרחישים.
// ‼ הלקוחות והבקשות נקראים מהמסד המדומה (supabase.from בזמן הדגמה); בקשת עותק — create_onboarding_request המדומה.

import { supabase } from '../../lib/supabase';
import { SAMPLE_CLIENTS } from '../../data/sampleClients';
import { enrichClientsWithWorkspace } from '../../data/sampleClientWorkspace';
import type { Batch, BatchSource } from './parse/batch';
import { file9, plan, valuesOf, type PlanClient } from './planShaam';
import type { Obligation } from './model';

type Row = Record<string, unknown>;
type Client = PlanClient;
type Stored = Obligation & { values: string; sourceId?: string; history: unknown[] };

export async function fakeActive(): Promise<boolean> {
  const m = await import('../../components/office/__fakeBackend');
  return !!m.FAKE_ACTIVE;
}

const store: { obligations: Stored[]; sources: (BatchSource & { id: string; uploadedAt: string; method: 'pdf' | 'manual'; note?: string })[] } = { obligations: [], sources: [] };
const uuid = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const CLOSED = ['completed', 'verified', 'skipped', 'cancelled', 'failed'];

// ‼ בהדגמה הלקוחות חיים בזיכרון (SAMPLE_CLIENTS, כמו useClients בהדגמה) — לא בטבלה המדומה
async function clients(): Promise<Client[]> {
  const { data } = await supabase.from('clients').select('*');
  if (data?.length) return data as Client[];
  return enrichClientsWithWorkspace(SAMPLE_CLIENTS).map(c => ({ id: c.id, first_name: c.firstName, last_name: c.lastName, id_number: c.idNumber, spouse_id_number: c.spouseIdNumber,
    spouse_name: c.spouseName, spouse_first_name: c.spouseFirstName, spouse_last_name: c.spouseLastName, tax_files: (c.taxFiles ?? []) as Client['tax_files'] }));
}
async function steps(): Promise<Row[]> { const { data } = await supabase.from('onboarding_steps').select('*'); return (data ?? []) as Row[]; }
const nameOf = (c?: Client) => (c ? `${c.first_name ?? ''} ${c.last_name ?? ''}`.trim() : undefined);

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
      const b = args.p_batch as Batch; const cs = await clients(); const all = await steps();
      const srcIds: Record<string, string> = {};
      for (const s of b.sources) {
        const ex = s.sha256 ? store.sources.find(x => x.sha256 === s.sha256) : undefined;
        if (ex) { srcIds[s.key] = ex.id; continue; }
        const id = uuid(); store.sources.unshift({ ...s, id, uploadedAt: new Date().toISOString(), method: 'pdf' }); srcIds[s.key] = id;
      }
      const p = plan(b, cs, store.obligations); const counts: Record<string, number> = {};
      for (const x of p) {
        counts[x.change] = (counts[x.change] ?? 0) + 1;
        if (!['new', 'updated', 'unchanged'].includes(x.change)) continue;
        const r = b.rows[x.i - 1]; const s = b.sources.find(y => y.key === r.sourceKey)!;
        const fields = { name: r.name || undefined, office: r.office, fileType: r.fileType, section: r.section, required: r.required, legalDue: r.legalDue, legalDueRaw: r.legalDueRaw,
          filedOn: r.filedOn, noAssessment: !!r.noAssessment, group: s.group, fine: s.group ? /(^|_)fine$/.test(s.group) && !s.group.endsWith('no_fine') : undefined,
          evidence: { sourceId: srcIds[s.key], page: r.page, line: r.line }, producedOn: s.producedOn, sourceName: s.fileName, values: valuesOf(r, s.group) };
        let o = x.existingId ? store.obligations.find(z => z.id === x.existingId) : undefined;
        if (o && x.change === 'updated') { o.history.push({ at: new Date().toISOString(), values: o.values }); Object.assign(o, fields); o.historyCount = o.history.length; }
        if (!o) { o = { id: uuid(), kind: s.kind, fileNumber: file9(r.fileNumber)!, yearShown: r.yearShown.trim(), shaamStatus: x.shaamStatus!, state: x.state!, history: [], firstSeenAt: new Date().toISOString(), ...fields } as Stored; store.obligations.push(o); }
        Object.assign(o, { state: x.state, shaamStatus: x.shaamStatus, reason: x.reason, candidates: x.candidates, lastSeenAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
        if (!o.clientId && x.clientId) Object.assign(o, { clientId: x.clientId, role: x.role, matchKind: x.tier });
        await afterChange(o, all);
      }
      return { ok: true, counts, plan: p, sources: srcIds };
    }
    case 'shaam_filing_list': {
      const cs = await clients(); const all = await steps(); const cid = args.p_client_id as string | null;
      const obligations = store.obligations.filter(o => !cid || o.clientId === cid).map(o => {
        const st = all.find(s => s.id === o.stepId), cp = all.find(s => s.id === o.copyStepId);
        const { values: _v, history: _h, sourceId: _s, ...rest } = o;
        return { ...rest, clientName: nameOf(cs.find(c => c.id === o.clientId)), stepStatus: st?.status, copyStepStatus: cp?.status, copyInOffice: o.copyInOffice ?? (o.state === 'history' || o.state === 'filed_per_shaam' ? false : undefined) };
      }).sort((a, b) => String(a.legalDue ?? '9999').localeCompare(String(b.legalDue ?? '9999')) || a.fileNumber.localeCompare(b.fileNumber));
      return { ok: true, obligations, sources: cid ? [] : store.sources.map(s => ({ id: s.id, method: s.method, fileName: s.fileName, kind: s.kind, group: s.group, taxYear: s.taxYear,
        producedRaw: s.producedRaw, producedOn: s.producedOn, pages: s.pages, status: s.status, note: s.note, uploadedAt: s.uploadedAt, hasFile: !!s.storagePath, sha256: s.sha256 })) };
    }
    case 'resolve_shaam_obligation': {
      const o = store.obligations.find(x => x.id === args.p_id); if (!o) return { ok: false, error: 'not_found' };
      if (!args.p_client_id) { Object.assign(o, { state: 'dismissed', reason: 'not_ours' }); return { ok: true, state: 'dismissed' }; }
      if (!(await clients()).some(c => c.id === args.p_client_id)) return { ok: false, error: 'forbidden' };
      if (o.reason === 'parse') return { ok: false, error: 'parse_problem' };
      Object.assign(o, { clientId: args.p_client_id, role: args.p_role ?? 'client', matchKind: 'manual', candidates: undefined, reason: undefined, state: o.shaamStatus === 'filed' ? 'history' : o.shaamStatus });
      await afterChange(o, await steps());
      return { ok: true };
    }
    case 'link_shaam_obligation_step': {
      const o = store.obligations.find(x => x.id === args.p_id); if (!o) return { ok: false, error: 'not_found' };
      const st = (await steps()).find(s => s.id === args.p_step_id);
      if (!st || st.client_id !== o.clientId || st.step_type !== (o.kind === 'annual' ? 'annual_return' : 'wealth_declaration')
        || (o.kind === 'annual' && String((st.payload as Row)?.taxYear) !== o.yearShown)) return { ok: false, error: 'step_mismatch' };
      if (o.stepId === st.id) return { ok: true, already: true };
      o.stepId = String(st.id); return { ok: true };
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
      o.copyStepId = r.stepId; return { ok: true, stepId: r.stepId };
    }
    case 'confirm_shaam_group_empty': {
      store.sources.unshift({ id: uuid(), key: uuid(), method: 'manual', fileName: 'אישור ידני — הקבוצה נבדקה וריקה', kind: 'wealth', group: args.p_group as BatchSource['group'],
        producedOn: new Date().toISOString().slice(0, 10), status: 'empty_confirmed', pages: [], note: (args.p_note as string) ?? undefined, uploadedAt: new Date().toISOString() });
      return { ok: true };
    }
  }
  return { ok: false, error: 'unknown_rpc' };
}
