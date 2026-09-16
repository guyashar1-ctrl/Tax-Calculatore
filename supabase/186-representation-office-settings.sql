-- ═══════════════════════════════════════════════════════════════════════════
-- 186 · «ניהול המשרד → ייצוג» — הכרטיס "זירוז אישור הייצוג באזור האישי"
-- הופך לניתן-להתאמה מהמשרד, בלי לשבור אף שורה קיימת.
-- ═══════════════════════════════════════════════════════════════════════════
--
-- מה משתנה: ensure_rep_client_approval_step (שכותבת את payload השלב פעם אחת,
-- ב-INSERT, כשהייצוג מגיע ל-awaiting_authorities) קוראת עכשיו override
-- אופציונלי מ-profiles.settings->'representation'->'templates'->'portalCard'
-- לשלושת שדות ה"הסבר" (clientSub / clientNote / clientNoteAfter /
-- clientLinkLabel) במקום ליטרל קשיח בלבד.
--
-- מה לא משתנה:
--   • clientTitle, clientCta ('אישרתי באזור האישי'), clientLinkUrl (gov.il) —
--     נשארים ליטרלים קבועים בגוף הפונקציה. system-owned, לא נקראים מההגדרות.
--   • שורות קיימות: payload הוא צילום שנכתב פעם אחת ב-INSERT (כך היה גם
--     לפני 186 — ראה migration 133, "אם המשרד ערך את הכותרת בעצמו, לא
--     דורסים אותה"). אין UPDATE על onboarding_steps כאן, ולכן שום שורה
--     קיימת — כולל כזו שהותאמה ידנית בעבר — אינה נוגעת. משרד שמגדיר תבנית
--     חדשה משפיע רק על בקשות ייצוג *עתידיות* שרק עוד יגיעו ל-awaiting_authorities.
--   • משרד שלא הגדיר דבר מקבל בדיוק את אותו טקסט כמו היום — ה-coalesce
--     נופל לברירת המחדל הקבועה בכל מקרה של NULL/מחרוזת ריקה.
--
-- אידמפוטנטי: CREATE OR REPLACE FUNCTION בלבד, בלי ALTER TABLE ובלי backfill.
CREATE OR REPLACE FUNCTION public.ensure_rep_client_approval_step(p_client_id text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  c      public.clients%rowtype;
  v_id   text;
  v_eng  text;
  v_sort int;
  v_tpl  jsonb;
begin
  select * into c from public.clients where id = p_client_id;
  if c.id is null then return null; end if;

  select id into v_id from public.onboarding_steps
    where client_id = p_client_id and step_type = 'rep_client_approval'
      and status <> 'cancelled' limit 1;
  if v_id is not null then return v_id; end if;

  if exists (select 1 from public.onboarding_steps
              where client_id = p_client_id and step_type = 'rep_client_approval'
                and status = 'cancelled') then
    return null;
  end if;

  select id into v_eng from public.engagements
    where client_id = p_client_id order by created_at desc limit 1;

  select coalesce(max(sort_order), 0) + 1 into v_sort
    from public.onboarding_steps
    where client_id = p_client_id and step_type = 'representation'
      and status <> 'cancelled';

  -- 186: נוסח המשרד ל"הסבר"/שורת-משנה/קישור, אם קיים. title/cta/linkUrl
  -- קבועים למטה ואינם נקראים מכאן — system-owned.
  select settings -> 'representation' -> 'templates' -> 'portalCard' into v_tpl
    from public.profiles where id = c.user_id;

  insert into public.onboarding_steps
    (user_id, engagement_id, client_id, required_for_close, step_type, track, scope,
     status, ball, sort_order, published_at, payload)
  values
    (c.user_id, v_eng, p_client_id, false, 'rep_client_approval', 'authorities', 'person',
     'pending', 'client', v_sort, now(),
     jsonb_build_object(
       'clientTitle', 'זירוז אישור הייצוג באזור האישי',
       'clientSub', coalesce(nullif(v_tpl ->> 'sub', ''),
         'אופציונלי - שלוש דקות שמקצרות את ההמתנה לאישור הרשויות'),
       'clientNote', coalesce(nullif(v_tpl ->> 'note', ''),
         E'יש לך כבר משתמש באזור האישי של רשות המסים?\\n\\nכן - נכנסים בקישור, לוחצים \"לכניסה למערכת\" ומזדהים. מחפשים את הבקשה שבה מופיע שם המשרד כמייצג, ובוחרים אישור. שתי דקות.\\n\\nלא - קודם צריך להירשם ולהזדהות מול רשות המסים. זה החלק שלוקח את הזמן, ובלעדיו אי אפשר לאשר.\\n\\nאם קיבלת מרשות המסים הודעת SMS על רישום מייצג - אפשר להיכנס ישירות מהקישור שבהודעה, וזה קצר יותר.'),
       'clientNoteAfter', coalesce(nullif(v_tpl ->> 'noteAfter', ''),
         'ואם לא הסתדר - אין בעיה. הייצוג ייכנס לתוקף גם בלי זה, זה פשוט לוקח כמה ימים יותר.'),
       'clientCta', 'אישרתי באזור האישי',
       'clientLinkUrl', 'https://www.gov.il/he/service/personal_area_taxes',
       'clientLinkLabel', coalesce(nullif(v_tpl ->> 'linkLabel', ''), 'לכניסה לאזור האישי')))
  returning id into v_id;

  perform public.log_onboarding_event(c.user_id, v_id, v_eng, 'created', 'system',
    'הבקשה נוצרה כשהייצוג הוגש לשע"ם', '{}'::jsonb);

  return v_id;
end;
$function$;

-- ═══════════════════════════════════════════════════════════════════════════
-- תזכורות ייצוג · תביעה אטומית (CAS) למניעת שליחה כפולה בחפיפת הרצות
-- ═══════════════════════════════════════════════════════════════════════════
--
-- representation-reminders (cron יומי) קורא שורה, מחליט "צריך תזכורת" לפי
-- הגדרות המשרד, ואז חייב "לתבוע" את המונה **לפני** קריאה ל-Resend — אחרת שתי
-- הרצות חופפות (cron + הרצה ידנית, או שתי הרצות cron שהתחפפו) יכולות שתיהן
-- לעבור את אותה בדיקה ולשלוח פעמיים לאותו לקוח. זה בדיוק הדפוס הקיים כבר
-- ב-send-onboarding-email למייל ה-onboard (representation_sent_at is null),
-- מותאם למונה חוזר (count) במקום timestamp חד-פעמי.
--
-- claim: מעדכן count→count+1 ו-lastSentAt=now() רק אם ה-count הנוכחי עדיין
-- זהה למה שנקרא — UPDATE...WHERE עם תנאי על הערך הישן הוא הפעולה האטומית
-- עצמה (Postgres נועל את השורה לכל משך הביצוע); "0 שורות עודכנו" = מישהו
-- אחר כבר תבע את התזכורת הזאת בינתיים, ומדלגים. אין race window בין קריאה
-- לכתיבה, כי אין קריאה נפרדת בתוך הפונקציה — ההשוואה חלק מה-WHERE עצמו.
--
-- release: נקרא רק כשהשליחה בפועל נכשלה (Resend החזיר שגיאה) — מחזיר את
-- ה-count אחורה כדי שההרצה הבאה תוכל לנסות שוב, ומשחזר את lastSentAt הקודם
-- (אחרת "נכשל אבל עדכנו את הזמן" היה דוחה את הניסיון החוזר ב-afterDays
-- נוספים בטעות). משוחזר רק אם אף אחד אחר לא הספיק להתקדם מעבר לתביעה שלנו
-- (אותו תנאי CAS, בכיוון ההפוך) — אחרת שחרור היה יכול לדרוס תביעה חדשה
-- ולפתוח פתח לשליחה כפולה אמיתית. כשל בשחרור עצמו (למשל אם השורה נמחקה
-- בינתיים) אינו קריטי: התזכורת פשוט תיחשב "נשלחה" פעם אחת מוקדם מדי, ולא
-- תישלח שוב — safe-by-default, לא ההפך.
--
-- שני משטחים נפרדים (לא פונקציה גנרית אחת לכל jsonb path — ראה הנחיה
-- "לא מנוע אוטומציה כללי"): representation_requests.execution.reminders.<אודיינס>
-- (sign / niClient / niSpouse), ו-onboarding_steps.payload.reminder (הכרטיס
-- בדף האישי). קריאה רק מ-representation-reminders עם service_role — אין
-- להן שימוש מהדפדפן, ולכן EXECUTE מוסר מ-anon/authenticated במפורש.

CREATE OR REPLACE FUNCTION public.claim_representation_reminder(
  p_request_id text, p_audience text, p_expected_count int
) RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_rows int;
begin
  if p_audience not in ('sign', 'niClient', 'niSpouse') then
    raise exception 'invalid audience: %', p_audience;
  end if;

  update public.representation_requests
     set execution = jsonb_set(
           coalesce(execution, '{}'::jsonb), array['reminders', p_audience],
           jsonb_build_object('count', p_expected_count + 1, 'lastSentAt', now())),
         updated_at = now()
   where id = p_request_id
     and coalesce((execution -> 'reminders' -> p_audience ->> 'count')::int, 0) = p_expected_count;

  get diagnostics v_rows = row_count;
  return v_rows > 0;
end;
$function$;

CREATE OR REPLACE FUNCTION public.release_representation_reminder_claim(
  p_request_id text, p_audience text, p_claimed_count int, p_prev_last_sent_at timestamptz
) RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if p_audience not in ('sign', 'niClient', 'niSpouse') then
    raise exception 'invalid audience: %', p_audience;
  end if;

  update public.representation_requests
     set execution = jsonb_set(
           coalesce(execution, '{}'::jsonb), array['reminders', p_audience],
           jsonb_strip_nulls(jsonb_build_object(
             'count', greatest(p_claimed_count - 1, 0), 'lastSentAt', p_prev_last_sent_at)))
   where id = p_request_id
     and (execution -> 'reminders' -> p_audience ->> 'count')::int = p_claimed_count;
end;
$function$;

CREATE OR REPLACE FUNCTION public.claim_representation_portal_reminder(
  p_step_id text, p_expected_count int
) RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_rows int;
begin
  update public.onboarding_steps
     set payload = jsonb_set(
           coalesce(payload, '{}'::jsonb), array['reminder'],
           jsonb_build_object('count', p_expected_count + 1, 'lastSentAt', now())),
         updated_at = now()
   where id = p_step_id
     and coalesce((payload -> 'reminder' ->> 'count')::int, 0) = p_expected_count;

  get diagnostics v_rows = row_count;
  return v_rows > 0;
end;
$function$;

CREATE OR REPLACE FUNCTION public.release_representation_portal_reminder_claim(
  p_step_id text, p_claimed_count int, p_prev_last_sent_at timestamptz
) RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  update public.onboarding_steps
     set payload = jsonb_set(
           coalesce(payload, '{}'::jsonb), array['reminder'],
           jsonb_strip_nulls(jsonb_build_object(
             'count', greatest(p_claimed_count - 1, 0), 'lastSentAt', p_prev_last_sent_at)))
   where id = p_step_id
     and (payload -> 'reminder' ->> 'count')::int = p_claimed_count;
end;
$function$;

-- ‼ ברירת המחדל של סופאבייס פותחת EXECUTE ל-anon/authenticated על כל
-- פונקציה חדשה (מיגרציה 160 מתקנת זאת גם דרך event trigger גלובלי, אבל
-- הסרה מפורשת כאן הופכת את הכוונה לגלויה בקובץ הזה בלי תלות בטריגר חיצוני).
REVOKE ALL ON FUNCTION public.claim_representation_reminder(text, text, int) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_representation_reminder_claim(text, text, int, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_representation_portal_reminder(text, int) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_representation_portal_reminder_claim(text, int, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_representation_reminder(text, text, int) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_representation_reminder_claim(text, text, int, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_representation_portal_reminder(text, int) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_representation_portal_reminder_claim(text, int, timestamptz) TO service_role;
