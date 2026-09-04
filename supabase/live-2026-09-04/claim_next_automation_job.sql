-- נמשך חי 2026-09-04 מהמסד (pg_get_functiondef).
-- ארגומנטים: p_user_id uuid, p_worker_id text, p_action_types text[], p_lease_seconds integer
CREATE OR REPLACE FUNCTION public.claim_next_automation_job(p_user_id uuid, p_worker_id text, p_action_types text[] DEFAULT NULL::text[], p_lease_seconds integer DEFAULT 60)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_job public.automation_jobs;
begin
  -- העוגן: 'queued' רגיל, או 'running' שהחכירה שלו כבר פקעה (עובד שמת/נתקע) —
  -- שתי הצורות זהות מנקודת המבט של מי שמחפש עבודה. FOR UPDATE SKIP LOCKED
  -- הוא הבטחת האטומיות: שני עובדים שתופסים באותו רגע לא יכולים לזכות באותה
  -- שורה — השני פשוט מדלג אליה ומוצא את הבאה.
  update public.automation_jobs
     set status      = 'running',
         claimed_by  = p_worker_id,
         claimed_at  = now(),
         lease_until = now() + make_interval(secs => p_lease_seconds),
         attempts    = attempts + 1
   where id = (
     select id from public.automation_jobs
      where user_id = p_user_id
        and (p_action_types is null or action_type = any(p_action_types))
        and (
          status = 'queued'
          or (status = 'running' and lease_until < now())
        )
      order by created_at asc
      limit 1
      for update skip locked
   )
   returning * into v_job;

  if not found then
    return null;
  end if;
  return to_jsonb(v_job);
end;
$function$

