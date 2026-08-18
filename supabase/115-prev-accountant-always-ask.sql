-- 115 — מסלול הרו"ח הקודם: השאלה ללקוח נוצרת תמיד, והפרטים הקיימים מוצגים לאישור.
-- הכרעות גיא 2026-08-18:
--   1. כרטיס אחד במסך המשרד — הבקשה "פרטי הרו"ח הקודם" אינה כרטיס נפרד (צד לקוח: ללא שינוי).
--   2. השאלה ללקוח נוצרת תמיד. כשיש כבר אימייל בכרטיס — היא בקשת אישור בלבד:
--      אינה נועלת את המכתב ואינה חוסמת סגירת קליטה (required_for_close=false).
--   3. הערכים שהלקוח שולח גוברים על הכרטיס — זה בדיוק מסך האישור/תיקון של הפרטים.
--   4. דף הלקוח מקבל prefill — הפרטים הקיימים ממולאים מראש בטופס.
--
-- ‼ שלוש הפונקציות נטלאות על הגרסה החיה (pg_get_functiondef + replace) ולא
--   משוכתבות מקובץ ריפו — כי generate_onboarding_steps כבר זז מאז live-2026-08-09
--   (מיגרציות 109/111). כל טלאי בודק שהטקסט הישן קיים, ונכשל בקול אם לא.
-- ‼ להריץ דרך execute_sql ולאמת אחרי — apply_migration מדווח הצלחה על בלוקי DO
--   בלי להחיל אותם (ראה MIGRATIONS.md, לקח מ-101).

-- ── 1. generate_onboarding_steps — השאלה נוצרת תמיד; נעילה רק כשאין אימייל ──
do $patch$
declare
  src text;
  old1 text;
  new1 text;
  old2 text;
  new2 text;
begin
  src := pg_get_functiondef('public.generate_onboarding_steps(text, boolean)'::regprocedure);

  old1 := $f$    if v_needs_prevdet then
      select id into v_id_prevdet from public.onboarding_steps
        where client_id = e.client_id and step_type = 'prev_accountant_details' and status <> 'cancelled' limit 1;
      if v_id_prevdet is null then
        v_planned := v_planned || jsonb_build_object('step_type','prev_accountant_details','track','prev_accountant','scope','person','status','pending');
        if not p_dry_run then
          insert into public.onboarding_steps (user_id, engagement_id, client_id, required_for_close, step_type, track, scope, status, ball, payload)
          values (e.user_id, e.id, e.client_id, true, 'prev_accountant_details', 'prev_accountant', 'person', 'pending', 'client',
                  jsonb_build_object(
                    'clientTitle', 'פרטי רואה החשבון הקודם שלך',
                    'clientSub', 'שם, אימייל וטלפון — כדי שנפנה אליו בשמך',
                    'clientCta', 'למילוי'))
          returning id into v_id_prevdet;
          v_created := v_created + 1;
        end if;
      end if;
    end if;$f$;

  new1 := $f$    -- ‼ 115: השאלה ללקוח נוצרת תמיד (הכרעת גיא 2026-08-18). כשיש כבר
    -- אימייל בכרטיס היא בקשת אישור בלבד — לא נועלת ולא חוסמת סגירה.
    select id into v_id_prevdet from public.onboarding_steps
      where client_id = e.client_id and step_type = 'prev_accountant_details' and status <> 'cancelled' limit 1;
    if v_id_prevdet is null then
      v_planned := v_planned || jsonb_build_object('step_type','prev_accountant_details','track','prev_accountant','scope','person','status','pending');
      if not p_dry_run then
        insert into public.onboarding_steps (user_id, engagement_id, client_id, required_for_close, step_type, track, scope, status, ball, payload)
        values (e.user_id, e.id, e.client_id, v_needs_prevdet, 'prev_accountant_details', 'prev_accountant', 'person', 'pending', 'client',
                case when v_needs_prevdet then jsonb_build_object(
                  'clientTitle', 'פרטי רואה החשבון הקודם שלך',
                  'clientSub', 'שם, אימייל וטלפון — כדי שנפנה אליו בשמך',
                  'clientCta', 'למילוי')
                else jsonb_build_object(
                  'clientTitle', 'לאשר את פרטי רואה החשבון הקודם',
                  'clientSub', 'הפרטים שאצלנו מוצגים למילוי מראש — רק לוודא שהם נכונים',
                  'clientCta', 'לאישור') end)
        returning id into v_id_prevdet;
        v_created := v_created + 1;
      end if;
    end if;$f$;

  old2 := $f$      v_planned := v_planned || jsonb_build_object('step_type','release_letter','track','prev_accountant','scope','person',
        'status', case when v_id_prevdet is null then 'pending' else 'locked' end);
      if not p_dry_run then
        insert into public.onboarding_steps (user_id, engagement_id, client_id, required_for_close, step_type, track, scope, status, ball, depends_on_step_id)
        values (e.user_id, e.id, e.client_id, true, 'release_letter', 'prev_accountant', 'person',
                case when v_id_prevdet is null then 'pending' else 'locked' end, 'me', v_id_prevdet)$f$;

  -- ‼ המכתב נעול רק כשבאמת אין אימייל: בקשת אישור אינה חוסמת אותו.
  new2 := $f$      v_planned := v_planned || jsonb_build_object('step_type','release_letter','track','prev_accountant','scope','person',
        'status', case when v_needs_prevdet and v_id_prevdet is not null then 'locked' else 'pending' end);
      if not p_dry_run then
        insert into public.onboarding_steps (user_id, engagement_id, client_id, required_for_close, step_type, track, scope, status, ball, depends_on_step_id)
        values (e.user_id, e.id, e.client_id, true, 'release_letter', 'prev_accountant', 'person',
                case when v_needs_prevdet and v_id_prevdet is not null then 'locked' else 'pending' end, 'me',
                case when v_needs_prevdet then v_id_prevdet else null end)$f$;

  if position(old1 in src) = 0 then
    raise exception '115: generate_onboarding_steps — קטע 1 לא נמצא, הפונקציה החיה השתנתה';
  end if;
  if position(old2 in src) = 0 then
    raise exception '115: generate_onboarding_steps — קטע 2 לא נמצא, הפונקציה החיה השתנתה';
  end if;

  src := replace(replace(src, old1, new1), old2, new2);
  execute src;
