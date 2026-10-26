-- בדיקת 304 (פייפרלס לבד) בתוך בקשה אחת שמסתיימת ב-raise — הכול מתבטל.
-- ‼ __USER__ מוחלף במשתמש הבדיקות של staging. שום משימה לא נתפסת (העובד של staging
-- לא מחזיק יכולת paperless), ושום דבר לא נשמר.
-- הרצה: node scripts/staging-dryrun-flows.mjs --tests-only scripts/sql/test-304-paperless-automation.sql
do $test$
declare
  uid   uuid := '__USER__';
  cid   text := 'qa304a' || substr(md5(random()::text), 1, 10);
  eng   text := 'qa304e' || substr(md5(random()::text), 1, 10);
  c2    text := 'qa304b' || substr(md5(random()::text), 1, 10);
  e2    text := 'qa304f' || substr(md5(random()::text), 1, 10);
  c3    text := 'qa304c' || substr(md5(random()::text), 1, 10);
  e3    text := 'qa304g' || substr(md5(random()::text), 1, 10);
  inv text; conn text; ret text; inv2 text; inv3 text; conn3 text; ret3 text; bd text;
  job text; job2 text; res jsonb; vi int; v text; vj jsonb;
  obs jsonb;
  out jsonb := '[]'::jsonb;
