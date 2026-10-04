-- בדיקת 214–216 בתוך בקשה אחת שמסתיימת ב-raise — הכול מתבטל (staging-test-flows-notices.mjs).
-- ‼ __USER__ מוחלף במשתמש הבדיקות של staging. שום מייל לא נשלח: ההשלמה מדומה
-- ברמת הפונקציות (complete_client_notice עם מזהה 'test-…'), כמו send-record.
do $test$
declare
  uid    uuid := '__USER__';
  other  uuid := gen_random_uuid();
  cid    text := 'qa214c' || substr(md5(random()::text), 1, 10);
  eng    text := 'qa214e' || substr(md5(random()::text), 1, 10);
  s1     text; s2 text; s3 text; s4 text;
  res    jsonb; res2 jsonb;
  tok    uuid; tok2 uuid; tok_stale uuid;
  nid    uuid; nid2 uuid;
  v      text; vi int; vj int; vb boolean; vt timestamptz; vt2 timestamptz;
  out    jsonb := '[]'::jsonb;
  f1     text; f2 text; run1 text; run2 text; runA text;
  tpl1   text; tpl2 text; tpl3 text; tplq text; tplc text; tseed text; tcopy text; f3 text; f4 text; run3 text; run4 text;
  def1   jsonb; def2 jsonb;
  qid    text := 'qa216q' || substr(md5(random()::text), 1, 10);
  qtok   text := md5(random()::text);
  qcid   text; qeng text; qrun text; n_before int; n_after int;
  c17    text := 'qa217c' || substr(md5(random()::text), 1, 10);
  e17    text := 'qa217e' || substr(md5(random()::text), 1, 10);
  run17  text; late17 text;
  c18 text := 'qa218c' || substr(md5(random()::text), 1, 10);  e18 text := 'qa218e' || substr(md5(random()::text), 1, 10);
  c19 text := 'qa219c' || substr(md5(random()::text), 1, 10);  e19 text := 'qa219e' || substr(md5(random()::text), 1, 10);
  c20 text := 'qa220c' || substr(md5(random()::text), 1, 10);  e20 text := 'qa220e' || substr(md5(random()::text), 1, 10);
  c21 text := 'qa221c' || substr(md5(random()::text), 1, 10);  e21 text := 'qa221e' || substr(md5(random()::text), 1, 10);
  c22 text := 'qa222c' || substr(md5(random()::text), 1, 10);  e22 text := 'qa222e' || substr(md5(random()::text), 1, 10);
  crq text := 'qa224r' || substr(md5(random()::text), 1, 10);
  f18 text; run18 text; f19 text; run19 text; late19 text; f20 text; run20 text; f21 text; run21 text; run22 text;
  tplm text; fm text; runm text; qid2 text; qtok2 text; qcid2 text; qeng2 text; rrun text; rstep text;
  res3 jsonb; vk int; jid text; mid uuid; frow public.flow_runs%rowtype; vb2 boolean;
