-- ─── 135 · ברירת המחדל של הבקשות, בשליטת המשרד ──────────────────────────────
--
-- עד היום מסע הלקוח נגזר כולו מקוד: `generate_onboarding_steps` מחזיקה את
-- התנאים, את הסדר, את רשימות המסמכים ואת הנוסחים. המשרד לא יכול היה לכבות
-- בקשה, לשנות סדר או לערוך את מה שמבקשים - רק לתקן בדיעבד אצל כל לקוח.
--
-- הקובץ הזה מוסיף את שכבת הנתונים. הוא **אינו** נוגע במחולל (136 עושה זאת),
-- ולכן החלה שלו לבדה אינה משנה שום התנהגות קיימת.
--
-- ═══ המודל ═══
--
-- 1. `office_journey_defaults` — שורה אחת ל(משרד × סוג לקוח). זו ברירת המחדל
--    החיה, זו שהמשרד עורך. **לא** הרחבה של `journey_templates`: לתבנית יש
--    ספרייה, שם וכפילויות; לברירת מחדל יש בדיוק מופע אחד לכל צירוף, ומחזור
--    חיים אחר לגמרי (היא נצרכת אוטומטית ולא מוחלת ידנית).
--
-- 2. `engagements.journey_default_snapshot` — **צילום**. ברגע שההתקשרות
--    נולדת, ברירת המחדל האפקטיבית מועתקת אליה. כל הרצה חוזרת של המחולל
--    קוראת מהצילום ולא מהחי, ולכן עריכה עתידית של ברירת המחדל אינה נוגעת
--    בלקוח שכבר בתהליך. זו הכרעת גיא 2026-08-25, והיא הסיבה שהעמודה קיימת.
--
-- 3. `engagements.journey_default_facts` — העובדות שנפסקו באותו רגע. הרצה
--    חוזרת חייבת להיות דטרמיניסטית גם אם הכרטיס השתנה מאז.
--
-- ═══ מבנה הרשומה ב-`entries` ═══
--
--   {
--     "key":              "client_documents",   // מזהה יציב בתוך ברירת המחדל
--     "stepType":         "client_documents",
--     "enabled":          true,
--     "sortIndex":        10,                   // המקום השמור במסלול
--     "source":           "system" | "office",
--     "requiredForClose": null,                 // null ⇒ המערכת מחליטה
--     "dueInDays":        null,
--     "dependsOn":        "paperless_invite",   // מידע לתצוגה; האכיפה בשרת
--     "variants": [                             // התאמה ראשונה מנצחת
--       { "key":"new_business", "fact":"new_business",
--         "items":[{"key":"vat_cert","label":"תעודת עוסק"}], "copy":{...} },
--       { "key":"default",      "fact":null, "items":[...], "copy":{...} }
--     ]
--   }
--
-- ‼ הענף האחרון חייב להיות `fact = null` — הוא הנופל־אחורה. פונקציית
--   הבחירה מסתמכת על כך ולא מנחשת.
--
-- ‼ העובדות הן אוצר מילים סגור. שבע, בדיוק אלה שהמחולל יודע לשאול:
--   monthly · paperless · licensed · rep · has_prev · new_business · no_prev_email
--   אין ניסוח חופשי ואין IF/THEN, ולכן אין דרך להגדיר תנאי שהשרת לא יידע להעריך.
--
-- ═══ מה **לא** נכנס לכאן (סיווג C במלאי) ═══
--   representation · rep_client_approval · kyc_identification · internal_setup ·
--   first_month_review · file_opening · opening_call · data_import ·
--   data_verification · representation_upgrade · institution_alignment_*
-- אלה מכונות מצב ועבודה פנימית. הן אינן בקשות שמנהלים, ולכן אינן ניתנות
-- לכיבוי מהמסך ואינן מופיעות ב-entries.

-- ── 1 · הטבלה ────────────────────────────────────────────────────────────────

create table if not exists public.office_journey_defaults (
  id          text primary key default replace(gen_random_uuid()::text, '-', ''),
  office_id   uuid not null,
  client_kind text not null,
  entries     jsonb not null default '[]'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint office_journey_defaults_kind_chk
    check (client_kind in ('exempt_dealer','licensed_dealer','company','tax_refund','representation_only')),
  constraint office_journey_defaults_entries_chk
    check (jsonb_typeof(entries) = 'array'),
  unique (office_id, client_kind)
);

