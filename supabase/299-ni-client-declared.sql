-- 299 · «אישרתי» בביטוח לאומי — מהדף האישי, ובדיקה אוטומטית אחריו.
-- (ליאת ואוריה, 25.10.2026; ההמחשה: docs/proposals/2026-10-25-client-page-short.html)
--
-- עד היום: כרטיס האישור בדף הראה אסמכתא והוראות, ולא היה ללקוח איך לומר «עשיתי».
-- המשרד גילה רק כשמישהו לחץ «בדוק» — או לא גילה בכלל.
-- מעכשיו:
--   1. «אישרתי» בכרטיס (portal_submit_step על שלב «ייצוג ברשות») ⇒ payload.clientDeclaredAt
--      על הבקשה של האותו אדם, שורה ביומן, ובדיקת ב״ל (btl.check_representation — קריאה בלבד)
--      בתור. משימת בדיקה פתוחה של האדם השני ⇒ «המשך» אחריה (automation_job_followups, 270).
--   2. הבקשה **לא** נסגרת מההצהרה. היא נסגרת רק כשהבדיקה מוצאת אישור (confirmedAt → 157).
--   3. בדף: declareState = 'checking' (תודה, נוודא) עד שבדיקה רצה אחרי ההצהרה; אם הבדיקה לא
--      מצאה אישור — 'not_seen' (עוד לא רואים), והכפתורים חוזרים.
-- ‼ לחיצה כפולה / רענון: הצהרה בתוך 2 דקות מהקודמת לא מוסיפה בדיקה.
-- ‼ הוחל כהזרקה לגופים החיים (_r299_patch), עם עוגנים של שורה אחת (הגופים מערבבים CRLF/LF).
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public._r299_patch(p_fn regprocedure, p_old text, p_new text)
returns void language plpgsql as $$
declare
  v_def text := pg_get_functiondef(p_fn);
  v_n int;
begin
  p_old := replace(p_old, E'\r', '');
  p_new := replace(p_new, E'\r', '');
  if position(p_new in v_def) > 0 then return; end if;   -- כבר הוחל
  v_n := (length(v_def) - length(replace(v_def, p_old, ''))) / greatest(length(p_old), 1);
  if v_n <> 1 then
    raise exception '299: anchor count % (expected 1) in %: %', v_n, p_fn, left(p_old, 120);
  end if;
  execute replace(v_def, p_old, p_new);
end;
$$;

-- ── 1 · ההצהרה ─────────────────────────────────────────────────────────────
create or replace function public._portal_ni_declare(p_step_id text)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare
  s       public.onboarding_steps;
  c       public.clients;
  r       public.representation_requests;
  v_role  text;
  v_track jsonb;
  v_id    text;
  v_prev  timestamptz;
  v_open  public.automation_jobs;
  v_input jsonb;
  v_now   text := to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
