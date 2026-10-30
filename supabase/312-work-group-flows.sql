-- ════════════════════════════════════════════════════════════════════════════
-- 312 · «בקשות» — קבוצה = כלל ב«כללי פתיחה», ושורת שירות בהצעה פותחת אותו (שלב 3)
-- ════════════════════════════════════════════════════════════════════════════
-- הדמיה שאושרה: docs/proposals/2026-10-29-requests-dots-v2.html
-- תוכנית: docs/plans/2026-10-29-work-tab-dots-groups-flows.md (שלב 3)
--
-- 1. save_work_group_as_flow — קבוצה עם שם נשמרת ככלל (office_flows, trigger 'manual',
--    seed_key 'work_group'). שם קיים ⇒ גרסה חדשה של אותו כלל (ריצות קיימות נשארות בגרסתן).
--    הקבוצה = שלב אחד שנפתח מיד, וכל בקשה בו מחכה לקודמת (item.after); קבוצה פנימית =
--    שלב משלה, שנפתח גם הוא מיד (במקביל).
--    ‼ כלל מצביע לספרייה (CLAUDE.md §12.2): בקשה שכבר בספרייה (אותו שם ואותו סוג) —
--    מצביעים אליה; בקשה שלא — נכנסת לספרייה (save_request_template). רק בקשה ממלאת/מסמכים
--    יכולה לחזור בכלל ידני (_flow_item_spec: not_repeatable) — פייפרלס, ייצוג ועבודה של
--    המערכת לא נכנסים לכלל; הם נפתחים כמו היום (מסלול הקליטה).
-- 2. כלל שנפתח אצל לקוח — מופיע אצלו כקבוצה באותו שם (טריגר על flow_run_id): השלב
--    הראשון = הקבוצה, כל שלב נוסף = קבוצה פנימית בשם השלב.
-- 3. שורת שירות בהצעה יכולה לשאת כלל (items[].flowId). באישור ההצעה — approve_quotation
--    קוראת ל-_start_quote_flows: כל כלל נפתח פעם אחת (cycle 'quote:<הצעה>:<שורה>'),
--    וכשל בפתיחה לא מפיל את האישור (נרשם ביומן).
-- ════════════════════════════════════════════════════════════════════════════

alter table public.client_work_groups
  add column if not exists flow_id text references public.office_flows(id) on delete set null,
  add column if not exists flow_run_id text references public.flow_runs(id) on delete set null,
  add column if not exists flow_stage_key text;
create index if not exists client_work_groups_run_idx
  on public.client_work_groups (flow_run_id) where flow_run_id is not null;

