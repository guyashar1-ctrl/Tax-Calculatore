-- נמשך חי 2026-09-04 מהמסד (pg_get_functiondef).
-- ארגומנטים: p_token text, p_key text, p_done boolean
CREATE OR REPLACE FUNCTION public.release_portal_set_item(p_token text, p_key text, p_done boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  s         public.onboarding_steps%rowtype;
  m         public.onboarding_steps%rowtype;
  v_item    jsonb;
  v_list    jsonb;
  v_remain  int;
  v_label   text;
  v_client  text;
begin
  select * into s from public.onboarding_steps
   where step_type = 'release_letter' and payload->>'releaseToken' = p_token limit 1;
  if s.id is null then return jsonb_build_object('ok', false, 'error', 'invalid'); end if;

  select * into m from public.onboarding_steps
    where client_id = s.client_id and step_type = 'materials_received'
      and status <> 'cancelled' limit 1;
  if m.id is null then return jsonb_build_object('ok', false, 'error', 'no_materials_step'); end if;

  select x into v_item
    from jsonb_array_elements(coalesce(m.payload->'checklist','[]'::jsonb)) x
   where x->>'key' = p_key limit 1;
  if v_item is null then return jsonb_build_object('ok', false, 'error', 'item_not_found'); end if;

  if coalesce((v_item->>'optional')::boolean, (v_item->>'key') = 'additional_material') then
    return jsonb_build_object('ok', false, 'error', 'not_markable');
  end if;

  if p_done then
    if coalesce((v_item->>'done')::boolean, false) then
      return jsonb_build_object('ok', true, 'noop', true);
    end if;
  else
    if not coalesce((v_item->>'declaredByRecipient')::boolean, false) then
      return jsonb_build_object('ok', false, 'error', 'not_yours');
    end if;
  end if;

  select jsonb_agg(
           case when (x->>'key') = p_key then
             case when p_done
               then x || jsonb_build_object('done', true, 'doneAt', to_jsonb(now()),
                                            'declaredByRecipient', true)
               else (x - 'doneAt' - 'declaredByRecipient') || jsonb_build_object('done', false)
             end
           else x end order by ord)
    into v_list
    from jsonb_array_elements(coalesce(m.payload->'checklist','[]'::jsonb)) with ordinality t(x, ord);

  select count(*) into v_remain
    from jsonb_array_elements(coalesce(v_list,'[]'::jsonb)) x
   where not coalesce((x->>'done')::boolean, false)
     and not coalesce((x->>'optional')::boolean, (x->>'key') = 'additional_material');

  update public.onboarding_steps
     set payload = payload || jsonb_build_object('checklist', coalesce(v_list, '[]'::jsonb)),
         status  = case when v_remain = 0 then 'completed' else 'in_progress' end,
         ball    = case when v_remain = 0 then 'me' else ball end,
         completion_method = case when v_remain = 0 then 'system' else completion_method end,
         completed_at = case when v_remain = 0 then now() else null end
   where id = m.id;

  v_label := coalesce(v_item->>'label', p_key);

  perform public.log_onboarding_event(m.user_id, m.id, m.engagement_id,
    'note', 'system',
    case when p_done
      then 'הרו״ח הקודם ציין שנשלח: ' || v_label
      else 'הרו״ח הקודם ביטל סימון: ' || v_label end,
    jsonb_build_object('actor', 'prev_accountant', 'key', p_key,
                       'done', p_done, 'remaining', v_remain));

  if v_remain = 0 then perform public.unlock_dependent_steps(m.id); end if;

  select nullif(trim(coalesce(first_name,'') || ' ' || coalesce(last_name,'')), '')
    into v_client from public.clients where id = m.client_id;

  perform public.queue_accountant_notification(
    m.user_id, 'prev_accountant_document_uploaded', m.client_id, m.id, null, null,
    jsonb_build_object('clientName', v_client,
                       'requestTitle', case when p_done then 'הרו״ח הקודם ציין מה נשלח'
                                                        else 'הרו״ח הקודם ביטל סימון' end,
                       'lastItem', v_label));

  return jsonb_build_object('ok', true, 'done', p_done, 'remaining', v_remain);
end;
$function$

