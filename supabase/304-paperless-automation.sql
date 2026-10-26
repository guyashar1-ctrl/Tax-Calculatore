-- ════════════════════════════════════════════════════════════════════════════
-- 304 · פייפרלס לבד — הקמה, ריטיינר וזיהוי כרטיס (הכרעת גיא 26.10.2026)
-- ════════════════════════════════════════════════════════════════════════════
-- הלקוח נרשם לפייפרלס ⇒ PIVO מקים אותו שם (ת״ז, שם עסק, משיכת עוסקים, סליקת
-- אשראי והסכום מההסכם החתום) ⇒ כל בוקר בודק בטבלת הריטיינר אם הוזן כרטיס ואם
-- החודש חויב. ההמחשה המאושרת: docs/proposals/2026-10-26-paperless-automation.html
--
-- ‼ חריגה מודעת מ«פעולה שמשנה אצל רשות — רק בלחיצה»: פייפרלס אינה רשות אלא
-- הכלי של המשרד, וגיא הכריע שההקמה רצה לבד. ההגנות במקום הלחיצה:
--   · ניסיון אחד (is_external_mutation_action) — נפל באמצע ⇒ «לא ידוע אם נשמר»,
--     ולעולם לא ניסיון חוזר עיוור.
--   · העובד לא דורס: סכום/אמצעי תשלום אחרים שכבר מוגדרים ⇒ conflict, לבדיקתך.
--   · הסכום רק מההסכם החתום (engagements.monthly_total / monthly_total_with_vat,
--     קפואים בחתימה — 177), נקבע כאן בשרת ולא בדפדפן.
-- ‼ התוצאה היא תצפית בלבד («מה ראיתי בפייפרלס אחרי הריצה»), והמסקנה העסקית
-- (אילו סעיפים סומנו, חותמות על שלב התשלום) נגזרת כאן — כמו 187/194.
-- ‼ סימונים עולים בלבד: תצפית לעולם לא מורידה סעיף שסומן.
-- נצפה חי 26.10.2026 (קריאה בלבד): worker/test/fixtures/paperless-2026-10-26/README.md
-- ════════════════════════════════════════════════════════════════════════════

-- ── ① ניתוב: פייפרלס היא מערכת שלישית ליד שע״ם וב״ל ────────────────────────
create or replace function public.automation_job_subsystem(p_action_type text)
returns text language sql immutable set search_path to 'public' as $function$
  select case when p_action_type like 'shaam.%' then 'shaam'
              when p_action_type like 'btl.%' then 'btl'
              when p_action_type like 'paperless.%' then 'paperless' else null end;
$function$;

create or replace function public.is_external_mutation_action(p_action_type text)
returns boolean language sql immutable set search_path to 'public' as $function$
  select p_action_type in ('shaam.create_representation', 'shaam.submit_poa', 'btl.create_representation',
                           'paperless.setup_client');
$function$;

-- ‼ רק המחשב שבו חלון הפייפרלס מחובר. מחשב אחר שהיה מקבל את היכולת היה פותח
-- חלון ריק על מסך הכניסה ומחכה לגיא שם. ברירת המחדל של העמודה לא משתנה.
update public.automation_workers
   set capabilities = array_append(capabilities, 'paperless')
 where worker_id = 'guy-office-pc' and not ('paperless' = any(capabilities));

-- גוף 203 + שתי פעולות הפייפרלס ברשימת החידוש, ו«מחובר» של פייפרלס.
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
         'paperless.setup_client', 'paperless.check_card'
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

-- ── ② ההקשר: מה ההקמה צריכה, מהשרת בלבד ────────────────────────────────────
-- שלב החיבור הפתוח, שלב התשלום של ההתקשרות הנוכחית, הסכום החתום, ת״ז ושם עסק.
create or replace function public._paperless_setup_context(p_client_id text)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $function$
declare
  c   public.clients%rowtype;
  v_conn public.onboarding_steps%rowtype;
  v_ret  public.onboarding_steps%rowtype;
  v_eng  public.engagements%rowtype;
  v_eid  text;
