-- ═══════════════════════════════════════════════════════════════════════════
-- 222 · «צפייה» בבקשה — לראות בדיוק מה שהלקוח מקבל (05.10.2026)
--
-- המקור: docs/PLAN-REQUEST-PREVIEW-2026-10-05.md. נבנה על 221 (המילואים — כבר בייצור).
--
-- הבעיה: מה שהלקוח רואה נבנה כולו בשרת (build_client_portal), ולכן כל תצוגה שנבנית בדפדפן היא העתק
--   שיתיישן. כאן מוציאים את ענפי הסוגים לפונקציה משותפת, ופונקציית צפייה אחת קוראת לה עם רשומות וירטואליות
--   (נתוני דוגמה) — אותו קוד בדיוק, בלי לכתוב דבר.
--
-- מה נוסף:
--   1. _portal_rep_item · _portal_step_items · _portal_prev_items — ענפי הסוגים של build_client_portal, גוף 221
--      מילה במילה (נגזרים בסקריפט scripts/verify-222-body.mjs — לא מועתקים ביד), בשלושה «תפרים» בלבד שבכולם
--      p_ctx = '{}' ⇒ התנהגות זהה: מי מאשר באזור האישי · סיבת נעילה · תשובות על עבודה מהבית.
--   2. build_client_portal — אותו גוף; הלולאה קוראת ל-_portal_step_items. פלט זהה תו-בתו (scripts/qa-222-identity.mjs).
--   3. _rep_client_approval_payload · _rep_client_approval_required_payload · _onboarding_system_payload —
--      הנוסחים שהיוצרים (אישור הייצוג ב-217, המחולל ב-216) כתבו בתוך הגוף שלהם, כפונקציות שגם הצפייה קוראת.
--      היוצרים עצמם קוראים להן עכשיו (גוף מילה במילה, חוץ מהקריאה).
--   4. preview_request_sample — הצפייה: STABLE (Postgres עצמו אוסר בה כתיבה), רק למשרד מורשה.
--
-- ‼ לא נוגעים ב-portal_submit_step וכל פונקציות ההגשה, בפרסום, במייל, בתזכורות ובאוטומציות.
-- ‼ שום דבר כאן לא כותב ללקוחות, לא שולח מייל ולא נוגע בבקשות קיימות.
-- ‼ החלה חוזרת של מיגרציה נמוכה יותר על אותה סביבה דורסת את הגופים כאן — אחרי כל החלה: node scripts/verify-222-body.mjs --live <staging|prod>.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1 · נוסחי היוצרים כפונקציות ─────────────────────────────────────────────
-- >>> GENERATED:rep_client_approval_payload (scripts/verify-222-body.mjs — לא לערוך ידנית)
create or replace function public._rep_client_approval_payload(p_user_id uuid)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare
  v_tpl  jsonb;
begin
  -- 186: נוסח המשרד ל"הסבר"/שורת-משנה/קישור, אם קיים. title/cta/linkUrl
  -- קבועים למטה ואינם נקראים מכאן — system-owned.
  select settings -> 'representation' -> 'templates' -> 'portalCard' into v_tpl
    from public.profiles where id = p_user_id;

  return jsonb_build_object(
       'clientTitle', 'זירוז אישור הייצוג באזור האישי',
       'clientSub', coalesce(nullif(v_tpl ->> 'sub', ''),
         'אופציונלי - שתי דקות שמקצרות את ההמתנה לאישור הרשויות'),
       'clientNote', coalesce(nullif(v_tpl ->> 'note', ''),
         E'יש לך כבר משתמש באזור האישי של רשות המסים?\n\nכן - נכנסים בקישור, לוחצים \"לכניסה למערכת\" ומזדהים. מסמנים את כל הבקשות שבהן המשרד מופיע כמייצג, ולוחצים «אישור ייצוג». שתי דקות.\n\nלא - קודם צריך להירשם ולהזדהות מול רשות המסים. זה החלק שלוקח את הזמן, ובלעדיו אי אפשר לאשר.\n\nאם קיבלת מרשות המסים הודעת SMS על רישום מייצג - אפשר להיכנס ישירות מהקישור שבהודעה, וזה קצר יותר.'),
       'clientNoteAfter', coalesce(nullif(v_tpl ->> 'noteAfter', ''),
         'ואם לא הסתדר - אין בעיה. הייצוג ייכנס לתוקף גם בלי זה, זה פשוט לוקח כמה ימים יותר.'),
       'clientCta', 'אישרתי באזור האישי',
       'clientLinkUrl', 'https://www.gov.il/he/service/personal_area_taxes',
       'clientLinkLabel', coalesce(nullif(v_tpl ->> 'linkLabel', ''), 'לכניסה לאזור האישי'));
end;
$function$;
-- <<< GENERATED:rep_client_approval_payload

-- >>> GENERATED:rep_client_approval_required_payload (scripts/verify-222-body.mjs — לא לערוך ידנית)
create or replace function public._rep_client_approval_required_payload(p_payload jsonb, p_people jsonb)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
begin
  return p_payload || jsonb_build_object(
           'requiredBy', 'shaam',
           'requiredSince', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
           'optionalCopy', jsonb_build_object(
             'clientTitle', p_payload -> 'clientTitle',
             'clientSub', p_payload -> 'clientSub',
             'clientNoteAfter', p_payload -> 'clientNoteAfter'),
           'clientTitle', 'אישור הייצוג באזור האישי',
           -- ‼ 217 (H2.5b): מי ששע״ם ממתינה לאישור שלו — לא «שלך» קבוע (אצל זוג זו לעתים
           -- בת הזוג). בלי נתון — הנוסח הקבוע. הדף גוזר מחדש בכל טעינה (build_client_portal).
           'clientSub', coalesce(public._rep_approval_required_sub(p_people),
                                 'נדרש - רשות המסים ממתינה לאישור שלך לבקשת הייצוג'),
           'clientNoteAfter', 'בלי האישור הזה רשות המסים לא תקלוט את הייצוג, והטיפול מולה לא יוכל להתקדם.');
end;
$function$;
-- <<< GENERATED:rep_client_approval_required_payload

-- >>> GENERATED:onboarding_system_payload (scripts/verify-222-body.mjs — לא לערוך ידנית)
create or replace function public._onboarding_system_payload(p_step_type text, p_inputs jsonb default '{}'::jsonb)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare
  v_docs jsonb := coalesce(p_inputs->'checklist', '[]'::jsonb);
begin
  case p_step_type
    when 'client_documents' then
      return jsonb_build_object(
               'checklist', v_docs,
               'clientTitle', 'להעלות ' || jsonb_array_length(v_docs) || ' מסמכים',
               'clientSub', (select string_agg(d->>'label', ' · ') from jsonb_array_elements(v_docs) d),
               'clientCta', 'להעלאה');
    when 'prev_accountant_details' then
      return case when coalesce((p_inputs->>'needsDetails')::boolean, false) then jsonb_build_object(
                   'clientTitle', 'פרטי רואה החשבון הקודם שלך',
                   'clientSub', 'שם, אימייל וטלפון - כדי שנפנה אליו בשמך',
                   'clientCta', 'למילוי')
                  else jsonb_build_object(
                   'clientTitle', 'לאשר את פרטי רואה החשבון הקודם',
                   'clientSub', 'הפרטים שאצלנו מוצגים למילוי מראש - רק לוודא שהם נכונים',
                   'clientCta', 'לאישור') end;
    when 'paperless_invite' then
      return jsonb_build_object('paperlessStatus', coalesce(p_inputs->>'paperlessStatus','unknown'),
                                  'dataSource','unknown',
                                  'clientTitle','הרשמה לפייפרלס',
                                  'clientSub','שתי דקות, ומשם רק מצלמים קבלות מהטלפון',
                                  'clientCta','נרשמתי לפייפרלס');
    when 'paperless_connection' then
      return jsonb_build_object(
                 'clientTitle', 'חיבור לפייפרלס',
                 'clientSub', 'בימים הקרובים ניכנס לחשבון הפייפרלס ונשלים את החיבור. אין צורך לעשות דבר כרגע.');
    when 'paperless_tax_authority' then
      return jsonb_build_object(
               'clientTitle', 'חיבור פייפרלס לרשות המסים',
               'clientSub', 'כדי שהחשבוניות שלך יקבלו מספר הקצאה',
               'clientNote', E'1. בפייפרלס: הגדרות ← חיבורים והרשאות, ולחיצה על אייקון הקישור.\n2. נפתח אתר רשות המסים ומבקש הזדהות - תעודת זהות וקוד קבוע (לא כרטיס חכם). מאשרים את ההרשאה.\n3. חוזרים לפייפרלס ולוחצים "המשך".',
               'clientNoteAfter', 'החיבור תקף לשלושה חודשים ואז צריך לחדש אותו - נזכיר לך כשיגיע הזמן. אם החיבור נכשל, ממתינים כשלוש שעות ומנסים שוב.',
               'clientCta', 'ביצעתי את החיבור',
               'clientLinkUrl', 'https://academy-bu.paperless.tax/he/articles/11424861-%D7%97%D7%99%D7%91%D7%95%D7%A8-%D7%94%D7%9E%D7%A2%D7%A8%D7%9B%D7%AA-%D7%9C%D7%A8%D7%A9%D7%95%D7%AA-%D7%94%D7%9E%D7%99%D7%A1%D7%99%D7%9D');
    when 'retainer_authorization' then
      return jsonb_build_object('amount', p_inputs->'amount', 'billingStartMonth', p_inputs->'billingStartMonth',
                                  'clientTitle', 'להזין אמצעי תשלום',
                                  'clientSub', 'הסכום שסוכם בהצעה, כהרשאה קבועה',
                                  'clientCta', 'להזנה');
    else
      return null;
  end case;
end;
$function$;
-- <<< GENERATED:onboarding_system_payload

-- ── 2 · הדף האישי: ענפי הסוגים בפונקציה משותפת ──────────────────────────────
-- >>> GENERATED:portal_rep_item (scripts/verify-222-body.mjs — לא לערוך ידנית)
create or replace function public._portal_rep_item(req public.representation_requests)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare
  v_rep_item jsonb := null;
  v_sign_token text;
  v_spouse_pending boolean := false;
begin
  if req.id is not null then
    if req.status = 'pending_fill' then
      v_rep_item := jsonb_strip_nulls(jsonb_build_object('bucket','action','key','rep_fill','label','מילוי פרטים וייפוי כוח','sub','הפרטים שנדרשים כדי לייצג אותך מול רשויות המס · כמה דקות','actionKind','onboard','actionValue', req.onboarding_token));
    elsif req.status = 'pending_signature' then
      select x->>'signToken' into v_sign_token
        from jsonb_array_elements(coalesce(req.signers, '[]'::jsonb)) x
        where x->>'role' = 'client' and x->>'signStatus' = 'pending' limit 1;
      select exists (
        select 1 from jsonb_array_elements(coalesce(req.signers, '[]'::jsonb)) x
        where x->>'role' = 'spouse' and x->>'signStatus' = 'pending')
        into v_spouse_pending;
      if v_sign_token is not null then
        v_rep_item := jsonb_strip_nulls(jsonb_build_object('bucket','action','key','rep_sign','label','חתימה על ייפוי הכוח','sub','הטופס מוכן - נשארה חתימה · כדקה','actionKind','sign','actionValue', v_sign_token));
      elsif v_spouse_pending then
        select jsonb_strip_nulls(jsonb_build_object('bucket','action','key','rep_sign_spouse','label','חתימת בן/בת הזוג על ייפוי הכוח','sub','אפשר לחתום יחד עכשיו, או לשלוח לבן/בת הזוג קישור אישי','actionKind','sign','actionValue', x->>'signToken')) into v_rep_item
        from jsonb_array_elements(coalesce(req.signers, '[]'::jsonb)) x
        where x->>'role' = 'client' and coalesce(x->>'signToken', '') <> '' limit 1;
      end if;
    elsif req.status in ('awaiting_accountant', 'awaiting_stamp') then
      -- ‼ 208 · «ממתין לרו"ח» לפני כל חתימה = אנחנו מכינים את הטופס. «נחתם על ידך»
      -- נאמר רק כשמישהו באמת חתם.
      v_rep_item := jsonb_build_object('bucket','office','key','rep_office','label','ייפוי הכוח','sub',
        case when exists (select 1 from jsonb_array_elements(coalesce(req.signers, '[]'::jsonb)) x
                           where x->>'signStatus' = 'signed')
             then 'נחתם על ידך - עכשיו בבדיקה ובחתימה אצלנו'
             else 'הפרטים התקבלו - אנחנו מכינים את ייפוי הכוח לחתימה' end);
    elsif req.status = 'awaiting_authorities' then
      v_rep_item := jsonb_build_object('bucket','office','key','rep_authorities','label','ייפוי הכוח','sub','נחתם והוגש לרשויות המס - ממתינים לאישור');
    elsif req.status = 'active' then
      v_rep_item := jsonb_build_object('bucket','done','key','rep_done','label','הייצוג מול רשויות המס אושר');
    end if;
  end if;
  return v_rep_item;
end;
$function$;
-- <<< GENERATED:portal_rep_item

-- >>> GENERATED:portal_prev_items (scripts/verify-222-body.mjs — לא לערוך ידנית)
create or replace function public._portal_prev_items(p_open boolean, p_done boolean)
 returns jsonb
 language plpgsql
 immutable
 set search_path to 'public'
as $function$
declare
  v_items jsonb := '[]'::jsonb;
  v_prev_open boolean := coalesce(p_open, false);
  v_prev_done boolean := coalesce(p_done, false);
begin
  if v_prev_open then
    v_items := v_items || jsonb_build_object('bucket','office','key','prev_accountant','label','קבלת החומרים מרואה החשבון הקודם','sub','ביקשנו את התיק - בתהליך');
  elsif v_prev_done then
    v_items := v_items || jsonb_build_object('bucket','done','key','prev_accountant','label','החומרים מרואה החשבון הקודם התקבלו');
  end if;
  return v_items;
end;
$function$;
-- <<< GENERATED:portal_prev_items