end
$patch$;

-- ── 2. portal_submit_step — מה שהלקוח שלח גובר על הכרטיס ──────────────────────
do $patch$
declare
  src text;
begin
  src := pg_get_functiondef('public.portal_submit_step(text, text, jsonb)'::regprocedure);

  if position('coalesce(prev_accountant_name, v_name)' in src) = 0 then
    raise exception '115: portal_submit_step — קטע ה-coalesce לא נמצא, הפונקציה החיה השתנתה';
  end if;

  -- ‼ היפוך הקדימות: הלקוח מאשר/מתקן, ולכן הערך שלו הוא העדכני. שדה שנשלח
  --   ריק (v_* כבר null אחרי nullif/trim) משאיר את מה שבכרטיס.
  src := replace(src, 'coalesce(prev_accountant_name, v_name)',  'coalesce(v_name, prev_accountant_name)');
  src := replace(src, 'coalesce(prev_accountant_email, v_email)', 'coalesce(v_email, prev_accountant_email)');
  src := replace(src, 'coalesce(prev_accountant_phone, v_phone)', 'coalesce(v_phone, prev_accountant_phone)');
  execute src;
end
$patch$;

-- ── 3. build_client_portal — הפרטים הקיימים נשלחים לטופס כמילוי-מראש ──────────
do $patch$
declare
  src text;
  old1 text;
  new1 text;
begin
  src := pg_get_functiondef('public.build_client_portal(text, text)'::regprocedure);

  old1 := $f$'actionKind','portal','actionValue', s.id, 'kind','prev_accountant'));$f$;

  -- ‼ כמו businessName בכרטיס הפייפרלס: מקור האמת הוא הכרטיס, הערך כאן הוא
  --   מילוי-מראש לאישור. jsonb_strip_nulls החיצוני מעלים prefill ריק.
  new1 := $f$'actionKind','portal','actionValue', s.id, 'kind','prev_accountant',
          'prefill', nullif(jsonb_strip_nulls(jsonb_build_object(
            'name',  nullif(trim(coalesce(c.prev_accountant_name ,'')), ''),
            'email', nullif(trim(coalesce(c.prev_accountant_email,'')), ''),
            'phone', nullif(trim(coalesce(c.prev_accountant_phone,'')), ''))), '{}'::jsonb)));$f$;

  if position(old1 in src) = 0 then
    raise exception '115: build_client_portal — קטע הפריט לא נמצא, הפונקציה החיה השתנתה';
  end if;

  src := replace(src, old1, new1);
  execute src;
end
$patch$;
