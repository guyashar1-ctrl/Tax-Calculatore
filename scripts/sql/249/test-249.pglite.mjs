// בדיקת מיגרציה 249 בבידוד — PGlite: «פרסם בדף» (publish_case_changes) מפרסם גם את שאלות תיק המס.
//   PGLITE_DIR=<תיקייה עם node_modules/@electric-sql/pglite> node scripts/sql/249/test-249.pglite.mjs
// מה נבדק: (0) הגוף של 216 משחזר את הבאג; (1) שאלון עם טיוטת שאלות — השאלות מתפרסמות והבקשה נחשפת, פעם אחת;
// (2) שאלון בלי שאלות — לא נחשף; (3) שאלון שכבר בדף ונוספה לו שאלה — יוצאת באותה לחיצה, גרסת התוכן עולה;
// (4) בקשה רגילה — כמו קודם; (5) לחיצה שנייה — אין עוד מה לפרסם; (6) משרד אחר — אסור; (7) 249ב — רשימת הפריטים;
// (8) 249ג — שנות המצב המשפחתי נכתבות דרך _tax_fact_field_op (הגוף של 94), נעשות «מנוהלות», החלה חוזרת לא משנה, והחזרה מוציאה רק אותן.
// ‼ publish_tax_info נטען מהקובץ של 229 כמות שהוא; publish_case_changes — מ-216 ומ-249 כמות שהם.
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join, resolve } from 'node:path';
const { PGlite } = await import(pathToFileURL(join(process.env.PGLITE_DIR ?? '.', 'node_modules/@electric-sql/pglite/dist/index.js')).href);
const WT = resolve(fileURLToPath(import.meta.url), '../../../..') + '/';
// ‼ CRLF בעותקי pivo-wt — מנרמלים כל קריאה (worktree-crlf-breaks-pglite-harness)
const read = (p) => readFileSync(WT + p, 'utf8').replace(/\r\n/g, '\n');
const fnFrom = (file, name, endRe) => {
  const s = read(file); const a = s.indexOf(`create or replace function public.${name}(`);
  if (a < 0) throw new Error(`${name} לא נמצאה ב-${file}`);
  const m = endRe.exec(s.slice(a)); if (!m) throw new Error(`סוף ${name} לא נמצא`);
  return s.slice(a, a + m.index + m[0].length);
};
const PTI = fnFrom('supabase/229-tax-year-collection.sql', 'publish_tax_info', /\nend \$\$;/);
const PCC216 = fnFrom('supabase/216-flows-onboarding-integration.sql', 'publish_case_changes', /\n\$function\$;/);
const M249 = read('supabase/249-publish-page-publishes-tax-questions.sql');
const FFO94 = fnFrom('supabase/94-institution-alignment-fidelity.sql', '_tax_fact_field_op', /\n\$function\$;/);
const RB = read('scripts/sql/249/rollback-249.sql');
const RB249C = RB.slice(RB.indexOf('-- ── 249ג'));
const M249C = M249.slice(M249.indexOf('do $p249c$'));
const OFFICE = '11111111-1111-1111-1111-111111111111', OTHER = '22222222-2222-2222-2222-222222222222';

let pass = 0, fail = 0;
const ok = (c, m, info = '') => { c ? pass++ : fail++; console.log(`${c ? '  ✓' : '  ✗'} ${m}${!c && info ? ` — ${info}` : ''}`); };

