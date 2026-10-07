-- ═══════════════════════════════════════════════════════════════════════════
-- 223 · פגישות ב-Google Meet — זימון מהיומן של הרו"ח (06.10.2026)
--
-- המקור: הדמיה שאושרה ע"י גיא (06.10.2026) — «אני קובע מועד, הזימון יוצא מהיומן שלי».
-- התיעוד: docs/MEETINGS-GOOGLE-CALENDAR.md.
--
-- מה נוסף:
--   1. google_calendar_connections — החיבור ליומן Google של המשרד. המפתח (refresh token) נקרא
--      רק בשרת: RLS פעיל בלי אף מדיניות ⇒ הדפדפן לא קורא ולא כותב. מצב החיבור — דרך
--      google_calendar_status(), שלא מחזירה את המפתח.
--   2. meetings — פגישה שנקבעה מ-PIVO. היומן של Google הוא מקור האמת לשעה ולתשובות המוזמנים;
--      כאן נשמר ההקשר: עם מי (לקוח / ליד), למה, ומה בדיוק נשלח (title/description = הראיה).
--      ‼ אין לדפדפן הרשאת כתיבה: פגישה נוצרת/זזה/מתבטלת רק דרך calendar-meeting, ו«נשלח»
--      (status='scheduled' + sent_at) נכתב רק אחרי ש-Google קיבל את האירוע.
--   3. המזהה נוצר בדפדפן (לחיצה כפולה / רשת שנפלה ⇒ אותה שורה ואותו אירוע ביומן).
--
-- ‼ שום דבר כאן לא נוגע בטבלאות קיימות. לידים נוצרים מפגישה רק בפונקציית השרת, באותה טבלה
--   ובאותו מבנה כמו ליד שהרו"ח מזין ידנית (source='accountant').
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1 · החיבור ליומן ─────────────────────────────────────────────────────────
create table if not exists public.google_calendar_connections (
  user_id        uuid primary key references auth.users(id) on delete cascade,
  google_email   text not null,
  refresh_token  text not null,
  scopes         text not null default '',
  connected_at   timestamptz not null default now(),
  last_ok_at     timestamptz,
  -- ‼ «צריך לחבר מחדש» (Google ביטל את ההרשאה) — נכתב בשרת כשהרענון נדחה.
  last_error     text,
  last_error_at  timestamptz
);

alter table public.google_calendar_connections enable row level security;
revoke all on public.google_calendar_connections from anon, authenticated;

create or replace function public.google_calendar_status()
returns jsonb
language sql
stable security definer
set search_path to 'public'
as $$
  select case
    when auth.uid() is null or not public.is_authorized() then jsonb_build_object('connected', false)
    else coalesce(
      (select jsonb_build_object(
          'connected', true,
          'email', c.google_email,
          'connectedAt', c.connected_at,
          'lastOkAt', c.last_ok_at,
          'lastError', c.last_error,
          'lastErrorAt', c.last_error_at)
         from public.google_calendar_connections c
        where c.user_id = auth.uid()),
      jsonb_build_object('connected', false))
  end;
$$;

revoke all on function public.google_calendar_status() from public, anon;
grant execute on function public.google_calendar_status() to authenticated;

-- ── 2 · פגישות ───────────────────────────────────────────────────────────────
create table if not exists public.meetings (
  id               text primary key,
  user_id          uuid not null references auth.users(id) on delete cascade,
  client_id        text references public.clients(id) on delete set null,
  lead_id          text references public.leads(id) on delete set null,
  kind             text not null check (kind in ('intro', 'work')),
  topic            text,
  prep             text,
  note             text,
  starts_at        timestamptz not null,
  duration_min     int not null check (duration_min between 10 and 240),
  -- [{ email, name, rsvp: 'none'|'yes'|'no'|'maybe' }] — rsvp נקרא מ-Google, לא נכתב ביד.
  guests           jsonb not null default '[]'::jsonb check (jsonb_typeof(guests) = 'array'),
  title            text not null,
  description      text not null,
  -- sending   — נוצרה, הפנייה ל-Google בדרך
  -- scheduled — Google קיבל את האירוע ושלח את ההזמנה (sent_at = הראיה)
  -- unknown   — לא ידוע אם Google קיבל (רשת / 5xx). שליחה חוזרת עם אותו מזהה בטוחה.
  -- failed    — Google דחה בוודאות; אין אירוע ביומן
  -- canceled  — בוטלה; Google שלח הודעת ביטול
  status           text not null default 'sending'
                     check (status in ('sending', 'scheduled', 'unknown', 'failed', 'canceled')),
  google_event_id  text,
  meet_link        text,
  html_link        text,
  sent_at          timestamptz,
  canceled_at      timestamptz,
  rsvp_checked_at  timestamptz,
  last_error       text,
  -- [{ at, kind: 'sent'|'moved'|'canceled'|'changed_in_google'|'canceled_in_google', from?, to?, askedBy? }]
  history          jsonb not null default '[]'::jsonb check (jsonb_typeof(history) = 'array'),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists meetings_user_starts_idx on public.meetings (user_id, starts_at);
create index if not exists meetings_client_idx on public.meetings (client_id) where client_id is not null;
create index if not exists meetings_lead_idx on public.meetings (lead_id) where lead_id is not null;

drop trigger if exists meetings_set_updated_at on public.meetings;
create trigger meetings_set_updated_at before update on public.meetings
  for each row execute function public.set_updated_at();

alter table public.meetings enable row level security;

-- ‼ קריאה בלבד לבעלים. כל כתיבה — בפונקציית השרת (service role), אחרי Google.
drop policy if exists meetings_select_own on public.meetings;
create policy meetings_select_own on public.meetings
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists require_authorized on public.meetings;
create policy require_authorized on public.meetings
  as restrictive for all to authenticated
  using (public.is_authorized()) with check (public.is_authorized());

revoke insert, update, delete on public.meetings from anon, authenticated;
grant select on public.meetings to authenticated;
