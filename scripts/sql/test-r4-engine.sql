-- בדיקת 217 (סבב 4, מנוע): בקשה שלא נוצרה (P.x), סוג עוסק שלא ידוע (K.x), לקוח שחוזר (R.x),
-- ומשימות פנימיות ישנות ובעלים של תבנית (L.x), ואישור הייצוג באזור האישי — מה מסמנים (G.x).
-- בלוק אחד שמסתיים ב-raise — הכול מתבטל. מריצים:
--   node scripts/staging-dryrun-flows.mjs --full --tests scripts/sql/test-r4-engine.sql
-- ‼ __USER__ מוחלף במשתמש הבדיקות של staging. שום מייל לא נשלח (התור בלבד), ושום דבר לא נשמר.
-- ‼ K משנה את רשימות הקליטה של המשרד ובונה מסלול קליטה חדש — בתוך הטרנזקציה בלבד.
do $test$
declare
  uid     uuid := '__USER__';
  other   uuid := gen_random_uuid();
  v_office uuid;
  out     jsonb := '[]'::jsonb;
  res jsonb; res2 jsonb; res3 jsonb;
  v text; v2 text; vi int; vj int; vk int; vb boolean;
  sx text; sy text;
  -- P · מסלול
  cP  text := 'qar4p'  || substr(md5(random()::text), 1, 10);  eP  text := 'qar4pe' || substr(md5(random()::text), 1, 10);
  cP2 text := 'qar4q'  || substr(md5(random()::text), 1, 10);  eP2 text := 'qar4qe' || substr(md5(random()::text), 1, 10);
  cP3 text := 'qar4r'  || substr(md5(random()::text), 1, 10);  eP3 text := 'qar4re' || substr(md5(random()::text), 1, 10);
  tplok text; tplb text; fP1 text; fP2 text; runP text; runP2 text; runP3 text;
  pP text; pP2 text; pP3 text; sOk text; sOk2 text; sReal text;
  -- P · מחולל
  cG  text := 'qar4g'  || substr(md5(random()::text), 1, 10);  eG  text := 'qar4ge' || substr(md5(random()::text), 1, 10);
  tplmiss text := 'qar4miss' || substr(md5(random()::text), 1, 10);
  gp1 text; gp3 text;
  -- K
  kq text; kt text; kc1 text; ke1 text; krun1 text; kc2 text; ke2 text; kc3 text; ke3 text; kc4 text; ke4 text; krun4 text;
  kc5 text; ke5 text; kc6 text := 'qar4k6' || substr(md5(random()::text), 1, 10); ke6 text := 'qar4k6e' || substr(md5(random()::text), 1, 10);
  kc6b text := 'qar4k6b' || substr(md5(random()::text), 1, 10); ke6b text := 'qar4k6be' || substr(md5(random()::text), 1, 10);
  kc7 text := 'qar4k7' || substr(md5(random()::text), 1, 10);
  kc8 text; ke8 text; fK text; krun7 text; qtpl text; kc9 text; ke9 text; kq9 text;
  n_before int; n_after int;
  e_hold jsonb;
  kc10 text; ke10 text; kq10 text; kbefore text[]; kextra text; kexpect jsonb; kheld jsonb;
  ks jsonb; kx jsonb; kg jsonb;
  -- R · לקוח שחוזר
  rc text := 'qar4rc' || substr(md5(random()::text), 1, 10);  reold text := 'qar4ro' || substr(md5(random()::text), 1, 10);
  rq text := 'qar4rq' || substr(md5(random()::text), 1, 10);  rt text := md5(random()::text);
  re text; rrold text; rnewrun text; ropen text; rprep text; rprob text; rn1 int; rn2 int; rsnap jsonb; rold_letter text; rold_mat text;
  rc2 text := 'qar4r2c' || substr(md5(random()::text), 1, 10); re2old text := 'qar4r2o' || substr(md5(random()::text), 1, 10);
  rq2 text := 'qar4r2q' || substr(md5(random()::text), 1, 10); rt2 text := md5(random()::text); re2 text;
  rc3 text := 'qar4r3c' || substr(md5(random()::text), 1, 10); re3old text := 'qar4r3o' || substr(md5(random()::text), 1, 10);
  rq3 text := 'qar4r3q' || substr(md5(random()::text), 1, 10); rt3 text := md5(random()::text); re3 text;
  rc4 text := 'qar4r4c' || substr(md5(random()::text), 1, 10); re4 text := 'qar4r4e' || substr(md5(random()::text), 1, 10);
  rq4 text := 'qar4r4q' || substr(md5(random()::text), 1, 10); rt4 text := md5(random()::text);
  rc5 text := 'qar4r5c' || substr(md5(random()::text), 1, 10); re5 text := 'qar4r5e' || substr(md5(random()::text), 1, 10);
  vb2 boolean; vb3 boolean;
  -- R.18–R.22 · לקוח שחוזר בדרך האמיתית (הכרעה ב)
  wc text := 'qar4wc' || substr(md5(random()::text), 1, 10); weold text := 'qar4wo' || substr(md5(random()::text), 1, 10);
  wq text := 'qar4wq' || substr(md5(random()::text), 1, 10); wt text := md5(random()::text);
  we text; wrun_old text; wdocs text; wopen text; wcarry text; wauto_old text; wauto_new text; wnew text; wtpl text; wfirst text;
  wdef0 jsonb; wodj jsonb; wpage jsonb; wann jsonb; wr1 jsonb; wr2 jsonb;
  -- L · משימות פנימיות ישנות ובעלים של תבנית
  lc text := 'qar4lc' || substr(md5(random()::text), 1, 10); le text := 'qar4le' || substr(md5(random()::text), 1, 10);
  lmap jsonb := '{}'::jsonb; lts timestamptz; lr record;
  -- G · אישור הייצוג באזור האישי — מה מסמנים
  apc  text := 'qar4ap'  || substr(md5(random()::text), 1, 10); ape  text := 'qar4ape'  || substr(md5(random()::text), 1, 10);
  apr  text := 'qar4apr' || substr(md5(random()::text), 1, 10);
  apc3 text := 'qar4ap3' || substr(md5(random()::text), 1, 10); ape3 text := 'qar4ap3e' || substr(md5(random()::text), 1, 10);
  apr3 text := 'qar4ap3r' || substr(md5(random()::text), 1, 10);
  aps text; aps3 text; apx jsonb; apy jsonb; apz jsonb; apexp jsonb; apnote text; apv1 int; apv2 int; apset jsonb; apb boolean;
  apc4 text := 'qar4ap4' || substr(md5(random()::text), 1, 10); ape4 text := 'qar4ap4e' || substr(md5(random()::text), 1, 10);
  apr4 text := 'qar4ap4r' || substr(md5(random()::text), 1, 10); aps4 text; apsubs jsonb;
  -- B · get_client_flow_runs: willApply, when, kindWaitItems (B1/B4) · V · מצב בלי מסמכים (A:X-3) · M · migratedFrom (216)
  bc1 text := 'qar4bc' || substr(md5(random()::text), 1, 10); bflow text; brun text; bres jsonb; bres2 jsonb; bst jsonb;
  bc2 text := 'qar4bd' || substr(md5(random()::text), 1, 10); brun2 text;
  vdef jsonb; verr1 text; verr2 text; verr3 text; verr4 text;
  mtid text; mtid2 text; mres jsonb; mrow record;
  -- S · בן/בת הזוג (G1, X-5) ושמות בספרייה (216)
  sc1 text := 'qar4sa' || substr(md5(random()::text), 1, 10); se1 text := 'qar4sae' || substr(md5(random()::text), 1, 10);
  sc2 text := 'qar4sb' || substr(md5(random()::text), 1, 10); se2 text := 'qar4sbe' || substr(md5(random()::text), 1, 10);
  sc3 text := 'qar4sc' || substr(md5(random()::text), 1, 10);
  sc4 text := 'qar4sd' || substr(md5(random()::text), 1, 10); se4 text := 'qar4sde' || substr(md5(random()::text), 1, 10);
  stpl text; sflow text; srun1 text; srun2 text; srun4 text; sprob text; sprob4 text; sspouse text;
  sres jsonb; sres2 jsonb; sres3 jsonb; sfacts jsonb; sn1 jsonb; sn2 jsonb; sn3 jsonb;
  -- Z · צילום התעודה של בן/בת הזוג לשע״ם (G1.b)
  zc  text := 'qar4za' || substr(md5(random()::text), 1, 10); ze  text := 'qar4zae' || substr(md5(random()::text), 1, 10);
  zc2 text := 'qar4zb' || substr(md5(random()::text), 1, 10); ze2 text := 'qar4zbe' || substr(md5(random()::text), 1, 10);
  zr text; zr2 text; zsp text; zcl text; zold text; zn int; zlabel uuid;
  zres jsonb; zres2 jsonb; zres3 jsonb; zp jsonb; zp2 jsonb; zportal jsonb; zann jsonb; zpre jsonb; zdocs jsonb;
