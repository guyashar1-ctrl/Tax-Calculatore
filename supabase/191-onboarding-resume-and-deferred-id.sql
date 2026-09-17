-- ═══════════════════════════════════════════════════════════════════════════
--  191 — קליטת הייצוג ניתנת להמשך · צילום תעודה נדחה · נראות למשרד (M1)
-- ═══════════════════════════════════════════════════════════════════════════
--  מקור: docs/FINDINGS-REPRESENTATION-RESUME-AND-PROCESS-VISIBILITY.md.
--  התקלה האמיתית: טופס הקליטה (?onboard=) שמר את שלבים 1–3 רק בזיכרון הדפדפן
--  וכתב לשרת פעם אחת, בסוף שלב 4 — ושלב 4 נחסם בלי צילום תעודה. לקוח בלי
--  תעודה ביד יצא, וחזר לטופס ריק.
--
--  מה נכנס כאן, וכולו על המודל הקיים (בלי טבלה חדשה, בלי מצב חדש):
--   ① save_onboarding_step — שמירה במעבר שלב («המשך»), לא בכל הקשה. הטיוטה
--      יושבת ב-identification.draft (שלב, זמן, ערכים) — נפרד ממה שהוגש, כדי
--      שמסכי המשרד לא יקראו טיוטה כהגשה. אותו טוקן, אותו כלל כמו 149:
--      כותב רק את השדות של הטופס, רק כל עוד הבקשה ב-pending_fill.
--   ② touch_onboarding — «הקישור נפתח» + «פעילות אחרונה», כדי שהמשרד ידע אם
--      הלקוח בכלל הגיע. נפרד מ-get_onboarding בכוונה: בדיקת הבריאות (176)
--      קוראת ל-get_onboarding ואסור שתטביע «נפתח» כמו שקרה לדף האישי.
--   ③ get_onboarding מחזירה גם draft ו-spouse_fill (טוקן, התבקש, הושלם) —
--      כדי שהטופס יחזור לאותו מקום, כולל הזיכרון שבן/בת הזוג כבר קיבל/ה קישור.
--   ④ submit_onboarding_full — פרמטר נוסף p_identity_deferred: מי מהאנשים
--      בחר/ה «אעלה מאוחר יותר». ההגשה עוברת; הצילום החסר נרשם, הטיוטה נמחקת,
--      ופריט העלאה נפתח בבקשת «מסמכים מהלקוח» — הבית הקיים של מסמך שהלקוח
--      חייב (יסודות §16: מסמך הוא בקשה, לא תנאי-קדם).
--   ⑤ התכנסות: צילום שהועלה בקליטה סוגר את פריט id_card ב«מסמכים מהלקוח»;
--      צילום שהועלה מהדף האישי לפריט id_card / id_card_spouse נרשם ב-
--      identity_docs של הבקשה. מקום אמת אחד לכל כיוון, בלי לבקש פעמיים.
--   ⑥ שומר הקבועים (165) מכיר בשני ה-RPC הציבוריים החדשים.
--
--  ‼ אין כאן ניקוי טיוטות נטושות. מדיניות שמירה היא הכרעת מוצר שנותרה פתוחה
--    (הדוח, §O/§P.5); המבנה — draft.savedAt — מאפשר להוסיף אותה בלי שינוי סכימה.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 0 · ספרת ביקורת של ת.ז. — אותו אלגוריתם כמו utils/israeliId.ts ────────
create or replace function public._israeli_id_valid(p_id text)
returns boolean
language plpgsql
immutable
as $function$
declare
  v text := lpad(coalesce(trim(p_id), ''), 9, '0');
  v_sum int := 0;
  v_step int;
  i int;
begin
  if v !~ '^\d{9}$' then return false; end if;
  for i in 1..9 loop
    v_step := (substr(v, i, 1))::int * (((i - 1) % 2) + 1);
    v_sum := v_sum + case when v_step > 9 then v_step - 9 else v_step end;
  end loop;
  return v_sum % 10 = 0;
end;
$function$;

revoke all on function public._israeli_id_valid(text) from public, anon, authenticated;

