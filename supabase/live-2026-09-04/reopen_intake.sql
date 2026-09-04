-- נמשך חי 2026-09-04 מהמסד (pg_get_functiondef).
-- ארגומנטים: p_token text
CREATE OR REPLACE FUNCTION public.reopen_intake(p_token text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  t record;
  v_year int := extract(year from now())::int - 1;
begin
  select * into t from public.resolve_intake_token(p_token) limit 1;
  if t.client_id is null then return false; end if;

  update public.annual_report_sessions
    set status = 'in_progress',
        current_question_id = 'year_map',
        completed_at = null
    where client_id = t.client_id and user_id = t.user_id and tax_year = v_year;

  return found;
end;
$function$

