-- נמשך חי 2026-09-04 מהמסד (pg_get_functiondef).
-- ארגומנטים: p_kind text
CREATE OR REPLACE FUNCTION public.default_journey_entries(p_kind text)
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
AS $function$
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
$function$

