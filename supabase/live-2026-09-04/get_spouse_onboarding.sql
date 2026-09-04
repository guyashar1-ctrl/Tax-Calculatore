-- נמשך חי 2026-09-04 מהמסד (pg_get_functiondef).
-- ארגומנטים: p_token text
CREATE OR REPLACE FUNCTION public.get_spouse_onboarding(p_token text)
 RETURNS TABLE(firm_name text, branding jsonb, client_name text, spouse_name text, spouse_first_name text, authorities text[], scope jsonb, already_submitted boolean, identity_docs jsonb)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(p.firm_name, '') as firm_name,
         coalesce(p.branding, '{}'::jsonb) as branding,
         coalesce(
           nullif(trim(coalesce(r.identification->>'firstName','') || ' ' ||
                       coalesce(r.identification->>'lastName','')), ''),
           r.client_name, '') as client_name,
         coalesce(
           nullif(trim(coalesce(r.identification->>'spouseFirstName','') || ' ' ||
                       coalesce(r.identification->>'spouseLastName','')), ''),
           nullif(trim(coalesce(r.identification->>'spouseName','')), ''), '') as spouse_name,
         coalesce(nullif(trim(coalesce(r.identification->>'spouseFirstName','')), ''), '') as spouse_first_name,
         coalesce(r.authorities, '{}'::text[]) as authorities,
         coalesce(r.scope, c.authority_representations, '{}'::jsonb) as scope,
         (coalesce(r.identification->>'spouseFillSubmittedAt', '') <> '') as already_submitted,
         coalesce(r.identity_docs, '{}'::jsonb) as identity_docs
  from public.representation_requests r
  join public.profiles p on p.id = r.user_id
  left join public.clients c on c.id = r.linked_client_id
  where r.spouse_onboarding_token = p_token
  limit 1;
$function$

