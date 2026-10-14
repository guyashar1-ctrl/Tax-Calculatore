// 232 מול הגוף שבייצור: «שלח בקשות» (_client_announceable_steps) ומפתח הדף (_client_step_portal_key)
// כפי שצולמו מהייצור ב-13.10.2026 (prod-functions-2026-10-13.sql), אחרי 239 שהכניסה שורה באמצע.
//   PGLITE_DIR=<tmp> node scripts/sql/232/test-232-prod-anchor.pglite.mjs
// ‼ הבדיקה מריצה את בלוק ההזרקה של 232 עצמו (מהקובץ), עם check_function_bodies פעיל — כך גוף שבור נכשל כאן.
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join, resolve } from 'node:path';
const { PGlite } = await import(pathToFileURL(join(process.env.PGLITE_DIR ?? '.', 'node_modules/@electric-sql/pglite/dist/index.js')).href);
const WT = resolve(fileURLToPath(import.meta.url), '../../../..') + '/';
const read = (f) => readFileSync(WT + f, 'utf8').replace(/\r\n/g, '\n');
const sql232 = read('supabase/232-tax-estimate-publish.sql');
const block = sql232.slice(sql232.indexOf('do $p232b$'), sql232.indexOf('$p232b$;', sql232.indexOf('do $p232b$') + 10) + '$p232b$;'.length);

const db = new PGlite();
let pass = 0, fail = 0;
const ok = (c, m, info = '') => { c ? pass++ : fail++; console.log(`${c ? '  ✓' : '  ✗'} ${m}${!c && info ? ` — ${info}` : ''}`); };
const q = async (s, p) => (await db.query(s, p)).rows;

await db.exec(`
  create table public.onboarding_steps (id text primary key, client_id text, step_type text, status text, published_at timestamptz,
    client_content_version int default 1, payload jsonb default '{}'::jsonb, flow_run_id text, flow_stage_key text,
    pending_sort_order int, sort_order int, created_at timestamptz default now(), pending_cancel boolean, ball text);
  create table public.client_step_notice_state (step_id text primary key, announced_version int, announced_at timestamptz,
    reminder_count int, last_reminded_at timestamptz, reminder_backoff_until timestamptz);
  create table public.flow_runs (id text primary key, status text);
  create table public.tax_estimates (id text primary key, request_id text, status text, published_at timestamptz);
  create function public._client_step_title(t text, p jsonb) returns text language sql as $$ select t $$;
  create function public.client_step_gate_open(c text, p timestamptz) returns boolean language sql as $$ select true $$;
  create function public._rep_signing_open(c text) returns boolean language sql as $$ select false $$;
  set check_function_bodies = on;
`);
await db.exec(read('scripts/sql/232/prod-functions-2026-10-13.sql'));
const before = (await q(`select pg_get_functiondef('public._client_announceable_steps(text)'::regprocedure) d`))[0].d;

await db.exec(block);
const after = (await q(`select pg_get_functiondef('public._client_announceable_steps(text)'::regprocedure) d`))[0].d;
ok(after.includes("'tax_estimate')") && after.includes('232 · הערכת מס'), 'הענף נוסף לרשימה');
ok(after.includes("(s.step_type <> 'representation' or public._rep_signing_open(s.client_id))"), 'השורה של 239 נשארה במקומה');
ok(after.replace(/\s+/g, ' ').length > before.replace(/\s+/g, ' ').length, 'שום דבר לא נמחק');
const key = (await q(`select public._client_step_portal_key('s9', 'tax_estimate') k, public._client_step_portal_key('s8', 'info_collection') i, public._client_step_portal_key('s7', 'representation') r`))[0];
ok(key.k === 'taxest_s9' && key.i === 'taxinfo_s8' && key.r === 'rep_sign', 'מפתח הדף: הערכה, השלמת מידע וחתימה', JSON.stringify(key));

await db.exec(`
  insert into public.onboarding_steps (id, client_id, step_type, status, published_at, ball) values
    ('e1', 'c1', 'tax_estimate', 'in_progress', now(), 'office'),
    ('e2', 'c1', 'tax_estimate', 'in_progress', now(), 'office'),
    ('i1', 'c1', 'info_collection', 'in_progress', now(), 'client'),
    ('r1', 'c1', 'representation', 'in_progress', now(), 'client');
  insert into public.tax_estimates values ('v1', 'e1', 'approved', now()), ('v2', 'e2', 'approved', null);`);
const ids = (await q(`select step_id from public._client_announceable_steps('c1') order by step_id`)).map(r => r.step_id);
ok(ids.includes('e1'), 'הערכה מאושרת ומפורסמת נספרת', ids.join(','));
ok(!ids.includes('e2'), 'הערכה שאושרה ולא פורסמה — לא נספרת', ids.join(','));
ok(ids.includes('i1'), '«השלמת מידע» אצל הלקוח — עדיין נספרת', ids.join(','));
ok(!ids.includes('r1'), 'חתימה כשהחתימה סגורה — עדיין לא נספרת (239)', ids.join(','));

await db.exec(block);
const again = (await q(`select pg_get_functiondef('public._client_announceable_steps(text)'::regprocedure) d`))[0].d;
ok(again === after, 'החלה חוזרת לא משנה');

console.log(`\n${pass} עברו, ${fail} נכשלו`);
process.exit(fail ? 1 : 0);