-- >>> GENERATED:portal_step_items (scripts/verify-222-body.mjs — לא לערוך ידנית)
create or replace function public._portal_step_items(
  s public.onboarding_steps, c public.clients, p public.profiles, req public.representation_requests,
  p_rep_item jsonb, p_ctx jsonb default '{}'::jsonb)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare
  v_items      jsonb := '[]'::jsonb;
  v_rep_item   jsonb := p_rep_item;
  v_rep_seen   boolean := false;
  v_prev_open  boolean := false;
  v_prev_done  boolean := false;
  -- ‼ 222 · התוצאה אינה נושאת את דגלי draft/removing/edited של התצוגה המקדימה (הקוד הקודם דילג עליהם ב-continue).
  v_skip_flags boolean := false;
  v_invite_url text;
  -- ‼ 114: מה שהבקשה פותחת — קובץ מספריית המשרד, או קישור חיצוני שנשמר עליה.
  v_res_url    text;
  v_res_key    text;
  -- ‼ 144: כמה קבצים בבקשה אחת. ריק/חסר ⇒ הבקשה היא מהסוג הישן.
  v_res_list   jsonb;
  v_res_out    jsonb;
  v_ck_done    int;
  v_ck_total   int;
  v_label      text;
  v_sub        text;
  v_reqs       jsonb;
  v_rq_done    int;
  v_rq_total   int;
  -- 217 · אישור הייצוג באזור האישי — מי מאשר ואת מה
  v_rep_approvals jsonb;
  v_rep_req_sub text;
  -- 220 · פרטי העסק
  v_ho         jsonb;
