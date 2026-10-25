begin;
create temp table results301(name text, ok boolean);
create function pg_temp.ok301(value boolean, label text) returns void language plpgsql as $$
begin if value is not true then raise exception '301: %', label; end if; insert into results301 values(label, true); end; $$;

do $$
declare
  uid uuid; cid text := 'qa301t-' || gen_random_uuid()::text; ens text; chk text; a text; n int;
begin
  select u.id into uid from auth.users u join public.authorized_users au on lower(au.email) = lower(u.email)
    join public.profiles p on p.id = u.id where au.active and p.office_id is not null limit 1;
  insert into public.clients(id, user_id, first_name, last_name, id_number, lifecycle_stage)
    values (cid, uid, 'ישראלה', 'ישראלי', '000000018', 'onboarding');

  -- ── פתיחת רישום הייצוג נכשלה ⇒ הבדיקה שמחכה לה לא יוצאת ──
  insert into public.automation_jobs(user_id, client_id, action_type, input, status, max_attempts)
    values (uid, cid, 'shaam.ensure_capability', '{"capability":"representation"}', 'running', 1) returning id into ens;
  insert into public.automation_job_followups(user_id, client_id, action_type, input, after_job_id, status)
    values (uid, cid, 'shaam.check_representation', '{"role":"client","submissionKey":"person:client"}', ens, 'waiting');
  update public.automation_jobs set status = 'failed', error_code = 'ensure_capability_unavailable' where id = ens;
  perform pg_temp.ok301((select status from public.automation_job_followups where after_job_id = ens) = 'skipped',
                        'failed opening ⇒ the queued check is skipped');
  select count(*) into n from public.automation_jobs where client_id = cid and action_type = 'shaam.check_representation';
  perform pg_temp.ok301(n = 0, 'no check job was created on the empty screen');
  perform pg_temp.ok301((select note from public.automation_job_followups where after_job_id = ens) like 'הפתיחה%', 'the reason is recorded');

  -- ── הפתיחה הצליחה ⇒ הבדיקה יוצאת (ללא שינוי) ──
  insert into public.automation_jobs(user_id, client_id, action_type, input, status, max_attempts)
    values (uid, cid, 'shaam.ensure_capability', '{"capability":"representation"}', 'running', 1) returning id into ens;
  insert into public.automation_job_followups(user_id, client_id, action_type, input, after_job_id, status)
    values (uid, cid, 'shaam.check_representation', '{"role":"client","submissionKey":"person:client"}', ens, 'waiting');
  update public.automation_jobs set status = 'succeeded' where id = ens;
  perform pg_temp.ok301((select status from public.automation_job_followups where after_job_id = ens) = 'released', 'successful opening ⇒ the check is released');
  update public.automation_jobs set status = 'cancelled' where client_id = cid and action_type = 'shaam.check_representation' and status = 'queued';

  -- ── שרשרת רגילה: בדיקת ב״ל אחת נכשלה ⇒ השנייה עדיין יוצאת ──
  insert into public.automation_jobs(user_id, client_id, action_type, input, status, max_attempts)
    values (uid, cid, 'btl.check_representation', '{"role":"client"}', 'running', 3) returning id into a;
  insert into public.automation_job_followups(user_id, client_id, action_type, input, after_job_id, status)
    values (uid, cid, 'btl.check_representation', '{"role":"spouse"}', a, 'waiting');
  update public.automation_jobs set status = 'failed' where id = a;
  perform pg_temp.ok301((select status from public.automation_job_followups where after_job_id = a) = 'released', 'independent chain still releases after a failure');
end; $$;
select * from results301;
rollback;
