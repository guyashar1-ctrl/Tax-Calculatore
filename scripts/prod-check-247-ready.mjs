#!/usr/bin/env node
/**
 * prod-check-247-ready.mjs — לפני החלת 247 בייצור. ‼ קריאה בלבד (readProd).
 *
 * בודק: כל פונקציה/טבלה/עמודה ש-247 נשענת עליה קיימת ובחתימה הנכונה; ארבעת העוגנים בגוף החי נמצאים
 * פעם אחת בדיוק (כמו שה-DO של 247 דורש) ו-247 עוד לא הוחלה; אין פונקציות _scf_* / portal_smart_form_*;
 * ערכי ה-CHECK שהמיגרציה כותבת (tax_fact_changes.source, onboarding_events.actor, smart_form_events.actor)
 * מותרים; אין הגשות 4440/821.
 *   node scripts/prod-check-247-ready.mjs [--after]   (--after: מצפה ש-247 כבר הוחלה)
 */
import { readFileSync } from 'node:fs';
import { readProd } from './staging-lib.mjs';

const after = process.argv.includes('--after');
let pass = 0, fail = 0;
const ok = (name, cond, detail = '') => { if (cond) { pass++; console.log(`✓ ${name}`); } else { fail++; console.log(`✗ ${name}${detail ? ' — ' + JSON.stringify(detail).slice(0, 300) : ''}`); } };

const fnArgs = async (name) => (await readProd(`select pg_get_function_identity_arguments(p.oid) a from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = '${name}'`)).map(r => r.a);
const NEEDS = {
  _smart_form_owned: 'p_filing_id text', _smart_form_after_signature: 'p_revision_id text', _smart_form_png_ok: 'p_png text',
  _smart_form_event: 'p_filing text, p_user uuid, p_revision integer, p_actor text, p_kind text, p_detail jsonb',
  _smart_form_mapping_fields: 'p_key text, p_version integer', _smart_form_sync_step: 'p_filing_id text',
  _set_step_status: 'p_step_id text, p_status text, p_actor text, p_note text, p_meta jsonb, p_ball text, p_completion_method text',
  create_onboarding_request: 'p_client_id text, p_step_type text, p_payload jsonb, p_due_date date, p_depends_on text, p_published boolean, p_required_for_close boolean, p_owner text, p_stage_id text',
  client_step_gate_open: 'p_client_id text, p_published_at timestamp with time zone',
  log_onboarding_event: 'p_user_id uuid, p_step_id text, p_engagement_id text, p_type text, p_actor text, p_note text, p_meta jsonb',
  queue_accountant_notification: 'p_user_id uuid, p_kind text, p_client_id text, p_step_id text, p_request_id text, p_quotation_id text, p_payload jsonb',
  portal_lock_reason: 'p_step_id text', is_hebrew_only: 'p_text text', is_authorized: '',
  smart_form_advance: 'p_filing_id text, p_action text, p_detail jsonb', smart_form_attach_signed_pdf: 'p_filing_id text, p_revision integer, p_document_id text, p_pdf_sha256 text',
};
for (const [fn, args] of Object.entries(NEEDS)) {
  const a = await fnArgs(fn);
  ok(`פונקציה ${fn}(${args})`, a.includes(args), a);
}

const [cols] = await readProd(`select string_agg(column_name, ',' order by column_name) c from information_schema.columns where table_schema = 'public' and table_name = 'clients'
  and column_name in ('first_name','last_name','id_number','gender','phone','landline_phone','email','address','city','zip_code','mailing_address','spouse_first_name',
  'spouse_last_name','spouse_id_number','spouse_phone','spouse','spouse_name','family_status','marriage_year','tax_office_name','business_name','business_description',
  'businesses','bank_accounts','field_meta','portal_token','portal_token_expires_at','portal_token_last_used_at','type','updated_at','user_id')`);
ok('כל עמודות clients ש-247 קוראת/כותבת קיימות (31)', (cols?.c ?? '').split(',').length === 31, cols);

