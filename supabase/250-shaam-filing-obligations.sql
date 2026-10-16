-- ─── 250 · חובות הגשה שנקלטו מרשימות שע״ם (דוח שנתי · הצהרות הון) — 16.10.2026 ─────────────────────
-- הבריף: docs/CLAUDE-SHAAM-FILING-IMPORT-BRIEF-2026-10-16.md. המשרד מפיק משע״ם רשימות (IDOM «מעקב הגשת דוחות»,
-- AHZM «רשימת דרישות» להצהרות הון), מעלה PDF, והמערכת מסמנת בתיק של כל לקוח מי חייב במה ועד מתי.
--
-- ‼ חובה שנקלטה היא **מצב נגזר על התיק**, לא בקשה (יסודות §2). היא מציעה בקשה: «פתח בקשה» יוצר את בקשת הדוח/ההון
--   במנגנון הקיים (upsert_tax_work, כטיוטה מוחזקת — בלי פרסום ובלי מייל) ומקשר אותה כאן (link_shaam_obligation_step).
-- ‼ זהות: (משרד, סוג, מספר תיק, השנה כפי שמופיעה). ייבוא חוזר לא יוצר שורה שנייה; קובץ ישן לא דורס עדכון חדש;
--   שינוי נשמר בהיסטוריה עם המקור. היעלמות מרשימה לא סוגרת דבר — רק ראיית הגשה (תאריך הגשה / קבוצת «הגישו»).
-- ‼ שיוך ללקוח — רק לפי מזהה סמכותי: מספר תיק מ״ה בכרטיס › ת.ז. הלקוח › ת.ז. בן/בת הזוג (תיק משותף).
--   שם לבדו לא משייך. כמה כרטיסים, או מספר תואם עם שם שאינו תואם — «לבדיקה», בלי כתיבה לתיק.
-- ‼ שנת הצהרת ההון נשמרת כפי שמופיעה (year_shown) — לא הופכת ל-31 בדצמבר. מועד חסר = NULL (לא ידוע).
-- ‼ הקובץ המקורי מכיל לקוחות רבים: נשמר בדלי פרטי של המשרד (office-imports/<משרד>/…), לעולם לא בתיקי הלקוחות
--   ולא בדף האישי. בתיק הלקוח מוצגת רק השורה שלו (עמוד ושורה).
-- ‼ anon — חסום בכל הפונקציות ובטבלאות. כתיבה רק דרך הפונקציות; לדפדפן — קריאה בלבד דרך shaam_filing_list.
-- החזרה: scripts/sql/250/rollback-250.sql · בדיקה בבידוד: scripts/sql/250/test-250.pglite.mjs

-- ── 1 · טבלאות ───────────────────────────────────────────────────────────────────────────────────
create table if not exists public.shaam_filing_sources (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null,
  method          text not null default 'pdf' check (method in ('pdf', 'manual')),
  file_name       text not null,
  content_sha256  text,
  storage_path    text,
  file_size       bigint,
  list_kind       text not null check (list_kind in ('annual', 'wealth')),
  wealth_group    text check (wealth_group in ('unfiled_no_fine', 'unfiled_fine', 'filed_fine', 'filed_no_fine')),
  tax_year        int,
  produced_raw    text,
  produced_on     date,
  -- [{page, pageTotal, status, rows}] — מה נקרא מכל עמוד
  pages           jsonb not null default '[]'::jsonb,
  status          text not null check (status in ('ok', 'empty_confirmed', 'partial')),
  note            text,
  uploaded_at     timestamptz not null default now(),
  uploaded_by     uuid
);
create unique index if not exists shaam_filing_sources_sha_uidx on public.shaam_filing_sources (user_id, content_sha256) where content_sha256 is not null;
create index if not exists shaam_filing_sources_user_idx on public.shaam_filing_sources (user_id, uploaded_at desc);

