-- ════════════════════════════════════════════════════════════════════════════
-- 211 · PDF מוכן ברקע לכל צילום מזהה שהבקשה תצטרך (01.10.2026)
-- ════════════════════════════════════════════════════════════════════════════
-- גיא: «אני רוצה שה-PDF יהיה מוכן וזמין לצפייה מוקדם יותר, בלי שאצטרך ללחוץ
-- ׳הכן PDF עכשיו׳ — ברקע, בעת העלאה או שיוך של תמונה».
-- ‼ נכתב כ-210 ועבר ל-211: המספר 210 נתפס בייצור (smart-form-mapping-versions).
--
-- ‼ מודל: לכל (בקשה × אדם × סוג מסמך) — קבוצת המקורות (קדמי, אחורי) ⇒ PDF.
--   · זהות = pdf-<sha256 של מזהי המקורות הממוינים> — אותה נוסחה בדפדפן, בשרת
--     ובעובד (imageToPdfCore.pdfVersionIdFor). כמה מסלולים ⇒ רשומה אחת.
--   · «עדכני» = טביעת המקורות (מזהה + נתיב + גודל + זמן העלאה, לפי סדר העמודים)
--     זהה לזו שה-PDF נבנה ממנה. החלפת צילום ⇒ טביעה אחרת ⇒ בנייה מחדש.
--   · הקובץ נשמר בנתיב שתלוי בטביעה (…/<id>-<8 תווי טביעה>) — PDF שנבנה ממקור
--     ישן לעולם לא דורס את הנתיב של המקור העדכני.
--   · קבוצה שהתחלפה (צילום אחר שויך) ⇒ הבנייה הישנה «הוחלפה» וה-PDF שלה מסומן
--     בתיק כישן. היא לעולם לא נחשבת המסמך הנוכחי.
--
-- ‼ שתי גרסאות (גיא, 01.10.2026: «שמירה על קריאות חשובה יותר מעמידה אוטומטית
--   במגבלת הגודל»):
--   · מקור — PDF ברזולוציה המלאה, בלי אובדן כשאפשר. תמיד נשמר.
--   · הגשה — אותו קובץ כשהוא עומד במגבלת שע״ם (30MB): submission_state='same'.
--     חרג ⇒ גרסה נפרדת (<id>-s):
--       'auto'     רזולוציה מלאה, רק פיקסלים שפוענחו נדחסו (JPEG 95%); JPEG מקורי
--                  לא נגע. נחשב קריא.
--       'review'   הוקטן, או JPEG מקורי נדחס שוב ⇒ לא עובר אוטומטית. המשרד משווה
--                  ומחליט: 'approved' (קריא) או 'rejected' (צריך מקור טוב יותר).
--   ההגשה (ובדיקת «בר-המרה») משתמשת רק ב-same/auto/approved.
--
-- ‼ «PDF מוכן» אינו «הלקוח אישר». האישור נשאר clientConfirmedAt ב-identity_docs
--   (208), והחסימות שלפני ההגשה לא משתנות.
--
-- ‼ מי בונה:
--   · השרת (document-pdf) — JPG/PNG/PDF, מיד ברקע, כשהמקור נשמר כמו שהוא ועומד
--     במגבלה.
--   · עובד האוטומציה במחשב המשרד — כל השאר: HEIC, WebP, AVIF, GIF, BMP, קבצים עם
--     כמה פריימים, וקבצים שחרגו מהמגבלה. בדפדפן ללא-ראש (Chrome) עם אותו קוד המרה
--     של האתר. לא תלוי בדף פתוח; כשהמחשב כבוי — ממתין, וממשיך כשהוא עולה.
--   · כשל אמיתי (קובץ פגום, פורמט לא נתמך) ⇒ 'failed' עם הסבר ודרך להמשך.

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
  status             text not null default 'pending',
  error_code         text,
  error_message      text,
  error_next         text,
  attempts           int not null default 0,
  next_attempt_at    timestamptz,
  built_by           text,
  page_count         int,
  pdf_bytes          bigint,
  lossless           boolean,
  notes              text[],
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  ready_at           timestamptz
);
-- עובד האוטומציה: חכירה משלו (המחשב יכול להיות כבוי ימים — לא סופרים את זה כניסיון).
alter table public.document_pdf_builds add column if not exists claimed_by text;
alter table public.document_pdf_builds add column if not exists lease_until timestamptz;
alter table public.document_pdf_builds add column if not exists worker_attempts int not null default 0;
-- המקור: הנתיב, ופרטי החלקים לתצוגה (פורמט, מידות, פריימים).
alter table public.document_pdf_builds add column if not exists original_path text;
alter table public.document_pdf_builds add column if not exists original_meta jsonb;
-- ההגשה.
alter table public.document_pdf_builds add column if not exists submission_state text;
alter table public.document_pdf_builds add column if not exists submission_document_id text;
alter table public.document_pdf_builds add column if not exists submission_path text;
alter table public.document_pdf_builds add column if not exists submission_bytes bigint;
alter table public.document_pdf_builds add column if not exists submission_page_count int;
alter table public.document_pdf_builds add column if not exists submission_notes text[];
alter table public.document_pdf_builds add column if not exists submission_meta jsonb;
alter table public.document_pdf_builds add column if not exists submission_decided_at timestamptz;

