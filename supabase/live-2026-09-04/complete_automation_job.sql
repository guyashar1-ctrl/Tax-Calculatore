-- נמשך חי 2026-09-04 מהמסד (pg_get_functiondef).
-- ארגומנטים: p_worker_id text, p_job_id text, p_result jsonb, p_artifacts jsonb
CREATE OR REPLACE FUNCTION public.complete_automation_job(p_worker_id text, p_job_id text, p_result jsonb DEFAULT '{}'::jsonb, p_artifacts jsonb DEFAULT '[]'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_job public.automation_jobs;
begin
  update public.automation_jobs
     set status       = 'succeeded',
         result       = p_result,
         artifacts    = coalesce(p_artifacts, '[]'::jsonb),
         error_code   = null,
         error_detail = null,
         needs_human  = null,
         finished_at  = now()
   where id = p_job_id
     and claimed_by = p_worker_id
     and status = 'running'
   returning * into v_job;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_owner_or_already_finished');
  end if;
  return jsonb_build_object('ok', true, 'job', to_jsonb(v_job));
end;
$function$

