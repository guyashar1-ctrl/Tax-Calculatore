-- חזרה מ-306 («פייפרלס» בכותרת): גופי 203 לשתי הפונקציות, וגוף 304 ל-report_worker_status
-- (להריץ את ⑥ מ-supabase/304-paperless-automation.sql). משימות paperless.connect קיימות נשארות היסטוריה.

create or replace function public.automation_job_is_interactive(p_action_type text)
returns boolean language sql immutable set search_path to 'public' as $function$
  select p_action_type in ('shaam.connect', 'btl.connect');
$function$;

create or replace function public.automation_job_needs_session(p_action_type text)
returns boolean language sql immutable set search_path to 'public' as $function$
  select public.automation_job_subsystem(p_action_type) is not null
     and p_action_type not in ('shaam.connect', 'shaam.disconnect', 'shaam.detect', 'shaam.check_auth',
                               'btl.connect', 'btl.disconnect');
$function$;