begin
  select * into c from public.clients where id = p_client_id;
  if c.id is null then return jsonb_build_object('ok', false, 'error', 'client_not_found'); end if;

  select * into v_conn from public.onboarding_steps
   where client_id = p_client_id and step_type = 'paperless_connection'
     and status not in ('completed', 'verified', 'skipped', 'cancelled')
   order by created_at desc limit 1;
  if v_conn.id is null then return jsonb_build_object('ok', false, 'error', 'no_open_setup'); end if;

  v_eid := public.current_engagement_id(p_client_id);
  if v_eid is not null then select * into v_eng from public.engagements where id = v_eid; end if;
  if v_eng.id is null or coalesce(v_eng.monthly_total, 0) <= 0 then
    return jsonb_build_object('ok', false, 'error', 'no_signed_amount');
  end if;

  select * into v_ret from public.onboarding_steps
   where client_id = p_client_id and step_type = 'retainer_authorization'
     and status <> 'cancelled'
   order by (engagement_id is not distinct from v_eid) desc, created_at desc limit 1;

  if nullif(regexp_replace(coalesce(c.id_number, ''), '\D', '', 'g'), '') is null then
    return jsonb_build_object('ok', false, 'error', 'missing_id_number');
  end if;

  return jsonb_build_object(
    'ok', true,
    'idNumber', regexp_replace(c.id_number, '\D', '', 'g'),
    'businessName', nullif(trim(coalesce(c.business_name, '')), ''),
    -- לזיהוי העוסק אצל המשרד כשבפייפרלס עוד אין לו ת״ז (נרשם רק בשם).
    'firstName', c.first_name,
    'lastName', c.last_name,
    'monthlyBeforeVat', v_eng.monthly_total,
    'monthlyWithVat', coalesce(v_eng.monthly_total_with_vat,
                               round(v_eng.monthly_total * (1 + coalesce(v_eng.vat_rate_at_signing, 18) / 100.0), 2)),
    'engagementId', v_eng.id,
    'connectionStepId', v_conn.id,
    'retainerStepId', v_ret.id,
    'userId', c.user_id);
end;
$function$;

-- ── ③ יצירת משימה — מקום אחד לכל נקודות הכניסה ────────────────────────────
-- ‼ אידמפוטנטי: משימה פתוחה לאותו (לקוח, פעולה) ⇒ מחזירים אותה (האינדקס הייחודי
-- automation_jobs_open_unique הוא הרשת התחתונה).
create or replace function public._paperless_enqueue(
  p_client_id text, p_action text, p_reason text, p_extra jsonb default '{}'::jsonb
) returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare
  v_ctx  jsonb;
  v_open text;
  v_id   text;
begin
  if p_action not in ('paperless.setup_client', 'paperless.check_card') then
    return jsonb_build_object('ok', false, 'error', 'unknown_action');
  end if;
  v_ctx := public._paperless_setup_context(p_client_id);
  -- בדיקת כרטיס רלוונטית גם אחרי שההקמה נסגרה (עד שהחודש הראשון חויב).
  if not (v_ctx->>'ok')::boolean and not (p_action = 'paperless.check_card' and v_ctx->>'error' = 'no_open_setup') then
    return v_ctx;
  end if;
  if p_action = 'paperless.check_card' and v_ctx->>'error' = 'no_open_setup' then
    select jsonb_build_object('ok', true, 'idNumber', regexp_replace(c.id_number, '\D', '', 'g'), 'userId', c.user_id,
             'retainerStepId', (select r.id from public.onboarding_steps r
                                 where r.client_id = c.id and r.step_type = 'retainer_authorization'
                                   and r.status not in ('completed', 'verified', 'skipped', 'cancelled')
                                 order by r.created_at desc limit 1))
      into v_ctx from public.clients c where c.id = p_client_id;
    if v_ctx->>'retainerStepId' is null then
      return jsonb_build_object('ok', false, 'error', 'nothing_to_check');
    end if;
  end if;

  select id into v_open from public.automation_jobs
   where client_id = p_client_id and action_type = p_action
     and status in ('queued', 'running', 'needs_human');
  if v_open is not null then
    return jsonb_build_object('ok', true, 'jobId', v_open, 'existing', true);
  end if;

  insert into public.automation_jobs (user_id, client_id, action_type, input, max_attempts)
  values ((v_ctx->>'userId')::uuid, p_client_id, p_action,
          (v_ctx - 'ok' - 'userId') || jsonb_build_object('reason', p_reason) || coalesce(p_extra, '{}'::jsonb),
          case when public.is_external_mutation_action(p_action) then 1 else 3 end)
  returning id into v_id;
  return jsonb_build_object('ok', true, 'jobId', v_id);
