-- נמשך חי 2026-09-04 מהמסד (pg_get_functiondef).
-- ארגומנטים: p_change_id text, p_note text
CREATE OR REPLACE FUNCTION public.reject_tax_fact_change(p_change_id text, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  r public.tax_fact_changes%rowtype;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'unauthenticated'); end if;

  update public.tax_fact_changes
     set status = 'rejected', decided_by = v_uid, decided_at = now(),
         note = coalesce(p_note, note)
   where id = p_change_id and user_id = v_uid and status = 'pending'
   returning * into r;

  if r.id is null then
    return jsonb_build_object('ok', false, 'error', 'not_pending_or_not_found');
  end if;

  return jsonb_build_object('ok', true, 'change', to_jsonb(r));
end;
$function$

