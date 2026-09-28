-- ─── 205: מחזור החיים בשע״ם — לפי מה שנצפה במערכת החיה (28.09.2026) ─────────
-- נקרא חי (קריאה בלבד) ב«מערכת לרישום ייצוג»: המילונים המלאים של «מצב בקשה»
-- ו«מצב מערך» (מרשימות הסינון של שע״ם), נתוני הטבלה (קודים, ת.ז. המיוצג,
-- «אין תיק»), וההדרכה הרשמית של המערכת. שלושה פערים מול מה ש-201/202 הניחו:
--
--  ① «ממתין:91-לאישור לקוח,כל השאר-לפתיחת התיק» הוא **קוד אחד (7)** לשני מצבים.
--     הזיהוי הישן (regex «לאישור לקוח») סימן כל תיק שממתין לפתיחה כ«אישור לקוח
--     חובה». עכשיו: אישור לקוח רק בתיק 91 — הפירוט הגלוי «תיק החזר מס (91)», או
--     «צפי לסיום השהייה» = «ממתין לאישור לקוח» (נצפה אצל דן רכס).
--  ② «פעיל לפי רשות» (הכרעת גיא): מ"ה נקלט, וניכויים «ממתין לפתיחת התיק» כי אין
--     תיק בכלל ⇒ הבקשה גמורה. היום PIVO לא סימנה «פעיל» במצב כזה אף פעם (לזימי,
--     שי ישר, יריב רכס). הרשות שבלי תיק מסומנת awaitingFileOpening ונשארת
--     in_process — apply_client_representation לא הופך אותה ל-active.
--  ③ «לא צריך ייצוג ב…» — הסרת רשות מהבקשה ב-PIVO (לא בשע״ם). כמו 200 בב"ל.
--
-- ‼ הגופים של sync_shaam_representation_from_job ו-apply_client_representation
--   נלקחו מהגוף החי (פרודקשן = staging, 28.09.2026) ושונו רק במקומות המסומנים.

-- ── ① שורה ממתינה לאישור הלקוח? ────────────────────────────────────────────
create or replace function public.shaam_row_awaits_client(p_row jsonb)
returns boolean
language sql
immutable
set search_path to 'public'
as $function$
  select case
    when jsonb_typeof(p_row -> 'systemStateCode') = 'number' then
      (p_row ->> 'systemStateCode')::int = 7
      and (coalesce((p_row ->> 'tik91')::boolean, false)
           or regexp_replace(coalesce(p_row ->> 'suspensionEndsRaw', ''), '\s+', ' ', 'g') ~ 'לאישור (ה)?לקוח')
    else
      regexp_replace(coalesce(p_row ->> 'rawSystemState', ''), '\s+', ' ', 'g') ~ 'לאישור (ה)?לקוח'
      and (regexp_replace(coalesce(p_row ->> 'rawSystemState', ''), '\s+', ' ', 'g') !~ 'כל השאר'
           or coalesce((p_row ->> 'tik91')::boolean, false)
           or regexp_replace(coalesce(p_row ->> 'suspensionEndsRaw', ''), '\s+', ' ', 'g') ~ 'לאישור (ה)?לקוח')
  end
$function$;

-- ── ② המערך של השורה כרשות ב-PIVO ───────────────────────────────────────────
create or replace function public.shaam_row_authority(p_row jsonb)
returns text
language sql
immutable
set search_path to 'public'
as $function$
  select case
    when p_row ->> 'systemCode' = '1' then 'incomeTax'
    when p_row ->> 'systemCode' = '2' then 'vat'
    when p_row ->> 'systemCode' = '5' then 'withholding'
    when translate(coalesce(p_row ->> 'systemLabel', ''), '"״׳''', '') like '%מס הכנסה%' then 'incomeTax'
    when translate(coalesce(p_row ->> 'systemLabel', ''), '"״׳''', '') like '%מעמ%' then 'vat'
    when coalesce(p_row ->> 'systemLabel', '') like '%ניכויים%' then 'withholding'
    else null end
