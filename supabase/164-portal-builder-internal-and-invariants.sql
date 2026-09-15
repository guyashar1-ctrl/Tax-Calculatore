-- ═══════════════════════════════════════════════════════════════════════════
--  164 — build_client_portal פנימית בלבד + שומר קבועים לפונקציות הדומיין
-- ═══════════════════════════════════════════════════════════════════════════
--  ‼ מה נמצא: מיגרציה 157 סיימה ב-
--        grant execute on function public.build_client_portal(text, text) to authenticated;
--  build_client_portal מקבלת מזהה לקוח ובונה את כל תוכן הדף האישי שלו — בלי
--  שום בדיקת auth.uid(). לכן כל משתמש מחובר יכול היה לבנות את הדף האישי של
--  לקוח של משרד אחר. אומת חי בפרודקשן.
--
--  ‼ למה הפתרון הוא הרשאה ולא בדיקת בעלות בגוף: לפונקציה אין שום קורא
--  מהדפדפן או מפונקציות הקצה. שתי הדלתות היחידות אליה הן get_client_portal
--  (מאמתת טוקן — הלקוח פותח מקישור, בלי משתמש מחובר) ו-get_client_portal_preview
--  (מאמתת בעלות). בדיקת auth.uid() בגוף הייתה שוברת דווקא את הדלת הראשונה:
--  רו"ח שפותח קישור של לקוח בזמן שהוא מחובר כמשתמש אחר. הטוקן הוא ההרשאה שם.
--  הגבול הסמכותי הוא: הבונה סגור, וכל דלת מאמתת בעצמה.
-- ═══════════════════════════════════════════════════════════════════════════

revoke execute on function public.build_client_portal(text, text) from public, anon, authenticated;
grant  execute on function public.build_client_portal(text, text) to service_role;

-- ── שומר קבועים ────────────────────────────────────────────────────────────
--  ‼ למה: במהלך סגירת P0 התגלה שהרצה חוזרת של מיגרציה 160 אחרי 163 מחזירה
--  גוף ישן של ensure_institution_alignment_steps (הגוף הכפול הוסר מ-160).
--  קובץ מיגרציה שמגדיר מחדש פונקציה של קובץ מאוחר ממנו הוא מלכודת שקטה, ואין
--  דרך למנוע אותה ב-SQL. מה שאפשר: לבדוק אחרי כל הרצה שהגרסה הסמכותית עדיין
--  במקום, ולהפיל את המיגרציה אם לא. הפונקציה הזו היא הבדיקה, והיא נקראת
--  בסוף כל מיגרציה מכאן והלאה ובשער הרגרסיה של האבטחה.
create or replace function public.assert_domain_function_invariants()
returns text
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_def text;
  v_leak text;
  v_msgs text[] := '{}';
  v_anon_ok text[] := array[
    'get_quotation', 'mark_quotation_viewed', 'approve_quotation',
    'start_intake', 'save_intake_answer', 'get_intake', 'reopen_intake',
    'get_client_portal', 'portal_submit_step',
    'get_onboarding', 'submit_onboarding_full', 'submit_signature',
    'request_spouse_onboarding',
    'get_spouse_onboarding', 'submit_spouse_onboarding',
    'get_release_portal', 'release_portal_set_item', 'release_portal_respond',
    'release_portal_remove_upload', 'release_portal_mark_items'
  ];
begin
  -- 163: הבעלים נגזר מהלקוח, ולא מהסשן
  v_def := pg_get_functiondef('public.ensure_institution_alignment_steps(text,text,boolean)'::regprocedure);
  if v_def not ilike '%v_uid is not null and v_owner <> v_uid%' then
    v_msgs := array_append(v_msgs, 'ensure_institution_alignment_steps: לא הגרסה של 163');
  end if;

  -- 161: אין בליעת חריגות באישור הצעה
  v_def := pg_get_functiondef('public.approve_quotation(text,text,text)'::regprocedure);
  if v_def ilike '%exception when others%' or v_def not ilike '%approval_incomplete%' then
    v_msgs := array_append(v_msgs, 'approve_quotation: לא הגרסה של 161');
  end if;

  -- 163: כתיבות המשנה של ההתקשרות נבדקות
  v_def := pg_get_functiondef('public.create_engagement_for_quotation(text,boolean)'::regprocedure);
  if v_def not ilike '%journey_incomplete%' then
    v_msgs := array_append(v_msgs, 'create_engagement_for_quotation: לא הגרסה של 163');
  end if;

  -- 162: propose מחזירה מזהים
  v_def := pg_get_functiondef('public.propose_tax_facts(text,text,text,jsonb)'::regprocedure);
  if v_def not ilike '%v_rows%' then
    v_msgs := array_append(v_msgs, 'propose_tax_facts: לא הגרסה של 162');
  end if;

  -- 160: anon רק על המשטח הציבורי
  select string_agg(p.proname, ', ') into v_leak
    from pg_proc p
   where p.pronamespace = 'public'::regnamespace and p.prokind in ('f','p')
     and p.prorettype <> 'trigger'::regtype
     and has_function_privilege('anon', p.oid, 'EXECUTE')
     and not (p.proname = any(v_anon_ok));
  if v_leak is not null then
    v_msgs := array_append(v_msgs, 'פונקציות פתוחות ל-anon מחוץ לרשימה: ' || v_leak);
  end if;

  -- 164: הבונה של הדף האישי פנימי בלבד
  if has_function_privilege('authenticated', 'public.build_client_portal(text,text)', 'EXECUTE')
     or has_function_privilege('anon', 'public.build_client_portal(text,text)', 'EXECUTE') then
    v_msgs := array_append(v_msgs, 'build_client_portal פתוחה ל-anon/authenticated');
  end if;

  -- 160: השער לפונקציות חדשות קיים
  if not exists (select 1 from pg_event_trigger where evtname = 'p0_lock_new_functions' and evtenabled <> 'D') then
    v_msgs := array_append(v_msgs, 'event trigger p0_lock_new_functions חסר או מנוטרל');
  end if;

  if array_length(v_msgs, 1) > 0 then
    raise exception 'domain function invariants violated: %', array_to_string(v_msgs, ' | ');
  end if;
  return 'ok';
end;
$function$;

revoke execute on function public.assert_domain_function_invariants() from public, anon;
grant  execute on function public.assert_domain_function_invariants() to authenticated, service_role;

comment on function public.assert_domain_function_invariants() is
  'נופלת אם אחת מפונקציות הדומיין חזרה לגרסה ישנה/פגיעה או אם anon קיבל הרשאה מחוץ למשטח הציבורי. נקראת בסוף כל מיגרציה מ-164 והלאה ובשער הרגרסיה של האבטחה.';

select public.assert_domain_function_invariants();
