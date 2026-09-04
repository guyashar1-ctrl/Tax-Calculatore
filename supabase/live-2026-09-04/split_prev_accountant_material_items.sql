-- נמשך חי 2026-09-04 מהמסד (pg_get_functiondef).
-- ארגומנטים: p_dry_run boolean
CREATE OR REPLACE FUNCTION public.split_prev_accountant_material_items(p_dry_run boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  OLD_UNIFORM constant text := 'קובץ מבנה אחיד של השנה ושנה קודמת';
  OLD_PNL     constant text := 'כרטסת רווח והפסד של השנה ושנה קודמת באקסל';
  NEW_UNIFORM constant text := 'קובץ מבנה אחיד - השנה';
  NEW_UNIFORM_P constant text := 'קובץ מבנה אחיד - שנה קודמת';
  NEW_PNL     constant text := 'כרטסת רווח והפסד באקסל - השנה';
  NEW_PNL_P   constant text := 'כרטסת רווח והפסד באקסל - שנה קודמת';
  r record; v_item jsonb; v_out jsonb; v_child jsonb; v_changed boolean;
  v_steps int := 0; v_added int := 0; v_drafts int := 0; v_touched jsonb := '[]'::jsonb;
begin
  for r in
    select id, client_id, payload from public.onboarding_steps
     where step_type = 'materials_received' and payload->'checklist' is not null
  loop
    v_out := '[]'::jsonb; v_changed := false;
    for v_item in select x from jsonb_array_elements(r.payload->'checklist') x loop
      v_out := v_out || jsonb_build_array(
        case
          when v_item->>'key' = 'uniform_file' and v_item->>'label' = OLD_UNIFORM
            then v_item || jsonb_build_object('label', NEW_UNIFORM)
          when v_item->>'key' = 'pnl_current' and v_item->>'label' = OLD_PNL
            then v_item || jsonb_build_object('label', NEW_PNL)
          else v_item
        end);
      if v_item->>'key' = 'uniform_file' and v_item->>'label' = OLD_UNIFORM
         and not exists (select 1 from jsonb_array_elements(r.payload->'checklist') y
                          where y->>'key' = 'uniform_file_prev') then
        v_child := (v_item - 'documentId' - 'documentIds' - 'lastUploadAt')
                   || jsonb_build_object('key', 'uniform_file_prev', 'label', NEW_UNIFORM_P);
        v_out := v_out || jsonb_build_array(v_child);
        v_changed := true; v_added := v_added + 1;
      end if;
      if v_item->>'key' = 'pnl_current' and v_item->>'label' = OLD_PNL
         and not exists (select 1 from jsonb_array_elements(r.payload->'checklist') y
                          where y->>'key' = 'pnl_prev') then
        v_child := (v_item - 'documentId' - 'documentIds' - 'lastUploadAt')
                   || jsonb_build_object('key', 'pnl_prev', 'label', NEW_PNL_P);
        v_out := v_out || jsonb_build_array(v_child);
        v_changed := true; v_added := v_added + 1;
      end if;
    end loop;
    if v_changed then
      v_steps := v_steps + 1;
      v_touched := v_touched || jsonb_build_array(
        jsonb_build_object('stepId', r.id, 'clientId', r.client_id, 'kind', 'checklist'));
      if not p_dry_run then
        update public.onboarding_steps
           set payload = payload || jsonb_build_object('checklist', v_out) where id = r.id;
      end if;
    end if;
  end loop;

  for r in
    select id, client_id, payload from public.onboarding_steps
     where step_type = 'release_letter' and payload->'releaseDraft'->'materials' is not null
  loop
    v_out := '[]'::jsonb; v_changed := false;
    for v_item in select x from jsonb_array_elements(r.payload->'releaseDraft'->'materials') x loop
      if v_item->>'key' = 'uniform_file' and v_item->>'label' = OLD_UNIFORM
         and not exists (select 1 from jsonb_array_elements(r.payload->'releaseDraft'->'materials') y
                          where y->>'key' = 'uniform_file_prev') then
        v_out := v_out || jsonb_build_array(v_item || jsonb_build_object('label', NEW_UNIFORM))
                       || jsonb_build_array(v_item || jsonb_build_object(
                            'key', 'uniform_file_prev', 'label', NEW_UNIFORM_P));
        v_changed := true;
      elsif v_item->>'key' = 'pnl_current' and v_item->>'label' = OLD_PNL
         and not exists (select 1 from jsonb_array_elements(r.payload->'releaseDraft'->'materials') y
                          where y->>'key' = 'pnl_prev') then
        v_out := v_out || jsonb_build_array(v_item || jsonb_build_object('label', NEW_PNL))
                       || jsonb_build_array(v_item || jsonb_build_object(
                            'key', 'pnl_prev', 'label', NEW_PNL_P));
        v_changed := true;
      else
        v_out := v_out || jsonb_build_array(v_item);
      end if;
    end loop;
    if v_changed then
      v_drafts := v_drafts + 1;
      v_touched := v_touched || jsonb_build_array(
        jsonb_build_object('stepId', r.id, 'clientId', r.client_id, 'kind', 'draft'));
      if not p_dry_run then
        update public.onboarding_steps
           set payload = jsonb_set(payload, '{releaseDraft,materials}', v_out)
               || jsonb_build_object('requestedMaterials', (
                    select coalesce(jsonb_agg(distinct k), '[]'::jsonb) from (
                      select jsonb_array_elements_text(
                               coalesce(payload->'requestedMaterials','[]'::jsonb)) as k
                      union
                      select y->>'key' from jsonb_array_elements(v_out) y
                       where y->>'key' in ('uniform_file_prev','pnl_prev')
                         and coalesce((y->>'checked')::boolean, false)
                         and exists (select 1 from jsonb_array_elements_text(
                               coalesce(payload->'requestedMaterials','[]'::jsonb)) k2
                              where k2 = case when y->>'key' = 'uniform_file_prev'
                                              then 'uniform_file' else 'pnl_current' end)
                    ) t))
         where id = r.id;
      end if;
    end if;
  end loop;

  return jsonb_build_object('dryRun', p_dry_run, 'checklistStepsChanged', v_steps,
    'itemsAdded', v_added, 'draftsChanged', v_drafts, 'touched', v_touched);
end;
$function$