begin
  -- ── הכנה (postgres) ───────────────────────────────────────────────────────
  insert into public.clients (id, user_id, first_name, last_name, email, lifecycle_stage, family_status,
                              spouse_first_name, dealer_type)
  values (cid, uid, 'בדיקה', 'QA214', 'delivered@resend.dev', 'onboarding', 'single', null, 'licensed');
  insert into public.engagements (id, user_id, client_id, status, process_published_at)
  values (eng, uid, cid, 'onboarding', now());
  insert into public.onboarding_steps (user_id, engagement_id, client_id, step_type, track, scope, status, ball, payload, published_at)
  values (uid, eng, cid, 'custom_request', 'custom', 'person', 'pending', 'client',
          '{"title":"אישור א","clientTitle":"אישור א","requirements":[{"key":"r1","kind":"file","label":"קובץ","done":false,"required":true}]}', now())
  returning id into s1;
  insert into public.onboarding_steps (user_id, engagement_id, client_id, step_type, track, scope, status, ball, payload, published_at)
  values (uid, eng, cid, 'custom_request', 'custom', 'person', 'pending', 'client',
          '{"title":"אישור ב","clientTitle":"אישור ב","requirements":[{"key":"r1","kind":"confirm","label":"אישור","done":false,"required":true}]}', now())
  returning id into s2;

  -- ── 1 · «חדש» ─────────────────────────────────────────────────────────────
  res := public._client_notice_items(cid, 'new', 'manual', false);
  out := out || jsonb_build_object('t', '1.1 שתי בקשות חדשות', 'pass', jsonb_array_length(res->'items') = 2, 'got', res->'items');
  res := public._client_notice_items(cid, 'reminder', 'manual', false);
  out := out || jsonb_build_object('t', '1.2 אין מה להזכיר לפני שנמסר', 'pass', jsonb_array_length(res->'items') = 0, 'got', res);

  -- ── 2 · תפיסה: לחיצה כפולה, שתי לשוניות, גידור ─────────────────────────────
  res := public.claim_client_notice(uid, cid, 'new', 'K1', null, 'manual', null);
  tok := (res->>'claimToken')::uuid; nid := (res->>'noticeId')::uuid;
  out := out || jsonb_build_object('t', '2.1 תפיסה ראשונה', 'pass', coalesce((res->>'ok')::boolean, false) and jsonb_array_length(res->'items') = 2, 'got', res);
  res := public.claim_client_notice(uid, cid, 'new', 'K1', null, 'manual', null);
  out := out || jsonb_build_object('t', '2.2 אותו מפתח שוב ⇒ in_flight', 'pass', res->>'error' = 'in_flight', 'got', res);
  res := public.claim_client_notice(uid, cid, 'new', 'K2', null, 'manual', null);
  out := out || jsonb_build_object('t', '2.3 לשונית שנייה (מפתח אחר) ⇒ in_flight', 'pass', res->>'error' = 'in_flight', 'got', res);
  res := public.claim_client_notice(other, cid, 'new', 'K9', null, 'manual', null);
  out := out || jsonb_build_object('t', '2.4 משרד אחר ⇒ forbidden', 'pass', res->>'error' = 'forbidden', 'got', res);
  res := public.mark_client_notice_sending(nid, gen_random_uuid(), 'נושא', '{"html":"<p>x</p>"}');
  out := out || jsonb_build_object('t', '2.5 אסימון זר ⇒ lost_claim', 'pass', res->>'error' = 'lost_claim', 'got', res);
  res := public.mark_client_notice_sending(nid, tok, 'נושא', '{"html":"<p>x</p>","to":["delivered@resend.dev"]}');
  out := out || jsonb_build_object('t', '2.6 «שולח» עם האסימון', 'pass', coalesce((res->>'ok')::boolean, false), 'got', res);
  select updated_at into vt from public.onboarding_steps where id = s1;
  res := public.complete_client_notice(nid, tok, 'test-214-1', 'log');
  select updated_at into vt2 from public.onboarding_steps where id = s1;
  out := out || jsonb_build_object('t', '2.7 השלמה', 'pass', coalesce((res->>'ok')::boolean, false), 'got', res);
  out := out || jsonb_build_object('t', '2.8 updated_at של הבקשה לא זז', 'pass', vt = vt2, 'got', jsonb_build_object('before', vt, 'after', vt2));
  select count(*) into vi from public.client_step_notice_state where step_id in (s1, s2) and announced_version = 1;
  out := out || jsonb_build_object('t', '2.9 שתי הבקשות סומנו «נמסרו»', 'pass', vi = 2, 'got', vi);
  select count(*) into vi from public.email_messages where idempotency_key = 'notice:' || nid and status = 'sent' and kind = 'process_open';
  out := out || jsonb_build_object('t', '2.10 שורה אחת ביומן הדואר', 'pass', vi = 1, 'got', vi);
  res := public.claim_client_notice(uid, cid, 'new', 'K1', null, 'manual', null);
  out := out || jsonb_build_object('t', '2.11 אותו מפתח אחרי ההצלחה ⇒ alreadySent', 'pass', coalesce((res->>'alreadySent')::boolean, false), 'got', res);
  res := public.claim_client_notice(uid, cid, 'new', 'K3', null, 'manual', null);
  out := out || jsonb_build_object('t', '2.12 בלי חדש ⇒ nothing_to_announce', 'pass', res->>'error' = 'nothing_to_announce', 'got', res);
  res := public._client_notice_items(cid, 'reminder', 'manual', false);
  out := out || jsonb_build_object('t', '2.13 עכשיו שתיים להזכיר', 'pass', jsonb_array_length(res->'items') = 2, 'got', res);

  -- ── 3 · תוספת מאוחרת, כשל ודאי, כשל לא ודאי ───────────────────────────────
  update public.onboarding_steps
     set payload = jsonb_set(payload, '{requirements}', payload->'requirements'
                     || '[{"key":"r2","kind":"file","label":"עוד קובץ","done":false,"required":true}]'::jsonb)
   where id = s1;
  select client_content_version into vi from public.onboarding_steps where id = s1;
  out := out || jsonb_build_object('t', '3.1 פריט פתוח שנוסף ⇒ גרסה 2', 'pass', vi = 2, 'got', vi);
  res := public._client_notice_items(cid, 'new', 'manual', false);
  res2 := public._client_notice_items(cid, 'reminder', 'manual', false);
  out := out || jsonb_build_object('t', '3.2 חדש: רק המעודכנת; תזכורת: רק השנייה',
    'pass', jsonb_array_length(res->'items') = 1 and res->'items'->0->>'stepId' = s1
            and jsonb_array_length(res2->'items') = 1 and res2->'items'->0->>'stepId' = s2, 'got', jsonb_build_array(res, res2));
  update public.onboarding_steps set payload = jsonb_set(payload, '{requirements,0,done}', 'true') where id = s2;
  select client_content_version into vi from public.onboarding_steps where id = s2;
  out := out || jsonb_build_object('t', '3.3 השלמת פריט אינה «חדש»', 'pass', vi = 1, 'got', vi);

  res := public.claim_client_notice(uid, cid, 'new', 'K4', null, 'manual', null);
  tok := (res->>'claimToken')::uuid; nid := (res->>'noticeId')::uuid;
  perform public.mark_client_notice_sending(nid, tok, 'נושא', '{"html":"x"}');
  res := public.fail_client_notice(nid, tok, 'resend 422', true);
  out := out || jsonb_build_object('t', '3.4 כשל ודאי ⇒ failed', 'pass', res->>'status' = 'failed', 'got', res);
  select count(*) into vi from public.email_messages where meta->>'noticeId' = nid::text and status = 'failed' and idempotency_key is null;
  out := out || jsonb_build_object('t', '3.5 הכשל גלוי ביומן, בלי מפתח', 'pass', vi = 1, 'got', vi);
  res := public._client_notice_items(cid, 'new', 'manual', false);
  out := out || jsonb_build_object('t', '3.6 הבקשה חופשית שוב', 'pass', jsonb_array_length(res->'items') = 1, 'got', res);
  res := public.claim_client_notice(uid, cid, 'new', 'K4', null, 'manual', null);
  tok := (res->>'claimToken')::uuid;
  out := out || jsonb_build_object('t', '3.7 ניסיון חוזר אחרי כשל ודאי ⇒ מפתח ספק חדש',
    'pass', res->>'providerKey' = 'notice-' || nid || '-1', 'got', res);
  perform public.mark_client_notice_sending(nid, tok, 'נושא', '{"html":"x"}');
  res := public.fail_client_notice(nid, tok, 'fetch threw', false);
  out := out || jsonb_build_object('t', '3.8 כשל לא ודאי ⇒ unknown', 'pass', res->>'status' = 'unknown', 'got', res);
  res := public.claim_client_notice(uid, cid, 'new', 'K5', null, 'manual', null);
  out := out || jsonb_build_object('t', '3.9 «לא ידוע» חוסם הודעה חדשה', 'pass', res->>'error' = 'unknown_pending', 'got', res);
  res := public._client_notice_items(cid, 'new', 'manual', false);
  out := out || jsonb_build_object('t', '3.10 הבקשה מכוסה בהודעה הלא-ידועה', 'pass', jsonb_array_length(res->'items') = 0, 'got', res);
  tok_stale := tok;
  res := public.reclaim_unknown_client_notice(uid, nid);
  tok2 := (res->>'claimToken')::uuid;
  out := out || jsonb_build_object('t', '3.11 «שלח שוב» — אותו גוף ואותו מפתח ספק',
    'pass', coalesce((res->>'ok')::boolean, false) and res->>'providerKey' = 'notice-' || nid || '-1' and res->'requestBody'->>'html' = 'x', 'got', res);
  res := public.reclaim_unknown_client_notice(uid, nid);
  out := out || jsonb_build_object('t', '3.12 לחיצה כפולה על «שלח שוב» ⇒ in_flight', 'pass', res->>'error' = 'in_flight', 'got', res);
  res := public.complete_client_notice(nid, tok_stale, 'test-stale', 'log');
  out := out || jsonb_build_object('t', '3.13 אסימון ישן לא משלים', 'pass', res->>'error' = 'lost_claim', 'got', res);
  res := public.complete_client_notice(nid, tok2, 'test-214-2', 'log');
  out := out || jsonb_build_object('t', '3.14 השלמה עם האסימון החדש', 'pass', coalesce((res->>'ok')::boolean, false), 'got', res);
  select announced_version into vi from public.client_step_notice_state where step_id = s1;
  out := out || jsonb_build_object('t', '3.15 גרסה 2 נמסרה', 'pass', vi = 2, 'got', vi);

  -- ── 4 · חכירה שפקעה ───────────────────────────────────────────────────────
  insert into public.onboarding_steps (user_id, engagement_id, client_id, step_type, track, scope, status, ball, payload, published_at)
  values (uid, eng, cid, 'custom_request', 'custom', 'person', 'pending', 'client',
          '{"title":"אישור ג","clientTitle":"אישור ג","requirements":[{"key":"r1","kind":"confirm","label":"אישור","done":false,"required":true}]}', now())
  returning id into s3;
  res := public.claim_client_notice(uid, cid, 'new', 'K7', null, 'manual', null);
  tok := (res->>'claimToken')::uuid; nid := (res->>'noticeId')::uuid;
  update public.client_notices set lease_until = now() - interval '1 second' where id = nid;
  res := public.claim_client_notice(uid, cid, 'new', 'K8', null, 'manual', null);
  nid2 := (res->>'noticeId')::uuid;
  out := out || jsonb_build_object('t', '4.1 חכירה שפקעה לפני שליחה ⇒ תפיסה חדשה עוברת', 'pass', coalesce((res->>'ok')::boolean, false), 'got', res);
  res := public.mark_client_notice_sending(nid, tok, 'נושא', '{"html":"x"}');
  out := out || jsonb_build_object('t', '4.2 השולח הישן לא יכול לשלוח', 'pass', res->>'error' = 'lost_claim', 'got', res);
  select status into v from public.client_notices where id = nid;
  out := out || jsonb_build_object('t', '4.3 הישנה סומנה failed', 'pass', v = 'failed', 'got', v);
  update public.client_notices set status = 'cancelled', reason = 'test' where id = nid2;

  -- ── 5 · תור אוטומטי, החלפה בידנית, «רק בדף», שער התהליך ───────────────────
  vi := 0;
  perform public.enqueue_client_notice(cid, 'new', now() + interval '2 minutes');
  perform public.enqueue_client_notice(cid, 'new', now() + interval '3 minutes');
  select count(*) into vi from public.client_notices where client_id = cid and status = 'queued' and kind = 'new';
  out := out || jsonb_build_object('t', '5.1 שתי תוספות ⇒ הודעה ממתינה אחת', 'pass', vi = 1, 'got', vi);
  res := public._client_notice_items(cid, 'new', 'auto', false);
  out := out || jsonb_build_object('t', '5.2 אוטומטית כוללת רק «לבד»', 'pass', jsonb_array_length(res->'items') = 0, 'got', res);
  update public.onboarding_steps set payload = payload || '{"delivery":"auto"}' where id = s3;
  res := public._client_notice_items(cid, 'new', 'auto', false);
  out := out || jsonb_build_object('t', '5.3 …וכשהבקשה «לבד» — נכללת', 'pass', jsonb_array_length(res->'items') = 1, 'got', res);
  res := public.claim_client_notice(uid, cid, 'new', 'K10', null, 'manual', null);
  select status into v from public.client_notices where client_id = cid and kind = 'new' and origin = 'auto' order by created_at desc limit 1;
  out := out || jsonb_build_object('t', '5.4 ידנית מחליפה את הממתינה', 'pass', v = 'cancelled', 'got', v);
  perform public.fail_client_notice((res->>'noticeId')::uuid, (res->>'claimToken')::uuid, 'test', true);
  update public.onboarding_steps set payload = payload || '{"delivery":"page"}' where id = s3;
  res := public._client_notice_items(cid, 'new', 'manual', false);
  out := out || jsonb_build_object('t', '5.5 «רק בדף» לא במייל', 'pass', jsonb_array_length(res->'items') = 0, 'got', res);
  update public.engagements set process_published_at = null where id = eng;
  update public.onboarding_steps set payload = payload - 'delivery' where id = s3;
  res := public._client_notice_items(cid, 'new', 'manual', false);
  out := out || jsonb_build_object('t', '5.6 תהליך שטרם נפתח ⇒ אין על מה להודיע', 'pass', jsonb_array_length(res->'items') = 0, 'got', res);
  update public.engagements set process_published_at = now() where id = eng;
  update public.clients set email = null where id = cid;
  res := public.claim_client_notice(uid, cid, 'new', 'K11', null, 'manual', null);
  out := out || jsonb_build_object('t', '5.7 אין כתובת ⇒ no_email ושום דבר לא «נמסר»', 'pass', res->>'error' = 'no_email', 'got', res);
  update public.clients set email = 'delivered@resend.dev' where id = cid;

  -- ── 6 · המגש (כמשתמש המשרד, עם הרשאות אמיתיות) ────────────────────────────
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', uid::text, true);
  execute 'set local role authenticated';
  res := public.client_ready_to_send(cid);
  execute 'set local role postgres';
  out := out || jsonb_build_object('t', '6.1 המגש: חדש + תזכורת + לא-בתנועה',
    'pass', coalesce((res->>'ok')::boolean, false) and jsonb_array_length(res->'owner'->'items') = 1
            and jsonb_typeof(res->'owner'->'reminder'->'items') = 'array'
            and coalesce((res->'owner'->>'inFlight')::boolean, false) = false, 'got', res->'owner');
  out := out || jsonb_build_object('t', '6.2 פונקציות פנימיות סגורות ל-authenticated',
    'pass', not has_function_privilege('authenticated', 'public.claim_client_notice(uuid,text,text,text,text,text,uuid)', 'EXECUTE')
        and not has_function_privilege('authenticated', 'public.complete_client_notice(uuid,uuid,text,text,text)', 'EXECUTE')
        and not has_function_privilege('authenticated', 'public.enqueue_client_notice(text,text,timestamptz)', 'EXECUTE')
        and not has_function_privilege('authenticated', 'public._flow_materialize(text,text[],text[])', 'EXECUTE')
        and not has_function_privilege('authenticated', 'public.attach_onboarding_flow_run(text,boolean)', 'EXECUTE')
        and not has_function_privilege('anon', 'public.start_flow_run(text,text,text,boolean)', 'EXECUTE')
        and has_function_privilege('authenticated', 'public.start_flow_run(text,text,text,boolean)', 'EXECUTE'), 'got', null);
  out := out || jsonb_build_object('t', '6.3 טבלאות חדשות: RLS, בלי כתיבה ישירה',
    'pass', (select bool_and(c.relrowsecurity) from pg_class c where c.relname in
               ('client_notices', 'client_notice_items', 'client_step_notice_state', 'office_flows', 'office_flow_versions', 'flow_runs'))
        and not has_table_privilege('authenticated', 'public.client_notices', 'INSERT')
        and not has_table_privilege('authenticated', 'public.flow_runs', 'UPDATE')
        and not has_table_privilege('anon', 'public.flow_runs', 'SELECT')
        and not has_table_privilege('authenticated', 'public.office_journey_defaults', 'UPDATE'), 'got', null);

  -- ── 7 · מסלול ידני: שלבים, עצירה, חידוש ──────────────────────────────────
  insert into public.journey_templates (user_id, office_id, kind, name, entries)
  values (uid, (select office_id from public.profiles where id = uid), 'request', 'QA214 תבנית א',
          '[{"key":"e1","stepType":"custom_request","owner":"client","requiredForClose":true,"payload":{"title":"QA א","clientTitle":"QA א","requirements":[{"key":"r1","kind":"confirm","label":"אישור","done":false,"required":true}]}}]')
  returning id into tpl1;
  insert into public.journey_templates (user_id, office_id, kind, name, entries)
  values (uid, (select office_id from public.profiles where id = uid), 'request', 'QA214 תבנית ב',
          '[{"key":"e1","stepType":"custom_request","owner":"client","requiredForClose":true,"payload":{"title":"QA ב","clientTitle":"QA ב","requirements":[{"key":"r1","kind":"confirm","label":"אישור","done":false,"required":true}]}}]')
  returning id into tpl2;
  insert into public.journey_templates (user_id, office_id, kind, name, entries)
  values (uid, (select office_id from public.profiles where id = uid), 'request', 'QA214 תבנית ג',
          '[{"key":"e1","stepType":"custom_request","owner":"client","requiredForClose":true,"payload":{"title":"QA ג","clientTitle":"QA ג","requirements":[{"key":"r1","kind":"file","label":"תלוש","done":false,"required":true}]}}]')
  returning id into tpl3;
  def1 := jsonb_build_object('stages', jsonb_build_array(
    jsonb_build_object('key', 'a', 'name', 'איסוף', 'opens', jsonb_build_object('after', 'start'), 'delivery', 'approve',
      'reminder', jsonb_build_object('afterDays', 2, 'max', 2), 'notifyOffice', true,
      'items', jsonb_build_array(
        jsonb_build_object('key', 'ia', 'ref', jsonb_build_object('kind', 'template', 'templateId', tpl1)),
        jsonb_build_object('key', 'ib', 'ref', jsonb_build_object('kind', 'template', 'templateId', tpl2), 'optional', true))),
    jsonb_build_object('key', 'b', 'name', 'אישור', 'opens', jsonb_build_object('after', 'stage', 'stage', 'a'), 'delivery', 'auto',
      'notifyOffice', false,
      'items', jsonb_build_array(
        jsonb_build_object('key', 'ic', 'ref', jsonb_build_object('kind', 'template', 'templateId', tpl3), 'perPerson', true)))));
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  res := public.create_office_flow('QA214 מסלול', 'manual', def1);
  f1 := res->>'flowId';
  res2 := public.create_office_flow('QA214 פסול', 'manual',
    jsonb_build_object('stages', jsonb_build_array(jsonb_build_object('key', 'x', 'name', 'x', 'opens', jsonb_build_object('after', 'start'),
      'delivery', 'approve', 'items', jsonb_build_array(jsonb_build_object('key', 'k', 'ref', jsonb_build_object('kind', 'system', 'stepType', 'client_documents')))))));
  out := out || jsonb_build_object('t', '7.0 בקשת מערכת במסלול ידני ⇒ נדחית', 'pass', res2->>'error' = 'system_in_repeatable_flow', 'got', res2);
  res := public.start_flow_run(cid, f1, null, false);
  run1 := res->>'runId';
  res2 := public.start_flow_run(cid, f1, null, false);
  execute 'set local role postgres';
  out := out || jsonb_build_object('t', '7.1 הפעלה', 'pass', coalesce((res->>'ok')::boolean, false) and jsonb_array_length(res->'created') = 3, 'got', res);
  out := out || jsonb_build_object('t', '7.2 הפעלה כפולה ⇒ already_active', 'pass', res2->>'error' = 'already_active', 'got', res2);
  select status into v from public.onboarding_steps where flow_run_id = run1 and flow_item_key = 'ic';
  out := out || jsonb_build_object('t', '7.3 שלב ב נעול', 'pass', v = 'locked', 'got', v);
  select count(*) into vi from public.onboarding_step_dependencies d join public.onboarding_steps s on s.id = d.step_id
   where s.flow_run_id = run1 and s.flow_item_key = 'ic' and d.origin = 'flow';
  out := out || jsonb_build_object('t', '7.4 שער השלב: רק על החובה (לא על הרשות)', 'pass', vi = 1, 'got', vi);
  select (state->'stages'->'a'->>'openedAt') is not null into vb from public.flow_runs where id = run1;
  out := out || jsonb_build_object('t', '7.5 שלב א נפתח', 'pass', vb, 'got', vb);
  select required_for_close into vb from public.onboarding_steps where flow_run_id = run1 and flow_item_key = 'ia';
  out := out || jsonb_build_object('t', '7.6 מסלול ידני לא חוסם סגירת קליטה', 'pass', vb = false, 'got', vb);

  -- עצירה ⇒ השלמה לא פותחת שלב
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  res := public.pause_flow_run(run1);
  select id into s4 from public.onboarding_steps where flow_run_id = run1 and flow_item_key = 'ia';
  res2 := public.advance_onboarding_step(s4, 'complete', '{}'::jsonb);
  execute 'set local role postgres';
  select status into v from public.onboarding_steps where flow_run_id = run1 and flow_item_key = 'ic';
  out := out || jsonb_build_object('t', '7.7 בעצירה — השלב הבא נשאר נעול', 'pass', v = 'locked' and coalesce((res->>'ok')::boolean, false), 'got', jsonb_build_array(v, res, res2));
  select (state->'stages'->'a'->>'doneAt') is null into vb from public.flow_runs where id = run1;
  out := out || jsonb_build_object('t', '7.8 בעצירה — שלב לא «הושלם»', 'pass', vb, 'got', vb);
  select count(*) into vi from public.accountant_notifications where client_id = cid and kind = 'flow_stage_done';
  out := out || jsonb_build_object('t', '7.9 בעצירה — אין הודעה למשרד', 'pass', vi = 0, 'got', vi);
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  res := public.resume_flow_run(run1);
  execute 'set local role postgres';
  select status into v from public.onboarding_steps where flow_run_id = run1 and flow_item_key = 'ic';
  out := out || jsonb_build_object('t', '7.10 חידוש פותח את השלב', 'pass', v = 'pending', 'got', jsonb_build_array(v, res));
  select count(*) into vi from public.accountant_notifications where client_id = cid and kind = 'flow_stage_done';
  out := out || jsonb_build_object('t', '7.11 הודעה אחת למשרד על שלב שהושלם', 'pass', vi = 1, 'got', vi);
  select count(*) into vi from public.client_notices where client_id = cid and status = 'queued' and kind = 'new';
  out := out || jsonb_build_object('t', '7.12 שלב «לבד» שנפתח ⇒ מייל ממתין אחד', 'pass', vi = 1, 'got', vi);

  -- ── 8 · ביטול ⇒ לא פותח, לא מודיע, נשאר מבוטל ──────────────────────────────
  update public.client_notices set status = 'cancelled' where client_id = cid and status = 'queued';
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  res := public.cancel_flow_run(run1);
  execute 'set local role postgres';
  select status into v from public.flow_runs where id = run1;
  out := out || jsonb_build_object('t', '8.1 ביטול: הריצה נשארת מבוטלת', 'pass', v = 'cancelled' and coalesce((res->>'ok')::boolean, false), 'got', jsonb_build_array(v, res));
  select count(*) into vi from public.onboarding_steps where flow_run_id = run1 and status not in ('completed', 'cancelled');
  out := out || jsonb_build_object('t', '8.2 מה שפתוח ירד (מה שהושלם נשאר)', 'pass', vi = 0, 'got', vi);
  select count(*) into vi from public.accountant_notifications where client_id = cid and kind = 'flow_stage_done';
  select count(*) into vi from public.client_notices where client_id = cid and status = 'queued';
  out := out || jsonb_build_object('t', '8.3 ביטול לא מכניס מייל לתור', 'pass', vi = 0, 'got', vi);

  -- ── 9 · גרסה חדשה ועדכון ללקוח; נישואים ⇒ הצעה ─────────────────────────────
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  res := public.start_flow_run(cid, f1, null, false);
  run2 := res->>'runId';
  def2 := jsonb_set(def1, '{stages,0,items}', (def1->'stages'->0->'items') ||
           jsonb_build_array(jsonb_build_object('key', 'id', 'ref', jsonb_build_object('kind', 'template', 'templateId', tpl3))));
  res := public.save_office_flow(f1, 1, def2, null, 'הוספה', null);
  res2 := public.save_office_flow(f1, 1, def2, null, 'שוב', null);
  out := out || jsonb_build_object('t', '9.1 שמירה = גרסה 2; שמירה על בסיס ישן ⇒ version_conflict',
    'pass', (res->>'version')::int = 2 and res2->>'error' = 'version_conflict', 'got', jsonb_build_array(res, res2));
  res := public.flow_run_upgrade_preview(run2);
  out := out || jsonb_build_object('t', '9.2 תצוגת הבדלים: פריט אחד נוסף', 'pass', jsonb_array_length(res->'added') = 1 and res->'added'->0->>'itemKey' = 'id', 'got', res);
  res := public.flow_run_upgrade_apply(run2, 2, array['id'], '{}');
  out := out || jsonb_build_object('t', '9.3 עדכון יוצר רק מה שנבחר', 'pass', jsonb_array_length(res->'created') = 1, 'got', res);
  execute 'set local role postgres';
  select count(*) into vi from public.onboarding_events where meta->>'flowEvent' = 'upgraded' and meta->>'flowRunId' = run2;
  out := out || jsonb_build_object('t', '9.4 העדכון נרשם ביומן', 'pass', vi = 1, 'got', vi);
  update public.clients set family_status = 'married', spouse_first_name = 'רונית' where id = cid;
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  res := public.flow_run_suggestions(run2);
  execute 'set local role postgres';
  out := out || jsonb_build_object('t', '9.5 נישואים ⇒ הצעה להוסיף לבן/בת הזוג (לא אוטומטי)',
    'pass', exists (select 1 from jsonb_array_elements(res->'suggestions') x where x->>'kind' = 'add_person' and x->>'itemKey' = 'ic'), 'got', res);
  select count(*) into vi from public.onboarding_steps where flow_run_id = run2 and payload->>'subjectRole' = 'spouse';
  out := out || jsonb_build_object('t', '9.6 …ושום דבר לא נוסף לבד', 'pass', vi = 0, 'got', vi);

  -- ── 10 · שנתי: מחזור חדש = ריצה חדשה; שנה קודמת שהושלמה לא פוטרת ─────────
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  res := public.create_office_flow('QA214 שנתי', 'annual', jsonb_build_object('stages', jsonb_build_array(
    jsonb_build_object('key', 'y', 'name', 'מסמכים לדוח', 'opens', jsonb_build_object('after', 'start'), 'delivery', 'approve',
      'items', jsonb_build_array(jsonb_build_object('key', 'docs', 'ref', jsonb_build_object('kind', 'template', 'templateId', tpl1)))))));
  f2 := res->>'flowId';
  res := public.start_flow_run(cid, f2, '2025', false);
  runA := res->>'runId';
  select id into s4 from public.onboarding_steps where flow_run_id = runA;
  res2 := public.advance_onboarding_step(s4, 'complete', '{}'::jsonb);
  res := public.start_flow_run(cid, f2, '2025', false);
  out := out || jsonb_build_object('t', '10.1 שנה שהושלמה, שוב ⇒ «הושלמה» (לא «פעיל»), בלי ריצה חדשה', 'pass', res->>'error' = 'cycle_done' and res->>'runId' = runA, 'got', res);
  res := public.start_flow_run(cid, f2, '2026', false);
  execute 'set local role postgres';
  out := out || jsonb_build_object('t', '10.2 שנה חדשה ⇒ בקשה חדשה למרות שהקודמת הושלמה', 'pass', jsonb_array_length(res->'created') = 1, 'got', res);
  select count(*) filter (where payload->>'title' like '%(2025)%'), count(*) filter (where payload->>'title' like '%(2026)%')
    into vi, vj from public.onboarding_steps where flow_run_id in (runA, res->>'runId');
  out := out || jsonb_build_object('t', '10.2א השנה בכותרת — שתי השנים לא נראות זהות', 'pass', vi = 1 and vj = 1,
    'got', (select jsonb_agg(payload->>'title') from public.onboarding_steps where flow_run_id in (runA, res->>'runId')));
  res := public._flow_materialize(res->>'runId', array['docs'], null);
  out := out || jsonb_build_object('t', '10.3 אירוע חוזר על אותה ריצה לא יוצר שוב', 'pass', jsonb_array_length(res->'created') = 0, 'got', res);

  -- ── 11 · פעולה מול רשות: «לבד» רק עם הרשאת הריצה, ובלי מחשב — ממתין לך ────
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  res := public.create_office_flow('QA214 פעולה', 'manual', jsonb_build_object('stages', jsonb_build_array(
    jsonb_build_object('key', 'p', 'name', 'רענון', 'opens', jsonb_build_object('after', 'start'), 'delivery', 'page',
      'items', jsonb_build_array(jsonb_build_object('key', 'sync', 'mode', 'auto',
        'ref', jsonb_build_object('kind', 'action', 'actionId', 'shaam-sync', 'actionType', 'shaam.sync_income_tax_file')))))));
  res2 := public.create_office_flow('QA214 פעולה פסולה', 'manual', jsonb_build_object('stages', jsonb_build_array(
    jsonb_build_object('key', 'p', 'name', 'x', 'opens', jsonb_build_object('after', 'start'), 'delivery', 'page',
      'items', jsonb_build_array(jsonb_build_object('key', 'c', 'mode', 'auto',
        'ref', jsonb_build_object('kind', 'action', 'actionId', 'shaam-create', 'actionType', 'shaam.create_representation')))))));
  out := out || jsonb_build_object('t', '11.1 פעולת שינוי מול רשות לא נכנסת למסלול', 'pass', res2->>'error' = 'action_not_supported', 'got', res2);
  res2 := public.start_flow_run(cid, res->>'flowId', null, false);
  execute 'set local role postgres';
  select state->'actions'->'sync' into res from public.flow_runs where id = res2->>'runId';
  out := out || jsonb_build_object('t', '11.2 בלי אישור בהפעלה ⇒ ממתין לך (לא רץ)', 'pass', res->>'state' = 'waiting_office' and res->>'reason' = 'run_not_authorized', 'got', res);
  select count(*) into vi from public.automation_jobs where client_id = cid;
  out := out || jsonb_build_object('t', '11.3 לא נוצרה משימה מול רשות', 'pass', vi = 0, 'got', vi);

  -- ── 12 · אישור הצעה ⇒ ריצת קליטה אחת; אישור חוזר לא משכפל ─────────────────
  select count(*) into vi from public.office_flows where office_id = (select office_id from public.profiles where id = uid)
     and trigger = 'quote_approved' and status = 'active';
  out := out || jsonb_build_object('t', '12.0 למשרד יש מסלול קליטה (מילוי)', 'pass', vi = 1, 'got', vi);
  insert into public.leads (id, user_id, full_name, email, phone, status, has_previous_accountant)
  values ('qa216l' || qid, uid, 'קליטה QA216', 'delivered@resend.dev', '050-0216216', 'new', true);
  insert into public.quotations (id, user_id, lead_id, quotation_number, status, public_token, items, representation, vat_rate, sent_at)
  values (qid, uid, 'qa216l' || qid, 'QA216-' || qid, 'sent', qtok,
          '[{"id":"i1","serviceId":"s1","name":"הנהלת חשבונות","category":"monthly","billingType":"monthly","catalogPrice":1200,"clientPrice":1200,"quantity":1,"vatFlag":true}]',
          '{"enabled":false,"areas":{},"spouse":null,"prefill":{"firstName":"קליטה","lastName":"QA216","email":"delivered@resend.dev","phone":"050-0000216"}}', 18, now());
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  res := public.ensure_client_for_quotation(qid);
  execute 'set local role postgres';
  select client_id into qcid from public.quotations where id = qid;
  update public.clients set dealer_type = 'licensed' where id = qcid;
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  perform set_config('request.jwt.claim.sub', '', true);
  execute 'set local role anon';
  res := public.approve_quotation(qtok, null, 'QA216');
  execute 'set local role postgres';
  select id into qeng from public.engagements where client_id = qcid order by created_at desc limit 1;
  select id into qrun from public.flow_runs where client_id = qcid and cycle_key = qeng;
  out := out || jsonb_build_object('t', '12.1 אישור ⇒ ריצת קליטה', 'pass', qrun is not null, 'got', res);
  select count(*) into vi from public.onboarding_steps where client_id = qcid and flow_run_id = qrun;
  select count(*) into n_before from public.onboarding_steps where client_id = qcid and status <> 'cancelled';
  out := out || jsonb_build_object('t', '12.2 בקשות הקליטה משויכות לריצה', 'pass', vi >= 2, 'got', jsonb_build_object('stamped', vi, 'all', n_before));
  select coalesce((state->>'autoActions')::boolean, false) into vb from public.flow_runs where id = qrun;
  out := out || jsonb_build_object('t', '12.3 התקשרות חדשה ⇒ הריצה מורשית לפעולות «לבד»', 'pass', vb, 'got', vb);
  -- «מחכה לאישורך» ⇒ הדף טרם נפתח (כמו היום); כל בחירה אחרת בשלב הראשון ⇒ נפתח באישור.
  select (process_published_at is null) = (
           coalesce((select s->>'delivery' from public.office_flows f
                       join public.office_flow_versions fv on fv.flow_id = f.id and fv.version = f.current_version,
                       jsonb_array_elements(fv.definition->'stages') s
                      where f.office_id = (select office_id from public.profiles where id = uid) and f.trigger = 'quote_approved'
                        and f.status = 'active' and s->'opens'->>'after' = 'start' limit 1), 'hold') = 'hold')
    into vb from public.engagements where id = qeng;
  out := out || jsonb_build_object('t', '12.4 הדף נפתח באישור לפי «איך מגיע ללקוח» של השלב הראשון', 'pass', vb, 'got', vb);
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  execute 'set local role anon';
  res := public.approve_quotation(qtok, null, 'QA216');
  execute 'set local role postgres';
  select count(*) into vi from public.flow_runs where client_id = qcid;
  select count(*) into n_after from public.onboarding_steps where client_id = qcid and status <> 'cancelled';
  out := out || jsonb_build_object('t', '12.5 אישור חוזר ⇒ אותה ריצה ואותן בקשות', 'pass', vi = 1 and n_after = n_before, 'got', jsonb_build_object('runs', vi, 'before', n_before, 'after', n_after));
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', uid::text, true);
  execute 'set local role authenticated';
  res := public.cancel_flow_run(qrun);
  execute 'set local role postgres';
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  perform set_config('request.jwt.claim.sub', '', true);
  execute 'set local role anon';
  res2 := public.approve_quotation(qtok, null, 'QA216');
  execute 'set local role postgres';
  select count(*) into n_after from public.onboarding_steps where client_id = qcid and status not in ('cancelled');
  select count(*) into vi from public.onboarding_steps where client_id = qcid and status not in ('cancelled', 'completed') and flow_run_id = qrun;
  out := out || jsonb_build_object('t', '12.6 ביטול ריצת הקליטה ואישור חוזר ⇒ שום דבר לא חוזר לחיים',
    'pass', vi = 0 and n_after <= n_before, 'got', jsonb_build_object('cancel', res, 'after', n_after, 'before', n_before));

  -- ── 13 · רגרסיות מסקירת הקוד ─────────────────────────────────────────────
  -- מפתח של חלון אחד לא נמשך ללקוח אחר
  res := public.claim_client_notice(uid, qcid, 'new', 'K1', null, 'manual', null);
  out := out || jsonb_build_object('t', '13.1 מפתח שכבר שימש ללקוח אחר ⇒ conflict', 'pass', res->>'error' = 'idempotency_key_conflict', 'got', res);
  -- «שלח שוב» אחרי שהכתובת תוקנה — לא לכתובת הישנה
  insert into public.onboarding_steps (user_id, engagement_id, client_id, step_type, track, scope, status, ball, payload, published_at)
  values (uid, eng, cid, 'custom_request', 'custom', 'person', 'pending', 'client',
          '{"title":"אישור ד","clientTitle":"אישור ד","requirements":[{"key":"r1","kind":"confirm","label":"אישור","done":false,"required":true}]}', now());
  update public.client_notices set status = 'cancelled' where client_id = cid and status in ('queued', 'claimed', 'sending', 'unknown');
  res := public.claim_client_notice(uid, cid, 'new', 'K20', null, 'manual', null);
  perform public.mark_client_notice_sending((res->>'noticeId')::uuid, (res->>'claimToken')::uuid, 'נושא', '{"html":"x"}', null, 'process_open');
  perform public.fail_client_notice((res->>'noticeId')::uuid, (res->>'claimToken')::uuid, 'timeout', false);
  update public.clients set email = 'delivered+fixed@resend.dev' where id = cid;
  res2 := public.reclaim_unknown_client_notice(uid, (res->>'noticeId')::uuid);
  out := out || jsonb_build_object('t', '13.2 הכתובת תוקנה ⇒ לא שולחים את הישן (recipient_changed)', 'pass', res2->>'error' = 'recipient_changed', 'got', res2);
  update public.clients set email = 'delivered@resend.dev' where id = cid;
  -- דילוג בלי סיבה מוכרת לא מסמן שלב «הושלם»
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', uid::text, true);
  execute 'set local role authenticated';
  res := public.start_flow_run(cid, f1, null, false);
  select id into s4 from public.onboarding_steps where flow_run_id = res->>'runId' and flow_item_key = 'ia';
  res2 := public.advance_onboarding_step(s4, 'skip', '{"reason":"יש כבר בתיק"}'::jsonb);
  execute 'set local role postgres';
  select (state->'stages'->'a'->>'doneAt') is null into vb from public.flow_runs where id = res->>'runId';
  out := out || jsonb_build_object('t', '13.3 דילוג עם סיבה חופשית ⇒ השלב לא «הושלם» (כמו הקשתות)', 'pass', vb, 'got', res2);
  -- תבנית שנשמרת מבקשה במסלול לא נושאת «רק בדף»/נושא
  select public.template_payload_from_step(payload) into res from public.onboarding_steps where id = s4;
  out := out || jsonb_build_object('t', '13.4 שמירה לספרייה מנקה שדות של ריצה', 'pass',
    not (res ? 'delivery') and not (res ? 'flowOrigin') and not (res ? 'skipReason'), 'got', res);
  -- הגדרה פסולה בלי יעד ל«אחרי»
  out := out || jsonb_build_object('t', '13.5 «נפתח אחרי שלב» בלי שלב ⇒ נדחה', 'pass',
    public.flow_definition_error(jsonb_build_object('stages', jsonb_build_array(
      jsonb_build_object('key', 'a', 'name', 'א', 'opens', jsonb_build_object('after', 'start'), 'delivery', 'approve', 'items', '[]'::jsonb),
      jsonb_build_object('key', 'b', 'name', 'ב', 'opens', jsonb_build_object('after', 'stage'), 'delivery', 'approve', 'items', '[]'::jsonb))), 'manual') = 'bad_opens', 'got', null);
  -- בקשת מסמכים בלי רשימה מדולגת במסלול שחוזר ⇒ הספרייה לא שומרת אותה כך
  res := public.upsert_library_request(null, 'בדיקה ריקה', null,
    jsonb_build_object('stepType', 'client_documents', 'owner', 'client', 'payload', '{}'::jsonb));
  res2 := public.upsert_library_request(null, 'בדיקה מלאה', null,
    jsonb_build_object('stepType', 'client_documents', 'owner', 'client',
      'payload', jsonb_build_object('checklist', jsonb_build_array(jsonb_build_object('key', 'a', 'label', 'תלוש', 'done', false)))));
  out := out || jsonb_build_object('t', '13.6 מסמכים בלי רשימה ⇒ no_documents; עם רשימה ⇒ נשמר', 'pass',
    res->>'error' = 'no_documents' and (res2->>'ok')::boolean, 'got', jsonb_build_array(res, res2));
  -- ── 15 · אחרי הביקורת: בן/בת זוג, שנה שבוטלה, סוג שלא חוזר, מובנית שהותאמה, עדכון, טיוטות ──
  -- cid נשוי/אה לרונית מ-9.5. בקשה «לכל אדם» עם קובץ ⇒ גם לרונית, עם השם; אישור אישי ⇒ רק לבעל הכרטיס.
  insert into public.journey_templates (user_id, office_id, kind, name, entries)
  values (uid, (select office_id from public.profiles where id = uid), 'request', 'QA215 אישור אישי',
          '[{"key":"e1","stepType":"custom_request","owner":"client","requiredForClose":true,"payload":{"title":"QA אישור","clientTitle":"QA אישור","requirements":[{"key":"r1","kind":"confirm","label":"אני מאשר","done":false,"required":true}]}}]')
  returning id into tplc;
  insert into public.journey_templates (user_id, office_id, kind, name, entries)
  values (uid, (select office_id from public.profiles where id = uid), 'request', 'QA215 שאלון',
          '[{"key":"e1","stepType":"intake_questionnaire","owner":"client","requiredForClose":true,"payload":{"title":"QA שאלון"}}]')
  returning id into tplq;
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  res := public.create_office_flow('QA215 שנתי בני זוג', 'annual', jsonb_build_object('stages', jsonb_build_array(
    jsonb_build_object('key', 'p', 'name', 'איסוף', 'opens', jsonb_build_object('after', 'start'), 'delivery', 'approve',
      'items', jsonb_build_array(
        jsonb_build_object('key', 'f', 'ref', jsonb_build_object('kind', 'template', 'templateId', tpl3), 'perPerson', true),
        jsonb_build_object('key', 'c', 'ref', jsonb_build_object('kind', 'template', 'templateId', tplc), 'perPerson', true),
        jsonb_build_object('key', 'q', 'ref', jsonb_build_object('kind', 'template', 'templateId', tplq)))),
    jsonb_build_object('key', 'h', 'name', 'באישורך', 'opens', jsonb_build_object('after', 'start'), 'delivery', 'hold',
      'items', jsonb_build_array(jsonb_build_object('key', 'hh', 'ref', jsonb_build_object('kind', 'template', 'templateId', tpl1)))))));
  f3 := res->>'flowId';
  res := public.start_flow_run(cid, f3, '2025', false);
  run3 := res->>'runId';
  res2 := public.flow_run_suggestions(run3);
  execute 'set local role postgres';
  select count(*) filter (where payload->>'subjectRole' = 'spouse' and payload->>'title' like '%(2025) - רונית' and payload->>'subjectName' = 'רונית'),
         count(*) filter (where payload->>'subjectRole' = 'client' and payload->>'title' like '%(2025) - בדיקה')
    into vi, vj from public.onboarding_steps where flow_run_id = run3 and flow_item_key = 'f';
  out := out || jsonb_build_object('t', '15.1 «לכל אדם» עם קובץ ⇒ שתי בקשות, כל אחת עם השם והשנה', 'pass', vi = 1 and vj = 1,
    'got', (select jsonb_agg(payload->>'title') from public.onboarding_steps where flow_run_id = run3));
  select count(*) filter (where payload->>'subjectRole' = 'client' and ball = 'client'),
         count(*) filter (where payload->>'subjectRole' = 'spouse' and ball = 'me' and payload->>'personalConfirmFor' = 'c'
                            and payload->>'title' like 'אישור אישי של רונית — «%' and payload ? 'officeNote')
    into vi, vj from public.onboarding_steps where flow_run_id = run3 and flow_item_key = 'c';
  out := out || jsonb_build_object('t', '15.2 אישור אישי: לבעל הכרטיס בקשה בדף; לבן/בת הזוג — משימה למשרד (לא בדף, לא נשמט)', 'pass',
    vi = 1 and vj = 1 and exists (select 1 from jsonb_array_elements(res->'created') x where x->>'itemKey' = 'c' and x->>'role' = 'spouse' and (x->>'officeTask')::boolean),
    'got', jsonb_build_array(res->'created', (select jsonb_agg(jsonb_build_object('t', payload->>'title', 'ball', ball)) from public.onboarding_steps where flow_run_id = run3 and flow_item_key = 'c')));
  select count(*) into vi from public._client_announceable_steps(cid) a join public.onboarding_steps s on s.id = a.step_id
   where s.flow_run_id = run3 and s.payload->>'personalConfirmFor' is not null;
  out := out || jsonb_build_object('t', '15.2א משימת המשרד לא נכנסת למייל ללקוח', 'pass', vi = 0, 'got', vi);
  out := out || jsonb_build_object('t', '15.3 סוג «אחד לכל החיים» במסלול שנתי ⇒ דולג (not_repeatable), לא «הושלם בעבר»', 'pass',
    not exists (select 1 from public.onboarding_steps where flow_run_id = run3 and flow_item_key = 'q')
    and exists (select 1 from jsonb_array_elements(res->'skipped') x where x->>'itemKey' = 'q' and x->>'reason' = 'not_repeatable'),
    'got', res->'skipped');
  out := out || jsonb_build_object('t', '15.4 אישור אישי לא מוצע לבן/בת הזוג (בלי הצעה שחוזרת לנצח)', 'pass',
    not exists (select 1 from jsonb_array_elements(res2->'suggestions') x where x->>'kind' = 'add_person'), 'got', res2);
  -- טיוטה בשלב «הכול באישורך» נספרת רק ב«מחכים לאישורך», לא «אצל הלקוח»
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  res := public.get_client_flow_runs(cid);
  execute 'set local role postgres';
  select x->'counts' into res2 from jsonb_array_elements(res->'runs') rr, jsonb_array_elements(rr->'stages') x
   where rr->>'id' = run3 and x->>'key' = 'h';
  out := out || jsonb_build_object('t', '15.5 טיוטה: «מחכים לאישורך» 1, «אצל הלקוח» 0', 'pass',
    (res2->>'drafts')::int = 1 and (res2->>'client')::int = 0, 'got', res2);

  -- שנה שבוטלה ⇒ מתחילה מחדש באותה ריצה: מה שהושלם נשאר, מה שבוטל נוצר מחדש
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select id into s4 from public.onboarding_steps where flow_run_id = run3 and flow_item_key = 'f' and payload->>'subjectRole' = 'client';
  res2 := public.advance_onboarding_step(s4, 'complete', '{}'::jsonb);
  res2 := public.cancel_flow_run(run3);
  res := public.start_flow_run(cid, f3, '2025', false);
  execute 'set local role postgres';
  select status into v from public.flow_runs where id = run3;
  select count(*) filter (where status = 'completed' and payload->>'subjectRole' = 'client'),
         count(*) filter (where status not in ('cancelled', 'completed') and payload->>'subjectRole' = 'spouse')
    into vi, vj from public.onboarding_steps where flow_run_id = run3 and flow_item_key = 'f';
  out := out || jsonb_build_object('t', '15.6 שנה שבוטלה ⇒ «הופעל מחדש» באותה ריצה; מה שהושלם לא נפתח שוב', 'pass',
    coalesce((res->>'restarted')::boolean, false) and res->>'runId' = run3 and v = 'active' and vi = 1 and vj = 1,
    'got', jsonb_build_array(res, v, vi, vj));

  -- מובנית שהמשרד התאים ⇒ הפריט שמצביע על המובנית קורא את ההתאמה
  insert into public.journey_templates (user_id, office_id, kind, name, seed_key, entries)
  values (uid, null, 'request', 'QA215 מובנית', 'qa215seed',
          '[{"key":"e1","stepType":"custom_request","owner":"client","payload":{"title":"מובנית","requirements":[{"key":"r1","kind":"file","label":"ישן","done":false,"required":true}]}}]')
  returning id into tseed;
  insert into public.journey_templates (user_id, office_id, kind, name, seed_key, entries)
  values (uid, (select office_id from public.profiles where id = uid), 'request', 'QA215 מובנית של המשרד', 'qa215seed',
          '[{"key":"e1","stepType":"custom_request","owner":"client","payload":{"title":"של המשרד","requirements":[{"key":"r1","kind":"file","label":"חדש","done":false,"required":true}]}}]')
  returning id into tcopy;
  res := public._flow_item_spec(uid, jsonb_build_object('key', 'z', 'ref', jsonb_build_object('kind', 'template', 'templateId', tseed)), true);
  out := out || jsonb_build_object('t', '15.7 פריט שמצביע על מובנית ⇒ קורא את ההתאמה של המשרד', 'pass',
    (public._library_template((select office_id from public.profiles where id = uid), tseed)).id = tcopy
    and res->>'title' = 'QA215 מובנית של המשרד' and res->'payload'->'requirements'->0->>'label' = 'חדש', 'got', res);

  -- עדכון גרסה: שינוי בשלב ובחובה/רשות מוצג; פריט שלא ייווצר — לא מסומן מראש
  insert into public.journey_templates (user_id, office_id, kind, name, entries)
  values (uid, (select office_id from public.profiles where id = uid), 'request', 'QA215 ריקה',
          '[{"key":"e1","stepType":"custom_request","owner":"client","payload":{"title":"ריקה","requirements":[]}}]')
  returning id into tplq;
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select definition into def2 from public.office_flow_versions where flow_id = f3 and version = 1;
  def2 := jsonb_set(def2, '{stages,0,notifyOffice}', 'true'::jsonb);
  def2 := jsonb_set(def2, '{stages,0,items,0,optional}', 'true'::jsonb);
  def2 := jsonb_set(def2, '{stages,0,items}', (def2->'stages'->0->'items') ||
           jsonb_build_array(jsonb_build_object('key', 'g', 'ref', jsonb_build_object('kind', 'template', 'templateId', tplq))));
  res2 := public.save_office_flow(f3, 1, def2, null, 'שינוי', null);
  res := public.flow_run_upgrade_preview(run3);
  execute 'set local role postgres';
  out := out || jsonb_build_object('t', '15.8 עדכון: שינוי בשלב (הודעה אליך) ובחובה/רשות מוצגים; בקשה ריקה לא «תיפתח»', 'pass',
    exists (select 1 from jsonb_array_elements(res->'stageChanges') x where x->>'stageKey' = 'p' and x->'what' ? 'notifyOffice')
    and exists (select 1 from jsonb_array_elements(res->'changed') x where x->>'itemKey' = 'f' and x->'what' ? 'now_optional')
    and exists (select 1 from jsonb_array_elements(res->'added') x where x->>'itemKey' = 'g' and x->>'addable' = 'false' and x->>'notAddableReason' = 'no_requirements'),
    'got', jsonb_build_array(res2, res));
  -- ── 16 · הצעה עם ייצוג ⇒ גם הבקשות שהמשרד הוסיף לקליטה נוצרות ─────────────────
  -- ‼ בקשת הייצוג מאומצת להתקשרות ברגע שהיא נוצרת; קודם המחולל ראה אותה, חשב שהקליטה
  -- «כבר התחילה», ודילג על כל בקשות המשרד.
  qid := 'qa216r' || substr(md5(random()::text), 1, 10);
  qtok := md5(random()::text);
  insert into public.leads (id, user_id, full_name, email, phone, status, has_previous_accountant)
  values ('qa216l' || qid, uid, 'ייצוג QA216', 'delivered@resend.dev', '050-0216217', 'new', false);
  insert into public.quotations (id, user_id, lead_id, quotation_number, status, public_token, items, representation, vat_rate, sent_at)
  values (qid, uid, 'qa216l' || qid, 'QA216R-' || qid, 'sent', qtok,
          '[{"id":"i1","serviceId":"s1","name":"הנהלת חשבונות","category":"monthly","billingType":"monthly","catalogPrice":1200,"clientPrice":1200,"quantity":1,"vatFlag":true}]',
          '{"enabled":true,"areas":{"incomeTax":{"status":"in_process","level":"primary"},"nationalInsurance":{"status":"in_process","targets":["client"]}},"spouse":null,"prefill":{"firstName":"ייצוג","lastName":"QA216","email":"delivered@resend.dev","phone":"050-0000217"}}', 18, now());
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', uid::text, true);
  execute 'set local role authenticated';
  res := public.ensure_client_for_quotation(qid);
  execute 'set local role postgres';
  select client_id into qcid from public.quotations where id = qid;
  update public.clients set dealer_type = 'licensed' where id = qcid;
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  perform set_config('request.jwt.claim.sub', '', true);
  execute 'set local role anon';
  res := public.approve_quotation(qtok, null, 'QA216R');
  execute 'set local role postgres';
  select id into qeng from public.engagements where client_id = qcid order by created_at desc limit 1;
  select count(*) into vi from jsonb_array_elements(coalesce((select entries from public.office_journey_defaults
     where office_id = (select office_id from public.profiles where id = uid) and client_kind = 'licensed_dealer'), '[]'::jsonb)) x
   where x->>'source' = 'office' and coalesce(x->>'enabled', 'true') <> 'false' and x->'when' is null;
  select count(*) into vj from public.onboarding_steps where engagement_id = qeng and payload->'defaultOrigin'->>'kind' = 'office_default';
  out := out || jsonb_build_object('t', '16.1 הצעה עם ייצוג ⇒ צילום נלקח, ובקשות המשרד לקליטה נוצרו', 'pass',
    (select journey_default_snapshot is not null from public.engagements where id = qeng)
    and exists (select 1 from public.onboarding_steps where engagement_id = qeng and step_type = 'representation')
    and vj = vi,
    'got', jsonb_build_object('officeEntries', vi, 'created', vj));
  -- ── 17 · בקשה שצורפה לשלב אחר כך מחזיקה את השלב עד שהיא נסגרת ─────────────────
  execute 'set local role postgres';
  insert into public.clients (id, user_id, first_name, last_name, email, lifecycle_stage, family_status, dealer_type)
  values (c17, uid, 'בדיקה', 'QA217', 'delivered@resend.dev', 'onboarding', 'single', 'licensed');
  insert into public.engagements (id, user_id, client_id, status, process_published_at) values (e17, uid, c17, 'onboarding', now());
  insert into public.onboarding_steps (user_id, engagement_id, client_id, step_type, track, scope, status, ball, payload, published_at)
  values (uid, e17, c17, 'custom_request', 'custom', 'person', 'pending', 'client',
          '{"title":"בקשה מאוחרת","clientTitle":"בקשה מאוחרת","requirements":[{"key":"r1","kind":"confirm","label":"אישור","done":false,"required":true}]}', now())
  returning id into late17;
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', uid::text, true);
  execute 'set local role authenticated';
  res := public.start_flow_run(c17, f1, null, false);
  run17 := res->>'runId';
  res2 := public.attach_step_to_flow_stage(late17, run17, 'a');
  -- כל הפריטים המקוריים של השלב שאינם «רשות» (הגרסה הנוכחית של f1 כוללת גם את מה שנוסף ב-15.8)
  for s4 in select id from public.onboarding_steps where flow_run_id = run17 and flow_stage_key = 'a'
               and flow_item_key not like 'adhoc-%' and flow_item_key <> 'ib' loop
    perform public.advance_onboarding_step(s4, 'complete', '{}'::jsonb);
  end loop;
  execute 'set local role postgres';
  select (state->'stages'->'a'->>'doneAt') is null into vb from public.flow_runs where id = run17;
  select status into v from public.onboarding_steps where flow_run_id = run17 and flow_item_key = 'ic' limit 1;
  out := out || jsonb_build_object('t', '17.1 בקשה שצורפה אחר כך פתוחה ⇒ השלב לא «הושלם» והבא נעול', 'pass',
    coalesce((res2->>'ok')::boolean, false) and vb and v = 'locked', 'got', jsonb_build_object('attach', res2, 'next', v));
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform public.advance_onboarding_step(late17, 'complete', '{}'::jsonb);
  execute 'set local role postgres';
  select (state->'stages'->'a'->>'doneAt') is not null into vb from public.flow_runs where id = run17;
  select status into v from public.onboarding_steps where flow_run_id = run17 and flow_item_key = 'ic' limit 1;
  out := out || jsonb_build_object('t', '17.2 הבקשה המאוחרת נסגרה ⇒ השלב הושלם והבא נפתח', 'pass',
    vb and v is not null and v <> 'locked', 'got', jsonb_build_object('done', vb, 'next', v));
  -- ══ סבב 3 · ממצאי הביקורת שאומתו ═════════════════════════════════════════
  begin
  -- ── 15ב · משימות המשרד לא בדף האישי; בקשה מעורבת; הצעת «גם לבן/בת הזוג»; תבנית; עריכה ──
  execute 'set local role postgres';
  select count(*) into vi from jsonb_array_elements(public.build_client_portal(cid, 'live')->'items') x
    join public.onboarding_steps s on x->>'key' = 'custom_' || s.id
   where s.client_id = cid and s.payload ? 'personalConfirmFor';
  select count(*) into vj from jsonb_array_elements(public.build_client_portal(cid, 'preview')->'items') x
    join public.onboarding_steps s on x->>'key' = 'custom_' || s.id
   where s.client_id = cid and s.payload ? 'personalConfirmFor';
  select count(*) into vk from jsonb_array_elements(public.build_client_portal(cid, 'live')->'items') x
    join public.onboarding_steps s on x->>'key' = 'custom_' || s.id
   where s.flow_run_id = run3 and s.flow_item_key = 'c' and s.payload->>'subjectRole' = 'client';
  out := out || jsonb_build_object('t', '15.2ב משימת האישור האישי לא בדף האישי (חי ותצוגה); הבקשה של בעל הכרטיס כן', 'pass',
    vi = 0 and vj = 0 and vk = 1
    and exists (select 1 from public.onboarding_steps where client_id = cid and payload ? 'personalConfirmFor' and status <> 'cancelled'),
    'got', jsonb_build_array(vi, vj, vk));

  insert into public.journey_templates (user_id, office_id, kind, name, entries)
  values (uid, (select office_id from public.profiles where id = uid), 'request', 'QA סבב3 מעורבת',
          '[{"key":"e1","stepType":"custom_request","owner":"client","payload":{"title":"QA מעורבת","clientTitle":"QA מעורבת","requirements":[{"key":"r1","kind":"file","label":"תלוש","done":false,"required":true},{"key":"r2","kind":"confirm","label":"אני מאשר","done":false,"required":true}]}}]')
  returning id into tplm;
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', uid::text, true);
  execute 'set local role authenticated';
  res := public.create_office_flow('QA סבב3 מעורבת', 'manual', jsonb_build_object('stages', jsonb_build_array(
    jsonb_build_object('key', 'm', 'name', 'מעורבת', 'opens', jsonb_build_object('after', 'start'), 'delivery', 'approve',
      'items', jsonb_build_array(jsonb_build_object('key', 'mx', 'ref', jsonb_build_object('kind', 'template', 'templateId', tplm), 'perPerson', true))))));
  fm := res->>'flowId';
  runm := public.start_flow_run(cid, fm, null, false)->>'runId';
  execute 'set local role postgres';
  select count(*) filter (where payload->>'subjectRole' = 'spouse' and ball = 'client'
                            and exists (select 1 from jsonb_array_elements(payload->'requirements') r where r->>'kind' = 'file')
                            and not exists (select 1 from jsonb_array_elements(payload->'requirements') r where r->>'kind' = 'confirm')),
         count(*) filter (where payload->>'personalConfirmFor' = 'mx' and ball = 'me')
    into vi, vj from public.onboarding_steps where flow_run_id = runm and flow_item_key = 'mx';
  out := out || jsonb_build_object('t', '15.2ג קבצים + אישור לבן/בת הזוג ⇒ הקבצים בדף של בעל הכרטיס, והאישור — משימה למשרד', 'pass',
    vi = 1 and vj = 1,
    'got', (select jsonb_agg(jsonb_build_object('t', payload->>'title', 'ball', ball, 'reqs', payload->'requirements')) from public.onboarding_steps where flow_run_id = runm));

  -- הצעת «גם לבן/בת הזוג» אומרת אם תיפתח משימה (אישור אישי) או בקשה בדף
  insert into public.clients (id, user_id, first_name, last_name, email, lifecycle_stage, family_status, dealer_type)
  values (c22, uid, 'בדיקה', 'QA222', 'delivered@resend.dev', 'onboarding', 'single', 'licensed');
  insert into public.engagements (id, user_id, client_id, status, process_published_at) values (e22, uid, c22, 'onboarding', now());
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  run22 := public.start_flow_run(c22, f3, '2026', false)->>'runId';
  execute 'set local role postgres';
  update public.clients set family_status = 'married', spouse_first_name = 'דנה' where id = c22;
  execute 'set local role authenticated';
  res := public.flow_run_suggestions(run22);
  execute 'set local role postgres';
  out := out || jsonb_build_object('t', '15.9 «גם לבן/בת הזוג»: אישור אישי מסומן כמשימה למשרד, קובץ — לא', 'pass',
    (select (x->>'personalConfirm')::boolean and not (x->>'pagePart')::boolean from jsonb_array_elements(res->'suggestions') x where x->>'kind' = 'add_person' and x->>'itemKey' = 'c') = true
    and (select (x->>'personalConfirm')::boolean from jsonb_array_elements(res->'suggestions') x where x->>'kind' = 'add_person' and x->>'itemKey' = 'f') = false,
    'got', res->'suggestions');

  -- «שמור את המסע כתבנית»: בלי משימת האישור האישי, ובלי שנה/שם של אדם בכותרת
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  res := public.save_journey_template(cid, 'QA סבב3 מסע', null);
  execute 'set local role postgres';
  select count(*) filter (where e->'payload' ? 'personalConfirmFor' or e->'payload' ? 'officeNote'),
         count(*) filter (where e->'payload'->>'title' like '%(2025) - רונית%' or e->'payload'->>'clientTitle' like '%(2025) - רונית%')
    into vi, vj
    from public.journey_templates t, jsonb_array_elements(t.entries) e
   where t.user_id = uid and t.name = 'QA סבב3 מסע';
  out := out || jsonb_build_object('t', '15.10 תבנית מבקשות הלקוח: בלי משימת האישור האישי ובלי «(2025) - רונית»', 'pass',
    coalesce((res->>'ok')::boolean, false) and vi = 0 and vj = 0
    and not (public.template_payload_from_step('{"personalConfirmFor":"c","officeNote":"x","title":"t","baseTitle":"ב","defaultOrigin":{"key":"k"}}')
             ?| array['personalConfirmFor', 'officeNote', 'baseTitle', 'defaultOrigin'])
    and public.template_payload_from_step('{"title":"א (2025) - רונית","baseTitle":"א"}')->>'title' = 'א',
    'got', jsonb_build_array(res, vi, vj));

  -- עריכה: אי אפשר להוסיף «אני מאשר/ת» לבקשה על בן/בת הזוג
  select id into s4 from public.onboarding_steps
   where flow_run_id = run3 and flow_item_key = 'f' and payload->>'subjectRole' = 'spouse' and status not in ('cancelled', 'completed') limit 1;
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  res := public.update_onboarding_request(s4, (select payload from public.onboarding_steps where id = s4)
           || '{"requirements":[{"key":"k","kind":"confirm","label":"אני מאשרת","done":false,"required":true}]}'::jsonb);
  execute 'set local role postgres';
  out := out || jsonb_build_object('t', '15.11 אישור אישי לא נוסף בעריכה לבקשה על בן/בת הזוג', 'pass',
    res->>'error' = 'personal_confirm_for_subject'
    and (select draft_payload is null and not public._flow_has_personal_confirm(payload) from public.onboarding_steps where id = s4),
    'got', jsonb_build_array(s4, res));
  exception when others then
    out := out || jsonb_build_object('t', 'קרס: 15ב · משימות המשרד לא בדף האישי; בקשה מעורבת; הצעת «גם לבן/בת הזוג»; תבנית; עריכה', 'pass', false, 'got', sqlerrm);
  end;
  execute 'set local role postgres';

  begin
  -- ── 16.2 · בקשה מסוג של המחולל שהוכנה לפני האישור לא מכבה את בקשות המשרד ─────
  qid2 := 'qa216p' || substr(md5(random()::text), 1, 10);
  qtok2 := md5(random()::text);
  insert into public.leads (id, user_id, full_name, email, phone, status, has_previous_accountant)
  values ('qa216l' || qid2, uid, 'הכנה QA216', 'delivered@resend.dev', '050-0216218', 'new', false);
  insert into public.quotations (id, user_id, lead_id, quotation_number, status, public_token, items, representation, vat_rate, sent_at)
  values (qid2, uid, 'qa216l' || qid2, 'QA216P-' || qid2, 'sent', qtok2,
          '[{"id":"i1","serviceId":"s1","name":"הנהלת חשבונות","category":"monthly","billingType":"monthly","catalogPrice":1200,"clientPrice":1200,"quantity":1,"vatFlag":true}]',
          '{"enabled":false,"areas":{},"spouse":null,"prefill":{"firstName":"הכנה","lastName":"QA216","email":"delivered@resend.dev"}}', 18, now());
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', uid::text, true);
  execute 'set local role authenticated';
  res := public.ensure_client_for_quotation(qid2);
  execute 'set local role postgres';
  select client_id into qcid2 from public.quotations where id = qid2;
  update public.clients set dealer_type = 'licensed' where id = qcid2;
  execute 'set local role authenticated';
  res2 := public.create_onboarding_request(p_client_id => qcid2, p_step_type => 'client_documents',
            p_payload => '{"checklist":[{"key":"x1","label":"אישור בנק","done":false}]}'::jsonb,
            p_due_date => null, p_depends_on => null, p_published => true, p_required_for_close => true,
            p_owner => null, p_stage_id => null);
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  perform set_config('request.jwt.claim.sub', '', true);
  execute 'set local role anon';
  res := public.approve_quotation(qtok2, null, 'QA216P');
  execute 'set local role postgres';
  select id into qeng2 from public.engagements where client_id = qcid2 order by created_at desc limit 1;
  select count(*) into vi from jsonb_array_elements(coalesce((select entries from public.office_journey_defaults
     where office_id = (select office_id from public.profiles where id = uid) and client_kind = 'licensed_dealer'), '[]'::jsonb)) x
   where x->>'source' = 'office' and coalesce(x->>'enabled', 'true') <> 'false' and x->'when' is null;
  select count(*) into vj from public.onboarding_steps where engagement_id = qeng2 and payload->'defaultOrigin'->>'kind' = 'office_default';
  out := out || jsonb_build_object('t', '16.2 «מסמכים מהלקוח» שהוכנה לפני האישור ⇒ צילום נלקח ובקשות המשרד נוצרו; הבקשה לא כפולה', 'pass',
    coalesce((res2->>'heldUntilApproval')::boolean, false)
    and (select journey_default_snapshot is not null and journey_default_facts ? 'married' from public.engagements where id = qeng2)
    and vi > 0 and vj = vi
    and (select count(*) from public.onboarding_steps where client_id = qcid2 and step_type = 'client_documents' and status <> 'cancelled') = 1
    and (select published_at is not null and engagement_id = qeng2 from public.onboarding_steps where id = res2->>'stepId'),
    'got', jsonb_build_object('prepared', res2, 'officeEntries', vi, 'created', vj));
  exception when others then
    out := out || jsonb_build_object('t', 'קרס: 16.2 · בקשה מסוג של המחולל שהוכנה לפני האישור לא מכבה את בקשות המשרד', 'pass', false, 'got', sqlerrm);
  end;
  execute 'set local role postgres';

  begin
  -- ── 18 · בקשה שנוספה אחר כך לשלב פתוח מחזיקה גם את השלב הבא ───────────────
  insert into public.clients (id, user_id, first_name, last_name, email, lifecycle_stage, family_status, dealer_type)
  values (c18, uid, 'בדיקה', 'QA218', 'delivered@resend.dev', 'onboarding', 'single', 'licensed');
  insert into public.engagements (id, user_id, client_id, status, process_published_at) values (e18, uid, c18, 'onboarding', now());
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', uid::text, true);
  execute 'set local role authenticated';
  res := public.create_office_flow('QA218', 'manual', jsonb_build_object('stages', jsonb_build_array(
    jsonb_build_object('key', 'a', 'name', 'א', 'opens', jsonb_build_object('after', 'start'), 'delivery', 'approve',
      'items', jsonb_build_array(jsonb_build_object('key', 'pa', 'ref', jsonb_build_object('kind', 'template', 'templateId', tpl3), 'perPerson', true))),
    jsonb_build_object('key', 'b', 'name', 'ב', 'opens', jsonb_build_object('after', 'stage', 'stage', 'a'), 'delivery', 'auto',
      'items', jsonb_build_array(jsonb_build_object('key', 'pb', 'ref', jsonb_build_object('kind', 'template', 'templateId', tpl1)))))));
  f18 := res->>'flowId';
  run18 := public.start_flow_run(c18, f18, null, false)->>'runId';
  execute 'set local role postgres';
  update public.clients set family_status = 'married', spouse_first_name = 'רונית' where id = c18;
  execute 'set local role authenticated';
  res := public.flow_run_add_items(run18, array['pa'], array['spouse']);
  select id into s4 from public.onboarding_steps where flow_run_id = run18 and flow_item_key = 'pa' and payload->>'subjectRole' = 'client';
  perform public.advance_onboarding_step(s4, 'complete', '{}'::jsonb);
  execute 'set local role postgres';
  select status into v from public.onboarding_steps where flow_run_id = run18 and flow_item_key = 'pb';
  select count(*) into vi from public.client_notices where client_id = c18 and kind = 'new' and status = 'queued';
  out := out || jsonb_build_object('t', '18.1 בקשה לבן/בת הזוג שנוספה לשלב פתוח ⇒ השלב הבא נשאר נעול, ואין מייל', 'pass',
    v = 'locked' and vi = 0
    and exists (select 1 from public.onboarding_steps where flow_run_id = run18 and flow_item_key = 'pa' and payload->>'subjectRole' = 'spouse'),
    'got', jsonb_build_object('next', v, 'queued', vi, 'added', res));
  -- עדכון גרסה שמוסיף פריט חובה לשלב הפתוח — גם הוא מחזיק
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select definition into def2 from public.office_flow_versions where flow_id = f18 and version = 1;
  def2 := jsonb_set(def2, '{stages,0,items}', (def2->'stages'->0->'items') ||
           jsonb_build_array(jsonb_build_object('key', 'pc', 'ref', jsonb_build_object('kind', 'template', 'templateId', tpl1))));
  res2 := public.save_office_flow(f18, 1, def2, null, 'פריט חובה נוסף', null);
  res := public.flow_run_upgrade_apply(run18, 2, array['pc'], '{}');
  select id into s4 from public.onboarding_steps where flow_run_id = run18 and flow_item_key = 'pa' and payload->>'subjectRole' = 'spouse';
  perform public.advance_onboarding_step(s4, 'complete', '{}'::jsonb);
  execute 'set local role postgres';
  select status into v from public.onboarding_steps where flow_run_id = run18 and flow_item_key = 'pb';
  out := out || jsonb_build_object('t', '18.2 פריט חובה שנוסף בעדכון לשלב פתוח ⇒ השלב הבא מחכה גם לו', 'pass',
    v = 'locked' and exists (select 1 from public.onboarding_steps where flow_run_id = run18 and flow_item_key = 'pc' and status = 'pending'),
    'got', jsonb_build_object('next', v, 'upgrade', res, 'save', res2));
  execute 'set local role authenticated';
  select id into s4 from public.onboarding_steps where flow_run_id = run18 and flow_item_key = 'pc';
  perform public.advance_onboarding_step(s4, 'complete', '{}'::jsonb);
  execute 'set local role postgres';
  select status into v from public.onboarding_steps where flow_run_id = run18 and flow_item_key = 'pb';
  out := out || jsonb_build_object('t', '18.3 כשהכול בשלב נסגר ⇒ השלב הבא נפתח (לא ננעל יתר על המידה)', 'pass',
    v is not null and v <> 'locked', 'got', v);
  exception when others then
    out := out || jsonb_build_object('t', 'קרס: 18 · בקשה שנוספה אחר כך לשלב פתוח מחזיקה גם את השלב הבא', 'pass', false, 'got', sqlerrm);
  end;
  execute 'set local role postgres';

  begin
  -- ── 19 · בקשה שצורפה מחזיקה גם שלב שנפתח אחרי שלב שכולו רשות / שלא חל ─────
  insert into public.clients (id, user_id, first_name, last_name, email, lifecycle_stage, family_status, dealer_type)
  values (c19, uid, 'בדיקה', 'QA219', 'delivered@resend.dev', 'onboarding', 'single', 'licensed');
  insert into public.engagements (id, user_id, client_id, status, process_published_at) values (e19, uid, c19, 'onboarding', now());
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  res := public.create_office_flow('QA219', 'manual', jsonb_build_object('stages', jsonb_build_array(
    jsonb_build_object('key', 'a', 'name', 'א', 'opens', jsonb_build_object('after', 'start'), 'delivery', 'approve',
      'items', jsonb_build_array(jsonb_build_object('key', 'qa', 'ref', jsonb_build_object('kind', 'template', 'templateId', tpl1)))),
    jsonb_build_object('key', 'b', 'name', 'ב', 'opens', jsonb_build_object('after', 'stage', 'stage', 'a'), 'delivery', 'approve',
      'items', jsonb_build_array(jsonb_build_object('key', 'qb', 'ref', jsonb_build_object('kind', 'template', 'templateId', tpl2), 'optional', true))),
    jsonb_build_object('key', 'n', 'name', 'לא חל', 'opens', jsonb_build_object('after', 'stage', 'stage', 'b'), 'delivery', 'approve',
      'when', jsonb_build_object('facts', jsonb_build_array(jsonb_build_object('key', 'married', 'is', true))),
      'items', jsonb_build_array(jsonb_build_object('key', 'qn', 'ref', jsonb_build_object('kind', 'template', 'templateId', tpl1)))),
    jsonb_build_object('key', 'c', 'name', 'ג', 'opens', jsonb_build_object('after', 'stage', 'stage', 'n'), 'delivery', 'auto',
      'items', jsonb_build_array(jsonb_build_object('key', 'qc', 'ref', jsonb_build_object('kind', 'template', 'templateId', tpl3)))))));
  f19 := res->>'flowId';
  run19 := public.start_flow_run(c19, f19, null, false)->>'runId';
  execute 'set local role postgres';
  insert into public.onboarding_steps (user_id, engagement_id, client_id, step_type, track, scope, status, ball, payload, published_at)
  values (uid, e19, c19, 'custom_request', 'custom', 'person', 'pending', 'client',
          '{"title":"מאוחרת","clientTitle":"מאוחרת","requirements":[{"key":"r1","kind":"confirm","label":"אישור","done":false,"required":true}]}', now())
  returning id into late19;
  execute 'set local role authenticated';
  res2 := public.attach_step_to_flow_stage(late19, run19, 'a');
  select id into s4 from public.onboarding_steps where flow_run_id = run19 and flow_item_key = 'qa';
  perform public.advance_onboarding_step(s4, 'complete', '{}'::jsonb);
  execute 'set local role postgres';
  select status into v from public.onboarding_steps where flow_run_id = run19 and flow_item_key = 'qc';
  select count(*) into vi from public.client_notices where client_id = c19 and kind = 'new' and status = 'queued';
  out := out || jsonb_build_object('t', '19.1 בקשה שצורפה מחזיקה שלב שנפתח אחרי שלב של רשות ושלב שלא חל', 'pass',
    coalesce((res2->>'ok')::boolean, false) and v = 'locked' and vi = 0, 'got', jsonb_build_object('qc', v, 'queued', vi, 'attach', res2));
  execute 'set local role authenticated';
  perform public.advance_onboarding_step(late19, 'complete', '{}'::jsonb);
  execute 'set local role postgres';
  select status into v from public.onboarding_steps where flow_run_id = run19 and flow_item_key = 'qc';
  out := out || jsonb_build_object('t', '19.2 הבקשה המצורפת נסגרה ⇒ השלב שאחרי נפתח', 'pass', v is not null and v <> 'locked', 'got', v);
  exception when others then
    out := out || jsonb_build_object('t', 'קרס: 19 · בקשה שצורפה מחזיקה גם שלב שנפתח אחרי שלב שכולו רשות / שלא חל', 'pass', false, 'got', sqlerrm);
  end;
  execute 'set local role postgres';

  begin
  -- ── 20 · דילוג על בקשה במסלול: «הושלם» בשורה רק כשזה באמת משחרר ──────────────
  insert into public.clients (id, user_id, first_name, last_name, email, lifecycle_stage, family_status, dealer_type)
  values (c20, uid, 'בדיקה', 'QA220', 'delivered@resend.dev', 'onboarding', 'single', 'licensed');
  insert into public.engagements (id, user_id, client_id, status, process_published_at) values (e20, uid, c20, 'onboarding', now());
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  res := public.create_office_flow('QA220', 'manual', jsonb_build_object('stages', jsonb_build_array(
    jsonb_build_object('key', 'a', 'name', 'א', 'opens', jsonb_build_object('after', 'start'), 'delivery', 'approve',
      'items', jsonb_build_array(jsonb_build_object('key', 'ra', 'ref', jsonb_build_object('kind', 'template', 'templateId', tpl1)),
                                 jsonb_build_object('key', 'ra2', 'ref', jsonb_build_object('kind', 'template', 'templateId', tpl2)))),
    jsonb_build_object('key', 'b', 'name', 'ב', 'opens', jsonb_build_object('after', 'stage', 'stage', 'a'), 'delivery', 'approve',
      'items', jsonb_build_array(jsonb_build_object('key', 'rb', 'ref', jsonb_build_object('kind', 'template', 'templateId', tpl3)))))));
  f20 := res->>'flowId';
  run20 := public.start_flow_run(c20, f20, null, false)->>'runId';
  select id into s4 from public.onboarding_steps where flow_run_id = run20 and flow_item_key = 'ra';
  perform public.advance_onboarding_step(s4, 'skip', '{"reason":"לא רלוונטי השנה"}'::jsonb);
  res := public.get_client_flow_runs(c20);
  execute 'set local role postgres';
  select x->'counts' into res2 from jsonb_array_elements(res->'runs') rr2, jsonb_array_elements(rr2->'stages') x
   where rr2->>'id' = run20 and x->>'key' = 'a';
  out := out || jsonb_build_object('t', '20.1 דילוג בסיבה חופשית לא נספר «הושלם» — נספר כתקוע; שתי בקשות מחזיקות את השלב', 'pass',
    (res2->>'done')::int = 0 and (res2->>'stuck')::int = 1 and (res2->>'gates')::int = 2, 'got', res2);
  execute 'set local role authenticated';
  select id into s4 from public.onboarding_steps where flow_run_id = run20 and flow_item_key = 'ra2';
  perform public.advance_onboarding_step(s4, 'skip', '{"reason":"not_applicable","note":"לא רלוונטי השנה"}'::jsonb);
  res := public.get_client_flow_runs(c20);
  execute 'set local role postgres';
  select x->'counts' into res2 from jsonb_array_elements(res->'runs') rr2, jsonb_array_elements(rr2->'stages') x
   where rr2->>'id' = run20 and x->>'key' = 'a';
  out := out || jsonb_build_object('t', '20.2 דילוג «לא רלוונטי» (כפי שהמסך שולח במסלול) נספר «הושלם»', 'pass',
    (res2->>'done')::int = 1 and (res2->>'stuck')::int = 1, 'got', res2);
  exception when others then
    out := out || jsonb_build_object('t', 'קרס: 20 · דילוג על בקשה במסלול: «הושלם» בשורה רק כשזה באמת משחרר', 'pass', false, 'got', sqlerrm);
  end;
  execute 'set local role postgres';

  begin
  -- ── 21 · עדכון שמעביר פריט לשלב אחר — חל בפועל ─────────────────────────────
  insert into public.clients (id, user_id, first_name, last_name, email, lifecycle_stage, family_status, dealer_type)
  values (c21, uid, 'בדיקה', 'QA221', 'delivered@resend.dev', 'onboarding', 'single', 'licensed');
  insert into public.engagements (id, user_id, client_id, status, process_published_at) values (e21, uid, c21, 'onboarding', now());
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  res := public.create_office_flow('QA221', 'manual', jsonb_build_object('stages', jsonb_build_array(
    jsonb_build_object('key', 'a', 'name', 'א', 'opens', jsonb_build_object('after', 'start'), 'delivery', 'approve',
      'items', jsonb_build_array(jsonb_build_object('key', 'xa', 'ref', jsonb_build_object('kind', 'template', 'templateId', tpl1)),
                                 jsonb_build_object('key', 'xx', 'ref', jsonb_build_object('kind', 'template', 'templateId', tpl3)))),
    jsonb_build_object('key', 'b', 'name', 'ב', 'opens', jsonb_build_object('after', 'stage', 'stage', 'a'), 'delivery', 'approve',
      'items', jsonb_build_array(jsonb_build_object('key', 'xb', 'ref', jsonb_build_object('kind', 'template', 'templateId', tpl3)))))));
  f21 := res->>'flowId';
  run21 := public.start_flow_run(c21, f21, null, false)->>'runId';
  res2 := public.save_office_flow(f21, 1, jsonb_build_object('stages', jsonb_build_array(
    jsonb_build_object('key', 'a', 'name', 'א', 'opens', jsonb_build_object('after', 'start'), 'delivery', 'approve',
      'items', jsonb_build_array(jsonb_build_object('key', 'xa', 'ref', jsonb_build_object('kind', 'template', 'templateId', tpl1)))),
    jsonb_build_object('key', 'b', 'name', 'ב', 'opens', jsonb_build_object('after', 'stage', 'stage', 'a'), 'delivery', 'page',
      'items', jsonb_build_array(jsonb_build_object('key', 'xb', 'ref', jsonb_build_object('kind', 'template', 'templateId', tpl3)),
                                 jsonb_build_object('key', 'xx', 'ref', jsonb_build_object('kind', 'template', 'templateId', tpl3), 'optional', true))))),
    null, 'העברה', null);
  res := public.flow_run_upgrade_apply(run21, 2, '{}', '{}');
  select id into s4 from public.onboarding_steps where flow_run_id = run21 and flow_item_key = 'xa';
  perform public.advance_onboarding_step(s4, 'complete', '{}'::jsonb);
  execute 'set local role postgres';
  select (state->'stages'->'a'->>'doneAt') is not null into vb from public.flow_runs where id = run21;
  select flow_stage_key into v from public.onboarding_steps where flow_run_id = run21 and flow_item_key = 'xx';
  out := out || jsonb_build_object('t', '21.2 «איך מגיע ללקוח» של השלב בגרסה החדשה חל על הבקשות הקיימות (גם על מה שעבר שלב)', 'pass',
    (select bool_and(payload->>'delivery' = 'page') from public.onboarding_steps where flow_run_id = run21 and flow_item_key in ('xb', 'xx')),
    'got', (select jsonb_agg(jsonb_build_object('k', flow_item_key, 'd', payload->>'delivery')) from public.onboarding_steps where flow_run_id = run21));
  out := out || jsonb_build_object('t', '21.1 פריט שעבר בעדכון לשלב אחר (ונעשה רשות) לא מחזיק את השלב הישן', 'pass',
    vb and v = 'b' and (select status from public.onboarding_steps where flow_run_id = run21 and flow_item_key = 'xb') <> 'locked',
    'got', jsonb_build_object('aDone', vb, 'xxStage', v, 'upgrade', res, 'save', res2));
  exception when others then
    out := out || jsonb_build_object('t', 'קרס: 21 · עדכון שמעביר פריט לשלב אחר — חל בפועל', 'pass', false, 'got', sqlerrm);
  end;
  execute 'set local role postgres';

  begin
  -- ── 22 · פעולה מול רשות: «כבר נקרא השבוע» רק על קריאה שהצליחה ───────────────
  update public.clients set tax_files = '[{"authority":"income_tax","fileNumber":"123456789","repStatus":"active"}]'::jsonb where id = c22;
  insert into public.automation_jobs (user_id, client_id, action_type, status, input, created_at)
  values (uid, c22, 'shaam.sync_income_tax_file', 'failed', '{}'::jsonb, now() - interval '2 days') returning id into jid;
  select * into frow from public.flow_runs where id = run22;
  frow.state := '{"autoActions":true}'::jsonb;
  res := public._flow_run_action(frow, '{"key":"a1","mode":"auto","ref":{"kind":"action","actionType":"shaam.sync_income_tax_file"}}'::jsonb);
  delete from public.automation_jobs where client_id = c22 and id <> jid;
  insert into public.automation_jobs (user_id, client_id, action_type, status, input)
  values (uid, c22, 'shaam.sync_income_tax_file', 'needs_human', '{}'::jsonb);
  res2 := public._flow_run_action(frow, '{"key":"a1","mode":"auto","ref":{"kind":"action","actionType":"shaam.sync_income_tax_file"}}'::jsonb);
  delete from public.automation_jobs where client_id = c22 and id <> jid;
  update public.automation_jobs set status = 'succeeded', finished_at = now() - interval '1 day' where id = jid;
  res3 := public._flow_run_action(frow, '{"key":"a1","mode":"auto","ref":{"kind":"action","actionType":"shaam.sync_income_tax_file"}}'::jsonb);
  out := out || jsonb_build_object('t', '22.1 קריאה שנכשלה לא נחשבת «נקרא השבוע»; שעצרה — ממתינה לך; שהצליחה — כן', 'pass',
    res->>'reason' is distinct from 'recent_job' and res2->>'reason' = 'open_needs_you' and res3->>'reason' = 'recent_job',
    'got', jsonb_build_array(res, res2, res3));
  update public.clients set id_number = null,
         tax_files = '[{"authority":"national_insurance","owner":"client","repStatus":"active"}]'::jsonb where id = c22;
  res := public._flow_run_action(frow, '{"key":"b1","mode":"auto","ref":{"kind":"action","actionType":"btl.sync_file"}}'::jsonb);
  out := out || jsonb_build_object('t', '22.2 ב"ל: מיוצג בלי ת.ז. בכרטיס ⇒ «חסר פרט», לא «אין ייצוג»', 'pass',
    res->>'reason' = 'missing_input', 'got', res);
  exception when others then
    out := out || jsonb_build_object('t', 'קרס: 22 · פעולה מול רשות: «כבר נקרא השבוע» רק על קריאה שהצליחה', 'pass', false, 'got', sqlerrm);
  end;
  execute 'set local role postgres';

  begin
  -- ── 23 · מייל ראשון שחזר — המייל הבא עדיין «הראשון» ─────────────────────────
  insert into public.email_messages (user_id, client_id, to_email, subject, kind, status, resend_id, idempotency_key)
  values (uid, c22, 'typo@gmial.com', 'x', 'process_open', 'bounced', 'test-b-' || c22, 'notice:qa-b-' || c22) returning id into mid;
  insert into public.client_notices (user_id, client_id, kind, origin, idempotency_key, status, email_message_id, to_email)
  values (uid, c22, 'new', 'manual', 'qa-b-' || c22, 'sent', mid, 'typo@gmial.com');
  vb := public._client_first_page_email(c22);
  update public.email_messages set status = 'delivered' where id = mid;
  out := out || jsonb_build_object('t', '23.1 מייל שחזר אינו «כבר קיבל מייל»; מייל שנמסר — כן', 'pass',
    vb and not public._client_first_page_email(c22), 'got', vb);
  exception when others then
    out := out || jsonb_build_object('t', 'קרס: 23 · מייל ראשון שחזר — המייל הבא עדיין «הראשון»', 'pass', false, 'got', sqlerrm);
  end;
  execute 'set local role postgres';

  begin
  -- ── 24 · עצירת מסלול הקליטה עוצרת גם את תזכורות הייצוג ─────────────────────
  -- ההוראות לב"ל נשלחו לפני חודש ולא אושרו — תזכורת ב"ל לבעל הכרטיס היא בתורה
  update public.clients set authority_representations = '{"nationalInsurance":{"targets":["client"]}}'::jsonb where id = c22;
  insert into public.representation_requests (id, user_id, linked_client_id, client_name, client_email, status, onboarding_token, execution)
  values (crq, uid, c22, 'QA224', 'delivered@resend.dev', 'pending_signature', 'qa224-' || crq,
          jsonb_build_object('nationalInsurance', jsonb_build_object('instructionsSentAt', now() - interval '30 days', 'referenceNumber', '123')));
  insert into public.flow_runs (user_id, client_id, flow_id, flow_version, cycle_key, trigger, status, engagement_id, paused_at)
  values (uid, c22, public.ensure_onboarding_flow((select office_id from public.profiles where id = uid)), 1, e22, 'quote_approved', 'paused', e22, now())
  returning id into rrun;
  -- שלב הייצוג נוצר מהבקשה (טריגר); מצמידים אותו לריצת הקליטה שבעצירה — כמו attach_onboarding_flow_run.
  select id into rstep from public.onboarding_steps where client_id = c22 and step_type = 'representation' and status <> 'cancelled' limit 1;
  if rstep is null then
    insert into public.onboarding_steps (user_id, engagement_id, client_id, step_type, track, scope, status, ball, payload, published_at)
    values (uid, e22, c22, 'representation', 'authorities', 'person', 'completed', 'me',
            jsonb_build_object('representationRequestId', crq), now())
    returning id into rstep;
  end if;
  update public.onboarding_steps set flow_run_id = rrun, flow_stage_key = 's1', flow_item_key = 'representation' where id = rstep;
  insert into public.onboarding_steps (user_id, engagement_id, client_id, step_type, track, scope, status, ball, payload, published_at)
  values (uid, e22, c22, 'rep_client_approval', 'authorities', 'person', 'pending', 'client', '{}'::jsonb, now())
  returning id into s4;
  vb := public.claim_representation_reminder(crq, 'sign', 0);
  out := out || jsonb_build_object('t', '24.1 מסלול הקליטה בעצירה ⇒ תזכורת החתימה, אישור ב"ל וכרטיס הזירוז לא נתבעים, והמונה לא זז', 'pass',
    not vb and not public.claim_representation_portal_reminder(s4, 0)
    and not public.claim_representation_reminder(crq, 'niClient', 0)
    and (select execution->'reminders' is null from public.representation_requests where id = crq),
    'got', vb);
  update public.flow_runs set status = 'active', paused_at = null where id = rrun;
  vb := public.claim_representation_reminder(crq, 'sign', 0);
  vb2 := public.claim_representation_reminder(crq, 'niClient', 0);
  out := out || jsonb_build_object('t', '24.2 אחרי החידוש ⇒ תזכורת החתימה ואישור ב"ל נתבעות כרגיל', 'pass',
    vb and vb2 and (select execution->'reminders'->'sign'->>'count' = '1' and execution->'reminders'->'niClient'->>'count' = '1'
                    from public.representation_requests where id = crq),
    'got', (select execution from public.representation_requests where id = crq));
  exception when others then
    out := out || jsonb_build_object('t', 'קרס: 24 · עצירת מסלול הקליטה עוצרת גם את תזכורות הייצוג', 'pass', false, 'got', sqlerrm);
  end;
  execute 'set local role postgres';

  begin
  -- ── 25 · משימה פנימית של המשרד לא בדף האישי; הודעת מלל — כן ───────────────
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', uid::text, true);
  execute 'set local role authenticated';
  res := public.create_onboarding_request(p_client_id => c22, p_step_type => 'custom_request',
           p_payload => '{"title":"QA משימה פנימית"}'::jsonb, p_due_date => null, p_depends_on => null,
           p_published => true, p_required_for_close => false, p_owner => 'me', p_stage_id => null);
  res2 := public.create_onboarding_request(p_client_id => c22, p_step_type => 'custom_request',
           p_payload => '{"title":"QA הודעה","clientTitle":"QA הודעה","messageOnly":true,"message":"שלום"}'::jsonb,
           p_due_date => null, p_depends_on => null, p_published => true, p_required_for_close => false, p_owner => 'me', p_stage_id => null);
  execute 'set local role postgres';
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform public.advance_onboarding_step(res->>'stepId', 'wait_client', '{}'::jsonb);
  res3 := public.create_onboarding_request(p_client_id => c22, p_step_type => 'custom_request',
           p_payload => '{"title":"QA מתבנית","clientTitle":"QA מתבנית","requirements":[{"key":"r1","kind":"file","label":"תלוש","done":false,"required":true}]}'::jsonb,
           p_due_date => null, p_depends_on => null, p_published => true, p_required_for_close => false, p_owner => 'me', p_stage_id => null);
  execute 'set local role postgres';
  out := out || jsonb_build_object('t', '25.2 משימה פנימית אחרי «ממתין ללקוח» — עדיין לא במייל; בקשה עם דרישות בבעלות המשרד — לא מוסתרת', 'pass',
    (select ball from public.onboarding_steps where id = res->>'stepId') = 'client'
    and not exists (select 1 from public._client_announceable_steps(c22) a where a.step_id = res->>'stepId')
    and not coalesce((select (payload->>'internalTask')::boolean from public.onboarding_steps where id = res3->>'stepId'), false)
    and exists (select 1 from jsonb_array_elements(public.build_client_portal(c22, 'live')->'items') x where x->>'key' = 'custom_' || (res3->>'stepId')),
    'got', jsonb_build_array(res, res3));
  out := out || jsonb_build_object('t', '25.1 משימה פנימית מסומנת ולא בדף; הודעת מלל של המשרד — בדף', 'pass',
    (select coalesce((payload->>'internalTask')::boolean, false) from public.onboarding_steps where id = res->>'stepId')
    and not exists (select 1 from jsonb_array_elements(public.build_client_portal(c22, 'live')->'items') x where x->>'key' = 'custom_' || (res->>'stepId'))
    and exists (select 1 from jsonb_array_elements(public.build_client_portal(c22, 'live')->'items') x where x->>'key' = 'custom_' || (res2->>'stepId')),
    'got', jsonb_build_array(res, res2));
  exception when others then
    out := out || jsonb_build_object('t', 'קרס: 25 · משימה פנימית של המשרד לא בדף האישי; הודעת מלל — כן', 'pass', false, 'got', sqlerrm);
  end;
  execute 'set local role postgres';

  begin
  -- ── 26 · מסמך שהוסר מהספרייה ⇒ הבקשה לא נוצרת ─────────────────────────────
  res := public._flow_item_spec(uid, jsonb_build_object('key', 'dx',
           'ref', jsonb_build_object('kind', 'document', 'docId', 'qa-gone-doc'),
           'snapshot', jsonb_build_object('payload', jsonb_build_object('title', 'מדריך', 'clientResource', 'qa-gone-doc', 'requirements', '[]'::jsonb))), true);
  out := out || jsonb_build_object('t', '26.1 מסמך שהוסר מהספרייה ⇒ לא נוצר (לא מהעותק השמור)', 'pass',
    res->>'ok' = 'false' and res->>'reason' = 'library_item_missing', 'got', res);
  exception when others then
    out := out || jsonb_build_object('t', 'קרס: 26 · מסמך שהוסר מהספרייה ⇒ הבקשה לא נוצרת', 'pass', false, 'got', sqlerrm);
  end;
  execute 'set local role postgres';

  out := out || jsonb_build_object('t', 'invariants', 'pass', public.assert_domain_function_invariants() is not null, 'got', null);
  raise exception 'RESULTS:%', out::text;
end;
$test$;
