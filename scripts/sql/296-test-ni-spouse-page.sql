begin;
create temp table results296(name text, ok boolean);
create function pg_temp.ok296(value boolean, label text) returns void language plpgsql as $$
begin if value is not true then raise exception '296: %', label; end if; insert into results296 values(label, true); end; $$;

-- לקוחה נשואה, בן זוג בלי מייל, ב"ל לשניהם, בקשת ייצוג אחת. נתוני דמה בלבד.
create function pg_temp.make296(uid uuid, targets jsonb, sp_email text) returns jsonb language plpgsql as $$
declare cid text := 'qa296-' || gen_random_uuid()::text; rid text := replace(gen_random_uuid()::text, '-', '');
begin
  insert into public.clients(id, user_id, first_name, last_name, email, family_status, spouse_first_name, spouse_last_name,
                             spouse_email, lifecycle_stage, authority_representations)
    values (cid, uid, 'ישראלה', 'ישראלי', 'qa296@example.test', 'married', 'ישראל', 'ישראלי', sp_email, 'onboarding',
            jsonb_build_object('nationalInsurance', jsonb_build_object('status', 'in_process', 'targets', targets)));
  insert into public.representation_requests(id, user_id, linked_client_id, client_name, status, execution)
    values (rid, uid, cid, 'ישראלה ישראלי', 'awaiting_stamp', '{}'::jsonb);
  update public.clients set representation_request_id = rid where id = cid;
  return jsonb_build_object('client', cid, 'req', rid);
end; $$;

create function pg_temp.exec296(rid text, client_track jsonb, spouse_track jsonb) returns void language sql as $$
  update public.representation_requests
     set execution = coalesce(execution, '{}'::jsonb)
                     || case when client_track is null then '{}'::jsonb else jsonb_build_object('nationalInsurance', client_track) end
                     || case when spouse_track is null then '{}'::jsonb else jsonb_build_object('nationalInsuranceSpouse', spouse_track) end
   where id = rid;
$$;

do $$
declare
  uid uuid; f jsonb; cid text; rid text; sp text; cl text; page jsonb; ready jsonb; n int; nid uuid; dl text := to_char(current_date + 30, 'YYYY-MM-DD');