begin
  v_invite_url := nullif(trim(coalesce(p.settings->'paperless'->>'inviteUrl', '')), '');
  <<step_body>>
  begin
    case s.step_type

    when 'representation' then
      v_rep_seen := true;
      if v_rep_item is not null then
        v_items := v_items || v_rep_item;
      end if;

    when 'client_documents' then
      select count(*) filter (where (x->>'done')::boolean), count(*)
        into v_ck_done, v_ck_total
        from jsonb_array_elements(coalesce(s.payload->'checklist','[]'::jsonb)) x;
      v_label := coalesce(nullif(s.payload->>'clientTitle',''), 'מסמכים שביקשנו');
      v_sub   := nullif(s.payload->>'clientSub','');

      if s.status in ('completed','verified','skipped') then
        v_items := v_items || jsonb_build_object('bucket','done','key','docs','label', v_label);
      elsif s.status = 'locked' then
        v_items := v_items || jsonb_strip_nulls(jsonb_build_object(
          'bucket','future','key','docs','label', v_label,
          'sub', coalesce(p_ctx->>'lockReason', public.portal_lock_reason(s.id), v_sub)));
      else
        v_items := v_items || jsonb_strip_nulls(jsonb_build_object(
          'bucket','action','key','docs','label', v_label,
          'sub', case when coalesce(v_ck_total,0) > 0
                      then v_ck_done || ' מתוך ' || v_ck_total || ' התקבלו'
                      else v_sub end,
          'actionKind','portal','actionValue', s.id,
          'kind','documents',
          'canUpload', true,
          'checklist', (select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
                            'key', x->>'key', 'label', x->>'label', 'done', (x->>'done')::boolean,
                            -- 204 · שע״ם דרשה את המסמך: הלקוח רואה למה, ובלי לרמוז שהחתימה תלויה בו.
                            'note', case when x->>'requiredBy' = 'shaam'
                                         then 'נדרש על ידי רשות המסים להשלמת הייצוג' end))
                          order by ord)
                          from jsonb_array_elements(coalesce(s.payload->'checklist','[]'::jsonb))
                               with ordinality t(x, ord))));
      end if;

    when 'custom_request' then
      -- ‼ 216: משימה של המשרד אינה בדף של הלקוח — לא כפעולה, לא «בהמשך» ולא «הושלם»:
      -- אישור אישי של בן/בת הזוג (personalConfirmFor) ומשימה פנימית (internalTask).
      -- ‼ לא לפי ball: בקשה שהלקוח השלים עוברת ל-'me' ועדיין שלו. והודעת מלל — כן בדף.
      -- ‼ 217: השוואת טקסט — ערך שאינו בוליאני לא מפיל את הדף של הלקוח.
      -- ‼ 217 §ז: הצילום של בן/בת הזוג לשע״ם — המשרד בודק; בעל הכרטיס לא מאשר במקומו/ה (§9).
      if s.payload ? 'personalConfirmFor'
         or s.payload #>> '{shaamIdentity,person}' = 'spouse'
         or (coalesce(s.payload->>'internalTask', '') = 'true'
             and coalesce(s.payload->>'messageOnly', '') <> 'true') then
        exit step_body;
      end if;
      -- ‼ 208 · שע״ם דורשת צילום תעודה, ובתיק כבר יש אחד ⇒ הלקוח רואה אותו
      -- ומאשר שהוא שלו, או מעלה אחר. קיום הקובץ אינו אישור.
      if s.payload ? 'shaamIdentity' then
        if s.status in ('completed','verified','skipped') then
          v_items := v_items || jsonb_build_object('bucket','done','key','custom_'||s.id,
            'label', coalesce(nullif(s.payload->>'clientTitle',''), 'צילום תעודה לרשות המסים'));
        elsif s.status <> 'locked' then
          v_items := v_items || jsonb_strip_nulls(jsonb_build_object(
            'bucket','action','key','custom_'||s.id,
            'label', coalesce(nullif(s.payload->>'clientTitle',''), 'צילום תעודה לרשות המסים'),
            'sub', nullif(s.payload->>'clientSub',''),
            'note', nullif(s.payload->>'clientNote',''),
            'actionKind','portal','actionValue', s.id, 'stepId', s.id,
            'kind','identity_confirm',
            'resources', (select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
                             'key', x->>'key', 'label', x->>'label', 'fileName', nullif(x->>'fileName',''),
                             'documentId', nullif(x->>'documentId',''))) order by ord)
                            from jsonb_array_elements(coalesce(s.payload->'clientResources','[]'::jsonb)) with ordinality t(x, ord)
                           where x->>'source' = 'client')));
        end if;
        v_skip_flags := true;
        exit step_body;
      end if;
      v_reqs := coalesce(s.payload->'requirements', '[]'::jsonb);
      select count(*) filter (where coalesce((x->>'done')::boolean, false)
                               and coalesce((x->>'required')::boolean, true)),
             count(*) filter (where coalesce((x->>'required')::boolean, true))
        into v_rq_done, v_rq_total
        from jsonb_array_elements(v_reqs) x;
      v_label := coalesce(nullif(s.payload->>'clientTitle',''), 'בקשה מהמשרד');
      v_res_key := nullif(s.payload->>'clientResource', '');
      -- ‼ 114: קישור חיצוני כחומר עזר לכל דבר. בקשה שנושאת clientLinkUrl
      -- מתנהגת בדיוק כמו בקשת מסמך — כפתור פתיחה אחד — גם בלי קובץ בספרייה.
      -- כך המדריך של פייפרלס אינו דורש סוג שלב חדש ולא ספרייה שנייה.
      v_res_url := coalesce(public.office_document_url(p.id, v_res_key),
                            nullif(trim(coalesce(s.payload->>'clientLinkUrl','')), ''));

      -- ‼ 144: הרשימה החדשה. `url` נפתר כאן רק לקבצי ספריית המשרד — קובץ
      -- מהתיק של הלקוח הוא פרטי, ונמסר כמזהה בלבד שהדף פודה מול
      -- portal-open-document. `done` נקרא מהדרישה בעלת אותו מפתח, ולכן
      -- הסימון שנרשם בפתיחה הוא אותו סימון שסוגר את הבקשה.
      v_res_list := case when jsonb_typeof(s.payload->'clientResources') = 'array'
                         then s.payload->'clientResources' end;
      if coalesce(jsonb_array_length(v_res_list), 0) > 0 then
        select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
                 'key',   x->>'key',
                 'label', x->>'label',
                 'fileName', nullif(x->>'fileName',''),
                 'url', case when x->>'source' = 'office'
                             then public.office_document_url(p.id, nullif(x->>'officeId','')) end,
                 'documentId', case when x->>'source' = 'client'
                             then nullif(x->>'documentId','') end,
                 'done', coalesce((select (r->>'done')::boolean
                                     from jsonb_array_elements(v_reqs) r
                                    where r->>'key' = x->>'key' limit 1), false)))
               order by ord)
          into v_res_out
          from jsonb_array_elements(v_res_list) with ordinality t(x, ord);
      else
        v_res_out := null;
      end if;

      -- ── הודעת מלל: כרטיס שקט, בלי פקד, ובלי מונה ────────────────────────
      -- ‼ נעולה או סגורה ⇒ פשוט אינה מופיעה. אין "הודעה שהושלמה": ברגע
      -- שהמשרד סוגר אותה היא יורדת מהדף, וזו כל מחזור החיים שלה.
      if coalesce((s.payload->>'messageOnly')::boolean, false) then
        if s.status in ('completed','verified','skipped','locked') then
          null;
        else
          v_items := v_items || jsonb_strip_nulls(jsonb_build_object(
            'bucket','office','key','custom_'||s.id,
            'kind','message',
            'label', v_label,
            'note', nullif(s.payload->>'message','')));
        end if;

      -- ── שליחת מסמכים: שורה לכל קובץ, והפתיחה היא מה שסוגר ───────────────
      elsif v_res_out is not null then
        if s.status in ('completed','verified','skipped') then
          -- ‼ ממשיכה לשאת את הקבצים: הבקשה נסגרה, אבל המסמכים עצמם נשארים
          -- זמינים תחת «מסמכים שימושיים». לקוח שפתח פעם אחת לא מאבד אותם.
          -- ‼ stepId נמסר גם כאן, ובלעדיו קובץ פרטי היה הופך לבלתי-נגיש ברגע
          -- שהבקשה נסגרת: portal-open-document מזהה את הקובץ דרך הבקשה שלו.
          -- ‼ 147: גם המלל שצורף לקבצים נשאר. הקבצים והמלל חיים באותו מקום
          -- בדף («מסמכים מהמשרד»), ובלי זה ההסבר שהמשרד כתב היה נעלם בדיוק
          -- ברגע שהלקוח פותח את הקובץ האחרון — תוכן שנמחק מול העיניים.
          v_items := v_items || jsonb_strip_nulls(jsonb_build_object(
            'bucket','done','key','custom_'||s.id,'label', v_label,
            'stepId', s.id,
            'note', nullif(s.payload->>'message',''),
            'resources', v_res_out));
        elsif s.status = 'locked' then
          v_items := v_items || jsonb_strip_nulls(jsonb_build_object(
            'bucket','future','key','custom_'||s.id,'label', v_label,
            'sub', coalesce(p_ctx->>'lockReason', public.portal_lock_reason(s.id), nullif(s.payload->>'clientSub',''))));
        else
          v_items := v_items || jsonb_strip_nulls(jsonb_build_object(
            'bucket','action','key','custom_'||s.id,'label', v_label,
            'sub', nullif(s.payload->>'clientSub',''),
            'actionKind','portal','actionValue', s.id,
            'stepId', s.id,
            'kind','guide',
            'resources', v_res_out,
            'note', nullif(s.payload->>'message','')));
        end if;

      elsif s.status in ('completed','verified','skipped') then
        v_items := v_items || jsonb_strip_nulls(jsonb_build_object(
          'bucket','done','key','custom_'||s.id,'label', v_label,
          -- ‼ בקשת חומר עזר שהושלמה ממשיכה לשאת את הקישור. הדף מציג אותה
          -- תחת «מסמכים שימושיים» — אחרת הלקוח שפתח את המדריך פעם אחת
          -- מאבד אליו גישה לתמיד.
          'resourceKey', case when public.office_document_url(p.id, v_res_key) is not null then v_res_key else null end,
          'resourceUrl', v_res_url));
      elsif s.status = 'locked' then
        v_items := v_items || jsonb_strip_nulls(jsonb_build_object(
          'bucket','future','key','custom_'||s.id,'label', v_label,
          'sub', coalesce(p_ctx->>'lockReason', public.portal_lock_reason(s.id), nullif(s.payload->>'clientSub',''))));
      else
        v_items := v_items || jsonb_strip_nulls(jsonb_build_object(
          'bucket','action','key','custom_'||s.id,'label', v_label,
          'sub', case when v_res_url is not null then nullif(s.payload->>'clientSub','')
                      when coalesce(v_rq_total,0) > 1
                      then v_rq_done || ' מתוך ' || v_rq_total || ' הושלמו'
                      else nullif(s.payload->>'clientSub','') end,
          'actionKind','portal','actionValue', s.id,
          -- ‼ בקשת חומר עזר אינה טופס: הפעולה היחידה היא פתיחת הקובץ, והיא
          -- עצמה מה שסוגר אותה. kind נפרד כדי שהדף לא יצייר שורות דרישות.
          'kind', case when v_res_url is not null then 'guide' else 'custom' end,
          'resourceKey', case when public.office_document_url(p.id, v_res_key) is not null then v_res_key else null end,
          'resourceUrl', v_res_url,
          'cta', nullif(s.payload->>'clientCta',''),
          -- ‼ מיגרציה 107: ההסבר, המספרים להעתקה ומשפט הסגירה עוברים כמו שהם
          -- אל הדף האישי. clientSub לבדו לא הספיק — הוא מוחלף בשורת ההתקדמות
          -- ("1 מתוך 2 הושלמו") ברגע שיש יותר מדרישה אחת, וכל הסבר שנשען עליו
          -- נעלם בדיוק בבקשות שהכי זקוקות לו.
          'note', nullif(s.payload->>'clientNote',''),
          'refs', s.payload->'clientRefs',
          'noteAfter', nullif(s.payload->>'clientNoteAfter',''),
          -- ‼ 221 · מדריך מצולם — המפתח בלבד. התמונות, הצעדים והקישור לאתר קבועים בקוד
          -- (src/components/portal/photoGuides.ts); מפתח לא מוכר ⇒ הדף פשוט לא מציג מדריך.
          'photoGuide', nullif(s.payload->>'clientPhotoGuide',''),
          'canUpload', exists (select 1 from jsonb_array_elements(v_reqs) x where x->>'kind' in ('file','files')),
          'requirements', (select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
                              'key', x->>'key', 'kind', x->>'kind', 'label', x->>'label',
                              'done', coalesce((x->>'done')::boolean, false),
                              'required', coalesce((x->>'required')::boolean, true),
                              'options', x->'options',
                              'maxFiles', x->'maxFiles',
                              'fileCount', coalesce(jsonb_array_length(x->'documentIds'),
                                             case when nullif(x->>'documentId','') is not null then 1 else 0 end),
                              'value', x->>'value')) order by ord)
                            from jsonb_array_elements(v_reqs) with ordinality t(x, ord))));
      end if;

    when 'prev_accountant_details' then
      if s.status in ('completed','verified','skipped') then
        v_items := v_items || jsonb_build_object('bucket','done','key','prev_details',
          'label', coalesce(nullif(s.payload->>'clientTitle',''), 'פרטי רואה החשבון הקודם'));
      elsif s.status = 'locked' then
        v_items := v_items || jsonb_strip_nulls(jsonb_build_object(
          'bucket','future','key','prev_details',
          'label', coalesce(nullif(s.payload->>'clientTitle',''), 'פרטי רואה החשבון הקודם'),
          'sub', coalesce(p_ctx->>'lockReason', public.portal_lock_reason(s.id), nullif(s.payload->>'clientSub',''))));
      else
        v_items := v_items || jsonb_strip_nulls(jsonb_build_object(
          'bucket','action','key','prev_details',
          'label', coalesce(nullif(s.payload->>'clientTitle',''), 'פרטי רואה החשבון הקודם שלך'),
          'sub', coalesce(nullif(s.payload->>'clientSub',''), 'שם, אימייל וטלפון - כדי שנפנה אליו בשמך'),
          'actionKind','portal','actionValue', s.id, 'kind','prev_accountant',
          -- ‼ 217 (D3): לקוח שחוזר — שואלים מחדש; הפרטים שעל הכרטיס הם של מי שהיה לפנינו.
          'prefill', case when coalesce(s.payload->>'askAgain', '') = 'true' then null else nullif(jsonb_strip_nulls(jsonb_build_object(
            'name',  nullif(trim(coalesce(c.prev_accountant_name ,'')), ''),
            'email', nullif(trim(coalesce(c.prev_accountant_email,'')), ''),
            'phone', nullif(trim(coalesce(c.prev_accountant_phone,'')), ''))), '{}'::jsonb) end));
      end if;

    -- ── שלב 1: ההרשמה — של הלקוח ──────────────────────────────────────────
    -- ‼ עד מיגרציה 106 היה כאן `continue`, כלומר השלב לא הגיע ללקוח כלל.
    -- עכשיו זו הפעולה שלו: קישור ההרשמה של המשרד (אם הוגדר) וכפתור אישור
    -- אחד. linkUrl נפרד מ-actionKind במכוון — הכרטיס נושא גם קישור יוצא
    -- וגם השלמה בתוך הדף, ו-actionKind='portal' הוא זה שמפעיל את ההשלמה.
    when 'paperless_invite' then
      if coalesce(s.payload->>'paperlessStatus', '') in ('not_applicable', 'other_rep') then
        -- לא רלוונטי ללקוח: או שאין פייפרלס, או שהחשבון מועבר אלינו מהמייצג
        -- הקודם — ובשני המקרים אין לו מה להירשם.
        exit step_body;
      elsif s.status in ('completed', 'verified') or
            (s.status = 'skipped' and coalesce(s.payload->>'skipReason','') in ('already_connected','transferred_rep')) then
        v_items := v_items || jsonb_build_object('bucket','done','key','paperless_signup','label','הרשמה לפייפרלס');
      elsif s.status = 'locked' then
        v_items := v_items || jsonb_strip_nulls(jsonb_build_object(
          'bucket','future','key','paperless_signup','label','הרשמה לפייפרלס',
          'sub', coalesce(p_ctx->>'lockReason', public.portal_lock_reason(s.id))));
      elsif coalesce(s.payload->>'paperlessStatus', '') = 'self' then
        -- ללקוח כבר יש חשבון: מה שנדרש ממנו הוא לצרף אותנו כמייצג, לא להירשם.
        v_items := v_items || jsonb_strip_nulls(jsonb_build_object(
          'bucket','action','key','paperless_signup',
          'label','קישור חשבון הפייפרלס למשרד',
          'sub','בחשבון הפייפרלס שלך: הוסיפו את המשרד כמייצג',
          'actionKind','portal','actionValue', s.id, 'kind','paperless_signup',
          -- ‼ 114: שם העסק נשאל כאן, כי זה מה שאנחנו צריכים להזין בפייפרלס.
          -- הערך מגיע מ-clients.business_name ונשמר בחזרה לשם בלבד.
          'needsBusinessName', true,
          'businessName', nullif(trim(coalesce(c.business_name,'')), ''),
          'cta','קישרתי את המשרד'));
      else
        v_items := v_items || jsonb_strip_nulls(jsonb_build_object(
          'bucket','action','key','paperless_signup',
          'label', coalesce(nullif(s.payload->>'clientTitle',''), 'הרשמה לפייפרלס'),
          'sub', coalesce(nullif(s.payload->>'clientSub',''),
                          'שתי דקות, ומשם רק מצלמים קבלות מהטלפון'),
          'actionKind','portal','actionValue', s.id, 'kind','paperless_signup',
          'needsBusinessName', true,
          'businessName', nullif(trim(coalesce(c.business_name,'')), ''),
          'linkUrl', v_invite_url,
          'cta', coalesce(nullif(s.payload->>'clientCta',''), 'נרשמתי לפייפרלס')));
      end if;

    -- ── שלב 2: החיבור — של המשרד ──────────────────────────────────────────
    -- ‼ אין כאן פעולה ללקוח, וזו לא השמטה: ברגע שאנחנו נכנסים לחשבון שלו
    -- פייפרלס מבקשת מאיתנו את פרטי האשראי, ולכן ההשלמה היא של המשרד. מה
    -- שהלקוח צריך לדעת הוא רק שזה בטיפול ושאין לו מה לעשות.
    when 'paperless_connection' then
      if coalesce(s.payload->>'paperlessStatus', '') = 'not_applicable' then
        exit step_body;
      elsif s.status in ('completed', 'verified') or
            (s.status = 'skipped' and coalesce(s.payload->>'skipReason','') in ('already_connected','transferred_rep')) then
        v_items := v_items || jsonb_build_object('bucket','done','key','paperless','label','חיבור לפייפרלס');
      elsif coalesce(s.payload->>'paperlessStatus', '') = 'other_rep' then
        v_items := v_items || jsonb_build_object('bucket','office','key','paperless_transfer',
          'label','העברת חשבון הפייפרלס אלינו',
          'sub','אנחנו מושכים את החשבון מהמייצג הקודם. אין צורך לעשות דבר.');
      -- ‼ נעול ⇒ "בהמשך" ולא "בטיפול המשרד". כל עוד הלקוח לא נרשם אנחנו לא
      -- באמת מטפלים בכלום, ו"בימים הקרובים ניכנס" היה הבטחה לא נכונה שגם
      -- מסתירה ממנו שהכדור עדיין אצלו.
      elsif s.status = 'locked' then
        v_items := v_items || jsonb_strip_nulls(jsonb_build_object(
          'bucket','future','key','paperless_connect',
          'label', coalesce(nullif(s.payload->>'clientTitle',''), 'חיבור לפייפרלס'),
          'sub', coalesce(p_ctx->>'lockReason', public.portal_lock_reason(s.id))));
      else
        v_items := v_items || jsonb_build_object('bucket','office','key','paperless_connect',
          'label', coalesce(nullif(s.payload->>'clientTitle',''), 'חיבור לפייפרלס'),
          'sub', coalesce(nullif(s.payload->>'clientSub',''),
                          'בימים הקרובים ניכנס לחשבון הפייפרלס ונשלים את החיבור. אין צורך לעשות דבר כרגע.'));
      end if;

    -- ‼ מיגרציה 103: אין יותר כפתור-קישור חיצוני. ההרשאה נוצרת בתוך פייפרלס,
    -- לא דרך קישור ששולחים ללקוח. כשהיא לא נעולה ולא הושלמה — הודעת מידע
    -- רגועה בלבד, ללא פעולה. אותה הודעה בדיוק לפני ואחרי שגיא יוצר את
    -- ההרשאה בפועל בצד שלו — אין ל-UI דרך לדעת מתי בדיוק הכרטיס הוזן.
    -- ── חיבור פייפרלס לרשות המסים ────────────────────────────────────────
    -- ‼ הפעולה קורית מחוץ לדף, אבל בניגוד להזנת הכרטיס יש כאן מה לאשר:
    -- הלקוח הוא היחיד שיודע שהחיבור בוצע, וההצהרה שלו היא שסוגרת. אין
    -- לנו גישה לחשבון שלו ברשות המסים ולכן אין מה לאמת.
    when 'rep_client_approval' then
      if s.status in ('completed','verified','skipped') then
        v_items := v_items || jsonb_build_object('bucket','done','key','rep_approval',
          'label', coalesce(nullif(s.payload->>'clientTitle',''), 'זירוז אישור הייצוג באזור האישי'));
      elsif nullif(s.payload->>'clientDeclaredAt','') is not null then
        v_items := v_items || jsonb_build_object('bucket','office','key','rep_approval',
          'label', coalesce(nullif(s.payload->>'clientTitle',''), 'זירוז אישור הייצוג באזור האישי'),
          'sub', 'תודה. אנחנו בודקים שהאישור נקלט אצל רשות המסים.');
      elsif s.status = 'locked' then
        v_items := v_items || jsonb_strip_nulls(jsonb_build_object(
          'bucket','future','key','rep_approval',
          'label', coalesce(nullif(s.payload->>'clientTitle',''), 'זירוז אישור הייצוג באזור האישי'),
          'sub', coalesce(p_ctx->>'lockReason', public.portal_lock_reason(s.id))));
      else
        -- ‼ 217 · «מה מסמנים באזור האישי»: מי מבני הזוג מאשר ואילו רשויות (_rep_approval_people).
        -- לא ידוע ⇒ אין approvals, והכרטיס בנוסח הכללי. ‼ הקריאה עטופה: נתון פגום (או עזר
        -- שעוד לא הוחל) לעולם לא שובר את הדף — זו הפונקציה של כל דף של לקוח.
        -- ‼ 217 (H2.5b) · כשהאישור נדרש: שורת המשנה לפי מי ששע״ם ממתינה לאישור שלו («…לאישור
        -- של רחל»), לא «שלך» קבוע. בלי נתון — הנוסח השמור.
        v_rep_req_sub := null;
        begin
          v_rep_approvals := nullif(case when p_ctx ? 'approvals' then p_ctx->'approvals'
                                         else public._rep_approval_people(c.id) end, '[]'::jsonb);
          if coalesce(s.payload->>'requiredBy', '') = 'shaam' then
            v_rep_req_sub := public._rep_approval_required_sub(v_rep_approvals);
          end if;
        exception when others then
          v_rep_approvals := null;
          v_rep_req_sub := null;
        end;
        v_items := v_items || jsonb_strip_nulls(jsonb_build_object(
          'bucket','action','key','rep_approval',
          'label', coalesce(nullif(s.payload->>'clientTitle',''), 'זירוז אישור הייצוג באזור האישי'),
          -- ‼ ברירת המחדל הישנה («שלוש דקות») מוצגת בנוסח של היום («שתי דקות» — כמו ההסבר),
          -- בלי לכתוב לשורה. נוסח שהמשרד כתב — כמו שהוא.
          'sub', coalesce(v_rep_req_sub,
                          case when s.payload->>'clientSub' = 'אופציונלי - שלוש דקות שמקצרות את ההמתנה לאישור הרשויות'
                               then 'אופציונלי - שתי דקות שמקצרות את ההמתנה לאישור הרשויות'
                               else nullif(s.payload->>'clientSub','') end),
          -- ‼ 217 · כרטיסים שנוצרו מאז 186 שמרו «\n» (לוכסן ו-n) במקום ירידת שורה. מוצג כירידת
          -- שורה, בלי לכתוב לשורה השמורה.
          'note', nullif(replace(s.payload->>'clientNote', E'\\n', E'\n'),''),
          'noteAfter', nullif(s.payload->>'clientNoteAfter',''),
          'cta', coalesce(nullif(s.payload->>'clientCta',''), 'אישרתי באזור האישי'),
          'linkUrl', nullif(s.payload->>'clientLinkUrl',''),
          'linkLabel', nullif(s.payload->>'clientLinkLabel',''),
          'approvals', v_rep_approvals,
          'actionKind','portal','actionValue', s.id, 'kind','declare'));
      end if;

    when 'paperless_tax_authority' then
      if s.status in ('completed','verified','skipped') then
        v_items := v_items || jsonb_build_object('bucket','done','key','paperless_tax',
          'label', coalesce(nullif(s.payload->>'clientTitle',''), 'חיבור פייפרלס לרשות המסים'));
      elsif s.status = 'locked' then
        v_items := v_items || jsonb_strip_nulls(jsonb_build_object(
          'bucket','future','key','paperless_tax',
          'label', coalesce(nullif(s.payload->>'clientTitle',''), 'חיבור פייפרלס לרשות המסים'),
          'sub', coalesce(p_ctx->>'lockReason', public.portal_lock_reason(s.id))));
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

    when 'retainer_authorization' then
      if coalesce(s.payload->>'method', '') = 'manual_arrangement' then
        exit step_body;
      elsif s.status in ('completed', 'verified') then
        v_items := v_items || jsonb_build_object('bucket','done','key','retainer','label','החיוב החודשי הוסדר');
      -- ‼ סדר הבדיקות: החותמות **קודמות** למנעול, ולא להפך. הריטיינר מתעדכן
      -- לכרטיס אשראי כסעיף האחרון ברשימת החיבור — כלומר לפני שגיא לוחץ
      -- «סיימתי», וכשהשלב הזה עוד נעול. פייפרלס כבר מבקשת מהלקוח כרטיס באותו
      -- רגע, ולכן "בהמשך — ייפתח אוטומטית" היה מסתיר ממנו בדיוק את מה שממתין
      -- לו. נמצא בבדיקה בדפדפן (2026-08-17) — לא בקריאת קוד.
      -- ‼ החותמת קיימת רק אם גיא הצהיר שעשה את זה, ולכן היא ראיה טובה מהמנעול.
      elsif nullif(s.payload->>'cardEnteredAt','') is not null then
        v_items := v_items || jsonb_build_object('bucket','office','key','retainer_charge',
          'label','החיוב החודשי',
          'sub','פרטי הכרטיס התקבלו. נשלים את החיוב החודשי ונעדכן כאן.');
      -- ‼ הכדור אצל הלקוח — אבל הפעולה עצמה קורית בתוך פייפרלס, ולכן כרטיס
      -- מידע בלי פקד: הלקוח לא מאשר לנו כאן שהזין כרטיס. אין לנו דרך לדעת,
      -- ואישור שאין מאחוריו אימות הוא בדיוק מה שלא רצינו.
      elsif nullif(s.payload->>'authorizationCreatedAt','') is not null then
        v_items := v_items || jsonb_build_object('bucket','action','key','retainer_card',
          'kind','info',
          'label','הזנת כרטיס אשראי בפייפרלס',
          -- ‼ שני הערוצים שבהם זה קורה בפועל, בדיוק כפי שגיא תיאר: הודעה
          -- שנשלחת מפייפרלס, או חלון שנפתח בכניסה לאפליקציה.
          -- ‼ גוף שני רבים, כמו בכל הדף ("שאלות? פשוט השיבו למייל"). ערבוב
          -- יחיד ורבים בתוך אותו כרטיס נקרא כמו שתי הודעות שהודבקו יחד.
          'sub','פייפרלס תשלח לכם הודעה להזנת כרטיס אשראי לחיוב החודשי שסיכמנו - או שייפתח לכם חלון להזנת הכרטיס בכניסה הבאה לאפליקציה.',
          -- ‼ "1 ₪" ולא "₪1": בעברית סימן המטבע נדחף אחרי הספרה בכל מקרה, ובלי
          -- הרווח זה נקרא "1₪" ונראה כמו תקלה. נבדק בדפדפן.
          'note','ייתכן שתראו חיוב אימות בסך 1 ₪ - הוא נועד לוודא שהכרטיס תקין, ואינו החיוב החודשי.' || chr(10) ||
                 'אין מה לאשר כאן: ברגע שהכרטיס יוזן, נראה את זה מצידנו ונעדכן.');
      elsif s.status = 'locked' then
        v_items := v_items || jsonb_build_object('bucket','future','key','retainer_future',
          'label','הרשאת התשלום החודשי',
          'sub', coalesce(p_ctx->>'lockReason', public.portal_lock_reason(s.id), 'תופיע כאן אחרי חיבור הפייפרלס'));
      -- ‼ 114: עד כאן ההודעה "תתבקש להזין כרטיס" הופיעה ברגע שהשלב נפתח —
      -- כלומר לפני שגיא בכלל עדכן את הריטיינר בפייפרלס. הבטחה שאין מאחוריה
      -- כלום היא בדיוק הפנייה שהיא באה למנוע.
      -- ‼ כן מקדימים ואומרים מה עוד יגיע (הכרעת גיא, אותו יום): הלקוח שסיים
      -- להירשם ולהתקין צריך לדעת שתגיע אליו בקשה להזנת כרטיס — אחרת ההודעה
      -- מפייפרלס נראית לו כמו פנייה מגורם זר. מה שלא נאמר כאן הוא ההנחיה
      -- עצמה ולא חיוב האימות: אלה מופיעים רק כשזה באמת ממתין לו.
      else
        v_items := v_items || jsonb_build_object('bucket','office','key','retainer_info',
          'label', coalesce(nullif(s.payload->>'clientTitle',''), 'החיוב החודשי'),
          'sub', 'אנחנו מסדירים מול פייפרלס את החיוב החודשי שסיכמנו. בהמשך תגיע אליכם מפייפרלס בקשה להזנת כרטיס אשראי - נעדכן אותכם כאן. אין צורך לעשות דבר כרגע.');
      end if;

    -- ── 220 · פרטי העסק (קבוצת פייפרלס) ───────────────────────────────────
    -- ‼ שם העסק מ-clients.business_name (מקור אחד) והתשובות האחרונות על עבודה מהבית —
    -- למילוי ולתיקון. כשהבקשה אצל המשרד (בדיקת האחוז) — «בטיפול המשרד», בלי פקד.
    -- ‼ האחוז שהמשרד אישר אינו מוצג כאן: זו החלטה מקצועית שנמסרת בשיחה, לא שדה בדף.
    when 'business_details' then
      if p_ctx ? 'homeOffice' then
        v_ho := p_ctx->'homeOffice';
      else
        select jsonb_build_object('hasDedicatedRoom', a.has_dedicated_room,
                 'totalRooms', a.total_rooms, 'businessRooms', a.business_rooms, 'note', a.note)
          into v_ho
          from public.client_home_office_answers a where a.client_id = c.id
         order by a.seq desc limit 1;
      end if;
      if s.status in ('completed', 'verified') then
        v_items := v_items || jsonb_build_object('bucket','done','key','business_details',
          'label', coalesce(nullif(s.payload->>'clientTitle',''), 'פרטי העסק'));
      elsif s.status = 'skipped' then
        exit step_body;
      elsif s.status = 'locked' then
        v_items := v_items || jsonb_strip_nulls(jsonb_build_object(
          'bucket','future','key','business_details',
          'label', coalesce(nullif(s.payload->>'clientTitle',''), 'פרטי העסק'),
          'sub', coalesce(p_ctx->>'lockReason', public.portal_lock_reason(s.id))));
      elsif coalesce(s.ball, 'client') <> 'client' then
        v_items := v_items || jsonb_build_object('bucket','office','key','business_details',
          'label', coalesce(nullif(s.payload->>'clientTitle',''), 'פרטי העסק'),
          'sub', 'קיבלנו את הפרטים ואנחנו בודקים אותם. אין צורך לעשות דבר כרגע.');
      else
        v_items := v_items || jsonb_strip_nulls(jsonb_build_object(
          'bucket','action','key','business_details',
          'label', coalesce(nullif(s.payload->>'clientTitle',''), 'פרטי העסק'),
          'sub', case when nullif(trim(coalesce(c.business_name,'')), '') is not null and v_ho is null
                      then 'נשאר להשלים מידע על עבודה מהבית'
                      else coalesce(nullif(s.payload->>'clientSub',''), 'שם העסק ושאלה קצרה על עבודה מהבית') end,
          'actionKind','portal','actionValue', s.id, 'kind','business_details',
          'businessName', nullif(trim(coalesce(c.business_name,'')), ''),
          'homeOffice', v_ho,
          'cta', 'העברה למשרד'));
      end if;

    when 'intake_questionnaire' then
      if s.status in ('completed', 'verified') then
        v_items := v_items || jsonb_build_object('bucket','done','key','intake','label','עדכון סטטוס מיסויי');
      elsif s.status = 'locked' then
        v_items := v_items || jsonb_strip_nulls(jsonb_build_object(
          'bucket','future','key','intake_future','label','עדכון סטטוס מיסויי',
          'sub', coalesce(p_ctx->>'lockReason', public.portal_lock_reason(s.id))));
      elsif s.status = 'waiting_client' and c.intake_token is not null then
        v_items := v_items || jsonb_strip_nulls(jsonb_build_object('bucket','action','key','intake_fill','label','עדכון סטטוס מיסויי','sub','עונים רק על מה שרלוונטי · אפשר לעצור ולהמשיך','actionKind','intake','actionValue', c.intake_token));
      end if;

    when 'release_letter' then
      if s.status not in ('completed', 'verified', 'skipped') then v_prev_open := true;
      else v_prev_done := true; end if;

    when 'materials_received' then
      if s.status not in ('completed', 'verified', 'skipped') then v_prev_open := true;
      else v_prev_done := true; end if;

    when 'file_opening' then
      if s.status in ('completed', 'verified') then
        v_items := v_items || jsonb_build_object('bucket','done','key','files','label','פתיחת התיקים ברשויות');
      elsif s.status not in ('skipped') then
        v_items := v_items || jsonb_build_object('bucket','office','key','files_office','label','פתיחת התיקים ברשויות','sub','מע"מ, מס הכנסה וביטוח לאומי - בטיפולנו');
      end if;

    when 'authority_representation' then
      v_label := coalesce(nullif(s.payload->>'title',''), 'ייצוג ברשות');
      if s.status in ('pending','in_progress') then
        v_items := v_items || jsonb_build_object('bucket','office','key','authrep_'||s.id,
          'label', v_label,
          'sub', case when nullif(req.execution -> (case when s.payload->>'subjectRole' = 'spouse' then 'nationalInsuranceSpouse' else 'nationalInsurance' end) ->> 'referenceNumber', '') is not null
                      then 'האסמכתא התקבלה — נשלח הוראות אישור בקרוב'
                      else 'בטיפול המשרד — הזנת הייצוג בביטוח לאומי' end);
      elsif s.status = 'waiting_client' then
        v_items := v_items || jsonb_strip_nulls(jsonb_build_object(
          'bucket','office','key','authrep_'||s.id, 'kind','message',
          'label', v_label,
          'note', 'האסמכתא: ' || coalesce(nullif(req.execution -> (case when s.payload->>'subjectRole' = 'spouse' then 'nationalInsuranceSpouse' else 'nationalInsurance' end) ->> 'referenceNumber', ''), '') ||
            case when nullif(req.execution -> (case when s.payload->>'subjectRole' = 'spouse' then 'nationalInsuranceSpouse' else 'nationalInsurance' end) ->> 'deadline', '') is not null
                 then chr(10) || 'יש לאשר עד ' || to_char((req.execution -> (case when s.payload->>'subjectRole' = 'spouse' then 'nationalInsuranceSpouse' else 'nationalInsurance' end) ->> 'deadline')::date, 'DD.MM.YYYY')
                 else '' end ||
            chr(10) || 'ניתן לאשר באתר הביטוח הלאומי או בטלפון 02-5393740. אם ההודעה לא הגיעה - אפשר להעביר את ההוראות.',
          'linkUrl', 'https://b2b.btl.gov.il/BTL.ILG.PAYMENTS/IshurIpuyKoachInfo.aspx',
          'linkLabel', 'לאתר הביטוח הלאומי'));
      elsif s.status = 'blocked' then
        v_items := v_items || jsonb_build_object('bucket','office','key','authrep_'||s.id,
          'label', v_label, 'sub', 'האסמכתא פגה - נזין מחדש');
      elsif s.status in ('completed','verified') then
        v_items := v_items || jsonb_build_object('bucket','done','key','authrep_'||s.id,
          'label', v_label || ' · אושר');
      end if;

    else
      exit step_body;
    end case;
  end step_body;
  return jsonb_build_object('items', v_items, 'repSeen', v_rep_seen, 'prevOpen', v_prev_open,
                            'prevDone', v_prev_done, 'skipFlags', v_skip_flags);
