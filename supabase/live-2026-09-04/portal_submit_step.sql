-- נמשך חי 2026-09-04 מהמסד (pg_get_functiondef).
-- ארגומנטים: p_token text, p_step_id text, p_data jsonb
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
  v_kind  text;
  v_req   jsonb;
  v_reqs  jsonb;
  v_open  int;
  v_label text;
  v_client_name text;
  -- ‼ 114: שם העסק שהלקוח אישר, והמדריך שנחשף לו אחרי האישור.
  v_biz   text;
  v_guide text;
begin
  select * into c from public.clients where portal_token = p_token limit 1;
  if c.id is null then return jsonb_build_object('ok', false, 'error', 'invalid'); end if;
  if c.portal_token_expires_at is not null and c.portal_token_expires_at < now() then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  update public.clients set portal_token_last_used_at = now() where id = c.id;

  select * into s from public.onboarding_steps where id = p_step_id and client_id = c.id;
  if s.id is null then return jsonb_build_object('ok', false, 'error', 'step_not_found'); end if;
  if s.status in ('completed','verified','skipped','cancelled') then
    return jsonb_build_object('ok', true, 'noop', true);
  end if;
  if s.published_at is null then
    return jsonb_build_object('ok', false, 'error', 'not_published');
  end if;
  if s.status = 'locked' then
    return jsonb_build_object('ok', false, 'error', 'locked');
  end if;
  if s.step_type not in ('prev_accountant_details', 'custom_request', 'paperless_invite', 'paperless_tax_authority', 'rep_client_approval') then
    return jsonb_build_object('ok', false, 'error', 'not_client_editable');
  end if;

  v_client_name := nullif(trim(coalesce(c.first_name,'') || ' ' || coalesce(c.last_name,'')), '');

  -- ── "נרשמתי לפייפרלס" ─────────────────────────────────────────────────────
  -- ‼ אישור אחד, בלי נתונים: אין לנו דרך לאמת מול פייפרלס שהחשבון נפתח, ולכן
  -- מה שנרשם הוא בדיוק מה שקרה — הלקוח הצהיר שנרשם. הרו״ח רואה את ההצהרה
  -- ביומן ויכול תמיד להחזיר את השלב לפתוח אם התברר אחרת.
  -- ‼ שלב 2 (החיבור) נפתח מכאן דרך unlock_dependent_steps בלבד — אותה פתיחה
  -- אוטומטית של כל תלות אחרת. אין קפיצה ישירה לשלב 3.
  -- ── "ביצעתי את החיבור" — פייפרלס אל מול רשות המסים ────────────────────────
  -- ‼ הצהרה בלי נתונים, בדיוק כמו "נרשמתי לפייפרלס": אין לנו גישה לחשבון
  -- שלו ברשות המסים, ומה שנשמר הוא מה שקרה — הוא אמר שביצע. הרו"ח רואה את
  -- ההצהרה ביומן ויכול לפתוח את הבקשה מחדש אם התברר אחרת.
  -- ‼ connectedAt נשמר כבר עכשיו, לפני שיש חידוש: זו החותמת שממנה יימדדו
  -- שלושת החודשים ביום שהחידוש ייבנה.
  if s.step_type = 'rep_client_approval' then
    update public.onboarding_steps
       set status = 'in_progress', ball = 'me', needs_attention = true,
           payload = payload || jsonb_build_object(
             'submittedByClient', true,
             'clientDeclaredAt', to_jsonb(now()))
     where id = s.id;

    perform public.log_onboarding_event(s.user_id, s.id, s.engagement_id, 'status_changed', 'client',
      'הלקוח אישר את המייצג באזור האישי של רשות המסים',
      jsonb_build_object('to', 'in_progress'));

    perform public.queue_accountant_notification(
      s.user_id, 'client_request_completed', c.id, s.id, null, null,
      jsonb_build_object(
        'clientName', v_client_name,
        'requestTitle', coalesce(nullif(s.payload->>'clientTitle',''), 'זירוז אישור הייצוג באזור האישי'),
        'lastItem', 'הלקוח דיווח שאישר באזור האישי - אפשר לבדוק בשע"ם אם הייצוג נקלט'));

    return jsonb_build_object('ok', true, 'completed', false);
  end if;

  if s.step_type = 'paperless_tax_authority' then
    update public.onboarding_steps
       set status = 'completed', ball = 'me', completion_method = 'system',
           completed_at = now(), needs_attention = false,
           payload = payload || jsonb_build_object(
             'submittedByClient', true,
             'clientConfirmedAt', to_jsonb(now()),
             'connectedAt', to_jsonb(now()))
     where id = s.id;

    perform public.log_onboarding_event(s.user_id, s.id, s.engagement_id, 'status_changed', 'client',
      'הלקוח אישר שחיבר את פייפרלס לרשות המסים',
      jsonb_build_object('to', 'completed'));

    perform public.unlock_dependent_steps(s.id);

    perform public.queue_accountant_notification(
      s.user_id, 'client_request_completed', c.id, s.id, null, null,
      jsonb_build_object(
        'clientName', v_client_name,
        'requestTitle', coalesce(nullif(s.payload->>'clientTitle',''), 'חיבור פייפרלס לרשות המסים'),
        'lastItem', 'הלקוח דיווח שהחיבור בוצע - אפשר לוודא בחשבון שהוא פעיל'));

    return jsonb_build_object('ok', true, 'completed', true);
  end if;

  if s.step_type = 'paperless_invite' then
    -- ── שם העסק — מקור אמת אחד ──────────────────────────────────────────
    -- ‼ 114: הערך נכתב אל clients.business_name בלבד ואינו נשמר על השלב.
    -- עותק שני על ה-payload היה הופך לשקר ביום שגיא יתקן את הכרטיס.
    -- ‼ הערך ששלח הלקוח גובר: זהו בדיוק מסך האישור של השם.
    v_biz := nullif(trim(coalesce(p_data->>'businessName','')), '');
    if v_biz is not null then
      update public.clients set business_name = v_biz, updated_at = now() where id = c.id;
    elsif nullif(trim(coalesce(c.business_name,'')), '') is null then
      return jsonb_build_object('ok', false, 'error', 'missing_business_name');
    end if;

    update public.onboarding_steps
       set status = 'completed', ball = 'me', completion_method = 'system',
           completed_at = now(), needs_attention = false,
           payload = payload || jsonb_build_object(
             'submittedByClient', true,
             'clientConfirmedAt', to_jsonb(now()))
     where id = s.id;

    -- ‼ שם העסק נרשם ביומן ולא רק על הכרטיס: זה מה שהלקוח הזין בפועל, וגיא
    -- צריך לראות אותו כדי לאשר אותו בפייפרלס. הכרטיס עשוי להיערך אחר כך —
    -- היומן הוא הראיה למה שנמסר, והוא אינו מקור אמת מתחרה.
    perform public.log_onboarding_event(s.user_id, s.id, s.engagement_id, 'status_changed', 'client',
      case when v_biz is not null
           then 'הלקוח אישר שנרשם לפייפרלס · שם העסק שהזין: ' || v_biz
           else 'הלקוח אישר שנרשם לפייפרלס' end,
      jsonb_strip_nulls(jsonb_build_object('to', 'completed', 'businessName', v_biz)));

    perform public.unlock_dependent_steps(s.id);

    -- ── המדריך נחשף רק עכשיו ─────────────────────────────────────────────
    -- ‼ נוצר כאן ולא מראש: שלב שנוצר מראש היה מופיע בדף כ«בהמשך» ומספר
    -- ללקוח על משהו שאין לו מה לעשות איתו לפני שנרשם.
    -- ‼ בקשה רגילה עם קישור חיצוני — לא סוג שלב חדש, לא מנוע שני, ולא
    -- ספריית מסמכים שנייה. required_for_close=false ⇒ אינו חוסם כלום.
    -- ‼ לא ללקוח שכבר עובד עם פייפרלס: מדריך התקנה למי שכבר מותקן הוא רעש.
    if coalesce(s.payload->>'paperlessStatus','') not in ('self','other_rep','not_applicable')
       and not exists (select 1 from public.onboarding_steps g
                        where g.client_id = c.id
                          and g.payload->>'guideKey' = 'paperless_app'
                          and g.status <> 'cancelled') then
      insert into public.onboarding_steps
        (user_id, engagement_id, client_id, step_type, track, scope, status, ball,
         sort_order, published_at, required_for_close, payload)
      values (s.user_id, s.engagement_id, c.id, 'custom_request',
              public.onboarding_track_for('custom_request'), 'person',
              'waiting_client', 'client', coalesce(s.sort_order, 0), now(), false,
              jsonb_build_object(
                'guideKey', 'paperless_app',
                'title', 'מדריך פייפרלס ללקוח',
                'clientTitle', 'מדריך: איך עובדים עם פייפרלס',
                'clientSub', 'סרטון קצר - להוריד את האפליקציה ולשלוח את הקבלה הראשונה',
                'clientCta', 'לצפייה במדריך',
                'clientLinkUrl', 'https://www.youtube.com/watch?v=Rvbq3DPF50s&list=PL8VCJr5Lb2NHqEjAf96xbmIFTDj7Gfoxl&index=2',
                'requirements', jsonb_build_array(jsonb_build_object(
                  'key','opened','kind','confirm','label','צפייה במדריך',
                  'done', false, 'required', true))))
      returning id into v_guide;

      perform public.log_onboarding_event(s.user_id, v_guide, s.engagement_id, 'created', 'system',
        'מדריך הפייפרלס נחשף ללקוח אחרי אישור ההרשמה', '{}'::jsonb);
    end if;

    perform public.queue_accountant_notification(
      s.user_id, 'client_request_completed', c.id, s.id, null, null,
      jsonb_build_object(
        'clientName', v_client_name,
        'requestTitle', coalesce(nullif(s.payload->>'clientTitle',''), 'הרשמה לפייפרלס'),
        'lastItem', 'הלקוח נרשם - אפשר להיכנס לחשבון ולהשלים את החיבור'));

    return jsonb_build_object('ok', true, 'completed', true);
  end if;

  if s.step_type = 'custom_request' then
    v_key := nullif(trim(coalesce(p_data->>'key','')), '');
    if v_key is null then return jsonb_build_object('ok', false, 'error', 'missing_key'); end if;
    v_val := nullif(trim(coalesce(p_data->>'value','')), '');

    v_reqs := coalesce(s.payload->'requirements', '[]'::jsonb);
    select x into v_req from jsonb_array_elements(v_reqs) x where x->>'key' = v_key limit 1;
    if v_req is null then return jsonb_build_object('ok', false, 'error', 'requirement_not_found'); end if;

    v_kind := coalesce(v_req->>'kind', '');
    if v_kind in ('file','files') then
      return jsonb_build_object('ok', false, 'error', 'file_via_upload');
    end if;
    if v_kind not in ('confirm','text','email','phone','number','date','select') then
      return jsonb_build_object('ok', false, 'error', 'requirement_not_found');
    end if;

    if v_kind <> 'confirm' and v_val is null then
      return jsonb_build_object('ok', false, 'error', 'missing_value');
    end if;
    if v_kind = 'email' and v_val !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
      return jsonb_build_object('ok', false, 'error', 'bad_email');
    end if;
    if v_kind = 'phone' and length(regexp_replace(v_val, '\D', '', 'g')) not between 7 and 15 then
      return jsonb_build_object('ok', false, 'error', 'bad_phone');
    end if;
    if v_kind = 'number' and v_val !~ '^-?\d+(\.\d+)?$' then
      return jsonb_build_object('ok', false, 'error', 'bad_number');
    end if;
    if v_kind = 'date' then
      begin
        perform v_val::date;
      exception when others then
        return jsonb_build_object('ok', false, 'error', 'bad_date');
      end;
    end if;
    if v_kind = 'select' and not exists (
      select 1 from jsonb_array_elements_text(coalesce(v_req->'options','[]'::jsonb)) o
       where o = v_val) then
      return jsonb_build_object('ok', false, 'error', 'bad_choice');
    end if;

    select jsonb_agg(
             case when x->>'key' = v_key
                  then x || jsonb_build_object('done', true)
                         || case when v_val is not null then jsonb_build_object('value', v_val) else '{}'::jsonb end
                         || jsonb_build_object('doneAt', to_jsonb(now()))
                  else x end order by ord)
      into v_reqs
      from jsonb_array_elements(v_reqs) with ordinality t(x, ord);

    select count(*) into v_open from jsonb_array_elements(v_reqs) x
      where not coalesce((x->>'done')::boolean, false)
        and coalesce((x->>'required')::boolean, true);

    select x->>'label' into v_label from jsonb_array_elements(v_reqs) x where x->>'key' = v_key;

    update public.onboarding_steps
       set payload = payload || jsonb_build_object('requirements', v_reqs),
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
      perform public.queue_accountant_notification(
        s.user_id, 'client_request_completed', c.id, s.id, null, null,
        jsonb_build_object(
          'clientName', v_client_name,
          'requestTitle', coalesce(nullif(s.payload->>'clientTitle',''), 'בקשה מהמשרד'),
          'lastItem', coalesce(v_label, v_key)));
    end if;

    return jsonb_build_object('ok', true, 'remaining', v_open, 'completed', v_open = 0);
  end if;

  v_name  := nullif(trim(coalesce(p_data->>'name','')), '');
  v_email := nullif(trim(coalesce(p_data->>'email','')), '');
  v_phone := nullif(trim(coalesce(p_data->>'phone','')), '');
  if v_name is null and v_email is null then
    return jsonb_build_object('ok', false, 'error', 'missing_details');
  end if;

  update public.clients
     set prev_accountant_name  = coalesce(v_name, prev_accountant_name),
         prev_accountant_email = coalesce(v_email, prev_accountant_email),
         prev_accountant_phone = coalesce(v_phone, prev_accountant_phone),
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
$function$

