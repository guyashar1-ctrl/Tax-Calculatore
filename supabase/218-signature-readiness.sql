-- 218: טופס ייפוי כוח נשלח לחתימה רק כשהוא באמת מוכן לחתימה.
--
-- עד כאן prepare_request_for_signing (208) בדק רק שיש ב-signature_documents משהו. טופס
-- בלי מקום חתימה לאחד החותמים, עם מקום ששויך למי שאינו ברשימת החותמים (הוא לא מקבל
-- קישור — וב-signerCompletedAll חותם בלי שדות נחשב «סיים»), או בלי מקום לחתימה ולחותמת
-- של המשרד — היה יוצא ללקוח, והתקלה הייתה מתגלה רק אחרי חתימה.
--
-- ‼ אותם כללים בדיוק כמו src/features/representation/signatureReadiness.ts (שם הם מוצגים,
--   כאן הם נאכפים). שינוי באחד מחייב שינוי בשני. הבדיקה בדפדפן יודעת גם כמה עמודים
--   יש בקובץ; כאן נבדקים רק גבולות העמוד.
-- ‼ לא נוגע בבקשה שכבר נחתמה, לא משנה סטטוס, ולא מבטל קישור פעיל — רק מסרב לשלוח.
-- ‼ גוף prepare_request_for_signing כאן = הגוף החי בייצור (208) + השומר בלבד.

create or replace function public._rep_signature_problems(r public.representation_requests)
returns jsonb
language plpgsql
stable
set search_path to 'public'
as $function$
declare
  v_docs    jsonb := case when jsonb_typeof(r.signature_documents) = 'array' then r.signature_documents else '[]'::jsonb end;
  v_ids     text[];
  v_out     jsonb := '[]'::jsonb;
  d         jsonb;
  v_key     text;
  v_track   jsonb;
  v_owner   text;
  s         text;
begin
  -- חותם יחיד כשאין רשימה — כמו getRequestSigners.
  select coalesce(array_agg(x ->> 'id'), array['client'])
    into v_ids
    from jsonb_array_elements(case when jsonb_typeof(r.signers) = 'array' then r.signers else '[]'::jsonb end) x
   where coalesce(x ->> 'id', '') <> '';
  if v_ids is null or cardinality(v_ids) = 0 then v_ids := array['client']; end if;

  -- טופס שהגיע משע״ם ועוד אין לו מסמך חתימה (מקומות לא נוצרו).
  if jsonb_typeof(r.execution -> 'shaam') = 'object' then
    for v_key, v_track in select key, value from jsonb_each(r.execution -> 'shaam') loop
      if jsonb_typeof(v_track) <> 'object' or v_track ? 'replacement'
         or coalesce(v_track ->> 'formDocumentId', '') = '' then continue; end if;
      if not exists (select 1 from jsonb_array_elements(v_docs) x where x ->> 'key' = v_key) then
        v_out := v_out || jsonb_build_array(jsonb_build_object('code', 'not_prepared', 'docKey', v_key));
      end if;
    end loop;
  end if;

  for d in select value from jsonb_array_elements(v_docs) loop
    if coalesce(d ->> 'pdfDocId', '') = '' then
      v_out := v_out || jsonb_build_array(jsonb_build_object('code', 'no_pdf', 'docKey', d ->> 'key'));
      continue;
    end if;
    if not exists (select 1 from jsonb_array_elements(coalesce(d -> 'fields', '[]'::jsonb)) f
                    where f ->> 'kind' = 'signature' and (f ->> 'signerId') = any (v_ids)) then
      v_out := v_out || jsonb_build_array(jsonb_build_object('code', 'no_signer_field', 'docKey', d ->> 'key'));
    end if;
    v_owner := substring(d ->> 'key' from '^person:(client|spouse)$');
    if v_owner is not null and v_owner = any (v_ids)
       and not exists (select 1 from jsonb_array_elements(coalesce(d -> 'fields', '[]'::jsonb)) f
                        where f ->> 'kind' = 'signature' and f ->> 'signerId' = v_owner) then
      v_out := v_out || jsonb_build_array(jsonb_build_object('code', 'owner_without_field', 'docKey', d ->> 'key', 'signerId', v_owner));
    end if;
    if not exists (select 1 from jsonb_array_elements(coalesce(d -> 'fields', '[]'::jsonb)) f
                    where f ->> 'signerId' = 'accountant' and f ->> 'kind' in ('stamp', 'signature')) then
      v_out := v_out || jsonb_build_array(jsonb_build_object('code', 'no_office_field', 'docKey', d ->> 'key'));
    end if;
    v_out := v_out || coalesce((
      select jsonb_agg(distinct jsonb_build_object('code', 'unknown_signer', 'docKey', d ->> 'key', 'signerId', f ->> 'signerId'))
        from jsonb_array_elements(coalesce(d -> 'fields', '[]'::jsonb)) f
       where coalesce(f ->> 'signerId', '') not in ('accountant', 'static')
         and not ((f ->> 'signerId') = any (v_ids))
         and coalesce(f ->> 'kind', '') not in ('label', 'check', 'cross')), '[]'::jsonb);
    if exists (select 1 from jsonb_array_elements(coalesce(d -> 'fields', '[]'::jsonb)) f
                where coalesce((f ->> 'xPct')::numeric, -1) < -0.001
                   or coalesce((f ->> 'yPct')::numeric, -1) < -0.001
                   or coalesce((f ->> 'widthPct')::numeric, 0) <= 0
                   or coalesce((f ->> 'heightPct')::numeric, 0) <= 0
                   or (f ->> 'xPct')::numeric + (f ->> 'widthPct')::numeric > 1.001
                   or (f ->> 'yPct')::numeric + (f ->> 'heightPct')::numeric > 1.001
                   or coalesce((f ->> 'pageIndex')::numeric, -1) < 0) then
      v_out := v_out || jsonb_build_array(jsonb_build_object('code', 'out_of_page', 'docKey', d ->> 'key'));
    end if;
  end loop;

  foreach s in array v_ids loop
    if not exists (select 1 from jsonb_array_elements(v_docs) x, jsonb_array_elements(coalesce(x -> 'fields', '[]'::jsonb)) f
                    where f ->> 'kind' = 'signature' and f ->> 'signerId' = s) then
      v_out := v_out || jsonb_build_array(jsonb_build_object('code', 'signer_without_field', 'signerId', s));
    end if;
  end loop;
  return v_out;