end;
$function$;
-- <<< GENERATED:portal_step_items

-- >>> GENERATED:build_client_portal (scripts/verify-222-body.mjs — לא לערוך ידנית)
CREATE OR REPLACE FUNCTION public.build_client_portal(p_client_id text, p_mode text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  c        public.clients%rowtype;
  p        public.profiles%rowtype;
  req      public.representation_requests%rowtype;
  quo      public.quotations%rowtype;
  s        public.onboarding_steps%rowtype;
  v_r      jsonb;
  v_items  jsonb := '[]'::jsonb;
  v_done   int := 0;
  v_total  int := 0;
  v_prev_open boolean := false;
  v_prev_done boolean := false;
  v_first  text;
  v_has_eng boolean := false;
  v_stage  text;
  v_published boolean := true;
  v_rep_item jsonb := null;
  v_rep_seen boolean := false;
  v_before int := 0;
  v_lock   text;
  -- 217 · לקוח שחוזר
  v_cur    text;
  v_quote_open boolean := false;
  v_returning_intake boolean := false;
begin
  select * into c from public.clients where id = p_client_id;
  if c.id is null then return jsonb_build_object('ok', false, 'error', 'invalid'); end if;
  select * into p from public.profiles where id = c.user_id;
  v_first := split_part(trim(coalesce(c.first_name, '')), ' ', 1);

  v_has_eng := exists (select 1 from public.engagements e where e.client_id = c.id);

  -- ‼ «התהליך נפתח ללקוח» — השער ברמת הלקוח (client_process_published, 217), רק בשביל
  -- «אנחנו מכינים את המשך התהליך». מה שמוצג בדף נבחר לכל בקשה בנפרד (client_step_gate_open,
  -- 214, בלולאה למטה): לקוח שחוזר רואה את מה שפורסם לפני הקליטה החדשה ועדיין פתוח, והקליטה
  -- החדשה מחכה לפרסום (הכרעה ב). אותו שער במייל, בתזכורות ובמשימה האוטומטית.
  v_published := public.client_process_published(c.id);

  select * into quo from public.quotations q
    where q.client_id = c.id and q.status <> 'draft'
    order by q.updated_at desc limit 1;

  -- ‼ 217: לקוח שחוזר — הצעה חדשה שמחכה לאישור (אין התקשרות נוכחית). ליד ראשון: אותו דבר כמו קודם.
  v_cur := public.current_engagement_id(c.id);
  v_quote_open := quo.id is not null and quo.status in ('sent', 'viewed') and v_cur is null;
  -- ‼ 217: קליטה חדשה של לקוח שחוזר — מה שהושלם בהתקשרות הקודמת אינו בדף (נשאר ב«הושלמו» במשרד).
  v_returning_intake := v_cur is not null
    and (select e.supersedes_engagement_id is null from public.engagements e where e.id = v_cur)
    and public.previous_engagement_end(c.id, v_cur) is not null;

  if v_quote_open then
    v_items := v_items || jsonb_strip_nulls(jsonb_build_object(
      'bucket','action','key','quote_sign',
      'label','הצעת המחיר שלך מוכנה',
      'sub','לקריאה ולאישור - ואפשר להתחיל · כמה דקות',
      'actionKind','quote','actionValue', quo.public_token));
  elsif v_has_eng then
    v_items := v_items || jsonb_build_object('bucket','done','key','quotation','label','הצעת המחיר אושרה');
  elsif quo.id is not null and quo.status in ('sent','viewed') then
    v_items := v_items || jsonb_strip_nulls(jsonb_build_object(
      'bucket','action','key','quote_sign',
      'label','הצעת המחיר שלך מוכנה',
      'sub','לקריאה ולאישור - ואפשר להתחיל · כמה דקות',
      'actionKind','quote','actionValue', quo.public_token));
  elsif quo.id is not null and quo.status = 'approved' then
    v_items := v_items || jsonb_build_object('bucket','done','key','quotation','label','הצעת המחיר אושרה');
    v_items := v_items || jsonb_build_object('bucket','office','key','quote_processing',
      'label','אנחנו מכינים את המשך התהליך','sub','נעדכן אותך כאן ברגע שיהיה מה לעשות');
  elsif quo.id is not null and quo.status in ('expired','cancelled') then
    v_items := v_items || jsonb_build_object('bucket','office','key','quote_expired',
      'label','הצעת המחיר כבר לא בתוקף','sub','נשמח לחדש אותה - דברו איתנו');
  end if;

  select * into req from public.representation_requests
    where linked_client_id = c.id order by created_at desc limit 1;

  v_rep_item := public._portal_rep_item(req);

  for s in
    select * from public.onboarding_steps st
    where st.client_id = c.id and st.status <> 'cancelled'
      and (p_mode = 'preview'
           or (st.published_at is not null
               and (st.step_type = 'representation' or public.client_step_gate_open(c.id, st.published_at))))
    order by (case when p_mode = 'preview' then coalesce(st.pending_sort_order, st.sort_order, 0)
                   else coalesce(st.sort_order, 0) end),
             st.created_at
  loop
    -- 172: תצוגה מקדימה = הטיוטה מעל הפרסום; live נשאר כפי שהוא.
    if p_mode = 'preview' and s.draft_payload is not null then
      s.payload := public.merge_step_draft(s.payload, s.draft_payload);
    end if;
    -- ‼ 217: קליטה חדשה של לקוח שחוזר — מה שנסגר בהתקשרות קודמת לא חוזר לדף (וגם לא שני
    -- «מסמכים»). מסמכים שהמשרד שלח (קבצים/קישור) נשארים זמינים, כמו בכל בקשה שנסגרה.
    if v_returning_intake and s.engagement_id is not null and s.engagement_id <> v_cur
       and s.status in ('completed', 'verified', 'skipped')
       and not (s.step_type = 'custom_request'
                and (nullif(s.payload->>'clientResource', '') is not null
                     or coalesce(jsonb_array_length(case when jsonb_typeof(s.payload->'clientResources') = 'array'
                                                         then s.payload->'clientResources' end), 0) > 0
                     or nullif(trim(coalesce(s.payload->>'clientLinkUrl', '')), '') is not null)) then
      continue;
    end if;
    v_before := jsonb_array_length(v_items);
    v_r := public._portal_step_items(s, c, p, req, v_rep_item, '{}'::jsonb);
    v_items := v_items || (v_r->'items');
    v_rep_seen := v_rep_seen or coalesce((v_r->>'repSeen')::boolean, false);
    v_prev_open := v_prev_open or coalesce((v_r->>'prevOpen')::boolean, false);
    v_prev_done := v_prev_done or coalesce((v_r->>'prevDone')::boolean, false);
    -- ‼ 222 · בענף צילום התעודה (identity) הקוד הקודם דילג על דגלי draft/removing/edited — נשמר כך.
    if coalesce((v_r->>'skipFlags')::boolean, false) then
      continue;
    end if;

    if p_mode = 'preview' and s.published_at is null
       and jsonb_array_length(v_items) > v_before then
      select coalesce(jsonb_agg(
               case when ord > v_before then x || jsonb_build_object('draft', true) else x end
               order by ord), '[]'::jsonb)
        into v_items
        from jsonb_array_elements(v_items) with ordinality t(x, ord);
    end if;

    if p_mode = 'preview' and s.pending_cancel
       and jsonb_array_length(v_items) > v_before then
      select coalesce(jsonb_agg(
               case when ord > v_before then x || jsonb_build_object('removing', true) else x end
               order by ord), '[]'::jsonb)
        into v_items
        from jsonb_array_elements(v_items) with ordinality t(x, ord);
    end if;
    -- 172: נערך — בקשה מפורסמת שיש עליה טיוטה; הפאנל סופר "ישתנו".
    if p_mode = 'preview' and s.published_at is not null and s.draft_payload is not null
       and jsonb_array_length(v_items) > v_before then
      select coalesce(jsonb_agg(
               case when ord > v_before then x || jsonb_build_object('edited', true) else x end
               order by ord), '[]'::jsonb)
        into v_items
        from jsonb_array_elements(v_items) with ordinality t(x, ord);
    end if;
  end loop;

  if not v_rep_seen and v_rep_item is not null then
    v_items := v_items || v_rep_item;
  end if;

  v_items := v_items || public._portal_prev_items(v_prev_open, v_prev_done);

  -- ‼ ברמת הלקוח: התהליך (או הקליטה החדשה של לקוח שחוזר) עוד לא נפתח — גם כשבקשות שפורסמו
  -- לפני הקליטה מוצגות למעלה.
  if v_has_eng and not v_published and p_mode = 'live' then
    v_items := v_items || jsonb_build_object('bucket','office','key','process_pending',
      'label','אנחנו מכינים את המשך התהליך','sub','נעדכן אותך כאן ברגע שיהיה מה לעשות');
  end if;

  -- ‼ 144: הודעת מלל אינה נספרת. אין לה השלמה, ולכן כל ספירה שכוללת אותה
  -- מייצרת מונה שלעולם לא ייסגר — והופכת הודעה למטלה פתוחה לנצח. מאותה
  -- סיבה היא גם אינה משפיעה על journeyStage שנגזר מהיחס למטה.
  select count(*) filter (where x->>'bucket' = 'done'),
         count(*) filter (where x->>'bucket' <> 'future'
                            and coalesce(x->>'kind','') <> 'message')
    into v_done, v_total
    from jsonb_array_elements(v_items) x;

  if v_quote_open then
    -- 217: גם לקוח שחוזר — השלב הוא ההצעה החדשה.
    v_stage := 'quote';
  elsif not v_has_eng and quo.id is null and req.id is not null then
    v_stage := case when req.status = 'active' then 'active' else 'identity' end;
  elsif not v_has_eng then
    v_stage := case when quo.status = 'approved' then 'identity' else 'quote' end;
  elsif req.id is not null and coalesce(req.status, '') <> 'active' then
    v_stage := 'identity';
  elsif v_done < v_total then
    v_stage := 'setup';
  else
    v_stage := 'active';
  end if;

  return jsonb_build_object(
    'ok', true,
    'clientFirstName', v_first,
    'firmName', coalesce(p.firm_name, 'המשרד'),
    'branding', coalesce(p.branding, '{}'::jsonb),
    'done', v_done, 'total', v_total,
    'journeyStage', v_stage,
    'items', v_items);
end;
$function$;
-- <<< GENERATED:build_client_portal

-- ── 3 · היוצרים קוראים לפונקציות ה-payload ──────────────────────────────────
-- >>> GENERATED:ensure_rep_client_approval_step (scripts/verify-222-body.mjs — לא לערוך ידנית)
CREATE OR REPLACE FUNCTION public.ensure_rep_client_approval_step(p_client_id text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  c      public.clients%rowtype;
  v_id   text;
  v_eng  text;
  v_sort int;
begin
  select * into c from public.clients where id = p_client_id;
  if c.id is null then return null; end if;

  select id into v_id from public.onboarding_steps
    where client_id = p_client_id and step_type = 'rep_client_approval'
      and status <> 'cancelled' limit 1;
  if v_id is not null then return v_id; end if;

  if exists (select 1 from public.onboarding_steps
              where client_id = p_client_id and step_type = 'rep_client_approval'
                and status = 'cancelled') then
    return null;
  end if;

  select id into v_eng from public.engagements
    where client_id = p_client_id order by created_at desc limit 1;

  select coalesce(max(sort_order), 0) + 1 into v_sort
    from public.onboarding_steps
    where client_id = p_client_id and step_type = 'representation'
      and status <> 'cancelled';

  insert into public.onboarding_steps
    (user_id, engagement_id, client_id, required_for_close, step_type, track, scope,
     status, ball, sort_order, published_at, payload)
  values
    (c.user_id, v_eng, p_client_id, false, 'rep_client_approval', 'authorities', 'person',
     'pending', 'client', v_sort, now(),
     public._rep_client_approval_payload(c.user_id))
  returning id into v_id;

  perform public.log_onboarding_event(c.user_id, v_id, v_eng, 'created', 'system',
    'הבקשה נוצרה כשהייצוג הוגש לשע"ם', '{}'::jsonb);

  return v_id;
end;
$function$;
-- <<< GENERATED:ensure_rep_client_approval_step

-- >>> GENERATED:shaam_require_client_approval (scripts/verify-222-body.mjs — לא לערוך ידנית)
create or replace function public.shaam_require_client_approval(p_client_id text)
returns text
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_id text;
  s    public.onboarding_steps%rowtype;
begin
  v_id := public.ensure_rep_client_approval_step(p_client_id);

  if v_id is null then
    -- המשרד הסיר בעבר את כרטיס הזירוז. עכשיו שע״ם דורשת את האישור —
    -- זו אותה יחידת עבודה, והיא חוזרת (האינדקס מתיר רק שורה חיה אחת).
    select * into s from public.onboarding_steps
     where client_id = p_client_id and step_type = 'rep_client_approval' and status = 'cancelled'
     order by created_at desc limit 1;
    if s.id is null then return null; end if;
    perform public._set_step_status(s.id, 'pending', 'system',
      'שע״ם ממתינה לאישור הלקוח - הבקשה חזרה כחובה', jsonb_build_object('source', 'shaam'), 'client', null);
    -- ‼ 217: חוזר עכשיו ⇒ «פורסם» עכשיו (השער לכל בקשה רואה אותו כשייך להווה, לא לעבר).
    update public.onboarding_steps set published_at = now() where id = s.id;
    v_id := s.id;
  end if;

  select * into s from public.onboarding_steps where id = v_id;
  if s.status in ('completed', 'verified', 'skipped') then return v_id; end if;
  if coalesce(s.payload ->> 'requiredBy', '') = 'shaam' then return v_id; end if;

  update public.onboarding_steps
     set required_for_close = true,
         published_at = coalesce(published_at, now()),
         ball = case when nullif(payload ->> 'clientDeclaredAt', '') is not null then ball else 'client' end,
         payload = public._rep_client_approval_required_payload(payload, public._rep_approval_people(p_client_id)),
         updated_at = now()
   where id = v_id;

  perform public.log_onboarding_event(s.user_id, v_id, s.engagement_id, 'note', 'system',
    'שע״ם מציגה «ממתין לאישור לקוח» - אישור הלקוח באזור האישי נדרש כדי שהייצוג ייקלט',
    jsonb_build_object('source', 'shaam', 'requiredBy', 'shaam'));
  return v_id;
end;
$function$;
-- <<< GENERATED:shaam_require_client_approval

-- >>> GENERATED:generate_onboarding_steps (scripts/verify-222-body.mjs — לא לערוך ידנית)
create or replace function public.generate_onboarding_steps(p_engagement_id text, p_dry_run boolean DEFAULT false)
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
  v_oowner     text;
  v_otpl       public.journey_templates%rowtype;
  v_ores       jsonb;
  v_hold       boolean := false;
  v_r          jsonb;
  -- 217 · סוג העוסק שלא ידוע (kind_hold) ובקשות שלא נוצרו (creationProblem)
  v_kind_pending boolean := false;
  v_snap_kind  text;
  v_hold_keys  text[] := '{}';
  v_hold_lists jsonb;
  v_kdep       jsonb;
  v_held       jsonb := '[]'::jsonb;
  v_hkey       text;
  v_hentry     jsonb;
  v_htype      text;
  v_only       text[];
  v_oc         jsonb;
  v_prob       jsonb;
  v_problems   jsonb := '[]'::jsonb;
  v_new_titles jsonb := '[]'::jsonb;
  v_held_failed boolean := false;
  -- 217 · לקוח שחוזר (D1–D4)
  v_prev_end   timestamptz;
  v_returning  boolean := false;
begin
  select * into e from public.engagements where id = p_engagement_id;
  if e.id is null then return jsonb_build_object('ok', false, 'error', 'engagement_not_found'); end if;
  -- ‼ 217: שחרור בקשות שחיכו לסוג העוסק (release_kind_hold) מריץ את המחולל רק על
  -- המפתחות שהוחזקו. דגל מקומי לטרנזקציה (כמו 168/208/212) — בלי חתימה נוספת.
  v_only := case when nullif(current_setting('pivo.generator_only_keys', true), '') is not null
                 then string_to_array(current_setting('pivo.generator_only_keys', true), ',') end;

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
  -- ‼ 216: «טרי» = המחולל עוד לא רץ על ההתקשרות. בקשת הייצוג מההצעה (ובקשות שהוכנו
  -- לפני האישור) מאומצות להתקשרות ברגע שהיא נוצרת (engagements_adopt_*), עוד לפני
  -- המחולל — והבדיקה הקודמת («אין אף שלב») ראתה אותן ודילגה על הצילום. בלי צילום
  -- המחולל דילג על כל הבקשות שהמשרד הוסיף לקליטה: הצעה עם ייצוג = בלי בקשות המשרד.
  -- התקשרות ישנה בלי צילום אבל עם שלבי מחולל — נשארת «לא טרייה», כמו קודם.
  -- ‼ הסימן: «ביקורת חודש ראשון» — רק המחולל יוצר אותה (היא לא ב-request_creatable_step_types),
  -- וכל גרסה שלו יצרה אותה. סוגים שהמשרד יכול להכין לפני האישור («מסמכים מהלקוח»,
  -- רו"ח קודם, פייפרלס, שאלון…) אינם סימן: בקשה כזו שהוכנה מראש ואומצה כיבתה את הצילום,
  -- וכל בקשות המשרד בקליטה דולגו בשקט.
  v_fresh := e.journey_default_facts is null and not exists (
    select 1 from public.onboarding_steps
     where engagement_id = e.id and step_type = 'first_month_review');
  if v_fresh then
    v_new_business := (v_prev_known is false) or (v_client.business_transfer is false);
  else
    v_new_business := coalesce(v_client.business_transfer, not v_has_prev) = false and v_has_prev = false
                      and v_client.business_transfer is not null;
  end if;

  v_needs_prevdet := nullif(trim(coalesce(v_client.prev_accountant_email, '')), '') is null;

  -- ‼ 217 · לקוח שחוזר: ההתקשרות הקודמת הסתיימה, וזו קליטה חדשה (לא עדכון הסכם — אין
  -- supersedes). הכרטיס עדיין מתאר את הקליטה הראשונה: «עסק חדש» אז אינו עסק חדש עכשיו
  -- (D4), ורו"ח הקודם שעל הכרטיס הוא זה שלפנינו — לא מי שטיפל בלקוח מאז שעזב (D3):
  -- שואלים מחדש, בלי הפרטים הישנים לאישור, והמכתב מחכה לתשובה. בהרצה חוזרת — מהעובדות.
  v_prev_end := public.previous_engagement_end(e.client_id, e.id);
  v_returning := e.supersedes_engagement_id is null
                 and ((v_fresh and v_prev_end is not null)
                      or coalesce(e.journey_default_facts->>'returning', 'false') = 'true');
  if v_returning then
    v_new_business := false;
    v_needs_prevdet := true;
  end if;

  -- JF4 · פרדיקט אחד. התקשרות בקליטה ⇒ השלב 'onboarding' ⇒ לא מוחזק; הכלל
  -- כתוב כאן כדי שלא יהיו שני ניסוחים, לא כי המצב האחר נגיש היום.
  v_hold := public.requests_held_until_approval(e.client_id);

  -- ‼ גבול מחזור החיים במפורש: רק התקשרות שאין לה עדיין שום שלב
  -- מקבלת צילום. מסע שכבר התחיל ממשיך לפי מה שנולד איתו, ולכן עריכה
  -- עתידית של ברירת המחדל אינה נוגעת בו (הכרעת גיא 2026-08-25).
  v_facts := jsonb_build_object(
    'monthly', v_has_monthly, 'paperless', v_has_paperless,
    'licensed', v_licensed, 'rep', v_has_rep, 'has_prev', v_has_prev,
    'new_business', v_new_business, 'no_prev_email', v_needs_prevdet,
    -- 216: מצב משפחתי מהכרטיס - לתנאי «נשוי/אה» בבקשות של המשרד.
    'married', coalesce(v_client.family_status = 'married', false))
    || case when v_returning
            then jsonb_build_object('returning', true, 'previousEngagementEndedAt', v_prev_end)
            else '{}'::jsonb end;

  select office_id into v_office from public.profiles where id = e.user_id;
  v_snap := e.journey_default_snapshot;
  if v_snap is null and v_fresh then
    -- JF19 · צילום תמיד: משרד נזרע אם חסר, ובלי משרד — זריעת הקוד.
    -- ‼ 217: סוג שלא ידוע אינו «עוסק מורשה». תבנית «מותאמת» — הסוג מהכרטיס בלבד
    -- (_engagement_kind); אין כזה ⇒ ריק. הצילום נלקח מרשימת המורשה (snapshotKind,
    -- כדי שתמיד יהיה צילום), אבל כל מה ששונה בין עוסק פטור, עוסק מורשה וחברה מוחזק
    -- (engagements.kind_hold) עד שהמשרד קובע את הסוג — ואז נפתח לפי הסוג שנקבע.
    v_kind := public._engagement_kind(e.quotation_id, e.client_id);
    v_kind_pending := v_kind is null;
    v_kind_fallback := v_kind_pending;
    v_snap_kind := coalesce(v_kind, 'licensed_dealer');
    if v_office is not null then
      select d.entries into v_snap from public.office_journey_defaults d
       where d.office_id = v_office and d.client_kind = v_snap_kind;
      if v_snap is null and not p_dry_run then
        perform public.seed_office_journey_defaults(v_office);
        select d.entries into v_snap from public.office_journey_defaults d
         where d.office_id = v_office and d.client_kind = v_snap_kind;
      end if;
    end if;
    if v_snap is null then
      v_snap := public.default_journey_entries(v_snap_kind);
    end if;
    v_facts := v_facts || jsonb_build_object('kind', v_kind, 'snapshotKind', v_snap_kind,
                                             'kindFallback', v_kind_fallback, 'kindPending', v_kind_pending);
    if not p_dry_run then
      update public.engagements
         set journey_default_snapshot = v_snap, journey_default_facts = v_facts
       where id = e.id;
    end if;
  elsif e.journey_default_facts is not null then
    v_facts := e.journey_default_facts;   -- הרצה חוזרת: דטרמיניזם
  end if;

  -- ‼ 217: הרצה חוזרת בזמן שהסוג עדיין לא נקבע — אותם מפתחות מוחזקים, מהרשימות
  -- שהוקפאו באישור. נקלט כשהסוג לא ידוע ושום דבר לא הוחזק אז (kindPending בלי
  -- kind_hold) — נבדק שוב מול הרשימות של היום, כל עוד הסוג עדיין לא ידוע.
  if jsonb_typeof(e.kind_hold) = 'object' then
    if e.kind_hold->>'resolvedAt' is null then
      v_kind_pending := true;
      v_hold_keys := coalesce((select array_agg(x) from jsonb_array_elements_text(
                       case when jsonb_typeof(e.kind_hold->'keys') = 'array' then e.kind_hold->'keys' else '[]'::jsonb end) x), '{}');
      v_hold_lists := e.kind_hold->'lists';
    end if;
  elsif not v_kind_pending and coalesce(v_facts->>'kindPending', 'false') = 'true'
        and public._engagement_kind(e.quotation_id, e.client_id) is null then
    v_kind_pending := true;
  end if;
  if v_kind_pending and v_hold_lists is null then
    -- ‼ אישור ההצעה לא נופל בגלל רשימה פגומה של המשרד: נופלים לברירת המחדל של הקוד.
    begin
      v_kdep := public._kind_dependent_entries(v_office);
    exception when others then
      v_kdep := public._kind_dependent_entries(null);
    end;
    v_hold_keys := coalesce((select array_agg(x) from jsonb_array_elements_text(v_kdep->'keys') x), '{}');
    v_hold_lists := v_kdep->'lists';
  end if;

  -- ── עבודת מערכת (סיווג C ב-135): לא ברשומות, לא נכבית מהמסך ───────────────
  -- JF12 · גם כאן: מה שהמשרד הסיר אינו נולד מחדש בהרצה חוזרת.
  if v_has_rep then
    if not exists (select 1 from public.onboarding_steps
                    where client_id = e.client_id and step_type = 'representation' and status <> 'cancelled')
       and not public.step_removed_by_office(e.client_id, 'representation', e.id)
       -- 217: מחכה לסוג העוסק ⇒ לא כאן; שחרור ⇒ רק המפתחות שחיכו
       and not ('representation' = any (v_hold_keys)) and (v_only is null or 'representation' = any (v_only)) then
      v_r := public._generate_step(e.user_id, e.id, e.client_id, v_snap,
               'representation', 'authorities', 'person', 'me', '{}'::jsonb,
               true, null, false, v_hold, 'in_progress', null, p_dry_run);
      v_planned := v_planned || jsonb_build_object('step_type','representation','track','authorities','scope','person','status', v_r->>'status');
      if not p_dry_run then v_created := v_created + 1; end if;
    end if;

    if not exists (select 1 from public.onboarding_steps
                    where client_id = e.client_id and step_type = 'kyc_identification' and status <> 'cancelled')
       and not public.step_removed_by_office(e.client_id, 'kyc_identification', e.id)
       -- 217: מחכה לסוג העוסק ⇒ לא כאן; שחרור ⇒ רק המפתחות שחיכו
       and not ('kyc_identification' = any (v_hold_keys)) and (v_only is null or 'kyc_identification' = any (v_only)) then
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
       and not public.step_removed_by_office(e.client_id, 'file_opening', e.id)
       -- 217: מחכה לסוג העוסק ⇒ לא כאן; שחרור ⇒ רק המפתחות שחיכו
       and not ('file_opening' = any (v_hold_keys)) and (v_only is null or 'file_opening' = any (v_only)) then
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
  -- ‼ 217: «לכל התקשרות» (D4) — מה שהושלם בהתקשרות קודמת הוא היסטוריה, לא «כבר קיימת».
  if not public._intake_step_exists(e.client_id, e.id, 'client_documents')
     and not public.step_removed_by_office(e.client_id, 'client_documents', e.id)
     -- 217: מחכה לסוג העוסק ⇒ לא כאן; שחרור ⇒ רק המפתחות שחיכו
     and not ('client_documents' = any (v_hold_keys)) and (v_only is null or 'client_documents' = any (v_only))
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
             public._onboarding_system_payload('client_documents', jsonb_build_object('checklist', v_docs)),
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
    -- ‼ 217: «לכל התקשרות» (D4) — כמו «מסמכים מהלקוח».
    if not public._intake_step_exists(e.client_id, e.id, 'prev_accountant_details')
       and not public.step_removed_by_office(e.client_id, 'prev_accountant_details', e.id)
       -- 217: מחכה לסוג העוסק ⇒ לא כאן; שחרור ⇒ רק המפתחות שחיכו
       and not ('prev_accountant_details' = any (v_hold_keys)) and (v_only is null or 'prev_accountant_details' = any (v_only))
       and public.journey_default_enabled(v_snap, 'prev_accountant_details') then
      v_r := public._generate_step(e.user_id, e.id, e.client_id, v_snap,
               'prev_accountant_details', 'prev_accountant', 'person', 'client',
               coalesce(
                 public.journey_default_variant(v_snap, 'prev_accountant_details', v_facts)->'copy',
                 public._onboarding_system_payload('prev_accountant_details', jsonb_build_object('needsDetails', v_needs_prevdet)))
               -- ‼ 217 (D3): לקוח שחוזר — הטופס בדף ריק; הפרטים שעל הכרטיס הם של מי שהיה לפנינו.
               || case when v_returning then jsonb_build_object('askAgain', true) else '{}'::jsonb end,
               v_needs_prevdet, null, false, v_hold, 'pending', null, p_dry_run);
      v_id_prevdet := v_r->>'stepId';
      v_planned := v_planned || jsonb_build_object('step_type','prev_accountant_details','track','prev_accountant','scope','person','status', v_r->>'status');
      if not p_dry_run then v_created := v_created + 1; end if;
    end if;

    -- המכתב תלוי בשאלה רק כשאין מייל בכרטיס (התנאי העסקי); *במה* — מהצילום.
    if not public._intake_step_exists(e.client_id, e.id, 'release_letter')
       and not public.step_removed_by_office(e.client_id, 'release_letter', e.id)
       -- 217: מחכה לסוג העוסק ⇒ לא כאן; שחרור ⇒ רק המפתחות שחיכו
       and not ('release_letter' = any (v_hold_keys)) and (v_only is null or 'release_letter' = any (v_only))
       and public.journey_default_enabled(v_snap, 'release_letter') then
      v_r := public._generate_step(e.user_id, e.id, e.client_id, v_snap,
               'release_letter', 'prev_accountant', 'person', 'me', '{}'::jsonb,
               true, 'prev_accountant_details', v_needs_prevdet, v_hold, 'pending', null, p_dry_run);
      v_planned := v_planned || jsonb_build_object('step_type','release_letter','track','prev_accountant','scope','person','status', v_r->>'status');
      if not p_dry_run then v_created := v_created + 1; end if;
    end if;

    if not public._intake_step_exists(e.client_id, e.id, 'materials_received')
       and not public.step_removed_by_office(e.client_id, 'materials_received', e.id)
       -- 217: מחכה לסוג העוסק ⇒ לא כאן; שחרור ⇒ רק המפתחות שחיכו
       and not ('materials_received' = any (v_hold_keys)) and (v_only is null or 'materials_received' = any (v_only))
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
       and not public.step_removed_by_office(e.client_id, 'paperless_invite', e.id)
       -- 217: מחכה לסוג העוסק ⇒ לא כאן; שחרור ⇒ רק המפתחות שחיכו
       and not ('paperless_invite' = any (v_hold_keys)) and (v_only is null or 'paperless_invite' = any (v_only))
       and public.journey_default_enabled(v_snap, 'paperless_invite') then
      v_r := public._generate_step(e.user_id, e.id, e.client_id, v_snap,
               'paperless_invite', 'tools', 'person', 'client',
               public._onboarding_system_payload('paperless_invite', jsonb_build_object('paperlessStatus', coalesce(v_client.paperless_status,'unknown'))),
               true, null, true, v_hold, 'pending', null, p_dry_run);
      v_planned := v_planned || jsonb_build_object('step_type','paperless_invite','track','tools','scope','person','status', v_r->>'status');
      if not p_dry_run then v_created := v_created + 1; end if;
    end if;

    select id, status in ('completed','verified','skipped')
      into v_id_conn, v_conn_done
      from public.onboarding_steps
      where client_id = e.client_id and step_type = 'paperless_connection' and status <> 'cancelled' limit 1;
    if v_id_conn is null
       and not public.step_removed_by_office(e.client_id, 'paperless_connection', e.id)
       -- 217: מחכה לסוג העוסק ⇒ לא כאן; שחרור ⇒ רק המפתחות שחיכו
       and not ('paperless_connection' = any (v_hold_keys)) and (v_only is null or 'paperless_connection' = any (v_only))
       and public.journey_default_enabled(v_snap, 'paperless_connection') then
      v_r := public._generate_step(e.user_id, e.id, e.client_id, v_snap,
               'paperless_connection', 'tools', 'person', 'me',
               public._onboarding_system_payload('paperless_connection'),
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
     and not public.step_removed_by_office(e.client_id, 'paperless_tax_authority', e.id)
     -- 217: מחכה לסוג העוסק ⇒ לא כאן; שחרור ⇒ רק המפתחות שחיכו
     and not ('paperless_tax_authority' = any (v_hold_keys)) and (v_only is null or 'paperless_tax_authority' = any (v_only))
     and not exists (select 1 from public.onboarding_steps
                      where client_id = e.client_id and step_type = 'paperless_tax_authority'
                        and status <> 'cancelled')
     and public.journey_default_enabled(v_snap, 'paperless_tax_authority') then
    v_r := public._generate_step(e.user_id, e.id, e.client_id, v_snap,
             'paperless_tax_authority', 'tools', 'person', 'client',
             public._onboarding_system_payload('paperless_tax_authority'),
             true, 'paperless_connection', true, v_hold, 'pending', null, p_dry_run);
    v_planned := v_planned || jsonb_build_object('step_type','paperless_tax_authority','track','tools','scope','person','status', v_r->>'status');
    if not p_dry_run then v_created := v_created + 1; end if;
  end if;

  -- ── הרשאת התשלום החודשי ───────────────────────────────────────────────────
  if v_has_monthly then
    if not public._intake_step_exists(e.client_id, e.id, 'retainer_authorization')
       and not public.step_removed_by_office(e.client_id, 'retainer_authorization', e.id)
       -- 217: מחכה לסוג העוסק ⇒ לא כאן; שחרור ⇒ רק המפתחות שחיכו
       and not ('retainer_authorization' = any (v_hold_keys)) and (v_only is null or 'retainer_authorization' = any (v_only))
       and public.journey_default_enabled(v_snap, 'retainer_authorization') then
      v_r := public._generate_step(e.user_id, e.id, e.client_id, v_snap,
               'retainer_authorization', 'payment', 'engagement', 'me',
               public._onboarding_system_payload('retainer_authorization', jsonb_build_object('amount', e.monthly_total, 'billingStartMonth', e.billing_start_month))
               || case when v_no_paperless then jsonb_build_object('method','manual_arrangement') else '{}'::jsonb end,
               true, 'paperless_connection', true, v_hold, 'pending', null, p_dry_run);
      v_planned := v_planned || jsonb_build_object('step_type','retainer_authorization','track','payment','scope','engagement',
                                                   'status', v_r->>'status', 'depends_on', v_r->'dependsOn');
      if not p_dry_run then v_created := v_created + 1; end if;
    end if;
  end if;

  -- ── עבודה פנימית (סיווג C) — קיום נבדק לפי ההתקשרות, כולל שורה מבוטלת ──
  if v_only is null and not exists (select 1 from public.onboarding_steps
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

  if v_only is null and not exists (select 1 from public.onboarding_steps
                 where engagement_id = e.id and step_type = 'first_month_review') then
    v_r := public._generate_step(e.user_id, e.id, e.client_id, v_snap,
             'first_month_review', 'review', 'engagement', 'me', '{}'::jsonb,
             false, null, false, v_hold, 'pending',
             (coalesce(e.approved_at, now()) + interval '30 days')::date, p_dry_run);
    v_planned := v_planned || jsonb_build_object('step_type','first_month_review','track','review','scope','engagement','status', v_r->>'status');
    if not p_dry_run then v_created := v_created + 1; end if;
  end if;

  -- ── בקשות חופשיות של המשרד (137) ──────────────────────────────────────────
  -- 216: המשרד נדרש גם בהרצה חוזרת - לפתרון בקשה מהספרייה לפי templateId.
  if v_office is null then
    select office_id into v_office from public.profiles where id = e.user_id;
  end if;
  if v_snap is not null then
    for v_oentry in
      select value from jsonb_array_elements(v_snap)
       where value->>'source' = 'office'
         -- 216: ערך פגום לא מפיל אישור הצעה (היה cast ישיר).
         and coalesce(value->>'enabled', 'true') <> 'false'
       order by case when (value->>'sortIndex') ~ '^-?\d{1,9}$' then (value->>'sortIndex')::int else 0 end
    loop
      continue when v_only is not null and not (coalesce(v_oentry->>'key', '') = any (v_only));
      -- כבר קיימת אצל הלקוח (כולל מבוטלת) ⇒ לא נוצרת שוב. ‼ 217: בקליטה הזו (או הוכנה
      -- לקראתה) — בקשה מהקליטה של התקשרות קודמת היא היסטוריה, ולקוח שחוזר מקבל אותה שוב.
      continue when exists (
        select 1 from public.onboarding_steps s
         where s.client_id = e.client_id
           and s.payload->'defaultOrigin'->>'key' = v_oentry->>'key'
           and (s.engagement_id = e.id
                or (s.engagement_id is null and s.created_at >= coalesce(v_prev_end, '-infinity'::timestamptz))));
      -- ‼ 217: בקשה שלא נוצרה כבר מחכה בשורה האדומה שלה, או שהמשרד סגר אותה («אין צורך»,
      -- או ביטול מסלול הקליטה). אין ניסיון שקט נוסף באישור חוזר — «צור שוב» הוא כפתור
      -- מפורש בשורה, ואישור חוזר אחרי ביטול לא מחזיר דבר לחיים (כמו כל בקשה שבוטלה).
      continue when exists (
        select 1 from public.onboarding_steps s
         where s.client_id = e.client_id and s.payload ? 'creationProblem'
           and s.payload->'creationProblem'->>'key' = 'gen:' || e.id || ':' || coalesce(v_oentry->>'key', ''));
      -- ‼ 217: שונה בין סוגי העוסק ⇒ מחכה לסוג (נאסף למטה, ב«מה מחכה לסוג העוסק»).
      continue when (v_oentry->>'key') = any (v_hold_keys);
      -- 216: תנאי העובדות של מסלול הקליטה (למשל «נשוי/אה»), הנוסח והבעלים מהספרייה,
      -- ומסמך שהוסר — כולם בתוך היצירה (_onboarding_office_default_create, 217).
      begin
        v_oc := public._onboarding_office_default_create(e, v_oentry, v_office, v_facts, p_dry_run);
      exception when others then
        v_oc := jsonb_build_object('ok', false, 'attempted', true, 'reason', 'create_failed',
                  'title', coalesce(nullif(v_oentry->'payload'->>'title', ''), 'בקשה של המשרד'));
      end;
      -- ‼ «planned» כמו קודם: כל מה שהגיע לניסיון היצירה (גם אם נכשל), ולא מה שלא היה לו תוכן.
      if coalesce((v_oc->>'attempted')::boolean, false) then
        v_planned := v_planned || jsonb_build_object(
          'step_type', coalesce(v_oentry->>'stepType', 'custom_request'),
          'track', 'custom', 'scope', 'person', 'status', 'pending',
          'officeKey', v_oentry->>'key');
      end if;
      if coalesce((v_oc->>'ok')::boolean, false) then
        if not p_dry_run then v_created := v_created + 1; end if;
        continue;
      end if;
      -- לא חל / כבר קיימת מאותו סוג — לא בעיה.
      continue when public._creation_problem_class(v_oc->>'reason') is null;
      -- ‼ 217: בקשה שהייתה אמורה להיווצר ולא נוצרה — שורה אדומה ב«בקשות» עם הסיבה ומה עושים.
      -- לא מפילים את האישור בגלל בקשה אחת, וגם לא בגלל הרישום שלה.
      v_prob := jsonb_strip_nulls(jsonb_build_object(
        'key', 'gen:' || e.id || ':' || coalesce(v_oentry->>'key', ''), 'source', 'generator',
        'reason', v_oc->>'reason', 'engagementId', e.id, 'entryKey', v_oentry->>'key',
        'ref', v_oc->'ref', 'itemTitle', v_oc->>'title'));
      if p_dry_run then
        v_problems := v_problems || v_prob;
        continue;
      end if;
      begin
        v_r := public._record_creation_problem(e.client_id, e.id, v_prob,
                 coalesce(v_oentry->>'requiredForClose', 'true') <> 'false');
        v_problems := v_problems || (v_prob || jsonb_build_object('stepId', v_r->>'stepId'));
        if coalesce((v_r->>'inserted')::boolean, false) then
          v_new_titles := v_new_titles || to_jsonb(coalesce(v_oc->>'title', 'בקשה'));
        end if;
      exception when others then
        begin
          perform public.log_onboarding_event(e.user_id, null, e.id, 'note', 'system',
            'בקשה מהקליטה לא נוצרה: «' || coalesce(v_oc->>'title', 'בקשה') || '» (גם הרישום שלה ברשימה נכשל)',
            jsonb_build_object('officeKey', v_oentry->>'key', 'reason', v_oc->>'reason', 'error', left(sqlerrm, 200)));
        exception when others then null;
        end;
      end;
    end loop;
  end if;

  -- ── 217 · מה מחכה לסוג העוסק ──────────────────────────────────────────────
  -- ‼ רק מה שהיה נוצר: אותם שערים כמו למעלה, בלי הסוג (עובדת «מורשה» לא ידועה —
  -- תנאי שתלוי בה נבדק בשני הכיוונים). מפתח שאינו בצילום (רק ברשימה של סוג אחר)
  -- נלקח מהרשימות שהוקפאו באישור. הרשימה הזו היא מה שהמשרד רואה; השחרור עצמו
  -- מריץ את המחולל על כל המפתחות שהוחזקו (release_kind_hold).
  if v_kind_pending and cardinality(v_hold_keys) > 0 then
    begin
    foreach v_hkey in array v_hold_keys loop
      v_hentry := null;
      select x into v_hentry from jsonb_array_elements(coalesce(v_snap, '[]'::jsonb)) x
       where coalesce(nullif(x->>'key', ''), x->>'stepType') = v_hkey and coalesce(x->>'enabled', 'true') <> 'false'
       limit 1;
      if v_hentry is null then
        select x into v_hentry
          from jsonb_each(case when jsonb_typeof(v_hold_lists) = 'object' then v_hold_lists else '{}'::jsonb end) l,
               jsonb_array_elements(case when jsonb_typeof(l.value) = 'array' then l.value else '[]'::jsonb end) x
         where coalesce(nullif(x->>'key', ''), x->>'stepType') = v_hkey and coalesce(x->>'enabled', 'true') <> 'false'
         limit 1;
      end if;
      continue when v_hentry is null;
      if v_hentry->>'source' = 'office' then
        continue when exists (select 1 from public.onboarding_steps s
                               where s.client_id = e.client_id and s.payload->'defaultOrigin'->>'key' = v_hkey
                                 and (s.engagement_id = e.id
                                      or (s.engagement_id is null
                                          and s.created_at >= coalesce(v_prev_end, '-infinity'::timestamptz))));
        continue when not (public.flow_when_matches(v_hentry->'when', v_facts || '{"licensed":true}'::jsonb)
                           or public.flow_when_matches(v_hentry->'when', v_facts || '{"licensed":false}'::jsonb));
      else
        v_htype := coalesce(nullif(v_hentry->>'stepType', ''), v_hkey);
        continue when public._intake_step_exists(e.client_id, e.id, v_htype);
        continue when public.step_removed_by_office(e.client_id, v_htype, e.id);
        continue when case v_htype
          when 'prev_accountant_details' then not v_has_prev
          when 'release_letter' then not v_has_prev
          when 'materials_received' then not v_has_prev
          when 'paperless_invite' then not v_needs_paperless
          when 'paperless_connection' then not v_needs_paperless
          when 'paperless_tax_authority' then not v_needs_paperless
          when 'retainer_authorization' then not v_has_monthly
          when 'representation' then not v_has_rep
          when 'kyc_identification' then not v_has_rep
          when 'file_opening' then not v_new_business
          else false end;
      end if;
      v_held := v_held || public._kind_hold_entry(v_hentry, v_office, e.user_id);
    end loop;
    exception when others then
      -- ‼ לא מפילים את האישור. המפתחות עדיין מוחזקים (לא נוצרו) — ולכן ההמתנה נרשמת בכל
      -- זאת, כדי שקביעת הסוג תפתח אותם; הרשימה תתמלא בהרצה הבאה.
      v_held_failed := true;
      perform public.log_onboarding_event(e.user_id, null, e.id, 'note', 'system',
        'סוג העוסק לא ידוע - לא הצלחנו לחשב אילו בקשות מחכות לו',
        jsonb_build_object('kindHoldEvent', 'held_failed', 'error', left(sqlerrm, 200)));
    end;

    if not p_dry_run then
      if jsonb_typeof(e.kind_hold) = 'object' then
        update public.engagements set kind_hold = kind_hold || jsonb_build_object('held', v_held)
         where id = e.id and kind_hold->>'resolvedAt' is null;
      elsif jsonb_array_length(v_held) > 0 or v_held_failed then
        update public.engagements
           set kind_hold = jsonb_build_object('since', now(),
                 'snapshotKind', coalesce(v_facts->>'snapshotKind', 'licensed_dealer'),
                 'keys', to_jsonb(v_hold_keys), 'held', v_held, 'lists', v_hold_lists)
         where id = e.id and kind_hold is null;
        perform public.log_onboarding_event(e.user_id, null, e.id, 'note', 'system',
          'סוג העוסק לא ידוע - '
            || case jsonb_array_length(v_held)
                 -- החישוב נכשל (v_held_failed): המפתחות מוחזקים, הרשימה תתמלא בהרצה הבאה.
                 when 0 then 'יש בקשות שמחכות לו. הן ייפתחו'
                 when 1 then 'בקשה אחת מחכה לו: «' || (v_held->0->>'title') || '». היא תיפתח'
                 else jsonb_array_length(v_held) || ' בקשות מחכות לו: '
                      || (select string_agg('«' || (h->>'title') || '»', ', ') from jsonb_array_elements(v_held) h)
                      || '. הן ייפתחו' end
            || ' כשייקבע בתיק המס אם זה עוסק פטור, עוסק מורשה או חברה.',
          jsonb_build_object('kindHoldEvent', 'held', 'keys', (select jsonb_agg(h->'key') from jsonb_array_elements(v_held) h)));
      end if;
    end if;
  end if;

  -- ‼ 217: מייל אחד לרו"ח כשאישור הצעה (בלי שהוא מול המסך) השאיר בקשה שלא נוצרה.
  -- רק כשנפתחה שורה חדשה — אישור חוזר לא שולח שוב.
  if not p_dry_run and jsonb_array_length(v_new_titles) > 0 then
    begin
      perform public.queue_accountant_notification(e.user_id, 'request_not_created', e.client_id, null, null, e.quotation_id,
        jsonb_build_object('engagementId', e.id, 'titles', v_new_titles));
    exception when others then null;
    end;
  end if;

  if not p_dry_run and v_created > 0 then
    perform public.log_onboarding_event(e.user_id, null, e.id, 'created', 'system',
      'מסלול הקליטה הורכב מההצעה שאושרה', jsonb_build_object('stepsCreated', v_created));
  end if;

  -- ‼ 217: «problems» ו«held» בנפרד מ«planned» — ההשוואות של הלוך-ושוב (planned) לא זזות.
  return jsonb_build_object(
    'ok', true, 'dryRun', p_dry_run, 'engagementId', e.id, 'clientId', e.client_id,
    'created', v_created, 'planned', v_planned,
    'problems', v_problems, 'kindPending', v_kind_pending, 'held', v_held,
    'facts', jsonb_build_object(
      'hasMonthly', v_has_monthly, 'hasPaperlessService', v_has_paperless,
      'needsPaperless', v_needs_paperless, 'hasRepresentation', v_has_rep,
      'hasPreviousAccountant', v_has_prev, 'newBusiness', v_new_business,
      'noPaperless', v_no_paperless, 'needsPrevDetails', v_needs_prevdet,
      'heldUntilApproval', v_hold, 'kindFallback', v_kind_fallback, 'kindPending', v_kind_pending,
      'returning', v_returning,
      'monthlyTotal', e.monthly_total, 'billingStartMonth', e.billing_start_month));
end;
$function$;
-- <<< GENERATED:generate_onboarding_steps

-- ── 4 · «צפייה» ──────────────────────────────────────────────────────────────
/**
 * בקשה (או כמה — קבוצה) כפי שהלקוח מקבל אותה, על נתוני דוגמה קבועים. STABLE: Postgres אוסר כאן כל כתיבה.
 *
 * קלט:
 *   { samples: [ { key, ref: {kind:'template',templateId}|{kind:'document',docId}|{kind:'system',stepType}|null,
 *                  stepType, payload,            -- רק כש-ref ריק: payload שנבנה בדפדפן בנתיב היצירה
 *                  inputs,                        -- קלטי בונה ה-payload של סוג מערכת (למשל checklist)
 *                  repeatable, status, ball, patch, markDone, lockReason, lockAfter, homeOffice, required } ],
 *     persona: { couple, prevKnown },
 *     rep: { status, spousePending, signed, niReference, approvals: 'single'|'couple'|'none', awaiting: 'client'|'spouse'|'both' } }
 * פלט: צורת PortalData + sample:true + specs[{key, ok, reason, stepType, title, owner, internal, itemKeys}].
 *
 * ‼ הנתונים הקבועים (D5): «ישראל ישראלי», בת זוג «ישראלה», «ישראלי ייעוץ (דוגמה)», רו״ח «רו״ח לדוגמה», אסמכתה A-0000-0000,
 *   טוקנים = 'sample'. המיתוג והקבצים — של המשרד שקורא (שלו, לא של לקוח).
 * ‼ תבנית של משרד אחר ⇒ library_item_missing (_library_template מחזיר ריק).
 */
create or replace function public.preview_request_sample(p_request jsonb)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare
  v_uid       uuid := auth.uid();
  p           public.profiles%rowtype;
  c           public.clients%rowtype;
  req         public.representation_requests%rowtype;
  s           public.onboarding_steps%rowtype;
  v_couple    boolean := coalesce((p_request->'persona'->>'couple')::boolean, false);
  -- ‼ ברירת מחדל: פרטי הרו״ח הקודם עוד לא ידועים (לקוח חדש) — הטופס ריק. «ידועים» — מילוי מראש לאישור.
  v_prev_known boolean := coalesce((p_request->'persona'->>'prevKnown')::boolean, false);
  v_rep       jsonb := case when jsonb_typeof(p_request->'rep') = 'object' then p_request->'rep' else '{}'::jsonb end;
  v_rep_status text := coalesce(nullif(v_rep->>'status', ''), 'pending_fill');
  v_signers   jsonb;
  v_ref_deadline text := to_char(current_date + 14, 'YYYY-MM-DD');
  v_people    jsonb;
  v_rep_item  jsonb;
  v_samples   jsonb := case when jsonb_typeof(p_request->'samples') = 'array' then p_request->'samples' else '[]'::jsonb end;
  smp         jsonb;
  v_ord       int := 0;
  v_key       text;
  v_ref       jsonb;
  v_kind      text;
  v_spec      jsonb;
  v_type      text;
  v_payload   jsonb;
  v_owner     text;
  v_title     text;
  v_inputs    jsonb;
  v_status    text;
  v_ctx       jsonb;
  v_r         jsonb;
  v_items     jsonb := '[]'::jsonb;
  v_specs     jsonb := '[]'::jsonb;
  v_prev_open boolean := false;
  v_prev_done boolean := false;
  v_done      int;
  v_total     int;
begin
  if v_uid is null or not public.is_authorized() then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;
  select * into p from public.profiles where id = v_uid;
  if p.id is null then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;
  if jsonb_array_length(v_samples) = 0 or jsonb_array_length(v_samples) > 20 then
    return jsonb_build_object('ok', false, 'error', 'bad_request');
  end if;
  if v_rep_status not in ('pending_fill', 'pending_signature', 'awaiting_accountant', 'awaiting_stamp', 'awaiting_authorities', 'active') then
    return jsonb_build_object('ok', false, 'error', 'bad_variant');
  end if;

  -- הלקוח הווירטואלי (D5). אין שורה במסד — רק רשומה בזיכרון של הקריאה.
  select * into c from jsonb_populate_record(null::public.clients, jsonb_build_object(
    'id', 'sample-client', 'user_id', v_uid, 'first_name', 'ישראל', 'last_name', 'ישראלי',
    'business_name', 'ישראלי ייעוץ (דוגמה)',
    'family_status', case when v_couple then 'married' else 'single' end,
    'spouse_first_name', case when v_couple then 'ישראלה' end,
    'spouse_name', case when v_couple then 'ישראלה ישראלי' end,
    'prev_accountant_name', case when v_prev_known then 'רו״ח לדוגמה' end,
    'prev_accountant_email', case when v_prev_known then 'prev-accountant@example.test' end,
    'prev_accountant_phone', case when v_prev_known then '050-0000000' end,
    'intake_token', 'sample', 'portal_token', 'sample'));

  -- מי מאשר באזור האישי ואת מה (כמו _rep_approval_people), ומי ששע״ם ממתינה לו (awaiting).
  v_people := case coalesce(nullif(v_rep->>'approvals', ''), case when v_couple then 'couple' else 'single' end)
    when 'couple' then jsonb_build_array(
      jsonb_build_object('person', 'client', 'name', 'ישראל', 'systems', jsonb_build_array('מע״מ')),
      jsonb_build_object('person', 'spouse', 'name', 'ישראלה', 'systems', jsonb_build_array('מס הכנסה', 'מע״מ')))
    when 'single' then jsonb_build_array(
      jsonb_build_object('person', 'client', 'name', 'ישראל', 'systems', jsonb_build_array('מס הכנסה', 'מע״מ')))
    else '[]'::jsonb end;
  if coalesce(v_rep->>'awaiting', '') in ('client', 'spouse', 'both') then
    select coalesce(jsonb_agg(case when v_rep->>'awaiting' in ('both', x->>'person')
                                   then x || jsonb_build_object('awaiting', x->'systems') else x end order by o), '[]'::jsonb)
      into v_people from jsonb_array_elements(v_people) with ordinality t(x, o);
  end if;

  -- בקשת הייצוג הווירטואלית — רק מה ש-_portal_rep_item ו«אסמכתה / יעד» קוראים.
  v_signers := case
    when v_rep_status = 'pending_signature' and coalesce((v_rep->>'spousePending')::boolean, false) then jsonb_build_array(
      jsonb_build_object('role', 'client', 'signToken', 'sample', 'signStatus', 'signed'),
      jsonb_build_object('role', 'spouse', 'signToken', 'sample-spouse', 'signStatus', 'pending'))
    when v_rep_status = 'pending_signature' then jsonb_build_array(
      jsonb_build_object('role', 'client', 'signToken', 'sample', 'signStatus', 'pending'))
    when coalesce((v_rep->>'signed')::boolean, false) or v_rep_status = 'awaiting_authorities' then jsonb_build_array(
      jsonb_build_object('role', 'client', 'signToken', 'sample', 'signStatus', 'signed'))
    else jsonb_build_array(jsonb_build_object('role', 'client', 'signToken', 'sample', 'signStatus', 'pending')) end;
  select * into req from jsonb_populate_record(null::public.representation_requests, jsonb_build_object(
    'id', 'sample-request', 'status', v_rep_status, 'onboarding_token', 'sample', 'signers', v_signers,
    'execution', case when coalesce((v_rep->>'niReference')::boolean, false) then jsonb_build_object(
      'nationalInsurance', jsonb_build_object('referenceNumber', 'A-0000-0000', 'deadline', v_ref_deadline),
      'nationalInsuranceSpouse', jsonb_build_object('referenceNumber', 'A-0000-0000', 'deadline', v_ref_deadline))
      else '{}'::jsonb end));
  v_rep_item := public._portal_rep_item(req);

  for smp in select value from jsonb_array_elements(v_samples) loop
    v_ord := v_ord + 1;
    v_key := coalesce(nullif(smp->>'key', ''), v_ord::text);
    v_ref := case when jsonb_typeof(smp->'ref') = 'object' then smp->'ref' end;
    v_inputs := case when jsonb_typeof(smp->'inputs') = 'object' then smp->'inputs' else '{}'::jsonb end;
    v_type := null; v_payload := null; v_owner := null; v_title := null;

    if v_ref is not null then
      v_kind := v_ref->>'kind';
      if v_kind = 'system' and v_ref->>'stepType' = 'rep_client_approval' then
        v_type := 'rep_client_approval';
        v_payload := public._rep_client_approval_payload(v_uid);
        if coalesce((smp->>'required')::boolean, false) then
          v_payload := public._rep_client_approval_required_payload(v_payload, v_people);
        end if;
        v_owner := 'client';
        v_title := v_payload->>'clientTitle';
      elsif v_kind = 'system' and public._onboarding_system_payload(v_ref->>'stepType', v_inputs) is not null then
        v_type := v_ref->>'stepType';
        v_payload := public._onboarding_system_payload(v_type, v_inputs);
        v_owner := case when v_type in ('paperless_connection', 'retainer_authorization') then 'me' else 'client' end;
        v_title := v_payload->>'clientTitle';
      else
        v_spec := public._flow_item_spec(v_uid, jsonb_build_object('ref', v_ref), coalesce((smp->>'repeatable')::boolean, false));
        if v_kind = 'system' and v_spec->>'reason' = 'not_creatable' then
          -- ‼ סוגי מערכת שהדף מצייר ממצב השלב ולא מ-payload (ייצוג, ייצוג ברשות, פתיחת תיקים…): לא «נוצרים» מהספרייה.
          v_spec := jsonb_build_object('ok', true, 'stepType', v_ref->>'stepType', 'payload', '{}'::jsonb);
        end if;
        if not coalesce((v_spec->>'ok')::boolean, false) then
          v_specs := v_specs || jsonb_build_object('key', v_key, 'ok', false, 'reason', coalesce(v_spec->>'reason', 'not_creatable'));
          continue;
        end if;
        v_type := v_spec->>'stepType';
        v_payload := coalesce(v_spec->'payload', '{}'::jsonb);
        v_owner := v_spec->>'owner';
        v_title := v_spec->>'title';
        -- בקשת מערכת בלי נוסח בספרייה (payload ריק) — מה שהמסך שולח, אם שלח.
        if v_kind = 'system' and v_payload = '{}'::jsonb and jsonb_typeof(smp->'payload') = 'object' then
          v_payload := smp->'payload';
        end if;
      end if;
    else
      v_type := smp->>'stepType';
      if v_type is null then
        v_specs := v_specs || jsonb_build_object('key', v_key, 'ok', false, 'reason', 'bad_request');
        continue;
      end if;
      v_payload := case when jsonb_typeof(smp->'payload') = 'object' then smp->'payload' else '{}'::jsonb end;
      v_owner := coalesce(nullif(smp->>'owner', ''), 'client');
      v_title := coalesce(nullif(v_payload->>'title', ''), nullif(v_payload->>'clientTitle', ''));
      -- ‼ כמו _flow_item_spec: משימה של המשרד נולדת מסומנת ואינה בדף של הלקוח.
      if v_type = 'custom_request' and v_owner = 'me' and coalesce(v_payload->>'messageOnly', '') <> 'true' then
        v_payload := v_payload || jsonb_build_object('internalTask', true);
      end if;
    end if;

    if jsonb_typeof(smp->'patch') = 'object' then v_payload := v_payload || (smp->'patch'); end if;
    -- «התקבל חלק»: הראשונים ברשימת המסמכים / הדרישות מסומנים — מהרשימה שבבקשה עצמה (אין עותק של הרשימה בדפדפן).
    if (smp->>'markDone') ~ '^[0-9]{1,3}$' then
      v_inputs := to_jsonb((smp->>'markDone')::int);
      if jsonb_typeof(v_payload->'checklist') = 'array' then
        v_payload := jsonb_set(v_payload, '{checklist}', coalesce((select jsonb_agg(case when o <= (v_inputs #>> '{}')::int then x || '{"done":true}'::jsonb else x end order by o)
                                 from jsonb_array_elements(v_payload->'checklist') with ordinality t(x, o)), '[]'::jsonb));
      end if;
      if jsonb_typeof(v_payload->'requirements') = 'array' then
        v_payload := jsonb_set(v_payload, '{requirements}', coalesce((select jsonb_agg(case when o <= (v_inputs #>> '{}')::int then x || '{"done":true}'::jsonb else x end order by o)
                                 from jsonb_array_elements(v_payload->'requirements') with ordinality t(x, o)), '[]'::jsonb));
      end if;
    end if;

    v_status := coalesce(nullif(smp->>'status', ''), 'pending');
    if v_status not in ('pending', 'in_progress', 'waiting_client', 'blocked', 'completed', 'verified', 'skipped', 'locked') then
      v_specs := v_specs || jsonb_build_object('key', v_key, 'ok', false, 'reason', 'bad_variant');
      continue;
    end if;

    select * into s from jsonb_populate_record(null::public.onboarding_steps, jsonb_build_object(
      'id', 'sample-' || v_key, 'user_id', v_uid, 'client_id', 'sample-client', 'step_type', v_type,
      'status', v_status,
      'ball', coalesce(nullif(smp->>'ball', ''), case when v_owner = 'me' then 'me' else 'client' end),
      'payload', v_payload, 'published_at', now(), 'created_at', now(), 'sort_order', v_ord,
      'scope', 'person', 'track', 'tools'));

    v_ctx := jsonb_build_object('approvals', v_people)
      || case when smp ? 'lockReason' then jsonb_build_object('lockReason', smp->>'lockReason')
              -- ‼ אותו נוסח כמו portal_lock_reason (168): «ייפתח אחרי א · ב» — שמות הבקשות הקודמות הם קלט.
              when jsonb_typeof(smp->'lockAfter') = 'array' and jsonb_array_length(smp->'lockAfter') > 0
                then jsonb_build_object('lockReason', 'ייפתח אחרי ' || (select string_agg(x, ' · ') from jsonb_array_elements_text(smp->'lockAfter') x))
              else '{}'::jsonb end
      || case when smp ? 'homeOffice' then jsonb_build_object('homeOffice', smp->'homeOffice') else '{}'::jsonb end;

    v_r := public._portal_step_items(s, c, p, req, v_rep_item, v_ctx);
    v_items := v_items || (v_r->'items');
    v_prev_open := v_prev_open or coalesce((v_r->>'prevOpen')::boolean, false);
    v_prev_done := v_prev_done or coalesce((v_r->>'prevDone')::boolean, false);
    v_specs := v_specs || jsonb_build_object('key', v_key, 'ok', true, 'stepType', v_type, 'title', v_title, 'owner', v_owner,
      'internal', coalesce(v_payload->>'internalTask', '') = 'true' and coalesce(v_payload->>'messageOnly', '') <> 'true',
      'itemKeys', coalesce((select jsonb_agg(x->>'key') from jsonb_array_elements(v_r->'items') x), '[]'::jsonb));
  end loop;

  v_items := v_items || public._portal_prev_items(v_prev_open, v_prev_done);
  select count(*) filter (where x->>'bucket' = 'done'),
         count(*) filter (where x->>'bucket' <> 'future' and coalesce(x->>'kind', '') <> 'message')
    into v_done, v_total
    from jsonb_array_elements(v_items) x;

  return jsonb_build_object(
    'ok', true, 'sample', true,
    'clientFirstName', 'ישראל',
    'firmName', coalesce(p.firm_name, 'המשרד'),
    'branding', coalesce(p.branding, '{}'::jsonb),
    'done', v_done, 'total', v_total, 'journeyStage', 'setup',
    'items', v_items, 'specs', v_specs);
end;
$function$;

-- ── 5 · הרשאות ───────────────────────────────────────────────────────────────
-- פנימיות: לא נקראות מהדפדפן (רק מפונקציות security definer). הצפייה — למשרד שמחובר בלבד.
revoke all on function public._portal_rep_item(public.representation_requests) from public, anon, authenticated;
revoke all on function public._portal_step_items(public.onboarding_steps, public.clients, public.profiles, public.representation_requests, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public._portal_prev_items(boolean, boolean) from public, anon, authenticated;
revoke all on function public._rep_client_approval_payload(uuid) from public, anon, authenticated;
revoke all on function public._rep_client_approval_required_payload(jsonb, jsonb) from public, anon, authenticated;
revoke all on function public._onboarding_system_payload(text, jsonb) from public, anon, authenticated;
revoke all on function public.build_client_portal(text, text) from public, anon, authenticated;
-- היוצרים — כמו ב-217 / 174 (לא משתנה; מוצהר שוב כדי שהחלה חוזרת לא תשאיר סטייה).
revoke all on function public.ensure_rep_client_approval_step(text) from public, anon, authenticated;
grant  execute on function public.ensure_rep_client_approval_step(text) to service_role;
revoke all on function public.shaam_require_client_approval(text) from public, anon, authenticated;
grant  execute on function public.shaam_require_client_approval(text) to service_role;
revoke execute on function public.generate_onboarding_steps(text, boolean) from public, anon, authenticated;
grant  execute on function public.generate_onboarding_steps(text, boolean) to service_role;
revoke all on function public.preview_request_sample(jsonb) from public, anon;
grant  execute on function public.preview_request_sample(jsonb) to authenticated;

select public.assert_domain_function_invariants();