async function fresh(pcc) {
  const db = new PGlite();
  await db.exec(`
    do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
    do $$ begin create role anon; exception when duplicate_object then null; end $$;
    create schema if not exists auth;
    create function auth.uid() returns uuid language sql stable as $f$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $f$;
    create function public.is_authorized() returns boolean language sql stable as $f$ select true $f$;
    create table public.clients (id text primary key, user_id uuid not null, field_meta jsonb, marriage_year int, divorce_year int, widowhood_year int, aliyah_year int);
    create table public.engagements (id text primary key, client_id text, status text, process_published_at timestamptz);
    create table public.onboarding_steps (id text primary key, user_id uuid not null, client_id text not null, engagement_id text,
      step_type text not null, status text not null, ball text, published_at timestamptz, payload jsonb not null default '{}'::jsonb,
      draft_payload jsonb, pending_sort_order int, sort_order int, pending_cancel boolean not null default false,
      client_content_version int not null default 1, updated_at timestamptz default now());
    create table public.tax_info_asks (id text primary key, step_id text not null, state text not null default 'draft');
    create table public.ev (step_id text, note text, meta jsonb);
    create function public.requests_held_until_approval(p text) returns boolean language sql as $f$ select false $f$;
    create function public.publish_onboarding_process(p text) returns jsonb language sql as $f$ select '{"ok":true,"alreadyPublished":true}'::jsonb $f$;
    create function public.merge_step_draft(a jsonb, b jsonb) returns jsonb language sql as $f$ select a || b $f$;
    create function public.log_onboarding_event(u uuid, sid text, eid text, t text, actor text, note text, meta jsonb) returns void
      language sql as $f$ insert into public.ev values (sid, note, meta) $f$;
    create function public._set_step_status(sid text, st text, actor text, note text, meta jsonb) returns void
      language sql as $f$ update public.onboarding_steps set status = st where id = sid $f$;
    create function public.execute_automatic_step(sid text) returns jsonb language sql as $f$ select '{"ok":false}'::jsonb $f$;
    create function public._tax_year_client(p_client_id text) returns public.clients language plpgsql stable security definer set search_path to 'public' as $f$
    declare c public.clients%rowtype;
    begin
      select * into c from public.clients where id = p_client_id;
      if c.id is null or c.user_id <> auth.uid() or not public.is_authorized() then raise exception 'forbidden' using errcode = '42501'; end if;
      return c;
    end $f$;
    insert into public.clients values ('c1', '${OFFICE}');
    -- (1) שאלון בטיוטה עם שתי שאלות · (2) שאלון בלי שאלות · (3) שאלון שכבר בדף + שאלה חדשה בטיוטה · (4) בקשה רגילה בטיוטה
    insert into public.onboarding_steps (id, user_id, client_id, step_type, status, ball, published_at) values
      ('i1', '${OFFICE}', 'c1', 'info_collection', 'pending', 'me', null),
      ('i2', '${OFFICE}', 'c1', 'info_collection', 'pending', 'me', null),
      ('i3', '${OFFICE}', 'c1', 'info_collection', 'in_progress', 'me', now() - interval '2 days'),
      ('r1', '${OFFICE}', 'c1', 'custom_request', 'pending', 'client', null);
    insert into public.tax_info_asks values ('a1', 'i1', 'draft'), ('a2', 'i1', 'draft'), ('a3', 'i3', 'answered'), ('a4', 'i3', 'draft');
  `);
  await db.exec(FFO94);
  await db.exec(PTI);
  await db.exec(pcc);
  return db;
}
const as = (db, uid) => db.exec(`select set_config('request.jwt.claim.sub', '${uid}', false)`);
const rpc = async (db) => (await db.query(`select public.publish_case_changes('c1') as r`)).rows[0].r;
const step = async (db, id) => (await db.query(`select status, ball, published_at, client_content_version from public.onboarding_steps where id = $1`, [id])).rows[0];
const asks = async (db, sid) => (await db.query(`select id, state from public.tax_info_asks where step_id = $1 order by id`, [sid])).rows.map(r => `${r.id}:${r.state}`).join(',');

console.log('▶ 216 (לפני) — משחזר את הבאג');
{
  const db = await fresh(PCC216); await as(db, OFFICE);
  await rpc(db);
  ok(!!(await step(db, 'i1')).published_at && (await asks(db, 'i1')) === 'a1:draft,a2:draft', '216: השאלון סומן כמפורסם, והשאלות נשארו טיוטה (הבאג)', await asks(db, 'i1'));
  ok(!!(await step(db, 'i2')).published_at, '216: גם שאלון בלי שאלות נחשף');
}

console.log('▶ 249 (אחרי)');
{
  const db = await fresh(M249); await as(db, OFFICE);
  const r = await rpc(db);
  ok(r.ok === true, 'פרסום הצליח', JSON.stringify(r));
  const i1 = await step(db, 'i1');
  ok(!!i1.published_at && i1.status === 'waiting_client' && i1.ball === 'client' && (await asks(db, 'i1')) === 'a1:published,a2:published', '(1) שאלון בטיוטה: השאלות פורסמו, הבקשה נחשפה וממתינה ללקוח', JSON.stringify(i1) + ' ' + await asks(db, 'i1'));
  ok((await db.query(`select count(*)::int n from public.ev where step_id = 'i1' and note = 'הבקשה נפתחה ללקוח'`)).rows[0].n === 1, '(1) נרשם ביומן פעם אחת («הבקשה נפתחה ללקוח»)');
  const i2 = await step(db, 'i2');
  ok(i2.published_at === null && i2.status === 'pending', '(2) שאלון בלי שאלות — לא נחשף (לא כרטיס ריק)', JSON.stringify(i2));
  const i3 = await step(db, 'i3');
  ok((await asks(db, 'i3')) === 'a3:answered,a4:published' && i3.client_content_version === 2 && i3.status === 'waiting_client', '(3) שאלון שכבר בדף: השאלה החדשה פורסמה, גרסת התוכן עלתה, התשובה הקודמת לא נגעה', JSON.stringify(i3) + ' ' + await asks(db, 'i3'));
  ok(!!(await step(db, 'r1')).published_at, '(4) בקשה רגילה — נחשפת כמו קודם');
  ok(r.taxQuestionsPublished === 3 && r.draftsExposed === 2, `ספירות: 3 שאלות, 2 בקשות נחשפו (שאלון + בקשה רגילה)`, JSON.stringify(r));
  const r2 = await rpc(db);
  ok(r2.ok === true && r2.taxQuestionsPublished === 0 && r2.draftsExposed === 0, '(5) לחיצה שנייה — אין עוד מה לפרסם, שום דבר לא כפול', JSON.stringify(r2));
  await as(db, OTHER);
  const r3 = await rpc(db);
  ok(r3.ok === false && r3.error === 'forbidden', '(6) משרד אחר — אסור', JSON.stringify(r3));
  // (7) 249ב — רשימת הפריטים: חמשת פריטי דמי הלידה, וכל הפריטים של 241 נשארו עם אותו סוג
  const items = (await db.query(`select public._tax_year_items() as i`)).rows[0].i;
  const mat = ['niBenefits.maternity', 'niBenefits.maternityPeriod', 'niBenefits.maternityAmounts', 'niBenefits.maternityNotice', 'niBenefits.maternitySpread'];
  ok(mat.every(k => k in items) && items['niBenefits.maternitySpread'] === 'detail', '(7) 249ב: חמשת פריטי דמי הלידה ברשימה', JSON.stringify(mat.map(k => items[k])));
  const fy = ['intake.marriageYear', 'intake.divorceYear', 'intake.widowhoodYear'];
  ok(fy.every(k => items[k] === 'detail'), '(7) 249ב: שלוש שאלות «ממתי» (קליטה) ברשימה');
  const rb = read('scripts/sql/249/rollback-249.sql'); const at = rb.indexOf('function public._tax_year_items()'); const a = rb.indexOf("select '", at) + 8; const b = rb.indexOf("'::jsonb", a);
  const old = JSON.parse(rb.slice(a, b).replace(/''/g, "'"));
  ok(Object.entries(old).every(([k, v]) => items[k] === v) && Object.keys(items).length === Object.keys(old).length + 8, `(7) כל ${Object.keys(old).length} הפריטים של 241 נשארו עם אותו סוג; נוספו 8 בדיוק`);
}

