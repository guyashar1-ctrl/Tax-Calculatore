-- ════════════════════════════════════════════════════════════════════════════
-- 212 · תיקייה ושם לכל מסמך של הבקשה (01.10.2026)
-- ════════════════════════════════════════════════════════════════════════════
-- גיא: «השמות של המסמכים לא טובים — הייתי מצפה לתעודת זהות הדסה, תעודת זהות
-- יאיר … ברגע שמעלים תמונה — בתיקייה ששם יש גם PDF וגם התמונה. בייפוי כוח —
-- תיקייה של ייפוי הכוח, עם לחתימה וחתום». ייפוי כוח שהוחלף ⇒ תת-תיקייה «ישן».
--
-- ‼ מבנה בתיק המסמכים של הלקוח:
--     📁 תעודת זהות - הדסה      הצילומים שהועלו להדסה + ה-PDF שנבנה מהם
--          📁 ישן                PDF מצילום שהוחלף
--     📁 תעודת זהות - יאיר
--     📁 ייפוי כוח              לחתימה · חתום (לקוח + משרד)
--          📁 ישן                טופס שהוחלף / בקשה שבוטלה
--   הבעלות נקבעת לפי המקום שאליו הועלה הקובץ (identity_docs), לא לפי התוכן.
--   קובץ ששייך לשני בני הזוג (הועלה לשניהם) נשמר פעם אחת, בתיקייה של הראשון,
--   ובשם שלו מופיעים שניהם.
-- ‼ קובץ שהמשרד כבר תייק בעצמו בתיקייה שלו — לא זז ולא מקבל שם אחר. נוגעים רק
--   במסמך שבשורש התיק או בתיקייה שהמערכת יצרה (system_key).
-- ‼ שינוי שם/תיקייה בלבד: לא נוגעים ב-storage_path/file_size/uploaded_at, ולכן
--   ה-PDF לא נבנה מחדש (טביעת המקורות של 211 לא משתנה).

-- ── ① עמודות ─────────────────────────────────────────────────────────────
alter table public.document_folders add column if not exists system_key text;
create unique index if not exists document_folders_system_key_uniq
  on public.document_folders (client_id, system_key) where system_key is not null;
-- טביעת תוכן: אותו קובץ בדיוק שמועלה שוב לאותו לקוח נשמר פעם אחת (בפונקציות ההעלאה).
alter table public.documents add column if not exists content_sha256 text;
create index if not exists documents_client_sha_idx
  on public.documents (client_id, content_sha256) where content_sha256 is not null;

-- ── ② שמות ──────────────────────────────────────────────────────────────
create or replace function public._doc_person_first(p_client text, p_person text)
returns text
language sql
stable
security definer
set search_path to 'public'
as $function$
  select coalesce(
    (select nullif(trim(case when p_person = 'spouse' then c.spouse_first_name else c.first_name end), '')
       from public.clients c where c.id = p_client),
    case when p_person = 'spouse' then 'בן/בת הזוג' else 'הנישום' end);
$function$;

create or replace function public._doc_person_full(p_client text, p_person text)
returns text
language sql
stable
security definer
set search_path to 'public'
as $function$
  select coalesce(
    (select nullif(trim(case when p_person = 'spouse'
                             then coalesce(c.spouse_first_name, '') || ' ' || coalesce(c.spouse_last_name, '')
                             else coalesce(c.first_name, '') || ' ' || coalesce(c.last_name, '') end), '')
       from public.clients c where c.id = p_client),
    public._doc_person_first(p_client, p_person));
$function$;

create or replace function public._id_kind_label(p_kind text)
returns text
language sql
immutable
as $function$
  select case p_kind when 'driverLicense' then 'רישיון נהיגה' when 'passport' then 'דרכון' else 'תעודת זהות' end;
$function$;