comment on table public.office_journey_defaults is
  'ברירת המחדל של מסע הבקשות לכל (משרד × סוג לקוח). נצרכת על ידי המחולל דרך צילום על ההתקשרות.';

alter table public.office_journey_defaults enable row level security;

-- אותה מדיניות בדיוק כמו journey_templates, פרט לכך שאין כאן שורות מובנות
-- (office_id null) — לברירת מחדל תמיד יש בעלים.
drop policy if exists ojd_read   on public.office_journey_defaults;
drop policy if exists ojd_insert on public.office_journey_defaults;
drop policy if exists ojd_update on public.office_journey_defaults;
drop policy if exists ojd_delete on public.office_journey_defaults;

create policy ojd_read   on public.office_journey_defaults for select
  using (office_id = public.current_office_id());
create policy ojd_insert on public.office_journey_defaults for insert
  with check (office_id = public.current_office_id() and office_id is not null);
create policy ojd_update on public.office_journey_defaults for update
  using (office_id = public.current_office_id() and office_id is not null)
  with check (office_id = public.current_office_id() and office_id is not null);
create policy ojd_delete on public.office_journey_defaults for delete
  using (office_id = public.current_office_id() and office_id is not null);

grant select, insert, update, delete on public.office_journey_defaults to authenticated;
revoke all on public.office_journey_defaults from anon;

create or replace function public.tg_ojd_touch() returns trigger
language plpgsql as $function$
begin new.updated_at := now(); return new; end;
$function$;

drop trigger if exists ojd_touch on public.office_journey_defaults;
create trigger ojd_touch before update on public.office_journey_defaults
  for each row execute function public.tg_ojd_touch();

-- ── 2 · הצילום על ההתקשרות ───────────────────────────────────────────────────
-- ‼ nullable בכוונה. התקשרות שנולדה לפני המיגרציה נשארת בלי צילום, והמחולל
--   מזהה את המצב הזה ונופל להתנהגות הקוד הישנה. אין מילוי־לאחור: לקוח שכבר
--   בתהליך לא אמור לקבל או לאבד בקשה בגלל שינוי תשתית.

alter table public.engagements
  add column if not exists journey_default_snapshot jsonb,
  add column if not exists journey_default_facts    jsonb;

comment on column public.engagements.journey_default_snapshot is
  'ברירת המחדל כפי שהייתה בלידת ההתקשרות. המחולל קורא מכאן, לא מהטבלה החיה.';
comment on column public.engagements.journey_default_facts is
  'העובדות שנפסקו בלידה, כדי שהרצה חוזרת תהיה דטרמיניסטית.';

-- ── 3 · קריאה מהצילום ────────────────────────────────────────────────────────
-- ‼ כל אחת מהן מקבלת גם `null` וגם מערך ריק ומחזירה את התנהגות ברירת המחדל
--   של הקוד הישן. זה מה שמאפשר להחיל את 136 בלי לגעת בהתקשרויות קיימות.

/** הרשומה של סוג בקשה בצילום, או null אם אינה שם. */
create or replace function public.journey_default_entry(p_snapshot jsonb, p_step_type text)
returns jsonb language sql immutable as $function$
  select e
    from jsonb_array_elements(coalesce(p_snapshot, '[]'::jsonb)) e
   where e->>'stepType' = p_step_type
   limit 1;
$function$;

/** האם הבקשה נוצרת. חסרה מהצילום ⇒ כן, בדיוק כמו לפני המיגרציה. */
create or replace function public.journey_default_enabled(p_snapshot jsonb, p_step_type text)
returns boolean language sql immutable as $function$
  select coalesce(
    (public.journey_default_entry(p_snapshot, p_step_type)->>'enabled')::boolean,
    true);
$function$;

/** המקום השמור במסלול. חסר ⇒ 0, כמו כל מה שהמחולל יצר עד היום. */
create or replace function public.journey_default_order(p_snapshot jsonb, p_step_type text)
returns integer language sql immutable as $function$
  select coalesce(
    (public.journey_default_entry(p_snapshot, p_step_type)->>'sortIndex')::integer,
    0);
