begin;
create temp table results299(name text, ok boolean);
create function pg_temp.ok299(value boolean, label text) returns void language plpgsql as $$
begin if value is not true then raise exception '299: %', label; end if; insert into results299 values(label, true); end; $$;

do $$
declare
  uid uuid; cid text := 'qa299t-' || gen_random_uuid()::text; rid text := replace(gen_random_uuid()::text, '-', '');
  tok text := 'qa299tok-' || gen_random_uuid()::text; cl text; sp text; r jsonb; page jsonb; dl text := to_char(current_date + 30, 'YYYY-MM-DD'); n int;
begin
  select u.id into uid from auth.users u join public.authorized_users a on lower(a.email) = lower(u.email)
    join public.profiles p on p.id = u.id where a.active and p.office_id is not null limit 1;
  if uid is null then raise exception 'needs authorized staging office'; end if;

  insert into public.clients(id, user_id, first_name, last_name, email, id_number, family_status, spouse_first_name, spouse_last_name,
                             spouse_id_number, lifecycle_stage, portal_token, authority_representations)
    values (cid, uid, 'ישראלה', 'ישראלי', 'qa299@example.test', '000000018', 'married', 'ישראל', 'ישראלי', '000000026', 'onboarding', tok,
            '{"nationalInsurance":{"status":"in_process","targets":["client","spouse"]}}');
  insert into public.representation_requests(id, user_id, linked_client_id, client_name, status, execution)
    values (rid, uid, cid, 'ישראלה ישראלי', 'awaiting_authorities', '{}');
  update public.clients set representation_request_id = rid where id = cid;
  update public.representation_requests set execution = jsonb_build_object(
    'nationalInsurance', jsonb_build_object('referenceNumber', '70000001', 'deadline', dl, 'instructionsSentAt', now()::text, 'syncedAt', (now() - interval '1 hour')::text),
    'nationalInsuranceSpouse', jsonb_build_object('referenceNumber', '70000002', 'deadline', dl, 'instructionsSentAt', now()::text)) where id = rid;
  select id into cl from public.onboarding_steps where client_id = cid and step_type = 'authority_representation' and payload->>'subjectRole' = 'client';
  select id into sp from public.onboarding_steps where client_id = cid and step_type = 'authority_representation' and payload->>'subjectRole' = 'spouse';
  perform pg_temp.ok299(cl is not null and sp is not null, 'fixture: NI step per person');

  page := public.build_client_portal(cid, 'live');
  perform pg_temp.ok299(jsonb_path_exists(page, '$.items[*] ? (@.kind == "ni_approval" && @.actionKind == "portal" && @.actionValue == $s)', jsonb_build_object('s', sp)),
                        'NI card carries the in-page «אישרתי» action');
  perform pg_temp.ok299(not jsonb_path_exists(page, '$.items[*] ? (@.kind == "ni_approval" && @.declareState != null)'), 'no declared state before the client says so');

  -- ── «אישרתי» של בן הזוג ⇒ הצהרה + בדיקה בתור ──
  r := public.portal_submit_step(tok, sp, '{}'::jsonb);
  perform pg_temp.ok299(r->>'ok' = 'true' and r->>'check' = 'queued', 'declare queues a BTL check');
  perform pg_temp.ok299((select payload ? 'clientDeclaredAt' from public.onboarding_steps where id = sp), 'declaration is stored on that person''s request');
  perform pg_temp.ok299((select status from public.onboarding_steps where id = sp) = 'waiting_client', 'declaration does not close the request');
  perform pg_temp.ok299(exists (select 1 from public.automation_jobs where client_id = cid and action_type = 'btl.check_representation'
                                and status = 'queued' and input->>'role' = 'spouse' and input->>'referenceNumber' = '70000002'
                                and input->>'idNumber' = '000000026'), 'check job targets the spouse with his number and ID');
  perform pg_temp.ok299(exists (select 1 from public.onboarding_events where step_id = sp and type = 'client_declared'), 'declaration is in the activity log');
  page := public.build_client_portal(cid, 'live');
  perform pg_temp.ok299(jsonb_path_exists(page, '$.items[*] ? (@.actionValue == $s && @.declareState == "checking")', jsonb_build_object('s', sp)), 'page says we are checking');

  -- ── לחיצה כפולה ⇒ אין בדיקה שנייה ──
  r := public.portal_submit_step(tok, sp, '{}'::jsonb);
  select count(*) into n from public.automation_jobs where client_id = cid and action_type = 'btl.check_representation';
  perform pg_temp.ok299(r->>'noop' = 'true' and n = 1, 'double click does not queue a second check');

  -- ── «אישרתי» של בעלת הכרטיס בזמן שבדיקת בן הזוג פתוחה ⇒ «המשך» אחריה ──
  r := public.portal_submit_step(tok, cl, '{}'::jsonb);
  perform pg_temp.ok299(r->>'check' = 'waiting' and exists (select 1 from public.automation_job_followups where client_id = cid and status = 'waiting'
                        and input->>'role' = 'client'), 'second person''s check waits behind the first');

  -- ── הבדיקה רצה ולא מצאה אישור ⇒ «עוד לא רואים» ──
  update public.representation_requests set execution = jsonb_set(execution, '{nationalInsuranceSpouse,syncedAt}', to_jsonb((now() + interval '1 second')::text)) where id = rid;
  page := public.build_client_portal(cid, 'live');
  perform pg_temp.ok299(jsonb_path_exists(page, '$.items[*] ? (@.actionValue == $s && @.declareState == "not_seen")', jsonb_build_object('s', sp)), 'check without approval ⇒ not seen yet');

  -- ── ב״ל אישר ⇒ הבקשה נסגרת, והצהרה נוספת לא עושה כלום ──
  update public.representation_requests set execution = jsonb_set(execution, '{nationalInsuranceSpouse,confirmedAt}', to_jsonb(now()::text)) where id = rid;
  perform pg_temp.ok299((select status from public.onboarding_steps where id = sp) = 'completed', 'BTL approval closes the request');
  r := public.portal_submit_step(tok, sp, '{}'::jsonb);
  perform pg_temp.ok299(r->>'noop' = 'true', 'declaring after completion is a no-op');

  perform pg_temp.ok299(not has_function_privilege('anon', 'public._portal_ni_declare(text)', 'execute'), 'internal declare function is not exposed');
  r := public.portal_submit_step('wrong-token', cl, '{}'::jsonb);
  perform pg_temp.ok299(r->>'error' = 'invalid', 'wrong token is refused');
end; $$;
select * from results299;
rollback;
