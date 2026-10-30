-- ════════════════════════════════════════════════════════════════════════════
-- 311 · «בקשות» — קבוצות של המשרד אצל לקוח (שלב 2)
-- ════════════════════════════════════════════════════════════════════════════
-- הדמיה שאושרה: docs/proposals/2026-10-29-requests-dots-v2.html
-- תוכנית: docs/plans/2026-10-29-work-tab-dots-groups-flows.md (שלב 2)
--
-- כל בקשה היא נקודה. מסמנים כמה נקודות ← «לחבר» ← שם ⇒ קבוצה. קבוצה יכולה להיות
-- בתוך קבוצה — גם פייפרלס או העברה מרו״ח קודם (builtin_key). הייצוג נשאר קבוצה
-- עצמאית (מרכז הייצוג מנהל אותו).
--
-- ‼ קבוצה לא שומרת סדר משלה: מקומה הוא המקום של הבקשה הראשונה שבה (sort_order),
--   וגרירה (set_onboarding_steps_order, 310) מזיזה את הבקשות עצמן — אותו סדר בדף הלקוח.
-- ‼ «מחכה לקודמת»: בתוך קבוצה, בקשה שעוד נעולה מחכה לבקשה שלפניה (קשת origin='group'
--   ב-onboarding_step_dependencies, ו-unlock_dependent_steps הקיימת פותחת). מה שכבר רץ —
--   לא נעצר. קבוצה פנימית רצה במקביל: לא מחכה ולא מעכבת.
-- ‼ ספריית הבקשות וכללי הפתיחה לא משתנים בשלב הזה: הקבוצה חיה אצל הלקוח בלבד.
--   שמירה כמסלול — שלב 3. הדף של הלקוח לא מציג קבוצות של המשרד; רק את הסדר.
-- ════════════════════════════════════════════════════════════════════════════

