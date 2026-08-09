-- נמשך חי 2026-08-09 מהמסד (pg_get_functiondef).
-- ארגומנטים: (ללא)
CREATE OR REPLACE FUNCTION public.trg_sync_rep_upgrade()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if tg_op = 'INSERT' then
    if coalesce(new.authority_representations, '{}'::jsonb) <> '{}'::jsonb then
      perform public.sync_representation_upgrade_step(new.id);
    end if;
  elsif coalesce(old.authority_representations, '{}'::jsonb)
        is distinct from coalesce(new.authority_representations, '{}'::jsonb) then
    perform public.sync_representation_upgrade_step(new.id);
  end if;
  return new;
end;
$function$

