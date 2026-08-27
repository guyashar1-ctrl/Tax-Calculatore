-- ─── 137 · בקשות חופשיות בברירת המחדל נוצרות באמת ───────────────────────────
--
-- 136 לימדה את המחולל לקרוא את ברירת המחדל — אבל רק בנקודות שבהן הוא ממילא
-- יוצר בקשה מוכרת. לבקשה שהמשרד ממציא («אישור תנאי שכר טרחה», «הקמת הרשאות
-- לחיוב לרשויות») לא הייתה נקודת יצירה בכלל: היא נשמרה בצילום ואיש לא קרא
-- אותה. לכן ארבעת הפריטים האלה הוסרו בשקט מהקטלוג — וזו הייתה סטייה
-- מאב-הטיפוס המאושר. כאן זה נסגר.
--
-- ═══ איך זה עובד ═══
--
-- ‼ **אין מערכת בקשות שנייה.** כל אחת נוצרת דרך `create_onboarding_request` —
-- אותו מסלול שבו נוצרת בקשה מ«+ בקשה» בכרטיס הלקוח. לכן היא יורשת בלי
-- שנעשה דבר: את בדיקת הבעלות, את אימות הדרישות, את היומן, ואת שער ה-held
-- (בקשה שנוצרת בזמן ש-derive_lifecycle_stage הוא lead/quoted נולדת מוחזקת
-- ואינה גלויה ללקוח). שום אינווריאנט לא נעקף.
--
-- ‼ **ה-payload נבנה בדפדפן, לא כאן.** `officeDefaultRequests.ts` מרכיב אותו
-- ברגע שהמשרד שומר, ומאותם בונים שכבר קיימים — buildBankDebitPayload
-- ו-buildDocumentRequestPayload. השרת מעביר אותו כמות שהוא. אילו ניסחנו כאן,
-- היו לנו שני עותקים של אותו טקסט, וזה בדיוק מה שהמלאי מצא כתקלה.
--
-- ‼ **זהות.** בקשה חופשית היא `custom_request`, ולכן `step_type` אינו מזהה
-- אותה. חותמת `defaultOrigin.key` נכתבת על ה-payload, והדדופליקציה היא עליה.
-- כך הרצה חוזרת של המחולל אינה מכפילה, ובקשה שהמשרד ביטל אצל לקוח מסוים
-- אינה נולדת מחדש.
--
-- ‼ **תצורה חסרה ⇒ לא נוצר.** «הקמת הרשאות» בלי אף רשות, או «שליחת מסמך»
-- בלי מסמך, נשמרות עם payload ריק. עדיף לא ליצור מאשר ליצור בקשה שמבקשת
-- מהלקוח כלום.
--
-- ‼ **מסע קיים אינו משתנה.** הלולאה רצה רק כשיש צילום, והצילום נוצר רק
-- להתקשרות שאין לה שום שלב (מיגרציה 136 §1.3).

do $do$
declare
  src text := pg_get_functiondef('public.generate_onboarding_steps(text,boolean)'::regprocedure);
  a   text;
