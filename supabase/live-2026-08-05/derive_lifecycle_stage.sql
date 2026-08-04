-- נמשך חי 2026-08-04 מהמסד (pg_get_functiondef).
-- ארגומנטים: p_client_id text
CREATE OR REPLACE FUNCTION public.derive_lifecycle_stage(p_client_id text)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select case
    when c.lifecycle_stage = 'archived' then 'archived'
    when exists (select 1 from public.engagements e
                  where e.client_id = c.id and e.status = 'onboarding') then 'onboarding'
    when exists (select 1 from public.engagements e
                  where e.client_id = c.id and e.status in ('active','ended')) then 'active'
    when coalesce(c.representation_status, '') = 'active' then 'active'
    when exists (select 1 from public.quotations q
                  where q.client_id = c.id and q.status = 'approved') then 'onboarding'
    when exists (select 1 from public.quotations q
                  join public.leads l on l.id = q.lead_id
                  where l.converted_client_id = c.id and q.status in ('sent','viewed')) then 'quoted'
    when exists (select 1 from public.quotations q
                  where q.client_id = c.id and q.status in ('sent','viewed')) then 'quoted'
    when c.merged_from_lead_id is not null then 'lead'
    else c.lifecycle_stage
  end
  from public.clients c where c.id = p_client_id;
$function$

