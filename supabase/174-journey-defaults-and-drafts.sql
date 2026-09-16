-- ═══════════════════════════════════════════════════════════════════════════
--  174 — ברירת המחדל של המשרד מכובדת בכל בקשה; טיוטות, תבניות ו«דורש טיפול»
-- ═══════════════════════════════════════════════════════════════════════════
--  ספר הפערים (ביקורת 09.09.2026), אשכול H. הכלל המשותף לכל הסעיפים: מסך
--  שמבטיח משהו — השרת מקיים אותו; וכל שאלה נענית בפונקציה אחת.
--
--  ‼ מה נקבע כאן, בקצרה:
--   1. JF18 · המחולל קורא מהצילום את **כל** מה שהמסך «בקשות מסמכים» עורך:
--      קיום (enabled/היעדר), מקום (sortIndex), חובה/רשות (requiredForClose),
--      יעד (dueInDays) ותלות (dependsOn) — לכל בקשת קטלוג, כולל «עדכון סטטוס
--      מס» (intake_questionnaire) שנולדה עד היום מפונקציה אחות שלא ידעה על
--      הצילום. עבודת מערכת (ייצוג, הכרת לקוח, פתיחת תיקים, הקמה פנימית,
--      ביקורת חודש ראשון) נשארת בכוונה מחוץ לרשומות (135 §"מה לא נכנס") —
--      היא מכונת מצב או עבודה פנימית, לא בקשה; המסך אומר את זה במגירה
--      «עבודה פנימית שנוצרת גם כן».
--   2. JF19 · צילום תמיד. כשסוג הלקוח אינו ניתן להכרעה (אין תבנית להצעה ואין
--      סיווג בכרטיס) נופלים ל-'licensed_dealer' — קבוצת-העל של המסלול
--      (החיבור לרשות המסים ממילא מסונן בעובדה licensed). משרד בלי שורה נזרע
--      במקום; משתמש בלי משרד מקבל את זריעת הקוד. העובדה kindFallback נרשמת.
--   3. JF4 · «מוחזק עד אישור ההצעה» הוא פרדיקט אחד —
--      requests_held_until_approval — שגם המחולל וגם create_onboarding_request
--      קוראים. לפני שנמכר (lead/quoted) בקשה נולדת מוחזקת; ללקוח בקליטה או
--      פעיל היא נולדת מפורסמת ושער התהליך (process_published_at, מיגרציה 77)
--      מסתיר אותה עד «עדכן את דף הלקוח». זו ההתנהגות המכוונת (77 §1, 135).
--   4. JF25 · רשימת החומרים מהרו"ח הקודם היא פונקציה אחת —
--      default_materials_checklist — שגם המחולל וגם create_onboarding_request
--      (כשה-payload בא בלי רשימה) קוראים. אין יותר שלב שנולד ריק.
--   5. JF12 · «הוסרה ⇒ לא נולדת מחדש» (117) נעשה כלל אחד לכל סוג בנפרד —
--      step_removed_by_office — במקום שלישייה מצומדת ושתי בקשות בלבד.
--      'cancelled' הוא תמיד החלטת משרד (מסלול הפייפרלס משתמש ב-skipped).
--      חזרה = הוספה ידנית מ«+ בקשה», ששם היא זמינה תמיד.
--   6. JF2 · «בטל שינויים» מנקה draft_payload גם על בקשה שטרם פורסמה —
--      publish_case_changes ממזג אותה בכל מקרה, ולכן להשאיר אותה היה שינוי
--      שקט שהיה מתפרסם בפעם הבאה.
--   7. JF14 · תבנית מסע נשמרת מה-payload האפקטיבי (טיוטה מעל פרסום) ורק
--      לסוגים שה-creator יודע ליצור (request_creatable_step_types); ההחלה
--      מדווחת מה דולג ולמה (skippedEntries).
--   8. JF22/23 · «דורש טיפול»: המקור מסומן על ה-payload (attentionSource
--      manual/derived). המשימה הלילית אינה מחזירה דגל שהמשרד כיבה כל עוד השלב
--      לא השתנה מאז (attentionDismissedAt ≥ updated_at), ואינה מכבה דגל ידני
--      על שלב פתוח. כיבוי בסטטוס סופי נשאר — כמו advance/_set_step_status.
--   9. JF21 · sort_order נקבע ברגע הלידה מהצילום, לכל שלב; אין יותר "תיקון
--      אחרי" שמזהה לפי 0.
--
--  ‼ 172 (סוכן מקביל) היא הבעלים הקודם של add_intake_questionnaire_step;
--  הגוף כאן נכתב מהטקסט שלה (published_at ריק, בלי payload.published) ולא
--  מהפרודקשן. generate_onboarding_steps, save/apply_journey_template נכתבים
--  מהטקסט של 167; discard_case_changes מ-101; create_onboarding_request מ-155;
--  refresh_onboarding_attention ו-set_step_attention מהפרודקשן (live-2026-09-04).
-- ═══════════════════════════════════════════════════════════════════════════

-- ── ① פרדיקטים ופונקציות-אמת ──────────────────────────────────────────────

-- JF4 · "עוד לא נמכר כלום" — הגבול היחיד שבו בקשה נולדת מוחזקת (135).
create or replace function public.requests_held_until_approval(p_client_id text)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select public.derive_lifecycle_stage(p_client_id) in ('lead', 'quoted');
$function$;

revoke execute on function public.requests_held_until_approval(text) from public, anon, authenticated;
grant  execute on function public.requests_held_until_approval(text) to service_role;

-- JF12 · 'cancelled' = המשרד הסיר. המחולל אינו מחזיר את מה שהוסר.
create or replace function public.step_removed_by_office(p_client_id text, p_step_type text)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select exists (
    select 1 from public.onboarding_steps s
     where s.client_id = p_client_id
       and s.step_type = p_step_type
       and s.status = 'cancelled');
$function$;

revoke execute on function public.step_removed_by_office(text, text) from public, anon, authenticated;
grant  execute on function public.step_removed_by_office(text, text) to service_role;

-- JF25 · הקטלוג של היום (127 / RELEASE_MATERIALS ב-releaseLetter.ts). המכתב
-- שיוצא בפועל מחליף את הרשימה במה שנתבקש (syncRequestedMaterials) — זו
-- ברירת המחדל עד אז, ולכן היא חייבת להיות זהה למה שהמכתב מציע.
-- ‼ חייב להישאר זהה ל-RELEASE_MATERIALS ב-src/utils/releaseLetter.ts.
create or replace function public.default_materials_checklist()
returns jsonb
language sql
immutable
as $function$
  select jsonb_build_array(
    jsonb_build_object('key','uniform_file',       'label','קובץ מבנה אחיד - השנה','done',false),
    jsonb_build_object('key','uniform_file_prev',  'label','קובץ מבנה אחיד - שנה קודמת','done',false),
    jsonb_build_object('key','pnl_current',        'label','כרטסת רווח והפסד באקסל - השנה','done',false),
    jsonb_build_object('key','pnl_prev',           'label','כרטסת רווח והפסד באקסל - שנה קודמת','done',false),
    jsonb_build_object('key','ledgers',            'label','כרטסות הנהלת חשבונות','done',false),
    jsonb_build_object('key','depreciation',       'label','טופס פחת','done',false),
    jsonb_build_object('key','last_return',        'label','דוח שנתי אחרון','done',false),
    jsonb_build_object('key','capital_declaration','label','הצהרת הון אחרונה','done',false),
    jsonb_build_object('key','trial_balance',      'label','מאזן בוחן','done',false));
$function$;

revoke execute on function public.default_materials_checklist() from public, anon;
grant  execute on function public.default_materials_checklist() to authenticated, service_role;

-- JF14 · הסוגים ש-create_onboarding_request יודעת ליצור. רשימה אחת — היוצר,
-- שמירת תבנית והחלת תבנית קוראים ממנה.
create or replace function public.request_creatable_step_types()
returns text[]
language sql
immutable
as $function$
  select array['client_documents','prev_accountant_details','custom_request',
               'paperless_invite','paperless_connection','paperless_tax_authority',
               'rep_client_approval','retainer_authorization',
               'release_letter','materials_received','file_opening',
               'intake_questionnaire','kyc_identification','internal_setup'];
$function$;

revoke execute on function public.request_creatable_step_types() from public, anon;
grant  execute on function public.request_creatable_step_types() to authenticated, service_role;

-- JF18 · שני קוראי צילום שחסרו ל-135: יעד ותלות.
create or replace function public.journey_default_due_date(p_snapshot jsonb, p_step_type text)
returns date
language sql
stable
as $function$
  select case
    when (public.journey_default_entry(p_snapshot, p_step_type)->>'dueInDays') ~ '^\d+$'
      then current_date + (public.journey_default_entry(p_snapshot, p_step_type)->>'dueInDays')::int
    else null end;
$function$;

/**
 * סוג השלב שהבקשה תלויה בו. אין צילום ⇒ חיווט הקוד (p_fallback); יש צילום
 * ואין רשומה (עבודת מערכת) ⇒ גם כן חיווט הקוד; יש רשומה ⇒ מה שכתוב בה —
 * ו-null ברשומה פירושו "בלי תלות". התנאי העסקי (למשל: המכתב תלוי בשאלה רק
 * כשאין מייל) נשאר במחולל — הצילום אומר *במה*, המחולל אומר *האם*.
 */
