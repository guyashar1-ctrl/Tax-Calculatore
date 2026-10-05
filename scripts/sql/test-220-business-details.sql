-- בדיקת 220 (פרטי העסק · עבודה מהבית) בתוך בקשה אחת שמסתיימת ב-raise — הכול מתבטל.
-- ‼ __USER__ מוחלף במשתמש הבדיקות של staging. שום מייל לא נשלח (התור בלבד), ושום דבר לא נשמר.
-- הרצה: node scripts/staging-dryrun-flows.mjs --tests-only scripts/sql/test-220-business-details.sql
do $test$
declare
  uid    uuid := '__USER__';
  other  uuid := gen_random_uuid();
  cid    text := 'qa220c' || substr(md5(random()::text), 1, 10);
  eng    text := 'qa220e' || substr(md5(random()::text), 1, 10);
  tok    text := md5(random()::text);
  c2     text := 'qa220d' || substr(md5(random()::text), 1, 10);
  e2     text := 'qa220f' || substr(md5(random()::text), 1, 10);
  tok2   text := md5(random()::text);
  inv    text; inv2 text; bd text; bd2 text; conn text; ans1 text; ans2 text; appr1 text;
  res    jsonb; item jsonb;
  vi     int; vb boolean; v text;
  c4 text := 'qa220g' || substr(md5(random()::text), 1, 10);  tok4 text := md5(random()::text);
  c5 text := 'qa220h' || substr(md5(random()::text), 1, 10);
  c6 text := 'qa220i' || substr(md5(random()::text), 1, 10);  tok6 text := md5(random()::text);
  c7 text := 'qa220j' || substr(md5(random()::text), 1, 10);
  bd4 text; bd6 text; bd7 text; conn4 text; conn5 text; conn6 text; conn8 text; a4 text; a7 text; appr4 text; v_err text;
  out    jsonb := '[]'::jsonb;
