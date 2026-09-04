-- נמשך חי 2026-09-04 מהמסד (pg_get_functiondef).
-- ארגומנטים: p_client_id text, p_template_id text
CREATE OR REPLACE FUNCTION public.apply_journey_template(p_client_id text, p_template_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  c        public.clients%rowtype;
  t        public.journey_templates%rowtype;
  v_uid    uuid := auth.uid();
  e        jsonb;
  v_res    jsonb;
  v_added  int := 0;
  v_skip   int := 0;
  v_dup    boolean;
  v_title  text;
  v_key    text;
  v_map    jsonb := '{}'::jsonb;
  v_stages jsonb := '{}'::jsonb;
  v_stage  text;
  v_dep_ids text[];
  v_owner  text;
  v_due    date;
  v_new    text;
  v_payload jsonb;
begin
  select * into c from public.clients where id = p_client_id;
  if c.id is null then return jsonb_build_object('ok', false, 'error', 'client_not_found'); end if;
  if v_uid is null or c.user_id <> v_uid then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;

  select * into t from public.journey_templates where id = p_template_id and user_id = v_uid;
  if t.id is null then return jsonb_build_object('ok', false, 'error', 'template_not_found'); end if;

  for e in select * from jsonb_array_elements(t.entries) loop
    v_key := nullif(trim(coalesce(e->>'key','')), '');

    if (e->>'stepType') = 'custom_request' then
      v_title := coalesce(nullif(trim(e->'payload'->>'title'), ''),
                          nullif(trim(e->'payload'->>'clientTitle'), ''));
      if v_key is not null then
        select exists (
          select 1 from public.onboarding_steps s
           where s.client_id = c.id and s.step_type = 'custom_request'
             and s.status <> 'cancelled'
             and s.payload->'templateOrigin'->>'templateId' = t.id
             and s.payload->'templateOrigin'->>'key' = v_key)
          into v_dup;
        if not v_dup then
          select exists (
            select 1 from public.onboarding_steps s
             where s.client_id = c.id and s.step_type = 'custom_request'
               and s.status <> 'cancelled'
               and coalesce(s.payload->'templateOrigin'->>'templateId', '') <> t.id
               and coalesce(nullif(trim(s.payload->>'title'), ''),
                            nullif(trim(s.payload->>'clientTitle'), '')) is not distinct from v_title)
            into v_dup;
        end if;
      else
        select exists (select 1 from public.onboarding_steps s
                       where s.client_id = c.id and s.step_type = 'custom_request'
                         and s.status <> 'cancelled'
                         and coalesce(nullif(trim(s.payload->>'title'), ''),
                                      nullif(trim(s.payload->>'clientTitle'), '')) is not distinct from v_title)
          into v_dup;
      end if;
    else
      select exists (select 1 from public.onboarding_steps s
                     where s.client_id = c.id and s.step_type = e->>'stepType'
                       and s.status <> 'cancelled')
        into v_dup;
    end if;

    if v_dup then v_skip := v_skip + 1; continue; end if;

    v_stage := null;
    if nullif(trim(coalesce(e->>'stageTitle','')), '') is not null then
      if v_stages ? (e->>'stageTitle') then
        v_stage := v_stages->>(e->>'stageTitle');
      else
        select id into v_stage from public.journey_stages
         where client_id = c.id and title = e->>'stageTitle' limit 1;
        if v_stage is null then
          insert into public.journey_stages (user_id, client_id, title, sort_order)
          values (c.user_id, c.id, e->>'stageTitle',
                  coalesce((e->>'stageOrder')::int,
                           (select coalesce(max(sort_order), 0) + 10 from public.journey_stages where client_id = c.id)))
          returning id into v_stage;
        end if;
        v_stages := v_stages || jsonb_build_object(e->>'stageTitle', v_stage);
      end if;
    end if;

    v_owner := nullif(e->>'owner', '');
    v_due := case when (e->>'dueInDays') is not null
                  then (current_date + ((e->>'dueInDays')::int)) end;

    v_dep_ids := '{}';
    if jsonb_typeof(e->'dependsOn') = 'array' then
      select coalesce(array_agg(v_map->>k), '{}')
        into v_dep_ids
        from jsonb_array_elements_text(e->'dependsOn') k
       where v_map ? k;
    end if;

    v_payload := coalesce(e->'payload','{}'::jsonb);
    if v_key is not null and (e->>'stepType') = 'custom_request' then
      v_payload := v_payload || jsonb_build_object('templateOrigin',
        jsonb_build_object('templateId', t.id, 'key', v_key));
    end if;

    v_res := public.create_onboarding_request(
               c.id, e->>'stepType', v_payload,
               p_due_date => v_due,
               p_depends_on => case when array_length(v_dep_ids,1) >= 1 then v_dep_ids[1] end,
               p_published => false,
               p_required_for_close => coalesce((e->>'requiredForClose')::boolean, true),
               p_owner => v_owner,
               p_stage_id => v_stage);

    if coalesce((v_res->>'ok')::boolean, false) then
      v_added := v_added + 1;
      v_new := v_res->>'stepId';
      if v_key is not null then
        v_map := v_map || jsonb_build_object(v_key, v_new);
      end if;
      if array_length(v_dep_ids, 1) > 1 then
        perform public.set_onboarding_step_dependencies(v_new, v_dep_ids);
      end if;
    else
      v_skip := v_skip + 1;
    end if;
  end loop;

  return jsonb_build_object('ok', true, 'added', v_added, 'skipped', v_skip, 'template', t.name);
end;
$function$

