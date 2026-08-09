-- 80 — תצוגה מקדימה אמיתית של דף הלקוח לרו"ח
--
-- עד היום "מה הלקוח יראה" בבונה היה חיקוי כתוב-ביד ב-TypeScript שכבר סטה
-- מהדף האמיתי (הוא לא הכיר טיוטות, ייצוג, ושער הפרסום). מעכשיו יש מקור אחד:
-- הגוף של get_client_portal עובר לפונקציית ליבה build_client_portal, ושני
-- עטיפות קוראות לה —
--   get_client_portal(p_token)             — הדף הציבורי, ללא שינוי התנהגות.
--   get_client_portal_preview(p_client_id, p_mode) — לרו"ח המחובר בלבד:
--     mode='live'    בדיוק מה שהלקוח רואה עכשיו;
--     mode='preview' מה שהוא יראה אחרי פרסום — כולל טיוטות, מסומנות
--                    draft:true, ובלי שער הפרסום של התהליך.
--
-- ‼ המיגרציה בנויה כניתוח על ההגדרה החיה (string-replace עם שומרי כישלון,
-- כמו 77) — כך הליבה נגזרת מהדף האמיתי שרץ, לא מהעתק ידני שעלול לסטות.
-- ההגדרה שנדרסה שמורה ב-supabase/live-2026-08-09/get_client_portal.sql
-- (בתוספת שינוי 77 שתועד שם).

do $mig$
declare
  def text;
begin
  select pg_get_functiondef(p.oid) into def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'get_client_portal';

  -- 1. חתימה חדשה: פונקציית ליבה לפי מזהה לקוח + מצב
  if strpos(def, 'FUNCTION public.get_client_portal(p_token text)') = 0 then
    raise exception 'מיגרציה 80: חתימת get_client_portal לא נמצאה';
  end if;
  def := replace(def,
    'FUNCTION public.get_client_portal(p_token text)',
    'FUNCTION public.build_client_portal(p_client_id text, p_mode text)');

  -- 2. איתור הלקוח לפי מזהה במקום טוקן
  if strpos(def, $s$select * into c from public.clients where portal_token = p_token limit 1;$s$) = 0 then
    raise exception 'מיגרציה 80: שורת איתור הלקוח לא נמצאה';
  end if;
  def := replace(def,
    $s$select * into c from public.clients where portal_token = p_token limit 1;$s$,
    $s$select * into c from public.clients where id = p_client_id;$s$);

  -- 3. משתנה עזר לסימון טיוטות
  if strpos(def, 'v_rep_seen boolean := false;') = 0 then
    raise exception 'מיגרציה 80: בלוק ההצהרות לא נמצא';
  end if;
  def := replace(def,
    'v_rep_seen boolean := false;',
    'v_rep_seen boolean := false;
  v_before int := 0;');

  -- 4. הסינון: בתצוגה מקדימה נכנסים גם טיוטות וגם שלבים שמאחורי שער הפרסום
  if strpos(def, $s$and st.published_at is not null
      and (v_published or st.step_type = 'representation')$s$) = 0 then
    raise exception 'מיגרציה 80: שורות הסינון לא נמצאו';
  end if;
  def := replace(def,
    $s$and st.published_at is not null
      and (v_published or st.step_type = 'representation')$s$,
    $s$and (p_mode = 'preview'
           or (st.published_at is not null and (v_published or st.step_type = 'representation')))$s$);

  -- 5. סימון טיוטות: כל פריט שנוסף מלולאת שלב-טיוטה מקבל draft:true
  if strpos(def, $s$loop
    case s.step_type$s$) = 0 then
    raise exception 'מיגרציה 80: תחילת הלולאה לא נמצאה';
  end if;
  def := replace(def,
    $s$loop
    case s.step_type$s$,
    $s$loop
    v_before := jsonb_array_length(v_items);
    case s.step_type$s$);

  if strpos(def, $s$end case;
  end loop;$s$) = 0 then
    raise exception 'מיגרציה 80: סוף הלולאה לא נמצא';
  end if;
  def := replace(def,
    $s$end case;
  end loop;$s$,
    $s$end case;

    if p_mode = 'preview' and s.published_at is null
       and jsonb_array_length(v_items) > v_before then
      select coalesce(jsonb_agg(
               case when ord > v_before then x || jsonb_build_object('draft', true) else x end
               order by ord), '[]'::jsonb)
        into v_items
        from jsonb_array_elements(v_items) with ordinality t(x, ord);
    end if;
  end loop;$s$);

  -- 6. שורת "אנחנו מכינים את המשך התהליך" אינה שייכת לתצוגת אחרי-פרסום
  if strpos(def, $s$if v_has_eng and not v_published then$s$) = 0 then
    raise exception 'מיגרציה 80: תנאי שער הפרסום לא נמצא';
  end if;
  def := replace(def,
    $s$if v_has_eng and not v_published then$s$,
    $s$if v_has_eng and not v_published and p_mode = 'live' then$s$);

  execute def;
end $mig$;

-- הליבה אינה נקראת ישירות מאף לקוח — רק דרך העטיפות.
revoke all on function public.build_client_portal(text, text) from public, anon, authenticated;

-- העטיפה הציבורית — אותה חתימה, אותה התנהגות בדיוק.
CREATE OR REPLACE FUNCTION public.get_client_portal(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  c public.clients%rowtype;
begin
  select * into c from public.clients where portal_token = p_token limit 1;
  if c.id is null then return jsonb_build_object('ok', false, 'error', 'invalid'); end if;
  return public.build_client_portal(c.id, 'live');
end;
$function$;

-- העטיפה לרו"ח: תצוגה מקדימה (או המצב החי) של לקוח שבבעלותו.
create or replace function public.get_client_portal_preview(
  p_client_id text,
  p_mode text default 'preview'
)
returns jsonb
language plpgsql
stable security definer
set search_path to 'public'
as $function$
declare
  c public.clients%rowtype;
  v_uid uuid := auth.uid();
begin
  if p_mode not in ('live', 'preview') then
    return jsonb_build_object('ok', false, 'error', 'invalid_mode');
  end if;
  select * into c from public.clients where id = p_client_id;
  if c.id is null then return jsonb_build_object('ok', false, 'error', 'client_not_found'); end if;
  if v_uid is null or c.user_id <> v_uid then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;
  return public.build_client_portal(c.id, p_mode);
end;
$function$;

revoke all on function public.get_client_portal_preview(text, text) from public, anon;
grant execute on function public.get_client_portal_preview(text, text) to authenticated;
