-- ═══════════════════════════════════════════════════════════════════════════
--  167 — כתיבה חלקית מהדפדפן: כרטיס לקוח, סדר משימות, ותוקף הצעות
-- ═══════════════════════════════════════════════════════════════════════════
--  ‼ דפוס השורש (ספר הפערים, אשכול B): הדפדפן מחזיק עותק ישן של שורה ומהדהד
--  אותה בשלמותה בחזרה למסד. ארבע תוצאות של אותו דפוס:
--
--   A8/T2  שמירת כרטיס לקוח כתבה את *כל* העמודות מהעותק שנטען בכניסה — ודרסה
--          בשקט כל מה שהשרת כתב בינתיים (שלב חיים, עובדות מס, provenance).
--          וגם: השוואה מול עותק ישן ייצרה «שינויים ידניים» מזויפים על עובדות
--          שהשרת עצמו שינה.
--   K3     גרירת משימה אחת שכתבה מחדש את כל השורות של כל המשימות הפתוחות
--          (45 כתיבות לגרירה), כולל «אצל מי הכדור» שהשרת קובע, מהזיכרון.
--   K4     עדכון מרוכז של משימות רץ כ-N כתיבות במקביל — כישלון באמצע השאיר
--          חצי מהשורות כתובות, והמסך הציג את מה ש*נשלח* ולא את מה שנכתב.
--   C3     הדפדפן סימן הצעות כ«פג תוקף» בכל טעינה, מתוך צילום ישן — ויכול
--          היה לדרוס אישור שהלקוח נתן בין הטעינה לכתיבה.
--   K1     המשימה נושאת «בקשת חתימה» שאין לה עמודה — כל שמירה של משימה כזו
--          נפלה, והחלון נתקע.
--
--  ── התיקון ────────────────────────────────────────────────────────────────
--  הדפדפן שולח מעכשיו רק את מה שהשתנה, והשרת מקבל רק מה שמותר:
--   ① update_client_fields   — עדכון של המפתחות שנמסרו בלבד, עם רשימת עמודות
--      מותרות (עמודות שהשרת מנהל חסומות; עובדות מס מנוהלות עוברות רק דרך
--      record_manual_fact_change, באותה טרנזקציה), ובדיקת updated_at: אם
--      השורה השתנתה מאז שנטענה — {ok:false,error:'stale'} ואף עמודה לא נכתבת.
--   ② reorder_tasks          — sort_order בלבד, הוראה אחת, רק למשימות של הקורא.
--   ③ bulk_update_tasks      — אותו patch על כמה משימות, הוראה אחת, הכול-או-כלום.
--   ④ expire_stale_quotations — סימון תוקף בשרת, אידמפוטנטי, עם WHERE שאינו
--      יכול לגעת בהצעה מאושרת/מבוטלת. המסך *גוזר* תוקף לתצוגה ולא כותב.
--   ⑤ tasks.signature_request — העמודה שהייתה חסרה.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── ⑤ K1 · העמודה של בקשת החתימה ─────────────────────────────────────────────
alter table public.tasks add column if not exists signature_request jsonb;
comment on column public.tasks.signature_request is
  'בקשת חתימה על PDF מצורף (שלב 1: חותמים + מיקומי חתימה). הייתה מסודרת מהדפדפן בלי עמודה — 166.';

-- ── עזר: אילו עמודות של clients הן עובדות מס מנוהלות ─────────────────────────
--  ‼ למה נגזר ולא מועתק: הרשימה הסמכותית חיה ב-_tax_fact_field_op (91 ואילך).
--  עותק שני כאן היה נסחף בשקט בכל מיגרציה שמוסיפה עובדה — בדיוק הסטייה
--  שכבר קרתה פעם בין שני עותקים בדפדפן. לכן קוראים את גוף הפונקציה עצמה
--  ושולפים ממנו את שמות העמודות שהיא כותבת.
create or replace function public._governed_client_columns()
returns text[]
language sql
stable
security definer
set search_path to 'public'
as $function$
  select coalesce(array_agg(distinct m[1]), '{}'::text[])
    from regexp_matches(
           pg_get_functiondef('public._tax_fact_field_op'::regproc),
           'update public\.clients set (\w+) =', 'g') as m;
$function$;

revoke execute on function public._governed_client_columns() from public, anon;
grant  execute on function public._governed_client_columns() to authenticated, service_role;