create or replace function public.journey_default_depends_on(
  p_snapshot jsonb, p_step_type text, p_fallback text)
returns text
language sql
immutable
as $function$
  select case
    when p_snapshot is null or jsonb_typeof(p_snapshot) <> 'array' then p_fallback
    when public.journey_default_entry(p_snapshot, p_step_type) is null then p_fallback
    else nullif(public.journey_default_entry(p_snapshot, p_step_type)->>'dependsOn', '')
  end;
$function$;

revoke execute on function public.journey_default_due_date(jsonb, text)          from public, anon;
revoke execute on function public.journey_default_depends_on(jsonb, text, text)  from public, anon;
grant  execute on function public.journey_default_due_date(jsonb, text)          to authenticated, service_role;
grant  execute on function public.journey_default_depends_on(jsonb, text, text)  to authenticated, service_role;

-- JF19 · סוג לקוח תמיד. 'licensed_dealer' הוא המסלול המלא; מה שאינו רלוונטי
-- מסונן בעובדות (licensed, monthly, has_prev) ולא בסוג.
create or replace function public.resolve_journey_default_kind(p_quotation_id text, p_client_id text)
returns text
language sql
stable
security definer
set search_path to 'public'
as $function$
  select coalesce(public.resolve_client_kind(p_quotation_id, p_client_id), 'licensed_dealer');
$function$;

revoke execute on function public.resolve_journey_default_kind(text, text) from public, anon, authenticated;
grant  execute on function public.resolve_journey_default_kind(text, text) to service_role;

-- ── ② לידת שלב אחד לפי הצילום — הנתיב האחד של המחולל ─────────────────────
--  כל שלב שהמחולל מוליד עובר כאן: חובה/רשות, יעד, מקום, תלות, פרסום/החזקה.
--  ‼ אינו בודק enabled ואינו בודק קיום — זו החלטת המחולל (התנאי העסקי);
--  כאן רק "איך נולד" ולא "האם נולד".
create or replace function public._generate_step(
  p_user_id uuid, p_engagement_id text, p_client_id text, p_snapshot jsonb,
  p_step_type text, p_track text, p_scope text, p_ball text, p_payload jsonb,
  p_required_fallback boolean, p_dep_fallback text, p_dep_applies boolean,
  p_hold boolean, p_open_status text, p_due_override date, p_dry_run boolean)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_dep_type text;
  v_dep      public.onboarding_steps%rowtype;
  v_status   text := coalesce(p_open_status, 'pending');
  v_id       text;
begin
  v_dep_type := public.journey_default_depends_on(p_snapshot, p_step_type, p_dep_fallback);
  if p_dep_applies and v_dep_type is not null then
    select * into v_dep from public.onboarding_steps
     where client_id = p_client_id and step_type = v_dep_type and status <> 'cancelled'
     order by created_at desc limit 1;
    if v_dep.id is not null
       and not public.step_satisfies_dependency(v_dep.status, v_dep.payload) then
      v_status := 'locked';
    end if;
  end if;

  if not p_dry_run then
    insert into public.onboarding_steps
      (user_id, engagement_id, client_id, step_type, track, scope, status, ball,
       required_for_close, due_date, sort_order, depends_on_step_id, payload, published_at)
    values
      (p_user_id, p_engagement_id, p_client_id, p_step_type, p_track, p_scope, v_status, p_ball,
       public.journey_default_required(p_snapshot, p_step_type, p_required_fallback),
       coalesce(p_due_override, public.journey_default_due_date(p_snapshot, p_step_type)),
       public.journey_default_order(p_snapshot, p_step_type),
       case when p_dep_applies then v_dep.id end,
       coalesce(p_payload, '{}'::jsonb)
         -- JF3: published_at הוא הסימון היחיד לפרסום; אין יותר payload.published.
         || case when p_hold then jsonb_build_object('heldUntilApproval', true)
                 else '{}'::jsonb end,
       case when p_hold then null else now() end)
    returning id into v_id;
  end if;

  return jsonb_build_object('stepId', v_id, 'status', v_status,
                            'dependsOn', case when p_dep_applies and v_dep.id is not null then v_dep_type end);
end;
$function$;

revoke execute on function public._generate_step(uuid, text, text, jsonb, text, text, text, text, jsonb, boolean, text, boolean, boolean, text, date, boolean)
  from public, anon, authenticated;
grant  execute on function public._generate_step(uuid, text, text, jsonb, text, text, text, text, jsonb, boolean, text, boolean, boolean, text, date, boolean)
  to service_role;

-- ── ③ המחולל ──────────────────────────────────────────────────────────────
--  התנאים העסקיים (מתי בקשה נולדת) זהים ל-167. מה שהשתנה: איך היא נולדת
--  (②), הצילום תמיד (JF19), ההסרה לפי סוג (JF12), הרשימה מ-④ (JF25).
create or replace function public.generate_onboarding_steps(p_engagement_id text, p_dry_run boolean default false)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  e            public.engagements%rowtype;
  q            public.quotations%rowtype;
  v_items      jsonb;
  v_has_monthly boolean := false;
  v_has_paperless boolean := false;
  v_needs_paperless boolean := false;
  v_has_rep    boolean := false;
  v_has_prev   boolean := false;
  v_new_business boolean := false;
  v_client     public.clients%rowtype;
  v_planned    jsonb := '[]'::jsonb;
  v_created    int := 0;
  v_id_conn    text;
  v_id_prevdet text;
  v_no_paperless boolean := false;
  v_conn_done  boolean := false;
  v_needs_prevdet boolean := false;
  v_docs       jsonb;
  v_licensed   boolean := false;
  v_kind       text;
  v_kind_fallback boolean := false;
  v_snap       jsonb;
  v_facts      jsonb;
  v_var        jsonb;
  v_prev_known boolean;
  v_fresh      boolean;
  v_office     uuid;
  v_oentry     jsonb;
  v_opayload   jsonb;
  v_ores       jsonb;
  v_hold       boolean := false;
  v_r          jsonb;
