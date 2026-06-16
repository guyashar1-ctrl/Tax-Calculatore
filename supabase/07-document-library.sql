-- ============================================================================
-- 07 — DOCUMENT LIBRARY (Phase 1)  ·  מיגרציה תוספתית (additive) בלבד
-- ============================================================================
-- מה זה עושה:
--   1. מוסיף לטבלת documents שתי עמודות: tags + status.
--   2. יוצר טבלת קישור רבים-לרבים document_task_links (מסמך ↔ משימה).
--   3. ממלא אוטומטית את טבלת הקישור מתוך השדה הקיים linked_to ("task:...").
--
-- עקרונות בטיחות:
--   - תוספתי בלבד: שום עמודה/טבלה קיימת לא נמחקת. linked_to / linked_label נשמרים.
--   - idempotent: בטוח להריץ שוב (if not exists / on conflict do nothing).
--   - הפיך: ראה בלוק ה-ROLLBACK בתחתית הקובץ.
--   - אינו נוגע בקבצים עצמם ב-Storage, רק במטא-דאטה.
--
-- שייך לשלב 1 ב-MIGRATION_PLAN.md / PHASE_1_BUILD_SPEC.md.
-- ============================================================================


-- ── 1. documents: tags + status ─────────────────────────────────────────────
-- רשומות קיימות (שיש להן קובץ) מקבלות status='received' אוטומטית.
-- status ∈ 'received' | 'verified' | 'superseded'
--   ('requested' יתווסף בשלב 2 יחד עם DocumentRequest)
alter table public.documents add column if not exists tags   text[] not null default '{}';
alter table public.documents add column if not exists status text   not null default 'received';


-- ── 2. document_task_links: קישור רבים-לרבים בין מסמך למשימה ─────────────────
create table if not exists public.document_task_links (
  id           text primary key default gen_random_uuid()::text,
  user_id      uuid not null references auth.users(id) on delete cascade,
  document_id  text not null references public.documents(id) on delete cascade,
  task_id      text not null references public.tasks(id)     on delete cascade,
  created_at   timestamptz not null default now(),
  unique (document_id, task_id)
);

create index if not exists dtl_user_idx on public.document_task_links(user_id);
create index if not exists dtl_doc_idx  on public.document_task_links(document_id);
create index if not exists dtl_task_idx on public.document_task_links(task_id);

alter table public.document_task_links enable row level security;

drop policy if exists "dtl_select_own" on public.document_task_links;
create policy "dtl_select_own" on public.document_task_links
  for select using (auth.uid() = user_id);

drop policy if exists "dtl_insert_own" on public.document_task_links;
create policy "dtl_insert_own" on public.document_task_links
  for insert with check (auth.uid() = user_id);

drop policy if exists "dtl_delete_own" on public.document_task_links;
create policy "dtl_delete_own" on public.document_task_links
  for delete using (auth.uid() = user_id);


-- ── 3. Backfill: מתוך linked_to ("task:<id>") אל טבלת הקישור ─────────────────
-- idempotent + מאמת שה-task באמת קיים. linked_to לא נמחק (תאימות לאחור).
insert into public.document_task_links (user_id, document_id, task_id)
select d.user_id, d.id, substring(d.linked_to from 6)
from public.documents d
where d.linked_to like 'task:%'
  and exists (select 1 from public.tasks t where t.id = substring(d.linked_to from 6))
on conflict (document_id, task_id) do nothing;


-- ============================================================================
-- ROLLBACK (להרצה ידנית אם צריך לבטל — תוספתי, אז הביטול בטוח):
-- ----------------------------------------------------------------------------
--   drop table if exists public.document_task_links;
--   alter table public.documents drop column if exists tags;
--   alter table public.documents drop column if exists status;
-- ============================================================================
