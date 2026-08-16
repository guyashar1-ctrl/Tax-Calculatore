-- ═══════════════════════════════════════════════════════════════════════════
-- 105 · שער סגירת הקליטה מתעלם מעבודה פנימית שהמסך כבר לא מציג
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ‼ הרקע: מסך הבקשות הפסיק להציג את הכרטיסים הפנימיים האוטומטיים (הקמה
-- פנימית, הכרת הלקוח, ביקורת חודש ראשון וכו') — הם הפכו אותו ללוח מטלות של
-- המשרד במקום למשטח "מה אני צריך מאנשים אחרים". השלבים עצמם לא נמחקו.
--
-- ‼ הבעיה שנוצרה: onboarding_close_readiness המשיכה לספור אותם כחוסמים.
-- כלומר "סגור קליטה" היה נכשל בגלל פריט שאין למשתמש שום דרך לראות, לפתוח
-- או לסמן. חסימה שאי אפשר לפתור אינה שער — היא קיר.
--
-- ‼ מה **לא** משתנה: הרשימה כאן זהה בדיוק לרשימה שירדה מהמסך, ולא רחבה
-- ממנה. יישור קו מול הרשויות (institution_alignment_*) ממשיך לחסום — הוא
-- מוצג ככרטיס "יישור קו ללקוח". כל בקשה מהלקוח ממשיכה לחסום. משימה פנימית
-- שהרו"ח הוסיף בעצמו (custom_request) ממשיכה לחסום — הוא רואה אותה.
-- required_for_close ברמת השלב ממשיך לעבוד בדיוק כמו קודם לכל שאר הסוגים.
--
-- מקבילה ב-TypeScript: LEGACY_AUTO_OFFICE_TYPES ב-src/types/onboarding.ts.
--
-- בסיס: supabase/live-2026-08-09/onboarding_close_readiness.sql — מילה במילה,
-- פרט לתנאי אחד שנוסף.

create or replace function public.onboarding_close_readiness(p_engagement_id text)
returns jsonb
language plpgsql
stable security definer
set search_path to 'public'
as $function$
declare
  e public.engagements%rowtype;
  v_blocking jsonb;
begin
  select * into e from public.engagements where id = p_engagement_id;
  if e.id is null then return jsonb_build_object('ok', false, 'error', 'engagement_not_found'); end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', id, 'stepType', step_type, 'status', status, 'ball', ball)), '[]'::jsonb)
    into v_blocking
    from public.onboarding_steps
   where engagement_id = e.id
     and status not in ('completed', 'verified', 'skipped', 'cancelled')
     and required_for_close
     -- ‼ עבודה פנימית אוטומטית שהמסך אינו מציג — אינה חוסמת.
     and step_type not in ('internal_setup', 'kyc_identification', 'first_month_review',
                           'representation_upgrade', 'opening_call', 'file_opening',
                           'data_import', 'data_verification')
     and not (step_type = 'release_letter'
              and status not in ('pending', 'locked')
              and due_date is not null
              and due_date <= current_date);

  return jsonb_build_object(
    'ok', true,
    'engagementId', e.id,
    'alreadyClosed', e.status <> 'onboarding',
    'blocking', v_blocking,
    'ready', jsonb_array_length(v_blocking) = 0);
end;
$function$;

revoke all on function public.onboarding_close_readiness(text) from public, anon;
grant execute on function public.onboarding_close_readiness(text) to authenticated;
