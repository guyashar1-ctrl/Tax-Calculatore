-- 68 · חובה/רשות לכל שלב קליטה
--
-- ‼‼ לא הוחל על המסד החי. דורש אישור מפורש לפני הרצה.
--
-- למה: היום "מה חוסם סגירה" נקבע לפי סוג השלב בלבד — כל שלב פתוח חוסם,
-- למעט representation_upgrade ו-first_month_review. זה גס מדי: אותו סוג
-- יכול להיות חובה במסע אחד ורשות במסע אחר (ייבוא היסטוריה, שאלון, בקשה
-- חופשית). ההחלטה עוברת לשלב עצמו.

-- ── 1 · העמודה ───────────────────────────────────────────────────────────────
-- מתווספת כ-nullable כדי שהמילוי לאחור ירוץ בלי לנעול ובלי לנחש, ורק
-- אחריו נקבעים NOT NULL וברירת מחדל.
alter table public.onboarding_steps
  add column if not exists required_for_close boolean;

comment on column public.onboarding_steps.required_for_close is
  'האם השלב חוסם סגירת קליטה. ברירת מחדל true — שלב שביקשנו הוא עבודה.';

-- ── 2 · מילוי לאחור · שימור התנהגות קיימת מדויק ─────────────────────────────
-- הכלל: מה שנסגר אתמול ייסגר גם היום, ומה שנחסם אתמול ייחסם גם היום.
--
-- 2a. שני הסוגים שמעולם לא חסמו → רשות.
update public.onboarding_steps
   set required_for_close = false
 where required_for_close is null
   and step_type in ('representation_upgrade', 'first_month_review');

-- 2b. ‼ שאלון שכבר נשלח ללקוח (waiting_client) נחשב עד היום "מסופק" ולא
--     חסם סגירה. ההקלה הזאת מבוטלת בקוד החדש, ולכן בדיוק השורות שנהנו
--     ממנה מסומנות רשות — אחרת קליטה שהיה אפשר לסגור אתמול הייתה ננעלת
--     היום. שאלון במצב אחר (pending) חסם אתמול ויחסום גם מחר.
update public.onboarding_steps
   set required_for_close = false
 where required_for_close is null
   and step_type = 'intake_questionnaire'
   and status = 'waiting_client';

-- 2c. כל השאר → נדרש. זהה בדיוק לרשימת החוסמים של היום.
update public.onboarding_steps
   set required_for_close = true
 where required_for_close is null;

-- ── 3 · ברירת מחדל ואילוץ ────────────────────────────────────────────────────
alter table public.onboarding_steps
  alter column required_for_close set default true;
alter table public.onboarding_steps
  alter column required_for_close set not null;

-- ── 4 · יצירת בקשה — הרו״ח מחליט לכל בקשה ───────────────────────────────────
-- פרמטר חדש בסוף עם ברירת מחדל, כדי שקריאות קיימות ימשיכו לעבוד כמות שהן.
create or replace function public.create_onboarding_request(
  p_client_id text,
  p_step_type text,
  p_payload jsonb default '{}'::jsonb,
  p_due_date date default null,
  p_depends_on text default null,
  p_published boolean default true,
  p_required_for_close boolean default true
) returns jsonb
language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_eng public.engagements%rowtype;
  v_id  text := replace(gen_random_uuid()::text, '-', '');
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;

  select * into v_eng from public.engagements
   where client_id = p_client_id and status = 'onboarding' and user_id = v_uid
   order by created_at desc limit 1;

  insert into public.onboarding_steps (
    id, user_id, engagement_id, client_id, step_type, track, scope, status, ball,
    depends_on_step_id, due_date, needs_attention, payload, completion_method,
    required_for_close,
    sort_order)
  values (
    v_id, v_uid, v_eng.id, p_client_id, p_step_type,
    public.onboarding_track_for(p_step_type), 'engagement', 'pending', 'client',
    p_depends_on, p_due_date, false,
    case when p_published then p_payload else p_payload || jsonb_build_object('published', false) end,
    'manual',
    coalesce(p_required_for_close, true),
    coalesce((select max(sort_order) + 1 from public.onboarding_steps where client_id = p_client_id), 0));

  perform public.log_onboarding_event(v_uid, v_id, v_eng.id, 'created', 'accountant',
    'בקשה נוספה ידנית', jsonb_build_object('requiredForClose', coalesce(p_required_for_close, true)));

  return jsonb_build_object('ok', true, 'stepId', v_id);
end;
$function$;

-- ── 5 · מוכנות הסגירה קוראת מהעמודה ─────────────────────────────────────────
-- ‼ שתי ההקלות שהיו לפי סוג יורדות: "שאלון שנשלח" ו-"ריטיינר/שחרור לפי
--   ספירה". במקומן — חוק אחד: שלב נדרש שאינו סגור, חוסם. ההקלה החוקית
--   היחידה שנשארת היא חלון ההתנגדות של מכתב השחרור (תקנה 16).
create or replace function public.onboarding_close_readiness(p_engagement_id text)
returns jsonb
language plpgsql stable security definer set search_path to 'public'
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
     -- מכתב שחרור שחלון ההתנגדות שלו עבר — שתיקה היא הסכמה.
     and not (step_type = 'release_letter' and due_date is not null and due_date <= current_date);

  return jsonb_build_object(
    'ok', true,
    'engagementId', e.id,
    'alreadyClosed', e.status <> 'onboarding',
    'blocking', v_blocking,
    'ready', jsonb_array_length(v_blocking) = 0);
end;
$function$;

-- ── רולבק ────────────────────────────────────────────────────────────────────
-- 1. שחזור שתי הפונקציות מ-supabase/live-2026-08-05/ (העותק החי שנשמר לפני).
-- 2. alter table public.onboarding_steps drop column required_for_close;
-- העמודה אינה נקראת בשום מקום אחר, ולכן הפלת העמודה בטוחה אחרי שחזור הפונקציות.
