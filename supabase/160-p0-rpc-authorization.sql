-- ═══════════════════════════════════════════════════════════════════════════
--  160 — P0-A · הרשאות הרצה על פונקציות השרת
-- ═══════════════════════════════════════════════════════════════════════════
--  ‼ מה נמצא: כמעט כל פונקציה בסכימה public ניתנת להרצה על ידי anon — המפתח
--  הציבורי שכל דפדפן מוריד עם האתר. זו אינה בחירה של אף אחד: Supabase מגדירה
--  ALTER DEFAULT PRIVILEGES שמעניקה EXECUTE ל-anon על כל פונקציה חדשה, ובנוסף
--  ברירת המחדל של PostgreSQL עצמו מעניקה EXECUTE ל-PUBLIC. שתי ההענקות חיות
--  זו לצד זו, ולכן פונקציה נולדת פתוחה אלא אם מישהו זכר לסגור אותה במפורש.
--
--  התוצאה בפועל (נמדד על הפרודקשן): 85 פונקציות SECURITY DEFINER ניתנות
--  להרצה ע"י anon, מהן עשרות שכותבות למסד בלי לבדוק מי הקורא — יצירת
--  התקשרות לכל הצעה, סגירת שאלון לכל לקוח, שחרור תלויות, רישום אירועים.
--
--  ‼ מה הקובץ הזה **לא** עושה: הוא לא סוגר את הדפים הציבוריים. הדף האישי,
--  הצעת המחיר, השאלון, טופס הייצוג ומכתב השחרור חייבים לעבוד בלי התחברות —
--  הלקוח מגיע אליהם מקישור במייל. הם נשארים פתוחים ל-anon, וההרשאה שלהם
--  נשענת על הטוקן הסודי שבקישור, שכל אחת מהן מאמתת בגופה.
--
--  ‼ למה הסרה מ-authenticated אינה מספיקה ואינה נכונה כאן: כל מסכי המשרד
--  רצים כ-authenticated. הסרה גורפת הייתה שוברת את המערכת. לכן ההסרה
--  מ-authenticated נעשית רק על פונקציות שאומת שאין להן שום קורא מהדפדפן
--  ומהפונקציות הקצה — הן נקראות אך ורק מתוך פונקציות אחרות.
--
--  ‼ קריאה פנימית אינה נפגעת: פונקציה SECURITY DEFINER בבעלות postgres רצה
--  בהרשאות postgres, ולכן כל קריאה שהיא עושה לפונקציה אחרת נבדקת מול postgres
--  ולא מול הקורא המקורי. הסרת ההרשאה מ-anon/authenticated אינה שוברת שרשרת.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── ① המשטח הציבורי: הפונקציות שלקוח לא מחובר חייב להריץ ────────────────────
--  כל אחת מהן מקבלת טוקן ומאמתת אותו בגופה. זו הרשימה המלאה, והיא נגזרה
--  מקריאת כל קריאות ה-rpc בדפים הציבוריים (PublicQuotationPage, PublicIntake,
--  PublicIntakePage, PublicPortalPage, SpouseFillPage, OnboardingPage,
--  PublicReleasePage). כל מה שאינו כאן — נסגר.
--
--  ‼ שלוש פונקציות שהיו פתוחות ל-anon ואינן ברשימה, במכוון:
--    · release_portal_sign — הממשק אינו קורא לה יותר (החתימה על מכתב השחרור
--      בוטלה); היא נשארה בשרת ומאפשרת להפוך מכתב מבוטל ל"הושלם".
--    · submit_onboarding — גרסה ישנה בת 5 ארגומנטים; הדף קורא ל-_full.
--    · resolve_intake_token — אין לה קורא בשום מקום.

