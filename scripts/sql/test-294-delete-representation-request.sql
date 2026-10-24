-- 294 · מחיקת בקשת ייצוג סוגרת את השורות הפתוחות שלה — ורק אותן.
-- מריצים ב-staging (execute_sql). הכול בתוך בלוק אחד שנגמר ב-raise, ולכן שום דבר לא נשמר:
-- הצלחה = «294 OK», כישלון = «294 FAIL: …».
-- ‼ משתמשים: שני משתמשים מורשים ב-staging (authorized_users), הראשון בעלים והשני זר.
do $t$
declare
  u  uuid; u2 uuid;
  ca text; cb text; r1 text; rold text; rnew text;
  s_rep text; s_id text; s_ni text; s_done text; s_other text; s_repb text;
  res jsonb;
  procedure_fail text := '';
begin
  select x.id into u  from (select u.id from public.authorized_users a join auth.users u on lower(u.email) = lower(a.email) where a.active order by u.id limit 1) x;
  select x.id into u2 from (select u.id from public.authorized_users a join auth.users u on lower(u.email) = lower(a.email) where a.active order by u.id offset 1 limit 1) x;
  if u is null or u2 is null then raise exception '294 FAIL: צריך שני משתמשים מורשים'; end if;

  insert into clients(user_id, first_name, last_name) values (u, 'בדיקה', '294-א') returning id into ca;
  insert into clients(user_id, first_name, last_name) values (u, 'בדיקה', '294-ב') returning id into cb;
  insert into representation_requests(user_id, linked_client_id, client_name, status)
    values (u, ca, 'בדיקה 294-א', 'pending_signature') returning id into r1;
  select id into s_rep from onboarding_steps where client_id = ca and step_type = 'representation' and status <> 'cancelled';
  insert into onboarding_steps(user_id, client_id, step_type, track, scope, status, ball, published_at, payload)
    values (u, ca, 'custom_request', 'tools', 'person', 'pending', 'client', now(),
            jsonb_build_object('clientTitle', 'צילום תעודה', 'shaamIdentity', jsonb_build_object('requestId', r1))) returning id into s_id;
  insert into onboarding_steps(user_id, client_id, step_type, track, scope, status, ball, published_at, payload)
    values (u, ca, 'authority_representation', 'authorities', 'person', 'pending', 'me', now(),
            jsonb_build_object('authority', 'national_insurance', 'subjectRole', 'client', 'representationRequestId', r1)) returning id into s_ni;
  insert into onboarding_steps(user_id, client_id, step_type, track, scope, status, ball, published_at, payload)
    values (u, ca, 'custom_request', 'tools', 'person', 'completed', 'me', now(),
            jsonb_build_object('clientTitle', 'ישן', 'shaamIdentity', jsonb_build_object('requestId', r1))) returning id into s_done;
  insert into onboarding_steps(user_id, client_id, step_type, track, scope, status, ball, published_at, payload)
    values (u, ca, 'custom_request', 'tools', 'person', 'pending', 'client', now(),
            jsonb_build_object('clientTitle', 'בקשה אחרת')) returning id into s_other;

  -- כרטיס עם שתי בקשות: מחיקת הישנה לא סוגרת את «בקשת ייצוג» של החדשה.
  insert into representation_requests(user_id, linked_client_id, client_name, status, created_at)
    values (u, cb, 'ב ישן', 'pending_signature', now() - interval '30 days') returning id into rold;
  insert into representation_requests(user_id, linked_client_id, client_name, status)
    values (u, cb, 'ב חדש', 'pending_signature') returning id into rnew;
  select id into s_repb from onboarding_steps where client_id = cb and step_type = 'representation' and status <> 'cancelled';

  -- D.1 · משתמש זר נדחה, ושום דבר לא נמחק
  perform set_config('request.jwt.claims', json_build_object('sub', u2, 'role', 'authenticated')::text, true);
  res := delete_representation_request(r1);
  if res ->> 'error' is distinct from 'forbidden' then procedure_fail := procedure_fail || ' D.1'; end if;
  if not exists (select 1 from representation_requests where id = r1) then procedure_fail := procedure_fail || ' D.1b'; end if;

  -- D.2 · הבעלים: הבקשה נמחקת ושלוש השורות הפתוחות שלה נסגרות
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  res := delete_representation_request(r1);
  if not coalesce((res ->> 'ok')::boolean, false) or (res ->> 'closedSteps')::int <> 3 then procedure_fail := procedure_fail || ' D.2'; end if;
  if exists (select 1 from representation_requests where id = r1) then procedure_fail := procedure_fail || ' D.2b'; end if;
  if (select count(*) from onboarding_steps where id in (s_rep, s_id, s_ni) and status = 'cancelled') <> 3 then procedure_fail := procedure_fail || ' D.2c'; end if;

  -- D.3 · שורה שהושלמה נשארת היסטוריה; בקשה שאינה שלה נשארת פתוחה
  if (select status from onboarding_steps where id = s_done) <> 'completed' then procedure_fail := procedure_fail || ' D.3'; end if;
  if (select status from onboarding_steps where id = s_other) <> 'pending' then procedure_fail := procedure_fail || ' D.3b'; end if;

  -- D.4 · הסיבה נרשמת ב«פעילות»
  if not exists (select 1 from onboarding_events where step_id = s_rep and note = 'בקשת הייצוג נמחקה במשרד') then procedure_fail := procedure_fail || ' D.4'; end if;

  -- D.5 · נשארה לכרטיס בקשה אחרת ⇒ «בקשת ייצוג» שלו לא נסגרת
  res := delete_representation_request(rold);
  if not coalesce((res ->> 'ok')::boolean, false) then procedure_fail := procedure_fail || ' D.5'; end if;
  if (select status from onboarding_steps where id = s_repb) = 'cancelled' then procedure_fail := procedure_fail || ' D.5b'; end if;
  if not exists (select 1 from representation_requests where id = rnew) then procedure_fail := procedure_fail || ' D.5c'; end if;

  if procedure_fail <> '' then raise exception '294 FAIL:%', procedure_fail; end if;
  raise exception '294 OK (rolled back)';
end $t$;
