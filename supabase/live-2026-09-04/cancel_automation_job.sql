-- נמשך חי 2026-09-04 מהמסד (pg_get_functiondef).
-- ארגומנטים: p_job_id text
CREATE OR REPLACE FUNCTION public.cancel_automation_job(p_job_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_job public.automation_jobs;
begin
  update public.automation_jobs
     set status = 'cancelled', finished_at = now()
   where id = p_job_id
     and user_id = v_uid
     and status in ('queued', 'needs_human')
   returning * into v_job;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_cancellable');
  end if;
  return jsonb_build_object('ok', true, 'job', to_jsonb(v_job));
end;
$function$

