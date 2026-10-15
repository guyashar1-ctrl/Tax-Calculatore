-- ════════════════════════════════════════════════════════════════════════════
-- 243 · «PIVO השבוע» — יומן שבועי של התפתחות המערכת — 15.10.2026
-- ════════════════════════════════════════════════════════════════════════════
-- הקוד שמקביל: src/features/pivoWeekly/ ו-src/components/office/pages/PivoWeeklyPage.tsx
-- («המשרד» ← «PIVO השבוע»).
--
-- שורה אחת לכל שבוע (ראשון עד שבת): כמה שורות על מה שהמערכת למדה לעשות.
-- הטקסט נכתב בעזרת Claude Code ומודבק כאן; אין כאן שום פעולה מול לקוח או רשות.
-- ‼ שבוע = יום ראשון שלו (week_start). שמירה חוזרת לאותו שבוע מעדכנת את השורה; ריקון = מחיקה.
-- ‼ פרטי למשתמש שכתב (user_id = auth.uid()), כמו שאר נתוני המשרד.
-- ════════════════════════════════════════════════════════════════════════════

create table if not exists public.pivo_weekly_notes (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  week_start  date not null check (extract(isodow from week_start) = 7),
  body        text not null check (char_length(btrim(body)) between 1 and 4000),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, week_start)
);

alter table public.pivo_weekly_notes enable row level security;

drop policy if exists pivo_weekly_notes_owner_read on public.pivo_weekly_notes;
create policy pivo_weekly_notes_owner_read on public.pivo_weekly_notes
  for select to authenticated using (user_id = auth.uid() and public.is_authorized());

drop policy if exists pivo_weekly_notes_owner_insert on public.pivo_weekly_notes;
create policy pivo_weekly_notes_owner_insert on public.pivo_weekly_notes
  for insert to authenticated with check (user_id = auth.uid() and public.is_authorized());

drop policy if exists pivo_weekly_notes_owner_update on public.pivo_weekly_notes;
create policy pivo_weekly_notes_owner_update on public.pivo_weekly_notes
  for update to authenticated using (user_id = auth.uid() and public.is_authorized())
  with check (user_id = auth.uid() and public.is_authorized());

drop policy if exists pivo_weekly_notes_owner_delete on public.pivo_weekly_notes;
create policy pivo_weekly_notes_owner_delete on public.pivo_weekly_notes
  for delete to authenticated using (user_id = auth.uid() and public.is_authorized());

create or replace function public._pivo_weekly_notes_touch() returns trigger
language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists pivo_weekly_notes_touch on public.pivo_weekly_notes;
create trigger pivo_weekly_notes_touch before update on public.pivo_weekly_notes
  for each row execute function public._pivo_weekly_notes_touch();

revoke all on function public._pivo_weekly_notes_touch() from public, anon, authenticated;
revoke all on public.pivo_weekly_notes from anon;
grant select, insert, update, delete on public.pivo_weekly_notes to authenticated;
