-- ═══════════════════════════════════════════════════════════════════════════
--  67 — תיקיות במסמכי הלקוח  ·  מיגרציה תוספתית (additive) בלבד
-- ═══════════════════════════════════════════════════════════════════════════
--  עד היום כל מסמך ישב ברמה אחת שטוחה תחת הלקוח, וההפרדה היחידה הייתה
--  קטגוריה + שנה. עכשיו אפשר לפתוח תיקייה ("התאמת מס 2026") ולשים בתוכה
--  את כל מה ששייך לה — כולל העלאת תיקייה שלמה מהמחשב, על כל תת-התיקיות.
--
--  עקרונות:
--    - תוספתי בלבד: אף עמודה קיימת לא נגעה. מסמך בלי folder_id = ברמה הראשית,
--      בדיוק כמו היום.
--    - idempotent: בטוח להריץ שוב.
--    - מחיקת תיקייה לא מוחקת קבצים — `on delete set null` מחזיר אותם לרמה
--      הראשית. מחיקת תת-תיקייה כן נגררת עם ההורה (cascade), והקבצים שבה
--      עולים לרמה הראשית.
--    - הקבצים עצמם ב-Storage לא זזים. הנתיב נשאר <user_id>/<client_id>/<doc_id>
--      והתיקייה היא ארגון לוגי בלבד — כך שינוי שם/העברה אינו נוגע בבייטים.
-- ═══════════════════════════════════════════════════════════════════════════


-- ── 1. הטבלה ────────────────────────────────────────────────────────────────
create table if not exists public.document_folders (
  id         text primary key default gen_random_uuid()::text,
  user_id    uuid not null references auth.users(id) on delete cascade,
  client_id  text not null,
  parent_id  text references public.document_folders(id) on delete cascade,
  name       text not null,
  created_at timestamptz not null default now()
);

create index if not exists doc_folders_user_idx   on public.document_folders(user_id);
create index if not exists doc_folders_client_idx on public.document_folders(client_id);
create index if not exists doc_folders_parent_idx on public.document_folders(parent_id);

-- שתי תיקיות באותו שם תחת אותו הורה יבלבלו יותר מכל תועלת שיש בהן.
-- coalesce כי parent_id null (רמה ראשית) לא נספר ב-unique רגיל.
create unique index if not exists doc_folders_unique_name
  on public.document_folders (user_id, client_id, coalesce(parent_id, ''), lower(name));


-- ── 2. RLS — זהה למדיניות של documents ──────────────────────────────────────
alter table public.document_folders enable row level security;

drop policy if exists "doc_folders_select_own" on public.document_folders;
create policy "doc_folders_select_own" on public.document_folders
  for select using (auth.uid() = user_id);

drop policy if exists "doc_folders_insert_own" on public.document_folders;
create policy "doc_folders_insert_own" on public.document_folders
  for insert with check (auth.uid() = user_id);

drop policy if exists "doc_folders_update_own" on public.document_folders;
create policy "doc_folders_update_own" on public.document_folders
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "doc_folders_delete_own" on public.document_folders;
create policy "doc_folders_delete_own" on public.document_folders
  for delete using (auth.uid() = user_id);

-- אכיפת רשימת המורשים (ראה 15-security-enforce-rls.sql) — RESTRICTIVE, מצטרפת ב-AND
drop policy if exists require_authorized on public.document_folders;
create policy require_authorized on public.document_folders
  as restrictive for all to authenticated
  using (public.is_authorized()) with check (public.is_authorized());


-- ── 3. שיוך מסמך לתיקייה ────────────────────────────────────────────────────
alter table public.documents add column if not exists folder_id text
  references public.document_folders(id) on delete set null;

create index if not exists documents_folder_idx on public.documents(folder_id);


-- ═══════════════════════════════════════════════════════════════════════════
-- ROLLBACK (ידני, בטוח — תוספתי):
--   alter table public.documents drop column if exists folder_id;
--   drop table if exists public.document_folders;
-- ═══════════════════════════════════════════════════════════════════════════
