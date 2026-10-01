-- ═══════════════════════════════════════════════════════════════════════════
-- 208 · מסמכי שע״ם לפני החתימה · הסרת רשות לפני השליחה · מקור ה-PDF
-- ═══════════════════════════════════════════════════════════════════════════
--  ‼ 28.09.2026 · הריצה החיה הראשונה (עידן רוקח, בקשה 2026544926): שע״ם אמרה
--  ביצירה «בהמשך תתבקש לצרף: טופס ייפוי כוח חתום. צילום תעודת הזהות או רישיון
--  נהיגה של הלקוח» — ו-PIVO שמרה את זה רק כטקסט. מכאן:
--   · הדרישות נשמרות מהיצירה (creationAttach) ומוצגות לפני השליחה לחתימה.
--   · «שלח ללקוח» מצרף ללקוח: בקשת העלאה (אין בתיק) או «אשר שזה המסמך שלך /
--     החלף» (יש בתיק). קיום קובץ אינו אישור לקוח.
--   · לשע״ם עולה רק מסמך שהלקוח אישר (או העלה בעצמו לבקשה של שע״ם).
--   · «שלח ללקוח» מעביר ל«ממתין לחתימה» — טופס שהגיע משע״ם לא הזיז את המצב,
--     ודף החתימה דחה את הלקוח.
--   · «הסר מהבקשה» לפני השליחה: מרשם + היקף + מסמך החתימה; בקשה שכבר נפתחה
--     בשע״ם מסומנת להחלפה (שע״ם מבטלת רק את כולה לפני קבלת המסמכים — מהקוד
--     שלה: «הבקשה תבוטל לכל התיקים שהזנת מכיוון שהמסמכים עוד לא התקבלו»).
--   · execution.shaam שייך לשרת (כתיבה של הדפדפן לא דורסת אותו).
--  הבסיס של כל פונקציה קיימת: הגוף החי בפרודקשן (== staging), 28.09.2026.



-- ── ① מקור ה-PDF: איזה מסמכים הוא נבנה מהם ─────────────────────────────────
-- ‼ PDF שנוצר מתמונה (או משני צדדים של תעודה) נשמר לצד המקור, לא במקומו.
alter table public.documents add column if not exists source_document_ids text[];

-- ── ③ דרישות המסמכים מרגע יצירת הבקשה בשע״ם ──────────────────────────────────
--  מקור: creationAttach (הרשימה שהעובד קרא מ«לידיעתך,») ובהיעדרה — הטקסט
--  שנשמר (205, creationNotice): מה שבין «בהמשך תתבקש לצרף:» ל«נא לוודא».
--  מחזיר [{label, kind}] — kind: poa / idOrLicense / idCard / passport / … / other.
create or replace function public.shaam_creation_requirements(p_track jsonb)
returns jsonb
language plpgsql
immutable
set search_path to 'public'
as $function$
declare
  v_items text[];
  v_text  text;
  v_out   jsonb := '[]'::jsonb;
  v_label text;
