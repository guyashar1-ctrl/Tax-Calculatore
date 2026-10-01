-- ════════════════════════════════════════════════════════════════════════════
-- 212 · תיקייה ושם לכל מסמך של הבקשה (01.10.2026)
-- ════════════════════════════════════════════════════════════════════════════
-- גיא: «הייתי מצפה לתעודת זהות הדסה, תעודת זהות יאיר … בתיקייה ששם יש גם PDF וגם
-- התמונה. בייפוי כוח — תיקייה, עם לחתימה וחתום». ייפוי כוח שהוחלף ⇒ «ישן».
--
-- ‼ מבנה בתיק המסמכים של הלקוח:
--     📁 תעודת זהות - הדסה      הצילומים שהועלו להדסה + ה-PDF שנבנה מהם
--          📁 ישן                צילום שהוחלף (אינו נוכחי באף בקשה) + ה-PDF שנבנה ממנו
--     📁 תעודת זהות - יאיר
--     📁 ייפוי כוח              לחתימה · חתום (לקוח + משרד)
--          📁 ישן                טופס שהוחלף / שירד מרשימת הטפסים
-- ‼ שיוך לפי המקום שאליו הועלה הקובץ (identity_docs) — לא לפי התוכן. אותו קובץ
--   שהועלה לנישום ולבן/בת הזוג הוא שתי רשומות, לכל אחד שיוך ואישור משלו (גיא:
--   «אל תסיק בעלות מתוך זהות הקבצים בלבד»). רק כפילות אצל **אותו אדם** נמנעת
--   (בפונקציות ההעלאה, לפי content_sha256).
-- ‼ קובץ שהמשרד תייק בעצמו בתיקייה שלו — לא זז ולא מקבל שם אחר. תיקייה שהמשרד
--   יצר לעולם לא נמחקת; נמחקת רק תיקייה שהמערכת יצרה (created_by_system) והתרוקנה.
-- ‼ כל שינוי שם/מיקום נרשם (document_organize_log: לפני ← אחרי) וניתן לשחזור:
--   restore_document_organize(run). תצוגה מקדימה בלי שום שינוי:
--   preview_organize_all_request_documents().
-- ‼ שם/תיקייה בלבד: לא נוגעים ב-storage_path/file_size/uploaded_at ⇒ אין בנייה מחדש של PDF.

-- ── ① עמודות ויומן ───────────────────────────────────────────────────────
alter table public.document_folders add column if not exists system_key text;
alter table public.document_folders add column if not exists created_by_system boolean not null default false;
create unique index if not exists document_folders_system_key_uniq
  on public.document_folders (client_id, system_key) where system_key is not null;
alter table public.documents add column if not exists content_sha256 text;
create index if not exists documents_client_sha_idx
  on public.documents (client_id, content_sha256) where content_sha256 is not null;

create table if not exists public.document_organize_log (
  id               bigserial primary key,
  run_id           text not null,
  action           text not null check (action in ('run', 'doc', 'folder_created', 'folder_adopted', 'folder_deleted')),
  doc_id           text,
  old_folder_id    text,
  old_description  text,
  old_file_name    text,
  new_folder_id    text,
  new_description  text,
  new_file_name    text,
  folder_id        text,
  folder_name      text,
  folder_parent_id text,
  folder_client_id text,
  folder_user_id   uuid,
  folder_system_key text,
  at               timestamptz not null default now()
);
create index if not exists document_organize_log_run_idx on public.document_organize_log (run_id, id);
-- ריצה ששוחזרה מסומנת — שחזור שני של אותה ריצה היה מחזיר שוב מצב ישן על שינויים שקרו מאז.
alter table public.document_organize_log add column if not exists restored_at timestamptz;
-- 'run' = סימון תחילת ריצה — גם ריצה שלא שינתה כלום רשומה (מזהה חד-פעמי, שחזור מוצא אותה).
alter table public.document_organize_log drop constraint if exists document_organize_log_action_check;
alter table public.document_organize_log add constraint document_organize_log_action_check
  check (action in ('run', 'doc', 'folder_created', 'folder_adopted', 'folder_deleted'));
