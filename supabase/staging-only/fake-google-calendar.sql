-- ═══════════════════════════════════════════════════════════════════════════
--  יומן Google מדומה — staging בלבד. ‼ לא מיגרציה לייצור.
--
--  fake-google-calendar שומרת כאן את «האירועים» שפונקציות השרת יוצרות, כדי לבדוק
--  את כל המסלול האמיתי (חיבור, זימון, 409 בשליחה חוזרת, שינוי מועד, ביטול, תשובות
--  המוזמנים) בלי חשבון Google ובלי שאף הזמנה תצא לאדם.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.test_fake_google_events (
  id          text primary key,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  -- אירוע כפי ש-Google היה שומר אותו (summary, description, start, end, attendees, status…)
  event       jsonb not null,
  -- כל קריאה שהגיעה: [{at, method, sendUpdates}] — «כמה הזמנות/עדכונים יצאו»
  calls       jsonb not null default '[]'::jsonb
);

alter table public.test_fake_google_events enable row level security;
revoke all on public.test_fake_google_events from anon, authenticated;
