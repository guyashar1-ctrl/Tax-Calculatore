-- נמשך חי 2026-09-04 מהמסד (pg_get_functiondef).
-- ארגומנטים: (ללא)
CREATE OR REPLACE FUNCTION public.adopt_representation_step_to_engagement()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  update public.onboarding_steps
     set engagement_id = new.id
   where client_id = new.client_id
     and step_type = 'representation'
     and engagement_id is null
     and status <> 'cancelled';
  return new;
end;
$function$

