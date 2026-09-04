-- נמשך חי 2026-09-04 מהמסד (pg_get_functiondef).
-- ארגומנטים: (ללא)
CREATE OR REPLACE FUNCTION public.apply_due_engagement_transitions()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare r record; n int := 0;
begin
  for r in
    select e.id, e.client_id, e.user_id, e.supersedes_engagement_id
      from public.engagements e
     where e.status = 'scheduled' and e.effective_from <= current_date
     order by e.effective_from, e.created_at
  loop
    update public.engagements
       set status = 'ended', ended_at = now(), updated_at = now()
     where client_id = r.client_id and status in ('onboarding','active') and id <> r.id;

    if r.supersedes_engagement_id is not null then
      update public.onboarding_steps
         set engagement_id = r.id, updated_at = now()
       where engagement_id = r.supersedes_engagement_id
         and coalesce(status, '') not in ('completed','verified','skipped','cancelled');
    end if;

    update public.engagements
       set status = 'active', activated_at = coalesce(activated_at, now()), updated_at = now()
     where id = r.id;

    perform public.log_onboarding_event(r.user_id, null, r.id, 'created', 'system',
      'ההתקשרות נכנסה לתוקף', jsonb_build_object('supersedes', r.supersedes_engagement_id));
    n := n + 1;
  end loop;
  return n;
end;
$function$

