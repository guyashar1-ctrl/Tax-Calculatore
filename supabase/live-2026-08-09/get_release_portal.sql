-- נמשך חי 2026-08-09 מהמסד (pg_get_functiondef).
-- ארגומנטים: p_token text
CREATE OR REPLACE FUNCTION public.get_release_portal(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  s        public.onboarding_steps%rowtype;
  m        public.onboarding_steps%rowtype;
  c        public.clients%rowtype;
  p        public.profiles%rowtype;
  v_items  jsonb := '[]'::jsonb;
  v_done   int := 0;
  v_total  int := 0;
begin
  select * into s from public.onboarding_steps
   where step_type = 'release_letter' and payload->>'releaseToken' = p_token limit 1;
  if s.id is null then return jsonb_build_object('ok', false, 'error', 'invalid'); end if;

  select * into c from public.clients where id = s.client_id;
  select * into p from public.profiles where id = s.user_id;
  select * into m from public.onboarding_steps
    where client_id = s.client_id and step_type = 'materials_received' and status <> 'cancelled' limit 1;

  if m.id is not null then
    select coalesce(jsonb_agg(jsonb_build_object(
             'key', x->>'key', 'label', x->>'label',
             'done', coalesce((x->>'done')::boolean, false)) order by ord), '[]'::jsonb)
      into v_items
      from jsonb_array_elements(coalesce(m.payload->'checklist','[]'::jsonb)) with ordinality t(x, ord);
    select count(*) filter (where (x->>'done')::boolean), count(*)
      into v_done, v_total from jsonb_array_elements(v_items) x;
  end if;

  return jsonb_build_object(
    'ok', true,
    'firmName', coalesce(p.firm_name, 'המשרד'),
    'branding', coalesce(p.branding, '{}'::jsonb),
    'clientName', trim(coalesce(c.first_name,'') || ' ' || coalesce(c.last_name,'')),
    'businessName', nullif(trim(coalesce(c.business_name,'')), ''),
    'prevAccountantName', nullif(trim(coalesce(c.prev_accountant_name,'')), ''),
    'subject', nullif(s.payload->>'releaseSubject',''),
    'body', nullif(s.payload->>'releaseBody',''),
    'sentAt', s.payload->>'releaseSentAt',
    'objectionDueDate', s.payload->>'objectionDueDate',
    'signed', (s.payload->>'prevAccountantSignedAt') is not null,
    'signedAt', s.payload->>'prevAccountantSignedAt',
    'signerName', s.payload->>'prevAccountantSignerName',
    'materialsStepId', m.id,
    'materials', v_items,
    'materialsDone', v_done,
    'materialsTotal', v_total);
end;
$function$

