-- ─── 194: מחזור חיי בקשת הייצוג בשע״ם ───────────────────────────────────────
-- ‼ ממוספר 194 (193 תפוס — hebrew-only-city-address).
--
-- ארבעה שינויים, ושלושה handlers חדשים בעובד (shaam.create_representation,
-- shaam.submit_poa, shaam.check_representation — worker/src/handlers/):
--
-- 1. טלפון בן/בת הזוג נשמר בכרטיס גם ממסלול הקליטה. הוא כבר היה עמודה
--    (`clients.spouse_phone`, נערכת ידנית בכרטיס) אבל אף מסלול קליטה לא
--    כתב אליה — ולכן הוא היה חסר בדיוק אצל מי שנקלט/ה דרך הטופס. שע״ם
--    מבקשת אותו במסך «פרטי התקשרות» של בקשת הייצוג.
--    ‼ **בלי מילוי לאחור.** הכרעת מוצר: רשומה ישנה נשארת ריקה עד שמישהו
--    ימלא אותה ביד. ניחוש מטלפון הנישום היה משייך מספר לאדם הלא נכון.
--
-- 2. `automation_job_document_context` — הגבול שמאפשר לעובד המקומי להביא
--    את טופס 2279 שהופק בשע״ם אל תיק הלקוח, ולמשוך חזרה את הטופס החתום
--    לשידור. **רק** על הלקוח של job שהעובד מחזיק עכשיו.
--
-- 3. `sync_shaam_representation_from_job` — התרגום היחיד מתוצאת משימה
--    למצב עסקי. ‼ עקרון §9 של יסודות הבקשות: "היטל אינו מקור אמת" —
--    ה-worker מדווח מה ראה, והטריגר הזה (ולא ה-UI) הופך את זה למצב.
--    ‼ «נשלח לשע״ם» (`submittedAt` + מעבר ל-awaiting_authorities) נכתב
--    **אך ורק** כש-`result.submitted = true`, שהעובד מרים רק אחרי שראה
--    את הראיה במסך. לחיצה, ניווט או ניסיון העלאה אינם ראיה.
--
-- 4. `report_worker_status` — שלוש הפעולות החדשות מצטרפות לרשימת החידוש
--    העמיד: כולן יכולות לנחות על needs_human('awaiting_shaam_auth'),
--    ובלי ההרחבה הן היו נשארות תקועות עד לחיצה נוספת.

-- ── 1. טלפון בן/בת הזוג במסלול הקליטה ────────────────────────────────────

-- 1א · טיוטת השלב (191): המפתח מצטרף לשלב 3, שבו נאספים פרטי בן/בת הזוג.
-- ‼ הגוף להלן הוא **הגוף החי** (נקרא מהמסד לפני הכתיבה), בתוספת שני
-- שינויים בלבד: 'spousePhone' ברשימת המותרים של שלב 3, ואותו אימות צורה
-- שכבר חל על 'phone'. כל שאר הוולידציות נשארות מילה במילה — שכתוב מהזיכרון
-- היה מוריד בשקט בדיקות שכבר קיימות בייצור.
create or replace function public.save_onboarding_step(p_token text, p_step integer, p_values jsonb)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_req     public.representation_requests;
  v_allowed text[];
  v_clean   jsonb := '{}'::jsonb;
  v_prev    jsonb;
  v_vals    jsonb;
  v_now     text := to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"');
  k         text;
  v         text;
  v_keys    text[];
  v_prev_step int;