$function$;

/** חובה/רשות. null ברשומה ⇒ המערכת מחליטה (p_fallback). */
create or replace function public.journey_default_required(
  p_snapshot jsonb, p_step_type text, p_fallback boolean)
returns boolean language sql immutable as $function$
  select coalesce(
    (public.journey_default_entry(p_snapshot, p_step_type)->>'requiredForClose')::boolean,
    p_fallback);
$function$;

/**
 * הענף שמנצח, לפי העובדות שנפסקו. התאמה ראשונה — בדיוק כמו ה-if/elsif/else
 * שהיה בקוד. אין התאמה ⇒ הענף שה-fact שלו null (הנופל־אחורה).
 * ‼ מחזירה null כשאין רשומה או אין ענפים, וזה הסימן לנפילה להתנהגות הישנה.
 */
create or replace function public.journey_default_variant(
  p_snapshot jsonb, p_step_type text, p_facts jsonb)
returns jsonb language plpgsql immutable as $function$
declare
  v_entry jsonb := public.journey_default_entry(p_snapshot, p_step_type);
  v       jsonb;
  v_fact  text;
begin
  if v_entry is null or jsonb_typeof(v_entry->'variants') <> 'array' then return null; end if;

  for v in select value from jsonb_array_elements(v_entry->'variants') loop
    v_fact := nullif(v->>'fact', '');
    if v_fact is null then return v; end if;                 -- הנופל־אחורה
    if coalesce((p_facts->>v_fact)::boolean, false) then return v; end if;
  end loop;
  return null;
end;
$function$;

/** רשימת הפריטים של הענף, בפורמט checklist של onboarding_steps. */
create or replace function public.journey_default_checklist(p_variant jsonb)
returns jsonb language sql immutable as $function$
  select case
    when p_variant is null or jsonb_typeof(p_variant->'items') <> 'array' then null
    else (select coalesce(jsonb_agg(jsonb_build_object(
                   'key',   coalesce(nullif(it->>'key',''), 'i' || ord),
                   'label', it->>'label',
                   'done',  false) order by ord), '[]'::jsonb)
            from jsonb_array_elements(p_variant->'items') with ordinality t(it, ord))
  end;
$function$;

revoke all on function public.journey_default_entry(jsonb, text)            from public, anon;
revoke all on function public.journey_default_enabled(jsonb, text)          from public, anon;
revoke all on function public.journey_default_order(jsonb, text)            from public, anon;
revoke all on function public.journey_default_required(jsonb, text, boolean) from public, anon;
revoke all on function public.journey_default_variant(jsonb, text, jsonb)   from public, anon;
revoke all on function public.journey_default_checklist(jsonb)              from public, anon;
grant execute on function public.journey_default_entry(jsonb, text)            to authenticated;
grant execute on function public.journey_default_enabled(jsonb, text)          to authenticated;
grant execute on function public.journey_default_order(jsonb, text)            to authenticated;
grant execute on function public.journey_default_required(jsonb, text, boolean) to authenticated;
grant execute on function public.journey_default_variant(jsonb, text, jsonb)   to authenticated;
grant execute on function public.journey_default_checklist(jsonb)              to authenticated;

-- ── 4 · סוג הלקוח ────────────────────────────────────────────────────────────
-- ‼ אותה קדימות שכבר קיימת ב-130/132 ואושרה שוב ב-2026-08-25:
--   תבנית ההצעה קובעת; בהיעדרה - הסיווג שעל כרטיס הלקוח. אין אף אחד מהם ⇒
--   null, והמחולל נופל להתנהגות הקוד (בלי ברירת מחדל של משרד).

create or replace function public.resolve_client_kind(p_quotation_id text, p_client_id text)
returns text language plpgsql stable security definer set search_path to 'public'
as $function$
declare
  v_kind text;
  c      public.clients%rowtype;
