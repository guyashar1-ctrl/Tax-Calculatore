-- נמשך חי 2026-09-04 מהמסד (pg_get_functiondef).
-- ארגומנטים: p_worker_id text, p_job_id text, p_error_code text, p_error_detail text, p_needs_human text
CREATE OR REPLACE FUNCTION public.fail_automation_job(p_worker_id text, p_job_id text, p_error_code text, p_error_detail text DEFAULT NULL::text, p_needs_human text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_job    public.automation_jobs;
  v_status text := case when p_needs_human is not null then 'needs_human' else 'failed' end;
begin
  update public.automation_jobs
     set status       = v_status,
         error_code   = p_error_code,
         error_detail = left(coalesce(p_error_detail, ''), 500),
         needs_human  = p_needs_human,
         finished_at  = case when v_status = 'failed' then now() else null end
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