-- ── ② ההסרה + ההענקה מחדש, בלולאה אחת ───────────────────────────────────────
--  ‼ נכתב כלולאה ולא כ-117 שורות grant/revoke ידניות: חתימות הפונקציות כאן
--  ארוכות (submit_onboarding_full לבדה מקבלת 22 ארגומנטים), והעתקה ידנית
--  שלהן היא בדיוק המקום שבו טעות דפוס אחת משאירה פונקציה פתוחה בלי שאיש
--  ישים לב. regprocedure מייצר את החתימה מהמסד עצמו.
do $$
declare
  -- מותר ל-anon: הדפים שהלקוח פותח מקישור במייל, כולם מאומתי-טוקן.
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
  -- ‼ נסגר גם בפני authenticated. הרשימה הזו אינה "ליתר ביטחון" — כל פונקציה
  -- כאן **אינה בודקת בעלות בכלל**: היא מקבלת מזהה (לקוח / שלב / התקשרות /
  -- הצעה) ופועלת עליו בלי לשאול של מי הוא. הסרת anon לבדה לא הייתה מספיקה,
  -- כי משתמש מחובר-אך-לא-מורשה (יש שניים כאלה בפרודקשן) היה עדיין יכול
  -- לקרוא להן על נתונים של אחר. הכי חמורה: unlock_dependent_steps, שמגיעה
  -- דרך execute_automatic_step עד שליחת מייל אמיתי ללקוח של מישהו אחר.
  --
  -- ‼ אומת אחד-אחד שאין להן קורא מהדפדפן. ארבע מהן נקראות מפונקציית הקצה
  -- portal-upload-document — אבל היא משתמשת במפתח service_role, שאינו מושפע
  -- מהסרת ההרשאה מ-authenticated.
  v_internal_only text[] := array[
    'add_intake_questionnaire_step', 'close_intake_step_for_client',
    'copy_lead_facts_to_client', 'create_deferred_collection_tasks',
    'create_engagement_for_quotation', 'generate_onboarding_steps',
    'generate_onboarding_steps_v1', 'release_requests_held_until_approval',
    'sync_paperless_tax_authority_step', 'sync_representation_upgrade_step',
    'ensure_prev_accountant_removed_label', 'sync_prev_accountant_removed_label',
    'align_unsent_release_drafts', 'normalize_unsent_draft_catalog',
    'split_prev_accountant_material_items', 'open_quotation_representation',
    'resolve_intake_token', 'submit_onboarding', 'release_portal_sign',
    '__dump_function_defs', 'public_link_health', 'domain_consistency_report',
    'client_intake_state', 'derive_lifecycle_stage', 'intake_accepts_required',
    'open_intake_engagement_id',
    -- ‼ התוספת שנמצאה בסקירת הבעלות: כתיבה חוצת-בעלים בלי שום בדיקה.
    'unlock_dependent_steps',            -- ומשם: execute_automatic_step ⇒ מייל יוצא
    'log_onboarding_event',              -- זיוף ציר הזמן של כל משרד
    'ensure_prev_accountant_folder',     -- p_user_id מגיע מהקורא כמו שהוא
    'ensure_prev_accountant_label',
    'apply_due_engagement_transitions',  -- בלי ארגומנטים כלל: סורקת את כל הדיירים
    'seed_office_journey_defaults',
    -- קריאה בלבד, אבל חושפת מזהים ומצבים של לקוחות של אחרים.
    'onboarding_close_readiness', 'portal_lock_reason',
    'onboarding_dependency_met', 'current_engagement_id', 'resolve_client_kind',
    -- מוגנות היטב, אבל אין להן קורא מהדפדפן — אין סיבה שיהיו פתוחות.
    'publish_onboarding_request', 'reorder_onboarding_steps',
    'set_onboarding_step_stage'
  ];
  r record;
  v_anon int := 0; v_closed int := 0;
begin
  for r in
    select p.oid::regprocedure as sig, p.proname
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prokind in ('f', 'p')
       and p.prorettype <> 'trigger'::regtype
  loop
    -- ברירת המחדל החדשה: סגור. שתי ההענקות האוטומטיות מוסרות יחד.
    execute format('revoke execute on function %s from public, anon', r.sig);

    if r.proname = any(v_anon_ok) then
      execute format('grant execute on function %s to anon, authenticated', r.sig);
      v_anon := v_anon + 1;
    elsif r.proname = any(v_internal_only) then
      execute format('revoke execute on function %s from authenticated', r.sig);
      v_closed := v_closed + 1;
    end if;
  end loop;

  raise notice 'anon: % פונקציות ציבוריות; נסגרו גם ל-authenticated: %', v_anon, v_closed;
end $$;

-- ‼ נקראת מתוך טריגר assign_quotation_number שהוא SECURITY INVOKER — כלומר
-- רץ בהרשאות מי שמכניס את שורת ההצעה. בלי ההענקה הזו יצירת הצעת מחיר במשרד
-- נשברת. זו הפונקציה היחידה בסכימה שנמצאת במצב הזה.
grant execute on function public.next_quotation_number(uuid) to authenticated;

