-- נמשך חי 2026-09-04 מהמסד (pg_get_functiondef).
-- ארגומנטים: p_dry_run boolean
CREATE OR REPLACE FUNCTION public.normalize_unsent_draft_catalog(p_dry_run boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  CATALOG constant jsonb := jsonb_build_array(
    jsonb_build_object('key','uniform_file',       'label','קובץ מבנה אחיד - השנה'),
    jsonb_build_object('key','uniform_file_prev',  'label','קובץ מבנה אחיד - שנה קודמת'),
    jsonb_build_object('key','pnl_current',        'label','כרטסת רווח והפסד באקסל - השנה'),
    jsonb_build_object('key','pnl_prev',           'label','כרטסת רווח והפסד באקסל - שנה קודמת'),
    jsonb_build_object('key','ledgers',            'label','כרטסות הנהלת חשבונות'),
    jsonb_build_object('key','depreciation',       'label','טופס פחת'),
    jsonb_build_object('key','last_return',        'label','דוח שנתי אחרון'),
    jsonb_build_object('key','capital_declaration','label','הצהרת הון אחרונה'),
    jsonb_build_object('key','trial_balance',      'label','מאזן בוחן'));
  r record; v_item jsonb; v_cat jsonb; v_out jsonb; v_changed boolean; v_hasLed boolean;
  v_drafts int := 0; v_renamed int := 0; v_added int := 0; v_touched jsonb := '[]'::jsonb;
begin
  for r in
    select id, client_id, payload from public.onboarding_steps
     where step_type = 'release_letter' and payload->>'releaseSentAt' is null
       and payload->'releaseDraft'->'materials' is not null
  loop
    v_out := '[]'::jsonb; v_changed := false;
    v_hasLed := exists (select 1 from jsonb_array_elements(r.payload->'releaseDraft'->'materials') y
                         where y->>'key' = 'ledgers');
    for v_item in select x from jsonb_array_elements(r.payload->'releaseDraft'->'materials') x loop
      if v_item->>'key' = 'excel_ledger' then
        if v_hasLed then
          v_out := (select coalesce(jsonb_agg(
                      case when y->>'key' = 'ledgers'
                        then y || jsonb_build_object(
                               'checked', coalesce((y->>'checked')::boolean,false)
                                          or coalesce((v_item->>'checked')::boolean,false),
                               'priority', coalesce((y->>'priority')::boolean,false)
                                          or coalesce((v_item->>'priority')::boolean,false))
                        else y end order by ord), '[]'::jsonb)
                    from jsonb_array_elements(v_out) with ordinality t(y, ord));
        else
          v_out := v_out || jsonb_build_array(
            v_item || jsonb_build_object('key','ledgers','label','כרטסות הנהלת חשבונות'));
        end if;
        v_changed := true; v_renamed := v_renamed + 1;
      else
        v_out := v_out || jsonb_build_array(v_item);
      end if;
    end loop;
    for v_cat in select x from jsonb_array_elements(CATALOG) x loop
      if not exists (select 1 from jsonb_array_elements(v_out) y where y->>'key' = v_cat->>'key') then
        v_out := v_out || jsonb_build_array(v_cat || jsonb_build_object('checked', false));
        v_changed := true; v_added := v_added + 1;
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
    'orphansNormalized', v_renamed, 'catalogItemsAdded', v_added, 'touched', v_touched);
end;
$function$