$function$;

-- ── ③ נקלט / ממתין לתיק שלא קיים ────────────────────────────────────────────
create or replace function public.shaam_row_accepted(p_row jsonb)
returns boolean
language sql
immutable
set search_path to 'public'
as $function$
  select case
    when jsonb_typeof(p_row -> 'systemStateCode') = 'number' then (p_row ->> 'systemStateCode')::int = 5
    else coalesce(p_row ->> 'rawSystemState', '') ~ 'נקלט' end
$function$;

create or replace function public.shaam_row_awaits_missing_file(p_row jsonb)
returns boolean
language sql
immutable
set search_path to 'public'
as $function$
  select (case
            when jsonb_typeof(p_row -> 'systemStateCode') = 'number' then
              (p_row ->> 'systemStateCode')::int = 1
              or ((p_row ->> 'systemStateCode')::int = 7 and not public.shaam_row_awaits_client(p_row))
            else regexp_replace(coalesce(p_row ->> 'rawSystemState', ''), '\s+', ' ', 'g') ~ 'לפתיחת (ה)?תיק'
                 and not public.shaam_row_awaits_client(p_row)
          end)
     and (coalesce((p_row ->> 'noFile')::boolean, false)
          or coalesce(p_row ->> 'fileNumber', '') like '%לא קיים תיק%'
          or regexp_replace(coalesce(p_row ->> 'fileNumber', ''), '\D', '', 'g') ~ '^0+$')
$function$;

-- ── ④ «גמור» לפי רשות (הכרעת גיא) ──────────────────────────────────────────
create or replace function public.shaam_rows_settled(p_rows jsonb)
returns boolean
language sql
immutable
set search_path to 'public'
as $function$
  select jsonb_typeof(p_rows) = 'array'
     and jsonb_array_length(p_rows) > 0
     and coalesce(bool_or(public.shaam_row_accepted(x)), false)
     and coalesce(bool_and(public.shaam_row_accepted(x) or public.shaam_row_awaits_missing_file(x)), false)
    from jsonb_array_elements(case when jsonb_typeof(p_rows) = 'array' then p_rows else '[]'::jsonb end) x
$function$;