alter table public.document_organize_log enable row level security;
revoke all on public.document_organize_log from anon, authenticated;

-- מזהה הריצה לרישום: ריצה יזומה קובעת אותו (organize-all-…); שינוי שקרה מטריגר — לפי הטרנזקציה.
create or replace function public._organize_run()
returns text
language sql
stable
as $function$
  select coalesce(nullif(current_setting('pivo.organize_run', true), ''), 'auto:' || txid_current()::text);
$function$;

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

-- ── ③ תיקיות ומסמכים — כל שינוי נרשם ─────────────────────────────────────
-- ‼ לפי system_key ולא לפי שם: המשרד רשאי לשנות שם/להזיז — נשארים איתה.
-- תיקייה באותו שם שהמשרד כבר יצר באותו מקום — מאמצים אותה (בלי לסמן «נוצרה ע״י המערכת»).
create or replace function public._ensure_system_folder(p_user uuid, p_client text, p_parent text, p_key text, p_name text)
returns text
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v      text;
  v_name text := p_name;
begin
  select id into v from public.document_folders where client_id = p_client and system_key = p_key;
  if v is not null then return v; end if;
  select id into v from public.document_folders
   where user_id = p_user and client_id = p_client and system_key is null
     and coalesce(parent_id, '') = coalesce(p_parent, '') and lower(name) = lower(p_name)
   limit 1;
  if v is not null then
    update public.document_folders set system_key = p_key where id = v;
    insert into public.document_organize_log (run_id, action, folder_id, folder_name, folder_parent_id, folder_client_id, folder_user_id, folder_system_key)
    values (public._organize_run(), 'folder_adopted', v, p_name, p_parent, p_client, p_user, p_key);
    return v;
  end if;
  for i in 1..2 loop
    insert into public.document_folders (user_id, client_id, parent_id, name, system_key, created_by_system)
    values (p_user, p_client, p_parent, v_name, p_key, true)
    on conflict do nothing
    returning id into v;
    exit when v is not null;
    select id into v from public.document_folders where client_id = p_client and system_key = p_key;
    exit when v is not null;
    v_name := p_name || ' (2)';   -- אותו שם תפוס בתיקיית מערכת אחרת (שני אנשים באותו שם פרטי)
  end loop;
  if v is not null then
    insert into public.document_organize_log (run_id, action, folder_id, folder_name, folder_parent_id, folder_client_id, folder_user_id, folder_system_key)
    values (public._organize_run(), 'folder_created', v, v_name, p_parent, p_client, p_user, p_key);
  end if;
  return v;
end;
$function$;

-- מותר להזיז: בשורש, או בתיקייה של המערכת (שנוצרה או אומצה).
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

-- שינוי אחד במסמך: רק כשמשהו באמת משתנה, ותמיד עם רישום «לפני».
create or replace function public._apply_doc_place(p_doc_id text, p_folder text, p_description text, p_file_name text default null)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  d public.documents;
begin
  select * into d from public.documents where id = p_doc_id;
  if d.id is null or not public._doc_movable(d.folder_id) then return false; end if;
  if d.folder_id is not distinct from p_folder and d.description is not distinct from p_description
     and (p_file_name is null or d.file_name is not distinct from p_file_name) then
    return false;
  end if;
  insert into public.document_organize_log (run_id, action, doc_id, old_folder_id, old_description, old_file_name,
                                            new_folder_id, new_description, new_file_name)
  values (public._organize_run(), 'doc', d.id, d.folder_id, d.description, d.file_name,
          p_folder, p_description, coalesce(p_file_name, d.file_name));
  update public.documents
     set folder_id = p_folder, description = p_description, file_name = coalesce(p_file_name, file_name)
   where id = d.id;
  return true;
