-- ═══════════════════════════════════════════════════════════════════════════
--  204 — מסמכים ששע״ם דורשת לשידור ייפוי הכוח: לאדם הנכון, בהמתנה עמידה,
--        והמשך אוטומטי אחד כשהמסמך מגיע
-- ═══════════════════════════════════════════════════════════════════════════
--  שני מושגים, ואסור לערבב ביניהם:
--   א. מסמך מזהה שהמשרד/PIVO ביקש (קליטה, «אעלה מאוחר יותר», תבנית המסע) —
--      בקשה פתוחה ללקוח, **לא חוסמת** שליחה, חתימה או ייצוג.
--   ב. מסמך ששע״ם דורשת — נקרא ממסך «טעינת מסמכים» (שלב 4) בזמן השידור, אחרי
--      שהלקוח חתם. חוסם **רק** את השידור לשע״ם, עד שהוא אצלנו.
--
--  מקור האמת למסך: קוד האפליקציה של שע״ם (worker/test/fixtures/shaam-src-2026-09-23/).
--  חמש שורות קבועות; «תצלום תעודת זהות או רישיון נהיגה» היא שורה **אחת**
--  שמקבלת כל אחד מהשניים (idOrLicense), ו«צילום דרכון» נפרדת.
--
--  ‼ הבעלים של דרישה = האדם שהת.ז. שלו בכותרת המסך בשע״ם (מדווח ע"י העובד
--  כ-progress.shaamDocuments.entityId), ממופה לאדם אחד בכרטיס. לא התפקיד
--  במשימה ולא הנחה. אין מיפוי ודאי ⇒ needs_document_assignment.
--  ‼ מסמך של אדם אחד לעולם אינו מספק דרישה של אחר.
--
--  מה כאן:
--   ①  representation_request_for_client — חיפוש אחד עקבי לבקשת הייצוג.
--   ②  shaam_person_for_entity — ת.ז. מהכותרת ⇒ 'client' | 'spouse' | null.
--   ③  shaam_identity_doc_kind — idOrLicense ורישיון נהיגה.
--   ④  shaam_identity_documents_for — אילו מסמכים (של אותו אדם, מהסוג הנכון).
--   ⑤  ensure_shaam_identity_document_request — requiredBy='shaam', בלי כפילות.
--   ⑥  סנכרון identity_docs ⇄ «מסמכים מהלקוח»: תיקון ה-NULL (191), לפי סוג, מסמך קיים.
--   ⑦  office_attach_identity_doc — צילום שהגיע למשרד נרשם על הבקשה.
--   ⑧  automation_job_identity_document — הבחירה בשרת, לעובד שמחזיק משימה.
--   ⑨  shaamDocuments ⇒ execution.shaam[key].requiredDocuments (טריגר חדש).
--   ⑩  documentsGate — מצב ההמתנה העמיד, מתוצאת משימת השידור.
--   ⑪  resume_shaam_submissions_for_client — משימה חדשה אחת כשהמסמך מגיע.
--   ⑫  הדף האישי: «נדרש על ידי רשות המסים להשלמת הייצוג» על פריט כזה.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── ① בקשת הייצוג של לקוח — כלל אחד לכולם ──────────────────────────────────
--  ‼ 191 חיפש «האחרונה לפי linked_client_id» ו-201 חיפש לפי
--  clients.representation_request_id. כששני אלה לא אותה שורה, צילום נרשם
--  על בקשה אחת והדרישה נבדקת על אחרת. כאן: הבקשה שהכרטיס מצביע עליה, אם היא
--  באמת של הלקוח הזה; אחרת — האחרונה שלו.
create or replace function public.representation_request_for_client(p_client_id text)
returns public.representation_requests
language sql
stable
security definer
set search_path to 'public'
as $function$
  select r.*
    from public.representation_requests r
   where r.linked_client_id = p_client_id
   order by (r.id = (select c.representation_request_id from public.clients c where c.id = p_client_id)) desc nulls last,
            r.created_at desc
   limit 1;
$function$;

revoke execute on function public.representation_request_for_client(text) from public, anon, authenticated;

