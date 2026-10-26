-- חזרה מ-304 (פייפרלס לבד). מחזיר את גופי 203, מסיר טריגרים/פונקציות/cron ואת היכולת.
-- ‼ משימות פייפרלס קיימות ונתוני השלבים (סימונים, חותמות) לא נמחקים — הם היסטוריה.
-- ‼ להריץ גם את גוף report_worker_status מ-203 (supabase/203-multi-workstation-automation.sql, ⑥).

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'paperless-card-checks';
  end if;
end $$;

drop trigger if exists trg_apply_paperless_job on public.automation_jobs;
drop trigger if exists z_paperless_autosetup_on_signup on public.onboarding_steps;
drop trigger if exists z_paperless_check_on_card_declared on public.onboarding_steps;
drop function if exists public._paperless_check_on_card_declared();
drop function if exists public.trg_apply_paperless_job();
drop function if exists public._apply_paperless_observation(public.automation_jobs);
drop function if exists public.enqueue_paperless_card_checks();
drop function if exists public.check_paperless_now(text);
drop function if exists public.start_paperless_setup(text, boolean);
drop function if exists public._paperless_autosetup_on_signup();
drop function if exists public._paperless_enqueue(text, text, text, jsonb);
drop function if exists public._paperless_setup_context(text);

create or replace function public.automation_job_subsystem(p_action_type text)
returns text language sql immutable set search_path to 'public' as $function$
  select case when p_action_type like 'shaam.%' then 'shaam'
              when p_action_type like 'btl.%' then 'btl' else null end;
$function$;

create or replace function public.is_external_mutation_action(p_action_type text)
returns boolean language sql immutable set search_path to 'public' as $function$
  select p_action_type in ('shaam.create_representation', 'shaam.submit_poa', 'btl.create_representation');
$function$;

update public.automation_workers set capabilities = array_remove(capabilities, 'paperless')
 where 'paperless' = any(capabilities);
