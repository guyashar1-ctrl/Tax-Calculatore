#!/usr/bin/env node
/**
 * staging-test-313-automation-dots.mjs — אוטומציה היא נקודה רגילה בשרשרת (313).
 *
 * הכול בבלוק אחד שמסתיים בחריגה מכוונת ⇒ שום דבר לא נשמר. ‼ הטריגר שמריץ קריאה נדחה לסוף
 * הטרנזקציה; כאן `set constraints … immediate` מפעיל אותו במקום שבו בודקים.
 *
 *   שימוש: node scripts/staging-test-313-automation-dots.mjs
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { sql, STAGING_REF, ROOT } from './staging-lib.mjs';

const UID = readFileSync(resolve(ROOT, 'STAGING_USER_ID'), 'utf8').trim();

const expect = {
  other_user: 'forbidden', bad_type: 'not_supported',
  added: true, internal: true, owner_me: 'me', again_existed: true, no_job_without_rep: 0,
  job_closes: 'completed', closed_green: true,
  write_waits: 'pending', write_no_job: 0,
  recent_closes: 'completed',
  def_write_step_ok: null, def_write_plain: 'action_not_supported', def_after_step_ok: null,
  rule_has_action: 'action', rule_as_step: 'true',
  chain_auto_locked: 'locked', chain_auto_internal: true, chain_opens: 'pending',
};

const block = `
do $t$
declare
  v_uid uuid := '${UID}';
  v_c text := 'qa313' || substr(md5(random()::text), 1, 20); v_c2 text := v_c || 'b'; v_c3 text := v_c || 'c';
  v_e text; v_e2 text; v_e3 text; r jsonb; res jsonb := '{}'::jsonb; v_s text; v_w text; v_j text;
  g text; v_flow text; v_run text; v_req jsonb := jsonb_build_array(jsonb_build_object('key', 'a', 'kind', 'confirm', 'label', 'אישור'));
  v_name text := 'כלל 313 ' || substr(md5(random()::text), 1, 6); s1 text; s2 text;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid)::text, true);
  insert into public.clients (id, user_id, first_name, last_name) values (v_c, v_uid, 'בדיקה', '313'), (v_c2, v_uid, 'בדיקה', '313ב');
  insert into public.clients (id, user_id, first_name, last_name, id_number, tax_files)
  values (v_c3, v_uid, 'בדיקה', '313ג', '123456782',
          jsonb_build_array(jsonb_build_object('authority', 'national_insurance', 'owner', 'client', 'repStatus', 'active')));
  insert into public.engagements (user_id, client_id, status) values (v_uid, v_c, 'active') returning id into v_e;
  insert into public.engagements (user_id, client_id, status) values (v_uid, v_c2, 'active') returning id into v_e2;
  insert into public.engagements (user_id, client_id, status) values (v_uid, v_c3, 'active') returning id into v_e3;

  -- הרשאות וסוג
  perform set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid())::text, true);
  res := res || jsonb_build_object('other_user', public.add_automation_step(v_c, 'btl.sync_file')->>'error');
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid)::text, true);
  res := res || jsonb_build_object('bad_type', public.add_automation_step(v_c, 'shaam.enter_representation')->>'error');

  -- קריאה: נוספת כמשימה של המשרד; פעם שנייה — אותה נקודה
  r := public.add_automation_step(v_c, 'btl.sync_file');
  v_s := r->>'stepId';
  set constraints public.onboarding_steps_automation_kick immediate;
  set constraints public.onboarding_steps_automation_kick deferred;
  res := res || jsonb_build_object('added', r->'ok',
    'internal', (select payload->>'internalTask' = 'true' from public.onboarding_steps where id = v_s),
    'owner_me', (select ball from public.onboarding_steps where id = v_s),
    'again_existed', public.add_automation_step(v_c, 'btl.sync_file')->'existed',
    -- לקוח לא מיוצג ⇒ השער לא עובר ⇒ אין ריצה; נשאר «עליך» עם הכפתור
    'no_job_without_rep', (select count(*) from public.automation_jobs where client_id = v_c));

  -- ריצה שהצליחה (מכל מקום) סוגרת את הנקודה ⇒ ירוק
  insert into public.automation_jobs (user_id, client_id, action_type, input, status, max_attempts)
  values (v_uid, v_c, 'btl.sync_file', '{}'::jsonb, 'queued', 1) returning id into v_j;
  -- ‼ את הריצה סוגר מחשב העבודה (בלי משתמש מחובר) — לכן ירוק עד «סימון שהושלם».
  perform set_config('request.jwt.claims', '', true);
  update public.automation_jobs set status = 'succeeded', finished_at = now() where id = v_j;
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid)::text, true);
  res := res || jsonb_build_object('job_closes', (select status from public.onboarding_steps where id = v_s),
    'closed_green', (select office_ack_at is null from public.onboarding_steps where id = v_s));

  -- כתיבה ברשות: מחכה ללחיצה, שום ריצה לא יוצאת לבד
  r := public.add_automation_step(v_c, 'shaam.issue_annual_certificates');
  v_w := r->>'stepId';
  set constraints public.onboarding_steps_automation_kick immediate;
  set constraints public.onboarding_steps_automation_kick deferred;
  res := res || jsonb_build_object('write_waits', (select status from public.onboarding_steps where id = v_w),
    'write_no_job', (select count(*) from public.automation_jobs where client_id = v_c and action_type = 'shaam.issue_annual_certificates'));

  -- לקוח מיוצג שנקרא בשבוע האחרון ⇒ הנקודה נסגרת בלי לקרוא שוב
  insert into public.automation_jobs (user_id, client_id, action_type, input, status, max_attempts, finished_at)
  values (v_uid, v_c3, 'btl.sync_file', '{}'::jsonb, 'succeeded', 1, now() - interval '1 day');
  r := public.add_automation_step(v_c3, 'btl.sync_file');
  set constraints public.onboarding_steps_automation_kick immediate;
  set constraints public.onboarding_steps_automation_kick deferred;
  res := res || jsonb_build_object('recent_closes', (select status from public.onboarding_steps where id = r->>'stepId'));

  -- הגדרה: כתיבה רק כנקודה; נקודה יכולה לחכות לקודמת
  res := res || jsonb_build_object(
    'def_write_step_ok', public.flow_definition_error(jsonb_build_object('stages', jsonb_build_array(jsonb_build_object(
       'key', 's1', 'name', 'x', 'opens', jsonb_build_object('after', 'start'), 'delivery', 'auto',
       'items', jsonb_build_array(jsonb_build_object('key', 'i1', 'asStep', true,
         'ref', jsonb_build_object('kind', 'action', 'actionType', 'shaam.issue_annual_certificates')))))), 'manual'),
    'def_write_plain', public.flow_definition_error(jsonb_build_object('stages', jsonb_build_array(jsonb_build_object(
       'key', 's1', 'name', 'x', 'opens', jsonb_build_object('after', 'start'), 'delivery', 'auto',
       'items', jsonb_build_array(jsonb_build_object('key', 'i1',
         'ref', jsonb_build_object('kind', 'action', 'actionType', 'shaam.issue_annual_certificates')))))), 'manual'),
    'def_after_step_ok', public.flow_definition_error(jsonb_build_object('stages', jsonb_build_array(jsonb_build_object(
       'key', 's1', 'name', 'x', 'opens', jsonb_build_object('after', 'start'), 'delivery', 'auto',
       'items', jsonb_build_array(
         jsonb_build_object('key', 'i1', 'asStep', true, 'ref', jsonb_build_object('kind', 'action', 'actionType', 'btl.sync_file')),
         jsonb_build_object('key', 'i2', 'asStep', true, 'after', 'i1',
           'ref', jsonb_build_object('kind', 'action', 'actionType', 'shaam.issue_annual_certificates')))))), 'manual'));

  -- קבוצה עם בקשה ואחריה אוטומציה ⇒ כלל ⇒ אצל לקוח אחר האוטומציה מחכה לבקשה
  insert into public.onboarding_steps (id, user_id, engagement_id, client_id, step_type, track, scope, status, ball, payload, sort_order)
  values (v_c || 'r1', v_uid, v_e, v_c, 'custom_request', 'custom', 'person', 'pending', 'client',
          jsonb_build_object('title', v_name || ' · טופס', 'requirements', v_req), 1);
  update public.onboarding_steps set sort_order = 2 where id = v_w;
  g := public.create_work_group(v_c, v_name, jsonb_build_array(jsonb_build_object('kind', 'step', 'id', v_c || 'r1'),
                                                             jsonb_build_object('kind', 'step', 'id', v_w)))->>'groupId';
  r := public.save_work_group_as_flow(g);
  v_flow := r->>'flowId';
  res := res || jsonb_build_object(
    'rule_has_action', (select v.definition->'stages'->0->'items'->1->'ref'->>'kind' from public.office_flow_versions v
                         join public.office_flows f on f.id = v.flow_id and v.version = f.current_version where f.id = v_flow),
    'rule_as_step', (select v.definition->'stages'->0->'items'->1->>'asStep' from public.office_flow_versions v
                      join public.office_flows f on f.id = v.flow_id and v.version = f.current_version where f.id = v_flow));
  v_run := public._start_flow_run_system(v_c2, v_flow, 'test')->>'runId';
  select id into s1 from public.onboarding_steps where flow_run_id = v_run and flow_item_key = 'i1';
  select id into s2 from public.onboarding_steps where flow_run_id = v_run and flow_item_key = 'i2';
  res := res || jsonb_build_object('chain_auto_locked', (select status from public.onboarding_steps where id = s2),
    'chain_auto_internal', (select payload->>'internalTask' = 'true' and payload ? 'automation' from public.onboarding_steps where id = s2));
  perform public._set_step_status(s1, 'completed', 'system', 'בדיקה');
  res := res || jsonb_build_object('chain_opens', (select status from public.onboarding_steps where id = s2));

  -- ‼ staging-lib חותך הודעת שגיאה ב-600 תווים — מחזירים רק את הערכים, לפי סדר המפתחות.
  raise exception 'RESULT:%', (select jsonb_agg(res->k order by i)
                                 from unnest(array[${Object.keys(expect).map(k => `'${k}'`).join(',')}]::text[]) with ordinality u(k, i));
end
$t$;`;

let res;
try {
  await sql(STAGING_REF, block);
  console.error('✗ הבלוק לא החזיר תוצאה'); process.exitCode = 1;
} catch (e) {
  const m = /RESULT:(\[.*\])/s.exec(e.message.replace(/\\"/g, '"'));
  if (!m) { console.error('✗', e.message); process.exitCode = 1; }
  else res = Object.fromEntries(Object.keys(expect).map((k, i) => [k, JSON.parse(m[1])[i]]));
}
if (res) {
  let bad = 0;
  for (const [k, want] of Object.entries(expect)) {
    const ok = JSON.stringify(res[k]) === JSON.stringify(want);
    if (!ok) bad++;
    console.log(`${ok ? '✓' : '✗'} ${k}: ${JSON.stringify(res[k])}${ok ? '' : `  (ציפינו ${JSON.stringify(want)})`}`);
  }
  console.log(bad ? `✗ ${bad} נכשלו` : `✓ ${Object.keys(expect).length} עברו · rolled back`);
  // ‼ exitCode ולא exit(): בווינדוס exit() באמצע סגירת חיבור הרשת מפיל את libuv.
  process.exitCode = bad ? 1 : 0;
}
