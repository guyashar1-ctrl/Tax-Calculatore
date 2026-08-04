-- נמשך חי 2026-08-04 מהמסד (pg_get_functiondef).
-- ארגומנטים: p_token text
CREATE OR REPLACE FUNCTION public.resolve_intake_token(p_token text)
 RETURNS TABLE(user_id uuid, client_id text, client_name text, identified boolean)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select r.user_id, r.linked_client_id, r.client_name,
         (r.onboarding_status = 'submitted') as identified
  from public.representation_requests r
  where r.onboarding_token = p_token and r.linked_client_id is not null
  union all
  select c.user_id, c.id,
         trim(coalesce(c.first_name, '') || ' ' || coalesce(c.last_name, '')),
         true
  from public.clients c
  where c.intake_token = p_token
  limit 1;
$function$

