-- נמשך חי 2026-08-09 מהמסד (pg_get_functiondef).
-- ארגומנטים: (ללא)
CREATE OR REPLACE FUNCTION public.flag_missing_representation_links()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  r record;
  v_n int := 0;
begin
  for r in
    select q.id, q.user_id, q.quotation_number, q.client_id
      from public.quotations q
      join public.representation_requests rr on rr.id = q.representation_request_id
     where q.status = 'approved'
       and q.representation_sent_at is null
       and coalesce(rr.onboarding_status, 'pending') = 'pending'
       and q.approved_at < now() - interval '24 hours'
       -- פעם אחת להצעה. התראה שחוזרת כל יום הופכת לרעש שמתעלמים ממנו.
       and not exists (
         select 1 from public.accountant_notifications an
          where an.kind = 'representation_link_missing'
            and an.payload->>'quotationId' = q.id)
  loop
    perform public.queue_accountant_notification(
      r.user_id, 'representation_link_missing', r.client_id, null, null, null,
      jsonb_build_object('quotationId', r.id, 'quotationNumber', r.quotation_number));
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$function$

