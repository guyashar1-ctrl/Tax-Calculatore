#!/usr/bin/env node
/**
 * staging-test-312-work-group-flows.mjs — קבוצה = כלל בכללי הפתיחה, ושורת שירות בהצעה פותחת אותו (312).
 *
 * הכול בבלוק אחד שמסתיים בחריגה מכוונת ⇒ שום דבר לא נשמר (לקוחות, בקשות, כללים, ספרייה).
 * המשתמש = STAGING_USER_ID (רשום ב-authorized_users — create_office_flow דורשת).
 *
 *   שימוש: node scripts/staging-test-312-work-group-flows.mjs
 */
import { sql, STAGING_REF } from './staging-lib.mjs';

const UID = process.env.STAGING_USER_ID;
if (!/^[0-9a-f-]{36}$/i.test(UID ?? '')) { console.error('✗ חסר STAGING_USER_ID'); process.exit(1); }

const expect = {
  other_user: 'group_not_found', builtin: 'builtin',
  saved: true, created: true, skipped_paperless: 1, flow_name_ok: true, stages: 2, stage1_items: 2, stage1_chain: true,
  stage2_name: 'פנימית', delivery: 'auto', library_added: 4, group_flow_id: true,
  resave_same_flow: true, resave_created: false, version: 2, renamed_rule: true, library_after_resave: 4,
  run_ok: true, run_steps: 4, root_name_ok: true, in_root: 2, child_group_name: 'פנימית', in_child: 2, waits: 2, st: 'i1:pending,i2:locked,i3:pending,i4:locked',
  child_saves_root: true, from_rule: 'from_rule', again: 'true', quote_run: 1, quote_missing_logged: 1, quote_once: 1, approve_calls_flows: true,
};

