-- ════════════════════════════════════════════════════════════════════════════
-- 285 · יישוב ורחוב מרשימה סגורה + «יישוב מזכה» שנקבע לבד מהכתובת (21.10.2026)
--
-- למה: הלקוח כתב עיר בטקסט חופשי, ו«יישוב מזכה» נקבע רק בלחיצה ידנית במשרד
-- (תיבת «סנכרן מהעיר» שהופיעה מסומנת ולא רצה). לקוחה בשדרות לא קיבלה זיכוי
-- ואף אחד לא ידע. מעכשיו:
--   ① רשימות רשמיות במסד — יישובים ורחובות של רשות האוכלוסין (data.gov.il),
--      נטענות ב-scripts/load-il-address-lists.mjs; היישובים המזכים לכל שנת מס —
--      285-eligible-localities-seed.sql, שנוצר מ-src/data/eligibleSettlementCodes.ts.
--   ② כל כותב של הכרטיס (טופס הקליטה, ייפוי הכוח, המשרד, השאלון השנתי, ספח
--      ת.ז.) ממשיך לכתוב city + address כטקסט. הטריגר כאן מזהה מהם את סמל
--      היישוב, את הרחוב, מספר הבית והדירה — מקום אחד, בלי לשנות אף RPC.
--   ③ qualifying_settlement_id נגזר מסמל היישוב כל עוד המשרד לא קבע ידנית
--      (qualifying_settlement_override). קביעה ידנית בתיק המס (_tax_fact_field_op)
--      מסמנת override; «חזרה לפי הכתובת» = override=false.
--
-- ‼ הכתובת עצמה (address) לא נכתבת מחדש — רק מפורקת לחלקים. הטופס החדש בונה
--   אותה בפורמט אחד: «<רחוב> <מספר>[, דירה <דירה>]» (src/utils/ilAddress.ts).
-- ════════════════════════════════════════════════════════════════════════════

-- ── ① רשימות ─────────────────────────────────────────────────────────────────
create table if not exists public.il_localities (
  code        integer primary key,
  name        text not null,
  -- לא שייך למועצה אזורית (עירייה / מועצה מקומית) — לסדר ההצעות בחיפוש
  municipal   boolean not null default false,
  -- false ⇒ ברשימה הרשמית רק «רחוב» אחד בשם היישוב (סמל 9000): קיבוץ, מושב
  has_streets boolean not null default true,
  loaded_at   timestamptz not null default now()
);

create table if not exists public.il_streets (
  locality_code integer not null references public.il_localities(code) on delete cascade,
  code          integer not null,
  name          text not null,
  -- הטעינה מסמנת כל שורה שראתה; מה שלא סומן — הוסר מהרשימה הרשמית
  loaded_at     timestamptz not null default now(),
  primary key (locality_code, code)
);

create table if not exists public.tax_eligible_localities (
  tax_year        integer not null,
  locality_code   integer not null,
  -- השם בדיוק כמו ב-src/data/eligibleSettlements.ts — זה הערך של qualifying_settlement_id
  settlement_name text not null,
  primary key (tax_year, locality_code)
);

-- נתונים ממשלתיים פומביים: קריאה לכולם (גם לדף הקליטה של הלקוח), כתיבה רק לשרת.
alter table public.il_localities enable row level security;
alter table public.il_streets enable row level security;
alter table public.tax_eligible_localities enable row level security;
drop policy if exists il_localities_read on public.il_localities;
drop policy if exists il_streets_read on public.il_streets;
drop policy if exists tax_eligible_localities_read on public.tax_eligible_localities;
create policy il_localities_read on public.il_localities for select to anon, authenticated using (true);
create policy il_streets_read on public.il_streets for select to anon, authenticated using (true);
create policy tax_eligible_localities_read on public.tax_eligible_localities for select to anon, authenticated using (true);
revoke all on public.il_localities, public.il_streets, public.tax_eligible_localities from anon, authenticated;
grant select on public.il_localities, public.il_streets, public.tax_eligible_localities to anon, authenticated;

-- ── השוואת שמות: אותו כלל כמו normIl ב-src/utils/ilAddress.ts ──────────────────
-- «קריית שמונה» = «קרית שמונה», «ג'וליס» = «גוליס», «אל־רום» = «אל רום».
create or replace function public.il_norm(p text)
returns text
language sql
immutable
parallel safe
set search_path to 'pg_catalog'
as $function$
  select nullif(btrim(regexp_replace(
           replace(replace(
             regexp_replace(regexp_replace(coalesce(p, ''), '["''׳״`]', '', 'g'), '[()־–-]', ' ', 'g'),
           'יי', 'י'), 'וו', 'ו'),
         '\s+', ' ', 'g')), '');