-- ── ① שמירת שלב ──────────────────────────────────────────────────────────
-- ‼ רשימת שדות סגורה לכל שלב. מפתח שאינו ברשימה נדחה — הטוקן האנונימי אינו
--   ערוץ כתיבה כללי. ערך ריק מסיר את המפתח מהטיוטה (הלקוח מחק מה שהקליד).
-- ‼ אימות בשרת של מה שהמסך ממילא אוכף: ת.ז. עם ספרת ביקורת, תאריכים, מייל,
--   רשימות סגורות. שגיאה מחזירה {ok:false, field} ואינה כותבת דבר.
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
    else array['familyStatus','familyStatusYear','spouseFirstName','spouseLastName','spouseIdNumber',
               'spouseBirthYear','spouseBirthDate','spouseSecondaryType','spouseSecondaryValue']
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
    if k = 'phone' and v !~ '^[\d\-\+\s\(\)]{9,}$' then
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

revoke all on function public.save_onboarding_step(text, integer, jsonb) from public, authenticated;
grant execute on function public.save_onboarding_step(text, integer, jsonb) to anon, authenticated, service_role;

-- ── ② «הקישור נפתח» ───────────────────────────────────────────────────────
create or replace function public.touch_onboarding(p_token text)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_req  public.representation_requests;
  v_now  text := to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"');
  v_prev jsonb;
begin
  select * into v_req from public.representation_requests where onboarding_token = p_token limit 1;
  if not found then return false; end if;
  if v_req.onboarding_status = 'submitted' or v_req.status <> 'pending_fill' then return true; end if;
  v_prev := coalesce(v_req.identification->'draft', '{}'::jsonb);
  update public.representation_requests
     set identification = coalesce(identification, '{}'::jsonb) || jsonb_build_object('draft',
           v_prev || jsonb_build_object(
             'openedAt', coalesce(v_prev->>'openedAt', v_now),
             'lastActivityAt', v_now)),
         updated_at = now()
   where id = v_req.id;
  return true;
end;
$function$;

revoke all on function public.touch_onboarding(text) from public, authenticated;
grant execute on function public.touch_onboarding(text) to anon, authenticated, service_role;

-- ── ③ get_onboarding — שני שדות נוספים בסוף ──────────────────────────────
-- ‼ RETURNS TABLE משתנה ⇒ drop לפני create (42P13). שאר העמודות זהות ל-142.
drop function if exists public.get_onboarding(text);

create or replace function public.get_onboarding(p_token text)
 returns table(
   client_name text, firm_name text, branding jsonb, already_submitted boolean,
   status text, authorities text[], already_signed boolean, has_setup boolean,
   known_first_name text, known_last_name text, known_email text,
   known_family_status text, known_family_status_year integer,
   ni_included boolean, prefill jsonb,
   scope jsonb, identity_docs jsonb,
   draft jsonb, spouse_fill jsonb
 )
 language sql
 security definer
 set search_path to 'public'