end;
$function$;

-- ‼ «בלי קבוצות ריקות» — אבל רק מה שהמערכת יצרה. תיקייה שהמשרד יצר (גם אם אומצה) נשארת.
create or replace function public._prune_empty_system_folders(p_client text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  f   public.document_folders;
  v_n int;
begin
  loop
    v_n := 0;
    for f in select * from public.document_folders x
              where x.client_id = p_client and x.created_by_system
                and not exists (select 1 from public.documents d where d.folder_id = x.id)
                and not exists (select 1 from public.document_folders c where c.parent_id = x.id) loop
      insert into public.document_organize_log (run_id, action, folder_id, folder_name, folder_parent_id, folder_client_id, folder_user_id, folder_system_key)
      values (public._organize_run(), 'folder_deleted', f.id, f.name, f.parent_id, f.client_id, f.user_id, f.system_key);
      delete from public.document_folders where id = f.id;
      v_n := v_n + 1;
    end loop;
    exit when v_n = 0;
  end loop;
end;
$function$;

-- ── ④ צילומים מזהים ──────────────────────────────────────────────────────
-- ‼ צילום «הוחלף» = לא אושר, ואחריו אותו אדם קיבל צילום מאושר מאותו סוג (כך בדיוק
--   גם הבנייה וההגשה בוחרות — shaam_confirmed_identity_documents_for). צילום שאושר
--   נשאר נוכחי גם כשנוסף אחריו עוד אחד.
-- מחזיר null (לא רשום) · 'current' (נוכחי אצל לפחות אדם אחד) · 'replaced'.
create or replace function public._id_doc_state_in(p_ids jsonb, p_doc text)
returns text
language sql
immutable
as $function$
  with e as (
    select p.key as person, t.ord, t.v ->> 'documentId' as doc_id,
           coalesce(nullif(t.v ->> 'docKind', ''), 'idCard') as kind,
           nullif(t.v ->> 'clientConfirmedAt', '') is not null as confirmed
      from jsonb_each(case when jsonb_typeof(p_ids) = 'object' then p_ids else '{}'::jsonb end) p
      cross join lateral jsonb_array_elements(case when jsonb_typeof(p.value) = 'array' then p.value else '[]'::jsonb end)
           with ordinality t(v, ord)
     where p.key in ('client', 'spouse')
  ), mine as (
    select x.confirmed or not exists (select 1 from e y where y.person = x.person and y.kind = x.kind
                                                          and y.ord > x.ord and y.confirmed) as current
      from e x where x.doc_id = p_doc
  )
  select case when not exists (select 1 from mine) then null
              when bool_or(current) then 'current' else 'replaced' end
    from mine;
$function$;

create or replace function public.organize_identity_documents(p_request_id text)
returns int
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  r        public.representation_requests;
  x        record;
  v_folder text;
  v_desc   text;
  v_n      int := 0;
begin
  select * into r from public.representation_requests where id = p_request_id;
  if r.id is null or r.linked_client_id is null or jsonb_typeof(r.identity_docs) <> 'object' then return 0; end if;

  for x in
    with e as (
      select p.key as person, (case p.key when 'client' then 0 else 1 end) as pord, t.ord,
             t.v ->> 'documentId' as doc_id, coalesce(nullif(t.v ->> 'docKind', ''), 'idCard') as kind
        from jsonb_each(r.identity_docs) p
        cross join lateral jsonb_array_elements(case when jsonb_typeof(p.value) = 'array' then p.value else '[]'::jsonb end)
             with ordinality t(v, ord)
       where p.key in ('client', 'spouse') and coalesce(t.v ->> 'documentId', '') <> ''
    ), owners as (
      -- ‼ אותה רשומה משויכת לשניהם רק אם כך נרשם במפורש בשני המקומות (לא מסיקים מהתוכן).
      select doc_id,
             (array_agg(person order by pord, ord))[1] as owner,
             (array_agg(kind order by pord, ord))[1] as kind,
             count(distinct person) > 1 as shared,
             min(pord * 100000 + ord) as pos
        from e group by doc_id
    ), placed as (
      -- ‼ «ישן» = הוחלף, ואינו נוכחי באף בקשה של הלקוח (גם לא בזו). נקבע על פני כל
      -- הבקשות — אותה תשובה בלי קשר לאיזו בקשה מסודרת ראשונה.
      select o.*, coalesce((
               select bool_or(z.s = 'replaced') and not bool_or(z.s = 'current')
                 from (select public._id_doc_state_in(r3.identity_docs, o.doc_id) as s
                         from public.representation_requests r3 where r3.linked_client_id = r.linked_client_id) z
                where z.s is not null), false) as old
        from owners o join public.documents d on d.id = o.doc_id and d.client_id = r.linked_client_id
    )
    select p.*, row_number() over (partition by p.owner, p.kind, p.old order by p.pos) as n,
           count(*) over (partition by p.owner, p.kind, p.old) as total
      from placed p
  loop
    v_folder := public._ensure_system_folder(r.user_id, r.linked_client_id, null, 'id:' || x.owner || ':' || x.kind,
                  public._id_kind_label(x.kind) || ' - ' || public._doc_person_first(r.linked_client_id, x.owner));
    if x.old then
      v_folder := public._ensure_system_folder(r.user_id, r.linked_client_id, v_folder, 'id-old:' || x.owner || ':' || x.kind, 'ישן');
    end if;
    v_desc := public._id_kind_label(x.kind) || ' - '
      || case when x.shared then public._doc_person_first(r.linked_client_id, 'client') || ' ו'
                                 || public._doc_person_first(r.linked_client_id, 'spouse')
              else public._doc_person_first(r.linked_client_id, x.owner) end
      || ' · צילום' || case when x.total > 1 then ' ' || x.n else '' end
      || case when x.old then ' (ישן - הוחלף)' else '' end;
    if public._apply_doc_place(x.doc_id, v_folder, v_desc) then v_n := v_n + 1; end if;
  end loop;
  perform public._prune_empty_system_folders(r.linked_client_id);
  return v_n;
end;
$function$;

-- ── ⑤ ה-PDF שנבנה מהצילומים (211) — באותה תיקייה, ושם לפי המצב ──────────
drop function if exists public._place_build_docs(text);
create or replace function public._place_build_docs(p_build_id text)
returns int
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
  v_n      int := 0;
  d        public.documents;
begin
  select * into b from public.document_pdf_builds where id = p_build_id;
  if b.id is null then return 0; end if;
  v_kind := coalesce(nullif(b.doc_kind, ''), 'idCard');
  -- אותם צילומים משויכים במפורש לשני בני הזוג ⇒ PDF אחד לשניהם (המזהה נגזר מהמקורות).
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
  v_stale := b.status in ('pending', 'needs_worker', 'failed') and exists (select 1 from public.documents where id = b.id);

  for d in select * from public.documents where id in (b.id, b.id || '-s') loop
    if b.status = 'superseded' or (d.id = b.id || '-s' and not v_sep) then
      v_old := public._ensure_system_folder(b.user_id, b.client_id, v_folder, 'id-old:' || v_person || ':' || v_kind, 'ישן');
      if public._apply_doc_place(d.id, v_old,
           public._id_kind_label(v_kind) || ' - ' || v_first || ' · PDF'
           || case when d.id like '%-s' then ' להגשה' else '' end || ' (ישן - הצילום הוחלף)') then v_n := v_n + 1; end if;
    elsif d.id = b.id then
      if public._apply_doc_place(d.id, v_folder,
           public._id_kind_label(v_kind) || ' - ' || v_first
           || case when v_sep then ' · PDF באיכות המקור' else ' · PDF' end
           || case when v_stale then ' (ישן - PDF חדש בהכנה)' else '' end,
           public._id_kind_label(v_kind) || ' - ' || v_full || '.pdf') then v_n := v_n + 1; end if;
    else
      if public._apply_doc_place(d.id, v_folder,
           public._id_kind_label(v_kind) || ' - ' || v_first || ' · PDF להגשה'
           || case b.submission_state when 'review' then ' (דחוס - ממתין לבדיקה)'
                                      when 'approved' then ' (דחוס - אושר)'
                                      when 'rejected' then ' (דחוס - נפסל)' else '' end,
           public._id_kind_label(v_kind) || ' - ' || v_full || ' (להגשה).pdf') then v_n := v_n + 1; end if;
    end if;
  end loop;
  perform public._prune_empty_system_folders(b.client_id);
  return v_n;
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

-- ‼ «החלטת המשרד» כתבה עד כאן גם תיאור למסמך ההגשה אחרי עדכון הבנייה — ודרסה את
-- הסידור. עכשיו השם נגזר במקום אחד (_place_build_docs).
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
-- ‼ איזה טופס של איזו בקשה: חיפוש בבקשות של אותו לקוח (מזהה בקשה יכול להיות עם
-- מקפים או בלי), לא פירוק המזהה.
create or replace function public._poa_placement(p_doc_id text, p_client text, p_notes text, p_user uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  rr       public.representation_requests;
  cur      public.representation_requests;
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

  -- ‼ ישן = טופס שהוחלף (נרשם «הוחלף» / עותק שמור «-old-»), או טופס שירד מרשימת הטפסים
  -- של הבקשה שלו. ייפוי כוח של בקשה קודמת — לא ישן (לבקשת ייצוג אין מצב «בוטלה»).
  v_old := p_doc_id like '%-old-%'
        or (not v_signed and coalesce(p_notes, '') like '%הוחלף%')
        or (jsonb_typeof(rr.signature_documents) = 'array' and jsonb_array_length(rr.signature_documents) > 0
            and not v_listed and p_doc_id is distinct from rr.signed_pdf_path);

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

drop function if exists public.organize_poa_documents(text);
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
    if public._apply_doc_place(d.id, v ->> 'folder', v ->> 'description') then v_n := v_n + 1; end if;
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
    new.description := old.description;
    return new;
  end if;
  v := public._poa_placement(new.id, new.client_id, new.notes, new.user_id);
  if v is not null then
    if tg_op = 'UPDATE' and (old.folder_id is distinct from v ->> 'folder' or old.description is distinct from v ->> 'description') then
      insert into public.document_organize_log (run_id, action, doc_id, old_folder_id, old_description, old_file_name,
                                                new_folder_id, new_description, new_file_name)
      values (public._organize_run(), 'doc', new.id, old.folder_id, old.description, old.file_name,
              v ->> 'folder', v ->> 'description', new.file_name);
    end if;
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

-- ── ⑧ מה שכבר בתיק: ריצה יזומה, תצוגה מקדימה, שחזור ───────────────────────
drop function if exists public.organize_all_request_documents(integer);
create or replace function public.organize_all_request_documents(p_run_id text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_run text := coalesce(p_run_id, 'organize-all-' || to_char(now() at time zone 'Asia/Jerusalem', 'YYYYMMDD-HH24MISS'));
  r     record;
  v_id  int := 0;
  v_poa int := 0;
  v_pdf int := 0;
begin
  -- ‼ מזהה ריצה חד-פעמי: ריצה שנייה באותו מזהה הייתה מתערבבת ביומן של הראשונה, והשחזור היה מחזיר את שתיהן.
  if exists (select 1 from public.document_organize_log where run_id = v_run) then
    raise exception 'run_exists: %', v_run;
  end if;
  insert into public.document_organize_log (run_id, action) values (v_run, 'run');
  perform set_config('pivo.organize_run', v_run, true);
  for r in select id from public.representation_requests where linked_client_id is not null order by created_at loop
    v_id := v_id + public.organize_identity_documents(r.id);
  end loop;
  for r in select id from public.document_pdf_builds loop
    v_pdf := v_pdf + public._place_build_docs(r.id);
  end loop;
  for r in select distinct linked_client_id from public.representation_requests where linked_client_id is not null loop
    v_poa := v_poa + public.organize_poa_documents(r.linked_client_id);
  end loop;
  perform set_config('pivo.organize_run', '', true);
  return jsonb_build_object('runId', v_run, 'identityDocs', v_id, 'pdfDocs', v_pdf, 'poaDocs', v_poa);
end;
$function$;

-- ‼ תצוגה מקדימה: אותה ריצה בדיוק, בתוך בלוק שמבוטל בסופו — שום דבר לא נשמר.
-- מחזירה היקף (כמה מסמכים / תיקיות / לקוחות) ודוגמאות ללקוחות שנבחרו (לפני ← אחרי).
create or replace function public.preview_organize_all_request_documents(p_sample_clients text[] default '{}')
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v        jsonb;
  v_office text[];
begin
  -- תיקיות שהמערכת לא יצרה (של המשרד, כולל כאלה שיאומצו) — חייבות להישאר כולן.
  select coalesce(array_agg(id), '{}') into v_office from public.document_folders where not created_by_system;
  begin
    perform public.organize_all_request_documents('preview');
    select jsonb_build_object(
      'docs', (select count(*) from public.document_organize_log where run_id = 'preview' and action = 'doc'),
      'docsMoved', (select count(*) from public.document_organize_log where run_id = 'preview' and action = 'doc'
                      and old_folder_id is distinct from new_folder_id),
      'docsRenamedOnly', (select count(*) from public.document_organize_log where run_id = 'preview' and action = 'doc'
                      and old_folder_id is not distinct from new_folder_id),
      'foldersCreated', (select count(*) from public.document_organize_log where run_id = 'preview' and action = 'folder_created'),
      'foldersAdopted', (select count(*) from public.document_organize_log where run_id = 'preview' and action = 'folder_adopted'),
      'foldersDeleted', (select count(*) from public.document_organize_log where run_id = 'preview' and action = 'folder_deleted'),
      'officeFoldersDeleted', (select count(*) from unnest(v_office) o(id)
                                 where not exists (select 1 from public.document_folders f where f.id = o.id)),
      'clients', (select count(distinct d.client_id) from public.document_organize_log l join public.documents d on d.id = l.doc_id
                   where l.run_id = 'preview' and l.action = 'doc'),
      'docsInOfficeFoldersUntouched', (select count(*) from public.documents d join public.document_folders f on f.id = d.folder_id
                   where f.system_key is null and (d.id ~ '^(poa-pdf-|signed-poa-|pdf-)'
                      or exists (select 1 from public.representation_requests r, jsonb_each(coalesce(r.identity_docs, '{}')) p,
                                   jsonb_array_elements(case when jsonb_typeof(p.value) = 'array' then p.value else '[]'::jsonb end) e
                                  where r.linked_client_id = d.client_id and e ->> 'documentId' = d.id))),
      'samples', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'client', d.client_id,
                 'before', coalesce((select name from public.document_folders where id = l.old_folder_id), '(שורש)')
                           || ' | ' || coalesce(l.old_description, '') || ' | ' || coalesce(l.old_file_name, ''),
                 'after', coalesce((select coalesce(pf.name || ' / ', '') || f.name from public.document_folders f
                                     left join public.document_folders pf on pf.id = f.parent_id where f.id = l.new_folder_id), '(שורש)')
                           || ' | ' || coalesce(l.new_description, '') || ' | ' || coalesce(l.new_file_name, ''))
                 order by d.client_id, l.id)
          from public.document_organize_log l join public.documents d on d.id = l.doc_id
         where l.run_id = 'preview' and l.action = 'doc' and d.client_id = any(p_sample_clients)), '[]'::jsonb))
    into v;
    raise exception using errcode = 'P0001', message = 'pivo-preview-rollback';
  exception when sqlstate 'P0001' then
    if v is null then raise; end if;
  end;
  return v;