-- ‼ סטטוסים: needs_browser (גרסה מוקדמת על staging) ⇒ needs_worker.
alter table public.document_pdf_builds drop constraint if exists document_pdf_builds_status_check;
update public.document_pdf_builds set status = 'needs_worker' where status = 'needs_browser';
alter table public.document_pdf_builds add constraint document_pdf_builds_status_check
  check (status in ('pending', 'ready', 'needs_worker', 'failed', 'superseded'));
alter table public.document_pdf_builds drop constraint if exists document_pdf_builds_built_by_check;
alter table public.document_pdf_builds add constraint document_pdf_builds_built_by_check
  check (built_by is null or built_by in ('server', 'worker', 'browser'));
alter table public.document_pdf_builds drop constraint if exists document_pdf_builds_submission_state_check;
alter table public.document_pdf_builds add constraint document_pdf_builds_submission_state_check
  check (submission_state is null or submission_state in ('same', 'auto', 'review', 'approved', 'rejected'));

create index if not exists document_pdf_builds_request_idx on public.document_pdf_builds (request_id);
create index if not exists document_pdf_builds_client_idx on public.document_pdf_builds (client_id);
create index if not exists document_pdf_builds_due_idx on public.document_pdf_builds (status, next_attempt_at);
create index if not exists document_pdf_builds_worker_idx on public.document_pdf_builds (user_id, status, lease_until);

alter table public.document_pdf_builds enable row level security;
drop policy if exists document_pdf_builds_select_own on public.document_pdf_builds;
create policy document_pdf_builds_select_own on public.document_pdf_builds
  for select to authenticated using (auth.uid() = user_id);
drop policy if exists require_authorized on public.document_pdf_builds;
create policy require_authorized on public.document_pdf_builds as restrictive for all to authenticated
  using (public.is_authorized()) with check (public.is_authorized());
revoke all on public.document_pdf_builds from anon;
grant select on public.document_pdf_builds to authenticated;

-- ── ② זהות, טביעה ונתיבים ──────────────────────────────────────────────────
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

-- ‼ הנתיב תלוי בטביעה: בנייה ממקור שהתחלף כותבת לנתיב אחר, ולעולם לא דורסת.
create or replace function public._pdf_build_paths(p_user uuid, p_client text, p_id text, p_fingerprint text)
returns jsonb
language sql
immutable
set search_path to 'public'
as $function$
  select jsonb_build_object(
    'original',   p_user::text || '/' || p_client || '/' || p_id || '-' || left(encode(sha256(convert_to(p_fingerprint, 'UTF8')), 'hex'), 8),
    'submission', p_user::text || '/' || p_client || '/' || p_id || '-' || left(encode(sha256(convert_to(p_fingerprint, 'UTF8')), 'hex'), 8) || '-s');
