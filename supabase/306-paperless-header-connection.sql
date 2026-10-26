-- ════════════════════════════════════════════════════════════════════════════
-- 306 · «פייפרלס» בכותרת, ליד שע״ם וביטוח לאומי (גיא, 26.10.2026: «למה אין לי ליד
-- שע״ם וביטוח לאומי חיבור לפייפרלס?» — אישר)
-- ════════════════════════════════════════════════════════════════════════════
-- paperless.connect פותח את החלון הייעודי במחשב המשרד על מסך הכניסה ומחכה לרו"ח;
-- paperless.disconnect סוגר אותו. אותו מודל בדיוק כמו btl.connect / btl.disconnect:
--   · connect היא פעולת התחברות (אדם ליד המחשב) — automation_job_is_interactive.
--   · connect/disconnect אינן «צריכות חיבור» — automation_job_needs_session.
--   · connect שממתינה לרו"ח מתחדשת לבד כשהנורית ירוקה — report_worker_status.
-- גופי 203/304 + פייפרלס, בלי שינוי אחר.
-- ════════════════════════════════════════════════════════════════════════════

create or replace function public.automation_job_is_interactive(p_action_type text)
returns boolean language sql immutable set search_path to 'public' as $function$
  select p_action_type in ('shaam.connect', 'btl.connect', 'paperless.connect');
$function$;

create or replace function public.automation_job_needs_session(p_action_type text)
returns boolean language sql immutable set search_path to 'public' as $function$
  select public.automation_job_subsystem(p_action_type) is not null
     and p_action_type not in ('shaam.connect', 'shaam.disconnect', 'shaam.detect', 'shaam.check_auth',
                               'btl.connect', 'btl.disconnect', 'paperless.connect', 'paperless.disconnect');
$function$;

-- גוף 304 + 'paperless.connect' ברשימת החידוש.
create or replace function public.report_worker_status(
  p_user_id uuid, p_worker_id text, p_status jsonb, p_instance text
) returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare
  v_status     jsonb;
  v_job        record;
  v_capability text;
  v_ready      boolean;
  v_resumed    text[] := '{}';
  v_touch      text;
begin
  v_touch := public.automation_worker_touch(p_user_id, p_worker_id, p_instance);
  if v_touch <> 'ok' then
    return jsonb_build_object('ok', false, 'error', v_touch);
  end if;
  update public.automation_workers
     set status = coalesce(p_status, status)
   where worker_id = p_worker_id
   returning status into v_status;

  for v_job in
    select id, error_code from public.automation_jobs
     where claimed_by = p_worker_id
       and user_id = p_user_id
       and status = 'needs_human'
       and action_type in (
         'shaam.connect', 'shaam.ensure_capability',
         'btl.create_representation', 'btl.check_representation',
         'paperless.setup_client', 'paperless.check_card', 'paperless.connect'
       )
       and cancel_requested = false
       -- ‼ 203: פעולה משנה שכבר נגעה ברשות לא מתחדשת לעולם מעצמה.
       and not (public.is_external_mutation_action(action_type) and public.job_touched_external(progress))
  loop
    v_capability := (regexp_match(coalesce(v_job.error_code, ''), '^awaiting_(\w+)_auth$'))[1];
    continue when v_capability is null;

    v_ready := case
      when v_capability = 'shaam' then coalesce((v_status #>> array['shaam', 'connected'])::boolean, false)
      when v_capability = 'btl' then coalesce((v_status #>> array['btl', 'connected'])::boolean, false)
      when v_capability = 'paperless' then coalesce((v_status #>> array['paperless', 'connected'])::boolean, false)
      else coalesce((v_status #>> array[v_capability, 'ready'])::boolean, false)
    end;
    continue when not v_ready;

    update public.automation_jobs
       set status       = 'running',
           claimed_at   = now(),
           lease_until  = now() + make_interval(secs => 5),
           needs_human  = null,
           error_code   = null,
           error_detail = null
     where id = v_job.id
       and claimed_by = p_worker_id
       and status = 'needs_human'
       and cancel_requested = false;

    if found then
      v_resumed := array_append(v_resumed, v_job.id);
    end if;
  end loop;

  return jsonb_build_object('ok', true, 'resumed', to_jsonb(v_resumed));
end;
$function$;
