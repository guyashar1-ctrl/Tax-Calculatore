-- בדיקות סבב 4 · הודעות ללקוח (214): «לא ידוע אם יצא» ומה נכנס למייל.
-- בתוך בקשה אחת שמסתיימת ב-raise — הכול מתבטל (staging-dryrun-flows.mjs --tests).
-- ‼ __USER__ מוחלף במשתמש הבדיקות של staging. שום מייל לא נשלח — הכול ברמת הפונקציות.
--   U · לא ידוע אם יצא: העובדות במגש, «שלח שוב» אחרי החלון / אחרי שינוי כתובת לא משחרר
--       לבד, הסיבה מתאפסת בין ניסיונות, ו«לא נשלח» רושם למה שוחרר.
--   A · מה נכנס ל«שלח מייל…»: אישור הייצוג באזור האישי רק כששע״ם דרשה אותו (ולעולם
--       לא לבד), ומשימה ישנה שסומנה לבדיקה בלי תוכן ללקוח — לא.
--   N · השער והתוכן: השער לכל בקשה (client_step_gate_open, 214) הוא המקור היחיד —
--       client_process_published (217) = אותו שער עם null, ובלי עותק ב-214; «אין תוכן ללקוח»
--       של 214 = _payload_has_client_content (216) — תו בתו ובהתנהגות; לקוח שחוזר (קליטה חדשה
--       שטרם נפתחה): מה שפורסם לפניה ועדיין פתוח — בדף, במגש ובמייל, והקליטה החדשה — לא, עד
--       שנפתחת (הכרעה ב); לקוח ראשון — כמו קודם; כרטיס «אישור הייצוג באזור האישי» (הכרעה א).
do $test$
declare
  uid   uuid := '__USER__';
  cu    text := 'qar4u' || substr(md5(random()::text), 1, 10);
  eu    text := 'qar4e' || substr(md5(random()::text), 1, 10);
  ca    text := 'qar4a' || substr(md5(random()::text), 1, 10);
  ea    text := 'qar4f' || substr(md5(random()::text), 1, 10);
  u1 text; u2 text; ra text; ia text; ib text; ic text; id2 text;
  res jsonb; res2 jsonb; x jsonb;
  nid uuid; nid2 uuid; tok uuid;
  v text; v2 text; vi int; vb boolean;
  vt timestamptz; vt2 timestamptz; vt3 timestamptz;
  -- N
  cn   text := 'qar4nc' || substr(md5(random()::text), 1, 10);  en   text := 'qar4ne' || substr(md5(random()::text), 1, 10);
  cr   text := 'qar4nr' || substr(md5(random()::text), 1, 10);
  ero  text := 'qar4no' || substr(md5(random()::text), 1, 10);  ern  text := 'qar4nn' || substr(md5(random()::text), 1, 10);
  cf1  text := 'qar4f1' || substr(md5(random()::text), 1, 10);  ef1  text := 'qar4f1e' || substr(md5(random()::text), 1, 10);
  cf2  text := 'qar4f2' || substr(md5(random()::text), 1, 10);
  cf3  text := 'qar4f3' || substr(md5(random()::text), 1, 10);  ef3  text := 'qar4f3e' || substr(md5(random()::text), 1, 10);
  cpr  text := 'qar4pr' || substr(md5(random()::text), 1, 10);  epr  text := 'qar4pre' || substr(md5(random()::text), 1, 10);
  epo  text := 'qar4pro' || substr(md5(random()::text), 1, 10);
  cpr2 text := 'qar4p2' || substr(md5(random()::text), 1, 10);  epr2 text := 'qar4p2e' || substr(md5(random()::text), 1, 10);
  nsrc text; nfn text; ncore text; smp jsonb; vexp boolean; vgot boolean; nbad jsonb := '[]'::jsonb; nk int := 0;
  rn text; rp text; rp2 text; f1 text; f2 text; f3 text; nstates jsonb := '[]'::jsonb; vb2 boolean; vb3 boolean;
  -- N · מה כל מצב עונה (N.1), והתמונות של N.4–N.7
  nsame jsonb := '[]'::jsonb; ng jsonb; nann jsonb; ntray jsonb; npage jsonb; nclaim jsonb; nclaim2 jsonb;
  ra2 text; vi2 int;
  -- N.7ג · כרטיס שבוטל וחוזר כחובה (shaam_require_client_approval, 217 §27)
  cpr3 text := 'qar4p3' || substr(md5(random()::text), 1, 10);  epr3 text := 'qar4p3e' || substr(md5(random()::text), 1, 10);
  epo3 text := 'qar4p3o' || substr(md5(random()::text), 1, 10);
  ra3 text; vt4 timestamptz; npage2 jsonb; vb4 boolean; vi3 int; vi4 int;
  -- W · איזה «ראשון»: קליטה פתוחה ללקוח (C1)
  cw1 text := 'qar4w1' || substr(md5(random()::text), 1, 10);  ew1 text := 'qar4w1e' || substr(md5(random()::text), 1, 10);
  cw2 text := 'qar4w2' || substr(md5(random()::text), 1, 10);  ew2 text := 'qar4w2e' || substr(md5(random()::text), 1, 10);
  wv1 jsonb; wv2 jsonb; wc1 jsonb; wc2 jsonb;
  -- T · איזה נוסח יצא (X-C2)
  ct1 text := 'qar4t1' || substr(md5(random()::text), 1, 10);  et1 text := 'qar4t1e' || substr(md5(random()::text), 1, 10);
  tm jsonb; tm2 jsonb; tm3 jsonb;
  out jsonb := '[]'::jsonb;