end;
$function$;

revoke all on function public._rep_signature_problems(public.representation_requests) from public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.prepare_request_for_signing(p_request_id text, p_ask_unassigned boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  r        public.representation_requests%rowtype;
  c        public.clients%rowtype;
  v_uid    uuid := auth.uid();
  v_key    text;
  v_track  jsonb;
  v_person text;
  x        jsonb;
  v_items  jsonb := '[]'::jsonb;
  v_res    jsonb;
  v_up     text;
  v_status text;
  v_unassigned boolean := false;
  v_problems jsonb;
begin
  select * into r from public.representation_requests where id = p_request_id for update;
  if r.id is null then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  if v_uid is null or r.user_id <> v_uid then return jsonb_build_object('ok', false, 'reason', 'forbidden'); end if;
  if jsonb_array_length(coalesce(r.signature_documents, '[]'::jsonb)) = 0 then
    return jsonb_build_object('ok', false, 'reason', 'no_form');
  end if;
  -- ‼ 218 · טופס שחסר בו מקום חתימה / שיוך לחותם / מקום למשרד — לא יוצא ללקוח.
  -- רק לפני החתימה: בקשה שכבר נחתמה לא עוברת כאן ממילא, ולא נבדקת מחדש.
  if r.status in ('awaiting_accountant', 'pending_signature') then
    v_problems := public._rep_signature_problems(r);
    if jsonb_array_length(v_problems) > 0 then
      return jsonb_build_object('ok', false, 'reason', 'form_incomplete', 'problems', v_problems);
    end if;
  end if;
  select * into c from public.clients where id = r.linked_client_id;
  -- ‼ צילום תעודה בתיק שלא שויך לאף אדם: לא ידוע אם הוא של האדם הזה. בלי
  -- הכרעה של המשרד לא שולחים — אחרת «אין בתיק» היה מוצג והלקוח לא היה מתבקש
  -- לכלום. המשרד משייך אותו (ואז הלקוח מאשר), או מבקש מהלקוח צילום.
  if p_ask_unassigned then
    perform set_config('pivo.shaam_ask_unassigned', 'on', true);
  end if;

  -- ‼ הכול או כלום: עצירה על צילום לא משויך מבטלת גם בקשות שכבר נוצרו בלולאה
  -- (אחרת הלקוח היה רואה בדף האישי חצי ממה שלא נשלח).
  begin
  if jsonb_typeof(r.execution -> 'shaam') = 'object' then
    for v_key in select jsonb_object_keys(r.execution -> 'shaam') loop
      v_track := r.execution #> array['shaam', v_key];
      if v_track ? 'replacement' or nullif(v_track ->> 'requestNumber', '') is null then continue; end if;
      v_person := case when v_key = 'person:spouse' then 'spouse' else 'client' end;
      for x in select value from jsonb_array_elements(public.shaam_creation_requirements(v_track)) loop
        if x ->> 'kind' not in ('idOrLicense', 'idCard', 'idOrPassport', 'passport', 'driverLicense') then continue; end if;
        v_res := public.ensure_shaam_identity_confirm_step(r.id, v_person, x ->> 'kind', x ->> 'label');
        if v_res ->> 'action' = 'missing' then
          v_up := public.ensure_shaam_identity_document_request(c.id, v_person, x ->> 'kind', x ->> 'label');
          v_res := jsonb_build_object('action', case when v_up in ('requested', 'already_requested') then 'upload'
                                                     when v_up = 'ambiguous_materials' then 'ambiguous'
                                                     else v_up end);
          if v_up = 'ambiguous_materials' then v_unassigned := true; end if;
        end if;
        v_items := v_items || jsonb_build_array(jsonb_build_object(
          'submissionKey', v_key, 'person', v_person, 'kind', x ->> 'kind', 'label', x ->> 'label') || v_res);
      end loop;
    end loop;
  end if;
  if v_unassigned then
    raise exception 'pivo_unassigned_identity' using errcode = 'P0001';
  end if;
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'pivo_unassigned_identity' then raise; end if;
    return jsonb_build_object('ok', false, 'reason', 'unassigned_identity', 'documents', v_items);
  end;
  v_status := r.status;
  if r.status = 'awaiting_accountant' then
    update public.representation_requests set status = 'pending_signature', updated_at = now() where id = r.id;
    v_status := 'pending_signature';
  end if;
  return jsonb_build_object('ok', true, 'status', v_status, 'documents', v_items);
end;
$function$;

-- ════════════════════════════════════════════════════════════════════════════
-- 218 ב · מקומות החתימה נוצרים עם קבלת הטופס — לא כשמישהו פותח את מרכז הייצוג.
--
-- עד כאן ההכנה רצה בדפדפן, בפתיחת מרכז הייצוג (194). עכשיו:
--   1. העובד, מיד כשהטופס הגיע משע״ם, מריץ את בדיקת התבנית של האתר (דף ההמרה,
--      verifyForm2279Layout) ומחזיר result.formLayout = {ok, problems}.
--   2. הטריגר כאן שומר את formLayout במעקב ההגשה ומכין את מסמך החתימה בשרת.
--   3. כשהעובד לא בדק (ok=null / גרסה ישנה) — מרכז הייצוג בודק בדפדפן ושולח את התוצאה
--      ל-prepare_shaam_signature_documents. אותו בונה, אותה נעילה — בלי מסמך כפול.
-- ‼ שומרים: רק טופס שעבר את בדיקת התבנית; רק כשאין עדיין מסמך להגשה הזו; רק לפני
--   השליחה ללקוח. בקשה שכבר נשלחה ⇒ held_sent (לא מחליפים טופס שהלקוח מחזיק).
--   בקשה שנחתמה ⇒ לא נוגעים. כל תוצאה נרשמת ב-execution.shaam.<key>.formPreparation.
-- ‼ המיקומים = FORM_2279_TEMPLATE (shaamRepresentation.ts), והשיוך = buildForm2279Fields:
--   בעל/ת הטופס חותם/ת ב«בן זוג רשום»; בן/בת הזוג השני/ה — רק בטופס שנושא מס הכנסה
--   אצל זוג. בדיקת «218 · מקומות זהים» (signatureReadiness.test) שומרת שהמספרים זהים.
-- ════════════════════════════════════════════════════════════════════════════

create or replace function public._rep_build_2279_fields(p_registered text, p_both boolean)
returns jsonb
language sql
volatile
set search_path to 'public'
as $function$
  select jsonb_build_array(
      jsonb_build_object('id', 'f-shaam-sig-' || p_registered || '-' || substr(md5(random()::text), 1, 8),
        'signerId', p_registered, 'kind', 'signature', 'pageIndex', 0,
        'xPct', 0.3934938248867116, 'yPct', 0.5141197691937937, 'widthPct', 0.1487377943942933, 'heightPct', 0.03382656485562341))
    || case when p_both then jsonb_build_array(
      jsonb_build_object('id', 'f-shaam-sig-' || (case when p_registered = 'client' then 'spouse' else 'client' end) || '-' || substr(md5(random()::text), 1, 8),
        'signerId', case when p_registered = 'client' then 'spouse' else 'client' end, 'kind', 'signature', 'pageIndex', 0,
        'xPct', 0.13005731072135313, 'yPct', 0.5113501234488552, 'widthPct', 0.1487377943942933, 'heightPct', 0.03382656485562341))
      else '[]'::jsonb end
    || jsonb_build_array(
      jsonb_build_object('id', 'f-shaam-stamp-' || substr(md5(random()::text), 1, 8),
        'signerId', 'accountant', 'kind', 'stamp', 'pageIndex', 0,
        'xPct', 0.09886512564599877, 'yPct', 0.7129217899296978, 'widthPct', 0.22514095909038695, 'heightPct', 0.066606306884761),
      jsonb_build_object('id', 'f-shaam-check-sms-' || substr(md5(random()::text), 1, 8),
        'signerId', 'static', 'kind', 'check', 'pageIndex', 0,
        'xPct', 0.8738551401869159, 'yPct', 0.49810469314079425, 'widthPct', 0.035, 'heightPct', 0.025),
      jsonb_build_object('id', 'f-shaam-check-original-' || substr(md5(random()::text), 1, 8),
        'signerId', 'static', 'kind', 'check', 'pageIndex', 0,
        'xPct', 0.8703504672897197, 'yPct', 0.7246389891696752, 'widthPct', 0.035, 'heightPct', 0.025));
$function$;

revoke all on function public._rep_build_2279_fields(text, boolean) from public, anon, authenticated;

-- מכין את מסמך החתימה להגשה אחת. מחזיר את מה שקרה:
-- prepared | exists | no_form | unverified | layout_mismatch | held_sent | signed_untouched | unknown_key
create or replace function public._rep_prepare_signature_document(p_request_id text, p_key text)
returns text
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  r          public.representation_requests%rowtype;
  c          public.clients%rowtype;
  v_track    jsonb;
  v_layout   jsonb;
  v_person   text;
  v_married  boolean;
  v_systems  jsonb;
  v_it       boolean;
  v_label    text;
  v_name     text;
  v_doc      jsonb;
  v_docs     jsonb;
  v_now      text := to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
begin
  select * into r from public.representation_requests where id = p_request_id for update;
  if r.id is null then return 'no_form'; end if;
  v_track := r.execution #> array['shaam', p_key];
  if v_track is null or jsonb_typeof(v_track) <> 'object' or v_track ? 'replacement'
     or coalesce(v_track ->> 'formDocumentId', '') = '' then
    return 'no_form';
  end if;
  v_docs := case when jsonb_typeof(r.signature_documents) = 'array' then r.signature_documents else '[]'::jsonb end;
  -- ‼ אחת לכל הגשה: מסמך קיים (מהשרת, מהדפדפן או מסימון ידני) לא מוחלף כאן.
  if exists (select 1 from jsonb_array_elements(v_docs) x where x ->> 'key' = p_key) then return 'exists'; end if;
  if r.status not in ('awaiting_accountant', 'pending_signature') then return 'signed_untouched'; end if;
  if r.status = 'pending_signature' and coalesce(r.execution ->> 'signatureEmailSentAt', '') <> '' then
    update public.representation_requests
       set execution = jsonb_set(execution, array['shaam', p_key, 'formPreparation'],
                                 jsonb_build_object('state', 'held_sent', 'at', v_now))
     where id = r.id;
    return 'held_sent';
  end if;
  v_layout := v_track -> 'formLayout';
  if v_layout is null or jsonb_typeof(v_layout -> 'ok') is distinct from 'boolean' then return 'unverified'; end if;
  if not (v_layout ->> 'ok')::boolean then
    update public.representation_requests
       set execution = jsonb_set(execution, array['shaam', p_key, 'formPreparation'],
                                 jsonb_build_object('state', 'layout_mismatch', 'at', v_now,
                                   'problems', coalesce(v_layout -> 'problems', '[]'::jsonb)))
     where id = r.id;
    return 'layout_mismatch';
  end if;

  v_person := substring(p_key from '^person:(client|spouse)$');
  if v_person is null then return 'unknown_key'; end if;
  v_systems := v_track -> 'requestedSystems';
  select * into c from public.clients where id = r.linked_client_id;
  -- כמו hasRegisteredSpouseChoice: נשוי, או שיש שם בן/בת זוג בכרטיס.
  v_married := coalesce(c.family_status, '') = 'married' or coalesce(trim(c.spouse_name), '') <> '';
  if jsonb_typeof(v_systems) = 'array' then
    v_it := v_systems ? 'מס הכנסה';
  elsif jsonb_typeof(v_layout -> 'bothSign') = 'boolean' then
    -- ‼ בקשה מלפני 208 (בלי רשימת המערכים): הדפדפן גזר מי חותם מאותה הגשה (form2279BothSign).
    v_married := (v_layout ->> 'bothSign')::boolean;
    v_it := v_married;
  else
    -- בלי רשימת המערכים ובלי הכרעה מהדפדפן לא יודעים מי חותם — לא מנחשים.
    return 'unverified';
  end if;
  -- סדר הרשויות כמו REP_AUTHORITY_ORDER: מס הכנסה, ניכויים, מע"מ.
  select string_agg(l, ', ' order by o) into v_label from (values
      (1, 'מס הכנסה', v_systems ? 'מס הכנסה'),
      (2, 'ניכויים', v_systems ? 'ניכויים'),
      (3, 'מע"מ', v_systems ? 'מע"מ' or v_systems ? 'מעמ')) s(o, l, has)
   where has;
  v_name := case when v_person = 'spouse'
                 then coalesce(nullif(trim(coalesce(c.spouse_first_name, '') || ' ' || coalesce(c.spouse_last_name, '')), ''), nullif(trim(c.spouse_name), ''), 'בן/בת הזוג')
                 else nullif(trim(coalesce(c.first_name, '') || ' ' || coalesce(c.last_name, '')), '') end;
  v_doc := jsonb_build_object(
    'key', p_key,
    'title', coalesce(nullif(v_layout ->> 'title', ''),
                      case when v_married and v_name is not null then v_name || ' · ' || coalesce(v_label, '') else coalesce(v_label, 'ייפוי כוח') end),
    'pdfDocId', v_track ->> 'formDocumentId',
    'pdfFileName', coalesce(nullif(v_track ->> 'formFileName', ''), 'ייפוי כוח לחתימה.pdf'),
    'fields', public._rep_build_2279_fields(v_person, v_married and v_it),
    'createdAt', v_now,
    'signedPdfStoredId', null);
  update public.representation_requests
     set signature_documents = v_docs || jsonb_build_array(v_doc),
         -- ‼ שיקוף המסמך הראשון לשדות הישנים (withLegacyMirror) — get_onboarding/submit_signature קוראים אותם.
         signature_setup = case when jsonb_array_length(v_docs) = 0
                                then jsonb_build_object('pdfDocId', v_doc ->> 'pdfDocId', 'pdfFileName', v_doc ->> 'pdfFileName',
                                                        'fields', v_doc -> 'fields', 'createdAt', v_now)
                                else signature_setup end,
         execution = jsonb_set(execution, array['shaam', p_key, 'formPreparation'],
                               jsonb_build_object('state', 'prepared', 'at', v_now))
   where id = r.id;
  return 'prepared';
end;
$function$;

revoke all on function public._rep_prepare_signature_document(text, text) from public, anon, authenticated;

-- ── 1. מהעובד: הטופס הגיע (create_representation הצליח) ⇒ formLayout נשמר, וההכנה רצה ──
-- ‼ השם בכוונה אחרי trg_sync_shaam_representation_from_job (208): טריגרים באותו אירוע רצים
--   לפי סדר השם, וזה צריך את המעקב שהוא כתב (formDocumentId, requestedSystems).
create or replace function public.sync_shaam_signature_places_from_job()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_key    text;
  v_req_id text;
begin
  if new.action_type <> 'shaam.create_representation'
     or coalesce(new.result ->> 'formDocumentId', '') = '' then
    return new;
  end if;
  v_key := coalesce(new.result ->> 'submissionKey', new.input ->> 'submissionKey');
  if coalesce(v_key, '') = '' then return new; end if;
  select representation_request_id into v_req_id from public.clients where id = new.client_id;
  if v_req_id is null then return new; end if;
  if jsonb_typeof(new.result -> 'formLayout') = 'object' then
    update public.representation_requests
       set execution = jsonb_set(execution, array['shaam', v_key, 'formLayout'],
                                 (new.result -> 'formLayout') || jsonb_build_object('at', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')))
     where id = v_req_id
       and execution #>> array['shaam', v_key, 'formDocumentId'] = new.result ->> 'formDocumentId';
  end if;
  perform public._rep_prepare_signature_document(v_req_id, v_key);
  return new;
exception when others then
  -- ‼ הכנת מקומות לעולם לא מפילה את רישום תוצאת המשימה. המשרד יראה «הטופס הגיע» ויכין.
  raise warning '218 sync_shaam_signature_places_from_job: %', sqlerrm;
  return new;
end;
$function$;

drop trigger if exists trg_sync_shaam_signature_places_from_job on public.automation_jobs;
create trigger trg_sync_shaam_signature_places_from_job
  after update on public.automation_jobs
  for each row when (new.status = 'succeeded' and old.status is distinct from new.status)
  execute function public.sync_shaam_signature_places_from_job();

revoke all on function public.sync_shaam_signature_places_from_job() from public, anon, authenticated;

-- ── 2. מהמשרד: כשהעובד לא בדק (ok=null / גרסה ישנה) — הדפדפן בודק ושולח, והשרת בונה ──
-- p_layouts: {"person:client": {"ok": true, "problems": []}, …} — רק להגשות שאין להן בדיקה.
-- ‼ גם «נסה שוב»: קריאה בלי p_layouts מריצה את ההכנה לכל הגשה שיש לה בדיקה ואין לה מסמך.
create or replace function public.prepare_shaam_signature_documents(p_request_id text, p_layouts jsonb default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  r       public.representation_requests%rowtype;
  v_uid   uuid := auth.uid();
  v_key   text;
  v_l     jsonb;
  v_out   jsonb := '{}'::jsonb;
begin
  select * into r from public.representation_requests where id = p_request_id;
  if r.id is null then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  if v_uid is null or r.user_id <> v_uid then return jsonb_build_object('ok', false, 'reason', 'forbidden'); end if;
  if jsonb_typeof(r.execution -> 'shaam') is distinct from 'object' then return jsonb_build_object('ok', true, 'results', v_out); end if;
  for v_key in select jsonb_object_keys(r.execution -> 'shaam') loop
    v_l := case when jsonb_typeof(p_layouts) = 'object' then p_layouts -> v_key end;
    -- בדיקה מהדפדפן נרשמת רק כשאין בדיקה מהעובד — העובד ראה את הקובץ ברגע שהגיע.
    if jsonb_typeof(v_l -> 'ok') = 'boolean'
       and jsonb_typeof(r.execution #> array['shaam', v_key, 'formLayout', 'ok']) is distinct from 'boolean' then
      update public.representation_requests
         set execution = jsonb_set(execution, array['shaam', v_key, 'formLayout'],
                                   jsonb_build_object('ok', (v_l ->> 'ok')::boolean,
                                     'problems', coalesce(v_l -> 'problems', '[]'::jsonb), 'by', 'office_browser',
                                     'bothSign', v_l -> 'bothSign', 'title', v_l -> 'title',
                                     'at', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')))
       where id = r.id and jsonb_typeof(execution #> array['shaam', v_key]) = 'object';
    end if;
    v_out := v_out || jsonb_build_object(v_key, public._rep_prepare_signature_document(r.id, v_key));
  end loop;
  return jsonb_build_object('ok', true, 'results', v_out);
end;
$function$;

revoke all on function public.prepare_shaam_signature_documents(text, jsonb) from public, anon;
grant execute on function public.prepare_shaam_signature_documents(text, jsonb) to authenticated;