begin
  -- ── 1 · ניתוב ─────────────────────────────────────────────────────────────
  out := out || jsonb_build_object('t', '1.1 פייפרלס היא מערכת משלה', 'pass',
    public.automation_job_subsystem('paperless.setup_client') = 'paperless'
    and public.automation_job_subsystem('paperless.check_card') = 'paperless'
    and public.automation_job_subsystem('btl.sync_file') = 'btl', 'got', null);
  out := out || jsonb_build_object('t', '1.2 הקמה = פעולה משנה (ניסיון אחד); בדיקה = קריאה', 'pass',
    public.is_external_mutation_action('paperless.setup_client') and not public.is_external_mutation_action('paperless.check_card')
    and public.is_external_mutation_action('btl.create_representation'), 'got', null);
  out := out || jsonb_build_object('t', '1.3 צריכה חיבור פעיל', 'pass',
    public.automation_job_needs_session('paperless.setup_client'), 'got', null);

  -- ── 2 · «נרשמתי» ⇒ משימת הקמה ─────────────────────────────────────────────
  insert into public.clients (id, user_id, first_name, last_name, email, lifecycle_stage, family_status, dealer_type, id_number, business_name)
  values (cid, uid, 'ליאת', 'QA304', 'delivered@resend.dev', 'onboarding', 'single', 'exempt', '205917354', 'סטודיו QA');
  insert into public.engagements (id, user_id, client_id, status, process_published_at, monthly_total, monthly_total_with_vat, vat_rate_at_signing)
  values (eng, uid, cid, 'onboarding', now(), 250, 295, 18);
  insert into public.onboarding_steps (user_id, engagement_id, client_id, step_type, track, scope, status, ball, payload, published_at, sort_order)
  values (uid, eng, cid, 'paperless_invite', 'tools', 'person', 'pending', 'client', '{}', now(), 10) returning id into inv;
  insert into public.onboarding_steps (user_id, engagement_id, client_id, step_type, track, scope, status, ball, payload, published_at, depends_on_step_id, sort_order)
  values (uid, eng, cid, 'paperless_connection', 'tools', 'person', 'locked', 'me', '{}', now(), inv, 20) returning id into conn;
  insert into public.onboarding_steps (user_id, engagement_id, client_id, step_type, track, scope, status, ball, payload, published_at, depends_on_step_id, sort_order)
  values (uid, eng, cid, 'retainer_authorization', 'payment', 'engagement', 'locked', 'me', '{}', now(), conn, 30) returning id into ret;
  select id into bd from public.onboarding_steps where client_id = cid and step_type = 'business_details';

  update public.onboarding_steps set status = 'completed', completion_method = 'system', completed_at = now() where id = inv;
  select id, max_attempts, input into job, vi, vj from public.automation_jobs where client_id = cid and action_type = 'paperless.setup_client';
  out := out || jsonb_build_object('t', '2.1 נוצרה משימת הקמה אחת, ניסיון אחד', 'pass', job is not null and vi = 1, 'got', vj);
  out := out || jsonb_build_object('t', '2.2 הקלט מהשרת: ת״ז, שם עסק, הסכום החתום, השלבים', 'pass',
    vj->>'idNumber' = '205917354' and vj->>'businessName' = 'סטודיו QA' and (vj->>'monthlyBeforeVat')::numeric = 250
    and (vj->>'monthlyWithVat')::numeric = 295 and vj->>'connectionStepId' = conn and vj->>'retainerStepId' = ret
    and vj->>'reason' = 'signed_up', 'got', vj);

  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', uid::text, true);
  res := public.start_paperless_setup(cid);
  select count(*) into vi from public.automation_jobs where client_id = cid and action_type = 'paperless.setup_client';
  out := out || jsonb_build_object('t', '2.3 «הקם בפייפרלס» בזמן שיש פתוחה ⇒ אותה משימה', 'pass',
    res->>'jobId' = job and (res->>'existing')::boolean and vi = 1, 'got', res);
  res := public.start_paperless_setup('no-such-client');
  out := out || jsonb_build_object('t', '2.4 לקוח של מישהו אחר / לא קיים ⇒ forbidden', 'pass', res->>'error' = 'forbidden', 'got', res);

  -- ── 3 · בלי הסכם חתום — לא מתחילים, ונרשם למה ──────────────────────────────
  insert into public.clients (id, user_id, first_name, last_name, email, lifecycle_stage, family_status, id_number)
  values (c2, uid, 'נועה', 'QA304', 'delivered@resend.dev', 'onboarding', 'single', '123456782');
  insert into public.engagements (id, user_id, client_id, status, process_published_at) values (e2, uid, c2, 'onboarding', now());
  insert into public.onboarding_steps (user_id, engagement_id, client_id, step_type, track, scope, status, ball, payload, published_at)
  values (uid, e2, c2, 'paperless_invite', 'tools', 'person', 'pending', 'client', '{}', now()) returning id into inv2;
  insert into public.onboarding_steps (user_id, engagement_id, client_id, step_type, track, scope, status, ball, payload, published_at, depends_on_step_id)
  values (uid, e2, c2, 'paperless_connection', 'tools', 'person', 'locked', 'me', '{}', now(), inv2);
  update public.onboarding_steps set status = 'completed', completed_at = now() where id = inv2;
  select count(*) * 100 into vi from public.automation_jobs where client_id = c2;
  select vi + count(*) into vi from public.onboarding_events e where e.step_id = inv2 and e.note like 'PIVO לא התחיל הקמה בפייפרלס: אין הסכם חתום%';
  out := out || jsonb_build_object('t', '3.1 בלי סכום חתום ⇒ אין משימה, ההרשמה הושלמה, והסיבה ביומן', 'pass',
    vi = 1 and (select status from public.onboarding_steps where id = inv2) = 'completed', 'got', vi);

  -- ── 4 · תוצאה: ההקמה עברה ⇒ ארבעה סעיפים, חותמת הריטיינר ────────────────
  obs := jsonb_build_object('dealerFound', true, 'businessNumber', '205917354', 'businessName', 'סטודיו QA',
    'inRetainer', true, 'paymentMethod', 'credit', 'amountBeforeVat', 250, 'amountWithVat', 295,
    'cardEntered', false, 'chargedPeriods', '[]'::jsonb);
  update public.automation_jobs set status = 'running', claimed_at = now() where id = job;
  update public.automation_jobs set status = 'succeeded', finished_at = now(),
         result = jsonb_build_object('observed', obs, 'did', '{"payment":true,"amount":true}'::jsonb) where id = job;
  select payload into vj from public.onboarding_steps where id = conn;
  select count(*) into vi from jsonb_array_elements(vj->'checklist') x where (x->>'done')::boolean and x->>'by' = 'pivo';
  out := out || jsonb_build_object('t', '4.1 ארבעה סעיפים סומנו «PIVO»', 'pass', vi = 4
    and not exists (select 1 from jsonb_array_elements(vj->'checklist') x where x->>'key' = 'card_entered' and (x->>'done')::boolean), 'got', vj);
  select payload into vj from public.onboarding_steps where id = ret;
  out := out || jsonb_build_object('t', '4.2 שלב התשלום: authorizationCreatedAt (הלקוח יתבקש כרטיס)', 'pass',
    vj->>'authorizationCreatedAt' is not null and vj->>'cardEnteredAt' is null, 'got', vj);
  select count(*) into vi from public.onboarding_events where step_id = conn and actor = 'system' and note like 'PIVO בפייפרלס:%';
  out := out || jsonb_build_object('t', '4.3 שורה ביומן «פעילות»', 'pass', vi = 1, 'got', vi);
  out := out || jsonb_build_object('t', '4.4 ההקמה עדיין פתוחה (מחכה לכרטיס)', 'pass',
    (select status from public.onboarding_steps where id = conn) not in ('completed', 'verified'), 'got', null);

  -- ── 5 · בדיקת כרטיס: הוזן ⇒ חותמת, התראה; «פרטי העסק» פתוחה ⇒ ההקמה נשארת עם הסיבה ──
  res := public._paperless_enqueue(cid, 'paperless.check_card', 'daily');
  job2 := res->>'jobId';
  select max_attempts into vi from public.automation_jobs where id = job2;
  out := out || jsonb_build_object('t', '5.1 משימת בדיקה, שלושה ניסיונות (קריאה)', 'pass', job2 is not null and vi = 3, 'got', res);
  update public.automation_jobs set status = 'running' where id = job2;
  update public.automation_jobs set status = 'succeeded', finished_at = now(),
         result = jsonb_build_object('observed', obs || '{"cardEntered":true}'::jsonb) where id = job2;
  select payload into vj from public.onboarding_steps where id = ret;
  out := out || jsonb_build_object('t', '5.2 cardEnteredAt נכתב (PIVO)', 'pass', vj->>'cardEnteredAt' is not null and vj->>'cardEnteredBy' = 'pivo', 'got', vj);
  select count(*) into vi from public.accountant_notifications where client_id = cid and kind = 'paperless_card_entered' and payload->>'clientName' = 'ליאת QA304';
  out := out || jsonb_build_object('t', '5.3 התראה לרו״ח, עם שם הלקוח', 'pass', vi = 1, 'got', vi);
  select payload into vj from public.onboarding_steps where id = conn;
  out := out || jsonb_build_object('t', '5.4 «פרטי העסק» פתוחה ⇒ ההקמה לא נסגרת, והסיבה נשמרת', 'pass',
    bd is not null and (select status from public.onboarding_steps where id = conn) not in ('completed', 'verified')
    and vj->>'pivoCompleteBlocked' like '%פרטי העסק%'
    and exists (select 1 from jsonb_array_elements(vj->'checklist') x where x->>'key' = 'card_entered' and (x->>'done')::boolean),
    'got', jsonb_build_object('bd', bd, 'blocked', vj->>'pivoCompleteBlocked'));

  -- «פרטי העסק» הושלמה ⇒ הבדיקה הבאה סוגרת את ההקמה ופותחת את התשלום.
  update public.onboarding_steps set status = 'completed', completed_at = now() where id = bd;
  res := public._paperless_enqueue(cid, 'paperless.check_card', 'daily');
  job2 := res->>'jobId';
  update public.automation_jobs set status = 'running' where id = job2;
  update public.automation_jobs set status = 'succeeded', finished_at = now(),
         result = jsonb_build_object('observed', obs || '{"cardEntered":true}'::jsonb) where id = job2;
  out := out || jsonb_build_object('t', '5.5 ההקמה הושלמה (system) והתשלום נפתח', 'pass',
    (select status || '/' || completion_method from public.onboarding_steps where id = conn) = 'completed/system'
    and (select status from public.onboarding_steps where id = ret) = 'pending', 'got',
    (select jsonb_build_object('conn', c.status, 'ret', r.status) from public.onboarding_steps c, public.onboarding_steps r where c.id = conn and r.id = ret));
  select count(*) into vi from public.accountant_notifications where client_id = cid and kind = 'paperless_card_entered';
  out := out || jsonb_build_object('t', '5.6 אין התראה שנייה', 'pass', vi = 1, 'got', vi);

  -- ── 6 · החודש חויב ⇒ התשלום הושלם ──────────────────────────────────────────
  res := public._paperless_enqueue(cid, 'paperless.check_card', 'daily');
  out := out || jsonb_build_object('t', '6.1 בדיקה גם אחרי שההקמה נסגרה (עד החיוב)', 'pass', (res->>'ok')::boolean, 'got', res);
  job2 := res->>'jobId';
  update public.automation_jobs set status = 'running' where id = job2;
  update public.automation_jobs set status = 'succeeded', finished_at = now(),
         result = jsonb_build_object('observed', obs || '{"cardEntered":true,"chargedPeriods":["2610"]}'::jsonb) where id = job2;
  select status, payload into v, vj from public.onboarding_steps where id = ret;
  out := out || jsonb_build_object('t', '6.2 retainerChargedAt + הושלם', 'pass', v = 'completed' and vj->>'retainerChargedAt' is not null
    and vj->>'chargedPeriod' = '2610', 'got', vj);
  res := public._paperless_enqueue(cid, 'paperless.check_card', 'daily');
  out := out || jsonb_build_object('t', '6.3 אחרי החיוב אין מה לבדוק', 'pass', res->>'error' = 'nothing_to_check', 'got', res);

  -- ── 7 · לא דורסים: סכום אחר בפייפרלס ⇒ conflict, בלי סימון הריטיינר ────────
  insert into public.clients (id, user_id, first_name, last_name, email, lifecycle_stage, family_status, id_number)
  values (c3, uid, 'יובל', 'QA304', 'delivered@resend.dev', 'onboarding', 'single', '209132901');
  insert into public.engagements (id, user_id, client_id, status, process_published_at, monthly_total, monthly_total_with_vat)
  values (e3, uid, c3, 'onboarding', now(), 250, 295);
  insert into public.onboarding_steps (user_id, engagement_id, client_id, step_type, track, scope, status, ball, payload, published_at)
  values (uid, e3, c3, 'paperless_invite', 'tools', 'person', 'skipped', 'me', '{"skipReason":"already_connected"}', now()) returning id into inv3;
  insert into public.onboarding_steps (user_id, engagement_id, client_id, step_type, track, scope, status, ball, payload, published_at)
  values (uid, e3, c3, 'paperless_connection', 'tools', 'person', 'pending', 'me',
          '{"checklist":[{"key":"id_number","label":"x","done":true}]}', now()) returning id into conn3;
  insert into public.onboarding_steps (user_id, engagement_id, client_id, step_type, track, scope, status, ball, payload, published_at, depends_on_step_id)
  values (uid, e3, c3, 'retainer_authorization', 'payment', 'engagement', 'locked', 'me', '{}', now(), conn3) returning id into ret3;
  select count(*) into vi from public.automation_jobs where client_id = c3;
  out := out || jsonb_build_object('t', '7.1 «כבר מחובר» לא מתחיל לבד', 'pass', vi = 0, 'got', vi);
  res := public.start_paperless_setup(c3);
  job := res->>'jobId';
  update public.automation_jobs set status = 'running' where id = job;
  update public.automation_jobs set status = 'succeeded', finished_at = now(),
         result = jsonb_build_object('observed', jsonb_build_object('dealerFound', true, 'businessNumber', '209132901',
                    'businessName', '', 'inRetainer', true, 'paymentMethod', 'credit', 'amountBeforeVat', 200,
                    'amountWithVat', 236, 'cardEntered', false),
                  'conflict', jsonb_build_object('paperlessBeforeVat', 200, 'agreedBeforeVat', 250)) where id = job;
  select payload into vj from public.onboarding_steps where id = conn3;
  out := out || jsonb_build_object('t', '7.2 conflict נשמר; הריטיינר ושם העסק לא סומנו; הסעיף הידני נשאר', 'pass',
    (vj->'paperlessConflict'->>'agreedBeforeVat')::numeric = 250
    and not exists (select 1 from jsonb_array_elements(vj->'checklist') x where x->>'key' in ('retainer_card', 'business_name') and (x->>'done')::boolean)
    and exists (select 1 from jsonb_array_elements(vj->'checklist') x where x->>'key' = 'id_number' and (x->>'done')::boolean and x->>'label' = 'x')
    and (select payload->>'authorizationCreatedAt' from public.onboarding_steps where id = ret3) is null, 'got', vj);
  -- «עדכן לסכום שבהסכם» ⇒ משימה עם override; תוצאה תקינה מנקה את ה-conflict.
  res := public.start_paperless_setup(c3, true);
  job := res->>'jobId';
  out := out || jsonb_build_object('t', '7.3 override בקלט', 'pass',
    (select (input->>'overrideAmount')::boolean and input->>'reason' = 'office_override_amount' from public.automation_jobs where id = job), 'got', res);
  update public.automation_jobs set status = 'running' where id = job;
  update public.automation_jobs set status = 'succeeded', finished_at = now(),
         result = jsonb_build_object('observed', jsonb_build_object('dealerFound', true, 'businessNumber', '209132901',
                    'businessName', 'יובל', 'inRetainer', true, 'paymentMethod', 'credit', 'amountBeforeVat', 250,
                    'amountWithVat', 295, 'cardEntered', false)) where id = job;
  select payload into vj from public.onboarding_steps where id = conn3;
  out := out || jsonb_build_object('t', '7.4 אחרי העדכון: אין conflict, הריטיינר סומן', 'pass',
    not (vj ? 'paperlessConflict')
    and exists (select 1 from jsonb_array_elements(vj->'checklist') x where x->>'key' = 'retainer_card' and (x->>'done')::boolean), 'got', vj);

  -- ── 8 · תצפית שלא מצאה כלום לא נוגעת; כשל בהחלה לא מפיל את סגירת המשימה ───
  res := public._paperless_enqueue(c3, 'paperless.check_card', 'office_click');
  job := res->>'jobId';
  update public.automation_jobs set status = 'running' where id = job;
  update public.automation_jobs set status = 'succeeded', finished_at = now(),
         result = jsonb_build_object('observed', jsonb_build_object('dealerFound', false, 'inRetainer', false)) where id = job;
  select payload into vj from public.onboarding_steps where id = conn3;
  out := out || jsonb_build_object('t', '8.1 «לא נמצא» לא מוריד סימונים', 'pass',
    exists (select 1 from jsonb_array_elements(vj->'checklist') x where x->>'key' = 'retainer_card' and (x->>'done')::boolean)
    and (select status from public.automation_jobs where id = job) = 'succeeded', 'got', vj);

  -- ── 9 · הבדיקה היומית רצה בלי שגיאה ─────────────────────────────────────────
  vi := public.enqueue_paperless_card_checks();
  out := out || jsonb_build_object('t', '9.1 enqueue_paperless_card_checks()', 'pass', vi >= 0, 'got', vi);

  -- ── 9ב · «הזנתי את הכרטיס» (302) ⇒ בדיקה מיד; PIVO ראה ⇒ needs_attention יורד ─────
  insert into public.automation_workers (worker_id, user_id, capabilities) values ('qa304-worker', uid, array['shaam','btl','paperless']);
  update public.onboarding_steps set payload = payload - 'authorizationCreatedAt' - 'cardEnteredAt' - 'cardEnteredBy' - 'retainerChargedAt'
   where id = ret3;
  update public.onboarding_steps set payload = payload || '{"authorizationCreatedAt":"2026-10-26T08:00:00Z"}' where id = ret3;
  update public.automation_jobs set status = 'cancelled' where client_id = c3 and status in ('queued','running','needs_human');
  res := public._portal_paperless_card_declare(ret3);
  select count(*) into vi from public.automation_jobs where client_id = c3 and action_type = 'paperless.check_card'
     and status = 'queued' and input->>'reason' = 'client_declared';
  out := out || jsonb_build_object('t', '9ב.1 הלקוח סימן «הזנתי» ⇒ בדיקה יוצאת מיד', 'pass', (res->>'ok')::boolean and vi = 1, 'got', res);
  out := out || jsonb_build_object('t', '9ב.2 «לטיפולך» עד שמאומת', 'pass', (select needs_attention from public.onboarding_steps where id = ret3), 'got', null);
  update public.automation_jobs set status = 'running' where client_id = c3 and action_type = 'paperless.check_card' and status = 'queued';
  update public.automation_jobs set status = 'succeeded', finished_at = now(),
         result = jsonb_build_object('observed', jsonb_build_object('dealerFound', true, 'businessNumber', '209132901', 'businessName', 'יובל',
           'inRetainer', true, 'paymentMethod', 'credit', 'amountBeforeVat', 250, 'amountWithVat', 295, 'cardEntered', true))
   where client_id = c3 and action_type = 'paperless.check_card' and status = 'running';
  select payload into vj from public.onboarding_steps where id = ret3;
  out := out || jsonb_build_object('t', '9ב.3 PIVO ראה את הכרטיס ⇒ cardEnteredAt ו«לטיפולך» יורד', 'pass',
    vj->>'cardEnteredAt' is not null and not (select needs_attention from public.onboarding_steps where id = ret3), 'got', vj);

  -- ── 10 · הרשאות ──────────────────────────────────────────────────────────────
  out := out || jsonb_build_object('t', '10.1 anon לא מריץ כלום; authenticated רק את שני הכפתורים', 'pass',
    not has_function_privilege('anon', 'public.start_paperless_setup(text, boolean)', 'execute')
    and not has_function_privilege('anon', 'public._paperless_enqueue(text, text, text, jsonb)', 'execute')
    and not has_function_privilege('authenticated', 'public._paperless_enqueue(text, text, text, jsonb)', 'execute')
    and not has_function_privilege('authenticated', 'public.enqueue_paperless_card_checks()', 'execute')
    and has_function_privilege('authenticated', 'public.check_paperless_now(text)', 'execute'), 'got', null);

  raise exception 'RESULTS:%', out::text;
end;
$test$;
