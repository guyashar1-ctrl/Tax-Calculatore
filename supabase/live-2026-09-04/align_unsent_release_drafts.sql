-- נמשך חי 2026-09-04 מהמסד (pg_get_functiondef).
-- ארגומנטים: p_dry_run boolean
CREATE OR REPLACE FUNCTION public.align_unsent_release_drafts(p_dry_run boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  NEW_UNIFORM   constant text := 'קובץ מבנה אחיד - השנה';
  NEW_UNIFORM_P constant text := 'קובץ מבנה אחיד - שנה קודמת';
  NEW_PNL       constant text := 'כרטסת רווח והפסד באקסל - השנה';
  NEW_PNL_P     constant text := 'כרטסת רווח והפסד באקסל - שנה קודמת';
  r record; v_item jsonb; v_out jsonb; v_changed boolean;
  v_drafts int := 0; v_added int := 0; v_touched jsonb := '[]'::jsonb;
begin
  for r in
    select id, client_id, payload from public.onboarding_steps
     where step_type = 'release_letter' and payload->>'releaseSentAt' is null
       and payload->'releaseDraft'->'materials' is not null
  loop
    v_out := '[]'::jsonb; v_changed := false;
    for v_item in select x from jsonb_array_elements(r.payload->'releaseDraft'->'materials') x loop
      if v_item->>'key' = 'uniform_file'
         and not exists (select 1 from jsonb_array_elements(r.payload->'releaseDraft'->'materials') y
                          where y->>'key' = 'uniform_file_prev') then
        v_out := v_out || jsonb_build_array(v_item || jsonb_build_object('label', NEW_UNIFORM))
                       || jsonb_build_array(v_item || jsonb_build_object(
                            'key', 'uniform_file_prev', 'label', NEW_UNIFORM_P));
        v_changed := true; v_added := v_added + 1;
      elsif v_item->>'key' = 'pnl_current'
         and not exists (select 1 from jsonb_array_elements(r.payload->'releaseDraft'->'materials') y
                          where y->>'key' = 'pnl_prev') then
        v_out := v_out || jsonb_build_array(v_item || jsonb_build_object('label', NEW_PNL))
                       || jsonb_build_array(v_item || jsonb_build_object(
                            'key', 'pnl_prev', 'label', NEW_PNL_P));
        v_changed := true; v_added := v_added + 1;
      else
        v_out := v_out || jsonb_build_array(v_item);
      end if;
    end loop;
    if v_changed then
      v_drafts := v_drafts + 1;
      v_touched := v_touched || jsonb_build_array(
        jsonb_build_object('stepId', r.id, 'clientId', r.client_id));
      if not p_dry_run then
        update public.onboarding_steps
           set payload = jsonb_set(payload, '{releaseDraft,materials}', v_out) where id = r.id;
      end if;
    end if;
  end loop;
  return jsonb_build_object('dryRun', p_dry_run, 'draftsChanged', v_drafts,
    'itemsAdded', v_added, 'touched', v_touched);
end;
$function$

