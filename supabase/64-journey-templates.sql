-- ═══════════════════════════════════════════════════════════════════════════
-- 64 — תבניות מסע: מערכת תבניות אחת, לא שתיים
-- 65 — החלה חוזרת אינה משכפלת בקשה חופשית
-- הוחלו 2026-08-05 כ-journey_templates_64
--                ו-journey_template_dedupes_custom_by_title_65
-- ═══════════════════════════════════════════════════════════════════════════
--
-- הכרעת גיא (2026-08-05, אחרי נקודת אישור ג׳): התוכנית קראה לשתי מערכות
-- תבניות — מסך "תבניות מייל" בפרופיל המשרד, ובנוסף חבילות מסע בבונה. בוטל.
-- במקומן: **תבנית מסע** היא סט של בקשות, וכל בקשה נושאת את הניסוח שלה.
-- המייל שמודיע על בקשה נגזר מאותו ניסוח (`{{requestTitle}}` / `{{requestSub}}`
-- ב-_shared/stepTemplates.ts) ואינו טקסט נפרד לתחזק.
--
-- הסיבה: נוסח שיושב בשני מקומות סותר את עצמו ביום שמשנים אחד מהם.
--
-- הפונקציות המלאות שמורות ב-supabase/live-2026-08-05/:
--   save_journey_template.sql · apply_journey_template.sql

create table if not exists public.journey_templates (
  id          text primary key default replace(gen_random_uuid()::text, '-', ''),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  description text,
  -- [{ stepType, payload }] — ה-payload הוא בדיוק מה שייכתב על השלב שייווצר.
  entries     jsonb not null default '[]'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists journey_templates_user_idx on public.journey_templates (user_id, name);

alter table public.journey_templates enable row level security;

drop policy if exists journey_templates_own on public.journey_templates;
create policy journey_templates_own on public.journey_templates
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop trigger if exists journey_templates_touch on public.journey_templates;
create trigger journey_templates_touch before update on public.journey_templates
  for each row execute function public.set_updated_at();

-- ── `save_journey_template(client, name, description)` ──────────────────────
-- שומרת את הבקשות של הלקוח **בלי המצב שלהן**: הצ'קליסטים והדרישות נשמרים עם
-- done=false, וכל מה ששייך ללקוח הזה בלבד נמחק — טוקן השחרור, נוסח המכתב
-- שנשלח, החתימה, מה שהלקוח כבר מסר, וכתובת ההרשאה מפייפרלס.
-- שלבים אוטומטיים (ייצוג, שדרוג ייצוג, הקמה פנימית, ביקורת חודש ראשון)
-- אינם נכנסים לתבנית — הם נולדים מעצמם ואינם ניתנים להרכבה.
--
-- ── `apply_journey_template(client, template)` ──────────────────────────────
-- מוסיפה בלבד, לעולם לא דורסת. בקשה מהקטלוג שכבר קיימת אצל הלקוח מדולגת —
-- אחרת ניסוח שנערך ידנית או בקשה שכבר רצה מול הלקוח היו נמחקים.
--
-- 65: בקשה חופשית מזוהה **לפי הכותרת** ולא לפי הסוג. `custom_request` הוא
-- רב-פעמי במכוון (מיגרציה 63), ולכן בדיקת "קיים לפי סוג" עקפה אותו והחלה
-- שנייה יצרה עותק כפול של אותה בקשה בדיוק.
-- התגלה בבדיקה בדפדפן: החלה חוזרת דיווחה "נוספו 2" במקום "נוספו 0".
--
-- ── בדיקות שרצו בדפדפן על משתמש הבדיקה (2026-08-05) ────────────────────────
--   שמירת תבנית מלקוח עם 8 בקשות · החלתה על לקוח **בלי התקשרות כלל** —
--   כל שמונה נוצרו עם הניסוח המדויק, הרשימות ריקות, והכדורים נכונים ·
--   החלה חוזרת ⇒ "נוספו 0 · 8 כבר היו קיימות" ·
--   תצוגה מקדימה של מייל תזכורת ⇒ נושא "להעלות 3 מסמכים", גוף עם רשימת
--   המסמכים, וכפתור "להעלאה" — הכול מהבקשה עצמה.
