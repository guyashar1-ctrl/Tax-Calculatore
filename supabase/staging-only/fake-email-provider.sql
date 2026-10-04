-- ═══════════════════════════════════════════════════════════════════════════
--  ספק דואר מדומה — staging בלבד. ‼ לא מיגרציה לייצור (לא בתיקיית המיגרציות
--  הממוספרות, ו-scripts/staging-fake-email.mjs מסרב לרוץ מול הייצור).
--
--  כל מייל שפונקציות השרת שולחות ב-staging מגיע לכאן במקום ל-Resend
--  (RESEND_API_URL → פונקציית fake-email-provider), נשמר, ואפשר לראות אותו
--  ב«תיבת ההדגמה». כך נבדק כל המסלול האמיתי — תפיסה, מפתח אידמפוטנטיות,
--  ניסיון חוזר, יומן — בלי שאף מייל יוצא לאדם.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.test_captured_emails (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  -- delivered = «נשלח» (ספירת מיילים אמיתית) · replay = אותו מפתח ואותו גוף, הוחזר המזהה המקורי
  -- rejected = כשל מדומה (5xx/4xx) · conflict = 409 (מקביל / גוף אחר)
  mode        text not null check (mode in ('delivered', 'replay', 'rejected', 'conflict')),
  status      int  not null,
  idem_key    text,
  body_hash   text not null,
  to_emails   text[] not null default '{}',
  from_email  text,
  subject     text,
  html        text,
  delivered_id uuid,
  response    jsonb
);

-- מייל אחד לכל מפתח: שתי שליחות מקבילות עם אותו מפתח ⇒ אחת נכשלת בהכנסה ⇒ 409.
create unique index if not exists test_captured_emails_one_per_key
  on public.test_captured_emails (idem_key) where mode = 'delivered' and idem_key is not null;
create index if not exists test_captured_emails_created on public.test_captured_emails (created_at desc);

alter table public.test_captured_emails enable row level security;
-- תיבת ההדגמה במסך קוראת; כותבת רק הפונקציה (service role).
drop policy if exists test_captured_emails_read on public.test_captured_emails;
create policy test_captured_emails_read on public.test_captured_emails
  for select to authenticated using (true);
revoke insert, update, delete on public.test_captured_emails from anon, authenticated;
grant select on public.test_captured_emails to authenticated;
