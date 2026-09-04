-- נמשך חי 2026-09-04 מהמסד (pg_get_functiondef).
-- ארגומנטים: p_document_id text
CREATE OR REPLACE FUNCTION public.sync_prev_accountant_removed_label(p_document_id text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  d public.documents%rowtype; v_removed boolean; v_src text; v_rm text; v_target text;
begin
  select * into d from public.documents where id = p_document_id;
  if d.id is null then return; end if;
  select exists (
    select 1 from public.onboarding_steps s,
         lateral jsonb_array_elements(coalesce(s.payload->'removedUploads','[]'::jsonb)) x
     where s.step_type = 'materials_received' and s.client_id = d.client_id
       and x->>'documentId' = p_document_id) into v_removed;
  v_src := public.ensure_prev_accountant_label(d.user_id);
  v_rm  := public.ensure_prev_accountant_removed_label(d.user_id);
  v_target := case when v_removed then v_rm else v_src end;
  update public.documents set label_id = v_target
   where id = p_document_id
     and (label_id is null or label_id in (v_src, v_rm))
     and label_id is distinct from v_target;
end;
$function$