create table if not exists public.shaam_filing_obligations (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null,
  kind            text not null check (kind in ('annual', 'wealth')),
  file_number     text not null check (file_number ~ '^[0-9]{9}$'),
  year_shown      text not null,
  tax_year        int,
  name_captured   text,
  office          text,
  file_type       text,
  section         text,
  branch          text,
  required        boolean,
  legal_due       date,
  legal_due_raw   text,
  filed_on        date,
  filed_on_raw    text,
  no_assessment   boolean not null default false,
  wealth_group    text check (wealth_group in ('unfiled_no_fine', 'unfiled_fine', 'filed_fine', 'filed_no_fine')),
  fine            boolean,
  -- מה שע״ם אומר: open (חייב, לא הוגש) · filed (הגשה רשומה) · context (לא דרישה — למשל בלי «ח»)
  shaam_status    text not null check (shaam_status in ('open', 'filed', 'context')),
  -- מצב בתיק: open · filed_per_shaam (נפתחה אצלנו והוגשה) · history (כבר הוגשה כשנקלטה) · context · needs_review · dismissed
  state           text not null check (state in ('open', 'filed_per_shaam', 'history', 'context', 'needs_review', 'dismissed')),
  review_reason   text,
  client_id       text references public.clients(id) on delete set null,
  subject_role    text check (subject_role in ('client', 'spouse')),
  match_kind      text check (match_kind in ('tax_file', 'id', 'spouse_id', 'manual')),
  candidates      jsonb,
  step_id         text references public.onboarding_steps(id) on delete set null,
  copy_step_id    text references public.onboarding_steps(id) on delete set null,
  source_id       uuid references public.shaam_filing_sources(id) on delete set null,
  -- {sourceId, page, line} — איפה בקובץ
  evidence        jsonb not null default '{}'::jsonb,
  produced_on     date,
  -- גרסאות קודמות: [{at, sourceId, producedOn, values}]
  history         jsonb not null default '[]'::jsonb,
  first_seen_at   timestamptz not null default now(),
  last_seen_at    timestamptz not null default now(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create unique index if not exists shaam_filing_obligations_identity_uidx on public.shaam_filing_obligations (user_id, kind, file_number, year_shown);
create index if not exists shaam_filing_obligations_client_idx on public.shaam_filing_obligations (client_id) where client_id is not null;

comment on table public.shaam_filing_obligations is
  '250 · חובת הגשה/דרישה כפי שנקלטה מרשימת שע״ם (IDOM/AHZM). מצב נגזר על התיק — לא בקשה; הבקשה מקושרת ב-step_id.';

alter table public.shaam_filing_sources enable row level security;
alter table public.shaam_filing_obligations enable row level security;
drop policy if exists shaam_filing_sources_own on public.shaam_filing_sources;
create policy shaam_filing_sources_own on public.shaam_filing_sources for select to authenticated
  using (user_id = auth.uid() and public.is_authorized());
drop policy if exists shaam_filing_obligations_own on public.shaam_filing_obligations;
create policy shaam_filing_obligations_own on public.shaam_filing_obligations for select to authenticated
  using (user_id = auth.uid() and public.is_authorized());
revoke all on public.shaam_filing_sources, public.shaam_filing_obligations from public, anon;
revoke insert, update, delete, truncate on public.shaam_filing_sources, public.shaam_filing_obligations from authenticated;
grant select on public.shaam_filing_sources, public.shaam_filing_obligations to authenticated;

-- ── 2 · דלי פרטי לקבצי המקור (רשימה משרדית — לקוחות רבים) ──────────────────────────────────────────
do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public) values ('office-imports', 'office-imports', false) on conflict (id) do nothing;
    drop policy if exists office_imports_select_own on storage.objects;
    create policy office_imports_select_own on storage.objects for select to authenticated
      using (bucket_id = 'office-imports' and (storage.foldername(name))[1] = auth.uid()::text and public.is_authorized());
    drop policy if exists office_imports_insert_own on storage.objects;
    create policy office_imports_insert_own on storage.objects for insert to authenticated
      with check (bucket_id = 'office-imports' and (storage.foldername(name))[1] = auth.uid()::text and public.is_authorized());
  end if;
end $$;

-- ── 3 · עזרים ─────────────────────────────────────────────────────────────────────────────────────
-- מספר תיק / ת.ז. → 9 ספרות (אפסים מובילים נשמרים; קצר — מרופד). ‼ רק ספרות (ורווחים בקצוות) — מחרוזת עם אותיות
--   אינה «מנוקה» למספר: היא שורה שלא נקראה (נמצא ב-staging 16.10: שם שגלש לעמודת המספר).
create or replace function public._shaam_file9(p text) returns text language sql immutable as $$
  select case when p is null then null
              when btrim(p) ~ '^[0-9]{5,9}$' then lpad(btrim(p), 9, '0')
              else null end
$$;

-- מילים בשם (בלי «ו/או», בלי מילה של אות אחת) — לבקרת שם מול הכרטיס.
create or replace function public._shaam_name_words(p text) returns text[] language sql immutable as $$
  select coalesce(array_agg(w), '{}') from (
    select distinct w from regexp_split_to_table(regexp_replace(coalesce(p, ''), 'ו/או', ' ', 'g'), '[\s/,."''()-]+') w
    where char_length(w) >= 2) x
$$;

-- שיוך שורה ללקוח של המשרד. ‼ רק מזהה סמכותי; שם — בקרה בלבד.
create or replace function public._shaam_match(p_uid uuid, p_file text, p_name text)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare
  v_tier text; v_ids text[]; v_roles text[]; c public.clients%rowtype; v_words text[]; v_client_words text[];
begin
  -- 1 · מספר תיק מ״ה שבכרטיס
  select array_agg(distinct x.id), array_agg(distinct coalesce(nullif(t->>'owner', ''), 'client')) into v_ids, v_roles
  from public.clients x, jsonb_array_elements(case when jsonb_typeof(x.tax_files) = 'array' then x.tax_files else '[]'::jsonb end) t
  where x.user_id = p_uid and t->>'authority' = 'income_tax' and public._shaam_file9(t->>'fileNumber') = p_file;
  if coalesce(array_length(v_ids, 1), 0) > 0 then v_tier := 'tax_file';
  else
    -- 2 · ת.ז. הלקוח
    select array_agg(x.id) into v_ids from public.clients x where x.user_id = p_uid and public._shaam_file9(x.id_number) = p_file;
    if coalesce(array_length(v_ids, 1), 0) > 0 then v_tier := 'id'; v_roles := array['client'];
    else
      -- 3 · ת.ז. בן/בת הזוג (תיק משותף שרשום על בן/בת הזוג)
      select array_agg(x.id) into v_ids from public.clients x where x.user_id = p_uid and public._shaam_file9(x.spouse_id_number) = p_file;
      if coalesce(array_length(v_ids, 1), 0) > 0 then v_tier := 'spouse_id'; v_roles := array['spouse']; end if;
    end if;
  end if;
  if v_tier is null then return jsonb_build_object('match', 'unmatched'); end if;
  if array_length(v_ids, 1) > 1 then
    -- זוג ששני בני הזוג לקוחות: אותו מספר בשני הכרטיסים המקושרים ⇒ עמום; המשרד מכריע לאיזה כרטיס
    return jsonb_build_object('match', 'ambiguous', 'tier', v_tier, 'candidates', to_jsonb(v_ids));
  end if;
  select * into c from public.clients where id = v_ids[1];
  -- בקרת שם: לפחות מילה אחת משותפת עם שם הלקוח או בן/בת הזוג
  v_words := public._shaam_name_words(p_name);
  v_client_words := public._shaam_name_words(concat_ws(' ', c.first_name, c.last_name, c.spouse_name, c.spouse_first_name, c.spouse_last_name));
  if cardinality(v_words) > 0 and not (v_words && v_client_words) then
    return jsonb_build_object('match', 'name_mismatch', 'tier', v_tier, 'candidates', to_jsonb(v_ids));
  end if;
  return jsonb_build_object('match', 'matched', 'tier', v_tier, 'clientId', c.id,
    'role', case when v_tier = 'tax_file' then case when v_roles[1] = 'spouse' then 'spouse' else 'client' end else v_roles[1] end);
end $$;

-- שורה נכנסת → מה שע״ם אומר. ‼ שנתי: רק «ח» מפורש + אין תאריך הגשה = פתוחה. מועד לבד, ס.ת 91, סעיף 14, קוד 00 — לא.
create or replace function public._shaam_status(p_kind text, p jsonb, p_group text) returns text language sql immutable as $$
  select case
    when p_kind = 'annual' then case when nullif(p->>'filedOn', '') is not null then 'filed'
                                     when (p->>'required')::boolean is true and coalesce((p->>'noAssessment')::boolean, false) is false then 'open'
                                     else 'context' end
    else case when p_group in ('filed_fine', 'filed_no_fine') then 'filed' else 'open' end
  end
$$;

-- התוכן שמשווים בייבוא חוזר.
create or replace function public._shaam_values(o public.shaam_filing_obligations) returns jsonb language sql immutable as $$
  select jsonb_build_object('name', o.name_captured, 'office', o.office, 'fileType', o.file_type, 'section', o.section, 'branch', o.branch,
    'required', o.required, 'legalDue', o.legal_due_raw, 'filedOn', o.filed_on_raw, 'noAssessment', o.no_assessment, 'group', o.wealth_group)
$$;

create or replace function public._shaam_in_values(p jsonb, p_group text) returns jsonb language sql immutable as $$
  select jsonb_build_object('name', nullif(p->>'name', ''), 'office', nullif(p->>'office', ''), 'fileType', nullif(p->>'fileType', ''),
    'section', nullif(p->>'section', ''), 'branch', nullif(p->>'branch', ''), 'required', (p->>'required')::boolean,
    'legalDue', nullif(p->>'legalDueRaw', ''), 'filedOn', nullif(p->>'filedOnRaw', ''),
    'noAssessment', coalesce((p->>'noAssessment')::boolean, false), 'group', p_group)
$$;

-- ── 4 · התוכנית: מה יקרה לכל שורה (משותף לתצוגה ולשמירה) ───────────────────────────────────────────
-- p_batch: {sources: [{key, fileName, sha256, size, kind, group, taxYear, producedRaw, producedOn, pages:[…], status}],
--           rows: [{sourceKey, page, line, fileNumber, name, office, fileType, section, branch, yearShown, required,
--                   legalDue, legalDueRaw, filedOn, filedOnRaw, noAssessment, problems:[…]}]}
-- מחזיר שורה לכל שורה נכנסת: {i, key, change, state, match, clientId, role, existingId, reason}
create or replace function public._shaam_plan(p_uid uuid, p_batch jsonb)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare
  r jsonb; s jsonb; i int := 0; out jsonb := '[]'::jsonb; v_file text; v_kind text; v_group text; v_year text;
  e public.shaam_filing_obligations%rowtype; m jsonb; v_status text; v_state text; v_change text; v_reason text;
  v_prod date; v_seen text[] := '{}'; v_key text; v_client text; v_role text;
begin
  for r in select * from jsonb_array_elements(coalesce(p_batch->'rows', '[]'::jsonb)) loop
    i := i + 1;
    select x.value into s from jsonb_array_elements(coalesce(p_batch->'sources', '[]'::jsonb)) x where x.value->>'key' = r->>'sourceKey' limit 1;
    v_kind := s->>'kind'; v_group := nullif(s->>'group', ''); v_file := public._shaam_file9(r->>'fileNumber');
    v_year := nullif(btrim(coalesce(r->>'yearShown', '')), ''); v_prod := nullif(s->>'producedOn', '')::date;
    v_key := concat_ws('|', v_kind, v_file, v_year);
    v_reason := null; v_client := null; v_role := null; m := null;
    if s is null or v_kind not in ('annual', 'wealth') then
      out := out || jsonb_build_object('i', i, 'change', 'invalid', 'reason', 'source'); continue;
    end if;
    if v_file is null or v_year is null or v_year !~ '^[0-9]{4}$' then
      out := out || jsonb_build_object('i', i, 'change', 'invalid', 'reason', case when v_file is null then 'file_number' else 'year' end); continue;
    end if;
    if v_key = any(v_seen) then
      out := out || jsonb_build_object('i', i, 'key', v_key, 'change', 'duplicate'); continue;
    end if;
    v_seen := v_seen || v_key;
    v_status := public._shaam_status(v_kind, r, v_group);
    select * into e from public.shaam_filing_obligations o where o.user_id = p_uid and o.kind = v_kind and o.file_number = v_file and o.year_shown = v_year;
    -- שיוך: שורה קיימת עם לקוח (כולל שיוך ידני) — לא משייכים מחדש
    if e.id is not null and e.client_id is not null then
      v_client := e.client_id; v_role := e.subject_role; m := jsonb_build_object('match', 'matched', 'tier', e.match_kind);
    else
      m := public._shaam_match(p_uid, v_file, r->>'name');
      v_client := m->>'clientId'; v_role := m->>'role';
    end if;
    if jsonb_array_length(coalesce(r->'problems', '[]'::jsonb)) > 0 then
      -- ‼ שורה שלא נקראה במלואה לא נכתבת לתיק — גם אם המספר תואם לכרטיס
      v_reason := 'parse'; v_client := null; v_role := null;
    elsif m->>'match' <> 'matched' then v_reason := m->>'match'; end if;

    if e.id is null then
      v_change := 'new';
      v_state := case when v_reason is not null then 'needs_review' when v_status = 'filed' then 'history' else v_status end;
    elsif e.produced_on is not null and v_prod is not null and v_prod < e.produced_on then
      v_change := 'older'; v_state := e.state;
    else
      v_change := case when public._shaam_values(e) = public._shaam_in_values(r, v_group) then 'unchanged' else 'updated' end;
      v_state := case
        when e.state = 'dismissed' then 'dismissed'
        when v_reason is not null then 'needs_review'
        when v_status = 'filed' then case when e.state in ('open', 'filed_per_shaam') or e.step_id is not null then 'filed_per_shaam'
                                          when e.state = 'history' then 'history' else 'history' end
        when v_status = 'open' and e.shaam_status = 'filed' then 'needs_review'   -- סתירה: הוגש ועכשיו שוב פתוח
        else v_status end;
      if v_status = 'open' and e.shaam_status = 'filed' and v_reason is null then v_reason := 'contradiction'; end if;
    end if;
    out := out || jsonb_strip_nulls(jsonb_build_object('i', i, 'key', v_key, 'change', v_change, 'state', v_state, 'shaamStatus', v_status,
      'match', m->>'match', 'tier', m->>'tier', 'clientId', v_client, 'role', v_role, 'candidates', m->'candidates',
      'existingId', e.id, 'reason', v_reason, 'stepId', e.step_id));
  end loop;
  return out;
end $$;

-- שמות הלקוחות שבתוכנית — לתצוגה בלבד (של המשרד).
create or replace function public._shaam_plan_names(p_uid uuid, p_plan jsonb) returns jsonb language sql stable security definer set search_path to 'public' as $$
  select coalesce(jsonb_object_agg(c.id, btrim(concat_ws(' ', c.first_name, c.last_name))), '{}'::jsonb)
  from public.clients c
  where c.user_id = p_uid and c.id in (
    select x.value->>'clientId' from jsonb_array_elements(p_plan) x where x.value ? 'clientId'
    union select jsonb_array_elements_text(x.value->'candidates') from jsonb_array_elements(p_plan) x where jsonb_typeof(x.value->'candidates') = 'array')
$$;

-- ── 5 · תצוגת קליטה (בלי כתיבה) ──────────────────────────────────────────────────────────────────
create or replace function public.shaam_filing_preview(p_batch jsonb)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare v_uid uuid := auth.uid(); v_plan jsonb;
begin
  if v_uid is null or not public.is_authorized() then raise exception 'forbidden' using errcode = '42501'; end if;
  if jsonb_typeof(p_batch) is distinct from 'object' or jsonb_array_length(coalesce(p_batch->'rows', '[]'::jsonb)) > 5000 then
    return jsonb_build_object('ok', false, 'error', 'bad_batch');
  end if;
  v_plan := public._shaam_plan(v_uid, p_batch);
  return jsonb_build_object('ok', true, 'plan', v_plan, 'names', public._shaam_plan_names(v_uid, v_plan));
end $$;

-- ── 6 · «שמירה לתיקים» ────────────────────────────────────────────────────────────────────────────
create or replace function public.shaam_filing_import(p_batch jsonb)
returns jsonb language plpgsql volatile security definer set search_path to 'public' as $$
declare
  v_uid uuid := auth.uid(); v_plan jsonb; p jsonb; r jsonb; s jsonb; v_src uuid; v_srcs jsonb := '{}'::jsonb;
  e public.shaam_filing_obligations%rowtype; v_id uuid; v_group text; v_kind text; v_n jsonb := '{}'::jsonb; v_step text;
  v_values jsonb; st public.onboarding_steps%rowtype; v_marked int := 0; v_linked int := 0;
begin
  if v_uid is null or not public.is_authorized() then raise exception 'forbidden' using errcode = '42501'; end if;
  if jsonb_typeof(p_batch) is distinct from 'object' or jsonb_array_length(coalesce(p_batch->'rows', '[]'::jsonb)) > 5000 then
    return jsonb_build_object('ok', false, 'error', 'bad_batch');
  end if;
  -- מקורות: אותו קובץ (sha) — אותה רשומה; הנתיב בדלי חייב להיות בתיקיית המשרד
  for s in select * from jsonb_array_elements(coalesce(p_batch->'sources', '[]'::jsonb)) loop
    if nullif(s->>'storagePath', '') is not null and split_part(s->>'storagePath', '/', 1) <> v_uid::text then
      return jsonb_build_object('ok', false, 'error', 'bad_storage_path');
    end if;
    if s->>'kind' not in ('annual', 'wealth') then return jsonb_build_object('ok', false, 'error', 'bad_source'); end if;
    v_src := null;
    if nullif(s->>'sha256', '') is not null then
      select id into v_src from public.shaam_filing_sources where user_id = v_uid and content_sha256 = s->>'sha256';
    end if;
    if v_src is null then
      insert into public.shaam_filing_sources (user_id, method, file_name, content_sha256, storage_path, file_size, list_kind, wealth_group, tax_year,
        produced_raw, produced_on, pages, status, note, uploaded_by)
      values (v_uid, coalesce(nullif(s->>'method', ''), 'pdf'), left(coalesce(nullif(s->>'fileName', ''), 'קובץ'), 200), nullif(s->>'sha256', ''),
        nullif(s->>'storagePath', ''), nullif(s->>'size', '')::bigint, s->>'kind', nullif(s->>'group', ''), nullif(s->>'taxYear', '')::int,
        left(nullif(s->>'producedRaw', ''), 40), nullif(s->>'producedOn', '')::date, coalesce(s->'pages', '[]'::jsonb),
        case when s->>'status' in ('ok', 'empty_confirmed', 'partial') then s->>'status' else 'partial' end, left(nullif(s->>'note', ''), 500), v_uid)
      returning id into v_src;
    elsif nullif(s->>'storagePath', '') is not null then
      update public.shaam_filing_sources set storage_path = coalesce(storage_path, s->>'storagePath') where id = v_src;
    end if;
    v_srcs := v_srcs || jsonb_build_object(s->>'key', v_src);
  end loop;

  v_plan := public._shaam_plan(v_uid, p_batch);
  for p in select * from jsonb_array_elements(v_plan) loop
    v_n := jsonb_set(v_n, array[p->>'change'], to_jsonb(coalesce((v_n->>(p->>'change'))::int, 0) + 1));
    if p->>'change' not in ('new', 'updated', 'unchanged') then continue; end if;
    r := p_batch->'rows'->((p->>'i')::int - 1);
    select x.value into s from jsonb_array_elements(p_batch->'sources') x where x.value->>'key' = r->>'sourceKey' limit 1;
    v_kind := s->>'kind'; v_group := nullif(s->>'group', '');
    if p->>'change' = 'unchanged' then
      update public.shaam_filing_obligations set last_seen_at = now(), state = p->>'state',
             client_id = coalesce(client_id, p->>'clientId'), subject_role = coalesce(subject_role, p->>'role'),
             match_kind = coalesce(match_kind, p->>'tier'), review_reason = p->>'reason', candidates = p->'candidates'
       where id = (p->>'existingId')::uuid;
      v_id := (p->>'existingId')::uuid;
    elsif p->>'change' = 'updated' then
      select * into e from public.shaam_filing_obligations where id = (p->>'existingId')::uuid for update;
      update public.shaam_filing_obligations set
        name_captured = nullif(r->>'name', ''), office = nullif(r->>'office', ''), file_type = nullif(r->>'fileType', ''),
        section = nullif(r->>'section', ''), branch = nullif(r->>'branch', ''), required = (r->>'required')::boolean,
        legal_due = nullif(r->>'legalDue', '')::date, legal_due_raw = nullif(r->>'legalDueRaw', ''),
        filed_on = nullif(r->>'filedOn', '')::date, filed_on_raw = nullif(r->>'filedOnRaw', ''),
        no_assessment = coalesce((r->>'noAssessment')::boolean, false), wealth_group = v_group,
        fine = case when v_group is null then null else v_group like '%\_fine' and v_group not like '%no\_fine' end,
        shaam_status = p->>'shaamStatus', state = p->>'state', review_reason = p->>'reason', candidates = p->'candidates',
        client_id = coalesce(e.client_id, p->>'clientId'), subject_role = coalesce(e.subject_role, p->>'role'), match_kind = coalesce(e.match_kind, p->>'tier'),
        source_id = (v_srcs->>(r->>'sourceKey'))::uuid, evidence = jsonb_build_object('sourceId', v_srcs->>(r->>'sourceKey'), 'page', r->'page', 'line', r->'line'),
        produced_on = nullif(s->>'producedOn', '')::date,
        history = e.history || jsonb_build_array(jsonb_build_object('at', now(), 'sourceId', e.source_id, 'producedOn', e.produced_on,
          'state', e.state, 'values', public._shaam_values(e))),
        last_seen_at = now(), updated_at = now()
       where id = e.id;
      v_id := e.id;
    else
      insert into public.shaam_filing_obligations (user_id, kind, file_number, year_shown, tax_year, name_captured, office, file_type, section, branch,
        required, legal_due, legal_due_raw, filed_on, filed_on_raw, no_assessment, wealth_group, fine, shaam_status, state, review_reason,
        client_id, subject_role, match_kind, candidates, source_id, evidence, produced_on)
      values (v_uid, v_kind, public._shaam_file9(r->>'fileNumber'), btrim(r->>'yearShown'), (btrim(r->>'yearShown'))::int,
        nullif(r->>'name', ''), nullif(r->>'office', ''), nullif(r->>'fileType', ''), nullif(r->>'section', ''), nullif(r->>'branch', ''),
        (r->>'required')::boolean, nullif(r->>'legalDue', '')::date, nullif(r->>'legalDueRaw', ''), nullif(r->>'filedOn', '')::date, nullif(r->>'filedOnRaw', ''),
        coalesce((r->>'noAssessment')::boolean, false), v_group,
        case when v_group is null then null else v_group like '%\_fine' and v_group not like '%no\_fine' end,
        p->>'shaamStatus', p->>'state', p->>'reason', p->>'clientId', p->>'role', p->>'tier', p->'candidates',
        (v_srcs->>(r->>'sourceKey'))::uuid, jsonb_build_object('sourceId', v_srcs->>(r->>'sourceKey'), 'page', r->'page', 'line', r->'line'),
        nullif(s->>'producedOn', '')::date)
      returning id into v_id;
    end if;
    perform public._shaam_after_change(v_id);
  end loop;
  return jsonb_build_object('ok', true, 'counts', v_n, 'plan', v_plan, 'sources', v_srcs);
end $$;

-- אחרי שינוי: קישור לבקשה פתוחה קיימת, וסימון «הוגש לפי שע״ם» על בקשה פתוחה. ‼ לא סוגר את הבקשה — הסגירה בידי המשרד.
create or replace function public._shaam_after_change(p_id uuid) returns void language plpgsql volatile security definer set search_path to 'public' as $$
declare o public.shaam_filing_obligations%rowtype; st public.onboarding_steps%rowtype; v_ids text[];
begin
  select * into o from public.shaam_filing_obligations where id = p_id;
  if o.client_id is null or o.state in ('needs_review', 'dismissed', 'context') then return; end if;
  if o.step_id is null then
    if o.kind = 'annual' then
      select array_agg(id) into v_ids from public.onboarding_steps where client_id = o.client_id and user_id = o.user_id and step_type = 'annual_return'
        and payload->>'taxYear' = o.year_shown and status <> all (array['completed', 'verified', 'skipped', 'cancelled', 'failed']);
    else
      -- ‼ הצהרת הון: מקשרים רק כשיש בדיוק בקשה פתוחה אחת שיום ההצהרה שלה בשנה שבשע״ם — בלי לקבוע יום בעצמנו
      select array_agg(id) into v_ids from public.onboarding_steps where client_id = o.client_id and user_id = o.user_id and step_type = 'wealth_declaration'
        and left(payload->>'asOfDate', 4) = o.year_shown and status <> all (array['completed', 'verified', 'skipped', 'cancelled', 'failed']);
    end if;
    if coalesce(array_length(v_ids, 1), 0) = 1 then
      update public.shaam_filing_obligations set step_id = v_ids[1] where id = o.id;
      o.step_id := v_ids[1];
      insert into public.onboarding_events (user_id, step_id, type, actor, note, meta)
      values (o.user_id, v_ids[1], 'note', 'system', 'קושר לחובה שנקלטה מרשימת שע״ם',
        jsonb_build_object('what', 'shaam_obligation_linked', 'obligationId', o.id, 'legalDue', o.legal_due));
    end if;
  end if;
  if o.state = 'filed_per_shaam' and o.step_id is not null then
    select * into st from public.onboarding_steps where id = o.step_id;
    if st.id is not null and st.status <> all (array['completed', 'verified', 'skipped', 'cancelled', 'failed'])
       and not exists (select 1 from public.onboarding_events ev where ev.step_id = st.id and ev.meta->>'what' = 'filed_per_shaam' and ev.meta->>'obligationId' = o.id::text) then
      update public.onboarding_steps set payload = jsonb_set(payload, '{work,shaamFiled}', jsonb_strip_nulls(jsonb_build_object(
          'filedOn', o.filed_on, 'seenAt', now(), 'obligationId', o.id, 'group', o.wealth_group)), true),
        updated_at = now()
       where id = st.id and jsonb_typeof(payload->'work') = 'object';
      update public.onboarding_steps set payload = payload || jsonb_build_object('work', jsonb_build_object('shaamFiled', jsonb_strip_nulls(jsonb_build_object(
          'filedOn', o.filed_on, 'seenAt', now(), 'obligationId', o.id, 'group', o.wealth_group)))), updated_at = now()
       where id = st.id and jsonb_typeof(payload->'work') is distinct from 'object';
      insert into public.onboarding_events (user_id, step_id, type, actor, note, meta)
      values (o.user_id, st.id, 'note', 'system',
        'הוגש לפי שע״ם' || coalesce(' · ' || to_char(o.filed_on, 'DD.MM.YYYY'), '') || ' — הבקשה לא נסגרה אוטומטית',
        jsonb_build_object('what', 'filed_per_shaam', 'obligationId', o.id, 'filedOn', o.filed_on));
    end if;
  end if;
end $$;

-- ── 7 · רשימה (למסך «כל העבודות» ולתיק הלקוח) ────────────────────────────────────────────────────
-- מצב הבקשה המקושרת ומצב העותק (בהיסטוריה) — נגזרים כאן, לא בדפדפן.
create or replace function public.shaam_filing_list(p_client_id text default null)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null or not public.is_authorized() then raise exception 'forbidden' using errcode = '42501'; end if;
  return jsonb_build_object('ok', true,
    'obligations', coalesce((
      select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
        'id', o.id, 'kind', o.kind, 'fileNumber', o.file_number, 'yearShown', o.year_shown, 'name', o.name_captured,
        'office', o.office, 'fileType', o.file_type, 'section', o.section, 'required', o.required,
        'legalDue', o.legal_due, 'legalDueRaw', o.legal_due_raw, 'filedOn', o.filed_on, 'noAssessment', o.no_assessment,
        'group', o.wealth_group, 'fine', o.fine, 'shaamStatus', o.shaam_status, 'state', o.state, 'reason', o.review_reason,
        'clientId', o.client_id, 'clientName', nullif(btrim(concat_ws(' ', c.first_name, c.last_name)), ''), 'role', o.subject_role,
        'matchKind', o.match_kind, 'candidates', o.candidates,
        'stepId', o.step_id, 'stepStatus', st.status, 'copyStepId', o.copy_step_id, 'copyStepStatus', cs.status,
        'copyInOffice', case when o.client_id is not null and o.state in ('history', 'filed_per_shaam') then exists (
            select 1 from public.documents d left join public.document_labels l on l.id = d.label_id
            where d.client_id = o.client_id and d.user_id = v_uid and d.year = o.year_shown
              and (case when o.kind = 'wealth' then concat_ws(' ', d.file_name, d.description, l.name) ~ 'הצהרת\s*הון'
                        else concat_ws(' ', d.file_name, d.description, l.name) ~ '(1301|דוח\s*שנתי|דו"ח\s*שנתי)' end)) end,
        'evidence', o.evidence, 'producedOn', o.produced_on, 'sourceName', src.file_name,
        'firstSeenAt', o.first_seen_at, 'lastSeenAt', o.last_seen_at, 'updatedAt', o.updated_at,
        'historyCount', jsonb_array_length(o.history)
      )) order by o.legal_due nulls last, o.file_number)
      from public.shaam_filing_obligations o
      left join public.clients c on c.id = o.client_id
      left join public.onboarding_steps st on st.id = o.step_id
      left join public.onboarding_steps cs on cs.id = o.copy_step_id
      left join public.shaam_filing_sources src on src.id = o.source_id
      where o.user_id = v_uid and (p_client_id is null or o.client_id = p_client_id)), '[]'::jsonb),
    'sources', case when p_client_id is not null then '[]'::jsonb else coalesce((
      select jsonb_agg(jsonb_strip_nulls(jsonb_build_object('id', s.id, 'method', s.method, 'fileName', s.file_name, 'kind', s.list_kind, 'group', s.wealth_group,
        'taxYear', s.tax_year, 'producedRaw', s.produced_raw, 'producedOn', s.produced_on, 'pages', s.pages, 'status', s.status,
        'note', s.note, 'uploadedAt', s.uploaded_at, 'hasFile', s.storage_path is not null, 'sha256', s.content_sha256)) order by s.uploaded_at desc)
      from public.shaam_filing_sources s where s.user_id = v_uid), '[]'::jsonb) end);