as $function$
  select r.client_name,
         coalesce(p.firm_name, '') as firm_name,
         coalesce(p.branding, '{}'::jsonb) as branding,
         (r.onboarding_status = 'submitted') as already_submitted,
         r.status,
         coalesce(r.authorities, '{}'::text[]) as authorities,
         (r.identification ? 'signatureDataUrl') as already_signed,
         (r.signature_setup is not null) as has_setup,
         nullif(c.first_name, '') as known_first_name,
         nullif(c.last_name, '')  as known_last_name,
         nullif(coalesce(c.email, r.client_email), '') as known_email,
         nullif(c.family_status, '') as known_family_status,
         case c.family_status
           when 'married'  then c.marriage_year
           when 'divorced' then c.divorce_year
           when 'widowed'  then c.widowhood_year
           else null
         end as known_family_status_year,
         coalesce(c.authority_representations ? 'nationalInsurance', false) as ni_included,
         coalesce(r.prefill, '{}'::jsonb) as prefill,
         coalesce(r.scope, c.authority_representations, '{}'::jsonb) as scope,
         coalesce(r.identity_docs, '{}'::jsonb) as identity_docs,
         -- הטיוטה חוזרת רק כל עוד יש מה להמשיך; אחרי ההגשה הטופס ממילא לא מוצג.
         case when r.onboarding_status = 'submitted' then '{}'::jsonb
              else coalesce(r.identification->'draft', '{}'::jsonb) end as draft,
         -- ‼ הטוקן של בן/בת הזוג חוזר למי שמחזיק את טוקן הלקוח: הוא זה שיצר
         --   אותו (request_spouse_onboarding מחזירה אותו לאותו מחזיק ממילא).
         jsonb_strip_nulls(jsonb_build_object(
           'requestedAt', r.identification->>'spouseFillRequestedAt',
           'submittedAt', r.identification->>'spouseFillSubmittedAt',
           'token', case when nullif(r.identification->>'spouseFillRequestedAt', '') is not null
                         then nullif(r.spouse_onboarding_token, '') end)) as spouse_fill
  from public.representation_requests r
  join public.profiles p on p.id = r.user_id
  left join public.clients c on c.id = r.linked_client_id
  where r.onboarding_token = p_token
  limit 1;
$function$;

revoke all on function public.get_onboarding(text) from public;
grant execute on function public.get_onboarding(text) to anon, authenticated, service_role;

-- ── ⑤א · התכנסות: identity_docs ⇒ «מסמכים מהלקוח» ─────────────────────────
-- פריט id_card (הלקוח) / id_card_spouse (בן/בת הזוג) בבקשת המסמכים נסגר
-- מעצמו כשיש צילום ב-identity_docs של הבקשה האחרונה של הלקוח.
-- «להעלות מסמך אחד» / «להעלות 3 מסמכים» — אותו דפוס כמו המחולל, עם יחיד תקין.
create or replace function public._documents_title(p_n integer)
returns text
language sql
immutable
as $function$
  select case when p_n = 1 then 'להעלות מסמך אחד' else 'להעלות ' || p_n || ' מסמכים' end;
$function$;

revoke all on function public._documents_title(integer) from public, anon, authenticated;

create or replace function public.identity_doc_item_key(p_person text)
returns text
language sql
immutable
as $function$
  select case p_person when 'spouse' then 'id_card_spouse' else 'id_card' end;
$function$;

revoke all on function public.identity_doc_item_key(text) from public, anon, authenticated;

create or replace function public.sync_identity_docs_to_client_documents(p_client_id text)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  r        public.representation_requests%rowtype;
  s        record;
  v_person text;
  v_key    text;
  v_last   jsonb;
  v_list   jsonb;
  v_idx    int;
  v_item   jsonb;
  v_changed int := 0;
  v_touched boolean;
  v_remaining int;