exception when unique_violation then
  select id into v_open from public.automation_jobs
   where client_id = p_client_id and action_type = p_action and status in ('queued', 'running', 'needs_human');
  return jsonb_build_object('ok', true, 'jobId', v_open, 'existing', true);
end;
$function$;

-- ── ④ «נרשמתי» ⇒ ההקמה יוצאת לדרך לבד ──────────────────────────────────────
-- ‼ רק הרשמה חדשה (הלקוח אישר בדף, או המשרד סימן «נרשם»). «כבר מחובר» ו«הועבר
-- מהמייצג הקודם» — דרך הכפתור «הקם בפייפרלס», כי שם החשבון קיים אצל מישהו אחר.
-- ‼ כשל כאן לעולם לא מפיל את השלמת ההרשמה — הוא נרשם ביומן ונשאר הכפתור.
create or replace function public._paperless_autosetup_on_signup()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
declare
  v_res jsonb;
begin
  if new.step_type <> 'paperless_invite' or new.status not in ('completed', 'verified')
     or old.status in ('completed', 'verified') then
    return new;
  end if;
  begin
    v_res := public._paperless_enqueue(new.client_id, 'paperless.setup_client', 'signed_up');
    if not coalesce((v_res->>'ok')::boolean, false) then
      perform public.log_onboarding_event(new.user_id, new.id, new.engagement_id, 'note', 'system',
        'PIVO לא התחיל הקמה בפייפרלס: ' || case v_res->>'error'
          when 'no_signed_amount' then 'אין הסכם חתום עם סכום חודשי'
          when 'missing_id_number' then 'חסר מספר זהות בכרטיס'
          when 'no_open_setup' then 'אין שלב הקמה פתוח'
          else coalesce(v_res->>'error', 'סיבה לא ידועה') end,
        jsonb_build_object('paperlessAuto', v_res));
    end if;
  exception when others then
    perform public.log_onboarding_event(new.user_id, new.id, new.engagement_id, 'note', 'system',
      'PIVO לא התחיל הקמה בפייפרלס (תקלה) — אפשר להפעיל ידנית מ«הקם בפייפרלס».',
      jsonb_build_object('paperlessAutoError', sqlerrm));
  end;
  return new;
end;
$function$;

drop trigger if exists z_paperless_autosetup_on_signup on public.onboarding_steps;
create trigger z_paperless_autosetup_on_signup
  after update of status on public.onboarding_steps
  for each row execute function public._paperless_autosetup_on_signup();

-- ── ④ב · הלקוח סימן «הזנתי את הכרטיס» (302) ⇒ PIVO בודק מיד, לא מחר בבוקר ──
create or replace function public._paperless_check_on_card_declared()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
begin
  if new.step_type <> 'retainer_authorization'
     or nullif(new.payload->>'cardDeclaredAt', '') is null
     or nullif(old.payload->>'cardDeclaredAt', '') is not null
     or nullif(new.payload->>'cardEnteredAt', '') is not null then
    return new;
  end if;
  begin
    if exists (select 1 from public.automation_workers w
                where w.user_id = new.user_id and w.revoked_at is null and 'paperless' = any(w.capabilities)) then
      perform public._paperless_enqueue(new.client_id, 'paperless.check_card', 'client_declared');
    end if;
  exception when others then
    null;  -- ‼ ההצהרה של הלקוח לעולם לא נכשלת בגלל הבדיקה; הבדיקה של הבוקר תתפוס.
  end;
  return new;
end;
$function$;

drop trigger if exists z_paperless_check_on_card_declared on public.onboarding_steps;
create trigger z_paperless_check_on_card_declared
  after update of payload on public.onboarding_steps
  for each row execute function public._paperless_check_on_card_declared();

-- ── ⑤ מהמסך: «הקם בפייפרלס» / «עדכן בפייפרלס לסכום שבהסכם» / «בדוק עכשיו» ──
create or replace function public.start_paperless_setup(p_client_id text, p_override_amount boolean default false)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
begin
  if not exists (select 1 from public.clients where id = p_client_id and user_id = auth.uid()) then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;
  return public._paperless_enqueue(p_client_id, 'paperless.setup_client',
    case when p_override_amount then 'office_override_amount' else 'office_click' end,
    jsonb_build_object('overrideAmount', coalesce(p_override_amount, false)));
end;
$function$;

create or replace function public.check_paperless_now(p_client_id text)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
begin
  if not exists (select 1 from public.clients where id = p_client_id and user_id = auth.uid()) then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;
  return public._paperless_enqueue(p_client_id, 'paperless.check_card', 'office_click');