-- ── ③ ברירת המחדל לפונקציות עתידיות ────────────────────────────────────────
--  ‼ בלי שתי השורות האלה כל התיקון למעלה הוא חד-פעמי: המיגרציה הבאה שתיצור
--  פונקציה תקבל שוב EXECUTE ל-anon ול-PUBLIC אוטומטית, ונחזור בדיוק לאותו
--  מצב. שתיהן נדרשות — האחת מנטרלת את ברירת המחדל של Supabase, השנייה את
--  ברירת המחדל של PostgreSQL עצמו.
--
--  ‼ 'for role postgres' הוא הנכון כאן: המיגרציות רצות דרך ה-Management API
--  כ-postgres (אומת: current_user = postgres), וכל הפונקציות בסכימה בבעלותו.
alter default privileges for role postgres in schema public
  revoke execute on functions from anon;
alter default privileges for role postgres in schema public
  revoke execute on functions from public;

-- ‼ שתי השורות שלמעלה אינן מספיקות, ונבדק בפועל: הן מסירות את ההענקה
-- המפורשת ל-anon, אבל **לא** את הענקת ברירת המחדל המובנית של PostgreSQL
-- ל-PUBLIC. פונקציה חדשה עדיין נולדה עם '=X/postgres', ו-anon יורש EXECUTE
-- דרך PUBLIC. נמדד על סביבת הבדיקות: פונקציית בדיקה טרייה נוצרה כשהיא
-- ניתנת להרצה ע"י anon למרות ה-ALTER.
--
-- לכן השער האמיתי הוא event trigger שרץ בסוף כל CREATE FUNCTION ומסיר את
-- ההענקה ל-PUBLIC. זה מונע, ולא רק מתריע.
--
-- ‼ הוא מסיר **רק** מ-PUBLIC ולעולם לא מ-anon. הסיבה קריטית: התג
-- 'CREATE FUNCTION' חל גם על CREATE OR REPLACE, וכל פריסה מחדש של
-- approve_quotation או של פונקציות הדף האישי הייתה מנתקת אותן מהלקוחות.
-- נבדק בסביבת הבדיקות: הענקה מפורשת ל-anon שורדת CREATE OR REPLACE, ולכן
-- הסרת PUBLIC בלבד היא בדיוק הגבול הנכון.
create or replace function public.__p0_lock_new_functions()
returns event_trigger
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare r record;
begin
  for r in select * from pg_event_trigger_ddl_commands() loop
    if r.schema_name = 'public' and r.object_type = 'function' then
      execute format('revoke execute on function %s from public', r.object_identity);
    end if;
  end loop;
end
$fn$;

comment on function public.__p0_lock_new_functions() is
  'שער ברירת המחדל: מסיר EXECUTE מ-PUBLIC מכל פונקציה חדשה בסכימה public. אינו נוגע ב-anon כדי לא לנתק את הדפים הציבוריים בפריסה חוזרת. ראה מיגרציה 160.';

-- ‼ השער נועל את עצמו. הפונקציה הזו נוצרת **אחרי** לולאת הנעילה שלמעלה,
-- ולכן היא עצמה נולדת עם ההרשאה האוטומטית — והשער שבסוף הקובץ תפס בדיוק
-- את זה בהרצה הראשונה על הפרודקשן. אין לה קורא חיצוני: היא מופעלת ע"י
-- מנגנון ה-event trigger בהרשאות הבעלים, ולכן היא נסגרת בפני כולם.
revoke execute on function public.__p0_lock_new_functions() from public, anon, authenticated;

drop event trigger if exists p0_lock_new_functions;
create event trigger p0_lock_new_functions on ddl_command_end
  when tag in ('CREATE FUNCTION')
  execute function public.__p0_lock_new_functions();

-- ── ③½ שתי פונקציות שחייבות להישאר פתוחות למשרד — ולכן צריכות שער בגוף ─────

-- ‼ refresh_lifecycle_stage_for נקראת מהדפדפן (App.tsx) ולכן אי אפשר לסגור
-- אותה, והיא כותבת ל-clients בלי לבדוק בעלות. השער נבנה כך שלא ישבור את
-- הקריאות הפנימיות: היא נקראת גם מטריגרים שרצים בזמן כתיבה של לקוח מהדף
-- הציבורי, ושם auth.uid() ריק לגמרי כי אין משתמש מחובר. לכן — בודקים בעלות
-- רק כשיש משתמש מחובר. anon כבר אינו יכול לקרוא לה בכלל אחרי סעיף ②.
create or replace function public.refresh_lifecycle_stage_for(p_client_id text)
returns text
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_stage text;
  v_uid   uuid := auth.uid();
  v_owner uuid;
