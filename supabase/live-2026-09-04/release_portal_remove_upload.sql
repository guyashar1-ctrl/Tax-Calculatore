-- נמשך חי 2026-09-04 מהמסד (pg_get_functiondef).
-- ארגומנטים: p_token text, p_document_id text
CREATE OR REPLACE FUNCTION public.release_portal_remove_upload(p_token text, p_document_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  s public.onboarding_steps%rowtype; m public.onboarding_steps%rowtype;
  v_entry jsonb; v_keep jsonb := '[]'::jsonb; v_gone jsonb := '[]'::jsonb;
begin
  select * into s from public.onboarding_steps
   where step_type = 'release_letter' and payload->>'releaseToken' = p_token limit 1;
  if s.id is null then return jsonb_build_object('ok', false, 'error', 'invalid'); end if;
  select * into m from public.onboarding_steps
    where client_id = s.client_id and step_type = 'materials_received'
      and status <> 'cancelled' limit 1;
  if m.id is null then return jsonb_build_object('ok', false, 'error', 'no_step'); end if;
  select x into v_entry
    from jsonb_array_elements(coalesce(m.payload->'bulkUploads','[]'::jsonb)) x
   where x->>'documentId' = p_document_id limit 1;
  if v_entry is null then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  select coalesce(jsonb_agg(x order by ord), '[]'::jsonb) into v_keep
    from jsonb_array_elements(coalesce(m.payload->'bulkUploads','[]'::jsonb)) with ordinality t(x, ord)
   where x->>'documentId' <> p_document_id;
  v_gone := coalesce(m.payload->'removedUploads','[]'::jsonb)
            || jsonb_build_array(v_entry || jsonb_build_object(
                 'removedAt', to_char(now() at time zone 'utc','YYYY-MM-DD"T"HH24:MI:SS"Z"'),
                 'removedBy', 'prev_accountant'));
  update public.onboarding_steps
     set payload = m.payload || jsonb_build_object('bulkUploads', v_keep)
                             || jsonb_build_object('removedUploads', v_gone)
   where id = m.id;
  perform public.sync_prev_accountant_removed_label(p_document_id);
  return jsonb_build_object('ok', true, 'remaining', jsonb_array_length(v_keep));
end;
$function$