begin
  select * into r from public.representation_requests
   where linked_client_id = p_client_id order by created_at desc limit 1;
  if r.id is null or r.identity_docs is null or r.identity_docs = '{}'::jsonb then return 0; end if;

  for s in
    select * from public.onboarding_steps
     where client_id = p_client_id and step_type = 'client_documents'
       and status not in ('completed','verified','skipped','cancelled')
  loop
    v_list := coalesce(s.payload->'checklist', '[]'::jsonb);
    v_touched := false;
    foreach v_person in array array['client','spouse'] loop
      if jsonb_typeof(r.identity_docs->v_person) <> 'array'
         or jsonb_array_length(r.identity_docs->v_person) = 0 then continue; end if;
      v_key := public.identity_doc_item_key(v_person);
      v_last := (r.identity_docs->v_person)->(jsonb_array_length(r.identity_docs->v_person) - 1);
      select ord - 1, x into v_idx, v_item
        from jsonb_array_elements(v_list) with ordinality t(x, ord)
       where x->>'key' = v_key limit 1;
      if v_idx is null or coalesce((v_item->>'done')::boolean, false) then continue; end if;
      v_list := jsonb_set(v_list, array[v_idx::text],
        v_item || jsonb_build_object(
          'done', true,
          'documentId', v_last->>'documentId',
          'doneAt', coalesce(v_last->>'at', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')),
          'source', 'representation_onboarding'));
      v_touched := true;
      v_changed := v_changed + 1;
      perform public.log_onboarding_event(s.user_id, s.id, s.engagement_id, 'note', 'system',
        'צילום התעודה התקבל בקליטת הייצוג - הפריט נסגר מעצמו',
        jsonb_build_object('itemKey', v_key, 'documentId', v_last->>'documentId', 'requestId', r.id));
    end loop;
    if not v_touched then continue; end if;

    update public.onboarding_steps
       set payload = payload || jsonb_build_object('checklist', v_list)
     where id = s.id;

    select count(*) into v_remaining
      from jsonb_array_elements(v_list) x
     where not coalesce((x->>'done')::boolean, false)
       and not (coalesce((x->>'optional')::boolean, false) or x->>'key' = 'additional_material');

    if v_remaining = 0 then
      perform public._set_step_status(s.id, 'completed', 'system',
        'כל המסמכים התקבלו', jsonb_build_object('via', 'representation_onboarding'), 'me', 'system');
    elsif s.status = 'pending' then
      perform public._set_step_status(s.id, 'in_progress', 'system',
        'התקבל צילום התעודה מקליטת הייצוג', jsonb_build_object('via', 'representation_onboarding'), s.ball, null);
    end if;
  end loop;
  return v_changed;
end;
$function$;

revoke all on function public.sync_identity_docs_to_client_documents(text) from public, anon, authenticated;
grant execute on function public.sync_identity_docs_to_client_documents(text) to service_role;

-- onboarding_identity_doc_append (175) — אותו גוף, ובסוף סנכרון לבקשת המסמכים.
create or replace function public.onboarding_identity_doc_append(p_request_id text, p_person text, p_entry jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_docs jsonb;
  v_client text;
begin
  if p_person not in ('client', 'spouse') or p_entry is null or jsonb_typeof(p_entry) <> 'object' then
    return jsonb_build_object('ok', false, 'error', 'bad_input');
  end if;

  update public.representation_requests
     set identity_docs = jsonb_set(
           coalesce(identity_docs, '{}'::jsonb),
           array[p_person],
           coalesce(identity_docs->p_person, '[]'::jsonb) || jsonb_build_array(p_entry),
           true)
   where id = p_request_id
   returning identity_docs, linked_client_id into v_docs, v_client;

  if v_docs is null then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  -- ‼ 191: הצילום שהגיע כאן סוגר גם את פריט התעודה ב«מסמכים מהלקוח» — לא מבקשים פעמיים.
  if v_client is not null then
    perform public.sync_identity_docs_to_client_documents(v_client);
  end if;
  return jsonb_build_object('ok', true, 'count', jsonb_array_length(v_docs->p_person));
end;
$function$;

revoke execute on function public.onboarding_identity_doc_append(text, text, jsonb) from public, anon, authenticated;
grant  execute on function public.onboarding_identity_doc_append(text, text, jsonb) to service_role;

-- בקשת מסמכים שנולדת אחרי שהצילום כבר הגיע (המחולל רץ אחרי הקליטה) —
-- נולדת עם הפריט סגור.
create or replace function public.client_documents_born_trg()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if new.step_type = 'client_documents' then
    perform public.sync_identity_docs_to_client_documents(new.client_id);
  end if;
  return new;
end;
$function$;

drop trigger if exists onboarding_steps_client_documents_born on public.onboarding_steps;
create trigger onboarding_steps_client_documents_born
  after insert on public.onboarding_steps
  for each row execute function public.client_documents_born_trg();

-- ── ⑤ב · התכנסות: «מסמכים מהלקוח» ⇒ identity_docs ─────────────────────────
-- צילום שהועלה מהדף האישי (portal-upload-document כותב documentId על הפריט)
-- לפריט id_card / id_card_spouse נרשם ב-identity_docs של הבקשה — ומשם
-- הצילום החסר מפסיק להיות חסר, בכל מסך שקורא אותו.
create or replace function public.client_documents_to_identity_docs_trg()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  r      public.representation_requests%rowtype;
  x      jsonb;
  v_person text;
  v_doc  text;
  v_name text;
begin
  if new.step_type <> 'client_documents' then return new; end if;
  if old.payload is not distinct from new.payload then return new; end if;

  select * into r from public.representation_requests
   where linked_client_id = new.client_id order by created_at desc limit 1;
  if r.id is null then return new; end if;

  for x in select * from jsonb_array_elements(coalesce(new.payload->'checklist', '[]'::jsonb)) loop
    if x->>'key' not in ('id_card', 'id_card_spouse') then continue; end if;
    v_doc := nullif(x->>'documentId', '');
    if v_doc is null then continue; end if;
    v_person := case when x->>'key' = 'id_card_spouse' then 'spouse' else 'client' end;
    if exists (select 1 from jsonb_array_elements(coalesce(r.identity_docs->v_person, '[]'::jsonb)) d
                where d->>'documentId' = v_doc) then continue; end if;
    select file_name into v_name from public.documents where id = v_doc;
    update public.representation_requests
       set identity_docs = jsonb_set(
             coalesce(identity_docs, '{}'::jsonb),
             array[v_person],
             coalesce(identity_docs->v_person, '[]'::jsonb) || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
               'documentId', v_doc, 'docKind', 'idCard', 'fileName', v_name,
               'at', coalesce(x->>'doneAt', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')),
               'via', 'client_documents'))),
             true)
     where id = r.id
     returning * into r;
  end loop;
  return new;
