-- 122 — שם הקובץ הוא שם המסמך, ו"חומרים מהרו״ח הקודם" הוא תווית
--
-- ‼ עד עכשיו כל קובץ שהגיע מדף הרו"ח הקודם נשמר עם description
-- "חומרים מהרו״ח הקודם", ותיק המסמכים מציג את description כשם הראשי
-- (DocumentsWorkspace: `d.description || d.fileName`). התוצאה: כל הקבצים
-- נראו בעלי אותו שם, ושם הקובץ האמיתי ירד לשורה משנית.
--
-- ההכרעה: **השם הוא שם הקובץ ששלח**, והמקור הופך לתווית. תווית היא בדיוק
-- הכלי לזה — אפשר לסנן לפיה, והיא לא גוזלת את השם.

-- ─── 1. תווית אחת לכל משרד ──────────────────────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS document_labels_prev_accountant_uniq
  ON public.document_labels (user_id)
  WHERE name = 'חומרים מהרו״ח הקודם';

CREATE OR REPLACE FUNCTION public.ensure_prev_accountant_label(p_user_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 VOLATILE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_id text;
begin
  select id into v_id from public.document_labels
   where user_id = p_user_id and name = 'חומרים מהרו״ח הקודם' limit 1;
  if v_id is not null then return v_id; end if;

  insert into public.document_labels (user_id, name)
  values (p_user_id, 'חומרים מהרו״ח הקודם')
  on conflict do nothing;

  select id into v_id from public.document_labels
   where user_id = p_user_id and name = 'חומרים מהרו״ח הקודם' limit 1;
  return v_id;
end;
$function$;

GRANT EXECUTE ON FUNCTION public.ensure_prev_accountant_label(uuid) TO authenticated, service_role;

-- ─── 2. השלמה לקבצים שכבר הגיעו ─────────────────────────────────────────────
-- ‼ אותה זהירות של מיגרציה 120: רק מה ששיוכו ודאי — ההערה שהמערכת כותבת
-- בהעלאה מהדף. ה-description בערוץ הזה נכתב תמיד על ידי המערכת (שם הפריט
-- או תווית גנרית) ולעולם לא על ידי המשרד, ולכן ניקויו אינו מוחק עבודה של
-- אדם; השיוך לפריט ממשיך לחיות ב-checklist של השלב.
-- ‼ תווית שכבר נקבעה (documentLabelId על הבקשה) אינה נדרסת.
DO $migrate$
DECLARE
  r record;
  v_label text;
BEGIN
  FOR r IN
    SELECT d.id, d.user_id
      FROM public.documents d
     WHERE d.notes = 'הועלה על ידי רואה החשבון הקודם מהדף הציבורי'
       AND (coalesce(d.description, '') <> '' OR d.label_id IS NULL)
  LOOP
    v_label := public.ensure_prev_accountant_label(r.user_id);
    UPDATE public.documents
       SET description = '', label_id = COALESCE(label_id, v_label)
     WHERE id = r.id;
  END LOOP;
END
$migrate$;
