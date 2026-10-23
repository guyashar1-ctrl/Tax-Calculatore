-- Fixtures live only inside this transaction. No mail/job survives rollback.
begin;
create temp table test_291_results (name text, ok boolean);
do $$
declare
  u uuid;
  c text := 'test291-' || gen_random_uuid()::text;
  q text := c || '-q';
  t text := c || '-t';
  r jsonb;
  v text;
  scenario record;
begin
  select id into u from public.profiles where office_id is not null limit 1;
  if u is null then raise exception 'Test needs an existing staging office'; end if;
  insert into public.clients (id,user_id,first_name,last_name,lifecycle_stage)
    values (c,u,'בדיקה','291','onboarding');
  insert into public.quotation_templates (id,user_id,name,kind) values (t,u,'291','exempt_dealer');
  insert into public.quotations (id,user_id,client_id,template_id,quotation_number,status,kind,approved_at)
    values(q,u,c,t,q,'approved','engagement',now());
  r := public._apply_quotation_dealer_default(q);
  select dealer_type into v from public.clients where id=c;
  if r->>'action' <> 'updated' or v <> 'exempt' then raise exception 'exempt default: % / %',r,v; end if;
  if (select vat_status from public.clients where id=c) is not null then raise exception 'VAT status changed'; end if;
  insert into test_291_results values ('exempt from approved quote, VAT untouched',true);
  r := public._apply_quotation_dealer_default(q);
  if r->>'action' <> 'already_set' then raise exception 'idempotency: %',r; end if;
  insert into test_291_results values ('repeat is no-op',true);

  for scenario in select * from (values
    ('licensed_dealer','licensed'),('company','company')
  ) s(kind,dealer) loop
    update public.clients set dealer_type=null where id=c;
    update public.quotation_templates set kind=scenario.kind where id=t;
    r := public._apply_quotation_dealer_default(q);
    if r->>'action' <> 'updated' or (select dealer_type from public.clients where id=c) <> scenario.dealer then
      raise exception 'kind %: %',scenario.kind,r;
    end if;
    insert into test_291_results values (scenario.kind,true);
  end loop;

  update public.quotation_templates set kind='exempt_dealer' where id=t;
  r := public._apply_quotation_dealer_default(q);
  if r->>'action' <> 'card_conflict' or (select dealer_type from public.clients where id=c) <> 'company' then
    raise exception 'card conflict: %',r; end if;
  insert into test_291_results values ('existing card is preserved',true);
  update public.clients set dealer_type=null,vat_status='authorizedDealer' where id=c;
  r := public._apply_quotation_dealer_default(q);
  if r->>'action' <> 'vat_conflict' then raise exception 'VAT conflict: %',r; end if;
  insert into test_291_results values ('verified VAT conflict preserved',true);
  update public.clients set vat_status=null where id=c;

  for scenario in select * from (values ('draft'),('sent'),('cancelled'),('expired')) s(status) loop
    insert into public.quotations (id,user_id,client_id,template_id,quotation_number,status,kind)
      values(q||scenario.status,u,c,t,q||scenario.status,scenario.status,'engagement');
    r := public._apply_quotation_dealer_default(q||scenario.status);
    if r->>'action' <> 'not_applicable' then raise exception 'status %: %',scenario.status,r; end if;
    insert into test_291_results values ('ignores ' || scenario.status,true);
  end loop;
  update public.quotations set status='approved',kind='one_time' where id=q;
  r := public._apply_quotation_dealer_default(q);
  if r->>'action' <> 'not_applicable' then raise exception 'one time: %',r; end if;
  insert into test_291_results values ('one-time service is not a business type',true);
  update public.quotations set kind='engagement',effective_from=current_date+30 where id=q;
  r := public._apply_quotation_dealer_default(q);
  if r->>'action' <> 'future_quote' then raise exception 'future: %',r; end if;
  insert into test_291_results values ('future agreement does not change current card',true);
  update public.quotations set effective_from=null where id=q;
  for scenario in select * from (values ('custom'),('tax_refund'),('representation_only')) s(kind) loop
    update public.quotation_templates set kind=scenario.kind where id=t;
    r := public._apply_quotation_dealer_default(q);
    if r->>'action' <> 'no_explicit_kind' then raise exception 'kind %: %',scenario.kind,r; end if;
    insert into test_291_results values ('no invented default for ' || scenario.kind,true);
  end loop;
  update public.quotation_templates set kind='exempt_dealer' where id=t;
  insert into public.quotation_templates (id,user_id,name,kind) values(t||'2',u,'291 conflict','licensed_dealer');
  insert into public.quotations (id,user_id,client_id,template_id,quotation_number,status,kind,approved_at)
    values(q||'2',u,c,t||'2',q||'2','approved','engagement',now());
  r := public._apply_quotation_dealer_default(q);
  if r->>'action' <> 'quote_conflict' then raise exception 'quotes conflict: %',r; end if;
  insert into test_291_results values ('conflicting approved plans skipped',true);
  update public.quotation_templates set kind='exempt_dealer' where id=t||'2';

  -- Exercise the real entry point, including its dry-run boundary and onboarding generator.
  r := public.create_engagement_for_quotation(q,true);
  if (select dealer_type from public.clients where id=c) is not null then raise exception 'dry run mutated card'; end if;
  insert into test_291_results values ('real engagement dry-run never changes card',true);
  r := public.create_engagement_for_quotation(q,false);
  if coalesce(r->>'ok','false') <> 'true' or (select dealer_type from public.clients where id=c) <> 'exempt' then
    raise exception 'real engagement path: %',r; end if;
  insert into test_291_results values ('real engagement creates default before onboarding',true);
  if has_function_privilege('anon','public._apply_quotation_dealer_default(text)','execute')
     or has_function_privilege('authenticated','public._apply_quotation_dealer_default(text)','execute') then
    raise exception 'internal helper exposed'; end if;
  insert into test_291_results values ('helper not callable through public API',true);

  -- Full public approval path, with Paperless instructions from the actual portal renderer.
  insert into public.clients (id,user_id,first_name,last_name,lifecycle_stage)
    values (c||'new',u,'בדיקה','291 approval','onboarding');
  insert into public.quotations (id,user_id,client_id,template_id,quotation_number,status,kind,public_token,items)
    values(q||'new',u,c||'new',t,q||'new','sent','engagement',q||'token',
      '[{"id":"291-monthly","name":"הנהלת חשבונות ופייפרלס","category":"monthly","clientPrice":100,"quantity":1,"vatFlag":true}]');
  r := public.approve_quotation(q||'token',null,'בדיקה 291');
  if r->>'status' <> 'approved' or (select dealer_type from public.clients where id=c||'new') <> 'exempt' then
    raise exception 'public approval did not set exempt: %',r; end if;
  insert into test_291_results values ('public approval sets exempt without extra action',true);
  r := public.build_client_portal(c||'new','preview');
  if not jsonb_path_exists(r, '$.**.paperlessKind ? (@ == "פטור")') then
    raise exception 'portal missing exempt instructions: %',left(r::text,1200); end if;
  insert into test_291_results values ('portal says to select exempt in Paperless',true);
  update public.clients set dealer_type='licensed' where id=c||'new';
  r := public.approve_quotation(q||'token',null,'בדיקה 291');
  if (select dealer_type from public.clients where id=c||'new') <> 'licensed' then
    raise exception 'repeat approval overwrote manual correction'; end if;
  insert into test_291_results values ('repeat approval preserves later manual correction',true);

  insert into public.clients (id,user_id,first_name,last_name,lifecycle_stage)
    values (c||'backfill',u,'בדיקה','291 backfill','onboarding');
  insert into public.quotations (id,user_id,client_id,template_id,quotation_number,status,kind,approved_at)
    values(q||'backfill',u,c||'backfill',t,q||'backfill','approved','engagement',now());
end;
$$;
select * from test_291_results;
rollback;
