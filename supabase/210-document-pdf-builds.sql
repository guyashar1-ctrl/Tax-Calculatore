-- ════════════════════════════════════════════════════════════════════════════
-- 210 · PDF מוכן ברקע לכל צילום מזהה שהבקשה תצטרך (01.10.2026)
-- ════════════════════════════════════════════════════════════════════════════
-- גיא: «אני רוצה שה-PDF יהיה מוכן וזמין לצפייה מוקדם יותר, בלי שאצטרך ללחוץ
-- ׳הכן PDF עכשיו׳ — ברקע, בעת העלאה או שיוך של תמונה».
--
-- ‼ מודל: לכל (בקשה × אדם × סוג מסמך) — קבוצת המקורות (קדמי, אחורי) ⇒ PDF אחד.
--   · זהות ה-PDF = pdf-<sha256 של מזהי המקורות הממוינים> — אותה נוסחה בדפדפן,
--     בשרת ובעובד (imageToPdfCore.pdfVersionIdFor). כמה מסלולים ⇒ רשומה אחת.
--   · «עדכני» = טביעת המקורות (מזהה + נתיב + גודל + זמן העלאה, לפי סדר העמודים)
--     זהה לזו שה-PDF נבנה ממנה. החלפת צילום ⇒ טביעה אחרת ⇒ בנייה מחדש.
--   · קבוצה שהתחלפה (צילום אחר שויך) ⇒ הבנייה הישנה «הוחלפה» וה-PDF שלה מסומן
--     בתיק כישן. היא לעולם לא נחשבת המסמך הנוכחי.
-- ‼ «PDF מוכן» אינו «הלקוח אישר». האישור נשאר clientConfirmedAt ב-identity_docs
--   (208), והחסימות שלפני ההגשה לא משתנות — רק _shaam_docs_convertible מכיר עכשיו
--   ב-PDF מוכן ועדכני (HEIC/WebP שהומרו בדפדפן).
-- ‼ מי בונה: השרת (document-pdf) — JPG/PNG/PDF, מיד ברקע. מה שהשרת לא מפענח
--   (HEIC, WebP…) ⇒ 'needs_browser', והדפדפן של המשרד משלים אוטומטית כשהבקשה
--   פתוחה. ניסיון חוזר עם השהיה; אחרי 3 ניסיונות שרת ⇒ לדפדפן; כשל אמיתי (קובץ
--   פגום) ⇒ 'failed' עם הסבר ודרך להמשך.

-- ── ① הטבלה ────────────────────────────────────────────────────────────────
create table if not exists public.document_pdf_builds (
  id                 text primary key,
  user_id            uuid not null,
  client_id          text not null,
  request_id         text,
  person             text not null check (person in ('client', 'spouse')),
  slot               text not null,
  doc_kind           text,
  source_ids         text[] not null,
  source_fingerprint text not null,
  status             text not null default 'pending'
                     check (status in ('pending', 'ready', 'needs_browser', 'failed', 'superseded')),
  error_code         text,
  error_message      text,
  error_next         text,
  attempts           int not null default 0,
  next_attempt_at    timestamptz,
  built_by           text check (built_by in ('server', 'browser', 'worker')),
  page_count         int,
  pdf_bytes          bigint,
  lossless           boolean,
  notes              text[],
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  ready_at           timestamptz
);
create index if not exists document_pdf_builds_request_idx on public.document_pdf_builds (request_id);
create index if not exists document_pdf_builds_client_idx on public.document_pdf_builds (client_id);
create index if not exists document_pdf_builds_due_idx on public.document_pdf_builds (status, next_attempt_at);

alter table public.document_pdf_builds enable row level security;
drop policy if exists document_pdf_builds_select_own on public.document_pdf_builds;
create policy document_pdf_builds_select_own on public.document_pdf_builds
  for select to authenticated using (auth.uid() = user_id);
drop policy if exists require_authorized on public.document_pdf_builds;
create policy require_authorized on public.document_pdf_builds as restrictive for all to authenticated
  using (public.is_authorized()) with check (public.is_authorized());
revoke all on public.document_pdf_builds from anon;
grant select on public.document_pdf_builds to authenticated;

