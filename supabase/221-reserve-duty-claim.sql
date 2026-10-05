-- ═══════════════════════════════════════════════════════════════════════════
-- 221 · «תביעת מילואים בביטוח לאומי» — נוסח מוכן בספרייה + מדריך מצולם בדף האישי
--        (05.10.2026)
--
-- המקור: docs/PLAN-RESERVE-DUTY-CLAIM.md.
--
-- מה נוסף:
--   1. נוסח מוכן בספרייה — שורה מובנית ב-journey_templates (office_id = null,
--      seed_key = 'reserve_duty_claim'): בקשה חופשית של הלקוח עם שאלה אחת מסוג בחירה (חובה) —
--      «מה מצאתם באזור האישי?». ‼ לא סוג בקשה חדש ולא מסמך ב«מסמכים»: זו עבודה עם מחזור (הלקוח
--      פועל באתר אחר ומדווח מה מצא), ולכן בקשה (CLAUDE.md §9). סוג חדש היה מחליף 4–5 פונקציות
--      שרת בלי תועלת; מסמך הוא חומר קריאה שנסגר בפתיחה — בלי תשובה ובלי מעקב.
--   2. build_client_portal — גוף 220 תו-בתו, ושדה אחד בפריט הפעולה של בקשה חופשית: `photoGuide`
--      (המפתח בלבד, מ-payload.clientPhotoGuide). התמונות, הצעדים והקישור לאתר קבועים בקוד
--      (src/components/portal/photoGuides.ts); מפתח לא מוכר ⇒ הדף פשוט לא מציג מדריך.
--
-- ‼ הקישור לאתר ביטוח לאומי אינו clientLinkUrl: ב-build_client_portal בקשה חופשית עם clientLinkUrl
--   הופכת ל-kind='guide' («חומר עזר») שפתיחת הקישור שלה סוגרת אותה. כאן הפתיחה לא משלימה כלום —
--   רק תשובת הלקוח (portal_submit_step).
-- ‼ לא נוגעים ב-portal_submit_step, במחולל, ב-create_onboarding_request ובכללי הסגירה: `select`
--   נתמך מקצה לקצה (208: בדיקת האפשרויות, וסגירה כשאין דרישות חובה פתוחות).
-- ‼ אין פסיקים בתשובות הבחירה — הקומפוזר מפצל אפשרויות לפי פסיק.
-- ‼ שום דבר כאן לא כותב ללקוחות, לא שולח מייל ולא נוגע בבקשות קיימות.
-- ‼ אחרי כל החלה — לאמת prosrc מול הקובץ: node scripts/verify-221-body.mjs (גם מול staging/ייצור).
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1 · הנוסח המוכן ─────────────────────────────────────────────────────────
-- אידמפוטנטי: מובנית אחת לכל מפתח (journey_templates_seed_key_idx).
insert into public.journey_templates (user_id, office_id, kind, seed_key, name, description, entries)
select null, null, 'request', 'reserve_duty_claim', 'תביעת מילואים בביטוח לאומי',
       'הלקוח בודק באזור האישי בביטוח לאומי שכל תקופות המילואים שולמו, ומגיש תביעה על תקופה חסרה - עם מדריך מצולם',
       jsonb_build_array(jsonb_build_object(
         'key','e1', 'stepType','custom_request', 'owner','client', 'requiredForClose', false,
         'payload', jsonb_build_object(
           'title',       'תביעת מילואים בביטוח לאומי',
           'clientTitle', 'תביעת מילואים בביטוח לאומי',
           'clientSub',   'בודקים שכל תקופות המילואים שולמו - ומגישים תביעה על מה שחסר',
           'clientNote',  'ביטוח לאומי משלם לעצמאים תגמול מילואים לפי הדיווח של צה״ל, בדרך כלל בלי שצריך להגיש תביעה. כדאי לוודא באזור האישי שכל תקופה ששירתם מופיעה ושולמה - ואם תקופה חסרה, להגיש עליה תביעה. אם המערכת לא מאפשרת להגיש - פונים דרך «צור קשר». המדריך המצולם מראה כל לחיצה.',
           'clientNoteAfter', 'עבדתם גם כשכירים? ההגשה אצלכם בטופס 502 המקוון - הפרטים והקישור בצעד האחרון של המדריך.',
           'clientPhotoGuide', 'reserve_duty_claim',
           'requirements', jsonb_build_array(jsonb_build_object(
             'key','outcome', 'kind','select', 'label','מה מצאתם באזור האישי?', 'done', false,
             'options', jsonb_build_array(
               'כל תקופות המילואים מופיעות - לא היה צריך להגיש',
               'חסרה תקופה - הגשתי עליה תביעה',
               'המערכת לא אפשרה להגיש - פניתי דרך «צור קשר»',
               'עבדתי גם כשכיר/ה - הגשתי בטופס 502'))))))
where not exists (select 1 from public.journey_templates
                   where seed_key = 'reserve_duty_claim' and office_id is null);