end;
$function$;

drop trigger if exists onboarding_steps_client_documents_identity on public.onboarding_steps;
create trigger onboarding_steps_client_documents_identity
  after update of payload on public.onboarding_steps
  for each row execute function public.client_documents_to_identity_docs_trg();

-- ── ④ב · צילום נדחה ⇒ פריט ב«מסמכים מהלקוח» ──────────────────────────────
-- ‼ לא תנאי-קדם ולא מצב חדש: מסמך שהלקוח חייב הוא בקשה (יסודות §16). אם
--   יש בקשת מסמכים פתוחה — הפריט מתווסף אליה (וגם לטיוטת העריכה שלה, כדי
--   ש«עדכן את דף הלקוח» לא ימחק אותו — merge_step_draft שומר רק מפתחות
--   שבטיוטה). אין — נפתחת אחת, ומתפרסמת אלא אם ההצעה טרם אושרה (135).
create or replace function public.ensure_identity_document_requests(p_request_id text, p_persons text[])
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  r        public.representation_requests%rowtype;
  c        public.clients%rowtype;
  s        public.onboarding_steps%rowtype;
  v_person text;
  v_key    text;
  v_kind   text;
  v_label  text;
  v_items  jsonb := '[]'::jsonb;
  v_list   jsonb;
  v_draft  jsonb;
  v_added  int := 0;
  v_eng    text;
  v_sort   int;
  v_stage  text;
  v_labels text;