-- ── ② הת.ז. שבכותרת שע״ם ⇒ אדם בכרטיס ─────────────────────────────────────
--  ‼ התאמה מדויקת לאדם **אחד**. אף אחד, או שניהם (ת.ז. זהה — נתון פגום) ⇒ null.
create or replace function public.shaam_person_for_entity(p_client_id text, p_entity_id text)
returns text
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  c      public.clients%rowtype;
  v_e    text := ltrim(regexp_replace(coalesce(p_entity_id, ''), '\D', '', 'g'), '0');
  v_cl   text;
  v_sp   text;
begin
  if v_e = '' then return null; end if;
  select * into c from public.clients where id = p_client_id;
  if c.id is null then return null; end if;
  v_cl := ltrim(regexp_replace(coalesce(c.id_number, ''), '\D', '', 'g'), '0');
  v_sp := ltrim(regexp_replace(coalesce(c.spouse_id_number, ''), '\D', '', 'g'), '0');
  if v_cl = v_e and v_sp <> v_e then return 'client'; end if;
  if v_sp = v_e and v_cl <> v_e then return 'spouse'; end if;
  return null;
end;
$function$;

revoke execute on function public.shaam_person_for_entity(text, text) from public, anon, authenticated;

-- ── ③ סוג המסמך מתוך הכיתוב בשע״ם ──────────────────────────────────────────
--  ‼ שורה 2 בשע״ם היא «תצלום תעודת זהות או רישיון נהיגה» — אחד מהשניים.
--  201 סיווג אותה כ-idCard, ולכן רישיון שכבר אצלנו לא נחשב. תאום ב-TS:
--  shaamIdentityDocKind (src/features/representation/shaamRepresentation.ts).
create or replace function public.shaam_identity_doc_kind(p_label text)
returns text
language sql
immutable
set search_path to 'public'
as $function$
  select case
    when l ~ '(תעודת\s*זהות|ת\.\s*ז\.?|תז\M|ספח)' and l ~ 'רישיון|רשיון' then 'idOrLicense'
    when l ~ '(תעודת\s*זהות|ת\.\s*ז\.?|תז\M|ספח)' and l ~ 'דרכון' then 'idOrPassport'
    when l ~ '(תעודת\s*זהות|ת\.\s*ז\.?|תז\M|ספח)' then 'idCard'
    when l ~ 'דרכון' then 'passport'
    when l ~ '(רישיון|רשיון)\s*נהיגה' then 'driverLicense'
    else null
  end
  from (select regexp_replace(coalesce(p_label, ''), '["״׳'']', '', 'g') as l) x;
$function$;

--  אילו סוגי צילום מספקים דרישה מסוג נתון — לפי סדר העדפה.
create or replace function public.shaam_doc_kinds_accepted(p_kind text)
returns text[]
language sql
immutable
set search_path to 'public'
as $function$
  select case p_kind
    when 'idOrLicense'  then array['idCard', 'driverLicense']
    when 'idCard'       then array['idCard']
    when 'driverLicense' then array['driverLicense']
    when 'passport'     then array['passport']
    when 'idOrPassport' then array['idCard', 'passport']
    else null end;
$function$;

--  מפתח הפריט ב«מסמכים מהלקוח» לפי אדם **וסוג**: דרכון אינו «צילום ת.ז.».
create or replace function public.identity_doc_item_key_for(p_person text, p_kind text)
returns text
language sql
immutable
set search_path to 'public'
as $function$
  select case when p_kind = 'passport'
              then case p_person when 'spouse' then 'passport_spouse' else 'passport' end
              else public.identity_doc_item_key(p_person) end;
$function$;

revoke execute on function public.shaam_doc_kinds_accepted(text) from public, anon;
revoke execute on function public.identity_doc_item_key_for(text, text) from public, anon, authenticated;

