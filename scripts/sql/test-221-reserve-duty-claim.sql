-- בדיקת 221 («תביעת מילואים בביטוח לאומי») בתוך בקשה אחת שמסתיימת ב-raise — הכול מתבטל.
-- ‼ __USER__ מוחלף במשתמש הבדיקות של staging. שום מייל לא נשלח (התור בלבד), ושום דבר לא נשמר.
-- הרצה: node scripts/staging-dryrun-flows.mjs --tests-only scripts/sql/test-221-reserve-duty-claim.sql
--       (הקובץ 221 עצמו רץ לפני הבדיקות באותה בקשה — ‼ לא להסתמך על כך שהוא כבר הוחל ב-staging)
do $test$
declare
  uid    uuid := '__USER__';
  cid    text := 'qa221c' || substr(md5(random()::text), 1, 10);
  eng    text := 'qa221e' || substr(md5(random()::text), 1, 10);
  tok    text := md5(random()::text);
  cid2   text := 'qa221d' || substr(md5(random()::text), 1, 10);
  tok2   text := md5(random()::text);
  tpl    jsonb;
  pay    jsonb;
  res    jsonb; item jsonb;
  s1 text; s2 text; s3 text; s4 text; s5 text;
  vi     int; vt text; vb boolean; vj jsonb;
  out    jsonb := '[]'::jsonb;