end;
$function$;

-- ── ⑥ כל בוקר: מי שמחכה לכרטיס או לחיוב הראשון ────────────────────────────
-- ‼ רק מי שהריטיינר שלו כבר הוגדר (authorizationCreatedAt), ושלב התשלום פתוח.
-- בדיקה שהצליחה ב-20 השעות האחרונות ⇒ לא שוב היום.
create or replace function public.enqueue_paperless_card_checks()
returns integer language plpgsql security definer set search_path to 'public' as $function$
declare
  r record;
  n integer := 0;
  v jsonb;
begin
  for r in
    select distinct s.client_id
      from public.onboarding_steps s
     where s.step_type = 'retainer_authorization'
       and s.status not in ('completed', 'verified', 'skipped', 'cancelled')
       and nullif(s.payload->>'authorizationCreatedAt', '') is not null
       and nullif(s.payload->>'retainerChargedAt', '') is null
       and exists (select 1 from public.automation_workers w
                    where w.user_id = s.user_id and w.revoked_at is null and 'paperless' = any(w.capabilities))
       and not exists (select 1 from public.automation_jobs j
                        where j.client_id = s.client_id and j.action_type = 'paperless.check_card'
                          and j.status = 'succeeded' and j.finished_at > now() - interval '20 hours')
  loop
    v := public._paperless_enqueue(r.client_id, 'paperless.check_card', 'daily');
    if coalesce((v->>'ok')::boolean, false) and not coalesce((v->>'existing')::boolean, false) then n := n + 1; end if;
  end loop;
  return n;
end;
$function$;

-- ── ⑦ התוצאה ⇒ סימונים, חותמות וסגירה ─────────────────────────────────────
-- התצפית (result.observed): dealerFound, businessNumber, businessName, inRetainer,
-- paymentMethod ('credit'|'bank'|'masav'|'none'), amountBeforeVat, amountWithVat,
-- cardEntered, chargedPeriods[]. ועוד result.conflict כשהעובד לא דרס.
create or replace function public._apply_paperless_observation(p_job public.automation_jobs)
returns void language plpgsql security definer set search_path to 'public' as $function$
declare
  o        jsonb := coalesce(p_job.result->'observed', '{}'::jsonb);
  v_conn   public.onboarding_steps%rowtype;
  v_ret    public.onboarding_steps%rowtype;
  v_ctx    jsonb;
  v_list   jsonb;
  v_item   jsonb;
  v_new    jsonb := '[]'::jsonb;
  v_marked text[] := '{}';
  v_now    text := to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"');
  v_done   boolean;
  v_before numeric;
  v_card   boolean := coalesce((o->>'cardEntered')::boolean, false);
  v_charged boolean := jsonb_array_length(coalesce(o->'chargedPeriods', '[]'::jsonb)) > 0;
  v_retainer_ok boolean;
  v_labels jsonb := jsonb_build_object(
    'id_number', 'הזנת מספר הזהות של הלקוח בפייפרלס',
    'business_name', 'הזנת שם העסק ולחיצה על שמור',
    'pull_dealers', 'ביצוע משיכת עוסקים',
    'retainer_card', 'עדכון הריטיינר שסוכם לתשלום בכרטיס אשראי',
    'card_entered', 'הלקוח הזין כרטיס אשראי בפייפרלס');
  k text;