-- ── ④ המסמכים שמספקים דרישה — של האדם הזה בלבד ───────────────────────────
--  ‼ רק מה שרשום ב-identity_docs[אדם] ושהמסמך באמת קיים בתיק של הלקוח.
--  בלי נפילה לאדם אחר, ובלי «צילום ת.ז. כלשהו שיש בתיק».
--  ‼ כמה רשומות מאותו סוג = אותו מסמך (שני צדדים / צילום חוזר — ראה
--  onboarding-upload-id) ⇒ כולן יחד, לפי הסדר. סוגים שונים לא מתערבבים:
--  נבחרת הקבוצה הראשונה לפי סדר ההעדפה.
--  מחזיר {person, docKind, documents:[…]} או {missing:true}.
create or replace function public.shaam_identity_documents_for(p_client_id text, p_person text, p_kind text)
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
             'storagePath', d.storage_path, 'at', e.value ->> 'at') order by e.ord)
      into v_docs
      from jsonb_array_elements(
             case when jsonb_typeof(r.identity_docs -> p_person) = 'array' then r.identity_docs -> p_person else '[]'::jsonb end
           ) with ordinality e(value, ord)
      join public.documents d
        on d.id = e.value ->> 'documentId'
       and d.client_id = p_client_id
       and d.user_id = r.user_id
     where coalesce(nullif(e.value ->> 'docKind', ''), 'idCard') = v_kind;
    if v_docs is not null and jsonb_array_length(v_docs) > 0 then
      return jsonb_build_object('person', p_person, 'docKind', v_kind, 'documents', v_docs);
    end if;
  end loop;
  return jsonb_build_object('missing', true, 'reason', 'no_document');
end;
$function$;

revoke execute on function public.shaam_identity_documents_for(text, text, text) from public, anon, authenticated;

--  האם כל הקבצים של הבחירה ניתנים להמרה ל-PDF (PDF / JPEG / PNG).
--  ‼ קירוב לפי file_type — ההכרעה הסופית לפי התוכן היא ב-edge (imageToPdfCore).
create or replace function public._shaam_docs_convertible(p_selection jsonb)
returns boolean
language sql
immutable
set search_path to 'public'
as $function$
  select coalesce(bool_and(lower(coalesce(x ->> 'fileType', '')) in
           ('application/pdf', 'image/jpeg', 'image/jpg', 'image/png')), false)
    from jsonb_array_elements(coalesce(p_selection -> 'documents', '[]'::jsonb)) x;
$function$;

revoke execute on function public._shaam_docs_convertible(jsonb) from public, anon, authenticated;