begin
  select * into e from public.engagements where id = p_engagement_id;
  if e.id is null then return jsonb_build_object('ok', false, 'error', 'engagement_not_found'); end if;

  select * into q from public.quotations where id = e.quotation_id;
  select * into v_client from public.clients where id = e.client_id;

  v_items := coalesce(q.snapshot->'items', q.items, '[]'::jsonb);

  select
    bool_or(coalesce(it->>'category','') = 'monthly'),
    bool_or(coalesce(it->>'name','') ilike '%הנהלת חשבונות%'
         or coalesce(it->>'name','') ilike '%פייפרלס%'
         or coalesce(it->>'name','') ilike '%paperless%')
  into v_has_monthly, v_has_paperless
  from jsonb_array_elements(v_items) it;

  v_has_monthly   := coalesce(v_has_monthly, false);
  v_has_paperless := coalesce(v_has_paperless, false);

  v_no_paperless := coalesce(v_client.paperless_status, '') = 'not_applicable';
  v_needs_paperless := (v_has_monthly or v_has_paperless) and not v_no_paperless;

  -- ‼ עוסק מורשה וחברה בלבד: מספר הקצאה נדרש לחשבונית מס, ועוסק פטור אינו
  -- מוציא כזו. תבנית ההצעה היא ההכרעה; סוג העוסק שעל הכרטיס הוא הגיבוי
  -- כשההצעה נבנתה בלי תבנית. אין אף אחד מהם ⇒ לא מנחשים, והבקשה נשארת
  -- זמינה ידנית מ"+ בקשה חדשה".
  select coalesce(t.kind in ('licensed_dealer','company'), false)
    into v_licensed
    from public.quotation_templates t where t.id = q.template_id;
  v_licensed := coalesce(v_licensed, false)
                or coalesce(v_client.dealer_type, '') in ('licensed','company')
                or coalesce(v_client.vat_status, '') = 'authorizedDealer';

  v_has_rep := coalesce(q.representation_request_id, v_client.representation_request_id) is not null;

  v_has_prev := v_client.has_previous_accountant;
  if v_has_prev is null then
    select l.has_previous_accountant into v_has_prev
      from public.leads l where l.converted_client_id = e.client_id limit 1;
  end if;
  if v_has_prev is null and q.lead_id is not null then
    select l.has_previous_accountant into v_has_prev
      from public.leads l where l.id = q.lead_id limit 1;
  end if;
  v_has_prev := coalesce(v_has_prev, false);

  v_prev_known := v_client.has_previous_accountant;
  if v_prev_known is null then
    select l.has_previous_accountant into v_prev_known
      from public.leads l where l.converted_client_id = e.client_id limit 1;
  end if;
  if v_prev_known is null and q.lead_id is not null then
    select l.has_previous_accountant into v_prev_known
      from public.leads l where l.id = q.lead_id limit 1;
  end if;
  v_fresh := not exists (select 1 from public.onboarding_steps where engagement_id = e.id);
  if v_fresh then
    v_new_business := (v_prev_known is false) or (v_client.business_transfer is false);
  else
    v_new_business := coalesce(v_client.business_transfer, not v_has_prev) = false and v_has_prev = false
                      and v_client.business_transfer is not null;
  end if;

  v_needs_prevdet := nullif(trim(coalesce(v_client.prev_accountant_email, '')), '') is null;

  -- JF4 · פרדיקט אחד. התקשרות בקליטה ⇒ השלב 'onboarding' ⇒ לא מוחזק; הכלל
  -- כתוב כאן כדי שלא יהיו שני ניסוחים, לא כי המצב האחר נגיש היום.
  v_hold := public.requests_held_until_approval(e.client_id);

  -- ‼ גבול מחזור החיים במפורש: רק התקשרות שאין לה עדיין שום שלב
  -- מקבלת צילום. מסע שכבר התחיל ממשיך לפי מה שנולד איתו, ולכן עריכה
  -- עתידית של ברירת המחדל אינה נוגעת בו (הכרעת גיא 2026-08-25).
  v_facts := jsonb_build_object(
    'monthly', v_has_monthly, 'paperless', v_has_paperless,
    'licensed', v_licensed, 'rep', v_has_rep, 'has_prev', v_has_prev,
    'new_business', v_new_business, 'no_prev_email', v_needs_prevdet);

  v_snap := e.journey_default_snapshot;
  if v_snap is null and v_fresh then
    -- JF19 · צילום תמיד: סוג נופל-אחורה, משרד נזרע אם חסר, ובלי משרד — זריעת הקוד.
    v_kind := public.resolve_client_kind(e.quotation_id, e.client_id);
    v_kind_fallback := v_kind is null;
    v_kind := public.resolve_journey_default_kind(e.quotation_id, e.client_id);
    select office_id into v_office from public.profiles where id = e.user_id;
    if v_office is not null then
      select d.entries into v_snap from public.office_journey_defaults d
       where d.office_id = v_office and d.client_kind = v_kind;
      if v_snap is null and not p_dry_run then
        perform public.seed_office_journey_defaults(v_office);
        select d.entries into v_snap from public.office_journey_defaults d
         where d.office_id = v_office and d.client_kind = v_kind;
      end if;
    end if;
    if v_snap is null then
      v_snap := public.default_journey_entries(v_kind);
    end if;
    v_facts := v_facts || jsonb_build_object('kind', v_kind, 'kindFallback', v_kind_fallback);
    if not p_dry_run then
      update public.engagements
         set journey_default_snapshot = v_snap, journey_default_facts = v_facts
       where id = e.id;
    end if;
  elsif e.journey_default_facts is not null then
    v_facts := e.journey_default_facts;   -- הרצה חוזרת: דטרמיניזם
  end if;

  -- ── עבודת מערכת (סיווג C ב-135): לא ברשומות, לא נכבית מהמסך ───────────────
  -- JF12 · גם כאן: מה שהמשרד הסיר אינו נולד מחדש בהרצה חוזרת.
  if v_has_rep then
    if not exists (select 1 from public.onboarding_steps
                    where client_id = e.client_id and step_type = 'representation' and status <> 'cancelled')
       and not public.step_removed_by_office(e.client_id, 'representation') then
      v_r := public._generate_step(e.user_id, e.id, e.client_id, v_snap,
               'representation', 'authorities', 'person', 'me', '{}'::jsonb,
               true, null, false, v_hold, 'in_progress', null, p_dry_run);
      v_planned := v_planned || jsonb_build_object('step_type','representation','track','authorities','scope','person','status', v_r->>'status');
      if not p_dry_run then v_created := v_created + 1; end if;
    end if;

    if not exists (select 1 from public.onboarding_steps
                    where client_id = e.client_id and step_type = 'kyc_identification' and status <> 'cancelled')
       and not public.step_removed_by_office(e.client_id, 'kyc_identification') then
      v_r := public._generate_step(e.user_id, e.id, e.client_id, v_snap,
               'kyc_identification', 'internal', 'person', 'me', '{}'::jsonb,
               true, null, false, v_hold, 'pending', null, p_dry_run);
      v_planned := v_planned || jsonb_build_object('step_type','kyc_identification','track','internal','scope','person','status', v_r->>'status');
      if not p_dry_run then v_created := v_created + 1; end if;
    end if;
  end if;

  if v_new_business then
    if not exists (select 1 from public.onboarding_steps
                    where client_id = e.client_id and step_type = 'file_opening' and status <> 'cancelled')
       and not public.step_removed_by_office(e.client_id, 'file_opening') then
      v_r := public._generate_step(e.user_id, e.id, e.client_id, v_snap,
               'file_opening', 'authorities', 'person', 'me',
               jsonb_build_object('checklist', jsonb_build_array(
                 jsonb_build_object('key','vat','label','פתיחת תיק מעמ','done',false),
                 jsonb_build_object('key','income_tax','label','פתיחת תיק מס הכנסה','done',false),
                 jsonb_build_object('key','ni','label','פתיחת תיק ביטוח לאומי','done',false))),
               true, null, false, v_hold, 'pending', null, p_dry_run);
      v_planned := v_planned || jsonb_build_object('step_type','file_opening','track','authorities','scope','person','status', v_r->>'status');
      if not p_dry_run then v_created := v_created + 1; end if;
    end if;
  end if;

  -- ── מסמכים מהלקוח ────────────────────────────────────────────────────────────
  -- הרשימה נגזרת מסוג הלקוח: מי שעובר מרו"ח מתבקש את מה שיש לו ביד; עסק חדש
  -- מתבקש את תעודות הפתיחה. הרו"ח יכול לערוך את הרשימה בבונה התהליך.
  if not exists (select 1 from public.onboarding_steps
                  where client_id = e.client_id and step_type = 'client_documents' and status <> 'cancelled')
     and not public.step_removed_by_office(e.client_id, 'client_documents')
     and public.journey_default_enabled(v_snap, 'client_documents') then
    v_var := public.journey_default_variant(v_snap, 'client_documents', v_facts);
    if v_var is not null then
      v_docs := public.journey_default_checklist(v_var);
    elsif v_new_business then
      v_docs := jsonb_build_array(
        jsonb_build_object('key','vat_cert','label','תעודת עוסק','done',false),
        jsonb_build_object('key','id_card','label','צילום תעודת זהות','done',false),
        jsonb_build_object('key','bank_confirm','label','אישור ניהול חשבון בנק','done',false));
    elsif v_has_prev then
      v_docs := jsonb_build_array(
        jsonb_build_object('key','bank_confirm','label','אישור ניהול חשבון בנק','done',false),
        jsonb_build_object('key','last_return','label','דוח שנתי אחרון','done',false),
        jsonb_build_object('key','form106','label','טופס 106','done',false));
    else
      v_docs := jsonb_build_array(
        jsonb_build_object('key','id_card','label','צילום תעודת זהות','done',false),
        jsonb_build_object('key','bank_confirm','label','אישור ניהול חשבון בנק','done',false));
    end if;

    v_r := public._generate_step(e.user_id, e.id, e.client_id, v_snap,
             'client_documents', 'tools', 'person', 'client',
             jsonb_build_object(
               'checklist', v_docs,
               'clientTitle', 'להעלות ' || jsonb_array_length(v_docs) || ' מסמכים',
               'clientSub', (select string_agg(d->>'label', ' · ') from jsonb_array_elements(v_docs) d),
               'clientCta', 'להעלאה'),
             true, null, true, v_hold, 'pending', null, p_dry_run);
    v_planned := v_planned || jsonb_build_object('step_type','client_documents','track','tools','scope','person','status', v_r->>'status');
    if not p_dry_run then v_created := v_created + 1; end if;
  end if;

  -- ── מסלול הרו"ח הקודם ──────────────────────────────────────────────────────
  -- JF12 · כל אחד משלושת השלבים נבדק בנפרד: הסרה של אחד אינה מסתירה את השני,
  -- והסרה אינה נולדת מחדש (117).
  if v_has_prev then
    -- ── פרטי הרו"ח הקודם ──────────────────────────────────────────────────────
    -- נשאלים רק אם אינם על הכרטיס. בלי מייל אין למי לשלוח מכתב שחרור,
    -- ולכן המכתב תלוי בשלב הזה ולא נולד פתוח לחינם.
    -- ‼ 115: השאלה ללקוח נוצרת תמיד (הכרעת גיא 2026-08-18). כשיש כבר
    -- אימייל בכרטיס היא בקשת אישור בלבד — לא נועלת ולא חוסמת סגירה.
    select id into v_id_prevdet from public.onboarding_steps
      where client_id = e.client_id and step_type = 'prev_accountant_details' and status <> 'cancelled' limit 1;
    if v_id_prevdet is null
       and not public.step_removed_by_office(e.client_id, 'prev_accountant_details')
       and public.journey_default_enabled(v_snap, 'prev_accountant_details') then
      v_r := public._generate_step(e.user_id, e.id, e.client_id, v_snap,
               'prev_accountant_details', 'prev_accountant', 'person', 'client',
               coalesce(
                 public.journey_default_variant(v_snap, 'prev_accountant_details', v_facts)->'copy',
                 case when v_needs_prevdet then jsonb_build_object(
                   'clientTitle', 'פרטי רואה החשבון הקודם שלך',
                   'clientSub', 'שם, אימייל וטלפון - כדי שנפנה אליו בשמך',
                   'clientCta', 'למילוי')
                 else jsonb_build_object(
                   'clientTitle', 'לאשר את פרטי רואה החשבון הקודם',
                   'clientSub', 'הפרטים שאצלנו מוצגים למילוי מראש - רק לוודא שהם נכונים',
                   'clientCta', 'לאישור') end),
               v_needs_prevdet, null, false, v_hold, 'pending', null, p_dry_run);
      v_id_prevdet := v_r->>'stepId';
      v_planned := v_planned || jsonb_build_object('step_type','prev_accountant_details','track','prev_accountant','scope','person','status', v_r->>'status');
      if not p_dry_run then v_created := v_created + 1; end if;
    end if;

    -- המכתב תלוי בשאלה רק כשאין מייל בכרטיס (התנאי העסקי); *במה* — מהצילום.
    if not exists (select 1 from public.onboarding_steps
                    where client_id = e.client_id and step_type = 'release_letter' and status <> 'cancelled')
       and not public.step_removed_by_office(e.client_id, 'release_letter')
       and public.journey_default_enabled(v_snap, 'release_letter') then
      v_r := public._generate_step(e.user_id, e.id, e.client_id, v_snap,
               'release_letter', 'prev_accountant', 'person', 'me', '{}'::jsonb,
               true, 'prev_accountant_details', v_needs_prevdet, v_hold, 'pending', null, p_dry_run);
      v_planned := v_planned || jsonb_build_object('step_type','release_letter','track','prev_accountant','scope','person','status', v_r->>'status');
      if not p_dry_run then v_created := v_created + 1; end if;
    end if;

    if not exists (select 1 from public.onboarding_steps
                    where client_id = e.client_id and step_type = 'materials_received' and status <> 'cancelled')
       and not public.step_removed_by_office(e.client_id, 'materials_received')
       and public.journey_default_enabled(v_snap, 'materials_received') then
      -- JF25 · הרשימה מ-④ — אותה רשימה ש-create_onboarding_request ממלאת.
      v_r := public._generate_step(e.user_id, e.id, e.client_id, v_snap,
               'materials_received', 'prev_accountant', 'person', 'prev_accountant',
               jsonb_build_object('checklist', public.default_materials_checklist()),
               true, 'release_letter', true, v_hold, 'pending', null, p_dry_run);
      v_planned := v_planned || jsonb_build_object('step_type','materials_received','track','prev_accountant','scope','person','status', v_r->>'status');
      if not p_dry_run then v_created := v_created + 1; end if;
    end if;
  end if;

  -- ── פייפרלס ──────────────────────────────────────────────────────────────
  if v_needs_paperless then
    if not exists (select 1 from public.onboarding_steps
                    where client_id = e.client_id and step_type = 'paperless_invite' and status <> 'cancelled')
       and not public.step_removed_by_office(e.client_id, 'paperless_invite')
       and public.journey_default_enabled(v_snap, 'paperless_invite') then
      v_r := public._generate_step(e.user_id, e.id, e.client_id, v_snap,
               'paperless_invite', 'tools', 'person', 'client',
               jsonb_build_object('paperlessStatus', coalesce(v_client.paperless_status,'unknown'),
                                  'dataSource','unknown',
                                  'clientTitle','הרשמה לפייפרלס',
                                  'clientSub','שתי דקות, ומשם רק מצלמים קבלות מהטלפון',
                                  'clientCta','נרשמתי לפייפרלס'),
               true, null, true, v_hold, 'pending', null, p_dry_run);
      v_planned := v_planned || jsonb_build_object('step_type','paperless_invite','track','tools','scope','person','status', v_r->>'status');
      if not p_dry_run then v_created := v_created + 1; end if;
    end if;

    select id, status in ('completed','verified','skipped')
      into v_id_conn, v_conn_done
      from public.onboarding_steps
      where client_id = e.client_id and step_type = 'paperless_connection' and status <> 'cancelled' limit 1;
    if v_id_conn is null
       and not public.step_removed_by_office(e.client_id, 'paperless_connection')
       and public.journey_default_enabled(v_snap, 'paperless_connection') then
      v_r := public._generate_step(e.user_id, e.id, e.client_id, v_snap,
               'paperless_connection', 'tools', 'person', 'me',
               jsonb_build_object(
                 'clientTitle', 'חיבור לפייפרלס',
                 'clientSub', 'בימים הקרובים ניכנס לחשבון הפייפרלס ונשלים את החיבור. אין צורך לעשות דבר כרגע.'),
               true, 'paperless_invite', true, v_hold, 'pending', null, p_dry_run);
      v_id_conn := v_r->>'stepId';
      v_conn_done := false;
      v_planned := v_planned || jsonb_build_object('step_type','paperless_connection','track','tools','scope','person','status', v_r->>'status');
      if not p_dry_run then v_created := v_created + 1; end if;
    end if;
  end if;

  -- ── חיבור פייפרלס לרשות המסים ──────────────────────────────────────────
  -- ‼ תלוי בחיבור ולא בהרשמה: בלי שם עסק ומשיכת עוסקים בחשבון אין מה לחבר.
  -- ‼ הכדור אצל הלקוח — ההזדהות היא בתעודת הזהות ובקוד הקבוע שלו.
  if v_needs_paperless and v_licensed
     and not public.step_removed_by_office(e.client_id, 'paperless_tax_authority')
     and not exists (select 1 from public.onboarding_steps
                      where client_id = e.client_id and step_type = 'paperless_tax_authority'
                        and status <> 'cancelled')
     and public.journey_default_enabled(v_snap, 'paperless_tax_authority') then
    v_r := public._generate_step(e.user_id, e.id, e.client_id, v_snap,
             'paperless_tax_authority', 'tools', 'person', 'client',
             jsonb_build_object(
               'clientTitle', 'חיבור פייפרלס לרשות המסים',
               'clientSub', 'כדי שהחשבוניות שלך יקבלו מספר הקצאה',
               'clientNote', E'1. בפייפרלס: הגדרות ← חיבורים והרשאות, ולחיצה על אייקון הקישור.\n2. נפתח אתר רשות המסים ומבקש הזדהות - תעודת זהות וקוד קבוע (לא כרטיס חכם). מאשרים את ההרשאה.\n3. חוזרים לפייפרלס ולוחצים "המשך".',
               'clientNoteAfter', 'החיבור תקף לשלושה חודשים ואז צריך לחדש אותו - נזכיר לך כשיגיע הזמן. אם החיבור נכשל, ממתינים כשלוש שעות ומנסים שוב.',
               'clientCta', 'ביצעתי את החיבור',
               'clientLinkUrl', 'https://academy-bu.paperless.tax/he/articles/11424861-%D7%97%D7%99%D7%91%D7%95%D7%A8-%D7%94%D7%9E%D7%A2%D7%A8%D7%9B%D7%AA-%D7%9C%D7%A8%D7%A9%D7%95%D7%AA-%D7%94%D7%9E%D7%99%D7%A1%D7%99%D7%9D'),
             true, 'paperless_connection', true, v_hold, 'pending', null, p_dry_run);
    v_planned := v_planned || jsonb_build_object('step_type','paperless_tax_authority','track','tools','scope','person','status', v_r->>'status');
    if not p_dry_run then v_created := v_created + 1; end if;
  end if;

  -- ── הרשאת התשלום החודשי ───────────────────────────────────────────────────
  if v_has_monthly then
    if not exists (select 1 from public.onboarding_steps
                    where engagement_id = e.id and step_type = 'retainer_authorization' and status <> 'cancelled')
       and not public.step_removed_by_office(e.client_id, 'retainer_authorization')
       and public.journey_default_enabled(v_snap, 'retainer_authorization') then
      v_r := public._generate_step(e.user_id, e.id, e.client_id, v_snap,
               'retainer_authorization', 'payment', 'engagement', 'me',
               jsonb_build_object('amount', e.monthly_total, 'billingStartMonth', e.billing_start_month,
                                  'clientTitle', 'להזין אמצעי תשלום',
                                  'clientSub', 'הסכום שסוכם בהצעה, כהרשאה קבועה',
                                  'clientCta', 'להזנה')
               || case when v_no_paperless then jsonb_build_object('method','manual_arrangement') else '{}'::jsonb end,
               true, 'paperless_connection', true, v_hold, 'pending', null, p_dry_run);
      v_planned := v_planned || jsonb_build_object('step_type','retainer_authorization','track','payment','scope','engagement',
                                                   'status', v_r->>'status', 'depends_on', v_r->'dependsOn');
      if not p_dry_run then v_created := v_created + 1; end if;
    end if;
  end if;

  -- ── עבודה פנימית (סיווג C) — קיום נבדק לפי ההתקשרות, כולל שורה מבוטלת ──
  if not exists (select 1 from public.onboarding_steps
                 where engagement_id = e.id and step_type = 'internal_setup') then
    v_r := public._generate_step(e.user_id, e.id, e.client_id, v_snap,
             'internal_setup', 'internal', 'engagement', 'me',
             jsonb_build_object('checklist', jsonb_build_array(
               jsonb_build_object('key','file_numbers','label','מספרי תיקים בכרטיס','done',false),
               jsonb_build_object('key','assignee','label','שיוך מטפל','done',false),
               jsonb_build_object('key','frequencies','label','תדירויות דיווח','done',false))),
             true, null, false, v_hold, 'pending', null, p_dry_run);
    v_planned := v_planned || jsonb_build_object('step_type','internal_setup','track','internal','scope','engagement','status', v_r->>'status');
    if not p_dry_run then v_created := v_created + 1; end if;
  end if;

  if not exists (select 1 from public.onboarding_steps
                 where engagement_id = e.id and step_type = 'first_month_review') then
    v_r := public._generate_step(e.user_id, e.id, e.client_id, v_snap,
             'first_month_review', 'review', 'engagement', 'me', '{}'::jsonb,
             false, null, false, v_hold, 'pending',
             (coalesce(e.approved_at, now()) + interval '30 days')::date, p_dry_run);
    v_planned := v_planned || jsonb_build_object('step_type','first_month_review','track','review','scope','engagement','status', v_r->>'status');
    if not p_dry_run then v_created := v_created + 1; end if;
  end if;

  -- ── בקשות חופשיות של המשרד (137) ──────────────────────────────────────────
  if v_snap is not null then
    for v_oentry in
      select value from jsonb_array_elements(v_snap)
       where value->>'source' = 'office'
         and coalesce((value->>'enabled')::boolean, true)
       order by coalesce((value->>'sortIndex')::int, 0)
    loop
      v_opayload := v_oentry->'payload';
      -- תצורה חסרה ⇒ אין מה לבקש
      continue when v_opayload is null or jsonb_typeof(v_opayload) <> 'object'
                    or v_opayload = '{}'::jsonb;
      -- כבר קיימת אצל הלקוח (כולל מבוטלת) ⇒ לא נוצרת שוב
      continue when exists (
        select 1 from public.onboarding_steps s
         where s.client_id = e.client_id
           and s.payload->'defaultOrigin'->>'key' = v_oentry->>'key');

      v_planned := v_planned || jsonb_build_object(
        'step_type', coalesce(v_oentry->>'stepType', 'custom_request'),
        'track', 'custom', 'scope', 'person', 'status', 'pending',
        'officeKey', v_oentry->>'key');

      if not p_dry_run then
        v_ores := public.create_onboarding_request(
          e.client_id,
          coalesce(v_oentry->>'stepType', 'custom_request'),
          v_opayload || jsonb_build_object('defaultOrigin',
            jsonb_build_object('key', v_oentry->>'key', 'kind', 'office_default')),
          p_due_date => case when v_oentry->>'dueInDays' is not null
                             then current_date + (v_oentry->>'dueInDays')::int end,
          p_depends_on => null,
          p_published => true,
          p_required_for_close => coalesce((v_oentry->>'requiredForClose')::boolean, true),
          p_owner => 'client',
          p_stage_id => null);

        if coalesce((v_ores->>'ok')::boolean, false) then
          update public.onboarding_steps
             set sort_order = coalesce((v_oentry->>'sortIndex')::int, 0)
           where id = v_ores->>'stepId';
          v_created := v_created + 1;
        else
          -- ‼ לא מפילים את הקליטה בגלל בקשה אחת. נרשם ביומן וממשיכים.
          perform public.log_onboarding_event(e.user_id, null, e.id, 'note', 'system',
            'בקשת ברירת מחדל לא נוצרה: ' || coalesce(v_oentry->>'key', '?')
              || ' - ' || coalesce(v_ores->>'error', '?'), v_oentry);
        end if;
      end if;
    end loop;
  end if;

  if not p_dry_run and v_created > 0 then
    perform public.log_onboarding_event(e.user_id, null, e.id, 'created', 'system',
      'מסלול הקליטה הורכב מההצעה שאושרה', jsonb_build_object('stepsCreated', v_created));
  end if;

  return jsonb_build_object(
    'ok', true, 'dryRun', p_dry_run, 'engagementId', e.id, 'clientId', e.client_id,
    'created', v_created, 'planned', v_planned,
    'facts', jsonb_build_object(
      'hasMonthly', v_has_monthly, 'hasPaperlessService', v_has_paperless,
      'needsPaperless', v_needs_paperless, 'hasRepresentation', v_has_rep,
      'hasPreviousAccountant', v_has_prev, 'newBusiness', v_new_business,
      'noPaperless', v_no_paperless, 'needsPrevDetails', v_needs_prevdet,
      'heldUntilApproval', v_hold, 'kindFallback', v_kind_fallback,
      'monthlyTotal', e.monthly_total, 'billingStartMonth', e.billing_start_month));
