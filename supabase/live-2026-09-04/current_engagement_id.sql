-- נמשך חי 2026-09-04 מהמסד (pg_get_functiondef).
-- ארגומנטים: p_client_id text
CREATE OR REPLACE FUNCTION public.current_engagement_id(p_client_id text)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select e.id
    from public.engagements e
   where e.client_id = p_client_id
     and e.status in ('onboarding','active')
     and e.effective_from <= current_date
   order by e.effective_from desc, e.created_at desc
   limit 1;
$function$

