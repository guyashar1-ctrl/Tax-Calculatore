-- ─── 100: בקשה שהוסרה — הוספה חוזרת מחייה אותה, לא יוצרת שנייה ──────────────
-- מה נשבר (התגלה אצל גיא, 2026-08-16): כיבוי המתג של "מסמכים מהלקוח" מסמן את
-- השלב כ-cancelled אבל השורה נשארת. מסך "+ בקשה" מסנן שלבים מבוטלים ולכן הציע
-- את הסוג שוב — וההוספה נפלה על
--   duplicate key value violates unique constraint "onboarding_steps_engagement_type_idx"
--
-- שני האינדקסים אינם מסכימים ביניהם מה שלב מבוטל תופס:
--   onboarding_steps_person_type_idx     — ‏status <> 'cancelled'  ⇒ משחרר מקום
--   onboarding_steps_engagement_type_idx — בלי תנאי סטטוס          ⇒ ממשיך לתפוס
--
-- ‼ לא הרחבתי את האינדקס. הבחירה כאן היא הפוכה: שורה אחת לכל (התקשרות, סוג)
-- היא אינווריאנטה שקוד אחר נשען עליה (המרכיב ובונה התבניות בודקים `not exists`
-- לפי סוג, וסנכרון הייצוג מוצא שלב יחיד). שתי שורות "מסמכים מהלקוח" — אחת
-- כבויה ואחת דלוקה — גם היו נראות למשתמש כתקלה. לכן: הוספה חוזרת של סוג שכבר
-- קיים כמבוטל **מחייה את השורה הקיימת** עם התוכן החדש.
--
-- מה זה אומר בפועל: הרשימה, תאריך היעד, התלות והחובה נכתבים מחדש מהחלון —
-- הבקשה הישנה הוסרה, ומה שנשמר ממנה אינו רלוונטי. היסטוריית האירועים נשמרת
-- (אותו step id) ולכן רואים בציר הזמן גם את ההסרה וגם את ההחייאה.
--
-- ‼ הבקשה החופשית (custom_request) אינה עוברת בנתיב הזה — היא מחוץ לשני
-- האינדקסים בכוונה, והרו"ח מוסיף כמה שהוא צריך. מוסיפים לה שורה חדשה כתמיד.
--
-- נבנה על ההגדרה החיה (pg_get_functiondef, 2026-08-16): p_owner, p_stage_id,
-- published_at ו-validate_requirements נשמרו כלשונם. אין שינוי חתימה.
--
-- ── מה נבדק (2026-08-16, פרודקשן) ────────────────────────────────────────────
-- בשאילתה, בטרנזקציה שגולגלה לאחור: בקשה פעילה מאותו סוג ⇒ step_type_exists
-- (במקום duplicate key); בקשה מבוטלת ⇒ ok:true, revived:true, שורה אחת בלבד.
-- בדפדפן על משתמש הבדיקה (לקוח "רותי לקוח"): ביטלתי את "מסמכים מהלקוח",
-- הקטלוג הציע אותו שוב, הוספתי רשימה חדשה בת 3 מסמכים — הבקשה חזרה למסלול
-- כטיוטה עם התוכן החדש, אותו step id, ובלי שורה כפולה.