-- ── ③ תיקיית מערכת ──────────────────────────────────────────────────────
-- ‼ לפי system_key ולא לפי שם: המשרד רשאי לשנות שם/להזיז — נשארים איתה.
-- תיקייה באותו שם שהמשרד כבר יצר באותו מקום — מאמצים אותה, לא יוצרים כפולה.
create or replace function public._ensure_system_folder(p_user uuid, p_client text, p_parent text, p_key text, p_name text)
returns text
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v text;
begin
  select id into v from public.document_folders where client_id = p_client and system_key = p_key;
  if v is not null then return v; end if;
  select id into v from public.document_folders
   where user_id = p_user and client_id = p_client and system_key is null
     and coalesce(parent_id, '') = coalesce(p_parent, '') and lower(name) = lower(p_name)
   limit 1;
  if v is not null then
    update public.document_folders set system_key = p_key where id = v;
    return v;
  end if;
  insert into public.document_folders (user_id, client_id, parent_id, name, system_key)
  values (p_user, p_client, p_parent, p_name, p_key)
  on conflict do nothing
  returning id into v;
  if v is null then
    select id into v from public.document_folders where client_id = p_client and system_key = p_key;
  end if;
  if v is null then
    -- אותו שם תפוס בתיקייה של מערכת אחרת (למשל שני אנשים באותו שם פרטי).
    insert into public.document_folders (user_id, client_id, parent_id, name, system_key)
    values (p_user, p_client, p_parent, p_name || ' (2)', p_key)
    on conflict do nothing
    returning id into v;
  end if;
  return v;
end;
$function$;

