-- נמשך חי 2026-09-04 מהמסד (pg_get_functiondef).
-- ארגומנטים: p_profile_id uuid, p_doc_id text
CREATE OR REPLACE FUNCTION public.office_document_url(p_profile_id uuid, p_doc_id text)
 RETURNS text
 LANGUAGE sql
 STABLE
AS $function$
  select coalesce(
    -- הספרייה החדשה, לפי מזהה
    (select nullif(trim(coalesce(d->>'url','')), '')
       from public.profiles pr,
            lateral jsonb_array_elements(
              case when jsonb_typeof(pr.settings->'client_documents') = 'array'
                   then pr.settings->'client_documents' else '[]'::jsonb end) d
      where pr.id = p_profile_id and d->>'id' = p_doc_id
      limit 1),
    -- המדריך שנשמר לפני המעבר לספרייה
    (select nullif(trim(coalesce(pr.settings->'expenses_guide'->>'url','')), '')
       from public.profiles pr
      where pr.id = p_profile_id and p_doc_id = 'expenses_guide'))
$function$

