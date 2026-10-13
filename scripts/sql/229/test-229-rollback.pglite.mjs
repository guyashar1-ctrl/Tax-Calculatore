// בדיקת ההתאוששות מ-229 בבידוד: 222 → (md5 לפני) → 229 → rollback → md5 אחרי חייב להיות זהה; הטבלאות והפונקציות נעלמו.
//   PGLITE_DIR=<tmp> node scripts/sql/229/test-229-rollback.pglite.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join, resolve } from 'node:path';
const { PGlite } = await import(pathToFileURL(join(process.env.PGLITE_DIR ?? '.', 'node_modules/@electric-sql/pglite/dist/index.js')).href);
const WT = resolve(fileURLToPath(import.meta.url), '../../../..') + '/';
const sql229 = readFileSync(WT + 'supabase/229-tax-year-collection.sql', 'utf8');
const rb = readFileSync(WT + 'scripts/sql/229/rollback-229-staging.sql', 'utf8');
const sql222 = readFileSync(WT + 'supabase/222-request-preview.sql', 'utf8').replace(/\r\n/g, '\n');
const psi = sql222.slice(sql222.indexOf('-- >>> GENERATED:portal_step_items'), sql222.indexOf('-- <<< GENERATED:portal_step_items'));
const t = readFileSync(WT + 'scripts/sql/229/test-229-tax-year.pglite.mjs', 'utf8');
const setup = t.slice(t.indexOf('await db.exec(`') + 'await db.exec(`'.length, t.indexOf('`);\nawait db.exec(psi);')).replaceAll('${OFFICE}', '11111111-1111-1111-1111-111111111111').replaceAll('${OTHER}', '22222222-2222-2222-2222-222222222222');
const db = new PGlite();
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m); };
const one = async s => (await db.query(s)).rows[0];
const SIG = `'public._portal_step_items(public.onboarding_steps, public.clients, public.profiles, public.representation_requests, jsonb, jsonb)'::regprocedure`;
await db.exec(setup);
await db.exec(`alter table public.onboarding_steps add constraint onboarding_steps_step_type_check check (step_type = any (array['representation','custom_request','business_details']))`);
await db.exec(psi);
await db.exec(`create function public._client_announceable_steps(p_client_id text) returns table(step_id text, step_type text) language sql stable as $f$
  select s.id, s.step_type from public.onboarding_steps s
   where s.client_id = p_client_id
     and s.step_type in ('client_documents', 'custom_request',
                         'business_details')
     and (s.step_type <> 'business_details' or coalesce(s.ball, 'client') = 'client')
$f$;
create function public._client_step_portal_key(p_step_id text, p_step_type text) returns text language sql immutable as $f$
  select case p_step_type
           when 'custom_request' then 'custom_' || p_step_id
           when 'rep_client_approval' then 'rep_approval'
         end
$f$;`);
const md = async (sig) => (await one(`select md5(pg_get_functiondef('${sig}'::regprocedure)) m`)).m;
const annBefore = await md('public._client_announceable_steps(text)'), keyBefore = await md('public._client_step_portal_key(text, text)');
const before = (await one(`select md5(pg_get_functiondef(${SIG})) m`)).m;
const idxBefore = (await one(`select indexdef from pg_indexes where indexname='onboarding_steps_person_type_idx'`)).indexdef;
await db.exec(sql229);
ok((await one(`select position('info_collection' in pg_get_functiondef(${SIG})) > 0 as y`)).y, 'אחרי 229: הענף הוזרק');
await db.exec(`insert into public.onboarding_steps (user_id, client_id, step_type, track, scope, payload) values ('11111111-1111-1111-1111-111111111111','c1','tax_estimate','internal','person','{"taxYear":2026}')`);
await db.exec(sql229); // החלה חוזרת — לא מכפילה
ok((await one(`select (length(pg_get_functiondef(${SIG})) - length(replace(pg_get_functiondef(${SIG}), 'when ''info_collection''', ''))) / length('when ''info_collection''') as n`)).n === 1, 'החלה חוזרת של 229: הענף פעם אחת');
await db.exec(rb.replace(/^begin;$/m, '').replace(/^commit;$/m, ''));
ok((await one(`select md5(pg_get_functiondef(${SIG})) m`)).m === before, 'אחרי ההתאוששות: _portal_step_items זהה בדיוק למה שהיה');
ok(await md('public._client_announceable_steps(text)') === annBefore && await md('public._client_step_portal_key(text, text)') === keyBefore, 'סעיף 12 בוטל: שתי הפונקציות של «שלח בקשות» זהות למה שהיו');
ok((await one(`select count(*)::int n from pg_tables where tablename in ('tax_year_facts','tax_evidence','tax_info_asks','tax_card_transfers')`)).n === 0, 'הטבלאות נמחקו');
ok((await one(`select count(*)::int n from pg_proc where proname in ('ensure_tax_year_request','portal_submit_tax_info','_portal_client','_tax_year_items')`)).n === 0, 'הפונקציות נמחקו');
ok((await one(`select count(*)::int n from public.onboarding_steps where step_type='tax_estimate'`)).n === 0, 'בקשות שנת מס נמחקו');
const idxAfter = (await one(`select indexdef from pg_indexes where indexname='onboarding_steps_person_type_idx'`)).indexdef;
ok(idxAfter.replace(/\s+/g, ' ') === idxBefore.replace(/\s+/g, ' ') || idxAfter.includes("'business_details'") && !idxAfter.includes('tax_estimate'), 'אינדקס 220 חזר (בלי סוגי 229)');
console.log(`\n${pass} עברו, ${fail} נכשלו`); process.exit(fail ? 1 : 0);
