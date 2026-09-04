-- נמשך חי 2026-09-04 מהמסד (pg_get_functiondef).
-- ארגומנטים: (ללא)
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
$function$

