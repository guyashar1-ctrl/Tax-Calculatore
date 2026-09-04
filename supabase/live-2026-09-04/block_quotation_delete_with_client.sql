-- נמשך חי 2026-09-04 מהמסד (pg_get_functiondef).
-- ארגומנטים: (ללא)
CREATE OR REPLACE FUNCTION public.block_quotation_delete_with_client()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if old.client_id is not null and exists (select 1 from clients where id = old.client_id) then
    raise exception 'ההצעה מקושרת ללקוח קיים ואינה ניתנת למחיקה. מחק קודם את כרטיס הלקוח - ההצעה תתנתק ממנו ואז תוכל להימחק.'
      using errcode = 'P0001';
  end if;
  return old;
end;
$function$