begin
  -- ── הכנה (postgres) ───────────────────────────────────────────────────────
  insert into public.clients (id, user_id, first_name, last_name, email, lifecycle_stage, family_status, dealer_type)
  values (cu, uid, 'בדיקה', 'QAR4U', 'delivered@resend.dev', 'onboarding', 'single', 'licensed');
  insert into public.engagements (id, user_id, client_id, status, process_published_at)
  values (eu, uid, cu, 'onboarding', now());
  insert into public.onboarding_steps (user_id, engagement_id, client_id, step_type, track, scope, status, ball, payload, published_at, sort_order)
  values (uid, eu, cu, 'custom_request', 'custom', 'person', 'pending', 'client',
          '{"title":"בקשה U א","clientTitle":"בקשה U א","requirements":[{"key":"r1","kind":"file","label":"קובץ","done":false,"required":true}]}', now(), 1)
  returning id into u1;
  insert into public.onboarding_steps (user_id, engagement_id, client_id, step_type, track, scope, status, ball, payload, published_at, sort_order)
  values (uid, eu, cu, 'custom_request', 'custom', 'person', 'pending', 'client',
          '{"title":"בקשה U ב","clientTitle":"בקשה U ב","requirements":[{"key":"r1","kind":"confirm","label":"אישור","done":false,"required":true}]}', now(), 2)
  returning id into u2;

  begin
  -- ── U1 · לא ידוע: מה המגש יודע ────────────────────────────────────────────
  res := public.claim_client_notice(uid, cu, 'new', 'R4U1', null, 'manual', null);
  nid := (res->>'noticeId')::uuid; tok := (res->>'claimToken')::uuid;
  perform public.mark_client_notice_sending(nid, tok, 'נושא U', '{"html":"<p>u</p>"}', null, 'process_open');
  update public.client_notices set provider_key_first_used_at = now() - interval '2 hours' where id = nid;
  -- הבקשה הראשונה הושלמה בינתיים — המייל עדיין מפרט אותה.
  update public.onboarding_steps set status = 'completed' where id = u1;
  res := public.fail_client_notice(nid, tok, 'network: connection reset', false);
  select provider_key_first_used_at into vt from public.client_notices where id = nid;
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', uid::text, true);
  execute 'set local role authenticated';
  res := public.client_ready_to_send(cu);
  execute 'set local role postgres';
  x := res->'owner'->'unknown'->0;
  out := out || jsonb_build_object('t', 'U1.1 לא ידוע: סיבה «אין תשובה», נמען, ניסיון ראשון, מקור, ניסיונות', 'pass',
    jsonb_array_length(res->'owner'->'unknown') = 1
    and x->>'noticeId' = nid::text and x->>'cause' = 'no_answer'
    and x->>'toEmail' = 'delivered@resend.dev'
    and (x->>'at')::timestamptz = vt and (x->>'at')::timestamptz < now() - interval '1 hour'
    and (x->>'lastTriedAt')::timestamptz > (x->>'at')::timestamptz
    and x->>'origin' = 'manual' and (x->>'attempts')::int = 1
    and x->>'recipientChanged' = 'false' and x->>'subject' = 'נושא U' and x->>'kind' = 'new', 'got', x);
  out := out || jsonb_build_object('t', 'U1.2 עד מתי «שלח שוב» בטוח — 23 שעות מהניסיון הראשון', 'pass',
    (x->>'retryUntil')::timestamptz between now() + interval '20 hours' and now() + interval '22 hours'
    and (x->>'retryUntil')::timestamptz = vt + interval '23 hours', 'got', x->'retryUntil');
  out := out || jsonb_build_object('t', 'U1.3 הבקשות במייל בשמות הדף, ומה כבר הושלם', 'pass',
    (x->>'items')::int = 2 and jsonb_array_length(x->'itemList') = 2
    and x->'itemList' @> '[{"title":"בקשה U א","stillOpen":false},{"title":"בקשה U ב","stillOpen":true}]'::jsonb
    and x->'itemList'->0->>'title' = 'בקשה U א', 'got', x->'itemList');
  out := out || jsonb_build_object('t', 'U1.4 בלי גוף המייל במגש', 'pass',
    not (x ? 'requestBody') and not (x ? 'request_text') and not (x ? 'html') and not (x ? 'error'), 'got', x);

  -- ── U2 · ניסיון חוזר שנדחה: הסיבה מתחלפת, הניסיון הראשון לא זז ──────────────
  -- (u1 נשארת «הושלמה» — פתיחה מחדש הייתה גרסה חדשה, שאינה מכוסה בהודעה הזו)
  res := public.reclaim_unknown_client_notice(uid, nid);
  tok := (res->>'claimToken')::uuid;
  res2 := public.fail_client_notice(nid, tok, 'retry_rejected: validation_error: x', false);
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  res2 := public.client_ready_to_send(cu);
  execute 'set local role postgres';
  x := res2->'owner'->'unknown'->0;
  out := out || jsonb_build_object('t', 'U2.1 «שלח שוב» שנדחה ⇒ cause retry_rejected; at לא זז; שני ניסיונות', 'pass',
    coalesce((res->>'ok')::boolean, false) and x->>'cause' = 'retry_rejected'
    and (x->>'at')::timestamptz = vt and (x->>'attempts')::int = 2, 'got', jsonb_build_array(res, x));

  -- ── U2b · סיבה ישנה לא נגררת: reclaim מאפס, וכשל לא ודאי מאפס ───────────────
  -- חכירה שפקעה באמצע שליחה ⇒ «נקטע»
  res := public.reclaim_unknown_client_notice(uid, nid);
  update public.client_notices set lease_until = now() - interval '1 second' where id = nid;
  perform public._expire_client_notice_leases(cu);
  select status, reason into v, v2 from public.client_notices where id = nid;
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  res2 := public.client_ready_to_send(cu);
  execute 'set local role postgres';
  out := out || jsonb_build_object('t', 'U2.2 חכירה שפקעה בשליחה ⇒ unknown, cause cut_off', 'pass',
    v = 'unknown' and v2 = 'lease_expired_while_sending' and res2->'owner'->'unknown'->0->>'cause' = 'cut_off',
    'got', jsonb_build_array(v, v2, res2->'owner'->'unknown'->0));
  res := public.reclaim_unknown_client_notice(uid, nid);
  tok := (res->>'claimToken')::uuid;
  select status, reason into v, v2 from public.client_notices where id = nid;
  out := out || jsonb_build_object('t', 'U2.3 «שלח שוב» מאפס את הסיבה הקודמת לפני השליחה', 'pass',
    coalesce((res->>'ok')::boolean, false) and v = 'sending' and v2 is null, 'got', jsonb_build_array(res, v, v2));
  -- סיבה שנשארה בטעות על שורה בשליחה — כשל לא ודאי מנקה אותה
  update public.client_notices set reason = 'lease_expired_while_sending' where id = nid;
  res := public.fail_client_notice(nid, tok, 'internal_server_error: boom', false);
  select status, reason into v, v2 from public.client_notices where id = nid;
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  res2 := public.client_ready_to_send(cu);
  execute 'set local role postgres';
  out := out || jsonb_build_object('t', 'U2.4 כשל לא ודאי מאפס סיבה ⇒ cause מהשגיאה (provider_error)', 'pass',
    v = 'unknown' and v2 is null and res2->'owner'->'unknown'->0->>'cause' = 'provider_error',
    'got', jsonb_build_array(v, v2, res2->'owner'->'unknown'->0));

  -- ── U3 · אחרי החלון: retry_expired בלי לשחרר ──────────────────────────────
  update public.client_notices set provider_key_first_used_at = now() - interval '24 hours' where id = nid;
  select updated_at into vt2 from public.client_notices where id = nid;
  res := public.reclaim_unknown_client_notice(uid, nid);
  select status, reason, updated_at into v, v2, vt3 from public.client_notices where id = nid;
  out := out || jsonb_build_object('t', 'U3.1 עברה יממה ⇒ retry_expired, וההודעה נשארת «לא ידוע» בלי שינוי', 'pass',
    res->>'error' = 'retry_expired' and v = 'unknown' and v2 is null and vt3 = vt2, 'got', jsonb_build_array(res, v, v2));
  res := public._client_notice_items(cu, 'new', 'manual', false);
  out := out || jsonb_build_object('t', 'U3.2 הבקשות לא שוחררו בשקט — לא ייכנסו למייל הבא', 'pass',
    jsonb_array_length(res->'items') = 0, 'got', res);
  res := public.claim_client_notice(uid, cu, 'new', 'R4U3', null, 'manual', null);
  out := out || jsonb_build_object('t', 'U3.3 ועדיין חוסמת מייל «חדש» עד שהמשרד מכריע', 'pass',
    res->>'error' = 'unknown_pending', 'got', res);
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  res2 := public.client_ready_to_send(cu);
  execute 'set local role postgres';
  x := res2->'owner'->'unknown'->0;
  out := out || jsonb_build_object('t', 'U3.4 במגש: החלון נסגר (retryUntil בעבר)', 'pass',
    (x->>'retryUntil')::timestamptz < now(), 'got', x);
  exception when others then
    out := out || jsonb_build_object('t', 'קרס: U1–U3 · לא ידוע אם יצא', 'pass', false, 'got', sqlerrm);
  end;
  execute 'set local role postgres';

  begin
  -- ── U3b · לא הגענו לספק ⇒ never_sent, כמו קודם ─────────────────────────────
  update public.client_notices set status = 'cancelled' where client_id = cu and status in ('queued', 'claimed', 'sending', 'unknown');
  res := public.claim_client_notice(uid, cu, 'new', 'R4U3b', null, 'manual', null);
  nid := (res->>'noticeId')::uuid; tok := (res->>'claimToken')::uuid;
  perform public.fail_client_notice(nid, tok, 'boot error', false);
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  res2 := public.client_ready_to_send(cu);
  execute 'set local role postgres';
  x := res2->'owner'->'unknown'->0;
  res := public.reclaim_unknown_client_notice(uid, nid);
  select status, reason into v, v2 from public.client_notices where id = nid;
  out := out || jsonb_build_object('t', 'U3b.1 בלי גוף שנשלח: אין «עד מתי»; reclaim ⇒ never_sent (failed)', 'pass',
    not (x ? 'retryUntil') and res->>'error' = 'never_sent' and v = 'failed' and v2 = 'never_sent',
    'got', jsonb_build_array(x, res, v, v2));

  -- ── U4 · «שולח» שחכירתו פקעה ⇒ נקטע, והזמן הוא הניסיון הראשון ─────────────
  update public.client_notices set status = 'cancelled' where client_id = cu and status in ('queued', 'claimed', 'sending', 'unknown');
  res := public.claim_client_notice(uid, cu, 'new', 'R4U4', null, 'manual', null);
  nid := (res->>'noticeId')::uuid; tok := (res->>'claimToken')::uuid;
  perform public.mark_client_notice_sending(nid, tok, 'נושא U4', '{"html":"<p>u4</p>"}', null, 'process_open');
  update public.client_notices
     set provider_key_first_used_at = now() - interval '30 minutes', lease_until = now() - interval '1 second'
   where id = nid;
  select provider_key_first_used_at into vt from public.client_notices where id = nid;
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  res := public.client_ready_to_send(cu);
  execute 'set local role postgres';
  x := res->'owner'->'unknown'->0;
  out := out || jsonb_build_object('t', 'U4.1 «שולח» שפקע ⇒ במגש כ«לא ידוע», cause cut_off, at = הניסיון הראשון', 'pass',
    jsonb_array_length(res->'owner'->'unknown') = 1 and x->>'noticeId' = nid::text and x->>'cause' = 'cut_off'
    and (x->>'at')::timestamptz = vt and coalesce((res->'owner'->>'inFlight')::boolean, false) = false, 'got', res->'owner');

  -- ── U8 · הכתובת בכרטיס השתנתה ─────────────────────────────────────────────
  update public.clients set email = 'delivered+r4new@resend.dev' where id = cu;
  res := public.reclaim_unknown_client_notice(uid, nid);
  select status into v from public.client_notices where id = nid;
  out := out || jsonb_build_object('t', 'U8.1 «שלח שוב» אחרי שינוי כתובת ⇒ recipient_changed, ונשאר «לא ידוע»', 'pass',
    res->>'error' = 'recipient_changed' and v = 'unknown', 'got', jsonb_build_array(res, v));
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  res := public.client_ready_to_send(cu);
  res2 := public.resolve_client_notice(nid, 'not_sent');
  execute 'set local role postgres';
  select status, reason into v, v2 from public.client_notices where id = nid;
  out := out || jsonb_build_object('t', 'U8.2 במגש recipientChanged; שחרור ⇒ reason recipient_changed', 'pass',
    res->'owner'->'unknown'->0->>'recipientChanged' = 'true'
    and res->'owner'->'unknown'->0->>'toEmail' = 'delivered@resend.dev'
    and res2->>'reason' = 'recipient_changed' and v = 'failed' and v2 = 'recipient_changed',
    'got', jsonb_build_array(res->'owner'->'unknown', res2, v, v2));
  res := public._client_notice_items(cu, 'new', 'manual', false);
  out := out || jsonb_build_object('t', 'U8.3 אחרי השחרור הבקשה הפתוחה פנויה למייל לכתובת החדשה', 'pass',
    jsonb_array_length(res->'items') = 1 and res->'items'->0->>'stepId' = u2, 'got', res);

  -- ── U8b · אותה כתובת ⇒ office_marked_not_sent ──────────────────────────────
  res := public.claim_client_notice(uid, cu, 'new', 'R4U8b', null, 'manual', null);
  nid := (res->>'noticeId')::uuid; tok := (res->>'claimToken')::uuid;
  perform public.mark_client_notice_sending(nid, tok, 'נושא U8b', '{"html":"<p>u8b</p>"}', null, 'process_open');
  perform public.fail_client_notice(nid, tok, 'concurrent_idempotent_requests: busy', false);
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  res := public.client_ready_to_send(cu);
  res2 := public.resolve_client_notice(nid, 'not_sent');
  execute 'set local role postgres';
  select reason into v from public.client_notices where id = nid;
  out := out || jsonb_build_object('t', 'U8.4 409 «עוד בטיפול» ⇒ provider_busy; שחרור באותה כתובת ⇒ office_marked_not_sent', 'pass',
    res->'owner'->'unknown'->0->>'cause' = 'provider_busy' and res->'owner'->'unknown'->0->>'recipientChanged' = 'false'
    and res2->>'reason' = 'office_marked_not_sent' and v = 'office_marked_not_sent',
    'got', jsonb_build_array(res->'owner'->'unknown', res2, v));
  -- 2xx בלי מזהה
  res := public.claim_client_notice(uid, cu, 'new', 'R4U8c', null, 'manual', null);
  nid := (res->>'noticeId')::uuid; tok := (res->>'claimToken')::uuid;
  perform public.mark_client_notice_sending(nid, tok, 'נושא U8c', '{"html":"<p>u8c</p>"}', null, 'process_open');
  perform public.fail_client_notice(nid, tok, 'ok_without_id', false);
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  res := public.client_ready_to_send(cu);
  execute 'set local role postgres';
  out := out || jsonb_build_object('t', 'U8.5 2xx בלי מזהה ⇒ accepted_no_id', 'pass',
    res->'owner'->'unknown'->0->>'cause' = 'accepted_no_id', 'got', res->'owner'->'unknown');
  exception when others then
    out := out || jsonb_build_object('t', 'קרס: U3b–U8 · לא ידוע אם יצא', 'pass', false, 'got', sqlerrm);
  end;
  execute 'set local role postgres';
  update public.clients set email = 'delivered@resend.dev' where id = cu;

  begin
  -- ── A · אישור הייצוג באזור האישי — רק כששע״ם דרשה, ורק ידנית ───────────────
  insert into public.clients (id, user_id, first_name, last_name, email, lifecycle_stage, family_status, dealer_type)
  values (ca, uid, 'בדיקה', 'QAR4A', 'delivered@resend.dev', 'onboarding', 'single', 'licensed');
  insert into public.engagements (id, user_id, client_id, status, process_published_at)
  values (ea, uid, ca, 'onboarding', now());
  ra := public.ensure_rep_client_approval_step(ca);
  select count(*) into vi from public._client_announceable_steps(ca) a where a.step_id = ra;
  out := out || jsonb_build_object('t', 'A1 זירוז אופציונלי (לא נדרש) ⇒ לא במייל', 'pass',
    ra is not null and vi = 0, 'got', jsonb_build_object('step', ra, 'n', vi));

  perform public.shaam_require_client_approval(ca);
  select jsonb_agg(to_jsonb(a)) into res from public._client_announceable_steps(ca) a where a.step_id = ra;
  out := out || jsonb_build_object('t', 'A2 שע״ם דרשה ⇒ במייל, בשם «אישור הייצוג באזור האישי», ידני בלבד', 'pass',
    jsonb_array_length(coalesce(res, '[]'::jsonb)) = 1
    and res->0->>'title' = 'אישור הייצוג באזור האישי' and res->0->>'delivery' = 'approve'
    and jsonb_typeof(res->0->'reminder') = 'null', 'got', res);

  res := public._client_notice_items(ca, 'new', 'manual', false);
  select x2 into x from jsonb_array_elements(res->'items') x2 where x2->>'stepId' = ra;
  select x2 into res2 from jsonb_array_elements(public.build_client_portal(ca, 'live')->'items') x2
   where x2->>'key' = 'rep_approval';
  out := out || jsonb_build_object('t', 'A3 המפתח בדף (rep_approval) והשם — כמו בדף האישי', 'pass',
    x->>'portalKey' = 'rep_approval' and res2->>'bucket' = 'action' and res2->>'label' = x->>'title'
    and coalesce((x->>'isDocument')::boolean, false) = false,
    'got', jsonb_build_array(x, res2));

  -- ‼ לעולם לא לבד: גם כשמישהו סימן «לבד» ותזכורת על השלב
  update public.onboarding_steps
     set payload = payload || '{"delivery":"auto","reminder":{"afterDays":1,"max":3}}'::jsonb where id = ra;
  res := public._client_notice_items(ca, 'new', 'auto', false);
  res2 := public._client_notice_items(ca, 'new', 'manual', false);
  out := out || jsonb_build_object('t', 'A4 «לבד» על השלב לא מוציא אותו לבד; ב«שלח מייל…» — כן', 'pass',
    not exists (select 1 from jsonb_array_elements(res->'items') y where y->>'stepId' = ra)
    and exists (select 1 from jsonb_array_elements(res2->'items') y where y->>'stepId' = ra and y->>'delivery' = 'approve'),
    'got', jsonb_build_array(res, res2));
  insert into public.client_step_notice_state (step_id, announced_version, announced_at)
  select ra, client_content_version, now() - interval '10 days' from public.onboarding_steps where id = ra
  on conflict (step_id) do update set announced_version = excluded.announced_version, announced_at = excluded.announced_at;
  res := public._client_notice_items(ca, 'reminder', 'auto', true);
  res2 := public._client_notice_items(ca, 'reminder', 'manual', false);
  out := out || jsonb_build_object('t', 'A5 אין תזכורת אוטומטית; תזכורת ידנית — אפשר', 'pass',
    not exists (select 1 from jsonb_array_elements(res->'items') y where y->>'stepId' = ra)
    and exists (select 1 from jsonb_array_elements(res2->'items') y where y->>'stepId' = ra),
    'got', jsonb_build_array(res, res2));
  delete from public.client_step_notice_state where step_id = ra;
  update public.onboarding_steps set payload = payload - 'delivery' - 'reminder' where id = ra;

  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', uid::text, true);
  execute 'set local role authenticated';
  res := public.client_ready_to_send(ca);
  execute 'set local role postgres';
  out := out || jsonb_build_object('t', 'A6 ברשימת «שלח מייל…» של המשרד', 'pass',
    exists (select 1 from jsonb_array_elements(res->'owner'->'items') y where y->>'stepId' = ra),
    'got', res->'owner'->'items');

  -- הלקוח הצהיר שאישר ⇒ אין על מה להודיע
  update public.onboarding_steps
     set status = 'in_progress', ball = 'me', payload = payload || jsonb_build_object('clientDeclaredAt', now())
   where id = ra;
  select count(*) into vi from public._client_announceable_steps(ca) a where a.step_id = ra;
  out := out || jsonb_build_object('t', 'A7 אחרי הצהרת הלקוח ⇒ לא במייל', 'pass', vi = 0, 'got', vi);

  -- ── A · משימה ישנה שסומנה לבדיקה ───────────────────────────────────────────
  insert into public.onboarding_steps (user_id, engagement_id, client_id, step_type, track, scope, status, ball, payload, published_at)
  values (uid, ea, ca, 'custom_request', 'custom', 'person', 'pending', 'client',
          '{"title":"משימה ישנה","internalTaskReview":true}', now())
  returning id into ia;
  insert into public.onboarding_steps (user_id, engagement_id, client_id, step_type, track, scope, status, ball, payload, published_at)
  values (uid, ea, ca, 'custom_request', 'custom', 'person', 'pending', 'client',
          '{"title":"לבדיקה עם פריט","clientTitle":"לבדיקה עם פריט","internalTaskReview":true,"requirements":[{"key":"r1","kind":"confirm","label":"אישור","done":false,"required":true}]}', now())
  returning id into ib;
  insert into public.onboarding_steps (user_id, engagement_id, client_id, step_type, track, scope, status, ball, payload, published_at)
  values (uid, ea, ca, 'custom_request', 'custom', 'person', 'pending', 'client',
          '{"title":"לבדיקה עם קישור","internalTaskReview":true,"clientLinkUrl":"https://example.org/guide"}', now())
  returning id into ic;
  insert into public.onboarding_steps (user_id, engagement_id, client_id, step_type, track, scope, status, ball, payload, published_at)
  values (uid, ea, ca, 'custom_request', 'custom', 'person', 'pending', 'client',
          '{"title":"לא לבדיקה","internalTaskReview":false}', now())
  returning id into id2;
  select coalesce(jsonb_agg(a.step_id), '[]'::jsonb) into res from public._client_announceable_steps(ca) a
   where a.step_id in (ia, ib, ic, id2);
  out := out || jsonb_build_object('t', 'A8 סומנה לבדיקה בלי תוכן ⇒ לא במייל; עם פריט/קישור, או בלי הסימון ⇒ כן', 'pass',
    not (res ? ia) and res ? ib and res ? ic and res ? id2, 'got', res);
  exception when others then
    out := out || jsonb_build_object('t', 'קרס: A · מה נכנס ל«שלח מייל…»', 'pass', false, 'got', sqlerrm);
  end;
  execute 'set local role postgres';

  begin
  -- ── N.2 · השכפול ב-214 זהה למקור, תו בתו (בלי רווחים ואותיות גדולות) ───────────────
  -- (N.1 — השער: מקור אחד, בלי עותק ב-214 — נבדק אחרי N.7, על כל המצבים שלמטה.)
  select prosrc into nsrc from pg_proc where oid = 'public._client_announceable_steps(text)'::regprocedure;
  select prosrc into nfn from pg_proc where oid = 'public._payload_has_client_content(jsonb)'::regprocedure;
  ncore := regexp_replace(regexp_replace(regexp_replace(lower(nfn), '\s+', '', 'g'), '^select', ''), ';$', '');
  out := out || jsonb_build_object('t', 'N.2 «אין תוכן ללקוח» (214) = _payload_has_client_content (216), תו בתו', 'pass',
    length(ncore) > 300
    and strpos(replace(regexp_replace(lower(nsrc), '\s+', '', 'g'), 's.payload', 'p'), ncore) > 0, 'got', ncore);

  -- ── N.3 · אותה תשובה בפועל: משימה שסומנה לבדיקה נכנסת למייל ⇔ יש בה תוכן ללקוח ───────
  insert into public.clients (id, user_id, first_name, last_name, email, lifecycle_stage, family_status, dealer_type)
  values (cn, uid, 'בדיקה', 'QAR4N', 'delivered@resend.dev', 'onboarding', 'single', 'licensed');
  insert into public.engagements (id, user_id, client_id, status, process_published_at)
  values (en, uid, cn, 'onboarding', now());
  for smp in select value from jsonb_array_elements(
    '[{"title":"ריקה"},
      {"title":"פריט","requirements":[{"key":"r1","kind":"confirm","label":"אישור","done":false,"required":true}]},
      {"title":"רשימה ריקה","requirements":[]},
      {"title":"דרישות לא כמערך","requirements":{"a":1}},
      {"title":"רשימת סימון","checklist":[{"key":"c1","label":"מסמך","done":false}]},
      {"title":"קבצים","clientResources":[{"documentId":"qa-r4n-doc"}]},
      {"title":"קובץ","clientResource":"qa-r4n-doc"},
      {"title":"קישור","clientLinkUrl":"https://example.org/guide"},
      {"title":"קישור ריק","clientLinkUrl":"   "},
      {"title":"קובץ וקישור ריקים","clientResource":"","clientLinkUrl":""},
      {"title":"מדריך","guideKey":"rep-approval"},
      {"title":"טופס","smartForm":{"formKey":"qa-r4n"}},
      {"title":"צילום","shaamIdentity":{"requestId":"qa-r4n"}},
      {"title":"הודעה","messageOnly":true},
      {"title":"גורם חיצוני","externalParty":{"kind":"other","contact":{"email":"delivered@resend.dev"}}}]'::jsonb)
  loop
    insert into public.onboarding_steps (user_id, engagement_id, client_id, step_type, track, scope, status, ball, payload, published_at)
    values (uid, en, cn, 'custom_request', 'custom', 'person', 'pending', 'client', smp || '{"internalTaskReview":true}'::jsonb, now())
    returning id into v;
    -- הודעה וגורם חיצוני לא נכנסים בכל מקרה (תנאים אחרים) — הכלל של התוכן נבדק בשאר.
    vexp := case when coalesce(smp->>'messageOnly', '') = 'true' or smp->'externalParty' is not null then false
                 else public._payload_has_client_content(smp || '{"internalTaskReview":true}'::jsonb) end;
    vgot := exists (select 1 from public._client_announceable_steps(cn) a where a.step_id = v);
    if vexp is distinct from vgot then
      nbad := nbad || jsonb_build_object('payload', smp, 'expected', vexp, 'got', vgot);
    end if;
    nk := nk + case when public._payload_has_client_content(smp) then 1 else 0 end;
  end loop;
  out := out || jsonb_build_object('t', 'N.3 15 דוגמאות: «לבדיקה» במייל ⇔ _payload_has_client_content; 10 עם תוכן, 5 בלי', 'pass',
    nbad = '[]'::jsonb and nk = 10, 'got', jsonb_build_object('mismatch', nbad, 'withContent', nk));
  exception when others then
    out := out || jsonb_build_object('t', 'קרס: N.2–N.3 · השכפול ב-214', 'pass', false, 'got', sqlerrm);
  end;
  execute 'set local role postgres';

  begin
  -- ── N.4–N.5 · לקוח שחוזר: ההתקשרות הקודמת נפתחה, הקליטה החדשה עוד לא (הכרעה ב) ───────────
  -- הקליטה החדשה נוצרה לפני 10 ימים. לפניה פורסמו: «ישנה N» (עברה אליה מההתקשרות הקודמת —
  -- carriedFrom — ונמסרה במייל לפני 40 יום) ו«ישנה N2» (לפני 20 יום, עוד לא במייל; נשארה משויכת
  -- להתקשרות הקודמת — השער לא תלוי בשיוך). אחריה: «חדשה N» (לפני 5 ימים) — של הקליטה החדשה.
  insert into public.clients (id, user_id, first_name, last_name, email, lifecycle_stage, family_status, dealer_type)
  values (cr, uid, 'חוזר', 'QAR4N', 'delivered@resend.dev', 'onboarding', 'single', 'licensed');
  insert into public.engagements (id, user_id, client_id, status, process_published_at, created_at, ended_at, ended_reason)
  values (ero, uid, cr, 'ended', now() - interval '650 days', now() - interval '700 days', now() - interval '30 days', 'QAR4N');
  insert into public.engagements (id, user_id, client_id, status, process_published_at, created_at)
  values (ern, uid, cr, 'onboarding', null, now() - interval '10 days');
  insert into public.onboarding_steps (user_id, engagement_id, client_id, step_type, track, scope, status, ball, payload, published_at)
  values (uid, ern, cr, 'custom_request', 'custom', 'person', 'pending', 'client',
          jsonb_build_object('title', 'בקשה ישנה N', 'clientTitle', 'בקשה ישנה N',
            'requirements', '[{"key":"r1","kind":"confirm","label":"אישור","done":false,"required":true}]'::jsonb,
            'carriedFrom', jsonb_build_object('engagementId', ero, 'endedAt', now() - interval '30 days')),
          now() - interval '40 days')
  returning id into rp;
  insert into public.client_step_notice_state (step_id, announced_version, announced_at)
  select rp, client_content_version, now() - interval '40 days' from public.onboarding_steps where id = rp;
  insert into public.onboarding_steps (user_id, engagement_id, client_id, step_type, track, scope, status, ball, payload, published_at)
  values (uid, ero, cr, 'custom_request', 'custom', 'person', 'pending', 'client',
          '{"title":"בקשה ישנה N2","clientTitle":"בקשה ישנה N2","requirements":[{"key":"r1","kind":"confirm","label":"אישור","done":false,"required":true}]}', now() - interval '20 days')
  returning id into rp2;
  insert into public.onboarding_steps (user_id, engagement_id, client_id, step_type, track, scope, status, ball, payload, published_at)
  values (uid, ern, cr, 'custom_request', 'custom', 'person', 'pending', 'client',
          '{"title":"בקשה חדשה N","clientTitle":"בקשה חדשה N","requirements":[{"key":"r1","kind":"confirm","label":"אישור","done":false,"required":true}]}', now() - interval '5 days')
  returning id into rn;
  nsame := nsame || jsonb_build_object('s', 'חוזר, קליטה שטרם נפתחה',
    'same', public.client_process_published(cr) is not distinct from public.client_step_gate_open(cr, null));
  ng := jsonb_build_object('client', public.client_process_published(cr),
          'old', public.client_step_gate_open(cr, (select published_at from public.onboarding_steps where id = rp)),
          'old2', public.client_step_gate_open(cr, (select published_at from public.onboarding_steps where id = rp2)),
          'new', public.client_step_gate_open(cr, (select published_at from public.onboarding_steps where id = rn)));
  select coalesce(jsonb_agg(a.step_id), '[]'::jsonb) into nann
    from public._client_announceable_steps(cr) a where a.step_id in (rn, rp, rp2);
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', uid::text, true);
  execute 'set local role authenticated';
  ntray := public.client_ready_to_send(cr);
  execute 'set local role postgres';
  npage := public.build_client_portal(cr, 'live');
  -- «שלח מייל…» (חדש) ותזכורת ידנית — כל אחת נתפסת ומשוחררת מיד (שום דבר לא נשלח).
  nclaim := public.claim_client_notice(uid, cr, 'new', 'R4N4', null, 'manual', null);
  update public.client_notices set status = 'cancelled', reason = 'qa' where client_id = cr and status in ('claimed', 'sending');
  nclaim2 := public.claim_client_notice(uid, cr, 'reminder', 'R4N4r', null, 'manual', null);
  update public.client_notices set status = 'cancelled', reason = 'qa' where client_id = cr and status in ('claimed', 'sending');
  out := out || jsonb_build_object('t', 'N.4 לקוח שחוזר, קליטה חדשה שטרם נפתחה ⇒ מה שפורסם לפניה ועדיין פתוח — בדף, במגש, ב«שלח מייל…» ובתזכורת; הבקשה של הקליטה החדשה — בשום מקום; «מכינים» בדף', 'pass',
    ng = '{"client":false,"old":true,"old2":true,"new":false}'::jsonb
    and jsonb_array_length(nann) = 2 and nann ? rp and nann ? rp2 and not (nann ? rn)
    and coalesce((ntray->>'ok')::boolean, false)
    and jsonb_array_length(coalesce(ntray->'owner'->'items', '[]'::jsonb)) = 1
    and ntray->'owner'->'items'->0->>'stepId' = rp2
    and jsonb_array_length(coalesce(ntray->'owner'->'reminder'->'items', '[]'::jsonb)) = 1
    and ntray->'owner'->'reminder'->'items'->0->>'stepId' = rp
    and exists (select 1 from jsonb_array_elements(npage->'items') y where y->>'key' = 'custom_' || rp)
    and exists (select 1 from jsonb_array_elements(npage->'items') y where y->>'key' = 'custom_' || rp2)
    and not exists (select 1 from jsonb_array_elements(npage->'items') y where y->>'key' = 'custom_' || rn)
    and exists (select 1 from jsonb_array_elements(npage->'items') y where y->>'key' = 'process_pending')
    and coalesce((nclaim->>'ok')::boolean, false) and jsonb_array_length(nclaim->'items') = 1
    and nclaim->'items'->0->>'stepId' = rp2
    and coalesce((nclaim2->>'ok')::boolean, false) and jsonb_array_length(nclaim2->'items') = 1
    and nclaim2->'items'->0->>'stepId' = rp
    -- לא ריק סתם: הכלל הקודם (השער ברמת הלקוח, לכל הבקשות) היה מסתיר את שלושתן
    and not public.client_process_published(cr),
    'got', jsonb_build_object('gate', ng, 'announce', nann, 'tray', ntray->'owner', 'claim', nclaim, 'claimReminder', nclaim2,
                              'page', (select jsonb_agg(y->>'key') from jsonb_array_elements(npage->'items') y)));

  update public.engagements set process_published_at = now() where id = ern;
  nsame := nsame || jsonb_build_object('s', 'חוזר, הקליטה נפתחה',
    'same', public.client_process_published(cr) is not distinct from public.client_step_gate_open(cr, null));
  select coalesce(jsonb_agg(a.step_id), '[]'::jsonb) into nann
    from public._client_announceable_steps(cr) a where a.step_id in (rn, rp, rp2);
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', uid::text, true);
  execute 'set local role authenticated';
  ntray := public.client_ready_to_send(cr);
  execute 'set local role postgres';
  npage := public.build_client_portal(cr, 'live');
  out := out || jsonb_build_object('t', 'N.5 הקליטה החדשה נפתחה ⇒ גם הבקשה שלה בדף ובמייל; הישנות נשארות (חדשה / תזכורת); «מכינים» ירד', 'pass',
    public.client_process_published(cr)
    and public.client_step_gate_open(cr, (select published_at from public.onboarding_steps where id = rn))
    and jsonb_array_length(nann) = 3
    and jsonb_array_length(coalesce(ntray->'owner'->'items', '[]'::jsonb)) = 2
    and exists (select 1 from jsonb_array_elements(ntray->'owner'->'items') y where y->>'stepId' = rn)
    and exists (select 1 from jsonb_array_elements(ntray->'owner'->'items') y where y->>'stepId' = rp2)
    and exists (select 1 from jsonb_array_elements(ntray->'owner'->'reminder'->'items') y where y->>'stepId' = rp)
    and (select count(*) from jsonb_array_elements(npage->'items') y
          where y->>'key' in ('custom_' || rn, 'custom_' || rp, 'custom_' || rp2)) = 3
    and not exists (select 1 from jsonb_array_elements(npage->'items') y where y->>'key' = 'process_pending'),
    'got', jsonb_build_object('announce', nann, 'tray', ntray->'owner',
                              'page', (select jsonb_agg(y->>'key') from jsonb_array_elements(npage->'items') y)));

  -- ── N.6 · לקוח ראשון — כמו קודם (מייל ודף), ובכל מצב השער ברמת הלקוח = השער עם null (N.1) ────
  insert into public.clients (id, user_id, first_name, last_name, email, lifecycle_stage, family_status, dealer_type)
  values (cf1, uid, 'ראשון', 'QAR4N1', 'delivered@resend.dev', 'onboarding', 'single', 'licensed'),
         (cf2, uid, 'ראשון', 'QAR4N2', 'delivered@resend.dev', 'active', 'single', 'licensed'),
         (cf3, uid, 'ראשון', 'QAR4N3', 'delivered@resend.dev', 'active', 'single', 'licensed');
  insert into public.engagements (id, user_id, client_id, status, process_published_at)
  values (ef1, uid, cf1, 'onboarding', null), (ef3, uid, cf3, 'active', now() - interval '100 days');
  insert into public.onboarding_steps (user_id, engagement_id, client_id, step_type, track, scope, status, ball, payload, published_at)
  values (uid, ef1, cf1, 'custom_request', 'custom', 'person', 'pending', 'client',
          '{"title":"N6 א","requirements":[{"key":"r1","kind":"confirm","label":"אישור","done":false,"required":true}]}', now())
  returning id into f1;
  insert into public.onboarding_steps (user_id, engagement_id, client_id, step_type, track, scope, status, ball, payload, published_at)
  values (uid, null, cf2, 'custom_request', 'custom', 'person', 'pending', 'client',
          '{"title":"N6 ב","requirements":[{"key":"r1","kind":"confirm","label":"אישור","done":false,"required":true}]}', now())
  returning id into f2;
  insert into public.onboarding_steps (user_id, engagement_id, client_id, step_type, track, scope, status, ball, payload, published_at)
  values (uid, ef3, cf3, 'custom_request', 'custom', 'person', 'pending', 'client',
          '{"title":"N6 ג","requirements":[{"key":"r1","kind":"confirm","label":"אישור","done":false,"required":true}]}', now())
  returning id into f3;
  nstates := nstates || jsonb_build_object('s', 'קליטה שטרם נפתחה', 'gate', public.client_process_published(cf1),
    'mail', exists (select 1 from public._client_announceable_steps(cf1) a where a.step_id = f1),
    'page', exists (select 1 from jsonb_array_elements(public.build_client_portal(cf1, 'live')->'items') y where y->>'key' = 'custom_' || f1));
  nsame := nsame || jsonb_build_object('s', 'ראשון: קליטה שטרם נפתחה',
    'same', public.client_process_published(cf1) is not distinct from public.client_step_gate_open(cf1, null));
  update public.engagements set process_published_at = now() where id = ef1;
  nstates := nstates || jsonb_build_object('s', 'קליטה שנפתחה', 'gate', public.client_process_published(cf1),
    'mail', exists (select 1 from public._client_announceable_steps(cf1) a where a.step_id = f1),
    'page', exists (select 1 from jsonb_array_elements(public.build_client_portal(cf1, 'live')->'items') y where y->>'key' = 'custom_' || f1));
  nsame := nsame || jsonb_build_object('s', 'ראשון: קליטה שנפתחה',
    'same', public.client_process_published(cf1) is not distinct from public.client_step_gate_open(cf1, null));
  nstates := nstates || jsonb_build_object('s', 'בלי התקשרות', 'gate', public.client_process_published(cf2),
    'mail', exists (select 1 from public._client_announceable_steps(cf2) a where a.step_id = f2),
    'page', exists (select 1 from jsonb_array_elements(public.build_client_portal(cf2, 'live')->'items') y where y->>'key' = 'custom_' || f2));
  nsame := nsame || jsonb_build_object('s', 'ראשון: בלי התקשרות',
    'same', public.client_process_published(cf2) is not distinct from public.client_step_gate_open(cf2, null));
  nstates := nstates || jsonb_build_object('s', 'פעילה שנפתחה', 'gate', public.client_process_published(cf3),
    'mail', exists (select 1 from public._client_announceable_steps(cf3) a where a.step_id = f3),
    'page', exists (select 1 from jsonb_array_elements(public.build_client_portal(cf3, 'live')->'items') y where y->>'key' = 'custom_' || f3));
  nsame := nsame || jsonb_build_object('s', 'ראשון: פעילה שנפתחה',
    'same', public.client_process_published(cf3) is not distinct from public.client_step_gate_open(cf3, null));
  update public.engagements set process_published_at = null where id = ef3;
  nstates := nstates || jsonb_build_object('s', 'פעילה שלא נפתחה', 'gate', public.client_process_published(cf3),
    'mail', exists (select 1 from public._client_announceable_steps(cf3) a where a.step_id = f3),
    'page', exists (select 1 from jsonb_array_elements(public.build_client_portal(cf3, 'live')->'items') y where y->>'key' = 'custom_' || f3));
  nsame := nsame || jsonb_build_object('s', 'ראשון: פעילה שלא נפתחה',
    'same', public.client_process_published(cf3) is not distinct from public.client_step_gate_open(cf3, null));
  out := out || jsonb_build_object('t', 'N.6 לקוח ראשון — כמו קודם (לא נפתחה ⇒ לא; נפתחה / בלי התקשרות ⇒ כן), במייל ובדף, ובכל מצב = השער ברמת הלקוח', 'pass',
    nstates = '[{"s":"קליטה שטרם נפתחה","gate":false,"mail":false,"page":false},{"s":"קליטה שנפתחה","gate":true,"mail":true,"page":true},{"s":"בלי התקשרות","gate":true,"mail":true,"page":true},{"s":"פעילה שנפתחה","gate":true,"mail":true,"page":true},{"s":"פעילה שלא נפתחה","gate":false,"mail":false,"page":false}]'::jsonb,
    'got', nstates);

  -- ── N.7 · «אישור הייצוג באזור האישי» (הכרעה א) ──────────────────────────────────────────
  -- (1) כרטיס שפורסם לפני שנפתחה קליטה חדשה — עבודה קודמת: בדף, והתזכורת שלו ממשיכה גם כשהקליטה
  --     החדשה טרם נפתחה ללקוח (הכרעה ב).
  insert into public.clients (id, user_id, first_name, last_name, email, lifecycle_stage, family_status, dealer_type)
  values (cpr, uid, 'בדיקה', 'QAR4NP', 'delivered@resend.dev', 'onboarding', 'single', 'licensed');
  insert into public.engagements (id, user_id, client_id, status, process_published_at, created_at, ended_at, ended_reason)
  values (epo, uid, cpr, 'ended', now() - interval '650 days', now() - interval '700 days', now() - interval '30 days', 'QAR4NP');
  ra := public.ensure_rep_client_approval_step(cpr);
  update public.onboarding_steps set published_at = now() - interval '20 days' where id = ra;
  insert into public.engagements (id, user_id, client_id, status, process_published_at, created_at)
  values (epr, uid, cpr, 'onboarding', null, now() - interval '10 days');
  nsame := nsame || jsonb_build_object('s', 'כרטיס שפורסם לפני הקליטה',
    'same', public.client_process_published(cpr) is not distinct from public.client_step_gate_open(cpr, null));
  npage := public.build_client_portal(cpr, 'live');
  vb := public.claim_representation_portal_reminder(ra, 0);
  vi := coalesce((select (payload->'reminder'->>'count')::int from public.onboarding_steps where id = ra), 0);
  out := out || jsonb_build_object('t', 'N.7 כרטיס הייצוג שפורסם לפני הקליטה החדשה ⇒ בדף, והתזכורת שלו נתבעת גם כשהקליטה טרם נפתחה', 'pass',
    ra is not null and not public.client_process_published(cpr)
    and (select engagement_id = epo from public.onboarding_steps where id = ra)
    and exists (select 1 from jsonb_array_elements(npage->'items') y where y->>'key' = 'rep_approval' and y->>'bucket' = 'action')
    and vb and vi = 1,
    'got', jsonb_build_object('step', ra, 'claim', vb, 'count', vi,
                              'page', (select jsonb_agg(y->>'key') from jsonb_array_elements(npage->'items') y)));

  -- (2) כרטיס שנולד אחרי שנפתחה קליטה חדשה (טרם פורסמה): לא בדף, לא ב«שלח מייל…» גם כששע״ם
  --     דרשה אותו, ובלי תזכורת — עד הפרסום. אחרי הפרסום — כן. טיוטה — לא.
  insert into public.clients (id, user_id, first_name, last_name, email, lifecycle_stage, family_status, dealer_type)
  values (cpr2, uid, 'בדיקה', 'QAR4NP2', 'delivered@resend.dev', 'onboarding', 'single', 'licensed');
  insert into public.engagements (id, user_id, client_id, status, process_published_at, created_at)
  values (epr2, uid, cpr2, 'onboarding', null, now() - interval '10 days');
  ra2 := public.ensure_rep_client_approval_step(cpr2);
  perform public.shaam_require_client_approval(cpr2);
  nsame := nsame || jsonb_build_object('s', 'כרטיס אחרי הקליטה, טרם נפתחה',
    'same', public.client_process_published(cpr2) is not distinct from public.client_step_gate_open(cpr2, null));
  npage := public.build_client_portal(cpr2, 'live');
  select count(*) into vi2 from public._client_announceable_steps(cpr2) a where a.step_id = ra2;
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', uid::text, true);
  execute 'set local role authenticated';
  ntray := public.client_ready_to_send(cpr2);
  execute 'set local role postgres';
  vb := public.claim_representation_portal_reminder(ra2, 0);
  vi := coalesce((select (payload->'reminder'->>'count')::int from public.onboarding_steps where id = ra2), 0);
  out := out || jsonb_build_object('t', 'N.7א כרטיס הייצוג של קליטה חדשה שטרם נפתחה ⇒ לא בדף, לא ב«שלח מייל…» גם כששע״ם דרשה, ובלי תזכורת', 'pass',
    ra2 is not null
    and (select engagement_id = epr2 and published_at is not null and payload->>'requiredBy' = 'shaam'
           from public.onboarding_steps where id = ra2)
    and not exists (select 1 from jsonb_array_elements(npage->'items') y where y->>'key' = 'rep_approval')
    and vi2 = 0
    and coalesce((ntray->>'ok')::boolean, false)
    and not exists (select 1 from jsonb_array_elements(coalesce(ntray->'owner'->'items', '[]'::jsonb)) y where y->>'stepId' = ra2)
    and not vb and vi = 0,
    'got', jsonb_build_object('step', ra2, 'announce', vi2, 'claim', vb, 'count', vi, 'tray', ntray->'owner',
                              'page', (select jsonb_agg(y->>'key') from jsonb_array_elements(npage->'items') y)));
  update public.engagements set process_published_at = now() where id = epr2;
  nsame := nsame || jsonb_build_object('s', 'כרטיס אחרי הקליטה, נפתחה',
    'same', public.client_process_published(cpr2) is not distinct from public.client_step_gate_open(cpr2, null));
  npage := public.build_client_portal(cpr2, 'live');
  select count(*) into vi2 from public._client_announceable_steps(cpr2) a where a.step_id = ra2;
  vb2 := public.claim_representation_portal_reminder(ra2, 0);
  update public.onboarding_steps set published_at = null where id = ra2;
  vb3 := public.claim_representation_portal_reminder(ra2, 1);
  out := out || jsonb_build_object('t', 'N.7ב הקליטה נפתחה ⇒ הכרטיס בדף, ב«שלח מייל…» (שע״ם דרשה), והתזכורת נתבעת; טיוטה ⇒ לא', 'pass',
    exists (select 1 from jsonb_array_elements(npage->'items') y where y->>'key' = 'rep_approval' and y->>'bucket' = 'action')
    and vi2 = 1 and vb2 and not vb3
    and (select (payload->'reminder'->>'count')::int from public.onboarding_steps where id = ra2) = 1,
    'got', jsonb_build_object('announce', vi2, 'claim', vb2, 'claimDraft', vb3,
                              'page', (select jsonb_agg(y->>'key') from jsonb_array_elements(npage->'items') y)));
  exception when others then
    out := out || jsonb_build_object('t', 'קרס: N.4–N.7 · השער', 'pass', false, 'got', sqlerrm);
  end;
  execute 'set local role postgres';

  begin
  -- ── N.7ג · כרטיס שהמשרד ביטל בעבר (עבודה קודמת, פורסם לפני הקליטה החדשה) — שע״ם דורשת את
  --    האישור, והוא חוזר כחובה בזמן שהקליטה החדשה טרם פורסמה: חוזר עכשיו ⇒ published_at עכשיו,
  --    ולכן מוסתר כמו כרטיס חדש עד הפרסום (הכרעה א), ולא נראה כעבודה קודמת.
  insert into public.clients (id, user_id, first_name, last_name, email, lifecycle_stage, family_status, dealer_type)
  values (cpr3, uid, 'בדיקה', 'QAR4NP3', 'delivered@resend.dev', 'onboarding', 'single', 'licensed');
  insert into public.engagements (id, user_id, client_id, status, process_published_at, created_at, ended_at, ended_reason)
  values (epo3, uid, cpr3, 'ended', now() - interval '650 days', now() - interval '700 days', now() - interval '30 days', 'QAR4NP3');
  ra3 := public.ensure_rep_client_approval_step(cpr3);
  update public.onboarding_steps set published_at = now() - interval '20 days', status = 'cancelled' where id = ra3;
  insert into public.engagements (id, user_id, client_id, status, process_published_at, created_at)
  values (epr3, uid, cpr3, 'onboarding', null, now() - interval '10 days');
  perform public.shaam_require_client_approval(cpr3);
  select published_at into vt4 from public.onboarding_steps where id = ra3;
  npage := public.build_client_portal(cpr3, 'live');
  select count(*) into vi3 from public._client_announceable_steps(cpr3) a where a.step_id = ra3;
  vb4 := public.claim_representation_portal_reminder(ra3, 0);
  update public.engagements set process_published_at = now() where id = epr3;
  npage2 := public.build_client_portal(cpr3, 'live');
  select count(*) into vi4 from public._client_announceable_steps(cpr3) a where a.step_id = ra3;
  out := out || jsonb_build_object('t', 'N.7ג כרטיס שבוטל וחוזר כחובה בקליטה שטרם פורסמה ⇒ published_at עכשיו: לא בדף, לא במייל ובלי תזכורת; אחרי הפרסום — כן', 'pass',
    (select status = 'pending' and payload->>'requiredBy' = 'shaam' from public.onboarding_steps where id = ra3)
    and vt4 > (select created_at from public.engagements where id = epr3)
    and not exists (select 1 from jsonb_array_elements(npage->'items') y where y->>'key' = 'rep_approval')
    and vi3 = 0 and not vb4
    and exists (select 1 from jsonb_array_elements(npage2->'items') y where y->>'key' = 'rep_approval' and y->>'bucket' = 'action')
    and vi4 = 1,
    'got', jsonb_build_object('publishedAt', vt4, 'announceBefore', vi3, 'claim', vb4, 'announceAfter', vi4,
                              'pageBefore', (select jsonb_agg(y->>'key') from jsonb_array_elements(npage->'items') y),
                              'pageAfter', (select jsonb_agg(y->>'key') from jsonb_array_elements(npage2->'items') y)));
  exception when others then
    out := out || jsonb_build_object('t', 'קרס: N.7ג · כרטיס שחוזר כחובה', 'pass', false, 'got', sqlerrm);
  end;
  execute 'set local role postgres';

  begin
  -- ── W · איזה «ראשון» (C1): התפיסה והתצוגה מחזירות openIntake — «ברוכים הבאים» רק בקליטה
  --    פתוחה; לקוח ותיק בלי מייל דף מקבל את נוסח ההמשך ושורה שמציגה את הדף (stepTemplates).
  insert into public.clients (id, user_id, first_name, last_name, email, lifecycle_stage, family_status, dealer_type)
  values (cw1, uid, 'קליטה', 'QAR4W1', 'delivered@resend.dev', 'onboarding', 'single', 'licensed'),
         (cw2, uid, 'ותיק', 'QAR4W2', 'delivered@resend.dev', 'active', 'single', 'licensed');
  insert into public.engagements (id, user_id, client_id, status, process_published_at)
  values (ew1, uid, cw1, 'onboarding', now()), (ew2, uid, cw2, 'active', now() - interval '400 days');
  insert into public.onboarding_steps (user_id, engagement_id, client_id, step_type, track, scope, status, ball, payload, published_at)
  values (uid, ew1, cw1, 'custom_request', 'custom', 'person', 'pending', 'client',
          '{"title":"W1","clientTitle":"W1","requirements":[{"key":"r1","kind":"file","label":"קובץ","done":false,"required":true}]}', now()),
         (uid, ew2, cw2, 'custom_request', 'custom', 'person', 'pending', 'client',
          '{"title":"W2","clientTitle":"W2","requirements":[{"key":"r1","kind":"file","label":"קובץ","done":false,"required":true}]}', now());
  wv1 := public.client_notice_preview(cw1, 'new');
  wv2 := public.client_notice_preview(cw2, 'new');
  wc1 := public.claim_client_notice(uid, cw1, 'new', 'R4W1', null, 'manual', null);
  update public.client_notices set status = 'cancelled', reason = 'qa' where client_id = cw1 and status in ('claimed', 'sending');
  wc2 := public.claim_client_notice(uid, cw2, 'new', 'R4W2', null, 'manual', null);
  update public.client_notices set status = 'cancelled', reason = 'qa' where client_id = cw2 and status in ('claimed', 'sending');
  out := out || jsonb_build_object('t', 'W.1 (C1) קליטה פתוחה ⇒ openIntake; לקוח ותיק (התקשרות פעילה) ⇒ לא — בתצוגה ובתפיסה, לצד isFirst', 'pass',
    coalesce((wv1->>'ok')::boolean, false) and (wv1->>'isFirst')::boolean and (wv1->>'openIntake')::boolean
    and coalesce((wv2->>'ok')::boolean, false) and (wv2->>'isFirst')::boolean and not (wv2->>'openIntake')::boolean
    and coalesce((wc1->>'ok')::boolean, false) and (wc1->>'openIntake')::boolean
    and coalesce((wc2->>'ok')::boolean, false) and (wc2->>'isFirst')::boolean and not (wc2->>'openIntake')::boolean,
    'got', jsonb_build_object('preview', jsonb_build_array(wv1 - 'items', wv2 - 'items'),
                              'claim', jsonb_build_array(wc1 - 'items' - 'claimToken', wc2 - 'items' - 'claimToken')));
  exception when others then
    out := out || jsonb_build_object('t', 'קרס: W · איזה «ראשון»', 'pass', false, 'got', sqlerrm);
  end;
  execute 'set local role postgres';

  begin
  -- ── T · איזה נוסח יצא (X-C2): mark_client_notice_sending שומר את templateKey, וההשלמה/הכשל
  --    כותבים אותו ליומן (meta.templateKey) — כל שורה בעמוד «מיילים» סופרת את הנוסח שלה.
  insert into public.clients (id, user_id, first_name, last_name, email, lifecycle_stage, family_status, dealer_type)
  values (ct1, uid, 'נוסח', 'QAR4T1', 'delivered@resend.dev', 'onboarding', 'single', 'licensed');
  insert into public.engagements (id, user_id, client_id, status, process_published_at)
  values (et1, uid, ct1, 'onboarding', now());
  insert into public.onboarding_steps (user_id, engagement_id, client_id, step_type, track, scope, status, ball, payload, published_at)
  values (uid, et1, ct1, 'custom_request', 'custom', 'person', 'pending', 'client',
          '{"title":"T1","clientTitle":"T1","requirements":[{"key":"r1","kind":"file","label":"קובץ","done":false,"required":true}]}', now());
  res := public.claim_client_notice(uid, ct1, 'new', 'R4T1', null, 'manual', null);
  nid := (res->>'noticeId')::uuid; tok := (res->>'claimToken')::uuid;
  perform public.mark_client_notice_sending(nid, tok, 'נושא T', '{"html":"<p>t</p>"}', null, 'process_open', 'process_open_first');
  res := public.complete_client_notice(nid, tok, 'test-r4-t1', 'log');
  select meta into tm from public.email_messages where id = (res->>'emailId')::uuid;
  out := out || jsonb_build_object('t', 'T.1 נשלח ⇒ ביומן meta.templateKey = הנוסח שיצא, לצד noticeId', 'pass',
    coalesce((res->>'ok')::boolean, false) and tm->>'templateKey' = 'process_open_first' and tm->>'noticeId' = nid::text,
    'got', jsonb_build_object('res', res, 'meta', tm));
  -- כשל ודאי — אותו מפתח בשורת הכשל; ומייל בלי מפתח (שרת ישן) — בלי templateKey, לא null.
  update public.onboarding_steps set client_content_version = client_content_version + 1 where client_id = ct1;
  res := public.claim_client_notice(uid, ct1, 'new', 'R4T2', null, 'manual', null);
  nid2 := (res->>'noticeId')::uuid; tok := (res->>'claimToken')::uuid;
  perform public.mark_client_notice_sending(nid2, tok, 'נושא T2', '{"html":"<p>t2</p>"}', null, 'process_open', 'process_open');
  perform public.fail_client_notice(nid2, tok, 'validation_error', true);
  select meta into tm2 from public.email_messages where client_id = ct1 and status = 'failed' and meta->>'noticeId' = nid2::text;
  update public.onboarding_steps set client_content_version = client_content_version + 1 where client_id = ct1;
  res2 := public.claim_client_notice(uid, ct1, 'new', 'R4T3', null, 'manual', null);
  tok := (res2->>'claimToken')::uuid;
  perform public.mark_client_notice_sending((res2->>'noticeId')::uuid, tok, 'נושא T3', '{"html":"<p>t3</p>"}', null, 'process_open');
  res2 := public.complete_client_notice((res2->>'noticeId')::uuid, tok, 'test-r4-t3', 'log');
  select meta into tm3 from public.email_messages where id = (res2->>'emailId')::uuid;
  out := out || jsonb_build_object('t', 'T.2 כשל ודאי נושא את המפתח; שליחה בלי מפתח — בלי templateKey', 'pass',
    tm2->>'templateKey' = 'process_open' and tm3 is not null and not (tm3 ? 'templateKey'),
    'got', jsonb_build_object('failed', tm2, 'noKey', tm3, 'res', res2));
  exception when others then
    out := out || jsonb_build_object('t', 'קרס: T · איזה נוסח יצא', 'pass', false, 'got', sqlerrm);
  end;
  execute 'set local role postgres';

  begin
  -- ── N.1 · מקור אחד לשער: client_process_published = client_step_gate_open(c, null) בכל המצבים
  --    שלמעלה, ו-214 קוראת לשער לכל בקשה — בלי עותק של הכלל ─────────────────────────────────
  select regexp_replace(lower(prosrc), '\s+', '', 'g') into nsrc
    from pg_proc where oid = 'public._client_announceable_steps(text)'::regprocedure;
  select regexp_replace(lower(prosrc), '\s+', '', 'g') into nfn
    from pg_proc where oid = 'public.client_process_published(text)'::regprocedure;
  out := out || jsonb_build_object('t', 'N.1 מקור אחד לשער: client_process_published = client_step_gate_open(c, null) בכל 10 המצבים; ב-214 קריאה לשער לכל בקשה, בלי עותק', 'pass',
    strpos(nsrc, 'public.client_step_gate_open(p_client_id,s.published_at)') > 0
    and strpos(nsrc, 'process_published_at') = 0 and strpos(nsrc, 'open_intake_engagement_id') = 0
    and nfn = 'selectpublic.client_step_gate_open(p_client_id,null);'
    and jsonb_array_length(nsame) = 10
    and not exists (select 1 from jsonb_array_elements(nsame) y where coalesce((y->>'same')::boolean, false) = false),
    'got', jsonb_build_object('states', nsame, 'wrapper', nfn));
  exception when others then
    out := out || jsonb_build_object('t', 'קרס: N.1 · מקור אחד לשער', 'pass', false, 'got', sqlerrm);
  end;
  execute 'set local role postgres';

  out := out || jsonb_build_object('t', 'הרשאות: resolve/client_ready_to_send למשרד; reclaim/fail והשער רק לשרת', 'pass',
    has_function_privilege('authenticated', 'public.resolve_client_notice(uuid,text)', 'EXECUTE')
    and has_function_privilege('authenticated', 'public.client_ready_to_send(text)', 'EXECUTE')
    and not has_function_privilege('authenticated', 'public.reclaim_unknown_client_notice(uuid,uuid)', 'EXECUTE')
    and not has_function_privilege('authenticated', 'public.fail_client_notice(uuid,uuid,text,boolean)', 'EXECUTE')
    and not has_function_privilege('authenticated', 'public._client_announceable_steps(text)', 'EXECUTE')
    and not has_function_privilege('authenticated', 'public.client_step_gate_open(text,timestamptz)', 'EXECUTE')
    and not has_function_privilege('anon', 'public.client_step_gate_open(text,timestamptz)', 'EXECUTE')
    and has_function_privilege('service_role', 'public.client_step_gate_open(text,timestamptz)', 'EXECUTE')
    and not has_function_privilege('anon', 'public.resolve_client_notice(uuid,text)', 'EXECUTE'), 'got', null);
  out := out || jsonb_build_object('t', 'invariants', 'pass', public.assert_domain_function_invariants() is not null, 'got', null);
  raise exception 'RESULTS:%', out::text;
end;
$test$;