begin
  select t.kind into v_kind
    from public.quotations q
    join public.quotation_templates t on t.id = q.template_id
   where q.id = p_quotation_id;
  if v_kind is not null then return v_kind; end if;

  select * into c from public.clients where id = p_client_id;
  if c.id is null then return null; end if;

  if coalesce(c.dealer_type,'') = 'company'  then return 'company'; end if;
  if coalesce(c.dealer_type,'') = 'licensed' then return 'licensed_dealer'; end if;
  if coalesce(c.vat_status,'')  = 'authorizedDealer' then return 'licensed_dealer'; end if;
  if coalesce(c.dealer_type,'') = 'exempt'   then return 'exempt_dealer'; end if;
  if coalesce(c.vat_status,'')  = 'exemptDealer' then return 'exempt_dealer'; end if;
  return null;
end;
$function$;

revoke all on function public.resolve_client_kind(text, text) from public, anon;
grant execute on function public.resolve_client_kind(text, text) to authenticated;

-- ── 5 · הזריעה · ההתנהגות הקיימת, כפי שהיא ───────────────────────────────────
-- ‼ הכלל שקובע: ברירת המחדל הראשונה של כל משרד חייבת לשחזר בדיוק את מה
--   שהמחולל עושה היום. לא "תצורה גנרית סבירה" - ההתנהגות הקיימת.
--
-- ‼ סוג בקשה שלא יכול להיווצר לסוג הלקוח הזה **אינו** ברשומות (ולא "כבוי"):
--   כבוי פירושו שהמשרד כיבה; היעדר פירושו שאין לזה מקום. שתי המשמעויות
--   שונות במסך, ושתיהן צריכות להישאר ניתנות להבחנה.

create or replace function public.default_journey_entries(p_kind text)
returns jsonb language sql immutable as $function$
  with
  docs as (select jsonb_build_object(
    'key','client_documents', 'stepType','client_documents',
    'enabled', true, 'sortIndex', 10, 'source','system',
    'requiredForClose', null, 'dueInDays', null, 'dependsOn', null,
    'variants', jsonb_build_array(
      -- עסק חדש: תעודות הפתיחה
      jsonb_build_object('key','new_business','fact','new_business','items', jsonb_build_array(
        jsonb_build_object('key','vat_cert','label','תעודת עוסק'),
        jsonb_build_object('key','id_card','label','צילום תעודת זהות'),
        jsonb_build_object('key','bank_confirm','label','אישור ניהול חשבון בנק'))),
      -- מגיע מרו"ח אחר: מה שיש לו ביד
      jsonb_build_object('key','has_prev','fact','has_prev','items', jsonb_build_array(
        jsonb_build_object('key','bank_confirm','label','אישור ניהול חשבון בנק'),
        jsonb_build_object('key','last_return','label','דוח שנתי אחרון'),
        jsonb_build_object('key','form106','label','טופס 106'))),
      -- הנופל־אחורה
      jsonb_build_object('key','default','fact', null,'items', jsonb_build_array(
        jsonb_build_object('key','id_card','label','צילום תעודת זהות'),
        jsonb_build_object('key','bank_confirm','label','אישור ניהול חשבון בנק'))))) v),

  prevdet as (select jsonb_build_object(
    'key','prev_accountant_details', 'stepType','prev_accountant_details',
    'enabled', true, 'sortIndex', 20, 'source','system',
    'requiredForClose', null, 'dueInDays', null, 'dependsOn', null,
    'variants', jsonb_build_array(
      jsonb_build_object('key','no_email','fact','no_prev_email',
        'copy', jsonb_build_object(
          'clientTitle','פרטי רואה החשבון הקודם שלך',
          'clientSub','שם, אימייל וטלפון - כדי שנפנה אליו בשמך',
          'clientCta','למילוי'),
        'items', jsonb_build_array(
          jsonb_build_object('key','name','label','שם רואה החשבון'),
          jsonb_build_object('key','email','label','כתובת אימייל'),
          jsonb_build_object('key','phone','label','טלפון'))),
      jsonb_build_object('key','default','fact', null,
        'copy', jsonb_build_object(
          'clientTitle','לאשר את פרטי רואה החשבון הקודם',
          'clientSub','הפרטים שאצלנו מוצגים למילוי מראש - רק לוודא שהם נכונים',
          'clientCta','לאישור'),
        'items', jsonb_build_array(
          jsonb_build_object('key','confirm','label','אישור שהפרטים נכונים'))))) v),

  simple as (
    select 'release_letter'          as st, 30 as ord, 'prev_accountant_details' as dep union all
    select 'materials_received',        40, 'release_letter'      union all
    select 'paperless_invite',          50, null                  union all
    select 'paperless_connection',      60, 'paperless_invite'    union all
    select 'paperless_tax_authority',   70, 'paperless_connection' union all
    select 'retainer_authorization',    80, 'paperless_connection' union all
    select 'intake_questionnaire',      90, null),

  picked as (
    select st, ord, dep from simple
     where case p_kind
       -- עוסק פטור: כל הרצף פרט לחיבור לרשות המסים (אין לו חשבונית מס)
       when 'exempt_dealer'       then st <> 'paperless_tax_authority'
       when 'licensed_dealer'     then true
       when 'company'             then true
       -- החזר מס: אין שירות חודשי ואין רו"ח קודם במסלול הרגיל
       when 'tax_refund'          then st = 'intake_questionnaire'
       -- ייצוג בלבד: מסמכים ומסלול הרו"ח הקודם, בלי כלים ובלי תשלום
       when 'representation_only' then st in ('release_letter','materials_received')
       else true end),

  rows as (
    select (select v from docs) as v, 10 as ord
    union all
    select (select v from prevdet), 20
     where p_kind <> 'tax_refund'
    union all
    select jsonb_build_object(
      'key', st, 'stepType', st, 'enabled', true, 'sortIndex', ord,
      'source','system', 'requiredForClose', null, 'dueInDays', null,
      'dependsOn', dep, 'variants', '[]'::jsonb), ord
      from picked)

  select coalesce(jsonb_agg(v order by ord), '[]'::jsonb) from rows;
