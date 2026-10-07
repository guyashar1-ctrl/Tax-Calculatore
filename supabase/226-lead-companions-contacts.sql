-- ═══════════════════════════════════════════════════════════════════════════
-- 226 · פגישות — מי עוד בפנייה, אנשי קשר עם תפקיד, וליד סגור שחוזר (07.10.2026)
--
-- המקור: גיא (07.10.2026), אחרי 225:
--   «הייתי רוצה שגם המייל השני יישמר, ובמידה וזה הבשיל — שתהיה לי האפשרות להפריד
--    ביניהם ולטפל בכל לקוח בנפרד.»
--   «אנשי קשר עם תפקידים — קובע פגישה עם רו״ח, שומר איפה הוא עובד, ובפעם הבאה
--    קובע איתו הרבה יותר מהר.»  ·  ליד סגור — נפתח מחדש בשיחת היכרות חדשה.
--   החלטות: אנשי הקשר — לשונית בתוך «לקוחות»; ברירת המחדל לאדם השני — «שותפים עסקיים».
-- התיעוד: docs/MEETINGS-GOOGLE-CALENDAR.md.
--
-- מה נוסף:
--   1. leads.companions — האנשים הנוספים באותה פנייה: [{ name, email, relation }].
--      relation: 'partner' (שותף/ה עסקי/ת, ברירת המחדל) · 'spouse' · 'other'.
--      leads.split_from_lead_id — ליד שהופרד מפנייה משותפת (מאיפה הוא בא).
--   2. split_lead_companion — «הפרד לליד נפרד»: אדם מהפנייה נעשה ליד משלו, באותה פעולה
--      שמוציאה אותו מהפנייה. לחיצה כפולה / שתי לשוניות ⇒ אותו ליד, לא שניים.
--   3. contacts — אנשי קשר שאינם לקוחות ואינם לידים (רו״ח אחר, עו״ד, יועץ פנסיוני…):
--      שם, תפקיד, איפה עובד/ת, מייל, טלפון. אחד לכל מייל אצל אותו רו״ח.
--   4. כשליד נעשה לקוח — האנשים הנוספים עוברים ל«אנשי קשר נוספים» בכרטיס, עם התפקיד.
--      ‼ לא נכתבים לשדות בן/בת הזוג: שינוי נתוני לקוח מציע ולא פועל לבד (CLAUDE.md §12.4),
--      ושם בן/בת הזוג מזין טריגרים של ייצוג. הרו״ח מעביר אותם לשם בעצמו כשצריך.
--   5. אינדקס על meetings.guests — «פגישות עם איש הקשר הזה» לפי מייל.
--
-- ‼ שום פונקציה קיימת לא מוגדרת מחדש. ההעברה בהמרה היא טריגר נפרד ומצטרף, שמגיב
--   לאותו מקור אמת של «הליד הומר» (clients.merged_from_lead_id, 168).
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1 · מי עוד בפנייה ────────────────────────────────────────────────────────
alter table public.leads
  add column if not exists companions jsonb not null default '[]'::jsonb;

alter table public.leads
  add column if not exists split_from_lead_id text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'leads_companions_array') then
    alter table public.leads add constraint leads_companions_array check (jsonb_typeof(companions) = 'array');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'leads_split_from_lead_id_fkey') then
    alter table public.leads add constraint leads_split_from_lead_id_fkey
      foreign key (split_from_lead_id) references public.leads(id) on delete set null;
  end if;
end $$;

