-- נמשך חי 2026-08-04 מהמסד (pg_get_functiondef).
-- ארגומנטים: p_quotation_id text
CREATE OR REPLACE FUNCTION public.copy_lead_facts_to_client(p_quotation_id text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  q public.quotations%rowtype;
  l public.leads%rowtype;
begin
  select * into q from public.quotations where id = p_quotation_id;
  if q.id is null or q.client_id is null then return; end if;

  select * into l from public.leads
    where id = q.lead_id or converted_client_id = q.client_id
    order by (id = q.lead_id) desc limit 1;
  if l.id is null then return; end if;

  -- coalesce בלבד: מה שהרו"ח כבר הזין בכרטיס לעולם לא נדרס.
  update public.clients c
    set business_name           = coalesce(c.business_name, l.business_name),
        dealer_type             = coalesce(c.dealer_type, l.dealer_type),
        has_previous_accountant = coalesce(c.has_previous_accountant, l.has_previous_accountant),
        prev_accountant_name    = coalesce(c.prev_accountant_name, l.prev_accountant_name),
        prev_accountant_email   = coalesce(c.prev_accountant_email, l.prev_accountant_email),
        prev_accountant_phone   = coalesce(c.prev_accountant_phone, l.prev_accountant_phone),
        referral_source         = coalesce(c.referral_source, l.referral_source),
        business_transfer       = coalesce(c.business_transfer, l.business_transfer)
    where c.id = q.client_id;
end;
$function$

