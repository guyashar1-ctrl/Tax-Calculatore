#!/usr/bin/env node
/**
 * staging-test-job-followups-270.mjs — «הפעל הכול»: משימה שממתינה לקודמת מאותו סוג (270).
 *
 *  F1  הקודמת פתוחה ⇒ «המשך» נשמר (waiting), לא נוצרת משימה.
 *  F2  לחיצה כפולה לאותו אדם ⇒ אותו «המשך», לא שניים.
 *  F3  הקודמת הצליחה ⇒ ה«המשך» נכנס לתור (queued), max_attempts כמו create_automation_job.
 *  F4  הקודמת כבר סגורה ⇒ נכנס לתור מיד.
 *  F5  «ממתין לך» ואז ביטול (= «כן, נסה שוב») ⇒ לא משוחרר; המשימה החדשה של אותו אדם
 *      מקבלת את ה«המשך», וכשהיא נכשלת — ה«המשך» משוחרר.
 *  F6  אותו אדם הופעל ידנית בינתיים ⇒ skipped («כבר הופעל ידנית»), בלי משימה שנייה.
 *  F7  ביטול «המשך» ממתין — רק שלו; ואי אפשר לבטל פעמיים.
 *  F8  anon לא קורא ולא יוצר.
 *
 * ‼ הכול בטרנזקציה אחת שנגמרת ב-raise — staging חוזר בדיוק למה שהיה (אין ניקוי, אין
 *   משימה שמגיעה לעובד). סוג הפעולה מדומה (qa.followup_test) — שום טריגר של רשות לא נוגע.
 * הרצה:  node scripts/staging-test-job-followups-270.mjs
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ROOT, STAGING_REF, loadEnv } from './staging-lib.mjs';

const TOKEN = loadEnv().SUPABASE_ACCESS_TOKEN;
const USER_ID = readFileSync(resolve(ROOT, 'STAGING_USER_ID'), 'utf8').trim();

const SCRIPT = `
do $t$
declare
  v_out  text := '';
  v_cid  text := 'qa270-' || replace(gen_random_uuid()::text, '-', '');
  a      jsonb; r jsonb; f jsonb;
  v_a    text; v_a2 text; v_n int; v_st text; v_max int;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', '${USER_ID}', 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', '${USER_ID}', true);
  insert into public.clients (id, user_id, first_name, last_name) values (v_cid, '${USER_ID}', 'בדיקה', 'QA270');

  -- F1
  a := public.create_automation_job(v_cid, 'qa.followup_test', '{"role":"client"}');
  v_a := a->'job'->>'id';
  r := public.create_automation_job_after(v_cid, 'qa.followup_test', '{"role":"spouse"}', v_a);
  v_out := v_out || format('F1 waiting=%s|', r->'followup'->>'status' = 'waiting' and (r->>'created')::boolean);
  select count(*) into v_n from public.automation_jobs where client_id = v_cid;
  v_out := v_out || format('F1 one_job=%s|', v_n = 1);

  -- F2
  f := public.create_automation_job_after(v_cid, 'qa.followup_test', '{"role":"spouse"}', v_a);
  v_out := v_out || format('F2 same=%s|', f->'followup'->>'id' = r->'followup'->>'id' and not (f->>'created')::boolean);

  -- F3
  update public.automation_jobs set status = 'succeeded', finished_at = now() where id = v_a;
  select status, released_job_id into v_st, v_a2 from public.automation_job_followups where id = r->'followup'->>'id';
  select max_attempts into v_max from public.automation_jobs where id = v_a2;
  v_out := v_out || format('F3 released=%s|', v_st = 'released'
    and exists (select 1 from public.automation_jobs where id = v_a2 and status = 'queued' and input->>'role' = 'spouse'));
  v_out := v_out || format('F3 max=%s|', v_max = 3);

  -- F4
  update public.automation_jobs set status = 'succeeded', finished_at = now() where id = v_a2;
  f := public.create_automation_job_after(v_cid, 'qa.followup_test', '{"role":"client"}', v_a2);
  v_out := v_out || format('F4 immediate=%s|', (f->>'immediate')::boolean and f->'job'->>'status' = 'queued');
  update public.automation_jobs set status = 'succeeded', finished_at = now() where id = f->'job'->>'id';

  -- F5
  a := public.create_automation_job(v_cid, 'qa.followup_test', '{"role":"client"}');
  v_a := a->'job'->>'id';
  r := public.create_automation_job_after(v_cid, 'qa.followup_test', '{"role":"spouse"}', v_a);
  update public.automation_jobs set status = 'needs_human' where id = v_a;
  update public.automation_jobs set status = 'cancelled', finished_at = now() where id = v_a;
  select status into v_st from public.automation_job_followups where id = r->'followup'->>'id';
  v_out := v_out || format('F5 not_released=%s|', v_st = 'waiting');
  a := public.create_automation_job(v_cid, 'qa.followup_test', '{"role":"client"}');
  v_a2 := a->'job'->>'id';
  v_out := v_out || format('F5 repointed=%s|', (select after_job_id from public.automation_job_followups where id = r->'followup'->>'id') = v_a2);
  update public.automation_jobs set status = 'failed', finished_at = now() where id = v_a2;
  select status into v_st from public.automation_job_followups where id = r->'followup'->>'id';
  v_out := v_out || format('F5 released_after_fail=%s|', v_st = 'released');
  update public.automation_jobs set status = 'succeeded', finished_at = now()
   where client_id = v_cid and status in ('queued', 'running', 'needs_human');

  -- F6
  a := public.create_automation_job(v_cid, 'qa.followup_test', '{"role":"client"}');
  v_a := a->'job'->>'id';
  r := public.create_automation_job_after(v_cid, 'qa.followup_test', '{"role":"spouse"}', v_a);
  update public.automation_jobs set status = 'succeeded', finished_at = now() where id = v_a;
  -- (שוחרר כבר כאן; לבדיקת «ידני» בונים מצב חדש)
  update public.automation_jobs set status = 'succeeded', finished_at = now()
   where client_id = v_cid and status in ('queued', 'running', 'needs_human');
  a := public.create_automation_job(v_cid, 'qa.followup_test', '{"role":"client"}');
  v_a := a->'job'->>'id';
  r := public.create_automation_job_after(v_cid, 'qa.followup_test', '{"role":"spouse"}', v_a);
  update public.automation_jobs set status = 'succeeded', finished_at = now() where id = v_a;
  -- הדמיה: בן/בת הזוג הופעל/ה ידנית *לפני* שהקודמת נגמרה — בונים followup שני ומשימה ידנית.
  update public.automation_jobs set status = 'succeeded', finished_at = now()
   where client_id = v_cid and status in ('queued', 'running', 'needs_human');
  a := public.create_automation_job(v_cid, 'qa.followup_test', '{"role":"client"}');
  v_a := a->'job'->>'id';
  r := public.create_automation_job_after(v_cid, 'qa.followup_test', '{"role":"spouse"}', v_a);
  insert into public.automation_jobs (user_id, client_id, action_type, input, status, max_attempts)
  values ('${USER_ID}', v_cid, 'qa.followup_test', '{"role":"spouse"}', 'succeeded', 3);
  -- ‼ בטרנזקציה אחת now() קבוע — המשימה הידנית «אחרי» ה«המשך» רק בזמן מוזז.
  update public.automation_jobs set created_at = now() + interval '1 second'
   where client_id = v_cid and input->>'role' = 'spouse' and status = 'succeeded' and created_at = now();
  update public.automation_jobs set status = 'succeeded', finished_at = now() where id = v_a;
  select status into v_st from public.automation_job_followups where id = r->'followup'->>'id';
  select count(*) into v_n from public.automation_jobs where client_id = v_cid and input->>'role' = 'spouse' and status = 'queued';
  v_out := v_out || format('F6 skipped=%s|F6 no_second=%s|', v_st = 'skipped', v_n = 0);

  -- F7
  a := public.create_automation_job(v_cid, 'qa.followup_test', '{"role":"client"}');
  v_a := a->'job'->>'id';
  r := public.create_automation_job_after(v_cid, 'qa.followup_test', '{"role":"spouse"}', v_a);
  f := public.cancel_automation_job_followup(r->'followup'->>'id');
  v_out := v_out || format('F7 cancelled=%s|', (f->>'ok')::boolean and f->'followup'->>'status' = 'cancelled');
  f := public.cancel_automation_job_followup(r->'followup'->>'id');
  v_out := v_out || format('F7 twice_refused=%s|', not (f->>'ok')::boolean);

  -- F8
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  perform set_config('request.jwt.claim.sub', '', true);
  f := public.create_automation_job_after(v_cid, 'qa.followup_test', '{"role":"spouse"}', v_a);
  v_out := v_out || format('F8 anon_refused=%s|', f->>'error' = 'unauthorized');

  raise exception 'RESULTS:%', v_out;
end;
$t$;`;

const r = await fetch(`https://api.supabase.com/v1/projects/${STAGING_REF}/database/query`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ query: SCRIPT }),
});
const text = await r.text();
const m = /RESULTS:([^"\\]*)/.exec(text);
if (!m) { console.error('✗ לא התקבלו תוצאות:', text.slice(0, 800)); process.exit(1); }
let pass = 0, fail = 0;
for (const part of m[1].split('|').filter(Boolean)) {
  const [name, val] = part.split('=');
  if (val === 'true' || val === 't') { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name} (${val})`); }
}
const anonRead = await fetch(`${loadEnv('.env.staging').VITE_SUPABASE_URL}/rest/v1/automation_job_followups?select=id&limit=1`, {
  headers: { apikey: loadEnv('.env.staging').VITE_SUPABASE_ANON_KEY },
});
const anonRows = anonRead.ok ? await anonRead.json() : [];
if (Array.isArray(anonRows) && anonRows.length === 0) { pass++; console.log('  ✓ F8 anon_read_empty'); }
else { fail++; console.log('  ✗ F8 anon_read_empty', JSON.stringify(anonRows).slice(0, 200)); }
console.log(`\n${pass} עברו · ${fail} נכשלו  (${STAGING_REF})`);
process.exit(fail ? 1 : 0);
