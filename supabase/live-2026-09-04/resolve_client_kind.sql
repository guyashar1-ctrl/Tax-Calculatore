-- נמשך חי 2026-09-04 מהמסד (pg_get_functiondef).
-- ארגומנטים: p_quotation_id text, p_client_id text
CREATE OR REPLACE FUNCTION public.resolve_client_kind(p_quotation_id text, p_client_id text)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_kind text;
  c      public.clients%rowtype;
begin
  select t.kind into v_kind
    from public.quotations q
    join public.quotation_templates t on t.id = q.template_id
   where q.id = p_quotation_id;
  if v_kind is not null then return v_kind; end if;

  select * into c from public.clients where id = p_client_id;
  if c.id is null then return null; end if;

  if coalesce(c.dealer_type,'') = 'company'  then return 'company'; end if;
  if coalesce(c.dealer_type,'') = 'licensed' then return 'licensed_dealer'; end if;
  if coalesce(c.vat_status,'')  = 'authorizedDealer' then return 'licensed_dealer'; end if;
  if coalesce(c.dealer_type,'') = 'exempt'   then return 'exempt_dealer'; end if;
  if coalesce(c.vat_status,'')  = 'exemptDealer' then return 'exempt_dealer'; end if;
  return null;
end;
$function$