const checks = await readProd(`select conrelid::regclass::text t, conname, pg_get_constraintdef(oid) d from pg_constraint
  where conname in ('tax_fact_changes_source_check','onboarding_events_actor_check','smart_form_events_actor_check','smart_form_filings_template_key_check')`);
const def = (n) => checks.find(c => c.conname === n)?.d ?? '';
ok('tax_fact_changes.source מתיר prerequisite', def('tax_fact_changes_source_check').includes("'prerequisite'"), checks);
ok('onboarding_events.actor מתיר client', def('onboarding_events_actor_check') === '' || def('onboarding_events_actor_check').includes("'client'"), def('onboarding_events_actor_check'));
ok('smart_form_events.actor מתיר client ו-office', def('smart_form_events_actor_check').includes("'client'") && def('smart_form_events_actor_check').includes("'office'"));
ok(after ? 'template_key מתיר 4440/821' : 'template_key עדיין 6101 בלבד', after ? def('smart_form_filings_template_key_check').includes('vat-821') : !def('smart_form_filings_template_key_check').includes('vat-821'), def('smart_form_filings_template_key_check'));

// העוגנים — אותו טקסט כמו ב-247 (שורה אחת, פעם אחת)
const sql = readFileSync(new URL('../supabase/247-smart-client-forms.sql', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const anchor = (v) => { const m = sql.match(new RegExp(`${v} text := E'((?:[^']|'')*)';`)); return m[1].replace(/''/g, "'").split('\\n').join('\n'); };
const A = { _portal_step_items: anchor('a_psi'), _smart_form_sync_step: anchor('a_sync'), smart_form_start: anchor('a_start'), assert_domain_function_invariants: anchor('a_inv') };
for (const [fn, a] of Object.entries(A)) {
  const [{ d }] = await readProd(`select pg_get_functiondef(p.oid) d from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = '${fn}'`);
  const body = d.replace(/\r\n/g, '\n');
  const n = body.split(a).length - 1;
  // ‼ ב-assert העוגן מוחלף (פסיק + ארבעת השמות) — אחרי ההחלה הוא אינו קיים עוד בצורתו המקורית
  if (!(after && fn === 'assert_domain_function_invariants')) ok(`${fn}: העוגן נמצא פעם אחת`, n === 1, { n });
  else ok(`${fn}: ארבע פונקציות הדף ברשימת ה-anon`, body.includes("'portal_smart_form_get', 'portal_smart_form_save', 'portal_smart_form_prepare', 'portal_smart_form_sign'"));
  ok(`${fn}: ${after ? '247 הוחלה (סימון פעם אחת)' : '247 עוד לא הוחלה'}`, after ? body.split('247 ·').length - 1 === 1 : !body.includes('247 ·'));
}

const mine = await readProd(`select proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'
  and (proname like '\\_scf\\_%' or proname like 'portal\\_smart\\_form\\_%' or proname like 'smart\\_form\\_client\\_%' or proname in ('_smart_form_portal_item','_smart_form_sync_client_step'))`);
ok(after ? 'הפונקציות של 247 קיימות (20)' : 'אין עדיין פונקציות של 247', after ? mine.length === 20 : mine.length === 0, mine.map(m => m.proname));
const [fl] = await readProd(`select count(*)::int n from public.smart_form_filings where template_key <> 'btl-6101'`);
ok(after ? 'הגשות 4440/821 — (מידע)' : 'אין הגשות 4440/821', after || fl.n === 0, fl);
const [et] = await readProd(`select count(*)::int n from pg_event_trigger where evtname = 'p0_lock_new_functions' and evtenabled <> 'D'`);
ok('event trigger p0_lock_new_functions פעיל', et.n === 1);
const [mig] = await readProd(`select max(version) v from supabase_migrations.schema_migrations`);
console.log(`(רשומת המיגרציות האחרונה בייצור: ${mig.v})`);

console.log(`\n${pass} עברו, ${fail} נכשלו`);
process.exit(fail ? 1 : 0);