-- ── 1. קבוצה ⇒ כלל ──────────────────────────────────────────────────────────
create or replace function public.save_work_group_as_flow(p_group_id text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  g          public.client_work_groups%rowtype;
  v_uid      uuid := auth.uid();
  v_office   uuid;
  v_stages   jsonb := '[]'::jsonb;
  v_items    jsonb;
  v_skipped  jsonb := '[]'::jsonb;
  v_prev     text;
  v_n        int := 0;
  v_stage_n  int := 0;
  st         record;
  r          record;
  v_title    text;
  v_tpl      text;
  v_res      jsonb;
  v_err      text;
  v_def      jsonb;
  v_flow     public.office_flows%rowtype;
begin
  select * into g from public.client_work_groups where id = p_group_id;
  if g.id is null or v_uid is null or g.user_id <> v_uid then
    return jsonb_build_object('ok', false, 'error', 'group_not_found');
  end if;
  if g.builtin_key is not null then return jsonb_build_object('ok', false, 'error', 'builtin'); end if;
  -- הכלל הוא של הקבוצה העליונה; קבוצה פנימית = שלב בו.
  while g.parent_group_id is not null loop
    select * into g from public.client_work_groups where id = g.parent_group_id;
  end loop;
  -- ‼ קבוצה שנפתחה מכלל היא העותק של הלקוח הזה (CLAUDE.md §12.2 «אצל הלקוח») —
  --   שינוי שם בה לא משנה את הכלל של שאר הלקוחות.
  if g.flow_run_id is not null then return jsonb_build_object('ok', false, 'error', 'from_rule'); end if;
  select office_id into v_office from public.profiles where id = v_uid;
  if v_office is null then return jsonb_build_object('ok', false, 'error', 'no_office'); end if;

  -- השלב הראשון: הבקשות שבקבוצה עצמה. אחריו — שלב לכל קבוצה פנימית (עם כל מה שבתוכה).
  for st in
    select g.id as gid, g.name as gname, 0 as ord
    union all
    select c.id, c.name, 1 from public.client_work_groups c
     where c.parent_group_id = g.id and c.builtin_key is null
    order by ord
  loop
    v_items := '[]'::jsonb;
    v_prev := null;
    for r in
      with recursive sub(id) as (
        select st.gid
        union all
        select c.id from public.client_work_groups c join sub on c.parent_group_id = sub.id
         where st.ord = 1 and c.builtin_key is null
      )
      select s.* from public.onboarding_steps s
       where s.status <> 'cancelled'
         and ((st.ord = 0 and s.work_group_id = g.id)
           or (st.ord = 1 and s.work_group_id in (select id from sub)))
       order by coalesce(s.sort_order, 0), s.created_at
    loop
      v_title := coalesce(nullif(btrim(r.payload->>'title'), ''), r.step_type);
      if r.step_type not in ('custom_request', 'client_documents') then
        v_skipped := v_skipped || to_jsonb(v_title);
        continue;
      end if;
      v_tpl := null;
      select t.id into v_tpl from public.journey_templates t
       where t.kind = 'request' and t.office_id = v_office and t.name = v_title
         and t.entries->0->>'stepType' = r.step_type
       order by t.created_at limit 1;
      if v_tpl is null then
        v_res := public.save_request_template(r.id, v_title);
        if coalesce(v_res->>'ok', 'false') <> 'true' then
          v_skipped := v_skipped || to_jsonb(v_title);
          continue;
        end if;
        v_tpl := v_res->>'templateId';
      end if;
      v_n := v_n + 1;
      v_items := v_items || jsonb_strip_nulls(jsonb_build_object(
        'key', 'i' || v_n,
        'ref', jsonb_build_object('kind', 'template', 'templateId', v_tpl),
        'after', v_prev,
        'snapshot', jsonb_build_object('stepType', r.step_type, 'title', v_title,
                                       'payload', public.template_payload_from_step(r.payload))));
      v_prev := 'i' || v_n;
    end loop;
    if jsonb_array_length(v_items) > 0 then
      v_stage_n := v_stage_n + 1;
      v_stages := v_stages || jsonb_build_object(
        'key', case when st.ord = 0 then 's1' else 'g' || v_stage_n end,
        'name', st.gname,
        'opens', jsonb_build_object('after', 'start'),
        -- ‼ החלטה שאושרה: מה שיוצא ללקוח מכלל שהמשרד הגדיר — מופיע בדף והמייל יוצא לבד.
        'delivery', 'auto',
        'items', v_items);
    end if;
  end loop;

  -- פייפרלס / רו״ח קודם שבתוך הקבוצה — לא נכנסים לכלל (הם נפתחים במסלול הקליטה); המשרד רואה את זה.
  v_skipped := v_skipped || coalesce((
    with recursive d(id, builtin_key, name) as (
      select c.id, c.builtin_key, c.name from public.client_work_groups c where c.parent_group_id = g.id
      union all
      select c.id, c.builtin_key, c.name from public.client_work_groups c join d on c.parent_group_id = d.id
       where d.builtin_key is null
    ) select jsonb_agg(d.name) from d where d.builtin_key is not null), '[]'::jsonb);

  if jsonb_array_length(v_stages) = 0 then
    return jsonb_build_object('ok', false, 'error', 'nothing_to_save', 'skipped', v_skipped);
  end if;
  v_def := jsonb_build_object('stages', v_stages);
  v_err := public.flow_definition_error(v_def, 'manual');
  if v_err is not null then return jsonb_build_object('ok', false, 'error', v_err, 'skipped', v_skipped); end if;

  select * into v_flow from public.office_flows
   where id = g.flow_id and office_id = v_office and status = 'active';
  if v_flow.id is null then
    select * into v_flow from public.office_flows
     where office_id = v_office and status = 'active' and trigger = 'manual'
       and seed_key = 'work_group' and name = g.name
     order by created_at limit 1;
  end if;

  if v_flow.id is null then
    v_res := public.create_office_flow(g.name, 'manual', v_def);
    if coalesce(v_res->>'ok', 'false') <> 'true' then
      return jsonb_build_object('ok', false, 'error', coalesce(v_res->>'error', 'unknown'), 'skipped', v_skipped);
    end if;
    update public.office_flows set seed_key = 'work_group' where id = v_res->>'flowId';
    update public.client_work_groups set flow_id = v_res->>'flowId', updated_at = now() where id = g.id;
    return jsonb_build_object('ok', true, 'flowId', v_res->>'flowId', 'created', true, 'skipped', v_skipped);
  end if;

  v_res := public.save_office_flow(v_flow.id, v_flow.current_version, v_def, g.name, 'מקבוצה אצל לקוח');
  if coalesce(v_res->>'ok', 'false') <> 'true' then
    return jsonb_build_object('ok', false, 'error', coalesce(v_res->>'error', 'unknown'), 'skipped', v_skipped);
  end if;
  update public.client_work_groups set flow_id = v_flow.id, updated_at = now() where id = g.id;
  return jsonb_build_object('ok', true, 'flowId', v_flow.id, 'created', false, 'skipped', v_skipped);
end;
$function$;

-- ── 2. כלל שנפתח אצל לקוח ⇒ קבוצה באותו שם ─────────────────────────────────
-- ‼ רק לכללים שנולדו מקבוצה (seed_key 'work_group'). שאר המסלולים — כמו היום.
create or replace function public._work_group_adopt_flow_step()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_run   public.flow_runs%rowtype;
  f       public.office_flows%rowtype;
  v_root  text;
  v_child text;
  v_sname text;
begin
  if new.flow_run_id is null or new.work_group_id is not null then return new; end if;
  select * into v_run from public.flow_runs where id = new.flow_run_id;
  select * into f from public.office_flows where id = v_run.flow_id;
  if f.id is null or coalesce(f.seed_key, '') <> 'work_group' then return new; end if;

  select id into v_root from public.client_work_groups
   where flow_run_id = v_run.id and parent_group_id is null limit 1;
  if v_root is null then
    insert into public.client_work_groups (user_id, client_id, name, flow_id, flow_run_id)
    values (new.user_id, new.client_id, left(f.name, 80), f.id, v_run.id)
    returning id into v_root;
  end if;
  if coalesce(new.flow_stage_key, 's1') = 's1' then
    new.work_group_id := v_root;
    return new;
  end if;

  select id into v_child from public.client_work_groups
   where flow_run_id = v_run.id and flow_stage_key = new.flow_stage_key limit 1;
  if v_child is null then
    select s->>'name' into v_sname
      from public.office_flow_versions v, jsonb_array_elements(v.definition->'stages') s
     where v.flow_id = f.id and v.version = v_run.flow_version and s->>'key' = new.flow_stage_key;
    insert into public.client_work_groups (user_id, client_id, parent_group_id, name, flow_id, flow_run_id, flow_stage_key)
    values (new.user_id, new.client_id, v_root, left(coalesce(nullif(v_sname, ''), f.name), 80), f.id, v_run.id, new.flow_stage_key)
    returning id into v_child;
  end if;
  new.work_group_id := v_child;
  return new;
end;
$function$;

drop trigger if exists onboarding_steps_work_group_flow on public.onboarding_steps;
create trigger onboarding_steps_work_group_flow
  before insert or update of flow_run_id on public.onboarding_steps
  for each row execute function public._work_group_adopt_flow_step();

-- ── 3. פתיחת כלל בלי משתמש מחובר (אישור ההצעה) ──────────────────────────────
-- ‼ אותו גוף כמו start_flow_run, בלי בדיקת המשתמש — הלקוח הוא שאישר, והמשרד הוא בעל הכרטיס.
--   רק כלל ידני; כלל שכבר רץ אצל הלקוח — לא נפתח שוב.
create or replace function public._start_flow_run_system(p_client_id text, p_flow_id text, p_cycle_key text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  c        public.clients%rowtype;
  f        public.office_flows%rowtype;
  v_office uuid;
  v_run    public.flow_runs%rowtype;
  v_mat    jsonb;
begin
  select * into c from public.clients where id = p_client_id for update;
  if c.id is null then return jsonb_build_object('ok', false, 'error', 'client_not_found'); end if;
  select office_id into v_office from public.profiles where id = c.user_id;
  select * into f from public.office_flows where id = p_flow_id and office_id = v_office;
  if f.id is null then return jsonb_build_object('ok', false, 'error', 'flow_not_found'); end if;
  if f.status <> 'active' then return jsonb_build_object('ok', false, 'error', 'flow_archived'); end if;
  if f.trigger <> 'manual' then return jsonb_build_object('ok', false, 'error', 'not_manual'); end if;
  if exists (select 1 from public.flow_runs where client_id = c.id and flow_id = f.id and status in ('active', 'paused')) then
    return jsonb_build_object('ok', true, 'alreadyActive', true);
  end if;

  insert into public.flow_runs (user_id, client_id, flow_id, flow_version, cycle_key, trigger, facts, started_by,
                                engagement_id, state)
  values (c.user_id, c.id, f.id, f.current_version, p_cycle_key, f.trigger, public.client_flow_facts(c.id), 'system',
          public.current_engagement_id(c.id),
          jsonb_build_object('stages', '{}'::jsonb, 'actions', '{}'::jsonb, 'autoActions', false))
  on conflict (client_id, flow_id, cycle_key) do nothing
  returning * into v_run;
  if v_run.id is null then return jsonb_build_object('ok', true, 'alreadyStarted', true); end if;

  v_mat := public._flow_materialize(v_run.id);
  perform public.log_onboarding_event(c.user_id, null, v_run.engagement_id, 'created', 'system',
    'נפתח מסלול «' || f.name || '» עם אישור ההצעה',
    jsonb_build_object('flowRunId', v_run.id, 'flowId', f.id, 'version', f.current_version, 'flowEvent', 'started',
                       'created', jsonb_array_length(v_mat->'created'), 'skipped', v_mat->'skipped'));
  perform public._flow_progress(v_run.id);
  return jsonb_build_object('ok', true, 'runId', v_run.id, 'created', v_mat->'created', 'skipped', v_mat->'skipped');
end;
$function$;

-- ── 4. באישור ההצעה — הכללים של השורות ────────────────────────────────────
-- ‼ כשל בפתיחה לא מפיל את האישור: הלקוח אישר, והמשרד יראה ביומן מה לא נפתח.
create or replace function public._start_quote_flows(p_quotation_id text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  q    public.quotations%rowtype;
  it   jsonb;
  v_res jsonb;
begin
  select * into q from public.quotations where id = p_quotation_id;
  if q.id is null or q.client_id is null then return; end if;
  for it in select * from jsonb_array_elements(coalesce(q.snapshot->'items', q.items, '[]'::jsonb)) loop
    if nullif(it->>'flowId', '') is null then continue; end if;
    begin
      v_res := public._start_flow_run_system(q.client_id, it->>'flowId',
                 'quote:' || q.id || ':' || coalesce(nullif(it->>'id', ''), it->>'flowId'));
      if coalesce(v_res->>'ok', 'false') <> 'true' then
        perform public.log_onboarding_event(q.user_id, null, public.current_engagement_id(q.client_id), 'note', 'system',
          'כלל הפתיחה של «' || coalesce(it->>'name', 'שירות') || '» לא נפתח (' || coalesce(v_res->>'error', '?') || ')',
          jsonb_build_object('quotationId', q.id, 'flowId', it->>'flowId', 'error', v_res->>'error'));
      end if;
    exception when others then
      perform public.log_onboarding_event(q.user_id, null, public.current_engagement_id(q.client_id), 'note', 'system',
        'כלל הפתיחה של «' || coalesce(it->>'name', 'שירות') || '» לא נפתח (שגיאה)',
        jsonb_build_object('quotationId', q.id, 'flowId', it->>'flowId', 'error', sqlerrm));
    end;
  end loop;
end;
$function$;

revoke all on function public.save_work_group_as_flow(text) from public, anon;
revoke all on function public._work_group_adopt_flow_step() from public, anon, authenticated;
revoke all on function public._start_flow_run_system(text, text, text) from public, anon, authenticated;
revoke all on function public._start_quote_flows(text) from public, anon, authenticated;
grant execute on function public.save_work_group_as_flow(text) to authenticated;
grant execute on function public._start_flow_run_system(text, text, text) to service_role;
grant execute on function public._start_quote_flows(text) to service_role;

-- ── approve_quotation — הגרסה של 161 כמות שהיא, ועוד שורה אחת: הכללים של השורות ──
-- ‼ 220 (assert_domain_function_invariants): הגוף חייב לכלול approval_incomplete ואסור בו
--   'exception when others' — לכן הכשל הרך של הכללים חי ב-_start_quote_flows, לא כאן.
create or replace function public.approve_quotation(
  p_token text,
  p_signature text default null,
  p_signer_name text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  q         public.quotations%rowtype;
  v_req_id  text;
  v_token   text;
  v_needs   boolean := false;
  v_reused  boolean := false;
  v_eng     jsonb;
  v_rel     jsonb;
  v_eng_id  text;
  v_client  text;
begin
  -- ‼ for update — מסדר בתור שתי לחיצות מקבילות על אותו קישור.
  select * into q from public.quotations where public_token = p_token limit 1 for update;
  if q.id is null then return jsonb_build_object('status', 'invalid'); end if;

  if q.status = 'approved' then
    -- ניסיון חוזר, או לחיצה שנייה. לא מאשרים מחדש — משלימים את מה שחסר.
    v_reused := q.representation_request_id is not null;
    v_req_id := coalesce(q.representation_request_id, public.open_quotation_representation(q.id));
  elsif q.status = 'cancelled' then
    return jsonb_build_object('status', 'cancelled');
  elsif q.expires_at is not null and q.expires_at < now() then
    update public.quotations
       set status = 'expired',
           events = coalesce(events, '[]'::jsonb) || jsonb_build_object('type','expired','at', now())
     where id = q.id and status <> 'expired';
    return jsonb_build_object('status', 'expired');
  elsif q.status not in ('sent','viewed') then
    return jsonb_build_object('status', q.status);
  else
    update public.quotations
       set status = 'approved',
           approved_at = now(),
           approval_signature = coalesce(p_signature, approval_signature),
           approval_signer_name = coalesce(nullif(trim(p_signer_name), ''), approval_signer_name),
           events = coalesce(events, '[]'::jsonb) || jsonb_strip_nulls(jsonb_build_object(
             'type', 'approved',
             'at', now(),
             'note', case when nullif(trim(p_signer_name), '') is not null
                          then 'נחתם על ידי ' || trim(p_signer_name) end
           ))
     where id = q.id;

    v_req_id := public.open_quotation_representation(q.id);
    select (r.created_at < now() - interval '10 seconds') into v_reused
      from public.representation_requests r where r.id = v_req_id;
  end if;

  -- ‼ open_quotation_representation היא שיוצרת/מקשרת את כרטיס הלקוח ומעדכנת
  -- את quotations.client_id. העותק המקומי q נקרא לפניה ולכן מיושן — קוראים
  -- מחדש. בלי זה השחרור למטה היה מקבל client_id ריק על הצעה תקינה לחלוטין.
  select client_id into v_client from public.quotations where id = q.id;

  -- ── ההתקשרות, החיובים ומסלול הקליטה — חלק מהאישור, לא תופעת לוואי ────────
  -- ‼ הערך המוחזר נבדק. זה בדיוק מה שלא נעשה עד היום: הכשל הרך היה מחזיר
  -- {ok:false} ואיש לא הסתכל.
  v_eng := public.create_engagement_for_quotation(q.id, false);
  if coalesce(v_eng->>'ok', 'false') <> 'true' then
    raise exception 'approval_incomplete: engagement (%) עבור הצעה %',
      coalesce(v_eng->>'error', 'unknown'), coalesce(q.quotation_number, q.id)
      using errcode = 'data_exception';
  end if;

  -- ‼ בדיקת-על: הפונקציה טענה שיצרה התקשרות — מוודאים שהשורה באמת שם.
  -- chargesOnly (הצעת one_time על התקשרות קיימת) אינה יוצרת התקשרות, ולכן
  -- אינה נבדקת. זו ההבחנה שמונעת גם "false negative" וגם "false positive".
  v_eng_id := v_eng->>'engagementId';
  if v_eng_id is not null
     and not exists (select 1 from public.engagements e where e.id = v_eng_id) then
    raise exception 'approval_incomplete: engagement % נעלמה אחרי היצירה', v_eng_id
      using errcode = 'data_exception';
  end if;

  -- ── בקשות שהוחזקו עד האישור נפתחות עכשיו ─────────────────────────────────
  -- ‼ גם כאן הערך נבדק. בקשה שנשארה מוחזקת אחרי אישור היא בדיוק אותה סתירה:
  -- הלקוח אושר, והמשרד רואה בקשות שלא נפתחו לו.
  if v_client is not null then
    v_rel := public.release_requests_held_until_approval(v_client);
    if coalesce(v_rel->>'ok', 'false') <> 'true' then
      raise exception 'approval_incomplete: release (%) עבור לקוח %',
        coalesce(v_rel->>'error', 'unknown'), v_client
        using errcode = 'data_exception';
    end if;
  end if;

  -- 312 · שורת שירות שנושאת כלל פתיחה — הכלל נפתח עכשיו (פעם אחת לשורה; כשל נרשם ביומן).
  perform public._start_quote_flows(q.id);

  select r.onboarding_token, coalesce(r.onboarding_status, 'pending') = 'pending'
    into v_token, v_needs
    from public.representation_requests r where r.id = v_req_id;

  return jsonb_build_object(
    'status', 'approved',
    'onboardingToken', case when coalesce(v_needs, false) then v_token end,
    'repReused', coalesce(v_reused, false)
  );
end;
$function$;

comment on function public.approve_quotation(text, text, text) is
  'אישור הצעה מקישור ציבורי. גבול הצלחה אחד: ההצעה מסומנת "אושרה" רק אם נוצרו גם ההתקשרות, החיובים ומסלול הקליטה, והבקשות שהוחזקו נפתחו. כישלון בכל אחד מהם מגלגל את הכל אחורה ומחזיר שגיאה — ראה מיגרציה 161. אידמפוטנטית: לחיצה חוזרת משלימה את החסר ולא מכפילה.';

-- ‼ ההרשאה נשמרת בדיוק כפי שהייתה — הדף הציבורי חייב להריץ אותה.
-- (מיגרציה 160 מחזיקה את הרשימה הסגורה של מה שמותר ל-anon; approve_quotation בה.)
grant execute on function public.approve_quotation(text, text, text) to anon, authenticated;