begin
  select * into r from public.representation_requests where id = p_request_id;
  if r.id is null or r.linked_client_id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  select * into c from public.clients where id = r.linked_client_id;
  if c.id is null then return jsonb_build_object('ok', false, 'error', 'client_not_found'); end if;

  foreach v_person in array coalesce(p_persons, '{}'::text[]) loop
    if v_person not in ('client', 'spouse') then continue; end if;
    -- כבר יש צילום ⇒ אין מה לבקש.
    if jsonb_typeof(r.identity_docs->v_person) = 'array'
       and jsonb_array_length(r.identity_docs->v_person) > 0 then continue; end if;
    v_key := public.identity_doc_item_key(v_person);
    v_kind := case v_person when 'spouse' then r.identification->>'spouseSecondaryType'
                            else r.identification->>'secondaryType' end;
    -- אותו ניסוח כמו utils/identityEvidence.docKindPrompt.
    v_label := case v_kind when 'driverLicense' then 'צילום רישיון נהיגה'
                           when 'passport' then 'צילום דרכון'
                           else 'צילום תעודת זהות או רישיון נהיגה' end
               || case when v_person = 'spouse'
                       then ' - ' || coalesce(nullif(trim(coalesce(r.identification->>'spouseFirstName','') || ' ' ||
                                                           coalesce(r.identification->>'spouseLastName','')), ''),
                                             nullif(trim(coalesce(r.identification->>'spouseName','')), ''),
                                             'בן/בת הזוג')
                       else '' end;
    v_items := v_items || jsonb_build_object('key', v_key, 'label', v_label, 'done', false,
                                             'source', 'representation_onboarding');
  end loop;
  if jsonb_array_length(v_items) = 0 then
    return jsonb_build_object('ok', true, 'added', 0);
  end if;

  select * into s from public.onboarding_steps
   where client_id = c.id and step_type = 'client_documents' and status <> 'cancelled'
   order by created_at desc limit 1;

  if s.id is not null then
    v_list  := coalesce(s.payload->'checklist', '[]'::jsonb);
    v_draft := s.draft_payload;
    for v_key, v_label in
      select x->>'key', x->>'label' from jsonb_array_elements(v_items) x
    loop
      if exists (select 1 from jsonb_array_elements(v_list) y where y->>'key' = v_key) then continue; end if;
      v_list := v_list || jsonb_build_object('key', v_key, 'label', v_label, 'done', false, 'source', 'representation_onboarding');
      if v_draft is not null and jsonb_typeof(v_draft->'checklist') = 'array'
         and not exists (select 1 from jsonb_array_elements(v_draft->'checklist') y where y->>'key' = v_key) then
        v_draft := jsonb_set(v_draft, '{checklist}',
          (v_draft->'checklist') || jsonb_build_object('key', v_key, 'label', v_label, 'done', false, 'source', 'representation_onboarding'));
      end if;
      v_added := v_added + 1;
    end loop;
    if v_added = 0 then return jsonb_build_object('ok', true, 'added', 0, 'stepId', s.id); end if;

    update public.onboarding_steps
       set payload = payload || jsonb_build_object('checklist', v_list)
                     || case when coalesce(s.payload->>'clientTitle', '') ~ '^להעלות (\d+ מסמכים|מסמך אחד)$'
                             then jsonb_build_object('clientTitle', public._documents_title(jsonb_array_length(v_list)))
                             else '{}'::jsonb end,
           draft_payload = v_draft,
           updated_at = now()
     where id = s.id;

    -- בקשה שכבר נסגרה נפתחת מחדש — אותה עבודה («מסמכים מהלקוח»), לא עבודה חדשה.
    if s.status in ('completed', 'verified', 'skipped') then
      perform public._set_step_status(s.id, 'waiting_client', 'system',
        'הלקוח בחר להעלות את צילום התעודה מאוחר יותר - הבקשה נפתחה מחדש',
        jsonb_build_object('requestId', r.id, 'items', v_items), 'client', null);
    else
      perform public.log_onboarding_event(s.user_id, s.id, s.engagement_id, 'note', 'client',
        'הלקוח בחר להעלות את צילום התעודה מאוחר יותר - נוסף לרשימת המסמכים',
        jsonb_build_object('requestId', r.id, 'items', v_items));
    end if;
    return jsonb_build_object('ok', true, 'added', v_added, 'stepId', s.id);
  end if;

  -- אין בקשת מסמכים ⇒ נפתחת אחת. אותם שדות שהמחולל כותב (168).
  select id into v_eng from public.engagements
   where client_id = c.id order by created_at desc limit 1;
  select coalesce(max(sort_order), 0) + 10 into v_sort
    from public.onboarding_steps where client_id = c.id and status <> 'cancelled';
  v_stage := public.derive_lifecycle_stage(c.id);
  select string_agg(x->>'label', ' · ') into v_labels from jsonb_array_elements(v_items) x;

  insert into public.onboarding_steps
    (user_id, engagement_id, client_id, required_for_close, step_type, track, scope,
     status, ball, sort_order, payload, published_at)
  values
    (c.user_id, v_eng, c.id, public.intake_accepts_required(c.id), 'client_documents', 'tools', 'person',
     'pending', 'client', v_sort,
     jsonb_build_object(
       'checklist', v_items,
       'clientTitle', public._documents_title(jsonb_array_length(v_items)),
       'clientSub', v_labels,
       'clientCta', 'להעלאה')
     || case when v_stage in ('lead', 'quoted') then jsonb_build_object('published', false, 'heldUntilApproval', true) else '{}'::jsonb end,
     case when v_stage in ('lead', 'quoted') then null else now() end)
  returning * into s;

  perform public.log_onboarding_event(c.user_id, s.id, v_eng, 'created', 'client',
    'הלקוח בחר להעלות את צילום התעודה מאוחר יותר - נפתחה בקשת מסמכים',
    jsonb_build_object('requestId', r.id, 'items', v_items));
  return jsonb_build_object('ok', true, 'added', jsonb_array_length(v_items), 'stepId', s.id, 'created', true);