$function$;

create index if not exists il_localities_norm_idx on public.il_localities (public.il_norm(name));
create index if not exists il_streets_norm_idx on public.il_streets (locality_code, public.il_norm(name));

-- שמות שאנשים כותבים ואינם השם הרשמי. רשימה ידנית וקצרה — רק כשהמשמעות חד-משמעית.
create table if not exists public.il_locality_aliases (
  alias         text primary key,
  locality_code integer not null
);
alter table public.il_locality_aliases enable row level security;
revoke all on public.il_locality_aliases from anon, authenticated;
insert into public.il_locality_aliases (alias, locality_code) values
  ('תל אביב', 5000), ('תל אביב יפו', 5000), ('יפו', 5000),
  ('מודיעין', 1200), ('מודיעין מכבים רעות', 1200),
  ('נצרת עילית', 1061),
  ('עפרה', 3617)
on conflict (alias) do update set locality_code = excluded.locality_code;

-- ── למסך: רשימה אחת, בלי מגבלת 1,000 השורות של PostgREST ─────────────────────
create or replace function public.il_localities_list()
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $function$
  select coalesce(jsonb_agg(jsonb_build_array(code, name, municipal, has_streets) order by name), '[]'::jsonb)
    from public.il_localities;
$function$;

create or replace function public.il_streets_for(p_locality_code integer)
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $function$
  select coalesce(jsonb_agg(jsonb_build_array(code, name) order by name), '[]'::jsonb)
    from public.il_streets
   where locality_code = p_locality_code;
$function$;

revoke all on function public.il_localities_list() from public;
revoke all on function public.il_streets_for(integer) from public;
grant execute on function public.il_localities_list() to anon, authenticated;
grant execute on function public.il_streets_for(integer) to anon, authenticated;

-- ── זיהוי: יישוב מטקסט, חלקי כתובת מטקסט ─────────────────────────────────────
-- ‼ רק התאמה ודאית (שם יחיד אחרי נרמול). אין ניחוש לפי דמיון.
create or replace function public._il_locality_code(p_city text)
returns integer
language sql
stable
set search_path to 'public'
as $function$
  select coalesce(
    (select case when count(*) = 1 then min(code) end
       from public.il_localities
      where public.il_norm(name) = public.il_norm(p_city)),
    (select a.locality_code from public.il_locality_aliases a
      where public.il_norm(a.alias) = public.il_norm(p_city)));
$function$;

create or replace function public._il_street_code(p_locality_code integer, p_street text)
returns integer
language sql
stable
set search_path to 'public'
as $function$
  select case when count(*) = 1 then min(code) end
    from public.il_streets
   where locality_code = p_locality_code
     and public.il_norm(name) = public.il_norm(p_street);
$function$;

-- «הרצל 10, דירה 3» / «רחוב הרצל 10/3» / «דרך 4 12» / «בארי» ⇒ רחוב, מספר, דירה.
-- street_code רק כשהרחוב נמצא ברשימת היישוב; אחרת street_name הוא הטקסט שנכתב.
create or replace function public._il_address_parts(p_locality_code integer, p_address text,
  out street_code integer, out street_name text, out house_number text, out apartment text)
language plpgsql
stable
set search_path to 'public'
as $function$
declare
  s text := btrim(coalesce(p_address, ''));
  m text[];
