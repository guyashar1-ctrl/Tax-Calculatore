-- 121 — הרו"ח הקודם יכול לתקן את הסימון של עצמו
--
-- ‼ הבעיה: release_portal_mark_items יודע רק לסמן. הרו"ח הקודם סימן "שלחתי
-- את זה", גילה שטעה — ואין לו שום דרך לחזור. הכרטיס שממנו סימן מופיע רק
-- מיד אחרי העלאה, ורשימת "מה ביקשנו" בדף היא טקסט בלבד.
--
-- ‼ הגבול: הוא מתקן **רק את ההצהרה שלו** (declaredByRecipient). פריט שהמשרד
-- סימן כהתקבל הוא קביעה של המשרד — הרו"ח הקודם אינו יכול לבטל אותה מהדף,
-- אחרת גורם חיצוני היה משנה את המעקב הפנימי שלנו.

CREATE OR REPLACE FUNCTION public.release_portal_set_item(
  p_token text, p_key text, p_done boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 VOLATILE SECURITY DEFINER
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

  -- הפריט הפתוח ("חומר נוסף לפי שיקול דעתך") אינו דרישה ואינו נסגר.
  if coalesce((v_item->>'optional')::boolean, (v_item->>'key') = 'additional_material') then
    return jsonb_build_object('ok', false, 'error', 'not_markable');
  end if;

  if p_done then
    if coalesce((v_item->>'done')::boolean, false) then
      return jsonb_build_object('ok', true, 'noop', true);
    end if;
  else
    -- ‼ כאן נאכף הגבול: ביטול מותר רק למה שהוא עצמו הצהיר.
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

  -- ‼ אותה סמנטיקה בדיוק של release_portal_mark_items, כדי ששני המסלולים
  -- לא ייצרו שני מצבים שונים לאותו נתון.
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
$function$;

GRANT EXECUTE ON FUNCTION public.release_portal_set_item(text, text, boolean) TO anon, authenticated;

-- ‼ הדף חייב לדעת מה הוא עצמו הצהיר, אחרת אי אפשר להבדיל בין סימון שלו
-- (ניתן לביטול) לסימון של המשרד (קריאה בלבד). שדה אחד בלבד נוסף להחזרה.
CREATE OR REPLACE FUNCTION public.get_release_portal(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  s        public.onboarding_steps%rowtype;
  m        public.onboarding_steps%rowtype;
  c        public.clients%rowtype;
  p        public.profiles%rowtype;
  v_items  jsonb := '[]'::jsonb;
  v_done   int := 0;
  v_total  int := 0;
  v_bulk   int := 0;
  v_ups    jsonb := '[]'::jsonb;
  v_out    jsonb := '[]'::jsonb;
  v_due    date;
begin
  select * into s from public.onboarding_steps
   where step_type = 'release_letter' and payload->>'releaseToken' = p_token limit 1;
  if s.id is null then return jsonb_build_object('ok', false, 'error', 'invalid'); end if;

  select * into c from public.clients where id = s.client_id;
  select * into p from public.profiles where id = s.user_id;
  select * into m from public.onboarding_steps
    where client_id = s.client_id and step_type = 'materials_received' and status <> 'cancelled' limit 1;

  if m.id is not null then
    select coalesce(jsonb_agg(jsonb_build_object(
             'key', x->>'key', 'label', x->>'label',
             'done', coalesce((x->>'done')::boolean, false),
             'optional', coalesce((x->>'optional')::boolean, (x->>'key') = 'additional_material'),
             'priority', coalesce((x->>'priority')::boolean, false),
             'declaredByRecipient', coalesce((x->>'declaredByRecipient')::boolean, false),
             'uploads', coalesce(jsonb_array_length(x->'documentIds'),
                                 case when x ? 'documentId' then 1 else 0 end))
             order by coalesce((x->>'priority')::boolean, false) desc, ord), '[]'::jsonb)
      into v_items
      from jsonb_array_elements(coalesce(m.payload->'checklist','[]'::jsonb)) with ordinality t(x, ord);
    select count(*) filter (where (x->>'done')::boolean), count(*)
      into v_done, v_total
      from jsonb_array_elements(v_items) x
     where not coalesce((x->>'optional')::boolean, false);
    v_bulk := coalesce(jsonb_array_length(m.payload->'bulkUploads'), 0);

    select coalesce(jsonb_agg(jsonb_build_object(
             'id', x->>'documentId',
             'name', coalesce(nullif(x->>'fileName',''), 'קובץ'),
             'at', x->>'at') order by ord), '[]'::jsonb)
      into v_ups
      from jsonb_array_elements(coalesce(m.payload->'bulkUploads','[]'::jsonb)) with ordinality t(x, ord);
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'key', x->>'key', 'label', x->>'label') order by ord), '[]'::jsonb)
    into v_out
    from jsonb_array_elements(coalesce(s.payload->'outstandingItems','[]'::jsonb)) with ordinality t(x, ord);

  v_due := nullif(s.payload->>'objectionDueDate','')::date;

  return jsonb_build_object(
    'ok', true,
    'firmName', coalesce(p.firm_name, 'המשרד'),
    'branding', coalesce(p.branding, '{}'::jsonb),
    'clientName', trim(coalesce(c.first_name,'') || ' ' || coalesce(c.last_name,'')),
    'businessName', nullif(trim(coalesce(c.business_name,'')), ''),
    'prevAccountantName', nullif(trim(coalesce(c.prev_accountant_name,'')), ''),
    'subject', nullif(s.payload->>'releaseSubject',''),
    'body', nullif(s.payload->>'releaseBody',''),
    'sentAt', s.payload->>'releaseSentAt',
    'objectionDueDate', s.payload->>'objectionDueDate',
    'objectionWindowPassed', (v_due is not null and v_due < current_date
                              and nullif(s.payload->>'prevAccountantResponseNote','') is null),
    'signed', (s.payload->>'prevAccountantSignedAt') is not null,
    'signedAt', s.payload->>'prevAccountantSignedAt',
    'signerName', s.payload->>'prevAccountantSignerName',
    'responseNote', nullif(s.payload->>'prevAccountantResponseNote',''),
    'respondedAt', s.payload->>'prevAccountantRespondedAt',
    'responderName', nullif(s.payload->>'prevAccountantResponderName',''),
    'materialsStepId', m.id,
    'materials', v_items,
    'materialsDone', v_done,
    'materialsTotal', v_total,
    'bulkUploads', v_bulk,
    'uploads', v_ups,
    'outstanding', v_out);
end;
$function$;