end;
$function$;

revoke all on function public.ensure_identity_document_requests(text, text[]) from public, anon, authenticated;
grant execute on function public.ensure_identity_document_requests(text, text[]) to service_role;

-- ── ④א · submit_onboarding_full — פרמטר p_identity_deferred ──────────────
-- ‼ החתימה משתנה ⇒ drop של הגרסה הקודמת (כמו 148), אחרת PostgREST רואה שתי
--   פונקציות שמתאימות לקריאה בלי הפרמטר החדש ומחזיר 300.
-- הגוף זהה ל-166 (PF3), בתוספת: identityDeferred/identityDeferredAt נרשמים,
-- הטיוטה נמחקת, ופריטי ההעלאה נפתחים בבקשת המסמכים.
drop function if exists public.submit_onboarding_full(
  text, text, text, text, text, text, text, text, text, text, text, text, integer,
  text, text, text, text, text, integer, text, text, text);

create or replace function public.submit_onboarding_full(
  p_token text, p_first_name text, p_last_name text, p_id_number text, p_birth_date text,
  p_secondary_type text, p_secondary_value text, p_phone text, p_email text, p_city text,
  p_address text, p_family_status text, p_family_status_year integer, p_spouse_name text,
  p_spouse_email text, p_spouse_id_number text,
  p_spouse_first_name text default null, p_spouse_last_name text default null,
  p_spouse_birth_year integer default null, p_spouse_birth_date text default null,
  p_spouse_secondary_type text default null, p_spouse_secondary_value text default null,
  p_identity_deferred text[] default null)
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

  -- ‼ אימות בשרת של הזהות — אותם כללים כמו בשמירת הטיוטה.
  if not public._israeli_id_valid(p_id_number) then return false; end if;
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
          'spouseIdNumber',   nullif(trim(coalesce(p_spouse_id_number, '')), ''),
          'spouseBirthDate',      nullif(trim(coalesce(p_spouse_birth_date, '')), ''),
          'spouseSecondaryType',  nullif(trim(coalesce(p_spouse_secondary_type, '')), ''),
          'spouseSecondaryValue', nullif(trim(coalesce(p_spouse_secondary_value, '')), ''),
          -- 191: מי בחר/ה להעלות את צילום התעודה מאוחר יותר. ריק ⇒ המפתחות אינם נכתבים.
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
          representation_status = 'awaiting_accountant',
          updated_at      = now()
      where id = v_req.linked_client_id;

    -- 191: צילום נדחה ⇒ פריט העלאה בבקשת המסמכים; צילום שכבר הגיע ⇒ הפריט נסגר.
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
  text, text, text, text, text, integer, text, text, text, text[]) from public;
grant  execute on function public.submit_onboarding_full(
  text, text, text, text, text, text, text, text, text, text, text, text, integer,
  text, text, text, text, text, integer, text, text, text, text[]) to anon, authenticated, service_role;