create or replace function public.create_onboarding_request(
  p_client_id text,
  p_step_type text,
  p_payload jsonb default '{}'::jsonb,
  p_due_date date default null,
  p_depends_on text default null,
  p_published boolean default true,
  p_required_for_close boolean default true,
  p_owner text default null,
  p_stage_id text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  c      public.clients%rowtype;
  v_uid  uuid := auth.uid();
  v_eng  text;
  v_id   text;
  v_ball text;
  v_next int;
  v_dep  public.onboarding_steps%rowtype;
  v_status text := 'pending';
  v_err  text;
  v_ext_kind text;
  v_old  text;
  v_payload jsonb;
begin
  select * into c from public.clients where id = p_client_id;
  if c.id is null then return jsonb_build_object('ok', false, 'error', 'client_not_found'); end if;
  if v_uid is null or c.user_id <> v_uid then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;

  if p_step_type not in ('client_documents','prev_accountant_details','custom_request',
                         'paperless_invite','paperless_connection','retainer_authorization',
                         'release_letter','materials_received','file_opening',
                         'intake_questionnaire','kyc_identification','internal_setup') then
    return jsonb_build_object('ok', false, 'error', 'step_type_not_allowed');
  end if;

  if p_owner is not null and p_owner not in ('client','me','external') then
    return jsonb_build_object('ok', false, 'error', 'bad_owner');
  end if;

  if p_owner = 'external' then
    v_ext_kind := coalesce(p_payload->'externalParty'->>'kind', '');
    if v_ext_kind not in ('prev_accountant','other') then
      return jsonb_build_object('ok', false, 'error', 'missing_external_party');
    end if;
  end if;

  if p_step_type = 'custom_request' then
    if coalesce(p_owner, 'client') = 'client' then
      v_err := public.validate_requirements(p_payload->'requirements');
      if v_err is not null then return jsonb_build_object('ok', false, 'error', v_err); end if;
    elsif p_payload ? 'requirements'
          and coalesce(jsonb_array_length(p_payload->'requirements'), 0) > 0 then
      v_err := public.validate_requirements(p_payload->'requirements');
      if v_err is not null then return jsonb_build_object('ok', false, 'error', v_err); end if;
    end if;
  end if;

  if p_stage_id is not null then
    if not exists (select 1 from public.journey_stages js
                    where js.id = p_stage_id and js.client_id = c.id) then
      return jsonb_build_object('ok', false, 'error', 'stage_not_found');
    end if;
  end if;

  select id into v_eng from public.engagements
   where client_id = c.id and status = 'onboarding' order by created_at desc limit 1;
  if v_eng is null then
    select id into v_eng from public.engagements where client_id = c.id order by created_at desc limit 1;
  end if;

  v_ball := case
    when p_owner = 'me' then 'me'
    when p_owner = 'client' then 'client'
    when p_owner = 'external' then
      case when v_ext_kind = 'prev_accountant' then 'prev_accountant' else 'external' end
    when p_step_type in ('client_documents','prev_accountant_details','custom_request')
      then 'client'
    else 'me'
  end;

  if p_depends_on is not null then
    select * into v_dep from public.onboarding_steps where id = p_depends_on and client_id = c.id;
    if v_dep.id is null then return jsonb_build_object('ok', false, 'error', 'dependency_not_found'); end if;
    if v_dep.status not in ('completed','verified','skipped') then v_status := 'locked'; end if;
  end if;

  -- בקשה פעילה מאותו סוג כבר קיימת — אין מה להוסיף, ומסך הקטלוג ממילא מסנן
  -- אותה. הבדיקה כאן היא בשביל מסך מיושן או שני חלונות פתוחים.
  if p_step_type <> 'custom_request'
     and exists (select 1 from public.onboarding_steps
                  where client_id = c.id and step_type = p_step_type
                    and status <> 'cancelled') then
    return jsonb_build_object('ok', false, 'error', 'step_type_exists');
  end if;

  select coalesce(max(sort_order), 0) + 10 into v_next
    from public.onboarding_steps where client_id = c.id;

  v_payload := coalesce(p_payload, '{}'::jsonb)
    || case when p_published then '{}'::jsonb else jsonb_build_object('published', false) end;

  -- שורה מבוטלת מאותו סוג עדיין תופסת את הצמד (התקשרות, סוג). מעדיפים את זו
  -- שבהתקשרות הנוכחית — היא זו שתחסום את ההוספה.
  if p_step_type <> 'custom_request' then
    select id into v_old from public.onboarding_steps
     where client_id = c.id and step_type = p_step_type and status = 'cancelled'
     order by (engagement_id is not distinct from v_eng) desc, updated_at desc
     limit 1;
  end if;

  if v_old is not null then
    -- קשתות תלות ישנות יורדות במלואן: לשלב אפשרו כמה הורים, והטריגר על
    -- העמודה הבודדת אינו מנקה את מה שנוסף מעבר לה.
    delete from public.onboarding_step_dependencies where step_id = v_old;

    update public.onboarding_steps set
      engagement_id      = coalesce(v_eng, engagement_id),
      track              = public.onboarding_track_for(p_step_type),
      scope              = 'person',
      status             = v_status,
      ball               = v_ball,
      depends_on_step_id = p_depends_on,
      due_date           = p_due_date,
      sort_order         = v_next,
      payload            = v_payload,
      required_for_close = coalesce(p_required_for_close, true),
      published_at       = case when p_published then now() else null end,
      stage_id           = p_stage_id,
      completed_by       = null,
      completed_at       = null,
      verified_at        = null,
      updated_at         = now()
    where id = v_old;

    if p_depends_on is not null then
      insert into public.onboarding_step_dependencies (step_id, depends_on_step_id, user_id)
      values (v_old, p_depends_on, c.user_id)
      on conflict do nothing;
    end if;

    v_id := v_old;
  else
    insert into public.onboarding_steps
      (user_id, engagement_id, client_id, step_type, track, scope, status, ball,
       depends_on_step_id, due_date, sort_order, payload, required_for_close,
       published_at, stage_id)
    values
      (c.user_id, v_eng, c.id, p_step_type, public.onboarding_track_for(p_step_type), 'person',
       v_status, v_ball, p_depends_on, p_due_date, v_next, v_payload,
       coalesce(p_required_for_close, true),
       case when p_published then now() else null end,
       p_stage_id)
    returning id into v_id;
  end if;

  perform public.log_onboarding_event(c.user_id, v_id, v_eng, 'created', 'accountant',
    case when p_published then 'נוספה בקשה' else 'נוספה בקשה כטיוטה' end,
    jsonb_build_object('stepType', p_step_type,
                       'owner', coalesce(p_owner, 'client'),
                       'revived', v_old is not null,
                       'requiredForClose', coalesce(p_required_for_close, true)));

  return jsonb_build_object('ok', true, 'stepId', v_id, 'status', v_status,
                            'revived', v_old is not null);
end;
$function$;