-- ── ① update_client_fields ───────────────────────────────────────────────────
create or replace function public.update_client_fields(
  p_client_id text,
  p_patch jsonb,
  p_expected_updated_at timestamptz default null,
  p_facts jsonb default null,
  p_facts_label text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_owner uuid;
  v_updated_at timestamptz;
  v_governed text[] := public._governed_client_columns();
  -- עמודות שרק השרת כותב: זהות, זמנים, שלב חיים, provenance, טוקנים, ומצב
  -- פייפרלס שנגזר. הדפדפן לעולם לא שולח אותן; אם בכל זאת הגיעו — שגיאה,
  -- לא דילוג שקט (דילוג שקט הוא בדיוק מה שהסתיר את הדריסות עד היום).
  v_blocked constant text[] := array[
    'id', 'user_id', 'created_at', 'updated_at',
    'lifecycle_stage', 'merged_from_lead_id', 'field_meta', 'paperless_status',
    'portal_token', 'portal_token_expires_at', 'portal_token_last_used_at',
    'intake_token', 'intake_token_expires_at', 'intake_token_last_used_at'
  ];
  k text;
  v_cols text;
  v_res jsonb;
  v_client jsonb;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'unauthenticated'); end if;
  if not public.is_authorized() then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then
    return jsonb_build_object('ok', false, 'error', 'invalid_patch');
  end if;
  if p_facts is not null and jsonb_typeof(p_facts) <> 'object' then
    return jsonb_build_object('ok', false, 'error', 'invalid_facts');
  end if;

  -- נעילת השורה לפני ההשוואה: בין הבדיקה לכתיבה אף אחד לא יכול להחליף אותה.
  select user_id, updated_at into v_owner, v_updated_at
    from public.clients where id = p_client_id for update;
  if v_owner is null then return jsonb_build_object('ok', false, 'error', 'client_not_found'); end if;
  if v_owner <> v_uid then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;

  -- ‼ הבדיקה האופטימית: הדפדפן שולח את updated_at שהוא טען. אם השורה
  -- השתנתה מאז — לא כותבים כלום ומחזירים את השורה העדכנית, כדי שהמסך יטען
  -- אותה ויציג למשתמש במקום לדרוס.
  if p_expected_updated_at is not null and v_updated_at <> p_expected_updated_at then
    select to_jsonb(c) into v_client from public.clients c where c.id = p_client_id;
    return jsonb_build_object('ok', false, 'error', 'stale', 'client', v_client);
  end if;

  for k in select jsonb_object_keys(p_patch) loop
    if k = any(v_blocked) then
      return jsonb_build_object('ok', false, 'error', 'blocked_field', 'field', k);
    end if;
    if k = any(v_governed) then
      return jsonb_build_object('ok', false, 'error', 'governed_field', 'field', k);
    end if;
    if not exists (
      select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'clients' and column_name = k
    ) then
      return jsonb_build_object('ok', false, 'error', 'unknown_field', 'field', k);
    end if;
  end loop;

  -- ‼ רק המפתחות שנמסרו. jsonb_populate_record עושה את ההמרה לטיפוס העמודה
  -- (תאריך, מספר, jsonb, מערך) — ו-null ב-JSON הוא NULL אמיתי, וכך שדה
  -- שנוקה בטופס באמת מתנקה (K2/H4/A5).
  select string_agg(format('%I', key), ', ') into v_cols from jsonb_object_keys(p_patch) as key;
  if v_cols is not null then
    execute format(
      'update public.clients set (%s) = (select %s from jsonb_populate_record(null::public.clients, $1)) where id = $2',
      v_cols, v_cols)
    using p_patch, p_client_id;
  end if;

  -- עובדות מס מנוהלות — באותה טרנזקציה, דרך המנגנון היחיד שכותב אותן
  -- (היסטוריה + provenance). כישלון שם מגלגל אחורה גם את ה-patch הרגיל:
  -- גבול הצלחה אחד לשמירה אחת.
  if p_facts is not null and p_facts <> '{}'::jsonb then
    v_res := public.record_manual_fact_change(
      p_client_id, 'dossier-edit', coalesce(nullif(p_facts_label, ''), 'עדכון בתיק'),
      jsonb_build_object('display', 'לפני העדכון'),
      jsonb_build_object('display', 'עודכן בתיק', 'patch', p_facts),
      null);
    if not coalesce((v_res ->> 'ok')::boolean, false) then
      raise exception 'fact_write_failed: %', coalesce(v_res ->> 'error', 'unknown');
    end if;
  end if;

  select to_jsonb(c) into v_client from public.clients c where c.id = p_client_id;
  return jsonb_build_object('ok', true, 'client', v_client);
end;
$function$;

revoke execute on function public.update_client_fields(text, jsonb, timestamptz, jsonb, text) from public, anon;
grant  execute on function public.update_client_fields(text, jsonb, timestamptz, jsonb, text) to authenticated, service_role;

comment on function public.update_client_fields(text, jsonb, timestamptz, jsonb, text) is
  'עדכון חלקי של כרטיס לקוח: רק המפתחות שנמסרו (snake_case), עמודות שרת ועובדות מנוהלות חסומות ב-p_patch, עובדות מנוהלות דרך p_facts (camelCase → record_manual_fact_change באותה טרנזקציה), ו-stale אם updated_at השתנה. 166.';