end;
$function$;

revoke execute on function public.generate_onboarding_steps(text, boolean) from public, anon, authenticated;
grant  execute on function public.generate_onboarding_steps(text, boolean) to service_role;

-- ── ④ «עדכון סטטוס מס» — הבקשה התשיעית בקטלוג קוראת מהצילום ─────────────
--  הגוף מ-172 (JF3: published_at ריק, בלי payload.published). מה שנוסף:
--  enabled/היעדר מהצילום (138), מקום, חובה/רשות (ברירת המחדל: רשות — 73),
--  יעד, והסרה (JF12). נקראת אחרי המחולל, ולכן הצילום כבר על ההתקשרות.
create or replace function public.add_intake_questionnaire_step(p_engagement_id text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  e    public.engagements%rowtype;
  v_id text;
begin
  select * into e from public.engagements where id = p_engagement_id;
  if e.id is null then return jsonb_build_object('ok', false, 'error', 'engagement_not_found'); end if;

  select id into v_id from public.onboarding_steps
    where client_id = e.client_id and step_type = 'intake_questionnaire'
      and status <> 'cancelled' limit 1;
  if v_id is not null then
    return jsonb_build_object('ok', true, 'existed', true, 'stepId', v_id);
  end if;

  if public.step_removed_by_office(e.client_id, 'intake_questionnaire') then
    return jsonb_build_object('ok', true, 'skipped', 'removed_by_office');
  end if;
  if not public.journey_default_enabled(e.journey_default_snapshot, 'intake_questionnaire') then
    return jsonb_build_object('ok', true, 'skipped', 'disabled_by_default');
  end if;

  insert into public.onboarding_steps (
    user_id, engagement_id, client_id, step_type, track, scope, status, ball,
    required_for_close, due_date, sort_order, payload, published_at)
  values (
    e.user_id, e.id, e.client_id, 'intake_questionnaire', 'internal', 'person', 'pending', 'me',
    -- תזכורת אופציונלית בסוף הקליטה, לא תנאי לסגירתה (73) — אלא אם המשרד קבע אחרת.
    public.journey_default_required(e.journey_default_snapshot, 'intake_questionnaire', false),
    public.journey_default_due_date(e.journey_default_snapshot, 'intake_questionnaire'),
    public.journey_default_order(e.journey_default_snapshot, 'intake_questionnaire'),
    -- טיוטה: published_at ריק הוא הסימון היחיד (JF3). אין יותר payload.published.
    '{}'::jsonb,
    null)
  returning id into v_id;

  return jsonb_build_object('ok', true, 'existed', false, 'stepId', v_id);
end;
$function$;

revoke execute on function public.add_intake_questionnaire_step(text) from public, anon, authenticated;
grant  execute on function public.add_intake_questionnaire_step(text) to service_role;

-- ── ⑤ create_onboarding_request — הגוף מ-155, ארבעה שינויים ─────────────────
--  (א) הבעלים נגזר מהלקוח כשאין סשן (הדפוס של 163): המחולל קורא לכאן בשביל
--      בקשות המשרד, גם כשהלקוח מאשר בעצמו מקישור ואין auth.uid(). עד היום
--      זה נפל ב-forbidden ונרשם ביומן כ"בקשת ברירת מחדל לא נוצרה".
--      ההרשאה להריץ נשארת authenticated/service_role — anon אינו מגיע לכאן
--      אלא דרך שרשרת security definer.
--  (ב) רשימת הסוגים מ-request_creatable_step_types (JF14).
--  (ג) ההחזקה דרך requests_held_until_approval (JF4).
--  (ד) «קבלת חומרים» בלי רשימה מקבלת את default_materials_checklist (JF25).
create or replace function public.create_onboarding_request(
  p_client_id text,
  p_step_type text,
  p_payload jsonb default '{}'::jsonb,
  p_due_date date default null::date,
  p_depends_on text default null::text,
  p_published boolean default true,
  p_required_for_close boolean default true,
  p_owner text default null::text,
  p_stage_id text default null::text
)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  c      public.clients%rowtype;
  v_uid  uuid := auth.uid();
  v_eng  text;
  v_id   text;
  v_ball text;
  v_next int;
  v_dep  public.onboarding_steps%rowtype;
  v_status text := 'pending';
  v_err  text;
  v_ext_kind text;
  v_old  text;
  v_payload jsonb;
  v_hold boolean := false;
  v_stage text;
  v_eng_open text;
  v_intake text;
  v_required boolean;
begin
  select * into c from public.clients where id = p_client_id;
  if c.id is null then return jsonb_build_object('ok', false, 'error', 'client_not_found'); end if;
  -- 173 · משתמש מחובר רשאי רק על לקוח שלו; בלי משתמש — מסלול מערכת (163).
  if v_uid is not null and c.user_id <> v_uid then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;

  if not (p_step_type = any (public.request_creatable_step_types())) then
    return jsonb_build_object('ok', false, 'error', 'step_type_not_allowed');
  end if;

  if p_owner is not null and p_owner not in ('client','me','external') then
    return jsonb_build_object('ok', false, 'error', 'bad_owner');
  end if;

  if p_owner = 'external' then
    v_ext_kind := coalesce(p_payload->'externalParty'->>'kind', '');
    if v_ext_kind not in ('prev_accountant','other') then
      return jsonb_build_object('ok', false, 'error', 'missing_external_party');
    end if;
  end if;

  if p_step_type = 'custom_request' then
    if coalesce(p_owner, 'client') = 'client' then
      v_err := public.validate_requirements(p_payload->'requirements');
      if v_err is not null then return jsonb_build_object('ok', false, 'error', v_err); end if;
    elsif p_payload ? 'requirements'
          and coalesce(jsonb_array_length(p_payload->'requirements'), 0) > 0 then
      v_err := public.validate_requirements(p_payload->'requirements');
      if v_err is not null then return jsonb_build_object('ok', false, 'error', v_err); end if;
    end if;
  end if;

  if p_stage_id is not null then
    if not exists (select 1 from public.journey_stages js
                    where js.id = p_stage_id and js.client_id = c.id) then
      return jsonb_build_object('ok', false, 'error', 'stage_not_found');
    end if;
  end if;

  select id into v_eng from public.engagements
   where client_id = c.id and status = 'onboarding' order by created_at desc limit 1;
  if v_eng is null then
    select id into v_eng from public.engagements where client_id = c.id order by created_at desc limit 1;
  end if;

  -- ‼ 155 · הקשר הקליטה. שים לב שזה **אינו** v_eng: שם מחפשים קבוצה לשיוך
  -- השלב (גם התקשרות שהסתיימה משמשת לקיבוץ), וכאן שואלים אם יש קליטה פתוחה
  -- שאפשר בכלל לסגור. שתי שאלות שונות שנראו כאחת.
  v_eng_open := public.open_intake_engagement_id(c.id);
  v_stage    := public.derive_lifecycle_stage(c.id);
  v_intake   := case when v_eng_open is not null then 'open'
                     when v_stage in ('lead', 'quoted') then 'pending'
                     else 'none' end;
  v_required := coalesce(p_required_for_close, true) and v_intake <> 'none';

  v_ball := case
    when p_owner = 'me' then 'me'
    when p_owner = 'client' then 'client'
    when p_owner = 'external' then
      case when v_ext_kind = 'prev_accountant' then 'prev_accountant' else 'external' end
    when p_step_type in ('client_documents','prev_accountant_details','custom_request')
      then 'client'
    else 'me'
  end;

  if p_depends_on is not null then
    select * into v_dep from public.onboarding_steps where id = p_depends_on and client_id = c.id;
    if v_dep.id is null then return jsonb_build_object('ok', false, 'error', 'dependency_not_found'); end if;
    if v_dep.status not in ('completed','verified','skipped') then v_status := 'locked'; end if;
  end if;

  -- בקשה פעילה מאותו סוג כבר קיימת — אין מה להוסיף, ומסך הקטלוג ממילא מסנן
  -- אותה. הבדיקה כאן היא בשביל מסך מיושן או שני חלונות פתוחים.
  if p_step_type <> 'custom_request'
     and exists (select 1 from public.onboarding_steps
                  where client_id = c.id and step_type = p_step_type
                    and status <> 'cancelled') then
    return jsonb_build_object('ok', false, 'error', 'step_type_exists');
  end if;

  select coalesce(max(sort_order), 0) + 10 into v_next
    from public.onboarding_steps where client_id = c.id;

  -- 135 / 173: לפני שנמכר משהו, "הוספתי בקשה" פירושו הכנה ולא שליחה. פרדיקט אחד.
  if p_published and public.requests_held_until_approval(c.id) then
    p_published := false;
    v_hold := true;
  end if;

  v_payload := coalesce(p_payload, '{}'::jsonb);

  -- JF25 · «קבלת חומרים» בלי רשימה = הקטלוג של היום, כמו במחולל. רשימה
  -- שנשלחה במפורש (גם ריקה במכוון אינה קיימת: ריק פירושו "לא נבחר") נשמרת.
  if p_step_type = 'materials_received'
     and (jsonb_typeof(v_payload->'checklist') <> 'array'
          or jsonb_array_length(v_payload->'checklist') = 0) then
    v_payload := v_payload || jsonb_build_object('checklist', public.default_materials_checklist());
  end if;

  -- JF3: published_at הוא הסימון היחיד לפרסום; אין יותר payload.published.
  v_payload := v_payload
    || case when v_hold then jsonb_build_object('heldUntilApproval', true) else '{}'::jsonb end;

  -- שורה מבוטלת מאותו סוג עדיין תופסת את הצמד (התקשרות, סוג). מעדיפים את זו
  -- שבהתקשרות הנוכחית — היא זו שתחסום את ההוספה.
  if p_step_type <> 'custom_request' then
    select id into v_old from public.onboarding_steps
     where client_id = c.id and step_type = p_step_type and status = 'cancelled'
     order by (engagement_id is not distinct from v_eng) desc, updated_at desc
     limit 1;
  end if;

  if v_old is not null then
    -- קשתות תלות ישנות יורדות במלואן: לשלב אפשרו כמה הורים, והטריגר על
    -- העמודה הבודדת אינו מנקה את מה שנוסף מעבר לה.
    delete from public.onboarding_step_dependencies where step_id = v_old;

    update public.onboarding_steps set
      engagement_id      = coalesce(v_eng, engagement_id),
      track              = public.onboarding_track_for(p_step_type),
      scope              = 'person',
      status             = v_status,
      ball               = v_ball,
      depends_on_step_id = p_depends_on,
      due_date           = p_due_date,
      sort_order         = v_next,
      payload            = v_payload,
      required_for_close = v_required,
      published_at       = case when p_published then now() else null end,
      stage_id           = p_stage_id,
      completed_by       = null,
      completed_at       = null,
      verified_at        = null,
      updated_at         = now()
    where id = v_old;

    if p_depends_on is not null then
      insert into public.onboarding_step_dependencies (step_id, depends_on_step_id, user_id)
      values (v_old, p_depends_on, c.user_id)
      on conflict do nothing;
    end if;

    v_id := v_old;
  else
    insert into public.onboarding_steps
      (user_id, engagement_id, client_id, step_type, track, scope, status, ball,
       depends_on_step_id, due_date, sort_order, payload, required_for_close,
       published_at, stage_id)
    values
      (c.user_id, v_eng, c.id, p_step_type, public.onboarding_track_for(p_step_type), 'person',
       v_status, v_ball, p_depends_on, p_due_date, v_next, v_payload,
       v_required,
       case when p_published then now() else null end,
       p_stage_id)
    returning id into v_id;
  end if;

  perform public.log_onboarding_event(c.user_id, v_id, v_eng, 'created', 'accountant',
    case when p_published then 'נוספה בקשה'
         when v_hold then 'נוספה בקשה - תפורסם כשההצעה תאושר'
         else 'נוספה בקשה כטיוטה' end,
    jsonb_build_object('stepType', p_step_type,
                       'owner', coalesce(p_owner, 'client'),
                       'revived', v_old is not null,
                       'intakeState', v_intake,
                       'requiredForClose', v_required));

  return jsonb_build_object('ok', true, 'stepId', v_id, 'status', v_status,
                            'heldUntilApproval', v_hold,
                            'intakeState', v_intake,
                            'requiredForClose', v_required,
                            'revived', v_old is not null);
end;
$function$;

revoke execute on function public.create_onboarding_request(text, text, jsonb, date, text, boolean, boolean, text, text) from public, anon;
grant  execute on function public.create_onboarding_request(text, text, jsonb, date, text, boolean, boolean, text, text) to authenticated, service_role;

-- ── ⑥ discard_case_changes — הגוף מ-101; JF2 ───────────────────────────────
--  publish_case_changes (167 §3) ממזג draft_payload על כל בקשה, פורסמה או לא.
--  «בטל שינויים» חייב להיות המראה המדויקת: מה שהפרסום היה מחיל — הביטול
--  מוחק. הסינון `published_at is not null` השאיר על טיוטה עריכה שהמסך כבר
--  אמר שבוטלה, והיא הייתה מתפרסמת בלחיצה הבאה.
create or replace function public.discard_case_changes(p_client_id text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  c        public.clients%rowtype;
  v_uid    uuid := auth.uid();
  v_order  int := 0;
  v_cancel int := 0;
  v_draft  int := 0;
begin
  select * into c from public.clients where id = p_client_id;
  if c.id is null then return jsonb_build_object('ok', false, 'error', 'client_not_found'); end if;
  if v_uid is null or c.user_id <> v_uid then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;

  update public.onboarding_steps
     set pending_sort_order = null
   where client_id = c.id and pending_sort_order is not null;
  get diagnostics v_order = row_count;

  update public.onboarding_steps
     set pending_cancel = false
   where client_id = c.id and pending_cancel = true;
  get diagnostics v_cancel = row_count;

  -- JF2 · כל בקשה, גם כזו שטרם פורסמה — בדיוק מה שהפרסום היה ממזג.
  update public.onboarding_steps
     set draft_payload = null
   where client_id = c.id and draft_payload is not null;
  get diagnostics v_draft = row_count;

  if v_order + v_cancel + v_draft > 0 then
    perform public.log_onboarding_event(c.user_id, null, null, 'note', 'accountant',
      'שינויים שלא פורסמו בוטלו',
      jsonb_build_object('orderReverted', v_order, 'cancelReverted', v_cancel, 'editsReverted', v_draft));
  end if;

  return jsonb_build_object('ok', true,
    'orderReverted', v_order, 'cancelReverted', v_cancel, 'editsReverted', v_draft);
end;
$function$;

revoke execute on function public.discard_case_changes(text) from public, anon;
grant  execute on function public.discard_case_changes(text) to authenticated, service_role;

-- ── ⑦ תבניות — הגוף מ-167; JF14 ──────────────────────────────────────────
--  שמירה: ה-payload האפקטיבי (טיוטה ממוזגת מעל הפרסום, כמו שהפרסום היה
--  עושה) ורק סוגים שהיוצר יודע ליצור — אחרת ההחלה הייתה מדלגת בשקט.
--  התלויות נקראות מהטבלה בלבד (167 ②); office_id נקבע (JF17).
create or replace function public.save_journey_template(p_client_id text, p_name text, p_description text default null::text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  c       public.clients%rowtype;
  v_uid   uuid := auth.uid();
  v_office uuid;
  v_items jsonb;
  v_id    text;
  v_skipped jsonb;
begin
  select * into c from public.clients where id = p_client_id;
  if c.id is null then return jsonb_build_object('ok', false, 'error', 'client_not_found'); end if;
  if v_uid is null or c.user_id <> v_uid then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;
  if nullif(trim(coalesce(p_name,'')), '') is null then
    return jsonb_build_object('ok', false, 'error', 'missing_name');
  end if;

  select office_id into v_office from public.profiles where id = v_uid;
  if v_office is null then return jsonb_build_object('ok', false, 'error', 'no_office'); end if;

  -- מה שלא ייכנס לתבנית, ולמה — כדי שהמסך יוכל להגיד את זה במקום להבטיח
  -- "נשמרו 12" ולהחיל 9.
  select coalesce(jsonb_agg(jsonb_build_object('stepType', s.step_type, 'reason', 'not_creatable')), '[]'::jsonb)
    into v_skipped
    from public.onboarding_steps s
   where s.client_id = c.id
     and s.status <> 'cancelled'
     and not (s.step_type = any (public.request_creatable_step_types()));

  with src as (
    select s.*,
           -- JF14 · הנוסח האפקטיבי: עריכה שממתינה לפרסום היא מה שהמשרד מתכוון אליו.
           case when s.draft_payload is not null
                then public.merge_step_draft(s.payload, s.draft_payload)
                else s.payload end as effective_payload,
           'e' || row_number() over (order by s.sort_order, s.created_at) as tkey
      from public.onboarding_steps s
     where s.client_id = c.id
       and s.status <> 'cancelled'
       and s.step_type = any (public.request_creatable_step_types())
  )
  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
           'key', src.tkey,
           'stepType', src.step_type,
           'owner', case
                      when src.effective_payload ? 'externalParty' then 'external'
                      when src.ball = 'client' then 'client'
                      else 'me' end,
           'stageTitle', js.title,
           'stageOrder', js.sort_order,
           'requiredForClose', coalesce(src.required_for_close,
             src.step_type not in ('representation_upgrade', 'first_month_review')),
           'dueInDays', case when src.due_date is not null and src.created_at is not null
                             then greatest(0, (src.due_date - src.created_at::date)) end,
           'dependsOn', (
             select coalesce(jsonb_agg(distinct p.tkey), null)
               from public.onboarding_step_dependencies d
               join src p on p.id = d.depends_on_step_id
              where d.step_id = src.id),
           'payload', public.template_payload_from_step(src.effective_payload)))
         order by src.sort_order, src.created_at), '[]'::jsonb)
    into v_items
    from src
    left join public.journey_stages js on js.id = src.stage_id;

  if jsonb_array_length(v_items) = 0 then
    return jsonb_build_object('ok', false, 'error', 'nothing_to_save');
  end if;

  insert into public.journey_templates (user_id, office_id, kind, name, description, entries)
  values (v_uid, v_office, 'journey', trim(p_name), nullif(trim(coalesce(p_description,'')), ''), v_items)
  returning id into v_id;

  return jsonb_build_object('ok', true, 'templateId', v_id, 'count', jsonb_array_length(v_items),
                            'skippedEntries', v_skipped);