begin
  if position('defaultOrigin' in src) > 0 then
    raise notice '137: המחולל כבר יוצר בקשות חופשיות - מדלגים';
    return;
  end if;

  -- משתני הלולאה
  a := '  v_office     uuid;';
  if position(a in src) = 0 then raise exception '137: עוגן ההצהרות לא נמצא'; end if;
  src := replace(src, a, a
    || E'\n  v_oentry     jsonb;'
    || E'\n  v_opayload   jsonb;'
    || E'\n  v_ores       jsonb;');

  -- ‼ העוגן: בלוק הסדר השמור שנוסף ב-136. הלולאה נכנסת **לפניו**, כדי
  -- שהבקשות שנוצרו כאן יקבלו גם הן את המקום השמור שלהן באותה פעולה.
  a := '  if not p_dry_run and v_snap is not null then'
    || E'\n    update public.onboarding_steps s';
  if position(a in src) = 0 then raise exception '137: עוגן הסדר השמור לא נמצא'; end if;
  src := replace(src, a,
       '  -- ── בקשות חופשיות של המשרד ─────────────────────────────────────────'
    || E'\n  if v_snap is not null then'
    || E'\n    for v_oentry in'
    || E'\n      select value from jsonb_array_elements(v_snap)'
    || E'\n       where value->>''source'' = ''office'''
    || E'\n         and coalesce((value->>''enabled'')::boolean, true)'
    || E'\n       order by coalesce((value->>''sortIndex'')::int, 0)'
    || E'\n    loop'
    || E'\n      v_opayload := v_oentry->''payload'';'
    || E'\n      -- תצורה חסרה ⇒ אין מה לבקש'
    || E'\n      continue when v_opayload is null or jsonb_typeof(v_opayload) <> ''object'''
    || E'\n                    or v_opayload = ''{}''::jsonb;'
    || E'\n      -- כבר קיימת אצל הלקוח (כולל מבוטלת) ⇒ לא נוצרת שוב'
    || E'\n      continue when exists ('
    || E'\n        select 1 from public.onboarding_steps s'
    || E'\n         where s.client_id = e.client_id'
    || E'\n           and s.payload->''defaultOrigin''->>''key'' = v_oentry->>''key'');'
    || E'\n'
    || E'\n      v_planned := v_planned || jsonb_build_object('
    || E'\n        ''step_type'', coalesce(v_oentry->>''stepType'', ''custom_request''),'
    || E'\n        ''track'', ''custom'', ''scope'', ''person'', ''status'', ''pending'','
    || E'\n        ''officeKey'', v_oentry->>''key'');'
    || E'\n'
    || E'\n      if not p_dry_run then'
    || E'\n        v_ores := public.create_onboarding_request('
    || E'\n          e.client_id,'
    || E'\n          coalesce(v_oentry->>''stepType'', ''custom_request''),'
    || E'\n          v_opayload || jsonb_build_object(''defaultOrigin'','
    || E'\n            jsonb_build_object(''key'', v_oentry->>''key'', ''kind'', ''office_default'')),'
    || E'\n          p_due_date => case when v_oentry->>''dueInDays'' is not null'
    || E'\n                             then current_date + (v_oentry->>''dueInDays'')::int end,'
    || E'\n          p_depends_on => null,'
    || E'\n          p_published => true,'
    || E'\n          p_required_for_close => coalesce((v_oentry->>''requiredForClose'')::boolean, true),'
    || E'\n          p_owner => ''client'','
    || E'\n          p_stage_id => null);'
    || E'\n'
    || E'\n        if coalesce((v_ores->>''ok'')::boolean, false) then'
    || E'\n          update public.onboarding_steps'
    || E'\n             set sort_order = coalesce((v_oentry->>''sortIndex'')::int, 0)'
    || E'\n           where id = v_ores->>''stepId'';'
    || E'\n          v_created := v_created + 1;'
    || E'\n        else'
    || E'\n          -- ‼ לא מפילים את הקליטה בגלל בקשה אחת. נרשם ביומן וממשיכים.'
    || E'\n          perform public.log_onboarding_event(e.user_id, null, e.id, ''note'', ''system'','
    || E'\n            ''בקשת ברירת מחדל לא נוצרה: '' || coalesce(v_oentry->>''key'', ''?'')'
    || E'\n              || '' - '' || coalesce(v_ores->>''error'', ''?''), v_oentry);'
    || E'\n        end if;'
    || E'\n      end if;'
    || E'\n    end loop;'
    || E'\n  end if;'
    || E'\n'
    || a);

  execute src;
  raise notice '137: המחולל יוצר בקשות חופשיות (% תווים)', length(src);
end $do$;

-- ── אימות ────────────────────────────────────────────────────────────────────
do $do$
declare src text := pg_get_functiondef('public.generate_onboarding_steps(text,boolean)'::regprocedure);
begin
  if position('defaultOrigin' in src) = 0 then
    raise exception '137: הטלאי לא הוחל';
  end if;
  if position('public.create_onboarding_request(' in src) = 0 then
    raise exception '137: המחולל אינו קורא למסלול היצירה הקנוני';
  end if;
  -- הכיבויים והווריאציות של 136 חייבים לשרוד את הטלאי
  if (select count(*) from regexp_matches(src, 'journey_default_enabled', 'g')) <> 8 then
    raise exception '137: בדיקות הכיבוי של 136 נפגעו';
  end if;
  raise notice '137: אומת';
end $do$;