-- ── ② זהות וטביעה ─────────────────────────────────────────────────────────
-- ‼ collate "C" = סדר בייטים, כמו sort() של JS על מזהים ב-ASCII.
create or replace function public._pdf_build_id(p_ids text[])
returns text
language sql
immutable
set search_path to 'public'
as $function$
  select 'pdf-' || left(encode(sha256(convert_to(
           array_to_string(array(select x from unnest(p_ids) x order by x collate "C"), '|'), 'UTF8')), 'hex'), 24);
$function$;

-- null ⇒ אחד המקורות לא קיים.
create or replace function public._doc_fingerprint(p_ids text[])
returns text
language sql
stable
set search_path to 'public'
as $function$
  select case when count(d.id) = cardinality(p_ids) then
           string_agg(d.id || ':' || coalesce(d.storage_path, '') || ':' || coalesce(d.file_size, 0)::text || ':'
                      || coalesce(floor(extract(epoch from d.uploaded_at))::bigint::text, ''), '|' order by u.ord)
         end
    from unnest(p_ids) with ordinality u(id, ord)
    left join public.documents d on d.id = u.id;
$function$;

-- ── ③ הסוד שמאמת את הקריאה מהמסד לשרת ─────────────────────────────────────
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'document_pdf_secret') then
    perform vault.create_secret(encode(gen_random_bytes(24), 'hex'), 'document_pdf_secret');
  end if;
end $$;

create or replace function public.verify_document_pdf_secret(p text)
returns boolean
language sql
security definer
set search_path to 'public', 'vault'
as $$
  select exists (select 1 from vault.decrypted_secrets where name = 'document_pdf_secret' and decrypted_secret = p);
$$;

-- «הכן עכשיו» ברקע: נרשם בתור ויוצא רק אחרי commit. ‼ לעולם לא מפיל את הכתיבה שהפעילה אותו.
create or replace function public._kick_document_pdf(p_request_id text)
returns void
language plpgsql
security definer
set search_path to 'public', 'vault'
as $function$
declare
  v_base   text;
  v_secret text;
begin
  select decrypted_secret into v_base from vault.decrypted_secrets where name = 'functions_base_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'document_pdf_secret';
  if v_base is null or v_secret is null or p_request_id is null then return; end if;
  perform net.http_post(
    url := rtrim(v_base, '/') || '/functions/v1/document-pdf',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-document-pdf-secret', v_secret),
    body := jsonb_build_object('requestId', p_request_id),
    timeout_milliseconds := 120000);
exception when others then
  null;
end;
$function$;

