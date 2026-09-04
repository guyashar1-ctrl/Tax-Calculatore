-- נמשך חי 2026-09-04 מהמסד (pg_get_functiondef).
-- ארגומנטים: p_engagement_id text, p_dry_run boolean
CREATE OR REPLACE FUNCTION public.generate_onboarding_steps(p_engagement_id text, p_dry_run boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  v_id_invite  text;
  v_id_conn    text;
  v_id_release text;
  v_id_prevdet text;
  v_new_id     text;
  v_no_paperless boolean := false;
  v_conn_done  boolean := false;
  v_needs_prevdet boolean := false;
  v_docs       jsonb;
  v_licensed   boolean := false;
  v_kind       text;
  v_snap       jsonb;
  v_facts      jsonb;
  v_var        jsonb;
  v_prev_known boolean;
  v_fresh      boolean;
  v_office     uuid;
  v_oentry     jsonb;
  v_opayload   jsonb;
  v_ores       jsonb;
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

  -- ‼ גבול מחזור החיים במפורש: רק התקשרות שאין לה עדיין שום שלב
  -- מקבלת צילום. מסע שכבר התחיל ממשיך לפי מה שנולד איתו, ולכן עריכה
  -- עתידית של ברירת המחדל אינה נוגעת בו (הכרעת גיא 2026-08-25).
  v_facts := jsonb_build_object(
    'monthly', v_has_monthly, 'paperless', v_has_paperless,
    'licensed', v_licensed, 'rep', v_has_rep, 'has_prev', v_has_prev,
    'new_business', v_new_business, 'no_prev_email', v_needs_prevdet);

  v_snap := e.journey_default_snapshot;
  if v_snap is null and v_fresh then
    v_kind := public.resolve_client_kind(e.quotation_id, e.client_id);
    select office_id into v_office from public.profiles where id = e.user_id;
    if v_kind is not null and v_office is not null then
      select d.entries into v_snap from public.office_journey_defaults d
       where d.office_id = v_office and d.client_kind = v_kind;
      if v_snap is not null and not p_dry_run then
        update public.engagements
           set journey_default_snapshot = v_snap, journey_default_facts = v_facts
         where id = e.id;
      end if;
    end if;
  elsif e.journey_default_facts is not null then
    v_facts := e.journey_default_facts;   -- הרצה חוזרת: דטרמיניזם
  end if;
  if v_has_rep then
    select id into v_new_id from public.onboarding_steps
      where client_id = e.client_id and step_type = 'representation' and status <> 'cancelled' limit 1;
    if v_new_id is null then
      v_planned := v_planned || jsonb_build_object('step_type','representation','track','authorities','scope','person','status','in_progress');
      if not p_dry_run then
        insert into public.onboarding_steps (user_id, engagement_id, client_id, required_for_close, step_type, track, scope, status, ball)
        values (e.user_id, e.id, e.client_id, true, 'representation', 'authorities', 'person', 'in_progress', 'me');
        v_created := v_created + 1;
      end if;
    end if;
    v_new_id := null;

    select id into v_new_id from public.onboarding_steps
      where client_id = e.client_id and step_type = 'kyc_identification' and status <> 'cancelled' limit 1;
    if v_new_id is null then
      v_planned := v_planned || jsonb_build_object('step_type','kyc_identification','track','internal','scope','person','status','pending');
      if not p_dry_run then
        insert into public.onboarding_steps (user_id, engagement_id, client_id, required_for_close, step_type, track, scope, status, ball)
        values (e.user_id, e.id, e.client_id, true, 'kyc_identification', 'internal', 'person', 'pending', 'me');
        v_created := v_created + 1;
      end if;
    end if;
    v_new_id := null;
  end if;

  if v_new_business then
    select id into v_new_id from public.onboarding_steps
      where client_id = e.client_id and step_type = 'file_opening' and status <> 'cancelled' limit 1;
    if v_new_id is null then
      v_planned := v_planned || jsonb_build_object('step_type','file_opening','track','authorities','scope','person','status','pending');
      if not p_dry_run then
        insert into public.onboarding_steps (user_id, engagement_id, client_id, required_for_close, step_type, track, scope, status, ball, payload)
        values (e.user_id, e.id, e.client_id, true, 'file_opening', 'authorities', 'person', 'pending', 'me',
                jsonb_build_object('checklist', jsonb_build_array(
                  jsonb_build_object('key','vat','label','פתיחת תיק מעמ','done',false),
                  jsonb_build_object('key','income_tax','label','פתיחת תיק מס הכנסה','done',false),
                  jsonb_build_object('key','ni','label','פתיחת תיק ביטוח לאומי','done',false))));
        v_created := v_created + 1;
      end if;
    end if;
    v_new_id := null;
  end if;

  -- ── מסמכים מהלקוח ────────────────────────────────────────────────────────────
  -- הרשימה נגזרת מסוג הלקוח: מי שעובר מרו"ח מתבקש את מה שיש לו ביד; עסק חדש
  -- מתבקש את תעודות הפתיחה. הרו"ח יכול לערוך את הרשימה בבונה התהליך.
  select id into v_new_id from public.onboarding_steps
    where client_id = e.client_id and step_type = 'client_documents' and status <> 'cancelled' limit 1;
  if v_new_id is null and public.journey_default_enabled(v_snap, 'client_documents') then
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

    v_planned := v_planned || jsonb_build_object('step_type','client_documents','track','tools','scope','person','status','pending');
    if not p_dry_run then
      insert into public.onboarding_steps (user_id, engagement_id, client_id, required_for_close, step_type, track, scope, status, ball, payload)
      values (e.user_id, e.id, e.client_id, true, 'client_documents', 'tools', 'person', 'pending', 'client',
              jsonb_build_object(
                'checklist', v_docs,
                'clientTitle', 'להעלות ' || jsonb_array_length(v_docs) || ' מסמכים',
                'clientSub', (select string_agg(d->>'label', ' · ') from jsonb_array_elements(v_docs) d),
                'clientCta', 'להעלאה'));
      v_created := v_created + 1;
    end if;
  end if;
  v_new_id := null;

  -- ‼ 117: בקשה שהוסרה ידנית אינה נולדת מחדש. המחולל רץ שוב על התקשרות
  -- קיימת (create_engagement_for_quotation, מסלול existed=true), ולכן בלי
  -- הבדיקה הזאת לחיצה חוזרת על אישור ההצעה החזירה את שלושת השלבים.
  -- חזרה לבקשה = הוספה ידנית מ"+ בקשה", ששם היא זמינה תמיד.
  if v_has_prev and not exists (
       select 1 from public.onboarding_steps
        where client_id = e.client_id
          and step_type in ('prev_accountant_details','release_letter','materials_received')
          and status = 'cancelled') then
    -- ── פרטי הרו"ח הקודם ──────────────────────────────────────────────────────
    -- נשאלים רק אם אינם על הכרטיס. בלי מייל אין למי לשלוח מכתב שחרור,
    -- ולכן המכתב תלוי בשלב הזה ולא נולד פתוח לחינם.
    v_needs_prevdet := nullif(trim(coalesce(v_client.prev_accountant_email, '')), '') is null;

    -- ‼ 115: השאלה ללקוח נוצרת תמיד (הכרעת גיא 2026-08-18). כשיש כבר
    -- אימייל בכרטיס היא בקשת אישור בלבד — לא נועלת ולא חוסמת סגירה.
    select id into v_id_prevdet from public.onboarding_steps
      where client_id = e.client_id and step_type = 'prev_accountant_details' and status <> 'cancelled' limit 1;
    if v_id_prevdet is null and public.journey_default_enabled(v_snap, 'prev_accountant_details') then
      v_planned := v_planned || jsonb_build_object('step_type','prev_accountant_details','track','prev_accountant','scope','person','status','pending');
      if not p_dry_run then
        insert into public.onboarding_steps (user_id, engagement_id, client_id, required_for_close, step_type, track, scope, status, ball, payload)
        values (e.user_id, e.id, e.client_id, v_needs_prevdet, 'prev_accountant_details', 'prev_accountant', 'person', 'pending', 'client',
                coalesce(
                  public.journey_default_variant(v_snap, 'prev_accountant_details', v_facts)->'copy',
                case when v_needs_prevdet then jsonb_build_object(
                  'clientTitle', 'פרטי רואה החשבון הקודם שלך',
                  'clientSub', 'שם, אימייל וטלפון - כדי שנפנה אליו בשמך',
                  'clientCta', 'למילוי')
                else jsonb_build_object(
                  'clientTitle', 'לאשר את פרטי רואה החשבון הקודם',
                  'clientSub', 'הפרטים שאצלנו מוצגים למילוי מראש - רק לוודא שהם נכונים',
                  'clientCta', 'לאישור') end))
        returning id into v_id_prevdet;
        v_created := v_created + 1;
      end if;
    end if;

    select id into v_id_release from public.onboarding_steps
      where client_id = e.client_id and step_type = 'release_letter' and status <> 'cancelled' limit 1;
    if v_id_release is null and public.journey_default_enabled(v_snap, 'release_letter') then
      v_planned := v_planned || jsonb_build_object('step_type','release_letter','track','prev_accountant','scope','person',
        'status', case when v_needs_prevdet and v_id_prevdet is not null then 'locked' else 'pending' end);
      if not p_dry_run then
        insert into public.onboarding_steps (user_id, engagement_id, client_id, required_for_close, step_type, track, scope, status, ball, depends_on_step_id)
        values (e.user_id, e.id, e.client_id, true, 'release_letter', 'prev_accountant', 'person',
                case when v_needs_prevdet and v_id_prevdet is not null then 'locked' else 'pending' end, 'me',
                case when v_needs_prevdet then v_id_prevdet else null end)
        returning id into v_id_release;
        v_created := v_created + 1;
      end if;
    end if;

    select id into v_new_id from public.onboarding_steps
      where client_id = e.client_id and step_type = 'materials_received' and status <> 'cancelled' limit 1;
    if v_new_id is null and public.journey_default_enabled(v_snap, 'materials_received') then
      v_planned := v_planned || jsonb_build_object('step_type','materials_received','track','prev_accountant','scope','person','status','locked');
      if not p_dry_run then
        insert into public.onboarding_steps (user_id, engagement_id, client_id, required_for_close, step_type, track, scope, status, ball, depends_on_step_id, payload)
        values (e.user_id, e.id, e.client_id, true, 'materials_received', 'prev_accountant', 'person', 'locked', 'prev_accountant', v_id_release,
                jsonb_build_object('checklist', jsonb_build_array(
                  jsonb_build_object('key','ledgers','label','כרטסות הנהלת חשבונות','done',false),
                  jsonb_build_object('key','uniform_file','label','קובץ מבנה אחיד','done',false),
                  jsonb_build_object('key','excel_ledger','label','כרטסת אקסל','done',false),
                  jsonb_build_object('key','depreciation','label','טופס פחת','done',false),
                  jsonb_build_object('key','last_return','label','דוח שנתי אחרון','done',false),
                  jsonb_build_object('key','capital_declaration','label','הצהרת הון אחרונה','done',false),
                  jsonb_build_object('key','pnl_current','label','כרטסת רווח והפסד שוטפת','done',false),
                  jsonb_build_object('key','trial_balance','label','מאזן בוחן','done',false))));
        v_created := v_created + 1;
      end if;
    end if;
    v_new_id := null;
  end if;

  if v_needs_paperless then
    select id into v_id_invite from public.onboarding_steps
      where client_id = e.client_id and step_type = 'paperless_invite' and status <> 'cancelled' limit 1;
    if v_id_invite is null and public.journey_default_enabled(v_snap, 'paperless_invite') then
      v_planned := v_planned || jsonb_build_object('step_type','paperless_invite','track','tools','scope','person','status','pending');
      if not p_dry_run then
        insert into public.onboarding_steps (user_id, engagement_id, client_id, required_for_close, step_type, track, scope, status, ball, payload)
        values (e.user_id, e.id, e.client_id, true, 'paperless_invite', 'tools', 'person', 'pending', 'client',
                jsonb_build_object('paperlessStatus', coalesce(v_client.paperless_status,'unknown'),
                                   'dataSource','unknown',
                                   'clientTitle','הרשמה לפייפרלס',
                                   'clientSub','שתי דקות, ומשם רק מצלמים קבלות מהטלפון',
                                   'clientCta','נרשמתי לפייפרלס'))
        returning id into v_id_invite;
        v_created := v_created + 1;
      end if;
    end if;

    select id, status in ('completed','verified','skipped')
      into v_id_conn, v_conn_done
      from public.onboarding_steps
      where client_id = e.client_id and step_type = 'paperless_connection' and status <> 'cancelled' limit 1;
    if v_id_conn is null and public.journey_default_enabled(v_snap, 'paperless_connection') then
      v_planned := v_planned || jsonb_build_object('step_type','paperless_connection','track','tools','scope','person','status','locked');
      if not p_dry_run then
        insert into public.onboarding_steps (user_id, engagement_id, client_id, required_for_close, step_type, track, scope, status, ball, depends_on_step_id, payload)
        values (e.user_id, e.id, e.client_id, true, 'paperless_connection', 'tools', 'person', 'locked', 'me', v_id_invite,
                jsonb_build_object(
                  'clientTitle', 'חיבור לפייפרלס',
                  'clientSub', 'בימים הקרובים ניכנס לחשבון הפייפרלס ונשלים את החיבור. אין צורך לעשות דבר כרגע.'))
        returning id into v_id_conn;
        v_created := v_created + 1;
        v_conn_done := false;
      end if;
    end if;
  end if;

  -- ── חיבור פייפרלס לרשות המסים ──────────────────────────────────────────
  -- ‼ תלוי בחיבור ולא בהרשמה: בלי שם עסק ומשיכת עוסקים בחשבון אין מה לחבר.
  -- ‼ הכדור אצל הלקוח — ההזדהות היא בתעודת הזהות ובקוד הקבוע שלו.
  -- ‼ 117: בקשה שהמשרד הסיר אינה נולדת מחדש בהרצה חוזרת של המחולל.
  if v_needs_paperless and v_licensed
     and not exists (select 1 from public.onboarding_steps
                      where client_id = e.client_id
                        and step_type = 'paperless_tax_authority'
                        and status = 'cancelled') then
    select id into v_new_id from public.onboarding_steps
      where client_id = e.client_id and step_type = 'paperless_tax_authority'
        and status <> 'cancelled' limit 1;
    if v_new_id is null and public.journey_default_enabled(v_snap, 'paperless_tax_authority') then
      v_planned := v_planned || jsonb_build_object(
        'step_type','paperless_tax_authority','track','tools','scope','person',
        'status', case when v_id_conn is null or v_conn_done then 'pending' else 'locked' end);
      if not p_dry_run then
        insert into public.onboarding_steps (user_id, engagement_id, client_id, required_for_close,
                                             step_type, track, scope, status, ball, depends_on_step_id, payload)
        values (e.user_id, e.id, e.client_id, true, 'paperless_tax_authority', 'tools', 'person',
                case when v_id_conn is null or v_conn_done then 'pending' else 'locked' end,
                'client', v_id_conn,
                jsonb_build_object(
                  'clientTitle', 'חיבור פייפרלס לרשות המסים',
                  'clientSub', 'כדי שהחשבוניות שלך יקבלו מספר הקצאה',
                  'clientNote', E'1. בפייפרלס: הגדרות ← חיבורים והרשאות, ולחיצה על אייקון הקישור.\n2. נפתח אתר רשות המסים ומבקש הזדהות - תעודת זהות וקוד קבוע (לא כרטיס חכם). מאשרים את ההרשאה.\n3. חוזרים לפייפרלס ולוחצים "המשך".',
                  'clientNoteAfter', 'החיבור תקף לשלושה חודשים ואז צריך לחדש אותו - נזכיר לך כשיגיע הזמן. אם החיבור נכשל, ממתינים כשלוש שעות ומנסים שוב.',
                  'clientCta', 'ביצעתי את החיבור',
                  'clientLinkUrl', 'https://academy-bu.paperless.tax/he/articles/11424861-%D7%97%D7%99%D7%91%D7%95%D7%A8-%D7%94%D7%9E%D7%A2%D7%A8%D7%9B%D7%AA-%D7%9C%D7%A8%D7%A9%D7%95%D7%AA-%D7%94%D7%9E%D7%99%D7%A1%D7%99%D7%9D'));
        v_created := v_created + 1;
      end if;
    end if;
    v_new_id := null;
  end if;

  if v_has_monthly then
    if not exists (select 1 from public.onboarding_steps
                   where engagement_id = e.id and step_type = 'retainer_authorization')
       and public.journey_default_enabled(v_snap, 'retainer_authorization') then
      v_planned := v_planned || jsonb_build_object(
        'step_type','retainer_authorization','track','payment','scope','engagement',
        'status', case when v_id_conn is null or v_conn_done then 'pending' else 'locked' end,
        'depends_on', case when v_id_conn is null then null else 'paperless_connection' end);
      if not p_dry_run then
        insert into public.onboarding_steps (user_id, engagement_id, client_id, required_for_close, step_type, track, scope, status, ball, depends_on_step_id, payload)
        values (e.user_id, e.id, e.client_id, true, 'retainer_authorization', 'payment', 'engagement',
                case when v_id_conn is null or v_conn_done then 'pending' else 'locked' end,
                'me', v_id_conn,
                jsonb_build_object('amount', e.monthly_total, 'billingStartMonth', e.billing_start_month,
                                   'clientTitle', 'להזין אמצעי תשלום',
                                   'clientSub', 'הסכום שסוכם בהצעה, כהרשאה קבועה',
                                   'clientCta', 'להזנה')
                || case when v_no_paperless then jsonb_build_object('method','manual_arrangement') else '{}'::jsonb end);
        v_created := v_created + 1;
      end if;
    end if;
  end if;

  if not exists (select 1 from public.onboarding_steps
                 where engagement_id = e.id and step_type = 'internal_setup') then
    v_planned := v_planned || jsonb_build_object('step_type','internal_setup','track','internal','scope','engagement','status','pending');
    if not p_dry_run then
      insert into public.onboarding_steps (user_id, engagement_id, client_id, required_for_close, step_type, track, scope, status, ball, payload)
      values (e.user_id, e.id, e.client_id, true, 'internal_setup', 'internal', 'engagement', 'pending', 'me',
              jsonb_build_object('checklist', jsonb_build_array(
                jsonb_build_object('key','file_numbers','label','מספרי תיקים בכרטיס','done',false),
                jsonb_build_object('key','assignee','label','שיוך מטפל','done',false),
                jsonb_build_object('key','frequencies','label','תדירויות דיווח','done',false))));
      v_created := v_created + 1;
    end if;
  end if;

  if not exists (select 1 from public.onboarding_steps
                 where engagement_id = e.id and step_type = 'first_month_review') then
    v_planned := v_planned || jsonb_build_object('step_type','first_month_review','track','review','scope','engagement','status','pending');
    if not p_dry_run then
      insert into public.onboarding_steps (user_id, engagement_id, client_id, required_for_close, step_type, track, scope, status, ball, due_date)
      values (e.user_id, e.id, e.client_id, false, 'first_month_review', 'review', 'engagement', 'pending', 'me',
              (coalesce(e.approved_at, now()) + interval '30 days')::date);
      v_created := v_created + 1;
    end if;
  end if;

  -- ── בקשות חופשיות של המשרד ─────────────────────────────────────────
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
  if not p_dry_run and v_snap is not null then
    update public.onboarding_steps s
       set sort_order = public.journey_default_order(v_snap, s.step_type)
     where s.engagement_id = e.id
       and coalesce(s.sort_order, 0) = 0
       and public.journey_default_entry(v_snap, s.step_type) is not null;
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
      'monthlyTotal', e.monthly_total, 'billingStartMonth', e.billing_start_month));
end;
$function$

