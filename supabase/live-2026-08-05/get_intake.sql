-- נמשך חי 2026-08-04 מהמסד (pg_get_functiondef).
-- ארגומנטים: p_token text
CREATE OR REPLACE FUNCTION public.get_intake(p_token text)
 RETURNS TABLE(session_id uuid, tax_year integer, model jsonb, current_question_id text, session_status text, client_name text, identified boolean, firm_name text, branding jsonb)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select s.id, s.tax_year, s.model, s.current_question_id, s.status,
         t.client_name, t.identified,
         p.firm_name, p.branding
  from public.resolve_intake_token(p_token) t
  left join public.profiles p on p.id = t.user_id
  left join public.annual_report_sessions s
    on s.client_id = t.client_id
   and s.user_id = t.user_id
   and s.tax_year = (extract(year from now())::int - 1)
  limit 1;
$function$

