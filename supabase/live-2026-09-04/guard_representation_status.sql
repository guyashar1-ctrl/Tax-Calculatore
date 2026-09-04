-- נמשך חי 2026-09-04 מהמסד (pg_get_functiondef).
-- ארגומנטים: (ללא)
CREATE OR REPLACE FUNCTION public.guard_representation_status()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if coalesce(old.status,'') = 'active' and coalesce(new.status,'') <> 'active' then
    raise exception 'representation_active_is_terminal'
      using hint = 'לקוח מיוצג נשאר מיוצג. ביטול ייצוג אינו קיים עדיין במערכת.';
  end if;
  return new;
end;
$function$