-- ── 2 · «הפרד לליד נפרד» ─────────────────────────────────────────────────────
create or replace function public.split_lead_companion(p_lead_id text, p_email text, p_name text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid   uuid := auth.uid();
  v_email text := lower(btrim(coalesce(p_email, '')));
  l       public.leads%rowtype;
  v_comp  jsonb;
  v_name  text;
  v_id    text;
begin
  if v_uid is null or not public.is_authorized() then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;
  -- ‼ נעילת הפנייה: שתי לחיצות במקביל עוברות בתור, והשנייה מוצאת את הליד שהראשונה יצרה.
  select * into l from public.leads where id = p_lead_id and user_id = v_uid for update;
  if l.id is null then return jsonb_build_object('ok', false, 'error', 'lead_not_found'); end if;

  select c into v_comp from jsonb_array_elements(l.companions) c
   where lower(btrim(c->>'email')) = v_email limit 1;

  if v_comp is null then
    select id into v_id from public.leads
     where user_id = v_uid and split_from_lead_id = l.id and lower(btrim(email)) = v_email
     order by created_at limit 1;
    if v_id is not null then
      return jsonb_build_object('ok', true, 'leadId', v_id, 'already', true);
    end if;
    return jsonb_build_object('ok', false, 'error', 'companion_not_found');
  end if;

  -- כבר לקוח ⇒ לא יוצרים ליד; הרו״ח רואה את הכרטיס הקיים.
  select id into v_id from public.clients
   where user_id = v_uid and (lower(btrim(email)) = v_email or lower(btrim(spouse_email)) = v_email)
   limit 1;
  if v_id is not null then
    return jsonb_build_object('ok', false, 'error', 'is_client', 'clientId', v_id);
  end if;

  -- כבר ליד פתוח משלו (נפגשו גם בנפרד) ⇒ מוציאים מהפנייה ומפנים לליד הקיים.
  select id into v_id from public.leads
   where user_id = v_uid and id <> l.id and lower(btrim(email)) = v_email
     and converted_client_id is null and status <> 'closed'
   order by created_at desc limit 1;

  if v_id is null then
    v_name := coalesce(nullif(btrim(p_name), ''), nullif(btrim(v_comp->>'name'), ''));
    if v_name is null then return jsonb_build_object('ok', false, 'error', 'name_required'); end if;
    -- ‼ שותפים — אותו עסק ואותו מקור הפניה. סוג העוסק לא עובר: כל שותף נבדק בנפרד.
    insert into public.leads (user_id, full_name, email, status, source, business_name, referral_source, split_from_lead_id)
    values (v_uid, left(v_name, 120), v_email, 'new', 'accountant', l.business_name, l.referral_source, l.id)
    returning id into v_id;
  end if;

  update public.leads
     set companions = coalesce((select jsonb_agg(c) from jsonb_array_elements(l.companions) c
                                 where lower(btrim(c->>'email')) <> v_email), '[]'::jsonb)
   where id = l.id;

  return jsonb_build_object('ok', true, 'leadId', v_id);
end;
$$;

revoke all on function public.split_lead_companion(text, text, text) from public, anon;
grant execute on function public.split_lead_companion(text, text, text) to authenticated;

-- ── 3 · אנשי קשר ─────────────────────────────────────────────────────────────
create table if not exists public.contacts (
  id            text primary key default gen_random_uuid()::text,
  user_id       uuid not null references auth.users(id) on delete cascade,
  full_name     text not null check (length(btrim(full_name)) between 1 and 120),
  email         text,
  phone         text,
  -- טקסט חופשי עם הצעות במסך («רו״ח», «עו״ד»…) — כמו ClientContact.role בכרטיס.
  role          text,
  organization  text,
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists contacts_user_idx on public.contacts (user_id);
-- ‼ אדם אחד = רשומה אחת: אותו מייל לא נשמר פעמיים אצל אותו רו״ח (גם מהשרת וגם מהמסך).
create unique index if not exists contacts_user_email_uq
  on public.contacts (user_id, lower(btrim(email))) where email is not null and btrim(email) <> '';

drop trigger if exists contacts_set_updated_at on public.contacts;
create trigger contacts_set_updated_at before update on public.contacts
  for each row execute function public.set_updated_at();

alter table public.contacts enable row level security;

drop policy if exists contacts_select_own on public.contacts;
create policy contacts_select_own on public.contacts
  for select to authenticated using (auth.uid() = user_id);
drop policy if exists contacts_insert_own on public.contacts;
create policy contacts_insert_own on public.contacts
  for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists contacts_update_own on public.contacts;
create policy contacts_update_own on public.contacts
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists contacts_delete_own on public.contacts;
create policy contacts_delete_own on public.contacts
  for delete to authenticated using (auth.uid() = user_id);

drop policy if exists require_authorized on public.contacts;
create policy require_authorized on public.contacts
  as restrictive for all to authenticated
  using (public.is_authorized()) with check (public.is_authorized());

revoke all on public.contacts from anon;
grant select, insert, update, delete on public.contacts to authenticated;

-- ── 4 · ליד שנעשה לקוח — האנשים הנוספים עוברים לכרטיס ──────────────────────
create or replace function public.tg_carry_lead_companions()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_companions jsonb;
  v_list       jsonb;
  c            jsonb;
  v_email      text;
  v_name       text;
begin
  if new.merged_from_lead_id is null then return null; end if;
  if tg_op = 'UPDATE' and new.merged_from_lead_id is not distinct from old.merged_from_lead_id then return null; end if;

  select companions into v_companions from public.leads where id = new.merged_from_lead_id;
  if v_companions is null or jsonb_array_length(v_companions) = 0 then return null; end if;

  v_list := coalesce(new.additional_contacts, '[]'::jsonb);
  for c in select * from jsonb_array_elements(v_companions) loop
    v_email := lower(btrim(coalesce(c->>'email', '')));
    v_name  := btrim(coalesce(c->>'name', ''));
    continue when v_email = '';
    continue when v_email in (lower(btrim(coalesce(new.email, ''))), lower(btrim(coalesce(new.spouse_email, ''))));
    continue when exists (select 1 from jsonb_array_elements(v_list) x where lower(btrim(x->>'email')) = v_email);
    v_list := v_list || jsonb_build_array(jsonb_build_object(
      'id', gen_random_uuid()::text,
      -- ‼ אותם שמות כמו COMPANION_RELATION_LABELS ב-_shared/meetingCore.ts.
      'role', case c->>'relation' when 'spouse' then 'בן/בת זוג' when 'other' then 'אחר/ת' else 'שותף/ה עסקי/ת' end,
      'name', case when v_name = '' then v_email else v_name end,
      'email', v_email));
  end loop;

  update public.clients set additional_contacts = v_list
   where id = new.id and additional_contacts is distinct from v_list;
  return null;
end;
$$;

revoke all on function public.tg_carry_lead_companions() from public, anon, authenticated;

drop trigger if exists carry_lead_companions on public.clients;
create trigger carry_lead_companions
  after insert or update of merged_from_lead_id on public.clients
  for each row execute function public.tg_carry_lead_companions();

-- ── 5 · «פגישות עם איש הקשר» לפי מייל ───────────────────────────────────────
create index if not exists meetings_guests_idx on public.meetings using gin (guests jsonb_path_ops);