begin
  if p_step not between 1 and 3 then
    return jsonb_build_object('ok', false, 'error', 'bad_step');
  end if;
  if p_values is null or jsonb_typeof(p_values) <> 'object' then
    return jsonb_build_object('ok', false, 'error', 'bad_values');
  end if;

  select * into v_req from public.representation_requests where onboarding_token = p_token limit 1;
  if not found then return jsonb_build_object('ok', false, 'error', 'invalid_token'); end if;
  -- ‼ אחרי ההגשה הקישור אינו ערוץ כתיבה (166 PF3 / 175) — אותו גבול בדיוק.
  if v_req.onboarding_status = 'submitted' or v_req.status <> 'pending_fill' then
    return jsonb_build_object('ok', false, 'error', 'already_submitted');
  end if;

  v_allowed := case p_step
    when 1 then array['firstName','lastName','idNumber','birthDate','secondaryType','secondaryValue']
    when 2 then array['phone','email','city','address']
    -- ‼ 194: spousePhone נוסף כאן, לצד שאר פרטי בן/בת הזוג.
    else array['familyStatus','familyStatusYear','spouseFirstName','spouseLastName','spouseIdNumber',
               'spouseBirthYear','spouseBirthDate','spouseSecondaryType','spouseSecondaryValue','spousePhone']
  end;

  select array_agg(key) into v_keys from jsonb_object_keys(p_values) key;
  if exists (select 1 from unnest(coalesce(v_keys, '{}'::text[])) key where not (key = any(v_allowed))) then
    return jsonb_build_object('ok', false, 'error', 'field_not_allowed');
  end if;

  foreach k in array v_allowed loop
    if not (p_values ? k) then continue; end if;
    v := case jsonb_typeof(p_values->k)
           when 'string' then trim(p_values->>k)
           when 'number' then p_values->>k
           when 'null'   then null
           else null end;
    if v is null or v = '' then continue; end if;
    if length(v) > 120 then return jsonb_build_object('ok', false, 'error', 'invalid_value', 'field', k); end if;

    if k in ('idNumber', 'spouseIdNumber') and not public._israeli_id_valid(v) then
      return jsonb_build_object('ok', false, 'error', 'invalid_value', 'field', k);
    end if;
    if k in ('birthDate', 'spouseBirthDate') then
      if v !~ '^\d{4}-\d{2}-\d{2}$' or v::date > current_date then
        return jsonb_build_object('ok', false, 'error', 'invalid_value', 'field', k);
      end if;
    end if;
    if k in ('secondaryType', 'spouseSecondaryType') and v not in ('parentId', 'driverLicense', 'passport') then
      return jsonb_build_object('ok', false, 'error', 'invalid_value', 'field', k);
    end if;
    if k = 'familyStatus' and v not in ('single', 'married', 'divorced', 'widowed', 'singleParent') then
      return jsonb_build_object('ok', false, 'error', 'invalid_value', 'field', k);
    end if;
    if k in ('familyStatusYear', 'spouseBirthYear') then
      if v !~ '^\d{4}$' or v::int < 1900 or v::int > extract(year from now())::int then
        return jsonb_build_object('ok', false, 'error', 'invalid_value', 'field', k);
      end if;
      v_clean := v_clean || jsonb_build_object(k, v::int);
      continue;
    end if;
    if k = 'email' and (length(v) > 254 or v !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$') then
      return jsonb_build_object('ok', false, 'error', 'invalid_value', 'field', k);
    end if;
    -- ‼ 194: אותו אימות צורה בדיוק גם לטלפון בן/בת הזוג.
    if k in ('phone', 'spousePhone') and v !~ '^[\d\-\+\s\(\)]{9,}$' then
      return jsonb_build_object('ok', false, 'error', 'invalid_value', 'field', k);
    end if;
    v_clean := v_clean || jsonb_build_object(k, v);
  end loop;

  v_prev := coalesce(v_req.identification->'draft', '{}'::jsonb);
  v_prev_step := coalesce((v_prev->>'step')::int, 0);
  -- ‼ השדות של השלב הזה מוחלפים כיחידה: מה שהלקוח מחק לא חוזר מהטיוטה הקודמת.
  v_vals := coalesce(v_prev->'values', '{}'::jsonb);
  foreach k in array v_allowed loop v_vals := v_vals - k; end loop;
  v_vals := v_vals || v_clean;

  update public.representation_requests
     set identification = coalesce(identification, '{}'::jsonb) || jsonb_build_object('draft',
           v_prev || jsonb_build_object(
             'step', greatest(v_prev_step, p_step),
             'savedAt', v_now,
             'lastActivityAt', v_now,
             'openedAt', coalesce(v_prev->>'openedAt', v_now),
             'values', v_vals)),
         updated_at = now()
   where id = v_req.id;

  return jsonb_build_object('ok', true, 'step', greatest(v_prev_step, p_step), 'savedAt', v_now);
end;
$function$;

revoke execute on function public.save_onboarding_step(text, integer, jsonb) from public;
grant  execute on function public.save_onboarding_step(text, integer, jsonb) to anon, authenticated, service_role;

-- 1ב · ההגשה עצמה. ‼ החתימה משתנה ⇒ drop של הקודמת, אחרת PostgREST רואה
-- שתי פונקציות שמתאימות לקריאה בלי הפרמטר החדש ומחזיר 300.
drop function if exists public.submit_onboarding_full(
  text, text, text, text, text, text, text, text, text, text, text, text, integer,
  text, text, text, text, text, integer, text, text, text, text[]);

create or replace function public.submit_onboarding_full(
  p_token text, p_first_name text, p_last_name text, p_id_number text, p_birth_date text,
  p_secondary_type text, p_secondary_value text, p_phone text, p_email text, p_city text,
  p_address text, p_family_status text, p_family_status_year integer, p_spouse_name text,
  p_spouse_email text, p_spouse_id_number text,
  p_spouse_first_name text default null, p_spouse_last_name text default null,
  p_spouse_birth_year integer default null, p_spouse_birth_date text default null,
  p_spouse_secondary_type text default null, p_spouse_secondary_value text default null,
  p_identity_deferred text[] default null,
  p_spouse_phone text default null)
 returns boolean
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_req         public.representation_requests;
  v_full_name   text := trim(coalesce(p_first_name, '') || ' ' || coalesce(p_last_name, ''));
  v_spouse_full text := coalesce(
    nullif(trim(coalesce(p_spouse_first_name, '') || ' ' || coalesce(p_spouse_last_name, '')), ''),
    nullif(trim(coalesce(p_spouse_name, '')), ''));
  v_signers     jsonb;
  v_spouse      jsonb;
  v_deferred    text[];
begin
  select * into v_req from public.representation_requests where onboarding_token = p_token limit 1;
  if not found then
    return false;
  end if;

  if v_req.onboarding_status = 'submitted' or v_req.status <> 'pending_fill' then
    return false;
  end if;

  if not public._israeli_id_valid(p_id_number) then return false; end if;
  -- 193: עיר וכתובת בעברית בלבד. הבדיקה כאן כדי שהלקוח יקבל דחייה מסודרת
  -- ולא שגיאת אילוץ מהטבלה.
  if not public.is_hebrew_only(p_city) or not public.is_hebrew_only(p_address) then return false; end if;
  if nullif(trim(coalesce(p_spouse_id_number, '')), '') is not null
     and not public._israeli_id_valid(p_spouse_id_number) then return false; end if;

  select array_agg(distinct x) into v_deferred
    from unnest(coalesce(p_identity_deferred, '{}'::text[])) x where x in ('client', 'spouse');

  v_signers := coalesce(v_req.signers, '[]'::jsonb);
  if jsonb_array_length(v_signers) = 0 then
    v_signers := jsonb_build_array(jsonb_build_object(
      'id', 'client', 'role', 'client', 'signStatus', 'pending',
      'signToken', replace(gen_random_uuid()::text, '-', '')
    ));
  end if;

  v_signers := (
    select jsonb_agg(
      case when s->>'role' = 'client'
        then s
             || jsonb_build_object('name', v_full_name, 'email', coalesce(p_email, s->>'email', ''))
             || case when coalesce(s->>'signToken', '') = ''
                  then jsonb_build_object('signToken', replace(gen_random_uuid()::text, '-', ''))
                  else '{}'::jsonb end
        else s
      end
    )
    from jsonb_array_elements(v_signers) s
  );

  if p_family_status = 'married' and v_spouse_full is not null then
    select s into v_spouse from jsonb_array_elements(v_signers) s where s->>'role' = 'spouse' limit 1;
    v_spouse := coalesce(v_spouse, jsonb_build_object(
      'id', 'spouse', 'role', 'spouse', 'signStatus', 'pending',
      'signToken', replace(gen_random_uuid()::text, '-', '')
    )) || jsonb_build_object(
      'name', v_spouse_full,
      'email', coalesce(nullif(trim(coalesce(p_spouse_email, '')), ''), v_spouse->>'email', '')
    );
    v_signers := (
      select coalesce(jsonb_agg(s), '[]'::jsonb)
      from jsonb_array_elements(v_signers) s where s->>'role' <> 'spouse'
    ) || jsonb_build_array(v_spouse);
  elsif coalesce(nullif(trim(coalesce(p_family_status, '')), ''), '') <> '' then
    v_signers := (
      select coalesce(jsonb_agg(s), '[]'::jsonb)
      from jsonb_array_elements(v_signers) s
      where s->>'role' <> 'spouse' or s->>'signStatus' = 'signed'
    );
  end if;

  update public.representation_requests
    set identification = (coalesce(identification, '{}'::jsonb) - 'draft') || jsonb_strip_nulls(jsonb_build_object(
          'firstName',        nullif(trim(coalesce(p_first_name, '')), ''),
          'lastName',         nullif(trim(coalesce(p_last_name, '')), ''),
          'idNumber',         nullif(trim(coalesce(p_id_number, '')), ''),
          'birthDate',        nullif(trim(coalesce(p_birth_date, '')), ''),
          'secondaryType',    nullif(trim(coalesce(p_secondary_type, '')), ''),
          'secondaryValue',   nullif(trim(coalesce(p_secondary_value, '')), ''),
          'phone',            nullif(trim(coalesce(p_phone, '')), ''),
          'email',            nullif(trim(coalesce(p_email, '')), ''),
          'city',             nullif(trim(coalesce(p_city, '')), ''),
          'address',          nullif(trim(coalesce(p_address, '')), ''),
          'familyStatus',     nullif(trim(coalesce(p_family_status, '')), ''),
          'familyStatusYear', p_family_status_year,
          'spouseName',       v_spouse_full,
          'spouseFirstName',  nullif(trim(coalesce(p_spouse_first_name, '')), ''),
          'spouseLastName',   nullif(trim(coalesce(p_spouse_last_name, '')), ''),
          'spouseBirthYear',  p_spouse_birth_year,
          'spouseEmail',      nullif(trim(coalesce(p_spouse_email, '')), ''),
          -- 194: טלפון בן/בת הזוג — נשמר גם על הצילום ההיסטורי וגם בכרטיס.
          'spousePhone',      nullif(trim(coalesce(p_spouse_phone, '')), ''),
          'spouseIdNumber',   nullif(trim(coalesce(p_spouse_id_number, '')), ''),
          'spouseBirthDate',      nullif(trim(coalesce(p_spouse_birth_date, '')), ''),
          'spouseSecondaryType',  nullif(trim(coalesce(p_spouse_secondary_type, '')), ''),
          'spouseSecondaryValue', nullif(trim(coalesce(p_spouse_secondary_value, '')), ''),
          'identityDeferred',   case when coalesce(array_length(v_deferred, 1), 0) > 0 then to_jsonb(v_deferred) end,
          'identityDeferredAt', case when coalesce(array_length(v_deferred, 1), 0) > 0
                                     then to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') end
        )),
        client_name       = coalesce(nullif(v_full_name, ''), client_name),
        client_email      = coalesce(nullif(trim(coalesce(p_email, '')), ''), client_email),
        signers           = v_signers,
        onboarding_status = 'submitted',
        onboarding_submitted_at = now(),
        status            = 'awaiting_accountant',
        updated_at        = now()
    where id = v_req.id;

  if v_req.linked_client_id is not null then
    update public.clients
      set first_name      = coalesce(nullif(trim(coalesce(p_first_name, '')), ''), first_name),
          last_name       = coalesce(nullif(trim(coalesce(p_last_name, '')), ''), last_name),
          id_number       = coalesce(nullif(trim(coalesce(p_id_number, '')), ''), id_number),
          birth_date      = coalesce(nullif(trim(coalesce(p_birth_date, '')), '')::date, birth_date),
          phone           = coalesce(nullif(trim(coalesce(p_phone, '')), ''), phone),
          email           = coalesce(nullif(trim(coalesce(p_email, '')), ''), email),
          city            = coalesce(nullif(trim(coalesce(p_city, '')), ''), city),
          address         = coalesce(nullif(trim(coalesce(p_address, '')), ''), address),
          family_status   = coalesce(nullif(trim(coalesce(p_family_status, '')), ''), family_status),
          marriage_year   = case when p_family_status = 'married'  then coalesce(p_family_status_year, marriage_year)  else marriage_year  end,
          divorce_year    = case when p_family_status = 'divorced' then coalesce(p_family_status_year, divorce_year)   else divorce_year   end,
          widowhood_year  = case when p_family_status = 'widowed'  then coalesce(p_family_status_year, widowhood_year) else widowhood_year end,
          spouse_name       = coalesce(v_spouse_full, spouse_name),
          spouse_first_name = coalesce(nullif(trim(coalesce(p_spouse_first_name, '')), ''), spouse_first_name),
          spouse_last_name  = coalesce(nullif(trim(coalesce(p_spouse_last_name, '')), ''), spouse_last_name),
          spouse_birth_year = coalesce(
            p_spouse_birth_year,
            (substring(coalesce(p_spouse_birth_date, '') from '^\d{4}'))::integer,
            spouse_birth_year),
          spouse_id_number  = coalesce(nullif(trim(coalesce(p_spouse_id_number, '')), ''), spouse_id_number),
          spouse_email      = coalesce(nullif(trim(coalesce(p_spouse_email, '')), ''), spouse_email),
          -- ‼ 194: coalesce ולא דריסה — ערך שהמשרד הזין ידנית בכרטיס גובר
          -- על ריק שהגיע מהטופס, בדיוק כמו spouse_email שלידו.
          spouse_phone      = coalesce(nullif(trim(coalesce(p_spouse_phone, '')), ''), spouse_phone),
          representation_status = 'awaiting_accountant',
          updated_at      = now()
      where id = v_req.linked_client_id;

    if coalesce(array_length(v_deferred, 1), 0) > 0 then
      perform public.ensure_identity_document_requests(v_req.id, v_deferred);
    end if;
    perform public.sync_identity_docs_to_client_documents(v_req.linked_client_id);
  end if;

  return true;
end;
$function$;

revoke execute on function public.submit_onboarding_full(
  text, text, text, text, text, text, text, text, text, text, text, text, integer,
  text, text, text, text, text, integer, text, text, text, text[], text) from public;
grant  execute on function public.submit_onboarding_full(
  text, text, text, text, text, text, text, text, text, text, text, text, integer,
  text, text, text, text, text, integer, text, text, text, text[], text) to anon, authenticated, service_role;

-- ‼ אין כאן מילוי לאחור. בכוונה. ראה כותרת §1.

-- ── 2. גבול המסמכים של העובד המקומי ──────────────────────────────────────

/*
  ‼ זו הפונקציה שמגדירה כמה רחוק העובד יכול להגיע. היא מחזירה הקשר **רק**
  כשה-job נתפס על ידי אותו worker_id ועדיין רץ — ולכן:
    · אי אפשר לגעת בלקוח שאין עליו משימה פעילה,
    · אי אפשר להמשיך לגעת אחרי שהמשימה הסתיימה,
    · ואי אפשר לעבור ללקוח אחר בלי משימה משלו.
  ה-edge function בונה מזה נתיב אחסון קבוע (user/client/document) ואינו
  מקבל נתיב מהעובד — כך שגם מזהה שהומצא אינו יכול לצאת מהתיקייה הזאת.
*/
create or replace function public.automation_job_document_context(
  p_worker_id text, p_job_id text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_job public.automation_jobs;
begin
  select * into v_job from public.automation_jobs
   where id = p_job_id and claimed_by = p_worker_id and status = 'running';
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_owner_or_finished');
  end if;
  return jsonb_build_object(
    'ok', true,
    'user_id', v_job.user_id,
    'client_id', v_job.client_id,
    'action_type', v_job.action_type
  );
end;
$function$;

revoke all on function public.automation_job_document_context(text, text) from public, anon, authenticated;
grant execute on function public.automation_job_document_context(text, text) to service_role;

/* תווית מסמך למסמכים שהאוטומציה מביאה. documents.label_id הוא NOT NULL
   (179), ו«לבדיקה» אינו נכון כאן: טופס ייפוי כוח שהובא משע״ם אינו ממתין
   להחלטה של אדם. אידמפוטנטית. */
create or replace function public.ensure_automation_document_label(
  p_user_id uuid, p_name text default 'ייפוי כוח'
)
returns text
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_id   text;
  v_name text := coalesce(nullif(trim(p_name), ''), 'ייפוי כוח');
begin
  select id into v_id from public.document_labels
   where user_id = p_user_id and name = v_name limit 1;
  if v_id is not null then return v_id; end if;
  insert into public.document_labels (user_id, name)
  values (p_user_id, v_name)
  returning id into v_id;
  return v_id;
end;
$function$;

revoke all on function public.ensure_automation_document_label(uuid, text) from public, anon, authenticated;
grant execute on function public.ensure_automation_document_label(uuid, text) to service_role;

-- ── 3. תרגום תוצאת משימה למצב הביצוע של הבקשה ────────────────────────────

create or replace function public.sync_shaam_representation_from_job()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_key     text;
  v_req_id  text;
  v_track   jsonb;
  v_exec    jsonb;
  v_now     text := to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"');
  v_status  text;
begin
  if new.action_type not in (
    'shaam.create_representation', 'shaam.submit_poa', 'shaam.check_representation'
  ) then
    return new;
  end if;

  -- ‼ מפתח ההגשה חייב לבוא מהתוצאה/הקלט המפורשים — לעולם לא מנחשים "מי".
  v_key := coalesce(new.result ->> 'submissionKey', new.input ->> 'submissionKey');
  if v_key is null or v_key = '' then return new; end if;

  select representation_request_id into v_req_id
    from public.clients where id = new.client_id;
  if v_req_id is null then return new; end if;

  select coalesce(execution, '{}'::jsonb) into v_exec
    from public.representation_requests where id = v_req_id;
  if v_exec is null then return new; end if;
  v_track := coalesce(v_exec #> array['shaam', v_key], '{}'::jsonb);

  if new.action_type = 'shaam.create_representation' then
    -- ‼ coalesce על מספר הבקשה: מזהה חיצוני קיים לא נדרס לעולם.
    v_track := v_track || jsonb_strip_nulls(jsonb_build_object(
      'requestNumber',  coalesce(v_track ->> 'requestNumber', new.result ->> 'requestNumber'),
      'createdAt',      coalesce(v_track ->> 'createdAt', v_now),
      'formDocumentId', new.result ->> 'formDocumentId',
      -- ‼ שם הקובץ נשמר כדי שהכנת אזורי החתימה לא תצטרך לשאול את טבלת
      -- המסמכים: הוא חלק מאותה עובדה שהתקבלה, לא חיפוש נוסף.
      'formFileName',   new.result ->> 'formFileName',
      'formFetchedAt',  case when new.result ->> 'formDocumentId' is not null
                             then coalesce(v_track ->> 'formFetchedAt', v_now) end
    ));

  elsif new.action_type = 'shaam.submit_poa' then
    -- ‼ **הכלל היחיד שאסור לפספס:** «נשלח לשע״ם» רק על ראיה מפורשת.
    -- ניסיון העלאה, לחיצה או ניווט אינם submitted=true.
    if coalesce((new.result ->> 'submitted')::boolean, false) then
      v_track := v_track || jsonb_build_object(
        'submittedAt', coalesce(v_track ->> 'submittedAt', v_now));
    end if;

  elsif new.action_type = 'shaam.check_representation' then
    -- ‼ הסיווג לתוויות עסקיות נעשה ב-PIVO (shaamRepresentation.ts). כאן
    -- נשמר מה שנקרא, כולל הטקסט הגולמי — כדי שניסוח חדש אצל הרשות יהיה
    -- ניתן לזיהוי בדיעבד במקום להיעלם בתרגום.
    v_track := v_track || jsonb_strip_nulls(jsonb_build_object(
      'syncedAt',        v_now,
      'requestNumber',   coalesce(v_track ->> 'requestNumber', new.result ->> 'requestNumber'),
      'rawRequestState', (new.result -> 'rows' -> 0) ->> 'rawRequestState',
      'systems',         new.result -> 'rows'
    ));
  end if;

  update public.representation_requests
     set execution = jsonb_set(
           coalesce(execution, '{}'::jsonb), array['shaam'],
           coalesce(execution -> 'shaam', '{}'::jsonb) || jsonb_build_object(v_key, v_track),
           true)
   where id = v_req_id;

  -- ── מעברי הסטטוס העסקי, שניהם על ראיה חיצונית בלבד ──────────────────────
  select status into v_status from public.representation_requests where id = v_req_id;

  -- «נשלח לשע״ם»: הטופס נקלט אצל הרשות ⇒ הבקשה ממתינה לרשויות.
  if new.action_type = 'shaam.submit_poa'
     and coalesce((new.result ->> 'submitted')::boolean, false)
     and v_status in ('pending_signature', 'awaiting_stamp') then
    update public.representation_requests
       set status = 'awaiting_authorities', updated_at = now()
     where id = v_req_id;
  end if;

  -- «הייצוג פעיל»: שע״ם מדווחת שכל המערכים שהתבקשו נקלטו.
  -- ‼ allAccepted מחושב בעובד על שורות שנצפו בפועל; רשימה ריקה לעולם
  -- אינה «הכול נקלט» (ראה shaamCheckRepresentation.mjs).
  if new.action_type = 'shaam.check_representation'
     and coalesce((new.result ->> 'allAccepted')::boolean, false)
     and v_status = 'awaiting_authorities' then
    update public.representation_requests
       set status = 'active', updated_at = now()
     where id = v_req_id;
  end if;

  return new;
end;
$function$;

drop trigger if exists trg_sync_shaam_representation_from_job on public.automation_jobs;
create trigger trg_sync_shaam_representation_from_job
  after update on public.automation_jobs
  for each row
  when (new.status = 'succeeded' and old.status is distinct from new.status)
  execute function public.sync_shaam_representation_from_job();

-- ── 4. חידוש needs_human עמיד גם לשלוש הפעולות החדשות ────────────────────

create or replace function public.report_worker_status(
  p_user_id   uuid,
  p_worker_id text,
  p_status    jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_status   jsonb;
  v_job      record;
  v_capability text;
  v_ready    boolean;
  v_resumed  text[] := '{}';
begin
  insert into public.automation_workers (worker_id, user_id, last_seen_at, status)
  values (p_worker_id, p_user_id, now(), coalesce(p_status, '{}'::jsonb))
  on conflict (worker_id) do update
    set last_seen_at = now(),
        user_id      = excluded.user_id,
        status       = coalesce(excluded.status, public.automation_workers.status)
  returning status into v_status;

  for v_job in
    select id, error_code from public.automation_jobs
     where claimed_by = p_worker_id
       and status = 'needs_human'
       -- ‼ 194: שלוש פעולות מחזור חיי בקשת הייצוג נוספו — כולן נוחתות על
       -- awaiting_shaam_auth כשמערכת רישום הייצוג אינה מוכנה.
       and action_type in (
         'shaam.connect', 'shaam.ensure_capability',
         'shaam.create_representation', 'shaam.submit_poa', 'shaam.check_representation',
         'btl.create_representation', 'btl.check_representation'
       )
       and cancel_requested = false
  loop
    v_capability := (regexp_match(coalesce(v_job.error_code, ''), '^awaiting_(\w+)_auth$'))[1];
    continue when v_capability is null;

    v_ready := case
      when v_capability = 'shaam' then coalesce((v_status #>> array['shaam', 'connected'])::boolean, false)
      when v_capability = 'btl' then coalesce((v_status #>> array['btl', 'connected'])::boolean, false)
      else coalesce((v_status #>> array[v_capability, 'ready'])::boolean, false)
    end;
    continue when not v_ready;

    update public.automation_jobs
       set status       = 'running',
           claimed_at   = now(),
           lease_until  = now() + make_interval(secs => 5),
           needs_human  = null,
           error_code   = null,
           error_detail = null
     where id = v_job.id
       and claimed_by = p_worker_id
       and status = 'needs_human'
       and cancel_requested = false;

    if found then
      v_resumed := array_append(v_resumed, v_job.id);
    end if;
  end loop;

  return jsonb_build_object('ok', true, 'resumed', to_jsonb(v_resumed));
end;
$function$;

revoke all on function public.report_worker_status(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.report_worker_status(uuid, text, jsonb) to service_role;

-- ── 5. בדיקת שפיות ────────────────────────────────────────────────────────
do $$
begin
  if has_function_privilege('anon', 'public.automation_job_document_context(text,text)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.automation_job_document_context(text,text)', 'EXECUTE')
     or has_function_privilege('anon', 'public.ensure_automation_document_label(uuid,text)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.ensure_automation_document_label(uuid,text)', 'EXECUTE')
  then
    raise exception '194: פונקציות service_role-בלבד נחשפו בטעות ל-anon/authenticated';
  end if;
end $$;


select public.assert_domain_function_invariants();
