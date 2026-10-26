begin;
create temp table results302(name text, ok boolean);
create function pg_temp.ok302(value boolean, label text) returns void language plpgsql as $$
begin if value is not true then raise exception '302: %', label; end if; insert into results302 values(label, true); end; $$;

do $$
declare
  uid uuid; cid text := 'qa302t-' || gen_random_uuid()::text; tok text := 'qa302tok-' || gen_random_uuid()::text;
  st text; r jsonb; page jsonb; item jsonb;
begin
  select u.id into uid from auth.users u join public.authorized_users au on lower(au.email) = lower(u.email)
    join public.profiles p on p.id = u.id where au.active and p.office_id is not null limit 1;
  insert into public.clients(id, user_id, first_name, last_name, id_number, lifecycle_stage, portal_token)
    values (cid, uid, 'ישראלה', 'ישראלי', '000000018', 'onboarding', tok);
  insert into public.onboarding_steps(user_id, client_id, step_type, track, scope, status, ball, published_at, payload)
    values (uid, cid, 'retainer_authorization', 'payment', 'engagement', 'locked', 'me', now(),
            jsonb_build_object('method', 'paperless', 'authorizationCreatedAt', now()::text)) returning id into st;

  page := public.build_client_portal(cid, 'live');
  item := (select i from jsonb_array_elements(page->'items') i where i->>'key' = 'retainer_card');
  perform pg_temp.ok302(item is not null and item->>'bucket' = 'action', 'card is waiting for the client');
  perform pg_temp.ok302(item->>'kind' = 'declare' and item->>'actionValue' = st and item->>'cta' = 'הזנתי את הכרטיס', 'card has the «הזנתי את הכרטיס» button');
  perform pg_temp.ok302(item->>'sub' like 'פותחים את אפליקציית פייפרלס%' and coalesce(item->>'note','') not like '%אין מה לאשר%', 'one short line, no «אין מה לאשר כאן»');

  r := public.portal_submit_step(tok, st, '{}'::jsonb);
  perform pg_temp.ok302(r->>'ok' = 'true' and r->>'declared' = 'true', 'declare accepted although the step is locked');
  perform pg_temp.ok302((select payload ? 'cardDeclaredAt' and not payload ? 'cardEnteredAt' and needs_attention from public.onboarding_steps where id = st),
                        'stored as the client''s statement, not as «entered»; office attention raised');
  perform pg_temp.ok302(exists (select 1 from public.onboarding_events where step_id = st and type = 'client_declared'), 'statement in the activity log');
  page := public.build_client_portal(cid, 'live');
  item := (select i from jsonb_array_elements(page->'items') i where i->>'key' = 'retainer_card');
  perform pg_temp.ok302(item->>'bucket' = 'office' and item->>'sub' like 'סימנתם שהזנתם%', 'after the click the card moves to «בטיפולנו»');

  r := public.portal_submit_step(tok, st, '{}'::jsonb);
  perform pg_temp.ok302(r->>'noop' = 'true', 'a second click does nothing');

  update public.onboarding_steps set payload = payload || jsonb_build_object('cardEnteredAt', now()::text) where id = st;
  page := public.build_client_portal(cid, 'live');
  perform pg_temp.ok302(jsonb_path_exists(page, '$.items[*] ? (@.key == "retainer_charge")') and not jsonb_path_exists(page, '$.items[*] ? (@.key == "retainer_card")'),
                        'office confirmation ⇒ the usual «החיוב החודשי» line');

  update public.onboarding_steps set payload = jsonb_build_object('method', 'manual_arrangement', 'authorizationCreatedAt', now()::text) where id = st;
  r := public.portal_submit_step(tok, st, '{}'::jsonb);
  perform pg_temp.ok302(r->>'ok' = 'false', 'manual arrangement is not client-editable');
  perform pg_temp.ok302(not has_function_privilege('anon', 'public._portal_paperless_card_declare(text)', 'execute'), 'internal function is not exposed');
end; $$;
select * from results302;
rollback;
