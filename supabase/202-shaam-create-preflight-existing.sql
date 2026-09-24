-- ─── 202: «הזן ייפוי כוח בשע״ם» — בדיקה לפני יצירה, בתוך אותה פעולה ─────────
--
-- הרקע (24.09.2026): מאז הדסה סלע, PIVO לא הציעה «הזן» לפני שבדקה בשע״ם אם
-- כבר קיימת בקשה — אבל עשתה את זה ככפתור נפרד («בדוק קבלת הייצוג») שהרו"ח
-- היה צריך ללחוץ קודם, לחכות, ולהבין למה הכפתור התחלף. עכשיו הבדיקה היא
-- חלק מ-shaam.create_representation עצמה, בעובד, לפני כל נגיעה: קריאה בלבד
-- של «בקשות בתהליך» לפי ישות.
--
-- מה משתנה כאן: create_representation שחזרה עם result.preflight =
-- 'existing_found' (לא נוצר כלום) מעודכנת **כבדיקה** — אותו ענף בדיוק של
-- check_representation (שורות, observedAt, שומר ההתיישנות, «ממתין לאישור
-- לקוח», מעבר ל«פעיל») — ובלי createdAt. ועוד עדות אחת: foundBeforeCreateAt.
--
-- ‼ גוף 201 כמו שהוא, מלבד v_kind. אומת לפני הכתיבה: הגוף החי בפרודקשן זהה
--   ל-201 (md5 מנורמל fea43253…).
-- ‼ שום דבר כאן אינו פונה לשע״ם.

CREATE OR REPLACE FUNCTION public.sync_shaam_representation_from_job()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_key       text;
  v_req_id    text;
  v_track     jsonb;
  v_exec      jsonb;
  v_now       text := to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"');
  v_status    text;
  v_rows      jsonb;
  v_found     boolean;
  v_observed  timestamptz;
  v_stale     boolean := false;
  v_confirm   text;
  v_date      text;
  v_row       jsonb;
  v_awaiting_client boolean := false;
  v_apply_state boolean := false;
  -- ‼ 202: סוג הקריאה לצורך העדכון. create שמצא בקשה קיימת = בדיקה.
  v_kind      text;
  v_preflight boolean := false;