-- ── ⑤ בקשת מסמך ללקוח כששע״ם דורשת — פעם אחת, מסומנת «שע״ם» ─────────────
--  הבסיס: הגוף החי של 201. השינויים:
--   · requiredBy='shaam' + docKind על הפריט (הדף האישי מציג «נדרש על ידי רשות
--     המסים להשלמת הייצוג»), ומפתח לפי סוג (דרכון נפרד מת.ז.).
--   · idOrLicense — רישיון נהיגה של אותו אדם מספק.
--   · ‼ כפילות: פריט עם אותו מפתח שסומן «הושלם» בלי מסמך (סימון ידני, או באג
--     ה-NULL של 191) נפתח מחדש **במקומו** — לא נוסף פריט שני שאף העלאה לא סוגרת.
--   · פריט פתוח קיים (למשל בקשה של המשרד) מקבל את הסימון — עכשיו שע״ם דורשת אותו.
--   · חיפוש הבקשה אחיד (①).
create or replace function public.ensure_shaam_identity_document_request(p_client_id text, p_person text, p_kind text, p_shaam_label text)
 returns text
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
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
  if exists (
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

-- ── ⑥א identity_docs ⇒ «מסמכים מהלקוח» — הפריט של אותו אדם ואותו סוג ──────
--  הבסיס: הגוף החי של 191. השינויים:
--   · ‼ באג ה-NULL: אדם בלי מפתח ב-identity_docs נותן jsonb_typeof NULL, ו-
--     «NULL <> 'array'» אינו true — התנאי לא דילג, ופריט הצילום **של בן/בת
--     הזוג** נסגר בלי מסמך ברגע שרק הנישום העלה. CASE במקום השוואה ישירה.
--   · לפי סוג: פריט ת.ז. נסגר בצילום ת.ז./רישיון, ופריט דרכון רק בדרכון.
--   · חיפוש הבקשה אחיד (①).
create or replace function public.sync_identity_docs_to_client_documents(p_client_id text)
 returns integer
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  r        public.representation_requests;
  s        record;
  v_person text;
  v_key    text;
  v_kind   text;
  v_last   jsonb;
  v_arr    jsonb;
  v_list   jsonb;
  v_idx    int;
  v_item   jsonb;
  v_changed int := 0;
  v_touched boolean;
  v_remaining int;
begin
  r := public.representation_request_for_client(p_client_id);
  if r.id is null or r.identity_docs is null or r.identity_docs = '{}'::jsonb then return 0; end if;

  for s in
    select * from public.onboarding_steps
     where client_id = p_client_id and step_type = 'client_documents'
       and status not in ('completed','verified','skipped','cancelled')
  loop
    v_list := coalesce(s.payload->'checklist', '[]'::jsonb);
    v_touched := false;
    foreach v_person in array array['client','spouse'] loop
      v_arr := case when jsonb_typeof(r.identity_docs->v_person) = 'array'
                    then r.identity_docs->v_person else '[]'::jsonb end;
      if jsonb_array_length(v_arr) = 0 then continue; end if;
      foreach v_kind in array array['idCard','passport'] loop
        v_key := public.identity_doc_item_key_for(v_person, v_kind);
        v_idx := null; v_item := null;
        select ord - 1, x into v_idx, v_item
          from jsonb_array_elements(v_list) with ordinality t(x, ord)
         where x->>'key' = v_key
         order by ord limit 1;
        if v_idx is null or coalesce((v_item->>'done')::boolean, false) then continue; end if;
        -- הצילום האחרון של האדם הזה מסוג שהפריט מקבל — ‼ ושבאמת נמצא בתיק:
        -- רישום שמצביע על מסמך שאינו קיים אינו «התקבל» (204, כמו ④).
        select e.value into v_last
          from jsonb_array_elements(v_arr) with ordinality e(value, ord)
          join public.documents d on d.id = e.value->>'documentId' and d.client_id = p_client_id
         where nullif(e.value->>'documentId', '') is not null
           and coalesce(nullif(e.value->>'docKind', ''), 'idCard') = any(
                 public.shaam_doc_kinds_accepted(
                   case when v_kind = 'passport' then 'passport'
                        else coalesce(nullif(v_item->>'docKind', ''), 'idOrLicense') end))
         order by e.ord desc limit 1;
        if v_last is null then continue; end if;
        v_list := jsonb_set(v_list, array[v_idx::text],
          v_item || jsonb_build_object(
            'done', true,
            'documentId', v_last->>'documentId',
            'doneAt', coalesce(v_last->>'at', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')),
            'source', coalesce(v_item->>'source', 'representation_onboarding')));
        v_touched := true;
        v_changed := v_changed + 1;
        perform public.log_onboarding_event(s.user_id, s.id, s.engagement_id, 'note', 'system',
          'צילום התעודה התקבל בקליטת הייצוג - הפריט נסגר מעצמו',
          jsonb_build_object('itemKey', v_key, 'documentId', v_last->>'documentId', 'requestId', r.id));
      end loop;
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

-- ── ⑥ב «מסמכים מהלקוח» ⇒ identity_docs — עם הסוג הנכון ──────────────────
--  הבסיס: הגוף החי של 191. השינויים: פריטי דרכון; docKind לפי הפריט (דרכון)
--  או לפי קטגוריית המסמך (רישיון נהיגה) — במקום 'idCard' קשיח; חיפוש אחיד.
create or replace function public.client_documents_to_identity_docs_trg()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
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
               'via', 'client_documents'))),
             true)
     where id = r.id
     returning * into r;
  end loop;
  return new;
end;
$function$;