-- ── 2 · הדף האישי (גוף 220 + שדה אחד) ───────────────────────────────────────
-- ‼ הגוף של 220 תו-בתו, ושלוש שורות בלבד (שתי הערות ושדה אחד, photoGuide) בענף custom_request.
--   scripts/verify-221-body.mjs מוודא את זה, ומשווה גם לגוף החי.
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
  s        record;
  v_items  jsonb := '[]'::jsonb;
  v_done   int := 0;
  v_total  int := 0;
  v_sign_token text;
  v_spouse_pending boolean := false;
  v_invite_url text;
  v_res_key   text;
  -- ‼ 114: מה שהבקשה פותחת — קובץ מספריית המשרד, או קישור חיצוני שנשמר עליה.
  v_res_url   text;
  -- ‼ 144: כמה קבצים בבקשה אחת. ריק/חסר ⇒ הבקשה היא מהסוג הישן.
  v_res_list  jsonb;
  v_res_out   jsonb;
  v_prev_open boolean := false;
  v_prev_done boolean := false;
  v_first  text;
  v_has_eng boolean := false;
  v_stage  text;
  v_ck_done int;
  v_ck_total int;
  v_label  text;
  v_sub    text;
  v_published boolean := true;
  v_reqs   jsonb;
  v_rq_done int;
  v_rq_total int;
  v_rep_item jsonb := null;
  v_rep_seen boolean := false;
  v_before int := 0;
  v_lock   text;
  -- 217 · לקוח שחוזר
  v_cur    text;
  v_quote_open boolean := false;
  v_returning_intake boolean := false;
  -- 217 · אישור הייצוג באזור האישי — מי מאשר ואת מה
  v_rep_approvals jsonb;
  v_rep_req_sub text;
  -- 220 · פרטי העסק
  v_ho     jsonb;
begin
  select * into c from public.clients where id = p_client_id;
  if c.id is null then return jsonb_build_object('ok', false, 'error', 'invalid'); end if;
  select * into p from public.profiles where id = c.user_id;
  v_first := split_part(trim(coalesce(c.first_name, '')), ' ', 1);
  v_invite_url := nullif(trim(coalesce(p.settings->'paperless'->>'inviteUrl', '')), '');
  -- ‼ נפתר מהגדרות המשרד בכל רינדור, כמו קישור הפייפרלס שמעליו: קובץ אחד
  -- משותף, והחלפתו משנה מיד את מה שכל בקשה תפתח.

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
          'sub', coalesce(public.portal_lock_reason(s.id), v_sub)));
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
        continue;
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
        continue;
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
            'sub', coalesce(public.portal_lock_reason(s.id), nullif(s.payload->>'clientSub',''))));
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
          'sub', coalesce(public.portal_lock_reason(s.id), nullif(s.payload->>'clientSub',''))));
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
          'sub', coalesce(public.portal_lock_reason(s.id), nullif(s.payload->>'clientSub',''))));
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
        continue;
      elsif s.status in ('completed', 'verified') or
            (s.status = 'skipped' and coalesce(s.payload->>'skipReason','') in ('already_connected','transferred_rep')) then
        v_items := v_items || jsonb_build_object('bucket','done','key','paperless_signup','label','הרשמה לפייפרלס');
      elsif s.status = 'locked' then
        v_items := v_items || jsonb_strip_nulls(jsonb_build_object(
          'bucket','future','key','paperless_signup','label','הרשמה לפייפרלס',
          'sub', public.portal_lock_reason(s.id)));
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
        continue;
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
          'sub', public.portal_lock_reason(s.id)));
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
          'sub', public.portal_lock_reason(s.id)));
      else
        -- ‼ 217 · «מה מסמנים באזור האישי»: מי מבני הזוג מאשר ואילו רשויות (_rep_approval_people).
        -- לא ידוע ⇒ אין approvals, והכרטיס בנוסח הכללי. ‼ הקריאה עטופה: נתון פגום (או עזר
        -- שעוד לא הוחל) לעולם לא שובר את הדף — זו הפונקציה של כל דף של לקוח.
        -- ‼ 217 (H2.5b) · כשהאישור נדרש: שורת המשנה לפי מי ששע״ם ממתינה לאישור שלו («…לאישור
        -- של רחל»), לא «שלך» קבוע. בלי נתון — הנוסח השמור.
        v_rep_req_sub := null;
        begin
          v_rep_approvals := nullif(public._rep_approval_people(c.id), '[]'::jsonb);
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

    when 'retainer_authorization' then
      if coalesce(s.payload->>'method', '') = 'manual_arrangement' then
        continue;
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
          'sub', coalesce(public.portal_lock_reason(s.id), 'תופיע כאן אחרי חיבור הפייפרלס'));
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
      select jsonb_build_object('hasDedicatedRoom', a.has_dedicated_room,
               'totalRooms', a.total_rooms, 'businessRooms', a.business_rooms, 'note', a.note)
        into v_ho
        from public.client_home_office_answers a where a.client_id = c.id
       order by a.seq desc limit 1;
      if s.status in ('completed', 'verified') then
        v_items := v_items || jsonb_build_object('bucket','done','key','business_details',
          'label', coalesce(nullif(s.payload->>'clientTitle',''), 'פרטי העסק'));
      elsif s.status = 'skipped' then
        continue;
      elsif s.status = 'locked' then
        v_items := v_items || jsonb_strip_nulls(jsonb_build_object(
          'bucket','future','key','business_details',
          'label', coalesce(nullif(s.payload->>'clientTitle',''), 'פרטי העסק'),
          'sub', public.portal_lock_reason(s.id)));
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
          'sub', public.portal_lock_reason(s.id)));
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
      continue;
    end case;

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

  if v_prev_open then
    v_items := v_items || jsonb_build_object('bucket','office','key','prev_accountant','label','קבלת החומרים מרואה החשבון הקודם','sub','ביקשנו את התיק - בתהליך');
  elsif v_prev_done then
    v_items := v_items || jsonb_build_object('bucket','done','key','prev_accountant','label','החומרים מרואה החשבון הקודם התקבלו');
  end if;

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

revoke all on function public.build_client_portal(text, text) from public, anon, authenticated;

-- ── 3 · אימות ───────────────────────────────────────────────────────────────
select public.assert_domain_function_invariants();