-- ── ⑥ שומר הקבועים — שני ה-RPC הציבוריים החדשים ברשימת ההיתר ─────────────
-- הגוף זהה ל-165; רק v_anon_ok גדלה.
create or replace function public.assert_domain_function_invariants()
returns text
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_def text;
  v_leak text;
  v_msgs text[] := '{}';
  v_anon_ok text[] := array[
    'get_quotation', 'mark_quotation_viewed', 'approve_quotation',
    'start_intake', 'save_intake_answer', 'get_intake', 'reopen_intake',
    'get_client_portal', 'portal_submit_step',
    'get_onboarding', 'submit_onboarding_full', 'submit_signature',
    'request_spouse_onboarding',
    'get_spouse_onboarding', 'submit_spouse_onboarding',
    'get_release_portal', 'release_portal_set_item', 'release_portal_respond',
    'release_portal_remove_upload', 'release_portal_mark_items',
    'get_participant_form', 'participant_submit_prerequisites',
    -- 191: שמירת שלב בטופס הקליטה ו«הקישור נפתח» — טוקן הקליטה בלבד
    'save_onboarding_step', 'touch_onboarding'
  ];
begin
  v_def := pg_get_functiondef('public.ensure_institution_alignment_steps(text,text,boolean)'::regprocedure);
  if v_def not ilike '%v_uid is not null and v_owner <> v_uid%' then
    v_msgs := array_append(v_msgs, 'ensure_institution_alignment_steps: לא הגרסה של 163');
  end if;

  v_def := pg_get_functiondef('public.approve_quotation(text,text,text)'::regprocedure);
  if v_def ilike '%exception when others%' or v_def not ilike '%approval_incomplete%' then
    v_msgs := array_append(v_msgs, 'approve_quotation: לא הגרסה של 161');
  end if;

  v_def := pg_get_functiondef('public.create_engagement_for_quotation(text,boolean)'::regprocedure);
  if v_def not ilike '%journey_incomplete%' then
    v_msgs := array_append(v_msgs, 'create_engagement_for_quotation: לא הגרסה של 163');
  end if;

  v_def := pg_get_functiondef('public.propose_tax_facts(text,text,text,jsonb)'::regprocedure);
  if v_def not ilike '%v_rows%' then
    v_msgs := array_append(v_msgs, 'propose_tax_facts: לא הגרסה של 162');
  end if;

  select string_agg(p.proname, ', ') into v_leak
    from pg_proc p
   where p.pronamespace = 'public'::regnamespace and p.prokind in ('f','p')
     and p.prorettype <> 'trigger'::regtype
     and has_function_privilege('anon', p.oid, 'EXECUTE')
     and not (p.proname = any(v_anon_ok));
  if v_leak is not null then
    v_msgs := array_append(v_msgs, 'פונקציות פתוחות ל-anon מחוץ לרשימה: ' || v_leak);
  end if;

  if has_function_privilege('authenticated', 'public.build_client_portal(text,text)', 'EXECUTE')
     or has_function_privilege('anon', 'public.build_client_portal(text,text)', 'EXECUTE') then
    v_msgs := array_append(v_msgs, 'build_client_portal פתוחה ל-anon/authenticated');
  end if;

  if not exists (select 1 from pg_event_trigger where evtname = 'p0_lock_new_functions' and evtenabled <> 'D') then
    v_msgs := array_append(v_msgs, 'event trigger p0_lock_new_functions חסר או מנוטרל');
  end if;

  if has_function_privilege('authenticated', 'public._apply_prerequisite_values(text,text,jsonb,text,text)', 'EXECUTE')
     or has_function_privilege('anon', 'public._apply_prerequisite_values(text,text,jsonb,text,text)', 'EXECUTE') then
    v_msgs := array_append(v_msgs, '_apply_prerequisite_values פתוחה ל-anon/authenticated');
  end if;

  if array_length(v_msgs, 1) > 0 then
    raise exception 'domain function invariants violated: %', array_to_string(v_msgs, ' | ');
  end if;
  return 'ok';
end;
$function$;

revoke execute on function public.assert_domain_function_invariants() from public, anon, authenticated;
grant  execute on function public.assert_domain_function_invariants() to authenticated, service_role;

select public.assert_domain_function_invariants();