$function$;

/** יוצרת את חמש ברירות המחדל למשרד. אידמפוטנטית: קיימת ⇒ לא נגעת. */
create or replace function public.seed_office_journey_defaults(p_office_id uuid)
returns jsonb language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_kind    text;
  v_created int := 0;
begin
  foreach v_kind in array array['exempt_dealer','licensed_dealer','company','tax_refund','representation_only'] loop
    insert into public.office_journey_defaults (office_id, client_kind, entries)
    values (p_office_id, v_kind, public.default_journey_entries(v_kind))
    on conflict (office_id, client_kind) do nothing;
    if found then v_created := v_created + 1; end if;
  end loop;
  return jsonb_build_object('ok', true, 'officeId', p_office_id, 'created', v_created);
end;
$function$;

revoke all on function public.default_journey_entries(text)     from public, anon;
revoke all on function public.seed_office_journey_defaults(uuid) from public, anon;
grant execute on function public.default_journey_entries(text)     to authenticated;
grant execute on function public.seed_office_journey_defaults(uuid) to authenticated;

-- ── 6 · זריעה לכל המשרדים הקיימים ────────────────────────────────────────────
do $do$
declare v_office uuid;
begin
  for v_office in select distinct office_id from public.profiles where office_id is not null loop
    perform public.seed_office_journey_defaults(v_office);
  end loop;
end $do$;

-- ── 7 · אימות ────────────────────────────────────────────────────────────────
do $do$
declare
  v_offices int;
  v_rows    int;
  v_bad     int;
begin
  select count(distinct office_id) into v_offices from public.profiles where office_id is not null;
  select count(*) into v_rows from public.office_journey_defaults;
  if v_rows <> v_offices * 5 then
    raise exception '135: ציפינו ל-% שורות (% משרדים × 5), יש %', v_offices * 5, v_offices, v_rows;
  end if;

  -- לכל רשומה עם ענפים חייב להיות ענף נופל־אחורה אחד בדיוק, והוא האחרון.
  select count(*) into v_bad
    from public.office_journey_defaults d,
         lateral jsonb_array_elements(d.entries) e
   where jsonb_array_length(coalesce(e->'variants','[]'::jsonb)) > 0
     and ( (select count(*) from jsonb_array_elements(e->'variants') v where v->>'fact' is null) <> 1
        or (e->'variants'->-1->>'fact') is not null );
  if v_bad > 0 then
    raise exception '135: % רשומות שבהן הנופל־אחורה חסר או אינו אחרון', v_bad;
  end if;

  raise notice '135: % שורות ברירת מחדל נזרעו ואומתו', v_rows;
end $do$;
