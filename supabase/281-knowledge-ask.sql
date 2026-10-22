-- ─── 281 · ידע מקצועי: שאלות, «מה אני לומד» ועדכון הידע — 21.10.2026 ───────────────────────────────
-- הצעה מאושרת: docs/proposals/2026-10-21-tax-area-reimagined.html (גיא אישר את שלב 1 ב-21.10).
--
-- ‼ knowledge_questions — כל שאלה שנשאלה ב«ידע מקצועי»: מה נשאל, האם נמצאה תשובה מכללים מאומתים, ועל אילו כללים.
--   שאלה בלי תשובה היא תור המחקר של «עדכן עכשיו» — לא הולכת לאיבוד. התשובה נכתבת בשרת (knowledge-answer, מפתח שירות);
--   הדפדפן רק רושם שאלה כשהשרת לא זמין, וקורא את שלו.
-- ‼ knowledge_inbox — «מה אני לומד»: נושא מהתואר, הערה וקבצים. חומר מהתואר הוא קצה חוט, לא עובדה: «נקלט» אומר
--   שהעדכון קרא אותו ובדק מול מקורות — לא שכל מה שכתוב בו נכנס. התוצאה נרשמת ב-result.
-- ‼ קבצים — בדלי פרטי knowledge-inbox/<משתמש>/…; לא בתיקי לקוחות. אין כאן פרטי לקוחות.
-- ‼ anon — חסום. RLS לפי user_id = auth.uid() ו-is_authorized().
-- החזרה: scripts/sql/281/rollback-281.sql

-- ── 1 · שאלות ─────────────────────────────────────────────────────────────────────────────────────
create table if not exists public.knowledge_questions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid(),
  question      text not null check (char_length(question) between 2 and 600),
  -- true = נמצאה תשובה שנשענת על כללים; false = אין כלל שעונה; null = לא נבדק (השרת לא היה זמין)
  answerable    boolean,
  rule_ids      text[] not null default '{}',
  -- התשובה כפי שהוצגה (שורות, למה, כללים) — לשחזור ולבקרה
  answer        jsonb,
  model         text,
  error         text,
  created_at    timestamptz not null default now(),
  -- נסגרה בעדכון ידע (נוסף כלל, או הוכרע שאין מה להוסיף)
  resolved_at   timestamptz,
  resolved_note text
);
create index if not exists knowledge_questions_open_idx on public.knowledge_questions (user_id, created_at desc) where answerable is not true and resolved_at is null;

comment on table public.knowledge_questions is
  '281 · שאלות ב«ידע מקצועי». בלי תשובה ⇒ תור המחקר של «עדכן עכשיו». אין בהן פרטי לקוחות.';

-- ── 2 · «מה אני לומד» ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.knowledge_inbox (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid(),
  title        text not null check (char_length(btrim(title)) between 2 and 200),
  note         text check (note is null or char_length(note) <= 2000),
  -- [{path, name, size}] — בדלי knowledge-inbox
  files        jsonb not null default '[]'::jsonb check (jsonb_typeof(files) = 'array'),
  status       text not null default 'waiting' check (status in ('waiting', 'ingested', 'dismissed')),
  -- מה העדכון עשה עם זה: נושא חדש, כללים שנוספו, מה נשאר פתוח
  result       text,
  created_at   timestamptz not null default now(),
  ingested_at  timestamptz
);
create index if not exists knowledge_inbox_user_idx on public.knowledge_inbox (user_id, created_at desc);

comment on table public.knowledge_inbox is
  '281 · «מה אני לומד» — נושאים וקבצים מהתואר לעדכון הידע הבא. קצה חוט, לא עובדה.';

alter table public.knowledge_questions enable row level security;
alter table public.knowledge_inbox enable row level security;

drop policy if exists knowledge_questions_select_own on public.knowledge_questions;
create policy knowledge_questions_select_own on public.knowledge_questions for select to authenticated
  using (user_id = auth.uid() and public.is_authorized());
drop policy if exists knowledge_questions_insert_own on public.knowledge_questions;
-- ‼ הדפדפן רושם רק שאלה «לא נבדקה» (השרת לא היה זמין) — לא תשובה ולא כללים
create policy knowledge_questions_insert_own on public.knowledge_questions for insert to authenticated
  with check (user_id = auth.uid() and public.is_authorized() and answerable is null and answer is null and rule_ids = '{}');

drop policy if exists knowledge_inbox_select_own on public.knowledge_inbox;
create policy knowledge_inbox_select_own on public.knowledge_inbox for select to authenticated
  using (user_id = auth.uid() and public.is_authorized());
drop policy if exists knowledge_inbox_insert_own on public.knowledge_inbox;
create policy knowledge_inbox_insert_own on public.knowledge_inbox for insert to authenticated
  with check (user_id = auth.uid() and public.is_authorized() and status = 'waiting' and result is null);
-- ‼ המשתמש מוסיף/מסיר פריט שעוד ממתין. «נקלט» ו-result נכתבים רק בעדכון (מפתח שירות).
drop policy if exists knowledge_inbox_delete_own on public.knowledge_inbox;
create policy knowledge_inbox_delete_own on public.knowledge_inbox for delete to authenticated
  using (user_id = auth.uid() and public.is_authorized() and status = 'waiting');

revoke all on public.knowledge_questions, public.knowledge_inbox from public, anon;
revoke update, truncate on public.knowledge_questions, public.knowledge_inbox from authenticated;
grant select, insert on public.knowledge_questions to authenticated;
grant select, insert, delete on public.knowledge_inbox to authenticated;

-- ── 3 · דלי פרטי לקבצים מהתואר ────────────────────────────────────────────────────────────────────
do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public, file_size_limit) values ('knowledge-inbox', 'knowledge-inbox', false, 52428800)
      on conflict (id) do nothing;
    drop policy if exists knowledge_inbox_files_select_own on storage.objects;
    create policy knowledge_inbox_files_select_own on storage.objects for select to authenticated
      using (bucket_id = 'knowledge-inbox' and (storage.foldername(name))[1] = auth.uid()::text and public.is_authorized());
    drop policy if exists knowledge_inbox_files_insert_own on storage.objects;
    create policy knowledge_inbox_files_insert_own on storage.objects for insert to authenticated
      with check (bucket_id = 'knowledge-inbox' and (storage.foldername(name))[1] = auth.uid()::text and public.is_authorized());
    drop policy if exists knowledge_inbox_files_delete_own on storage.objects;
    create policy knowledge_inbox_files_delete_own on storage.objects for delete to authenticated
      using (bucket_id = 'knowledge-inbox' and (storage.foldername(name))[1] = auth.uid()::text and public.is_authorized());
  end if;
end $$;
