-- ─── 130 · חיבור פייפרלס לרשות המסים ────────────────────────────────────────
-- שלב חדש ברצף הפייפרלס: 'paperless_tax_authority'.
--
--   הרשמה (לקוח) → חיבור (משרד) → ┬→ הרשאה לתשלום חודשי (משרד)
--                                  └→ חיבור לרשות המסים (לקוח)   ← החדש
--
-- ‼ למה שלב ולא סעיף שישי ברשימת ההקמה: הפעולה היא של הלקוח. ההזדהות מול
-- רשות המסים היא בתעודת הזהות ובקוד הקבוע שלו, ואי אפשר לעשות אותה בשמו —
-- בעוד שכל חמשת סעיפי ההקמה נעשים על ידינו בתוך חשבון הפייפרלס. רשימת
-- ההקמה נעולה למשרד ואינה מוצגת בדף האישי, ולכן סעיף שם היה בקשה שהלקוח
-- לעולם לא רואה. בנוסף: החיבור פג אחרי שלושה חודשים — וי חד-פעמי ברשימה
-- שנסגרת לתמיד אינו המבנה הנכון לדבר שחוזר.
--
-- ‼ למי הוא נוצר אוטומטית: עוסק מורשה וחברה בלבד (הכרעת גיא, 2026-08-25).
-- עוסק פטור אינו מוציא חשבונית מס ואין לו מה להקצות. ההכרעה נגזרת מתבנית
-- ההצעה (quotation_templates.kind), ובהיעדרה מסוג העוסק שעל הכרטיס
-- (clients.dealer_type). אין אף אחד מהם ⇒ לא נוצר, והבקשה נשארת זמינה תמיד
-- מ"+ בקשה חדשה".
--
-- ‼ מה לא נכלל כאן: החידוש התקופתי. נשמרת רק החותמת connectedAt שממנה
-- יימדדו שלושת החודשים ביום שהחידוש ייבנה (הכרעת גיא — קודם החיבור הראשון).
--
-- חמישה טלאים על הגדרות חיות, בדפוס של 106/115/117: קוראים את המקור מהמסד,
-- מחליפים עוגן יחיד, ונופלים בקול אם העוגן לא נמצא — כדי שלא תיווצר החלה
-- חלקית שנראית כמו הצלחה.

-- ── 1. הסוג החדש מותר בעמודה ────────────────────────────────────────────────
-- ‼ תוספת ולא כתיבה מחדש. הגרסה הראשונה כאן הייתה רשימה קשיחה, ובאותו יום
-- בדיוק סשן מקביל הוסיף `rep_client_approval` — כלומר הרצה חוזרת של הקובץ
-- הזה הייתה מוחקת סוג שלב חי, עם שורות במסד. הבלוק קורא את הרשימה
-- הקיימת ומוסיף לה, ולכן הוא בטוח בכל סדר ובכל מספר הרצות.
do $do$
declare
  v_types text[];
