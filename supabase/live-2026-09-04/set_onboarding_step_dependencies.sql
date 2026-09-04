-- נמשך חי 2026-09-04 מהמסד (pg_get_functiondef).
-- ארגומנטים: p_step_id text, p_depends_on text[]
CREATE OR REPLACE FUNCTION public.set_onboarding_step_dependencies(p_step_id text, p_depends_on text[] DEFAULT '{}'::text[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  s      public.onboarding_steps%rowtype;
  v_uid  uuid := auth.uid();
  v_deps text[] := coalesce(p_depends_on, '{}');
  v_bad  int;
  v_met  boolean;
begin
  select * into s from public.onboarding_steps where id = p_step_id;
  if s.id is null then return jsonb_build_object('ok', false, 'error', 'step_not_found'); end if;
  if v_uid is null or s.user_id <> v_uid then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;
  if s.status in ('completed','verified','cancelled') then
    return jsonb_build_object('ok', false, 'error', 'step_terminal');
  end if;

  select coalesce(array_agg(distinct d), '{}') into v_deps
    from unnest(v_deps) d where d is not null and d <> s.id;

  select count(*) into v_bad
    from unnest(v_deps) d
    left join public.onboarding_steps ds on ds.id = d and ds.client_id = s.client_id
   where ds.id is null;
  if v_bad > 0 then return jsonb_build_object('ok', false, 'error', 'dependency_not_found'); end if;

  if exists (
    with recursive desc_steps(id) as (
      select d.step_id from public.onboarding_step_dependencies d
       where d.depends_on_step_id = s.id
      union
      select d2.step_id from public.onboarding_step_dependencies d2
        join desc_steps ds on ds.id = d2.depends_on_step_id
    )
    select 1 from desc_steps where id = any(v_deps)
  ) then
    return jsonb_build_object('ok', false, 'error', 'dependency_cycle');
  end if;

  delete from public.onboarding_step_dependencies where step_id = s.id;

  update public.onboarding_steps
     set depends_on_step_id = case when array_length(v_deps, 1) >= 1 then v_deps[1] else null end
   where id = s.id;

  if array_length(v_deps, 1) >= 1 then
    insert into public.onboarding_step_dependencies (step_id, depends_on_step_id, user_id)
    select s.id, d, s.user_id from unnest(v_deps) d
    on conflict do nothing;
  end if;

  v_met := public.onboarding_dependency_met(s.id);
  if s.status = 'locked' and v_met then
    update public.onboarding_steps set status = 'pending' where id = s.id;
    perform public.log_onboarding_event(s.user_id, s.id, s.engagement_id, 'status_changed', 'system',
      'השלב נפתח - התלויות עודכנו', jsonb_build_object('from','locked','to','pending'));
  elsif s.status = 'pending' and not v_met then
    update public.onboarding_steps set status = 'locked' where id = s.id;
    perform public.log_onboarding_event(s.user_id, s.id, s.engagement_id, 'status_changed', 'system',
      'השלב ננעל - נוספה תלות שטרם הושלמה', jsonb_build_object('from','pending','to','locked'));
  end if;

  perform public.log_onboarding_event(s.user_id, s.id, s.engagement_id, 'note', 'accountant',
    'עודכנו התלויות של הבקשה', jsonb_build_object('dependsOn', to_jsonb(v_deps)));

  return jsonb_build_object('ok', true, 'dependsOn', to_jsonb(v_deps), 'met', v_met);
end;
$function$

