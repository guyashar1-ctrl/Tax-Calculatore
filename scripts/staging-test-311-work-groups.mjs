#!/usr/bin/env node
/**
 * staging-test-311-work-groups.mjs — קבוצות של המשרד אצל לקוח (311).
 *
 * הכול בבלוק אחד שמסתיים בחריגה מכוונת ⇒ שום דבר לא נשמר. הנתונים (לקוח, התקשרות,
 * בקשות) נוצרים בתוך הבלוק ונעלמים איתו.
 *
 *   שימוש: node scripts/staging-test-311-work-groups.mjs
 */
import { sql, STAGING_REF } from './staging-lib.mjs';

const block = `
do $t$
declare
  v_uid uuid; v_c text := 'qa311' || substr(md5(random()::text), 1, 20); v_e text;
  r jsonb; res jsonb := '{}'::jsonb; g1 text; g2 text; v_st text; v_n int;
  s1 text := v_c || 's1'; s2 text := v_c || 's2'; s3 text := v_c || 's3'; s4 text := v_c || 's4'; pp text := v_c || 'pp';
begin
  select user_id into v_uid from public.clients limit 1;
  insert into public.clients (id, user_id, first_name, last_name) values (v_c, v_uid, 'בדיקה', '311');
  insert into public.engagements (user_id, client_id, status) values (v_uid, v_c, 'active') returning id into v_e;
  insert into public.onboarding_steps (id, user_id, engagement_id, client_id, step_type, track, scope, status, ball, payload, sort_order)
  values (s1, v_uid, v_e, v_c, 'custom_request', 'custom', 'person', 'completed', 'me', '{}', 10),
         (s2, v_uid, v_e, v_c, 'custom_request', 'custom', 'person', 'locked',    'me', '{}', 20),
         (s3, v_uid, v_e, v_c, 'custom_request', 'custom', 'person', 'pending',   'client', '{}', 30),
         (s4, v_uid, v_e, v_c, 'custom_request', 'custom', 'person', 'pending',   'client', '{}', 40),
         (pp, v_uid, v_e, v_c, 'paperless_invite', 'tools', 'person', 'pending', 'client', '{}', 5);

  -- משתמש אחר
  perform set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid())::text, true);
  r := public.create_work_group(v_c, 'x', jsonb_build_array(jsonb_build_object('kind','step','id',s1), jsonb_build_object('kind','step','id',s2)));
  res := res || jsonb_build_object('other_user', r->>'error');

  perform set_config('request.jwt.claims', json_build_object('sub', v_uid)::text, true);
  r := public.create_work_group(v_c, '  ', jsonb_build_array(jsonb_build_object('kind','step','id',s1), jsonb_build_object('kind','step','id',s2)));
  res := res || jsonb_build_object('empty_name', r->>'error');
  r := public.create_work_group(v_c, 'x', jsonb_build_array(jsonb_build_object('kind','step','id',s1)));
  res := res || jsonb_build_object('one_member', r->>'error');

  -- חיבור: s1 (הושלם) + s2 (נעול) ⇒ s2 נפתח, כי הקודמת כבר הושלמה
  r := public.create_work_group(v_c, 'פתיחת עוסק זעיר', jsonb_build_array(jsonb_build_object('kind','step','id',s1), jsonb_build_object('kind','step','id',s2)));
  g1 := r->>'groupId';
  select count(*) into v_n from public.onboarding_steps where work_group_id = g1;
  select status into v_st from public.onboarding_steps where id = s2;
  res := res || jsonb_build_object('created', r->'ok', 'members', v_n, 'locked_opened', v_st <> 'locked');

  -- רמות מעורבות: s1 בתוך קבוצה + s3 בחוץ
  r := public.create_work_group(v_c, 'x', jsonb_build_array(jsonb_build_object('kind','step','id',s1), jsonb_build_object('kind','step','id',s3)));
  res := res || jsonb_build_object('mixed', r->>'error');

  -- קבוצה בתוך קבוצה + פייפרלס (קבוצה קבועה)
  r := public.create_work_group(v_c, 'הכול', jsonb_build_array(jsonb_build_object('kind','group','id',g1), jsonb_build_object('kind','builtin','key','paperless'), jsonb_build_object('kind','step','id',s3)));
  g2 := r->>'groupId';
  select count(*) into v_n from public.client_work_groups where parent_group_id = g2;
  res := res || jsonb_build_object('nested_groups', v_n,
    'paperless_in_builtin', (select w.builtin_key from public.onboarding_steps s join public.client_work_groups w on w.id = s.work_group_id where s.id = pp));

  -- בקשת פייפרלס חדשה נכנסת לבד לקבוצה הקבועה
  insert into public.onboarding_steps (id, user_id, engagement_id, client_id, step_type, track, scope, status, ball, payload)
  values (v_c || 'pc', v_uid, v_e, v_c, 'paperless_connection', 'tools', 'person', 'locked', 'me', '{}');
  res := res || jsonb_build_object('new_paperless_adopted',
    (select w.builtin_key from public.onboarding_steps s join public.client_work_groups w on w.id = s.work_group_id where s.id = v_c || 'pc'));

  -- בתוך קבוצה קבועה לא מקבצים
  r := public.create_work_group(v_c, 'x', jsonb_build_array(jsonb_build_object('kind','step','id',pp), jsonb_build_object('kind','step','id',v_c || 'pc')));
  res := res || jsonb_build_object('inside_builtin', r->>'error');

  -- שינוי שם; פירוק — מה שבפנים עולה רמה
  r := public.rename_work_group(g2, 'עוסק זעיר');
  res := res || jsonb_build_object('renamed', (select name from public.client_work_groups where id = g2));
  r := public.dissolve_work_group(g2);
  res := res || jsonb_build_object('dissolved', r->'ok',
    'g1_back_to_top', (select parent_group_id is null from public.client_work_groups where id = g1),
    's3_back_to_top', (select work_group_id is null from public.onboarding_steps where id = s3));

  raise exception 'RESULT:%', res;
end
$t$;`;

const expect = {
  other_user: 'forbidden', empty_name: 'name_required', one_member: 'need_two',
  created: true, members: 2, locked_opened: true, mixed: 'mixed_levels',
  nested_groups: 2, paperless_in_builtin: 'paperless', new_paperless_adopted: 'paperless',
  inside_builtin: 'inside_builtin', renamed: 'עוסק זעיר', dissolved: true, g1_back_to_top: true, s3_back_to_top: true,
};

let res;
try {
  await sql(STAGING_REF, block);
  console.error('✗ הבלוק לא החזיר תוצאה'); process.exit(1);
} catch (e) {
  const m = /RESULT:(\{[^}]*\})/s.exec(e.message.replace(/\\"/g, '"'));
  if (!m) { console.error('✗', e.message); process.exit(1); }
  res = JSON.parse(m[1]);
}
let bad = 0;
for (const [k, want] of Object.entries(expect)) {
  const ok = JSON.stringify(res[k]) === JSON.stringify(want);
  if (!ok) bad++;
  console.log(`${ok ? '✓' : '✗'} ${k}: ${JSON.stringify(res[k])}${ok ? '' : `  (ציפינו ${JSON.stringify(want)})`}`);
}
console.log(bad ? `✗ ${bad} נכשלו` : `✓ ${Object.keys(expect).length} עברו · rolled back`);
process.exit(bad ? 1 : 0);
