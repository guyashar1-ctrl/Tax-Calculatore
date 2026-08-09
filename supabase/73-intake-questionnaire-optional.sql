-- 73 · שאלון פתיחת התיק — נוצר אוטומטית, אבל כרשות ובלי להיחשף ללקוח
--
-- הכרעת גיא 2026-08-07 (אפשרות 2):
--   "השאלון ייווצר אוטומטית כחלק מהקליטה, אבל במצב רשות כברירת מחדל. הוא לא
--    יחסום את סגירת הקליטה כל עוד לא שיניתי אותו ידנית לנדרש. עצם יצירת השלב
--    אינה נחשבת שליחה או פרסום ללקוח."
--
-- הרקע: התוכנית קבעה שהשאלון אינו נוצר אוטומטית, אבל בפועל
-- `create_engagement_for_quotation` קוראת ל-`add_intake_questionnaire_step`
-- בשלושת מסלולי היציאה שלה, בלי שום תנאי. במסד החי זה לא נראה כי שלוש
-- ההתקשרויות הקיימות נוצרו לפני שהקריאה נכנסה — אבל כל לקוח חדש היה מקבל
-- שלב שחוסם סגירה (אחרי מיגרציה 68) ומופיע לו בדף האישי.
--
-- שני תיקונים, שניהם בפונקציה אחת:
--   1. required_for_close = false  — תזכורת, לא חוסם.
--   2. payload.published = false   — ‼ קריטי. `get_client_portal` מתייחסת
--      לשלב בלי המפתח הזה כאל **מפורסם** (coalesce(...,'true') <> 'false'),
--      ולכן שלב שנוצר עם payload ריק היה מופיע ללקוח בדף האישי מיד. עכשיו
--      הוא נולד כטיוטה, והחשיפה נעשית רק בפעולה מפורשת של הרו"ח דרך
--      `publish_onboarding_request` — שהיא גם זו שמציעה את המייל.
--
-- ‼ הפונקציה אינה שולחת דבר, לא לפני השינוי ולא אחריו: היא insert בלבד.
--   אין בה קריאה ל-Edge Function, אין תור מיילים ואין התראה.

create or replace function public.add_intake_questionnaire_step(p_engagement_id text)
returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  e public.engagements%rowtype;
  v_id text;
begin
  select * into e from public.engagements where id = p_engagement_id;
  if e.id is null then return jsonb_build_object('ok', false, 'error', 'engagement_not_found'); end if;

  select id into v_id from public.onboarding_steps
    where client_id = e.client_id and step_type = 'intake_questionnaire'
      and status <> 'cancelled' limit 1;
  if v_id is not null then
    return jsonb_build_object('ok', true, 'existed', true, 'stepId', v_id);
  end if;

  insert into public.onboarding_steps (
    user_id, engagement_id, client_id, step_type, track, scope, status, ball,
    required_for_close, payload)
  values (
    e.user_id, e.id, e.client_id, 'intake_questionnaire', 'internal', 'person', 'pending', 'me',
    -- תזכורת אופציונלית בסוף הקליטה, לא תנאי לסגירתה.
    false,
    -- טיוטה: הלקוח אינו רואה אותה עד שהרו"ח פותח אותה במפורש.
    jsonb_build_object('published', false))
  returning id into v_id;

  return jsonb_build_object('ok', true, 'existed', false, 'stepId', v_id);
end;
$function$;

-- ── יישור שלבים קיימים ───────────────────────────────────────────────────────
-- ‼ במסד החי זה תואם **אפס שורות** (אין שלבי שאלון כלל, אומת 2026-08-07),
--   ולכן אין כאן סיכון לשינוי התנהגות אצל לקוח קיים. הכתיבה נשארת כדי
--   שסביבות שכבר צברו שלבים כאלה יתיישרו עם ההכרעה.

-- כל שאלון פעיל הופך לרשות. מי שרוצה שיחסום — מסמן ידנית על השלב.
update public.onboarding_steps
   set required_for_close = false
 where step_type = 'intake_questionnaire'
   and status <> 'cancelled';

-- ‼ רק שאלון שעדיין לא יצא לדרך (pending) מוסתר. שאלון שכבר ממתין ללקוח או
--   שנענה — הלקוח כבר ראה אותו, והסתרה בדיעבד הייתה מבלבלת יותר משעוזרת.
update public.onboarding_steps
   set payload = coalesce(payload, '{}'::jsonb) || jsonb_build_object('published', false)
 where step_type = 'intake_questionnaire'
   and status = 'pending'
   and coalesce(payload->>'published', 'true') <> 'false';

-- ‼ שום מייל אינו נשלח כתוצאה מהמיגרציה הזאת. היא נוגעת בעמודה ובמטען בלבד;
--   אין בה קריאה ל-pg_net, אין תור התראות ואין טריגר שליחה.

-- ── רולבק ────────────────────────────────────────────────────────────────────
-- 1. שחזור add_intake_questionnaire_step מ-supabase/live-2026-08-07/.
-- 2. update public.onboarding_steps set required_for_close = true
--      where step_type = 'intake_questionnaire' and status <> 'cancelled';
--    (וכן הסרת published מהמטען, אם רוצים לחזור להתנהגות הקודמת.)
