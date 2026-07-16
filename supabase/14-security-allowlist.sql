-- ═══════════════════════════════════════════════════════════════════════════
--  14 — מערכת מורשים (Admin Allowlist)  ·  שלב 1 באבטחה
-- ═══════════════════════════════════════════════════════════════════════════
--  צד הניהול פתוח רק לכתובות מייל שנמצאות בטבלה הזו ומסומנות active.
--  מקור אמת יחיד: הממשק, פונקציות השרת וה-RLS כולם שואלים את is_authorized().
--
--  הקובץ הזה הוא אך ורק תשתית (טבלה + פונקציה + אכלוס) — הוא עדיין לא אוכף כלום.
--  האכיפה ב-RLS מגיעה בקובץ 15. חסימת ההרשמה מתבצעת בהגדרות Auth (לא כאן).
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.authorized_users (
  email      text primary key,
  role       text not null default 'owner' check (role in ('owner','employee','readonly')),
  active     boolean not null default true,
  note       text,
  added_by   text,
  created_at timestamptz not null default now()
);

comment on table public.authorized_users is
  'רשימת המיילים המורשים לצד הניהול. עריכה רק דרך service role / מסוף Supabase.';

-- אכלוס ראשוני — שלוש הכתובות המורשות של המשרד + משתמש הבדיקות האוטומטיות.
insert into public.authorized_users (email, role, note, added_by) values
  ('guy@yasharcpa.co.il',    'owner', 'בעל המשרד',                'system-init'),
  ('office@yasharcpa.co.il', 'owner', 'משרד',                     'system-init'),
  ('guyashar1@gmail.com',    'owner', 'חשבון ראשי',               'system-init'),
  ('e2e-test@firm.local',    'owner', 'משתמש בדיקות אוטומטיות',    'system-init')
on conflict (email) do nothing;

-- RLS על הטבלה עצמה: מופעל, וללא אף policy → שום לקוח (anon/authenticated)
-- לא קורא ולא כותב אותה. רק service role (שעוקף RLS) והמסוף ניגשים.
alter table public.authorized_users enable row level security;

-- ── הפונקציה שכל השכבות שואלות ──────────────────────────────────────────────
-- האם המשתמש המחובר כרגע נמצא ברשימה ופעיל? (השוואת מייל ללא תלות ברישיות)
create or replace function public.is_authorized()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.authorized_users a
    join auth.users u on lower(u.email) = lower(a.email)
    where u.id = auth.uid()
      and a.active
  );
$$;

comment on function public.is_authorized() is
  'true אם המשתמש המחובר נמצא ב-authorized_users ומסומן active. משמש RLS + פונקציות שרת + ממשק.';

revoke all on function public.is_authorized() from public;
grant execute on function public.is_authorized() to authenticated;
-- Supabase מעניק הרשאת הרצה אוטומטית ל-anon על פונקציות חדשות — מסירים במפורש.
revoke execute on function public.is_authorized() from anon;