begin
  if p_client_id is null then return null; end if;

  select user_id into v_owner from public.clients where id = p_client_id;
  if v_owner is null then return null; end if;
  -- משתמש מחובר רשאי לרענן רק לקוח שלו. מסלול מערכת (uid ריק) ממשיך כרגיל.
  if v_uid is not null and v_owner <> v_uid then return null; end if;

  v_stage := public.derive_lifecycle_stage(p_client_id);
  if v_stage is null then return null; end if;
  update public.clients set lifecycle_stage = v_stage
    where id = p_client_id and lifecycle_stage is distinct from v_stage;
  return v_stage;
end;
$function$;

grant execute on function public.refresh_lifecycle_stage_for(text) to authenticated, service_role;

-- ‼ ensure_institution_alignment_steps — הגוף שהיה כאן הוסר במכוון (מיגרציה 164).
-- הגרסה הסמכותית יושבת במיגרציה 163 (הבעלים נגזר מהלקוח + שער התקשרות).
-- שני גופים לאותה פונקציה בשני קבצים הם מלכודת סדר: הרצה חוזרת של 160 אחרי
-- 163 החזירה את הגרסה הישנה בסביבת הבדיקות. מעכשיו לפונקציה יש בית אחד,
-- ו-assert_domain_function_invariants() (164) נופלת אם הגרסה הישנה חוזרת.
-- ההרשאה לבדה נשארת כאן כי הלולאה למעלה הסירה אותה מ-PUBLIC/anon.
grant execute on function public.ensure_institution_alignment_steps(text, text, boolean) to authenticated, service_role;

-- ── ④ שער אימות: המצב הסופי נבדק כאן ולא בעין ──────────────────────────────
--  אם משהו בלולאה לא תפס, המיגרציה נופלת ולא מדווחת הצלחה.
do $$
declare
  v_leak text;
begin
  select string_agg(p.proname, ', ')
    into v_leak
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prokind in ('f', 'p')
     and p.prorettype <> 'trigger'::regtype
     and has_function_privilege('anon', p.oid, 'EXECUTE')
     and p.proname not in (
       'get_quotation', 'mark_quotation_viewed', 'approve_quotation',
       'start_intake', 'save_intake_answer', 'get_intake', 'reopen_intake',
       'get_client_portal', 'portal_submit_step',
       'get_onboarding', 'submit_onboarding_full', 'submit_signature',
       'request_spouse_onboarding',
       'get_spouse_onboarding', 'submit_spouse_onboarding',
       'get_release_portal', 'release_portal_set_item', 'release_portal_respond',
       'release_portal_remove_upload', 'release_portal_mark_items');

  if v_leak is not null then
    raise exception 'נותרו פונקציות פתוחות ל-anon מחוץ לרשימה: %', v_leak;
  end if;
end $$;

-- ‼ ובדיקה שנייה: שפונקציה חדשה באמת נולדת סגורה. בלי זה היינו מסתמכים על
-- ALTER DEFAULT PRIVILEGES שכבר הוכח שאינו מספיק לבדו.
do $$
declare v_open boolean;
begin
  execute 'create or replace function public.__p0_selftest() returns int language sql as $q$ select 1 $q$';
  select has_function_privilege('anon', 'public.__p0_selftest()', 'EXECUTE') into v_open;
  execute 'drop function public.__p0_selftest()';
  if v_open then
    raise exception 'ברירת המחדל לא נאכפת: פונקציה חדשה עדיין ניתנת להרצה ע"י anon';
  end if;
  raise notice 'ברירת המחדל נאכפת: פונקציה חדשה נולדת סגורה ל-anon ול-PUBLIC';
end $$;

comment on schema public is
  'פונקציות נולדות סגורות. ברירת המחדל מסירה EXECUTE מ-anon ומ-PUBLIC (מיגרציה 160) — פונקציה חדשה שצריכה להיקרא מהדפדפן חייבת grant מפורש, ופונקציה שנקראת מקישור ציבורי חייבת גם לאמת טוקן בגופה.';