begin
  -- ── הכנה (postgres) ───────────────────────────────────────────────────────
  insert into public.clients (id, user_id, first_name, last_name, email, lifecycle_stage, family_status, dealer_type, portal_token)
  values (cid, uid, 'אילן', 'QA220', 'delivered@resend.dev', 'onboarding', 'single', 'exempt', tok);
  insert into public.engagements (id, user_id, client_id, status, process_published_at)
  values (eng, uid, cid, 'onboarding', now());

  -- ── 1 · הסוג ──────────────────────────────────────────────────────────────
  out := out || jsonb_build_object('t', '1.1 נוצרת מ«＋ בקשה»', 'pass', 'business_details' = any (public.request_creatable_step_types()), 'got', public.request_creatable_step_types());
  out := out || jsonb_build_object('t', '1.2 לכל התקשרות', 'pass', 'business_details' = any (public.per_engagement_step_types()), 'got', public.per_engagement_step_types());
  out := out || jsonb_build_object('t', '1.3 מסלול tools', 'pass', public.onboarding_track_for('business_details') = 'tools', 'got', public.onboarding_track_for('business_details'));

  -- ── 2 · נפתחת עם ההרשמה לפייפרלס ──────────────────────────────────────────
  insert into public.onboarding_steps (user_id, engagement_id, client_id, step_type, track, scope, status, ball, payload, published_at, sort_order)
  values (uid, eng, cid, 'paperless_invite', 'tools', 'person', 'pending', 'client', '{"clientTitle":"הרשמה לפייפרלס"}', now(), 10)
  returning id into inv;
  insert into public.onboarding_steps (user_id, engagement_id, client_id, step_type, track, scope, status, ball, payload, published_at, depends_on_step_id, sort_order)
  values (uid, eng, cid, 'paperless_connection', 'tools', 'person', 'locked', 'me', '{}', now(), inv, 20)
  returning id into conn;
  select id into bd from public.onboarding_steps where client_id = cid and step_type = 'business_details';
  out := out || jsonb_build_object('t', '2.1 «פרטי העסק» נוצרה', 'pass', bd is not null, 'got', bd);
  select count(*) into vi from public.onboarding_steps where id = bd and status = 'pending' and ball = 'client'
     and published_at is not null and required_for_close = false and engagement_id = eng
     and payload->>'clientTitle' = 'פרטי העסק';
  out := out || jsonb_build_object('t', '2.2 אצל הלקוח, מפורסמת כמו ההרשמה, לא חוסמת סגירה', 'pass', vi = 1, 'got', (select to_jsonb(s) from public.onboarding_steps s where s.id = bd));
  -- הרשמה שנייה (התקשרות אחרת) כשיש פתוחה — אין שנייה.
  insert into public.onboarding_steps (user_id, engagement_id, client_id, step_type, track, scope, status, ball, payload, published_at)
  values (uid, null, cid, 'paperless_invite', 'tools', 'person', 'cancelled', 'client', '{}', now());
  select count(*) into vi from public.onboarding_steps where client_id = cid and step_type = 'business_details';
  out := out || jsonb_build_object('t', '2.3 אין כפילות', 'pass', vi = 1, 'got', vi);
  -- טיוטה: ההרשמה לא פורסמה ⇒ גם «פרטי העסק» טיוטה.
  insert into public.clients (id, user_id, first_name, last_name, email, lifecycle_stage, family_status, portal_token, business_name)
  values (c2, uid, 'נועה', 'QA220', 'delivered@resend.dev', 'onboarding', 'single', tok2, 'סטודיו נועה');
  insert into public.engagements (id, user_id, client_id, status, process_published_at) values (e2, uid, c2, 'onboarding', now());
  insert into public.onboarding_steps (user_id, engagement_id, client_id, step_type, track, scope, status, ball, payload, published_at)
  values (uid, e2, c2, 'paperless_invite', 'tools', 'person', 'pending', 'client', '{"delivery":"hold"}', null)
  returning id into inv2;
  select id into bd2 from public.onboarding_steps where client_id = c2 and step_type = 'business_details';
  select count(*) into vi from public.onboarding_steps where id = bd2 and published_at is null and payload->>'delivery' = 'hold';
  out := out || jsonb_build_object('t', '2.4 טיוטה כמו ההרשמה', 'pass', vi = 1, 'got', (select to_jsonb(s) from public.onboarding_steps s where s.id = bd2));
  res := public.portal_submit_business_details(tok2, bd2, '{"homeOffice":{"hasDedicatedRoom":false}}');
  out := out || jsonb_build_object('t', '2.5 טיוטה ⇒ not_published', 'pass', res->>'error' = 'not_published', 'got', res);
  -- הרשמה שנכנסת כבר סגורה (היסטוריה) לא פותחת.
  insert into public.clients (id, user_id, first_name, last_name, email, lifecycle_stage, family_status)
  values (cid || 'h', uid, 'היסטוריה', 'QA220', 'delivered@resend.dev', 'active', 'single');
  insert into public.onboarding_steps (user_id, engagement_id, client_id, step_type, track, scope, status, ball, payload, published_at, completed_at)
  values (uid, null, cid || 'h', 'paperless_invite', 'tools', 'person', 'completed', 'me', '{}', now(), now());
  select count(*) into vi from public.onboarding_steps where client_id = cid || 'h' and step_type = 'business_details';
  out := out || jsonb_build_object('t', '2.6 הרשמה שנכנסת סגורה לא פותחת «פרטי העסק»', 'pass', vi = 0, 'got', vi);
  update public.onboarding_steps set published_at = now() where id in (inv2, bd2);

  -- ── 3 · הדף האישי ─────────────────────────────────────────────────────────
  res := public.build_client_portal(cid, 'live');
  select x into item from jsonb_array_elements(res->'items') x where x->>'key' = 'business_details';
  out := out || jsonb_build_object('t', '3.1 פריט פעולה בדף', 'pass', item->>'bucket' = 'action' and item->>'kind' = 'business_details'
    and item->>'actionValue' = bd and not (item ? 'businessName') and not (item ? 'homeOffice'), 'got', item);
  select count(*) into vi from public._client_announceable_steps(cid) a where a.step_id = bd;
  out := out || jsonb_build_object('t', '3.2 נכנסת ל«שלח מייל…» כשהיא אצל הלקוח', 'pass', vi = 1, 'got', vi);

  -- ── 4 · בדיקות קלט ────────────────────────────────────────────────────────
  res := public.portal_submit_business_details(tok, bd, '{"businessName":"מספרת אילן","homeOffice":{}}');
  out := out || jsonb_build_object('t', '4.1 בלי תשובה ⇒ missing_has_room', 'pass', res->>'error' = 'missing_has_room', 'got', res);
  res := public.portal_submit_business_details(tok, bd, '{"businessName":"מספרת אילן","homeOffice":{"hasDedicatedRoom":true,"totalRooms":3,"businessRooms":4}}');
  out := out || jsonb_build_object('t', '4.2 חדרי עסק > סך הכול', 'pass', res->>'error' = 'business_rooms_exceed_total', 'got', res);
  res := public.portal_submit_business_details(tok, bd, '{"businessName":"מספרת אילן","homeOffice":{"hasDedicatedRoom":true,"totalRooms":4.3,"businessRooms":1}}');
  out := out || jsonb_build_object('t', '4.3 דיוק חצי חדר', 'pass', res->>'error' = 'rooms_precision', 'got', res);
  res := public.portal_submit_business_details(tok, bd, '{"businessName":"מספרת אילן","homeOffice":{"hasDedicatedRoom":true,"totalRooms":0,"businessRooms":0}}');
  out := out || jsonb_build_object('t', '4.4 אפס חדרים', 'pass', res->>'error' = 'rooms_not_positive', 'got', res);
  res := public.portal_submit_business_details(tok, bd, '{"businessName":"מספרת אילן","homeOffice":{"hasDedicatedRoom":true,"totalRooms":"ארבעה","businessRooms":1}}');
  out := out || jsonb_build_object('t', '4.5 טקסט במקום מספר', 'pass', res->>'error' = 'rooms_not_numeric', 'got', res);
  res := public.portal_submit_business_details(tok, bd, '{"homeOffice":{"hasDedicatedRoom":true,"totalRooms":4,"businessRooms":1}}');
  out := out || jsonb_build_object('t', '4.6 בלי שם עסק (ואין בכרטיס)', 'pass', res->>'error' = 'missing_business_name', 'got', res);
  res := public.portal_submit_business_details('לא-טוקן', bd, '{"homeOffice":{"hasDedicatedRoom":false}}');
  out := out || jsonb_build_object('t', '4.7 טוקן זר', 'pass', res->>'error' = 'invalid', 'got', res);
  res := public.portal_submit_business_details(tok2, bd, '{"homeOffice":{"hasDedicatedRoom":false}}');
  out := out || jsonb_build_object('t', '4.8 טוקן של לקוח אחר לבקשה הזאת', 'pass', res->>'error' = 'step_not_found', 'got', res);
  select count(*) into vi from public.client_home_office_answers where client_id = cid;
  out := out || jsonb_build_object('t', '4.9 שום דבר לא נשמר בשגיאות', 'pass', vi = 0, 'got', vi);

  -- ── 5 · הלקוח מוסר: יש חדר, 1 מתוך 4 ─────────────────────────────────────
  res := public.portal_submit_business_details(tok, bd, '{"businessName":"מספרת אילן","expectedBusinessName":"","homeOffice":{"hasDedicatedRoom":true,"totalRooms":4,"businessRooms":1,"note":"החדר קטן"}}');
  out := out || jsonb_build_object('t', '5.1 נשלח ⇒ לבדיקת המשרד', 'pass', (res->>'ok')::boolean and res->>'step' = 'in_progress', 'got', res);
  select business_name into v from public.clients where id = cid;
  out := out || jsonb_build_object('t', '5.2 שם העסק בכרטיס', 'pass', v = 'מספרת אילן', 'got', v);
  select id into ans1 from public.client_home_office_answers where client_id = cid and source = 'client' and ratio_percent = 25.0 and note = 'החדר קטן';
  out := out || jsonb_build_object('t', '5.3 התשובות נשמרו עם מקור ויחס', 'pass', ans1 is not null, 'got', public._home_office_state(cid));
  select count(*) into vi from public.onboarding_steps where id = bd and status = 'in_progress' and ball = 'me';
  out := out || jsonb_build_object('t', '5.4 הבקשה אצל המשרד', 'pass', vi = 1, 'got', (select to_jsonb(s) from public.onboarding_steps s where s.id = bd));
  res := public.build_client_portal(cid, 'live');
  select x into item from jsonb_array_elements(res->'items') x where x->>'key' = 'business_details';
  out := out || jsonb_build_object('t', '5.5 בדף — «בטיפול המשרד», בלי פקד', 'pass', item->>'bucket' = 'office' and not (item ? 'actionKind'), 'got', item);
  select count(*) into vi from public._client_announceable_steps(cid) a where a.step_id = bd;
  out := out || jsonb_build_object('t', '5.6 אצל המשרד ⇒ לא במייל ללקוח', 'pass', vi = 0, 'got', vi);
  select count(*) into vi from public.accountant_notifications where client_id = cid and kind = 'client_request_completed';
  out := out || jsonb_build_object('t', '5.7 הודעה למשרד בתור', 'pass', vi = 1, 'got', vi);

  -- ── 6 · המשרד ─────────────────────────────────────────────────────────────
  perform set_config('request.jwt.claims', json_build_object('sub', other, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', other::text, true);
  res := public.get_home_office(cid);
  out := out || jsonb_build_object('t', '6.1 משרד אחר ⇒ forbidden', 'pass', res->>'error' = 'forbidden', 'got', res);
  res := public.approve_home_office(cid, ans1, 20, current_date, null);
  out := out || jsonb_build_object('t', '6.2 משרד אחר לא מאשר', 'pass', res->>'error' = 'forbidden', 'got', res);
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', uid::text, true);
  res := public.approve_home_office(cid, ans1, 30, current_date, null);
  out := out || jsonb_build_object('t', '6.3 מעל 25% ⇒ percent_above_cap', 'pass', res->>'error' = 'percent_above_cap', 'got', res);
  res := public.approve_home_office(cid, ans1, 20.55, current_date, null);
  out := out || jsonb_build_object('t', '6.4 דיוק עשירית', 'pass', res->>'error' = 'percent_precision', 'got', res);
  res := public.approve_home_office(cid, ans1, 20, null, null);
  out := out || jsonb_build_object('t', '6.5 בלי תאריך תחילה', 'pass', res->>'error' = 'missing_effective_from', 'got', res);
  res := public.approve_home_office(cid, ans1, 20, date '2026-10-01', 'חדר קטן מהממוצע');
  appr1 := res->>'approvalId';
  out := out || jsonb_build_object('t', '6.6 אושר 20% ⇒ הבקשה הושלמה', 'pass', (res->>'ok')::boolean and res->>'step' = 'completed', 'got', res);
  select count(*) into vi from public.onboarding_steps where id = bd and status = 'completed' and completion_method = 'manual' and completed_by = uid;
  out := out || jsonb_build_object('t', '6.7 הושלמה בידי המשרד', 'pass', vi = 1, 'got', (select to_jsonb(s) from public.onboarding_steps s where s.id = bd));
  select count(*) into vi from public.client_home_office_answers where id = ans1 and ratio_percent = 25.0 and total_rooms = 4;
  out := out || jsonb_build_object('t', '6.8 התשובה המקורית לא שונתה', 'pass', vi = 1, 'got', vi);
  res := public.build_client_portal(cid, 'live');
  select x into item from jsonb_array_elements(res->'items') x where x->>'key' = 'business_details';
  out := out || jsonb_build_object('t', '6.9 בדף — הושלם, בלי האחוז', 'pass', item->>'bucket' = 'done' and item::text not like '%20%', 'got', item);

  -- ── 7 · אישור ידני שהוזן בפייפרלס ─────────────────────────────────────────
  res := public.confirm_home_office_in_paperless(appr1);
  out := out || jsonb_build_object('t', '7.1 סומן שהוזן בפייפרלס', 'pass', (res->>'ok')::boolean, 'got', res);
  select count(*) into vi from public.client_home_office_approvals where id = appr1 and paperless_entered_at is not null and paperless_entered_by = uid;
  out := out || jsonb_build_object('t', '7.2 מי ומתי', 'pass', vi = 1, 'got', vi);
  select count(*) into vi from public.onboarding_events where step_id = conn and meta->>'action' = 'home_office_paperless';
  out := out || jsonb_build_object('t', '7.3 נרשם ביומן של הקמת הפייפרלס', 'pass', vi = 1, 'got', vi);
  res := public.confirm_home_office_in_paperless(appr1);
  out := out || jsonb_build_object('t', '7.4 פעם שנייה ⇒ noop', 'pass', (res->>'noop')::boolean, 'got', res);

  -- ── 8 · שינוי מהותי אחרי האישור ───────────────────────────────────────────
  res := public.save_home_office_answers(cid, '{"hasDedicatedRoom":true,"totalRooms":3,"businessRooms":2,"note":"עבר דירה"}');
  ans2 := res->>'answersId';
  out := out || jsonb_build_object('t', '8.1 המשרד עדכן תשובות', 'pass', (res->>'ok')::boolean and ans2 is not null, 'got', res);
  select count(*) into vi from public.client_home_office_answers where id = ans2 and ratio_percent = 66.7 and source = 'office';
  out := out || jsonb_build_object('t', '8.2 יחס מעל התקרה נשמר כמו שהוא (66.7)', 'pass', vi = 1, 'got', vi);
  select count(*) into vi from public.client_home_office_approvals where id = appr1 and approved_percent = 20 and paperless_entered_at is not null;
  out := out || jsonb_build_object('t', '8.3 האישור הקודם נשמר כהיסטוריה', 'pass', vi = 1, 'got', vi);
  res := public.approve_home_office(cid, ans1, 20, current_date, null);
  out := out || jsonb_build_object('t', '8.4 אישור לתשובה שהוחלפה ⇒ answers_changed', 'pass', res->>'error' = 'answers_changed', 'got', res);
  res := public.confirm_home_office_in_paperless(appr1);
  out := out || jsonb_build_object('t', '8.5 «הוזן בפייפרלס» לאישור ישן ⇒ approval_not_current', 'pass', res->>'error' = 'approval_not_current', 'got', res);
  res := public.approve_home_office(cid, ans2, 25, current_date, 'מעל התקרה - הוגבל ל-25%');
  out := out || jsonb_build_object('t', '8.6 מעל התקרה — המשרד מאשר 25%', 'pass', (res->>'ok')::boolean, 'got', res);

  -- ── 9 · «אין חדר בלעדי» ───────────────────────────────────────────────────
  res := public.portal_submit_business_details(tok2, bd2, '{"businessName":"סטודיו נועה","expectedBusinessName":"סטודיו נועה","homeOffice":{"hasDedicatedRoom":false}}');
  out := out || jsonb_build_object('t', '9.1 «לא» ⇒ האיסוף הושלם', 'pass', (res->>'ok')::boolean and res->>'step' = 'completed', 'got', res);
  select count(*) into vi from public.client_home_office_approvals where client_id = c2;
  out := out || jsonb_build_object('t', '9.2 «לא» אינו אישור משרד', 'pass', vi = 0, 'got', vi);
  select count(*) into vi from public.onboarding_steps where id = bd2 and status = 'completed' and completion_method = 'system' and completed_by is null;
  out := out || jsonb_build_object('t', '9.3 הושלמה מהדף, לא בידי המשרד', 'pass', vi = 1, 'got', (select to_jsonb(s) from public.onboarding_steps s where s.id = bd2));
  select id into ans1 from public.client_home_office_answers where client_id = c2;
  res := public.approve_home_office(c2, ans1, 5, current_date, null);
  out := out || jsonb_build_object('t', '9.4 אחוז ל«אין חדר» ⇒ no_room_percent', 'pass', res->>'error' = 'no_room_percent', 'got', res);
  res := public.approve_home_office(c2, ans1, 0, current_date, 'אושר 0% במפורש');
  out := out || jsonb_build_object('t', '9.5 0% מפורש מותר', 'pass', (res->>'ok')::boolean, 'got', res);

  -- ── 10 · שם העסק — בלי דריסה ──────────────────────────────────────────────
  perform set_config('request.jwt.claims', null, true);
  perform set_config('request.jwt.claim.sub', null, true);
  update public.onboarding_steps set status = 'pending', ball = 'client', completed_at = null where id = bd2;
  -- ‼ (סבב 2) השם בתיק סוגר בקשה שיש לה תשובות — כאן בודקים דריסה, ולכן הסגירה נדחית.
  perform set_config('pivo.defer_settle', 'on', true);
  update public.clients set business_name = 'נועה סטודיו בע״מ' where id = c2;
  perform set_config('pivo.defer_settle', '', true);
  select count(*) into vi from public.client_home_office_answers where client_id = c2;
  res := public.portal_submit_business_details(tok2, bd2, '{"businessName":"סטודיו נועה החדש","expectedBusinessName":"סטודיו נועה","homeOffice":{"hasDedicatedRoom":false}}');
  out := out || jsonb_build_object('t', '10.1 המשרד שינה בינתיים ⇒ stale + השם הנוכחי', 'pass', res->>'error' = 'stale' and res->>'businessName' = 'נועה סטודיו בע״מ', 'got', res);
  select business_name into v from public.clients where id = c2;
  out := out || jsonb_build_object('t', '10.2 השם של המשרד לא נדרס', 'pass', v = 'נועה סטודיו בע״מ', 'got', v);
  select count(*) - vi into vi from public.client_home_office_answers where client_id = c2;
  out := out || jsonb_build_object('t', '10.3 ולא נשמרו תשובות', 'pass', vi = 0, 'got', vi);
  res := public.portal_submit_business_details(tok2, bd2, '{"businessName":"נועה סטודיו בע״מ","expectedBusinessName":"סטודיו נועה","homeOffice":{"hasDedicatedRoom":false}}');
  out := out || jsonb_build_object('t', '10.4 אותו שם כמו בכרטיס ⇒ אין סתירה', 'pass', (res->>'ok')::boolean, 'got', res);

  -- ── 11 · הרשאות ───────────────────────────────────────────────────────────
  out := out || jsonb_build_object('t', '11.1 anon לא קורא את הטבלאות', 'pass',
    not has_table_privilege('anon', 'public.client_home_office_answers', 'select')
    and not has_table_privilege('anon', 'public.client_home_office_approvals', 'select'), 'got', null);
  out := out || jsonb_build_object('t', '11.2 authenticated לא כותב ישירות', 'pass',
    not has_table_privilege('authenticated', 'public.client_home_office_answers', 'insert')
    and not has_table_privilege('authenticated', 'public.client_home_office_approvals', 'update'), 'got', null);
  out := out || jsonb_build_object('t', '11.3 anon לא מאשר', 'pass',
    not has_function_privilege('anon', 'public.approve_home_office(text, text, numeric, date, text)', 'execute')
    and has_function_privilege('anon', 'public.portal_submit_business_details(text, text, jsonb)', 'execute'), 'got', null);

  -- ── 12 · כפילות דרך «＋ בקשה» ─────────────────────────────────────────────
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', uid::text, true);
  res := public.create_onboarding_request(c2, 'business_details', '{}'::jsonb);
  out := out || jsonb_build_object('t', '12.1 פתוחה כבר קיימת ⇒ step_type_exists', 'pass', res->>'error' = 'step_type_exists', 'got', res);

  -- ══ סבב 2 (ביקורת) ═════════════════════════════════════════════════════
  -- ── 13 · היסטוריה של שם העסק — מכל נתיב ───────────────────────────────────
  select count(*) into vi from public.tax_fact_changes
   where client_id = cid and field_key = 'businessName' and source = 'portal' and status = 'accepted'
     and new_value->>'value' = 'מספרת אילן' and old_value->>'value' is null;
  out := out || jsonb_build_object('t', '13.1 שם מהדף האישי ⇒ שורת היסטוריה (portal)', 'pass', vi = 1, 'got', vi);
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', uid::text, true);
  perform set_config('pivo.change_source', '', true);
  res := public.update_client_fields(cid, '{"business_name":"מספרת אילן בע״מ"}'::jsonb, null, null, null);
  select count(*) into vi from public.tax_fact_changes
   where client_id = cid and field_key = 'businessName' and source = 'manual' and decided_by = uid
     and old_value->>'value' = 'מספרת אילן' and new_value->>'value' = 'מספרת אילן בע״מ';
  out := out || jsonb_build_object('t', '13.2 שם מתיק המס (update_client_fields) ⇒ שורת היסטוריה (manual, מי)', 'pass', (res->>'ok')::boolean and vi = 1, 'got', res);
  res := public.update_client_fields(cid, '{"business_name":"מספרת אילן בע״מ"}'::jsonb, null, null, null);
  select count(*) into vi from public.tax_fact_changes where client_id = cid and field_key = 'businessName';
  out := out || jsonb_build_object('t', '13.3 שמירה בלי שינוי ⇒ אין שורה נוספת', 'pass', vi = 2, 'got', vi);

  -- ── 14 · «אין חדר» ⇒ המשרד מאשר 0% ⇒ «הוזן בפייפרלס» ⇒ ההקמה נסגרת ──────────
  perform set_config('request.jwt.claims', null, true);
  perform set_config('request.jwt.claim.sub', null, true);
  insert into public.clients (id, user_id, first_name, last_name, email, lifecycle_stage, family_status, portal_token, business_name)
  values (c4, uid, 'אפס', 'QA220', 'delivered@resend.dev', 'onboarding', 'single', tok4, 'סטודיו אפס');
  insert into public.onboarding_steps (user_id, client_id, step_type, track, scope, status, ball, payload, published_at)
  values (uid, c4, 'paperless_invite', 'tools', 'person', 'completed', 'me', '{}', now());
  insert into public.onboarding_steps (user_id, client_id, step_type, track, scope, status, ball, payload, published_at)
  values (uid, c4, 'business_details', 'tools', 'person', 'pending', 'client', '{}', now()) returning id into bd4;
  insert into public.onboarding_steps (user_id, client_id, step_type, track, scope, status, ball, payload, published_at)
  values (uid, c4, 'paperless_connection', 'tools', 'person', 'pending', 'me', '{}', now()) returning id into conn4;
  res := public.portal_submit_business_details(tok4, bd4, '{"businessName":"סטודיו אפס","expectedBusinessName":"סטודיו אפס","homeOffice":{"hasDedicatedRoom":false}}');
  select count(*) into vi from public.client_home_office_approvals where client_id = c4;
  out := out || jsonb_build_object('t', '14.1 «לא» ⇒ «פרטי העסק» הושלמה, בלי אישור מומצא', 'pass', res->>'step' = 'completed' and vi = 0, 'got', res);
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', uid::text, true);
  res := public.advance_onboarding_step(conn4, 'complete', '{}');
  out := out || jsonb_build_object('t', '14.2 «אין חדר» בלי אישור ⇒ ההקמה נסגרת', 'pass', (res->>'ok')::boolean, 'got', res);
  update public.onboarding_steps set status = 'pending', completed_at = null where id = conn4;
  select id into a4 from public.client_home_office_answers where client_id = c4;
  res := public.approve_home_office(c4, a4, 0, current_date, 'אין חדר — 0% במפורש');
  appr4 := res->>'approvalId';
  out := out || jsonb_build_object('t', '14.3 המשרד מאשר 0% לתשובת «לא»', 'pass', (res->>'ok')::boolean, 'got', res);
  begin
    res := public.advance_onboarding_step(conn4, 'complete', '{}');
    v_err := null;
  exception when others then v_err := sqlerrm; end;
  out := out || jsonb_build_object('t', '14.4 0% מאושר שטרם סומן «הוזן בפייפרלס» ⇒ ההקמה לא נסגרת (הכרעת גיא)', 'pass', v_err like '%עוד לא סומן כמוזן בפייפרלס%', 'got', v_err);
  res := public.confirm_home_office_in_paperless(appr4);
  res := public.advance_onboarding_step(conn4, 'complete', '{}');
  out := out || jsonb_build_object('t', '14.5 אחרי «הוזן בפייפרלס» ⇒ ההקמה נסגרת', 'pass', (res->>'ok')::boolean, 'got', res);

  -- ── 15 · תנאי השלמת ההקמה ──────────────────────────────────────────────────
  perform set_config('request.jwt.claims', null, true);
  perform set_config('request.jwt.claim.sub', null, true);
  insert into public.clients (id, user_id, first_name, last_name, email, lifecycle_stage, family_status)
  values (c5, uid, 'חסום', 'QA220', 'delivered@resend.dev', 'onboarding', 'single');
  insert into public.onboarding_steps (user_id, client_id, step_type, track, scope, status, ball, payload, published_at)
  values (uid, c5, 'paperless_invite', 'tools', 'person', 'completed', 'me', '{}', now());
  insert into public.onboarding_steps (user_id, client_id, step_type, track, scope, status, ball, payload, published_at)
  values (uid, c5, 'business_details', 'tools', 'person', 'pending', 'client', '{}', now());
  insert into public.onboarding_steps (user_id, client_id, step_type, track, scope, status, ball, payload, published_at)
  values (uid, c5, 'paperless_connection', 'tools', 'person', 'pending', 'me', '{"checklist":[{"key":"id_number","done":true}]}', now()) returning id into conn5;
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', uid::text, true);
  res := public.advance_onboarding_step(conn5, 'note', '{"checklist":[{"key":"id_number","done":true},{"key":"pull_dealers","done":true}],"note":"סומן"}');
  out := out || jsonb_build_object('t', '15.1 עבודה במקביל: סימון סעיפים בהקמה מותר כשפרטי העסק פתוחים', 'pass', (res->>'ok')::boolean, 'got', res);
  begin
    res := public.advance_onboarding_step(conn5, 'complete', '{}');
    v_err := null;
  exception when others then v_err := sqlerrm; end;
  out := out || jsonb_build_object('t', '15.2 «פרטי העסק» פתוחה ⇒ ההקמה לא נסגרת', 'pass', v_err like '%אחרי «פרטי העסק»%', 'got', v_err);
  select count(*) into vi from public.onboarding_steps where id = conn5 and status = 'pending';
  out := out || jsonb_build_object('t', '15.3 ונשארת פתוחה (לא «הושלם» שקרי)', 'pass', vi = 1, 'got', vi);
  begin
    res := public.advance_onboarding_step(conn5, 'verify', '{}');
    v_err := null;
  exception when others then v_err := sqlerrm; end;
  out := out || jsonb_build_object('t', '15.4 גם «אמת» נחסם', 'pass', v_err is not null, 'got', v_err);
  res := public.advance_onboarding_step(conn5, 'skip', '{"reason":"already_connected"}');
  out := out || jsonb_build_object('t', '15.5 «אין צורך» (כבר מחובר) — לא נחסם; אינו «הושלם»', 'pass', (res->>'ok')::boolean, 'got', res);
  -- לקוח בלי «פרטי העסק» בכלל (קליטה מלפני 220) — כמו קודם
  perform set_config('request.jwt.claims', null, true);
  insert into public.onboarding_steps (user_id, client_id, step_type, track, scope, status, ball, payload, published_at)
  values (uid, cid || 'h', 'paperless_connection', 'tools', 'person', 'pending', 'me', '{}', now()) returning id into conn8;
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  res := public.advance_onboarding_step(conn8, 'complete', '{}');
  out := out || jsonb_build_object('t', '15.6 לקוח בלי «פרטי העסק» (ישן) ⇒ ההקמה נסגרת כמו קודם', 'pass', (res->>'ok')::boolean, 'got', res);
  update public.onboarding_steps set payload = payload || '{"x":1}' where id = conn8;
  out := out || jsonb_build_object('t', '15.7 שלב שכבר הושלם — עדכון לא נחסם (בלי בדיעבד)', 'pass', true, 'got', null);
  -- «אין חדר» בלי אישור ⇒ מותר (14.2) · אחוז שאושר והוזן ⇒ מותר (14.5)

  -- ── 16 · יש תשובות ואישור, חסר רק שם ⇒ השם בתיק סוגר את הבקשה ─────────────
  perform set_config('request.jwt.claims', null, true);
  insert into public.clients (id, user_id, first_name, last_name, email, lifecycle_stage, family_status)
  values (c7, uid, 'שם', 'QA220', 'delivered@resend.dev', 'onboarding', 'single');
  insert into public.onboarding_steps (user_id, client_id, step_type, track, scope, status, ball, payload, published_at)
  values (uid, c7, 'business_details', 'tools', 'person', 'pending', 'client', '{}', now()) returning id into bd7;
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', uid::text, true);
  res := public.save_home_office_answers(c7, '{"hasDedicatedRoom":true,"totalRooms":5,"businessRooms":1}');
  a7 := res->>'answersId';
  res := public.approve_home_office(c7, a7, 20, current_date, null);
  select count(*) into vi from public.onboarding_steps where id = bd7 and status = 'in_progress' and ball = 'me';
  out := out || jsonb_build_object('t', '16.1 תשובות + אישור בלי שם ⇒ אצל המשרד (לא הושלמה)', 'pass', vi = 1 and res->>'step' = 'in_progress', 'got', res);
  res := public.update_client_fields(c7, '{"business_name":"עסק השם"}'::jsonb, null, null, null);
  select count(*) into vi from public.onboarding_steps where id = bd7 and status = 'completed';
  out := out || jsonb_build_object('t', '16.2 שם בתיק המס ⇒ הבקשה נסגרת לבד', 'pass', (res->>'ok')::boolean and vi = 1, 'got', res);
  select count(*) into vi from public.client_home_office_answers where client_id = c7;
  select count(*) + vi * 100 into vi from public.client_home_office_approvals where client_id = c7;
  out := out || jsonb_build_object('t', '16.3 בלי תשובה נוספת ובלי אישור כפול', 'pass', vi = 101, 'got', vi);
  res := public.update_client_fields(c7, '{"business_name":"עסק השם החדש"}'::jsonb, null, null, null);
  select count(*) into vi from public.onboarding_steps where client_id = c7 and step_type = 'business_details' and status = 'completed';
  out := out || jsonb_build_object('t', '16.4 שינוי שם אחרי שהושלמה — ההיסטוריה לא נפתחת', 'pass', vi = 1, 'got', vi);

  -- ── 17 · סדר אחד ללקוח — הנעילה נלקחת (FOR UPDATE) בכל ארבע הפונקציות ──────
  out := out || jsonb_build_object('t', '17.1 כל ארבע הפונקציות נועלות את שורת הלקוח', 'pass',
    pg_get_functiondef('public.portal_submit_business_details(text,text,jsonb)'::regprocedure) ilike '%portal_token = p_token limit 1 for update%'
    and pg_get_functiondef('public.approve_home_office(text,text,numeric,date,text)'::regprocedure) ilike '%for update%'
    and pg_get_functiondef('public.save_home_office_answers(text,jsonb)'::regprocedure) ilike '%for update%'
    and pg_get_functiondef('public.confirm_home_office_in_paperless(text)'::regprocedure) ilike '%for update%', 'got', null);

  raise exception 'RESULTS:%', out::text;
end;
$test$;
