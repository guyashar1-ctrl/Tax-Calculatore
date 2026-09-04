-- נמשך חי 2026-09-04 מהמסד (pg_get_functiondef).
-- ארגומנטים: p_token text, p_keys jsonb
CREATE OR REPLACE FUNCTION public.release_portal_mark_items(p_token text, p_keys jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  s          public.onboarding_steps%rowtype;
  m          public.onboarding_steps%rowtype;
  v_keys     text[];
  v_list     jsonb;
  v_marked   int := 0;
  v_remain   int;
  v_labels   text;
  v_client   text;
begin
  select * into s from public.onboarding_steps
   where step_type = 'release_letter' and payload->>'releaseToken' = p_token limit 1;
  if s.id is null then return jsonb_build_object('ok', false, 'error', 'invalid'); end if;

  select * into m from public.onboarding_steps
    where client_id = s.client_id and step_type = 'materials_received' and status <> 'cancelled' limit 1;
  if m.id is null then return jsonb_build_object('ok', false, 'error', 'no_materials_step'); end if;

  select coalesce(array_agg(k), '{}') into v_keys
    from jsonb_array_elements_text(coalesce(p_keys, '[]'::jsonb)) k;
  if array_length(v_keys, 1) is null then
    return jsonb_build_object('ok', true, 'marked', 0);
  end if;

  select jsonb_agg(
           case
             when (x->>'key') = any(v_keys)
              and not coalesce((x->>'done')::boolean, false)
              and not coalesce((x->>'optional')::boolean, (x->>'key') = 'additional_material')
             then x || jsonb_build_object(
                    'done', true, 'doneAt', to_jsonb(now()), 'declaredByRecipient', true)
             else x
           end order by ord)
    into v_list
    from jsonb_array_elements(coalesce(m.payload->'checklist','[]'::jsonb)) with ordinality t(x, ord);

  select count(*) into v_marked
    from jsonb_array_elements(coalesce(v_list,'[]'::jsonb)) x
   where coalesce((x->>'declaredByRecipient')::boolean, false)
     and (x->>'key') = any(v_keys);

  select count(*) into v_remain
    from jsonb_array_elements(coalesce(v_list,'[]'::jsonb)) x
   where not coalesce((x->>'done')::boolean, false)
     and not coalesce((x->>'optional')::boolean, (x->>'key') = 'additional_material');

  select string_agg(x->>'label', ' · ') into v_labels
    from jsonb_array_elements(coalesce(v_list,'[]'::jsonb)) x
   where (x->>'key') = any(v_keys);

  update public.onboarding_steps
     set payload = payload || jsonb_build_object('checklist', coalesce(v_list, '[]'::jsonb)),
         status  = case when v_remain = 0 then 'completed' else 'in_progress' end,
         ball    = case when v_remain = 0 then 'me' else ball end,
         completion_method = case when v_remain = 0 then 'system' else completion_method end,
         completed_at = case when v_remain = 0 then now() else completed_at end
   where id = m.id;

  perform public.log_onboarding_event(m.user_id, m.id, m.engagement_id,
    case when v_remain = 0 then 'status_changed' else 'note' end, 'system',
    'הרו״ח הקודם ציין מה כלל המשלוח: ' || coalesce(v_labels, ''),
    jsonb_build_object('actor', 'prev_accountant', 'keys', to_jsonb(v_keys), 'remaining', v_remain));

  if v_remain = 0 then perform public.unlock_dependent_steps(m.id); end if;

  select nullif(trim(coalesce(first_name,'') || ' ' || coalesce(last_name,'')), '')
    into v_client from public.clients where id = m.client_id;

  perform public.queue_accountant_notification(
    m.user_id, 'prev_accountant_document_uploaded', m.client_id, m.id, null, null,
    jsonb_build_object('clientName', v_client,
                       'requestTitle', 'הרו״ח הקודם ציין מה נשלח',
                       'lastItem', coalesce(v_labels, '')));

  return jsonb_build_object('ok', true, 'marked', v_marked, 'remaining', v_remain);
end;
$function$

