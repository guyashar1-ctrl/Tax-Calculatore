// ─── מסד מדומה · שנת מס ואיסוף משותף (229) — 11.10.2026 ─────────────────────
// ‼ פיתוח בלבד (office-app). כל RPC של 229 מטופל כאן במפורש — שום קריאה לא נופלת
// ל-{ok:true} הכללי. הכללים זהים לשרת: answerToFacts/followUpFor הם אותן פונקציות
// שהבדיקה בבידוד (PGlite) משווה מול ה-SQL.
// הדגמה (דוד כהן, sample-1, טוקן הדף האישי 'demo'):
//   · הערכת מס 2025 שהסתיימה בחתך ספטמבר — עובדות מאושרות עד 30.09.2025;
//   · סשן שאלון ישן ל-2025 (קישור שנשלח לפני המעבר), טרם נקלט;
//   · סכומים שנתיים בכרטיס בלי שנה (תרומות, ביטוח חיים) — אחד עם ראיה, אחד בלי.

import { answerToFacts, type AskAnswer } from '../../features/taxYear/asks';
import type { InfoAsk, Purpose, YearFact } from '../../features/taxYear/types';
import { ITEM_BY_KEY } from '../../features/taxYear/catalog';
import { askFromRow } from '../../features/taxYear/api';
import { wealthMinDue } from '../../features/taxYear/wealthDemand';
import { SAMPLE_CLIENTS } from '../../data/sampleClients';
import { enrichClientsWithWorkspace } from '../../data/sampleClientWorkspace';

type Row = Record<string, unknown>;
type Tables = Record<string, Row[]>;

