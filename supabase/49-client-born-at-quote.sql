-- 49 — הכרטיס והדף האישי נולדים בשליחת ההצעה
-- ראה docs/PLAN-unified-lifecycle.md שלב א'.
--
-- שלושה דברים:
--   א. כלל אחד לגזירת שלב החיים (derive_lifecycle_stage) שגם הריצה היומית וגם
--      הרענון הנקודתי קוראים לו — כדי שלא ייווצר סחף בין שני נוסחים.
--   ב. רענון בזמן אמת דרך טריגרים. עד היום השלב התעדכן רק ב-05:15 בלילה, כלומר
--      רו"ח ששלח הצעה ראה את האדם זז רק למחרת. במשפך זו סתירה גלויה.
--   ג. ensure_client_for_quotation — יצירת הכרטיס והטוקן הקבוע ברגע השליחה,
--      עם דדופליקציה לפי אימייל וטלפון כדי שאותו אדם לא יקבל כרטיס שני.

-- ─────────────────────────── א. כלל אחד לגזירת השלב ───────────────────────────
create or replace function public.derive_lifecycle_stage(p_client_id text)
returns text
language sql
stable
security definer
set search_path to 'public'
as $$
  select case
    when c.lifecycle_stage = 'archived' then 'archived'
    when exists (select 1 from public.engagements e
                  where e.client_id = c.id and e.status = 'onboarding') then 'onboarding'
    when exists (select 1 from public.engagements e
                  where e.client_id = c.id and e.status in ('active','ended')) then 'active'
    when coalesce(c.representation_status, '') = 'active' then 'active'
    when exists (select 1 from public.quotations q
                  where q.client_id = c.id and q.status = 'approved') then 'onboarding'
    when exists (select 1 from public.quotations q
                  join public.leads l on l.id = q.lead_id
                  where l.converted_client_id = c.id and q.status in ('sent','viewed')) then 'quoted'
    when exists (select 1 from public.quotations q
                  where q.client_id = c.id and q.status in ('sent','viewed')) then 'quoted'
    -- כרטיס שנולד מליד ואין לו עדיין שום הצעה חוזר לשלב ליד ולא נעלם
    when c.merged_from_lead_id is not null then 'lead'
    else c.lifecycle_stage
  end
  from public.clients c where c.id = p_client_id;
$$;

create or replace function public.refresh_lifecycle_stage_for(p_client_id text)
returns text
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_stage text;
begin
  if p_client_id is null then return null; end if;
  v_stage := public.derive_lifecycle_stage(p_client_id);
  if v_stage is null then return null; end if;
  update public.clients set lifecycle_stage = v_stage
    where id = p_client_id and lifecycle_stage is distinct from v_stage;
  return v_stage;
end;
$$;

create or replace function public.refresh_lifecycle_stages()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_changed int := 0;
begin
  update public.clients c
    set lifecycle_stage = d.stage
    from (select c2.id, public.derive_lifecycle_stage(c2.id) as stage from public.clients c2) d
    where d.id = c.id and d.stage is not null and c.lifecycle_stage is distinct from d.stage;
  get diagnostics v_changed = row_count;
  return jsonb_build_object('ok', true, 'updated', v_changed);
end;
$$;

-- ──────────────────────── ב. רענון בזמן אמת דרך טריגרים ────────────────────────
create or replace function public.tg_touch_lifecycle_stage()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if tg_table_name = 'quotations' then
    perform public.refresh_lifecycle_stage_for(new.client_id);
    if tg_op = 'UPDATE' and old.client_id is distinct from new.client_id then
      perform public.refresh_lifecycle_stage_for(old.client_id);
    end if;
    if new.lead_id is not null then
      perform public.refresh_lifecycle_stage_for(l.converted_client_id)
        from public.leads l
        where l.id = new.lead_id and l.converted_client_id is not null;
    end if;
  elsif tg_table_name = 'engagements' then
    perform public.refresh_lifecycle_stage_for(new.client_id);
  end if;
  return null;
end;
$$;

drop trigger if exists trg_quotations_lifecycle on public.quotations;
create trigger trg_quotations_lifecycle
  after insert or update of status, client_id, lead_id on public.quotations
  for each row execute function public.tg_touch_lifecycle_stage();

drop trigger if exists trg_engagements_lifecycle on public.engagements;
create trigger trg_engagements_lifecycle
  after insert or update of status, client_id on public.engagements
  for each row execute function public.tg_touch_lifecycle_stage();

