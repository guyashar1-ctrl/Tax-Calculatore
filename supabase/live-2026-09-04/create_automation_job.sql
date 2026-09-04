-- נמשך חי 2026-09-04 מהמסד (pg_get_functiondef).
-- ארגומנטים: p_client_id text, p_action_type text, p_input jsonb
CREATE OR REPLACE FUNCTION public.create_automation_job(p_client_id text, p_action_type text, p_input jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid     uuid := auth.uid();
  v_job     public.automation_jobs;
  v_created boolean := true;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'unauthorized');
  end if;

  -- לקוח מסוים ⇒ חייב להיות שלו. משימת מערכת (בלי לקוח) ⇒ אין מה לאמת מעבר
  -- לזהות המשתמש, שכבר נבדקה.
  if p_client_id is not null
     and not exists (select 1 from public.clients where id = p_client_id and user_id = v_uid) then
    return jsonb_build_object('ok', false, 'error', 'client_not_found');
  end if;

  if p_client_id is null then
    select * into v_job from public.automation_jobs
     where user_id = v_uid and client_id is null and action_type = p_action_type
       and status in ('queued', 'running', 'needs_human')
     order by created_at desc limit 1;
    if found then
      return jsonb_build_object('ok', true, 'created', false, 'job', to_jsonb(v_job));
    end if;
    insert into public.automation_jobs (user_id, client_id, action_type, input, status)
    values (v_uid, null, p_action_type, coalesce(p_input, '{}'::jsonb), 'queued')
    returning * into v_job;
    return jsonb_build_object('ok', true, 'created', true, 'job', to_jsonb(v_job));
  end if;

  insert into public.automation_jobs (user_id, client_id, action_type, input, status)
  values (v_uid, p_client_id, p_action_type, coalesce(p_input, '{}'::jsonb), 'queued')
  on conflict (client_id, action_type) where status in ('queued', 'running', 'needs_human')
  do nothing
  returning * into v_job;

  if not found then
    v_created := false;
    select * into v_job from public.automation_jobs
     where client_id = p_client_id and action_type = p_action_type
       and status in ('queued', 'running', 'needs_human')
     order by created_at desc limit 1;
  end if;

  return jsonb_build_object('ok', true, 'created', v_created, 'job', to_jsonb(v_job));
end;
$function$

