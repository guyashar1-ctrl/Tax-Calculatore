-- 292 · אותן תשובות במשרד ובדף האישי. לא מאפסים תשובות של לקוחות קיימים.
begin;

create or replace function public._paperless_answers_normalized(v jsonb,p_client_status text default null)
returns jsonb language plpgsql immutable as $$
declare v_status text; source text;
begin
  v_status := coalesce(nullif(nullif(v->>'paperlessStatus',''),'unknown'),p_client_status,'unknown');
  if v_status not in ('none','self','other_rep','not_applicable') then v_status := 'unknown'; end if;
  source := case when v_status='unknown' then 'unknown' when v_status in ('self','other_rep') then 'paperless' when v_status='not_applicable' then 'none'
    when v->>'dataSource' in ('none','other_software') then v->>'dataSource' else 'unknown' end;
  return jsonb_build_object('paperlessStatus',v_status,'dataSource',source,
    'softwareName',case when source='other_software' then btrim(coalesce(v->>'softwareName','')) else '' end);
end; $$;

create or replace function public._paperless_answers(p_client_id text)
returns jsonb language sql stable security definer set search_path=public as $$
  select public._paperless_answers_normalized((select payload from public.onboarding_steps
   where client_id=p_client_id and step_type in ('paperless_invite','paperless_connection') and status<>'cancelled'
   order by case step_type when 'paperless_invite' then 0 else 1 end,created_at desc,id limit 1),
   (select paperless_status from public.clients where id=p_client_id));
$$;

create or replace function public._paperless_answers_pending(a jsonb)
returns boolean language sql immutable as $$
  select coalesce(a->>'paperlessStatus','unknown')='unknown' or
    (a->>'paperlessStatus'='none' and (coalesce(a->>'dataSource','unknown')='unknown' or
      (a->>'dataSource'='other_software' and nullif(btrim(a->>'softwareName'),'') is null)));
$$;

create or replace function public._paperless_question_step(p_client_id text)
returns text language sql stable security definer set search_path=public as $$
  select id from public.onboarding_steps where client_id=p_client_id
    and step_type in ('paperless_invite','paperless_connection')
    and status in ('locked','pending','in_progress','waiting_client')
  order by case step_type when 'paperless_invite' then 0 else 1 end,created_at desc,id limit 1;
$$;

-- Extract the existing workflow once. Both actors use this private core; no impersonation/JWT changes.
do $mig$
declare b text := pg_get_functiondef('public.set_paperless_path(text,text,text,text)'::regprocedure);
  guard text := '  if v_uid is null or v_conn.user_id <> v_uid then return jsonb_build_object(''ok'', false, ''error'', ''forbidden''); end if;';
  anchor text := '  if v_na then';
  partial text := $partial$
  if p_paperless_status='none' and (p_data_source='unknown' or
     (p_data_source='other_software' and nullif(btrim(p_software_name),'') is null)) then
    perform public.log_onboarding_event(v_conn.user_id,v_conn.id,v_eng,'note',p_actor,
      'נשמרה תשובה לפייפרלס — נותר להשלים מידע',v_facts);
    return jsonb_build_object('ok',true,'partial',true);
  end if;
$partial$;
begin
  if to_regprocedure('public._set_paperless_path_core(text,text,text,text,text)') is null then
    if position(guard in b)=0 or position('p_software_name text DEFAULT NULL::text)' in b)=0 then
      raise exception '292: set_paperless_path auth/signature changed'; end if;
    b := replace(b,'public.set_paperless_path(','public._set_paperless_path_core(');
    b := replace(b,'p_software_name text DEFAULT NULL::text)','p_software_name text, p_actor text)');
    b := replace(b,guard,'');
    b := replace(b,'''none'',''other_software'',''paperless''','''none'',''other_software'',''paperless'',''unknown''');
    b := replace(b,'''accountant''','p_actor');
    -- The first branch follows the shared facts write, before any workflow side effect.
    b := overlay(b placing partial||anchor from position(anchor in b) for length(anchor));
    execute b;
  end if;
