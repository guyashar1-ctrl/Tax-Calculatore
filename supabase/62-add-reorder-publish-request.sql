-- ═══════════════════════════════════════════════════════════════════════════
-- 62 — הרו"ח מוסיף בקשה, מסדר שורות, ופותח בקשה ללקוח
-- 63 — בקשה חופשית היא רב-פעמית
-- הוחלו 2026-08-05 כ-journey_create_reorder_publish_request_62
--                ו-journey_custom_request_is_multi_instance_63
-- ═══════════════════════════════════════════════════════════════════════════
--
-- 62 מוסיף ארבע פונקציות. הנוסח המלא שרץ שמור, byte-for-byte, ב:
--     supabase/live-2026-08-05/onboarding_track_for.sql
--     supabase/live-2026-08-05/create_onboarding_request.sql
--     supabase/live-2026-08-05/reorder_onboarding_steps.sql
--     supabase/live-2026-08-05/publish_onboarding_request.sql
-- (נמשכו מהמסד ע"י scripts/dump-live-functions.mjs).
--
-- ── מה הן עושות ────────────────────────────────────────────────────────────
--
-- `onboarding_track_for(step_type)` — מיפוי סוג-בקשה ← מסלול, במקום אחד.
--   קיים כדי ששתי דרכי היצירה (המרכיב בשרת, וההוספה הידנית) לא יסתרו זו את זו.
--
-- `create_onboarding_request(client, step_type, payload, due, depends_on, published)`
--   • מאמת בעלות על הלקוח מול auth.uid()
--   • רשימה סגורה של סוגים שמותר ליצור ידנית. שלב `representation` **אינו** בה:
--     הוא מסונכרן מבקשת הייצוג בטריגר, ויצירה ידנית הייתה נדרסת בו.
--   • בקשה חופשית בלי דרישות נדחית — אין ללקוח מה לעשות בה.
--   • הכדור נגזר מהסוג: client_documents / prev_accountant_details /
--     custom_request ⇒ אצל הלקוח; כל השאר ⇒ אצלי.
--   • תלות שכבר הושלמה אינה נועלת — אחרת השלב היה נולד נעול לנצח.
--   • sort_order = max+10, ואירוע `created` ביומן.
--
-- `reorder_onboarding_steps(client, ids[])` — כותב sort_order = מיקום×10.
--   הסדר הזה הוא מה שהלקוח רואה בדף האישי, ולא רק מיון מקומי במסך.
--
-- `publish_onboarding_request(step)` — מסיר את `payload.published=false`,
--   כלומר חושף ללקוח בקשה שהוכנה כטיוטה, ורושם אירוע. המייל שמודיע עליה
--   נפתח בנפרד כתצוגה מקדימה — הפונקציה הזאת אינה שולחת דבר.
--
-- ── 63 · שני האינדקסים הייחודיים ────────────────────────────────────────────
--
-- שני אינדקסים אכפו "שלב אחד מכל סוג" כדי שהמרכיב לא ייצור כפילויות בהרצה
-- חוזרת. הכלל נכון לכל בקשות הקטלוג, אבל `custom_request` הוא בדיוק ההפך —
-- הרו"ח מוסיף כמה שהוא צריך. התגלה בבדיקה בדפדפן: הבקשה החופשית השנייה
-- נדחתה ב-duplicate key.
--
-- זהו צמצום של תנאי ה-WHERE בלבד: הוא מתיר שורות נוספות ולעולם לא פוסל
-- שורות קיימות, ולכן אין סיכון לנתונים שכבר במסד.

drop index if exists public.onboarding_steps_engagement_type_idx;
create unique index onboarding_steps_engagement_type_idx
  on public.onboarding_steps (engagement_id, step_type)
  where engagement_id is not null and step_type <> 'custom_request';

drop index if exists public.onboarding_steps_person_type_idx;
create unique index onboarding_steps_person_type_idx
  on public.onboarding_steps (client_id, step_type)
  where scope = 'person' and status <> 'cancelled' and step_type <> 'custom_request';

-- ── בדיקות שרצו בדפדפן על משתמש הבדיקה (2026-08-05) ────────────────────────
--   הקטלוג מסנן סוגים שכבר קיימים אצל הלקוח · בקשה חופשית נוצרה עם דרישת
--   אישור · נולדה כטיוטה ולא הופיעה ב-get_client_portal · "שלח ללקוח" חשף
--   אותה בקול-הלקוח ופתח תצוגה מקדימה של מייל בלי לשלוח · הזזת שורה למעלה
--   שינתה את הסדר גם בדף האישי.