begin
  if jsonb_typeof(p_track -> 'creationAttach') = 'array' then
    select array_agg(trim(x)) into v_items from jsonb_array_elements_text(p_track -> 'creationAttach') x;
  else
    v_text := coalesce(p_track #>> '{creationNotice,text}', '');
    v_text := substring(regexp_replace(v_text, '\s+', ' ', 'g') from 'בהמשך תתבקש לצרף:?\s*(.*?)\s*נא לוודא');
    if v_text is null then return v_out; end if;
    select array_agg(trim(x)) into v_items
      from regexp_split_to_table(v_text, '\.\s*') x where trim(x) <> '';
  end if;
  foreach v_label in array coalesce(v_items, '{}') loop
    v_label := regexp_replace(v_label, '\.\s*$', '');
    if v_label = '' then continue; end if;
    v_out := v_out || jsonb_build_array(jsonb_build_object(
      'label', v_label,
      'kind', case when v_label ~ 'ייפוי\s*(ה)?כוח' then 'poa'
                   else coalesce(public.shaam_identity_doc_kind(v_label), 'other') end));
  end loop;
  return v_out;
end;
$function$;

-- ── ④ המסמכים המזהים שהלקוח אישר (או העלה בעצמו לבקשה של שע״ם) ─────────────
create or replace function public.shaam_confirmed_identity_documents_for(p_client_id text, p_person text, p_kind text)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  r       public.representation_requests;
  v_kinds text[] := public.shaam_doc_kinds_accepted(p_kind);
  v_kind  text;
  v_docs  jsonb;
begin
  if p_person not in ('client', 'spouse') or v_kinds is null then
    return jsonb_build_object('missing', true, 'reason', 'unsupported');
  end if;
  r := public.representation_request_for_client(p_client_id);
  if r.id is null then return jsonb_build_object('missing', true, 'reason', 'no_request'); end if;
  foreach v_kind in array v_kinds loop
    select jsonb_agg(jsonb_build_object(
             'documentId', d.id, 'fileName', d.file_name, 'fileType', d.file_type,
             'storagePath', d.storage_path, 'at', e.value ->> 'at',
             'clientConfirmedAt', e.value ->> 'clientConfirmedAt') order by e.ord)
      into v_docs
      from jsonb_array_elements(
             case when jsonb_typeof(r.identity_docs -> p_person) = 'array' then r.identity_docs -> p_person else '[]'::jsonb end
           ) with ordinality e(value, ord)
      join public.documents d
        on d.id = e.value ->> 'documentId' and d.client_id = p_client_id and d.user_id = r.user_id
     where coalesce(nullif(e.value ->> 'docKind', ''), 'idCard') = v_kind
       and nullif(e.value ->> 'clientConfirmedAt', '') is not null;
    if v_docs is not null and jsonb_array_length(v_docs) > 0 then
      return jsonb_build_object('person', p_person, 'docKind', v_kind, 'documents', v_docs);
    end if;
  end loop;
  return jsonb_build_object('missing', true, 'reason', 'not_confirmed');
end;
$function$;

-- ── ⑤ «זה המסמך שלי» / הוחלף — רישום אישור הלקוח וסגירת הבקשה ──────────────
--  p_via: 'client_confirmed' (לחץ «זה הצילום שלי») · 'client_uploaded' (העלה אחר).
create or replace function public._shaam_identity_confirm(p_step_id text, p_via text, p_new_document_id text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  s        public.onboarding_steps%rowtype;
  r        public.representation_requests%rowtype;
  v_info   jsonb;
  v_person text;
  v_ids    text[];
  v_arr    jsonb;
  v_now    text := to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"');
  v_reqs   jsonb;
  v_name   text;
  v_cat    text;
  v_client_name text;
begin
  select * into s from public.onboarding_steps where id = p_step_id for update;
  if s.id is null or not (s.payload ? 'shaamIdentity') then return jsonb_build_object('ok', false, 'error', 'step_not_found'); end if;
  if s.status in ('completed','verified','skipped','cancelled') then return jsonb_build_object('ok', true, 'noop', true); end if;
  v_info := s.payload -> 'shaamIdentity';
  v_person := v_info ->> 'person';
  select * into r from public.representation_requests where id = v_info ->> 'requestId' for update;
  if r.id is null or r.linked_client_id <> s.client_id then return jsonb_build_object('ok', false, 'error', 'request_not_found'); end if;
  v_arr := case when jsonb_typeof(r.identity_docs -> v_person) = 'array' then r.identity_docs -> v_person else '[]'::jsonb end;

  if p_new_document_id is not null then
    -- צילום חדש מהלקוח: קטגוריה של תעודה, ורישום על האדם — מאושר כבר בהעלאה.
    select file_name, category into v_name, v_cat from public.documents
     where id = p_new_document_id and client_id = s.client_id;
    if v_name is null then return jsonb_build_object('ok', false, 'error', 'document_not_found'); end if;
    if coalesce(v_cat, 'other') not in ('id_card', 'drivers_license', 'passport') then
      update public.documents set category = 'id_card' where id = p_new_document_id;
    end if;
    if not exists (select 1 from jsonb_array_elements(v_arr) e where e ->> 'documentId' = p_new_document_id) then
      v_arr := v_arr || jsonb_build_array(jsonb_build_object(
        'documentId', p_new_document_id,
        'docKind', case when coalesce(v_info ->> 'kind', '') = 'passport' then 'passport' else 'idCard' end,
        'fileName', v_name, 'at', v_now, 'via', 'client_replacement', 'clientConfirmedAt', v_now));
    end if;
    v_ids := array[p_new_document_id];
  else
    select array_agg(x) into v_ids from jsonb_array_elements_text(coalesce(v_info -> 'documentIds', '[]'::jsonb)) x;
    select coalesce(jsonb_agg(case when e ->> 'documentId' = any(coalesce(v_ids, '{}'))
                                   then e || jsonb_build_object('clientConfirmedAt', v_now) else e end order by ord), '[]'::jsonb)
      into v_arr
      from jsonb_array_elements(v_arr) with ordinality t(e, ord);
  end if;

  update public.representation_requests
     set identity_docs = jsonb_set(coalesce(identity_docs, '{}'::jsonb), array[v_person], v_arr, true)
   where id = r.id;

  select coalesce(jsonb_agg(case when x ->> 'key' = 'identity_confirm'
                                 then x || jsonb_build_object('done', true,
                                        'value', case when p_via = 'client_uploaded' then 'הוחלף בצילום חדש' else 'אושר' end,
                                        'doneAt', v_now)
                                 else x end order by ord), '[]'::jsonb)
    into v_reqs
    from jsonb_array_elements(coalesce(s.payload -> 'requirements', '[]'::jsonb)) with ordinality t(x, ord);

  update public.onboarding_steps
     set status = 'completed', ball = 'me', completion_method = 'system', completed_at = now(), needs_attention = false,
         payload = payload || jsonb_build_object('requirements', v_reqs,
                     'shaamIdentity', v_info || jsonb_build_object('confirmedAt', v_now, 'confirmedVia', p_via,
                                                                  'confirmedDocumentIds', to_jsonb(coalesce(v_ids, '{}'))))
   where id = s.id;

  perform public.log_onboarding_event(s.user_id, s.id, s.engagement_id, 'status_changed', 'client',
    case when p_via = 'client_uploaded' then 'הלקוח העלה צילום תעודה חדש לרשות המסים'
         else 'הלקוח אישר שצילום התעודה שבתיק הוא שלו' end,
    jsonb_build_object('to', 'completed', 'via', p_via, 'documentIds', to_jsonb(coalesce(v_ids, '{}'))));

  select nullif(trim(coalesce(first_name,'') || ' ' || coalesce(last_name,'')), '') into v_client_name
    from public.clients where id = s.client_id;
  perform public.queue_accountant_notification(
    s.user_id, 'client_request_completed', s.client_id, s.id, null, null,
    jsonb_build_object('clientName', v_client_name,
      'requestTitle', coalesce(nullif(s.payload->>'clientTitle',''), 'צילום תעודה לרשות המסים'),
      'lastItem', case when p_via = 'client_uploaded' then 'הלקוח העלה צילום חדש' else 'הלקוח אישר את הצילום שבתיק' end));
  return jsonb_build_object('ok', true, 'completed', true);
end;
$function$;

--  העלאה לפריט «צילום אחר במקומו» ⇒ אותו רישום, דרך portal-upload-document.
create or replace function public.shaam_identity_confirm_step_trg()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_doc text;
begin
  if new.step_type <> 'custom_request' or not (new.payload ? 'shaamIdentity') then return new; end if;
  if new.status in ('completed','verified','skipped','cancelled') then return new; end if;
  select nullif(x ->> 'documentId', '') into v_doc
    from jsonb_array_elements(coalesce(new.payload -> 'requirements', '[]'::jsonb)) x
   where x ->> 'key' = 'identity_replacement' limit 1;
  if v_doc is null then return new; end if;
  perform public._shaam_identity_confirm(new.id, 'client_uploaded', v_doc);
  return new;
end;
$function$;

drop trigger if exists trg_shaam_identity_confirm_step on public.onboarding_steps;
create trigger trg_shaam_identity_confirm_step
  after update of payload on public.onboarding_steps
  for each row
  when (new.step_type = 'custom_request' and new.payload ? 'shaamIdentity')
  execute function public.shaam_identity_confirm_step_trg();

-- ── ⑥ בקשת «אשר שזה המסמך שלך» — אחת לכל אדם וסוג, בלי כפילות ──────────────
create or replace function public.ensure_shaam_identity_confirm_step(p_request_id text, p_person text, p_kind text, p_label text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  r        public.representation_requests%rowtype;
  c        public.clients%rowtype;
  s        public.onboarding_steps%rowtype;
  v_sel    jsonb;
  v_conf   jsonb;
  v_ids    jsonb;
  v_res    jsonb;
  v_key    text;
  v_name   text;
  v_payload jsonb;
  v_eng    text;
  v_sort   int;
  v_stage  text;
begin
  select * into r from public.representation_requests where id = p_request_id;
  if r.id is null then return jsonb_build_object('action', 'none', 'reason', 'no_request'); end if;
  select * into c from public.clients where id = r.linked_client_id;
  v_sel := public.shaam_identity_documents_for(c.id, p_person, p_kind);
  if coalesce((v_sel ->> 'missing')::boolean, false) then return jsonb_build_object('action', 'missing'); end if;
  v_conf := public.shaam_confirmed_identity_documents_for(c.id, p_person, p_kind);
  if not coalesce((v_conf ->> 'missing')::boolean, false) then return jsonb_build_object('action', 'confirmed'); end if;

  v_key := r.id || ':' || p_person || ':' || p_kind;
  select jsonb_agg(x -> 'documentId' order by ord) into v_ids
    from jsonb_array_elements(v_sel -> 'documents') with ordinality t(x, ord);
  select jsonb_agg(jsonb_build_object('key', 'doc_' || ord, 'source', 'client',
           'documentId', x ->> 'documentId', 'fileName', x ->> 'fileName',
           'label', case when jsonb_array_length(v_sel -> 'documents') > 1 then 'הצילום שבתיק (' || ord || ')' else 'הצילום שבתיק' end)
           order by ord)
    into v_res
    from jsonb_array_elements(v_sel -> 'documents') with ordinality t(x, ord);

  select * into s from public.onboarding_steps
   where client_id = c.id and step_type = 'custom_request' and payload #>> '{shaamIdentity,key}' = v_key
     and status not in ('completed','verified','skipped','cancelled')
   order by created_at desc limit 1;
  if s.id is not null then
    -- פתוחה כבר: מעדכנים את הצילומים שהיא מציגה אם השתנו (המשרד צירף אחר).
    if (s.payload #> '{shaamIdentity,documentIds}') is distinct from v_ids then
      update public.onboarding_steps
         set payload = payload || jsonb_build_object('clientResources', v_res,
                         'shaamIdentity', (payload -> 'shaamIdentity') || jsonb_build_object('documentIds', v_ids)),
             updated_at = now()
       where id = s.id;
    end if;
    return jsonb_build_object('action', 'confirm', 'stepId', s.id, 'existing', true);
  end if;

  v_name := case when p_person = 'spouse'
                 then coalesce(nullif(trim(coalesce(c.spouse_first_name, '') || ' ' || coalesce(c.spouse_last_name, '')), ''), 'בן/בת הזוג')
                 else nullif(trim(coalesce(c.first_name, '') || ' ' || coalesce(c.last_name, '')), '') end;
  v_payload := jsonb_build_object(
    'shaamIdentity', jsonb_build_object('key', v_key, 'requestId', r.id, 'person', p_person, 'kind', p_kind,
                                        'label', p_label, 'documentIds', v_ids),
    'requiredBy', 'shaam',
    'clientTitle', 'צילום תעודה לרשות המסים' || case when p_person = 'spouse' then ' - ' || v_name else '' end,
    -- ‼ ללקוח — שם הסוג, לא הנוסח של שע״ם («… של הלקוח» בגוף שלישי).
    'clientSub', 'רשות המסים דורשת '
                 || case p_kind when 'passport' then 'צילום דרכון' when 'idOrPassport' then 'צילום תעודת זהות או דרכון'
                                when 'driverLicense' then 'צילום רישיון נהיגה' when 'idCard' then 'צילום תעודת זהות'
                                else 'צילום תעודת זהות או רישיון נהיגה' end
                 || case when p_person = 'spouse' then ' של ' || v_name else '' end
                 || ' כדי להשלים את הייצוג. '
                 || case when jsonb_array_length(v_sel -> 'documents') > 1
                         then 'אלה הצילומים שיש לנו בתיק - אשרו שהם '
                         else 'זה הצילום שיש לנו בתיק - אשרו שהוא ' end
                 || case when p_person = 'spouse' then 'של ' || v_name else 'שלכם' end || ', או העלו צילום אחר.',
    'clientResources', v_res,
    'requirements', jsonb_build_array(
      jsonb_build_object('key', 'identity_confirm', 'kind', 'confirm', 'label', 'זה הצילום הנכון', 'required', true),
      jsonb_build_object('key', 'identity_replacement', 'kind', 'file', 'label', 'צילום אחר במקומו', 'required', false)));

  select id into v_eng from public.engagements where client_id = c.id order by created_at desc limit 1;
  select coalesce(max(sort_order), 0) + 10 into v_sort
    from public.onboarding_steps where client_id = c.id and status <> 'cancelled';
  v_stage := public.derive_lifecycle_stage(c.id);
  insert into public.onboarding_steps
    (user_id, engagement_id, client_id, required_for_close, step_type, track, scope,
     status, ball, sort_order, payload, published_at)
  values
    (c.user_id, v_eng, c.id, false, 'custom_request', 'tools', 'person',
     'pending', 'client', v_sort,
     v_payload || case when v_stage in ('lead', 'quoted') then jsonb_build_object('published', false, 'heldUntilApproval', true) else '{}'::jsonb end,
     case when v_stage in ('lead', 'quoted') then null else now() end)
  returning * into s;
  perform public.log_onboarding_event(c.user_id, s.id, v_eng, 'created', 'system',
    'רשות המסים דורשת ' || coalesce(nullif(p_label, ''), 'צילום תעודה') || ' - הלקוח מתבקש לאשר את הצילום שבתיק',
    jsonb_build_object('source', 'shaam', 'requestId', r.id, 'person', p_person, 'documentIds', v_ids));
  return jsonb_build_object('action', 'confirm', 'stepId', s.id, 'existing', false);
end;
$function$;

-- ── ⑧ «שלח ללקוח» — מה שנשלח יחד עם בקשת החתימה ─────────────────────────────
--  ‼ לכל הגשה לשע״ם: כל מסמך מזהה ששע״ם דרשה ביצירה ⇒ אושר / בקשת אישור (יש
--  בתיק) / בקשת העלאה (אין). ‼ וגם: הבקשה עוברת ל«ממתין לחתימה» — בלי זה דף
--  החתימה דוחה את הלקוח (טופס שהגיע משע״ם לא הזיז את המצב).
drop function if exists public.prepare_request_for_signing(text);
create or replace function public.prepare_request_for_signing(p_request_id text, p_ask_unassigned boolean default false)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
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
begin
  select * into r from public.representation_requests where id = p_request_id for update;
  if r.id is null then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  if v_uid is null or r.user_id <> v_uid then return jsonb_build_object('ok', false, 'reason', 'forbidden'); end if;
  if jsonb_array_length(coalesce(r.signature_documents, '[]'::jsonb)) = 0 then
    return jsonb_build_object('ok', false, 'reason', 'no_form');
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

-- ── ⑧ב אחרי השליחה: צילום שנוסף בתיק (צירוף משרד) ⇒ בקשת אישור מהלקוח ────────
--  ‼ לפני השליחה — prepare עושה את זה ברגע השליחה. אחריה אין רגע כזה, ובלי זה
--  צילום שהמשרד צירף סגר את בקשת ההעלאה והלקוח לא נשאל כלום.
create or replace function public._shaam_confirm_steps_after_send(p_request_id text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  r        public.representation_requests%rowtype;
  v_key    text;
  v_track  jsonb;
  x        jsonb;
begin
  select * into r from public.representation_requests where id = p_request_id;
  if r.id is null then return; end if;
  if nullif(r.execution ->> 'signatureEmailSentAt', '') is null
     and r.status not in ('pending_signature', 'awaiting_stamp', 'awaiting_authorities') then
    return;
  end if;
  if jsonb_typeof(r.execution -> 'shaam') <> 'object' then return; end if;
  for v_key in select jsonb_object_keys(r.execution -> 'shaam') loop
    v_track := r.execution #> array['shaam', v_key];
    if v_track ? 'replacement' or nullif(v_track ->> 'requestNumber', '') is null
       or nullif(v_track ->> 'submittedAt', '') is not null then continue; end if;
    for x in select value from jsonb_array_elements(public.shaam_creation_requirements(v_track)) loop
      if x ->> 'kind' not in ('idOrLicense', 'idCard', 'idOrPassport', 'passport', 'driverLicense') then continue; end if;
      perform public.ensure_shaam_identity_confirm_step(r.id,
        case when v_key = 'person:spouse' then 'spouse' else 'client' end, x ->> 'kind', x ->> 'label');
    end loop;
  end loop;
end;
$function$;

-- ── ⑧ג מה הלקוח יתבקש לעשות מעבר לחתימה — בלי תופעות לוואי ────────────────────
--  ‼ מקור אחד למייל החתימה ולתצוגה המקדימה שלו: התצוגה נפתחת לפני «שלח ללקוח»,
--  כשהבקשות בדף האישי עוד לא נוצרו — ולכן נגזר מהדרישות ומהתיק, לא מהשלבים.
create or replace function public.shaam_presign_client_actions(p_request_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  r        public.representation_requests%rowtype;
  c        public.clients%rowtype;
  v_key    text;
  v_track  jsonb;
  v_person text;
  v_name   text;
  x        jsonb;
  v_out    jsonb := '[]'::jsonb;
begin
  select * into r from public.representation_requests where id = p_request_id;
  if r.id is null or jsonb_typeof(r.execution -> 'shaam') is distinct from 'object' then return v_out; end if;
  select * into c from public.clients where id = r.linked_client_id;
  if c.id is null then return v_out; end if;
  for v_key in select jsonb_object_keys(r.execution -> 'shaam') loop
    v_track := r.execution #> array['shaam', v_key];
    if v_track ? 'replacement' or nullif(v_track ->> 'requestNumber', '') is null
       or nullif(v_track ->> 'submittedAt', '') is not null then continue; end if;
    v_person := case when v_key = 'person:spouse' then 'spouse' else 'client' end;
    v_name := case when v_person = 'spouse'
                   then coalesce(nullif(trim(coalesce(c.spouse_first_name, '') || ' ' || coalesce(c.spouse_last_name, '')), ''), 'בן/בת הזוג')
                   else coalesce(nullif(trim(coalesce(c.first_name, '') || ' ' || coalesce(c.last_name, '')), ''), '') end;
    for x in select value from jsonb_array_elements(public.shaam_creation_requirements(v_track)) loop
      if x ->> 'kind' not in ('idOrLicense', 'idCard', 'idOrPassport', 'passport', 'driverLicense') then continue; end if;
      if not coalesce((public.shaam_confirmed_identity_documents_for(c.id, v_person, x ->> 'kind') ->> 'missing')::boolean, false) then
        continue;
      end if;
      v_out := v_out || jsonb_build_array(jsonb_build_object(
        'person', v_person, 'personName', v_name, 'label', x ->> 'label',
        'action', case when coalesce((public.shaam_identity_documents_for(c.id, v_person, x ->> 'kind') ->> 'missing')::boolean, false)
                       then 'upload' else 'confirm' end));
    end loop;
  end loop;
  return v_out;
end;
$function$;

-- ── ⑨ «הסר מהבקשה» לפני השליחה לחתימה ─────────────────────────────────────────
--  ‼ מה שמשתנה: המרשם בכרטיס, היקף הבקשה, ומסמך החתימה של כל טופס שכולל את
--  הרשות (נמחק מהחתימה — אין שליחה של הגרסה הישנה). כשהבקשה כבר קיימת בשע״ם:
--  שע״ם מבטלת לפני קבלת המסמכים רק את כל הבקשה ⇒ המעקב מסומן «להחלפה»,
--  והטופס הישן יוצא מהמעקב. ‼ לא נוגע בשע״ם.
create or replace function public.remove_authority_before_signing(p_request_id text, p_authority text, p_person text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  r        public.representation_requests%rowtype;
  c        public.clients%rowtype;
  v_uid    uuid := auth.uid();
  v_scope  jsonb;
  v_entry  jsonb;
  v_targets jsonb;
  v_whole  boolean;
  v_left   int;
  v_label  text;
  v_key    text;
  v_track  jsonb;
  v_sys    jsonb;
  v_hits   boolean;
  v_docs   jsonb;
  v_affected text[] := '{}';
  v_replace text[] := '{}';
  v_now    text := to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"');
  v_step   text;
begin
  if p_authority not in ('incomeTax', 'vat', 'withholding') then return jsonb_build_object('ok', false, 'reason', 'bad_authority'); end if;
  select * into r from public.representation_requests where id = p_request_id for update;
  if r.id is null then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  if v_uid is null or r.user_id <> v_uid then return jsonb_build_object('ok', false, 'reason', 'forbidden'); end if;
  -- ‼ אחרי שהטופס יצא לחתימה — לא כאן (זה כבר שינוי של מה שהלקוח חתם עליו).
  if nullif(r.execution ->> 'signatureEmailSentAt', '') is not null
     or r.status in ('awaiting_stamp', 'awaiting_authorities', 'active')
     or exists (select 1 from jsonb_array_elements(coalesce(r.signers, '[]'::jsonb)) s where s ->> 'signStatus' = 'signed') then
    return jsonb_build_object('ok', false, 'reason', 'already_sent');
  end if;
  select * into c from public.clients where id = r.linked_client_id for update;
  -- ‼ יצירה בשע״ם שרצה עכשיו תחזיר את המערכים הישנים — קודם שתסתיים.
  if exists (select 1 from public.automation_jobs j
              where j.client_id = c.id and j.action_type = 'shaam.create_representation'
                and j.status in ('queued', 'running')) then
    return jsonb_build_object('ok', false, 'reason', 'automation_running');
  end if;

  v_scope := coalesce(r.scope, c.authority_representations, '{}'::jsonb);
  v_entry := v_scope -> p_authority;
  if v_entry is null or v_entry ->> 'status' = 'none' then return jsonb_build_object('ok', false, 'reason', 'not_requested'); end if;
  if v_entry ->> 'status' = 'active' then return jsonb_build_object('ok', false, 'reason', 'already_active'); end if;
  v_targets := case when jsonb_typeof(v_entry -> 'targets') = 'array' then v_entry -> 'targets' end;
  v_whole := p_authority = 'incomeTax' or p_person is null or v_targets is null
             or not (v_targets ? p_person) or jsonb_array_length(v_targets) <= 1;
  if v_whole then
    select count(*) into v_left from jsonb_object_keys(v_scope) k
     where k in ('incomeTax', 'vat', 'withholding') and k <> p_authority and v_scope -> k ->> 'status' <> 'none';
    if v_left = 0 then return jsonb_build_object('ok', false, 'reason', 'last_authority'); end if;
  end if;

  -- המרשם בכרטיס + היקף הבקשה.
  if v_whole then
    update public.clients set authority_representations = coalesce(authority_representations, '{}'::jsonb) - p_authority, updated_at = now()
     where id = c.id;
    update public.representation_requests
       set scope = case when scope is null then null else scope - p_authority end,
           authorities = array_remove(authorities, p_authority)
     where id = r.id;
  else
    update public.clients
       set authority_representations = jsonb_set(authority_representations, array[p_authority, 'targets'],
             coalesce((select jsonb_agg(t) from jsonb_array_elements(authority_representations -> p_authority -> 'targets') t
                        where t #>> '{}' <> p_person), '[]'::jsonb)),
           updated_at = now()
     where id = c.id and authority_representations ? p_authority;
    update public.representation_requests
       set scope = case when scope is null or not (scope ? p_authority) then scope
                        else jsonb_set(scope, array[p_authority, 'targets'],
                               coalesce((select jsonb_agg(t) from jsonb_array_elements(scope -> p_authority -> 'targets') t
                                          where t #>> '{}' <> p_person), '[]'::jsonb)) end
     where id = r.id;
  end if;
  select * into r from public.representation_requests where id = r.id;

  -- הטפסים שכוללים את הרשות: מסמך החתימה שלהם יוצא, והמעקב בשע״ם — להחלפה.
  v_label := case p_authority when 'incomeTax' then 'מס הכנסה' when 'vat' then 'מע"מ' else 'ניכויים' end;
  if jsonb_typeof(r.execution -> 'shaam') = 'object' then
    for v_key in select jsonb_object_keys(r.execution -> 'shaam') loop
      v_track := r.execution #> array['shaam', v_key];
      -- איזה מערכים בבקשה: מהמעקב (208) או מתוצאת היצירה האחרונה.
      v_sys := coalesce(v_track -> 'requestedSystems',
        (select j.result -> 'systems' from public.automation_jobs j
          where j.client_id = c.id and j.action_type = 'shaam.create_representation' and j.status = 'succeeded'
            and j.result ->> 'submissionKey' = v_key order by j.finished_at desc nulls last limit 1));
      v_hits := case when jsonb_typeof(v_sys) = 'array'
                     then exists (select 1 from jsonb_array_elements_text(v_sys) t
                                   where regexp_replace(t, '["״]', '', 'g') = regexp_replace(v_label, '["״]', '', 'g'))
                     else true end;
      -- מע"מ/ניכויים של אדם אחד בלבד — רק ההגשה שלו.
      if not v_whole and v_key <> 'person:' || p_person then v_hits := false; end if;
      if not v_hits then continue; end if;
      v_affected := v_affected || v_key;
      if nullif(v_track ->> 'requestNumber', '') is not null and nullif(v_track ->> 'submittedAt', '') is null then
        v_replace := v_replace || v_key;
        v_track := (v_track - 'formDocumentId' - 'formFileName' - 'formFetchedAt')
          || jsonb_build_object('replacement', jsonb_build_object(
               'reason', 'authority_removed', 'requestNumber', v_track ->> 'requestNumber',
               'removed', coalesce(v_track #> '{replacement,removed}', '[]'::jsonb) || to_jsonb(v_label),
               'supersededFormDocumentId', coalesce(v_track #>> '{replacement,supersededFormDocumentId}', v_track ->> 'formDocumentId'),
               'at', v_now));
        update public.representation_requests
           set execution = jsonb_set(execution, array['shaam', v_key], v_track)
         where id = r.id;
        update public.documents set notes = trim(coalesce(notes, '') || ' · הוחלף: כלל רשות שהוסרה מהבקשה (' || v_label || ')')
         where id = v_track #>> '{replacement,supersededFormDocumentId}' and client_id = c.id;
      end if;
    end loop;
  end if;
  -- בלי מעקב שע״ם (טופס שהועלה ידנית) — כל טופס של האדם/הבקשה נחשב.
  if cardinality(v_affected) = 0 then
    select coalesce(array_agg(d ->> 'key'), '{}') into v_affected
      from jsonb_array_elements(coalesce(r.signature_documents, '[]'::jsonb)) d
     where v_whole or d ->> 'key' in ('person:' || p_person, 'incomeTax');
  end if;
  select coalesce(jsonb_agg(d), '[]'::jsonb) into v_docs
    from jsonb_array_elements(coalesce(r.signature_documents, '[]'::jsonb)) d
   where not (d ->> 'key' = any(v_affected));
  update public.representation_requests
     set signature_documents = v_docs,
         -- המראה הישנה (המסמך הראשון) — אסור שתשאיר את הטופס הישן בחיים.
         signature_setup = case when jsonb_array_length(v_docs) = 0 then null
                                else jsonb_build_object('pdfDocId', v_docs -> 0 ->> 'pdfDocId', 'pdfFileName', v_docs -> 0 ->> 'pdfFileName',
                                                        'fields', v_docs -> 0 -> 'fields', 'createdAt', v_docs -> 0 ->> 'createdAt') end,
         status = case when status = 'pending_signature' and jsonb_array_length(v_docs) = 0 then 'awaiting_accountant' else status end,
         updated_at = now()
   where id = r.id;

  select id into v_step from public.onboarding_steps
   where client_id = c.id and step_type = 'representation' and status <> 'cancelled'
   order by created_at desc limit 1;
  if v_step is not null then
    perform public.log_onboarding_event(c.user_id, v_step, null, 'note', 'accountant',
      v_label || coalesce(' (' || case when not v_whole then case p_person when 'spouse' then 'בן/בת הזוג' else 'הנישום/ה' end end || ')', '')
        || ' הוסר מהבקשה לפני השליחה לחתימה'
        || case when cardinality(v_replace) > 0 then ' - הבקשה בשע״ם צריכה ביטול ופתיחה מחדש' else '' end,
      jsonb_build_object('authority', p_authority, 'person', p_person, 'affected', to_jsonb(v_affected), 'replacement', to_jsonb(v_replace)));
  end if;
  return jsonb_build_object('ok', true, 'affected', to_jsonb(v_affected), 'replacement', to_jsonb(v_replace));
end;
$function$;

-- ── ⑩ העברת בקשה שבוטלה להיסטוריה ──────────────────────────────────────────
create or replace function public._shaam_track_archive(p_track jsonb, p_how text, p_now text)
returns jsonb
language sql
immutable
set search_path to 'public'
as $function$
  select jsonb_build_object('history',
    coalesce(p_track -> 'history', '[]'::jsonb)
      || jsonb_build_array((p_track - 'history') || jsonb_build_object('archivedAt', p_now, 'archivedHow', p_how)));
$function$;

--  כל השורות של הבקשה (לפי מספר) בוטלו/נדחו — ראיה חיובית, לא «לא נמצאה».
create or replace function public.shaam_rows_all_terminal(p_rows jsonb, p_request_number text)
returns boolean
language sql
immutable
set search_path to 'public'
as $function$
  select coalesce(bool_and(
           coalesce((x ->> 'systemStateCode')::int, 0) = 6
           or coalesce((x ->> 'requestStateCode')::int, 0) = 4
           or coalesce(x ->> 'rawSystemState', '') ~ 'בוטל'
           or coalesce(x ->> 'rawRequestState', '') ~ 'נדח'), false)
     and count(*) > 0
    from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) x
   where nullif(regexp_replace(coalesce(p_request_number, ''), '\D', '', 'g'), '') is null
      or regexp_replace(coalesce(x ->> 'requestNumber', ''), '\D', '', 'g') = regexp_replace(p_request_number, '\D', '', 'g');
$function$;

--  המשרד מאשר שביטל בשע״ם (כשהרשימה כבר לא מציגה את הבקשה). ‼ «הזן» עדיין
--  בודק ברשימת שע״ם לפני יצירה — בקשה פתוחה שנשארה תעצור אותו.
create or replace function public.confirm_shaam_request_cancelled(p_request_id text, p_submission_key text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  r       public.representation_requests%rowtype;
  v_uid   uuid := auth.uid();
  v_track jsonb;
  v_now   text := to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"');
begin
  select * into r from public.representation_requests where id = p_request_id for update;
  if r.id is null then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  if v_uid is null or r.user_id <> v_uid then return jsonb_build_object('ok', false, 'reason', 'forbidden'); end if;
  v_track := r.execution #> array['shaam', p_submission_key];
  if v_track is null or not (v_track ? 'replacement') then return jsonb_build_object('ok', false, 'reason', 'no_replacement'); end if;
  update public.representation_requests
     set execution = jsonb_set(execution, array['shaam', p_submission_key], public._shaam_track_archive(v_track, 'office_confirmed', v_now)),
         updated_at = now()
   where id = r.id;
  return jsonb_build_object('ok', true);
end;
$function$;

-- ── ⑲ execution.shaam שייך לשרת ─────────────────────────────────────────────
--  ‼ הדפדפן שומר את הבקשה כולה מעותק שנטען קודם. מעקב שע״ם שהשרת כתב בינתיים
--  (מספר בקשה, טופס, החלפה) היה נמחק בשקט. כתיבה ישירה של משתמש לא משנה אותו;
--  פונקציות השרת (security definer) ממשיכות לכתוב.
create or replace function public.guard_rep_execution_shaam()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  if current_user = 'authenticated'
     and (old.execution -> 'shaam') is distinct from (new.execution -> 'shaam') then
    new.execution := (coalesce(new.execution, '{}'::jsonb) - 'shaam')
      || case when coalesce(old.execution, '{}'::jsonb) ? 'shaam'
              then jsonb_build_object('shaam', old.execution -> 'shaam') else '{}'::jsonb end;
  end if;
  return new;
end;
$function$;

drop trigger if exists rep_requests_guard_execution_shaam on public.representation_requests;
create trigger rep_requests_guard_execution_shaam
  before update of execution on public.representation_requests
  for each row execute function public.guard_rep_execution_shaam();


-- ── ② shaam_identity_doc_kind ─

CREATE OR REPLACE FUNCTION public.shaam_identity_doc_kind(p_label text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  select case
    when l ~ '(תעודת\s*ה?זהות|ת\.\s*ז\.?|תז\M|ספח)' and l ~ 'רישיון|רשיון' then 'idOrLicense'
    when l ~ '(תעודת\s*ה?זהות|ת\.\s*ז\.?|תז\M|ספח)' and l ~ 'דרכון' then 'idOrPassport'
    when l ~ '(תעודת\s*ה?זהות|ת\.\s*ז\.?|תז\M|ספח)' then 'idCard'
    when l ~ 'דרכון' then 'passport'
    when l ~ '(רישיון|רשיון)\s*נהיגה' then 'driverLicense'
    else null
  end
  from (select regexp_replace(coalesce(p_label, ''), '["״׳'']', '', 'g') as l) x;
$function$;

-- ── ⑳ ensure_shaam_identity_document_request ─

CREATE OR REPLACE FUNCTION public.ensure_shaam_identity_document_request(p_client_id text, p_person text, p_kind text, p_shaam_label text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  c        public.clients%rowtype;
  r        public.representation_requests;
  s        public.onboarding_steps%rowtype;
  v_key    text;
  v_label  text;
  v_list   jsonb;
  v_draft  jsonb;
  v_item   jsonb;
  v_idx    int;
  v_ok_kinds text[];
  v_eng    text;
  v_sort   int;
  v_stage  text;
  v_mark   jsonb;
begin
  if p_person not in ('client', 'spouse') then return 'unrecognized'; end if;
  v_ok_kinds := public.shaam_doc_kinds_accepted(p_kind);
  if v_ok_kinds is null then return 'unrecognized'; end if;

  select * into c from public.clients where id = p_client_id;
  if c.id is null then return 'no_request'; end if;
  r := public.representation_request_for_client(c.id);
  if r.id is null then return 'no_request'; end if;

  -- קיים ומשויך לאדם הזה, מהסוג שנדרש — ואכן בתיק.
  if not coalesce((public.shaam_identity_documents_for(c.id, p_person, p_kind) ->> 'missing')::boolean, false) then
    return 'exists';
  end if;

  v_key := public.identity_doc_item_key_for(p_person, p_kind);
  v_mark := jsonb_build_object('requiredBy', 'shaam', 'docKind', p_kind, 'shaamLabel', p_shaam_label);

  select * into s from public.onboarding_steps
   where client_id = c.id and step_type = 'client_documents' and status <> 'cancelled'
   order by created_at desc limit 1;

  if s.id is not null then
    select ord - 1, x into v_idx, v_item
      from jsonb_array_elements(coalesce(s.payload -> 'checklist', '[]'::jsonb)) with ordinality t(x, ord)
     where x ->> 'key' = v_key
     order by ord limit 1;
    if v_item is not null and coalesce((v_item ->> 'done')::boolean, false)
       and nullif(v_item ->> 'documentId', '') is not null then
      return 'exists';
    end if;
    if v_item is not null then
      -- פריט קיים: פתוח ⇒ מסמנים; «הושלם» בלי מסמך ⇒ נפתח מחדש **במקום**.
      v_list := jsonb_set(coalesce(s.payload -> 'checklist', '[]'::jsonb), array[v_idx::text],
                  (v_item - 'doneAt' - 'documentId') || v_mark || jsonb_build_object('done', false));
      update public.onboarding_steps
         set payload = payload || jsonb_build_object('checklist', v_list), updated_at = now()
       where id = s.id;
      if coalesce((v_item ->> 'done')::boolean, false) then
        if s.status in ('completed', 'verified', 'skipped') then
          perform public._set_step_status(s.id, 'waiting_client', 'system',
            'רשות המסים דורשת ' || coalesce(v_item ->> 'label', 'מסמך מזהה') || ' לבקשת הייצוג - הפריט נפתח מחדש',
            jsonb_build_object('source', 'shaam', 'itemKey', v_key), 'client', null);
        else
          perform public.log_onboarding_event(s.user_id, s.id, s.engagement_id, 'note', 'system',
            'רשות המסים דורשת ' || coalesce(v_item ->> 'label', 'מסמך מזהה') || ' - הפריט שסומן בלי מסמך נפתח מחדש',
            jsonb_build_object('source', 'shaam', 'itemKey', v_key));
        end if;
        return 'requested';
      end if;
      return 'already_requested';
    end if;
  end if;

  -- צילום תעודה בתיק שאינו משויך לאף אדם — לא ידוע אם הוא של האדם הזה.
  -- ‼ 208 · המשרד בחר «בקש מהלקוח צילום» לפני השליחה לחתימה ⇒ מבקשים בכל זאת.
  if coalesce(current_setting('pivo.shaam_ask_unassigned', true), '') <> 'on' and exists (
    select 1 from public.documents d
     where d.client_id = c.id and d.category in ('id_card', 'drivers_license')
       and not exists (
         select 1 from jsonb_each(coalesce(r.identity_docs, '{}'::jsonb)) p,
                       jsonb_array_elements(case when jsonb_typeof(p.value) = 'array' then p.value else '[]'::jsonb end) e
          where e ->> 'documentId' = d.id)
  ) then
    return 'ambiguous_materials';
  end if;

  v_label := case p_kind when 'passport' then 'צילום דרכון'
                         when 'idOrPassport' then 'צילום תעודת זהות או דרכון'
                         when 'idOrLicense' then 'צילום תעודת זהות או רישיון נהיגה'
                         when 'driverLicense' then 'צילום רישיון נהיגה'
                         else 'צילום תעודת זהות' end
             || case when p_person = 'spouse'
                     then ' - ' || coalesce(nullif(trim(coalesce(c.spouse_first_name, '') || ' ' || coalesce(c.spouse_last_name, '')), ''),
                                           nullif(trim(coalesce(r.identification ->> 'spouseFirstName', '') || ' ' ||
                                                         coalesce(r.identification ->> 'spouseLastName', '')), ''),
                                           nullif(trim(coalesce(r.identification ->> 'spouseName', '')), ''),
                                           'בן/בת הזוג')
                     else '' end;
  v_item := jsonb_build_object('key', v_key, 'label', v_label, 'done', false,
                               'source', 'shaam_documents_step') || v_mark;

  if s.id is not null then
    v_list  := coalesce(s.payload -> 'checklist', '[]'::jsonb) || v_item;
    v_draft := s.draft_payload;
    if v_draft is not null and jsonb_typeof(v_draft -> 'checklist') = 'array'
       and not exists (select 1 from jsonb_array_elements(v_draft -> 'checklist') y where y ->> 'key' = v_key) then
      v_draft := jsonb_set(v_draft, '{checklist}', (v_draft -> 'checklist') || v_item);
    end if;
    update public.onboarding_steps
       set payload = payload || jsonb_build_object('checklist', v_list)
                     || case when coalesce(s.payload ->> 'clientTitle', '') ~ '^להעלות (\d+ מסמכים|מסמך אחד)$'
                             then jsonb_build_object('clientTitle', public._documents_title(jsonb_array_length(v_list)))
                             else '{}'::jsonb end,
           draft_payload = v_draft,
           updated_at = now()
     where id = s.id;
    if s.status in ('completed', 'verified', 'skipped') then
      perform public._set_step_status(s.id, 'waiting_client', 'system',
        'רשות המסים דורשת ' || v_label || ' לבקשת הייצוג - הבקשה נפתחה מחדש',
        jsonb_build_object('source', 'shaam', 'item', v_item), 'client', null);
    else
      perform public.log_onboarding_event(s.user_id, s.id, s.engagement_id, 'note', 'system',
        'רשות המסים דורשת ' || v_label || ' לבקשת הייצוג - נוסף לרשימת המסמכים',
        jsonb_build_object('source', 'shaam', 'item', v_item));
    end if;
    return 'requested';
  end if;

  select id into v_eng from public.engagements where client_id = c.id order by created_at desc limit 1;
  select coalesce(max(sort_order), 0) + 10 into v_sort
    from public.onboarding_steps where client_id = c.id and status <> 'cancelled';
  v_stage := public.derive_lifecycle_stage(c.id);

  insert into public.onboarding_steps
    (user_id, engagement_id, client_id, required_for_close, step_type, track, scope,
     status, ball, sort_order, payload, published_at)
  values
    (c.user_id, v_eng, c.id, public.intake_accepts_required(c.id), 'client_documents', 'tools', 'person',
     'pending', 'client', v_sort,
     jsonb_build_object('checklist', jsonb_build_array(v_item),
       'clientTitle', public._documents_title(1), 'clientSub', v_label, 'clientCta', 'להעלאה')
     || case when v_stage in ('lead', 'quoted') then jsonb_build_object('published', false, 'heldUntilApproval', true) else '{}'::jsonb end,
     case when v_stage in ('lead', 'quoted') then null else now() end)
  returning * into s;

  perform public.log_onboarding_event(c.user_id, s.id, v_eng, 'created', 'system',
    'רשות המסים דורשת ' || v_label || ' לבקשת הייצוג - נפתחה בקשת מסמכים',
    jsonb_build_object('source', 'shaam', 'item', v_item));
  return 'requested';
end;
$function$;

-- ── ㉒ sync_shaam_documents_gate_from_job ─

CREATE OR REPLACE FUNCTION public.sync_shaam_documents_gate_from_job()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_key   text := coalesce(new.input ->> 'submissionKey', '');
  r       public.representation_requests;
  v_gate  jsonb;
  v_person text;
begin
  if v_key = '' or old.status is not distinct from new.status then return new; end if;
  if new.status not in ('failed', 'succeeded') then return new; end if;
  r := public.representation_request_for_client(new.client_id);
  if r.id is null then return new; end if;

  if new.status = 'succeeded' then
    v_gate := jsonb_build_object('state', 'submitted', 'jobId', new.id, 'at', now());
  elsif new.error_code in ('awaiting_required_documents', 'needs_document_assignment',
                           'document_not_pdf_convertible', 'unsupported_required_document',
                           'first_live_verification', 'required_document_unavailable') then
    v_person := public.shaam_person_for_entity(new.client_id, new.progress #>> '{shaamDocuments,entityId}');
    v_gate := jsonb_strip_nulls(jsonb_build_object(
      'state', new.error_code, 'jobId', new.id, 'at', now(),
      'entityId', new.progress #>> '{shaamDocuments,entityId}',
      'person', v_person,
      'rows', new.progress #> '{shaamDocuments,rows}',
      'plan', new.progress -> 'shaamDocumentsPlan',
      'detail', left(coalesce(new.error_detail, ''), 500)));
  else
    -- כשל אחר לא משנה את מצב ההמתנה (ההחלטה עליו בידי אדם — 196).
    perform public.resume_shaam_submissions_for_client(new.client_id, 'job_finished');
    return new;
  end if;

  update public.representation_requests
     set execution = jsonb_set(
           coalesce(execution, '{}'::jsonb), array['shaam'],
           coalesce(execution -> 'shaam', '{}'::jsonb) || jsonb_build_object(v_key,
             coalesce(execution #> array['shaam', v_key], '{}'::jsonb)
               || jsonb_build_object('documentsGate', v_gate))),
         updated_at = now()
   where id = r.id;

  -- ‼ 208 · השידור עצר כי הצילום שבתיק לא אושר ע"י הלקוח ⇒ הלקוח נשאל (גם
  -- בבקשה שנשלחה לחתימה לפני 208, שאין בה עדיין בקשת אישור).
  if new.error_code = 'awaiting_required_documents' then
    perform public._shaam_confirm_steps_after_send(r.id);
  end if;

  -- ‼ משימה של הגשה אחרת עשויה לחכות למקום שהתפנה (זוג באותו כרטיס).
  perform public.resume_shaam_submissions_for_client(new.client_id, 'job_finished');
  return new;
end;
$function$;

-- ── ㉑ office_attach_identity_doc ─

CREATE OR REPLACE FUNCTION public.office_attach_identity_doc(p_request_id text, p_person text, p_document_id text, p_doc_kind text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid  uuid := auth.uid();
  r      public.representation_requests%rowtype;
  d      public.documents%rowtype;
  v_kind text;
  v_docs jsonb;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'reason', 'unauthenticated'); end if;
  if p_person not in ('client', 'spouse') then
    return jsonb_build_object('ok', false, 'reason', 'bad_person');
  end if;
  if p_doc_kind is not null and p_doc_kind not in ('idCard', 'driverLicense', 'passport') then
    return jsonb_build_object('ok', false, 'reason', 'bad_kind');
  end if;

  select * into r from public.representation_requests where id = p_request_id for update;
  if r.id is null then return jsonb_build_object('ok', false, 'reason', 'request_not_found'); end if;
  if r.user_id <> v_uid then return jsonb_build_object('ok', false, 'reason', 'forbidden'); end if;
  if r.linked_client_id is null then return jsonb_build_object('ok', false, 'reason', 'no_linked_client'); end if;

  select * into d from public.documents where id = p_document_id;
  if d.id is null then return jsonb_build_object('ok', false, 'reason', 'document_not_found'); end if;
  if d.user_id <> v_uid or d.client_id <> r.linked_client_id then
    return jsonb_build_object('ok', false, 'reason', 'document_not_of_client');
  end if;

  -- ‼ אותו מסמך לא נרשם לשני אנשים: צילום של אחד לעולם אינו של השני.
  if exists (select 1 from jsonb_each(coalesce(r.identity_docs, '{}'::jsonb)) p,
                  jsonb_array_elements(case when jsonb_typeof(p.value) = 'array' then p.value else '[]'::jsonb end) x
              where x->>'documentId' = p_document_id and p.key <> p_person) then
    return jsonb_build_object('ok', false, 'reason', 'document_belongs_to_other_person');
  end if;
  if exists (select 1 from jsonb_array_elements(
               case when jsonb_typeof(r.identity_docs -> p_person) = 'array'
                    then r.identity_docs -> p_person else '[]'::jsonb end) x
              where x->>'documentId' = p_document_id) then
    return jsonb_build_object('ok', true, 'alreadyAttached', true);
  end if;

  v_kind := coalesce(p_doc_kind, case when d.category = 'drivers_license' then 'driverLicense' else 'idCard' end);

  update public.representation_requests
     set identity_docs = jsonb_set(
           coalesce(identity_docs, '{}'::jsonb),
           array[p_person],
           (case when jsonb_typeof(identity_docs -> p_person) = 'array'
                 then identity_docs -> p_person else '[]'::jsonb end)
             || jsonb_build_array(jsonb_build_object(
                  'documentId', d.id,
                  'docKind', v_kind,
                  'fileName', d.file_name,
                  'at', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
                  'via', 'office')),
           true)
   where id = r.id
   returning identity_docs into v_docs;

  perform public.sync_identity_docs_to_client_documents(r.linked_client_id);
  -- ‼ 208 · צירוף של המשרד אינו אישור הלקוח. אחרי השליחה לחתימה ⇒ הלקוח נשאל.
  perform public._shaam_confirm_steps_after_send(r.id);

  return jsonb_build_object('ok', true, 'count', jsonb_array_length(v_docs -> p_person), 'docKind', v_kind);
end;
$function$;

-- ── ⑪ sync_shaam_representation_from_job ─

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
                                           jsonb_build_object('text', left(new.result ->> 'creationNotice', 600), 'at', v_now)) end,
      -- ‼ 208 · «בהמשך תתבקש לצרף» כרשימה — דרישות המסמכים של הבקשה הזאת, מהרגע שנוצרה.
      'creationAttach', case when jsonb_typeof(new.result -> 'creationAttach') = 'array'
                             then coalesce(v_track -> 'creationAttach', new.result -> 'creationAttach') end,
      -- ‼ 208 · אילו מערכים יש בבקשה בשע״ם — כדי לדעת איזה טופס כולל רשות שהוסרה.
      'requestedSystems', case when jsonb_typeof(new.result -> 'systems') = 'array'
                             then coalesce(v_track -> 'requestedSystems', new.result -> 'systems') end
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

  -- ‼ 208 · רשות הוסרה לפני החתימה ⇒ המשרד מבטל בשע״ם את הבקשה (לפני שהמסמכים
  -- התקבלו שע״ם מבטלת רק את כולה). בדיקה שרואה שהבקשה הזאת בוטלה בכל מערכיה ⇒
  -- הבקשה עוברת להיסטוריה, ו«הזן ייפוי כוח בשע״ם» נפתח מחדש עם מה שנשאר.
  if v_kind = 'shaam.check_representation' and v_apply_state and not v_stale
     and v_track ? 'replacement'
     and public.shaam_rows_all_terminal(v_rows, v_track ->> 'requestNumber') then
    v_track := public._shaam_track_archive(v_track, 'observed_cancelled', v_now);
  end if;

  -- ‼ 208 · המשרד סימן «ביטלתי בשע״ם», אבל «הזן» מצא את אותה בקשה עדיין פתוחה שם.
  -- לא מאמצים אותה בשקט — היא כוללת את הרשות שהוסרה. חוזרים ל«להחלפה», עם ראיה.
  if v_preflight then
    v_row := null;
    select h -> 'replacement' into v_row
      from jsonb_array_elements(coalesce(v_track -> 'history', '[]'::jsonb)) h
     where h ? 'replacement'
       and nullif(regexp_replace(coalesce(h #>> '{replacement,requestNumber}', ''), '[^0-9]', '', 'g'), '') is not null
       and regexp_replace(h #>> '{replacement,requestNumber}', '[^0-9]', '', 'g')
           = regexp_replace(coalesce(v_track ->> 'requestNumber', ''), '[^0-9]', '', 'g')
     order by h ->> 'archivedAt' desc nulls last
     limit 1;
    if v_row is not null then
      v_track := v_track || jsonb_build_object('replacement', v_row || jsonb_build_object('stillOpenAt', v_now));
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

-- ── ⑫ client_documents_to_identity_docs_trg ─

CREATE OR REPLACE FUNCTION public.client_documents_to_identity_docs_trg()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  r      public.representation_requests;
  x      jsonb;
  v_person text;
  v_doc  text;
  v_name text;
  v_cat  text;
  v_kind text;
begin
  if new.step_type <> 'client_documents' then return new; end if;
  if old.payload is not distinct from new.payload then return new; end if;

  r := public.representation_request_for_client(new.client_id);
  if r.id is null then return new; end if;

  for x in select * from jsonb_array_elements(coalesce(new.payload->'checklist', '[]'::jsonb)) loop
    if x->>'key' not in ('id_card', 'id_card_spouse', 'passport', 'passport_spouse') then continue; end if;
    v_doc := nullif(x->>'documentId', '');
    if v_doc is null then continue; end if;
    v_person := case when x->>'key' in ('id_card_spouse', 'passport_spouse') then 'spouse' else 'client' end;
    if exists (select 1 from jsonb_array_elements(
                 case when jsonb_typeof(r.identity_docs->v_person) = 'array' then r.identity_docs->v_person else '[]'::jsonb end) d
                where d->>'documentId' = v_doc) then continue; end if;
    select file_name, category into v_name, v_cat from public.documents where id = v_doc;
    v_kind := case
      when x->>'key' in ('passport', 'passport_spouse') or x->>'docKind' = 'passport' then 'passport'
      when v_cat = 'drivers_license' then 'driverLicense'
      else 'idCard' end;
    update public.representation_requests
       set identity_docs = jsonb_set(
             coalesce(identity_docs, '{}'::jsonb),
             array[v_person],
             (case when jsonb_typeof(identity_docs->v_person) = 'array' then identity_docs->v_person else '[]'::jsonb end)
               || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
               'documentId', v_doc, 'docKind', v_kind, 'fileName', v_name,
               'at', coalesce(x->>'doneAt', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')),
               'via', 'client_documents',
               -- ‼ 208 · הלקוח העלה בעצמו לפריט ששע״ם דרשה — זה האישור שלו שזה המסמך.
               'clientConfirmedAt', case when x->>'requiredBy' = 'shaam'
                                         then coalesce(x->>'doneAt', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')) end))),
             true)
     where id = r.id
     returning * into r;
  end loop;
  return new;
end;
$function$;

-- ── ⑰ automation_job_identity_document ─

CREATE OR REPLACE FUNCTION public.automation_job_identity_document(p_worker_id text, p_job_id text, p_entity_id text, p_slot_kind text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_job    public.automation_jobs;
  c        public.clients%rowtype;
  v_person text;
  v_sel    jsonb;
begin
  select * into v_job from public.automation_jobs
   where id = p_job_id and claimed_by = p_worker_id and status = 'running';
  if not found then return jsonb_build_object('ok', false, 'error', 'not_owner_or_finished'); end if;
  if v_job.action_type <> 'shaam.submit_poa' then return jsonb_build_object('ok', false, 'error', 'wrong_action'); end if;
  if p_slot_kind not in ('idOrLicense', 'passport') then
    return jsonb_build_object('ok', false, 'error', 'unsupported_kind');
  end if;

  select * into c from public.clients where id = v_job.client_id;
  v_person := public.shaam_person_for_entity(v_job.client_id, p_entity_id);
  if v_person is null then return jsonb_build_object('ok', false, 'error', 'needs_document_assignment'); end if;

  -- ‼ 208 · מה שעולה לשע״ם הוא רק מסמך שהלקוח אישר שהוא שלו (או שהעלה בעצמו
  -- לבקשה של שע״ם). קיום קובץ בתיק אינו אישור.
  v_sel := public.shaam_confirmed_identity_documents_for(v_job.client_id, v_person, p_slot_kind);
  if coalesce((v_sel ->> 'missing')::boolean, false)
     and not coalesce((public.shaam_identity_documents_for(v_job.client_id, v_person, p_slot_kind) ->> 'missing')::boolean, false) then
    return jsonb_build_object('ok', false, 'error', 'not_confirmed', 'person', v_person);
  end if;
  if coalesce((v_sel ->> 'missing')::boolean, false) then
    return jsonb_build_object('ok', false, 'error', 'missing', 'person', v_person,
      'personName', case when v_person = 'spouse'
                         then trim(coalesce(c.spouse_first_name, '') || ' ' || coalesce(c.spouse_last_name, ''))
                         else trim(coalesce(c.first_name, '') || ' ' || coalesce(c.last_name, '')) end);
  end if;
  return jsonb_build_object('ok', true, 'person', v_person,
    'personName', case when v_person = 'spouse'
                       then trim(coalesce(c.spouse_first_name, '') || ' ' || coalesce(c.spouse_last_name, ''))
                       else trim(coalesce(c.first_name, '') || ' ' || coalesce(c.last_name, '')) end,
    'docKind', v_sel ->> 'docKind', 'documents', v_sel -> 'documents',
    'userId', v_job.user_id, 'clientId', v_job.client_id);
end;
$function$;

-- ── ⑱ resume_shaam_submissions_for_client ─

CREATE OR REPLACE FUNCTION public.resume_shaam_submissions_for_client(p_client_id text, p_reason text DEFAULT 'identity_docs'::text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  r        public.representation_requests;
  v_key    text;
  v_gate   jsonb;
  v_person text;
  x        jsonb;
  v_sel    jsonb;
  v_ready  boolean;
  j        public.automation_jobs%rowtype;
  v_new    text;
  v_count  int := 0;
begin
  r := public.representation_request_for_client(p_client_id);
  if r.id is null or jsonb_typeof(r.execution -> 'shaam') <> 'object' then return 0; end if;
  -- נעילה: שני אירועים בו-זמנית לא ייצרו שתי משימות.
  select * into r from public.representation_requests where id = r.id for update;

  for v_key in select jsonb_object_keys(r.execution -> 'shaam') loop
    v_gate := r.execution #> array['shaam', v_key, 'documentsGate'];
    if v_gate is null or v_gate ->> 'state' not in ('awaiting_required_documents', 'document_not_pdf_convertible') then continue; end if;
    if p_reason = 'job_finished' and not coalesce((v_gate ->> 'resumePendingOpenJob')::boolean, false) then continue; end if;
    if (r.execution #>> array['shaam', v_key, 'submittedAt']) is not null then continue; end if;
    v_person := v_gate ->> 'person';
    if v_person is null then continue; end if;

    -- כל שורה שדורשת מסמך מזהה — יש לה עכשיו מסמך של **אותו אדם**, בר-המרה.
    v_ready := true;
    for x in select value from jsonb_array_elements(coalesce(v_gate -> 'rows', '[]'::jsonb)) loop
      if x ->> 'kind' not in ('idOrLicense', 'passport') then
        if x ->> 'kind' <> 'poa' then v_ready := false; end if;
        continue;
      end if;
      v_sel := public.shaam_confirmed_identity_documents_for(p_client_id, v_person, x ->> 'kind');
      if coalesce((v_sel ->> 'missing')::boolean, false) or not public._shaam_docs_convertible(v_sel) then
        v_ready := false;
      end if;
    end loop;
    if not v_ready then continue; end if;

    select * into j from public.automation_jobs where id = v_gate ->> 'jobId';
    if j.id is null or j.client_id <> p_client_id or j.action_type <> 'shaam.submit_poa' then continue; end if;
    -- ‼ 196: משימה שנגעה בשע״ם אינה בסיס להמשך אוטומטי. (עצירת מסמכים קורית
    -- תמיד לפני הנגיעה — זו רק הגנה נוספת.)
    if public.job_touched_external(j.progress) then continue; end if;

    insert into public.automation_jobs (user_id, client_id, action_type, input, status, max_attempts)
    values (j.user_id, j.client_id, 'shaam.submit_poa',
            (j.input - 'resumedFromJobId' - 'resumeReason')
              || jsonb_build_object('resumedFromJobId', j.id, 'resumeReason', 'required_documents_arrived'),
            'queued', 1)
    on conflict (client_id, action_type) where status in ('queued', 'running', 'needs_human')
    do nothing
    returning id into v_new;

    if v_new is null then
      v_gate := v_gate || jsonb_build_object('resumePendingOpenJob', true);
    else
      v_gate := (v_gate - 'resumePendingOpenJob')
        || jsonb_build_object('state', 'resume_queued', 'resumeJobId', v_new, 'resumedAt', now());
      v_count := v_count + 1;
    end if;
    update public.representation_requests
       set execution = jsonb_set(execution, array['shaam', v_key, 'documentsGate'], v_gate),
           updated_at = now()
     where id = r.id
     returning * into r;
  end loop;
  return v_count;
end;
$function$;

-- ── ⑭ portal_submit_step ─

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

  -- ‼ 208 · «זה צילום התעודה שלי» — הלקוח מאשר שהמסמך שבתיק שלו, לבקשת שע״ם.
  if s.step_type = 'custom_request' and s.payload ? 'shaamIdentity' then
    if coalesce(p_data ->> 'key', '') <> 'identity_confirm' then
      return jsonb_build_object('ok', false, 'error', 'bad_key');
    end if;
    return public._shaam_identity_confirm(s.id, 'client_confirmed', null);
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
$function$;

-- ── ⑯ build_client_portal ─

CREATE OR REPLACE FUNCTION public.build_client_portal(p_client_id text, p_mode text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  c        public.clients%rowtype;
  p        public.profiles%rowtype;
  req      public.representation_requests%rowtype;
  quo      public.quotations%rowtype;
  s        record;
  v_items  jsonb := '[]'::jsonb;
  v_done   int := 0;
  v_total  int := 0;
  v_sign_token text;
  v_spouse_pending boolean := false;
  v_invite_url text;
  v_res_key   text;
  -- ‼ 114: מה שהבקשה פותחת — קובץ מספריית המשרד, או קישור חיצוני שנשמר עליה.
  v_res_url   text;
  -- ‼ 144: כמה קבצים בבקשה אחת. ריק/חסר ⇒ הבקשה היא מהסוג הישן.
  v_res_list  jsonb;
  v_res_out   jsonb;
  v_prev_open boolean := false;
  v_prev_done boolean := false;
  v_first  text;
  v_has_eng boolean := false;
  v_stage  text;
  v_ck_done int;
  v_ck_total int;
  v_label  text;
  v_sub    text;
  v_published boolean := true;
  v_reqs   jsonb;
  v_rq_done int;
  v_rq_total int;
  v_rep_item jsonb := null;
  v_rep_seen boolean := false;
  v_before int := 0;
  v_lock   text;
begin
  select * into c from public.clients where id = p_client_id;
  if c.id is null then return jsonb_build_object('ok', false, 'error', 'invalid'); end if;
  select * into p from public.profiles where id = c.user_id;
  v_first := split_part(trim(coalesce(c.first_name, '')), ' ', 1);
  v_invite_url := nullif(trim(coalesce(p.settings->'paperless'->>'inviteUrl', '')), '');
  -- ‼ נפתר מהגדרות המשרד בכל רינדור, כמו קישור הפייפרלס שמעליו: קובץ אחד
  -- משותף, והחלפתו משנה מיד את מה שכל בקשה תפתח.

  v_has_eng := exists (select 1 from public.engagements e where e.client_id = c.id);

  select coalesce(bool_or(e.process_published_at is not null), true)
    into v_published from public.engagements e where e.client_id = c.id;

  select * into quo from public.quotations q
    where q.client_id = c.id and q.status <> 'draft'
    order by q.updated_at desc limit 1;

  if v_has_eng then
    v_items := v_items || jsonb_build_object('bucket','done','key','quotation','label','הצעת המחיר אושרה');
  elsif quo.id is not null and quo.status in ('sent','viewed') then
    v_items := v_items || jsonb_strip_nulls(jsonb_build_object(
      'bucket','action','key','quote_sign',
      'label','הצעת המחיר שלך מוכנה',
      'sub','לקריאה ולאישור - ואפשר להתחיל · כמה דקות',
      'actionKind','quote','actionValue', quo.public_token));
  elsif quo.id is not null and quo.status = 'approved' then
    v_items := v_items || jsonb_build_object('bucket','done','key','quotation','label','הצעת המחיר אושרה');
    v_items := v_items || jsonb_build_object('bucket','office','key','quote_processing',
      'label','אנחנו מכינים את המשך התהליך','sub','נעדכן אותך כאן ברגע שיהיה מה לעשות');
  elsif quo.id is not null and quo.status in ('expired','cancelled') then
    v_items := v_items || jsonb_build_object('bucket','office','key','quote_expired',
      'label','הצעת המחיר כבר לא בתוקף','sub','נשמח לחדש אותה - דברו איתנו');
  end if;

  select * into req from public.representation_requests
    where linked_client_id = c.id order by created_at desc limit 1;

  if req.id is not null then
    if req.status = 'pending_fill' then
      v_rep_item := jsonb_strip_nulls(jsonb_build_object('bucket','action','key','rep_fill','label','מילוי פרטים וייפוי כוח','sub','הפרטים שנדרשים כדי לייצג אותך מול רשויות המס · כמה דקות','actionKind','onboard','actionValue', req.onboarding_token));
    elsif req.status = 'pending_signature' then
      select x->>'signToken' into v_sign_token
        from jsonb_array_elements(coalesce(req.signers, '[]'::jsonb)) x
        where x->>'role' = 'client' and x->>'signStatus' = 'pending' limit 1;
      select exists (
        select 1 from jsonb_array_elements(coalesce(req.signers, '[]'::jsonb)) x
        where x->>'role' = 'spouse' and x->>'signStatus' = 'pending')
        into v_spouse_pending;
      if v_sign_token is not null then
        v_rep_item := jsonb_strip_nulls(jsonb_build_object('bucket','action','key','rep_sign','label','חתימה על ייפוי הכוח','sub','הטופס מוכן - נשארה חתימה · כדקה','actionKind','sign','actionValue', v_sign_token));
      elsif v_spouse_pending then
        select jsonb_strip_nulls(jsonb_build_object('bucket','action','key','rep_sign_spouse','label','חתימת בן/בת הזוג על ייפוי הכוח','sub','אפשר לחתום יחד עכשיו, או לשלוח לבן/בת הזוג קישור אישי','actionKind','sign','actionValue', x->>'signToken')) into v_rep_item
        from jsonb_array_elements(coalesce(req.signers, '[]'::jsonb)) x
        where x->>'role' = 'client' and coalesce(x->>'signToken', '') <> '' limit 1;
      end if;
    elsif req.status in ('awaiting_accountant', 'awaiting_stamp') then
      -- ‼ 208 · «ממתין לרו"ח» לפני כל חתימה = אנחנו מכינים את הטופס. «נחתם על ידך»
      -- נאמר רק כשמישהו באמת חתם.
      v_rep_item := jsonb_build_object('bucket','office','key','rep_office','label','ייפוי הכוח','sub',
        case when exists (select 1 from jsonb_array_elements(coalesce(req.signers, '[]'::jsonb)) x
                           where x->>'signStatus' = 'signed')
             then 'נחתם על ידך - עכשיו בבדיקה ובחתימה אצלנו'
             else 'הפרטים התקבלו - אנחנו מכינים את ייפוי הכוח לחתימה' end);
    elsif req.status = 'awaiting_authorities' then
      v_rep_item := jsonb_build_object('bucket','office','key','rep_authorities','label','ייפוי הכוח','sub','נחתם והוגש לרשויות המס - ממתינים לאישור');
    elsif req.status = 'active' then
      v_rep_item := jsonb_build_object('bucket','done','key','rep_done','label','הייצוג מול רשויות המס אושר');
    end if;
  end if;

  for s in
    select * from public.onboarding_steps st
    where st.client_id = c.id and st.status <> 'cancelled'
      and (p_mode = 'preview'
           or (st.published_at is not null and (v_published or st.step_type = 'representation')))
    order by (case when p_mode = 'preview' then coalesce(st.pending_sort_order, st.sort_order, 0)
                   else coalesce(st.sort_order, 0) end),
             st.created_at
  loop
    -- 172: תצוגה מקדימה = הטיוטה מעל הפרסום; live נשאר כפי שהוא.
    if p_mode = 'preview' and s.draft_payload is not null then
      s.payload := public.merge_step_draft(s.payload, s.draft_payload);
    end if;
    v_before := jsonb_array_length(v_items);
    case s.step_type

    when 'representation' then
      v_rep_seen := true;
      if v_rep_item is not null then
        v_items := v_items || v_rep_item;
      end if;

    when 'client_documents' then
      select count(*) filter (where (x->>'done')::boolean), count(*)
        into v_ck_done, v_ck_total
        from jsonb_array_elements(coalesce(s.payload->'checklist','[]'::jsonb)) x;
      v_label := coalesce(nullif(s.payload->>'clientTitle',''), 'מסמכים שביקשנו');
      v_sub   := nullif(s.payload->>'clientSub','');

      if s.status in ('completed','verified','skipped') then
        v_items := v_items || jsonb_build_object('bucket','done','key','docs','label', v_label);
      elsif s.status = 'locked' then
        v_items := v_items || jsonb_strip_nulls(jsonb_build_object(
          'bucket','future','key','docs','label', v_label,
          'sub', coalesce(public.portal_lock_reason(s.id), v_sub)));
      else
        v_items := v_items || jsonb_strip_nulls(jsonb_build_object(
          'bucket','action','key','docs','label', v_label,
          'sub', case when coalesce(v_ck_total,0) > 0
                      then v_ck_done || ' מתוך ' || v_ck_total || ' התקבלו'
                      else v_sub end,
          'actionKind','portal','actionValue', s.id,
          'kind','documents',
          'canUpload', true,
          'checklist', (select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
                            'key', x->>'key', 'label', x->>'label', 'done', (x->>'done')::boolean,
                            -- 204 · שע״ם דרשה את המסמך: הלקוח רואה למה, ובלי לרמוז שהחתימה תלויה בו.
                            'note', case when x->>'requiredBy' = 'shaam'
                                         then 'נדרש על ידי רשות המסים להשלמת הייצוג' end))
                          order by ord)
                          from jsonb_array_elements(coalesce(s.payload->'checklist','[]'::jsonb))
                               with ordinality t(x, ord))));
      end if;

    when 'custom_request' then
      -- ‼ 208 · שע״ם דורשת צילום תעודה, ובתיק כבר יש אחד ⇒ הלקוח רואה אותו
      -- ומאשר שהוא שלו, או מעלה אחר. קיום הקובץ אינו אישור.
      if s.payload ? 'shaamIdentity' then
        if s.status in ('completed','verified','skipped') then
          v_items := v_items || jsonb_build_object('bucket','done','key','custom_'||s.id,
            'label', coalesce(nullif(s.payload->>'clientTitle',''), 'צילום תעודה לרשות המסים'));
        elsif s.status <> 'locked' then
          v_items := v_items || jsonb_strip_nulls(jsonb_build_object(
            'bucket','action','key','custom_'||s.id,
            'label', coalesce(nullif(s.payload->>'clientTitle',''), 'צילום תעודה לרשות המסים'),
            'sub', nullif(s.payload->>'clientSub',''),
            'note', nullif(s.payload->>'clientNote',''),
            'actionKind','portal','actionValue', s.id, 'stepId', s.id,
            'kind','identity_confirm',
            'resources', (select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
                             'key', x->>'key', 'label', x->>'label', 'fileName', nullif(x->>'fileName',''),
                             'documentId', nullif(x->>'documentId',''))) order by ord)
                            from jsonb_array_elements(coalesce(s.payload->'clientResources','[]'::jsonb)) with ordinality t(x, ord)
                           where x->>'source' = 'client')));
        end if;
        continue;
      end if;
      v_reqs := coalesce(s.payload->'requirements', '[]'::jsonb);
      select count(*) filter (where coalesce((x->>'done')::boolean, false)
                               and coalesce((x->>'required')::boolean, true)),
             count(*) filter (where coalesce((x->>'required')::boolean, true))
        into v_rq_done, v_rq_total
        from jsonb_array_elements(v_reqs) x;
      v_label := coalesce(nullif(s.payload->>'clientTitle',''), 'בקשה מהמשרד');
      v_res_key := nullif(s.payload->>'clientResource', '');
      -- ‼ 114: קישור חיצוני כחומר עזר לכל דבר. בקשה שנושאת clientLinkUrl
      -- מתנהגת בדיוק כמו בקשת מסמך — כפתור פתיחה אחד — גם בלי קובץ בספרייה.
      -- כך המדריך של פייפרלס אינו דורש סוג שלב חדש ולא ספרייה שנייה.
      v_res_url := coalesce(public.office_document_url(p.id, v_res_key),
                            nullif(trim(coalesce(s.payload->>'clientLinkUrl','')), ''));

      -- ‼ 144: הרשימה החדשה. `url` נפתר כאן רק לקבצי ספריית המשרד — קובץ
      -- מהתיק של הלקוח הוא פרטי, ונמסר כמזהה בלבד שהדף פודה מול
      -- portal-open-document. `done` נקרא מהדרישה בעלת אותו מפתח, ולכן
      -- הסימון שנרשם בפתיחה הוא אותו סימון שסוגר את הבקשה.
      v_res_list := case when jsonb_typeof(s.payload->'clientResources') = 'array'
                         then s.payload->'clientResources' end;
      if coalesce(jsonb_array_length(v_res_list), 0) > 0 then
        select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
                 'key',   x->>'key',
                 'label', x->>'label',
                 'fileName', nullif(x->>'fileName',''),
                 'url', case when x->>'source' = 'office'
                             then public.office_document_url(p.id, nullif(x->>'officeId','')) end,
                 'documentId', case when x->>'source' = 'client'
                             then nullif(x->>'documentId','') end,
                 'done', coalesce((select (r->>'done')::boolean
                                     from jsonb_array_elements(v_reqs) r
                                    where r->>'key' = x->>'key' limit 1), false)))
               order by ord)
          into v_res_out
          from jsonb_array_elements(v_res_list) with ordinality t(x, ord);
      else
        v_res_out := null;
      end if;

      -- ── הודעת מלל: כרטיס שקט, בלי פקד, ובלי מונה ────────────────────────
      -- ‼ נעולה או סגורה ⇒ פשוט אינה מופיעה. אין "הודעה שהושלמה": ברגע
      -- שהמשרד סוגר אותה היא יורדת מהדף, וזו כל מחזור החיים שלה.
      if coalesce((s.payload->>'messageOnly')::boolean, false) then
        if s.status in ('completed','verified','skipped','locked') then
          null;
        else
          v_items := v_items || jsonb_strip_nulls(jsonb_build_object(
            'bucket','office','key','custom_'||s.id,
            'kind','message',
            'label', v_label,
            'note', nullif(s.payload->>'message','')));
        end if;

      -- ── שליחת מסמכים: שורה לכל קובץ, והפתיחה היא מה שסוגר ───────────────
      elsif v_res_out is not null then
        if s.status in ('completed','verified','skipped') then
          -- ‼ ממשיכה לשאת את הקבצים: הבקשה נסגרה, אבל המסמכים עצמם נשארים
          -- זמינים תחת «מסמכים שימושיים». לקוח שפתח פעם אחת לא מאבד אותם.
          -- ‼ stepId נמסר גם כאן, ובלעדיו קובץ פרטי היה הופך לבלתי-נגיש ברגע
          -- שהבקשה נסגרת: portal-open-document מזהה את הקובץ דרך הבקשה שלו.
          -- ‼ 147: גם המלל שצורף לקבצים נשאר. הקבצים והמלל חיים באותו מקום
          -- בדף («מסמכים מהמשרד»), ובלי זה ההסבר שהמשרד כתב היה נעלם בדיוק
          -- ברגע שהלקוח פותח את הקובץ האחרון — תוכן שנמחק מול העיניים.
          v_items := v_items || jsonb_strip_nulls(jsonb_build_object(
            'bucket','done','key','custom_'||s.id,'label', v_label,
            'stepId', s.id,
            'note', nullif(s.payload->>'message',''),
            'resources', v_res_out));
        elsif s.status = 'locked' then
          v_items := v_items || jsonb_strip_nulls(jsonb_build_object(
            'bucket','future','key','custom_'||s.id,'label', v_label,
            'sub', coalesce(public.portal_lock_reason(s.id), nullif(s.payload->>'clientSub',''))));
        else
          v_items := v_items || jsonb_strip_nulls(jsonb_build_object(
            'bucket','action','key','custom_'||s.id,'label', v_label,
            'sub', nullif(s.payload->>'clientSub',''),
            'actionKind','portal','actionValue', s.id,
            'stepId', s.id,
            'kind','guide',
            'resources', v_res_out,
            'note', nullif(s.payload->>'message','')));
        end if;

      elsif s.status in ('completed','verified','skipped') then
        v_items := v_items || jsonb_strip_nulls(jsonb_build_object(
          'bucket','done','key','custom_'||s.id,'label', v_label,
          -- ‼ בקשת חומר עזר שהושלמה ממשיכה לשאת את הקישור. הדף מציג אותה
          -- תחת «מסמכים שימושיים» — אחרת הלקוח שפתח את המדריך פעם אחת
          -- מאבד אליו גישה לתמיד.
          'resourceKey', case when public.office_document_url(p.id, v_res_key) is not null then v_res_key else null end,
          'resourceUrl', v_res_url));
      elsif s.status = 'locked' then
        v_items := v_items || jsonb_strip_nulls(jsonb_build_object(
          'bucket','future','key','custom_'||s.id,'label', v_label,
          'sub', coalesce(public.portal_lock_reason(s.id), nullif(s.payload->>'clientSub',''))));
      else
        v_items := v_items || jsonb_strip_nulls(jsonb_build_object(
          'bucket','action','key','custom_'||s.id,'label', v_label,
          'sub', case when v_res_url is not null then nullif(s.payload->>'clientSub','')
                      when coalesce(v_rq_total,0) > 1
                      then v_rq_done || ' מתוך ' || v_rq_total || ' הושלמו'
                      else nullif(s.payload->>'clientSub','') end,
          'actionKind','portal','actionValue', s.id,
          -- ‼ בקשת חומר עזר אינה טופס: הפעולה היחידה היא פתיחת הקובץ, והיא
          -- עצמה מה שסוגר אותה. kind נפרד כדי שהדף לא יצייר שורות דרישות.
          'kind', case when v_res_url is not null then 'guide' else 'custom' end,
          'resourceKey', case when public.office_document_url(p.id, v_res_key) is not null then v_res_key else null end,
          'resourceUrl', v_res_url,
          'cta', nullif(s.payload->>'clientCta',''),
          -- ‼ מיגרציה 107: ההסבר, המספרים להעתקה ומשפט הסגירה עוברים כמו שהם
          -- אל הדף האישי. clientSub לבדו לא הספיק — הוא מוחלף בשורת ההתקדמות
          -- ("1 מתוך 2 הושלמו") ברגע שיש יותר מדרישה אחת, וכל הסבר שנשען עליו
          -- נעלם בדיוק בבקשות שהכי זקוקות לו.
          'note', nullif(s.payload->>'clientNote',''),
          'refs', s.payload->'clientRefs',
          'noteAfter', nullif(s.payload->>'clientNoteAfter',''),
          'canUpload', exists (select 1 from jsonb_array_elements(v_reqs) x where x->>'kind' in ('file','files')),
          'requirements', (select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
                              'key', x->>'key', 'kind', x->>'kind', 'label', x->>'label',
                              'done', coalesce((x->>'done')::boolean, false),
                              'required', coalesce((x->>'required')::boolean, true),
                              'options', x->'options',
                              'maxFiles', x->'maxFiles',
                              'fileCount', coalesce(jsonb_array_length(x->'documentIds'),
                                             case when nullif(x->>'documentId','') is not null then 1 else 0 end),
                              'value', x->>'value')) order by ord)
                            from jsonb_array_elements(v_reqs) with ordinality t(x, ord))));
      end if;

    when 'prev_accountant_details' then
      if s.status in ('completed','verified','skipped') then
        v_items := v_items || jsonb_build_object('bucket','done','key','prev_details',
          'label', coalesce(nullif(s.payload->>'clientTitle',''), 'פרטי רואה החשבון הקודם'));
      elsif s.status = 'locked' then
        v_items := v_items || jsonb_strip_nulls(jsonb_build_object(
          'bucket','future','key','prev_details',
          'label', coalesce(nullif(s.payload->>'clientTitle',''), 'פרטי רואה החשבון הקודם'),
          'sub', coalesce(public.portal_lock_reason(s.id), nullif(s.payload->>'clientSub',''))));
      else
        v_items := v_items || jsonb_strip_nulls(jsonb_build_object(
          'bucket','action','key','prev_details',
          'label', coalesce(nullif(s.payload->>'clientTitle',''), 'פרטי רואה החשבון הקודם שלך'),
          'sub', coalesce(nullif(s.payload->>'clientSub',''), 'שם, אימייל וטלפון - כדי שנפנה אליו בשמך'),
          'actionKind','portal','actionValue', s.id, 'kind','prev_accountant',
          'prefill', nullif(jsonb_strip_nulls(jsonb_build_object(
            'name',  nullif(trim(coalesce(c.prev_accountant_name ,'')), ''),
            'email', nullif(trim(coalesce(c.prev_accountant_email,'')), ''),
            'phone', nullif(trim(coalesce(c.prev_accountant_phone,'')), ''))), '{}'::jsonb)));
      end if;

    -- ── שלב 1: ההרשמה — של הלקוח ──────────────────────────────────────────
    -- ‼ עד מיגרציה 106 היה כאן `continue`, כלומר השלב לא הגיע ללקוח כלל.
    -- עכשיו זו הפעולה שלו: קישור ההרשמה של המשרד (אם הוגדר) וכפתור אישור
    -- אחד. linkUrl נפרד מ-actionKind במכוון — הכרטיס נושא גם קישור יוצא
    -- וגם השלמה בתוך הדף, ו-actionKind='portal' הוא זה שמפעיל את ההשלמה.
    when 'paperless_invite' then
      if coalesce(s.payload->>'paperlessStatus', '') in ('not_applicable', 'other_rep') then
        -- לא רלוונטי ללקוח: או שאין פייפרלס, או שהחשבון מועבר אלינו מהמייצג
        -- הקודם — ובשני המקרים אין לו מה להירשם.
        continue;
      elsif s.status in ('completed', 'verified') or
            (s.status = 'skipped' and coalesce(s.payload->>'skipReason','') in ('already_connected','transferred_rep')) then
        v_items := v_items || jsonb_build_object('bucket','done','key','paperless_signup','label','הרשמה לפייפרלס');
      elsif s.status = 'locked' then
        v_items := v_items || jsonb_strip_nulls(jsonb_build_object(
          'bucket','future','key','paperless_signup','label','הרשמה לפייפרלס',
          'sub', public.portal_lock_reason(s.id)));
      elsif coalesce(s.payload->>'paperlessStatus', '') = 'self' then
        -- ללקוח כבר יש חשבון: מה שנדרש ממנו הוא לצרף אותנו כמייצג, לא להירשם.
        v_items := v_items || jsonb_strip_nulls(jsonb_build_object(
          'bucket','action','key','paperless_signup',
          'label','קישור חשבון הפייפרלס למשרד',
          'sub','בחשבון הפייפרלס שלך: הוסיפו את המשרד כמייצג',
          'actionKind','portal','actionValue', s.id, 'kind','paperless_signup',
          -- ‼ 114: שם העסק נשאל כאן, כי זה מה שאנחנו צריכים להזין בפייפרלס.
          -- הערך מגיע מ-clients.business_name ונשמר בחזרה לשם בלבד.
          'needsBusinessName', true,
          'businessName', nullif(trim(coalesce(c.business_name,'')), ''),
          'cta','קישרתי את המשרד'));
      else
        v_items := v_items || jsonb_strip_nulls(jsonb_build_object(
          'bucket','action','key','paperless_signup',
          'label', coalesce(nullif(s.payload->>'clientTitle',''), 'הרשמה לפייפרלס'),
          'sub', coalesce(nullif(s.payload->>'clientSub',''),
                          'שתי דקות, ומשם רק מצלמים קבלות מהטלפון'),
          'actionKind','portal','actionValue', s.id, 'kind','paperless_signup',
          'needsBusinessName', true,
          'businessName', nullif(trim(coalesce(c.business_name,'')), ''),
          'linkUrl', v_invite_url,
          'cta', coalesce(nullif(s.payload->>'clientCta',''), 'נרשמתי לפייפרלס')));
      end if;

    -- ── שלב 2: החיבור — של המשרד ──────────────────────────────────────────
    -- ‼ אין כאן פעולה ללקוח, וזו לא השמטה: ברגע שאנחנו נכנסים לחשבון שלו
    -- פייפרלס מבקשת מאיתנו את פרטי האשראי, ולכן ההשלמה היא של המשרד. מה
    -- שהלקוח צריך לדעת הוא רק שזה בטיפול ושאין לו מה לעשות.
    when 'paperless_connection' then
      if coalesce(s.payload->>'paperlessStatus', '') = 'not_applicable' then
        continue;
      elsif s.status in ('completed', 'verified') or
            (s.status = 'skipped' and coalesce(s.payload->>'skipReason','') in ('already_connected','transferred_rep')) then
        v_items := v_items || jsonb_build_object('bucket','done','key','paperless','label','חיבור לפייפרלס');
      elsif coalesce(s.payload->>'paperlessStatus', '') = 'other_rep' then
        v_items := v_items || jsonb_build_object('bucket','office','key','paperless_transfer',
          'label','העברת חשבון הפייפרלס אלינו',
          'sub','אנחנו מושכים את החשבון מהמייצג הקודם. אין צורך לעשות דבר.');
      -- ‼ נעול ⇒ "בהמשך" ולא "בטיפול המשרד". כל עוד הלקוח לא נרשם אנחנו לא
      -- באמת מטפלים בכלום, ו"בימים הקרובים ניכנס" היה הבטחה לא נכונה שגם
      -- מסתירה ממנו שהכדור עדיין אצלו.
      elsif s.status = 'locked' then
        v_items := v_items || jsonb_strip_nulls(jsonb_build_object(
          'bucket','future','key','paperless_connect',
          'label', coalesce(nullif(s.payload->>'clientTitle',''), 'חיבור לפייפרלס'),
          'sub', public.portal_lock_reason(s.id)));
      else
        v_items := v_items || jsonb_build_object('bucket','office','key','paperless_connect',
          'label', coalesce(nullif(s.payload->>'clientTitle',''), 'חיבור לפייפרלס'),
          'sub', coalesce(nullif(s.payload->>'clientSub',''),
                          'בימים הקרובים ניכנס לחשבון הפייפרלס ונשלים את החיבור. אין צורך לעשות דבר כרגע.'));
      end if;

    -- ‼ מיגרציה 103: אין יותר כפתור-קישור חיצוני. ההרשאה נוצרת בתוך פייפרלס,
    -- לא דרך קישור ששולחים ללקוח. כשהיא לא נעולה ולא הושלמה — הודעת מידע
    -- רגועה בלבד, ללא פעולה. אותה הודעה בדיוק לפני ואחרי שגיא יוצר את
    -- ההרשאה בפועל בצד שלו — אין ל-UI דרך לדעת מתי בדיוק הכרטיס הוזן.
    -- ── חיבור פייפרלס לרשות המסים ────────────────────────────────────────
    -- ‼ הפעולה קורית מחוץ לדף, אבל בניגוד להזנת הכרטיס יש כאן מה לאשר:
    -- הלקוח הוא היחיד שיודע שהחיבור בוצע, וההצהרה שלו היא שסוגרת. אין
    -- לנו גישה לחשבון שלו ברשות המסים ולכן אין מה לאמת.
    when 'rep_client_approval' then
      if s.status in ('completed','verified','skipped') then
        v_items := v_items || jsonb_build_object('bucket','done','key','rep_approval',
          'label', coalesce(nullif(s.payload->>'clientTitle',''), 'זירוז אישור הייצוג באזור האישי'));
      elsif nullif(s.payload->>'clientDeclaredAt','') is not null then
        v_items := v_items || jsonb_build_object('bucket','office','key','rep_approval',
          'label', coalesce(nullif(s.payload->>'clientTitle',''), 'זירוז אישור הייצוג באזור האישי'),
          'sub', 'תודה. אנחנו בודקים שהאישור נקלט אצל רשות המסים.');
      elsif s.status = 'locked' then
        v_items := v_items || jsonb_strip_nulls(jsonb_build_object(
          'bucket','future','key','rep_approval',
          'label', coalesce(nullif(s.payload->>'clientTitle',''), 'זירוז אישור הייצוג באזור האישי'),
          'sub', public.portal_lock_reason(s.id)));
      else
        v_items := v_items || jsonb_strip_nulls(jsonb_build_object(
          'bucket','action','key','rep_approval',
          'label', coalesce(nullif(s.payload->>'clientTitle',''), 'זירוז אישור הייצוג באזור האישי'),
          'sub', nullif(s.payload->>'clientSub',''),
          'note', nullif(s.payload->>'clientNote',''),
          'noteAfter', nullif(s.payload->>'clientNoteAfter',''),
          'cta', coalesce(nullif(s.payload->>'clientCta',''), 'אישרתי באזור האישי'),
          'linkUrl', nullif(s.payload->>'clientLinkUrl',''),
          'linkLabel', nullif(s.payload->>'clientLinkLabel',''),
          'actionKind','portal','actionValue', s.id, 'kind','declare'));
      end if;

    when 'paperless_tax_authority' then
      if s.status in ('completed','verified','skipped') then
        v_items := v_items || jsonb_build_object('bucket','done','key','paperless_tax',
          'label', coalesce(nullif(s.payload->>'clientTitle',''), 'חיבור פייפרלס לרשות המסים'));
      elsif s.status = 'locked' then
        v_items := v_items || jsonb_strip_nulls(jsonb_build_object(
          'bucket','future','key','paperless_tax',
          'label', coalesce(nullif(s.payload->>'clientTitle',''), 'חיבור פייפרלס לרשות המסים'),
          'sub', public.portal_lock_reason(s.id)));
      else
        v_items := v_items || jsonb_strip_nulls(jsonb_build_object(
          'bucket','action','key','paperless_tax',
          'label', coalesce(nullif(s.payload->>'clientTitle',''), 'חיבור פייפרלס לרשות המסים'),
          'sub', nullif(s.payload->>'clientSub',''),
          'note', nullif(s.payload->>'clientNote',''),
          'noteAfter', nullif(s.payload->>'clientNoteAfter',''),
          'cta', coalesce(nullif(s.payload->>'clientCta',''), 'ביצעתי את החיבור'),
          'linkUrl', nullif(s.payload->>'clientLinkUrl',''),
          'actionKind','portal','actionValue', s.id, 'kind','declare'));
      end if;

    when 'retainer_authorization' then
      if coalesce(s.payload->>'method', '') = 'manual_arrangement' then
        continue;
      elsif s.status in ('completed', 'verified') then
        v_items := v_items || jsonb_build_object('bucket','done','key','retainer','label','החיוב החודשי הוסדר');
      -- ‼ סדר הבדיקות: החותמות **קודמות** למנעול, ולא להפך. הריטיינר מתעדכן
      -- לכרטיס אשראי כסעיף האחרון ברשימת החיבור — כלומר לפני שגיא לוחץ
      -- «סיימתי», וכשהשלב הזה עוד נעול. פייפרלס כבר מבקשת מהלקוח כרטיס באותו
      -- רגע, ולכן "בהמשך — ייפתח אוטומטית" היה מסתיר ממנו בדיוק את מה שממתין
      -- לו. נמצא בבדיקה בדפדפן (2026-08-17) — לא בקריאת קוד.
      -- ‼ החותמת קיימת רק אם גיא הצהיר שעשה את זה, ולכן היא ראיה טובה מהמנעול.
      elsif nullif(s.payload->>'cardEnteredAt','') is not null then
        v_items := v_items || jsonb_build_object('bucket','office','key','retainer_charge',
          'label','החיוב החודשי',
          'sub','פרטי הכרטיס התקבלו. נשלים את החיוב החודשי ונעדכן כאן.');
      -- ‼ הכדור אצל הלקוח — אבל הפעולה עצמה קורית בתוך פייפרלס, ולכן כרטיס
      -- מידע בלי פקד: הלקוח לא מאשר לנו כאן שהזין כרטיס. אין לנו דרך לדעת,
      -- ואישור שאין מאחוריו אימות הוא בדיוק מה שלא רצינו.
      elsif nullif(s.payload->>'authorizationCreatedAt','') is not null then
        v_items := v_items || jsonb_build_object('bucket','action','key','retainer_card',
          'kind','info',
          'label','הזנת כרטיס אשראי בפייפרלס',
          -- ‼ שני הערוצים שבהם זה קורה בפועל, בדיוק כפי שגיא תיאר: הודעה
          -- שנשלחת מפייפרלס, או חלון שנפתח בכניסה לאפליקציה.
          -- ‼ גוף שני רבים, כמו בכל הדף ("שאלות? פשוט השיבו למייל"). ערבוב
          -- יחיד ורבים בתוך אותו כרטיס נקרא כמו שתי הודעות שהודבקו יחד.
          'sub','פייפרלס תשלח לכם הודעה להזנת כרטיס אשראי לחיוב החודשי שסיכמנו - או שייפתח לכם חלון להזנת הכרטיס בכניסה הבאה לאפליקציה.',
          -- ‼ "1 ₪" ולא "₪1": בעברית סימן המטבע נדחף אחרי הספרה בכל מקרה, ובלי
          -- הרווח זה נקרא "1₪" ונראה כמו תקלה. נבדק בדפדפן.
          'note','ייתכן שתראו חיוב אימות בסך 1 ₪ - הוא נועד לוודא שהכרטיס תקין, ואינו החיוב החודשי.' || chr(10) ||
                 'אין מה לאשר כאן: ברגע שהכרטיס יוזן, נראה את זה מצידנו ונעדכן.');
      elsif s.status = 'locked' then
        v_items := v_items || jsonb_build_object('bucket','future','key','retainer_future',
          'label','הרשאת התשלום החודשי',
          'sub', coalesce(public.portal_lock_reason(s.id), 'תופיע כאן אחרי חיבור הפייפרלס'));
      -- ‼ 114: עד כאן ההודעה "תתבקש להזין כרטיס" הופיעה ברגע שהשלב נפתח —
      -- כלומר לפני שגיא בכלל עדכן את הריטיינר בפייפרלס. הבטחה שאין מאחוריה
      -- כלום היא בדיוק הפנייה שהיא באה למנוע.
      -- ‼ כן מקדימים ואומרים מה עוד יגיע (הכרעת גיא, אותו יום): הלקוח שסיים
      -- להירשם ולהתקין צריך לדעת שתגיע אליו בקשה להזנת כרטיס — אחרת ההודעה
      -- מפייפרלס נראית לו כמו פנייה מגורם זר. מה שלא נאמר כאן הוא ההנחיה
      -- עצמה ולא חיוב האימות: אלה מופיעים רק כשזה באמת ממתין לו.
      else
        v_items := v_items || jsonb_build_object('bucket','office','key','retainer_info',
          'label', coalesce(nullif(s.payload->>'clientTitle',''), 'החיוב החודשי'),
          'sub', 'אנחנו מסדירים מול פייפרלס את החיוב החודשי שסיכמנו. בהמשך תגיע אליכם מפייפרלס בקשה להזנת כרטיס אשראי - נעדכן אותכם כאן. אין צורך לעשות דבר כרגע.');
      end if;

    when 'intake_questionnaire' then
      if s.status in ('completed', 'verified') then
        v_items := v_items || jsonb_build_object('bucket','done','key','intake','label','עדכון סטטוס מיסויי');
      elsif s.status = 'locked' then
        v_items := v_items || jsonb_strip_nulls(jsonb_build_object(
          'bucket','future','key','intake_future','label','עדכון סטטוס מיסויי',
          'sub', public.portal_lock_reason(s.id)));
      elsif s.status = 'waiting_client' and c.intake_token is not null then
        v_items := v_items || jsonb_strip_nulls(jsonb_build_object('bucket','action','key','intake_fill','label','עדכון סטטוס מיסויי','sub','עונים רק על מה שרלוונטי · אפשר לעצור ולהמשיך','actionKind','intake','actionValue', c.intake_token));
      end if;

    when 'release_letter' then
      if s.status not in ('completed', 'verified', 'skipped') then v_prev_open := true;
      else v_prev_done := true; end if;

    when 'materials_received' then
      if s.status not in ('completed', 'verified', 'skipped') then v_prev_open := true;
      else v_prev_done := true; end if;

    when 'file_opening' then
      if s.status in ('completed', 'verified') then
        v_items := v_items || jsonb_build_object('bucket','done','key','files','label','פתיחת התיקים ברשויות');
      elsif s.status not in ('skipped') then
        v_items := v_items || jsonb_build_object('bucket','office','key','files_office','label','פתיחת התיקים ברשויות','sub','מע"מ, מס הכנסה וביטוח לאומי - בטיפולנו');
      end if;

    when 'authority_representation' then
      v_label := coalesce(nullif(s.payload->>'title',''), 'ייצוג ברשות');
      if s.status in ('pending','in_progress') then
        v_items := v_items || jsonb_build_object('bucket','office','key','authrep_'||s.id,
          'label', v_label,
          'sub', case when nullif(req.execution -> (case when s.payload->>'subjectRole' = 'spouse' then 'nationalInsuranceSpouse' else 'nationalInsurance' end) ->> 'referenceNumber', '') is not null
                      then 'האסמכתא התקבלה — נשלח הוראות אישור בקרוב'
                      else 'בטיפול המשרד — הזנת הייצוג בביטוח לאומי' end);
      elsif s.status = 'waiting_client' then
        v_items := v_items || jsonb_strip_nulls(jsonb_build_object(
          'bucket','office','key','authrep_'||s.id, 'kind','message',
          'label', v_label,
          'note', 'האסמכתא: ' || coalesce(nullif(req.execution -> (case when s.payload->>'subjectRole' = 'spouse' then 'nationalInsuranceSpouse' else 'nationalInsurance' end) ->> 'referenceNumber', ''), '') ||
            case when nullif(req.execution -> (case when s.payload->>'subjectRole' = 'spouse' then 'nationalInsuranceSpouse' else 'nationalInsurance' end) ->> 'deadline', '') is not null
                 then chr(10) || 'יש לאשר עד ' || to_char((req.execution -> (case when s.payload->>'subjectRole' = 'spouse' then 'nationalInsuranceSpouse' else 'nationalInsurance' end) ->> 'deadline')::date, 'DD.MM.YYYY')
                 else '' end ||
            chr(10) || 'ניתן לאשר באתר הביטוח הלאומי או בטלפון 02-5393740. אם ההודעה לא הגיעה - אפשר להעביר את ההוראות.',
          'linkUrl', 'https://b2b.btl.gov.il/BTL.ILG.PAYMENTS/IshurIpuyKoachInfo.aspx',
          'linkLabel', 'לאתר הביטוח הלאומי'));
      elsif s.status = 'blocked' then
        v_items := v_items || jsonb_build_object('bucket','office','key','authrep_'||s.id,
          'label', v_label, 'sub', 'האסמכתא פגה - נזין מחדש');
      elsif s.status in ('completed','verified') then
        v_items := v_items || jsonb_build_object('bucket','done','key','authrep_'||s.id,
          'label', v_label || ' · אושר');
      end if;

    else
      continue;
    end case;

    if p_mode = 'preview' and s.published_at is null
       and jsonb_array_length(v_items) > v_before then
      select coalesce(jsonb_agg(
               case when ord > v_before then x || jsonb_build_object('draft', true) else x end
               order by ord), '[]'::jsonb)
        into v_items
        from jsonb_array_elements(v_items) with ordinality t(x, ord);
    end if;

    if p_mode = 'preview' and s.pending_cancel
       and jsonb_array_length(v_items) > v_before then
      select coalesce(jsonb_agg(
               case when ord > v_before then x || jsonb_build_object('removing', true) else x end
               order by ord), '[]'::jsonb)
        into v_items
        from jsonb_array_elements(v_items) with ordinality t(x, ord);
    end if;
    -- 172: נערך — בקשה מפורסמת שיש עליה טיוטה; הפאנל סופר "ישתנו".
    if p_mode = 'preview' and s.published_at is not null and s.draft_payload is not null
       and jsonb_array_length(v_items) > v_before then
      select coalesce(jsonb_agg(
               case when ord > v_before then x || jsonb_build_object('edited', true) else x end
               order by ord), '[]'::jsonb)
        into v_items
        from jsonb_array_elements(v_items) with ordinality t(x, ord);
    end if;
  end loop;

  if not v_rep_seen and v_rep_item is not null then
    v_items := v_items || v_rep_item;
  end if;

  if v_prev_open then
    v_items := v_items || jsonb_build_object('bucket','office','key','prev_accountant','label','קבלת החומרים מרואה החשבון הקודם','sub','ביקשנו את התיק - בתהליך');
  elsif v_prev_done then
    v_items := v_items || jsonb_build_object('bucket','done','key','prev_accountant','label','החומרים מרואה החשבון הקודם התקבלו');
  end if;

  if v_has_eng and not v_published and p_mode = 'live' then
    v_items := v_items || jsonb_build_object('bucket','office','key','process_pending',
      'label','אנחנו מכינים את המשך התהליך','sub','נעדכן אותך כאן ברגע שיהיה מה לעשות');
  end if;

  -- ‼ 144: הודעת מלל אינה נספרת. אין לה השלמה, ולכן כל ספירה שכוללת אותה
  -- מייצרת מונה שלעולם לא ייסגר — והופכת הודעה למטלה פתוחה לנצח. מאותה
  -- סיבה היא גם אינה משפיעה על journeyStage שנגזר מהיחס למטה.
  select count(*) filter (where x->>'bucket' = 'done'),
         count(*) filter (where x->>'bucket' <> 'future'
                            and coalesce(x->>'kind','') <> 'message')
    into v_done, v_total
    from jsonb_array_elements(v_items) x;

  if not v_has_eng and quo.id is null and req.id is not null then
    v_stage := case when req.status = 'active' then 'active' else 'identity' end;
  elsif not v_has_eng then
    v_stage := case when quo.status = 'approved' then 'identity' else 'quote' end;
  elsif req.id is not null and coalesce(req.status, '') <> 'active' then
    v_stage := 'identity';
  elsif v_done < v_total then
    v_stage := 'setup';
  else
    v_stage := 'active';
  end if;

  return jsonb_build_object(
    'ok', true,
    'clientFirstName', v_first,
    'firmName', coalesce(p.firm_name, 'המשרד'),
    'branding', coalesce(p.branding, '{}'::jsonb),
    'done', v_done, 'total', v_total,
    'journeyStage', v_stage,
    'items', v_items);
end;
$function$;


revoke all on function public.shaam_creation_requirements(jsonb) from public, anon;
revoke all on function public.shaam_confirmed_identity_documents_for(text, text, text) from public, anon, authenticated;
revoke all on function public._shaam_identity_confirm(text, text, text) from public, anon, authenticated;
revoke all on function public.shaam_identity_confirm_step_trg() from public, anon, authenticated;
revoke all on function public.ensure_shaam_identity_confirm_step(text, text, text, text) from public, anon, authenticated;
revoke all on function public.prepare_request_for_signing(text, boolean) from public, anon;
grant execute on function public.prepare_request_for_signing(text, boolean) to authenticated;
revoke all on function public.remove_authority_before_signing(text, text, text) from public, anon;
grant execute on function public.remove_authority_before_signing(text, text, text) to authenticated;
revoke all on function public._shaam_track_archive(jsonb, text, text) from public, anon, authenticated;
revoke all on function public.shaam_rows_all_terminal(jsonb, text) from public, anon;
revoke all on function public.confirm_shaam_request_cancelled(text, text) from public, anon;
grant execute on function public.confirm_shaam_request_cancelled(text, text) to authenticated;
revoke all on function public.guard_rep_execution_shaam() from public, anon, authenticated;
revoke all on function public._shaam_confirm_steps_after_send(text) from public, anon, authenticated;
revoke all on function public.shaam_presign_client_actions(text) from public, anon, authenticated;

select public.assert_domain_function_invariants();
