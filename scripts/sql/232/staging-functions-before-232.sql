CREATE OR REPLACE FUNCTION public._client_announceable_steps(p_client_id text)
 RETURNS TABLE(step_id text, step_type text, version integer, announced_version integer, title text, delivery text, run_id text, run_status text, stage_key text, reminder jsonb, announced_at timestamp with time zone, reminder_count integer, last_reminded_at timestamp with time zone, reminder_backoff_until timestamp with time zone, is_document boolean, sort_key integer, created_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select s.id, s.step_type, s.client_content_version, coalesce(ns.announced_version, 0),
         public._client_step_title(s.step_type, s.payload),
         case when s.step_type = 'rep_client_approval' then 'approve'
              else coalesce(nullif(s.payload->>'delivery', ''), 'approve') end,
         s.flow_run_id, r.status, s.flow_stage_key,
         case when s.step_type <> 'rep_client_approval' and jsonb_typeof(s.payload->'reminder') = 'object'
              then s.payload->'reminder' end,
         ns.announced_at, coalesce(ns.reminder_count, 0), ns.last_reminded_at, ns.reminder_backoff_until,
         (s.step_type = 'custom_request' and not (s.payload ? 'shaamIdentity')
           and (nullif(s.payload->>'clientResource', '') is not null
                or jsonb_typeof(s.payload->'clientResources') = 'array')),
         coalesce(s.pending_sort_order, s.sort_order, 0), s.created_at
    from public.onboarding_steps s
    left join public.client_step_notice_state ns on ns.step_id = s.id
    left join public.flow_runs r on r.id = s.flow_run_id
   where s.client_id = p_client_id
     and s.status not in ('completed', 'verified', 'skipped', 'cancelled', 'locked')
     and s.published_at is not null
     and public.client_step_gate_open(p_client_id, s.published_at)
     and coalesce(s.pending_cancel, false) = false
     and s.step_type in ('client_documents', 'custom_request', 'paperless_tax_authority',
                         'paperless_invite', 'prev_accountant_details', 'rep_client_approval',
                         -- ‼ 220 · פרטי העסק — רק כשהיא אצל הלקוח (לא בבדיקת המשרד).
                         'business_details',
                         -- 229 · «השלמת מידע» — רק כשהיא אצל הלקוח
                         'info_collection')
     and (s.step_type <> 'business_details' or coalesce(s.ball, 'client') = 'client')
     and (s.step_type <> 'info_collection' or coalesce(s.ball, 'client') = 'client')
     and (s.step_type <> 'rep_client_approval'
          or (coalesce(s.payload->>'requiredBy', '') = 'shaam'
              and coalesce(s.ball, 'client') = 'client'
              and nullif(s.payload->>'clientDeclaredAt', '') is null))
     and (s.step_type <> 'custom_request'
          or (coalesce(s.ball, 'client') = 'client'
              and coalesce(s.payload->>'messageOnly', 'false') <> 'true'
              and s.payload->'externalParty' is null
              -- ‼ משימה של המשרד (216 §9) אינה בדף — ולכן גם לא במייל, גם אחרי «ממתין ללקוח».
              and not (s.payload ? 'personalConfirmFor')
              and coalesce(s.payload->>'internalTask', 'false') <> 'true'
              -- ‼ סומנה לבדיקה ואין בה תוכן ללקוח. הכלל של התוכן = _payload_has_client_content
              --   (216 §9), משוכפל כאן תו בתו כי 214 מוחלת לפניה — לשנות בשני המקומות יחד.
              and not (coalesce(s.payload->>'internalTaskReview', '') = 'true'
                       and not (coalesce(s.payload, '{}'::jsonb) <> '{}'::jsonb and coalesce(jsonb_typeof(s.payload) = 'object', false) and (
       coalesce(jsonb_array_length(case when jsonb_typeof(s.payload->'requirements') = 'array' then s.payload->'requirements' end), 0) > 0
    or coalesce(jsonb_array_length(case when jsonb_typeof(s.payload->'checklist') = 'array' then s.payload->'checklist' end), 0) > 0
    or coalesce(jsonb_array_length(case when jsonb_typeof(s.payload->'clientResources') = 'array' then s.payload->'clientResources' end), 0) > 0
    or coalesce(nullif(s.payload->>'clientResource', ''), nullif(btrim(coalesce(s.payload->>'clientLinkUrl', '')), '')) is not null
    or coalesce(s.payload->>'messageOnly', '') = 'true'
    or coalesce(jsonb_typeof(s.payload->'externalParty'), '') = 'object'
    or s.payload ?| array['smartForm', 'shaamIdentity', 'guideKey'])))))
     and coalesce(s.payload->>'delivery', '') <> 'page';
$function$
;

CREATE OR REPLACE FUNCTION public._client_step_portal_key(p_step_id text, p_step_type text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  select case p_step_type
           when 'client_documents' then 'docs'
           when 'custom_request' then 'custom_' || p_step_id
           when 'prev_accountant_details' then 'prev_details'
           when 'paperless_invite' then 'paperless_signup'
           when 'paperless_tax_authority' then 'paperless_tax'
           when 'business_details' then 'business_details'
           when 'info_collection' then 'taxinfo_' || p_step_id
           when 'rep_client_approval' then 'rep_approval'
         end;
$function$
;

CREATE OR REPLACE FUNCTION public._portal_step_items(s onboarding_steps, c clients, p profiles, req representation_requests, p_rep_item jsonb, p_ctx jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
        -- ‼ 224 · אישור ייפוי הכוח בב"ל הוא פעולה של האדם עצמו — ראה ראש 224.
        declare
          v_sp     boolean := coalesce(s.payload->>'subjectRole', '') = 'spouse';
          v_trk    jsonb := coalesce(req.execution -> (case when s.payload->>'subjectRole' = 'spouse'
                                                           then 'nationalInsuranceSpouse' else 'nationalInsurance' end), '{}'::jsonb);
          v_me     text := nullif(trim(coalesce(c.first_name, '')), '');
          v_sp1    text := coalesce(nullif(trim(coalesce(c.spouse_first_name, '')), ''),
                                    nullif(split_part(trim(coalesce(c.spouse_name, '')), ' ', 1), ''));
          v_who    text;
          v_whose  text;
          v_other  text;
          v_assure text;
          v_dl     text;
        begin
          v_who := case when v_sp then coalesce(v_sp1,
                     nullif(split_part(trim(coalesce(s.payload->>'subjectName', '')), ' ', 1), ''), 'בן/בת הזוג') end;
          v_whose := case when v_sp then 'של ' || v_who else 'שלך' end;
          v_dl := case when nullif(v_trk->>'deadline', '') is not null
                       then to_char((v_trk->>'deadline')::date, 'DD.MM.YYYY') end;
          select o.status into v_other
            from public.onboarding_steps o
           where o.client_id = s.client_id and o.id <> s.id
             and o.step_type = 'authority_representation'
             and o.payload->>'authority' = 'national_insurance'
             and o.payload->>'subjectRole' = (case when v_sp then 'client' else 'spouse' end)
             and o.status not in ('cancelled', 'skipped')
           order by o.created_at desc
           limit 1;
          v_assure := case
            when v_other in ('completed', 'verified') and v_sp and v_me is not null
              then 'האישור של ' || v_me || ' כבר התקבל. האישור הזה הוא של ' || v_who || ', במספר נפרד.'
            when v_other in ('completed', 'verified') and not v_sp and v_sp1 is not null
              then 'האישור של ' || v_sp1 || ' כבר התקבל. האישור הזה הוא שלך, במספר נפרד.'
            when v_other is not null
              then 'לכל אחד מבני הזוג מספר אסמכתא נפרד ואישור נפרד.'
          end;
          v_items := v_items || jsonb_strip_nulls(jsonb_build_object(
            'bucket', 'action', 'key', 'authrep_' || s.id, 'kind', 'ni_approval',
            'forPerson', v_who,
            'label', case when v_sp then v_who || ' — אישור ייפוי הכוח בביטוח הלאומי'
                          else 'אישור ייפוי הכוח בביטוח הלאומי' end,
            'assurance', v_assure,
            'refs', jsonb_build_array(jsonb_build_object(
                      'label', 'מספר האסמכתא ' || v_whose,
                      'value', coalesce(nullif(v_trk->>'referenceNumber', ''), '—')))
                    || case when v_dl is not null
                            then jsonb_build_array(jsonb_build_object('label', 'לאשר עד', 'value', v_dl))
                            else '[]'::jsonb end,
            'noteAfter', 'באתר: תעודת הזהות ' || v_whose || ' ומספר האסמכתא, והזדהות בכרטיס אשראי ' || v_whose
                         || ' (או בטלפון/מייל המעודכנים בביטוח הלאומי).' || chr(10)
                         || 'בטלפון: ' || chr(8294) || '02' || chr(8209) || '5393740' || chr(8297)
                         || ' (מענה קולי), עם מספר האסמכתא.',
            'linkUrl', 'https://b2b.btl.gov.il/BTL.ILG.PAYMENTS/IshurIpuyKoachInfo.aspx',
            'linkLabel', 'לאישור באתר הביטוח הלאומי'));
        end;
      elsif s.status = 'blocked' then
        v_items := v_items || jsonb_build_object('bucket','office','key','authrep_'||s.id,
          'label', v_label, 'sub', 'האסמכתא פגה - נזין מחדש');
      elsif s.status in ('completed','verified') then
        v_items := v_items || jsonb_build_object('bucket','done','key','authrep_'||s.id,
          'label', v_label || ' · אושר');
      end if;

    when 'info_collection' then
      -- 229 · «השלמת מידע» לשנת מס: פעולה ללקוח כשיש שאלות פתוחות; «נשלח» כשענה; מסמך «אין עדיין» — ממתין, בלי תזכורת אוטומטית
      select count(*) filter (where a.state = 'published'), count(*) filter (where a.state = 'answered'), count(*) filter (where a.state = 'unavailable')
        into v_ck_total, v_ck_done, v_rq_total from public.tax_info_asks a where a.step_id = s.id;
      v_label := coalesce(nullif(s.payload->>'title',''), 'השלמת מידע');
      if v_ck_total > 0 then
        v_items := v_items || jsonb_build_object('bucket','action','key','taxinfo_'||s.id,'label',v_label,
          'sub', v_ck_total || ' שאלות · אפשר לעצור ולהמשיך', 'actionKind','taxInfo','actionValue', s.id);
      elsif v_rq_total > 0 then
        v_items := v_items || jsonb_build_object('bucket','office','key','taxinfo_'||s.id,'label',v_label,
          'sub', 'מחכים למסמכים שעוד לא הגיעו — נבקש כשיהיו', 'actionKind','taxInfo','actionValue', s.id);
      elsif v_ck_done > 0 then
        v_items := v_items || jsonb_build_object('bucket','done','key','taxinfo_'||s.id,'label', v_label || ' · נשלח למשרד');
      end if;

    else
      exit step_body;
    end case;
  end step_body;
  return jsonb_build_object('items', v_items, 'repSeen', v_rep_seen, 'prevOpen', v_prev_open,
                            'prevDone', v_prev_done, 'skipFlags', v_skip_flags);
end;
$function$
;

CREATE OR REPLACE FUNCTION public._tax_estimate_immutable()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if old.status = 'superseded' then
    raise exception 'tax_estimate_superseded: גרסה שהוחלפה אינה נערכת';
  end if;
  if old.status = 'approved' then
    -- המעבר היחיד המותר: «הוחלפה», בלי לגעת בשום שדה אחר
    if new.status = 'superseded'
       and new.draft = old.draft and new.outputs is not distinct from old.outputs and new.input_facts = old.input_facts
       and new.version = old.version and new.revision = old.revision and new.cutoff_month = old.cutoff_month and new.approved_at is not distinct from old.approved_at then
      return new;
    end if;
    raise exception 'tax_estimate_approved: גרסה מאושרת אינה נערכת — חישוב מחדש יוצר גרסה חדשה';
  end if;
  return new;
end $function$
;
