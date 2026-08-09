-- נמשך חי 2026-08-07 מהמסד (pg_get_functiondef).
-- ארגומנטים: p_client_id text, p_reminder_days integer
CREATE OR REPLACE FUNCTION public.sync_representation_upgrade_step(p_client_id text, p_reminder_days integer DEFAULT 90)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  c            public.clients%rowtype;
  v_secondary  text[];
  v_step       public.onboarding_steps%rowtype;
  v_eng        text;
begin
  select * into c from public.clients where id = p_client_id;
  if c.id is null then return jsonb_build_object('ok', false, 'error', 'client_not_found'); end if;

  -- אילו רשויות רשומות כמשני. ביטוח לאומי אינו נושא רמת ייצוג ולכן אינו נספר.
  select coalesce(array_agg(k), '{}'::text[]) into v_secondary
    from jsonb_each(coalesce(c.authority_representations, '{}'::jsonb)) as t(k, v)
    where v->>'level' = 'secondary' and coalesce(v->>'status','') <> 'none';

  select * into v_step from public.onboarding_steps
    where client_id = p_client_id and step_type = 'representation_upgrade'
      and status not in ('cancelled') limit 1;

  if array_length(v_secondary, 1) is null then
    -- אין יותר ייצוג משני ⇒ השדרוג הושלם בפועל. סוגרים ולא משאירים שלב פתוח.
    if v_step.id is not null and v_step.status not in ('completed','verified') then
      update public.onboarding_steps
        set status = 'completed', completion_method = 'auto', completed_at = now(), needs_attention = false
        where id = v_step.id;
      perform public.log_onboarding_event(v_step.user_id, v_step.id, v_step.engagement_id,
        'status_changed', 'system', 'כל הרשויות עברו לייצוג ראשי — השלב נסגר מעצמו');
    end if;
    return jsonb_build_object('ok', true, 'secondary', 0, 'action', 'closed_or_none');
  end if;

  if v_step.id is null then
    select id into v_eng from public.engagements
      where client_id = p_client_id order by created_at desc limit 1;
    insert into public.onboarding_steps (
      user_id, engagement_id, client_id, step_type, track, scope, status, ball, due_date, payload)
    values (
      c.user_id, v_eng, p_client_id, 'representation_upgrade', 'authorities', 'person', 'pending', 'me',
      (current_date + make_interval(days => p_reminder_days))::date,
      jsonb_build_object('secondaryAuthorities', to_jsonb(v_secondary)))
    returning * into v_step;
    perform public.log_onboarding_event(c.user_id, v_step.id, v_eng, 'created', 'system',
      'נפתח שלב שדרוג לייצוג ראשי — הייצוג נלקח כמשני',
      jsonb_build_object('authorities', to_jsonb(v_secondary)));
    return jsonb_build_object('ok', true, 'secondary', array_length(v_secondary, 1), 'action', 'created',
                              'stepId', v_step.id, 'dueDate', v_step.due_date);
  end if;

  -- קיים: מרעננים רק את רשימת הרשויות. תאריך התזכורת שהרו"ח קבע לא נדרס.
  update public.onboarding_steps
    set payload = payload || jsonb_build_object('secondaryAuthorities', to_jsonb(v_secondary))
    where id = v_step.id;
  return jsonb_build_object('ok', true, 'secondary', array_length(v_secondary, 1), 'action', 'refreshed',
                            'stepId', v_step.id, 'dueDate', v_step.due_date);
end;
$function$

