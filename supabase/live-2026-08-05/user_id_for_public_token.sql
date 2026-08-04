-- נמשך חי 2026-08-04 מהמסד (pg_get_functiondef).
-- ארגומנטים: p_token text
CREATE OR REPLACE FUNCTION public.user_id_for_public_token(p_token text)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select user_id from public.quotations where public_token = p_token
  union all
  select user_id from public.representation_requests where onboarding_token = p_token
  union all
  select r.user_id from public.representation_requests r
    where exists (select 1 from jsonb_array_elements(coalesce(r.signers, '[]'::jsonb)) s
                  where s->>'signToken' = p_token)
  limit 1;
$function$

