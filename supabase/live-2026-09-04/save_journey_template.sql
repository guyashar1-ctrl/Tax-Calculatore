-- נמשך חי 2026-09-04 מהמסד (pg_get_functiondef).
-- ארגומנטים: p_client_id text, p_name text, p_description text
CREATE OR REPLACE FUNCTION public.save_journey_template(p_client_id text, p_name text, p_description text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  c       public.clients%rowtype;
  v_uid   uuid := auth.uid();
  v_items jsonb;
  v_id    text;
begin
  select * into c from public.clients where id = p_client_id;
  if c.id is null then return jsonb_build_object('ok', false, 'error', 'client_not_found'); end if;
  if v_uid is null or c.user_id <> v_uid then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;
  if nullif(trim(coalesce(p_name,'')), '') is null then
    return jsonb_build_object('ok', false, 'error', 'missing_name');
  end if;

  with src as (
    select s.*,
           'e' || row_number() over (order by s.sort_order, s.created_at) as tkey
      from public.onboarding_steps s
     where s.client_id = c.id
       and s.status <> 'cancelled'
       and s.step_type not in ('representation', 'representation_upgrade', 'internal_setup', 'first_month_review')
  )
  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
           'key', src.tkey,
           'stepType', src.step_type,
           'owner', case
                      when src.payload ? 'externalParty' then 'external'
                      when src.ball = 'client' then 'client'
                      else 'me' end,
           'stageTitle', js.title,
           'stageOrder', js.sort_order,
           'requiredForClose', coalesce(src.required_for_close,
             src.step_type not in ('representation_upgrade', 'first_month_review')),
           'dueInDays', case when src.due_date is not null and src.created_at is not null
                             then greatest(0, (src.due_date - src.created_at::date)) end,
           'dependsOn', (
             select coalesce(jsonb_agg(distinct p.tkey), null)
               from (
                 select d.depends_on_step_id as pid
                   from public.onboarding_step_dependencies d where d.step_id = src.id
                 union
                 select src.depends_on_step_id where src.depends_on_step_id is not null
               ) parents
               join src p on p.id = parents.pid),
           'payload', (src.payload - 'published' - 'releaseToken' - 'releaseBody' - 'releaseSubject'
                                 - 'releaseSentAt' - 'objectionDueDate' - 'submitted' - 'submittedByClient'
                                 - 'prevAccountantSignature' - 'prevAccountantSignedAt' - 'prevAccountantSignerName'
                                 - 'authUrl' - 'providerRef'
                                 - 'autoExecutedAt' - 'autoError' - 'templateOrigin')
             || case when src.payload ? 'checklist' then jsonb_build_object('checklist',
                  (select coalesce(jsonb_agg(jsonb_build_object('key',x->>'key','label',x->>'label','done',false) order by ord), '[]'::jsonb)
                     from jsonb_array_elements(src.payload->'checklist') with ordinality t(x,ord)))
                else '{}'::jsonb end
             || case when src.payload ? 'requirements' then jsonb_build_object('requirements',
                  (select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
                            'key', x->>'key', 'kind', x->>'kind', 'label', x->>'label',
                            'required', coalesce((x->>'required')::boolean, true),
                            'options', x->'options',
                            'maxFiles', x->'maxFiles',
                            'done', false)) order by ord), '[]'::jsonb)
                     from jsonb_array_elements(src.payload->'requirements') with ordinality t(x,ord)))
                else '{}'::jsonb end))
         order by src.sort_order, src.created_at), '[]'::jsonb)
    into v_items
    from src
    left join public.journey_stages js on js.id = src.stage_id;

  if jsonb_array_length(v_items) = 0 then
    return jsonb_build_object('ok', false, 'error', 'nothing_to_save');
  end if;

  insert into public.journey_templates (user_id, name, description, entries)
  values (v_uid, trim(p_name), nullif(trim(coalesce(p_description,'')), ''), v_items)
  returning id into v_id;

  return jsonb_build_object('ok', true, 'templateId', v_id, 'count', jsonb_array_length(v_items));
end;
$function$

