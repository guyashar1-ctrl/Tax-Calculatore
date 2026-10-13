// בדיקת ההתאוששות מ-236 בבידוד: 229 → 230 → טביעות → 236 (+ נתוני קליטה) → rollback → אותן טביעות.
//   PGLITE_DIR=<tmp> node scripts/sql/236/test-236-rollback.pglite.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join, resolve } from 'node:path';
const { PGlite } = await import(pathToFileURL(join(process.env.PGLITE_DIR ?? '.', 'node_modules/@electric-sql/pglite/dist/index.js')).href);
const WT = resolve(fileURLToPath(import.meta.url), '../../../..') + '/';
const read = (f) => readFileSync(WT + f, 'utf8');
const sql222 = read('supabase/222-request-preview.sql').replace(/\r\n/g, '\n');
const psi = sql222.slice(sql222.indexOf('-- >>> GENERATED:portal_step_items'), sql222.indexOf('-- <<< GENERATED:portal_step_items'));
const t229 = read('scripts/sql/229/test-229-tax-year.pglite.mjs');
const OFFICE = '11111111-1111-1111-1111-111111111111', OTHER = '22222222-2222-2222-2222-222222222222';
const setup = t229.slice(t229.indexOf('await db.exec(`') + 'await db.exec(`'.length, t229.indexOf('`);\nawait db.exec(psi);'))
  .replaceAll('${OFFICE}', OFFICE).replaceAll('${OTHER}', OTHER);

const db = new PGlite();
let pass = 0, fail = 0;
const ok = (c, m, info = '') => { c ? pass++ : fail++; console.log(`${c ? '  ✓' : '  ✗'} ${m}${!c && info ? ` — ${info}` : ''}`); };
const one = async (s, p) => (await db.query(s, p)).rows[0];
const prints = async () => ({
  add: (await one(`select md5(pg_get_functiondef('public.add_tax_info_asks(text, jsonb)'::regprocedure)) m`)).m,
  submit: (await one(`select md5(pg_get_functiondef('public.portal_submit_tax_info(text, uuid, jsonb)'::regprocedure)) m`)).m,
  items: (await one(`select md5(pg_get_functiondef('public._tax_year_items()'::regprocedure)) m`)).m,
  check: (await one(`select md5(pg_get_constraintdef(oid)) m from pg_constraint where conname = 'onboarding_steps_step_type_check'`)).m,
  idx: (await one(`select md5(indexdef) m from pg_indexes where indexname = 'onboarding_steps_person_type_idx'`)).m,
  gen: (await one(`select md5(pg_get_functiondef('public.add_intake_questionnaire_step(text)'::regprocedure)) m`)).m,
  start: (await one(`select md5(pg_get_functiondef('public.start_intake(text)'::regprocedure)) m`)).m,
  save: (await one(`select md5(pg_get_functiondef('public.save_intake_answer(text, uuid, text, jsonb, jsonb, text, boolean)'::regprocedure)) m`)).m,
  reopen: (await one(`select md5(pg_get_functiondef('public.reopen_intake(text)'::regprocedure)) m`)).m,
});

await db.exec(setup);
await db.exec(`create table public.documents (id text primary key, client_id text not null);
  create table public.tax_fact_changes (id uuid primary key, client_id text, field_key text, source text, status text);`);
await db.exec(psi);
await db.exec(read('scripts/sql/236/legacy-stubs.sql'));
await db.exec(read('supabase/229-tax-year-collection.sql'));
await db.exec(read('supabase/230-wealth-declaration-collection.sql'));
const before = await prints();
await db.exec(read('supabase/236-tax-file-intake.sql'));
const mid = await prints();
ok(mid.add !== before.add && mid.submit !== before.submit && mid.items !== before.items && mid.gen !== before.gen && mid.start !== before.start && mid.save !== before.save && mid.reopen !== before.reopen, '236 שינתה את מה שציפינו (האילוץ והאינדקס זהים — 230 כבר כוללת את סוג הקליטה)');
await db.exec(`select set_config('request.jwt.claim.sub', '${OFFICE}', false)`);
const w = (await one(`select public.ensure_tax_file_intake('c1') r`)).r;
const ad = (await one(`select public.add_tax_info_asks($1, $2) r`, [w.stepId, JSON.stringify([{ itemKey: 'intake.idCard', subjectRole: 'client', prompt: { title: 'ת.ז.', input: { kind: 'file', docKind: 'idCard' } } }])])).r;
await db.query(`insert into public.tax_year_facts (user_id, client_id, tax_year, item_key, subject_role, period_kind, period_to, answer, value, basis, source, status) values ($1, 'c1', 2026, 'intake.crypto', 'couple', 'as_of', '2026-10-12', 'no', null, 'actual', 'portal', 'pending')`, [OFFICE]);
await db.query(`insert into public.tax_evidence (user_id, client_id, tax_year, doc_kind, subject_role, received_via, ask_id) select $1, 'c1', 2026, 'idCard', 'client', 'portal', id from public.tax_info_asks where item_key = 'intake.idCard'`, [OFFICE]);
ok(ad.ok, 'נתוני קליטה לבדיקה נוצרו');
await db.exec(read('scripts/sql/236/rollback-236.sql'));
const after = await prints();
for (const k of Object.keys(before)) ok(after[k] === before[k], `אחרי ההתאוששות: ${k} זהה למצב שאחרי 230`, `${before[k]} ≠ ${after[k]}`);
ok((await one(`select count(*)::int n from public.onboarding_steps where step_type in ('tax_file_intake') or (step_type = 'info_collection' and payload->>'purpose' = 'intake')`)).n === 0, 'בקשות הקליטה נמחקו');
ok((await one(`select count(*)::int n from public.tax_info_asks where item_key like 'intake.%'`)).n === 0 && (await one(`select count(*)::int n from public.tax_year_facts where item_key like 'intake.%'`)).n === 0 && (await one(`select count(*)::int n from public.tax_evidence where doc_kind = 'idCard'`)).n === 0, 'שאלות, תשובות וראיות של הקליטה נמחקו');
ok((await one(`select count(*)::int n from pg_proc where proname in ('ensure_tax_file_intake', 'replace_legacy_intake', 'intake_replaced_state', '_legacy_intake_replaced')`)).n === 0, 'הפונקציות של 236 הוסרו (פתיחה והחלפת השאלון הישן)');
// 229 ו-230 ממשיכות לעבוד
const te = (await one(`select public.ensure_tax_year_request('c1', 'annual', 2025, null) r`)).r;
const add = (await one(`select public.add_tax_info_asks($1, $2) r`, [te.stepId, JSON.stringify([{ itemKey: 'donations.given', subjectRole: 'client', prompt: { title: 'תרמת?', input: { kind: 'yesno' } } }])])).r;
ok(te.ok && add.ok && add.added === 1, 'שנת מס (229) ממשיכה לעבוד אחרי ההתאוששות', JSON.stringify(add));
const wd = (await one(`select public.ensure_wealth_declaration('c1', '2025-12-31', null) r`)).r;
const wa = (await one(`select public.add_tax_info_asks($1, $2) r`, [wd.stepId, JSON.stringify([{ itemKey: 'wealth.cash', subjectRole: 'couple', prompt: { title: 'מזומן', input: { kind: 'amount' } } }])])).r;
ok(wd.ok && wa.ok && wa.added === 1, 'הצהרת הון (230) ממשיכה לעבוד אחרי ההתאוששות', JSON.stringify(wa));


console.log(`\n${pass} עברו, ${fail} נכשלו`);
process.exit(fail ? 1 : 0);
