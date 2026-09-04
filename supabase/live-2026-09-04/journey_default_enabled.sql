-- נמשך חי 2026-09-04 מהמסד (pg_get_functiondef).
-- ארגומנטים: p_snapshot jsonb, p_step_type text
CREATE OR REPLACE FUNCTION public.journey_default_enabled(p_snapshot jsonb, p_step_type text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select case
    -- אין צילום ⇒ התנהגות הקוד, כמו לפני 135
    when p_snapshot is null or jsonb_typeof(p_snapshot) <> 'array' then true
    -- יש רשומה ⇒ מה שכתוב בה
    when public.journey_default_entry(p_snapshot, p_step_type) is not null then
      coalesce((public.journey_default_entry(p_snapshot, p_step_type)->>'enabled')::boolean, true)
    -- יש צילום ואין רשומה ⇒ הוסרה מברירת המחדל
    else false
  end;
$function$