-- ── ⑤ רשות שנקלטה ⇒ active; ממתינה לתיק שלא קיים ⇒ awaitingFileOpening ─────
--  ‼ מע"מ/ניכויים הן לפי אדם (targets): רק כשהרשות מבוקשת עבור האדם של ההגשה
--  הזו בלבד. רשות של שני בני הזוג לא «נגמרת» מקליטה של אחד.
create or replace function public.shaam_apply_authority_states(p_client_id text, p_rows jsonb, p_submission_key text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_reps    jsonb;
  v_orig    jsonb;
  r         jsonb;
  v_auth    text;
  v_person  text := case when p_submission_key = 'person:spouse' then 'spouse' else 'client' end;
  v_targets jsonb;
begin
  select coalesce(authority_representations, '{}'::jsonb) into v_reps
    from public.clients where id = p_client_id for update;
  if v_reps is null then return; end if;
  v_orig := v_reps;
  for r in select value from jsonb_array_elements(case when jsonb_typeof(p_rows) = 'array' then p_rows else '[]'::jsonb end) loop
    v_auth := public.shaam_row_authority(r);
    continue when v_auth is null or not (v_reps ? v_auth);
    if v_auth <> 'incomeTax' then
      v_targets := case when jsonb_typeof(v_reps -> v_auth -> 'targets') = 'array'
                          and jsonb_array_length(v_reps -> v_auth -> 'targets') > 0
                        then v_reps -> v_auth -> 'targets' else '["client"]'::jsonb end;
      continue when v_targets <> jsonb_build_array(v_person);
    end if;
    if public.shaam_row_accepted(r) then
      v_reps := jsonb_set(v_reps, array[v_auth],
                  ((v_reps -> v_auth) - 'awaitingFileOpening') || jsonb_build_object('status', 'active'));
    elsif public.shaam_row_awaits_missing_file(r) and (v_reps -> v_auth ->> 'status') is distinct from 'active' then
      v_reps := jsonb_set(v_reps, array[v_auth], (v_reps -> v_auth) || jsonb_build_object('awaitingFileOpening', true));
    end if;
  end loop;
  if v_reps is distinct from v_orig then
    update public.clients set authority_representations = v_reps, updated_at = now() where id = p_client_id;
  end if;
end;
$function$;

-- ── ⑥ apply_client_representation — גוף חי + שינוי אחד ─────────────────────
CREATE OR REPLACE FUNCTION public.apply_client_representation(p_client_id text, p_status text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_reps jsonb;
begin
  if p_client_id is null or p_status is null then return; end if;

  update public.clients
     set representation_status = p_status, updated_at = now()
   where id = p_client_id
     and coalesce(representation_status, '') <> 'active'
     and representation_status is distinct from p_status;

  if p_status = 'active' then
    select coalesce(jsonb_object_agg(
             t.k,
             -- ‼ 205 · רשות שממתינה לפתיחת תיק שלא קיים (awaitingFileOpening) אינה
             -- «פעילה» רק כי הבקשה נגמרה — שע״ם תקלוט אותה רק אם ייפתח תיק.
             case when t.k = 'nationalInsurance'
                    or coalesce((t.v ->> 'awaitingFileOpening')::boolean, false) then t.v
                  else t.v || jsonb_build_object('status', 'active') end), '{}'::jsonb)
      into v_reps
      from public.clients c,
           lateral jsonb_each(coalesce(c.authority_representations, '{}'::jsonb)) as t(k, v)
     where c.id = p_client_id;

    update public.clients
       set representation_status = 'active',
           authority_representations = case
             when v_reps is null or v_reps = '{}'::jsonb then authority_representations
             else v_reps end,
           updated_at = now()
     where id = p_client_id
       and (representation_status is distinct from 'active'
            or authority_representations is distinct from coalesce(v_reps, authority_representations));
  end if;

  perform public.refresh_lifecycle_stage_for(p_client_id);
end;
$function$;

-- ── ⑦ sync_shaam_representation_from_job — גוף חי + ① + ②/⑤ ──────────────────
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
                             then coalesce(v_track ->> 'formFetchedAt', v_now) end,
      -- ‼ 205 · «לידיעתך» של שלב 2 (מה שע״ם אמרה שיש לצרף) — ראיה, בלי שינוי התנהגות.
      'creationNotice', case when coalesce(new.result ->> 'creationNotice', '') <> ''
                             then coalesce(v_track -> 'creationNotice',
                                           jsonb_build_object('text', left(new.result ->> 'creationNotice', 600), 'at', v_now)) end
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
      -- ‼ 205 · «ממתין:91-לאישור לקוח,כל השאר-לפתיחת התיק» הוא קוד אחד (7) לשני
      -- מצבים. אישור לקוח **רק** בתיק 91 (פירוט גלוי / «צפי» = «ממתין לאישור לקוח»).
      for v_row in select x from jsonb_array_elements(v_rows) x loop
        if public.shaam_row_awaits_client(v_row) then
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
    -- ‼ 205 · רשות שנקלטה ⇒ פעילה; רשות שממתינה לתיק שלא קיים ⇒ מסומנת (לא פעילה).
    if v_status = 'awaiting_authorities' then
      perform public.shaam_apply_authority_states(new.client_id, v_rows, v_key);
    end if;
    -- «הייצוג פעיל»: כל מה שיש לו תיק נקלט (הכרעת גיא, 28.09.2026) — מחושב
    -- כאן מהשורות, לא רק מהדגל של העובד.
    if (coalesce((new.result ->> 'allAccepted')::boolean, false) or public.shaam_rows_settled(v_rows))
       and v_status = 'awaiting_authorities' then
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

-- ── ⑧ «לא צריך ייצוג ב…» — הסרת רשות שע״ם מהבקשה (PIVO בלבד) ────────────────
--  ‼ לא נוגע בשע״ם: בקשה שכבר נפתחה שם נשארת עד שתבוטל שם (או אוטומטית אחרי 6
--  חודשים בלי תיק). מה שמשתנה: הרשות יוצאת מהמרשם בכרטיס ומהיקף הבקשה, ואם כל
--  הרשויות שנשארו פעילות — הבקשה נגמרת (אותו כלל כמו בבדיקה).
--  ‼ לא מסירים רשות פעילה, ולא את רשות השע״ם האחרונה.
create or replace function public.drop_shaam_authority(p_client_id text, p_authority text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  c        public.clients%rowtype;
  req      public.representation_requests%rowtype;
  v_uid    uuid := auth.uid();
  v_left   int;
  v_active boolean;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'reason', 'unauthenticated'); end if;
  if p_authority not in ('incomeTax', 'vat', 'withholding') then
    return jsonb_build_object('ok', false, 'reason', 'bad_authority');
  end if;
  select * into c from public.clients where id = p_client_id for update;
  if c.id is null then return jsonb_build_object('ok', false, 'reason', 'client_not_found'); end if;
  if c.user_id <> v_uid then return jsonb_build_object('ok', false, 'reason', 'forbidden'); end if;
  if not (coalesce(c.authority_representations, '{}'::jsonb) ? p_authority) then
    return jsonb_build_object('ok', false, 'reason', 'not_requested');
  end if;
  if c.authority_representations -> p_authority ->> 'status' = 'active' then
    return jsonb_build_object('ok', false, 'reason', 'already_active');
  end if;
  select count(*) into v_left
    from jsonb_object_keys(c.authority_representations) k
   where k in ('incomeTax', 'vat', 'withholding') and k <> p_authority;
  if v_left = 0 then return jsonb_build_object('ok', false, 'reason', 'last_authority'); end if;

  update public.clients
     set authority_representations = authority_representations - p_authority, updated_at = now()
   where id = c.id;

  if c.representation_request_id is not null then
    select * into req from public.representation_requests where id = c.representation_request_id for update;
    if req.id is not null then
      update public.representation_requests
         set scope = case when scope is null then null else scope - p_authority end,
             authorities = array_remove(authorities, p_authority),
             updated_at = now()
       where id = req.id;
    end if;
  end if;

  select coalesce(bool_and(v ->> 'status' = 'active'), false) into v_active
    from public.clients cc, jsonb_each(coalesce(cc.authority_representations, '{}'::jsonb)) t(k, v)
   where cc.id = c.id and t.k in ('incomeTax', 'vat', 'withholding');
  if v_active and req.id is not null and req.status = 'awaiting_authorities' then
    update public.representation_requests set status = 'active', updated_at = now() where id = req.id;
  end if;
  return jsonb_build_object('ok', true, 'completed', v_active);
end;
$function$;

revoke all on function public.drop_shaam_authority(text, text) from public, anon;
grant execute on function public.drop_shaam_authority(text, text) to authenticated;
revoke all on function public.shaam_apply_authority_states(text, jsonb, text) from public, anon, authenticated;
revoke all on function public.shaam_row_awaits_client(jsonb) from anon;
revoke all on function public.shaam_row_authority(jsonb) from anon;
revoke all on function public.shaam_row_accepted(jsonb) from anon;
revoke all on function public.shaam_row_awaits_missing_file(jsonb) from anon;
revoke all on function public.shaam_rows_settled(jsonb) from anon;

select public.assert_domain_function_invariants();
