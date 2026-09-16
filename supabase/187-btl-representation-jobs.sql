-- ─── 187: ייפוי כוח מבוטח בביטוח לאומי — יצירה ובדיקת סטטוס (פרק 17) ────────
-- ‼ ממוספר 187 (לא 186): 186 נתפס באותו חלון זמן ע"י הסשן המקביל
-- (representation-office-settings). הוחל בפרודקשן ב-16.09.2026 אחרי preflight
-- ואומת: assert_domain_function_invariants()='ok', גופי הפונקציות והטריגר
-- נקראו חזרה מהמסד וזהים לקובץ הזה.
--
-- שני שינויים, שני handlers חדשים בעובד (btl.create_representation,
-- btl.check_representation — worker/src/handlers/):
--
-- 1. report_worker_status (153, הורחבה ב-185): חידוש needs_human עמיד לפי
--    error_code היה מוגבל ל-shaam.connect/shaam.ensure_capability בלבד.
--    שני ה-handlers החדשים יכולים לנחות על needs_human('awaiting_btl_auth')
--    בדיוק כמו btl.connect (חלון ב"ל סגור/לא מחובר) — בלעדי ההרחבה הזו הם
--    לא היו מתחדשים אוטומטית ברגע שהחלון מתחבר, ונשארים תקועים עד שהרו"ח
--    לוחץ שוב.
--
-- 2. sync_btl_representation_from_job: פונקציה חדשה + טריגר על
--    automation_jobs — כשמשימת btl.create_representation/
--    btl.check_representation מסתיימת ב-succeeded, מעדכנת את
--    representation_requests.execution.nationalInsurance{,Spouse}
--    (NiTracking) בהתאם לתוצאה. ‼ עקרון §9 של יסודות הבקשות: "היטל אינו
--    מקור אמת" — ה-worker לא כותב ייצוג פעיל בעצמו, הוא רק מדווח מה ראה;
--    הטריגר הזה הוא ה"תרגום" היחיד מתוצאת משימה למצב עסקי, ולא ה-UI.

-- ── 1. הרחבת report_worker_status ────────────────────────────────────────

create or replace function public.report_worker_status(
  p_user_id   uuid,
  p_worker_id text,
  p_status    jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_status   jsonb;
  v_job      record;
  v_capability text;
  v_ready    boolean;
  v_resumed  text[] := '{}';
begin
  insert into public.automation_workers (worker_id, user_id, last_seen_at, status)
  values (p_worker_id, p_user_id, now(), coalesce(p_status, '{}'::jsonb))
  on conflict (worker_id) do update
    set last_seen_at = now(),
        user_id      = excluded.user_id,
        status       = coalesce(excluded.status, public.automation_workers.status)
  returning status into v_status;

  for v_job in
    select id, error_code from public.automation_jobs
     where claimed_by = p_worker_id
       and status = 'needs_human'
       -- ‼ 187: btl.create_representation/btl.check_representation נוספו —
       -- שניהם יכולים לנחות על awaiting_btl_auth בדיוק כמו btl.connect.
       and action_type in (
         'shaam.connect', 'shaam.ensure_capability',
         'btl.create_representation', 'btl.check_representation'
       )
       and cancel_requested = false
  loop
    v_capability := (regexp_match(coalesce(v_job.error_code, ''), '^awaiting_(\w+)_auth$'))[1];
    continue when v_capability is null;

    v_ready := case
      when v_capability = 'shaam' then coalesce((v_status #>> array['shaam', 'connected'])::boolean, false)
      -- ‼ 187: ב"ל מדווחת מוכנות תחת status.btl.connected (types/automation.ts
      -- AutomationWorkerStatus.btl) — לא תחת ...ready כמו gmf/vat/nikui.
      when v_capability = 'btl' then coalesce((v_status #>> array['btl', 'connected'])::boolean, false)
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

revoke all on function public.report_worker_status(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.report_worker_status(uuid, text, jsonb) to service_role;

-- ── 2. תרגום תוצאת משימה למצב הביצוע של הבקשה ────────────────────────────

create or replace function public.sync_btl_representation_from_job()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_role   text;
  v_key    text;
  v_req_id text;
  v_track  jsonb;
begin
  if new.action_type not in ('btl.create_representation', 'btl.check_representation') then
    return new;
  end if;

  -- ‼ הנושא (154) חייב לבוא מהתוצאה/הקלט המפורשים — לעולם לא מנחשים "מי".
  v_role := coalesce(new.result ->> 'role', new.input ->> 'role');
  if v_role not in ('client', 'spouse') then
    return new;
  end if;
  v_key := case when v_role = 'spouse' then 'nationalInsuranceSpouse' else 'nationalInsurance' end;

  select representation_request_id into v_req_id
    from public.clients where id = new.client_id;
  if v_req_id is null then
    return new;
  end if;

  select coalesce(execution -> v_key, '{}'::jsonb) into v_track
    from public.representation_requests where id = v_req_id;
  if v_track is null then
    return new;
  end if;

  if new.action_type = 'btl.create_representation' then
    -- ‼ enteredAt/referenceNumber/deadline הם עובדות חדשות שהתקבלו מביטוח
    -- לאומי, לא היטל של ישות אחרת — נכתבות ישירות, פעם אחת (coalesce שומר
    -- על ערך קיים אם משום מה כבר נכתב).
    v_track := v_track || jsonb_strip_nulls(jsonb_build_object(
      'enteredAt', coalesce(v_track ->> 'enteredAt', to_jsonb(now())::text),
      'referenceNumber', new.result ->> 'referenceNumber',
      'deadline', new.result ->> 'deadline'
    ));
  elsif new.action_type = 'btl.check_representation' then
    if new.result ->> 'status' = 'approved' then
      v_track := v_track || jsonb_build_object('confirmedAt', coalesce(v_track ->> 'confirmedAt', to_jsonb(now())::text));
    end if;
    -- ‼ 'pending'/'unknown'/'not_found' — אין שינוי במצב העסקי. הראיה עצמה
    -- (rawStatus וכו') נשארת על ה-job.result לאבחון, לא נכתבת ל-execution.
  end if;

  update public.representation_requests
     set execution = jsonb_set(coalesce(execution, '{}'::jsonb), array[v_key], v_track, true)
   where id = v_req_id;

  return new;
end;
$function$;

drop trigger if exists trg_sync_btl_representation_from_job on public.automation_jobs;
create trigger trg_sync_btl_representation_from_job
  after update on public.automation_jobs
  for each row
  when (new.status = 'succeeded' and old.status is distinct from new.status)
  execute function public.sync_btl_representation_from_job();

select public.assert_domain_function_invariants();
