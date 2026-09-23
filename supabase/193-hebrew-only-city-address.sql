-- ═══ 193 · עיר וכתובת בעברית בלבד ═══════════════════════════════════════════
--
-- ‼ למה בשרת ולא רק במסך: מסכי המשרד כותבים ישירות ל-clients דרך PostgREST,
--   ואין RPC אחד שכל הכתיבות עוברות בו. הטבלה היא הנתיב המשותף היחיד.
-- ‼ למה בכלל: העיר והרחוב נוסעים כמות שהם לטפסי הרשויות (ייפוי כוח, שע״ם,
--   ב״ל). תעתיק לטינית נפסל שם, ולכן זו אכיפה ולא העדפה ויזואלית.
-- ‼ המקור השכיח לערך לועזי הוא מילוי אוטומטי של הדפדפן מפרופיל באנגלית —
--   ולכן המסך דוחה את הערך בשלמותו (components/ui/HebrewTextInput.tsx), והשרת
--   כאן הוא הרשת התחתונה.
--
-- הוחל בייצור ובסביבת הבדיקות ב-23.09.2026. הנתון הקיים היחיד שהיה לועזי
-- (לקוח אחד: "Rinnatya" / "Rinatya Dereh Hasigalon 66, Center") תוקן ידנית
-- ל«רינתיה» / «דרך הסיגלון 66» לפני הוספת האילוץ.

-- ── ① הכלל, במקום אחד ────────────────────────────────────────────────────────
create or replace function public.is_hebrew_only(p_text text)
returns boolean
language sql
immutable
parallel safe
set search_path to 'pg_catalog'
as $function$
  -- מסירים את האותיות העבריות; מה שנשאר ועדיין אות — שפה אחרת.
  -- ספרות, רווחים, מקף, פסיק וגרש עוברים.
  select p_text is null
      or regexp_replace(p_text, '[֐-׿]', '', 'g') !~ '[[:alpha:]]';
$function$;

revoke all on function public.is_hebrew_only(text) from public, anon, authenticated;
grant execute on function public.is_hebrew_only(text) to authenticated, service_role;

-- ── ② האילוץ על הכרטיס ───────────────────────────────────────────────────────
alter table public.clients
  drop constraint if exists clients_city_hebrew_only,
  drop constraint if exists clients_address_hebrew_only,
  drop constraint if exists clients_property_address_hebrew_only;

alter table public.clients
  add constraint clients_city_hebrew_only check (public.is_hebrew_only(city)),
  add constraint clients_address_hebrew_only check (public.is_hebrew_only(address)),
  add constraint clients_property_address_hebrew_only check (public.is_hebrew_only(property_address));

-- ── ③ טופס הקליטה — דחייה מסודרת ─────────────────────────────────────────────
-- ‼ קודמוד ולא הדבקה של הגוף המלא: submit_onboarding_full הוא כ-8KB שנבנו
--   לאורך 166/191, והדבקה מחדש כאן הייתה מחזירה גרסה ישנה בשקט. מוסיפים שורה
--   אחת אחרי אימות הת.ז., ומאמתים שהעוגן נמצא.
do $do$
declare v text;
begin
  select pg_get_functiondef(p.oid) into v
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'submit_onboarding_full';
  if v is null then raise notice 'submit_onboarding_full לא קיימת'; return; end if;
  if position('is_hebrew_only' in v) > 0 then raise notice 'כבר מוגן'; return; end if;

  v := replace(v,
    'if not public._israeli_id_valid(p_id_number) then return false; end if;',
    'if not public._israeli_id_valid(p_id_number) then return false; end if;
  -- 193: עיר וכתובת בעברית בלבד. הבדיקה כאן כדי שהלקוח יקבל דחייה מסודרת
  -- ולא שגיאת אילוץ מהטבלה.
  if not public.is_hebrew_only(p_city) or not public.is_hebrew_only(p_address) then return false; end if;');

  if position('is_hebrew_only' in v) = 0 then
    raise exception 'העוגן לא נמצא ב-submit_onboarding_full';
  end if;
  execute v;
end $do$;
