-- נמשך חי 2026-08-09 מהמסד (pg_get_functiondef).
-- ארגומנטים: p_token text
CREATE OR REPLACE FUNCTION public.start_intake(p_token text)
 RETURNS TABLE(session_id uuid, tax_year integer, model jsonb, current_question_id text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  t record;
  s public.annual_report_sessions%rowtype;
  v_year int := extract(year from now())::int - 1;
begin
  select * into t from public.resolve_intake_token(p_token) limit 1;
  if t.client_id is null then
    raise exception 'invalid token';
  end if;

  select * into s from public.annual_report_sessions ars
    where ars.client_id = t.client_id and ars.tax_year = v_year limit 1;

  if s.id is null then
    insert into public.annual_report_sessions (user_id, client_id, tax_year, status, model, current_question_id)
    values (
      t.user_id, t.client_id, v_year, 'in_progress',
      jsonb_build_object('taxYear', v_year, 'meta', jsonb_build_object('flow', 'onboarding')),
      'year_map'
    )
    returning * into s;
  end if;

  return query select s.id, s.tax_year, s.model, s.current_question_id;
end;
$function$