export const TY_CLIENT = 'sample-1';
const OPEN = (s: Row) => !['completed', 'verified', 'skipped', 'cancelled', 'failed'].includes(String(s.status));
const uuid = () => (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`);
const nowIso = () => new Date().toISOString();
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const ok = (data: unknown) => ({ data, error: null });

const factRow = (f: Omit<YearFact, 'id' | 'createdAt'> & { id?: string; createdAt?: string; sourceRef?: string; askId?: string }, firm: string): Row => ({
  id: f.id ?? uuid(), user_id: firm, client_id: f.clientId, tax_year: f.taxYear, item_key: f.itemKey, subject_role: f.subjectRole,
  entity_kind: f.entityKind ?? null, entity_ref: f.entityRef ?? null, period_kind: f.periodKind, period_from: f.periodFrom ?? null, period_to: f.periodTo ?? null,
  answer: f.answer, value: f.answer === 'zero' ? 0 : f.value ?? null, basis: f.basis, forecast_by: f.forecastBy ?? null, assumption: f.assumption ?? null,
  is_one_off: !!f.isOneOff, source: f.source, source_ref: f.sourceRef ?? null, client_assertion: f.clientAssertion ?? null,
  confirms_fact_id: f.confirmsFactId ?? null, request_id: f.requestId ?? null, ask_id: f.askId ?? null, evidence_id: f.evidenceId ?? null,
  status: f.status, decided_by: f.decidedBy ?? null, decided_at: f.decidedAt ?? null, supersedes: f.supersedes ?? null, note: f.note ?? null,
  created_at: f.createdAt ?? nowIso(),
});

// ‼ בדיקה בדפדפן של מסלול מלא (משרד → דף אישי → משרד) עוברת בין טעינות דף. לכן טבלאות שנת המס
// (ושורות הבקשות מהסוגים החדשים) נשמרות באחסון המקומי של הדפדפן — במצב הדמו בלבד. ‎?fresh-taxyear‎ מאפס.
const STORE = 'pivo-fake-taxyear-v2'; // v2 (סבב 8): נתוני דוח 2025 לאורית וסתירה בהרצל 12 — מצב ישן לא דורס אותם
const TY_STEP_TYPES = ['tax_estimate', 'annual_return', 'info_collection', 'wealth_declaration', 'tax_file_intake'];
function persist(t: Tables) {
  try {
    localStorage.setItem(STORE, JSON.stringify({
      tax_year_facts: t.tax_year_facts, tax_evidence: t.tax_evidence, tax_info_asks: t.tax_info_asks, tax_card_transfers: t.tax_card_transfers, tax_estimates: t.tax_estimates, annual_returns: t.annual_returns, tax_fact_changes: t.tax_fact_changes,
      steps: (t.onboarding_steps ?? []).filter(s => TY_STEP_TYPES.includes(String(s.step_type))),
      sessions: (t.annual_report_sessions ?? []).map(x => ({ id: x.id, facts_synced_at: x.facts_synced_at })),
      // 236 · שאלון ישן שהוחלף בקליטה — כדי שההחלפה תשרוד טעינת דף (השאלון עצמו אינו מסוגי שנת המס)
      replacedLegacy: (t.onboarding_steps ?? []).filter(s => s.step_type === 'intake_questionnaire' && (s.payload as Row | undefined)?.replacedBy)
        .map(s => ({ id: s.id, payload: s.payload })),
    }));
  } catch { /* אחסון חסום — ממשיכים בזיכרון */ }
}
function restore(t: Tables): boolean {
  try {
    if (new URLSearchParams(window.location.search).has('fresh-taxyear')) { localStorage.removeItem(STORE); return false; }
    const raw = localStorage.getItem(STORE);
    if (!raw) return false;
    const v = JSON.parse(raw) as Record<string, Row[]>;
    t.tax_year_facts = v.tax_year_facts ?? []; t.tax_evidence = v.tax_evidence ?? []; t.tax_info_asks = v.tax_info_asks ?? []; t.tax_card_transfers = v.tax_card_transfers ?? []; t.tax_estimates = v.tax_estimates ?? []; t.annual_returns = v.annual_returns ?? []; if (v.tax_fact_changes) t.tax_fact_changes = v.tax_fact_changes;
    t.onboarding_steps = [...(t.onboarding_steps ?? []).filter(s => !TY_STEP_TYPES.includes(String(s.step_type))), ...(v.steps ?? [])];
    for (const x of v.sessions ?? []) { const ss = (t.annual_report_sessions ?? []).find(y => y.id === x.id); if (ss) ss.facts_synced_at = x.facts_synced_at; }
    for (const x of v.replacedLegacy ?? []) { const ls = (t.onboarding_steps ?? []).find(y => y.id === x.id); if (ls) { ls.status = 'cancelled'; ls.payload = x.payload; } }
    return true;
  } catch { return false; }
}

export function seedTaxYearDemo(t: Tables, firm: string) {
  t.tax_year_facts ??= []; t.tax_evidence ??= []; t.tax_info_asks ??= []; t.tax_card_transfers ??= []; t.tax_estimates ??= []; t.annual_returns ??= [];
  t.annual_report_sessions ??= [];
  seedBase(t, firm);
  restore(t);
}

function seedBase(t: Tables, firm: string) {
  const stepBase = { user_id: firm, engagement_id: 'eng-demo', client_id: TY_CLIENT, scope: 'person', depends_on_step_id: null, due_date: null,
    needs_attention: false, completion_method: 'manual', completed_at: null, verified_at: null, sort_order: null };
  // הערכת מס 2025 — הסתיימה (חתך ספטמבר). השאלות נענו ואושרו.
  t.onboarding_steps.push({ ...stepBase, id: 'ty-est-2025', step_type: 'tax_estimate', status: 'completed', ball: 'me', track: 'internal',
    payload: { taxYear: 2025, purpose: 'estimate', cutoffMonth: 9, title: 'הערכת מס 2025' },
    published_at: '2025-10-05T08:00:00Z', created_at: '2025-10-05T08:00:00Z', updated_at: '2025-11-02T08:00:00Z', completed_at: '2025-11-02T08:00:00Z' });
  const est = (itemKey: string, subjectRole: YearFact['subjectRole'], value: unknown, extra: Partial<YearFact> = {}) => t.tax_year_facts.push(factRow({
    clientId: TY_CLIENT, taxYear: 2025, itemKey, subjectRole, periodKind: 'months', periodFrom: '2025-01-01', periodTo: '2025-09-30',
    answer: value === false ? 'no' : 'value', value: value === false ? undefined : value, basis: 'actual_to_date', source: 'portal',
    requestId: 'ty-est-2025', status: 'accepted', decidedBy: firm, decidedAt: '2025-10-20T08:00:00Z', createdAt: '2025-10-12T08:00:00Z', ...extra,
  }, firm));
  est('salary.worked', 'client', true);
  est('salary.worked', 'spouse', true);
  est('donations.given', 'client', true);
  est('donations.amount', 'client', 2400);
  est('rent.income', 'couple', 39600, { entityKind: 'property', entityRef: 'prop-d1' });
  est('household.children', 'couple', { unchanged: true, lines: ['ילד/ה — נולד/ה ב-2015', 'ילד/ה — נולד/ה ב-2018'] }, { clientAssertion: 'unchanged' });
  // הלקוח ענה בדף האישי שהדירה בהרצל 12 כבר לא מושכרת — סותר את התיק (מושכר). ממתין לבדיקת המשרד
  t.tax_year_facts.push(factRow({ clientId: TY_CLIENT, taxYear: 2025, itemKey: 'rent.properties', subjectRole: 'couple', entityKind: 'property', entityRef: 'prop-d1', periodKind: 'year',
    periodFrom: '2025-01-01', periodTo: '2025-12-31', answer: 'value', value: { isRented: false, note: 'הפסקנו להשכיר בדצמבר' }, basis: 'declared', source: 'portal', status: 'pending', createdAt: '2026-02-15T08:00:00Z' }, firm));
  // דוח שנתי 2025 לאורית (sample-4): נתונים סופיים מ-106 ומהספרים — נשאר למשרד להשלים הצהרות, פרטים, חשבון ונספח 1320
  const fin = (itemKey: string, subjectRole: YearFact['subjectRole'], value: unknown, extra: Partial<YearFact> = {}) => t.tax_year_facts.push(factRow({
    clientId: 'sample-4', taxYear: 2025, itemKey, subjectRole, periodKind: 'year', periodFrom: '2025-01-01', periodTo: '2025-12-31',
    answer: 'value', value, basis: 'final', source: 'office', status: 'accepted', decidedBy: firm, decidedAt: '2026-02-10T08:00:00Z', createdAt: '2026-02-10T08:00:00Z', ...extra,
  }, firm));
  fin('salary.amounts', 'client', { gross: 96_000, withheld: 4_000, insured: 96_000, employeePension: 5_760, employerDeposits: 12_000 }, { entityKind: 'employer', entityRef: 'emp-o1' });
  fin('salary.amounts', 'spouse', { gross: 180_000, withheld: 25_000, insured: 180_000 }, { entityKind: 'employer', entityRef: 'emp-a1' });
  fin('business.profit', 'client', { profit: 140_000, turnover: 190_000 }, { entityKind: 'business', entityRef: 'biz-o1' });
  fin('payments.niPaid', 'client', 14_000);
  fin('payments.advances', 'client', 10_000);
  fin('savings.selfAmounts', 'client', { pension: 12_000 });
  // שאלון ישן ל-2025: נשלח לפני המעבר, הלקוח השלים, טרם נקלט בתיק.
  t.annual_report_sessions.push({ id: 'legacy-2025', user_id: firm, client_id: TY_CLIENT, tax_year: 2025, status: 'completed', superseded_by: null,
    completed_at: '2026-02-10T09:00:00Z', facts_synced_at: null, created_at: '2026-02-01T09:00:00Z', updated_at: '2026-02-10T09:00:00Z',
    model: { taxYear: 2025, identity: {}, spouse: {}, income: { sources: ['salary', 'rental'], rentalGrossAnnual: 52800, capitalSubTypes: ['crypto'] },
      deductionsCredits: { donationAmount: 3000, hasLifeInsurance: true, lifeInsuranceAnnual: 1800 }, taxPaid: {}, specialSituations: {}, meta: { flow: 'annual' } } });
  // ראיה לשנת הסכום בכרטיס: התרומות נכתבו מהשאלון של 2024 (source_ref = הסשן) והערך לא השתנה
  t.annual_report_sessions.push({ id: 'legacy-2024', user_id: firm, client_id: TY_CLIENT, tax_year: 2024, status: 'completed', superseded_by: 'legacy-2024b',
    completed_at: '2025-03-01T09:00:00Z', facts_synced_at: '2025-03-02T09:00:00Z', created_at: '2025-02-20T09:00:00Z', updated_at: '2025-03-02T09:00:00Z', model: { taxYear: 2024 } });
  // 230 · אסמכתה לאימות דרישה להצהרת הון: מכתב הדרישה בתיק המסמכים (הדגמה — אין קובץ אמיתי)
  (t.documents ??= []).push({ id: 'doc-wealth-demand', user_id: firm, client_id: TY_CLIENT, storage_path: 'demo/wealth-demand.pdf',
    file_name: 'מכתב דרישה הצהרת הון.pdf', file_type: 'application/pdf', file_size: 48213, category: 'tax_authority', year: '2026',
    description: 'מכתב דרישה להצהרת הון (פקיד שומה)', uploaded_at: '2026-09-16T08:00:00Z' });
  (t.tax_fact_changes ??= []).push({ id: 'tfc-don-2024', user_id: firm, client_id: TY_CLIENT, field_key: 'donationsAnnual', label: 'תרומות שנתיות',
    old_value: null, new_value: { display: '3,000 ₪', patch: { donationsAnnual: 3000 } }, source: 'questionnaire', source_ref: 'legacy-2024',
    status: 'accepted', created_at: '2025-03-02T09:00:00Z' });
}

/** הכרטיס בהדמיה: לקוח הדוגמה + כל ההצעות שאושרו (מפתחות camelCase — clientFromDb משאיר אותם כמו שהם). */
function demoCard(t: Tables, clientId: string): Row | null {
  const base = enrichClientsWithWorkspace(SAMPLE_CLIENTS).find(c => c.id === clientId) as unknown as Row | undefined;
  if (!base) return null;
  const card: Row = { ...base };
  // ‼ כמו במסד (ברירת מחדל '[]' לכל רשימה): רשימה חסרה בלקוח הדוגמה היא [] — אחרת בדיקת העדכניות של הצעה
  //   («הכרטיס השתנה מאז») נכשלה בהוספת הישות הראשונה לרשימה ריקה, רק בהדגמה.
  for (const k of ['children', 'properties', 'foreignAccounts', 'investmentAccounts', 'bankAccounts', 'employers', 'pensionFunds', 'businesses']) card[k] ??= [];
  for (const c of (t.tax_fact_changes ?? []).filter(x => x.client_id === clientId && x.status === 'accepted')) Object.assign(card, (((c.new_value ?? {}) as Row).patch as Row) ?? {});
  return card;
}

const stepOf = (t: Tables, id: unknown) => (t.onboarding_steps ?? []).find(s => s.id === id);
const clientOfToken = (token: unknown) => (token === 'demo' ? TY_CLIENT : null);

function portalView(t: Tables, clientId: string, stepId: unknown): Row {
  const s = stepOf(t, stepId);
  if (!s || s.client_id !== clientId || s.step_type !== 'info_collection') return { ok: false, error: 'not_found' };
  const p = (s.payload ?? {}) as Row;
  const asks = t.tax_info_asks.filter(a => a.step_id === s.id && ['published', 'answered', 'unavailable'].includes(String(a.state)))
    .map(a => ({ id: a.id, itemKey: a.item_key, subjectRole: a.subject_role, entityRef: a.entity_ref, prompt: a.prompt, state: a.state,
      savedDraft: a.saved_draft ?? undefined, unavailable: a.unavailable ?? undefined, answeredAt: a.answered_at ?? undefined }));
  return { ok: true, stepId: s.id, taxYear: p.taxYear, title: p.title, asks };
}

/** פריט בדף האישי — אותו ענף כמו ב-_portal_step_items (229). */
export function taxInfoPortalItem(t: Tables, r: Row): Row | null {
  if (r.step_type !== 'info_collection') return null;
  const asks = (t.tax_info_asks ?? []).filter(a => a.step_id === r.id);
  const open = asks.filter(a => a.state === 'published').length;
  const unav = asks.filter(a => a.state === 'unavailable').length;
  const done = asks.filter(a => a.state === 'answered').length;
  const label = String(((r.payload ?? {}) as Row).title || 'השלמת מידע');
  if (open > 0) return { bucket: 'action', key: `taxinfo_${r.id}`, label, sub: `${open === 1 ? 'שאלה אחת' : `${open} שאלות`} · אפשר לעצור ולהמשיך`, actionKind: 'taxInfo', actionValue: r.id };
  if (unav > 0) return { bucket: 'office', key: `taxinfo_${r.id}`, label, sub: 'מחכים למסמכים שעוד לא הגיעו — נבקש כשיהיו', actionKind: 'taxInfo', actionValue: r.id };
  if (done > 0) return { bucket: 'done', key: `taxinfo_${r.id}`, label: `${label} · נשלח למשרד` };
  return null;
}

/** null ⇒ לא מטופל כאן. */
export function taxYearRpc(t: Tables, name: string, args: Row, firm: string, logWrite: (what: string, detail?: unknown) => void): { data: unknown; error: { message: string } | null } | null {
  const r = taxYearRpcInner(t, name, args, firm, logWrite);
  // ‼ השאלון הישן לא כותב לאחסון: לשונית שנפתחה לפני «החלף בקליטה» מחזיקה עותק ישן, וכתיבה ממנה הייתה מוחקת את ההחלפה.
  if (r && !['portal_tax_info', 'portal_tax_info_preview', 'get_intake', 'start_intake', 'save_intake_answer', 'reopen_intake', 'intake_replaced_state'].includes(name)) persist(t);
  return r;
}

/** סשן שאלון ישן נקלט (facts_synced_at) — נשמר כדי שהטעינה הבאה לא תקלוט שוב. */
export function taxYearPersist(t: Tables) { persist(t); }

// ── 236 · השאלון הישן בהדגמה (?intake=demo-intake&office-app) — אותו חוזה כמו בשרת ──
// ‼ «הוחלף» נקרא גם מהאחסון המקומי: לשונית שנפתחה לפני ההחלפה מחזיקה עותק ישן בזיכרון, והשרת היה רואה את המצב העדכני.
const DEMO_INTAKE_TOKEN = 'demo-intake';
function demoLegacyReplaced(t: Tables): string | null {
  const mem = (t.onboarding_steps ?? []).find(s => s.client_id === TY_CLIENT && s.step_type === 'intake_questionnaire' && (s.payload as Row | undefined)?.replacedBy);
  if (mem) return String((mem.payload as Row).replacedAt ?? nowIso());
  try {
    const v = JSON.parse(localStorage.getItem(STORE) ?? '{}') as { replacedLegacy?: { payload?: Row }[] };
    const x = (v.replacedLegacy ?? [])[0];
    return x ? String(x.payload?.replacedAt ?? nowIso()) : null;
  } catch { return null; }
}
function demoIntakeSession(t: Tables, firm: string): Row {
  t.annual_report_sessions ??= [];
  let s = t.annual_report_sessions.find(x => x.client_id === TY_CLIENT && Number(x.tax_year) === 2026 && !x.superseded_by);
  if (!s) {
    s = { id: `legacy-2026-${uuid()}`, user_id: firm, client_id: TY_CLIENT, tax_year: 2026, status: 'in_progress', superseded_by: null, completed_at: null, facts_synced_at: null,
      created_at: nowIso(), updated_at: nowIso(), current_question_id: 'year_map', model: { taxYear: 2026, meta: { flow: 'onboarding' } } };
    t.annual_report_sessions.push(s);
  }
  return s;
}

function taxYearRpcInner(t: Tables, name: string, args: Row, firm: string, logWrite: (what: string, detail?: unknown) => void): { data: unknown; error: { message: string } | null } | null {
  const log = (what: string, detail?: unknown) => logWrite(`rpc.${what}`, detail);
  if (['get_intake', 'start_intake', 'save_intake_answer', 'reopen_intake', 'intake_replaced_state'].includes(name) && args.p_token !== DEMO_INTAKE_TOKEN) {
    return name === 'intake_replaced_state' ? ok({ ok: false, error: 'invalid' }) : name === 'start_intake' ? { data: null, error: { message: 'invalid token' } } : name === 'get_intake' ? ok([]) : ok(false);
  }
  switch (name) {
    case 'intake_replaced_state': {
      const at = demoLegacyReplaced(t);
      return ok(at ? { ok: true, replaced: true, at, portalToken: 'demo' } : { ok: true, replaced: false });
    }
    case 'get_intake': {
      const s = demoIntakeSession(t, firm);
      return ok([{ session_id: s.id, tax_year: 2026, model: s.model, current_question_id: s.current_question_id, session_status: s.status,
        client_name: 'דוד כהן', identified: true, firm_name: 'גיא ישר · רואה חשבון', branding: {} }]);
    }
    case 'start_intake': {
      if (demoLegacyReplaced(t)) return { data: null, error: { message: 'intake_replaced' } };
      const s = demoIntakeSession(t, firm);
      return ok([{ session_id: s.id, tax_year: 2026, model: s.model, current_question_id: s.current_question_id }]);
    }
    case 'save_intake_answer': {
      if (demoLegacyReplaced(t)) return ok(false);
      const s = (t.annual_report_sessions ?? []).find(x => x.id === args.p_session_id);
      if (!s) return ok(false);
      s.model = args.p_model; s.current_question_id = args.p_current_question_id; s.updated_at = nowIso();
      if (args.p_done) { s.status = 'review'; s.completed_at = nowIso(); }
      log('save_intake_answer', { q: args.p_question_id });
      return ok(true);
    }
    case 'reopen_intake': {
      if (demoLegacyReplaced(t)) return ok(false);
      const s = demoIntakeSession(t, firm); s.status = 'in_progress'; s.current_question_id = 'year_map'; s.completed_at = null;
      return ok(true);
    }
    // ── הצעות לתיק המס (91/162) — בהדמיה: הכרטיס הוא לקוח הדוגמה + כל ההצעות שאושרו; בדיקת עדכניות כמו בשרת ──
    case 'propose_tax_facts': {
      const items = (args.p_items as Row[] | undefined) ?? [];
      const changes = items.map(i => {
        const row: Row = { id: `tfc-${uuid()}`, user_id: firm, client_id: args.p_client_id, field_key: i.field_key, label: i.label, old_value: i.old_value ?? null,
          new_value: i.new_value, note: i.note ?? null, source: args.p_source, source_ref: args.p_source_ref ?? null, status: 'pending', created_at: nowIso() };
        (t.tax_fact_changes ??= []).push(row);
        return { id: row.id, fieldKey: row.field_key };
      });
      log('propose_tax_facts', { clientId: args.p_client_id, n: changes.length });
      return ok({ ok: true, proposed: changes.length, changes });
    }
    case 'accept_tax_fact_change': {
      const r = (t.tax_fact_changes ?? []).find(x => x.id === args.p_change_id && x.status === 'pending');
      if (!r) return ok({ ok: false, error: 'not_pending_or_not_found' });
      const card = demoCard(t, String(r.client_id));
      if (!card) return ok({ ok: false, error: 'client_not_found' });
      const oldPatch = ((r.old_value ?? {}) as Row).patch as Row | undefined;
      const stale = Object.keys(oldPatch ?? {}).filter(k => JSON.stringify(card[k] ?? null) !== JSON.stringify(oldPatch![k] ?? null));
      if (stale.length) return ok({ ok: false, error: 'stale_conflict', staleFields: stale });
      r.status = 'accepted'; r.decided_at = nowIso();
      log('accept_tax_fact_change', { id: r.id, fieldKey: r.field_key });
      return ok({ ok: true, client: demoCard(t, String(r.client_id)) });
    }
    // 162 · הצעה שמוחלת מיד — אותו חוזה: ערך שכבר הוחל ⇒ already_applied; הכרטיס השתנה בינתיים ⇒ נשארת ממתינה (pending_conflict)
    case 'apply_tax_facts': {
      const items = (args.p_items as Row[] | undefined) ?? [];
      const results: Row[] = [];
      let applied = 0, pending = 0;
      for (const i of items) {
        const card = demoCard(t, String(args.p_client_id));
        if (!card) return ok({ ok: false, error: 'client_not_found' });
        const newPatch = ((i.new_value ?? {}) as Row).patch as Row | undefined;
        const oldPatch = ((i.old_value ?? {}) as Row).patch as Row | undefined;
        if (newPatch && Object.keys(newPatch).every(k => JSON.stringify(card[k] ?? null) === JSON.stringify(newPatch[k] ?? null))) { results.push({ fieldKey: i.field_key, outcome: 'already_applied' }); continue; }
        const row: Row = { id: `tfc-${uuid()}`, user_id: firm, client_id: args.p_client_id, field_key: i.field_key, label: i.label, old_value: i.old_value ?? null,
          new_value: i.new_value, note: i.note ?? null, source: args.p_source, source_ref: args.p_source_ref ?? null, status: 'pending', created_at: nowIso() };
        (t.tax_fact_changes ??= []).push(row);
        const stale = Object.keys(oldPatch ?? {}).filter(k => JSON.stringify(card[k] ?? null) !== JSON.stringify(oldPatch![k] ?? null));
        if (stale.length) { pending++; results.push({ fieldKey: i.field_key, outcome: 'pending_conflict', changeId: row.id }); continue; }
        row.status = 'accepted'; row.decided_at = nowIso(); applied++;
        results.push({ fieldKey: i.field_key, outcome: 'applied', changeId: row.id });
      }
      log('apply_tax_facts', { clientId: args.p_client_id, applied, pending });
      return ok({ ok: true, applied, pending, results, client: demoCard(t, String(args.p_client_id)) });
    }
    case 'reject_tax_fact_change': {
      const r = (t.tax_fact_changes ?? []).find(x => x.id === args.p_change_id && x.status === 'pending');
      if (!r) return ok({ ok: false, error: 'not_pending_or_not_found' });
      r.status = 'rejected'; r.decided_at = nowIso(); r.note = args.p_note ?? r.note;
      log('reject_tax_fact_change', { id: r.id });
      return ok({ ok: true });
    }
    case 'ensure_tax_year_request': {
      const purpose = args.p_purpose as Purpose; const year = Number(args.p_tax_year); const cutoff = args.p_cutoff_month == null ? null : Number(args.p_cutoff_month);
      if (!['estimate', 'annual'].includes(purpose)) return ok({ ok: false, error: 'bad_purpose' });
      if (!(year >= 2000 && year <= 2100)) return ok({ ok: false, error: 'bad_year' });
      if (purpose === 'estimate' && !(cutoff && cutoff >= 1 && cutoff <= 12)) return ok({ ok: false, error: 'bad_cutoff' });
      const type = purpose === 'estimate' ? 'tax_estimate' : 'annual_return';
      const ex = t.onboarding_steps.find(s => s.client_id === args.p_client_id && s.step_type === type && String((s.payload as Row)?.taxYear) === String(year) && OPEN(s));
      if (ex) { log('ensure_tax_year_request', { existing: ex.id }); return ok({ ok: true, stepId: ex.id, created: false }); }
      const legacy = purpose === 'annual' ? t.annual_report_sessions.find(x => x.client_id === args.p_client_id && Number(x.tax_year) === year && !x.superseded_by) : undefined;
      const legacyStep = purpose === 'annual' ? t.onboarding_steps.find(s => s.client_id === args.p_client_id && s.step_type === 'intake_questionnaire' && OPEN(s)) : undefined;
      const id = `ty-${type}-${year}-${Date.now()}`;
      const eng = (t.engagements ?? []).find(e => e.client_id === args.p_client_id);
      t.onboarding_steps.push({ id, user_id: firm, engagement_id: eng?.id ?? null, client_id: args.p_client_id, step_type: type, status: 'in_progress', ball: 'me',
        track: 'internal', scope: 'person', depends_on_step_id: null, due_date: null, needs_attention: false, completion_method: 'manual',
        payload: { taxYear: year, purpose, ...(cutoff ? { cutoffMonth: cutoff } : {}), title: (purpose === 'estimate' ? 'הערכת מס ' : 'דוח שנתי ') + year,
          ...(legacy ? { legacySessionId: legacy.id } : {}), ...(legacyStep ? { legacyStepId: legacyStep.id } : {}) },
        completed_at: null, verified_at: null, published_at: nowIso(), sort_order: 30, created_at: nowIso(), updated_at: nowIso() });
      log('ensure_tax_year_request', { created: id, legacy: legacy?.id });
      return ok({ ok: true, stepId: id, created: true, legacySessionId: legacy?.id });
    }
    // ── 236 · קליטה והשלמת תיק המס — בקשה פתוחה אחת ללקוח, «נכון ליום הקליטה» ──
    case 'ensure_tax_file_intake': {
      const ex = t.onboarding_steps.find(s => s.client_id === args.p_client_id && s.step_type === 'tax_file_intake' && OPEN(s));
      if (ex) return ok({ ok: true, stepId: ex.id, created: false });
      const asOf = today();
      const legacyStep = t.onboarding_steps.find(s => s.client_id === args.p_client_id && s.step_type === 'intake_questionnaire' && OPEN(s));
      const eng = (t.engagements ?? []).find(e => e.client_id === args.p_client_id);
      const id = `ty-intake-${Date.now()}`;
      t.onboarding_steps.push({ id, user_id: firm, engagement_id: eng?.id ?? null, client_id: args.p_client_id, step_type: 'tax_file_intake', status: 'in_progress', ball: 'me',
        track: 'internal', scope: 'person', depends_on_step_id: null, due_date: null, needs_attention: false, completion_method: 'manual',
        payload: { purpose: 'intake', asOfDate: asOf, taxYear: Number(asOf.slice(0, 4)), title: 'קליטה והשלמת תיק המס', ...(legacyStep ? { legacyStepId: legacyStep.id } : {}) },
        completed_at: null, verified_at: null, published_at: nowIso(), sort_order: 29, created_at: nowIso(), updated_at: nowIso() });
      log('ensure_tax_file_intake', { created: id });
      return ok({ ok: true, stepId: id, created: true });
    }
    // ── 236 · «החלף בקליטה» — השאלון הישן מבוטל עם «הוחלף», והקליטה רושמת את זה (אותו חוזה כמו בשרת) ──
    case 'replace_legacy_intake': {
      const s = t.onboarding_steps.find(x => x.id === args.p_intake_step_id && x.step_type === 'tax_file_intake');
      if (!s) return ok({ ok: false, error: 'not_found' });
      if (!OPEN(s)) return ok({ ok: false, error: 'intake_closed' });
      const legacy = t.onboarding_steps.filter(x => x.client_id === s.client_id && x.step_type === 'intake_questionnaire' && OPEN(x))
        .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))[0];
      if (!legacy) return ok({ ok: true, replaced: false });
      const at = nowIso();
      legacy.status = 'cancelled';
      legacy.payload = { ...(legacy.payload ?? {}), replacedBy: s.id, replacedAt: at };
      const hist = Array.isArray((s.payload as { history?: unknown[] } | undefined)?.history) ? (s.payload as { history: unknown[] }).history : [];
      s.payload = { ...(s.payload ?? {}), legacyReplaced: { stepId: legacy.id, at, by: firm }, history: [...hist, { at, by: firm, what: 'legacy_replaced', stepId: legacy.id }] };
      log('replace_legacy_intake', { legacy: legacy.id });
      return ok({ ok: true, replaced: true, legacyStepId: legacy.id });
    }
    // ── 230 · הכנה להצהרת הון — אותו חוזה כמו בשרת ──
    case 'ensure_wealth_declaration': {
      const asOf = String(args.p_as_of ?? '');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf)) return ok({ ok: false, error: 'bad_date' });
      const kindArg = args.p_kind == null ? null : String(args.p_kind);
      if (kindArg && !['first', 'followup'].includes(kindArg)) return ok({ ok: false, error: 'bad_kind' });
      const ex = t.onboarding_steps.find(s => s.client_id === args.p_client_id && s.step_type === 'wealth_declaration' && (s.payload as Row)?.asOfDate === asOf && OPEN(s));
      if (ex) return ok({ ok: true, stepId: ex.id, created: false });
      const prev = t.onboarding_steps.filter(s => s.client_id === args.p_client_id && s.step_type === 'wealth_declaration' && s.status !== 'cancelled' && String((s.payload as Row)?.asOfDate) < asOf)
        .sort((a, b) => String((b.payload as Row).asOfDate).localeCompare(String((a.payload as Row).asOfDate)))[0];
      const kind = kindArg ?? (prev ? 'followup' : 'first');
      const id = `ty-wealth-${asOf}-${Date.now()}`;
      t.onboarding_steps.push({ id, user_id: firm, engagement_id: null, client_id: args.p_client_id, step_type: 'wealth_declaration', status: 'in_progress', ball: 'me',
        track: 'internal', scope: 'person', depends_on_step_id: null, due_date: null, needs_attention: false, completion_method: 'manual',
        payload: { purpose: 'wealth', asOfDate: asOf, taxYear: Number(asOf.slice(0, 4)), kind, title: `הצהרת הון ליום ${asOf.slice(8, 10)}.${asOf.slice(5, 7)}.${asOf.slice(0, 4)}`,
          ...(prev ? { previous: { fromStepId: prev.id, asOfDate: (prev.payload as Row).asOfDate } } : {}),
          history: [{ at: nowIso(), by: firm, what: 'opened', kind }] },
        completed_at: null, verified_at: null, published_at: nowIso(), sort_order: 32, created_at: nowIso(), updated_at: nowIso() });
      log('ensure_wealth_declaration', { created: id, kind });
      return ok({ ok: true, stepId: id, created: true, kind });
    }
    case 'update_wealth_declaration': {
      const st = stepOf(t, args.p_step_id);
      if (!st || st.step_type !== 'wealth_declaration') return ok({ ok: false, error: 'not_found' });
      if (!OPEN(st)) return ok({ ok: false, error: 'closed' });
      const patch = (args.p_patch ?? {}) as Row;
      if (Object.keys(patch).some(k => !['demand', 'demandVerify', 'demandExtension', 'internalTarget', 'previous', 'basis', 'basisChange', 'basisJustification', 'omission'].includes(k))) return ok({ ok: false, error: 'bad_field' });
      const p = { ...(st.payload as Row) };
      const asOf = String(p.asOfDate);
      // ‼ אותם מצבים כמו בשרת (230): מידע = «reported»; אימות רק מול אסמכתה של אותו לקוח
      if ('demand' in patch) {
        if (patch.demand == null) delete p.demand;
        else {
          const dm = patch.demand as Row;
          const val = (k: string) => (dm[k] ? String(dm[k]) : undefined);
          const prevD = p.demand as Row | undefined;
          const source = val('source') ?? 'other';
          if (!['letter', 'portal', 'client', 'alignment', 'other'].includes(source)) return ok({ ok: false, error: 'bad_source' });
          const nd: Row = { status: 'reported', source, letterDate: val('letterDate'), receivedOn: val('receivedOn'), dueInLetter: val('dueInLetter'),
            note: val('note')?.trim() || undefined, reportedBy: firm, reportedAt: nowIso(), unverifiedFrom: prevD?.status === 'verified' ? prevD.verifiedAt : undefined };
          const base = String(nd.letterDate ?? nd.receivedOn ?? '');
          if (nd.dueInLetter && base && String(nd.dueInLetter) < base) return ok({ ok: false, error: 'due_before_letter' });
          p.demand = Object.fromEntries(Object.entries(nd).filter(([, v]) => v !== undefined));
        }
      }
      if ('demandVerify' in patch) {
        const dmd = p.demand as Row | undefined;
        if (!dmd) return ok({ ok: false, error: 'no_demand' });
        if (!dmd.letterDate && !dmd.receivedOn) return ok({ ok: false, error: 'demand_date_required' });
        const v = (patch.demandVerify ?? {}) as Row;
        if (v.kind === 'document') {
          if (!(t.documents ?? []).some(x => x.id === v.documentId && x.client_id === st.client_id)) return ok({ ok: false, error: 'evidence_not_found' });
        } else if (v.kind === 'authority_record') {
          if (!(t.tax_fact_changes ?? []).some(x => x.id === v.recordId && x.client_id === st.client_id && x.status === 'accepted'
            && ['institution_alignment', 'automation'].includes(String(x.source)) && ['capitalDeclarationRequired', 'capitalDeclarationDeadline'].includes(String(x.field_key)))) return ok({ ok: false, error: 'evidence_not_found' });
        } else return ok({ ok: false, error: 'evidence_required' });
        p.demand = { ...dmd, status: 'verified', evidence: { kind: v.kind, documentId: v.documentId, recordId: v.recordId, label: v.label }, verifiedBy: firm, verifiedAt: nowIso() };
      }
      if ('demandExtension' in patch) {
        const dmd = p.demand as Row | undefined;
        if (!dmd) return ok({ ok: false, error: 'no_demand' });
        const x = patch.demandExtension as Row | null;
        if (x == null) { const { extension: _drop, ...rest } = dmd; void _drop; p.demand = rest; }
        else {
          if (!x.until) return ok({ ok: false, error: 'extension_date_required' });
          if (!['personal', 'general'].includes(String(x.kind))) return ok({ ok: false, error: 'bad_kind' });
          if (x.documentId && !(t.documents ?? []).some(d => d.id === x.documentId && d.client_id === st.client_id)) return ok({ ok: false, error: 'evidence_not_found' });
          p.demand = { ...dmd, extension: { until: x.until, kind: x.kind, documentId: x.documentId || undefined, status: x.documentId ? 'documented' : 'reported', note: x.note ? String(x.note).trim() : undefined, by: firm, at: nowIso() } };
        }
      }
      if (p.demand) {
        const dmd = p.demand as Row;
        const due = wealthMinDue(dmd.letterDate as string | undefined, asOf);
        p.demand = { ...dmd, computedDue: due };
        if (!due) delete (p.demand as Row).computedDue;
      }
      if ('internalTarget' in patch) { if (patch.internalTarget == null) delete p.internalTarget; else p.internalTarget = patch.internalTarget; }
      if ('previous' in patch) {
        const pv = { ...((p.previous ?? {}) as Row), ...((patch.previous ?? {}) as Row) };
        if (pv.asOfDate && String(pv.asOfDate) >= asOf) return ok({ ok: false, error: 'previous_not_before' });
        p.previous = pv; p.kind = 'followup';
      }
      let changes = 0;
      if ('basis' in patch) {
        const OKB: Record<string, string[]> = { funds: ['allDeposits', 'employeeOnly', 'notDecided'], businessAssets: ['cost', 'depreciatedCost', 'notDecided'], fxBalances: ['declarationDateRate', 'notDecided'], securities: ['cost', 'marketValueOldForm'] };
        const basis = { ...((p.basis ?? {}) as Row) };
        const prevBasis = (((p.previous ?? {}) as Row).basis ?? {}) as Row;
        const list = [...(((p.basisChanges ?? []) as Row[]))];
        const expl = String(((patch.basisChange ?? {}) as Row).explanation ?? '').trim();
        for (const [k, v] of Object.entries((patch.basis ?? {}) as Row)) {
          if (!OKB[k]?.includes(String(v))) return ok({ ok: false, error: 'bad_basis', field: k });
          const old = prevBasis[k];
          const approved = list.some(c => c.field === k && c.from === old && c.to === v);
          if (old != null && old !== v && v !== 'notDecided' && old !== 'notDecided' && !approved) {
            if (!expl) return ok({ ok: false, error: 'basis_change_needs_explanation', field: k });
            list.push({ field: k, from: old, to: v, explanation: expl, approvedBy: firm, approvedAt: nowIso() }); changes++;
          }
          const NEEDS: Record<string, string[]> = { funds: ['employeeOnly'], businessAssets: ['depreciatedCost'], fxBalances: ['declarationDateRate'] };
          if (NEEDS[k]?.includes(String(v))) {
            const j = (((patch.basisJustification ?? {}) as Row)[k] ?? {}) as Row;
            const had = (((p.basisJustification ?? {}) as Row)[k] ?? {}) as Row;
            if (!String(j.text ?? '').trim() && had.value !== v) return ok({ ok: false, error: 'basis_needs_justification', field: k });
            if (String(j.text ?? '').trim()) p.basisJustification = { ...((p.basisJustification ?? {}) as Row), [k]: { value: v, text: String(j.text).trim(), source: j.source ? String(j.source).trim() : undefined, by: firm, at: nowIso() } };
          }
          basis[k] = v;
        }
        p.basis = basis; if (list.length) p.basisChanges = list;
      }
      if ('omission' in patch) {
        // ‼ השמטה בהצהרה הקודמת — ממצא פתוח עד הכרעה כתובה (בשרת גם חוסם סגירה)
        const om = (patch.omission ?? {}) as Row;
        const list = [...((p.omissions ?? []) as Row[])];
        if (om.add) {
          const a = om.add as Row;
          if (!String(a.description ?? '').trim()) return ok({ ok: false, error: 'omission_description_required' });
          list.push({ id: uuid().replace(/-/g, ''), status: 'open', area: a.area || undefined, description: String(a.description).trim(), foundBy: firm, foundAt: nowIso() });
        } else if (om.resolve) {
          const r = om.resolve as Row;
          if (!String(r.resolution ?? '').trim()) return ok({ ok: false, error: 'omission_resolution_required' });
          const i = list.findIndex(o => o.id === r.id && o.status === 'open');
          if (i < 0) return ok({ ok: false, error: 'omission_not_found' });
          list[i] = { ...list[i], status: 'resolved', resolution: String(r.resolution).trim(), resolvedBy: firm, resolvedAt: nowIso() };
        } else return ok({ ok: false, error: 'bad_field' });
        p.omissions = list;
      }
      p.history = [...((p.history ?? []) as Row[]), { at: nowIso(), by: firm, what: 'updated', fields: Object.keys(patch), ...(args.p_note ? { note: args.p_note } : {}) }];
      Object.assign(st, { payload: p, updated_at: nowIso() });
      log('update_wealth_declaration', { stepId: st.id, fields: Object.keys(patch), basisChanges: changes });
      return ok({ ok: true, basisChanges: changes });
    }
    // ── 231 · גרסאות הערכת מס — אותו חוזה כמו בשרת ──
    case 'save_tax_estimate': {
      const st = stepOf(t, args.p_request_id);
      if (!st || st.step_type !== 'tax_estimate') return ok({ ok: false, error: 'bad_request' });
      if (!OPEN(st)) return ok({ ok: false, error: 'request_closed' });
      const draft = (args.p_draft ?? {}) as Row;
      const cut = Number(draft.cutoffMonth);
      if (!(cut >= 0 && cut <= 12)) return ok({ ok: false, error: 'bad_cutoff' });
      const rows = t.tax_estimates.filter(e => e.request_id === st.id);
      const cur = rows.find(e => e.status === 'draft');
      const outputs = args.p_outputs as Row;
      if (outputs?.taxYear != null && Number(outputs.taxYear) !== Number((st.payload as Row).taxYear)) return ok({ ok: false, error: 'year_mismatch' });
      const base = args.p_base as Row | null;
      if (!base) return ok({ ok: false, error: 'base_required' });
      const latest = rows.reduce((m, e) => Math.max(m, Number(e.version)), 0);
      const current = { draftId: cur?.id ?? null, revision: cur?.revision ?? null, latestVersion: latest };
      if (cur) {
        if (base.draftId !== cur.id || Number(base.revision) !== Number(cur.revision)) return ok({ ok: false, error: 'conflict', current });
        const revision = Number(cur.revision ?? 1) + 1;
        Object.assign(cur, { draft, outputs, input_facts: args.p_input_facts ?? [], cutoff_month: cut, ruleset_version: outputs?.rulesetVersion ?? null, revision, updated_at: nowIso() });
        log('save_tax_estimate', { id: cur.id, version: cur.version, revision });
        return ok({ ok: true, id: cur.id, version: cur.version, revision, created: false });
      }
      if (base.draftId || Number(base.latestVersion ?? -1) !== latest) return ok({ ok: false, error: 'conflict', current });
      const version = latest + 1;
      const id = `est-${uuid().replace(/-/g, '').slice(0, 12)}`;
      t.tax_estimates.push({ id, user_id: firm, client_id: st.client_id, request_id: st.id, tax_year: (st.payload as Row).taxYear, version, status: 'draft',
        cutoff_month: cut, draft, outputs, input_facts: args.p_input_facts ?? [], ruleset_version: outputs?.rulesetVersion ?? null,
        approved_by: null, approved_at: null, revision: 1, created_at: nowIso(), updated_at: nowIso() });
      log('save_tax_estimate', { id, version, created: true });
      return ok({ ok: true, id, version, revision: 1, created: true });
    }
    // ── 233 · גרסאות הדוח השנתי — אותו חוזה כמו בשרת ──
    case 'save_annual_return': {
      const st = stepOf(t, args.p_request_id);
      if (!st || st.step_type !== 'annual_return') return ok({ ok: false, error: 'bad_request' });
      if (!OPEN(st)) return ok({ ok: false, error: 'request_closed' });
      const draft = (args.p_draft ?? {}) as Row, outputs = args.p_outputs as Row;
      const year = Number((st.payload as Row).taxYear);
      if (Number(draft.taxYear) !== year || (outputs?.taxYear != null && Number(outputs.taxYear) !== year)) return ok({ ok: false, error: 'year_mismatch' });
      const base = args.p_base as Row | null;
      if (!base) return ok({ ok: false, error: 'base_required' });
      const rows = t.annual_returns.filter(e => e.request_id === st.id);
      const cur = rows.find(e => e.status === 'draft');
      const latest = rows.reduce((m, e) => Math.max(m, Number(e.version)), 0);
      if (cur) {
        if (base.draftId !== cur.id || Number(base.revision) !== Number(cur.revision)) return ok({ ok: false, error: 'conflict' });
        const revision = Number(cur.revision) + 1;
        Object.assign(cur, { draft, outputs, input_facts: args.p_input_facts ?? [], ruleset_version: outputs?.rulesetVersion ?? null, form_version_id: outputs?.formVersionId ?? null, revision, updated_at: nowIso() });
        log('save_annual_return', { id: cur.id, revision });
        return ok({ ok: true, id: cur.id, version: cur.version, revision, created: false });
      }
      if (base.draftId || Number(base.latestVersion ?? -1) !== latest) return ok({ ok: false, error: 'conflict' });
      const id = `ar-${uuid().replace(/-/g, '').slice(0, 12)}`;
      t.annual_returns.push({ id, user_id: firm, client_id: st.client_id, request_id: st.id, tax_year: year, version: latest + 1, revision: 1, status: 'draft', draft, outputs,
        input_facts: args.p_input_facts ?? [], ruleset_version: outputs?.rulesetVersion ?? null, form_version_id: outputs?.formVersionId ?? null, created_at: nowIso(), updated_at: nowIso() });
      log('save_annual_return', { id, created: true });
      return ok({ ok: true, id, version: latest + 1, revision: 1, created: true });
    }
    case 'approve_annual_return': {
      const e = t.annual_returns.find(x => x.id === args.p_return_id);
      if (!e) return ok({ ok: false, error: 'not_found' });
      if (e.status !== 'draft') return ok({ ok: false, error: 'not_draft' });
      if (Number(args.p_revision) !== Number(e.revision)) return ok({ ok: false, error: 'conflict' });
      const o = e.outputs as Row | null;
      if (!o) return ok({ ok: false, error: 'no_outputs' });
      if (((o.blockers ?? []) as unknown[]).length) return ok({ ok: false, error: 'has_blockers', blockers: o.blockers });
      if (o.status !== 'completeWorksheet' || ((o.unsupported ?? []) as unknown[]).length) return ok({ ok: false, error: 'not_ready' });
      for (const x of t.annual_returns) if (x.request_id === e.request_id && x.status === 'approved') { x.status = 'superseded'; x.updated_at = nowIso(); }
      Object.assign(e, { status: 'approved', approved_by: firm, approved_at: nowIso(), updated_at: nowIso() });
      log('approve_annual_return', { id: e.id });
      return ok({ ok: true, id: e.id, version: e.version });
    }
    case 'record_annual_return_filed': {
      const e = t.annual_returns.find(x => x.id === args.p_return_id);
      if (!e) return ok({ ok: false, error: 'not_found' });
      if (e.status !== 'approved') return ok({ ok: false, error: 'not_approved' });
      if (e.filed_on) return ok({ ok: false, error: 'already_filed' });
      if (!args.p_filed_on || String(args.p_filed_on) > today()) return ok({ ok: false, error: 'bad_date' });
      if (!String(args.p_ref ?? '').trim() && !args.p_evidence_id) return ok({ ok: false, error: 'evidence_required' });
      Object.assign(e, { filed_on: args.p_filed_on, filed_ref: String(args.p_ref ?? '').trim() || null, filed_evidence_id: args.p_evidence_id ?? null, filed_by: firm, filed_recorded_at: nowIso(), updated_at: nowIso() });
      log('record_annual_return_filed', { id: e.id });
      return ok({ ok: true, id: e.id, filedOn: e.filed_on });
    }
    // 232 (הוחלה ב-staging 11.10, לא בייצור) — פרסום גרסה מאושרת בדף האישי; גרסה אחת מפורסמת לבקשה
    case 'publish_tax_estimate': {
      const e = t.tax_estimates.find(x => x.id === args.p_estimate_id);
      if (!e) return ok({ ok: false, error: 'not_found' });
      if (e.status !== 'approved') return ok({ ok: false, error: 'not_approved' });
      for (const x of t.tax_estimates) if (x.request_id === e.request_id && x.id !== e.id) x.published_at = null;
      e.published_at = args.p_publish ? nowIso() : null;
      log('publish_tax_estimate', { id: e.id, publish: !!args.p_publish });
      return ok({ ok: true, id: e.id, publishedAt: e.published_at });
    }
    case 'approve_tax_estimate': {
      const e = t.tax_estimates.find(x => x.id === args.p_estimate_id);
      if (!e) return ok({ ok: false, error: 'not_found' });
      if (e.status !== 'draft') return ok({ ok: false, error: 'not_draft' });
      if (Number(args.p_revision) !== Number(e.revision ?? 1)) return ok({ ok: false, error: 'conflict' });
      const outputs = e.outputs as Row | null;
      if (!outputs) return ok({ ok: false, error: 'no_outputs' });
      if (((outputs.blockers ?? []) as unknown[]).length) return ok({ ok: false, error: 'has_blockers', blockers: outputs.blockers });
      const d = e.draft as Row;
      if (((d.reconciliations ?? []) as Row[]).some(r => !r.decision)) return ok({ ok: false, error: 'reconciliation_open' });
      if (Number(d.cutoffMonth) < 12 && ((d.lines ?? []) as Row[]).some(l => !l.chosen)) return ok({ ok: false, error: 'forecast_not_chosen' });
      for (const x of t.tax_estimates) if (x.request_id === e.request_id && x.status === 'approved') { x.status = 'superseded'; x.updated_at = nowIso(); }
      Object.assign(e, { status: 'approved', approved_by: firm, approved_at: nowIso(), updated_at: nowIso() });
      log('approve_tax_estimate', { id: e.id, version: e.version });
      return ok({ ok: true, id: e.id, version: e.version });
    }
    case 'add_tax_info_asks': {
      const par = stepOf(t, args.p_parent_step_id);
      if (!par || !['tax_estimate', 'annual_return', 'wealth_declaration', 'tax_file_intake'].includes(String(par.step_type))) return ok({ ok: false, error: 'bad_parent' });
      if (!OPEN(par)) return ok({ ok: false, error: 'parent_closed' });
      // 230b/236: שאלת הון רק בהצהרת הון, שאלת קליטה רק בקליטה, ושאלת שנת מס רק בשנת מס — לפני יצירת בקשת־הבת
      if (((args.p_asks ?? []) as Row[]).some(a => String(a.itemKey).startsWith('wealth.') !== (par.step_type === 'wealth_declaration')
        || String(a.itemKey).startsWith('intake.') !== (par.step_type === 'tax_file_intake'))) return ok({ ok: false, error: 'item_purpose_mismatch' });
      const pp = par.payload as Row;
      let info = t.onboarding_steps.find(s => s.step_type === 'info_collection' && (s.payload as Row)?.parentStepId === par.id && OPEN(s));
      if (!info) {
        info = { id: `ty-info-${Date.now()}`, user_id: firm, engagement_id: par.engagement_id, client_id: par.client_id, step_type: 'info_collection', status: 'pending', ball: 'client',
          track: 'tools', scope: 'person', depends_on_step_id: null, due_date: null, needs_attention: false, completion_method: 'manual',
          payload: { parentStepId: par.id, taxYear: pp.taxYear, purpose: pp.purpose, cutoffMonth: pp.cutoffMonth, ...(pp.asOfDate ? { asOfDate: pp.asOfDate } : {}),
            title: par.step_type === 'wealth_declaration' ? 'השלמת מידע להצהרת הון' : par.step_type === 'tax_file_intake' ? 'השלמת פרטים לתיק המס' : `השלמת מידע לשנת ${pp.taxYear}` },
          completed_at: null, verified_at: null, published_at: null, sort_order: 31, created_at: nowIso(), updated_at: nowIso() };
        t.onboarding_steps.push(info);
      }
      let added = 0, skipped = 0;
      for (const a of (args.p_asks ?? []) as Row[]) {
        const item = ITEM_BY_KEY[String(a.itemKey)];
        if (!item) return ok({ ok: false, error: 'unknown_item', itemKey: a.itemKey });
        const dup = t.tax_info_asks.some(x => x.client_id === par.client_id && x.tax_year === pp.taxYear && x.item_key === a.itemKey && x.subject_role === a.subjectRole
          && (x.entity_ref ?? '') === (a.entityRef ?? '') && ['draft', 'published', 'unavailable'].includes(String(x.state)));
        if (dup) { skipped++; continue; }
        t.tax_info_asks.push({ id: uuid(), user_id: firm, client_id: par.client_id, tax_year: pp.taxYear, step_id: info.id, parent_step_id: par.id,
          item_key: a.itemKey, item_kind: item.kind, subject_role: a.subjectRole, entity_kind: a.entityKind ?? null, entity_ref: a.entityRef ?? null,
          prompt: a.prompt, state: 'draft', saved_draft: null, unavailable: null, office_note: null, answered_at: null, created_at: nowIso() });
        added++;
      }
      info.updated_at = nowIso();
      log('add_tax_info_asks', { infoStepId: info.id, added, skipped });
      return ok({ ok: true, infoStepId: info.id, added, skipped });
    }
    case 'resolve_tax_info_note': {
      const a = t.tax_info_asks.find(x => x.id === args.p_ask_id);
      if (!a) return ok({ ok: false, error: 'not_found' });
      if (a.office_note) a.note_resolved_at = nowIso();
      log('resolve_tax_info_note', { askId: a.id });
      return ok({ ok: true });
    }
    case 'cancel_tax_info_ask': {
      const a = t.tax_info_asks.find(x => x.id === args.p_ask_id);
      if (!a) return ok({ ok: false, error: 'not_found' });
      if (!['draft', 'published', 'unavailable'].includes(String(a.state))) return ok({ ok: false, error: 'not_open' });
      a.state = 'cancelled'; log('cancel_tax_info_ask', { askId: a.id });
      return ok({ ok: true });
    }
    case 'publish_tax_info': {
      const s = stepOf(t, args.p_info_step_id);
      if (!s || s.step_type !== 'info_collection') return ok({ ok: false, error: 'not_found' });
      const drafts = t.tax_info_asks.filter(a => a.step_id === s.id && a.state === 'draft');
      if (!drafts.length && !t.tax_info_asks.some(a => a.step_id === s.id && a.state === 'published')) return ok({ ok: false, error: 'nothing_to_publish' });
      drafts.forEach(a => { a.state = 'published'; });
      Object.assign(s, { status: 'waiting_client', ball: 'client', published_at: s.published_at ?? nowIso(), updated_at: nowIso() });
      log('publish_tax_info', { infoStepId: s.id, published: drafts.length });
      return ok({ ok: true, published: drafts.length });
    }
    case 'portal_tax_info': {
      const cid = clientOfToken(args.p_token);
      return ok(cid ? portalView(t, cid, args.p_step_id) : { ok: false, error: 'invalid' });
    }
    case 'portal_tax_info_preview': return ok(portalView(t, String(args.p_client_id), args.p_step_id));
    case 'portal_save_tax_info_draft': {
      const cid = clientOfToken(args.p_token);
      const a = t.tax_info_asks.find(x => x.id === args.p_ask_id && x.client_id === cid && ['published', 'unavailable'].includes(String(x.state)));
      if (a) { a.saved_draft = args.p_draft; log('portal_save_tax_info_draft', { askId: a.id }); }
      return ok({ ok: !!a });
    }
    case 'portal_submit_tax_info': {
      const cid = clientOfToken(args.p_token);
      if (!cid) return ok({ ok: false, error: 'invalid' });
      const a = t.tax_info_asks.find(x => x.id === args.p_ask_id && x.client_id === cid);
      if (!a) return ok({ ok: false, error: 'not_found' });
      if (a.state === 'answered') return ok({ ok: true, already: true });
      if (!['published', 'unavailable'].includes(String(a.state))) return ok({ ok: false, error: 'not_open' });
      const par = stepOf(t, a.parent_step_id); const pp = (par?.payload ?? {}) as Row;
      const ask = askFromRow(a) as InfoAsk;
      let res;
      try {
        res = answerToFacts(ask, args.p_answer as AskAnswer, { client: { id: cid } as never, taxYear: Number(a.tax_year), purpose: pp.purpose as Purpose, cutoffMonth: pp.cutoffMonth as number | undefined, asOfDate: pp.asOfDate as string | undefined }, today());
      } catch (e) {
        const m = (e as Error).message;
        return ok({ ok: false, error: m.includes('סכום') ? 'bad_amount' : m.includes('ריק') || m.includes('השתנה') ? 'empty' : 'bad_answer' });
      }
      if (res.unavailable) {
        Object.assign(a, { state: 'unavailable', saved_draft: null, unavailable: { ...res.unavailable, recordedAt: nowIso() } });
        // 229 (12.10.2026): גם כשהפריט האחרון נענה «אין לי עדיין» — הכדור חוזר למשרד
        const infoU = stepOf(t, a.step_id);
        if (infoU && !t.tax_info_asks.some(x => x.step_id === infoU.id && x.state === 'published')) Object.assign(infoU, { status: 'in_progress', ball: 'me', updated_at: nowIso() });
        log('portal_submit_tax_info', { askId: a.id, state: 'unavailable', followUpOn: res.unavailable.followUpOn });
        return ok({ ok: true, state: 'unavailable' });
      }
      let evidenceId: string | undefined;
      if (res.evidence) {
        evidenceId = uuid();
        t.tax_evidence.push({ id: evidenceId, user_id: firm, client_id: cid, tax_year: a.tax_year, doc_kind: res.evidence.docKind, subject_role: a.subject_role,
          entity_kind: a.entity_kind, entity_ref: a.entity_ref, document_id: res.evidence.documentId ?? null, file_name: res.evidence.fileName,
          received_at: nowIso(), received_via: 'portal', ask_id: a.id, extraction: 'not_supported', identity_match: 'unchecked', period_match: 'unchecked', review: 'needs_review' });
      }
      if (res.officeNote) a.office_note = res.officeNote;
      for (const f of res.facts) t.tax_year_facts.push(factRow({ ...f, askId: String(a.id) }, firm));
      Object.assign(a, { state: 'answered', answered_at: nowIso(), saved_draft: null });
      const info = stepOf(t, a.step_id);
      if (info && !t.tax_info_asks.some(x => x.step_id === info.id && x.state === 'published')) Object.assign(info, { status: 'in_progress', ball: 'me', updated_at: nowIso() });
      log('portal_submit_tax_info', { askId: a.id, facts: res.facts.length, evidenceId });
      return ok({ ok: true, state: 'answered', evidenceId });
    }
    case 'decide_tax_year_facts': {
      const ids = (args.p_fact_ids ?? []) as string[];
      if (!['accept', 'reject'].includes(String(args.p_decision))) return ok({ ok: false, error: 'bad_decision' });
      let n = 0;
      for (const f of t.tax_year_facts.filter(x => ids.includes(String(x.id)) && x.status === 'pending')) {
        if (args.p_decision === 'accept') {
          for (const o of t.tax_year_facts) if (o.status === 'accepted' && o.client_id === f.client_id && o.tax_year === f.tax_year && o.item_key === f.item_key
            && o.subject_role === f.subject_role && (o.entity_ref ?? '') === (f.entity_ref ?? '') && o.basis === f.basis && (o.period_to ?? '') === (f.period_to ?? '')) o.status = 'superseded';
          Object.assign(f, { status: 'accepted', decided_by: firm, decided_at: nowIso(), note: args.p_note ?? f.note });
        } else Object.assign(f, { status: 'rejected', decided_by: firm, decided_at: nowIso(), note: args.p_note ?? f.note });
        n++;
      }
      log('decide_tax_year_facts', { decision: args.p_decision, decided: n });
      return ok({ ok: true, decided: n });
    }
    case 'correct_tax_year_fact': {
      const f = t.tax_year_facts.find(x => x.id === args.p_fact_id);
      if (!f) return ok({ ok: false, error: 'not_found' });
      if (!['pending', 'accepted'].includes(String(f.status))) return ok({ ok: false, error: 'not_open' });
      f.status = 'superseded';
      const id = uuid();
      t.tax_year_facts.push({ ...f, id, answer: args.p_answer, value: args.p_answer === 'zero' ? 0 : args.p_value ?? null, source: 'office', source_ref: null,
        client_assertion: null, status: 'accepted', decided_by: firm, decided_at: nowIso(), supersedes: f.id, note: args.p_note ?? null, created_at: nowIso() });
      log('correct_tax_year_fact', { from: f.id, to: id });
      return ok({ ok: true, factId: id });
    }
    case 'record_tax_year_fact': {
      const p = (args.p_fact ?? {}) as Row;
      if (!ITEM_BY_KEY[String(p.itemKey)]) return ok({ ok: false, error: 'unknown_item' });
      const answer = String(p.answer ?? 'value');
      if (answer === 'value' && p.value == null) return ok({ ok: false, error: 'bad_value' });
      const id = uuid();
      t.tax_year_facts.push(factRow({ id, clientId: String(args.p_client_id), taxYear: Number(p.taxYear), itemKey: String(p.itemKey), subjectRole: p.subjectRole as YearFact['subjectRole'],
        entityKind: p.entityKind as YearFact['entityKind'], entityRef: p.entityRef as string | undefined, periodKind: (p.periodKind as YearFact['periodKind']) ?? 'year',
        periodFrom: p.periodFrom as string | undefined, periodTo: p.periodTo as string | undefined, answer: answer as YearFact['answer'], value: p.value,
        basis: (p.basis as YearFact['basis']) ?? 'actual', source: p.evidenceId ? 'document' : 'office', requestId: p.requestId as string | undefined,
        evidenceId: p.evidenceId as string | undefined, status: 'accepted', decidedBy: firm, decidedAt: nowIso(), note: p.note as string | undefined }, firm));
      log('record_tax_year_fact', { id, itemKey: p.itemKey });
      return ok({ ok: true, factId: id });
    }
    case 'review_tax_evidence': {
      const e = t.tax_evidence.find(x => x.id === args.p_evidence_id);
      if (!e) return ok({ ok: false, error: 'not_found' });
      if (args.p_review === 'accepted' && (args.p_identity !== 'match' || args.p_period !== 'match')) return ok({ ok: false, error: 'mismatch_cannot_accept' });
      Object.assign(e, { identity_match: args.p_identity, period_match: args.p_period, review: args.p_review, reviewed_by: firm, reviewed_at: nowIso(), note: args.p_note ?? e.note });
      log('review_tax_evidence', { id: e.id, review: args.p_review });
      return ok({ ok: true });
    }
    case 'decide_card_transfers': {
      let n = 0;
      for (const x of (args.p_items ?? []) as Row[]) {
        if (!['year', 'unknown_year', 'skip'].includes(String(x.decision))) return ok({ ok: false, error: 'bad_decision' });
        if (t.tax_card_transfers.some(r => r.client_id === args.p_client_id && r.path === x.path && r.entity_ref === (x.entityRef ?? ''))) continue;
        let factId: string | null = null;
        if (x.decision === 'year') {
          if (x.year == null) return ok({ ok: false, error: 'year_required' });
          factId = uuid();
          const y = Number(x.year);
          t.tax_year_facts.push(factRow({ id: factId, clientId: String(args.p_client_id), taxYear: y, itemKey: String(x.itemKey), subjectRole: x.subjectRole as YearFact['subjectRole'],
            entityKind: x.entityKind as YearFact['entityKind'], entityRef: x.entityRef as string | undefined, periodKind: 'year', periodFrom: `${y}-01-01`, periodTo: `${y}-12-31`,
            answer: 'value', value: { [String(x.path).replace('[].', '.')]: x.original }, basis: 'declared', source: 'card_migration',
            sourceRef: `card:${String(x.path)}:${String(x.entityRef ?? '')}`, status: 'accepted', decidedBy: firm, decidedAt: nowIso(),
            note: x.evidence ? `שנה לפי ראיה: ${String(x.evidence)}` : 'שנה נקבעה במשרד' }, firm));
        }
        t.tax_card_transfers.push({ id: uuid(), user_id: firm, client_id: args.p_client_id, path: x.path, entity_ref: x.entityRef ?? '', original: x.original,
          suggested_year: x.suggestedYear ?? null, evidence: x.evidence ?? null, decision: x.decision, assigned_year: x.decision === 'year' ? x.year : null,
          fact_id: factId, decided_by: firm, decided_at: nowIso() });
        n++;
      }
      log('decide_card_transfers', { decided: n });
      return ok({ ok: true, decided: n });
    }
    case 'record_legacy_tax_year_facts': {
      const sess = t.annual_report_sessions.find(x => x.id === args.p_session_id && x.client_id === args.p_client_id);
      if (!sess) return ok({ ok: false, error: 'session_not_found' });
      let n = 0;
      for (const f of (args.p_facts ?? []) as Row[]) {
        if (Number(f.taxYear) !== Number(sess.tax_year)) return ok({ ok: false, error: 'year_mismatch' });
        if (t.tax_year_facts.some(x => x.client_id === args.p_client_id && x.source === 'legacy_questionnaire' && x.source_ref === f.sourceRef)) continue;
        t.tax_year_facts.push(factRow({ ...(f as unknown as YearFact), status: 'pending', source: 'legacy_questionnaire', sourceRef: String(f.sourceRef) }, firm));
        n++;
      }
      log('record_legacy_tax_year_facts', { sessionId: sess.id, recorded: n });
      return ok({ ok: true, recorded: n });
    }
    default: return null;
  }
}
