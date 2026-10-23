begin;
create temp table results292(name text,ok boolean);
create function pg_temp.submit292(token text,step text,answers jsonb,expected jsonb) returns jsonb language sql as $$
  select public.portal_submit_step(token,step,jsonb_build_object('paperlessAnswers',answers,'expectedPaperlessAnswers',expected));
$$;
create function pg_temp.ok292(value boolean,label text) returns void language plpgsql as $$
begin if value is not true then raise exception '292: %',label; end if; insert into results292 values(label,true); end; $$;
create function pg_temp.make292(uid uuid) returns jsonb language plpgsql as $$
declare cid text:='qa292-'||gen_random_uuid()::text; inv text; conn text; r jsonb;
begin
  insert into public.clients(id,user_id,first_name,last_name,dealer_type,lifecycle_stage)
    values(cid,uid,'בדיקה','292','exempt','onboarding');
  insert into public.quotations(id,user_id,client_id,quotation_number,status,kind,approved_at,items)
    values(cid||'-q',uid,cid,cid,'approved','engagement',now(),
      '[{"id":"m","name":"הנהלת חשבונות","category":"monthly","clientPrice":100,"quantity":1,"vatFlag":true}]');
  r:=public.create_engagement_for_quotation(cid||'-q',false);
  if r->>'ok'<>'true' then raise exception 'fixture engagement: %',r; end if;
  update public.clients set portal_token=cid||'-token',portal_token_expires_at=now()+interval '1 day' where id=cid;
  update public.onboarding_steps set published_at=now() where client_id=cid;
  select id into inv from public.onboarding_steps where client_id=cid and step_type='paperless_invite' limit 1;
  select id into conn from public.onboarding_steps where client_id=cid and step_type='paperless_connection' limit 1;
  if inv is null or conn is null then raise exception 'missing fixture paperless steps'; end if;
  return jsonb_build_object('client',cid,'invite',inv,'connection',conn,'token',cid||'-token');
end; $$;
do $$
declare uid uuid; other_uid uuid; f jsonb; f2 jsonb; a jsonb; initial jsonb; next jsonb; r jsonb; page jsonb;
  before_n int; after_n int; source text; v_status text;