begin
  if not coalesce((o->>'dealerFound')::boolean, false) and not coalesce((o->>'inRetainer')::boolean, false) then
    return;
  end if;

  if p_job.input->>'connectionStepId' is not null then
    select * into v_conn from public.onboarding_steps where id = p_job.input->>'connectionStepId';
  end if;
  if v_conn.id is null then
    select * into v_conn from public.onboarding_steps
     where client_id = p_job.client_id and step_type = 'paperless_connection' and status <> 'cancelled'
     order by created_at desc limit 1;
  end if;
  if p_job.input->>'retainerStepId' is not null then
    select * into v_ret from public.onboarding_steps where id = p_job.input->>'retainerStepId';
  end if;

  -- הסכום שבהסכם — מהקלט (נקבע ביצירה) ובהיעדרו מההקשר הנוכחי.
  v_before := nullif(p_job.input->>'monthlyBeforeVat', '')::numeric;
  if v_before is null then
    v_ctx := public._paperless_setup_context(p_job.client_id);
    v_before := nullif(v_ctx->>'monthlyBeforeVat', '')::numeric;
  end if;
  v_retainer_ok := o->>'paymentMethod' = 'credit'
                   and v_before is not null
                   and abs(coalesce(nullif(o->>'amountBeforeVat', '')::numeric, -1) - v_before) < 0.01;

  -- רשימת ההקמה — סימון עולה בלבד, עם «PIVO» והשעה.
  if v_conn.id is not null then
    v_list := coalesce(v_conn.payload->'checklist', '[]'::jsonb);
    foreach k in array array['id_number', 'business_name', 'pull_dealers', 'retainer_card', 'card_entered'] loop
      select x into v_item from jsonb_array_elements(v_list) x where x->>'key' = k limit 1;
      v_done := coalesce((v_item->>'done')::boolean, false);
      if not v_done and (
           (k = 'id_number' and regexp_replace(coalesce(o->>'businessNumber', ''), '\D', '', 'g')
                                = regexp_replace(coalesce(p_job.input->>'idNumber', '-'), '\D', '', 'g'))
        or (k = 'business_name' and nullif(trim(coalesce(o->>'businessName', '')), '') is not null)
        or (k = 'pull_dealers' and coalesce((o->>'inRetainer')::boolean, false))
        or (k = 'retainer_card' and v_retainer_ok)
        or (k = 'card_entered' and v_card and v_ret.id is not null)) then
        v_item := coalesce(v_item, jsonb_build_object('key', k, 'label', v_labels->>k))
                  || jsonb_build_object('done', true, 'doneAt', v_now, 'by', 'pivo');
        v_marked := array_append(v_marked, v_labels->>k);
      end if;
      if v_item is not null then v_new := v_new || jsonb_build_array(v_item); end if;
      v_item := null;
    end loop;
    -- סעיפים שאינם מחמשת אלה (אם יהיו) נשמרים כמו שהם.
    v_new := v_new || coalesce((select jsonb_agg(x) from jsonb_array_elements(v_list) x
                                 where not (x->>'key' = any(array['id_number', 'business_name', 'pull_dealers',
                                                                  'retainer_card', 'card_entered']))), '[]'::jsonb);

    update public.onboarding_steps
       set payload = (payload || jsonb_build_object('checklist', v_new, 'pivoCheckedAt', v_now))
                     - 'paperlessConflict'
                     || case when p_job.result ? 'conflict' and jsonb_typeof(p_job.result->'conflict') = 'object'
                             then jsonb_build_object('paperlessConflict', p_job.result->'conflict')
                             else '{}'::jsonb end
     where id = v_conn.id;

    if array_length(v_marked, 1) > 0 then
      perform public.log_onboarding_event(v_conn.user_id, v_conn.id, v_conn.engagement_id, 'note', 'system',
        'PIVO בפייפרלס: ' || array_to_string(v_marked, ' · '),
        jsonb_build_object('jobId', p_job.id, 'action', p_job.action_type));
    end if;
  end if;

  -- שלב התשלום — החותמות שהמסך כבר מכיר (authorizationCreatedAt → cardEnteredAt → retainerChargedAt).
  if v_ret.id is not null and v_ret.status <> 'cancelled' then
    if v_retainer_ok and nullif(v_ret.payload->>'authorizationCreatedAt', '') is null then
      update public.onboarding_steps
         set payload = payload || jsonb_build_object('authorizationCreatedAt', v_now, 'authorizationBy', 'pivo')
       where id = v_ret.id;
    end if;
    if v_card and nullif(v_ret.payload->>'cardEnteredAt', '') is null then
      -- ‼ 302: «הזנתי את הכרטיס» של הלקוח מרים needs_attention («לוודא בפייפרלס»). PIVO וידא ⇒ יורד.
      update public.onboarding_steps
         set payload = payload || jsonb_build_object('cardEnteredAt', v_now, 'cardEnteredBy', 'pivo'),
             needs_attention = false
       where id = v_ret.id;
      perform public.log_onboarding_event(v_ret.user_id, v_ret.id, v_ret.engagement_id, 'note', 'system',
        'PIVO ראה בפייפרלס שהלקוח הזין כרטיס אשראי', jsonb_build_object('jobId', p_job.id));
      perform public.queue_accountant_notification(v_ret.user_id, 'paperless_card_entered', v_ret.client_id, v_ret.id,
        null, null, (select jsonb_build_object('clientName', trim(coalesce(c.first_name, '') || ' ' || coalesce(c.last_name, '')))
                       from public.clients c where c.id = v_ret.client_id));
    end if;
  end if;

  -- סגירת ההקמה כשהכרטיס הוזן. ‼ שומר ההקמה (220) עשוי לסרב — «פרטי העסק» פתוחה
  -- או אחוז משרד ביתי שלא סומן. אז ההקמה נשארת פתוחה עם הסיבה; לא נכשלים.
  if v_card and v_conn.id is not null and v_conn.status not in ('completed', 'verified', 'skipped', 'cancelled')
     and v_ret.id is not null then
    begin
      update public.onboarding_steps
         set status = 'completed', completion_method = 'system', completed_at = coalesce(completed_at, now()),
             needs_attention = false, payload = payload - 'pivoCompleteBlocked'
       where id = v_conn.id;
      perform public.log_onboarding_event(v_conn.user_id, v_conn.id, v_conn.engagement_id, 'status_changed', 'system',
        'הלקוח הזין כרטיס אשראי בפייפרלס - ההקמה בפייפרלס הושלמה',
        jsonb_build_object('from', v_conn.status, 'to', 'completed', 'action', 'complete', 'jobId', p_job.id));
      perform public.unlock_dependent_steps(v_conn.id);
    exception when others then
      update public.onboarding_steps
         set payload = payload || jsonb_build_object('pivoCompleteBlocked', sqlerrm)
       where id = v_conn.id;
    end;
  end if;

  -- החודש הראשון חויב ⇒ שלב התשלום הושלם (כמו «חויב» בכרטיס התשלום).
  if v_charged and v_card and v_ret.id is not null then
    select * into v_ret from public.onboarding_steps where id = v_ret.id;
    if nullif(v_ret.payload->>'retainerChargedAt', '') is null
       and v_ret.status not in ('completed', 'verified', 'skipped', 'cancelled', 'locked') then
      begin
        update public.onboarding_steps
           set payload = payload || jsonb_build_object('retainerChargedAt', v_now, 'retainerChargedBy', 'pivo',
                                                       'chargedPeriod', o->'chargedPeriods'->>0),
               status = 'completed', completion_method = 'system', completed_at = coalesce(completed_at, now()),
               needs_attention = false
         where id = v_ret.id;
        perform public.log_onboarding_event(v_ret.user_id, v_ret.id, v_ret.engagement_id, 'status_changed', 'system',
          'PIVO ראה בפייפרלס שהחודש הראשון חויב - התשלום החודשי פעיל',
          jsonb_build_object('from', v_ret.status, 'to', 'completed', 'action', 'complete', 'jobId', p_job.id));
        perform public.unlock_dependent_steps(v_ret.id);
      exception when others then
        null;  -- נשאר פתוח; בבדיקה הבאה ננסה שוב
      end;
    end if;
  end if;
