-- ═══════════════════════════════════════════════════════════════════════════
-- 59 — הדף של הרו"ח הקודם: רואה את המכתב, חותם עליו, ומעלה את החומרים
-- 60 — בדיקת הקישורים מכסה גם portal וגם release
-- הוחלו 2026-08-05 כ-journey_release_portal_59 ו-journey_link_health_covers_portal_and_release_60
-- ═══════════════════════════════════════════════════════════════════════════
-- הכרעת גיא (2026-08-05): הלקוח אינו חותם על מכתב השחרור — הוא מכותב בלבד.
-- מי שחותם הוא הרו"ח הקודם, והוא גם מי שמעלה את החומרים. ההעלאה עשויה להתפרס
-- על שבועות, ולכן הדף נשאר חי, וגיא ממשיך לסמן ידנית מה שהגיע בדרך אחרת.
-- ההעלאה עצמה יושבת ב-Edge Function ‏portal-upload-document (tokenKind=release).

-- ── א. טביעת טוקן בשליחת המכתב (הרו"ח מאומת) ────────────────────────────────
create or replace function public.mint_release_token(p_step_id text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  s     public.onboarding_steps%rowtype;
  v_uid uuid := auth.uid();
  v_tok text;
  v_mat public.onboarding_steps%rowtype;
begin
  select * into s from public.onboarding_steps where id = p_step_id;
  if s.id is null then return jsonb_build_object('ok', false, 'error', 'step_not_found'); end if;
  if v_uid is null or s.user_id <> v_uid then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;
  if s.step_type <> 'release_letter' then return jsonb_build_object('ok', false, 'error', 'wrong_step_type'); end if;

  v_tok := nullif(s.payload->>'releaseToken', '');
  if v_tok is null then
    v_tok := replace(gen_random_uuid()::text, '-', '');
    update public.onboarding_steps
       set payload = payload || jsonb_build_object('releaseToken', v_tok)
     where id = s.id;
  end if;

  -- המכתב יוצא עכשיו, ולכן ההמתנה לחומרים מתחילה עכשיו. עד היום שלב החומרים
  -- נשאר נעול עד לסגירת שלב המכתב, ואז לא היה לאן להעלות.
  select * into v_mat from public.onboarding_steps
    where client_id = s.client_id and step_type = 'materials_received' and status <> 'cancelled' limit 1;
  if v_mat.id is not null and v_mat.status = 'locked' then
    update public.onboarding_steps
       set status = 'waiting_client', ball = 'prev_accountant'
     where id = v_mat.id;
    perform public.log_onboarding_event(s.user_id, v_mat.id, s.engagement_id, 'status_changed', 'system',
      'המכתב נשלח — ההמתנה לחומרים נפתחה', jsonb_build_object('from','locked','to','waiting_client'));
  end if;

  return jsonb_build_object('ok', true, 'token', v_tok);
end;
$function$;

-- ── ב. הדף עצמו (ציבורי, לפי טוקן) ──────────────────────────────────────────
create or replace function public.get_release_portal(p_token text)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare
  s        public.onboarding_steps%rowtype;
  m        public.onboarding_steps%rowtype;
  c        public.clients%rowtype;
  p        public.profiles%rowtype;
  v_items  jsonb := '[]'::jsonb;
  v_done   int := 0;
  v_total  int := 0;
begin
  select * into s from public.onboarding_steps
   where step_type = 'release_letter' and payload->>'releaseToken' = p_token limit 1;
  if s.id is null then return jsonb_build_object('ok', false, 'error', 'invalid'); end if;

  select * into c from public.clients where id = s.client_id;
  select * into p from public.profiles where id = s.user_id;
  select * into m from public.onboarding_steps
    where client_id = s.client_id and step_type = 'materials_received' and status <> 'cancelled' limit 1;

  if m.id is not null then
    select coalesce(jsonb_agg(jsonb_build_object(
             'key', x->>'key', 'label', x->>'label',
             'done', coalesce((x->>'done')::boolean, false)) order by ord), '[]'::jsonb)
      into v_items
      from jsonb_array_elements(coalesce(m.payload->'checklist','[]'::jsonb)) with ordinality t(x, ord);
    select count(*) filter (where (x->>'done')::boolean), count(*)
      into v_done, v_total from jsonb_array_elements(v_items) x;
  end if;

  return jsonb_build_object(
    'ok', true,
    'firmName', coalesce(p.firm_name, 'המשרד'),
    'branding', coalesce(p.branding, '{}'::jsonb),
    'clientName', trim(coalesce(c.first_name,'') || ' ' || coalesce(c.last_name,'')),
    'businessName', nullif(trim(coalesce(c.business_name,'')), ''),
    'prevAccountantName', nullif(trim(coalesce(c.prev_accountant_name,'')), ''),
    'subject', nullif(s.payload->>'releaseSubject',''),
    'body', nullif(s.payload->>'releaseBody',''),
    'sentAt', s.payload->>'releaseSentAt',
    'objectionDueDate', s.payload->>'objectionDueDate',
    'signed', (s.payload->>'prevAccountantSignedAt') is not null,
    'signedAt', s.payload->>'prevAccountantSignedAt',
    'signerName', s.payload->>'prevAccountantSignerName',
    'materialsStepId', m.id,
    'materials', v_items,
    'materialsDone', v_done,
    'materialsTotal', v_total);
end;
$function$;

-- ── ג. חתימת הרו"ח הקודם ────────────────────────────────────────────────────
create or replace function public.release_portal_sign(p_token text, p_signature text, p_signer_name text default null)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  s      public.onboarding_steps%rowtype;
  v_name text;
begin
  select * into s from public.onboarding_steps
   where step_type = 'release_letter' and payload->>'releaseToken' = p_token limit 1;
  if s.id is null then return jsonb_build_object('ok', false, 'error', 'invalid'); end if;
  if (s.payload->>'prevAccountantSignedAt') is not null then
    return jsonb_build_object('ok', true, 'noop', true);
  end if;
  if nullif(trim(coalesce(p_signature,'')), '') is null then
    return jsonb_build_object('ok', false, 'error', 'missing_signature');
  end if;

  v_name := nullif(trim(coalesce(p_signer_name,'')), '');

  update public.onboarding_steps
     set payload = payload || jsonb_strip_nulls(jsonb_build_object(
                     'prevAccountantSignature', p_signature,
                     'prevAccountantSignedAt', to_jsonb(now()),
                     'prevAccountantSignerName', v_name)),
         -- חתימתו היא האישור לשחרור: השלב נסגר, ומה שתלוי בו נפתח.
         status = 'completed', ball = 'me', completion_method = 'system',
         completed_at = coalesce(completed_at, now()), needs_attention = false
   where id = s.id;

  perform public.log_onboarding_event(s.user_id, s.id, s.engagement_id, 'status_changed', 'system',
    coalesce('רו״ח הקודם חתם על מכתב השחרור — ' || v_name, 'רו״ח הקודם חתם על מכתב השחרור'),
    jsonb_build_object('to', 'completed', 'actor', 'prev_accountant'));

  perform public.unlock_dependent_steps(s.id);

  return jsonb_build_object('ok', true);
end;
$function$;

revoke all on function public.mint_release_token(text) from anon;
grant execute on function public.get_release_portal(text) to anon, authenticated;
grant execute on function public.release_portal_sign(text, text, text) to anon, authenticated;

-- ── 60. בדיקת הקישורים מכסה את כל ששת הסוגים ────────────────────────────────
CREATE OR REPLACE FUNCTION public.public_link_health()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with quote_links as (
    select (public.get_quotation(q.public_token)->>'quotationNumber') is not null as ok
    from public.quotations q where q.public_token is not null
  ),
  onboard_links as (
    select (select count(*) from public.get_onboarding(r.onboarding_token)) = 1 as ok
    from public.representation_requests r where r.onboarding_token is not null
  ),
  intake_links as (
    select (select count(*) from public.resolve_intake_token(c.intake_token)) >= 1 as ok
    from public.clients c where c.intake_token is not null
  ),
  sign_tokens as (
    select (select count(*) from public.user_id_for_public_token(s->>'signToken')) >= 1 as ok
    from public.representation_requests r,
         lateral jsonb_array_elements(coalesce(r.signers,'[]'::jsonb)) s
    where s->>'signToken' is not null
  ),
  portal_links as (
    select coalesce((public.get_client_portal(c.portal_token)->>'ok')::boolean, false) as ok
    from public.clients c where c.portal_token is not null
  ),
  release_links as (
    select coalesce((public.get_release_portal(s.payload->>'releaseToken')->>'ok')::boolean, false) as ok
    from public.onboarding_steps s
    where s.step_type = 'release_letter' and nullif(s.payload->>'releaseToken','') is not null
  )
  select jsonb_build_object(
    'quote',    jsonb_build_object('total',(select count(*) from quote_links),   'ok',(select count(*) from quote_links   where ok)),
    'onboard',  jsonb_build_object('total',(select count(*) from onboard_links), 'ok',(select count(*) from onboard_links where ok)),
    'intake',   jsonb_build_object('total',(select count(*) from intake_links),  'ok',(select count(*) from intake_links  where ok)),
    'sign',     jsonb_build_object('total',(select count(*) from sign_tokens),   'ok',(select count(*) from sign_tokens   where ok)),
    'portal',   jsonb_build_object('total',(select count(*) from portal_links),  'ok',(select count(*) from portal_links  where ok)),
    'release',  jsonb_build_object('total',(select count(*) from release_links), 'ok',(select count(*) from release_links where ok)),
    'allHealthy', (select count(*) from quote_links where not ok)
                + (select count(*) from onboard_links where not ok)
                + (select count(*) from intake_links where not ok)
                + (select count(*) from sign_tokens where not ok)
                + (select count(*) from portal_links where not ok)
                + (select count(*) from release_links where not ok) = 0
  );
$function$;