-- ── ⑦ צילום שהגיע למשרד — נרשם על הבקשה, לאדם שנבחר במפורש ─────────────────
--  ‼ המשרד בוחר של מי הצילום. המסמך חייב להיות בתיק של הלקוח המקושר ושל אותו
--  משתמש; צירוף חוזר אינו כפול. הסוג: מפורש, או לפי קטגוריית המסמך.
create or replace function public.office_attach_identity_doc(
  p_request_id text, p_person text, p_document_id text, p_doc_kind text default null
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
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

  return jsonb_build_object('ok', true, 'count', jsonb_array_length(v_docs -> p_person), 'docKind', v_kind);
end;
$function$;

-- ‼ גרסת 203 הזמנית (staging בלבד, שלוש פרמטרים) — מוחלפת בזו.
drop function if exists public.office_attach_identity_doc(text, text, text);
revoke execute on function public.office_attach_identity_doc(text, text, text, text) from public, anon;
grant  execute on function public.office_attach_identity_doc(text, text, text, text) to authenticated;

-- ── ⑧ המסמך לעובד — בגבול המשימה שהוא מחזיק, לאדם שבכותרת בלבד ───────────
--  ‼ העובד מוסר את הת.ז. שקרא מכותרת המסך, לא אדם. המיפוי לאדם נעשה כאן
--  (②), ורק המסמכים שלו מהסוג שהשורה מקבלת חוזרים (④).
--  מחזיר {ok, person, personName, docKind, documents:[…]} או {ok:false, error}.
create or replace function public.automation_job_identity_document(
  p_worker_id text, p_job_id text, p_entity_id text, p_slot_kind text
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
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

  v_sel := public.shaam_identity_documents_for(v_job.client_id, v_person, p_slot_kind);
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

revoke execute on function public.automation_job_identity_document(text, text, text, text) from public, anon, authenticated;
grant  execute on function public.automation_job_identity_document(text, text, text, text) to service_role;

-- ── ⑨ מה ששע״ם הציגה ⇒ הדרישה על ההגשה + בקשת מסמך ללקוח ─────────────────
--  העובד (204) מדווח progress.shaamDocuments = {observedAt, entityId, rows:[{slotId,
--  kind, label, hasFile, required}]} — קריאה בלבד, לפני כל החלטה.
--  ‼ הטריגר הישן (201) נשאר לתאימות עם עובד ישן ששולח shaamRequiredDocuments.
create or replace function public.sync_shaam_documents_from_progress()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_docs   jsonb := new.progress -> 'shaamDocuments';
  v_key    text := coalesce(new.input ->> 'submissionKey', '');
  r        public.representation_requests;
  c        public.clients%rowtype;
  v_entity text;
  v_person text;
  v_name   text;
  x        jsonb;
  v_kind   text;
  v_res    text;
  v_out    jsonb := '[]'::jsonb;
begin
  if (old.progress -> 'shaamDocuments') is not distinct from v_docs then return new; end if;
  if v_key = '' or jsonb_typeof(v_docs -> 'rows') <> 'array' then return new; end if;
  r := public.representation_request_for_client(new.client_id);
  if r.id is null then return new; end if;
  select * into c from public.clients where id = new.client_id;

  v_entity := v_docs ->> 'entityId';
  v_person := public.shaam_person_for_entity(new.client_id, v_entity);
  v_name := case v_person
    when 'spouse' then trim(coalesce(c.spouse_first_name, '') || ' ' || coalesce(c.spouse_last_name, ''))
    when 'client' then trim(coalesce(c.first_name, '') || ' ' || coalesce(c.last_name, ''))
    else null end;

  for x in select value from jsonb_array_elements(v_docs -> 'rows') loop
    v_kind := x ->> 'kind';
    if v_kind = 'poa' then continue; end if;
    v_res := case
      when v_kind not in ('idOrLicense', 'passport') then 'unsupported'
      when v_person is null then 'needs_document_assignment'
      else public.ensure_shaam_identity_document_request(new.client_id, v_person, v_kind, x ->> 'label') end;
    v_out := v_out || jsonb_strip_nulls(jsonb_build_object(
      'slotId', x -> 'slotId', 'label', x ->> 'label', 'kind', v_kind, 'required', true,
      'requiredBy', 'shaam', 'person', v_person, 'personName', v_name, 'handling', v_res));
  end loop;

  update public.representation_requests
     set execution = jsonb_set(
           coalesce(execution, '{}'::jsonb), array['shaam'],
           coalesce(execution -> 'shaam', '{}'::jsonb) || jsonb_build_object(v_key,
             coalesce(execution #> array['shaam', v_key], '{}'::jsonb)
               || jsonb_build_object(
                    'requiredDocuments', v_out,
                    'requiredDocumentsObservedAt', coalesce(v_docs ->> 'observedAt', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')),
                    'requiredDocumentsEntityId', v_entity,
                    'requiredDocumentsPerson', v_person))),
         updated_at = now()
   where id = r.id;
  return new;
end;
$function$;

drop trigger if exists trg_sync_shaam_documents_from_progress on public.automation_jobs;
create trigger trg_sync_shaam_documents_from_progress
  after update of progress on public.automation_jobs
  for each row
  when (new.action_type = 'shaam.submit_poa' and new.progress ? 'shaamDocuments')
  execute function public.sync_shaam_documents_from_progress();

-- ── ⑩ מצב ההמתנה העמיד — מתוצאת משימת השידור ─────────────────────────────
--  ‼ העובד מסיים משימה שעצרה על מסמכים כ-failed (לא needs_human), כדי שהמקום
--  היחיד של (לקוח, שידור) — automation_jobs_open_unique — יתפנה. את ההמתנה
--  עצמה נושא documentsGate על ההגשה, לא המשימה.
create or replace function public.sync_shaam_documents_gate_from_job()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
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

  -- ‼ משימה של הגשה אחרת עשויה לחכות למקום שהתפנה (זוג באותו כרטיס).
  perform public.resume_shaam_submissions_for_client(new.client_id, 'job_finished');
  return new;
end;
$function$;

-- ── ⑪ המשך אחד כשהמסמך הנכון הגיע ────────────────────────────────────────
--  ‼ פעם אחת בדיוק: המעבר awaiting ⇒ resume_queued נעשה תחת נעילת השורה,
--  והאינדקס automation_jobs_open_unique מונע שתי משימות פתוחות. אין לולאה:
--  הפונקציה רצה רק על אירוע מסמך (identity_docs השתנה) או כשמשימה פינתה את
--  המקום שחסם המשך קודם (resumePendingOpenJob). משימה שנגעה בשע״ם לעולם לא
--  משמשת בסיס להמשך (196).
--  @param p_reason 'identity_docs' | 'job_finished'
create or replace function public.resume_shaam_submissions_for_client(p_client_id text, p_reason text default 'identity_docs')
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
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
      v_sel := public.shaam_identity_documents_for(p_client_id, v_person, x ->> 'kind');
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

revoke execute on function public.resume_shaam_submissions_for_client(text, text) from public, anon, authenticated;

drop trigger if exists trg_sync_shaam_documents_gate_from_job on public.automation_jobs;
create trigger trg_sync_shaam_documents_gate_from_job
  after update of status on public.automation_jobs
  for each row
  when (new.action_type = 'shaam.submit_poa')
  execute function public.sync_shaam_documents_gate_from_job();

--  אירוע מסמך: כל דרך שבה צילום נרשם על הבקשה (הדף האישי, הקליטה, המשרד)
--  מעדכנת את identity_docs — טריגר אחד מכסה את כולן.
create or replace function public.resume_shaam_after_identity_docs_trg()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if old.identity_docs is not distinct from new.identity_docs or new.linked_client_id is null then return new; end if;
  perform public.resume_shaam_submissions_for_client(new.linked_client_id, 'identity_docs');
  return new;
end;
$function$;

drop trigger if exists trg_resume_shaam_after_identity_docs on public.representation_requests;
create trigger trg_resume_shaam_after_identity_docs
  after update of identity_docs on public.representation_requests
  for each row
  execute function public.resume_shaam_after_identity_docs_trg();

revoke execute on function public.sync_shaam_documents_from_progress() from public, anon, authenticated;
revoke execute on function public.sync_shaam_documents_gate_from_job() from public, anon, authenticated;
revoke execute on function public.resume_shaam_after_identity_docs_trg() from public, anon, authenticated;


-- ── ⑫ הדף האישי: פריט ששע״ם דרשה נושא הסבר ─────────────────────────────────
--  ‼ הגוף הוא הגוף החי מהפרודקשן (27.09.2026, זהה ל-staging מלבד הערה) — רק
--  בניית פריטי ה-checklist שונתה: 'note' כשהפריט requiredBy='shaam'. פריט
--  החתימה (rep_sign) לא נגע: החתימה אינה תלויה במסמך.
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
      v_rep_item := jsonb_build_object('bucket','office','key','rep_office','label','ייפוי הכוח','sub','נחתם על ידך - עכשיו בבדיקה ובחתימה אצלנו');
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
