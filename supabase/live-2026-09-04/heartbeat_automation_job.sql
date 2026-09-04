-- נמשך חי 2026-09-04 מהמסד (pg_get_functiondef).
-- ארגומנטים: p_user_id uuid, p_worker_id text, p_job_id text, p_lease_seconds integer, p_worker_version text
CREATE OR REPLACE FUNCTION public.heartbeat_automation_job(p_user_id uuid, p_worker_id text, p_job_id text DEFAULT NULL::text, p_lease_seconds integer DEFAULT 60, p_worker_version text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_job public.automation_jobs;
begin
  insert into public.automation_workers (worker_id, user_id, last_seen_at, version)
  values (p_worker_id, p_user_id, now(), p_worker_version)
  on conflict (worker_id) do update
    set last_seen_at = now(),
        user_id      = excluded.user_id,
        version      = coalesce(excluded.version, public.automation_workers.version);

  if p_job_id is null then
    return jsonb_build_object('ok', true);
  end if;

  update public.automation_jobs
     set lease_until = now() + make_interval(secs => p_lease_seconds)
   where id = p_job_id
     and claimed_by = p_worker_id
     and user_id = p_user_id
     and status = 'running'
   returning * into v_job;

  if not found then
    -- ‼ לא שגיאת תשתית: קורה כשהמשימה כבר הושלמה/נכשלה בזמן שהחכירה
    -- הבאה עמדה בתור. העובד עוצר את החכירה הזאת בשקט ולא מציג שגיאה.
    return jsonb_build_object('ok', false, 'error', 'not_owner_or_finished');
  end if;
  return jsonb_build_object('ok', true, 'job', to_jsonb(v_job));
end;
$function$

