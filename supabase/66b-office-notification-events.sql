-- ═══════════════════════════════════════════════════════════════════════════
--  66b — האירועים החדשים נרשמים בתור
-- ═══════════════════════════════════════════════════════════════════════════
--  שלוש פונקציות קיימות מקבלות שורה אחת כל אחת: קריאה ל-
--  queue_accountant_notification. שאר הגוף לא נגע — הנוסח כאן הוא הנוסח החי
--  של 2026-08-05 (supabase/live-2026-08-05/) עם התוספת בלבד.
--
--  ‼ הרישום נעשה *אחרי* שהפעולה עצמה הסתיימה בהצלחה. התראה על משהו שלא קרה
--  גרועה מהיעדר התראה.
--
--  (העלאת מסמך מדף ציבורי נרשמת מתוך ה-Edge Function portal-upload-document,
--  כי שם היא קורית — אין שם פונקציית מסד לתלות בה.)
-- ═══════════════════════════════════════════════════════════════════════════

begin;

-- ─── 1. הלקוח השלים בקשה בדף האישי ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.portal_submit_step(p_token text, p_step_id text, p_data jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  c      public.clients%rowtype;
  s      public.onboarding_steps%rowtype;
  v_name  text;
  v_email text;
  v_phone text;
  v_key   text;
  v_val   text;
  v_reqs  jsonb;
  v_found boolean := false;
  v_open  int;
  v_label text;
  v_client_name text;
begin
  select * into c from public.clients where portal_token = p_token limit 1;
  if c.id is null then return jsonb_build_object('ok', false, 'error', 'invalid'); end if;

  select * into s from public.onboarding_steps where id = p_step_id and client_id = c.id;
  if s.id is null then return jsonb_build_object('ok', false, 'error', 'step_not_found'); end if;
  if s.status in ('completed','verified','skipped','cancelled') then
    return jsonb_build_object('ok', true, 'noop', true);
  end if;
  -- בקשה שהרו"ח עוד לא פתח ללקוח אינה קיימת מבחינתו, גם אם ניחש מזהה.
  if coalesce(s.payload->>'published','true') = 'false' then
    return jsonb_build_object('ok', false, 'error', 'not_published');
  end if;
  if s.status = 'locked' then
    return jsonb_build_object('ok', false, 'error', 'locked');
  end if;
  -- רשימה סגורה ומפורשת. כל סוג אחר נסגר רק ביד של הרו"ח.
  if s.step_type not in ('prev_accountant_details', 'custom_request') then
    return jsonb_build_object('ok', false, 'error', 'not_client_editable');
  end if;

  v_client_name := nullif(trim(coalesce(c.first_name,'') || ' ' || coalesce(c.last_name,'')), '');

  -- ── בקשה חופשית: אישור קריאה או תשובת טקסט ────────────────────────────────
  if s.step_type = 'custom_request' then
    v_key := nullif(trim(coalesce(p_data->>'key','')), '');
    if v_key is null then return jsonb_build_object('ok', false, 'error', 'missing_key'); end if;
    v_val := nullif(trim(coalesce(p_data->>'value','')), '');

    v_reqs := coalesce(s.payload->'requirements', '[]'::jsonb);
    select jsonb_agg(
             case when x->>'key' = v_key and x->>'kind' in ('confirm','text')
                  then x || jsonb_build_object('done', true)
                         || case when v_val is not null then jsonb_build_object('value', v_val) else '{}'::jsonb end
                         || jsonb_build_object('doneAt', to_jsonb(now()))
                  else x end order by ord)
      into v_reqs
      from jsonb_array_elements(v_reqs) with ordinality t(x, ord);

    select exists (select 1 from jsonb_array_elements(v_reqs) x
                   where x->>'key' = v_key and x->>'kind' in ('confirm','text'))
      into v_found;
    if not v_found then return jsonb_build_object('ok', false, 'error', 'requirement_not_found'); end if;

    -- דרישת טקסט בלי תשובה אינה השלמה.
    if v_val is null and exists (select 1 from jsonb_array_elements(v_reqs) x
                                 where x->>'key' = v_key and x->>'kind' = 'text') then
      return jsonb_build_object('ok', false, 'error', 'missing_value');
    end if;

    select count(*) into v_open from jsonb_array_elements(v_reqs) x
      where not coalesce((x->>'done')::boolean, false);

    select x->>'label' into v_label from jsonb_array_elements(v_reqs) x where x->>'key' = v_key;

    update public.onboarding_steps
       set payload = payload || jsonb_build_object('requirements', v_reqs),
           -- נסגר רק כשכל הדרישות מולאו; אחרת ממשיך להמתין ללקוח.
           status  = case when v_open = 0 then 'completed' else 'waiting_client' end,
           ball    = case when v_open = 0 then 'me' else 'client' end,
           completion_method = case when v_open = 0 then 'system' else completion_method end,
           completed_at = case when v_open = 0 then now() else completed_at end,
           needs_attention = case when v_open = 0 then false else needs_attention end
     where id = s.id;

    perform public.log_onboarding_event(s.user_id, s.id, s.engagement_id,
      case when v_open = 0 then 'status_changed' else 'note' end, 'client',
      case when v_open = 0 then 'הלקוח השלים את הבקשה'
           else 'הלקוח השלים: ' || coalesce(v_label, v_key) end,
      jsonb_build_object('key', v_key, 'remaining', v_open));

    if v_open = 0 then
      perform public.unlock_dependent_steps(s.id);
      -- ההתראה נרשמת רק כשהבקשה כולה נסגרה. פריט בודד מתוך חמישה אינו אירוע.
      perform public.queue_accountant_notification(
        s.user_id, 'client_request_completed', c.id, s.id, null, null,
        jsonb_build_object(
          'clientName', v_client_name,
          'requestTitle', coalesce(nullif(s.payload->>'clientTitle',''), 'בקשה מהמשרד'),
          'lastItem', coalesce(v_label, v_key)));
    end if;

    return jsonb_build_object('ok', true, 'remaining', v_open, 'completed', v_open = 0);
  end if;

  -- ── פרטי הרו"ח הקודם ──────────────────────────────────────────────────────
  v_name  := nullif(trim(coalesce(p_data->>'name','')), '');
  v_email := nullif(trim(coalesce(p_data->>'email','')), '');
  v_phone := nullif(trim(coalesce(p_data->>'phone','')), '');
  if v_name is null and v_email is null then
    return jsonb_build_object('ok', false, 'error', 'missing_details');
  end if;

  update public.clients
     set prev_accountant_name  = coalesce(prev_accountant_name, v_name),
         prev_accountant_email = coalesce(prev_accountant_email, v_email),
         prev_accountant_phone = coalesce(prev_accountant_phone, v_phone),
         has_previous_accountant = true,
         updated_at = now()
   where id = c.id;

  update public.onboarding_steps
     set status = 'completed', ball = 'me', completion_method = 'system',
         completed_at = now(), needs_attention = false,
         payload = payload || jsonb_build_object(
           'submittedByClient', true,
           'submitted', jsonb_strip_nulls(jsonb_build_object('name', v_name, 'email', v_email, 'phone', v_phone)))
   where id = s.id;

  perform public.log_onboarding_event(s.user_id, s.id, s.engagement_id, 'status_changed', 'client',
    'הלקוח מסר את פרטי הרו״ח הקודם', jsonb_build_object('to', 'completed'));

  perform public.unlock_dependent_steps(s.id);

  perform public.queue_accountant_notification(
    s.user_id, 'client_request_completed', c.id, s.id, null, null,
    jsonb_build_object(
      'clientName', v_client_name,
      'requestTitle', coalesce(nullif(s.payload->>'clientTitle',''), 'פרטי רואה החשבון הקודם'),
      'lastItem', coalesce(v_name, v_email)));

  return jsonb_build_object('ok', true);
end;
$function$;

-- ─── 2. הרו"ח הקודם חתם על מכתב השחרור ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.release_portal_sign(p_token text, p_signature text, p_signer_name text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  s      public.onboarding_steps%rowtype;
  v_name text;
  v_client_name text;
begin
  select * into s from public.onboarding_steps
   where step_type = 'release_letter' and payload->>'releaseToken' = p_token limit 1;
  if s.id is null then return jsonb_build_object('ok', false, 'error', 'invalid'); end if;
  if (s.payload->>'prevAccountantSignedAt') is not null then
    return jsonb_build_object('ok', true, 'noop', true);
  end if;
  if nullif(trim(coalesce(p_signature,'')), '') is null then
    return jsonb_build_object('ok', false, 'error', 'missing_signature');
  end if;

  v_name := nullif(trim(coalesce(p_signer_name,'')), '');

  update public.onboarding_steps
     set payload = payload || jsonb_strip_nulls(jsonb_build_object(
                     'prevAccountantSignature', p_signature,
                     'prevAccountantSignedAt', to_jsonb(now()),
                     'prevAccountantSignerName', v_name)),
         -- חתימתו היא האישור לשחרור: השלב נסגר, ומה שתלוי בו נפתח.
         status = 'completed', ball = 'me', completion_method = 'system',
         completed_at = coalesce(completed_at, now()), needs_attention = false
   where id = s.id;

  perform public.log_onboarding_event(s.user_id, s.id, s.engagement_id, 'status_changed', 'system',
    coalesce('רו״ח הקודם חתם על מכתב השחרור — ' || v_name, 'רו״ח הקודם חתם על מכתב השחרור'),
    jsonb_build_object('to', 'completed', 'actor', 'prev_accountant'));

  perform public.unlock_dependent_steps(s.id);

  select nullif(trim(coalesce(first_name,'') || ' ' || coalesce(last_name,'')), '')
    into v_client_name from public.clients where id = s.client_id;

  perform public.queue_accountant_notification(
    s.user_id, 'release_letter_signed', s.client_id, s.id, null, null,
    jsonb_build_object(
      'clientName', v_client_name,
      'signerName', v_name,
      'prevAccountantName', s.payload->>'prevAccountantName'));

  return jsonb_build_object('ok', true);
end;
$function$;

-- ─── 3. הקליטה נסגרה ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.close_onboarding(p_engagement_id text, p_force boolean DEFAULT false, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  e     public.engagements%rowtype;
  v_uid uuid := auth.uid();
  v_rd  jsonb;
  v_client_name text;
begin
  select * into e from public.engagements where id = p_engagement_id;
  if e.id is null then return jsonb_build_object('ok', false, 'error', 'engagement_not_found'); end if;
  if v_uid is null or e.user_id <> v_uid then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;
  if e.status <> 'onboarding' then return jsonb_build_object('ok', true, 'noop', true); end if;

  v_rd := public.onboarding_close_readiness(p_engagement_id);
  if not (v_rd->>'ready')::boolean and not p_force then
    return jsonb_build_object('ok', false, 'error', 'not_ready', 'readiness', v_rd);
  end if;

  update public.engagements
     set status = 'active', activated_at = coalesce(activated_at, now()), updated_at = now()
   where id = e.id;

  perform public.log_onboarding_event(e.user_id, null, e.id, 'status_changed', 'accountant',
    case when p_force then coalesce(nullif(trim(coalesce(p_reason,'')),''), 'נסגר למרות שנותרו פריטים פתוחים')
         else 'הקליטה נסגרה — הלקוח עבר לשוטף' end,
    jsonb_build_object('forced', p_force, 'readiness', v_rd));

  perform public.refresh_lifecycle_stage_for(e.client_id);

  select nullif(trim(coalesce(first_name,'') || ' ' || coalesce(last_name,'')), '')
    into v_client_name from public.clients where id = e.client_id;

  perform public.queue_accountant_notification(
    e.user_id, 'onboarding_closed', e.client_id, null, null, null,
    jsonb_build_object(
      'clientName', v_client_name,
      'forced', p_force,
      'reason', nullif(trim(coalesce(p_reason,'')), '')));

  return jsonb_build_object('ok', true, 'forced', p_force, 'readiness', v_rd);
end;
$function$;

commit;
