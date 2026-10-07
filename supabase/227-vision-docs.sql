-- ─── 227: מפת הדרך לעצמאות — הדף האישי של גיא, כלשונית ב-PIVO ─────────────
-- גיא, 7.10.2026: «אני לא רואה את זה בפרודקשן». הדף נבנה כ-Artifact פרטי ב-Claude
-- (docs/vision/). כאן הוא נכנס לאפליקציה כלשונית «מפת הדרך» ליד «משימות».
--
-- מה נשמר: ארבעה מסמכי JSON לכל משתמש, באותו מבנה שהדף כבר עובד איתו:
--   meta · clients · procs · weeks-<שנה>  (השבועות במסמך לכל שנה, כדי שאף מסמך לא יגדל בלי סוף)
-- ‼ זה מרחב אישי של בעל החשבון, לא נתוני משרד: «הלקוחות» כאן הם לבנים בקיר של
--   התוכנית האישית, לא רשומות ב-clients. אין קשר לטבלאות האחרות ואין טריגרים.
-- ‼ רק בעל השורה קורא וכותב, ורק משתמש מורשה (is_authorized, כמו בכל טבלאות המשרד).
-- ‼ המספר 227 ולא 225: הענף של הפגישות (claude/busy-ptolemy-kkyqml) כבר תפס את 225 ו-226.
-- ‼ תוספת בלבד: טבלה חדשה. אין שינוי בשום טבלה או פונקציה קיימת.
-- חזרה: drop table public.vision_docs;

create table if not exists public.vision_docs (
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  doc_id     text not null check (doc_id ~ '^[a-z0-9-]{1,40}$'),
  body       jsonb not null default '{}'::jsonb
             check (jsonb_typeof(body) = 'object' and pg_column_size(body) <= 262144),
  updated_at timestamptz not null default now(),
  primary key (user_id, doc_id)
);

alter table public.vision_docs enable row level security;

-- ‼ בלי «drop policy if exists»: הטבלה חדשה, ופקודת DROP דרך כלי ה-SQL נתקעת עד
--   אישור ידני (7.10, staging). להרצה חוזרת — למחוק קודם את המדיניות ביד.
create policy vision_docs_own on public.vision_docs for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
-- הגבלה מחייבת כמו בכל טבלאות המשרד (166).
create policy require_authorized on public.vision_docs as restrictive for all to authenticated
  using (public.is_authorized());

revoke all on public.vision_docs from anon;
grant select, insert, update, delete on public.vision_docs to authenticated;

-- אומת ב-staging (7.10.2026), בתוך טרנזקציה שבוטלה: בעל השורה מוסיף, קורא ומעדכן;
-- מזהה מסמך לא תקין ו-body שאינו אובייקט נחסמים (23514); שורה בשם משתמש אחר
-- נחסמת (42501); משתמש זר לא רואה כלום ולא כותב (42501).