end;
$function$;

revoke execute on function public.save_journey_template(text, text, text) from public, anon;
grant  execute on function public.save_journey_template(text, text, text) to authenticated, service_role;

-- JF16 · החלה לפי היקף המשרד; JF13 · תלויות נפתרות אחרי שכל הרשומות קיימות.
-- JF14 · כל דילוג מדווח (skippedEntries: key, stepType, reason) — "כבר קיימת"
-- לעומת "נכשלה" הם שני דברים שונים למי שלוחץ על הכפתור.
create or replace function public.apply_journey_template(p_client_id text, p_template_id text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  c        public.clients%rowtype;
  t        public.journey_templates%rowtype;
  v_uid    uuid := auth.uid();
  v_office uuid;
  e        jsonb;
  v_res    jsonb;
  v_added  int := 0;
  v_skip   int := 0;
  v_skipped jsonb := '[]'::jsonb;
  v_dup_id text;
  v_title  text;
  v_key    text;
  v_map    jsonb := '{}'::jsonb;
  v_stages jsonb := '{}'::jsonb;
  v_stage  text;
  v_dep_ids text[];
  v_owner  text;
  v_due    date;
  v_new    text;
  v_payload jsonb;
  v_deferred jsonb := '[]'::jsonb;
  d        jsonb;
begin
  select * into c from public.clients where id = p_client_id;
  if c.id is null then return jsonb_build_object('ok', false, 'error', 'client_not_found'); end if;
  if v_uid is null or c.user_id <> v_uid then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;

  select office_id into v_office from public.profiles where id = v_uid;
  select * into t from public.journey_templates
   where id = p_template_id
     and (office_id is null or (v_office is not null and office_id = v_office));
  if t.id is null then return jsonb_build_object('ok', false, 'error', 'template_not_found'); end if;

  for e in select * from jsonb_array_elements(t.entries) loop
    v_key := nullif(trim(coalesce(e->>'key','')), '');
    v_dup_id := null;

    -- JF14 · סוג שהיוצר אינו יודע ליצור (תבנית ישנה) — מדווח, לא נבלע.
    if not ((e->>'stepType') = any (public.request_creatable_step_types())) then
      v_skip := v_skip + 1;
      v_skipped := v_skipped || jsonb_build_object('key', v_key, 'stepType', e->>'stepType', 'reason', 'step_type_not_allowed');
      continue;
    end if;

    if (e->>'stepType') = 'custom_request' then
      v_title := coalesce(nullif(trim(e->'payload'->>'title'), ''),
                          nullif(trim(e->'payload'->>'clientTitle'), ''));
      if v_key is not null then
        select s.id into v_dup_id from public.onboarding_steps s
         where s.client_id = c.id and s.step_type = 'custom_request'
           and s.status <> 'cancelled'
           and s.payload->'templateOrigin'->>'templateId' = t.id
           and s.payload->'templateOrigin'->>'key' = v_key
         limit 1;
        if v_dup_id is null then
          select s.id into v_dup_id from public.onboarding_steps s
           where s.client_id = c.id and s.step_type = 'custom_request'
             and s.status <> 'cancelled'
             and coalesce(s.payload->'templateOrigin'->>'templateId', '') <> t.id
             and coalesce(nullif(trim(s.payload->>'title'), ''),
                          nullif(trim(s.payload->>'clientTitle'), '')) is not distinct from v_title
           limit 1;
        end if;
      else
        select s.id into v_dup_id from public.onboarding_steps s
         where s.client_id = c.id and s.step_type = 'custom_request'
           and s.status <> 'cancelled'
           and coalesce(nullif(trim(s.payload->>'title'), ''),
                        nullif(trim(s.payload->>'clientTitle'), '')) is not distinct from v_title
         limit 1;
      end if;
    else
      select s.id into v_dup_id from public.onboarding_steps s
       where s.client_id = c.id and s.step_type = e->>'stepType'
         and s.status <> 'cancelled'
       limit 1;
    end if;

    if v_dup_id is not null then
      -- הבקשה כבר קיימת: לא נוגעים בה, אבל תלות בה נפתרת אליה.
      if v_key is not null then v_map := v_map || jsonb_build_object(v_key, v_dup_id); end if;
      v_skip := v_skip + 1;
      v_skipped := v_skipped || jsonb_build_object('key', v_key, 'stepType', e->>'stepType', 'reason', 'exists', 'stepId', v_dup_id);
      continue;
    end if;

    v_stage := null;
    if nullif(trim(coalesce(e->>'stageTitle','')), '') is not null then
      if v_stages ? (e->>'stageTitle') then
        v_stage := v_stages->>(e->>'stageTitle');
      else
        select id into v_stage from public.journey_stages
         where client_id = c.id and title = e->>'stageTitle' limit 1;
        if v_stage is null then
          insert into public.journey_stages (user_id, client_id, title, sort_order)
          values (c.user_id, c.id, e->>'stageTitle',
                  coalesce((e->>'stageOrder')::int,
                           (select coalesce(max(sort_order), 0) + 10 from public.journey_stages where client_id = c.id)))
          returning id into v_stage;
        end if;
        v_stages := v_stages || jsonb_build_object(e->>'stageTitle', v_stage);
      end if;
    end if;

    v_owner := nullif(e->>'owner', '');
    v_due := case when (e->>'dueInDays') is not null
                  then (current_date + ((e->>'dueInDays')::int)) end;

    v_payload := coalesce(e->'payload','{}'::jsonb);
    if v_key is not null and (e->>'stepType') = 'custom_request' then
      v_payload := v_payload || jsonb_build_object('templateOrigin',
        jsonb_build_object('templateId', t.id, 'key', v_key));
    end if;

    v_res := public.create_onboarding_request(
               c.id, e->>'stepType', v_payload,
               p_due_date => v_due,
               p_depends_on => null,
               p_published => false,
               p_required_for_close => coalesce((e->>'requiredForClose')::boolean, true),
               p_owner => v_owner,
               p_stage_id => v_stage);

    if coalesce((v_res->>'ok')::boolean, false) then
      v_added := v_added + 1;
      v_new := v_res->>'stepId';
      if v_key is not null then
        v_map := v_map || jsonb_build_object(v_key, v_new);
      end if;
      if jsonb_typeof(e->'dependsOn') = 'array' and jsonb_array_length(e->'dependsOn') > 0 then
        v_deferred := v_deferred || jsonb_build_object('stepId', v_new, 'dependsOn', e->'dependsOn');
      end if;
    else
      v_skip := v_skip + 1;
      v_skipped := v_skipped || jsonb_build_object('key', v_key, 'stepType', e->>'stepType',
                                                   'reason', coalesce(v_res->>'error', 'failed'));
    end if;
  end loop;

  -- שלב שני: כל הרשומות קיימות, אפשר לפתור כל תלות — קדימה, אחורה, וגם לבקשה
  -- שכבר הייתה אצל הלקוח.
  for d in select * from jsonb_array_elements(v_deferred) loop
    select coalesce(array_agg(v_map->>k), '{}')
      into v_dep_ids
      from jsonb_array_elements_text(d->'dependsOn') k
     where v_map ? k;
    if array_length(v_dep_ids, 1) >= 1 then
      perform public.set_onboarding_step_dependencies(d->>'stepId', v_dep_ids);
    end if;
  end loop;

  return jsonb_build_object('ok', true, 'added', v_added, 'skipped', v_skip,
                            'skippedEntries', v_skipped, 'template', t.name);
end;
$function$;

revoke execute on function public.apply_journey_template(text, text) from public, anon;
grant  execute on function public.apply_journey_template(text, text) to authenticated, service_role;

-- ── ⑧ «דורש טיפול» — בעלים אחד לכל דגל (JF22/JF23) ──────────────────────────
--  "המשרד כיבה ומאז השלב לא השתנה" — השאלה היחידה שהמשימה הלילית שואלת
--  לפני שהיא מדליקה דגל נגזר.
create or replace function public.attention_dismissed_since_change(p_payload jsonb, p_updated_at timestamptz)
returns boolean
language sql
stable
as $function$
  select case
    when (p_payload->>'attentionDismissedAt') is null then false
    else (p_payload->>'attentionDismissedAt')::timestamptz >= p_updated_at
  end;
$function$;

revoke execute on function public.attention_dismissed_since_change(jsonb, timestamptz) from public, anon;
grant  execute on function public.attention_dismissed_since_change(jsonb, timestamptz) to authenticated, service_role;

--  payload.attentionSource: 'manual' (המשרד סימן) | 'derived' (המשימה הלילית).
--  payload.attentionDismissedAt: המשרד כיבה. המשימה הלילית לא מדליקה שוב את
--  מה שכובה כל עוד השלב לא השתנה מאז (הכיבוי עצמו מעדכן updated_at, ולכן
--  "לא השתנה" ⇔ attentionDismissedAt ≥ updated_at). דגל ידני על שלב פתוח
--  אינו מכובה על ידי הלילה — רק סטטוס סופי מכבה, כמו advance/_set_step_status.
create or replace function public.set_step_attention(p_step_id text, p_on boolean)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  s     public.onboarding_steps%rowtype;
  v_uid uuid := auth.uid();
begin
  select * into s from public.onboarding_steps where id = p_step_id;
  if s.id is null then return jsonb_build_object('ok', false, 'error', 'step_not_found'); end if;
  if v_uid is null or s.user_id <> v_uid then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;

  if coalesce(p_on, false) then
    update public.onboarding_steps
       set needs_attention = true,
           payload = (payload - 'attentionDismissedAt') || jsonb_build_object('attentionSource', 'manual')
     where id = s.id;
  else
    update public.onboarding_steps
       set needs_attention = false,
           payload = (payload - 'attentionSource') || jsonb_build_object('attentionDismissedAt', now())
     where id = s.id;
  end if;
  return jsonb_build_object('ok', true, 'needsAttention', coalesce(p_on, false));
end;
$function$;

revoke execute on function public.set_step_attention(text, boolean) from public, anon;
grant  execute on function public.set_step_attention(text, boolean) to authenticated, service_role;

create or replace function public.refresh_onboarding_attention(p_billing_days integer default 10, p_client_wait_days integer default 7)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_billing int := 0; v_waiting int := 0; v_upgrade int := 0; v_cleared int := 0;
  r record;
begin
  for r in
    select s.id, s.user_id, s.engagement_id, e.billing_start_month
    from public.onboarding_steps s
    join public.engagements e on e.id = s.engagement_id
    where s.step_type = 'retainer_authorization'
      and s.status not in ('completed','verified','cancelled','skipped')
      and e.billing_start_month is not null
      and (e.billing_start_month || '-01')::date - current_date <= p_billing_days
      and not s.needs_attention
      and not public.attention_dismissed_since_change(s.payload, s.updated_at)
  loop
    update public.onboarding_steps
       set needs_attention = true, payload = payload || jsonb_build_object('attentionSource', 'derived')
     where id = r.id;
    perform public.log_onboarding_event(r.user_id, r.id, r.engagement_id, 'reminder_prepared', 'system',
      'חודש החיוב הראשון (' || r.billing_start_month || ') מתקרב וההרשאה טרם הושלמה',
      jsonb_build_object('billingStartMonth', r.billing_start_month));
    v_billing := v_billing + 1;
  end loop;

  for r in
    select s.id, s.user_id, s.engagement_id, s.step_type
    from public.onboarding_steps s
    where s.status = 'waiting_client'
      and s.updated_at < now() - make_interval(days => p_client_wait_days)
      and not s.needs_attention
      and not public.attention_dismissed_since_change(s.payload, s.updated_at)
  loop
    update public.onboarding_steps
       set needs_attention = true, payload = payload || jsonb_build_object('attentionSource', 'derived')
     where id = r.id;
    perform public.log_onboarding_event(r.user_id, r.id, r.engagement_id, 'reminder_prepared', 'system',
      'ממתינים ללקוח יותר מ-' || p_client_wait_days || ' ימים - תזכורת מוכנה לאישורך',
      jsonb_build_object('stepType', r.step_type));
    v_waiting := v_waiting + 1;
  end loop;

  for r in
    select s.id, s.user_id, s.engagement_id, s.due_date
    from public.onboarding_steps s
    where s.step_type = 'representation_upgrade'
      and s.status not in ('completed','verified','cancelled','skipped')
      and s.due_date is not null and s.due_date <= current_date
      and not s.needs_attention
      and not public.attention_dismissed_since_change(s.payload, s.updated_at)
  loop
    update public.onboarding_steps
       set needs_attention = true, payload = payload || jsonb_build_object('attentionSource', 'derived')
     where id = r.id;
    perform public.log_onboarding_event(r.user_id, r.id, r.engagement_id, 'reminder_prepared', 'system',
      'הגיע מועד התזכורת לשדרוג הייצוג לראשי', jsonb_build_object('dueDate', r.due_date));
    v_upgrade := v_upgrade + 1;
  end loop;

  -- שלב שנסגר אינו דורש טיפול — ידני או נגזר. אותו כלל כמו advance_onboarding_step.
  update public.onboarding_steps
     set needs_attention = false, payload = payload - 'attentionSource'
   where needs_attention and status in ('completed','verified','skipped','cancelled');
  get diagnostics v_cleared = row_count;

  return jsonb_build_object('ok', true, 'billingFlagged', v_billing,
    'waitingFlagged', v_waiting, 'upgradeFlagged', v_upgrade, 'cleared', v_cleared);
end;
$function$;

revoke execute on function public.refresh_onboarding_attention(integer, integer) from public, anon, authenticated;
grant  execute on function public.refresh_onboarding_attention(integer, integer) to service_role;

-- ── ⑨ שומר הקבועים ─────────────────────────────────────────────────────────
select public.assert_domain_function_invariants();
