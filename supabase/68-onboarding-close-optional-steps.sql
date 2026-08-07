-- 68 · כללי סגירת קליטה — שלבי רשות אינם חוסמים
--
-- ‼ לא הוחל על המסד החי. דורש אישור מפורש לפני הרצה (משנה התנהגות פרודקשן).
--
-- מה קיים היום (נקרא מהמסד ב-2026-08-07):
--   close_onboarding מחזיר {ok:false, error:'not_ready'} כשלא מוכן ו-p_force=false.
--   כלומר החסימה בשרת *כבר קיימת ופועלת*. המיגרציה הזאת אינה מוסיפה חסימה —
--   היא מדייקת מה נחשב חוסם.
--
-- מה משתנה:
--   onboarding_close_readiness סופר כיום כל שלב פתוח כחוסם, למעט
--   representation_upgrade ו-first_month_review. לכן בקשה חופשית ("עדכון
--   תמונת מס"), ייבוא היסטוריה ואימות נתונים חוסמים סגירה — למרות שהם עבודה
--   שממשיכה ברקע אחרי שהלקוח כבר שוטף. הרשימה מורחבת לחמישה סוגי רשות,
--   בהתאמה מדויקת ל-OPTIONAL_STEP_TYPES ב-src/types/onboarding.ts.

create or replace function public.onboarding_close_readiness(p_engagement_id text)
returns jsonb
language plpgsql
stable security definer
set search_path to 'public'
as $function$
declare
  e public.engagements%rowtype;
  v_retainer  text;
  v_release   text;
  v_intake    text;
  v_blocking  jsonb;
begin
  select * into e from public.engagements where id = p_engagement_id;
  if e.id is null then return jsonb_build_object('ok', false, 'error', 'engagement_not_found'); end if;

  select case when count(*) = 0 then 'not_required'
              when count(*) filter (where status in ('completed','verified','skipped')) = count(*) then 'done'
              else 'open' end
    into v_retainer
    from public.onboarding_steps
   where client_id = e.client_id and step_type = 'retainer_authorization' and status <> 'cancelled';

  select case when count(*) = 0 then 'not_required'
              when count(*) filter (where status in ('completed','verified','skipped')) = count(*) then 'done'
              when bool_or(due_date is not null and due_date <= current_date) then 'no_objection'
              else 'open' end
    into v_release
    from public.onboarding_steps
   where client_id = e.client_id and step_type = 'release_letter' and status <> 'cancelled';

  select case when count(*) = 0 then 'not_required'
              when count(*) filter (where status in ('completed','verified','skipped')) = count(*) then 'done'
              when bool_or(status = 'waiting_client') then 'sent'
              else 'open' end
    into v_intake
    from public.onboarding_steps
   where client_id = e.client_id and step_type = 'intake_questionnaire' and status <> 'cancelled';

  -- ‼ השינוי היחיד: חמישה סוגי רשות במקום שניים.
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'stepType', step_type, 'status', status, 'ball', ball)), '[]'::jsonb)
    into v_blocking
    from public.onboarding_steps
   where engagement_id = e.id
     and status not in ('completed','verified','skipped','cancelled')
     and step_type not in (
       'representation_upgrade',
       'first_month_review',
       'custom_request',
       'data_import',
       'data_verification');

  return jsonb_build_object(
    'ok', true,
    'engagementId', e.id,
    'alreadyClosed', e.status <> 'onboarding',
    'retainer', v_retainer,
    'releaseLetter', v_release,
    'intake', v_intake,
    'blocking', v_blocking,
    'ready', v_retainer in ('done','not_required')
         and v_release in ('done','not_required','no_objection')
         and v_intake  in ('done','not_required','sent')
         and jsonb_array_length(v_blocking) = 0);
end;
$function$;