begin
  select u.id into uid from auth.users u join public.authorized_users a on lower(a.email) = lower(u.email)
    join public.profiles p on p.id = u.id where a.active and p.office_id is not null limit 1;
  if uid is null then raise exception 'needs authorized staging office'; end if;
  perform set_config('request.jwt.claims', jsonb_build_object('sub', uid, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', uid::text, true);

  -- ── קליטה ראשונה: אסמכתא ⇒ שלב לכל אדם ──
  f := pg_temp.make296(uid, '["client","spouse"]', null); cid := f->>'client'; rid := f->>'req';
  perform pg_temp.exec296(rid, jsonb_build_object('referenceNumber', '70000001', 'deadline', dl, 'instructionsSentAt', now()::text),
                               jsonb_build_object('referenceNumber', '70000002', 'deadline', dl));
  select id into cl from public.onboarding_steps where client_id = cid and step_type = 'authority_representation' and payload->>'subjectRole' = 'client';
  select id into sp from public.onboarding_steps where client_id = cid and step_type = 'authority_representation' and payload->>'subjectRole' = 'spouse';
  perform pg_temp.ok296(cl is not null and sp is not null, 'reference number opens one NI step per person');
  perform pg_temp.ok296((select status from public.onboarding_steps where id = cl) = 'waiting_client', 'person whose instructions went out waits for them');
  perform pg_temp.ok296((select status from public.onboarding_steps where id = sp) = 'in_progress', 'spouse without instructions stays with the office');
  perform pg_temp.ok296((select payload->>'representationRequestId' from public.onboarding_steps where id = sp) = rid, 'step belongs to the current request');

  perform pg_temp.exec296(rid, null, jsonb_build_object('referenceNumber', '70000002', 'deadline', dl, 'syncedAt', now()::text));
  select count(*) into n from public.onboarding_steps where client_id = cid and step_type = 'authority_representation';
  perform pg_temp.ok296(n = 2, 'another execution write does not open a second step');

  -- ── הדף: האישור של בן הזוג כפעולה בשמו ──
  page := public.build_client_portal(cid, 'live');
  perform pg_temp.ok296(jsonb_path_exists(page, '$.** ? (@.kind == "ni_approval" && @.forPerson == "ישראל")'), 'page shows the spouse approval in his name');
  perform pg_temp.ok296(jsonb_path_exists(page, '$.** ? (@.kind == "ni_approval" && @.key == $k)', jsonb_build_object('k', 'authrep_' || sp))
                        and position('70000002' in page::text) > 0, 'spouse item carries his own reference number');
  perform pg_temp.ok296(jsonb_path_exists(page, '$.** ? (@.kind == "ni_approval" && @.key == $k)', jsonb_build_object('k', 'authrep_' || cl)), 'page shows the owner approval too');

  -- ── מייל הדף: נכלל ב«מה חדש»; לא קבוצה נפרדת שדורשת כתובת ──
  perform pg_temp.ok296(exists (select 1 from public._client_announceable_steps(cid) a where a.step_id = sp), 'spouse approval is new on the page email');
  perform pg_temp.ok296(not exists (select 1 from public._client_announceable_steps(cid) a where a.step_id = cl), 'owner NI step is not announced again');
  ready := public.client_ready_to_send(cid);
  perform pg_temp.ok296(not jsonb_path_exists(ready, '$.persons[*] ? (@.role == "spouse")'), 'no separate spouse group without an address');
  perform pg_temp.ok296(jsonb_path_exists(ready, '$.owner.items[*] ? (@.stepId == $s && @.title == "ישראל — אישור ייפוי הכוח בביטוח הלאומי")', jsonb_build_object('s', sp)),
                        'owner page group lists the spouse approval by name');

  -- ── «נשלח» רק ממייל שנשא את האסמכתא ──
  insert into public.client_notices(user_id, client_id, kind, origin, idempotency_key, status, request_body, sent_at)
    values (uid, cid, 'new', 'manual', 'qa296-a-' || cid, 'sent', jsonb_build_object('html', '<p>בלי מספר</p>'), now())
    returning id into nid;
  insert into public.client_notice_items(notice_id, step_id, version) values (nid, sp, 1);
  perform public._ni_mark_page_delivered(nid);
  perform pg_temp.ok296((select execution->'nationalInsuranceSpouse'->>'instructionsSentAt' from public.representation_requests where id = rid) is null,
                        'email without the reference number does not count as sent');
  insert into public.client_notices(user_id, client_id, kind, origin, idempotency_key, status, request_body, sent_at)
    values (uid, cid, 'new', 'manual', 'qa296-b-' || cid, 'sent', jsonb_build_object('html', '<p>אסמכתא 70000002</p>'), now())
    returning id into nid;
  insert into public.client_notice_items(notice_id, step_id, version) values (nid, sp, 1);
  perform public._ni_mark_page_delivered(nid);
  perform pg_temp.ok296((select execution->'nationalInsuranceSpouse'->>'instructionsSentWith' from public.representation_requests where id = rid) = 'page',
                        'page email with his reference number records the instructions as sent');
  perform pg_temp.ok296((select status from public.onboarding_steps where id = sp) = 'waiting_client', 'spouse step now waits for him');
  page := public.build_client_portal(cid, 'live');
  perform pg_temp.ok296(jsonb_path_exists(page, '$.** ? (@.kind == "ni_approval" && @.forPerson == "ישראל")'), 'page keeps the spouse approval after sending');
  perform pg_temp.ok296(not exists (select 1 from public._client_announceable_steps(cid) a where a.step_id = sp), 'sent approval is no longer new');

  -- ── בן זוג עם מייל משלו: בלי שינוי (מייל ייעודי) ──
  f := pg_temp.make296(uid, '["client","spouse"]', 'spouse296@example.test'); cid := f->>'client'; rid := f->>'req';
  perform pg_temp.exec296(rid, null, jsonb_build_object('referenceNumber', '70000003', 'deadline', dl));
  select id into sp from public.onboarding_steps where client_id = cid and step_type = 'authority_representation' and payload->>'subjectRole' = 'spouse';
  page := public.build_client_portal(cid, 'live');
  perform pg_temp.ok296(sp is not null and not jsonb_path_exists(page, '$.** ? (@.kind == "ni_approval")'), 'spouse with an address keeps the dedicated email path');
  ready := public.client_ready_to_send(cid);
  perform pg_temp.ok296(jsonb_path_exists(ready, '$.persons[*] ? (@.role == "spouse" && @.email == "spouse296@example.test")'), 'spouse with an address still gets his own group');

  -- ── מי שלא ברשימה / כבר אישר — לא נפתח ──
  f := pg_temp.make296(uid, '["client"]', null); cid := f->>'client'; rid := f->>'req';
  perform pg_temp.exec296(rid, null, jsonb_build_object('referenceNumber', '70000004', 'deadline', dl));
  perform pg_temp.ok296(not exists (select 1 from public.onboarding_steps where client_id = cid and step_type = 'authority_representation'), 'person outside the NI targets gets no step');
  perform pg_temp.exec296(rid, jsonb_build_object('referenceNumber', '70000005', 'deadline', dl, 'confirmedAt', now()::text), null);
  perform pg_temp.ok296(not exists (select 1 from public.onboarding_steps where client_id = cid and step_type = 'authority_representation'), 'already approved person gets no open step');

  perform pg_temp.ok296(not has_function_privilege('authenticated', 'public._ensure_ni_steps_from_execution(text)', 'execute')
                        and not has_function_privilege('anon', 'public._ni_mark_page_delivered(uuid)', 'execute'), 'internal functions are not exposed');
end; $$;
select * from results296;
rollback;
