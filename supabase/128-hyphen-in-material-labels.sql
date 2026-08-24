-- 128 — מקף רגיל במקום קו מפריד בתוויות החומרים
--
-- ‼ הכרעת גיא (2026-08-24): "-" ולא "—" בכל מקום. הקוד עודכן בכל המחרוזות
-- הגלויות; כאן מיושרים הנתונים שכבר נכתבו עם "—" על ידי מיגרציות 123/126/127
-- — תוויות הצ'קליסט ותוויות הקטלוג בטיוטות.
--
-- ‼ נוגע אך ורק בשדות label של הפריטים. גוף מכתב שכבר נשלח אינו משוכתב —
-- הוא מה שהרו"ח הקודם קיבל בפועל. שינוי תו בתווית תצוגה אינו שינוי סמנטי
-- של הבקשה.
--
-- (הפונקציות split/align/normalize עודכנו בקבצים שלהן לכתוב "-" מעתה.)

UPDATE public.onboarding_steps s
   SET payload = jsonb_set(s.payload, '{checklist}', (
         SELECT jsonb_agg(
                  CASE WHEN x->>'label' LIKE '%—%'
                       THEN x || jsonb_build_object('label', replace(x->>'label', '—', '-'))
                       ELSE x END ORDER BY ord)
           FROM jsonb_array_elements(s.payload->'checklist') WITH ORDINALITY t(x, ord)))
 WHERE s.step_type = 'materials_received'
   AND EXISTS (SELECT 1 FROM jsonb_array_elements(coalesce(s.payload->'checklist','[]'::jsonb)) x
                WHERE x->>'label' LIKE '%—%');

UPDATE public.onboarding_steps s
   SET payload = jsonb_set(s.payload, '{releaseDraft,materials}', (
         SELECT jsonb_agg(
                  CASE WHEN x->>'label' LIKE '%—%'
                       THEN x || jsonb_build_object('label', replace(x->>'label', '—', '-'))
                       ELSE x END ORDER BY ord)
           FROM jsonb_array_elements(s.payload->'releaseDraft'->'materials') WITH ORDINALITY t(x, ord)))
 WHERE s.step_type = 'release_letter'
   AND s.payload->'releaseDraft'->'materials' IS NOT NULL
   AND EXISTS (SELECT 1 FROM jsonb_array_elements(s.payload->'releaseDraft'->'materials') x
                WHERE x->>'label' LIKE '%—%');
