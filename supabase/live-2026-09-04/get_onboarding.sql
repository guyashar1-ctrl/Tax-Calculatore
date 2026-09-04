-- נמשך חי 2026-09-04 מהמסד (pg_get_functiondef).
-- ארגומנטים: p_token text
CREATE OR REPLACE FUNCTION public.get_onboarding(p_token text)
 RETURNS TABLE(client_name text, firm_name text, branding jsonb, already_submitted boolean, status text, authorities text[], already_signed boolean, has_setup boolean, known_first_name text, known_last_name text, known_email text, known_family_status text, known_family_status_year integer, ni_included boolean, prefill jsonb, scope jsonb, identity_docs jsonb)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select r.client_name,
         coalesce(p.firm_name, '') as firm_name,
         coalesce(p.branding, '{}'::jsonb) as branding,
         (r.onboarding_status = 'submitted') as already_submitted,
         r.status,
         coalesce(r.authorities, '{}'::text[]) as authorities,
         (r.identification ? 'signatureDataUrl') as already_signed,
         (r.signature_setup is not null) as has_setup,
         nullif(c.first_name, '') as known_first_name,
         nullif(c.last_name, '')  as known_last_name,
         nullif(coalesce(c.email, r.client_email), '') as known_email,
         nullif(c.family_status, '') as known_family_status,
         case c.family_status
           when 'married'  then c.marriage_year
           when 'divorced' then c.divorce_year
           when 'widowed'  then c.widowhood_year
           else null
         end as known_family_status_year,
         coalesce(c.authority_representations ? 'nationalInsurance', false) as ni_included,
         coalesce(r.prefill, '{}'::jsonb) as prefill,
         coalesce(r.scope, c.authority_representations, '{}'::jsonb) as scope,
         coalesce(r.identity_docs, '{}'::jsonb) as identity_docs
  from public.representation_requests r
  join public.profiles p on p.id = r.user_id
  left join public.clients c on c.id = r.linked_client_id
  where r.onboarding_token = p_token
  limit 1;
$function$