-- ── ④ אילו PDF הבקשה צריכה — ומה מהם כבר מוכן ─────────────────────────────
create or replace function public.sync_document_pdf_builds(p_request_id text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  r       public.representation_requests;
  v_person text;
  v_slot   text;
  v_sel    jsonb;
  v_ids    text[];
  v_allpdf boolean;
  v_id     text;
  v_fp     text;
  v_keep   text[] := '{}';
  v_pending int;
  v_browser int;
begin
  select * into r from public.representation_requests where id = p_request_id;
  if r.id is null or r.linked_client_id is null then return jsonb_build_object('pending', 0, 'needsBrowser', 0); end if;
  if auth.uid() is not null and (auth.uid() <> r.user_id or not public.is_authorized()) then
    raise exception 'forbidden';
  end if;

  foreach v_person in array array['client', 'spouse'] loop
    foreach v_slot in array array['idOrLicense', 'passport'] loop
      -- ‼ מה שיוגש: המסמכים שהלקוח אישר; לפני האישור — כל מה שרשום לאדם (PDF מוכן ≠ אישור).
      v_sel := public.shaam_confirmed_identity_documents_for(r.linked_client_id, v_person, v_slot);
      if coalesce((v_sel ->> 'missing')::boolean, false) then
        v_sel := public.shaam_identity_documents_for(r.linked_client_id, v_person, v_slot);
      end if;
      if coalesce((v_sel ->> 'missing')::boolean, false) then continue; end if;
      select array_agg(x ->> 'documentId' order by ord),
             bool_and(lower(coalesce(x ->> 'fileType', '')) = 'application/pdf' or lower(coalesce(x ->> 'fileName', '')) like '%.pdf')
        into v_ids, v_allpdf
        from jsonb_array_elements(coalesce(v_sel -> 'documents', '[]'::jsonb)) with ordinality t(x, ord);
      if v_ids is null or cardinality(v_ids) = 0 then continue; end if;
      if cardinality(v_ids) = 1 and v_allpdf then continue; end if;   -- PDF יחיד — הוא עצמו המסמך
      v_fp := public._doc_fingerprint(v_ids);
      if v_fp is null then continue; end if;
      v_id := public._pdf_build_id(v_ids);
      v_keep := v_keep || v_id;
      insert into public.document_pdf_builds as b
        (id, user_id, client_id, request_id, person, slot, doc_kind, source_ids, source_fingerprint, status)
      values (v_id, r.user_id, r.linked_client_id, r.id, v_person, v_slot, v_sel ->> 'docKind', v_ids, v_fp, 'pending')
      on conflict (id) do update set
        request_id = excluded.request_id, person = excluded.person, slot = excluded.slot, doc_kind = excluded.doc_kind,
        source_ids = excluded.source_ids,
        status = case when b.source_fingerprint is distinct from excluded.source_fingerprint or b.status = 'superseded'
                      then 'pending' else b.status end,
        attempts = case when b.source_fingerprint is distinct from excluded.source_fingerprint or b.status = 'superseded'
                        then 0 else b.attempts end,
        error_code = case when b.source_fingerprint is distinct from excluded.source_fingerprint then null else b.error_code end,
        error_message = case when b.source_fingerprint is distinct from excluded.source_fingerprint then null else b.error_message end,
        error_next = case when b.source_fingerprint is distinct from excluded.source_fingerprint then null else b.error_next end,
        next_attempt_at = case when b.source_fingerprint is distinct from excluded.source_fingerprint then null else b.next_attempt_at end,
        source_fingerprint = excluded.source_fingerprint,
        updated_at = now();
    end loop;
  end loop;

  -- ‼ קבוצה שהתחלפה: ה-PDF הישן אינו המסמך הנוכחי — מסומן בתיק, ולא נמחק.
  with gone as (
    update public.document_pdf_builds
       set status = 'superseded', updated_at = now()
     where request_id = r.id and status <> 'superseded' and not (id = any(v_keep))
     returning id
  )
  update public.documents d
     set description = 'PDF ישן - הצילום שממנו נוצר הוחלף',
         notes = trim(coalesce(d.notes, '') || ' · הוחלף: יש PDF חדש מהצילום העדכני')
    from gone
   where d.id = gone.id and coalesce(d.notes, '') not like '%הוחלף: יש PDF חדש%';

  select count(*) filter (where status = 'pending'), count(*) filter (where status = 'needs_browser')
    into v_pending, v_browser
    from public.document_pdf_builds where request_id = r.id;
  return jsonb_build_object('pending', v_pending, 'needsBrowser', v_browser);
end;
$function$;

-- ── ⑤ הטריגרים: שיוך/החלפה של צילום ⇒ בנייה ברקע ──────────────────────────
create or replace function public.document_pdf_builds_on_identity_docs()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if new.linked_client_id is null then return new; end if;
  if tg_op = 'UPDATE' and new.identity_docs is not distinct from old.identity_docs then return new; end if;
  if ((public.sync_document_pdf_builds(new.id)) ->> 'pending')::int > 0 then
    perform public._kick_document_pdf(new.id);
  end if;
  return new;
exception when others then
  -- ‼ ההכנה ברקע לעולם לא מפילה שמירה של הבקשה; ה-cron ישלים.
  return new;
end;
$function$;

drop trigger if exists document_pdf_builds_on_identity_docs on public.representation_requests;
create trigger document_pdf_builds_on_identity_docs
  after insert or update of identity_docs on public.representation_requests
  for each row execute function public.document_pdf_builds_on_identity_docs();

create or replace function public.document_pdf_builds_on_document_change()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_req text;
begin
  if new.storage_path is not distinct from old.storage_path and new.file_size is not distinct from old.file_size
     and new.uploaded_at is not distinct from old.uploaded_at then
    return new;
  end if;
  for v_req in select distinct request_id from public.document_pdf_builds
                where source_ids @> array[new.id] and status <> 'superseded' and request_id is not null loop
    if ((public.sync_document_pdf_builds(v_req)) ->> 'pending')::int > 0 then
      perform public._kick_document_pdf(v_req);
    end if;
  end loop;
  return new;
exception when others then
  return new;
end;
$function$;

drop trigger if exists document_pdf_builds_on_document_change on public.documents;
create trigger document_pdf_builds_on_document_change
  after update of storage_path, file_size, uploaded_at on public.documents
  for each row execute function public.document_pdf_builds_on_document_change();

-- ── ⑥ השרת לוקח עבודה, מסיים, נכשל ──────────────────────────────────────
-- ‼ «חכירה» של 3 דקות במקום נעילה: קריאה כפולה לא בונה פעמיים, ושרת שנפל באמצע
-- לא תוקע את הבנייה — ה-cron מנסה שוב. 3 ניסיונות שרת ⇒ הדפדפן משלים.
create or replace function public.claim_document_pdf_builds(p_request_id text, p_limit int default 6)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  b      public.document_pdf_builds;
  c      public.clients%rowtype;
  v_out  jsonb := '[]'::jsonb;
  v_docs jsonb;
begin
  for b in select * from public.document_pdf_builds
            where request_id = p_request_id and status = 'pending'
              and (next_attempt_at is null or next_attempt_at <= now())
            order by created_at limit p_limit for update skip locked loop
    if b.attempts >= 3 then
      update public.document_pdf_builds
         set status = 'needs_browser', error_code = 'server_limit',
             error_message = 'השרת לא הצליח להמיר את הקובץ.', error_next = 'ההמרה תושלם אוטומטית כשדף הבקשה ייפתח במשרד.',
             updated_at = now()
       where id = b.id;
      continue;
    end if;
    update public.document_pdf_builds
       set attempts = attempts + 1, next_attempt_at = now() + interval '3 minutes', updated_at = now()
     where id = b.id;
    select * into c from public.clients where id = b.client_id;
    select jsonb_agg(jsonb_build_object('id', d.id, 'storagePath', d.storage_path, 'fileName', d.file_name, 'fileType', d.file_type)
                     order by u.ord)
      into v_docs
      from unnest(b.source_ids) with ordinality u(id, ord) join public.documents d on d.id = u.id;
    v_out := v_out || jsonb_build_array(jsonb_build_object(
      'id', b.id, 'userId', b.user_id, 'clientId', b.client_id, 'fingerprint', b.source_fingerprint,
      'person', b.person, 'slot', b.slot, 'docKind', b.doc_kind, 'documents', coalesce(v_docs, '[]'::jsonb),
      'personName', case when b.person = 'spouse'
                         then trim(coalesce(c.spouse_first_name, '') || ' ' || coalesce(c.spouse_last_name, ''))
                         else trim(coalesce(c.first_name, '') || ' ' || coalesce(c.last_name, '')) end));
  end loop;
  return v_out;
end;
$function$;

create or replace function public.complete_document_pdf_build(
  p_id text, p_fingerprint text, p_storage_path text, p_file_name text,
  p_bytes bigint, p_pages int, p_lossless boolean, p_notes text[], p_built_by text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  b       public.document_pdf_builds;
  v_src   public.documents;
  v_names text;
begin
  select * into b from public.document_pdf_builds where id = p_id for update;
  if b.id is null then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if auth.uid() is not null and (auth.uid() <> b.user_id or not public.is_authorized()) then
    raise exception 'forbidden';
  end if;
  -- ‼ המקורות השתנו בזמן הבנייה ⇒ התוצאה כבר ישנה. בנייה חדשה תרוץ.
  if b.status = 'superseded' or b.source_fingerprint is distinct from p_fingerprint
     or public._doc_fingerprint(b.source_ids) is distinct from p_fingerprint then
    return jsonb_build_object('ok', false, 'error', 'stale');
  end if;
  if p_storage_path is null or p_storage_path <> b.user_id::text || '/' || b.client_id || '/' || b.id then
    return jsonb_build_object('ok', false, 'error', 'bad_path');
  end if;
  select * into v_src from public.documents where id = b.source_ids[1];
  select string_agg(d.file_name, ' + ' order by u.ord) into v_names
    from unnest(b.source_ids) with ordinality u(id, ord) join public.documents d on d.id = u.id;

  insert into public.documents
    (id, user_id, client_id, storage_path, file_name, file_type, file_size, category, year,
     description, notes, label_id, folder_id, source_document_ids, status, uploaded_at)
  values
    (b.id, b.user_id, b.client_id, p_storage_path, p_file_name, 'application/pdf', p_bytes,
     coalesce(v_src.category, 'id_card'), 'general',
     'PDF לרשות המסים - נוצר אוטומטית מהצילום', 'נוצר אוטומטית מ-' || coalesce(v_names, ''),
     v_src.label_id, v_src.folder_id, b.source_ids, 'received', now())
  on conflict (id) do update set
    storage_path = excluded.storage_path, file_name = excluded.file_name, file_size = excluded.file_size,
    description = excluded.description, notes = excluded.notes,
    source_document_ids = excluded.source_document_ids, uploaded_at = now();

  update public.document_pdf_builds
     set status = 'ready', built_by = p_built_by, page_count = p_pages, pdf_bytes = p_bytes,
         lossless = p_lossless, notes = p_notes, ready_at = now(), updated_at = now(),
         error_code = null, error_message = null, error_next = null, next_attempt_at = null
   where id = p_id;

  -- הגשה שנעצרה על «פורמט שאי אפשר להמיר» — עכשיו יש PDF; אותו מסלול כמו מסמך שהגיע (204).
  perform public.resume_shaam_submissions_for_client(b.client_id, 'identity_docs');
  return jsonb_build_object('ok', true);
end;
$function$;

-- p_status: 'needs_browser' | 'failed' | 'retry' (תקלה זמנית — ניסיון נוסף עם השהיה).
create or replace function public.fail_document_pdf_build(
  p_id text, p_fingerprint text, p_code text, p_message text, p_next text, p_status text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  b public.document_pdf_builds;
begin
  select * into b from public.document_pdf_builds where id = p_id for update;
  if b.id is null then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if auth.uid() is not null and (auth.uid() <> b.user_id or not public.is_authorized()) then
    raise exception 'forbidden';
  end if;
  if b.status = 'superseded' or b.source_fingerprint is distinct from p_fingerprint then
    return jsonb_build_object('ok', false, 'error', 'stale');
  end if;
  if p_status = 'retry' then
    if b.attempts >= 5 then
      update public.document_pdf_builds
         set status = 'failed', error_code = coalesce(p_code, 'repeated_failure'),
             error_message = 'ההמרה נכשלה כמה פעמים ברצף.', error_next = 'לנסות שוב מאוחר יותר, או להעלות את הקובץ מחדש.',
             updated_at = now()
       where id = p_id;
    else
      update public.document_pdf_builds
         set status = 'pending', error_code = p_code, error_message = p_message, error_next = p_next,
             next_attempt_at = now() + make_interval(mins => power(2, greatest(b.attempts, 1))::int), updated_at = now()
       where id = p_id;
    end if;
  elsif p_status in ('needs_browser', 'failed') then
    update public.document_pdf_builds
       set status = p_status, error_code = p_code, error_message = p_message, error_next = p_next, updated_at = now()
     where id = p_id;
  else
    raise exception 'bad_status';
  end if;
  return jsonb_build_object('ok', true);
end;
$function$;

-- «נסה שוב» של המשרד.
create or replace function public.retry_document_pdf_build(p_id text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  b public.document_pdf_builds;
begin
  select * into b from public.document_pdf_builds where id = p_id for update;
  if b.id is null then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if auth.uid() is null or auth.uid() <> b.user_id or not public.is_authorized() then raise exception 'forbidden'; end if;
  if b.status not in ('failed', 'needs_browser') then return jsonb_build_object('ok', true, 'unchanged', true); end if;
  update public.document_pdf_builds
     set status = 'pending', attempts = 0, next_attempt_at = null,
         error_code = null, error_message = null, error_next = null, updated_at = now()
   where id = p_id;
  perform public._kick_document_pdf(b.request_id);
  return jsonb_build_object('ok', true);
end;
$function$;

-- ── ⑦ ניסיון חוזר מתוזמן ─────────────────────────────────────────────────
create or replace function public.kick_due_document_pdf_builds()
returns int
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_req text;
  v_n   int := 0;
begin
  for v_req in select distinct request_id from public.document_pdf_builds
                where status = 'pending' and request_id is not null
                  and (next_attempt_at is null or next_attempt_at <= now())
                limit 50 loop
    perform public._kick_document_pdf(v_req);
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$function$;

do $$
begin
  perform cron.unschedule('document-pdf-builds') where exists (select 1 from cron.job where jobname = 'document-pdf-builds');
  perform cron.schedule('document-pdf-builds', '*/5 * * * *', 'select public.kick_due_document_pdf_builds()');
end $$;

-- ── ⑧ «בר-המרה» לפני הגשה: גם PDF מוכן ועדכני מאותם מקורות בדיוק ──────────
-- ‼ עד כאן קירוב לפי file_type בלבד (204) — HEIC/WebP נחסמו לתמיד. עכשיו הם
-- עוברים רק כשיש PDF מוכן, עדכני, מאותה קבוצת מקורות. שאר החסימות בעינן.
create or replace function public._shaam_docs_convertible(p_selection jsonb)
returns boolean
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_ids    text[];
  v_simple boolean;
  v_id     text;
begin
  select array_agg(x ->> 'documentId' order by ord),
         coalesce(bool_and(lower(coalesce(x ->> 'fileType', '')) in ('application/pdf', 'image/jpeg', 'image/jpg', 'image/png')), false)
    into v_ids, v_simple
    from jsonb_array_elements(coalesce(p_selection -> 'documents', '[]'::jsonb)) with ordinality t(x, ord);
  if v_ids is null then return false; end if;
  v_id := public._pdf_build_id(v_ids);
  -- ‼ ידוע שההמרה נכשלה (קובץ פגום/חתוך) על אותם מקורות בדיוק ⇒ לא בר-המרה, גם אם הסוג «נראה» JPG.
  if exists (select 1 from public.document_pdf_builds b
              where b.id = v_id and b.status = 'failed'
                and b.source_fingerprint = public._doc_fingerprint(b.source_ids)) then
    return false;
  end if;
  if v_simple then return true; end if;
  return exists (select 1 from public.document_pdf_builds b
                  where b.id = v_id and b.status = 'ready'
                    and b.source_fingerprint = public._doc_fingerprint(b.source_ids));
end;
$function$;

-- ── ⑨ הפעלה ראשונה על בקשות פתוחות (ידני — לא רץ מעצמו במיגרציה) ──────────
create or replace function public.backfill_document_pdf_builds(p_limit int default 200)
returns int
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_req text;
  v_n   int := 0;
begin
  for v_req in select id from public.representation_requests
                where linked_client_id is not null
                  and status not in ('active', 'cancelled')
                  and identity_docs is not null and identity_docs <> '{}'::jsonb
                limit p_limit loop
    if ((public.sync_document_pdf_builds(v_req)) ->> 'pending')::int > 0 then
      perform public._kick_document_pdf(v_req);
    end if;
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$function$;

-- ── ⑩ הרשאות ──────────────────────────────────────────────────────────────
do $$
declare fn text;
begin
  -- פנימיות / שרת בלבד
  foreach fn in array array[
    'public._pdf_build_id(text[])', 'public._doc_fingerprint(text[])',
    'public.verify_document_pdf_secret(text)', 'public._kick_document_pdf(text)',
    'public.claim_document_pdf_builds(text, integer)', 'public.kick_due_document_pdf_builds()',
    'public.backfill_document_pdf_builds(integer)', 'public._shaam_docs_convertible(jsonb)',
    'public.document_pdf_builds_on_identity_docs()', 'public.document_pdf_builds_on_document_change()'] loop
    execute format('revoke execute on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
  -- המשרד (עם בדיקת בעלות בפנים) + השרת
  foreach fn in array array[
    'public.sync_document_pdf_builds(text)',
    'public.complete_document_pdf_build(text, text, text, text, bigint, integer, boolean, text[], text)',
    'public.fail_document_pdf_build(text, text, text, text, text, text)',
    'public.retry_document_pdf_build(text)'] loop
    execute format('revoke execute on function %s from public, anon', fn);
    execute format('grant execute on function %s to authenticated, service_role', fn);
  end loop;
end $$;
