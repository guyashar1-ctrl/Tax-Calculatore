-- 120 — "חומרים מרו״ח קודם": תיקייה אחת יציבה לכל לקוח
--
-- ‼ עד עכשיו קבצים שהגיעו דרך דף הרו"ח הקודם נחתו בשורש תיק המסמכים, מעורבים
-- בכל השאר. אחרי כמה בקשות אי אפשר היה לדעת מה הגיע מאיזה מקור.
--
-- ההכרעה: **תיקייה אחת ללקוח**, לא תיקייה לכל בקשה. בקשה שנייה לאותו לקוח
-- מוסיפה לאותה תיקייה. השיוך לבקשה נשמר ב-payload של השלב (bulkUploads /
-- removedUploads) ולא בשם התיקייה — אחרת התיק היה מתמלא בתיקיות.
--
-- ‼ "הוסר מרשימת הרו"ח הקודם" אינו מצב של המסמך אלא של הבקשה. הקובץ נשאר
-- בתיקייה כמו כל קובץ אחר; ההבחנה חיה במגירה שבמסך הקליטה בלבד. אין תיקיית
-- "נמחקו" ואין עמודת סטטוס חדשה. ראה מיגרציה 119.

-- ─── 1. אינדקס שמונע כפילות ─────────────────────────────────────────────────
-- ‼ חלקי בכוונה: הוא נוגע אך ורק לתיקייה הזו. תיקיות אחרות ממשיכות להתנהג
-- כרגיל, וכפילויות היסטוריות בשמות אחרים אינן נשברות בגללו.
CREATE UNIQUE INDEX IF NOT EXISTS document_folders_prev_accountant_uniq
  ON public.document_folders (client_id)
  WHERE name = 'חומרים מרו״ח קודם' AND parent_id IS NULL;

-- ─── 2. שליפה-או-יצירה, בטוחה לקריאות מקבילות ───────────────────────────────
-- ‼ שתי העלאות שמגיעות יחד היו יוצרות שתי תיקיות. ON CONFLICT + שליפה חוזרת
-- מבטיחים שהמנצח היחיד הוא הראשון, והשני מקבל את אותו מזהה.
CREATE OR REPLACE FUNCTION public.ensure_prev_accountant_folder(
  p_user_id uuid, p_client_id text)
 RETURNS text
 LANGUAGE plpgsql
 VOLATILE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_id text;
begin
  select id into v_id from public.document_folders
   where client_id = p_client_id and parent_id is null and name = 'חומרים מרו״ח קודם'
   limit 1;
  if v_id is not null then return v_id; end if;

  v_id := gen_random_uuid()::text;
  insert into public.document_folders (id, user_id, client_id, parent_id, name)
  values (v_id, p_user_id, p_client_id, null, 'חומרים מרו״ח קודם')
  on conflict do nothing;

  select id into v_id from public.document_folders
   where client_id = p_client_id and parent_id is null and name = 'חומרים מרו״ח קודם'
   limit 1;
  return v_id;
end;
$function$;

GRANT EXECUTE ON FUNCTION public.ensure_prev_accountant_folder(uuid, text) TO authenticated, service_role;

-- ─── 3. השלמה לקבצים שכבר הגיעו ─────────────────────────────────────────────
-- ‼ רק מה ששיוכו ודאי. שני סימנים, שניהם נכתבים על ידי המערכת:
--   · המזהה רשום ב-bulkUploads/removedUploads של שלב קבלת חומרים;
--   · ההערה שנכתבת בהעלאה מדף הרו"ח הקודם (portal-upload-document).
-- ‼ רק folder_id IS NULL: קובץ שהמשרד כבר תייק בעצמו לא זז. עדיף להשאיר
-- קובץ בשורש מאשר להזיז קובץ לא נכון.
DO $migrate$
DECLARE
  r record;
  v_folder text;
BEGIN
  FOR r IN
    WITH from_steps AS (
      SELECT DISTINCT x->>'documentId' AS doc_id
        FROM public.onboarding_steps s,
             LATERAL jsonb_array_elements(
               coalesce(s.payload->'bulkUploads', '[]'::jsonb)
               || coalesce(s.payload->'removedUploads', '[]'::jsonb)) x
       WHERE s.step_type = 'materials_received'
    )
    SELECT d.id, d.user_id, d.client_id
      FROM public.documents d
     WHERE d.folder_id IS NULL
       AND (d.id IN (SELECT doc_id FROM from_steps)
            OR d.notes = 'הועלה על ידי רואה החשבון הקודם מהדף הציבורי')
  LOOP
    v_folder := public.ensure_prev_accountant_folder(r.user_id, r.client_id);
    UPDATE public.documents SET folder_id = v_folder WHERE id = r.id;
  END LOOP;
END
$migrate$;