end $$;

-- ── 8 · פעולות על שורה ────────────────────────────────────────────────────────────────────────────
-- שיוך ידני של שורה «לבדיקה» לכרטיס (או «לא שלנו»). ‼ הכרטיס חייב להיות של המשרד.
create or replace function public.resolve_shaam_obligation(p_id uuid, p_client_id text, p_role text default 'client')
returns jsonb language plpgsql volatile security definer set search_path to 'public' as $$
declare v_uid uuid := auth.uid(); o public.shaam_filing_obligations%rowtype;
begin
  if v_uid is null or not public.is_authorized() then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into o from public.shaam_filing_obligations where id = p_id and user_id = v_uid for update;
  if o.id is null then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if p_client_id is null then
    update public.shaam_filing_obligations set state = 'dismissed', review_reason = 'not_ours', updated_at = now() where id = o.id;
    return jsonb_build_object('ok', true, 'state', 'dismissed');
  end if;
  if p_role not in ('client', 'spouse') then return jsonb_build_object('ok', false, 'error', 'bad_role'); end if;
  if not exists (select 1 from public.clients where id = p_client_id and user_id = v_uid) then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;
  if o.review_reason = 'parse' then return jsonb_build_object('ok', false, 'error', 'parse_problem'); end if;
  update public.shaam_filing_obligations set client_id = p_client_id, subject_role = p_role, match_kind = 'manual', candidates = null, review_reason = null,
    state = case when o.shaam_status = 'filed' then 'history' else o.shaam_status end, updated_at = now()
   where id = o.id;
  perform public._shaam_after_change(o.id);
  return jsonb_build_object('ok', true);