$function$;

-- מי מתחיל: השרת כשכל המקורות JPG/PNG/PDF; אחרת ישר לעובד.
create or replace function public._pdf_route_for(p_ids text[])
returns text
language sql
stable
set search_path to 'public'
as $function$
  select case when bool_and(lower(coalesce(d.file_type, '')) in ('application/pdf', 'image/jpeg', 'image/jpg', 'image/png')
                            or lower(coalesce(d.file_name, '')) ~ '\.(pdf|jpe?g|png)$')
              then 'pending' else 'needs_worker' end
    from public.documents d where d.id = any(p_ids);
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
  r        public.representation_requests;
  v_person text;
  v_slot   text;
  v_sel    jsonb;
  v_ids    text[];
  v_allpdf boolean;
  v_id     text;
  v_fp     text;
  v_prev   public.document_pdf_builds;
  v_keep   text[] := '{}';
  v_pending int;
  v_worker  int;
begin
  select * into r from public.representation_requests where id = p_request_id;
  if r.id is null or r.linked_client_id is null then return jsonb_build_object('pending', 0, 'needsWorker', 0); end if;
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

      select * into v_prev from public.document_pdf_builds where id = v_id;
      -- ‼ הצילום הוחלף במקום (אותו מזהה, קובץ אחר): ה-PDF שבתיק אינו של הצילום הנוכחי.
      if v_prev.id is not null and v_prev.status = 'ready' and v_prev.source_fingerprint is distinct from v_fp then
        update public.documents
           set description = 'PDF ישן - הצילום שממנו נוצר הוחלף; PDF חדש בהכנה'
         where id in (v_prev.id, v_prev.id || '-s');
      end if;

      insert into public.document_pdf_builds as b
        (id, user_id, client_id, request_id, person, slot, doc_kind, source_ids, source_fingerprint, status)
      values (v_id, r.user_id, r.linked_client_id, r.id, v_person, v_slot, v_sel ->> 'docKind', v_ids, v_fp,
              public._pdf_route_for(v_ids))
      on conflict (id) do update set
        request_id = excluded.request_id, person = excluded.person, slot = excluded.slot, doc_kind = excluded.doc_kind,
        source_ids = excluded.source_ids,
        status = case when b.source_fingerprint is distinct from excluded.source_fingerprint or b.status = 'superseded'
                      then excluded.status else b.status end,
        attempts = case when b.source_fingerprint is distinct from excluded.source_fingerprint or b.status = 'superseded'
                        then 0 else b.attempts end,
        worker_attempts = case when b.source_fingerprint is distinct from excluded.source_fingerprint or b.status = 'superseded'
                               then 0 else b.worker_attempts end,
        claimed_by = case when b.source_fingerprint is distinct from excluded.source_fingerprint then null else b.claimed_by end,
        lease_until = case when b.source_fingerprint is distinct from excluded.source_fingerprint then null else b.lease_until end,
        error_code = case when b.source_fingerprint is distinct from excluded.source_fingerprint then null else b.error_code end,
        error_message = case when b.source_fingerprint is distinct from excluded.source_fingerprint then null else b.error_message end,
        error_next = case when b.source_fingerprint is distinct from excluded.source_fingerprint then null else b.error_next end,
        next_attempt_at = case when b.source_fingerprint is distinct from excluded.source_fingerprint then null else b.next_attempt_at end,
        -- ‼ החלטה על גרסת הגשה שייכת לטביעה שעליה הוחלט — מקור אחר ⇒ אין החלטה.
        submission_state = case when b.source_fingerprint is distinct from excluded.source_fingerprint then null else b.submission_state end,
        submission_decided_at = case when b.source_fingerprint is distinct from excluded.source_fingerprint then null else b.submission_decided_at end,
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
   where d.id in (gone.id, gone.id || '-s') and coalesce(d.notes, '') not like '%הוחלף: יש PDF חדש%';

  select count(*) filter (where status = 'pending'), count(*) filter (where status = 'needs_worker')
    into v_pending, v_worker
    from public.document_pdf_builds where request_id = r.id;
  return jsonb_build_object('pending', v_pending, 'needsWorker', v_worker);
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