begin
  select office_id into v_office from public.profiles where id = uid;

  -- ══ יחידות ════════════════════════════════════════════════════════════════
  begin
  out := out || jsonb_build_object('t', 'U.1 _creation_problem_class: תקין ⇒ null; ספרייה/תוכן/תצורה/מערכת', 'pass',
    public._creation_problem_class('not_applicable') is null and public._creation_problem_class('exists') is null
    and public._creation_problem_class('generator_only') is null and public._creation_problem_class('already_done') is null
    and public._creation_problem_class('in_other_run') is null and public._creation_problem_class('step_type_exists') is null
    and public._creation_problem_class('not_repeatable') is null and public._creation_problem_class('kind_unknown') is null
    and public._creation_problem_class('library_item_missing') = 'library'
    and public._creation_problem_class('missing_payload') = 'content' and public._creation_problem_class('no_requirements') = 'content'
    and public._creation_problem_class('select_needs_options') = 'content'
    and public._creation_problem_class('not_creatable') = 'config' and public._creation_problem_class('bad_owner') = 'config'
    and public._creation_problem_class('forbidden') = 'system' and public._creation_problem_class('something_new') = 'system',
    'got', null);
  out := out || jsonb_build_object('t', 'U.2 תנאי כשהסוג לא ידוע: מחכה / חל לכל שלושת הסוגים / לא חל', 'pass',
    public._flow_kind_waits('{"kinds":["licensed_dealer"]}', '{}')
    and not public._flow_kind_waits('{"kinds":["licensed_dealer","exempt_dealer","company"]}', '{}')
    and public._flow_when_matches_kind('{"kinds":["licensed_dealer","exempt_dealer","company","representation_only"]}', '{}')
    and not public.flow_when_matches('{"kinds":["licensed_dealer","exempt_dealer","company"]}', '{}')
    and not public._flow_kind_waits('{"kinds":["tax_refund"]}', '{}')
    and not public._flow_when_matches_kind('{"kinds":["tax_refund"]}', '{}')
    and not public._flow_kind_waits('{"kinds":["licensed_dealer"]}', '{"kind":"company"}')
    and public._flow_kind_waits('{"facts":[{"key":"licensed","is":true}]}', '{}')
    and not public._flow_kind_waits('{"kinds":["licensed_dealer"],"facts":[{"key":"married","is":true}]}', '{"married":false}')
    and not public._flow_kind_waits(null, '{}'),
    'got', null);
  res := public._kind_dependent_entries(null);
  out := out || jsonb_build_object('t', 'U.3 בלי רשימות משרד: רק «חיבור פייפרלס לרשות המסים» תלוי בסוג', 'pass',
    res->'keys' = '["paperless_tax_authority"]'::jsonb
    and jsonb_array_length(res->'lists'->'exempt_dealer') = 0 and jsonb_array_length(res->'lists'->'licensed_dealer') = 1,
    'got', res->'keys');
  exception when others then
    out := out || jsonb_build_object('t', 'קרס: U · יחידות', 'pass', false, 'got', sqlerrm);
  end;
  execute 'set local role postgres';

  -- ══ P · בקשה במסלול שלא נוצרה ═══════════════════════════════════════════
  begin
  insert into public.clients (id, user_id, first_name, last_name, email, lifecycle_stage, family_status, dealer_type)
  values (cP, uid, 'בדיקה', 'QAR4P', 'delivered@resend.dev', 'onboarding', 'single', 'licensed');
  insert into public.engagements (id, user_id, client_id, status, process_published_at) values (eP, uid, cP, 'onboarding', now());
  insert into public.journey_templates (user_id, office_id, kind, name, entries)
  values (uid, v_office, 'request', 'QA R4 תקינה',
          '[{"key":"e1","stepType":"custom_request","owner":"client","requiredForClose":true,"payload":{"title":"QA R4 תקינה","clientTitle":"QA R4 תקינה","requirements":[{"key":"r1","kind":"confirm","label":"אישור","done":false,"required":true}]}}]')
  returning id into tplok;
  insert into public.journey_templates (user_id, office_id, kind, name, entries)
  values (uid, v_office, 'request', 'QA R4 ריקה',
          '[{"key":"e1","stepType":"custom_request","owner":"client","requiredForClose":true,"payload":{"title":"QA R4 ריקה","requirements":[]}}]')
  returning id into tplb;

  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', uid::text, true);
  execute 'set local role authenticated';
  res := public.create_office_flow('QA R4 לא נוצרה', 'manual', jsonb_build_object('stages', jsonb_build_array(
    jsonb_build_object('key', 'a', 'name', 'איסוף', 'opens', jsonb_build_object('after', 'start'), 'delivery', 'approve',
      'items', jsonb_build_array(
        jsonb_build_object('key', 'ok', 'ref', jsonb_build_object('kind', 'template', 'templateId', tplok)),
        jsonb_build_object('key', 'gone', 'ref', jsonb_build_object('kind', 'document', 'docId', 'qa-gone-r4'),
                           'snapshot', jsonb_build_object('title', 'מדריך שנמחק')),
        jsonb_build_object('key', 'kk', 'ref', jsonb_build_object('kind', 'template', 'templateId', tplok),
                           'when', jsonb_build_object('kinds', jsonb_build_array('company'))))),
    jsonb_build_object('key', 'b', 'name', 'אחרי', 'opens', jsonb_build_object('after', 'stage', 'stage', 'a'), 'delivery', 'approve',
      'items', jsonb_build_array(jsonb_build_object('key', 'next', 'ref', jsonb_build_object('kind', 'template', 'templateId', tplok)))))));
  fP1 := res->>'flowId';
  res := public.start_flow_run(cP, fP1, null, false);
  runP := res->>'runId';
  execute 'set local role postgres';
  select id into pP from public.onboarding_steps where client_id = cP and payload ? 'creationProblem'
     and status not in ('completed', 'verified', 'skipped', 'cancelled');
  select count(*) into vi from public.onboarding_steps where client_id = cP and payload ? 'creationProblem'
     and status not in ('completed', 'verified', 'skipped', 'cancelled');
  out := out || jsonb_build_object('t', 'P.1 פריט שהקובץ שלו נמחק ⇒ שורה אדומה אחת למשרד, בשלב ובפריט שלו, לא נעולה', 'pass',
    exists (select 1 from jsonb_array_elements(res->'skipped') x
             where x->>'itemKey' = 'gone' and (x->>'problem')::boolean and x->>'problemStepId' = pP)
    and vi = 1
    and (select ball = 'me' and status = 'pending' and published_at is not null and flow_run_id = runP
                and flow_stage_key = 'a' and flow_item_key = 'gone' and required_for_close = false
                and step_type = 'custom_request'
                and (payload->>'internalTask')::boolean
                and payload->'creationProblem'->>'reason' = 'library_item_missing'
                and payload->'creationProblem'->>'cls' = 'library' and payload->'creationProblem'->>'next' = 'add'
                and payload->'creationProblem'->>'source' = 'flow'
                and payload->'creationProblem'->>'key' = 'flow:' || runP || ':gone:client'
                and payload->>'title' = 'לא נוצרה — «מדריך שנמחק»'
           from public.onboarding_steps where id = pP),
    'got', jsonb_build_object('skipped', res->'skipped', 'row', (select to_jsonb(s) - 'draft_payload' from public.onboarding_steps s where s.id = pP)));
  out := out || jsonb_build_object('t', 'P.1א פריט שלא חל (סוג אחר) ⇒ דילוג בלי שורה', 'pass',
    exists (select 1 from jsonb_array_elements(res->'skipped') x
             where x->>'itemKey' = 'kk' and x->>'reason' = 'not_applicable' and not (x ? 'problem')),
    'got', res->'skipped');
  select count(*) into vi from jsonb_array_elements(public.build_client_portal(cP, 'live')->'items') x where x->>'key' = 'custom_' || pP;
  select count(*) into vj from jsonb_array_elements(public.build_client_portal(cP, 'preview')->'items') x where x->>'key' = 'custom_' || pP;
  select count(*) into vk from public._client_announceable_steps(cP) a where a.step_id = pP;
  out := out || jsonb_build_object('t', 'P.2 השורה לא בדף האישי (חי ותצוגה) ולא במייל ללקוח', 'pass', vi = 0 and vj = 0 and vk = 0,
    'got', jsonb_build_array(vi, vj, vk));
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  res := public.get_client_flow_runs(cP);
  execute 'set local role postgres';
  select x->'counts' into res2 from jsonb_array_elements(res->'runs') rr, jsonb_array_elements(rr->'stages') x
   where rr->>'id' = runP and x->>'key' = 'a';
  out := out || jsonb_build_object('t', 'P.2א ברצועה: נספרת «אצלך» ו«לא נוצרה», ומחזיקה את השלב', 'pass',
    (res2->>'office')::int >= 1 and (res2->>'problems')::int = 1 and (res2->>'gates')::int = 2, 'got', res2);

  select id into sOk from public.onboarding_steps where flow_run_id = runP and flow_item_key = 'ok' and not (payload ? 'creationProblem');
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  res := public.advance_onboarding_step(sOk, 'complete', '{}'::jsonb);
  execute 'set local role postgres';
  select status into v from public.onboarding_steps where flow_run_id = runP and flow_item_key = 'next';
  select (state->'stages'->'a'->>'doneAt') is null into vb from public.flow_runs where id = runP;
  out := out || jsonb_build_object('t', 'P.3 שאר השלב הושלם ⇒ השלב לא «הושלם» והשלב הבא נעול (מחכה לשורה)', 'pass',
    vb and v = 'locked', 'got', jsonb_build_object('next', v, 'complete', res));

  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  res := public.flow_run_add_items(runP, array['gone']);
  execute 'set local role postgres';
  select count(*) into vi from public.onboarding_steps where client_id = cP and payload ? 'creationProblem'
     and status not in ('completed', 'verified', 'skipped', 'cancelled');
  out := out || jsonb_build_object('t', 'P.4 ניסיון נוסף מהמסלול ⇒ אותה שורה, attempts=2', 'pass',
    vi = 1 and (select (payload->'creationProblem'->>'attempts')::int = 2 from public.onboarding_steps where id = pP)
    and exists (select 1 from jsonb_array_elements(res->'skipped') x where x->>'itemKey' = 'gone' and x->>'problemStepId' = pP),
    'got', res);

  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  res := public.flow_run_add_items(runP, array['ok', 'kk']);
  execute 'set local role postgres';
  select count(*) into vi from public.onboarding_steps where client_id = cP and payload ? 'creationProblem' and flow_item_key <> 'gone';
  out := out || jsonb_build_object('t', 'P.5 דילוגים תקינים (כבר קיימת, לא חלה) לא פותחים שורה', 'pass',
    vi = 0 and exists (select 1 from jsonb_array_elements(res->'skipped') x where x->>'itemKey' = 'ok' and x->>'reason' = 'exists'),
    'got', res);

  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  res := public.retry_request_creation(pP);
  execute 'set local role postgres';
  select count(*) into vi from public.onboarding_steps where client_id = cP and payload ? 'creationProblem';
  out := out || jsonb_build_object('t', 'P.6 «צור שוב» כשהקובץ עדיין חסר ⇒ resolved=false, אותה סיבה, אותה שורה', 'pass',
    coalesce((res->>'ok')::boolean, false) and not coalesce((res->>'resolved')::boolean, true)
    and res->>'reason' = 'library_item_missing' and vi = 1
    and (select status = 'pending' and (payload->'creationProblem'->>'attempts')::int = 3 from public.onboarding_steps where id = pP),
    'got', res);

  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  res := public.advance_onboarding_step(pP, 'skip', '{"reason":"not_applicable","note":"אין צורך — הבקשה לא נוצרה"}'::jsonb);
  res2 := public.retry_request_creation(pP);
  execute 'set local role postgres';
  select status into v from public.onboarding_steps where flow_run_id = runP and flow_item_key = 'next';
  select (state->'stages'->'a'->>'doneAt') is not null into vb from public.flow_runs where id = runP;
  out := out || jsonb_build_object('t', 'P.7 «אין צורך» ⇒ השלב הושלם והבא נפתח; «צור שוב» על שורה סגורה ⇒ not_a_problem', 'pass',
    vb and v = 'pending' and res2->>'error' = 'not_a_problem', 'got', jsonb_build_object('skip', res, 'next', v, 'retry', res2));

  -- תבנית לא נושאת «לא נוצרה»; «שמור כתבנית» מדלג על השורה
  out := out || jsonb_build_object('t', 'P.7א שמירה לספרייה/כתבנית לא נושאת את השורה', 'pass',
    not (public.template_payload_from_step((select payload from public.onboarding_steps where id = pP)) ? 'creationProblem'),
    'got', null);
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  res := public.save_journey_template(cP, 'QA R4 מסע', null);
  execute 'set local role postgres';
  select count(*) into vi from public.journey_templates t, jsonb_array_elements(t.entries) e
   where t.user_id = uid and t.name = 'QA R4 מסע' and (e->'payload'->>'title' like 'לא נוצרה%' or e->'payload' ? 'creationProblem');
  out := out || jsonb_build_object('t', 'P.7ב «שמור את המסע כתבנית» בלי שורת «לא נוצרה»', 'pass', vi = 0, 'got', res);
  exception when others then
    out := out || jsonb_build_object('t', 'קרס: P.1–P.7 · בקשה במסלול שלא נוצרה', 'pass', false, 'got', sqlerrm);
  end;
  execute 'set local role postgres';

  -- ── P.8 · «צור שוב» שמצליח: הבקשה מקבלת את הקשתות לפני שהשורה נסגרת ─────────
  begin
  insert into public.clients (id, user_id, first_name, last_name, email, lifecycle_stage, family_status, dealer_type)
  values (cP2, uid, 'בדיקה', 'QAR4Q', 'delivered@resend.dev', 'onboarding', 'single', 'licensed');
  insert into public.engagements (id, user_id, client_id, status, process_published_at) values (eP2, uid, cP2, 'onboarding', now());
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', uid::text, true);
  execute 'set local role authenticated';
  res := public.create_office_flow('QA R4 תוכן', 'manual', jsonb_build_object('stages', jsonb_build_array(
    jsonb_build_object('key', 'a', 'name', 'איסוף', 'opens', jsonb_build_object('after', 'start'), 'delivery', 'approve',
      'items', jsonb_build_array(
        jsonb_build_object('key', 'emp', 'ref', jsonb_build_object('kind', 'template', 'templateId', tplb)),
        jsonb_build_object('key', 'ok2', 'ref', jsonb_build_object('kind', 'template', 'templateId', tplok)))),
    jsonb_build_object('key', 'b', 'name', 'אחרי', 'opens', jsonb_build_object('after', 'stage', 'stage', 'a'), 'delivery', 'approve',
      'items', jsonb_build_array(jsonb_build_object('key', 'nx', 'ref', jsonb_build_object('kind', 'template', 'templateId', tplok)))))));
  fP2 := res->>'flowId';
  res := public.start_flow_run(cP2, fP2, null, false);
  runP2 := res->>'runId';
  select id into sOk2 from public.onboarding_steps where flow_run_id = runP2 and flow_item_key = 'ok2';
  res2 := public.advance_onboarding_step(sOk2, 'complete', '{}'::jsonb);
  execute 'set local role postgres';
  select id into pP2 from public.onboarding_steps where client_id = cP2 and payload ? 'creationProblem';
  select status into v from public.onboarding_steps where flow_run_id = runP2 and flow_item_key = 'nx';
  out := out || jsonb_build_object('t', 'P.8א בקשה ריקה בספרייה ⇒ «לא נוצרה» (תוכן: לתקן בספרייה); השלב הבא מחכה לה', 'pass',
    (select payload->'creationProblem'->>'reason' = 'no_requirements' and payload->'creationProblem'->>'cls' = 'content'
            and payload->'creationProblem'->>'next' = 'library' and payload->'creationProblem'->'ref'->>'templateId' = tplb
       from public.onboarding_steps where id = pP2)
    and v = 'locked',
    'got', jsonb_build_object('start', res, 'nx', v));
  update public.journey_templates
     set entries = '[{"key":"e1","stepType":"custom_request","owner":"client","requiredForClose":true,"payload":{"title":"QA R4 תוקנה","clientTitle":"QA R4 תוקנה","requirements":[{"key":"r1","kind":"file","label":"קובץ","done":false,"required":true}]}}]'
   where id = tplb;
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  res := public.retry_request_creation(pP2);
  execute 'set local role postgres';
  select id into sReal from public.onboarding_steps where flow_run_id = runP2 and flow_item_key = 'emp' and not (payload ? 'creationProblem');
  select status into v from public.onboarding_steps where flow_run_id = runP2 and flow_item_key = 'nx';
  select (state->'stages'->'a'->>'doneAt') is null into vb from public.flow_runs where id = runP2;
  out := out || jsonb_build_object('t', 'P.8 תוקן בספרייה ⇒ «צור שוב» יוצר; השורה מבוטלת עם resolvedStepId; השלב פתוח עד שהבקשה תושלם', 'pass',
    coalesce((res->>'resolved')::boolean, false) and res->>'how' = 'created' and res->>'stepId' = sReal
    and (select status = 'cancelled' and payload->'creationProblem'->>'resolvedStepId' = sReal from public.onboarding_steps where id = pP2)
    and (select status = 'pending' and published_at is not null from public.onboarding_steps where id = sReal)
    and vb,
    'got', jsonb_build_object('retry', res, 'real', sReal));
  out := out || jsonb_build_object('t', 'P.8ב רגרסיית סדר הקשתות: התלוי מחכה לבקשה החדשה ונשאר נעול', 'pass',
    v = 'locked' and exists (select 1 from public.onboarding_step_dependencies d
                              join public.onboarding_steps s on s.id = d.step_id
                             where s.flow_run_id = runP2 and s.flow_item_key = 'nx' and d.depends_on_step_id = sReal),
    'got', v);
  exception when others then
    out := out || jsonb_build_object('t', 'קרס: P.8 · «צור שוב» שמצליח', 'pass', false, 'got', sqlerrm);
  end;
  execute 'set local role postgres';

  -- ── P.9 · ביטול המסלול מבטל גם את השורה ──────────────────────────────────
  begin
  insert into public.clients (id, user_id, first_name, last_name, email, lifecycle_stage, family_status, dealer_type)
  values (cP3, uid, 'בדיקה', 'QAR4R', 'delivered@resend.dev', 'onboarding', 'single', 'licensed');
  insert into public.engagements (id, user_id, client_id, status, process_published_at) values (eP3, uid, cP3, 'onboarding', now());
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', uid::text, true);
  execute 'set local role authenticated';
  runP3 := public.start_flow_run(cP3, fP1, null, false)->>'runId';
  res := public.cancel_flow_run(runP3);
  execute 'set local role postgres';
  select id into pP3 from public.onboarding_steps where client_id = cP3 and payload ? 'creationProblem';
  out := out || jsonb_build_object('t', 'P.9 ביטול המסלול ⇒ שורת «לא נוצרה» מבוטלת איתו', 'pass',
    pP3 is not null and (select status = 'cancelled' from public.onboarding_steps where id = pP3), 'got', res);
  exception when others then
    out := out || jsonb_build_object('t', 'קרס: P.9 · ביטול המסלול', 'pass', false, 'got', sqlerrm);
  end;
  execute 'set local role postgres';

  -- ── P.10–P.13 · המחולל (אישור הצעה) ─────────────────────────────────────
  begin
  insert into public.clients (id, user_id, first_name, last_name, email, lifecycle_stage, family_status, dealer_type)
  values (cG, uid, 'בדיקה', 'QAR4G', 'delivered@resend.dev', 'onboarding', 'single', 'licensed');
  insert into public.engagements (id, user_id, client_id, status, process_published_at,
                                  journey_default_snapshot, journey_default_facts)
  values (eG, uid, cG, 'onboarding', now(),
    jsonb_build_array(
      jsonb_build_object('key', 'od1', 'source', 'office', 'stepType', 'custom_request', 'enabled', true, 'sortIndex', 110,
                         'documentId', 'qa-gone-r4g', 'payload', jsonb_build_object('title', 'מדריך הוצאות שנמחק')),
      jsonb_build_object('key', 'od2', 'source', 'office', 'stepType', 'client_documents', 'enabled', true, 'sortIndex', 120,
                         'payload', jsonb_build_object('checklist', jsonb_build_array(jsonb_build_object('key', 'a', 'label', 'תלוש', 'done', false)))),
      jsonb_build_object('key', 'od3', 'source', 'office', 'stepType', 'custom_request', 'enabled', true, 'sortIndex', 130,
                         'templateId', tplmiss)),
    '{"monthly":false,"paperless":false,"licensed":true,"rep":false,"has_prev":false,"new_business":false,"no_prev_email":true,"married":false,"kind":"licensed_dealer"}'::jsonb);
  insert into public.onboarding_steps (user_id, engagement_id, client_id, step_type, track, scope, status, ball, payload, published_at)
  values (uid, eG, cG, 'client_documents', 'tools', 'person', 'pending', 'client',
          '{"checklist":[{"key":"x","label":"קיים","done":false}]}', now());
  -- הרצה יבשה: מנבאת, לא כותבת
  res := public.generate_onboarding_steps(eG, true);
  select count(*) into vi from public.onboarding_steps where client_id = cG and payload ? 'creationProblem';
  out := out || jsonb_build_object('t', 'P.10א הרצה יבשה ⇒ שתי בעיות צפויות, בנפרד מ-planned, ושום שורה', 'pass',
    jsonb_array_length(res->'problems') = 2 and vi = 0
    and not exists (select 1 from jsonb_array_elements(res->'planned') x where x->>'officeKey' in ('od1', 'od3'))
    and exists (select 1 from jsonb_array_elements(res->'planned') x where x->>'officeKey' = 'od2'),
    'got', res);
  res := public.generate_onboarding_steps(eG, false);
  select id into gp1 from public.onboarding_steps where client_id = cG and payload->'creationProblem'->>'key' = 'gen:' || eG || ':od1';
  select id into gp3 from public.onboarding_steps where client_id = cG and payload->'creationProblem'->>'key' = 'gen:' || eG || ':od3';
  select count(*) into vi from public.onboarding_steps where client_id = cG and payload ? 'creationProblem';
  select count(*) into vj from public.accountant_notifications where client_id = cG and kind = 'request_not_created';
  out := out || jsonb_build_object('t', 'P.10 המחולל: מסמך שנמחק ובקשה שנמחקה (בלי עותק — היה שקט) ⇒ שתי שורות; כבר קיימת ⇒ לא; מייל אחד למשרד', 'pass',
    vi = 2 and gp1 is not null and gp3 is not null and vj = 1
    and (select payload->'creationProblem'->>'reason' = 'library_item_missing' and payload->'creationProblem'->>'source' = 'generator'
                and payload->'creationProblem'->>'entryKey' = 'od1' and payload->'creationProblem'->>'engagementId' = eG
                and required_for_close and ball = 'me' and payload->>'title' = 'לא נוצרה — «מדריך הוצאות שנמחק»'
           from public.onboarding_steps where id = gp1)
    and (select payload->'creationProblem'->'ref'->>'templateId' = tplmiss from public.onboarding_steps where id = gp3)
    and (select jsonb_array_length(payload->'titles') = 2 and payload->>'engagementId' = eG
           from public.accountant_notifications where client_id = cG and kind = 'request_not_created' limit 1)
    and not exists (select 1 from public.onboarding_events where engagement_id = eG and note like 'בקשת ברירת מחדל לא נוצרה%'),
    'got', jsonb_build_object('gen', res, 'rows', vi, 'mail', vj));
  res := public.generate_onboarding_steps(eG, false);
  select count(*) into vi from public.onboarding_steps where client_id = cG and payload ? 'creationProblem';
  select count(*) into vj from public.accountant_notifications where client_id = cG and kind = 'request_not_created';
  out := out || jsonb_build_object('t', 'P.11 הרצה חוזרת ⇒ אותן שתי שורות, בלי ניסיון שקט ובלי מייל נוסף', 'pass',
    vi = 2 and vj = 1 and (select (payload->'creationProblem'->>'attempts')::int = 1 from public.onboarding_steps where id = gp1),
    'got', jsonb_build_object('rows', vi, 'mail', vj));
  perform set_config('request.jwt.claims', json_build_object('sub', other, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', other::text, true);
  execute 'set local role authenticated';
  res := public.retry_request_creation(gp1);
  execute 'set local role postgres';
  out := out || jsonb_build_object('t', 'P.12 «צור שוב» ממשתמש אחר ⇒ forbidden', 'pass', res->>'error' = 'forbidden', 'got', res);
  insert into public.journey_templates (id, user_id, office_id, kind, name, entries)
  values (tplmiss, uid, v_office, 'request', 'QA R4 חזרה לספרייה',
          '[{"key":"e1","stepType":"custom_request","owner":"client","requiredForClose":true,"payload":{"title":"QA R4 חזרה","clientTitle":"QA R4 חזרה","requirements":[{"key":"r1","kind":"confirm","label":"אישור","done":false,"required":true}]}}]');
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', uid::text, true);
  execute 'set local role authenticated';
  res := public.retry_request_creation(gp3);
  res2 := public.retry_request_creation(gp1);
  execute 'set local role postgres';
  select id into sx from public.onboarding_steps where client_id = cG and payload->'defaultOrigin'->>'key' = 'od3' and status <> 'cancelled';
  out := out || jsonb_build_object('t', 'P.13 הבקשה חזרה לספרייה ⇒ «צור שוב» יוצר אותה כמו האישור; השורה נסגרה', 'pass',
    coalesce((res->>'resolved')::boolean, false) and res->>'how' = 'created' and res->>'stepId' = sx
    and (select status = 'cancelled' and payload->'creationProblem'->>'resolvedStepId' = sx from public.onboarding_steps where id = gp3)
    and (select payload->>'title' = 'QA R4 חזרה' and required_for_close from public.onboarding_steps where id = sx),
    'got', jsonb_build_object('retry', res, 'step', sx));
  out := out || jsonb_build_object('t', 'P.13א המסמך עדיין חסר ⇒ resolved=false, attempts=2', 'pass',
    not coalesce((res2->>'resolved')::boolean, true) and res2->>'reason' = 'library_item_missing'
    and (select (payload->'creationProblem'->>'attempts')::int = 2 and status = 'pending' from public.onboarding_steps where id = gp1),
    'got', res2);
  res := public.onboarding_close_readiness(eG);
  out := out || jsonb_build_object('t', 'P.13ב שורה פתוחה שנדרשת לסגירה ⇒ הקליטה לא «מוכנה»', 'pass',
    not (res->>'ready')::boolean and exists (select 1 from jsonb_array_elements(res->'blocking') x where x->>'id' = gp1)
    and res->'kindHold' = 'null'::jsonb,
    'got', res);
  exception when others then
    out := out || jsonb_build_object('t', 'קרס: P.10–P.13 · המחולל', 'pass', false, 'got', sqlerrm);
  end;
  execute 'set local role postgres';

  -- ══ K · סוג העוסק לא ידוע ═══════════════════════════════════════════════
  begin
  -- רשימות הקליטה של המשרד: זהות לשלושת הסוגים חוץ מ — «רק לפטור» (qar4x), החברה בלי «עדכון
  -- סטטוס מס», ומשותפת (qar4s) ומדריך שנמחק (qar4g) בכולן. ואז מסלול קליטה חדש מהרשימות.
  perform public.seed_office_journey_defaults(v_office);
  ks := jsonb_build_object('key', 'qar4s', 'stepType', 'custom_request', 'enabled', true, 'sortIndex', 200, 'source', 'office',
          'requiredForClose', true, 'dueInDays', null, 'dependsOn', null, 'variants', '[]'::jsonb,
          'payload', '{"title":"QA R4 משותפת","clientTitle":"QA R4 משותפת","requirements":[{"key":"r1","kind":"confirm","label":"אישור","done":false,"required":true}]}'::jsonb);
  kx := jsonb_build_object('key', 'qar4x', 'stepType', 'custom_request', 'enabled', true, 'sortIndex', 210, 'source', 'office',
          'requiredForClose', true, 'dueInDays', null, 'dependsOn', null, 'variants', '[]'::jsonb,
          'payload', '{"title":"QA R4 רק לפטור","clientTitle":"QA R4 רק לפטור","requirements":[{"key":"r1","kind":"confirm","label":"אישור","done":false,"required":true}]}'::jsonb);
  kg := jsonb_build_object('key', 'qar4g', 'stepType', 'custom_request', 'enabled', true, 'sortIndex', 220, 'source', 'office',
          'requiredForClose', true, 'dueInDays', null, 'dependsOn', null, 'variants', '[]'::jsonb, 'documentId', 'qa-gone-r4k',
          'payload', '{"title":"QA R4 מדריך שנמחק","clientTitle":"QA R4 מדריך שנמחק","clientResource":"qa-gone-r4k","requirements":[{"key":"reviewed","kind":"confirm","label":"עברתי על המדריך","done":false,"required":true}]}'::jsonb);
  update public.office_flows set status = 'archived' where office_id = v_office and trigger = 'quote_approved';
  update public.office_journey_defaults set entries = public.default_journey_entries('licensed_dealer') || jsonb_build_array(ks, kg)
   where office_id = v_office and client_kind = 'licensed_dealer';
  update public.office_journey_defaults set entries = public.default_journey_entries('exempt_dealer') || jsonb_build_array(ks, kx, kg)
   where office_id = v_office and client_kind = 'exempt_dealer';
  update public.office_journey_defaults
     set entries = coalesce((select jsonb_agg(x) from jsonb_array_elements(public.default_journey_entries('company')) x
                              where x->>'stepType' <> 'intake_questionnaire'), '[]'::jsonb) || jsonb_build_array(ks, kg)
   where office_id = v_office and client_kind = 'company';
  perform public.ensure_onboarding_flow(v_office);
  res := public._kind_dependent_entries(v_office);
  out := out || jsonb_build_object('t', 'K.0 מה שונה בין הסוגים: פייפרלס לרשות המסים, «עדכון סטטוס מס», «רק לפטור» — ולא המשותפת', 'pass',
    (select array_agg(x order by x) from jsonb_array_elements_text(res->'keys') x)
      = array['intake_questionnaire', 'paperless_tax_authority', 'qar4x']
    and jsonb_array_length(res->'lists'->'exempt_dealer') = 2,
    'got', res->'keys');
  -- K.0א · בקשת משרד במסלול הקליטה שנפתחת «אחרי» בקשה שמחכה לסוג — מחכה גם היא (בלי הורה היא הייתה נפתחת מיד)
  select id, current_version into fK, vi from public.office_flows
   where office_id = v_office and trigger = 'quote_approved' and status = 'active';
  insert into public.office_flow_versions (flow_id, version, definition, note)
  select fK, vi + 1,
         jsonb_set(v.definition, '{stages,0,items}', (v.definition->'stages'->0->'items') || jsonb_build_array(
           jsonb_build_object('key', 'qar4a', 'ref', jsonb_build_object('kind', 'template', 'templateId', tplok),
                              'after', 'paperless_tax_authority'))),
         'QA R4 אחרי'
    from public.office_flow_versions v where v.flow_id = fK and v.version = vi;
  update public.office_flows set current_version = vi + 1 where id = fK;
  res2 := public._kind_dependent_entries(v_office);
  update public.office_flows set current_version = vi where id = fK;
  delete from public.office_flow_versions where flow_id = fK and version = vi + 1;
  out := out || jsonb_build_object('t', 'K.0א «נפתח אחרי» בקשה שמחכה לסוג (במסלול הקליטה) ⇒ מחכה גם היא', 'pass',
    res2->'keys' ? 'qar4a' and not (res->'keys' ? 'qar4a'), 'got', res2->'keys');
  exception when others then
    out := out || jsonb_build_object('t', 'קרס: K.0 · הכנת רשימות המשרד', 'pass', false, 'got', sqlerrm);
  end;
  execute 'set local role postgres';

  -- לקוח שאושר בלי סוג (בלי תבנית, בלי סוג בכרטיס)
  begin
  for vk in 1..4 loop
    kq := 'qar4kq' || vk || substr(md5(random()::text), 1, 8);
    kt := md5(random()::text);
    insert into public.leads (id, user_id, full_name, email, phone, status, has_previous_accountant)
    values ('qar4kl' || kq, uid, 'סוג QAR4K', 'delivered@resend.dev', '050-021700' || vk, 'new', false);
    insert into public.quotations (id, user_id, lead_id, quotation_number, status, public_token, items, representation, vat_rate, sent_at)
    values (kq, uid, 'qar4kl' || kq, 'QAR4K-' || kq, 'sent', kt,
            '[{"id":"i1","serviceId":"s1","name":"הנהלת חשבונות","category":"monthly","billingType":"monthly","catalogPrice":1200,"clientPrice":1200,"quantity":1,"vatFlag":true}]',
            '{"enabled":false,"areas":{},"spouse":null,"prefill":{"firstName":"סוג","lastName":"QAR4K","email":"delivered@resend.dev"}}', 18, now());
    perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', uid::text, true);
    execute 'set local role authenticated';
    res := public.ensure_client_for_quotation(kq);
    execute 'set local role postgres';
    select client_id into v from public.quotations where id = kq;
    update public.clients set dealer_type = null, vat_status = null where id = v;
    perform set_config('request.jwt.claims', '{"role":"anon"}', true);
    perform set_config('request.jwt.claim.sub', '', true);
    execute 'set local role anon';
    res := public.approve_quotation(kt, null, 'QAR4K');
    execute 'set local role postgres';
    perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', uid::text, true);
    select id into v2 from public.engagements where client_id = v order by created_at desc limit 1;
    if vk = 1 then kc1 := v; ke1 := v2; end if;
    if vk = 2 then kc2 := v; ke2 := v2; end if;
    if vk = 3 then kc3 := v; ke3 := v2; end if;
    if vk = 4 then kc4 := v; ke4 := v2; end if;
    if vk = 1 then sy := kt; end if;
  end loop;
  exception when others then
    out := out || jsonb_build_object('t', 'קרס: K · אישור לקוחות בלי סוג', 'pass', false, 'got', sqlerrm);
  end;
  execute 'set local role postgres';
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', uid::text, true);

  begin
  select kind_hold into e_hold from public.engagements where id = ke1;
  select id into krun1 from public.flow_runs where client_id = kc1 and cycle_key = ke1;
  out := out || jsonb_build_object('t', 'K.1 סוג לא ידוע ⇒ ממתין; בעובדות kind ריק, kindPending, צילום מרשימת המורשה', 'pass',
    e_hold is not null and e_hold->>'resolvedAt' is null
    and (select journey_default_facts->>'kind' is null and journey_default_facts->>'kindPending' = 'true'
                and journey_default_facts->>'kindFallback' = 'true' and journey_default_facts->>'snapshotKind' = 'licensed_dealer'
                and journey_default_snapshot is not null
           from public.engagements where id = ke1),
    'got', jsonb_build_object('hold', e_hold - 'lists', 'facts', (select journey_default_facts from public.engagements where id = ke1)));
  out := out || jsonb_build_object('t', 'K.2 «חיבור פייפרלס לרשות המסים» לא נוצר בניחוש — מחכה לסוג', 'pass',
    not exists (select 1 from public.onboarding_steps where client_id = kc1 and step_type = 'paperless_tax_authority')
    and exists (select 1 from jsonb_array_elements(e_hold->'held') h
                 where h->>'key' = 'paperless_tax_authority' and h->>'title' = 'חיבור פייפרלס לרשות המסים'),
    'got', e_hold->'held');
  out := out || jsonb_build_object('t', 'K.3 «רק לפטור» ו«עדכון סטטוס מס» מחכים; המשותפת נוצרה', 'pass',
    not exists (select 1 from public.onboarding_steps where client_id = kc1 and payload->'defaultOrigin'->>'key' = 'qar4x')
    and not exists (select 1 from public.onboarding_steps where client_id = kc1 and step_type = 'intake_questionnaire')
    and exists (select 1 from jsonb_array_elements(e_hold->'held') h where h->>'key' = 'qar4x' and h->>'title' = 'QA R4 רק לפטור')
    and exists (select 1 from jsonb_array_elements(e_hold->'held') h where h->>'key' = 'intake_questionnaire')
    and jsonb_array_length(e_hold->'held') = 3
    and exists (select 1 from public.onboarding_steps where client_id = kc1 and payload->'defaultOrigin'->>'key' = 'qar4s'),
    'got', e_hold->'held');
  out := out || jsonb_build_object('t', 'K.4 כל השאר נפתח: מסמכים, הרשמה וחיבור לפייפרלס, הרשאת תשלום', 'pass',
    (select count(distinct step_type) from public.onboarding_steps where client_id = kc1 and status <> 'cancelled'
       and step_type in ('client_documents', 'paperless_invite', 'paperless_connection', 'retainer_authorization')) = 4,
    'got', (select jsonb_agg(step_type) from public.onboarding_steps where client_id = kc1));
  out := out || jsonb_build_object('t', 'K.5 מסלול הקליטה: הסוג ריק (לא «מורשה»)', 'pass',
    krun1 is not null and (select facts->>'kind' is null from public.flow_runs where id = krun1),
    'got', (select facts from public.flow_runs where id = krun1));
  res := public.onboarding_close_readiness(ke1);
  out := out || jsonb_build_object('t', 'K.6 מוכנות לסגירה: לא מוכנה, ו-kindHold מחזיר מה מחכה', 'pass',
    not (res->>'ready')::boolean and (res->'kindHold'->>'count')::int = 3 and not (res->'kindHold' ? 'lists'),
    'got', res);
  out := out || jsonb_build_object('t', 'K.6א מדריך שנמחק באישור ⇒ «לא נוצרה» מוצמדת לפריט שלה במסלול הקליטה, בדף המשרד, ומייל אחד', 'pass',
    (select flow_run_id = krun1 and flow_item_key = 'qar4g' and published_at is not null and status = 'pending'
            and not (payload ? 'delivery')
       from public.onboarding_steps where client_id = kc1 and payload->'creationProblem'->>'key' = 'gen:' || ke1 || ':qar4g')
    and (select count(*) from public.accountant_notifications where client_id = kc1 and kind = 'request_not_created') = 1,
    'got', (select jsonb_agg(jsonb_build_object('run', flow_run_id, 'item', flow_item_key, 'pub', published_at))
              from public.onboarding_steps where client_id = kc1 and payload ? 'creationProblem'));
  res := public.generate_onboarding_steps(ke1, true);
  out := out || jsonb_build_object('t', 'K.6ב הרצה יבשה בזמן ההמתנה: kindPending ומה מחכה', 'pass',
    (res->>'kindPending')::boolean and jsonb_array_length(res->'held') = 3, 'got', res - 'planned');
  -- retry_kind_hold כשעדיין לא ידוע / ממשתמש אחר
  perform set_config('request.jwt.claims', json_build_object('sub', other, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', other::text, true);
  execute 'set local role authenticated';
  res2 := public.retry_kind_hold(kc1);
  execute 'set local role postgres';
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', uid::text, true);
  execute 'set local role authenticated';
  res := public.retry_kind_hold(kc1);
  execute 'set local role postgres';
  out := out || jsonb_build_object('t', 'K.6ג «לפתוח את הבקשות שחיכו» כשהסוג עוד לא ידוע ⇒ kind_unknown; משתמש אחר ⇒ forbidden', 'pass',
    res->>'error' = 'kind_unknown' and res2->>'error' = 'forbidden', 'got', jsonb_build_array(res, res2));
  exception when others then
    out := out || jsonb_build_object('t', 'קרס: K.1–K.6 · לקוח בלי סוג', 'pass', false, 'got', sqlerrm);
  end;
  execute 'set local role postgres';

  begin
  select count(*) into n_before from public.onboarding_steps where client_id = kc1 and status <> 'cancelled';
  update public.clients set dealer_type = 'exempt' where id = kc1;
  select kind_hold into e_hold from public.engagements where id = ke1;
  out := out || jsonb_build_object('t', 'K.7 «עוסק פטור» בכרטיס ⇒ «רק לפטור» ו«עדכון סטטוס מס» נפתחו (במסלול הקליטה); פייפרלס לרשות — לא', 'pass',
    e_hold->>'resolvedAt' is not null and e_hold->>'resolvedKind' = 'exempt_dealer'
    and (select count(*) from public.onboarding_steps where client_id = kc1 and payload->'defaultOrigin'->>'key' = 'qar4x') = 1
    and (select flow_run_id = krun1 from public.onboarding_steps where client_id = kc1 and payload->'defaultOrigin'->>'key' = 'qar4x')
    and exists (select 1 from public.onboarding_steps where client_id = kc1 and step_type = 'intake_questionnaire')
    and not exists (select 1 from public.onboarding_steps where client_id = kc1 and step_type = 'paperless_tax_authority')
    and e_hold->'notApplicable' ? 'paperless_tax_authority'
    and (select journey_default_facts->>'kind' = 'exempt_dealer' and journey_default_facts->>'kindPending' = 'false'
           from public.engagements where id = ke1)
    and (select facts->>'kind' = 'exempt_dealer' from public.flow_runs where id = krun1)
    and (public.onboarding_close_readiness(ke1)->'kindHold') = 'null'::jsonb,
    'got', e_hold - 'lists');
  select count(*) into n_before from public.onboarding_steps where client_id = kc1 and status <> 'cancelled';
  update public.clients set vat_status = 'exemptDealer' where id = kc1;
  select count(*) into n_after from public.onboarding_steps where client_id = kc1 and status <> 'cancelled';
  out := out || jsonb_build_object('t', 'K.8 שינוי נוסף בסיווג ⇒ כלום לא נפתח שוב', 'pass', n_after = n_before,
    'got', jsonb_build_array(n_before, n_after));
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  perform set_config('request.jwt.claim.sub', '', true);
  execute 'set local role anon';
  res := public.approve_quotation(sy, null, 'QAR4K');
  execute 'set local role postgres';
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', uid::text, true);
  select count(*) into n_after from public.onboarding_steps where client_id = kc1 and status <> 'cancelled';
  out := out || jsonb_build_object('t', 'K.9 אישור חוזר של ההצעה ⇒ כלום לא נפתח שוב', 'pass', n_after = n_before,
    'got', jsonb_build_object('before', n_before, 'after', n_after, 'approve', res));
  -- P.14 · ביטול מסלול הקליטה (גם שורת «לא נוצרה» מבוטלת איתו) ואישור חוזר ⇒ השורה לא חוזרת, ואין מייל נוסף
  execute 'set local role authenticated';
  res := public.cancel_flow_run(krun1);
  execute 'set local role postgres';
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  perform set_config('request.jwt.claim.sub', '', true);
  execute 'set local role anon';
  res2 := public.approve_quotation(sy, null, 'QAR4K');
  execute 'set local role postgres';
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', uid::text, true);
  out := out || jsonb_build_object('t', 'P.14 ביטול מסלול הקליטה ואישור חוזר ⇒ «לא נוצרה» לא חוזרת לחיים, בלי מייל נוסף', 'pass',
    coalesce((res->>'ok')::boolean, false)
    and not exists (select 1 from public.onboarding_steps where client_id = kc1 and payload ? 'creationProblem'
                     and status not in ('completed', 'verified', 'skipped', 'cancelled'))
    and (select count(*) from public.onboarding_steps where client_id = kc1 and payload ? 'creationProblem') = 1
    and (select count(*) from public.accountant_notifications where client_id = kc1 and kind = 'request_not_created') = 1,
    'got', jsonb_build_object('cancel', res, 'approve', res2));
  exception when others then
    out := out || jsonb_build_object('t', 'קרס: K.7–K.9 · עוסק פטור', 'pass', false, 'got', sqlerrm);
  end;
  execute 'set local role postgres';
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', uid::text, true);

  begin
  update public.clients set dealer_type = 'licensed' where id = kc2;
  select kind_hold into e_hold from public.engagements where id = ke2;
  out := out || jsonb_build_object('t', 'K.10 «עוסק מורשה» ⇒ פייפרלס לרשות המסים פעם אחת (השחרור + 132 בלי כפילות); «רק לפטור» — לא חלה', 'pass',
    (select count(*) from public.onboarding_steps where client_id = kc2 and step_type = 'paperless_tax_authority') = 1
    and exists (select 1 from public.onboarding_steps where client_id = kc2 and step_type = 'intake_questionnaire')
    and not exists (select 1 from public.onboarding_steps where client_id = kc2 and payload->'defaultOrigin'->>'key' = 'qar4x')
    and e_hold->'notApplicable' ? 'qar4x' and e_hold->>'resolvedKind' = 'licensed_dealer'
    and (select flow_run_id is not null from public.onboarding_steps where client_id = kc2 and step_type = 'paperless_tax_authority'),
    'got', e_hold - 'lists');

  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  res := public.create_onboarding_request(p_client_id => kc3, p_step_type => 'paperless_tax_authority',
           p_payload => '{"clientTitle":"חיבור פייפרלס לרשות המסים"}'::jsonb, p_due_date => null, p_depends_on => null,
           p_published => true, p_required_for_close => true, p_owner => null, p_stage_id => null);
  execute 'set local role postgres';
  update public.clients set dealer_type = 'licensed' where id = kc3;
  out := out || jsonb_build_object('t', 'K.11 המשרד הוסיף ידנית בזמן ההמתנה ⇒ אחרי קביעת הסוג — עדיין אחת', 'pass',
    coalesce((res->>'ok')::boolean, false)
    and (select count(*) from public.onboarding_steps where client_id = kc3 and step_type = 'paperless_tax_authority' and status <> 'cancelled') = 1,
    'got', res);

  select id into krun4 from public.flow_runs where client_id = kc4 and cycle_key = ke4;
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  res := public.pause_flow_run(krun4);
  execute 'set local role postgres';
  select count(*) into vi from public.client_notices where client_id = kc4 and status = 'queued';
  update public.clients set dealer_type = 'company' where id = kc4;
  select count(*) into vj from public.client_notices where client_id = kc4 and status = 'queued';
  out := out || jsonb_build_object('t', 'K.12 מסלול הקליטה בעצירה ⇒ השחרור פותח את הבקשות, בלי מייל בתור; הריצה נשארת בעצירה', 'pass',
    coalesce((res->>'ok')::boolean, false)
    and exists (select 1 from public.onboarding_steps where client_id = kc4 and step_type = 'paperless_tax_authority')
    and not exists (select 1 from public.onboarding_steps where client_id = kc4 and step_type = 'intake_questionnaire')
    and vi = vj
    and (select status = 'paused' and facts->>'kind' = 'company' from public.flow_runs where id = krun4),
    'got', jsonb_build_object('pause', res, 'queued', jsonb_build_array(vi, vj),
                              'hold', (select kind_hold - 'lists' from public.engagements where id = ke4)));
  exception when others then
    out := out || jsonb_build_object('t', 'קרס: K.10–K.12', 'pass', false, 'got', sqlerrm);
  end;
  execute 'set local role postgres';
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', uid::text, true);

  begin
  -- K.13 · תבנית «מותאמת» + עוסק פטור בכרטיס
  insert into public.quotation_templates (user_id, name, kind) values (uid, 'QA R4 מותאמת', 'custom') returning id into qtpl;
  kq := 'qar4kc' || substr(md5(random()::text), 1, 8);
  kt := md5(random()::text);
  insert into public.leads (id, user_id, full_name, email, phone, status, has_previous_accountant)
  values ('qar4kl' || kq, uid, 'מותאמת QAR4K', 'delivered@resend.dev', '050-0217099', 'new', false);
  insert into public.quotations (id, user_id, lead_id, quotation_number, status, public_token, items, representation, vat_rate, sent_at, template_id)
  values (kq, uid, 'qar4kl' || kq, 'QAR4KC-' || kq, 'sent', kt,
          '[{"id":"i1","serviceId":"s1","name":"הנהלת חשבונות","category":"monthly","billingType":"monthly","catalogPrice":1200,"clientPrice":1200,"quantity":1,"vatFlag":true}]',
          '{"enabled":false,"areas":{},"spouse":null,"prefill":{"firstName":"מותאמת","lastName":"QAR4K","email":"delivered@resend.dev"}}', 18, now(), qtpl);
  execute 'set local role authenticated';
  res := public.ensure_client_for_quotation(kq);
  execute 'set local role postgres';
  select client_id into kc5 from public.quotations where id = kq;
  update public.clients set dealer_type = 'exempt' where id = kc5;
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  perform set_config('request.jwt.claim.sub', '', true);
  execute 'set local role anon';
  res := public.approve_quotation(kt, null, 'QAR4K');
  execute 'set local role postgres';
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', uid::text, true);
  select id into ke5 from public.engagements where client_id = kc5 order by created_at desc limit 1;
  out := out || jsonb_build_object('t', 'K.13 «מותאמת» + עוסק פטור בכרטיס ⇒ הסוג מהכרטיס, לא «ניחוש», בלי המתנה', 'pass',
    (select journey_default_facts->>'kind' = 'exempt_dealer' and journey_default_facts->>'kindFallback' = 'false'
            and journey_default_facts->>'snapshotKind' = 'exempt_dealer' and kind_hold is null
       from public.engagements where id = ke5)
    and exists (select 1 from public.onboarding_steps where client_id = kc5 and payload->'defaultOrigin'->>'key' = 'qar4x'),
    'got', (select journey_default_facts from public.engagements where id = ke5));

  -- K.14 · התקשרות מלפני 217 עם «מורשה» מנוחש, וכרטיס ריק ⇒ הסוג לא ידוע (לא «מורשה»)
  insert into public.clients (id, user_id, first_name, last_name, email, lifecycle_stage, family_status)
  values (kc6, uid, 'בדיקה', 'QAR4K6', 'delivered@resend.dev', 'active', 'single');
  insert into public.engagements (id, user_id, client_id, status, journey_default_facts)
  values (ke6, uid, kc6, 'active', '{"kind":"licensed_dealer","kindFallback":true,"licensed":false}');
  insert into public.clients (id, user_id, first_name, last_name, email, lifecycle_stage, family_status, dealer_type, vat_status)
  values (kc6b, uid, 'בדיקה', 'QAR4K6B', 'delivered@resend.dev', 'active', 'single', 'exempt', null);
  insert into public.engagements (id, user_id, client_id, status, journey_default_facts)
  values (ke6b, uid, kc6b, 'active', '{"kind":"licensed_dealer","licensed":true}');
  out := out || jsonb_build_object('t', 'K.14 ניחוש ישן (kindFallback) לא גובר על הכרטיס; עוסק פטור בלי סיווג מע״מ אינו «מורשה»', 'pass',
    public.client_flow_facts(kc6, ke6)->>'kind' is null
    and public.client_flow_facts(kc6, ke6)->>'licensed' = 'false'
    and public.client_flow_facts(kc6b, ke6b)->>'licensed' = 'false',
    'got', jsonb_build_array(public.client_flow_facts(kc6, ke6), public.client_flow_facts(kc6b, ke6b)));
  exception when others then
    out := out || jsonb_build_object('t', 'קרס: K.13–K.14', 'pass', false, 'got', sqlerrm);
  end;
  execute 'set local role postgres';
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', uid::text, true);

  begin
  -- K.15 · מסלול ידני עם פריט «רק למורשה» ושלב «רק לחברה», כשהסוג לא ידוע
  insert into public.clients (id, user_id, first_name, last_name, email, lifecycle_stage, family_status)
  values (kc7, uid, 'בדיקה', 'QAR4K7', 'delivered@resend.dev', 'active', 'single');
  execute 'set local role authenticated';
  res := public.create_office_flow('QA R4 סוג', 'manual', jsonb_build_object('stages', jsonb_build_array(
    jsonb_build_object('key', 'a', 'name', 'כולם', 'opens', jsonb_build_object('after', 'start'), 'delivery', 'approve',
      'items', jsonb_build_array(
        jsonb_build_object('key', 'lic', 'ref', jsonb_build_object('kind', 'template', 'templateId', tplok),
                           'when', jsonb_build_object('kinds', jsonb_build_array('licensed_dealer'))),
        jsonb_build_object('key', 'three', 'ref', jsonb_build_object('kind', 'template', 'templateId', tplok),
                           'when', jsonb_build_object('kinds', jsonb_build_array('licensed_dealer', 'exempt_dealer', 'company', 'representation_only'))),
        jsonb_build_object('key', 'all', 'ref', jsonb_build_object('kind', 'template', 'templateId', tplok)))),
    jsonb_build_object('key', 'c', 'name', 'חברה', 'opens', jsonb_build_object('after', 'start'), 'delivery', 'approve',
      'when', jsonb_build_object('kinds', jsonb_build_array('company')),
      'items', jsonb_build_array(jsonb_build_object('key', 'co', 'ref', jsonb_build_object('kind', 'template', 'templateId', tplok)))))));
  fK := res->>'flowId';
  res := public.start_flow_run(kc7, fK, null, false);
  krun7 := res->>'runId';
  res2 := public.get_client_flow_runs(kc7);
  execute 'set local role postgres';
  out := out || jsonb_build_object('t', 'K.15 סוג לא ידוע: «רק למורשה» ⇒ kind_unknown (לא «לא חל», לא שורה אדומה); «לכולם חוץ מ…» נוצר; שלב «רק לחברה» מחכה', 'pass',
    exists (select 1 from jsonb_array_elements(res->'skipped') x where x->>'itemKey' = 'lic' and x->>'reason' = 'kind_unknown' and not (x ? 'problem'))
    and exists (select 1 from jsonb_array_elements(res->'skipped') x where x->>'itemKey' = 'co' and x->>'reason' = 'kind_unknown')
    and exists (select 1 from public.onboarding_steps where flow_run_id = krun7 and flow_item_key = 'three')
    and exists (select 1 from public.onboarding_steps where flow_run_id = krun7 and flow_item_key = 'all')
    and not exists (select 1 from public.onboarding_steps where client_id = kc7 and payload ? 'creationProblem')
    and (select (x->>'waitingKind')::boolean and x->>'state' = 'waiting'
           from jsonb_array_elements(res2->'runs') rr, jsonb_array_elements(rr->'stages') x
          where rr->>'id' = krun7 and x->>'key' = 'c')
    and (select not (x->>'waitingKind')::boolean from jsonb_array_elements(res2->'runs') rr, jsonb_array_elements(rr->'stages') x
          where rr->>'id' = krun7 and x->>'key' = 'a'),
    'got', jsonb_build_object('start', res, 'stages', (select rr->'stages' from jsonb_array_elements(res2->'runs') rr where rr->>'id' = krun7)));
  update public.clients set dealer_type = 'licensed' where id = kc7;
  execute 'set local role authenticated';
  res := public.flow_run_suggestions(krun7);
  res2 := public.flow_run_add_items(krun7, array['lic']);
  res3 := public.get_client_flow_runs(kc7);
  execute 'set local role postgres';
  out := out || jsonb_build_object('t', 'K.15א הסוג נקבע ⇒ «מתאים עכשיו» מציע את «רק למורשה»; ההוספה יוצרת, הריצה מקבלת את הסוג, שלב החברה «לא חל»', 'pass',
    exists (select 1 from jsonb_array_elements(res->'suggestions') x where x->>'kind' = 'add' and x->>'itemKey' = 'lic')
    and exists (select 1 from public.onboarding_steps where flow_run_id = krun7 and flow_item_key = 'lic')
    and (select facts->>'kind' = 'licensed_dealer' from public.flow_runs where id = krun7)
    and (select x->>'state' = 'not_applicable' from jsonb_array_elements(res3->'runs') rr, jsonb_array_elements(rr->'stages') x
          where rr->>'id' = krun7 and x->>'key' = 'c'),
    'got', jsonb_build_object('suggestions', res, 'add', res2));
  exception when others then
    out := out || jsonb_build_object('t', 'קרס: K.15 · מסלול ידני כשהסוג לא ידוע', 'pass', false, 'got', sqlerrm);
  end;
  execute 'set local role postgres';
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', uid::text, true);

  begin
  -- ══ B · get_client_flow_runs: willApply / when לשלב שמחכה (B1), kindWaitItems לכל שלב (B4) ═══════
  -- שלב a נפתח מיד: «רק למורשה», «רק לפטור», «לכולם». אחריו שלושה ענפים: «רק לחברה», «שלושת הסוגים», «רק לפטור».
  insert into public.clients (id, user_id, first_name, last_name, email, lifecycle_stage, family_status)
  values (bc1, uid, 'בדיקה', 'QAR4B1', 'delivered@resend.dev', 'active', 'single');
  insert into public.clients (id, user_id, first_name, last_name, email, lifecycle_stage, family_status, dealer_type)
  values (bc2, uid, 'בדיקה', 'QAR4B2', 'delivered@resend.dev', 'active', 'single', 'licensed');
  execute 'set local role authenticated';
  bres := public.create_office_flow('QA R4 ענפים', 'manual', jsonb_build_object('stages', jsonb_build_array(
    jsonb_build_object('key', 'a', 'name', 'פתיחה', 'opens', jsonb_build_object('after', 'start'), 'delivery', 'approve',
      'items', jsonb_build_array(
        jsonb_build_object('key', 'blic', 'ref', jsonb_build_object('kind', 'template', 'templateId', tplok),
                           'when', jsonb_build_object('kinds', jsonb_build_array('licensed_dealer'))),
        jsonb_build_object('key', 'bex', 'ref', jsonb_build_object('kind', 'template', 'templateId', tplok),
                           'when', jsonb_build_object('kinds', jsonb_build_array('exempt_dealer'))),
        jsonb_build_object('key', 'ball', 'ref', jsonb_build_object('kind', 'template', 'templateId', tplok)))),
    jsonb_build_object('key', 'b', 'name', 'חברה', 'opens', jsonb_build_object('after', 'stage', 'stage', 'a'), 'delivery', 'approve',
      'when', jsonb_build_object('kinds', jsonb_build_array('company')),
      'items', jsonb_build_array(jsonb_build_object('key', 'bco', 'ref', jsonb_build_object('kind', 'template', 'templateId', tplok)))),
    jsonb_build_object('key', 'c', 'name', 'שלושה', 'opens', jsonb_build_object('after', 'stage', 'stage', 'a'), 'delivery', 'approve',
      'when', jsonb_build_object('kinds', jsonb_build_array('licensed_dealer', 'exempt_dealer', 'company')),
      'items', jsonb_build_array(jsonb_build_object('key', 'bthree', 'ref', jsonb_build_object('kind', 'template', 'templateId', tplok)))),
    jsonb_build_object('key', 'e', 'name', 'פטור', 'opens', jsonb_build_object('after', 'stage', 'stage', 'a'), 'delivery', 'approve',
      'when', jsonb_build_object('kinds', jsonb_build_array('exempt_dealer')),
      'items', jsonb_build_array(jsonb_build_object('key', 'bexs', 'ref', jsonb_build_object('kind', 'template', 'templateId', tplok)))))));
  bflow := bres->>'flowId';
  brun := public.start_flow_run(bc1, bflow, null, false)->>'runId';
  brun2 := public.start_flow_run(bc2, bflow, null, false)->>'runId';
  bres := public.get_client_flow_runs(bc1);
  bres2 := public.get_client_flow_runs(bc2);
  execute 'set local role postgres';
  select jsonb_object_agg(x->>'key', jsonb_build_object('state', x->>'state', 'willApply', x->'willApply', 'waitingKind', x->'waitingKind',
                                                        'kindWaitItems', x->'kindWaitItems', 'when', x->'when', 'hasWillApply', x ? 'willApply'))
    into bst from jsonb_array_elements(bres->'runs') rr, jsonb_array_elements(rr->'stages') x where rr->>'id' = brun;
  out := out || jsonb_build_object('t', 'B.1 (B4) סוג לא ידוע: בשלב הפתוח 2 בקשות מחכות לסוג (ובלי willApply); «רק לחברה»/«רק לפטור» — מחכים לסוג, בקשה אחת כל אחד; «שלושת הסוגים» יחול', 'pass',
    bst->'a'->>'state' = 'open' and (bst->'a'->>'kindWaitItems')::int = 2 and not (bst->'a'->>'hasWillApply')::boolean
    and bst->'b'->>'state' = 'waiting' and (bst->'b'->>'waitingKind')::boolean and (bst->'b'->>'kindWaitItems')::int = 1
    and bst->'b'->'when' = '{"kinds":["company"]}'::jsonb
    and (bst->'e'->>'waitingKind')::boolean and (bst->'e'->>'kindWaitItems')::int = 1
    and bst->'c'->>'state' = 'waiting' and (bst->'c'->>'willApply')::boolean and not (bst->'c'->>'waitingKind')::boolean
    and (bst->'c'->>'kindWaitItems')::int = 0,
    'got', bst);
  select jsonb_object_agg(x->>'key', jsonb_build_object('state', x->>'state', 'willApply', x->'willApply', 'waitingKind', x->'waitingKind',
                                                        'kindWaitItems', x->'kindWaitItems'))
    into bst from jsonb_array_elements(bres2->'runs') rr, jsonb_array_elements(rr->'stages') x where rr->>'id' = brun2;
  out := out || jsonb_build_object('t', 'B.2 (B1) עוסק מורשה: ענף «רק לחברה»/«רק לפטור» — willApply=false (לא מחכה לסוג), «שלושת הסוגים» — true; אין מה שמחכה לסוג', 'pass',
    bst->'b'->>'state' = 'waiting' and not (bst->'b'->>'willApply')::boolean and not (bst->'b'->>'waitingKind')::boolean
    and bst->'e'->>'state' = 'waiting' and not (bst->'e'->>'willApply')::boolean
    and (bst->'c'->>'willApply')::boolean
    and (bst->'a'->>'kindWaitItems')::int = 0 and (bst->'b'->>'kindWaitItems')::int = 0,
    'got', bst);
  -- הסוג נקבע והבקשה נוספה מ«מתאים עכשיו» ⇒ בשלב הפתוח כבר לא נספרת כמחכה
  update public.clients set dealer_type = 'licensed' where id = bc1;
  execute 'set local role authenticated';
  bres2 := public.flow_run_add_items(brun, array['blic']);
  bres := public.get_client_flow_runs(bc1);
  execute 'set local role postgres';
  select x into bst from jsonb_array_elements(bres->'runs') rr, jsonb_array_elements(rr->'stages') x where rr->>'id' = brun and x->>'key' = 'a';
  out := out || jsonb_build_object('t', 'B.3 (B4) הסוג נקבע ו«רק למורשה» נוספה ⇒ בשלב הפתוח כבר אין מה שמחכה לסוג (העובדות של הריצה התעדכנו)', 'pass',
    (bst->>'kindWaitItems')::int = 0 and exists (select 1 from public.onboarding_steps where flow_run_id = brun and flow_item_key = 'blic'),
    'got', jsonb_build_object('stage', bst, 'add', bres2));
  exception when others then
    out := out || jsonb_build_object('t', 'קרס: B · get_client_flow_runs ענפים וסוג העוסק', 'pass', false, 'got', sqlerrm);
  end;
  execute 'set local role postgres';
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', uid::text, true);

  -- ══ V · flow_definition_error: «מסמכים מהלקוח» במסלול הקליטה, מצב בלי מסמכים (A:X-3) ═══════
  begin
  vdef := jsonb_build_object('stages', jsonb_build_array(jsonb_build_object(
    'key', 's1', 'name', 'פתיחת התיק', 'opens', jsonb_build_object('after', 'start'), 'delivery', 'hold',
    'items', jsonb_build_array(jsonb_build_object('key', 'client_documents',
      'ref', jsonb_build_object('kind', 'system', 'stepType', 'client_documents'),
      'system', jsonb_build_object('variants', jsonb_build_array(
        jsonb_build_object('key', 'new_business', 'fact', 'new_business', 'items', jsonb_build_array(jsonb_build_object('key', 'i1', 'label', 'תעודת עוסק'))),
        jsonb_build_object('key', 'default', 'fact', null, 'items', '[]'::jsonb))))))));
  verr1 := public.flow_definition_error(vdef, 'quote_approved');
  verr2 := public.flow_definition_error(jsonb_set(vdef, '{stages,0,items,0,system,variants,1,items}', '[{"key":"i1","label":"   "}]'::jsonb), 'quote_approved');
  verr3 := public.flow_definition_error(jsonb_set(vdef, '{stages,0,items,0,system,variants,1,items}', '[{"key":"i1","label":"צילום תעודת זהות"}]'::jsonb), 'quote_approved');
  verr4 := public.flow_definition_error(jsonb_set(vdef, '{stages,0,items,0,system}', '{}'::jsonb), 'quote_approved');
  out := out || jsonb_build_object('t', 'V.1 (A:X-3) מצב בלי אף מסמך (ריק / רק רווחים) ⇒ variant_without_documents; עם מסמך / בלי מצבים (הרשימות הקבועות) ⇒ תקין', 'pass',
    verr1 = 'variant_without_documents' and verr2 = 'variant_without_documents' and verr3 is null and verr4 is null,
    'got', jsonb_build_array(verr1, verr2, verr3, verr4));
  exception when others then
    out := out || jsonb_build_object('t', 'קרס: V · מצב בלי מסמכים', 'pass', false, 'got', sqlerrm);
  end;
  execute 'set local role postgres';

  begin
  -- K.16 · המשרד כיבה «חיבור פייפרלס לרשות המסים» למורשה ⇒ גם כשהלקוח נקבע כמורשה — לא נפתח (132)
  update public.office_journey_defaults
     set entries = (select jsonb_agg(case when x->>'stepType' = 'paperless_tax_authority'
                                          then x || '{"enabled":false}'::jsonb else x end)
                      from jsonb_array_elements(entries) x)
   where office_id = v_office and client_kind = 'licensed_dealer';
  kq := 'qar4kd' || substr(md5(random()::text), 1, 8);
  kt := md5(random()::text);
  insert into public.leads (id, user_id, full_name, email, phone, status, has_previous_accountant)
  values ('qar4kl' || kq, uid, 'כבוי QAR4K', 'delivered@resend.dev', '050-0217098', 'new', false);
  insert into public.quotations (id, user_id, lead_id, quotation_number, status, public_token, items, representation, vat_rate, sent_at)
  values (kq, uid, 'qar4kl' || kq, 'QAR4KD-' || kq, 'sent', kt,
          '[{"id":"i1","serviceId":"s1","name":"הנהלת חשבונות","category":"monthly","billingType":"monthly","catalogPrice":1200,"clientPrice":1200,"quantity":1,"vatFlag":true}]',
          '{"enabled":false,"areas":{},"spouse":null,"prefill":{"firstName":"כבוי","lastName":"QAR4K","email":"delivered@resend.dev"}}', 18, now());
  execute 'set local role authenticated';
  res := public.ensure_client_for_quotation(kq);
  execute 'set local role postgres';
  select client_id into kc8 from public.quotations where id = kq;
  update public.clients set dealer_type = null, vat_status = null where id = kc8;
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  perform set_config('request.jwt.claim.sub', '', true);
  execute 'set local role anon';
  res := public.approve_quotation(kt, null, 'QAR4K');
  execute 'set local role postgres';
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', uid::text, true);
  select id into ke8 from public.engagements where client_id = kc8 order by created_at desc limit 1;
  vb := exists (select 1 from public.engagements e, jsonb_array_elements(e.kind_hold->'held') h
                 where e.id = ke8 and h->>'key' = 'paperless_tax_authority');
  update public.clients set dealer_type = 'licensed' where id = kc8;
  select kind_hold into e_hold from public.engagements where id = ke8;
  out := out || jsonb_build_object('t', 'K.16 כבוי למורשה ⇒ מחכה (פעיל לחברה), ובקביעת «מורשה» לא נפתח — גם לא דרך 132', 'pass',
    vb and e_hold->>'resolvedKind' = 'licensed_dealer' and e_hold->'notApplicable' ? 'paperless_tax_authority'
    and not exists (select 1 from public.onboarding_steps where client_id = kc8 and step_type = 'paperless_tax_authority')
    and public.sync_paperless_tax_authority_step(kc8)->>'action' = 'disabled_by_office',
    'got', e_hold - 'lists');
  -- retry_kind_hold אחרי שהכול נפתח ⇒ אין מה לפתוח
  execute 'set local role authenticated';
  res := public.retry_kind_hold(kc8);
  execute 'set local role postgres';
  out := out || jsonb_build_object('t', 'K.17 «לפתוח את הבקשות שחיכו» כשאין מה ⇒ ok, 0', 'pass',
    coalesce((res->>'ok')::boolean, false) and (res->>'created')::int = 0, 'got', res);
  exception when others then
    out := out || jsonb_build_object('t', 'קרס: K.16–K.17', 'pass', false, 'got', sqlerrm);
  end;
  execute 'set local role postgres';

  begin
  -- K.18 · השחרור נכשל ⇒ שמירת הכרטיס לא נופלת; נרשם failedAt; «לפתוח את הבקשות שחיכו» אחרי התיקון
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', uid::text, true);
  kq9 := 'qar4kf' || substr(md5(random()::text), 1, 8);
  kt := md5(random()::text);
  insert into public.leads (id, user_id, full_name, email, phone, status, has_previous_accountant)
  values ('qar4kl' || kq9, uid, 'כשל QAR4K', 'delivered@resend.dev', '050-0217097', 'new', false);
  insert into public.quotations (id, user_id, lead_id, quotation_number, status, public_token, items, representation, vat_rate, sent_at)
  values (kq9, uid, 'qar4kl' || kq9, 'QAR4KF-' || kq9, 'sent', kt,
          '[{"id":"i1","serviceId":"s1","name":"הנהלת חשבונות","category":"monthly","billingType":"monthly","catalogPrice":1200,"clientPrice":1200,"quantity":1,"vatFlag":true}]',
          '{"enabled":false,"areas":{},"spouse":null,"prefill":{"firstName":"כשל","lastName":"QAR4K","email":"delivered@resend.dev"}}', 18, now());
  execute 'set local role authenticated';
  res := public.ensure_client_for_quotation(kq9);
  execute 'set local role postgres';
  select client_id into kc9 from public.quotations where id = kq9;
  update public.clients set dealer_type = null, vat_status = null where id = kc9;
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  perform set_config('request.jwt.claim.sub', '', true);
  execute 'set local role anon';
  res := public.approve_quotation(kt, null, 'QAR4K');
  execute 'set local role postgres';
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', uid::text, true);
  select id into ke9 from public.engagements where client_id = kc9 order by created_at desc limit 1;
  -- תקלה מדומה: פריטי ההצעה פגומים ⇒ המחולל נופל בתוך השחרור
  update public.quotations set items = '{}'::jsonb, snapshot = coalesce(snapshot, '{}'::jsonb) || '{"items":{}}'::jsonb where id = kq9;
  -- ‼ חברה (ב-K.16 המשרד כיבה את החיבור לרשות המסים למורשה, ולחברה לא)
  update public.clients set dealer_type = 'company' where id = kc9;
  select kind_hold into e_hold from public.engagements where id = ke9;
  out := out || jsonb_build_object('t', 'K.18 השחרור נכשל ⇒ «סוג העוסק» נשמר בכל זאת, ההמתנה נשארת עם failedAt, ונרשם ב«פעילות»', 'pass',
    (select dealer_type = 'company' from public.clients where id = kc9)
    and e_hold->>'resolvedAt' is null and e_hold->>'failedAt' is not null
    and not exists (select 1 from public.onboarding_steps where client_id = kc9 and step_type = 'paperless_tax_authority')
    and exists (select 1 from public.onboarding_events where engagement_id = ke9 and meta->>'kindHoldEvent' = 'release_failed')
    and (public.onboarding_close_readiness(ke9)->'kindHold'->>'failedAt') is not null,
    'got', e_hold - 'lists');
  -- K.18ב · «לפתוח את הבקשות שחיכו» כשהתקלה עדיין שם ⇒ release_failed, והכשל נרשם על ההתקשרות
  -- (המסך קורא את התוצאה מהשורה, לא מהתשובה). מנקים קודם כדי לראות שהניסיון הזה רשם.
  update public.engagements set kind_hold = kind_hold - 'failedAt' - 'error' where id = ke9;
  execute 'set local role authenticated';
  res := public.retry_kind_hold(kc9);
  execute 'set local role postgres';
  select kind_hold into e_hold from public.engagements where id = ke9;
  out := out || jsonb_build_object('t', 'K.18ב «לפתוח את הבקשות שחיכו» כשעדיין נכשל ⇒ release_failed; failedAt ו-error על ההתקשרות; עדיין ממתין', 'pass',
    res->>'error' = 'release_failed' and not coalesce((res->>'ok')::boolean, true)
    and e_hold->>'failedAt' is not null and nullif(e_hold->>'error', '') is not null and e_hold->>'resolvedAt' is null
    and not exists (select 1 from public.onboarding_steps where client_id = kc9 and step_type = 'paperless_tax_authority')
    and (select count(*) from public.onboarding_events where engagement_id = ke9 and meta->>'kindHoldEvent' = 'release_failed') = 2,
    'got', jsonb_build_object('retry', res, 'hold', e_hold - 'lists'));
  update public.quotations set items = '[{"id":"i1","serviceId":"s1","name":"הנהלת חשבונות","category":"monthly","billingType":"monthly","catalogPrice":1200,"clientPrice":1200,"quantity":1,"vatFlag":true}]'::jsonb,
         snapshot = snapshot - 'items' where id = kq9;
  execute 'set local role authenticated';
  res := public.retry_kind_hold(kc9);
  execute 'set local role postgres';
  select kind_hold into e_hold from public.engagements where id = ke9;
  out := out || jsonb_build_object('t', 'K.18א «לפתוח את הבקשות שחיכו» אחרי התיקון ⇒ נפתחו; ההמתנה נסגרה בלי failedAt', 'pass',
    coalesce((res->>'ok')::boolean, false) and (res->>'created')::int >= 1
    and e_hold->>'resolvedAt' is not null and not (e_hold ? 'failedAt')
    and (select count(*) from public.onboarding_steps where client_id = kc9 and step_type = 'paperless_tax_authority') = 1,
    'got', jsonb_build_object('retry', res, 'hold', e_hold - 'lists'));
  exception when others then
    out := out || jsonb_build_object('t', 'קרס: K.18 · כשל בשחרור', 'pass', false, 'got', sqlerrm);
  end;
  execute 'set local role postgres';

  begin
  -- K.19 · השמירה מהמסך (update_client_fields) — השחרור באותה טרנזקציה: קריאה מיד אחרי השמירה
  -- כבר רואה resolvedAt ו-created; created = בדיוק מה שהשחרור הזה פתח (לא מה שנוסף לפניו).
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', uid::text, true);
  kq10 := 'qar4kt' || substr(md5(random()::text), 1, 8);
  kt := md5(random()::text);
  insert into public.leads (id, user_id, full_name, email, phone, status, has_previous_accountant)
  values ('qar4kl' || kq10, uid, 'שמירה QAR4K', 'delivered@resend.dev', '050-0217096', 'new', false);
  insert into public.quotations (id, user_id, lead_id, quotation_number, status, public_token, items, representation, vat_rate, sent_at)
  values (kq10, uid, 'qar4kl' || kq10, 'QAR4KT-' || kq10, 'sent', kt,
          '[{"id":"i1","serviceId":"s1","name":"הנהלת חשבונות","category":"monthly","billingType":"monthly","catalogPrice":1200,"clientPrice":1200,"quantity":1,"vatFlag":true}]',
          '{"enabled":false,"areas":{},"spouse":null,"prefill":{"firstName":"שמירה","lastName":"QAR4K","email":"delivered@resend.dev"}}', 18, now());
  execute 'set local role authenticated';
  res := public.ensure_client_for_quotation(kq10);
  execute 'set local role postgres';
  select client_id into kc10 from public.quotations where id = kq10;
  update public.clients set dealer_type = null, vat_status = null where id = kc10;
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  perform set_config('request.jwt.claim.sub', '', true);
  execute 'set local role anon';
  res := public.approve_quotation(kt, null, 'QAR4K');
  execute 'set local role postgres';
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', uid::text, true);
  select id into ke10 from public.engagements where client_id = kc10 order by created_at desc limit 1;
  select kind_hold->'held' into kheld from public.engagements where id = ke10;
  -- המשרד הוסיף בקשה בזמן ההמתנה, באותה טרנזקציה — אינה «נפתחה עם קביעת הסוג».
  execute 'set local role authenticated';
  res := public.create_onboarding_request(p_client_id => kc10, p_step_type => 'custom_request',
           p_payload => '{"title":"QA R4 נוספה לפני השמירה","clientTitle":"QA R4 נוספה לפני השמירה","requirements":[{"key":"r1","kind":"confirm","label":"אישור","done":false,"required":true}]}'::jsonb,
           p_due_date => null, p_depends_on => null, p_published => true, p_required_for_close => false,
           p_owner => null, p_stage_id => null);
  execute 'set local role postgres';
  kextra := res->>'stepId';
  select coalesce(array_agg(id), '{}') into kbefore from public.onboarding_steps where client_id = kc10;
  execute 'set local role authenticated';
  res2 := public.update_client_fields(kc10, '{"dealer_type":"exempt"}'::jsonb);
  -- הקריאה של המסך: מיד אחרי השמירה, באותה טרנזקציה, בהרשאות המשתמש
  select kind_hold into e_hold from public.engagements where id = ke10;
  execute 'set local role postgres';
  select coalesce(jsonb_agg(id order by id), '[]'::jsonb) into kexpect
    from public.onboarding_steps
   where client_id = kc10 and not (id = any (kbefore)) and status <> 'cancelled' and not (payload ? 'creationProblem');
  out := out || jsonb_build_object('t', 'K.19 שמירת «סוג העוסק» דרך update_client_fields ⇒ באותה טרנזקציה: resolvedAt, resolvedKind, ו-created = בדיוק מה שנפתח עכשיו', 'pass',
    coalesce((res2->>'ok')::boolean, false) and kextra is not null
    and e_hold->>'resolvedAt' is not null and e_hold->>'resolvedKind' = 'exempt_dealer' and not (e_hold ? 'failedAt')
    and jsonb_array_length(kexpect) >= 2
    and (select coalesce(jsonb_agg(x->>'stepId' order by x->>'stepId'), '[]'::jsonb) from jsonb_array_elements(e_hold->'created') x) = kexpect
    and not exists (select 1 from jsonb_array_elements(e_hold->'created') x where x->>'stepId' = kextra or nullif(x->>'key', '') is null)
    and exists (select 1 from jsonb_array_elements(e_hold->'created') x where x->>'key' = 'qar4x')
    and exists (select 1 from jsonb_array_elements(e_hold->'created') x where x->>'key' = 'intake_questionnaire'),
    'got', jsonb_build_object('save', res2->'ok', 'hold', e_hold - 'lists', 'expected', kexpect, 'extra', kextra));
  -- K.19א · אותה שמירה שוב (אין שינוי) / «לפתוח את הבקשות שחיכו» אחרי השחרור ⇒ created לא נדרס
  execute 'set local role authenticated';
  res2 := public.update_client_fields(kc10, '{"dealer_type":"exempt"}'::jsonb);
  res := public.retry_kind_hold(kc10);
  execute 'set local role postgres';
  out := out || jsonb_build_object('t', 'K.19א שמירה חוזרת / «לפתוח שוב» אחרי השחרור ⇒ ok 0, ו-created נשאר של השחרור', 'pass',
    coalesce((res->>'ok')::boolean, false) and (res->>'created')::int = 0
    and (select kind_hold->'created' from public.engagements where id = ke10) = e_hold->'created',
    'got', jsonb_build_object('retry', res, 'created', (select kind_hold->'created' from public.engagements where id = ke10)));

  -- K.20 · השמות ב«מה מחכה לסוג העוסק» תמיד מלאים, בשמות שהמשרד רואה ב«בקשות» (לא בגוף שני)
  out := out || jsonb_build_object('t', 'K.20 held[].title תמיד מלא — בכל ההתקשרויות של הבדיקה; «עדכון סטטוס מס» בשם של המשרד', 'pass',
    jsonb_array_length(kheld) = 3
    and exists (select 1 from jsonb_array_elements(kheld) h where h->>'key' = 'intake_questionnaire' and h->>'title' = 'עדכון סטטוס מס')
    and exists (select 1 from jsonb_array_elements(kheld) h where h->>'key' = 'qar4x' and h->>'title' = 'QA R4 רק לפטור' and h->>'source' = 'office')
    and not exists (select 1 from public.engagements e, jsonb_array_elements(e.kind_hold->'held') h
                     where e.id in (ke1, ke2, ke3, ke4, ke8, ke9, ke10)
                       and (nullif(btrim(coalesce(h->>'title', '')), '') is null or nullif(h->>'key', '') is null
                            or h->>'source' not in ('system', 'office')))
    and (select count(*) from public.engagements e, jsonb_array_elements(e.kind_hold->'held') h
          where e.id in (ke1, ke2, ke3, ke4, ke8, ke9, ke10)) >= 10,
    'got', jsonb_build_object('held', kheld,
             'all', (select jsonb_agg(h->'title') from public.engagements e, jsonb_array_elements(e.kind_hold->'held') h
                      where e.id in (ke1, ke2, ke3, ke4, ke8, ke9, ke10))));
  exception when others then
    out := out || jsonb_build_object('t', 'קרס: K.19–K.20 · שמירה מהמסך', 'pass', false, 'got', sqlerrm);
  end;
  execute 'set local role postgres';

  -- ══ R · לקוח שחוזר (הכרעות D1–D4) ═══════════════════════════════════════════
  begin
  out := out || jsonb_build_object('t', 'R.0 ששת הסוגים «לכל התקשרות»: הרשימה בשרת זהה לרשימה בשלושת האינדקסים', 'pass',
    cardinality(public.per_engagement_step_types()) = 6
    and (select bool_and(position(quote_literal(t) in pg_get_indexdef('public.onboarding_steps_person_type_open_idx'::regclass)) > 0
                     and position(quote_literal(t) in pg_get_indexdef('public.onboarding_steps_unassigned_type_idx'::regclass)) > 0
                     and position(quote_literal(t) in pg_get_indexdef('public.onboarding_steps_person_type_idx'::regclass)) > 0)
           from unnest(public.per_engagement_step_types()) t)
    and position('''paperless_invite''' in pg_get_indexdef('public.onboarding_steps_person_type_open_idx'::regclass)) = 0
    and position('''representation''' in pg_get_indexdef('public.onboarding_steps_unassigned_type_idx'::regclass)) = 0,
    'got', jsonb_build_object('open', pg_get_indexdef('public.onboarding_steps_person_type_open_idx'::regclass)));

  -- לקוח שההתקשרות שלו הסתיימה לפני 60 יום: היסטוריה שהושלמה, «עדכון סטטוס מס» שהמשרד
  -- הסיר, מכתב שהקישור שלו חי, שורת «לא נוצרה» פתוחה, ובקשה פתוחה במסלול הקליטה הישן.
  update public.office_journey_defaults
     set entries = entries || '[{"key":"qar4r-office","stepType":"custom_request","source":"office","enabled":true,"sortIndex":999,"payload":{"title":"QAR4R משרד","clientTitle":"QAR4R משרד","requirements":[{"key":"r1","kind":"confirm","label":"אישור","done":false,"required":true}]}}]'::jsonb
   where office_id = v_office and client_kind = 'licensed_dealer';
  insert into public.clients (id, user_id, first_name, last_name, email, lifecycle_stage, family_status, dealer_type,
                              has_previous_accountant, prev_accountant_email, prev_accountant_name, business_transfer)
  values (rc, uid, 'חוזר', 'QAR4R', 'delivered@resend.dev', 'active', 'single', 'licensed',
          true, 'delivered@resend.dev', 'רו"ח של פעם', false);
  insert into public.engagements (id, user_id, client_id, status, process_published_at, created_at, ended_at, ended_reason)
  values (reold, uid, rc, 'ended', now() - interval '700 days', now() - interval '700 days', now() - interval '60 days', 'QAR4R');
  insert into public.onboarding_steps (user_id, engagement_id, client_id, step_type, track, scope, status, ball, payload,
                                       published_at, completed_at, created_at)
  select uid, reold, rc, t.st, t.tr, t.sc, t.stt, 'me', t.pl::jsonb, now() - interval '690 days',
         case when t.stt = 'completed' then now() - interval '650 days' end, now() - interval '690 days'
    from (values ('client_documents', 'tools', 'person', 'completed', '{"checklist":[{"key":"old","label":"ישן","done":true}]}'),
                 ('prev_accountant_details', 'prev_accountant', 'person', 'completed', '{}'),
                 ('paperless_invite', 'tools', 'person', 'completed', '{}'),
                 -- ‼ פתוחה: עבודה של ההתקשרות הקודמת — נסגרת, לא עוברת (אחרת המחולל מדלג על הצילום)
                 ('first_month_review', 'review', 'engagement', 'pending', '{}'),
                 ('intake_questionnaire', 'internal', 'person', 'cancelled', '{}'),
                 ('custom_request', 'custom', 'person', 'completed',
                  '{"title":"QAR4R משרד","clientTitle":"QAR4R משרד","defaultOrigin":{"key":"qar4r-office","kind":"office_default"},"requirements":[{"key":"r1","kind":"confirm","label":"אישור","done":true,"required":true}]}')) t(st, tr, sc, stt, pl);
  insert into public.onboarding_steps (user_id, engagement_id, client_id, step_type, track, scope, status, ball, payload,
                                       published_at, completed_at, created_at)
  values (uid, reold, rc, 'release_letter', 'prev_accountant', 'person', 'completed', 'me',
          jsonb_build_object('releaseToken', 'qar4rold' || rc), now() - interval '690 days', now() - interval '660 days', now() - interval '690 days')
  returning id into rold_letter;
  insert into public.onboarding_steps (user_id, engagement_id, client_id, step_type, track, scope, status, ball, payload,
                                       published_at, completed_at, created_at, depends_on_step_id)
  values (uid, reold, rc, 'materials_received', 'prev_accountant', 'person', 'completed', 'me',
          '{"checklist":[{"key":"m_old","label":"ישן","done":true}]}', now() - interval '690 days', now() - interval '640 days',
          now() - interval '689 days', rold_letter)
  returning id into rold_mat;
  insert into public.onboarding_steps (user_id, engagement_id, client_id, step_type, track, scope, status, ball, payload, published_at)
  values (uid, reold, rc, 'custom_request', 'custom', 'person', 'pending', 'me',
          jsonb_build_object('title', 'לא נוצרה — «ישן»', 'internalTask', true, 'requirements', '[]'::jsonb,
            'creationProblem', jsonb_build_object('key', 'gen:' || reold || ':zz', 'source', 'generator', 'reason', 'library_item_missing',
                                                  'cls', 'library', 'next', 'add', 'engagementId', reold, 'entryKey', 'zz',
                                                  'itemTitle', 'ישן', 'attempts', 1)), now())
  returning id into rprob;
  select count(*) into rn1 from public.onboarding_steps where engagement_id = reold;
  insert into public.flow_runs (user_id, client_id, flow_id, flow_version, cycle_key, trigger, engagement_id, status, facts, state)
  select uid, rc, f.id, f.current_version, reold, 'quote_approved', reold, 'active', '{}'::jsonb, '{"stages":{}}'::jsonb
    from public.office_flows f
   where f.office_id = v_office and f.trigger = 'quote_approved' and f.status = 'active' limit 1
  returning id into rrold;
  insert into public.onboarding_steps (user_id, engagement_id, client_id, step_type, track, scope, status, ball, payload,
                                       published_at, flow_run_id, flow_item_key, flow_stage_key)
  values (uid, reold, rc, 'custom_request', 'custom', 'person', 'pending', 'client',
          '{"title":"פתוח מהעבר","clientTitle":"פתוח מהעבר","requirements":[{"key":"r1","kind":"confirm","label":"אישור","done":false,"required":true}]}',
          now() - interval '600 days', rrold, 'adhoc-qar4r', 's1')
  returning id into ropen;
  insert into public.quotations (id, user_id, client_id, quotation_number, status, public_token, items, representation, vat_rate, sent_at)
  values (rq, uid, rc, 'QAR4R-' || rq, 'sent', rt,
          '[{"id":"i1","serviceId":"s1","name":"הנהלת חשבונות","category":"monthly","billingType":"monthly","catalogPrice":1200,"clientPrice":1200,"quantity":1,"vatFlag":true}]',
          '{"enabled":false,"areas":{},"spouse":null,"prefill":{}}', 18, now());

  -- R.1 · בקשה שהמשרד מכין לפני שאושרה ההצעה החדשה (D2)
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', uid::text, true);
  execute 'set local role authenticated';
  res2 := public.create_onboarding_request(p_client_id => rc, p_step_type => 'client_documents',
            p_payload => '{"checklist":[{"key":"x1","label":"אישור בנק","done":false}]}'::jsonb,
            p_due_date => null, p_depends_on => null, p_published => true, p_required_for_close => true,
            p_owner => null, p_stage_id => null);
  res3 := public.client_intake_state(rc);
  res := public.publish_case_changes(rc);
  execute 'set local role postgres';
  rprep := res2->>'stepId';
  out := out || jsonb_build_object('t', 'R.1 בקשה שהוכנה ללקוח שחוזר לפני האישור: נוצרת (לא «כבר קיימת»), לא נצמדת להתקשרות שהסתיימה, מוחזקת עד האישור ונדרשת לסגירה', 'pass',
    coalesce((res2->>'ok')::boolean, false) and coalesce((res2->>'heldUntilApproval')::boolean, false)
    and res2->>'intakeState' = 'pending' and coalesce((res2->>'requiredForClose')::boolean, false)
    and (select engagement_id is null and published_at is null from public.onboarding_steps where id = rprep)
    and res3->>'state' = 'pending',
    'got', jsonb_build_object('create', res2, 'intake', res3));
  out := out || jsonb_build_object('t', 'R.1א «פרסם בדף» לפני האישור ⇒ quotation_not_approved', 'pass',
    res->>'error' = 'quotation_not_approved', 'got', res);
  res := public.build_client_portal(rc, 'live');
  out := out || jsonb_build_object('t', 'R.1ב הדף לפני האישור: ההצעה החדשה לחתימה (לא «אושרה»), והבקשה המוחזקת לא בדף', 'pass',
    exists (select 1 from jsonb_array_elements(res->'items') x where x->>'key' = 'quote_sign')
    and not exists (select 1 from jsonb_array_elements(res->'items') x where x->>'key' = 'quotation')
    and res->>'journeyStage' = 'quote'
    and not exists (select 1 from jsonb_array_elements(res->'items') x where x->>'actionValue' = rprep),
    'got', res->'items');

  -- האישור (אנונימי, מהקישור של ההצעה)
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  perform set_config('request.jwt.claim.sub', '', true);
  execute 'set local role anon';
  res := public.approve_quotation(rt, null, 'QAR4R');
  execute 'set local role postgres';
  select id, journey_default_snapshot into re, rsnap from public.engagements where client_id = rc and status = 'onboarding';
  select id into rnewrun from public.flow_runs where client_id = rc and cycle_key = re;
  out := out || jsonb_build_object('t', 'R.2 ההיסטוריה נשארת: ההתקשרות הקודמת ומה שהושלם בה לא זזו', 'pass',
    re is not null and (select status from public.engagements where id = reold) = 'ended'
    and (select count(*) from public.onboarding_steps where engagement_id = reold) = rn1
    and not exists (select 1 from public.onboarding_steps where engagement_id = reold
                     and status not in ('completed', 'verified', 'skipped', 'cancelled'))
    and (select engagement_id = reold and status = 'completed' from public.onboarding_steps where id = rold_letter),
    'got', res);
  out := out || jsonb_build_object('t', 'R.3 הבקשה שהוכנה עברה לקליטה החדשה ונפתחה ללקוח; אין שנייה מאותו סוג', 'pass',
    (select engagement_id = re and published_at is not null and not (payload ? 'heldUntilApproval')
       from public.onboarding_steps where id = rprep)
    and (select count(*) from public.onboarding_steps where engagement_id = re and step_type = 'client_documents' and status <> 'cancelled') = 1,
    'got', (select jsonb_agg(jsonb_build_object('id', id, 'eng', engagement_id, 'status', status)) from public.onboarding_steps
             where client_id = rc and step_type = 'client_documents'));
  out := out || jsonb_build_object('t', 'R.4 רו"ח קודם (D3): שואלים מחדש בלי הפרטים הישנים, והמכתב ממתין לתשובה', 'pass',
    not public.journey_default_enabled(rsnap, 'prev_accountant_details')
    or ((select payload->>'askAgain' = 'true' and payload->>'clientTitle' is distinct from 'לאשר את פרטי רואה החשבון הקודם'
           from public.onboarding_steps where engagement_id = re and step_type = 'prev_accountant_details' and status <> 'cancelled')
        and (not public.journey_default_enabled(rsnap, 'release_letter')
             or (select status from public.onboarding_steps
                  where engagement_id = re and step_type = 'release_letter' and status <> 'cancelled') = 'locked')),
    'got', (select jsonb_agg(jsonb_build_object('type', step_type, 'status', status, 'title', payload->>'clientTitle', 'ask', payload->>'askAgain'))
              from public.onboarding_steps where engagement_id = re and track = 'prev_accountant'));
  out := out || jsonb_build_object('t', 'R.5 «פעם אחת ללקוח» לא חוזר: הרשמה לפייפרלס נשארת אחת', 'pass',
    (select count(*) from public.onboarding_steps where client_id = rc and step_type = 'paperless_invite' and status <> 'cancelled') = 1,
    'got', null);
  out := out || jsonb_build_object('t', 'R.6 הסרה בהתקשרות הקודמת לא חוסמת את החדשה («עדכון סטטוס מס»)', 'pass',
    not public.journey_default_enabled(rsnap, 'intake_questionnaire')
    or exists (select 1 from public.onboarding_steps where engagement_id = re and step_type = 'intake_questionnaire' and status <> 'cancelled'),
    'got', null);
  out := out || jsonb_build_object('t', 'R.7 בקשת המשרד מהקליטה נוצרת שוב בקליטה החדשה', 'pass',
    exists (select 1 from public.onboarding_steps where engagement_id = re and payload->'defaultOrigin'->>'key' = 'qar4r-office'
              and status <> 'cancelled'),
    'got', null);
  out := out || jsonb_build_object('t', 'R.8 (D1) בקשה פתוחה מהעבר צורפה לקליטה ונותקה מהמסלול הישן; המסלול הישן נסגר («נסגר עם סיום ההתקשרות»); שורת «לא נוצרה» ישנה נסגרה', 'pass',
    (select engagement_id = re and flow_run_id is distinct from rrold and payload->>'detachedFromFlowRun' = rrold
       from public.onboarding_steps where id = ropen)
    and (select status = 'cancelled' and state->>'closedBy' = 'engagement_ended' from public.flow_runs where id = rrold)
    and rnewrun is not null and rnewrun <> rrold
    and (select status = 'cancelled' from public.onboarding_steps where id = rprob)
    and (select status = 'skipped' and payload->>'skipReason' = 'not_applicable' from public.onboarding_steps
          where engagement_id = reold and step_type = 'first_month_review')
    and exists (select 1 from public.onboarding_steps where engagement_id = re and step_type = 'first_month_review')
    and rsnap is not null
    and exists (select 1 from public.onboarding_events where engagement_id = re and meta->>'returning' = 'true' and note like 'חוזר חזר/ה אלינו%')
    and exists (select 1 from public.onboarding_events where engagement_id = re and meta->>'moved' = '1')
    and exists (select 1 from public.onboarding_events where engagement_id = reold and meta->>'closedBy' = 'engagement_ended'),
    'got', jsonb_build_object('open', (select jsonb_build_object('eng', engagement_id, 'run', flow_run_id) from public.onboarding_steps where id = ropen),
                              'oldRun', (select jsonb_build_object('status', status, 'state', state) from public.flow_runs where id = rrold)));
  out := out || jsonb_build_object('t', 'R.9 עובדות הקליטה: לקוח שחוזר, לא עסק חדש, ושואלים על רו"ח קודם', 'pass',
    (select journey_default_facts->>'returning' = 'true' and journey_default_facts->>'new_business' = 'false'
            and journey_default_facts->>'no_prev_email' = 'true' and journey_default_facts ? 'previousEngagementEndedAt'
       from public.engagements where id = re),
    'got', (select journey_default_facts from public.engagements where id = re));
  select count(*) into rn2 from public.onboarding_steps where client_id = rc and status <> 'cancelled';
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  execute 'set local role anon';
  res := public.approve_quotation(rt, null, 'QAR4R');
  execute 'set local role postgres';
  out := out || jsonb_build_object('t', 'R.10 אישור חוזר: אותן בקשות ואותו מסלול', 'pass',
    (select count(*) from public.onboarding_steps where client_id = rc and status <> 'cancelled') = rn2
    and (select count(*) from public.flow_runs where client_id = rc and cycle_key = re) = 1,
    'got', jsonb_build_object('before', rn2, 'after', (select count(*) from public.onboarding_steps where client_id = rc and status <> 'cancelled')));
  begin
    insert into public.onboarding_steps (user_id, engagement_id, client_id, step_type, track, scope, status, ball, payload)
    values (uid, null, rc, 'client_documents', 'tools', 'person', 'pending', 'client', '{}');
    vb := false;
  exception when unique_violation then vb := true;
  end;
  begin
    insert into public.onboarding_steps (user_id, engagement_id, client_id, step_type, track, scope, status, ball, payload)
    values (uid, re, rc, 'client_documents', 'tools', 'person', 'completed', 'me', '{}');
    vb2 := false;
  exception when unique_violation then vb2 := true;
  end;
  begin
    insert into public.onboarding_steps (user_id, engagement_id, client_id, step_type, track, scope, status, ball, payload)
    values (uid, re, rc, 'paperless_invite', 'tools', 'person', 'pending', 'client', '{}');
    vb3 := false;
  exception when unique_violation then vb3 := true;
  end;
  out := out || jsonb_build_object('t', 'R.11 השומר במסד: לא שתי פתוחות מאותו סוג, לא שתיים באותה התקשרות, ו«פעם אחת ללקוח» נשאר', 'pass',
    vb and vb2 and vb3, 'got', jsonb_build_array(vb, vb2, vb3));
  res := public.build_client_portal(rc, 'preview');
  res2 := public.build_client_portal(rc, 'live');
  out := out || jsonb_build_object('t', 'R.12 הדף: «מסמכים» פעם אחת, בלי מה שהושלם בהתקשרות הקודמת, בלי הפרטים הישנים של רו"ח קודם; קליטה שלא נפתחה — «מכינים»', 'pass',
    (select count(*) from jsonb_array_elements(res->'items') x where x->>'key' = 'docs') = 1
    and not exists (select 1 from jsonb_array_elements(res->'items') x where x->>'bucket' = 'done' and x->>'label' = 'QAR4R משרד')
    and not exists (select 1 from jsonb_array_elements(res->'items') x where x->>'key' = 'prev_accountant' and x->>'bucket' = 'done')
    and not exists (select 1 from jsonb_array_elements(res->'items') x where x->>'key' = 'prev_details' and x ? 'prefill')
    and not exists (select 1 from jsonb_array_elements(res2->'items') x where x->>'key' = 'quote_sign')
    and ((select process_published_at is not null from public.engagements where id = re)
         or exists (select 1 from jsonb_array_elements(res2->'items') x where x->>'key' = 'process_pending')),
    'got', jsonb_build_object('preview', res->'items', 'live', res2->'items'));
  out := out || jsonb_build_object('t', 'R.12א השער ברמת הלקוח («מכינים») = הדגל של הקליטה החדשה; בקשה שעברה — פתוחה לפי הזמן שבו פורסמה', 'pass',
    public.client_process_published(rc) = (select process_published_at is not null from public.engagements where id = re)
    and public.client_step_gate_open(rc, (select published_at from public.onboarding_steps where id = ropen))
    and (select payload->'carriedFrom'->>'engagementId' = reold from public.onboarding_steps where id = ropen),
    'got', (select payload->'carriedFrom' from public.onboarding_steps where id = ropen));

  -- R.16 · דף הרו"ח הקודם: כל קישור רואה ומסמן רק את החומרים של המכתב שלו
  select id into sx from public.onboarding_steps where engagement_id = re and step_type = 'release_letter' and status <> 'cancelled';
  select id into sy from public.onboarding_steps where engagement_id = re and step_type = 'materials_received' and status <> 'cancelled';
  if sx is not null and sy is not null then
    update public.onboarding_steps set payload = payload || jsonb_build_object('releaseToken', 'qar4rnew' || rc) where id = sx;
    res := public.get_release_portal('qar4rold' || rc);
    res2 := public.get_release_portal('qar4rnew' || rc);
    res3 := public.release_portal_mark_items('qar4rnew' || rc,
              (select jsonb_build_array(x->>'key') from jsonb_array_elements((select payload->'checklist' from public.onboarding_steps where id = sy)) x limit 1));
    out := out || jsonb_build_object('t', 'R.16 דף הרו"ח הקודם: הקישור הישן — החומרים הישנים; החדש — החדשים, והסימון נכתב רק שם', 'pass',
      res->>'materialsStepId' = rold_mat and res2->>'materialsStepId' = sy
      and coalesce((res3->>'marked')::int, 0) = 1
      and (select payload->'checklist' = '[{"key":"m_old","label":"ישן","done":true}]'::jsonb from public.onboarding_steps where id = rold_mat),
      'got', jsonb_build_object('old', res->>'materialsStepId', 'new', res2->>'materialsStepId', 'mark', res3));
  else
    out := out || jsonb_build_object('t', 'R.16 דף הרו"ח הקודם — לא נבדק: המכתב/החומרים כבויים ברשימת המורשה', 'pass', true,
      'got', jsonb_build_object('letter', sx, 'materials', sy));
  end if;
  exception when others then
    out := out || jsonb_build_object('t', 'קרס: R.0–R.16 · לקוח שחוזר', 'pass', false, 'got', sqlerrm);
  end;
  execute 'set local role postgres';

  -- R.13 · ייצוג ללקוח שחוזר — בתוך הקליטה החדשה ובשער הסגירה
  begin
  insert into public.clients (id, user_id, first_name, last_name, email, lifecycle_stage, family_status, dealer_type)
  values (rc2, uid, 'חוזר', 'ייצוג QAR4R', 'delivered@resend.dev', 'active', 'single', 'licensed');
  insert into public.engagements (id, user_id, client_id, status, process_published_at, created_at, ended_at, ended_reason)
  values (re2old, uid, rc2, 'ended', now() - interval '500 days', now() - interval '500 days', now() - interval '30 days', 'QAR4R');
  insert into public.quotations (id, user_id, client_id, quotation_number, status, public_token, items, representation, vat_rate, sent_at)
  values (rq2, uid, rc2, 'QAR4R2-' || rq2, 'sent', rt2,
          '[{"id":"i1","serviceId":"s1","name":"ייעוץ","category":"one_time","billingType":"one_time","catalogPrice":0,"clientPrice":0,"quantity":1,"vatFlag":true}]',
          '{"enabled":true,"areas":{"incomeTax":true},"spouse":null,"prefill":{"firstName":"חוזר","lastName":"ייצוג","email":"delivered@resend.dev"}}', 18, now());
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  perform set_config('request.jwt.claim.sub', '', true);
  execute 'set local role anon';
  res := public.approve_quotation(rt2, null, 'QAR4R');
  execute 'set local role postgres';
  select id into re2 from public.engagements where client_id = rc2 and status = 'onboarding';
  select id into sx from public.onboarding_steps where client_id = rc2 and step_type = 'representation' and status <> 'cancelled';
  res2 := public.onboarding_close_readiness(re2);
  out := out || jsonb_build_object('t', 'R.13 ייצוג ללקוח שחוזר: השלב בקליטה החדשה (לא בזו שהסתיימה), ובשער הסגירה', 'pass',
    re2 is not null and sx is not null
    and (select engagement_id = re2 from public.onboarding_steps where id = sx)
    and (not (select required_for_close from public.onboarding_steps where id = sx)
         or exists (select 1 from jsonb_array_elements(res2->'blocking') x where x->>'id' = sx)),
    'got', jsonb_build_object('approve', res, 'step', (select jsonb_build_object('eng', engagement_id, 'status', status) from public.onboarding_steps where id = sx), 'ready', res2));
  exception when others then
    out := out || jsonb_build_object('t', 'קרס: R.13 · ייצוג ללקוח שחוזר', 'pass', false, 'got', sqlerrm);
  end;
  execute 'set local role postgres';

  -- R.14 · הוסרה לפני האישור (בקליטה הזו) — לא חוזרת
  begin
  insert into public.clients (id, user_id, first_name, last_name, email, lifecycle_stage, family_status, dealer_type, has_previous_accountant)
  values (rc3, uid, 'חוזר', 'הסרה QAR4R', 'delivered@resend.dev', 'active', 'single', 'licensed', false);
  insert into public.engagements (id, user_id, client_id, status, process_published_at, created_at, ended_at, ended_reason)
  values (re3old, uid, rc3, 'ended', now() - interval '400 days', now() - interval '400 days', now() - interval '20 days', 'QAR4R');
  insert into public.quotations (id, user_id, client_id, quotation_number, status, public_token, items, representation, vat_rate, sent_at)
  values (rq3, uid, rc3, 'QAR4R3-' || rq3, 'sent', rt3,
          '[{"id":"i1","serviceId":"s1","name":"הנהלת חשבונות","category":"monthly","billingType":"monthly","catalogPrice":1200,"clientPrice":1200,"quantity":1,"vatFlag":true}]',
          '{"enabled":false,"areas":{},"spouse":null,"prefill":{}}', 18, now());
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', uid::text, true);
  execute 'set local role authenticated';
  res := public.create_onboarding_request(p_client_id => rc3, p_step_type => 'client_documents',
           p_payload => '{"checklist":[{"key":"x1","label":"אישור בנק","done":false}]}'::jsonb,
           p_due_date => null, p_depends_on => null, p_published => true, p_required_for_close => true,
           p_owner => null, p_stage_id => null);
  execute 'set local role postgres';
  perform public._set_step_status(res->>'stepId', 'cancelled', 'accountant', 'QAR4R הוסרה');
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  perform set_config('request.jwt.claim.sub', '', true);
  execute 'set local role anon';
  res2 := public.approve_quotation(rt3, null, 'QAR4R');
  execute 'set local role postgres';
  select id into re3 from public.engagements where client_id = rc3 and status = 'onboarding';
  out := out || jsonb_build_object('t', 'R.14 בקשה שהמשרד הסיר לפני האישור (בקליטה הזו) לא נולדת מחדש באישור', 'pass',
    re3 is not null and public.step_removed_by_office(rc3, 'client_documents', re3)
    and not exists (select 1 from public.onboarding_steps where client_id = rc3 and step_type = 'client_documents' and status <> 'cancelled'),
    'got', jsonb_build_object('create', res, 'approve', res2));
  exception when others then
    out := out || jsonb_build_object('t', 'קרס: R.14 · הסרה לפני האישור', 'pass', false, 'got', sqlerrm);
  end;
  execute 'set local role postgres';

  -- R.15 · עדכון הסכם ללקוח פעיל — לא קליטה (מתועד)
  begin
  insert into public.clients (id, user_id, first_name, last_name, email, lifecycle_stage, family_status, dealer_type)
  values (rc4, uid, 'פעיל', 'חידוש QAR4R', 'delivered@resend.dev', 'active', 'single', 'licensed');
  insert into public.engagements (id, user_id, client_id, status, process_published_at, created_at, effective_from)
  values (re4, uid, rc4, 'active', now() - interval '300 days', now() - interval '300 days', current_date - 300);
  insert into public.quotations (id, user_id, client_id, quotation_number, status, public_token, items, representation, vat_rate, sent_at)
  values (rq4, uid, rc4, 'QAR4R4-' || rq4, 'sent', rt4,
          '[{"id":"i1","serviceId":"s1","name":"הנהלת חשבונות","category":"monthly","billingType":"monthly","catalogPrice":1300,"clientPrice":1300,"quantity":1,"vatFlag":true}]',
          '{"enabled":false,"areas":{},"spouse":null,"prefill":{}}', 18, now());
  out := out || jsonb_build_object('t', 'R.15א לקוח פעיל עם הצעה לעדכון — בקשות לא מוחזקות (D2 צר)', 'pass',
    not public.requests_held_until_approval(rc4), 'got', null);
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  perform set_config('request.jwt.claim.sub', '', true);
  execute 'set local role anon';
  res := public.approve_quotation(rt4, null, 'QAR4R');
  execute 'set local role postgres';
  select id into v from public.engagements where quotation_id = rq4;
  out := out || jsonb_build_object('t', 'R.15 עדכון הסכם: התקשרות מתוזמנת/פעילה, בלי בקשות קליטה ובלי מסלול קליטה', 'pass',
    v is not null and (select status in ('scheduled', 'active') from public.engagements where id = v)
    and not exists (select 1 from public.onboarding_steps where engagement_id = v)
    and not exists (select 1 from public.flow_runs where cycle_key = v),
    'got', jsonb_build_object('approve', res, 'eng', (select status from public.engagements where id = v)));
  exception when others then
    out := out || jsonb_build_object('t', 'קרס: R.15 · עדכון הסכם', 'pass', false, 'got', sqlerrm);
  end;
  execute 'set local role postgres';

  -- R.17 · סיום התקשרות סוגר את המסלולים שלה
  begin
  insert into public.clients (id, user_id, first_name, last_name, email, lifecycle_stage, family_status, dealer_type)
  values (rc5, uid, 'מסיים', 'QAR4R', 'delivered@resend.dev', 'active', 'single', 'licensed');
  insert into public.engagements (id, user_id, client_id, status, process_published_at)
  values (re5, uid, rc5, 'onboarding', now());
  insert into public.flow_runs (user_id, client_id, flow_id, flow_version, cycle_key, trigger, engagement_id, status, facts, state)
  select uid, rc5, f.id, f.current_version, re5, 'quote_approved', re5, 'active', '{}'::jsonb, '{"stages":{}}'::jsonb
    from public.office_flows f
   where f.office_id = v_office and f.trigger = 'quote_approved' and f.status = 'active' limit 1
  returning id into v2;
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', uid::text, true);
  execute 'set local role authenticated';
  res := public.end_engagement(re5, 'QAR4R');
  res2 := public.get_client_flow_runs(rc5);
  execute 'set local role postgres';
  out := out || jsonb_build_object('t', 'R.17 «סיים התקשרות» סוגר את מסלול הקליטה (closedBy) — והכרטיס מקבל closedBy', 'pass',
    coalesce((res->>'ok')::boolean, false) and (res->>'closedRuns')::int = 1
    and (select status = 'cancelled' and state->>'closedBy' = 'engagement_ended' from public.flow_runs where id = v2)
    and exists (select 1 from jsonb_array_elements(res2->'runs') x where x->>'id' = v2 and x->>'closedBy' = 'engagement_ended'),
    'got', jsonb_build_object('end', res, 'runs', res2->'runs'));
  exception when others then
    out := out || jsonb_build_object('t', 'קרס: R.17 · סיום התקשרות', 'pass', false, 'got', sqlerrm);
  end;
  execute 'set local role postgres';

  -- ══ R.18–R.22 · לקוח שחוזר בדרך האמיתית (הכרעה ב) ═══════════════════════════════════
  -- «סיים התקשרות» ⇒ הצעה חדשה ⇒ אישור (create_engagement_for_quotation ⇒ _open_returning_intake ⇒
  -- המחולל ⇒ מסלול הקליטה). מה שפורסם ונשאר פתוח עובר לקליטה החדשה עם carriedFrom ונשאר בדף ובמייל;
  -- הקליטה החדשה — טיוטה עד «פרסם בדף»; בלי כפילויות.
  begin
  -- המשרד בחר «הכול באישורך» בתחילת מסלול הקליטה — הקליטה לא נפתחת ללקוח באישור — ושלב שני
  -- «אחרי השלב הראשון», «הכול באישורך», עם בקשה מהספרייה (בתוך הטרנזקציה; מוחזר בסוף).
  perform public.ensure_onboarding_flow(v_office);
  select v.definition into wdef0
    from public.office_flows f join public.office_flow_versions v on v.flow_id = f.id and v.version = f.current_version
   where f.office_id = v_office and f.trigger = 'quote_approved' and f.status = 'active';
  select s->>'key' into wfirst from jsonb_array_elements(wdef0->'stages') s
   where coalesce(s->'opens'->>'after', 'start') = 'start' limit 1;
  insert into public.journey_templates (user_id, office_id, kind, name, entries)
  values (uid, v_office, 'request', 'QAR4W שלב ב',
          '[{"key":"e1","stepType":"custom_request","owner":"client","payload":{"title":"QAR4W שלב ב","requirements":[{"key":"r1","kind":"confirm","label":"אישור","done":false,"required":true}]}}]')
  returning id into wtpl;
  update public.office_flow_versions v
     set definition = jsonb_set(v.definition, '{stages}',
           (select coalesce(jsonb_agg(case when coalesce(s->'opens'->>'after', 'start') = 'start'
                                           then s || '{"delivery":"hold"}'::jsonb else s end order by o), '[]'::jsonb)
              from jsonb_array_elements(v.definition->'stages') with ordinality t(s, o))
           || jsonb_build_array(jsonb_build_object('key', 'qar4w-s2', 'name', 'QAR4W שלב ב',
                'opens', jsonb_build_object('after', 'stage', 'stage', wfirst), 'delivery', 'hold',
                'items', jsonb_build_array(jsonb_build_object('key', 'qar4w-carry',
                           'ref', jsonb_build_object('kind', 'template', 'templateId', wtpl))))))
    from public.office_flows f
   where f.id = v.flow_id and v.version = f.current_version
     and f.office_id = v_office and f.trigger = 'quote_approved' and f.status = 'active';
  -- «מסמכים» פעיל ברשימת המורשה, ובקשת משרד חדשה בקליטה (QAR4W חדשה).
  select entries into wodj from public.office_journey_defaults where office_id = v_office and client_kind = 'licensed_dealer';
  update public.office_journey_defaults
     set entries = (select coalesce(jsonb_agg(case when x->>'stepType' = 'client_documents' and coalesce(x->>'source', 'system') = 'system'
                                                  then x || '{"enabled":true}'::jsonb else x end order by o), '[]'::jsonb)
                      from jsonb_array_elements(entries) with ordinality t(x, o))
                   || '[{"key":"qar4w-office","stepType":"custom_request","source":"office","enabled":true,"sortIndex":997,"payload":{"title":"QAR4W חדשה","clientTitle":"QAR4W חדשה","requirements":[{"key":"r1","kind":"confirm","label":"אישור","done":false,"required":true}]}}]'::jsonb
   where office_id = v_office and client_kind = 'licensed_dealer';

  -- לקוחה פעילה. פתוחות ומפורסמות בהתקשרות שלה: «מסמכים» (סוג «לכל התקשרות»), בקשה חופשית במסלול
  -- הקליטה הקודם, בקשת משרד מהקליטה הקודמת (QAR4W שלב ב — שבמסלול החדש בשלב השני), ומשימה
  -- אוטומטית (מייל לגורם חיצוני בלי כתובת — נעצרת אחרי השער, בלי לשלוח).
  insert into public.clients (id, user_id, first_name, last_name, email, lifecycle_stage, family_status, dealer_type)
  values (wc, uid, 'חוזרת', 'QAR4W', 'delivered@resend.dev', 'active', 'single', 'licensed');
  insert into public.engagements (id, user_id, client_id, status, process_published_at, created_at, effective_from)
  values (weold, uid, wc, 'active', now() - interval '400 days', now() - interval '420 days', current_date - 420);
  insert into public.flow_runs (user_id, client_id, flow_id, flow_version, cycle_key, trigger, engagement_id, status, facts, state)
  select uid, wc, f.id, f.current_version, weold, 'quote_approved', weold, 'active', '{}'::jsonb, '{"stages":{}}'::jsonb
    from public.office_flows f
   where f.office_id = v_office and f.trigger = 'quote_approved' and f.status = 'active' limit 1
  returning id into wrun_old;
  insert into public.onboarding_steps (user_id, engagement_id, client_id, step_type, track, scope, status, ball, payload, published_at, created_at)
  values (uid, weold, wc, 'client_documents', 'tools', 'person', 'pending', 'client',
          '{"checklist":[{"key":"w1","label":"אישור ניכוי מס","done":false}]}', now() - interval '100 days', now() - interval '100 days')
  returning id into wdocs;
  insert into public.onboarding_steps (user_id, engagement_id, client_id, step_type, track, scope, status, ball, payload,
                                       published_at, created_at, flow_run_id, flow_stage_key, flow_item_key)
  values (uid, weold, wc, 'custom_request', 'custom', 'person', 'pending', 'client',
          '{"title":"פתוח מהעבר W","clientTitle":"פתוח מהעבר W","requirements":[{"key":"r1","kind":"confirm","label":"אישור","done":false,"required":true}]}',
          now() - interval '90 days', now() - interval '90 days', wrun_old, wfirst, 'adhoc-qar4w')
  returning id into wopen;
  insert into public.onboarding_steps (user_id, engagement_id, client_id, step_type, track, scope, status, ball, payload, published_at, created_at)
  values (uid, weold, wc, 'custom_request', 'custom', 'person', 'pending', 'client',
          '{"title":"QAR4W שלב ב","clientTitle":"QAR4W שלב ב","defaultOrigin":{"key":"qar4w-carry","kind":"office_default"},"requirements":[{"key":"r1","kind":"confirm","label":"אישור","done":false,"required":true}]}',
          now() - interval '85 days', now() - interval '85 days')
  returning id into wcarry;
  insert into public.onboarding_steps (user_id, engagement_id, client_id, step_type, track, scope, status, ball, payload, published_at, created_at)
  values (uid, weold, wc, 'custom_request', 'custom', 'person', 'pending', 'client',
          '{"title":"אוטומטית ישנה W","autoAction":{"kind":"email"},"externalParty":{"kind":"other","contact":{"email":""}}}',
          now() - interval '80 days', now() - interval '80 days')
  returning id into wauto_old;

  -- «סיים התקשרות» (המשרד), הצעה חדשה, ואישור מהקישור (אנונימי)
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', uid::text, true);
  execute 'set local role authenticated';
  wr1 := public.end_engagement(weold, 'QAR4W');
  execute 'set local role postgres';
  insert into public.quotations (id, user_id, client_id, quotation_number, status, public_token, items, representation, vat_rate, sent_at)
  values (wq, uid, wc, 'QAR4W-' || wq, 'sent', wt,
          '[{"id":"i1","serviceId":"s1","name":"הנהלת חשבונות","category":"monthly","billingType":"monthly","catalogPrice":1200,"clientPrice":1200,"quantity":1,"vatFlag":true}]',
          '{"enabled":false,"areas":{},"spouse":null,"prefill":{}}', 18, now());
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  perform set_config('request.jwt.claim.sub', '', true);
  execute 'set local role anon';
  wr2 := public.approve_quotation(wt, null, 'QAR4W');
  execute 'set local role postgres';
  select id into we from public.engagements where client_id = wc and status = 'onboarding';
  select id into wnew from public.onboarding_steps
   where engagement_id = we and payload->'defaultOrigin'->>'key' = 'qar4w-office' and status <> 'cancelled';
  out := out || jsonb_build_object('t', 'R.18 הדרך האמיתית: «סיים התקשרות» ואישור הצעה חדשה ⇒ קליטה חדשה שטרם נפתחה; ארבע הפתוחות עברו אליה עם carriedFrom (ההתקשרות הקודמת ומתי הסתיימה), הפרסום לא זז, detachedFromFlowRun נשמר', 'pass',
    coalesce((wr1->>'ok')::boolean, false) and wr2->>'status' = 'approved' and we is not null
    and (select process_published_at is null from public.engagements where id = we)
    and (select status = 'ended' and ended_at is not null from public.engagements where id = weold)
    and (select count(*) from public.onboarding_steps
          where id in (wdocs, wopen, wcarry, wauto_old) and engagement_id = we
            and status = 'pending'
            and payload->'carriedFrom'->>'engagementId' = weold
            and (payload->'carriedFrom'->>'endedAt')::timestamptz = (select ended_at from public.engagements where id = weold)
            and published_at < (select created_at from public.engagements where id = we)) = 4
    and (select payload->>'detachedFromFlowRun' = wrun_old and published_at = now() - interval '90 days'
           from public.onboarding_steps where id = wopen)
    and exists (select 1 from public.onboarding_events where engagement_id = we and meta->>'moved' = '4'),
    'got', jsonb_build_object('end', wr1, 'approve', wr2, 'eng', we,
             'steps', (select jsonb_agg(jsonb_build_object('id', id, 'eng', engagement_id, 'status', status, 'from', payload->'carriedFrom',
                                                           'pub', published_at, 'detached', payload->'detachedFromFlowRun'))
                         from public.onboarding_steps where id in (wdocs, wopen, wcarry, wauto_old))));
  out := out || jsonb_build_object('t', 'R.18א «שמור כתבנית» מבקשה שעברה — בלי carriedFrom ובלי detachedFromFlowRun', 'pass',
    (select payload ? 'carriedFrom' from public.onboarding_steps where id = wopen)
    and not (public.template_payload_from_step((select payload from public.onboarding_steps where id = wopen))
             ?| array['carriedFrom', 'detachedFromFlowRun'])
    and public.template_payload_from_step((select payload from public.onboarding_steps where id = wopen))->>'title' = 'פתוח מהעבר W',
    'got', public.template_payload_from_step((select payload from public.onboarding_steps where id = wopen)));
  out := out || jsonb_build_object('t', 'R.19 בלי כפילות: «מסמכים» שעבר הוא היחיד (המחולל לא יצר שני); בקשת המשרד של הקליטה החדשה נוצרה, ופורסמה כשהקליטה נוצרה', 'pass',
    public.journey_default_enabled((select journey_default_snapshot from public.engagements where id = we), 'client_documents')
    and (select count(*) from public.onboarding_steps where client_id = wc and step_type = 'client_documents' and status <> 'cancelled') = 1
    and wnew is not null
    and (select published_at is not null and published_at >= (select created_at from public.engagements where id = we)
                and not (payload ? 'carriedFrom')
           from public.onboarding_steps where id = wnew),
    'got', jsonb_build_object('docs', (select jsonb_agg(jsonb_build_object('id', id, 'eng', engagement_id, 'status', status))
                                         from public.onboarding_steps where client_id = wc and step_type = 'client_documents'),
                              'new', wnew));

  -- R.20 · עד «פרסם בדף»
  wpage := public.build_client_portal(wc, 'live');
  select coalesce(jsonb_agg(a.step_id), '[]'::jsonb) into wann from public._client_announceable_steps(wc) a;
  out := out || jsonb_build_object('t', 'R.20 קליטה שטרם נפתחה: מה שעבר — בדף ובמייל (גם בקשה שהוצמדה לשלב «אחרי» במסלול החדש — לא טיוטה ולא נעולה); הבקשה של הקליטה החדשה — לא; «מכינים»', 'pass',
    exists (select 1 from jsonb_array_elements(wpage->'items') y where y->>'key' = 'docs' and y->>'bucket' = 'action')
    and exists (select 1 from jsonb_array_elements(wpage->'items') y where y->>'key' = 'custom_' || wopen)
    and exists (select 1 from jsonb_array_elements(wpage->'items') y where y->>'key' = 'custom_' || wcarry and y->>'bucket' = 'action')
    and not exists (select 1 from jsonb_array_elements(wpage->'items') y where y->>'key' = 'custom_' || wnew)
    and exists (select 1 from jsonb_array_elements(wpage->'items') y where y->>'key' = 'process_pending')
    and wann ? wdocs and wann ? wopen and wann ? wcarry and not (wann ? wnew)
    and (select flow_run_id is not null and flow_stage_key = 'qar4w-s2' and published_at is not null and status = 'pending'
           from public.onboarding_steps where id = wcarry)
    and not exists (select 1 from public.onboarding_step_dependencies where step_id = wcarry),
    'got', jsonb_build_object('page', (select jsonb_agg(y->>'key') from jsonb_array_elements(wpage->'items') y), 'announce', wann,
             'carry', (select jsonb_build_object('run', flow_run_id, 'stage', flow_stage_key, 'pub', published_at, 'status', status)
                         from public.onboarding_steps where id = wcarry)));

  -- R.21 · משימה אוטומטית: של הקליטה החדשה מול זו שעברה (אותה תצורה — רק השער שונה)
  insert into public.onboarding_steps (user_id, engagement_id, client_id, step_type, track, scope, status, ball, payload, published_at)
  values (uid, we, wc, 'custom_request', 'custom', 'person', 'pending', 'client',
          '{"title":"אוטומטית חדשה W","autoAction":{"kind":"email"},"externalParty":{"kind":"other","contact":{"email":""}}}', now())
  returning id into wauto_new;
  wr1 := public.execute_automatic_step(wauto_new);
  wr2 := public.execute_automatic_step(wauto_old);
  out := out || jsonb_build_object('t', 'R.21 משימה אוטומטית: של הקליטה החדשה ⇒ מחכה לפרסום (process_unpublished); זו שעברה — לא בגלל הקליטה (נעצרת אחרי השער: אין כתובת)', 'pass',
    wr1->>'skipped' = 'process_unpublished' and wr2->>'skipped' = 'contact_missing',
    'got', jsonb_build_array(wr1, wr2));

  -- R.22 · «פרסם בדף»
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', uid::text, true);
  execute 'set local role authenticated';
  wr1 := public.publish_case_changes(wc);
  execute 'set local role postgres';
  wpage := public.build_client_portal(wc, 'live');
  select coalesce(jsonb_agg(a.step_id), '[]'::jsonb) into wann from public._client_announceable_steps(wc) a;
  wr2 := public.execute_automatic_step(wauto_new);
  out := out || jsonb_build_object('t', 'R.22 «פרסם בדף» ⇒ הקליטה נפתחה: הבקשה החדשה בדף ובמייל, מה שעבר נשאר, «מכינים» ירד; המשימה האוטומטית החדשה עוברת את השער', 'pass',
    coalesce((wr1->>'ok')::boolean, false) and (wr1->>'processOpened')::int = 1
    and (select process_published_at is not null from public.engagements where id = we)
    and exists (select 1 from jsonb_array_elements(wpage->'items') y where y->>'key' = 'custom_' || wnew)
    and exists (select 1 from jsonb_array_elements(wpage->'items') y where y->>'key' = 'custom_' || wopen)
    and exists (select 1 from jsonb_array_elements(wpage->'items') y where y->>'key' = 'custom_' || wcarry)
    and exists (select 1 from jsonb_array_elements(wpage->'items') y where y->>'key' = 'docs')
    and not exists (select 1 from jsonb_array_elements(wpage->'items') y where y->>'key' = 'process_pending')
    and wann ? wnew and wann ? wdocs and wann ? wopen and wann ? wcarry
    and wr2->>'skipped' = 'contact_missing',
    'got', jsonb_build_object('publish', wr1, 'auto', wr2, 'announce', wann,
                              'page', (select jsonb_agg(y->>'key') from jsonb_array_elements(wpage->'items') y)));

  update public.office_flow_versions v set definition = wdef0
    from public.office_flows f
   where f.id = v.flow_id and v.version = f.current_version
     and f.office_id = v_office and f.trigger = 'quote_approved' and f.status = 'active';
  update public.office_journey_defaults set entries = wodj where office_id = v_office and client_kind = 'licensed_dealer';
  exception when others then
    out := out || jsonb_build_object('t', 'קרס: R.18–R.22 · לקוח שחוזר בדרך האמיתית', 'pass', false, 'got', sqlerrm);
  end;
  execute 'set local role postgres';

  -- ══ L · משימות פנימיות ישנות ובעלים של תבנית ═════════════════════════════════
  begin
  out := out || jsonb_build_object('t', 'L.0 הכללים: תוכן ללקוח · בעלים של רשומה בספרייה · בעלים כשבקשה נשמרת לתבנית', 'pass',
    not public._payload_has_client_content(null) and not public._payload_has_client_content('{}')
    and not public._payload_has_client_content('{"title":"x","externalParty":null,"clientLinkUrl":"  "}')
    and public._payload_has_client_content('{"guideKey":"g"}') and public._payload_has_client_content('{"clientLinkUrl":"https://x"}')
    and public._payload_has_client_content('{"messageOnly":true}') and public._payload_has_client_content('{"externalParty":{"kind":"other"}}')
    and public._payload_has_client_content('{"requirements":[{"key":"a"}]}') and not public._payload_has_client_content('{"requirements":[]}')
    and public._template_entry_owner('{"owner":"me","payload":{"requirements":[{"key":"a","kind":"confirm","label":"x"}]}}') = 'client'
    and public._template_entry_owner('{"owner":"me","officeTask":true,"payload":{"requirements":[{"key":"a","kind":"confirm","label":"x"}]}}') = 'me'
    and public._template_entry_owner('{"owner":"me","payload":{"title":"משימה"}}') = 'me'
    and public._template_entry_owner('{"owner":"me","payload":{"messageOnly":true,"message":"x"}}') = 'me'
    and public._template_entry_owner('{"owner":"me","stepType":"file_opening","payload":{"checklist":[{"key":"v"}]}}') = 'me'
    and public._template_entry_owner('{"owner":"me","stepType":"client_documents","payload":{"checklist":[{"key":"v"}]}}') = 'client'
    and public._template_entry_owner('{"owner":"client","payload":{"externalParty":{"kind":"other"}}}') = 'external'
    and public._template_entry_owner('{"payload":{}}') = 'client'
    and public._step_template_owner('custom_request', 'client', '{"internalTask":true}') = 'me'
    and public._step_template_owner('custom_request', 'me', '{"requirements":[{"key":"a"}]}') = 'client'
    and public._step_template_owner('custom_request', 'me', '{"messageOnly":true,"message":"x"}') = 'me'
    and public._step_template_owner('client_documents', 'me', '{"checklist":[{"key":"a"}]}') = 'client'
    and public._step_template_owner('release_letter', 'me', '{}') = 'me'
    and public._step_template_owner('custom_request', 'me', '{"externalParty":{"kind":"prev_accountant"}}') = 'external',
    'got', null);

  -- שורות ישנות (לפני 216): נוצרות עם כדור 'client' (הטריגר לא מסמן), ואז מעודכנות למצב היעד.
  insert into public.clients (id, user_id, first_name, last_name, email, lifecycle_stage, family_status, dealer_type)
  values (lc, uid, 'ישן', 'QAR4L', 'delivered@resend.dev', 'active', 'single', 'licensed');
  insert into public.engagements (id, user_id, client_id, status, process_published_at) values (le, uid, lc, 'active', now());
  for lr in select * from jsonb_to_recordset('[
      {"n":"L1","ball":"me","status":"pending","owner":"me","cev":false,"payload":{"title":"L1"}},
      {"n":"L2","ball":"client","status":"waiting_client","owner":"me","cev":false,"payload":{"title":"L2"}},
      {"n":"L3","ball":"authority","status":"pending","owner":"me","cev":false,"payload":{"title":"L3"}},
      {"n":"L4","ball":"me","status":"completed","owner":"me","cev":false,"payload":{"title":"L4"}},
      {"n":"L5","ball":"me","status":"completed","owner":"client","cev":true,"payload":{"title":"L5","clientTitle":"L5","requirements":[{"key":"r1","kind":"confirm","label":"אישור","done":true,"required":true}]}},
      {"n":"L6","ball":"me","status":"pending","owner":"me","cev":false,"payload":{"title":"L6","clientTitle":"L6","requirements":[{"key":"r1","kind":"file","label":"קובץ","done":false,"required":true}]}},
      {"n":"L7","ball":"me","status":"pending","owner":"me","cev":false,"payload":{"title":"L7","clientTitle":"L7","messageOnly":true,"message":"שלום"}},
      {"n":"L8","ball":"client","status":"waiting_client","owner":null,"cev":false,"payload":{"title":"L8","clientTitle":"L8"}},
      {"n":"L9","ball":"me","status":"pending","owner":"me","cev":false,"payload":{"title":"L9"},"draft":{"title":"L9","requirements":[{"key":"r1","kind":"confirm","label":"אישור","done":false,"required":true}]}},
      {"n":"L10","ball":"me","status":"pending","owner":"me","cev":false,"payload":{"title":"L10","internalTask":false}},
      {"n":"L11","ball":"me","status":"completed","owner":"external","cev":false,"payload":{"title":"L11","externalParty":{"kind":"other","contact":{"email":"delivered@resend.dev"}}}},
      {"n":"L12","ball":"me","status":"pending","owner":"me","cev":false,"payload":{"title":"L12","clientTitle":"L12","clientLinkUrl":"https://example.org/g"}}
    ]'::jsonb) as t(n text, ball text, status text, owner text, cev boolean, payload jsonb, draft jsonb) loop
    insert into public.onboarding_steps (user_id, engagement_id, client_id, step_type, track, scope, status, ball, payload, published_at)
    values (uid, le, lc, 'custom_request', 'custom', 'person', 'pending', 'client', lr.payload, now() - interval '30 days')
    returning id into v;
    update public.onboarding_steps set ball = lr.ball, status = lr.status, draft_payload = lr.draft where id = v;
    if lr.owner is not null then
      insert into public.onboarding_events (user_id, step_id, engagement_id, type, actor, note, meta)
      values (uid, v, le, 'created', 'accountant', 'נוספה בקשה', jsonb_build_object('stepType', 'custom_request', 'owner', lr.owner));
    end if;
    if lr.cev then
      insert into public.onboarding_events (user_id, step_id, engagement_id, type, actor, note, meta)
      values (uid, v, le, 'status_changed', 'client', 'הלקוח השלים', '{}'::jsonb);
    end if;
    lmap := lmap || jsonb_build_object(lr.n, v);
  end loop;
  -- «עודכן» ישן במכוון (בטרנזקציה now() קבוע — בלי זה הבדיקה לא הייתה מבחינה).
  alter table public.onboarding_steps disable trigger set_onboarding_steps_updated_at;
  update public.onboarding_steps set updated_at = now() - interval '5 days' where id = lmap->>'L2';
  select updated_at into lts from public.onboarding_steps where id = lmap->>'L2';
  res := public._mark_legacy_internal_tasks(lc);
  res2 := public._mark_legacy_internal_tasks(lc);
  alter table public.onboarding_steps enable trigger set_onboarding_steps_updated_at;
  out := out || jsonb_build_object('t', 'L.1 נוצרה כמשימה של המשרד והלקוח לא פעל בה ⇒ פנימית — בכל כדור ומצב (גם אחרי «ממתין ללקוח»)', 'pass',
    (select bool_and(coalesce(payload->>'internalTask', '') = 'true') from public.onboarding_steps
      where id in (lmap->>'L1', lmap->>'L2', lmap->>'L3', lmap->>'L4')),
    'got', res);
  out := out || jsonb_build_object('t', 'L.2 לא נגעו: בקשה של הלקוח, תוכן ללקוח, הודעה, עריכה שמוסיפה תוכן, סימון false, גורם חיצוני, קישור', 'pass',
    (select bool_and(not (payload ? 'internalTask') and not (payload ? 'internalTaskReview')) from public.onboarding_steps
      where id in (lmap->>'L5', lmap->>'L6', lmap->>'L7', lmap->>'L9', lmap->>'L11', lmap->>'L12'))
    and (select payload->>'internalTask' = 'false' and not (payload ? 'internalTaskReview') from public.onboarding_steps where id = lmap->>'L10'),
    'got', null);
  res3 := public.build_client_portal(lc, 'live');
  out := out || jsonb_build_object('t', 'L.3 הדף: המשימות הפנימיות ירדו; בקשות הלקוח, ההודעה, הקישור ומה שלבדיקה — נשארו', 'pass',
    not exists (select 1 from jsonb_array_elements(res3->'items') x
                 where x->>'key' in ('custom_' || (lmap->>'L1'), 'custom_' || (lmap->>'L2'), 'custom_' || (lmap->>'L3'), 'custom_' || (lmap->>'L4')))
    and (select count(*) from jsonb_array_elements(res3->'items') x
          where x->>'key' in ('custom_' || (lmap->>'L5'), 'custom_' || (lmap->>'L6'), 'custom_' || (lmap->>'L7'),
                              'custom_' || (lmap->>'L8'), 'custom_' || (lmap->>'L12'))) = 5,
    'got', res3->'items');
  out := out || jsonb_build_object('t', 'L.4 בלי ראיה ובלי תוכן ⇒ «לבדיקה» (נשארת בדף, לא במייל); הפנימית שאחרי «ממתין ללקוח» — לא במייל', 'pass',
    (select payload->>'internalTaskReview' = 'true' from public.onboarding_steps where id = lmap->>'L8')
    and not exists (select 1 from public._client_announceable_steps(lc) a where a.step_id in (lmap->>'L2', lmap->>'L8')),
    'got', (select jsonb_agg(a.step_id) from public._client_announceable_steps(lc) a));
  out := out || jsonb_build_object('t', 'L.5 אידמפוטנטי ובלי לגעת ב«עודכן»: ריצה שנייה — 0/0; ארבע שורות ב«פעילות» (legacyMark)', 'pass',
    (res->>'marked')::int = 4 and (res->>'review')::int = 1
    and (res2->>'marked')::int = 0 and (res2->>'review')::int = 0
    and (select updated_at from public.onboarding_steps where id = lmap->>'L2') = lts
    and (select count(*) from public.onboarding_events ev join public.onboarding_steps s on s.id = ev.step_id
          where s.client_id = lc and ev.meta->>'legacyMark' = 'true') = 4,
    'got', jsonb_build_object('first', res, 'second', res2));
  out := out || jsonb_build_object('t', 'L.5א (F4) פנימית שחיכתה ללקוח ⇒ חזרה אליך: «פתוחה», הכדור אצלך, ונרשם; השאר לא זזו', 'pass',
    (res->>'backToOffice')::int = 1 and (res2->>'backToOffice')::int = 0
    and (select status = 'pending' and ball = 'me' from public.onboarding_steps where id = lmap->>'L2')
    and exists (select 1 from public.onboarding_events where step_id = lmap->>'L2' and type = 'status_changed'
                 and meta->>'internalBackToOffice' = 'true' and meta->>'from' = 'waiting_client' and meta->>'to' = 'pending')
    and (select ball = 'authority' and status = 'pending' from public.onboarding_steps where id = lmap->>'L3')
    and (select status = 'completed' from public.onboarding_steps where id = lmap->>'L4')
    and (select ball = 'client' and status = 'waiting_client' from public.onboarding_steps where id = lmap->>'L8'),
    'got', (select jsonb_object_agg(n, (select jsonb_build_object('status', status, 'ball', ball) from public.onboarding_steps where id = lmap->>n))
              from unnest(array['L2', 'L3', 'L4', 'L8']) n));

  -- «הסתר מהדף»
  perform set_config('request.jwt.claims', json_build_object('sub', other, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', other::text, true);
  execute 'set local role authenticated';
  res := public.hide_step_from_client(lmap->>'L8');
  execute 'set local role postgres';
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', uid::text, true);
  execute 'set local role authenticated';
  res2 := public.hide_step_from_client(lmap->>'L6');
  res3 := public.hide_step_from_client(lmap->>'L8');
  execute 'set local role postgres';
  out := out || jsonb_build_object('t', 'L.6 «הסתר מהדף»: משתמש אחר — forbidden; בקשה עם תוכן — לא; משימה ישנה בלי תוכן — פנימית, בלי «לבדיקה», ונרשם', 'pass',
    res->>'error' = 'forbidden' and res2->>'error' = 'has_client_content' and coalesce((res3->>'ok')::boolean, false)
    and (select payload->>'internalTask' = 'true' and not (payload ? 'internalTaskReview') from public.onboarding_steps where id = lmap->>'L8')
    and exists (select 1 from public.onboarding_events where step_id = lmap->>'L8' and meta->>'hiddenFromClient' = 'true')
    and not exists (select 1 from jsonb_array_elements(public.build_client_portal(lc, 'live')->'items') x where x->>'key' = 'custom_' || (lmap->>'L8')),
    'got', jsonb_build_array(res, res2, res3));
  out := out || jsonb_build_object('t', 'L.6א (F4) «הסתר מהדף» על משימה שחיכתה ללקוח ⇒ חוזרת אליך (backToOffice), ונרשם ביומן', 'pass',
    coalesce((res3->>'backToOffice')::boolean, false)
    and (select status = 'pending' and ball = 'me' from public.onboarding_steps where id = lmap->>'L8')
    and exists (select 1 from public.onboarding_events where step_id = lmap->>'L8' and type = 'status_changed'
                 and actor = 'accountant' and meta->>'internalBackToOffice' = 'true' and meta->>'from' = 'waiting_client'),
    'got', jsonb_build_object('hide', res3, 'row', (select jsonb_build_object('status', status, 'ball', ball) from public.onboarding_steps where id = lmap->>'L8')));

  -- הטריגר: externalParty: null אינו גורם חיצוני; קישור ללקוח — תוכן
  insert into public.onboarding_steps (user_id, engagement_id, client_id, step_type, track, scope, status, ball, payload)
  values (uid, le, lc, 'custom_request', 'custom', 'person', 'pending', 'me', '{"title":"null party","externalParty":null}')
  returning id into sx;
  insert into public.onboarding_steps (user_id, engagement_id, client_id, step_type, track, scope, status, ball, payload)
  values (uid, le, lc, 'custom_request', 'custom', 'person', 'pending', 'me', '{"title":"קישור","clientLinkUrl":"https://example.org/x"}')
  returning id into sy;
  out := out || jsonb_build_object('t', 'L.7 סימון ביצירה: «גורם חיצוני: ריק» — פנימית; קישור ללקוח — לא', 'pass',
    (select payload->>'internalTask' = 'true' from public.onboarding_steps where id = sx)
    and (select not (payload ? 'internalTask') from public.onboarding_steps where id = sy),
    'got', null);

  -- קדימה: הספרייה, «שמור כתבנית» והחלת תבנית
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', uid::text, true);
  execute 'set local role authenticated';
  res := public.upsert_library_request(null, 'QAR4L משימת משרד', null,
           '{"stepType":"custom_request","owner":"me","requiredForClose":false,"payload":{"title":"QAR4L משימת משרד","requirements":[{"key":"r1","kind":"confirm","label":"לבדוק","done":false,"required":true}]}}'::jsonb);
  res2 := public.save_request_template(lmap->>'L5', 'QAR4L מבקשת לקוח', null);
  res3 := public.save_request_template(lmap->>'L1', 'QAR4L ממשימה', null);
  execute 'set local role postgres';
  out := out || jsonb_build_object('t', 'L.8 ספרייה: «המשרד» נשמר עם officeTask, ונוצר כמשימה פנימית (גם עם «מה צריך לעשות»)', 'pass',
    (select entries->0->>'officeTask' = 'true' from public.journey_templates where id = res->>'templateId')
    and (select x->>'owner' = 'me' and x->'payload'->>'internalTask' = 'true'
           from (select public._flow_item_spec(uid, jsonb_build_object('key', 'l8', 'ref', jsonb_build_object('kind', 'template', 'templateId', res->>'templateId')), false) as x) q),
    'got', res);
  insert into public.journey_templates (user_id, office_id, kind, name, entries)
  values (uid, v_office, 'request', 'QAR4L ישנה',
          '[{"key":"e1","stepType":"custom_request","owner":"me","requiredForClose":true,"payload":{"title":"QAR4L ישנה","clientTitle":"QAR4L ישנה","requirements":[{"key":"r1","kind":"file","label":"תלוש","done":false,"required":true}]}}]')
  returning id into v2;
  out := out || jsonb_build_object('t', 'L.9 תבנית ישנה (בעלים מהכדור, עם פריטים, בלי officeTask) ⇒ בקשה ללקוח, לא מוסתרת', 'pass',
    (select x->>'owner' = 'client' and not (x->'payload' ? 'internalTask')
       from (select public._flow_item_spec(uid, jsonb_build_object('key', 'l9', 'ref', jsonb_build_object('kind', 'template', 'templateId', v2)), false) as x) q),
    'got', null);
  out := out || jsonb_build_object('t', 'L.10 «שמור כתבנית»: מבקשה שהלקוח השלים — ללקוח; ממשימה פנימית — המשרד + officeTask', 'pass',
    (select entries->0->>'owner' = 'client' and not (entries->0 ? 'officeTask') from public.journey_templates where id = res2->>'templateId')
    and (select entries->0->>'owner' = 'me' and entries->0->>'officeTask' = 'true' and not (entries->0->'payload' ? 'internalTask')
           from public.journey_templates where id = res3->>'templateId'),
    'got', jsonb_build_array(res2, res3));
  insert into public.journey_templates (user_id, office_id, kind, name, entries)
  values (uid, v_office, 'journey', 'QAR4L מסע',
          '[{"key":"j1","stepType":"custom_request","owner":"me","requiredForClose":false,"payload":{"title":"QAR4L מסע ללקוח","clientTitle":"QAR4L מסע ללקוח","requirements":[{"key":"r1","kind":"file","label":"תלוש","done":false,"required":true}]}},
            {"key":"j2","stepType":"custom_request","owner":"me","officeTask":true,"requiredForClose":false,"payload":{"title":"QAR4L מסע משרד","requirements":[{"key":"r1","kind":"confirm","label":"לבדוק","done":false,"required":true}]}}]')
  returning id into v2;
  execute 'set local role authenticated';
  res := public.apply_journey_template(lc, v2);
  execute 'set local role postgres';
  out := out || jsonb_build_object('t', 'L.11 החלת תבנית «מסע»: בעלים מהכדור עם פריטים ⇒ ללקוח; officeTask ⇒ משימה פנימית', 'pass',
    (res->>'added')::int = 2
    and (select ball = 'client' and not (payload ? 'internalTask') from public.onboarding_steps
          where client_id = lc and payload->'templateOrigin'->>'key' = 'j1' and payload->'templateOrigin'->>'templateId' = v2)
    and (select ball = 'me' and payload->>'internalTask' = 'true' from public.onboarding_steps
          where client_id = lc and payload->'templateOrigin'->>'key' = 'j2' and payload->'templateOrigin'->>'templateId' = v2),
    'got', res);
  exception when others then
    out := out || jsonb_build_object('t', 'קרס: L · משימות פנימיות ישנות ובעלים של תבנית', 'pass', false, 'got', sqlerrm);
  end;
  execute 'set local role postgres';
  begin
    alter table public.onboarding_steps enable trigger set_onboarding_steps_updated_at;
  exception when others then null;
  end;

  -- ══ G · אישור הייצוג באזור האישי — מה מסמנים (links-guide §4, 27.1–27.8) ═══════════════
  -- זוג: מס הכנסה רשום על רחל (הוכרע), מע״מ לשניהם. בשע״ם: רחל — מס הכנסה ומע״מ, דוד — מע״מ.
  begin
  insert into public.clients (id, user_id, first_name, last_name, email, lifecycle_stage, family_status, dealer_type,
                              spouse_first_name, spouse_last_name, tax_files, registered_spouse_verified)
  values (apc, uid, 'דוד', 'QAR4G', 'delivered@resend.dev', 'onboarding', 'married', 'licensed',
          'רחל', 'QAR4G', '[{"authority":"income_tax","owner":"spouse","fileNumber":"000000018"}]'::jsonb, true);
  insert into public.engagements (id, user_id, client_id, status, process_published_at) values (ape, uid, apc, 'onboarding', now());
  insert into public.representation_requests (id, user_id, linked_client_id, client_name, client_email, status, onboarding_token, scope, execution)
  values (apr, uid, apc, 'QAR4G', 'delivered@resend.dev', 'awaiting_authorities', 'qar4g-' || apr,
          '{"incomeTax":{"status":"in_process"},"vat":{"status":"in_process","targets":["client","spouse"]}}'::jsonb,
          jsonb_build_object('shaam', jsonb_build_object(
            'person:spouse', jsonb_build_object('requestedSystems', jsonb_build_array('מס הכנסה', 'מע"מ')),
            'person:client', jsonb_build_object('requestedSystems', jsonb_build_array('מע"מ')))));
  aps := public.ensure_rep_client_approval_step(apc);
  apexp := '[{"person":"client","name":"דוד","systems":["מע״מ"]},{"person":"spouse","name":"רחל","systems":["מס הכנסה","מע״מ"]}]'::jsonb;

  select x into apx from jsonb_array_elements(public.build_client_portal(apc, 'live')->'items') x where x->>'key' = 'rep_approval';
  out := out || jsonb_build_object('t', 'G.1 (27.1) הכרטיס בדף: שני אנשים — הלקוח קודם, רחל מס הכנסה ומע״מ, דוד מע״מ (משע״ם)', 'pass',
    aps is not null and apx->>'bucket' = 'action' and apx->'approvals' = apexp,
    'got', apx->'approvals');

  update public.representation_requests set execution = '{}'::jsonb where id = apr;
  res := public._rep_approval_people(apc);
  update public.clients set registered_spouse_verified = false where id = apc;
  res2 := public._rep_approval_people(apc);
  select x into apy from jsonb_array_elements(public.build_client_portal(apc, 'live')->'items') x where x->>'key' = 'rep_approval';
  update public.clients set registered_spouse_verified = true where id = apc;
  update public.clients set tax_files = '[]'::jsonb where id = apc;
  res3 := public._rep_approval_people(apc);
  update public.clients set tax_files = '[{"authority":"income_tax","owner":"spouse","fileNumber":"000000018"}]'::jsonb where id = apc;
  out := out || jsonb_build_object('t', 'G.2 (27.2) בלי שע״ם — מההיקף + מי שרשום/ה: אותה תשובה; לא הוכרע / אין תיק מ"ה ⇒ אין approvals (לא מנחשים)', 'pass',
    res = apexp and res2 = '[]'::jsonb and res3 = '[]'::jsonb
    and apy->>'bucket' = 'action' and not (apy ? 'approvals'),
    'got', jsonb_build_array(res, res2, res3, apy->'approvals'));

  select payload->>'clientNote' into apnote from public.onboarding_steps where id = aps;
  out := out || jsonb_build_object('t', 'G.3 (27.3) נוסח הכרטיס: ירידות שורה אמיתיות, בלי «\n» כתווים', 'pass',
    position(E'\\n' in apnote) = 0 and position(E'\n\n' in apnote) > 0 and apx->>'note' = apnote,
    'got', apnote);
  out := out || jsonb_build_object('t', 'G.4 (27.4) «את כל הבקשות» — הנוסח מהחוזה, ולא ביחיד', 'pass',
    apnote like '%את כל הבקשות%'
    and position('כן - נכנסים בקישור, לוחצים "לכניסה למערכת" ומזדהים. מסמנים את כל הבקשות שבהן המשרד מופיע כמייצג, ולוחצים «אישור ייצוג». שתי דקות.' in apnote) > 0
    and apnote not like '%את הבקשה שבה%'
    and apnote like 'יש לך כבר משתמש באזור האישי של רשות המסים?' || E'\n\n' || 'כן - %',
    'got', apnote);

  -- כרטיס ישן (186) שנשמר עם «\n» כתווים: בדף — ירידת שורה; השורה השמורה לא משתנה.
  select client_content_version into apv1 from public.onboarding_steps where id = aps;
  update public.onboarding_steps set payload = payload || jsonb_build_object('clientNote', E'שאלה?\\n\\nכן - תשובה.') where id = aps;
  select x into apy from jsonb_array_elements(public.build_client_portal(apc, 'live')->'items') x where x->>'key' = 'rep_approval';
  out := out || jsonb_build_object('t', 'G.5 כרטיס שנשמר עם «\n» (באג 186) — בדף ירידת שורה, בלי לכתוב לשורה ובלי גרסה חדשה ללקוח', 'pass',
    apy->>'note' = E'שאלה?\n\nכן - תשובה.'
    and (select payload->>'clientNote' = E'שאלה?\\n\\nכן - תשובה.' and client_content_version = apv1
           from public.onboarding_steps where id = aps),
    'got', apy->>'note');
  update public.onboarding_steps set payload = payload || jsonb_build_object('clientNote', apnote) where id = aps;
  update public.representation_requests
     set execution = jsonb_build_object('shaam', jsonb_build_object(
           'person:spouse', jsonb_build_object('requestedSystems', jsonb_build_array('מס הכנסה', 'מע"מ')),
           'person:client', jsonb_build_object('requestedSystems', jsonb_build_array('מע"מ'))))
   where id = apr;

  -- 27.6: שע״ם דרשה + שורת מע״מ «ממתין לאישור לקוח» (7 / תיק 91) אצל דוד
  select client_content_version into apv1 from public.onboarding_steps where id = aps;
  perform public.shaam_require_client_approval(apc);
  update public.representation_requests
     set execution = jsonb_set(execution, '{shaam,person:client,systems}',
           '[{"systemCode":"2","systemLabel":"מע\"מ","systemStateCode":7,"tik91":true}]'::jsonb)
   where id = apr;
  select client_content_version into apv2 from public.onboarding_steps where id = aps;
  select x into apy from jsonb_array_elements(public.build_client_portal(apc, 'live')->'items') x where x->>'key' = 'rep_approval';
  out := out || jsonb_build_object('t', 'G.6 (27.6) שע״ם דרשה: awaiting של דוד = מע״מ, גרסת התוכן עלתה, והנוסח לא השתנה', 'pass',
    apy->'approvals'->0->>'person' = 'client' and apy->'approvals'->0->'awaiting' = '["מע״מ"]'::jsonb
    and apy->'approvals'->0->'systems' = '["מע״מ"]'::jsonb and not (apy->'approvals'->1 ? 'awaiting')
    and apv2 > apv1 and apy->>'note' = apnote
    and (select payload->>'clientNote' = apnote and payload->>'requiredBy' = 'shaam' from public.onboarding_steps where id = aps),
    'got', jsonb_build_object('item', apy, 'v1', apv1, 'v2', apv2));

  select x into apz from jsonb_array_elements(public.build_client_portal(apc, 'preview')->'items') x where x->>'key' = 'rep_approval';
  out := out || jsonb_build_object('t', 'G.7 (27.7) תצוגה מקדימה — אותם approvals', 'pass',
    apz->'approvals' = apy->'approvals' and apz->'approvals' is not null,
    'got', apz->'approvals');

  -- G.7א (H2.5b) · שורת המשנה כשהאישור נדרש — לפי מי ששע״ם ממתינה לאישור שלו (דף של דוד).
  apsubs := jsonb_build_array(apy->>'sub');
  update public.representation_requests
     set execution = jsonb_set(jsonb_set(execution, '{shaam,person:client,systems}', '[]'::jsonb),
           '{shaam,person:spouse,systems}', '[{"systemCode":"1","systemLabel":"מס הכנסה","systemStateCode":7,"tik91":true}]'::jsonb)
   where id = apr;
  apsubs := apsubs || jsonb_build_array((select x->>'sub' from jsonb_array_elements(public.build_client_portal(apc, 'live')->'items') x where x->>'key' = 'rep_approval'));
  update public.representation_requests
     set execution = jsonb_set(execution, '{shaam,person:client,systems}',
           '[{"systemCode":"2","systemLabel":"מע\"מ","systemStateCode":7,"tik91":true}]'::jsonb)
   where id = apr;
  apsubs := apsubs || jsonb_build_array((select x->>'sub' from jsonb_array_elements(public.build_client_portal(apc, 'preview')->'items') x where x->>'key' = 'rep_approval'));
  update public.representation_requests
     set execution = jsonb_set(jsonb_set(execution, '{shaam,person:client,systems}', '[]'::jsonb), '{shaam,person:spouse,systems}', '[]'::jsonb)
   where id = apr;
  apsubs := apsubs || jsonb_build_array((select x->>'sub' from jsonb_array_elements(public.build_client_portal(apc, 'live')->'items') x where x->>'key' = 'rep_approval'));
  out := out || jsonb_build_object('t', 'G.7א (H2.5b) נדרש: «…לאישור שלך» (דוד) / «…של רחל» / «שלך ושל רחל» (תצוגה מקדימה זהה); אף אחד לא ממתין ⇒ הנוסח השמור', 'pass',
    apsubs = jsonb_build_array('נדרש - רשות המסים ממתינה לאישור שלך', 'נדרש - רשות המסים ממתינה לאישור של רחל',
                               'נדרש - רשות המסים ממתינה לאישור שלך ושל רחל',
                               (select payload->>'clientSub' from public.onboarding_steps where id = aps))
    and (select payload->>'clientSub' = 'נדרש - רשות המסים ממתינה לאישור שלך לבקשת הייצוג' from public.onboarding_steps where id = aps),
    'got', apsubs);
  out := out || jsonb_build_object('t', 'G.7ב _rep_approval_required_sub: בלי שם ⇒ «בן/בת הזוג»; awaiting ריק / קלט משונה ⇒ null', 'pass',
    public._rep_approval_required_sub('[{"person":"spouse","systems":["מע״מ"],"awaiting":["מע״מ"]}]'::jsonb)
      = 'נדרש - רשות המסים ממתינה לאישור של בן/בת הזוג'
    and public._rep_approval_required_sub('[{"person":"client","name":"דוד","systems":["מע״מ"],"awaiting":[]}]'::jsonb) is null
    and public._rep_approval_required_sub('[{"person":"client","name":"דוד","systems":["מע״מ"]}]'::jsonb) is null
    and public._rep_approval_required_sub('{}'::jsonb) is null and public._rep_approval_required_sub(null) is null
    and not has_function_privilege('anon', 'public._rep_approval_required_sub(jsonb)', 'EXECUTE')
    and not has_function_privilege('authenticated', 'public._rep_approval_required_sub(jsonb)', 'EXECUTE'),
    'got', null);

  -- G.7ג · shaam_require_client_approval כשכבר ידוע שבת הזוג ממתינה ⇒ הנוסח השמור «…של רחל».
  insert into public.clients (id, user_id, first_name, last_name, email, lifecycle_stage, family_status, dealer_type,
                              spouse_first_name, spouse_last_name, tax_files, registered_spouse_verified)
  values (apc4, uid, 'דוד', 'QAR4G4', 'delivered@resend.dev', 'onboarding', 'married', 'licensed',
          'רחל', 'QAR4G4', '[{"authority":"income_tax","owner":"spouse","fileNumber":"000000018"}]'::jsonb, true);
  insert into public.engagements (id, user_id, client_id, status, process_published_at) values (ape4, uid, apc4, 'onboarding', now());
  insert into public.representation_requests (id, user_id, linked_client_id, client_name, client_email, status, onboarding_token, scope, execution)
  values (apr4, uid, apc4, 'QAR4G4', 'delivered@resend.dev', 'awaiting_authorities', 'qar4g-' || apr4,
          '{"incomeTax":{"status":"in_process"}}'::jsonb,
          jsonb_build_object('shaam', jsonb_build_object('person:spouse', jsonb_build_object(
            'requestedSystems', jsonb_build_array('מס הכנסה'),
            'systems', '[{"systemCode":"1","systemLabel":"מס הכנסה","systemStateCode":7,"tik91":true}]'::jsonb))));
  aps4 := public.shaam_require_client_approval(apc4);
  out := out || jsonb_build_object('t', 'G.7ג shaam_require_client_approval: בת הזוג ממתינה ⇒ נשמר «…ממתינה לאישור של רחל» (לא «שלך»)', 'pass',
    (select payload->>'clientSub' = 'נדרש - רשות המסים ממתינה לאישור של רחל' and payload->>'requiredBy' = 'shaam'
       from public.onboarding_steps where id = aps4),
    'got', (select payload from public.onboarding_steps where id = aps4));

  -- שורות מהבדיקה בלי requestedSystems: שורה שבוטלה לא נספרת; רשות שהוסרה מהבקשה — לא מסמנים
  update public.representation_requests
     set execution = jsonb_build_object('shaam', jsonb_build_object(
           'person:client', jsonb_build_object('systems', '[{"systemCode":"1","systemLabel":"מס הכנסה","systemStateCode":6},{"systemCode":"5","systemLabel":"ניכויים","systemStateCode":7}]'::jsonb),
           'person:spouse', jsonb_build_object('requestedSystems', jsonb_build_array('מס הכנסה', 'מע"מ'),
                                               'replacement', jsonb_build_object('removed', jsonb_build_array('מע"מ')))))
   where id = apr;
  res := public._rep_approval_people(apc);
  out := out || jsonb_build_object('t', 'G.8 בלי requestedSystems — משורות הבדיקה (מה שבוטל לא); רשות שהוסרה מהבקשה — לא', 'pass',
    res = '[{"person":"client","name":"דוד","systems":["ניכויים"]},{"person":"spouse","name":"רחל","systems":["מס הכנסה"]}]'::jsonb,
    'got', res);

  -- נתון פגום בשורה אחת לא שובר את הדף
  update public.representation_requests
     set execution = jsonb_build_object('shaam', jsonb_build_object(
           'person:client', jsonb_build_object('requestedSystems', 'מע"מ',
                                               'systems', '[{"systemCode":"2","systemStateCode":7,"tik91":"אולי"}]'::jsonb)))
   where id = apr;
  res := public._rep_approval_people(apc);
  res2 := public.build_client_portal(apc, 'live');
  select x into apy from jsonb_array_elements(res2->'items') x where x->>'key' = 'rep_approval';
  out := out || jsonb_build_object('t', 'G.9 נתון פגום (tik91 לא בוליאני, requestedSystems לא מערך) ⇒ ריק, והדף נבנה עם הכרטיס בנוסח הכללי', 'pass',
    res = '[]'::jsonb and res2 ? 'items' and apy->>'bucket' = 'action' and not (apy ? 'approvals'),
    'got', jsonb_build_array(res, apy));

  -- העזר חסר (217 עוד לא הוחלה / נמחק) ⇒ הדף נבנה. בתוך תת-טרנזקציה שמתבטלת.
  apb := false;
  begin
    drop function public._rep_approval_people(text);
    res2 := public.build_client_portal(apc, 'live');
    select x into apy from jsonb_array_elements(res2->'items') x where x->>'key' = 'rep_approval';
    apb := apy->>'bucket' = 'action' and not (apy ? 'approvals');
    raise exception 'G10_ROLLBACK';
  exception when others then
    if sqlerrm <> 'G10_ROLLBACK' then apb := false; apy := to_jsonb(sqlerrm); end if;
  end;
  out := out || jsonb_build_object('t', 'G.10 העזר חסר ⇒ הדף נבנה, הכרטיס בנוסח הכללי (הקריאה עטופה)', 'pass',
    apb and to_regprocedure('public._rep_approval_people(text)') is not null,
    'got', apy);

  -- 27.5 + אדם אחד בלי בן/בת זוג + בקשה לפני 141 (authorities בלבד) + בקשה שעוד לא ממתינה לרשויות
  select settings into apset from public.profiles where id = uid;
  update public.profiles
     set settings = coalesce(settings, '{}'::jsonb) || jsonb_build_object('representation',
           (case when jsonb_typeof(settings->'representation') = 'object' then settings->'representation' else '{}'::jsonb end)
           || jsonb_build_object('templates',
             (case when jsonb_typeof(settings->'representation'->'templates') = 'object' then settings->'representation'->'templates' else '{}'::jsonb end)
             || jsonb_build_object('portalCard',
               (case when jsonb_typeof(settings->'representation'->'templates'->'portalCard') = 'object'
                     then settings->'representation'->'templates'->'portalCard' else '{}'::jsonb end)
               || '{"note":"QAR4G הסבר של המשרד"}'::jsonb)))
   where id = uid;
  insert into public.clients (id, user_id, first_name, last_name, email, lifecycle_stage, family_status, dealer_type)
  values (apc3, uid, 'שרה לוי', 'QAR4G', 'delivered@resend.dev', 'onboarding', 'single', 'licensed');
  insert into public.engagements (id, user_id, client_id, status, process_published_at) values (ape3, uid, apc3, 'onboarding', now());
  res := public._rep_approval_people(apc3);
  insert into public.representation_requests (id, user_id, linked_client_id, client_name, client_email, status, onboarding_token, scope)
  values (apr3, uid, apc3, 'QAR4G', 'delivered@resend.dev', 'pending_signature', 'qar4g-' || apr3,
          '{"incomeTax":{"status":"in_process"},"withholding":{"status":"in_process"},"vat":{"status":"none"},"nationalInsurance":{"status":"in_process","targets":["client"]}}'::jsonb);
  res2 := public._rep_approval_people(apc3);
  update public.representation_requests set status = 'awaiting_authorities' where id = apr3;
  aps3 := public.ensure_rep_client_approval_step(apc3);
  res3 := public._rep_approval_people(apc3);
  update public.profiles set settings = apset where id = uid;
  out := out || jsonb_build_object('t', 'G.11 (27.5) נוסח המשרד נשמר בכרטיס החדש', 'pass',
    (select payload->>'clientNote' = 'QAR4G הסבר של המשרד' from public.onboarding_steps where id = aps3),
    'got', (select payload->>'clientNote' from public.onboarding_steps where id = aps3));
  -- G.11א · משך אחד בכרטיס: «שתי דקות» (כמו ההסבר); כרטיס ישן עם «שלוש דקות» — מוצג בנוסח של היום, בלי לכתוב לשורה.
  apsubs := jsonb_build_array((select payload->>'clientSub' from public.onboarding_steps where id = aps3));
  update public.onboarding_steps
     set payload = payload || '{"clientSub":"אופציונלי - שלוש דקות שמקצרות את ההמתנה לאישור הרשויות"}'::jsonb where id = aps3;
  apsubs := apsubs || jsonb_build_array((select x->>'sub' from jsonb_array_elements(public.build_client_portal(apc3, 'live')->'items') x where x->>'key' = 'rep_approval'));
  update public.onboarding_steps set payload = payload || '{"clientSub":"QAR4G שורה של המשרד"}'::jsonb where id = aps3;
  apsubs := apsubs || jsonb_build_array((select x->>'sub' from jsonb_array_elements(public.build_client_portal(apc3, 'live')->'items') x where x->>'key' = 'rep_approval'));
  out := out || jsonb_build_object('t', 'G.11א «שתי דקות» בכרטיס חדש; «שלוש דקות» שנשמר — מוצג «שתי דקות»; נוסח המשרד כמו שהוא', 'pass',
    apsubs = '["אופציונלי - שתי דקות שמקצרות את ההמתנה לאישור הרשויות","אופציונלי - שתי דקות שמקצרות את ההמתנה לאישור הרשויות","QAR4G שורה של המשרד"]'::jsonb,
    'got', apsubs);
  update public.representation_requests set scope = null, authorities = array['vat'] where id = apr3;
  apz := public._rep_approval_people(apc3);
  out := out || jsonb_build_object('t', 'G.12 אדם אחד: בלי שם בן/בת זוג, מס הכנסה וניכויים (בלי ב"ל ובלי «לא התבקש»); בלי בקשה / לפני «ממתין לרשויות» ⇒ ריק; לפני 141 ⇒ authorities לנישום', 'pass',
    res = '[]'::jsonb and res2 = '[]'::jsonb
    and res3 = '[{"person":"client","name":"שרה","systems":["מס הכנסה","ניכויים"]}]'::jsonb
    and apz = '[{"person":"client","name":"שרה","systems":["מע״מ"]}]'::jsonb,
    'got', jsonb_build_array(res, res2, res3, apz));

  out := out || jsonb_build_object('t', 'G.13 (27.8) הרשאות: העזרים וההבטחה של הכרטיס סגורים ל-anon ול-authenticated', 'pass',
    not has_function_privilege('anon', 'public._rep_approval_people(text)', 'EXECUTE')
    and not has_function_privilege('authenticated', 'public._rep_approval_people(text)', 'EXECUTE')
    and not has_function_privilege('anon', 'public._rep_approval_labels(jsonb)', 'EXECUTE')
    and not has_function_privilege('authenticated', 'public._rep_approval_labels(jsonb)', 'EXECUTE')
    and not has_function_privilege('anon', 'public.ensure_rep_client_approval_step(text)', 'EXECUTE')
    and not has_function_privilege('authenticated', 'public.ensure_rep_client_approval_step(text)', 'EXECUTE'),
    'got', null);
  out := out || jsonb_build_object('t', 'G.14 תוויות: שע״ם (מחרוזת / שורה / מפתח), סדר קבוע ובלי כפילויות; קלט משונה ⇒ ריק', 'pass',
    public._rep_approval_labels('["מע״מ","ניכויים","מס הכנסה","מע\"מ","vat"]'::jsonb) = '["מס הכנסה","מע״מ","ניכויים"]'::jsonb
    and public._rep_approval_labels('[{"systemCode":"5"},{"screenLabel":"מע\"מ"},{"systemLabel":"ביטוח לאומי"},3]'::jsonb) = '["מע״מ","ניכויים"]'::jsonb
    and public._rep_approval_labels('"מע״מ"'::jsonb) = '[]'::jsonb and public._rep_approval_labels(null) = '[]'::jsonb,
    'got', null);
  exception when others then
    out := out || jsonb_build_object('t', 'קרס: G · אישור הייצוג באזור האישי', 'pass', false, 'got', sqlerrm);
  end;
  execute 'set local role postgres';

  -- ══ S · בן/בת הזוג במסלול (G1), אישור אישי ביצירה (X-5), שמות בספרייה (216) ════════════
  begin
  out := out || jsonb_build_object('t', 'S.0 השם הפרטי של בן/בת הזוג — כלל אחד: השדה המפוצל, אחרת המילה הראשונה של השם המלא', 'pass',
    public.client_spouse_first_name('רחל', 'רוחלה כהן') = 'רחל'
    and public.client_spouse_first_name(null, 'רחל כהן') = 'רחל'
    and public.client_spouse_first_name('  ', '  רחל   כהן ') = 'רחל'
    and public.client_spouse_first_name('אנה מריה', null) = 'אנה מריה'
    and public.client_spouse_first_name(null, null) is null and public.client_spouse_first_name('', ' ') is null
    and public._creation_problem_class('spouse_name_missing') = 'card',
    'got', null);

  insert into public.clients (id, user_id, first_name, last_name, email, lifecycle_stage, family_status, dealer_type, spouse_name)
  values (sc1, uid, 'דוד', 'QAR4S', 'delivered@resend.dev', 'active', 'married', 'licensed', 'רחל כהן'),
         (sc2, uid, 'משה', 'QAR4S', 'delivered@resend.dev', 'active', 'married', 'licensed', null),
         (sc3, uid, 'יוסי', 'QAR4S', 'delivered@resend.dev', 'active', 'married', 'licensed', null);
  update public.clients set spouse_client_id = sc1 where id = sc3;
  insert into public.engagements (id, user_id, client_id, status, process_published_at)
  values (se1, uid, sc1, 'active', now()), (se2, uid, sc2, 'active', now());
  sfacts := jsonb_build_object('withName', public.client_flow_facts(sc1), 'noName', public.client_flow_facts(sc2),
                               'ownCard', public.client_flow_facts(sc3));
  out := out || jsonb_build_object('t', 'S.1 client_flow_facts: רק «שם בן/בת הזוג» ⇒ יש בן/בת זוג (רחל); בלי שם ⇒ חסר שם; כרטיס משלו ⇒ לא כאן ולא «חסר»', 'pass',
    (sfacts->'withName'->>'hasSpouse')::boolean and sfacts->'withName'->>'spouseFirstName' = 'רחל'
    and not (sfacts->'withName'->>'spouseNameMissing')::boolean
    and not (sfacts->'noName'->>'hasSpouse')::boolean and (sfacts->'noName'->>'spouseNameMissing')::boolean
    and not (sfacts->'ownCard'->>'hasSpouse')::boolean and not (sfacts->'ownCard'->>'spouseNameMissing')::boolean,
    'got', sfacts);

  insert into public.journey_templates (user_id, office_id, kind, name, entries)
  values (uid, v_office, 'request', 'QA R4 S לכל אדם',
          '[{"key":"e1","stepType":"custom_request","owner":"client","requiredForClose":true,"payload":{"title":"QA R4 S תלושים","clientTitle":"QA R4 S תלושים","requirements":[{"key":"r1","kind":"file","label":"תלוש","done":false,"required":true}]}}]')
  returning id into stpl;
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', uid::text, true);
  execute 'set local role authenticated';
  sres := public.create_office_flow('QA R4 S בן/בת זוג', 'manual', jsonb_build_object('stages', jsonb_build_array(
    jsonb_build_object('key', 'a', 'name', 'איסוף', 'opens', jsonb_build_object('after', 'start'), 'delivery', 'approve',
      'items', jsonb_build_array(
        jsonb_build_object('key', 'pp', 'ref', jsonb_build_object('kind', 'template', 'templateId', stpl), 'perPerson', true))))));
  sflow := sres->>'flowId';
  sres := public.start_flow_run(sc1, sflow, null, false);
  srun1 := sres->>'runId';
  sres2 := public.start_flow_run(sc2, sflow, null, false);
  srun2 := sres2->>'runId';
  execute 'set local role postgres';
  out := out || jsonb_build_object('t', 'S.2 (G1) כרטיס עם «שם בן/בת הזוג» בלבד ⇒ «לכל אדם» נפתח גם לרחל, בשמה', 'pass',
    srun1 is not null
    and (select count(*) from public.onboarding_steps where flow_run_id = srun1 and flow_item_key = 'pp' and status <> 'cancelled') = 2
    and exists (select 1 from public.onboarding_steps where flow_run_id = srun1 and flow_item_key = 'pp'
                 and payload->>'subjectRole' = 'spouse' and payload->>'subjectName' = 'רחל'
                 and payload->>'title' = 'QA R4 S תלושים - רחל' and not (payload ? 'creationProblem')),
    'got', jsonb_build_object('start', sres, 'steps', (select jsonb_agg(payload->>'title') from public.onboarding_steps where flow_run_id = srun1)));

  select id into sprob from public.onboarding_steps where client_id = sc2 and payload ? 'creationProblem'
     and status not in ('completed', 'verified', 'skipped', 'cancelled');
  out := out || jsonb_build_object('t', 'S.3 (G1) נשוי/אה בלי שם בכרטיס ⇒ לבעל הכרטיס נפתחה, ולבן/בת הזוג — שורת «לא נוצרה» גלויה («צור שוב»), לא דילוג שקט', 'pass',
    srun2 is not null
    and exists (select 1 from jsonb_array_elements(sres2->'skipped') x
                 where x->>'itemKey' = 'pp' and x->>'role' = 'spouse' and x->>'reason' = 'spouse_name_missing'
                   and (x->>'problem')::boolean and x->>'problemStepId' = sprob)
    and (select count(*) from public.onboarding_steps where flow_run_id = srun2 and flow_item_key = 'pp'
           and not (payload ? 'creationProblem') and status <> 'cancelled') = 1
    and (select ball = 'me' and status = 'pending' and (payload->>'internalTask')::boolean
                and payload->>'subjectRole' = 'spouse' and payload->>'title' = 'לא נוצרה — «QA R4 S לכל אדם» - בן/בת הזוג'
                and payload->'creationProblem'->>'reason' = 'spouse_name_missing'
                and payload->'creationProblem'->>'cls' = 'card' and payload->'creationProblem'->>'next' = 'retry'
                and payload->'creationProblem'->>'key' = 'flow:' || srun2 || ':pp:spouse'
                and flow_run_id = srun2 and flow_item_key = 'pp'
           from public.onboarding_steps where id = sprob)
    and not exists (select 1 from jsonb_array_elements(public.build_client_portal(sc2, 'live')->'items') x where x->>'key' = 'custom_' || sprob),
    'got', jsonb_build_object('start', sres2, 'row', (select payload from public.onboarding_steps where id = sprob)));

  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  sres := public.retry_request_creation(sprob);
  execute 'set local role postgres';
  update public.clients set spouse_first_name = 'דנה', spouse_last_name = 'QAR4S', spouse_name = 'דנה QAR4S' where id = sc2;
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  sres2 := public.retry_request_creation(sprob);
  execute 'set local role postgres';
  select id into sspouse from public.onboarding_steps where flow_run_id = srun2 and flow_item_key = 'pp'
     and payload->>'subjectRole' = 'spouse' and not (payload ? 'creationProblem') and status <> 'cancelled';
  out := out || jsonb_build_object('t', 'S.4 (G1) «צור שוב» לפני שהשם נכתב ⇒ אותה שורה (ניסיון 2); אחרי שנכתב בכרטיס ⇒ נוצרה לדנה והשורה נסגרה', 'pass',
    not coalesce((sres->>'resolved')::boolean, true) and (sres->>'attempts')::int = 2 and sres->>'reason' = 'spouse_name_missing'
    and coalesce((sres2->>'resolved')::boolean, false) and sres2->>'how' = 'created' and sres2->>'stepId' = sspouse
    and (select payload->>'subjectName' = 'דנה' and payload->>'title' = 'QA R4 S תלושים - דנה' from public.onboarding_steps where id = sspouse)
    and (select status = 'cancelled' and payload->'creationProblem'->>'resolvedStepId' = sspouse from public.onboarding_steps where id = sprob),
    'got', jsonb_build_array(sres, sres2));

  insert into public.clients (id, user_id, first_name, last_name, email, lifecycle_stage, family_status, dealer_type)
  values (sc4, uid, 'אבי', 'QAR4S', 'delivered@resend.dev', 'active', 'married', 'licensed');
  insert into public.engagements (id, user_id, client_id, status, process_published_at) values (se4, uid, sc4, 'active', now());
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  sres := public.start_flow_run(sc4, sflow, null, false);
  srun4 := sres->>'runId';
  execute 'set local role postgres';
  select id into sprob4 from public.onboarding_steps where client_id = sc4 and payload ? 'creationProblem'
     and status not in ('completed', 'verified', 'skipped', 'cancelled');
  update public.clients set family_status = 'single' where id = sc4;
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  sres2 := public.retry_request_creation(sprob4);
  execute 'set local role postgres';
  out := out || jsonb_build_object('t', 'S.4א (G1) השורה «חסר שם» כשכבר אין בן/בת זוג (המצב המשפחתי השתנה) ⇒ «צור שוב» סוגר אותה כ«לא חלה», בלי לפתוח בקשה', 'pass',
    sprob4 is not null and coalesce((sres2->>'resolved')::boolean, false) and sres2->>'how' = 'not_applicable'
    and (select status = 'skipped' from public.onboarding_steps where id = sprob4)
    and not exists (select 1 from public.onboarding_steps where flow_run_id = srun4 and payload->>'subjectRole' = 'spouse'
                     and not (payload ? 'creationProblem')),
    'got', jsonb_build_object('start', sres, 'retry', sres2));

  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  sres := public.create_onboarding_request(sc1, 'custom_request',
            '{"title":"QA R4 S אישור","subjectRole":"spouse","subjectName":"רחל","requirements":[{"key":"r1","kind":"confirm","label":"אני מאשרת","done":false,"required":true}]}'::jsonb,
            null, null, true, false, 'client', null);
  sres2 := public.create_onboarding_request(sc1, 'custom_request',
            '{"title":"QA R4 S קובץ","subjectRole":"spouse","subjectName":"רחל","requirements":[{"key":"r1","kind":"file","label":"תלוש","done":false,"required":true}]}'::jsonb,
            null, null, true, false, 'client', null);
  sres3 := public.create_onboarding_request(sc1, 'custom_request',
            '{"title":"QA R4 S אישור שלי","requirements":[{"key":"r1","kind":"confirm","label":"אני מאשר","done":false,"required":true}]}'::jsonb,
            null, null, true, false, 'client', null);
  execute 'set local role postgres';
  out := out || jsonb_build_object('t', 'S.5 (X-5) create_onboarding_request: אישור אישי על בן/בת הזוג ⇒ personal_confirm_for_subject; קובץ לבן/בת הזוג / אישור של בעל הכרטיס — נוצרות', 'pass',
    sres->>'error' = 'personal_confirm_for_subject' and not coalesce((sres->>'ok')::boolean, true)
    and not exists (select 1 from public.onboarding_steps where client_id = sc1 and payload->>'title' = 'QA R4 S אישור')
    and coalesce((sres2->>'ok')::boolean, false) and coalesce((sres3->>'ok')::boolean, false),
    'got', jsonb_build_array(sres, sres2, sres3));

  -- S.6 · שמות בספרייה: בקשת משרד ששונה בין הסוגים ⇒ שם עם הסוגים; זהה לכולם ⇒ השם כמו שהוא.
  out := out || jsonb_build_object('t', 'S.6 _client_kinds_label: «עוסק מורשה ועוסק פטור», «חברה», שלושה עם פסיק ו«ו»', 'pass',
    public._client_kinds_label(array['licensed_dealer', 'exempt_dealer']) = 'עוסק מורשה ועוסק פטור'
    and public._client_kinds_label(array['company']) = 'חברה'
    and public._client_kinds_label(array['licensed_dealer', 'exempt_dealer', 'company']) = 'עוסק מורשה, עוסק פטור וחברה'
    and public._client_kinds_label('{}'::text[]) is null,
    'got', null);
  sn1 := jsonb_build_object('key', 'qar4nm', 'stepType', 'custom_request', 'enabled', true, 'sortIndex', 300, 'source', 'office',
          'requiredForClose', true, 'dueInDays', null, 'dependsOn', null, 'variants', '[]'::jsonb,
          'payload', '{"title":"QA R4 S שם","clientTitle":"QA R4 S שם","requirements":[{"key":"r1","kind":"file","label":"א","done":false,"required":true}]}'::jsonb);
  sn2 := sn1 || jsonb_build_object('payload', '{"title":"QA R4 S שם","clientTitle":"QA R4 S שם","requirements":[{"key":"r1","kind":"file","label":"ב","done":false,"required":true}]}'::jsonb);
  sn3 := sn1 || jsonb_build_object('key', 'qar4nx', 'sortIndex', 310,
          'payload', '{"title":"QA R4 S משותפת","clientTitle":"QA R4 S משותפת","requirements":[{"key":"r1","kind":"file","label":"ג","done":false,"required":true}]}'::jsonb);
  update public.office_flows set status = 'archived' where office_id = v_office and trigger = 'quote_approved' and status = 'active';
  perform public.seed_office_journey_defaults(v_office);
  update public.office_journey_defaults set entries = public.default_journey_entries('licensed_dealer') || jsonb_build_array(sn1, sn3)
   where office_id = v_office and client_kind = 'licensed_dealer';
  update public.office_journey_defaults set entries = public.default_journey_entries('exempt_dealer') || jsonb_build_array(sn1, sn3)
   where office_id = v_office and client_kind = 'exempt_dealer';
  update public.office_journey_defaults set entries = public.default_journey_entries('company') || jsonb_build_array(sn2, sn3)
   where office_id = v_office and client_kind = 'company';
  perform public.ensure_onboarding_flow(v_office);
  -- ‼ (A:X-1 / E:X-2) הסימון הפנימי ב-entries[0].migratedFrom — התיאור ריק (הוא מוצג ב«＋ בקשה חדשה»).
  select jsonb_agg(name order by name) into sres from public.journey_templates
   where office_id = v_office and kind = 'request' and entries->0->>'migratedFrom' in ('qar4nm', 'qar4nm~2') and description is null;
  select jsonb_agg(name) into sres2 from public.journey_templates
   where office_id = v_office and kind = 'request' and entries->0->>'migratedFrom' = 'qar4nx' and description is null;
  select jsonb_agg(x->'snapshot'->>'title' order by x->>'key') into sres3
    from public.office_flows f join public.office_flow_versions v on v.flow_id = f.id and v.version = f.current_version,
         jsonb_array_elements(v.definition->'stages'->0->'items') x
   where f.office_id = v_office and f.trigger = 'quote_approved' and f.status = 'active' and x->>'key' in ('qar4nm', 'qar4nm~2');
  out := out || jsonb_build_object('t', 'S.7 (216) בקשת משרד ששונה בין הסוגים ⇒ שתי בקשות בספרייה, כל אחת עם הסוגים שלה; זהה לכולם ⇒ השם כמו שהוא; הכותרת ללקוח לא השתנתה', 'pass',
    sres = '["QA R4 S שם — חברה", "QA R4 S שם — עוסק מורשה ועוסק פטור"]'::jsonb
    and sres2 = '["QA R4 S משותפת"]'::jsonb
    and sres3 = '["QA R4 S שם", "QA R4 S שם"]'::jsonb,
    'got', jsonb_build_object('variants', sres, 'shared', sres2, 'snapshots', sres3));
  -- M · הסימון הפנימי של בקשה שהועברה (216): לא בתיאור, נשמר בעריכה, ומסלול שנבנה מחדש לא מעביר שוב.
  -- M.0 · אחרי ההחלה לא נשארה שורה עם הסימון הישן בתיאור (ההמרה שבקובץ).
  out := out || jsonb_build_object('t', 'M.0 (216) אין בספרייה תיאור «הועבר מבקשות ללקוח חדש (…)» — הסימון עבר ל-migratedFrom', 'pass',
    not exists (select 1 from public.journey_templates where description like 'הועבר מבקשות ללקוח חדש (%'),
    'got', (select jsonb_agg(jsonb_build_object('id', id, 'description', description)) from public.journey_templates
             where description like 'הועבר מבקשות ללקוח חדש (%'));
  select count(*) into vi from public.journey_templates
   where office_id = v_office and kind = 'request' and entries->0->>'migratedFrom' in ('qar4nm', 'qar4nm~2', 'qar4nx');
  select id into mtid from public.journey_templates
   where office_id = v_office and kind = 'request' and entries->0->>'migratedFrom' = 'qar4nx';
  execute 'set local role authenticated';
  mres := public.upsert_library_request(mtid, 'QA R4 S משותפת', null, jsonb_build_object('stepType', 'custom_request', 'owner', 'client',
            'payload', '{"title":"QA R4 S משותפת","clientTitle":"QA R4 S משותפת","requirements":[{"key":"r1","kind":"file","label":"ג2","done":false,"required":true}]}'::jsonb));
  execute 'set local role postgres';
  -- שורה ישנה שעוד נושאת את הסימון בתיאור (לפני ההמרה) — מזוהה, ולא נוצרת שנייה.
  insert into public.journey_templates (user_id, office_id, kind, name, description, entries)
  values (null, v_office, 'request', 'QA R4 S ישנה', 'הועבר מבקשות ללקוח חדש (qar4nz)',
          '[{"key":"e1","stepType":"custom_request","owner":"client","payload":{"title":"QA R4 S ישנה","requirements":[{"key":"r1","kind":"file","label":"ד","done":false,"required":true}]}}]'::jsonb)
  returning id into mtid2;
  update public.office_journey_defaults
     set entries = entries || jsonb_build_array(sn1 || jsonb_build_object('key', 'qar4nz', 'sortIndex', 320,
           'payload', '{"title":"QA R4 S ישנה","clientTitle":"QA R4 S ישנה","requirements":[{"key":"r1","kind":"file","label":"ד","done":false,"required":true}]}'::jsonb))
   where office_id = v_office and client_kind in ('licensed_dealer', 'exempt_dealer', 'company', 'tax_refund', 'representation_only');
  update public.office_flows set status = 'archived' where office_id = v_office and trigger = 'quote_approved' and status = 'active';
  perform public.ensure_onboarding_flow(v_office);
  select count(*) into vj from public.journey_templates
   where office_id = v_office and kind = 'request' and entries->0->>'migratedFrom' in ('qar4nm', 'qar4nm~2', 'qar4nx');
  select x->'ref'->>'templateId' into v
    from public.office_flows f join public.office_flow_versions fv on fv.flow_id = f.id and fv.version = f.current_version,
         jsonb_array_elements(fv.definition->'stages'->0->'items') x
   where f.office_id = v_office and f.trigger = 'quote_approved' and f.status = 'active' and x->>'key' = 'qar4nz';
  out := out || jsonb_build_object('t', 'M.1 (216) עריכה בספרייה שומרת migratedFrom; מסלול קליטה שנבנה מחדש לא מעביר שוב (גם שורה עם הסימון הישן בתיאור)', 'pass',
    vi = 3 and vj = 3 and coalesce((mres->>'ok')::boolean, false)
    and (select entries->0->>'migratedFrom' = 'qar4nx' and description is null
               and entries->0->'payload'->'requirements'->0->>'label' = 'ג2'
           from public.journey_templates where id = mtid)
    and v = mtid2
    and not exists (select 1 from public.journey_templates where office_id = v_office and entries->0->>'migratedFrom' = 'qar4nz'),
    'got', jsonb_build_object('before', vi, 'after', vj, 'upsert', mres, 'qar4nz', v, 'legacy', mtid2,
                              'row', (select to_jsonb(t) - 'user_id' from public.journey_templates t where id = mtid)));
  out := out || jsonb_build_object('t', 'S.8 הרשאות: העזרים החדשים סגורים ל-anon ול-authenticated; shaam_require_client_approval — לשרת בלבד', 'pass',
    not has_function_privilege('anon', 'public.client_spouse_first_name(text,text)', 'EXECUTE')
    and not has_function_privilege('authenticated', 'public.client_spouse_first_name(text,text)', 'EXECUTE')
    and not has_function_privilege('anon', 'public._client_kinds_label(text[])', 'EXECUTE')
    and not has_function_privilege('authenticated', 'public._client_kinds_label(text[])', 'EXECUTE')
    and not has_function_privilege('anon', 'public._internal_task_back_to_office(text,text,text,jsonb)', 'EXECUTE')
    and not has_function_privilege('authenticated', 'public._internal_task_back_to_office(text,text,text,jsonb)', 'EXECUTE')
    and not has_function_privilege('anon', 'public.shaam_require_client_approval(text)', 'EXECUTE')
    and not has_function_privilege('authenticated', 'public.shaam_require_client_approval(text)', 'EXECUTE'),
    'got', null);
  exception when others then
    out := out || jsonb_build_object('t', 'קרס: S · בן/בת הזוג ושמות בספרייה', 'pass', false, 'got', sqlerrm);
  end;
  execute 'set local role postgres';

  -- ══ Z · צילום התעודה של בן/בת הזוג לשע״ם (G1.b, 217 §ז): המשרד בודק, לא בעל הכרטיס ══════════
  begin
  -- Z.0 · ההמרה של 217 (סעיף ז.5) רצה על הנתונים: לא נשארה בקשת אישור פתוחה של בן/בת הזוג בדף.
  select count(*) into zn from public.onboarding_steps
   where step_type = 'custom_request' and payload ? 'shaamIdentity' and payload #>> '{shaamIdentity,person}' = 'spouse'
     and not (payload ? 'personalConfirmFor') and nullif(payload #>> '{shaamIdentity,confirmedAt}', '') is null
     and status not in ('completed', 'verified', 'skipped', 'cancelled');
  out := out || jsonb_build_object('t', 'Z.0 אחרי ההמרה: אין בקשת אישור פתוחה של בן/בת הזוג שלא עברה למשרד', 'pass', zn = 0, 'got', zn);

  insert into public.clients (id, user_id, first_name, last_name, email, lifecycle_stage, family_status, dealer_type,
                              spouse_first_name, spouse_last_name, portal_token)
  values (zc, uid, 'דוד', 'QAR4Z', 'delivered@resend.dev', 'onboarding', 'married', 'licensed', 'רותם', 'QAR4Z', zc || '-tok'),
         (zc2, uid, 'משה', 'QAR4Z', 'delivered@resend.dev', 'onboarding', 'married', 'licensed', null, null, zc2 || '-tok');
  update public.clients set spouse_name = 'נועה QAR4Z' where id = zc2;
  insert into public.engagements (id, user_id, client_id, status, process_published_at)
  values (ze, uid, zc, 'onboarding', now()), (ze2, uid, zc2, 'onboarding', now());
  select id into zlabel from public.document_labels where user_id = uid limit 1;
  if zlabel is null then select id into zlabel from public.document_labels limit 1; end if;
  insert into public.documents (id, user_id, client_id, storage_path, file_name, file_type, file_size, category, label_id)
  values (zc || '-own', uid, zc, 'qa/r4z/' || zc || '/own', 'id-own.jpg', 'image/jpeg', 1, 'id_card', zlabel),
         (zc || '-sp', uid, zc, 'qa/r4z/' || zc || '/sp', 'id-sp.jpg', 'image/jpeg', 1, 'id_card', zlabel),
         (zc2 || '-sp', uid, zc2, 'qa/r4z/' || zc2 || '/sp', 'id-sp2.jpg', 'image/jpeg', 1, 'id_card', zlabel);
  zr := zc || '-req'; zr2 := zc2 || '-req';
  insert into public.representation_requests (id, user_id, linked_client_id, client_name, client_email, status, onboarding_token,
                                              identity_docs, execution)
  values (zr, uid, zc, 'QAR4Z', 'delivered@resend.dev', 'pending_signature', 'qar4z-' || zr,
          jsonb_build_object(
            'client', jsonb_build_array(jsonb_build_object('documentId', zc || '-own', 'docKind', 'idCard', 'fileName', 'id-own.jpg', 'via', 'onboarding')),
            'spouse', jsonb_build_array(jsonb_build_object('documentId', zc || '-sp', 'docKind', 'idCard', 'fileName', 'id-sp.jpg', 'via', 'onboarding'))),
          jsonb_build_object('shaam', jsonb_build_object(
            'person:client', jsonb_build_object('requestNumber', '2026990101', 'creationAttach', jsonb_build_array('צילום תעודת זהות')),
            'person:spouse', jsonb_build_object('requestNumber', '2026990102', 'creationAttach', jsonb_build_array('צילום תעודת זהות'))))),
         (zr2, uid, zc2, 'QAR4Z2', 'delivered@resend.dev', 'pending_signature', 'qar4z-' || zr2,
          jsonb_build_object('spouse', jsonb_build_array(jsonb_build_object('documentId', zc2 || '-sp', 'docKind', 'idCard', 'fileName', 'id-sp2.jpg', 'via', 'onboarding'))),
          '{}'::jsonb);
  update public.clients set representation_request_id = zr where id = zc;
  update public.clients set representation_request_id = zr2 where id = zc2;

  -- Z.1 · בן/בת הזוג ⇒ משימה של המשרד (אותו מנגנון כמו 215: personalConfirmFor + officeNote)
  zres := public.ensure_shaam_identity_confirm_step(zr, 'spouse', 'idCard', 'צילום תעודת זהות');
  zsp := zres->>'stepId';
  select to_jsonb(s) into zp from public.onboarding_steps s where id = zsp;
  out := out || jsonb_build_object('t', 'Z.1 צילום של בן/בת הזוג ⇒ משימה של המשרד: כדור אצלי, personalConfirmFor, הערה עם השם, בלי מה למלא', 'pass',
    zres->>'action' = 'office_confirm' and zp->>'ball' = 'me' and zp->>'status' = 'pending'
    and zp->'payload'->>'personalConfirmFor' = 'spouse' and zp->'payload'->>'subjectRole' = 'spouse'
    and zp->'payload'->>'subjectName' = 'רותם'
    and zp->'payload'->>'title' = 'אישור אישי של רותם — «צילום תעודה לרשות המסים»'
    and zp->'payload'->>'officeNote' = 'לאשר את צילום התעודה של רותם QAR4Z — מול בן/בת הזוג או לפי המסמך'
    and zp->'payload'->'requirements' = '[]'::jsonb and not (zp->'payload' ? 'clientSub')
    and zp->'payload'->'shaamIdentity'->>'person' = 'spouse'
    and jsonb_array_length(zp->'payload'->'clientResources') = 1 and zp->>'published_at' is not null,
    'got', jsonb_build_object('res', zres, 'step', zp->'payload', 'ball', zp->'ball'));

  -- Z.2 · הצילום של הלקוח עצמו — ללא שינוי
  zres2 := public.ensure_shaam_identity_confirm_step(zr, 'client', 'idCard', 'צילום תעודת זהות');
  zcl := zres2->>'stepId';
  select to_jsonb(s) into zp2 from public.onboarding_steps s where id = zcl;
  zres3 := public.ensure_shaam_identity_confirm_step(zr, 'spouse', 'idCard', 'צילום תעודת זהות');
  out := out || jsonb_build_object('t', 'Z.2 הצילום של הלקוח — כמו קודם (אצל הלקוח, «זה הצילום הנכון»); קריאה חוזרת לבן/בת הזוג — אותה משימה', 'pass',
    zres2->>'action' = 'confirm' and zp2->>'ball' = 'client' and not (zp2->'payload' ? 'personalConfirmFor')
    and zp2->'payload'->'requirements'->0->>'key' = 'identity_confirm'
    and zres3->>'stepId' = zsp and (zres3->>'existing')::boolean and zres3->>'action' = 'office_confirm',
    'got', jsonb_build_object('client', zres2, 'again', zres3));

  -- Z.3 · הדף של בעל הכרטיס והמייל: הצילום שלו — כן; של בן/בת הזוג — לא
  zportal := public.build_client_portal(zc, 'live');
  select coalesce(jsonb_agg(step_id), '[]'::jsonb) into zann from public._client_announceable_steps(zc);
  out := out || jsonb_build_object('t', 'Z.3 הדף ו«שלח מייל»: «זה הצילום הנכון» רק על הצילום של הלקוח, לא של בן/בת הזוג', 'pass',
    exists (select 1 from jsonb_array_elements(zportal->'items') x where x->>'key' = 'custom_' || zcl and x->>'kind' = 'identity_confirm')
    and not exists (select 1 from jsonb_array_elements(zportal->'items') x where x->>'key' = 'custom_' || zsp)
    and zann ? zcl and not (zann ? zsp),
    'got', jsonb_build_object('items', (select jsonb_agg(x->>'key') from jsonb_array_elements(zportal->'items') x), 'announce', zann));

  -- Z.4 · מייל החתימה לא מבקש מבעל הכרטיס לאשר את הצילום של בן/בת הזוג
  zpre := public.shaam_presign_client_actions(zr);
  out := out || jsonb_build_object('t', 'Z.4 מייל החתימה: רק «אשרו» על הצילום של הלקוח', 'pass',
    jsonb_array_length(zpre) = 1 and zpre->0->>'person' = 'client' and zpre->0->>'action' = 'confirm', 'got', zpre);

  -- Z.5 · גם בקריאה ישירה (portal_submit_step / העלאה) — הלקוח לא סוגר את משימת המשרד
  zres := public._shaam_identity_confirm(zsp, 'client_confirmed', null);
  zres2 := public._shaam_identity_confirm(zsp, 'client_uploaded', zc || '-own');
  out := out || jsonb_build_object('t', 'Z.5 אישור/החלפה מהדף על משימת המשרד ⇒ office_confirms, והמשימה פתוחה ולא אושרה', 'pass',
    zres->>'error' = 'office_confirms' and zres2->>'error' = 'office_confirms'
    and (select status from public.onboarding_steps where id = zsp) = 'pending'
    and (select identity_docs#>>'{spouse,0,clientConfirmedAt}' from public.representation_requests where id = zr) is null,
    'got', jsonb_build_array(zres, zres2));

  -- Z.6 · «התקבל האישור של רותם» (advance_onboarding_step complete) ⇒ הצילום מאושר, וההגשה רואה אותו
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', uid::text, true);
  execute 'set local role authenticated';
  zres := public.advance_onboarding_step(zsp, 'complete', '{}'::jsonb);
  execute 'set local role postgres';
  select identity_docs into zdocs from public.representation_requests where id = zr;
  select to_jsonb(s) into zp from public.onboarding_steps s where id = zsp;
  zres2 := public.shaam_confirmed_identity_documents_for(zc, 'spouse', 'idCard');
  zres3 := public.ensure_shaam_identity_confirm_step(zr, 'spouse', 'idCard', 'צילום תעודת זהות');
  out := out || jsonb_build_object('t', 'Z.6 המשרד סגר ⇒ הצילום של בן/בת הזוג מאושר (על ידי המשרד), הצילום של הלקוח עדיין לא', 'pass',
    coalesce((zres->>'ok')::boolean, false) and zp->>'status' = 'completed'
    and zdocs#>>'{spouse,0,clientConfirmedAt}' is not null and zdocs#>>'{spouse,0,confirmedBy}' = 'office'
    and zdocs#>>'{client,0,clientConfirmedAt}' is null
    and zp->'payload'->'shaamIdentity'->>'confirmedVia' = 'office_confirmed'
    and not coalesce((zres2->>'missing')::boolean, false) and zres3->>'action' = 'confirmed'
    and exists (select 1 from public.onboarding_events e where e.step_id = zsp and e.note like 'המשרד אישר את צילום התעודה של רותם%'),
    'got', jsonb_build_object('advance', zres, 'docs', zdocs, 'confirmed', zres2, 'again', zres3));

  -- Z.7 · בקשה פתוחה בצורה הישנה (208, בדף של בעל הכרטיס) ⇒ עוברת למשרד בקריאה הבאה
  insert into public.onboarding_steps (user_id, engagement_id, client_id, required_for_close, step_type, track, scope,
                                       status, ball, sort_order, payload, published_at)
  values (uid, ze2, zc2, false, 'custom_request', 'tools', 'person', 'pending', 'client', 10,
          jsonb_build_object('shaamIdentity', jsonb_build_object('key', zr2 || ':spouse:idCard', 'requestId', zr2, 'person', 'spouse',
                               'kind', 'idCard', 'label', 'צילום תעודת זהות', 'documentIds', jsonb_build_array(zc2 || '-sp')),
                             'requiredBy', 'shaam', 'clientTitle', 'צילום תעודה לרשות המסים - נועה QAR4Z',
                             'clientSub', 'רשות המסים דורשת צילום תעודת זהות של נועה QAR4Z',
                             'clientResources', jsonb_build_array(jsonb_build_object('key', 'doc_1', 'source', 'client', 'documentId', zc2 || '-sp')),
                             'requirements', jsonb_build_array(
                               jsonb_build_object('key', 'identity_confirm', 'kind', 'confirm', 'label', 'זה הצילום הנכון', 'required', true))),
          now())
  returning id into zold;
  zres := public.ensure_shaam_identity_confirm_step(zr2, 'spouse', 'idCard', 'צילום תעודת זהות');
  select to_jsonb(s) into zp from public.onboarding_steps s where id = zold;
  out := out || jsonb_build_object('t', 'Z.7 בקשה ישנה של בן/בת הזוג ⇒ אותה שורה עוברת למשרד (שם פרטי מהשם המלא), ונעלמת מהדף', 'pass',
    zres->>'stepId' = zold and zres->>'action' = 'office_confirm'
    and zp->>'ball' = 'me' and zp->'payload'->>'personalConfirmFor' = 'spouse'
    and zp->'payload'->>'title' = 'אישור אישי של נועה — «צילום תעודה לרשות המסים»'
    and zp->'payload'->>'officeNote' like 'לאשר את צילום התעודה של נועה QAR4Z%'
    and zp->'payload'->'requirements' = '[]'::jsonb
    and not exists (select 1 from jsonb_array_elements(public.build_client_portal(zc2, 'live')->'items') x where x->>'key' = 'custom_' || zold),
    'got', jsonb_build_object('res', zres, 'payload', zp->'payload', 'ball', zp->'ball'));

  out := out || jsonb_build_object('t', 'Z.8 הרשאות: העזרים של §ז סגורים לדפדפן', 'pass',
    not has_function_privilege('authenticated', 'public._shaam_identity_office_confirmed(text)', 'EXECUTE')
    and not has_function_privilege('anon', 'public._shaam_identity_office_confirmed(text)', 'EXECUTE')
    and not has_function_privilege('authenticated', 'public._shaam_identity_spouse_office_payload(jsonb,text,text)', 'EXECUTE')
    and not has_function_privilege('authenticated', 'public.ensure_shaam_identity_confirm_step(text,text,text,text)', 'EXECUTE')
    and not has_function_privilege('authenticated', 'public._shaam_identity_confirm(text,text,text)', 'EXECUTE'),
    'got', null);
  exception when others then
    out := out || jsonb_build_object('t', 'קרס: Z · צילום התעודה של בן/בת הזוג', 'pass', false, 'got', sqlerrm);
  end;
  execute 'set local role postgres';

  out := out || jsonb_build_object('t', 'R/L privileges: «הסתר מהדף» למשרד בלבד; העזרים סגורים; דף הרו"ח הקודם פתוח כמו קודם', 'pass',
    has_function_privilege('authenticated', 'public.hide_step_from_client(text)', 'EXECUTE')
    and not has_function_privilege('anon', 'public.hide_step_from_client(text)', 'EXECUTE')
    and not has_function_privilege('authenticated', 'public._mark_legacy_internal_tasks(text)', 'EXECUTE')
    and not has_function_privilege('anon', 'public.per_engagement_step_types()', 'EXECUTE')
    and not has_function_privilege('authenticated', 'public._carry_open_work_to_engagement(text)', 'EXECUTE')
    and not has_function_privilege('authenticated', 'public._release_materials_step(text)', 'EXECUTE')
    and not has_function_privilege('anon', 'public.client_process_published(text)', 'EXECUTE')
    and not has_function_privilege('authenticated', 'public.client_process_published(text)', 'EXECUTE')
    and not has_function_privilege('anon', 'public.client_step_gate_open(text,timestamptz)', 'EXECUTE')
    and not has_function_privilege('authenticated', 'public.client_step_gate_open(text,timestamptz)', 'EXECUTE')
    and has_function_privilege('anon', 'public.get_release_portal(text)', 'EXECUTE')
    and has_function_privilege('anon', 'public.release_portal_mark_items(text,jsonb)', 'EXECUTE')
    and has_function_privilege('authenticated', 'public.client_intake_state(text)', 'EXECUTE')
    and not has_function_privilege('authenticated', 'public.requests_held_until_approval(text)', 'EXECUTE'),
    'got', null);

  out := out || jsonb_build_object('t', 'privileges: RPC למשרד בלבד, פנימיות סגורות', 'pass',
    has_function_privilege('authenticated', 'public.retry_request_creation(text)', 'EXECUTE')
    and has_function_privilege('authenticated', 'public.retry_kind_hold(text)', 'EXECUTE')
    and not has_function_privilege('anon', 'public.retry_request_creation(text)', 'EXECUTE')
    and not has_function_privilege('anon', 'public.retry_kind_hold(text)', 'EXECUTE')
    and not has_function_privilege('authenticated', 'public.release_kind_hold(text,text)', 'EXECUTE')
    and not has_function_privilege('authenticated', 'public._record_creation_problem(text,text,jsonb,boolean)', 'EXECUTE'),
    'got', null);
  out := out || jsonb_build_object('t', 'invariants', 'pass', public.assert_domain_function_invariants() is not null, 'got', null);
  raise exception 'RESULTS:%', out::text;
end;
$test$;