-- ‼ תיקיית מערכת שהתרוקנה (המסמך עבר, הצילום הוחלף) — נמחקת. «בלי קבוצות ריקות».
-- רק תיקייה שהמערכת יצרה, בלי מסמכים ובלי תת-תיקיות; קובץ שהמשרד שם בה — משאיר אותה.
create or replace function public._prune_empty_system_folders(p_client text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_n int;
begin
  loop
    delete from public.document_folders f
     where f.client_id = p_client and f.system_key is not null
       and not exists (select 1 from public.documents d where d.folder_id = f.id)
       and not exists (select 1 from public.document_folders c where c.parent_id = f.id);
    get diagnostics v_n = row_count;
    exit when v_n = 0;
  end loop;
end;
$function$;

-- מותר להזיז: בשורש, או בתיקייה שהמערכת יצרה.
create or replace function public._doc_movable(p_folder text)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select p_folder is null
      or exists (select 1 from public.document_folders f where f.id = p_folder and f.system_key is not null);
$function$;

-- ── ④ צילומים מזהים ──────────────────────────────────────────────────────
create or replace function public.organize_identity_documents(p_request_id text)
returns int
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  r       public.representation_requests;
  x       record;
  v_folder text;
  v_n     int := 0;
begin
  select * into r from public.representation_requests where id = p_request_id;
  if r.id is null or r.linked_client_id is null or jsonb_typeof(r.identity_docs) <> 'object' then return 0; end if;

  -- כל מסמך פעם אחת: מי הבעלים (הראשון לפי הסדר — הנישום ואז בן/בת הזוג), האם משותף,
  -- ומה מספרו בין הצילומים של אותו אדם ואותו סוג.
  for x in
    with e as (
      select p.key as person, (case p.key when 'client' then 0 else 1 end) as pord, t.ord,
             t.v ->> 'documentId' as doc_id, coalesce(nullif(t.v ->> 'docKind', ''), 'idCard') as kind
        from jsonb_each(r.identity_docs) p
        cross join lateral jsonb_array_elements(case when jsonb_typeof(p.value) = 'array' then p.value else '[]'::jsonb end)
             with ordinality t(v, ord)
       where p.key in ('client', 'spouse') and coalesce(t.v ->> 'documentId', '') <> ''
    ), owners as (
      select doc_id,
             (array_agg(person order by pord, ord))[1] as owner,
             (array_agg(kind order by pord, ord))[1] as kind,
             count(distinct person) > 1 as shared
        from e group by doc_id
    ), numbered as (
      select o.*, d.folder_id,
             row_number() over (partition by o.owner, o.kind order by (select min(pord * 1000 + ord) from e where e.doc_id = o.doc_id)) as n,
             count(*) over (partition by o.owner, o.kind) as total
        from owners o join public.documents d on d.id = o.doc_id and d.client_id = r.linked_client_id
    )
    select * from numbered
  loop
    continue when not public._doc_movable(x.folder_id);
    v_folder := public._ensure_system_folder(r.user_id, r.linked_client_id, null, 'id:' || x.owner || ':' || x.kind,
                  public._id_kind_label(x.kind) || ' - ' || public._doc_person_first(r.linked_client_id, x.owner));
    update public.documents
       set folder_id = v_folder,
           description = public._id_kind_label(x.kind) || ' - '
             || case when x.shared then public._doc_person_first(r.linked_client_id, 'client') || ' ו'
                                        || public._doc_person_first(r.linked_client_id, 'spouse')
                     else public._doc_person_first(r.linked_client_id, x.owner) end
             || ' · צילום' || case when x.total > 1 then ' ' || x.n else '' end
             || case when x.shared then ' (משותף)' else '' end
     where id = x.doc_id
       and (folder_id is distinct from v_folder or description is distinct from public._id_kind_label(x.kind) || ' - '
             || case when x.shared then public._doc_person_first(r.linked_client_id, 'client') || ' ו'
                                        || public._doc_person_first(r.linked_client_id, 'spouse')
                     else public._doc_person_first(r.linked_client_id, x.owner) end
             || ' · צילום' || case when x.total > 1 then ' ' || x.n else '' end
             || case when x.shared then ' (משותף)' else '' end);
    v_n := v_n + 1;
  end loop;
  perform public._prune_empty_system_folders(r.linked_client_id);
  return v_n;
end;
$function$;

-- ── ⑤ ה-PDF שנבנה מהצילומים (211) — באותה תיקייה, ושם לפי המצב ──────────
create or replace function public._place_build_docs(p_build_id text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  b        public.document_pdf_builds;
  rq       public.representation_requests;
  v_person text;
  v_both   boolean := false;
  v_kind   text;
  v_first  text;
  v_full   text;
  v_folder text;
  v_old    text;
  v_sep    boolean;
  v_stale  boolean;
  d        public.documents;
begin
  select * into b from public.document_pdf_builds where id = p_build_id;
  if b.id is null then return; end if;
  v_kind  := coalesce(nullif(b.doc_kind, ''), 'idCard');
  -- ‼ אותם צילומים בדיוק משויכים לשני בני הזוג (קובץ משותף) ⇒ PDF אחד לשניהם (המזהה
  -- נגזר מהמקורות) — הוא יושב ליד הצילום המשותף, בתיקייה של הנישום, ושמו של שניהם.
  select * into rq from public.representation_requests where id = b.request_id;
  if rq.id is not null and jsonb_typeof(rq.identity_docs) = 'object' then
    select bool_and(exists (select 1 from jsonb_array_elements(coalesce(rq.identity_docs -> 'client', '[]')) e where e ->> 'documentId' = s.id)
                and exists (select 1 from jsonb_array_elements(coalesce(rq.identity_docs -> 'spouse', '[]')) e where e ->> 'documentId' = s.id))
      into v_both from unnest(b.source_ids) s(id);
  end if;
  v_both   := coalesce(v_both, false);
  v_person := case when v_both then 'client' else b.person end;
  v_first  := case when v_both then public._doc_person_first(b.client_id, 'client') || ' ו' || public._doc_person_first(b.client_id, 'spouse')
                   else public._doc_person_first(b.client_id, v_person) end;
  v_full   := case when v_both then v_first else public._doc_person_full(b.client_id, v_person) end;
  v_folder := public._ensure_system_folder(b.user_id, b.client_id, null, 'id:' || v_person || ':' || v_kind,
                public._id_kind_label(v_kind) || ' - ' || public._doc_person_first(b.client_id, v_person));
  v_sep   := b.status = 'ready' and coalesce(b.submission_document_id, b.id) <> b.id;
  -- ‼ הצילום הוחלף (קבוצה אחרת) ⇒ ישן. הוחלף במקום ⇒ ה-PDF שבתיק עוד של הצילום הקודם.
  v_stale := b.status in ('pending', 'needs_worker', 'failed') and exists (select 1 from public.documents where id = b.id);

  for d in select * from public.documents where id in (b.id, b.id || '-s') loop
    continue when not public._doc_movable(d.folder_id);
    if b.status = 'superseded' or (d.id = b.id || '-s' and not v_sep) then
      v_old := public._ensure_system_folder(b.user_id, b.client_id, v_folder, 'id-old:' || v_person || ':' || v_kind, 'ישן');
      update public.documents
         set folder_id = v_old,
             description = public._id_kind_label(v_kind) || ' - ' || v_first || ' · PDF'
                           || case when d.id like '%-s' then ' להגשה' else '' end || ' (ישן - הצילום הוחלף)'
       where id = d.id;
    elsif d.id = b.id then
      update public.documents
         set folder_id = v_folder,
             description = public._id_kind_label(v_kind) || ' - ' || v_first
                           || case when v_sep then ' · PDF באיכות המקור' else ' · PDF' end
                           || case when v_stale then ' (ישן - PDF חדש בהכנה)' else '' end,
             file_name = public._id_kind_label(v_kind) || ' - ' || v_full || '.pdf'
       where id = d.id;
    else
      update public.documents
         set folder_id = v_folder,
             description = public._id_kind_label(v_kind) || ' - ' || v_first || ' · PDF להגשה'
                           || case b.submission_state when 'review' then ' (דחוס - ממתין לבדיקה)'
                                                      when 'approved' then ' (דחוס - אושר)'
                                                      when 'rejected' then ' (דחוס - נפסל)' else '' end,
             file_name = public._id_kind_label(v_kind) || ' - ' || v_full || ' (להגשה).pdf'
       where id = d.id;
    end if;
  end loop;
  perform public._prune_empty_system_folders(b.client_id);
end;
$function$;

create or replace function public.document_pdf_builds_place_docs()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  perform public._place_build_docs(new.id);
  return new;
exception when others then
  -- ‼ סידור בתיקייה לעולם לא מפיל את הבנייה עצמה.
  return new;
end;
$function$;

drop trigger if exists document_pdf_builds_place_docs on public.document_pdf_builds;
create trigger document_pdf_builds_place_docs
  after insert or update of status, submission_state, submission_document_id, source_fingerprint on public.document_pdf_builds
  for each row execute function public.document_pdf_builds_place_docs();

-- ‼ «החלטת המשרד» כתבה עד כאן גם תיאור למסמך ההגשה, אחרי העדכון של הבנייה —
-- ודרסה את הסידור. עכשיו השם נגזר במקום אחד (_place_build_docs).
create or replace function public.decide_document_pdf_submission(p_id text, p_fingerprint text, p_decision text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  b public.document_pdf_builds;
  v_to text;
begin
  select * into b from public.document_pdf_builds where id = p_id for update;
  if b.id is null then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if auth.uid() is null or auth.uid() <> b.user_id or not public.is_authorized() then raise exception 'forbidden'; end if;
  if b.status <> 'ready' or b.source_fingerprint is distinct from p_fingerprint
     or public._doc_fingerprint(b.source_ids) is distinct from p_fingerprint then
    return jsonb_build_object('ok', false, 'error', 'stale');
  end if;
  v_to := case
    when p_decision = 'approve' and b.submission_state in ('review', 'rejected') then 'approved'
    when p_decision = 'reject' and b.submission_state in ('review', 'approved') then 'rejected'
    when p_decision = 'reopen' and b.submission_state in ('approved', 'rejected') then 'review'
  end;
  if v_to is null then return jsonb_build_object('ok', false, 'error', 'bad_transition', 'state', b.submission_state); end if;
  update public.document_pdf_builds
     set submission_state = v_to, submission_decided_at = case when v_to = 'review' then null else now() end,
         updated_at = now()
   where id = p_id;
  if v_to = 'approved' then
    perform public.resume_shaam_submissions_for_client(b.client_id, 'identity_docs');
  end if;
  return jsonb_build_object('ok', true, 'state', v_to);
end;
$function$;

-- ── ⑥ ייפוי כוח ─────────────────────────────────────────────────────────
-- ‼ איזה טופס של איזו בקשה: לפי חיפוש בבקשות של אותו לקוח (מזהה בקשה יכול להיות
-- עם מקפים או בלי), לא לפי פירוק המזהה.
create or replace function public._poa_placement(p_doc_id text, p_client text, p_notes text, p_user uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  rr      public.representation_requests;
  cur     public.representation_requests;
  v_signed boolean := p_doc_id like 'signed-poa-%';
  v_old    boolean;
  v_listed boolean;
  v_title  text;
  v_multi  boolean;
  v_folder text;
begin
  if p_doc_id !~ '^(poa-pdf-|signed-poa-)' or p_client is null then return null; end if;
  select r.* into rr from public.representation_requests r
   where r.linked_client_id = p_client
     and (p_doc_id in ('poa-pdf-' || r.id, 'signed-poa-' || r.id)
          or p_doc_id like 'poa-pdf-' || r.id || '-%' or p_doc_id like 'signed-poa-' || r.id || '-%')
   order by length(r.id) desc
   limit 1;
  if rr.id is null then return null; end if;
  cur := public.representation_request_for_client(p_client);

  select bool_or(e ->> 'pdfDocId' = p_doc_id or e ->> 'signedPdfStoredId' = p_doc_id),
         max(case when e ->> 'pdfDocId' = p_doc_id or e ->> 'signedPdfStoredId' = p_doc_id then e ->> 'title' end)
    into v_listed, v_title
    from jsonb_array_elements(case when jsonb_typeof(rr.signature_documents) = 'array' then rr.signature_documents else '[]'::jsonb end) e;
  -- טופס שהגיע משע״ם ונרשם בבקשה (execution.shaam.*.formDocumentId) — נוכחי גם לפני שנכנס לרשימת הטפסים.
  v_listed := coalesce(v_listed, false) or exists (
    select 1 from jsonb_each(case when jsonb_typeof(rr.execution -> 'shaam') = 'object' then rr.execution -> 'shaam' else '{}'::jsonb end) t
     where t.value ->> 'formDocumentId' = p_doc_id);
  v_multi := jsonb_typeof(rr.signature_documents) = 'array' and jsonb_array_length(rr.signature_documents) > 1;

  -- ‼ ישן = טופס שהוחלף (נרשם «הוחלף» / עותק שמור «-old-»), טופס שירד מרשימת הטפסים
  -- של הבקשה שלו, או בקשה שבוטלה. ייפוי כוח של בקשה קודמת שעדיין בתוקף — לא ישן.
  v_old := p_doc_id like '%-old-%'
        or (not v_signed and coalesce(p_notes, '') like '%הוחלף%')
        or rr.status = 'cancelled'
        or (jsonb_typeof(rr.signature_documents) = 'array' and jsonb_array_length(rr.signature_documents) > 0
            and not coalesce(v_listed, false)
            and p_doc_id is distinct from rr.signed_pdf_path);

  v_folder := public._ensure_system_folder(p_user, p_client, null, 'poa', 'ייפוי כוח');
  if v_old then
    v_folder := public._ensure_system_folder(p_user, p_client, v_folder, 'poa-old', 'ישן');
  end if;
  return jsonb_build_object(
    'folder', v_folder,
    'description', 'ייפוי כוח - ' || case when v_signed then 'חתום (לקוח + משרד)' else 'לחתימה' end
      || case when v_multi and v_title is not null then ' · ' || v_title else '' end
      || case when cur.id is not null and rr.id <> cur.id and not v_old
              then ' · בקשה מ-' || to_char(rr.created_at at time zone 'Asia/Jerusalem', 'MM/YYYY') else '' end
      || case when v_old then ' (ישן)' else '' end);
end;
$function$;

create or replace function public.organize_poa_documents(p_client_id text)
returns int
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  d   public.documents;
  v   jsonb;
  v_n int := 0;
begin
  for d in select * from public.documents
            where client_id = p_client_id and id ~ '^(poa-pdf-|signed-poa-)' loop
    continue when not public._doc_movable(d.folder_id);
    v := public._poa_placement(d.id, d.client_id, d.notes, d.user_id);
    continue when v is null;
    update public.documents set folder_id = v ->> 'folder', description = v ->> 'description'
     where id = d.id and (folder_id is distinct from v ->> 'folder' or description is distinct from v ->> 'description');
    v_n := v_n + 1;
  end loop;
  perform public._prune_empty_system_folders(p_client_id);
  return v_n;
end;
$function$;

-- ‼ טופס/ייפוי חתום נשמר מחדש בשלמותו (הדפדפן, העובד) — והשמירה מאפסת תיקייה ושם.
-- כששמירה כזאת מגיעה (הכנסה, או קובץ חדש: נתיב/גודל/זמן העלאה) — מסדרים מחדש.
-- הזזה/שינוי שם בידי המשרד (רק folder_id/description) — לא נוגעים.
create or replace function public.documents_place_poa()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v jsonb;
begin
  if new.id !~ '^(poa-pdf-|signed-poa-)' then return new; end if;
  if tg_op = 'UPDATE' and new.storage_path is not distinct from old.storage_path
     and new.file_size is not distinct from old.file_size and new.uploaded_at is not distinct from old.uploaded_at then
    return new;
  end if;
  if tg_op = 'UPDATE' and not public._doc_movable(old.folder_id) then
    new.folder_id := old.folder_id;
    return new;
  end if;
  v := public._poa_placement(new.id, new.client_id, new.notes, new.user_id);
  if v is not null then
    new.folder_id := v ->> 'folder';
    new.description := v ->> 'description';
  end if;
  return new;
exception when others then
  return new;
end;
$function$;

drop trigger if exists documents_place_poa on public.documents;
create trigger documents_place_poa
  before insert or update on public.documents
  for each row execute function public.documents_place_poa();

-- ── ⑦ שינוי בבקשה ⇒ סידור ────────────────────────────────────────────────
create or replace function public.representation_requests_organize_docs()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if new.linked_client_id is null then return new; end if;
  if tg_op = 'UPDATE' and new.identity_docs is not distinct from old.identity_docs
     and new.signature_documents is not distinct from old.signature_documents
     and new.signed_pdf_path is not distinct from old.signed_pdf_path
     and new.status is not distinct from old.status
     and new.execution -> 'shaam' is not distinct from old.execution -> 'shaam' then
    return new;
  end if;
  perform public.organize_identity_documents(new.id);
  perform public.organize_poa_documents(new.linked_client_id);
  return new;
exception when others then
  -- ‼ סידור בתיקיות לעולם לא מפיל שמירה של הבקשה.
  return new;
end;
$function$;

drop trigger if exists representation_requests_organize_docs on public.representation_requests;
create trigger representation_requests_organize_docs
  after insert or update of identity_docs, signature_documents, signed_pdf_path, status, execution on public.representation_requests
  for each row execute function public.representation_requests_organize_docs();

-- ── ⑧ הפעלה על מה שכבר בתיק (ידני — לא רץ מעצמו במיגרציה) ────────────────
create or replace function public.organize_all_request_documents(p_limit int default 1000)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  r     record;
  v_id  int := 0;
  v_poa int := 0;
  v_pdf int := 0;
  b     record;
begin
  for r in select id, linked_client_id from public.representation_requests
            where linked_client_id is not null order by created_at limit p_limit loop
    v_id := v_id + public.organize_identity_documents(r.id);
  end loop;
  for b in select id from public.document_pdf_builds loop
    perform public._place_build_docs(b.id);
    v_pdf := v_pdf + 1;
  end loop;
  for r in select distinct linked_client_id from public.representation_requests where linked_client_id is not null loop
    v_poa := v_poa + public.organize_poa_documents(r.linked_client_id);
  end loop;
  return jsonb_build_object('identityDocs', v_id, 'pdfBuilds', v_pdf, 'poaDocs', v_poa);
end;
$function$;

-- ── ⑨ הרשאות ──────────────────────────────────────────────────────────────
do $$
declare fn text;
begin
  foreach fn in array array[
    'public._doc_person_first(text, text)', 'public._doc_person_full(text, text)',
    'public._ensure_system_folder(uuid, text, text, text, text)', 'public._doc_movable(text)',
    'public._prune_empty_system_folders(text)',
    'public.organize_identity_documents(text)', 'public._place_build_docs(text)',
    'public._poa_placement(text, text, text, uuid)', 'public.organize_poa_documents(text)',
    'public.organize_all_request_documents(integer)',
    'public.document_pdf_builds_place_docs()', 'public.documents_place_poa()',
    'public.representation_requests_organize_docs()'] loop
    execute format('revoke execute on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
  execute 'revoke execute on function public.decide_document_pdf_submission(text, text, text) from public, anon';
  execute 'grant execute on function public.decide_document_pdf_submission(text, text, text) to authenticated, service_role';
end $$;