begin
  select * into s from public.onboarding_steps where id = p_step_id for update;
  if s.id is null or s.step_type <> 'authority_representation'
     or coalesce(s.payload->>'authority', '') <> 'national_insurance' then
    return jsonb_build_object('ok', false, 'error', 'not_client_editable');
  end if;
  select * into c from public.clients where id = s.client_id;
  select * into r from public.representation_requests where id = s.payload->>'representationRequestId';
  v_role := case when s.payload->>'subjectRole' = 'spouse' then 'spouse' else 'client' end;
  v_track := coalesce(r.execution -> (case when v_role = 'spouse' then 'nationalInsuranceSpouse' else 'nationalInsurance' end), '{}'::jsonb);
  if nullif(v_track->>'confirmedAt', '') is not null then
    return jsonb_build_object('ok', true, 'noop', true, 'confirmed', true);
  end if;
  if nullif(v_track->>'referenceNumber', '') is null then
    return jsonb_build_object('ok', false, 'error', 'no_reference');
  end if;

  v_prev := nullif(s.payload->>'clientDeclaredAt', '')::timestamptz;
  if v_prev is not null and v_prev > now() - interval '2 minutes' then
    return jsonb_build_object('ok', true, 'noop', true, 'declared', true);
  end if;

  update public.onboarding_steps
     set payload = payload || jsonb_build_object('clientDeclaredAt', v_now), updated_at = now()
   where id = s.id;
  perform public.log_onboarding_event(s.user_id, s.id, s.engagement_id, 'client_declared', 'client',
    'הלקוח סימן «אישרתי» לייפוי הכוח בביטוח הלאומי' || coalesce(' (' || nullif(s.payload->>'subjectName', '') || ')', ''),
    jsonb_build_object('role', v_role));

  -- בדיקת ב״ל — קריאה בלבד; תעודת הזהות מהכרטיס של אותו אדם.
  v_id := regexp_replace(coalesce(case when v_role = 'spouse' then c.spouse_id_number else c.id_number end, ''), '\D', '', 'g');
  if v_id = '' then
    return jsonb_build_object('ok', true, 'declared', true, 'check', 'no_id');
  end if;
  v_input := jsonb_build_object('role', v_role, 'idNumber', v_id, 'referenceNumber', v_track->>'referenceNumber',
                                'source', 'client_declared');
  select * into v_open from public.automation_jobs
   where client_id = c.id and action_type = 'btl.check_representation'
     and status in ('queued', 'running', 'needs_human')
   order by created_at desc limit 1;
  if v_open.id is not null then
    if coalesce(v_open.input->>'role', '') = v_role then
      return jsonb_build_object('ok', true, 'declared', true, 'check', 'already');
    end if;
    insert into public.automation_job_followups (user_id, client_id, action_type, input, after_job_id, status)
    values (c.user_id, c.id, 'btl.check_representation', v_input, v_open.id, 'waiting');
    return jsonb_build_object('ok', true, 'declared', true, 'check', 'waiting');
  end if;
  insert into public.automation_jobs (user_id, client_id, action_type, input, status, max_attempts)
  values (c.user_id, c.id, 'btl.check_representation', v_input, 'queued', 3);
  return jsonb_build_object('ok', true, 'declared', true, 'check', 'queued');
end;
$function$;

revoke execute on function public._portal_ni_declare(text) from public, anon, authenticated;

select public._r299_patch('public.portal_submit_step(text,text,jsonb)'::regprocedure,
  $o$if p_data ? 'paperlessAnswers' then$o$,
  $n$if s.step_type = 'authority_representation' then return public._portal_ni_declare(s.id); end if; -- 299 · «אישרתי» בב״ל
  if p_data ? 'paperlessAnswers' then$n$);

-- ── 2 · הדף: הכרטיס יודע אם הלקוח אמר שאישר, ומה הבדיקה מצאה ───────────────────
select public._r299_patch('public._portal_step_items(onboarding_steps,clients,profiles,representation_requests,jsonb,jsonb)'::regprocedure,
  $o$'bucket', 'action', 'key', 'authrep_' || s.id, 'kind', 'ni_approval',$o$,
  $n$'bucket', 'action', 'key', 'authrep_' || s.id, 'kind', 'ni_approval',
            -- 299 · «אישרתי»: הפעולה בדף, ומצב ההצהרה (בודקים / ב״ל עוד לא מראה אישור)
            'actionKind', 'portal', 'actionValue', s.id,
            'declaredAt', nullif(s.payload->>'clientDeclaredAt', ''),
            'declareState', case
              when nullif(s.payload->>'clientDeclaredAt', '') is null then null
              when nullif(v_trk->>'syncedAt', '') is not null
                   and (v_trk->>'syncedAt')::timestamptz > (s.payload->>'clientDeclaredAt')::timestamptz then 'not_seen'
              else 'checking' end,$n$);

drop function public._r299_patch(regprocedure, text, text);