end $$;

-- קישור לבקשה שנפתחה («פתח בקשה» — upsert_tax_work במנגנון הקיים). ‼ אותו לקוח, אותו סוג, ובדוח שנתי אותה שנה.
create or replace function public.link_shaam_obligation_step(p_id uuid, p_step_id text)
returns jsonb language plpgsql volatile security definer set search_path to 'public' as $$
declare v_uid uuid := auth.uid(); o public.shaam_filing_obligations%rowtype; st public.onboarding_steps%rowtype;
begin
  if v_uid is null or not public.is_authorized() then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into o from public.shaam_filing_obligations where id = p_id and user_id = v_uid for update;
  if o.id is null then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  select * into st from public.onboarding_steps where id = p_step_id and user_id = v_uid;
  if st.id is null or st.client_id is distinct from o.client_id then return jsonb_build_object('ok', false, 'error', 'step_mismatch'); end if;
  if st.step_type <> (case o.kind when 'annual' then 'annual_return' else 'wealth_declaration' end)
     or (o.kind = 'annual' and st.payload->>'taxYear' is distinct from o.year_shown) then
    return jsonb_build_object('ok', false, 'error', 'step_mismatch');
  end if;
  if o.step_id = st.id then return jsonb_build_object('ok', true, 'already', true); end if;
  update public.shaam_filing_obligations set step_id = st.id, updated_at = now() where id = o.id;
  insert into public.onboarding_events (user_id, step_id, type, actor, note, meta)
  values (v_uid, st.id, 'note', 'accountant', 'נפתחה לפי חובה שנקלטה מרשימת שע״ם',
    jsonb_strip_nulls(jsonb_build_object('what', 'shaam_obligation_linked', 'obligationId', o.id, 'legalDue', o.legal_due, 'yearShown', o.year_shown)));
  return jsonb_build_object('ok', true);