const block = `
do $t$
declare
  v_uid uuid := '${UID}';
  v_c text := 'qa312' || substr(md5(random()::text), 1, 20); v_c2 text := v_c || 'b'; v_e text; v_e2 text;
  v_name text := 'כלל בדיקה 312 ' || substr(md5(random()::text), 1, 6);
  r jsonb; res jsonb := '{}'::jsonb; g1 text; g2 text; v_flow text; v_run text; v_root text; v_n int; v_tpl0 int; v_def jsonb;
  s1 text := v_c || 's1'; s2 text := v_c || 's2'; s3 text := v_c || 's3'; s4 text := v_c || 's4'; pp text := v_c || 'pp';
  q text; v_req jsonb := jsonb_build_array(jsonb_build_object('key', 'a', 'kind', 'confirm', 'label', 'אישור'));
begin
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid)::text, true);
  insert into public.clients (id, user_id, first_name, last_name) values (v_c, v_uid, 'בדיקה', '312'), (v_c2, v_uid, 'בדיקה', '312ב');
  insert into public.engagements (user_id, client_id, status) values (v_uid, v_c, 'active') returning id into v_e;
  insert into public.engagements (user_id, client_id, status) values (v_uid, v_c2, 'active') returning id into v_e2;
  insert into public.onboarding_steps (id, user_id, engagement_id, client_id, step_type, track, scope, status, ball, payload, sort_order)
  values (s1, v_uid, v_e, v_c, 'custom_request',   'custom', 'person', 'pending', 'client', jsonb_build_object('title', v_name || ' · טופס', 'requirements', v_req), 10),
         (s2, v_uid, v_e, v_c, 'client_documents', 'custom', 'person', 'pending', 'client', jsonb_build_object('title', v_name || ' · מסמכים', 'checklist', jsonb_build_array(jsonb_build_object('key', 'k1', 'done', false, 'label', 'תלוש'))), 20),
         (s3, v_uid, v_e, v_c, 'custom_request',   'custom', 'person', 'pending', 'client', jsonb_build_object('title', v_name || ' · פנימי א', 'requirements', v_req), 30),
         (s4, v_uid, v_e, v_c, 'custom_request',   'custom', 'person', 'pending', 'client', jsonb_build_object('title', v_name || ' · פנימי ב', 'requirements', v_req), 40),
         (pp, v_uid, v_e, v_c, 'paperless_invite', 'tools',  'person', 'pending', 'client', '{}', 5);

  -- קבוצה פנימית (s3+s4), וקבוצה ראשית: s1, s2, הפנימית, ופייפרלס
  r := public.create_work_group(v_c, 'פנימית', jsonb_build_array(jsonb_build_object('kind','step','id',s3), jsonb_build_object('kind','step','id',s4)));
  g1 := r->>'groupId';
  r := public.create_work_group(v_c, v_name, jsonb_build_array(jsonb_build_object('kind','step','id',s1), jsonb_build_object('kind','step','id',s2),
                                                            jsonb_build_object('kind','group','id',g1), jsonb_build_object('kind','builtin','key','paperless')));
  g2 := r->>'groupId';

  -- אחר לא שומר את הקבוצה שלי; קבוצה קבועה אינה כלל
  perform set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid())::text, true);
  res := res || jsonb_build_object('other_user', public.save_work_group_as_flow(g2)->>'error');
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid)::text, true);
  res := res || jsonb_build_object('builtin', public.save_work_group_as_flow(
    (select work_group_id from public.onboarding_steps where id = pp))->>'error');

  select count(*) into v_tpl0 from public.journey_templates where kind = 'request' and name like v_name || '%';
  r := public.save_work_group_as_flow(g2);
  v_flow := r->>'flowId';
  select v.definition into v_def from public.office_flow_versions v join public.office_flows f on f.id = v.flow_id
   where f.id = v_flow and v.version = f.current_version;
  res := res || jsonb_build_object('saved', r->'ok', 'created', r->'created', 'skipped_paperless', jsonb_array_length(r->'skipped'),
    'flow_name_ok', (select name = v_name and trigger = 'manual' and seed_key = 'work_group' from public.office_flows where id = v_flow),
    'stages', jsonb_array_length(v_def->'stages'),
    'stage1_items', jsonb_array_length(v_def->'stages'->0->'items'),
    'stage1_chain', v_def->'stages'->0->'items'->1->>'after' = v_def->'stages'->0->'items'->0->>'key',
    'stage2_name', v_def->'stages'->1->>'name',
    'delivery', v_def->'stages'->0->>'delivery',
    'library_added', (select count(*) from public.journey_templates where kind = 'request' and name like v_name || '%') - v_tpl0,
    'group_flow_id', (select flow_id = v_flow from public.client_work_groups where id = g2));

  -- שמירה שנייה (שינוי שם): אותו כלל, גרסה חדשה, הספרייה לא גדלה
  perform public.rename_work_group(g2, v_name || ' חדש');
  r := public.save_work_group_as_flow(g2);
  res := res || jsonb_build_object('resave_same_flow', r->>'flowId' = v_flow, 'resave_created', r->'created',
    'version', (select current_version from public.office_flows where id = v_flow),
    'renamed_rule', (select name = v_name || ' חדש' from public.office_flows where id = v_flow),
    'library_after_resave', (select count(*) from public.journey_templates where kind = 'request' and name like v_name || '%') - v_tpl0);

  -- הכלל נפתח אצל לקוח אחר ⇒ קבוצה באותו שם, פנימית בשם השלב, הבקשה השנייה מחכה לראשונה
  r := public._start_flow_run_system(v_c2, v_flow, 'test');
  v_run := r->>'runId';
  select id into v_root from public.client_work_groups where flow_run_id = v_run and parent_group_id is null;
  res := res || jsonb_build_object('run_ok', r->'ok', 'run_steps', (select count(*) from public.onboarding_steps where flow_run_id = v_run),
    'root_name_ok', (select name = v_name || ' חדש' from public.client_work_groups where id = v_root),
    'in_root', (select count(*) from public.onboarding_steps where flow_run_id = v_run and work_group_id = v_root),
    'child_group_name', (select name from public.client_work_groups where flow_run_id = v_run and parent_group_id = v_root),
    'in_child', (select count(*) from public.onboarding_steps s join public.client_work_groups w on w.id = s.work_group_id
                  where s.flow_run_id = v_run and w.parent_group_id = v_root),
    'waits', (select count(*) from public.onboarding_step_dependencies d join public.onboarding_steps s on s.id = d.step_id where s.flow_run_id = v_run),
    'st', (select string_agg(s.flow_item_key || ':' || s.status, ',' order by s.flow_item_key) from public.onboarding_steps s where s.flow_run_id = v_run));
  -- קבוצה פנימית נשמרת = הכלל של העליונה; קבוצה שנפתחה מכלל לא דורסת אותו
  res := res || jsonb_build_object('child_saves_root', public.save_work_group_as_flow(g1)->>'flowId' = v_flow,
    'from_rule', public.save_work_group_as_flow(v_root)->>'error');
  res := res || jsonb_build_object('again', coalesce(public._start_flow_run_system(v_c2, v_flow, 'test2')->>'alreadyActive', 'false'));

  -- שורת שירות בהצעה: כלל שכבר רץ — לא נפתח שוב; כלל שאינו קיים — נרשם ביומן, בלי חריגה
  perform set_config('request.jwt.claims', '', true);
  insert into public.quotations (user_id, client_id, quotation_number, status, items)
  values (v_uid, v_c, 'QA-312', 'approved', jsonb_build_array(
    jsonb_build_object('id', 'L1', 'name', 'שירות א', 'flowId', v_flow),
    jsonb_build_object('id', 'L2', 'name', 'שירות ב', 'flowId', 'no-such-flow'),
    jsonb_build_object('id', 'L3', 'name', 'שירות ג'))) returning id into q;
  perform public._start_quote_flows(q);
  res := res || jsonb_build_object('quote_run', (select count(*) from public.flow_runs where client_id = v_c and cycle_key = 'quote:' || q || ':L1'),
    'quote_missing_logged', (select count(*) from public.onboarding_events where engagement_id = v_e and meta->>'flowId' = 'no-such-flow'));
  perform public._start_quote_flows(q);
  res := res || jsonb_build_object('quote_once', (select count(*) from public.flow_runs where client_id = v_c and flow_id = v_flow));

  res := res || jsonb_build_object('approve_calls_flows',
    (select pg_get_functiondef('public.approve_quotation(text,text,text)'::regprocedure) like '%_start_quote_flows(q.id)%'));

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
if (!res) process.exit();
let bad = 0;
for (const [k, want] of Object.entries(expect)) {
  const ok = JSON.stringify(res[k]) === JSON.stringify(want);
  if (!ok) bad++;
  console.log(`${ok ? '✓' : '✗'} ${k}: ${JSON.stringify(res[k])}${ok ? '' : `  (ציפינו ${JSON.stringify(want)})`}`);
}
console.log(bad ? `✗ ${bad} נכשלו` : `✓ ${Object.keys(expect).length} עברו · rolled back`);
// ‼ exitCode ולא exit(): בווינדוס exit() באמצע סגירת חיבור הרשת מפיל את libuv.
process.exitCode = bad ? 1 : 0;
