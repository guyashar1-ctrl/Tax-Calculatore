-- נמשך חי 2026-09-04 מהמסד (pg_get_functiondef).
-- ארגומנטים: p_label_id text
CREATE OR REPLACE FUNCTION public.delete_document_label(p_label_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_label public.document_labels%rowtype;
  v_fallback_id text;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'unauthenticated'); end if;
  select * into v_label from public.document_labels where id = p_label_id;
  if v_label.id is null then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if v_label.user_id <> v_uid then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;
  if v_label.is_reserved then return jsonb_build_object('ok', false, 'error', 'reserved_label'); end if;

  select id into v_fallback_id from public.document_labels
   where user_id = v_uid and is_reserved = true limit 1;
  if v_fallback_id is null then
    insert into public.document_labels (user_id, name, sort_order, is_reserved)
    values (v_uid, 'לבדיקה', 999, true)
    returning id into v_fallback_id;
  end if;

  update public.documents set label_id = v_fallback_id where label_id = p_label_id and user_id = v_uid;
  update public.document_folders set label_id = v_fallback_id where label_id = p_label_id and user_id = v_uid;
  delete from public.document_labels where id = p_label_id and user_id = v_uid;

  return jsonb_build_object('ok', true, 'reassignedTo', v_fallback_id);
end;
$function$