end $$;

-- השלמת עותק של הצהרה/דוח שכבר הוגשו — בקשת מסמך קיימת (custom_request), לא מפורסמת, בלי מייל. אידמפוטנטי.
create or replace function public.request_shaam_filing_copy(p_id uuid)
returns jsonb language plpgsql volatile security definer set search_path to 'public' as $$
declare v_uid uuid := auth.uid(); o public.shaam_filing_obligations%rowtype; st public.onboarding_steps%rowtype; v_res jsonb; v_title text; v_step text;
begin
  if v_uid is null or not public.is_authorized() then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into o from public.shaam_filing_obligations where id = p_id and user_id = v_uid for update;
  if o.id is null then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if o.client_id is null then return jsonb_build_object('ok', false, 'error', 'no_client'); end if;
  if o.state not in ('history', 'filed_per_shaam') then return jsonb_build_object('ok', false, 'error', 'not_filed'); end if;
  if o.copy_step_id is not null then
    select * into st from public.onboarding_steps where id = o.copy_step_id;
    if st.id is not null and st.status <> all (array['skipped', 'cancelled', 'failed']) then
      return jsonb_build_object('ok', true, 'stepId', st.id, 'already', true);
    end if;
  end if;
  v_title := case o.kind when 'wealth' then 'עותק הצהרת ההון שהוגשה — ' || o.year_shown else 'עותק הדוח השנתי שהוגש — ' || o.year_shown end
             || case when o.subject_role = 'spouse' then ' (בן/בת הזוג)' else '' end;
  v_res := public.create_onboarding_request(o.client_id, 'custom_request',
    jsonb_build_object('title', v_title, 'clientTitle', v_title, 'documentYear', o.year_shown, 'flagKey', 'shaam_copy:' || o.id,
      'shaamObligationId', o.id, 'requirements', jsonb_build_array(jsonb_build_object('key', 'doc', 'kind', 'file', 'label', v_title, 'done', false))),
    null, null, false, false, 'client', null);
  if coalesce((v_res->>'ok')::boolean, false) is false then return jsonb_build_object('ok', false, 'error', coalesce(v_res->>'error', 'create_failed')); end if;
  v_step := coalesce(v_res->>'stepId', v_res->>'id', v_res->>'step_id');
  update public.shaam_filing_obligations set copy_step_id = v_step, updated_at = now() where id = o.id;
  return jsonb_build_object('ok', true, 'stepId', v_step);