-- ─────────────── ג. לידת הכרטיס והטוקן הקבוע ברגע שליחת ההצעה ───────────────
create or replace function public.ensure_client_for_quotation(p_quotation_id text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  q           public.quotations%rowtype;
  l           public.leads%rowtype;
  v_client_id text;
  v_created   boolean := false;
  v_token     text;
  v_name      text;
  v_first     text;
  v_last      text;
  v_email     text;
  v_phone     text;
  v_digits    text;
begin
  select * into q from public.quotations where id = p_quotation_id limit 1;
  if q.id is null then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if auth.uid() is null or q.user_id <> auth.uid() then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;

  v_client_id := q.client_id;
  if q.lead_id is not null then
    select * into l from public.leads where id = q.lead_id;
    if v_client_id is null then v_client_id := l.converted_client_id; end if;
  end if;

  v_name  := coalesce(nullif(trim(coalesce(l.full_name, '')), ''),
                      nullif(trim(coalesce(q.snapshot->>'recipientName', '')), ''));
  v_email := coalesce(nullif(trim(coalesce(l.email, '')), ''),
                      nullif(trim(coalesce(q.snapshot->>'recipientEmail', '')), ''));
  v_phone := nullif(trim(coalesce(l.phone, '')), '');
  v_digits := nullif(regexp_replace(coalesce(v_phone, ''), '\D', '', 'g'), '');

  -- דדופליקציה לפני יצירה — אותה לוגיקה שמשמשת את merge_leads_into_people,
  -- כדי ששני המסלולים לא יגיעו למסקנות שונות על אותו אדם.
  if v_client_id is null and v_email is not null then
    select c.id into v_client_id from public.clients c
      where c.user_id = q.user_id
        and lower(trim(coalesce(c.email, ''))) = lower(v_email)
      order by c.created_at limit 1;
  end if;
  if v_client_id is null and v_digits is not null then
    select c.id into v_client_id from public.clients c
      where c.user_id = q.user_id
        and regexp_replace(coalesce(c.phone, ''), '\D', '', 'g') = v_digits
      order by c.created_at limit 1;
  end if;
  if v_client_id is not null
     and not exists (select 1 from public.clients where id = v_client_id) then
    v_client_id := null;
  end if;

  if v_client_id is null then
    v_first := split_part(trim(coalesce(v_name, 'ליד')), ' ', 1);
    v_last  := nullif(trim(substr(trim(coalesce(v_name, '')),
                 length(split_part(trim(coalesce(v_name, '')), ' ', 1)) + 1)), '');
    v_client_id := replace(gen_random_uuid()::text, '-', '');
    insert into public.clients (
      id, user_id, first_name, last_name, email, phone,
      -- ‼ representation_status ברירת המחדל בעמודה היא 'active' (נכונה ללקוח
      -- שהרו"ח מקים ידנית). למי שרק קיבל הצעה אין עדיין ייצוג, ו-NULL מונע
      -- גם שלב חיים שגוי וגם תג "מיוצג פעיל" במסך הלקוחות.
      lifecycle_stage, representation_status, merged_from_lead_id, business_name, notes
    ) values (
      v_client_id, q.user_id, v_first, v_last, v_email, v_phone,
      'quoted', null, q.lead_id, nullif(trim(coalesce(l.business_name, '')), ''),
      'נוצר עם שליחת הצעת מחיר ' || q.quotation_number || '.'
    );
    v_created := true;
  else
    update public.clients c
      set merged_from_lead_id = coalesce(c.merged_from_lead_id, q.lead_id),
          email      = coalesce(nullif(trim(coalesce(c.email, '')), ''), v_email),
          phone      = coalesce(nullif(trim(coalesce(c.phone, '')), ''), v_phone),
          updated_at = now()
      where c.id = v_client_id;
  end if;

  if q.lead_id is not null then
    update public.leads
      set converted_client_id = coalesce(converted_client_id, v_client_id),
          updated_at = now()
      where id = q.lead_id;
  end if;

  if q.client_id is distinct from v_client_id then
    update public.quotations
      set client_id = v_client_id,
          events = coalesce(events, '[]'::jsonb) || jsonb_build_object(
            'type', case when v_created then 'client_precreated' else 'client_linked' end,
            'at', now()),
          updated_at = now()
      where id = q.id;
  end if;

  -- הקישור הקבוע נטבע כאן, ולכן כל מייל בהמשך יכול לשאת אותו בלי לטבוע בעצמו
  select portal_token into v_token from public.clients where id = v_client_id;
  if v_token is null then
    v_token := replace(gen_random_uuid()::text, '-', '');
    update public.clients set portal_token = v_token
      where id = v_client_id and portal_token is null;
    select portal_token into v_token from public.clients where id = v_client_id;
  end if;

  perform public.copy_lead_facts_to_client(q.id);
  perform public.refresh_lifecycle_stage_for(v_client_id);

  return jsonb_build_object('ok', true, 'clientId', v_client_id,
                            'portalToken', v_token, 'created', v_created);
end;
$$;

grant execute on function public.ensure_client_for_quotation(text) to authenticated;
grant execute on function public.refresh_lifecycle_stage_for(text) to authenticated;
