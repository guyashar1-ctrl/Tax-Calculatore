-- 124 — מסמך שנמחק מהתיק נעלם גם מרשימות הבקשה
--
-- ‼ הבאג: bulkUploads ו-removedUploads שומרים documentId. מחיקת המסמך מתיק
-- הלקוח לא נגעה בהם, ולכן במגירה שבכרטיס נשארו שורות רפאים — שם קובץ שנראה
-- קיים, ו"פתח" שנכשל ב"הקובץ אינו זמין לצפייה". גם המונה בכותרת ספר אותן.
--
-- ‼ טריגר ולא ניקוי בקוד המסך: מחיקה קורית ביותר ממקום אחד (תיק המסמכים,
-- מחיקה מרובה, מחיקת לקוח, ותחזוקה ידנית). מי שמנקה חייב לשבת ליד המחיקה
-- עצמה, אחרת השורות האלה יחזרו בדרך שלא חשבנו עליה.
--
-- ‼ הכיוון היחיד: מסמך → בקשה. הסרה מהרשימה של הרו"ח הקודם **אינה** מוחקת
-- מסמך (מיגרציה 119), וזה נשאר כך.

CREATE OR REPLACE FUNCTION public.forget_deleted_prev_accountant_upload()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  update public.onboarding_steps s
     set payload = s.payload
       || jsonb_build_object('bulkUploads', (
            select coalesce(jsonb_agg(x order by ord), '[]'::jsonb)
              from jsonb_array_elements(coalesce(s.payload->'bulkUploads','[]'::jsonb))
                   with ordinality t(x, ord)
             where x->>'documentId' is distinct from OLD.id))
       || jsonb_build_object('removedUploads', (
            select coalesce(jsonb_agg(x order by ord), '[]'::jsonb)
              from jsonb_array_elements(coalesce(s.payload->'removedUploads','[]'::jsonb))
                   with ordinality t(x, ord)
             where x->>'documentId' is distinct from OLD.id))
   where s.client_id = OLD.client_id
     and s.step_type = 'materials_received'
     and (s.payload->'bulkUploads' @> jsonb_build_array(jsonb_build_object('documentId', OLD.id))
       or s.payload->'removedUploads' @> jsonb_build_array(jsonb_build_object('documentId', OLD.id)));
  return OLD;
end;
$function$;

DROP TRIGGER IF EXISTS documents_forget_prev_accountant_upload ON public.documents;
CREATE TRIGGER documents_forget_prev_accountant_upload
  AFTER DELETE ON public.documents
  FOR EACH ROW EXECUTE FUNCTION public.forget_deleted_prev_accountant_upload();

-- ─── ניקוי שורות הרפאים שכבר נוצרו ──────────────────────────────────────────
-- ‼ רק רשומות שמצביעות למסמך שאינו קיים. מסמך קיים אינו נוגע.
UPDATE public.onboarding_steps s
   set payload = s.payload
     || jsonb_build_object('bulkUploads', (
          select coalesce(jsonb_agg(x order by ord), '[]'::jsonb)
            from jsonb_array_elements(coalesce(s.payload->'bulkUploads','[]'::jsonb))
                 with ordinality t(x, ord)
           where exists (select 1 from public.documents d where d.id = x->>'documentId')))
     || jsonb_build_object('removedUploads', (
          select coalesce(jsonb_agg(x order by ord), '[]'::jsonb)
            from jsonb_array_elements(coalesce(s.payload->'removedUploads','[]'::jsonb))
                 with ordinality t(x, ord)
           where exists (select 1 from public.documents d where d.id = x->>'documentId')))
 WHERE s.step_type = 'materials_received'
   AND (exists (select 1 from jsonb_array_elements(coalesce(s.payload->'bulkUploads','[]'::jsonb)) x
                 where not exists (select 1 from public.documents d where d.id = x->>'documentId'))
     or exists (select 1 from jsonb_array_elements(coalesce(s.payload->'removedUploads','[]'::jsonb)) x
                 where not exists (select 1 from public.documents d where d.id = x->>'documentId')));