begin
  if s = '' then return; end if;

  -- ‼ «ד» רק עם גרש/נקודה — אחרת «דוד 3» היה נקרא «דו», דירה 3
  m := regexp_match(s, '^(.*?\S)\s*(?:,\s*|\s+)(?:דירה|ד[''׳.])\s*(\d+[א-ת]?)$');
  if m is not null then apartment := m[2]; s := btrim(m[1], ' ,'); end if;
  m := regexp_match(s, '^(.*\S)\s+(\d+[א-ת]?)\s*/\s*(\d+)$');
  if m is not null and apartment is null then s := m[1] || ' ' || m[2]; apartment := m[3]; end if;
  s := regexp_replace(s, '^(רחוב|רח[''׳.])\s+', '');

  -- קודם הטקסט כולו (רחוב שבשמו מספר: «דרך 4»), ואז רחוב + מספר בית
  if p_locality_code is not null then street_code := public._il_street_code(p_locality_code, s); end if;
  if street_code is null then
    m := regexp_match(s, '^(.*\S)\s+(\d+[א-ת]?)$');
    if m is not null then
      house_number := m[2];
      s := m[1];
      if p_locality_code is not null then street_code := public._il_street_code(p_locality_code, s); end if;
    end if;
  end if;

  if street_code is not null then
    select st.name into street_name from public.il_streets st
     where st.locality_code = p_locality_code and st.code = street_code;
  else
    street_name := nullif(s, '');
  end if;
end;
$function$;

-- ── ② עמודות בכרטיס — נגזרות בשרת, אף מסך לא כותב אותן ──────────────────────
alter table public.clients
  add column if not exists city_code integer,
  add column if not exists street_code integer,
  add column if not exists street_name text,
  add column if not exists house_number text,
  add column if not exists apartment text,
  -- למה המשרד קבע «יישוב מזכה» ידנית (למשל «עבר דירה ביוני»)
  add column if not exists qualifying_settlement_note text;

-- ── ③ הטריגר ─────────────────────────────────────────────────────────────────
create or replace function public.tg_client_address_canonical()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
declare
  v_name text;
  v_parts record;
  v_city_changed boolean := tg_op = 'INSERT'
    or new.city is distinct from old.city or new.city_code is distinct from old.city_code;
begin
  -- יישוב: סמל שנמסר גובר; אחרת מזהים מהטקסט. השם נשמר כשמו ברשימה הרשמית.
  if v_city_changed then
    if new.city_code is not null and (tg_op = 'INSERT' or new.city_code is distinct from old.city_code) then
      select name into v_name from public.il_localities where code = new.city_code;
      if v_name is null then new.city_code := public._il_locality_code(new.city);
      else new.city := v_name; end if;
    else
      new.city_code := public._il_locality_code(new.city);
      if new.city_code is not null then
        select name into new.city from public.il_localities where code = new.city_code;
      end if;
    end if;
  end if;

  -- כתובת: חלקים מתוך הטקסט, ביחס ליישוב
  if v_city_changed or new.address is distinct from old.address then
    select * into v_parts from public._il_address_parts(new.city_code, new.address);
    new.street_code  := v_parts.street_code;
    new.street_name  := v_parts.street_name;
    new.house_number := v_parts.house_number;
    new.apartment    := v_parts.apartment;
  end if;

  -- יישוב מזכה: כל עוד לא נקבע ידנית — לפי היישוב, בשנה האחרונה שבה הוא ברשימה.
  -- יישוב שלא זוהה (city_code ריק) — לא נוגעים בערך שכבר יש.
  if not coalesce(new.qualifying_settlement_override, false) and new.city_code is not null then
    new.qualifying_settlement_id := coalesce((
      select e.settlement_name from public.tax_eligible_localities e
       where e.locality_code = new.city_code
       order by e.tax_year desc limit 1), '');
    new.qualifying_settlement_note := null;
  end if;
  return new;
end;
$function$;

drop trigger if exists clients_address_canonical on public.clients;
create trigger clients_address_canonical
  before insert or update of city, address, city_code, qualifying_settlement_id, qualifying_settlement_override
  on public.clients
  for each row execute function public.tg_client_address_canonical();

-- ── ④ קביעה ידנית בתיק המס = override ───────────────────────────────────────
-- ‼ קודמוד ולא הדבקה: _tax_fact_field_op נבנה לאורך 91/153/241 (כ-33KB).
do $patch$
declare
  v_def text := pg_get_functiondef('public._tax_fact_field_op(text,text,boolean,jsonb,text)'::regprocedure);
  v_old text := 'update public.clients set qualifying_settlement_id = p_value #>> ''{}'', field_meta';
  v_new text := 'update public.clients set qualifying_settlement_id = p_value #>> ''{}'', qualifying_settlement_override = true, field_meta';
begin
  if position(v_new in v_def) > 0 then return; end if;
  if position(v_old in v_def) = 0 then
    raise exception '285: לא נמצא ענף qualifyingSettlementId ב-_tax_fact_field_op';
  end if;
  execute replace(v_def, v_old, v_new);
end;
$patch$;
