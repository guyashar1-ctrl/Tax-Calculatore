-- 316 · «חשבונאות ומס» — שתי קריאות משרד בפייפרלס, ומע״מ בהסכם (31.10.2026)
--
-- גיא (31.10): «כפתור שבודק בפייפרלס מי חייב בקליטת מסמכים — באוטומציה, בלי AI», ובגבייה
-- «כפתור שבודק אם יש להם כרטיס», והיסטוריית התשלומים בתיק הלקוח.
--   ① read_paperless_retainer_now() — משימת עובד אחת: כל טבלת הריטיינר (כרטיס, סכום, חודשים
--      שחויבו, חודש הגבייה הנוכחי). ‼ קריאה בלבד — לא הרצה, לא «חודש הבא», לא שינוי סכום.
--   ② read_paperless_pending_now() — משימת עובד אחת: טבלת כל הממתינים של המשרד.
--   ③ report_worker_status — שתי הפעולות מתחדשות לבד אחרי התחברות לפייפרלס (כמו check_card).
--   ④ מע״מ 18% בשני הסכמים שנחתמו בלי שיעור (גיא: «יובל 365, אילן 252 לפני מע״מ») — עם גיבוי.
-- המשימות ברמת המשרד: client_id = null. התוצאה נקראת מ-automation_jobs.result (RLS: user_id).

-- ── ①② ההפעלה מהמסך ─────────────────────────────────────────────────────────
create or replace function public._paperless_office_read(p_action text)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare
  v_uid uuid := auth.uid();
  v_id  text;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;
  if p_action not in ('paperless.read_retainer', 'paperless.read_pending') then
    return jsonb_build_object('ok', false, 'error', 'unknown_action');
  end if;
  -- לחיצה כפולה / שתי לשוניות ⇒ אותה משימה.
  select id into v_id from public.automation_jobs
   where user_id = v_uid and client_id is null and action_type = p_action
     and status in ('queued', 'running', 'needs_human')
   order by created_at desc limit 1;
  if v_id is not null then
    return jsonb_build_object('ok', true, 'jobId', v_id, 'existing', true);
  end if;
  insert into public.automation_jobs (user_id, client_id, action_type, input, max_attempts)
  values (v_uid, null, p_action, jsonb_build_object('reason', 'office_click'), 2)
  returning id into v_id;
  return jsonb_build_object('ok', true, 'jobId', v_id);
end;
$function$;

create or replace function public.read_paperless_retainer_now()
returns jsonb language sql security definer set search_path to 'public' as $function$
  select public._paperless_office_read('paperless.read_retainer');
$function$;

create or replace function public.read_paperless_pending_now()
returns jsonb language sql security definer set search_path to 'public' as $function$
  select public._paperless_office_read('paperless.read_pending');
$function$;

-- ── ③ מתחדשות לבד אחרי התחברות (הגוף זהה לייצור — רק שתי פעולות נוספו לרשימה) ──
CREATE OR REPLACE FUNCTION public.report_worker_status(p_user_id uuid, p_worker_id text, p_status jsonb, p_instance text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
         'paperless.setup_client', 'paperless.check_card', 'paperless.connect',
         'paperless.read_retainer', 'paperless.read_pending'
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

-- ── ④ מע״מ 18% בהסכמים שנחתמו בלי שיעור — רק השניים שגיא נקב בהם, ורק אם עדיין ריקים ──
create table if not exists public.backup_316_engagements_vat as
  select * from public.engagements where false;
insert into public.backup_316_engagements_vat
  select e.* from public.engagements e
   where e.id in ('cf41ed87441547399c6308371758bd4e', '34bed482a8ce480f966c6f843b8a11ac')
     and not exists (select 1 from public.backup_316_engagements_vat b where b.id = e.id);
alter table public.backup_316_engagements_vat enable row level security;

update public.engagements
   set vat_rate_at_signing = 18,
       monthly_total_with_vat = round(monthly_total * 1.18, 2)
 where id in ('cf41ed87441547399c6308371758bd4e', '34bed482a8ce480f966c6f843b8a11ac')
   and vat_rate_at_signing is null and monthly_total_with_vat is null;

-- ── הרשאות ──────────────────────────────────────────────────────────────────
revoke all on function public._paperless_office_read(text) from public, anon, authenticated;
revoke all on function public.read_paperless_retainer_now() from public, anon;
revoke all on function public.read_paperless_pending_now() from public, anon;
grant execute on function public.read_paperless_retainer_now() to authenticated;
grant execute on function public.read_paperless_pending_now() to authenticated;
