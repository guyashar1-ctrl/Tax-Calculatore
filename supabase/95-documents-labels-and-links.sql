-- ─── 95: מסמכים — תוויות מקצועיות, שנה על תיקיות, קישור רב-לקוחי ───────────
-- M3 חלק א. "מערכת קבצים רגילה + שכבת מטא-דאטה מקצועית דקה". כל מסמך/תיקייה
-- מקבלים בדיוק תווית אחת (לא תגיות מרובות — tags/status הקיימים בטבלה
-- נשארים כפי שהם, לא בשימוש, לא נמחקים) ושדה שנה. תווית שמורה 'לבדיקה' —
-- לפריט legacy שטרם סווג מקצועית. לא יורשת אוטומטית לילדים חדשים.

-- ── 1. תוויות מנוהלות-משרד ────────────────────────────────────────────────
create table if not exists public.document_labels (
  id         text primary key default (gen_random_uuid())::text,
  user_id    uuid not null references auth.users(id),
  name       text not null,
  sort_order integer not null default 0,
  is_reserved boolean not null default false,
  created_at timestamptz not null default now(),
  unique (user_id, name)
);

alter table public.document_labels enable row level security;
drop policy if exists document_labels_select_own on public.document_labels;
drop policy if exists document_labels_insert_own on public.document_labels;
drop policy if exists document_labels_update_own on public.document_labels;
drop policy if exists document_labels_delete_own on public.document_labels;
create policy document_labels_select_own on public.document_labels for select using (auth.uid() = user_id);
create policy document_labels_insert_own on public.document_labels for insert with check (auth.uid() = user_id);
create policy document_labels_update_own on public.document_labels for update using (auth.uid() = user_id);
-- ‼ מחיקה ישירה חסומה — ראה delete_document_label: תווית שמורה לעולם לא
-- נמחקת, ותווית רגילה עם פריטים משויכים מועברת דרך RPC ולא DELETE גולמי.
create policy document_labels_delete_own on public.document_labels for delete using (false);

-- ── 2. עמודות על documents/document_folders ──────────────────────────────
alter table public.documents
  add column if not exists label_id text references public.document_labels(id) on delete set null;
alter table public.document_folders
  add column if not exists label_id text references public.document_labels(id) on delete set null,
  add column if not exists year text;

-- ── 3. קישור מסמך לכמה לקוחות — התיקייה עצמה נשארת חד-לקוחית ────────────────
create table if not exists public.document_clients (
  id          text primary key default (gen_random_uuid())::text,
  user_id     uuid not null references auth.users(id),
  document_id text not null references public.documents(id) on delete cascade,
  client_id   text not null references public.clients(id) on delete cascade,
  created_at  timestamptz not null default now(),
  unique (document_id, client_id)
);

alter table public.document_clients enable row level security;
drop policy if exists document_clients_select_own on public.document_clients;
drop policy if exists document_clients_insert_own on public.document_clients;
drop policy if exists document_clients_delete_own on public.document_clients;
create policy document_clients_select_own on public.document_clients for select using (auth.uid() = user_id);
create policy document_clients_insert_own on public.document_clients for insert with check (auth.uid() = user_id);
create policy document_clients_delete_own on public.document_clients for delete using (auth.uid() = user_id);

-- ── 4. גיבוי לאחור: תווית שמורה 'לבדיקה' לכל משתמש שיש לו מסמכים/תיקיות ────
-- ‼ שמרני בכוונה: לא מנחשים תווית מקצועית. שנה על תיקייה קיימת → 'כללי'
-- (אין לנו שום דרך לדעת שנה אמיתית לתיקיות legacy — הן נוצרו בלי העמודה).
do $$
declare
  v_user uuid;
  v_label_id text;
begin
  for v_user in
    select distinct user_id from public.documents
    union
    select distinct user_id from public.document_folders
  loop
    select id into v_label_id from public.document_labels
     where user_id = v_user and is_reserved = true limit 1;
    if v_label_id is null then
      insert into public.document_labels (user_id, name, sort_order, is_reserved)
      values (v_user, 'לבדיקה', 999, true)
      returning id into v_label_id;
    end if;

    update public.documents set label_id = v_label_id
     where user_id = v_user and label_id is null;

    update public.document_folders set label_id = v_label_id
     where user_id = v_user and label_id is null;
    update public.document_folders set year = 'כללי'
     where user_id = v_user and year is null;
  end loop;
end $$;

-- ── 5. מחיקת תווית בטוחה — שמורה לעולם לא, אחרת מעבירים תוכן ל'לבדיקה' קודם ──
create or replace function public.delete_document_label(p_label_id text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_label public.document_labels%rowtype;
  v_fallback_id text;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'unauthenticated'); end if;
  select * into v_label from public.document_labels where id = p_label_id;
  if v_label.id is null then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if v_label.user_id <> v_uid then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;
  if v_label.is_reserved then return jsonb_build_object('ok', false, 'error', 'reserved_label'); end if;

  select id into v_fallback_id from public.document_labels
   where user_id = v_uid and is_reserved = true limit 1;
  if v_fallback_id is null then
    insert into public.document_labels (user_id, name, sort_order, is_reserved)
    values (v_uid, 'לבדיקה', 999, true)
    returning id into v_fallback_id;
  end if;

  update public.documents set label_id = v_fallback_id where label_id = p_label_id and user_id = v_uid;
  update public.document_folders set label_id = v_fallback_id where label_id = p_label_id and user_id = v_uid;
  delete from public.document_labels where id = p_label_id and user_id = v_uid;

  return jsonb_build_object('ok', true, 'reassignedTo', v_fallback_id);
end;
$function$;

revoke all on function public.delete_document_label(text) from public, anon;
grant execute on function public.delete_document_label(text) to authenticated;

-- ── 6. שכבת ההרשאה השנייה (15-security-enforce-rls.sql) על שתי הטבלאות החדשות ──
-- אותה רשימה בדיוק + document_labels/document_clients — אידמפוטנטי, כמו במקור.
do $$
declare
  t text;
  tbls text[] := array[
    'annual_report_answers','annual_report_model_snapshots','annual_report_sessions',
    'cases','clients','document_task_links','documents','email_messages','employees',
    'leads','profiles','quotation_counters','quotation_templates','quotations',
    'representation_requests','service_catalog','tasks',
    'document_labels','document_clients'
  ];
begin
  foreach t in array tbls loop
    execute format('drop policy if exists require_authorized on public.%I', t);
    execute format(
      'create policy require_authorized on public.%I '
      || 'as restrictive for all to authenticated '
      || 'using (public.is_authorized()) with check (public.is_authorized())', t);
  end loop;
end $$;
