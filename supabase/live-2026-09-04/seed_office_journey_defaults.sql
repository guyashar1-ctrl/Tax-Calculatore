-- נמשך חי 2026-09-04 מהמסד (pg_get_functiondef).
-- ארגומנטים: p_office_id uuid
CREATE OR REPLACE FUNCTION public.seed_office_journey_defaults(p_office_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_kind    text;
  v_created int := 0;
begin
  foreach v_kind in array array['exempt_dealer','licensed_dealer','company','tax_refund','representation_only'] loop
    insert into public.office_journey_defaults (office_id, client_kind, entries)
    values (p_office_id, v_kind, public.default_journey_entries(v_kind))
    on conflict (office_id, client_kind) do nothing;
    if found then v_created := v_created + 1; end if;
  end loop;
  return jsonb_build_object('ok', true, 'officeId', p_office_id, 'created', v_created);
end;
$function$

