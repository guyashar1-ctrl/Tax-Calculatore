// בדיקת ההתאוששות מ-230 בבידוד: 229 → טביעות → 230 (+ נתוני הון) → rollback → אותן טביעות.
//   PGLITE_DIR=<tmp> node scripts/sql/230/test-230-rollback.pglite.mjs
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
});

await db.exec(setup);
await db.exec(`create table public.documents (id text primary key, client_id text not null);
  create table public.tax_fact_changes (id uuid primary key, client_id text, field_key text, source text, status text);`);
await db.exec(psi);
await db.exec(read('supabase/229-tax-year-collection.sql'));
const before = await prints();
await db.exec(read('supabase/230-wealth-declaration-collection.sql'));
const mid = await prints();
ok(mid.add !== before.add && mid.submit !== before.submit && mid.items !== before.items, '230 שינתה את מה שציפינו (האילוץ והאינדקס זהים מאז 12.10 — 229 כוללת את כל הסוגים)');
await db.exec(`select set_config('request.jwt.claim.sub', '${OFFICE}', false)`);
const w = (await one(`select public.ensure_wealth_declaration('c1', '2025-12-31', null) r`)).r;
await one(`select public.add_tax_info_asks($1, $2) r`, [w.stepId, JSON.stringify([{ itemKey: 'wealth.cash', subjectRole: 'couple', prompt: { title: 'מזומן', input: { kind: 'amount' } } }])]);
await db.exec(read('scripts/sql/230/rollback-230-staging.sql'));
const after = await prints();
for (const k of Object.keys(before)) ok(after[k] === before[k], `אחרי ההתאוששות: ${k} זהה למצב שאחרי 229`, `${before[k]} ≠ ${after[k]}`);
ok((await one(`select count(*)::int n from public.onboarding_steps where step_type = 'wealth_declaration'`)).n === 0, 'הכנות להצהרת הון נמחקו');
ok((await one(`select count(*)::int n from pg_proc where proname in ('ensure_wealth_declaration','update_wealth_declaration','_wealth_min_due')`)).n === 0, 'פונקציות 230 הוסרו');
ok((await one(`select count(*)::int n from public.tax_info_asks where item_key like 'wealth.%'`)).n === 0, 'שאלות הון נמחקו');
// 229 עדיין עובדת
const te = (await one(`select public.ensure_tax_year_request('c1', 'estimate', 2026, 9) r`)).r;
const add = (await one(`select public.add_tax_info_asks($1, $2) r`, [te.stepId, JSON.stringify([{ itemKey: 'donations.given', subjectRole: 'client', prompt: { title: 'תרמת?', input: { kind: 'yesno' } } }])])).r;
ok(te.ok && add.ok && add.added === 1, 'שנת מס (229) ממשיכה לעבוד אחרי ההתאוששות', JSON.stringify(add));
console.log(`\n${pass} עברו, ${fail} נכשלו`);
process.exit(fail ? 1 : 0);