-- ── ⑥ השרת לוקח עבודה ───────────────────────────────────────────────────
-- ‼ «חכירה» של 3 דקות במקום נעילה: קריאה כפולה לא בונה פעמיים, ושרת שנפל באמצע
-- לא תוקע את הבנייה — ה-cron מנסה שוב. 2 ניסיונות שרת ⇒ עובר לעובד.
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
    if b.attempts >= 2 then
      update public.document_pdf_builds
         set status = 'needs_worker', error_code = 'server_limit',
             error_message = null, error_next = null, updated_at = now()
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
      'paths', public._pdf_build_paths(b.user_id, b.client_id, b.id, b.source_fingerprint),
      'person', b.person, 'slot', b.slot, 'docKind', b.doc_kind, 'documents', coalesce(v_docs, '[]'::jsonb),
      'personName', case when b.person = 'spouse'
                         then trim(coalesce(c.spouse_first_name, '') || ' ' || coalesce(c.spouse_last_name, ''))
                         else trim(coalesce(c.first_name, '') || ' ' || coalesce(c.last_name, '')) end));
  end loop;
  return v_out;
end;
$function$;

-- ── ⑦ עובד האוטומציה לוקח עבודה ─────────────────────────────────────────
-- ‼ רק בניות של החשבון שהמחשב רשום אליו (user_id נגזר בשרת מאסימון המחשב).
-- חכירה של 10 דקות; 4 ניסיונות כושלים של העובד ⇒ 'failed' עם «נסה שוב».
create or replace function public.claim_worker_document_pdf_builds(p_user_id uuid, p_worker_id text, p_limit int default 2)
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
  if p_user_id is null or coalesce(p_worker_id, '') = '' then raise exception 'bad_request'; end if;
  for b in select * from public.document_pdf_builds
            where user_id = p_user_id and status = 'needs_worker'
              and (lease_until is null or lease_until <= now())
            order by updated_at limit greatest(1, least(p_limit, 5)) for update skip locked loop
    -- ‼ המקורות השתנו מאז הסנכרון האחרון ⇒ מסנכרנים, ולא בונים ממקור ישן.
    if public._doc_fingerprint(b.source_ids) is distinct from b.source_fingerprint then
      if b.request_id is not null then perform public.sync_document_pdf_builds(b.request_id); end if;
      continue;
    end if;
    if b.worker_attempts >= 4 then
      update public.document_pdf_builds
         set status = 'failed', error_code = 'repeated_failure',
             error_message = 'ההמרה במחשב המשרד נכשלה כמה פעמים ברצף'
                             || coalesce(' (' || rtrim(error_message, '.') || ')', '') || '.',
             error_next = 'לנסות שוב, או להעלות את הצילום מחדש כ-JPG.', updated_at = now()
       where id = b.id;
      continue;
    end if;
    update public.document_pdf_builds
       set claimed_by = p_worker_id, lease_until = now() + interval '10 minutes',
           worker_attempts = worker_attempts + 1, updated_at = now()
     where id = b.id;
    select * into c from public.clients where id = b.client_id;
    select jsonb_agg(jsonb_build_object('id', d.id, 'storagePath', d.storage_path, 'fileName', d.file_name, 'fileType', d.file_type)
                     order by u.ord)
      into v_docs
      from unnest(b.source_ids) with ordinality u(id, ord) join public.documents d on d.id = u.id;
    v_out := v_out || jsonb_build_array(jsonb_build_object(
      'id', b.id, 'userId', b.user_id, 'clientId', b.client_id, 'fingerprint', b.source_fingerprint,
      'paths', public._pdf_build_paths(b.user_id, b.client_id, b.id, b.source_fingerprint),
      'person', b.person, 'slot', b.slot, 'docKind', b.doc_kind, 'documents', coalesce(v_docs, '[]'::jsonb),
      'personName', case when b.person = 'spouse'
                         then trim(coalesce(c.spouse_first_name, '') || ' ' || coalesce(c.spouse_last_name, ''))
                         else trim(coalesce(c.first_name, '') || ' ' || coalesce(c.last_name, '')) end));
  end loop;
  return v_out;
