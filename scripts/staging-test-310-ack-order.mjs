#!/usr/bin/env node
/**
 * staging-test-310-ack-order.mjs — בדיקה של 310 (ירוק עד «סימון שהושלם» + סדר בגרירה).
 *
 * הכול רץ בתוך בלוק אחד שמסתיים בחריגה מכוונת ⇒ שום דבר לא נשמר ב-staging.
 *   1. הלקוח סיים (בלי משתמש)          ⇒ office_ack_at ריק (ירוק)
 *   2. משתמש אחר מסמן                  ⇒ 0 סומנו
 *   3. בעל הלקוח מסמן                  ⇒ 1 סומן
 *   4. נפתח מחדש                        ⇒ שוב ריק
 *   5. המשרד סגר בעצמו                 ⇒ נחשב נראה מיד
 *   6. השלב הבא נפתח בלי לחכות לסימון  ⇒ unlock_dependent_steps לא נגעה (נבדק בגוף הפונקציה)
 *   7. גרירה                            ⇒ sort_order לפי הסדר, pending_sort_order ריק
 *   8. משתמש אחר מסדר                   ⇒ forbidden
 *
 *   שימוש: node scripts/staging-test-310-ack-order.mjs
 */
import { sql, STAGING_REF } from './staging-lib.mjs';

const block = `
do $t$
declare
  v_uid uuid; v_cid text; v_sid text; v_ids text[]; v_rev text[];
  r jsonb; res jsonb := '{}'::jsonb; v timestamptz; v_ord int; v_pend int;
begin
  select c.user_id, c.id into v_uid, v_cid
    from public.clients c
   where (select count(*) from public.onboarding_steps s
           where s.client_id = c.id and s.status in ('pending','in_progress','waiting_client')) >= 2
   limit 1;
  if v_cid is null then raise exception 'RESULT:{"error":"no_client"}'; end if;
  select id into v_sid from public.onboarding_steps
   where client_id = v_cid and status in ('pending','in_progress','waiting_client') order by id limit 1;

  -- 1. הלקוח סיים — בלי משתמש מחובר
  perform set_config('request.jwt.claims', '{}', true);
  update public.onboarding_steps set status = 'completed', completed_at = now() where id = v_sid;
  select office_ack_at into v from public.onboarding_steps where id = v_sid;
  res := res || jsonb_build_object('1_client_done_is_green', v is null);

  -- 2. משתמש אחר
  perform set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid())::text, true);
  r := public.ack_onboarding_steps(array[v_sid]);
  res := res || jsonb_build_object('2_other_user_acked', r->'acked');

  -- 3. בעל הלקוח
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid)::text, true);
  r := public.ack_onboarding_steps(array[v_sid]);
  select office_ack_at into v from public.onboarding_steps where id = v_sid;
  res := res || jsonb_build_object('3_owner_acked', r->'acked', '3_ack_set', v is not null);

  -- 4. נפתח מחדש
  update public.onboarding_steps set status = 'pending', completed_at = null where id = v_sid;
  select office_ack_at into v from public.onboarding_steps where id = v_sid;
  res := res || jsonb_build_object('4_reopened_cleared', v is null);

  -- 5. המשרד סגר בעצמו (משתמש מחובר)
  update public.onboarding_steps set status = 'completed', completed_at = now() where id = v_sid;
  select office_ack_at into v from public.onboarding_steps where id = v_sid;
  res := res || jsonb_build_object('5_office_done_is_seen', v is not null);

  -- 7. גרירה — הסדר הפוך
  select array_agg(id order by coalesce(sort_order, 0), created_at) into v_ids
    from public.onboarding_steps where client_id = v_cid;
  select array_agg(x order by o desc) into v_rev from unnest(v_ids) with ordinality t(x, o);
  update public.onboarding_steps set pending_sort_order = 999 where id = v_rev[1];
  r := public.set_onboarding_steps_order(v_cid, v_rev);
  select sort_order, pending_sort_order into v_ord, v_pend from public.onboarding_steps where id = v_rev[1];
  res := res || jsonb_build_object('7_updated', r->'updated', '7_first_is_10', v_ord = 10, '7_pending_cleared', v_pend is null);

  -- 8. משתמש אחר מסדר
  perform set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid())::text, true);
  r := public.set_onboarding_steps_order(v_cid, v_rev);
  res := res || jsonb_build_object('8_other_user', r->>'error');

  raise exception 'RESULT:%', res;
end
$t$;`;

const expect = {
  '1_client_done_is_green': true, '2_other_user_acked': 0, '3_owner_acked': 1, '3_ack_set': true,
  '4_reopened_cleared': true, '5_office_done_is_seen': true, '7_first_is_10': true, '7_pending_cleared': true,
  '8_other_user': 'forbidden',
};

let res;
try {
  await sql(STAGING_REF, block);
  console.error('✗ הבלוק לא החזיר תוצאה'); process.exit(1);
} catch (e) {
  // ההודעה חוזרת מוטמעת ב-JSON של ה-API — המירכאות שבה מגיעות עם לוכסן.
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
console.log(`עודכנו בגרירה: ${res['7_updated']}`);

// 6. השחרור של הבא לא תלוי בסימון — unlock_dependent_steps לא קוראת office_ack_at
const body = await sql(STAGING_REF, `select pg_get_functiondef('public.unlock_dependent_steps'::regproc) d`);
const touches = /office_ack_at/.test(body?.[0]?.d ?? '');
console.log(`${touches ? '✗' : '✓'} 6_unlock_ignores_ack`);
if (touches) bad++;

process.exit(bad ? 1 : 0);