begin
  if new.action_type not in (
    'shaam.create_representation', 'shaam.submit_poa', 'shaam.check_representation'
  ) then
    return new;
  end if;

  -- ‼ מפתח ההגשה חייב לבוא מהתוצאה/הקלט המפורשים — לעולם לא מנחשים "מי".
  -- ‼ 202 · «הזן ייפוי כוח בשע״ם» בודק קודם את רשימת הבקשות. נמצאה שם בקשה
  -- של האדם ⇒ העובד לא יצר כלום, והתוצאה היא קריאה של רשימה — בדיוק כמו
  -- check_representation. לכן היא מעודכנת כבדיקה, ולעולם לא נכתב createdAt.
  v_preflight := new.action_type = 'shaam.create_representation'
                 and coalesce(new.result ->> 'preflight', '') = 'existing_found';
  v_kind := case when v_preflight then 'shaam.check_representation' else new.action_type end;

  v_key := coalesce(new.result ->> 'submissionKey', new.input ->> 'submissionKey');
  if v_key is null or v_key = '' then return new; end if;

  select representation_request_id into v_req_id
    from public.clients where id = new.client_id;
  if v_req_id is null then return new; end if;

  select coalesce(execution, '{}'::jsonb) into v_exec
    from public.representation_requests where id = v_req_id;
  if v_exec is null then return new; end if;
  v_track := coalesce(v_exec #> array['shaam', v_key], '{}'::jsonb);

  if v_kind = 'shaam.create_representation' then
    v_track := v_track || jsonb_strip_nulls(jsonb_build_object(
      'requestNumber',  coalesce(nullif(v_track ->> 'requestNumber', ''), nullif(new.result ->> 'requestNumber', '')),
      'createdAt',      coalesce(v_track ->> 'createdAt', v_now),
      'formDocumentId', new.result ->> 'formDocumentId',
      'formFileName',   new.result ->> 'formFileName',
      'formFetchedAt',  case when new.result ->> 'formDocumentId' is not null
                             then coalesce(v_track ->> 'formFetchedAt', v_now) end
    ));

  elsif v_kind = 'shaam.submit_poa' then
    -- ‼ «נשלח לשע״ם» רק על ראיה מפורשת.
    if coalesce((new.result ->> 'submitted')::boolean, false) then
      v_track := v_track || jsonb_build_object(
        'submittedAt', coalesce(v_track ->> 'submittedAt', v_now));
      -- ‼ 201: מה ששע״ם אמרה במסך האישור — כמו שהוא. זו ראיה של הרשות,
      -- לא סיכום שלנו, ולכן נשמרת בנפרד מ«מצב בקשה»/«מצב מערך».
      v_confirm := coalesce(
        (select string_agg(x, ' · ') from jsonb_array_elements_text(
           case when jsonb_typeof(new.result -> 'statusLines') = 'array' then new.result -> 'statusLines' else '[]'::jsonb end) x),
        new.result ->> 'summary', '');
      if v_confirm <> '' then
        v_track := v_track || jsonb_build_object('submissionConfirmation', jsonb_build_object(
          'text', left(v_confirm, 600),
          'at', coalesce(v_track #>> '{submissionConfirmation,at}', v_now)));
        -- «… לסיום השהייה הצפויה להסתיים ביום 06/10/2026» — רק כשהמשפט עוסק בהשהייה.
        v_date := public._shaam_date_iso(substring(v_confirm from 'השהי[^0-9]{0,60}(\d{1,2}[./]\d{1,2}[./]\d{4})'));
        if v_date is not null and v_track ->> 'suspensionEndsSource' is distinct from 'request_list' then
          v_track := v_track || jsonb_build_object(
            'suspensionEndsAt', v_date, 'suspensionEndsSource', 'submission_confirmation');
        end if;
      end if;
    end if;
    v_track := v_track || jsonb_strip_nulls(jsonb_build_object(
      'requestNumber', coalesce(nullif(v_track ->> 'requestNumber', ''), nullif(new.result ->> 'requestNumber', ''))
    ));

  elsif v_kind = 'shaam.check_representation' then
    v_rows := case when jsonb_typeof(new.result -> 'rows') = 'array' then new.result -> 'rows' else '[]'::jsonb end;
    v_found := coalesce((new.result ->> 'found')::boolean, jsonb_array_length(v_rows) > 0);
    -- ‼ מתי נקראה שע״ם: לפי העובד, ובהיעדרו — מתי התחילה הריצה.
    v_observed := coalesce(
      case when coalesce(new.result ->> 'observedAt', '') ~ '^\d{4}-\d{2}-\d{2}T'
           then (new.result ->> 'observedAt')::timestamptz end,
      new.claimed_at, now());

    -- ‼ שומר-התיישנות: קריאה ישנה מהקריאה השמורה, או קריאה שקדמה להגשה,
    -- אינה מתארת את המצב של עכשיו — ולא דורסת אותו.
    if nullif(v_track ->> 'observedAt', '') is not null
       and v_observed < (v_track ->> 'observedAt')::timestamptz then
      v_stale := true;
    end if;
    if nullif(v_track ->> 'submittedAt', '') is not null
       and v_observed < (v_track ->> 'submittedAt')::timestamptz then
      v_stale := true;
    end if;

    v_track := v_track || jsonb_build_object('syncedAt', v_now)
      || jsonb_strip_nulls(jsonb_build_object(
           'requestNumber', coalesce(nullif(v_track ->> 'requestNumber', ''), nullif(new.result ->> 'requestNumber', ''))));

    if v_stale then
      v_track := v_track || jsonb_build_object('lastStaleReadingAt', to_char(v_observed at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'));
    elsif not v_found then
      -- ‼ «לא נמצאה ברשימת הבקשות בתהליך» היא עובדה, לא מסקנה: ייתכן שנקלטה
      -- וייתכן שבוטלה. השורות האחרונות שנצפו נשמרות.
      v_track := v_track || jsonb_build_object(
        'observedAt', to_char(v_observed at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
        'notInListAt', to_char(v_observed at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'));
    else
      v_apply_state := true;
      v_track := (v_track - 'notInListAt') || jsonb_strip_nulls(jsonb_build_object(
        'observedAt',      to_char(v_observed at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
        'rawRequestState', v_rows -> 0 ->> 'rawRequestState',
        'systems',         v_rows
      ));
      -- «צפי לסיום השהייה» מפירוט הבקשה ברשימה — עדכני יותר ממסך האישור.
      select public._shaam_date_iso(x ->> 'suspensionEndsRaw') into v_date
        from jsonb_array_elements(v_rows) x
       where public._shaam_date_iso(x ->> 'suspensionEndsRaw') is not null limit 1;
      if v_date is not null then
        v_track := v_track || jsonb_build_object('suspensionEndsAt', v_date, 'suspensionEndsSource', 'request_list');
      end if;
      for v_row in select x from jsonb_array_elements(v_rows) x loop
        if regexp_replace(coalesce(v_row ->> 'rawSystemState', ''), '\s+', ' ', 'g') ~ 'לאישור (ה)?לקוח' then
          v_awaiting_client := true;
        end if;
      end loop;
      if v_awaiting_client then
        v_track := v_track || jsonb_build_object(
          'clientApprovalRequiredAt', coalesce(v_track ->> 'clientApprovalRequiredAt', v_now));
      end if;
    end if;
  end if;

  -- ‼ 202: עדות ש«הזן» עצר כי הבקשה כבר הייתה בשע״ם — המסך אומר את זה.
  if v_preflight then
    v_track := v_track || jsonb_build_object(
      'foundBeforeCreateAt', coalesce(v_track ->> 'foundBeforeCreateAt', v_now));
  end if;

  update public.representation_requests
     set execution = jsonb_set(
           coalesce(execution, '{}'::jsonb), array['shaam'],
           coalesce(execution -> 'shaam', '{}'::jsonb) || jsonb_build_object(v_key, v_track),
           true)
   where id = v_req_id;

  select status into v_status from public.representation_requests where id = v_req_id;

  -- «נשלח לשע״ם»: הטופס נקלט אצל הרשות ⇒ הבקשה ממתינה לרשויות.
  if v_kind = 'shaam.submit_poa'
     and coalesce((new.result ->> 'submitted')::boolean, false) then
    if v_status in ('pending_signature', 'awaiting_stamp') then
      update public.representation_requests
         set status = 'awaiting_authorities', updated_at = now()
       where id = v_req_id;
    end if;
    -- ‼ 201 · יישוב מיד אחרי ההגשה: קריאה בלבד, באותו סשן שכבר מחובר.
    -- משימה פתוחה קיימת מאותו סוג ⇒ לא נוצרת שנייה (automation_jobs_open_unique).
    insert into public.automation_jobs (user_id, client_id, action_type, input, status, max_attempts)
    values (new.user_id, new.client_id, 'shaam.check_representation',
            jsonb_strip_nulls(jsonb_build_object(
              'submissionKey', v_key,
              'role',          coalesce(new.result ->> 'role', new.input ->> 'role'),
              'requestNumber', coalesce(nullif(v_track ->> 'requestNumber', ''), nullif(new.input ->> 'requestNumber', ''), ''),
              'entityId',      new.input ->> 'entityId',
              'personName',    new.input ->> 'personName',
              'reason',        'post_submission_reconciliation',
              'afterJobId',    new.id)),
            'queued', 3)
    on conflict (client_id, action_type) where status in ('queued', 'running', 'needs_human')
    do nothing;
  end if;

  if v_kind = 'shaam.check_representation' and v_apply_state then
    -- «הייצוג פעיל»: שע״ם מדווחת שכל המערכים שהתבקשו נקלטו.
    if coalesce((new.result ->> 'allAccepted')::boolean, false) and v_status = 'awaiting_authorities' then
      update public.representation_requests
         set status = 'active', updated_at = now()
       where id = v_req_id;
    elsif v_awaiting_client and v_status = 'awaiting_authorities' then
      perform public.shaam_require_client_approval(new.client_id);
    end if;
  end if;

  return new;
end;
$function$;

select public.assert_domain_function_invariants();