end;
$function$;

create or replace function public.trg_apply_paperless_job()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
begin
  if new.action_type in ('paperless.setup_client', 'paperless.check_card')
     and new.status = 'succeeded' and old.status is distinct from 'succeeded' then
    begin
      perform public._apply_paperless_observation(new);
    exception when others then
      -- ‼ החלת התוצאה לעולם לא מפילה את סגירת המשימה (complete_automation_job).
      raise warning 'paperless apply failed for job %: %', new.id, sqlerrm;
    end;
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_apply_paperless_job on public.automation_jobs;
create trigger trg_apply_paperless_job
  after update of status on public.automation_jobs
  for each row execute function public.trg_apply_paperless_job();

-- ── ⑧ הרשאות ────────────────────────────────────────────────────────────────
do $$
declare f text;
begin
  foreach f in array array[
    'public._paperless_setup_context(text)',
    'public._paperless_enqueue(text, text, text, jsonb)',
    'public._paperless_autosetup_on_signup()',
    'public._paperless_check_on_card_declared()',
    'public.enqueue_paperless_card_checks()',
    'public._apply_paperless_observation(public.automation_jobs)',
    'public.trg_apply_paperless_job()'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
  end loop;
  foreach f in array array[
    'public.start_paperless_setup(text, boolean)',
    'public.check_paperless_now(text)'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

-- ── ⑨ כל בוקר 07:45 (שעון ישראל בחורף) — אחרי ריצת הגבייה של הלילה ──────────
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'paperless-card-checks';
    perform cron.schedule('paperless-card-checks', '45 4 * * *', 'select public.enqueue_paperless_card_checks()');
  end if;
end $$;
