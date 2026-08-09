-- נמשך חי 2026-08-09 מהמסד (pg_get_functiondef).
-- ארגומנטים: p_token text
CREATE OR REPLACE FUNCTION public.mark_quotation_viewed(p_token text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  q public.quotations%rowtype;
  v_last timestamptz;
begin
  select * into q from public.quotations where public_token = p_token limit 1;
  if q.id is null then return false; end if;
  -- הצעה שכבר אושרה/פגה/בוטלה אינה "נצפית" — הצפייה שם אינה מידע שימושי.
  if q.status not in ('sent','viewed') then return true; end if;

  select max((e->>'at')::timestamptz) into v_last
    from jsonb_array_elements(coalesce(q.events, '[]'::jsonb)) e
    where e->>'type' = 'viewed';

  if v_last is not null and v_last > now() - interval '30 minutes' then
    return true;                       -- אותה ישיבה — לא רושמים שוב
  end if;

  update public.quotations
     set status = case when status = 'sent' then 'viewed' else status end,
         first_viewed_at = coalesce(first_viewed_at, now()),
         events = coalesce(events, '[]'::jsonb) || jsonb_build_object('type','viewed','at', now())
   where id = q.id;

  return true;
end;
$function$

