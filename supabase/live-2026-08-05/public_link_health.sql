-- נמשך חי 2026-08-05 מהמסד (pg_get_functiondef).
-- ארגומנטים: (ללא)
CREATE OR REPLACE FUNCTION public.public_link_health()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with quote_links as (
    select (public.get_quotation(q.public_token)->>'quotationNumber') is not null as ok
    from public.quotations q where q.public_token is not null
  ),
  onboard_links as (
    select (select count(*) from public.get_onboarding(r.onboarding_token)) = 1 as ok
    from public.representation_requests r where r.onboarding_token is not null
  ),
  intake_links as (
    select (select count(*) from public.resolve_intake_token(c.intake_token)) >= 1 as ok
    from public.clients c where c.intake_token is not null
  ),
  sign_tokens as (
    select (select count(*) from public.user_id_for_public_token(s->>'signToken')) >= 1 as ok
    from public.representation_requests r,
         lateral jsonb_array_elements(coalesce(r.signers,'[]'::jsonb)) s
    where s->>'signToken' is not null
  ),
  portal_links as (
    select coalesce((public.get_client_portal(c.portal_token)->>'ok')::boolean, false) as ok
    from public.clients c where c.portal_token is not null
  ),
  release_links as (
    select coalesce((public.get_release_portal(s.payload->>'releaseToken')->>'ok')::boolean, false) as ok
    from public.onboarding_steps s
    where s.step_type = 'release_letter' and nullif(s.payload->>'releaseToken','') is not null
  )
  select jsonb_build_object(
    'quote',    jsonb_build_object('total',(select count(*) from quote_links),   'ok',(select count(*) from quote_links   where ok)),
    'onboard',  jsonb_build_object('total',(select count(*) from onboard_links), 'ok',(select count(*) from onboard_links where ok)),
    'intake',   jsonb_build_object('total',(select count(*) from intake_links),  'ok',(select count(*) from intake_links  where ok)),
    'sign',     jsonb_build_object('total',(select count(*) from sign_tokens),   'ok',(select count(*) from sign_tokens   where ok)),
    'portal',   jsonb_build_object('total',(select count(*) from portal_links),  'ok',(select count(*) from portal_links  where ok)),
    'release',  jsonb_build_object('total',(select count(*) from release_links), 'ok',(select count(*) from release_links where ok)),
    'allHealthy', (select count(*) from quote_links where not ok)
                + (select count(*) from onboard_links where not ok)
                + (select count(*) from intake_links where not ok)
                + (select count(*) from sign_tokens where not ok)
                + (select count(*) from portal_links where not ok)
                + (select count(*) from release_links where not ok) = 0
  );
$function$