create table if not exists public.client_work_groups (
  id              text primary key default replace(gen_random_uuid()::text, '-', ''),
  user_id         uuid not null references auth.users(id) on delete cascade,
  client_id       text not null references public.clients(id) on delete cascade,
  parent_group_id text references public.client_work_groups(id) on delete cascade,
  name            text not null check (length(btrim(name)) between 1 and 80),
  -- קבוצה קבועה של המערכת שנכנסה לתוך קבוצה של המשרד (בקשותיה לפי step_type).
  builtin_key     text check (builtin_key in ('paperless', 'prevAccountant')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists client_work_groups_client_idx on public.client_work_groups (client_id);
create unique index if not exists client_work_groups_one_builtin
  on public.client_work_groups (client_id, builtin_key) where builtin_key is not null;

alter table public.onboarding_steps
  add column if not exists work_group_id text references public.client_work_groups(id) on delete set null;
create index if not exists onboarding_steps_work_group_idx
  on public.onboarding_steps (work_group_id) where work_group_id is not null;

alter table public.client_work_groups enable row level security;
drop policy if exists work_groups_own on public.client_work_groups;
create policy work_groups_own on public.client_work_groups for select to authenticated
  using (user_id = auth.uid());
drop policy if exists require_authorized on public.client_work_groups;
create policy require_authorized on public.client_work_groups as restrictive for all to authenticated
  using (public.is_authorized());
revoke all on public.client_work_groups from anon;
revoke insert, update, delete, truncate, references, trigger on public.client_work_groups from authenticated;
grant select on public.client_work_groups to authenticated;

-- ── מה נכנס לקבוצה קבועה (אותה רשימה כמו REQUEST_GROUPS ב-requestGroups.ts) ─────
create or replace function public._work_group_builtin_types(p_key text)
returns text[]
language sql
immutable
as $function$
  select case p_key
    when 'paperless' then array['paperless_invite', 'business_details', 'paperless_connection',
                                'retainer_authorization', 'paperless_tax_authority']
    when 'prevAccountant' then array['prev_accountant_details', 'release_letter', 'materials_received']
    else array[]::text[] end;
$function$;

-- ── «מחכה לקודמת» בתוך קבוצה ───────────────────────────────────────────────
-- ‼ רק בקשות ישירות של הקבוצה, לפי sort_order. קשת נבנית רק לבקשה שעוד נעולה —
--   בקשה פתוחה לא ננעלת בגלל חיבור. כשהקודמת כבר הושלמה — פותחים מיד.
create or replace function public._work_group_rebuild_edges(p_group_id text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  r      record;
  v_prev public.onboarding_steps%rowtype;
begin
  delete from public.onboarding_step_dependencies d
   using public.onboarding_steps s
   where d.step_id = s.id and s.work_group_id = p_group_id and d.origin = 'group';

  for r in
    select * from public.onboarding_steps
     where work_group_id = p_group_id and status <> 'cancelled'
     order by coalesce(sort_order, 0), created_at
  loop
    if v_prev.id is not null and r.status = 'locked' then
      insert into public.onboarding_step_dependencies (step_id, depends_on_step_id, user_id, origin)
      values (r.id, v_prev.id, r.user_id, 'group')
      on conflict (step_id, depends_on_step_id) do nothing;
      if v_prev.status in ('completed', 'verified', 'skipped') then
        perform public.unlock_dependent_steps(v_prev.id);
      end if;
    end if;
    select * into v_prev from public.onboarding_steps where id = r.id;
  end loop;
end;
$function$;

-- ── «לחבר» ─────────────────────────────────────────────────────────────────
-- p_members: [{kind:'step', id} | {kind:'group', id} | {kind:'builtin', key}], בסדר הסימון.
-- ‼ כל הנקודות מאותה רמה (אותו הורה) — הקבוצה החדשה נכנסת במקומן.
create or replace function public.create_work_group(p_client_id text, p_name text, p_members jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  c        public.clients%rowtype;
  v_uid    uuid := auth.uid();
  v_name   text := btrim(coalesce(p_name, ''));
  m        jsonb;
  v_parent text;
  v_first  boolean := true;
  v_this   text;
  v_new    text;
  v_steps  text[] := '{}';
  v_groups text[] := '{}';
  v_bid    text;
  v_types  text[];
begin
  select * into c from public.clients where id = p_client_id;
  if c.id is null then return jsonb_build_object('ok', false, 'error', 'client_not_found'); end if;
  if v_uid is null or c.user_id <> v_uid then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;
  if length(v_name) not between 1 and 80 then return jsonb_build_object('ok', false, 'error', 'name_required'); end if;
  if jsonb_typeof(p_members) is distinct from 'array' or jsonb_array_length(p_members) < 2 then
    return jsonb_build_object('ok', false, 'error', 'need_two');
  end if;

  for m in select * from jsonb_array_elements(p_members) loop
    if m->>'kind' = 'step' then
      select work_group_id into v_this from public.onboarding_steps
       where id = m->>'id' and client_id = c.id and status <> 'cancelled';
      if not found then return jsonb_build_object('ok', false, 'error', 'step_not_found'); end if;
      v_steps := v_steps || (m->>'id');
    elsif m->>'kind' = 'group' then
      select parent_group_id into v_this from public.client_work_groups
       where id = m->>'id' and client_id = c.id;
      if not found then return jsonb_build_object('ok', false, 'error', 'group_not_found'); end if;
      v_groups := v_groups || (m->>'id');
    elsif m->>'kind' = 'builtin' and m->>'key' in ('paperless', 'prevAccountant') then
      v_types := public._work_group_builtin_types(m->>'key');
      if not exists (select 1 from public.onboarding_steps
                      where client_id = c.id and step_type = any(v_types) and status <> 'cancelled') then
        return jsonb_build_object('ok', false, 'error', 'group_not_found');
      end if;
      select id, parent_group_id into v_bid, v_this from public.client_work_groups
       where client_id = c.id and builtin_key = m->>'key';
      if v_bid is null then
        insert into public.client_work_groups (user_id, client_id, name, builtin_key)
        values (c.user_id, c.id, case m->>'key' when 'paperless' then 'פייפרלס' else 'העברת טיפול מרו״ח קודם' end, m->>'key')
        returning id into v_bid;
        v_this := null;
        update public.onboarding_steps set work_group_id = v_bid
         where client_id = c.id and step_type = any(v_types) and status <> 'cancelled';
      end if;
      v_groups := v_groups || v_bid;
      v_bid := null;
    else
      return jsonb_build_object('ok', false, 'error', 'bad_member');
    end if;
    if v_first then v_parent := v_this; v_first := false;
    elsif v_parent is distinct from v_this then
      return jsonb_build_object('ok', false, 'error', 'mixed_levels');
    end if;
  end loop;

  -- בתוך קבוצה קבועה (פייפרלס, רו״ח קודם) הסדר שלה הוא של המערכת — לא מקבצים שם.
  if v_parent is not null and exists (select 1 from public.client_work_groups
                                        where id = v_parent and builtin_key is not null) then
    return jsonb_build_object('ok', false, 'error', 'inside_builtin');
  end if;

  insert into public.client_work_groups (user_id, client_id, parent_group_id, name)
  values (c.user_id, c.id, v_parent, v_name)
  returning id into v_new;

  update public.onboarding_steps set work_group_id = v_new where id = any(v_steps) and client_id = c.id;
  update public.client_work_groups set parent_group_id = v_new, updated_at = now()
   where id = any(v_groups) and client_id = c.id;

  perform public._work_group_rebuild_edges(v_new);
  if v_parent is not null then perform public._work_group_rebuild_edges(v_parent); end if;

  return jsonb_build_object('ok', true, 'groupId', v_new);
end;
$function$;

-- ── שינוי שם ────────────────────────────────────────────────────────────────
create or replace function public.rename_work_group(p_group_id text, p_name text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_name text := btrim(coalesce(p_name, ''));
  v_n    int;
begin
  if auth.uid() is null then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;
  if length(v_name) not between 1 and 80 then return jsonb_build_object('ok', false, 'error', 'name_required'); end if;
  update public.client_work_groups set name = v_name, updated_at = now()
   where id = p_group_id and user_id = auth.uid() and builtin_key is null;
  get diagnostics v_n = row_count;
  return case when v_n = 1 then jsonb_build_object('ok', true)
              else jsonb_build_object('ok', false, 'error', 'group_not_found') end;
end;
$function$;

-- ── פירוק ───────────────────────────────────────────────────────────────────
-- הבקשות והקבוצות שבפנים עולות רמה אחת. קבוצה קבועה שמפרקים — חוזרת להיות קבוצה רגילה
-- של המערכת (הבקשות שלה בלי work_group_id).
create or replace function public.dissolve_work_group(p_group_id text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  g public.client_work_groups%rowtype;
begin
  select * into g from public.client_work_groups where id = p_group_id;
  if g.id is null or auth.uid() is null or g.user_id <> auth.uid() then
    return jsonb_build_object('ok', false, 'error', 'group_not_found');
  end if;

  delete from public.onboarding_step_dependencies d
   using public.onboarding_steps s
   where d.step_id = s.id and s.work_group_id = g.id and d.origin = 'group';
  update public.onboarding_steps set work_group_id = case when g.builtin_key is null then g.parent_group_id end
   where work_group_id = g.id;
  update public.client_work_groups set parent_group_id = g.parent_group_id, updated_at = now()
   where parent_group_id = g.id;
  delete from public.client_work_groups where id = g.id;

  if g.parent_group_id is not null then perform public._work_group_rebuild_edges(g.parent_group_id); end if;
  return jsonb_build_object('ok', true);
end;
$function$;

-- ── בקשה חדשה של פייפרלס/רו״ח קודם אצל לקוח שהקבוצה הקבועה שלו כבר בתוך קבוצה ──
-- ‼ אחרת הבקשה החדשה (למשל «חיבור לרשות המסים» שנוספת אחר כך) הייתה צצה מחוץ לקבוצה.
create or replace function public._work_group_adopt_builtin()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if new.work_group_id is null then
    select id into new.work_group_id from public.client_work_groups
     where client_id = new.client_id and builtin_key is not null
       and new.step_type = any(public._work_group_builtin_types(builtin_key))
     limit 1;
  end if;
  return new;
end;
$function$;

drop trigger if exists onboarding_steps_work_group_adopt on public.onboarding_steps;
create trigger onboarding_steps_work_group_adopt
  before insert on public.onboarding_steps
  for each row execute function public._work_group_adopt_builtin();

revoke all on function public._work_group_builtin_types(text) from public, anon;
revoke all on function public._work_group_rebuild_edges(text) from public, anon, authenticated;
revoke all on function public._work_group_adopt_builtin() from public, anon, authenticated;
revoke all on function public.create_work_group(text, text, jsonb) from public, anon;
revoke all on function public.rename_work_group(text, text) from public, anon;
revoke all on function public.dissolve_work_group(text) from public, anon;
grant execute on function public._work_group_builtin_types(text) to authenticated, service_role;
grant execute on function public.create_work_group(text, text, jsonb) to authenticated;
grant execute on function public.rename_work_group(text, text) to authenticated;
grant execute on function public.dissolve_work_group(text) to authenticated;