end; $mig$;

create or replace function public._save_paperless_answers(p_client_id text,p_answers jsonb,p_expected jsonb,p_actor text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare a jsonb; status text:=p_answers->>'paperlessStatus'; source text:=p_answers->>'dataSource'; r jsonb;
begin
  perform 1 from public.clients where id=p_client_id for update;
  a := public._paperless_answers(p_client_id);
  if p_expected is null or p_expected is distinct from a then
    return jsonb_build_object('ok',false,'error','answers_changed'); end if;
  if status is null or status not in ('none','self','other_rep','not_applicable') or
     source is null or source not in ('none','other_software','paperless','unknown') or
     length(coalesce(p_answers->>'softwareName',''))>120 then
    return jsonb_build_object('ok',false,'error','bad_values'); end if;
  source := case when status in ('self','other_rep') then 'paperless' when status='not_applicable' then 'none' else source end;
  if status='none' and source='paperless' then return jsonb_build_object('ok',false,'error','bad_values'); end if;
  r := public._set_paperless_path_core(p_client_id,status,source,
    case when source='other_software' then nullif(btrim(p_answers->>'softwareName'),'') end,p_actor);
  return r || jsonb_build_object('answers',public._paperless_answers(p_client_id));
end; $$;

create or replace function public.save_paperless_answers(p_client_id text,p_answers jsonb,p_expected jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
begin
  if auth.uid() is null or not public.is_authorized() or not exists (
    select 1 from public.clients c where c.id=p_client_id and c.user_id=auth.uid()) then
    return jsonb_build_object('ok',false,'error','forbidden'); end if;
  return public._save_paperless_answers(p_client_id,p_answers,p_expected,'accountant');
end; $$;

-- Preserve the old complete-answer API for older office tabs; new forms use optimistic concurrency.
create or replace function public.set_paperless_path(p_client_id text,p_paperless_status text,p_data_source text,p_software_name text default null)
returns jsonb language plpgsql security definer set search_path=public as $$
begin
  return public.save_paperless_answers(p_client_id,jsonb_build_object('paperlessStatus',p_paperless_status,
    'dataSource',p_data_source,'softwareName',coalesce(p_software_name,'')),public._paperless_answers(p_client_id));
end; $$;

create or replace function public._portal_submit_paperless_answers(p_token text,p_step_id text,p_answers jsonb,p_expected jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare c public.clients%rowtype; s public.onboarding_steps%rowtype; a jsonb;
begin
  select * into c from public.clients where portal_token=p_token and p_token is not null
    and (portal_token_expires_at is null or portal_token_expires_at>now()) limit 1 for update;
  if c.id is null then return jsonb_build_object('ok',false,'error','invalid'); end if;
  select * into s from public.onboarding_steps where id=p_step_id and client_id=c.id;
  if s.id is null or s.id is distinct from public._paperless_question_step(c.id) then
    return jsonb_build_object('ok',false,'error','not_client_editable'); end if;
  if s.published_at is null then return jsonb_build_object('ok',false,'error','not_published'); end if;
  if s.status='locked' then return jsonb_build_object('ok',false,'error','locked'); end if;
  if not jsonb_path_exists(public.build_client_portal(c.id,'live'),
    '$.** ? (@.kind == "paperless_questions" && @.actionValue == $step)',jsonb_build_object('step',s.id)) then
    return jsonb_build_object('ok',false,'error','not_client_editable'); end if;
  a := public._paperless_answers(c.id);
  if not public._paperless_answers_pending(a) then return jsonb_build_object('ok',false,'error','answers_changed'); end if;
  -- Clients fill missing fields only. Existing office answers cannot be replaced by a stale/public form.
  if p_answers->>'paperlessStatus'='not_applicable' or
     (a->>'paperlessStatus'<>'unknown' and p_answers->>'paperlessStatus' is distinct from a->>'paperlessStatus') or
     (a->>'dataSource'<>'unknown' and p_answers->>'dataSource' is distinct from a->>'dataSource') or
     (a->>'softwareName'<>'' and p_answers->>'softwareName' is distinct from a->>'softwareName') then
    return jsonb_build_object('ok',false,'error','answers_changed'); end if;
  return public._save_paperless_answers(c.id,p_answers,p_expected,'client');
end; $$;

-- Same projection for live, office preview and library samples. No new request rows/publication/mail.
do $mig$
declare b text:=pg_get_functiondef('public._portal_step_items'::regproc);
 anchor text:=E'  begin\n    case s.step_type';
 addition text:=$addition$
  begin
    if s.step_type in ('paperless_invite','paperless_connection') and s.status<>'locked'
       and s.id=public._paperless_question_step(c.id)
       and public._paperless_answers_pending(public._paperless_answers(c.id)) then
      v_items := v_items || jsonb_build_object('bucket','action','key','paperless_signup',
        'label','פרטים לקראת החיבור לפייפרלס','sub','משלימים רק את מה שעוד לא ידוע למשרד',
        'actionKind','portal','actionValue',s.id,'kind','paperless_questions',
        'paperlessAnswers',public._paperless_answers(c.id));
      exit step_body;
    end if;
    case s.step_type
$addition$;
begin
  if position('''paperless_questions''' in b)=0 then
    if position(anchor in b)=0 then raise exception '292: portal projection anchor changed'; end if;
    execute replace(b,anchor,addition);
  end if;
end; $mig$;

-- Library samples are synthetic row values, not persisted client/step records.
do $mig$
declare b text:=pg_get_functiondef('public._portal_step_items'::regproc);
begin
  if position('_paperless_answers_normalized(s.payload' in b)=0 then
    b:=replace(b,'and s.id=public._paperless_question_step(c.id)',
      'and (s.id=public._paperless_question_step(c.id) or (c.id=''sample-client'' and s.status not in (''completed'',''verified'',''skipped'',''cancelled'')))');
    b:=replace(b,'public._paperless_answers(c.id)',
      '(case when c.id=''sample-client'' then public._paperless_answers_normalized(s.payload,c.paperless_status) else public._paperless_answers(c.id) end)');
    execute b;
  end if;
end; $mig$;

do $mig$
declare b text:=pg_get_functiondef('public.portal_submit_step(text,text,jsonb)'::regprocedure);
 anchor text:='  if s.step_type = ''paperless_invite'' then';
 dispatch text:='  if s.step_type not in (';
begin
  if position('missing_paperless_answers' in b)=0 then
    if position(anchor in b)=0 then raise exception '292: submit-step anchor changed'; end if;
    b:=replace(b,anchor,anchor||E'\n    if public._paperless_answers_pending(public._paperless_answers(c.id)) then\n      return jsonb_build_object(''ok'',false,''error'',''missing_paperless_answers'');\n    end if;');
  end if;
  if position('_portal_submit_paperless_answers' in b)=0 then
    if position(dispatch in b)=0 then raise exception '292: submit dispatch anchor changed'; end if;
    b:=replace(b,dispatch,E'  if p_data ? ''paperlessAnswers'' then\n    return public._portal_submit_paperless_answers(p_token,p_step_id,p_data->''paperlessAnswers'',p_data->''expectedPaperlessAnswers'');\n  end if;\n'||dispatch);
  end if;
  execute b;
end; $mig$;

revoke all on function public._paperless_answers(text),public._paperless_answers_normalized(jsonb,text), public._paperless_answers_pending(jsonb),
  public._paperless_question_step(text),public._set_paperless_path_core(text,text,text,text,text),
  public._save_paperless_answers(text,jsonb,jsonb,text),public._portal_submit_paperless_answers(text,text,jsonb,jsonb) from public,anon,authenticated;
revoke all on function public.save_paperless_answers(text,jsonb,jsonb) from public,anon;
grant execute on function public.save_paperless_answers(text,jsonb,jsonb) to authenticated;
commit;