begin
  -- ── 1 · הנוסח המוכן ───────────────────────────────────────────────────────
  select count(*) into vi from public.journey_templates where seed_key = 'reserve_duty_claim' and office_id is null;
  out := out || jsonb_build_object('t', '1.1 הנוסח המוכן קיים פעם אחת', 'pass', vi = 1, 'got', vi);

  -- הרצה חוזרת של אותה הוספה — אידמפוטנטית (העתק של ההוספה ב-221).
  insert into public.journey_templates (user_id, office_id, kind, seed_key, name, description, entries)
  select null, null, 'request', 'reserve_duty_claim', 'תביעת מילואים בביטוח לאומי', 'x', '[]'::jsonb
  where not exists (select 1 from public.journey_templates where seed_key = 'reserve_duty_claim' and office_id is null);
  select count(*) into vi from public.journey_templates where seed_key = 'reserve_duty_claim' and office_id is null;
  out := out || jsonb_build_object('t', '1.2 הרצה חוזרת לא מוסיפה שנייה', 'pass', vi = 1, 'got', vi);

  select entries->0 into tpl from public.journey_templates where seed_key = 'reserve_duty_claim' and office_id is null;
  pay := tpl->'payload';
  out := out || jsonb_build_object('t', '1.3 בקשה חופשית של הלקוח, לא חובה לסגירת הקליטה', 'pass',
    tpl->>'stepType' = 'custom_request' and tpl->>'owner' = 'client' and (tpl->>'requiredForClose')::boolean = false, 'got', tpl - 'payload');
  out := out || jsonb_build_object('t', '1.4 שם, מדריך והסבר', 'pass',
    pay->>'clientTitle' = 'תביעת מילואים בביטוח לאומי' and pay->>'clientPhotoGuide' = 'reserve_duty_claim'
    and nullif(pay->>'clientNote', '') is not null and nullif(pay->>'clientNoteAfter', '') is not null, 'got', pay - 'requirements');
  out := out || jsonb_build_object('t', '1.5 ‼ בלי clientLinkUrl (שהיה הופך אותה ל«חומר עזר» שנסגר בפתיחה)', 'pass',
    not (pay ? 'clientLinkUrl') and not (pay ? 'clientCta'), 'got', pay - 'requirements');
  out := out || jsonb_build_object('t', '1.6 הדרישות תקינות (validate_requirements)', 'pass',
    public.validate_requirements(pay->'requirements') is null, 'got', public.validate_requirements(pay->'requirements'));
  select count(*) into vi from jsonb_array_elements_text(pay->'requirements'->0->'options') o where o like '%,%';
  out := out || jsonb_build_object('t', '1.7 שאלה אחת מסוג בחירה, חובה, ארבע תשובות (כולל «צור קשר») — בלי פסיק באף אחת', 'pass',
    jsonb_array_length(pay->'requirements') = 1 and pay->'requirements'->0->>'kind' = 'select'
    and coalesce((pay->'requirements'->0->>'required')::boolean, true)
    and jsonb_array_length(pay->'requirements'->0->'options') = 4 and vi = 0
    and pay->'requirements'->0->'options'->>2 = 'המערכת לא אפשרה להגיש - פניתי דרך «צור קשר»', 'got', pay->'requirements');

  -- המובנית קריאה למשתמש מחובר ומורשה (RLS: journey_templates_read — המשרד שלי או office_id ריק).
  -- ‼ משתמש לא מורשה (require_authorized) לא רואה כלום — לכן כאן משתמש הבדיקות, בתפקיד authenticated.
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', uid::text, true);
  perform set_config('role', 'authenticated', true);
  select count(*) into vi from public.journey_templates where seed_key = 'reserve_duty_claim';
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', null, true);
  out := out || jsonb_build_object('t', '1.8 משתמש מחובר רואה את הנוסח המוכן', 'pass', vi = 1, 'got', vi);

  -- ── הכנה: לקוח עם תהליך מפורסם ────────────────────────────────────────────
  insert into public.clients (id, user_id, first_name, last_name, email, lifecycle_stage, family_status, dealer_type, portal_token)
  values (cid, uid, 'אילן', 'QA221', 'delivered@resend.dev', 'onboarding', 'single', 'exempt', tok);
  insert into public.engagements (id, user_id, client_id, status, process_published_at)
  values (eng, uid, cid, 'onboarding', now());
  insert into public.clients (id, user_id, first_name, last_name, email, lifecycle_stage, family_status, portal_token)
  values (cid2, uid, 'נועה', 'QA221', 'delivered@resend.dev', 'onboarding', 'single', tok2);

  -- ── 2 · הבקשה מהנוסח — דרך אותו RPC של הקומפוזר ────────────────────────────
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', uid::text, true);
  res := public.create_onboarding_request(cid, 'custom_request', pay, null, null, true, false, 'client', null);
  s1 := res->>'stepId';
  out := out || jsonb_build_object('t', '2.1 נוצרה מהנוסח המוכן', 'pass', (res->>'ok')::boolean and s1 is not null, 'got', res);
  select count(*) into vi from public.onboarding_steps
   where id = s1 and step_type = 'custom_request' and ball = 'client' and published_at is not null
     and payload->>'clientPhotoGuide' = 'reserve_duty_claim' and payload ? 'clientNote' and payload ? 'clientNoteAfter';
  out := out || jsonb_build_object('t', '2.2 המפתח וההסבר נשמרו על הבקשה', 'pass', vi = 1, 'got', (select payload - 'requirements' from public.onboarding_steps where id = s1));

  -- ── 3 · הדף האישי ─────────────────────────────────────────────────────────
  res := public.build_client_portal(cid, 'live');
  select x into item from jsonb_array_elements(res->'items') x where x->>'key' = 'custom_' || s1;
  out := out || jsonb_build_object('t', '3.1 כרטיס פעולה: kind=custom, מדריך, הסבר', 'pass',
    item->>'bucket' = 'action' and item->>'kind' = 'custom' and item->>'photoGuide' = 'reserve_duty_claim'
    and nullif(item->>'note', '') is not null and nullif(item->>'noteAfter', '') is not null
    and item->>'actionKind' = 'portal' and item->>'actionValue' = s1, 'got', item - 'requirements');
  out := out || jsonb_build_object('t', '3.2 ‼ אין linkUrl ו-kind אינו guide — הפתיחה לא סוגרת את הבקשה', 'pass',
    not (item ? 'linkUrl') and not (item ? 'resourceUrl') and item->>'kind' <> 'guide', 'got', item - 'requirements');
  out := out || jsonb_build_object('t', '3.3 השאלה והאפשרויות מגיעות לדף', 'pass',
    item->'requirements'->0->>'kind' = 'select' and item->'requirements'->0->>'label' = 'מה מצאתם באזור האישי?'
    and jsonb_array_length(item->'requirements'->0->'options') = 4
    and not coalesce((item->'requirements'->0->>'done')::boolean, false), 'got', item->'requirements');
  res := public.build_client_portal(cid, 'preview');
  select x into item from jsonb_array_elements(res->'items') x where x->>'key' = 'custom_' || s1;
  out := out || jsonb_build_object('t', '3.4 תצוגה מקדימה: אותו כרטיס, אותו מדריך', 'pass',
    item->>'kind' = 'custom' and item->>'photoGuide' = 'reserve_duty_claim' and not (item ? 'linkUrl'), 'got', item - 'requirements');

  -- בקשה חופשית בלי מדריך — אין שדה (פלט זהה לקודם); מפתח ריק — אין שדה; מפתח לא מוכר — עובר כמו שהוא (הדף מתעלם).
  res := public.create_onboarding_request(cid, 'custom_request', jsonb_build_object('title', 'אישור קריאה', 'clientTitle', 'אישור קריאה',
    'requirements', jsonb_build_array(jsonb_build_object('key', 'r1', 'kind', 'confirm', 'label', 'קראתי', 'done', false))), null, null, true, false, 'client', null);
  s2 := res->>'stepId';
  res := public.create_onboarding_request(cid, 'custom_request', jsonb_build_object('title', 'מפתח ריק', 'clientTitle', 'מפתח ריק', 'clientPhotoGuide', '',
    'requirements', jsonb_build_array(jsonb_build_object('key', 'r1', 'kind', 'confirm', 'label', 'קראתי', 'done', false))), null, null, true, false, 'client', null);
  s3 := res->>'stepId';
  res := public.create_onboarding_request(cid, 'custom_request', jsonb_build_object('title', 'מפתח לא מוכר', 'clientTitle', 'מפתח לא מוכר', 'clientPhotoGuide', 'nope',
    'requirements', jsonb_build_array(jsonb_build_object('key', 'r1', 'kind', 'confirm', 'label', 'קראתי', 'done', false))), null, null, true, false, 'client', null);
  s4 := res->>'stepId';
  res := public.build_client_portal(cid, 'live');
  select x into item from jsonb_array_elements(res->'items') x where x->>'key' = 'custom_' || s2;
  out := out || jsonb_build_object('t', '3.5 בקשה חופשית בלי מדריך — אין photoGuide', 'pass', not (item ? 'photoGuide') and item->>'kind' = 'custom', 'got', item);
  select x into item from jsonb_array_elements(res->'items') x where x->>'key' = 'custom_' || s3;
  out := out || jsonb_build_object('t', '3.6 מפתח ריק — אין photoGuide', 'pass', not (item ? 'photoGuide'), 'got', item);
  select x into item from jsonb_array_elements(res->'items') x where x->>'key' = 'custom_' || s4;
  out := out || jsonb_build_object('t', '3.7 מפתח לא מוכר עובר כמו שהוא (הדף לא מציג מדריך)', 'pass', item->>'photoGuide' = 'nope', 'got', item);

  -- הכלל שהתוכנית מזהירה ממנו: בקשה חופשית עם clientLinkUrl הופכת ל«חומר עזר» שנסגר בפתיחה.
  res := public.create_onboarding_request(cid, 'custom_request', jsonb_build_object('title', 'עם קישור', 'clientTitle', 'עם קישור',
    'clientLinkUrl', 'https://example.com/x', 'requirements', jsonb_build_array(jsonb_build_object('key', 'opened', 'kind', 'confirm', 'label', 'צפייה', 'done', false))), null, null, true, false, 'client', null);
  s5 := res->>'stepId';
  res := public.build_client_portal(cid, 'live');
  select x into item from jsonb_array_elements(res->'items') x where x->>'key' = 'custom_' || s5;
  out := out || jsonb_build_object('t', '3.8 (תיעוד) clientLinkUrl ⇒ kind=guide — לכן המדריך המצולם אינו משתמש בו', 'pass', item->>'kind' = 'guide', 'got', item);

  -- ── 4 · תשובת הלקוח ───────────────────────────────────────────────────────
  perform set_config('request.jwt.claims', null, true);
  res := public.portal_submit_step(tok, s1, '{"key":"outcome","value":"תשובה שלא קיימת"}');
  out := out || jsonb_build_object('t', '4.1 ערך שאינו מהאפשרויות ⇒ bad_choice', 'pass', res->>'error' = 'bad_choice', 'got', res);
  res := public.portal_submit_step(tok, s1, '{"key":"outcome"}');
  out := out || jsonb_build_object('t', '4.2 בלי ערך ⇒ missing_value', 'pass', res->>'error' = 'missing_value', 'got', res);
  res := public.portal_submit_step(tok, s1, '{"key":"nope","value":"x"}');
  out := out || jsonb_build_object('t', '4.3 דרישה לא קיימת', 'pass', res->>'error' = 'requirement_not_found', 'got', res);
  res := public.portal_submit_step('לא-טוקן', s1, '{"key":"outcome","value":"חסרה תקופה - הגשתי עליה תביעה"}');
  out := out || jsonb_build_object('t', '4.4 טוקן זר', 'pass', res->>'error' = 'invalid', 'got', res);
  res := public.portal_submit_step(tok2, s1, '{"key":"outcome","value":"חסרה תקופה - הגשתי עליה תביעה"}');
  out := out || jsonb_build_object('t', '4.5 טוקן של לקוח אחר לבקשה הזאת', 'pass', res->>'error' = 'step_not_found', 'got', res);
  select count(*) into vi from public.onboarding_steps
   where id = s1 and status <> 'completed' and not coalesce((payload->'requirements'->0->>'done')::boolean, false);
  out := out || jsonb_build_object('t', '4.6 שום דבר לא נשמר בשגיאות', 'pass', vi = 1, 'got', (select to_jsonb(s) - 'payload' from public.onboarding_steps s where id = s1));

  res := public.portal_submit_step(tok, s1, '{"key":"outcome","value":"חסרה תקופה - הגשתי עליה תביעה"}');
  out := out || jsonb_build_object('t', '4.7 תשובה תקינה ⇒ ok, הושלמה', 'pass', (res->>'ok')::boolean and (res->>'completed')::boolean, 'got', res);
  select count(*) into vi from public.onboarding_steps
   where id = s1 and status = 'completed' and ball = 'me' and completed_at is not null
     and payload->'requirements'->0->>'value' = 'חסרה תקופה - הגשתי עליה תביעה'
     and (payload->'requirements'->0->>'done')::boolean;
  out := out || jsonb_build_object('t', '4.8 completed, ball=me, התשובה נשמרה', 'pass', vi = 1, 'got', (select to_jsonb(s) from public.onboarding_steps s where id = s1));
  select count(*) into vi from public.accountant_notifications where client_id = cid and kind = 'client_request_completed' and step_id = s1;
  out := out || jsonb_build_object('t', '4.9 «הלקוח השלים בקשה» בתור למשרד', 'pass', vi = 1, 'got', vi);
  res := public.portal_submit_step(tok, s1, '{"key":"outcome","value":"כל תקופות המילואים מופיעות - לא היה צריך להגיש"}');
  out := out || jsonb_build_object('t', '4.10 שליחה שנייה — noop, התשובה לא נדרסת', 'pass',
    (res->>'ok')::boolean and (res->>'noop')::boolean
    and (select payload->'requirements'->0->>'value' from public.onboarding_steps where id = s1) = 'חסרה תקופה - הגשתי עליה תביעה', 'got', res);
  res := public.build_client_portal(cid, 'live');
  select x into item from jsonb_array_elements(res->'items') x where x->>'key' = 'custom_' || s1;
  out := out || jsonb_build_object('t', '4.11 בדף — «הושלם», בלי פקד ובלי מדריך', 'pass',
    item->>'bucket' = 'done' and not (item ? 'actionKind') and not (item ? 'photoGuide'), 'got', item);

  -- ── 5 · ההרשאות והאימות ───────────────────────────────────────────────────
  out := out || jsonb_build_object('t', '5.1 build_client_portal סגורה ל-anon ול-authenticated', 'pass',
    not has_function_privilege('anon', 'public.build_client_portal(text,text)', 'EXECUTE')
    and not has_function_privilege('authenticated', 'public.build_client_portal(text,text)', 'EXECUTE'), 'got', null);
  begin
    perform public.assert_domain_function_invariants();
    vb := true; vt := null;
  exception when others then
    vb := false; vt := sqlerrm;
  end;
  out := out || jsonb_build_object('t', '5.2 assert_domain_function_invariants עובר', 'pass', vb, 'got', vt);
  -- ‼ 222: ענפי הסוגים עברו ל-_portal_step_items — שם השדה, פעם אחת; build_client_portal כבר לא נושאת אותו.
  out := out || jsonb_build_object('t', '5.3 הגוף החי מכיל את שדה המדריך פעם אחת (ב-_portal_step_items אחרי 222, אחרת ב-build_client_portal)', 'pass',
    (select sum(array_length(string_to_array(pg_get_functiondef(p.oid), '''photoGuide'''), 1) - 1) = 1
       from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname in ('build_client_portal', '_portal_step_items')), 'got', null);

  raise exception 'RESULTS:%', out::text;
end;
$test$;