end;
$function$;

-- ── ⑧ סיום: המקור, ואם צריך — גרסת הגשה נפרדת ─────────────────────────────
-- p_result = { original: {path, fileName, bytes, pages, lossless, notes[], parts[]},
--              submission: null | {path, fileName, bytes, pages, mode, needsReview, notes[], focus[], pages_meta[]} }
drop function if exists public.complete_document_pdf_build(text, text, text, text, bigint, integer, boolean, text[], text);
create or replace function public.complete_document_pdf_build(
  p_id text, p_fingerprint text, p_built_by text, p_result jsonb, p_worker_id text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  b       public.document_pdf_builds;
  v_src   public.documents;
  v_names text;
  v_paths jsonb;
  v_o     jsonb := p_result -> 'original';
  v_s     jsonb := p_result -> 'submission';
  v_state text;
  v_old   text[] := '{}';
  v_label text;
begin
  select * into b from public.document_pdf_builds where id = p_id for update;
  if b.id is null then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if auth.uid() is not null and (auth.uid() <> b.user_id or not public.is_authorized()) then
    raise exception 'forbidden';
  end if;
  if p_built_by not in ('server', 'worker', 'browser') then raise exception 'bad_built_by'; end if;
  -- ‼ המקורות השתנו בזמן הבנייה ⇒ התוצאה כבר ישנה. בנייה חדשה תרוץ.
  if b.status = 'superseded' or b.source_fingerprint is distinct from p_fingerprint
     or public._doc_fingerprint(b.source_ids) is distinct from p_fingerprint then
    return jsonb_build_object('ok', false, 'error', 'stale');
  end if;
  if b.status = 'ready' then return jsonb_build_object('ok', true, 'unchanged', true); end if;
  v_paths := public._pdf_build_paths(b.user_id, b.client_id, b.id, b.source_fingerprint);
  if v_o is null or v_o ->> 'path' is distinct from v_paths ->> 'original'
     or coalesce((v_o ->> 'bytes')::bigint, 0) <= 0 or coalesce((v_o ->> 'pages')::int, 0) <= 0 then
    return jsonb_build_object('ok', false, 'error', 'bad_original');
  end if;
  if jsonb_typeof(v_s) = 'object' and (v_s ->> 'path' is distinct from v_paths ->> 'submission'
     or coalesce((v_s ->> 'bytes')::bigint, 0) <= 0 or coalesce((v_s ->> 'pages')::int, 0) <= 0) then
    return jsonb_build_object('ok', false, 'error', 'bad_submission');
  end if;
  -- ‼ עמוד שחסר בגרסת ההגשה הוא מסמך חסר — לא «הצלחה».
  if jsonb_typeof(v_s) = 'object' and (v_s ->> 'pages')::int <> (v_o ->> 'pages')::int then
    return jsonb_build_object('ok', false, 'error', 'page_count_mismatch');
  end if;

  v_state := case
    when coalesce(jsonb_typeof(v_s), 'null') <> 'object' then 'same'
    when coalesce((v_s ->> 'needsReview')::boolean, true) then 'review'
    else 'auto' end;

  select * into v_src from public.documents where id = b.source_ids[1];
  select string_agg(d.file_name, ' + ' order by u.ord) into v_names
    from unnest(b.source_ids) with ordinality u(id, ord) join public.documents d on d.id = u.id;
  -- קבצים שהשורה מפסיקה להצביע עליהם (נבנו מטביעה קודמת) — השרת מוחק אותם אחרי ה-commit.
  -- ‼ שורת הגשה ישנה שנשארת (מצב same) ממשיכה להצביע על הקובץ שלה — הוא לא נמחק.
  select array_agg(x) into v_old from (
    select storage_path x from public.documents
     where id = b.id and storage_path is not null and storage_path <> v_paths ->> 'original'
    union all
    select storage_path from public.documents
     where id = b.id || '-s' and v_state <> 'same' and storage_path is not null and storage_path <> v_paths ->> 'submission'
  ) t;

  insert into public.documents
    (id, user_id, client_id, storage_path, file_name, file_type, file_size, category, year,
     description, notes, label_id, folder_id, source_document_ids, status, uploaded_at)
  values
    (b.id, b.user_id, b.client_id, v_paths ->> 'original', coalesce(v_o ->> 'fileName', 'מסמך (PDF).pdf'), 'application/pdf',
     (v_o ->> 'bytes')::bigint, coalesce(v_src.category, 'id_card'), 'general',
     case when v_state = 'same' then 'PDF לרשות המסים - נוצר אוטומטית מהצילום'
          else 'PDF באיכות המקור - נוצר אוטומטית מהצילום' end,
     'נוצר אוטומטית מ-' || coalesce(v_names, ''),
     v_src.label_id, v_src.folder_id, b.source_ids, 'received', now())
  on conflict (id) do update set
    storage_path = excluded.storage_path, file_name = excluded.file_name, file_size = excluded.file_size,
    description = excluded.description, notes = excluded.notes,
    source_document_ids = excluded.source_document_ids, uploaded_at = now();

  if v_state = 'same' then
    -- ‼ גרסת הגשה נפרדת מבנייה קודמת אינה בתוקף — מסומנת, לא נמחקת.
    update public.documents
       set description = 'PDF ישן להגשה - הוחלף; המקור עומד במגבלה ומוגש כמו שהוא'
     where id = b.id || '-s';
  else
    v_label := case when v_state = 'review' then 'PDF להגשה לרשות המסים - מוקטן, ממתין לבדיקה'
                    else 'PDF להגשה לרשות המסים - דחוס ברזולוציה מלאה' end;
    insert into public.documents
      (id, user_id, client_id, storage_path, file_name, file_type, file_size, category, year,
       description, notes, label_id, folder_id, source_document_ids, status, uploaded_at)
    values
      (b.id || '-s', b.user_id, b.client_id, v_paths ->> 'submission', coalesce(v_s ->> 'fileName', 'מסמך (PDF להגשה).pdf'),
       'application/pdf', (v_s ->> 'bytes')::bigint, coalesce(v_src.category, 'id_card'), 'general',
       v_label, 'נוצר אוטומטית מ-' || coalesce(v_names, '') || ' כדי לעמוד במגבלת 30MB של שע״ם',
       v_src.label_id, v_src.folder_id, b.source_ids, 'received', now())
    on conflict (id) do update set
      storage_path = excluded.storage_path, file_name = excluded.file_name, file_size = excluded.file_size,
      description = excluded.description, notes = excluded.notes,
      source_document_ids = excluded.source_document_ids, uploaded_at = now();
  end if;

  update public.document_pdf_builds
     set status = 'ready', built_by = p_built_by, ready_at = now(), updated_at = now(),
         page_count = (v_o ->> 'pages')::int, pdf_bytes = (v_o ->> 'bytes')::bigint,
         lossless = coalesce((v_o ->> 'lossless')::boolean, false),
         notes = array(select jsonb_array_elements_text(coalesce(v_o -> 'notes', '[]'::jsonb))),
         original_path = v_paths ->> 'original', original_meta = v_o -> 'parts',
         submission_state = v_state,
         submission_document_id = case when v_state = 'same' then b.id else b.id || '-s' end,
         submission_path = case when v_state = 'same' then v_paths ->> 'original' else v_paths ->> 'submission' end,
         submission_bytes = case when v_state = 'same' then (v_o ->> 'bytes')::bigint else (v_s ->> 'bytes')::bigint end,
         submission_page_count = case when v_state = 'same' then (v_o ->> 'pages')::int else (v_s ->> 'pages')::int end,
         submission_notes = case when v_state = 'same' then null
                                 else array(select jsonb_array_elements_text(coalesce(v_s -> 'notes', '[]'::jsonb))) end,
         submission_meta = case when v_state = 'same' then null
                                else jsonb_build_object('mode', v_s -> 'mode', 'focus', coalesce(v_s -> 'focus', '[]'::jsonb),
                                                        'pages', coalesce(v_s -> 'pagesMeta', '[]'::jsonb), 'limit', v_s -> 'limit') end,
         submission_decided_at = null,
         error_code = null, error_message = null, error_next = null, next_attempt_at = null,
         claimed_by = null, lease_until = null
   where id = p_id;

  -- הגשה שנעצרה על «אין PDF תקין» — עכשיו יש; אותו מסלול כמו מסמך שהגיע (204).
  if v_state in ('same', 'auto') then
    perform public.resume_shaam_submissions_for_client(b.client_id, 'identity_docs');
  end if;
  return jsonb_build_object('ok', true, 'submissionState', v_state, 'oldPaths', coalesce(to_jsonb(v_old), '[]'::jsonb));
end;
$function$;

-- p_status: 'needs_worker' (השרת מעביר) | 'failed' (כשל אמיתי) | 'retry' (תקלה זמנית).
drop function if exists public.fail_document_pdf_build(text, text, text, text, text, text);
create or replace function public.fail_document_pdf_build(
  p_id text, p_fingerprint text, p_code text, p_message text, p_next text, p_status text, p_by text default 'server')
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
  if b.status = 'ready' then return jsonb_build_object('ok', false, 'error', 'already_ready'); end if;
  if p_status = 'retry' and p_by = 'worker' then
    -- ‼ זמני אצל העובד: חוזר לתור אחרי השהיה. ספירת הניסיונות נעשית בתפיסה.
    update public.document_pdf_builds
       set status = 'needs_worker', error_code = p_code, error_message = p_message, error_next = p_next,
           claimed_by = null, lease_until = now() + make_interval(mins => power(2, greatest(b.worker_attempts, 1))::int),
           updated_at = now()
     where id = p_id;
  elsif p_status = 'retry' then
    if b.attempts >= 2 then
      update public.document_pdf_builds
         set status = 'needs_worker', error_code = coalesce(p_code, 'server_limit'), error_message = null, error_next = null,
             updated_at = now()
       where id = p_id;
    else
      update public.document_pdf_builds
         set status = 'pending', error_code = p_code, error_message = p_message, error_next = p_next,
             next_attempt_at = now() + make_interval(mins => power(2, greatest(b.attempts, 1))::int), updated_at = now()
       where id = p_id;
    end if;
  elsif p_status = 'needs_worker' then
    update public.document_pdf_builds
       set status = 'needs_worker', error_code = p_code, error_message = null, error_next = null,
           claimed_by = null, lease_until = null, updated_at = now()
     where id = p_id;
  elsif p_status = 'failed' then
    update public.document_pdf_builds
       set status = 'failed', error_code = p_code, error_message = p_message, error_next = p_next,
           claimed_by = null, lease_until = null, updated_at = now()
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
  b       public.document_pdf_builds;
  v_route text;
begin
  select * into b from public.document_pdf_builds where id = p_id for update;
  if b.id is null then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if auth.uid() is null or auth.uid() <> b.user_id or not public.is_authorized() then raise exception 'forbidden'; end if;
  if b.status not in ('failed', 'needs_worker') then return jsonb_build_object('ok', true, 'unchanged', true); end if;
  v_route := public._pdf_route_for(b.source_ids);
  update public.document_pdf_builds
     set status = v_route, attempts = 0, worker_attempts = 0, next_attempt_at = null,
         claimed_by = null, lease_until = null,
         error_code = null, error_message = null, error_next = null, updated_at = now()
   where id = p_id;
  if v_route = 'pending' then perform public._kick_document_pdf(b.request_id); end if;
  return jsonb_build_object('ok', true);
end;
$function$;

-- ── ⑨ החלטת המשרד על גרסת הגשה מוקטנת ────────────────────────────────────
-- 'approve' ⇒ קריא, מותר להגיש · 'reject' ⇒ צריך מקור טוב יותר · 'reopen' ⇒ חזרה לבדיקה.
-- ‼ ההחלטה שייכת לטביעה: מקור שהוחלף ⇒ בנייה חדשה ⇒ החלטה חדשה.
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
  update public.documents
     set description = case v_to
           when 'approved' then 'PDF להגשה לרשות המסים - מוקטן, נבדק ואושר כקריא'
           when 'rejected' then 'PDF להגשה - נפסל (לא קריא מספיק); נדרש צילום טוב יותר'
           else 'PDF להגשה לרשות המסים - מוקטן, ממתין לבדיקה' end
   where id = b.id || '-s';
  if v_to = 'approved' then
    perform public.resume_shaam_submissions_for_client(b.client_id, 'identity_docs');
  end if;
  return jsonb_build_object('ok', true, 'state', v_to);
end;
$function$;

-- ── ⑩ ניסיון חוזר מתוזמן (שרת) ───────────────────────────────────────────
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

-- ── ⑪ «בר-המרה» לפני הגשה ─────────────────────────────────────────────────
-- ‼ כשיש בנייה לאותם מקורות בדיוק, היא קובעת: רק PDF מוכן, עדכני, וגרסת הגשה
-- שמותר להגיש (same/auto/approved). בהכנה / ממתין לבדיקה / נפסל / נכשל ⇒ לא.
-- בלי בנייה בכלל (נתונים ישנים) — הקירוב של 204 לפי הסוג.
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
  b        public.document_pdf_builds;
begin
  select array_agg(x ->> 'documentId' order by ord),
         coalesce(bool_and(lower(coalesce(x ->> 'fileType', '')) in ('application/pdf', 'image/jpeg', 'image/jpg', 'image/png')), false)
    into v_ids, v_simple
    from jsonb_array_elements(coalesce(p_selection -> 'documents', '[]'::jsonb)) with ordinality t(x, ord);
  if v_ids is null then return false; end if;
  select * into b from public.document_pdf_builds
   where id = public._pdf_build_id(v_ids) and status <> 'superseded'
     and source_fingerprint = public._doc_fingerprint(v_ids);
  if b.id is not null then
    return b.status = 'ready' and coalesce(b.submission_state, 'same') in ('same', 'auto', 'approved');
  end if;
  return v_simple;
end;
$function$;

-- ── ⑫ הפעלה ראשונה על בקשות פתוחות (ידני — לא רץ מעצמו במיגרציה) ──────────
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

-- ── ⑬ הרשאות ──────────────────────────────────────────────────────────────
do $$
declare fn text;
begin
  -- פנימיות / שרת בלבד
  foreach fn in array array[
    'public._pdf_build_id(text[])', 'public._doc_fingerprint(text[])',
    'public._pdf_build_paths(uuid, text, text, text)', 'public._pdf_route_for(text[])',
    'public.verify_document_pdf_secret(text)', 'public._kick_document_pdf(text)',
    'public.claim_document_pdf_builds(text, integer)', 'public.kick_due_document_pdf_builds()',
    'public.claim_worker_document_pdf_builds(uuid, text, integer)',
    'public.backfill_document_pdf_builds(integer)', 'public._shaam_docs_convertible(jsonb)',
    'public.complete_document_pdf_build(text, text, text, jsonb, text)',
    'public.fail_document_pdf_build(text, text, text, text, text, text, text)',
    'public.document_pdf_builds_on_identity_docs()', 'public.document_pdf_builds_on_document_change()'] loop
    execute format('revoke execute on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
  -- המשרד (עם בדיקת בעלות בפנים) + השרת
  foreach fn in array array[
    'public.sync_document_pdf_builds(text)',
    'public.retry_document_pdf_build(text)',
    'public.decide_document_pdf_submission(text, text, text)'] loop
    execute format('revoke execute on function %s from public, anon', fn);
    execute format('grant execute on function %s to authenticated, service_role', fn);
  end loop;
end $$;