console.log('▶ 249ג — שנות המצב המשפחתי כעובדות מנוהלות');
{
  const db = await fresh(M249);
  await db.exec(`create or replace function public._governed_client_columns() returns text[] language sql stable as $g$
    select coalesce(array_agg(distinct m[1]), '{}'::text[]) from regexp_matches(pg_get_functiondef('public._tax_fact_field_op'::regproc), 'update public\\.clients set (\\w+) =', 'g') as m $g$`);
  const op = async (key, write, value) => (await db.query(`select (r).out_ok ok, (r).out_current cur from (select public._tax_fact_field_op('c1', $1, $2, $3::jsonb, 'questionnaire') r) x`,
    [key, write, value === undefined ? null : JSON.stringify(value)])).rows[0];
  const row = async () => (await db.query(`select marriage_year, divorce_year, widowhood_year, field_meta from public.clients where id = 'c1'`)).rows[0];
  ok((await op('marriageYear', true, 2015)).ok === true && (await row()).marriage_year === 2015, '(8) marriageYear נכתב (2015)', JSON.stringify(await row()));
  ok((await row()).field_meta?.marriageYear?.source === 'questionnaire', '(8) נרשם מקור ב-field_meta (כמו כל עובדה)', JSON.stringify((await row()).field_meta));
  await op('divorceYear', true, 2021); await op('widowhoodYear', true, 2019);
  const r2 = await row();
  ok(r2.divorce_year === 2021 && r2.widowhood_year === 2019, '(8) divorceYear / widowhoodYear נכתבים', JSON.stringify(r2));
  await op('marriageYear', true, '');
  ok((await row()).marriage_year === null, '(8) ריק ⇒ NULL');
  ok((await op('aliyahYear', true, 2001)).ok === true && (await op('noSuchKey', false)).ok === false, '(8) ענפים קיימים לא נפגעו; מפתח לא מוכר — עדיין נדחה');
  const gov = async () => (await db.query(`select array(select g from unnest(public._governed_client_columns()) g where g like '%_year' order by g) g`)).rows[0].g;
  const g1 = await gov();
  ok(['divorce_year', 'marriage_year', 'widowhood_year'].every(c => g1.includes(c)), `(8) שלוש העמודות «מנוהלות» (${g1.join(', ')}) ⇒ חייבות להיות ב-GOVERNED_FACT_KEYS בדפדפן`);
  const def = async () => (await db.query(`select pg_get_functiondef('public._tax_fact_field_op(text, text, boolean, jsonb, text)'::regprocedure) d`)).rows[0].d;
  const d1 = await def(); await db.exec(M249C);
  ok((await def()) === d1, '(8) החלה חוזרת — הגוף לא השתנה');
  await db.exec(RB249C);
  const d2 = await def(); const g2 = await gov();
  ok(!/'(marriage|divorce|widowhood)Year'/.test(d2) && d2.includes("when 'aliyahYear'") && !g2.some(c => /^(marriage|divorce|widowhood)_year$/.test(c)), '(8) החזרה מוציאה רק את שלושת הענפים — והן לא «מנוהלות» יותר');
  await db.exec(RB249C);
  ok((await def()) === d2, '(8) החזרה פעמיים — בלי שינוי');
}
console.log(`\n${pass} עברו, ${fail} נכשלו`);
process.exit(fail ? 1 : 0);