end $$;

-- אישור ידני שקבוצת הצהרות הון נבדקה וריקה (כשאין PDF של הודעת «אין תיקים שבקשת»). ‼ נשמר כמקור עם מי ומתי.
create or replace function public.confirm_shaam_group_empty(p_group text, p_note text default null)
returns jsonb language plpgsql volatile security definer set search_path to 'public' as $$
declare v_uid uuid := auth.uid(); v_id uuid;
begin
  if v_uid is null or not public.is_authorized() then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_group not in ('unfiled_no_fine', 'unfiled_fine', 'filed_fine', 'filed_no_fine') then return jsonb_build_object('ok', false, 'error', 'bad_group'); end if;
  insert into public.shaam_filing_sources (user_id, method, file_name, list_kind, wealth_group, produced_on, status, note, uploaded_by)
  values (v_uid, 'manual', 'אישור ידני — הקבוצה נבדקה וריקה', 'wealth', p_group, current_date, 'empty_confirmed', left(nullif(btrim(p_note), ''), 500), v_uid)
  returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id);
end $$;

-- ── 9 · הרשאות ────────────────────────────────────────────────────────────────────────────────────
revoke all on function public._shaam_file9(text) from public, anon;
revoke all on function public._shaam_name_words(text) from public, anon;
revoke all on function public._shaam_match(uuid, text, text) from public, anon, authenticated;
revoke all on function public._shaam_status(text, jsonb, text) from public, anon;
revoke all on function public._shaam_values(public.shaam_filing_obligations) from public, anon;
revoke all on function public._shaam_in_values(jsonb, text) from public, anon;
revoke all on function public._shaam_plan(uuid, jsonb) from public, anon, authenticated;
revoke all on function public._shaam_plan_names(uuid, jsonb) from public, anon, authenticated;
revoke all on function public._shaam_after_change(uuid) from public, anon, authenticated;
revoke all on function public.shaam_filing_preview(jsonb) from public, anon;
revoke all on function public.shaam_filing_import(jsonb) from public, anon;
revoke all on function public.shaam_filing_list(text) from public, anon;
revoke all on function public.resolve_shaam_obligation(uuid, text, text) from public, anon;
revoke all on function public.link_shaam_obligation_step(uuid, text) from public, anon;
revoke all on function public.request_shaam_filing_copy(uuid) from public, anon;
revoke all on function public.confirm_shaam_group_empty(text, text) from public, anon;
grant execute on function public.shaam_filing_preview(jsonb) to authenticated;
grant execute on function public.shaam_filing_import(jsonb) to authenticated;
grant execute on function public.shaam_filing_list(text) to authenticated;
grant execute on function public.resolve_shaam_obligation(uuid, text, text) to authenticated;
grant execute on function public.link_shaam_obligation_step(uuid, text) to authenticated;
grant execute on function public.request_shaam_filing_copy(uuid) to authenticated;
grant execute on function public.confirm_shaam_group_empty(text, text) to authenticated;
