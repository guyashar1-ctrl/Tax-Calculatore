-- נמשך חי 2026-09-04 מהמסד (pg_get_functiondef).
-- ארגומנטים: p_client_id text, p_step_type text, p_payload jsonb, p_due_date date, p_depends_on text, p_published boolean, p_required_for_close boolean, p_owner text, p_stage_id text
CREATE OR REPLACE FUNCTION public.create_onboarding_request(p_client_id text, p_step_type text, p_payload jsonb DEFAULT '{}'::jsonb, p_due_date date DEFAULT NULL::date, p_depends_on text DEFAULT NULL::text, p_published boolean DEFAULT true, p_required_for_close boolean DEFAULT true, p_owner text DEFAULT NULL::text, p_stage_id text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  v_hold boolean := false;
  v_stage text;
  v_eng_open text;
  v_intake text;
  v_required boolean;
begin
  select * into c from public.clients where id = p_client_id;
  if c.id is null then return jsonb_build_object('ok', false, 'error', 'client_not_found'); end if;
  if v_uid is null or c.user_id <> v_uid then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;

  if p_step_type not in ('client_documents','prev_accountant_details','custom_request',
                         'paperless_invite','paperless_connection','paperless_tax_authority','rep_client_approval','retainer_authorization',
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

  -- ‼ 155 · הקשר הקליטה. שים לב שזה **אינו** v_eng: שם מחפשים קבוצה לשיוך
  -- השלב (גם התקשרות שהסתיימה משמשת לקיבוץ), וכאן שואלים אם יש קליטה פתוחה
  -- שאפשר בכלל לסגור. שתי שאלות שונות שנראו כאחת.
  v_eng_open := public.open_intake_engagement_id(c.id);
  v_stage    := public.derive_lifecycle_stage(c.id);
  v_intake   := case when v_eng_open is not null then 'open'
                     when v_stage in ('lead', 'quoted') then 'pending'
                     else 'none' end;
  v_required := coalesce(p_required_for_close, true) and v_intake <> 'none';

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

  -- 135: לפני שנמכר משהו, "הוספתי בקשה" פירושו הכנה ולא שליחה.
  if p_published and v_stage in ('lead', 'quoted') then
    p_published := false;
    v_hold := true;
  end if;

  v_payload := coalesce(p_payload, '{}'::jsonb)
    || case when p_published then '{}'::jsonb else jsonb_build_object('published', false) end
    || case when v_hold then jsonb_build_object('heldUntilApproval', true) else '{}'::jsonb end;

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
      required_for_close = v_required,
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
       v_required,
       case when p_published then now() else null end,
       p_stage_id)
    returning id into v_id;
  end if;

  perform public.log_onboarding_event(c.user_id, v_id, v_eng, 'created', 'accountant',
    case when p_published then 'נוספה בקשה'
         when v_hold then 'נוספה בקשה - תפורסם כשההצעה תאושר'
         else 'נוספה בקשה כטיוטה' end,
    jsonb_build_object('stepType', p_step_type,
                       'owner', coalesce(p_owner, 'client'),
                       'revived', v_old is not null,
                       'intakeState', v_intake,
                       'requiredForClose', v_required));

  return jsonb_build_object('ok', true, 'stepId', v_id, 'status', v_status,
                            'heldUntilApproval', v_hold,
                            'intakeState', v_intake,
                            'requiredForClose', v_required,
                            'revived', v_old is not null);
end;
$function$