-- ── ② reorder_tasks ──────────────────────────────────────────────────────────
--  ‼ sort_order בלבד. המשימות מקבלות מרווח של 10 לפי מקומן ברשימה — אותו
--  מרווח שהדפדפן נתן עד היום, כדי שמשימה שלא ברשימה תשמור על מקומה היחסי.
--  מזהה זר (של משתמש אחר, או שלא קיים) פשוט אינו נוגע בכלום.
create or replace function public.reorder_tasks(p_ids text[])
returns setof public.tasks
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'unauthenticated'; end if;
  if not public.is_authorized() then raise exception 'forbidden'; end if;
  return query
    update public.tasks t
       set sort_order = (x.ord * 10)::integer
      from unnest(coalesce(p_ids, '{}'::text[])) with ordinality as x(id, ord)
     where t.id = x.id and t.user_id = v_uid
    returning t.*;
end;
$function$;

revoke execute on function public.reorder_tasks(text[]) from public, anon;
grant  execute on function public.reorder_tasks(text[]) to authenticated, service_role;

comment on function public.reorder_tasks(text[]) is
  'סדר ידני של משימות: כותבת sort_order בלבד, בהוראה אחת, רק למשימות של הקורא. מחזירה את השורות שנכתבו. 166.';

-- ── ③ bulk_update_tasks ──────────────────────────────────────────────────────
--  ‼ הכול-או-כלום: מזהה אחד שאינו של הקורא מפיל את כל הקריאה לפני שנכתבה
--  שורה אחת. המסך מציב את מה שחזר — לא את מה ששלח.
create or replace function public.bulk_update_tasks(p_ids text[], p_patch jsonb)
returns setof public.tasks
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_allowed constant text[] := array[
    'client_id', 'contact_id', 'case_id', 'category', 'title', 'description',
    'ball_with', 'status', 'progress', 'priority', 'due_date', 'sort_order',
    'assignee_id', 'completed_at', 'signature_request'
  ];
  v_ids text[] := (select array_agg(distinct i) from unnest(coalesce(p_ids, '{}'::text[])) as i);
  v_owned int;
  k text;
  v_cols text;
begin
  if v_uid is null then raise exception 'unauthenticated'; end if;
  if not public.is_authorized() then raise exception 'forbidden'; end if;
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then raise exception 'invalid_patch'; end if;
  if v_ids is null or cardinality(v_ids) = 0 then return; end if;

  for k in select jsonb_object_keys(p_patch) loop
    if not (k = any(v_allowed)) then raise exception 'field_not_allowed: %', k; end if;
  end loop;

  select count(*) into v_owned from public.tasks where id = any(v_ids) and user_id = v_uid;
  if v_owned <> cardinality(v_ids) then
    raise exception 'task_not_found_or_forbidden: % of % ids', cardinality(v_ids) - v_owned, cardinality(v_ids);
  end if;

  select string_agg(format('%I', key), ', ') into v_cols from jsonb_object_keys(p_patch) as key;
  if v_cols is null then
    return query select * from public.tasks where id = any(v_ids) and user_id = v_uid;
    return;
  end if;

  return query execute format(
    'update public.tasks t set (%s) = (select %s from jsonb_populate_record(null::public.tasks, $1)) '
    || 'where t.id = any($2) and t.user_id = $3 returning t.*',
    v_cols, v_cols)
  using p_patch, v_ids, v_uid;
end;
$function$;

revoke execute on function public.bulk_update_tasks(text[], jsonb) from public, anon;
grant  execute on function public.bulk_update_tasks(text[], jsonb) to authenticated, service_role;

comment on function public.bulk_update_tasks(text[], jsonb) is
  'אותו patch (snake_case, עמודות מותרות בלבד) על כמה משימות של הקורא, בהוראה אחת, הכול-או-כלום. מחזירה את השורות שנכתבו. 166.';

-- ── ④ expire_stale_quotations ────────────────────────────────────────────────
--  ‼ ה-WHERE הוא ההגנה: רק sent/viewed שעבר מועדן. הצעה שאושרה או בוטלה
--  בין הטעינה לקריאה אינה עונה לתנאי ולכן אינה נגעת — לא משנה כמה ישן
--  הצילום שבדפדפן. אירוע 'expired' נוסף פעם אחת, כי אחרי הכתיבה הסטטוס
--  כבר אינו sent/viewed.
create or replace function public.expire_stale_quotations()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_n integer;
begin
  -- service_role (בלי משתמש) רשאי על כל המשרדים; משתמש מחובר — על שלו בלבד.
  if v_uid is not null and not public.is_authorized() then raise exception 'forbidden'; end if;
  with expired as (
    update public.quotations
       set status = 'expired',
           events = coalesce(events, '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
             'type', 'expired',
             'at', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')))
     where status in ('sent', 'viewed')
       and expires_at is not null and expires_at < now()
       and (v_uid is null or user_id = v_uid)
    returning 1
  )
  select count(*) into v_n from expired;
  return v_n;
end;
$function$;

revoke execute on function public.expire_stale_quotations() from public, anon;
grant  execute on function public.expire_stale_quotations() to authenticated, service_role;

comment on function public.expire_stale_quotations() is
  'מסמנת הצעות שנשלחו/נצפו ועבר מועדן כ-expired ומוסיפה אירוע אחד. אידמפוטנטית; ה-WHERE מונע נגיעה בהצעה מאושרת/מבוטלת. 166.';

select public.assert_domain_function_invariants();
