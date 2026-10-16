// ─── תוכנית הקליטה — עותק טהור של _shaam_plan (250) להדגמה ולבדיקות יחידה (16.10.2026) ───────────────────
// ‼ המקור הוא ה-SQL. כאן אותם כללים, כדי שההדגמה תתנהג כמו השרת; planShaam.test.ts מריץ את אותם תרחישים כמו בדיקת PGlite.

import type { Batch, BatchRow } from './parse/batch';
import type { Obligation, PlanRow } from './model';

export type PlanClient = { id: string; first_name?: string; last_name?: string; id_number?: string; spouse_id_number?: string; spouse_name?: string; spouse_first_name?: string; spouse_last_name?: string; tax_files?: { authority?: string; fileNumber?: string; owner?: string }[] | null };
export type PlanExisting = Pick<Obligation, 'id' | 'kind' | 'fileNumber' | 'yearShown' | 'clientId' | 'role' | 'matchKind' | 'producedOn' | 'state' | 'shaamStatus' | 'stepId'> & { values: string };

// ‼ רק ספרות — מחרוזת עם אותיות אינה «מנוקה» למספר (כמו _shaam_file9)
export const file9 = (p?: string) => { const d = (p ?? '').trim(); return /^\d{5,9}$/.test(d) ? d.padStart(9, '0') : null; };
export const nameWords = (p?: string) => [...new Set((p ?? '').replace(/ו\/או/g, ' ').split(/[\s/,."'()-]+/).filter(w => w.length >= 2))];

export function matchClient(clients: PlanClient[], file: string, name?: string): { match: PlanRow['match']; tier?: string; clientId?: string; role?: 'client' | 'spouse'; candidates?: string[] } {
  let tier: string | undefined; let ids: string[] = []; let role: 'client' | 'spouse' = 'client';
  const tf = clients.filter(c => (c.tax_files ?? []).some(t => t.authority === 'income_tax' && file9(t.fileNumber) === file));
  if (tf.length) { tier = 'tax_file'; ids = tf.map(c => c.id); role = (tf[0].tax_files ?? []).find(t => t.authority === 'income_tax')?.owner === 'spouse' ? 'spouse' : 'client'; }
  else {
    const byId = clients.filter(c => file9(c.id_number) === file);
    if (byId.length) { tier = 'id'; ids = byId.map(c => c.id); }
    else { const bySp = clients.filter(c => file9(c.spouse_id_number) === file); if (bySp.length) { tier = 'spouse_id'; ids = bySp.map(c => c.id); role = 'spouse'; } }
  }
  if (!tier) return { match: 'unmatched' };
  if (ids.length > 1) return { match: 'ambiguous', tier, candidates: ids };
  const c = clients.find(x => x.id === ids[0])!;
  const w = nameWords(name), cw = nameWords([c.first_name, c.last_name, c.spouse_name, c.spouse_first_name, c.spouse_last_name].filter(Boolean).join(' '));
  if (w.length && !w.some(x => cw.includes(x))) return { match: 'name_mismatch', tier, candidates: ids };
  return { match: 'matched', tier, clientId: c.id, role };
}

export function shaamStatus(kind: string, r: BatchRow, group?: string): 'open' | 'filed' | 'context' {
  if (kind === 'annual') return r.filedOn ? 'filed' : r.required === true && !r.noAssessment ? 'open' : 'context';
  return group === 'filed_fine' || group === 'filed_no_fine' ? 'filed' : 'open';
}
export const valuesOf = (r: BatchRow, group?: string) => JSON.stringify([r.name || null, r.office || null, r.fileType || null, r.section || null, r.branch || null,
  r.required ?? null, r.legalDueRaw || null, r.filedOnRaw || null, !!r.noAssessment, group ?? null]);

/** אותה תוכנית כמו _shaam_plan בשרת. */
export function plan(batch: Batch, clients: PlanClient[], existing: PlanExisting[]): PlanRow[] {
  const out: PlanRow[] = []; const seen = new Set<string>();
  batch.rows.forEach((r, k) => {
    const i = k + 1;
    const s = batch.sources.find(x => x.key === r.sourceKey);
    const file = file9(r.fileNumber); const year = (r.yearShown ?? '').trim();
    if (!s) { out.push({ i, change: 'invalid', reason: 'source' }); return; }
    if (!file || !/^\d{4}$/.test(year)) { out.push({ i, change: 'invalid', reason: file ? 'year' : 'file_number' }); return; }
    const key = `${s.kind}|${file}|${year}`;
    if (seen.has(key)) { out.push({ i, key, change: 'duplicate' }); return; }
    seen.add(key);
    const st = shaamStatus(s.kind, r, s.group);
    const e = existing.find(o => o.kind === s.kind && o.fileNumber === file && o.yearShown === year);
    const m = e?.clientId ? { match: 'matched' as const, tier: e.matchKind, clientId: e.clientId, role: e.role } : matchClient(clients, file, r.name);
    let reason: string | undefined = r.problems?.length ? 'parse' : m.match !== 'matched' ? m.match : undefined;
    let change: PlanRow['change']; let state: PlanRow['state'];
    if (!e) { change = 'new'; state = reason ? 'needs_review' : st === 'filed' ? 'history' : st; }
    else if (e.producedOn && s.producedOn && s.producedOn < e.producedOn) { change = 'older'; state = e.state; }
    else {
      change = e.values === valuesOf(r, s.group) ? 'unchanged' : 'updated';
      if (st === 'open' && e.shaamStatus === 'filed' && !reason) reason = 'contradiction';
      state = e.state === 'dismissed' ? 'dismissed' : reason ? 'needs_review' : st === 'filed' ? (e.state === 'open' || e.state === 'filed_per_shaam' || e.stepId ? 'filed_per_shaam' : 'history') : st;
    }
    const parse = reason === 'parse';
    out.push(JSON.parse(JSON.stringify({ i, key, change, state, shaamStatus: st, match: m.match, tier: m.tier, clientId: parse ? undefined : m.clientId, role: parse ? undefined : m.role,
      candidates: m.candidates, existingId: e?.id, reason, stepId: e?.stepId })));
  });
  return out;
}