end;
$function$;

-- ‼ שחזור: כל ריצה ניתנת להחזרה — שמות ומיקומים קודמים, תיקיות שנמחקו חוזרות, תיקיות
-- שהמערכת יצרה ונשארו ריקות נמחקות, ותיקייה שאומצה מאבדת את סימון המערכת.
create or replace function public.restore_document_organize(p_run_id text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  l     public.document_organize_log;
  v_doc int := 0;
  v_fld int := 0;
begin
  if coalesce(p_run_id, '') = '' or p_run_id = 'preview' then raise exception 'bad_run'; end if;
  if not exists (select 1 from public.document_organize_log where run_id = p_run_id) then raise exception 'run_not_found: %', p_run_id; end if;
  if exists (select 1 from public.document_organize_log where run_id = p_run_id and restored_at is not null) then
    raise exception 'run_already_restored: %', p_run_id;
  end if;
  perform set_config('pivo.organize_run', 'restore:' || p_run_id, true);
  for l in select * from public.document_organize_log where run_id = p_run_id order by id desc loop
    if l.action = 'doc' then
      update public.documents
         set folder_id = case when l.old_folder_id is null or exists (select 1 from public.document_folders where id = l.old_folder_id)
                              then l.old_folder_id end,
             description = l.old_description, file_name = l.old_file_name
       where id = l.doc_id;
      v_doc := v_doc + 1;
    elsif l.action = 'folder_deleted' then
      insert into public.document_folders (id, user_id, client_id, parent_id, name, system_key, created_by_system)
      values (l.folder_id, l.folder_user_id, l.folder_client_id,
              case when l.folder_parent_id is null or exists (select 1 from public.document_folders where id = l.folder_parent_id)
                   then l.folder_parent_id end,
              l.folder_name, l.folder_system_key, true)
      on conflict do nothing;
      v_fld := v_fld + 1;
    elsif l.action = 'folder_adopted' then
      update public.document_folders set system_key = null where id = l.folder_id;
      v_fld := v_fld + 1;
    elsif l.action = 'folder_created' then
      delete from public.document_folders f
       where f.id = l.folder_id
         and not exists (select 1 from public.documents d where d.folder_id = f.id)
         and not exists (select 1 from public.document_folders c where c.parent_id = f.id);
      v_fld := v_fld + 1;
    end if;
  end loop;
  update public.document_organize_log set restored_at = now() where run_id = p_run_id;
  perform set_config('pivo.organize_run', '', true);
  return jsonb_build_object('ok', true, 'docs', v_doc, 'folders', v_fld);
end;
$function$;

-- ── ⑨ הרשאות ──────────────────────────────────────────────────────────────
do $$
declare fn text;
begin
  foreach fn in array array[
    'public._organize_run()', 'public._id_doc_state_in(jsonb, text)',
    'public._doc_person_first(text, text)', 'public._doc_person_full(text, text)',
    'public._ensure_system_folder(uuid, text, text, text, text)', 'public._doc_movable(text)',
    'public._apply_doc_place(text, text, text, text)', 'public._prune_empty_system_folders(text)',
    'public.organize_identity_documents(text)', 'public._place_build_docs(text)',
    'public._poa_placement(text, text, text, uuid)', 'public.organize_poa_documents(text)',
    'public.organize_all_request_documents(text)', 'public.preview_organize_all_request_documents(text[])',
    'public.restore_document_organize(text)',
    'public.document_pdf_builds_place_docs()', 'public.documents_place_poa()',
    'public.representation_requests_organize_docs()'] loop
    execute format('revoke execute on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
  execute 'revoke execute on function public.decide_document_pdf_submission(text, text, text) from public, anon';
  execute 'grant execute on function public.decide_document_pdf_submission(text, text, text) to authenticated, service_role';
end $$;
