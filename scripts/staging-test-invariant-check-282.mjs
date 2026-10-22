#!/usr/bin/env node
/**
 * staging-test-invariant-check-282.mjs — הבדיקה היומית (282): הפרה ⇒ משימה אחת למשרד, בלי כפילות.
 *
 *  D1  בלי הפרות ⇒ ריצה ok, אין משימה.
 *  D2  «המשך» תקוע (INV-AUTO-01) ⇒ ריצה לא ok, ומשימה אחת דחופה ב«משימות» של אותו משרד.
 *  D3  ריצה שנייה ⇒ לא נפתחת משימה שנייה.
 *  D4  anon/authenticated לא מריצים את הבדיקה.
 * ‼ טרנזקציה אחת שנגמרת ב-raise — staging חוזר בדיוק למה שהיה. נתוני דמה.
 * הרצה:  node scripts/staging-test-invariant-check-282.mjs
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ROOT, STAGING_REF, loadEnv } from './staging-lib.mjs';

const TOKEN = loadEnv().SUPABASE_ACCESS_TOKEN;
const USER_ID = readFileSync(resolve(ROOT, 'STAGING_USER_ID'), 'utf8').trim();

const SCRIPT = `
do $t$
declare
  v_out text := ''; v jsonb; v_n int; v_cid text := 'qa282-' || replace(gen_random_uuid()::text, '-', '');
  v_job text; v_title text := 'בדיקת מערכת: הזנה ב«הפעל הכול» תקועה בתור אחרי משימה שכבר הסתיימה';
begin
  -- staging עשוי להכיל הפרות אמיתיות משלו — סופרים רק את מה שנוגע ללקוח הדמה.
  delete from public.automation_job_followups where status = 'waiting';
  v := public.run_invariant_check('test');
  v_out := v_out || format('D1 clean_run=%s|', not exists (select 1 from jsonb_array_elements(v) x where x->>'id' = 'INV-AUTO-01'));

  insert into public.clients (id, user_id, first_name, last_name) values (v_cid, '${USER_ID}', 'בדיקה', 'QA282');
  insert into public.automation_jobs (user_id, client_id, action_type, input, status, max_attempts)
  values ('${USER_ID}', v_cid, 'qa.followup_test', '{"role":"client"}', 'succeeded', 1) returning id into v_job;
  update public.automation_jobs set finished_at = now() - interval '1 hour' where id = v_job;
  insert into public.automation_job_followups (user_id, client_id, action_type, input, after_job_id)
  values ('${USER_ID}', v_cid, 'qa.followup_test', '{"role":"spouse"}', v_job);
  delete from public.tasks where title = v_title;

  v := public.run_invariant_check('test');
  select count(*) into v_n from public.tasks where user_id = '${USER_ID}' and title = v_title and status = 'open' and priority = 'urgent';
  v_out := v_out || format('D2 violation_found=%s|D2 one_task=%s|',
    exists (select 1 from jsonb_array_elements(v) x where x->>'id' = 'INV-AUTO-01'), v_n = 1);
  v_out := v_out || format('D2 run_logged=%s|', exists (select 1 from public.invariant_check_runs where source = 'test' and not ok));

  perform public.run_invariant_check('test');
  select count(*) into v_n from public.tasks where user_id = '${USER_ID}' and title = v_title;
  v_out := v_out || format('D3 no_duplicate_task=%s|', v_n = 1);

  v_out := v_out || format('D4 anon_cannot=%s|D4 auth_cannot=%s|',
    not has_function_privilege('anon', 'public.run_invariant_check(text)', 'execute'),
    not has_function_privilege('authenticated', 'public.pivo_invariant_violations()', 'execute'));
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
if (!m) { console.error('✗ לא התקבלו תוצאות:', text.slice(0, 800)); process.exitCode = 1; }
else {
  let pass = 0, fail = 0;
  for (const part of m[1].split('|').filter(Boolean)) {
    const [name, val] = part.split('=');
    if (val === 'true' || val === 't') { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.log(`  ✗ ${name} (${val})`); }
  }
  console.log(`\n${pass} עברו · ${fail} נכשלו  (${STAGING_REF})`);
  process.exitCode = fail ? 1 : 0;
}