begin
  select u.id into uid from auth.users u join public.authorized_users a on lower(a.email)=lower(u.email)
    join public.profiles p on p.id=u.id where a.active and p.office_id is not null limit 1;
  if uid is null then raise exception 'needs authorized staging office'; end if;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',uid,'role','authenticated')::text,true);
  perform set_config('request.jwt.claim.sub',uid::text,true);
  f:=pg_temp.make292(uid); f2:=pg_temp.make292(uid);
  a:=public._paperless_answers(f->>'client'); initial:=a;
  perform pg_temp.ok292(a->>'paperlessStatus'='unknown' and public._paperless_answers_pending(a),'unknown is not no-account/no-history');
  perform pg_temp.ok292(public._paperless_answers_normalized('{"paperlessStatus":"unknown"}','self')->>'paperlessStatus'='self','legacy unknown payload preserves known card answer');
  page:=public.build_client_portal(f->>'client','live');
  perform pg_temp.ok292(jsonb_path_exists(page,'$.** ? (@.kind == "paperless_questions")'),'existing published unanswered request exposes client questions');
  perform pg_temp.ok292(not jsonb_path_exists(page,'$.** ? (@.kind == "paperless_signup")'),'unknown account does not request new signup');
  r:=public.portal_submit_step(f->>'token',f->>'invite','{}');
  perform pg_temp.ok292(r->>'error'='missing_paperless_answers','old signup action cannot bypass unanswered questions');

  next:='{"paperlessStatus":"none","dataSource":"unknown","softwareName":""}';
  r:=public.save_paperless_answers(f->>'client',next,a);
  perform pg_temp.ok292(r->>'ok'='true' and r->>'partial'='true','office can save just account answer');
  a:=public._paperless_answers(f->>'client');
  perform pg_temp.ok292(a=next,'same partial answers stored for both surfaces');
  r:=public.save_paperless_answers(f->>'client',next,initial);
  perform pg_temp.ok292(r->>'error'='answers_changed','stale office form cannot overwrite newer answers');
  perform set_config('request.jwt.claim.sub','',true); perform set_config('request.jwt.claims','{}',true);
  r:=public.save_paperless_answers(f->>'client',next,a);
  perform pg_temp.ok292(r->>'error'='forbidden','office endpoint denies anonymous writes');
  -- Match existing client ownership/RLS, even for a different authorized user in the same office.
  select u.id into other_uid from auth.users u join public.authorized_users z on lower(z.email)=lower(u.email)
    join public.profiles p on p.id=u.id where z.active and u.id<>uid limit 1;
  if other_uid is null then raise exception 'needs second authorized staging user'; end if;
  update public.profiles set office_id=(select office_id from public.profiles where id=uid) where id=other_uid;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',other_uid,'role','authenticated')::text,true);
  perform set_config('request.jwt.claim.sub',other_uid::text,true);
  r:=public.save_paperless_answers(f->>'client',next,a);
  perform pg_temp.ok292(r->>'error'='forbidden','different authorized user in same office cannot change another owner client');
  perform set_config('request.jwt.claim.sub','',true); perform set_config('request.jwt.claims','{}',true);
  next:='{"paperlessStatus":"self","dataSource":"paperless","softwareName":""}';
  r:=pg_temp.submit292(f->>'token',f->>'invite',next,a);
  perform pg_temp.ok292(r->>'error'='answers_changed','client cannot replace known office account answer');
  next:='{"paperlessStatus":"none","dataSource":"other_software","softwareName":""}';
  r:=pg_temp.submit292(f->>'token',f->>'invite',next,a);
  perform pg_temp.ok292(r->>'ok'='true' and r->>'partial'='true','client fills only missing history choice');
  select count(*) into before_n from public.onboarding_steps where client_id=f->>'client' and step_type='data_import';
  perform pg_temp.ok292(before_n=0,'software name missing does not prematurely create import');
  a:=public._paperless_answers(f->>'client');
  next:=a||'{"softwareName":"ריווחית"}';
  r:=pg_temp.submit292(f2->>'token',f->>'invite',next,a);
  perform pg_temp.ok292(r->>'ok'='false','another client token cannot answer this request');
  r:=pg_temp.submit292('invalid',f->>'invite',next,a);
  perform pg_temp.ok292(r->>'error'='invalid','invalid token denied');
  update public.clients set portal_token_expires_at=now()-interval '1 second' where id=f->>'client';
  r:=pg_temp.submit292(f->>'token',f->>'invite',next,a);
  perform pg_temp.ok292(r->>'error'='invalid','expired token denied');
  update public.clients set portal_token_expires_at=now()+interval '1 day' where id=f->>'client';
  update public.onboarding_steps set published_at=null where id=f->>'invite';
  r:=pg_temp.submit292(f->>'token',f->>'invite',next,a);
  perform pg_temp.ok292(r->>'error'='not_published','unpublished question denied');
  update public.onboarding_steps set published_at=now() where id=f->>'invite';
  r:=pg_temp.submit292(f->>'token',f->>'invite',next,a);
  perform pg_temp.ok292(r->>'ok'='true','client completes software name');
  perform pg_temp.ok292(public._paperless_answers(f->>'client')=next,'client answers appear in same office fields');
  select count(*) into after_n from public.onboarding_steps where client_id=f->>'client' and step_type='data_import' and status<>'cancelled';
  perform pg_temp.ok292(after_n=1,'one office import task created with existing workflow');
  page:=public.build_client_portal(f->>'client','live');
  perform pg_temp.ok292(not jsonb_path_exists(page,'$.** ? (@.kind == "paperless_questions")'),'complete answers not asked again');
  perform pg_temp.ok292(jsonb_path_exists(page,'$.** ? (@.kind == "paperless_signup")'),'signup appears after confirmed no-account');
  r:=pg_temp.submit292(f->>'token',f->>'invite',next,a);
  select count(*) into after_n from public.onboarding_steps where client_id=f->>'client' and step_type='data_import' and status<>'cancelled';
  perform pg_temp.ok292(r->>'ok'='false' and after_n=1,'repeated client submit does not duplicate import');
  perform pg_temp.ok292(exists(select 1 from public.onboarding_events where step_id=f->>'connection' and actor='client'),'client source recorded as client, not accountant');

  for v_status in select unnest(array['self','other_rep']) loop
    f2:=pg_temp.make292(uid);a:=public._paperless_answers(f2->>'client');
    r:=pg_temp.submit292(f2->>'token',f2->>'invite',jsonb_build_object('paperlessStatus',v_status,'dataSource','paperless','softwareName',''),a);
    perform pg_temp.ok292(r->>'ok'='true',v_status||' account answer accepted without history question');
    page:=public.build_client_portal(f2->>'client','live');
    perform pg_temp.ok292(not jsonb_path_exists(page,'$.** ? (@.kind == "paperless_signup" || @.kind == "paperless_questions")'),v_status||' does not request duplicate signup');
  end loop;
  f2:=pg_temp.make292(uid);
  perform public._set_step_status(f2->>'invite','completed','client','legacy registration fixture','{}');
  page:=public.build_client_portal(f2->>'client','live');
  perform pg_temp.ok292(jsonb_path_exists(page,'$.items[*] ? (@.kind == "paperless_questions" && @.actionValue == $conn)',jsonb_build_object('conn',f2->>'connection')),'legacy completed signup asks missing facts through active connection');
  r:=pg_temp.submit292(f2->>'token',f2->>'connection','{"paperlessStatus":"self","dataSource":"paperless","softwareName":""}',public._paperless_answers(f2->>'client'));
  perform pg_temp.ok292(r->>'ok'='true' and (select status='completed' from public.onboarding_steps where id=f2->>'invite'),'completing legacy facts preserves completed registration');
  perform pg_temp.ok292(not has_function_privilege('anon','public._set_paperless_path_core(text,text,text,text,text)','execute')
    and not has_function_privilege('authenticated','public._save_paperless_answers(text,jsonb,jsonb,text)','execute'),'private core not accessible through API');
  perform pg_temp.ok292(has_function_privilege('anon','public.portal_submit_step(text,text,jsonb)','execute'),'token endpoint available to client without login');
end; $$;
select * from results292;
rollback;