begin
  select array_agg(x) into v_types
    from (select unnest(enum_or_check_values) x
            from (select regexp_matches(pg_get_constraintdef(oid),
                          '''([a-z_]+)''::text', 'g') as enum_or_check_values
                    from pg_constraint
                   where conname = 'onboarding_steps_step_type_check'
                     and conrelid = 'public.onboarding_steps'::regclass) s) t;

  if v_types is null then
    raise exception '130: אילוץ step_type לא נמצא - לא מנחשים רשימה';
  end if;
  if 'paperless_tax_authority' = any (v_types) then
    raise notice '130: הסוג כבר מותר בעמודה - מדלגים';
    return;
  end if;

  v_types := v_types || 'paperless_tax_authority';
  execute 'alter table public.onboarding_steps drop constraint onboarding_steps_step_type_check';
  execute format('alter table public.onboarding_steps add constraint onboarding_steps_step_type_check
                    check (step_type = any (%L))', v_types);
end $do$;

-- ── 2. המסלול שלו — כלים, כמו שאר הפייפרלס ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.onboarding_track_for(p_step_type text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select case p_step_type
    when 'representation' then 'authorities'
    when 'representation_upgrade' then 'authorities'
    when 'file_opening' then 'authorities'
    when 'institution_alignment_btl' then 'authorities'
    when 'institution_alignment_vat' then 'authorities'
    when 'institution_alignment_income' then 'authorities'
    when 'release_letter' then 'prev_accountant'
    when 'materials_received' then 'prev_accountant'
    when 'prev_accountant_details' then 'prev_accountant'
    when 'paperless_invite' then 'tools'
    when 'paperless_connection' then 'tools'
    when 'paperless_tax_authority' then 'tools'
    when 'data_import' then 'tools'
    when 'data_verification' then 'tools'
    when 'client_documents' then 'tools'
    when 'retainer_authorization' then 'payment'
    when 'internal_setup' then 'internal'
    when 'kyc_identification' then 'internal'
    when 'intake_questionnaire' then 'internal'
    when 'first_month_review' then 'review'
    when 'opening_call' then 'review'
    when 'custom_request' then 'custom'
    else 'custom' end;
$function$;

-- ── 3. המחולל יוצר את השלב לעוסק מורשה ולחברה ──────────────────────────────
do $do$
declare
  v_src text := pg_get_functiondef('public.generate_onboarding_steps(text,boolean)'::regprocedure);
  v_new text;
begin
  if position('paperless_tax_authority' in v_src) > 0 then
    raise notice '130: המחולל כבר מכיר את השלב - מדלגים';
    return;
  end if;

  -- 3א. משתנה ההכרעה
  v_new := replace(v_src, $q$  v_docs       jsonb;$q$,
$q$  v_docs       jsonb;
  v_licensed   boolean := false;$q$);
  if v_new = v_src then raise exception '130: ההצהרה v_docs לא נמצאה במחולל'; end if;
  v_src := v_new;

  -- 3ב. מי נחשב עוסק מורשה
  v_new := replace(v_src,
    $q$  v_needs_paperless := (v_has_monthly or v_has_paperless) and not v_no_paperless;$q$,
$q$  v_needs_paperless := (v_has_monthly or v_has_paperless) and not v_no_paperless;

  -- ‼ עוסק מורשה וחברה בלבד: מספר הקצאה נדרש לחשבונית מס, ועוסק פטור אינו
  -- מוציא כזו. תבנית ההצעה היא ההכרעה; סוג העוסק שעל הכרטיס הוא הגיבוי
  -- כשההצעה נבנתה בלי תבנית. אין אף אחד מהם ⇒ לא מנחשים, והבקשה נשארת
  -- זמינה ידנית מ"+ בקשה חדשה".
  select coalesce(t.kind in ('licensed_dealer','company'), false)
    into v_licensed
    from public.quotation_templates t where t.id = q.template_id;
  v_licensed := coalesce(v_licensed, false)
                or coalesce(v_client.dealer_type, '') in ('licensed','company');$q$);
  if v_new = v_src then raise exception '130: חישוב v_needs_paperless לא נמצא במחולל'; end if;
  v_src := v_new;

  -- 3ג. יצירת השלב, אחרי שלב החיבור ולפני הרשאת התשלום
  v_new := replace(v_src, $q$  if v_has_monthly then$q$,
$q$  -- ── חיבור פייפרלס לרשות המסים ──────────────────────────────────────────
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
    if v_new_id is null then
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

  if v_has_monthly then$q$);
  if v_new = v_src then raise exception '130: העוגן v_has_monthly לא נמצא במחולל'; end if;

  execute v_new;
end $do$;

-- ── 4. הדף האישי — הוראות והצהרה ───────────────────────────────────────────
do $do$
declare
  v_src text := pg_get_functiondef('public.build_client_portal(text,text)'::regprocedure);
  v_new text;
begin
  if position('paperless_tax_authority' in v_src) > 0 then
    raise notice '130: הדף האישי כבר מכיר את השלב - מדלגים';
    return;
  end if;

  v_new := replace(v_src, $q$when 'retainer_authorization' then$q$,
$q$-- ── חיבור פייפרלס לרשות המסים ────────────────────────────────────────
    -- ‼ הפעולה קורית מחוץ לדף, אבל בניגוד להזנת הכרטיס יש כאן מה לאשר:
    -- הלקוח הוא היחיד שיודע שהחיבור בוצע, וההצהרה שלו היא שסוגרת. אין
    -- לנו גישה לחשבון שלו ברשות המסים ולכן אין מה לאמת.
    when 'paperless_tax_authority' then
      if s.status in ('completed','verified','skipped') then
        v_items := v_items || jsonb_build_object('bucket','done','key','paperless_tax',
          'label', coalesce(nullif(s.payload->>'clientTitle',''), 'חיבור פייפרלס לרשות המסים'));
      elsif s.status = 'locked' then
        v_items := v_items || jsonb_strip_nulls(jsonb_build_object(
          'bucket','future','key','paperless_tax',
          'label', coalesce(nullif(s.payload->>'clientTitle',''), 'חיבור פייפרלס לרשות המסים'),
          'sub', public.portal_lock_reason(s.id)));
      else
        v_items := v_items || jsonb_strip_nulls(jsonb_build_object(
          'bucket','action','key','paperless_tax',
          'label', coalesce(nullif(s.payload->>'clientTitle',''), 'חיבור פייפרלס לרשות המסים'),
          'sub', nullif(s.payload->>'clientSub',''),
          'note', nullif(s.payload->>'clientNote',''),
          'noteAfter', nullif(s.payload->>'clientNoteAfter',''),
          'cta', coalesce(nullif(s.payload->>'clientCta',''), 'ביצעתי את החיבור'),
          'linkUrl', nullif(s.payload->>'clientLinkUrl',''),
          'actionKind','portal','actionValue', s.id, 'kind','declare'));
      end if;

    when 'retainer_authorization' then$q$);
  if v_new = v_src then raise exception '130: העוגן retainer_authorization לא נמצא בדף האישי'; end if;

  execute v_new;
end $do$;

-- ── 5. הלקוח מאשר מהדף האישי ───────────────────────────────────────────────
do $do$
declare
  v_src text := pg_get_functiondef('public.portal_submit_step(text,text,jsonb)'::regprocedure);
  v_new text;
begin
  if position('paperless_tax_authority' in v_src) > 0 then
    raise notice '130: portal_submit_step כבר מכיר את השלב - מדלגים';
    return;
  end if;

  v_new := replace(v_src,
    $q$if s.step_type not in ('prev_accountant_details', 'custom_request', 'paperless_invite') then$q$,
    $q$if s.step_type not in ('prev_accountant_details', 'custom_request', 'paperless_invite', 'paperless_tax_authority') then$q$);
  if v_new = v_src then raise exception '130: רשימת ההיתר לא נמצאה ב-portal_submit_step'; end if;
  v_src := v_new;

  v_new := replace(v_src, $q$if s.step_type = 'paperless_invite' then$q$,
$q$-- ── "ביצעתי את החיבור" — פייפרלס אל מול רשות המסים ────────────────────────
  -- ‼ הצהרה בלי נתונים, בדיוק כמו "נרשמתי לפייפרלס": אין לנו גישה לחשבון
  -- שלו ברשות המסים, ומה שנשמר הוא מה שקרה — הוא אמר שביצע. הרו"ח רואה את
  -- ההצהרה ביומן ויכול לפתוח את הבקשה מחדש אם התברר אחרת.
  -- ‼ connectedAt נשמר כבר עכשיו, לפני שיש חידוש: זו החותמת שממנה יימדדו
  -- שלושת החודשים ביום שהחידוש ייבנה.
  if s.step_type = 'paperless_tax_authority' then
    update public.onboarding_steps
       set status = 'completed', ball = 'me', completion_method = 'system',
           completed_at = now(), needs_attention = false,
           payload = payload || jsonb_build_object(
             'submittedByClient', true,
             'clientConfirmedAt', to_jsonb(now()),
             'connectedAt', to_jsonb(now()))
     where id = s.id;

    perform public.log_onboarding_event(s.user_id, s.id, s.engagement_id, 'status_changed', 'client',
      'הלקוח אישר שחיבר את פייפרלס לרשות המסים',
      jsonb_build_object('to', 'completed'));

    perform public.unlock_dependent_steps(s.id);

    perform public.queue_accountant_notification(
      s.user_id, 'client_request_completed', c.id, s.id, null, null,
      jsonb_build_object(
        'clientName', v_client_name,
        'requestTitle', coalesce(nullif(s.payload->>'clientTitle',''), 'חיבור פייפרלס לרשות המסים'),
        'lastItem', 'הלקוח דיווח שהחיבור בוצע - אפשר לוודא בחשבון שהוא פעיל'));

    return jsonb_build_object('ok', true, 'completed', true);
  end if;

  if s.step_type = 'paperless_invite' then$q$);
  if v_new = v_src then raise exception '130: ענף paperless_invite לא נמצא ב-portal_submit_step'; end if;

  execute v_new;
end $do$;

-- ── 6. הבקשה זמינה מ"+ בקשה חדשה" ──────────────────────────────────────────
do $do$
declare
  v_src text := pg_get_functiondef('public.create_onboarding_request(text,text,jsonb,date,text,boolean,boolean,text,text)'::regprocedure);
  v_new text;
begin
  if position('paperless_tax_authority' in v_src) > 0 then
    raise notice '130: create_onboarding_request כבר מכיר את השלב - מדלגים';
    return;
  end if;

  v_new := replace(v_src,
    $q$'paperless_invite','paperless_connection','retainer_authorization',$q$,
    $q$'paperless_invite','paperless_connection','paperless_tax_authority','retainer_authorization',$q$);
  if v_new = v_src then raise exception '130: רשימת ההיתר לא נמצאה ב-create_onboarding_request'; end if;

  execute v_new;
end $do$;
