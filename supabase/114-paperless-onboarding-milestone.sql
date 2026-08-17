-- ─── 114 · פייפרלס: שם העסק, מדריך אחרי ההרשמה, וסוף אמיתי לריטיינר ───────
-- הכרעת גיא (2026-08-17). שלושה חורים באותו רצף, וכולם באותו מנוע קיים:
--
--   1. שם העסק — מה שאנחנו מזינים בפייפרלס — מעולם לא נשאל מהלקוח. הוא הועתק
--      מהליד, ולקוח שנולד בלי ליד הגיע בלי שם עסק. עכשיו הוא נשאל בכרטיס
--      ההרשמה עצמו, עם מילוי-מראש לאישור, ונשמר ל-clients.business_name —
--      ולשם בלבד. אין עותק שני על השלב.
--
--   2. הרגע שאחרי «נרשמתי לפייפרלס» היה ריק: הכרטיס נסגר ולא הופיע דבר
--      במקומו. עכשיו נחשף שם מדריך הווידאו — בקשה רגילה שנושאת קישור חיצוני
--      (payload.clientLinkUrl), לא סוג שלב חדש. אינו חוסם דבר.
--
--   3. «הרשאת התשלום» נגמרה באישור שההרשאה הוקמה, והחיוב עצמו לא היה מיוצג
--      במערכת. עכשיו שלוש נקודות זמן על אותו שלב: ההרשאה נוצרה בפייפרלס,
--      הכרטיס הוזן (גיא ראה), והריטיינר חויב — וזה מה שסוגר את השלב.
--      ההודעה ללקוח על הכרטיס ועל חיוב האימות של ₪1 מופיעה רק מהנקודה
--      הראשונה ואילך, ולא רגע לפניה.
--
-- ‼ אין כאן אינטגרציה לפייפרלס ואין המצאה של ידיעה: כל מעבר הוא הצהרה של
-- הלקוח או של גיא, בדיוק כמו קודם. השדות החדשים (cardEnteredAt,
-- retainerChargedAt) נכתבים מהמסך דרך advance_onboarding_step הקיימת.
--
-- ‼ שלוש הפונקציות נכתבות מתוך ההגדרה **החיה** שנמשכה מהפרודקשן ב-2026-08-17
-- (scripts/dump-live-functions.mjs), ולכן שום ענף אחר אינו חוזר אחורה.
--
-- ארבעה חלקים: (א) דף הלקוח, (ב) ההשלמה של הלקוח, (ג) ביטול אישור שגוי,
-- (ד) מילוי-לאחור לשורות קיימות.

-- ── א. build_client_portal ──────────────────────────────────────────────────
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
begin
  select * into c from public.clients where id = p_client_id;
  if c.id is null then return jsonb_build_object('ok', false, 'error', 'invalid'); end if;
  select * into p from public.profiles where id = c.user_id;
  v_first := split_part(trim(coalesce(c.first_name, '')), ' ', 1);
  v_invite_url := nullif(trim(coalesce(p.settings->'paperless'->>'inviteUrl', '')), '');
  -- ‼ נפתר מהגדרות המשרד בכל רינדור, כמו קישור הפייפרלס שמעליו: קובץ אחד
  -- משותף, והחלפתו משנה מיד את מה שכל בקשה תפתח.

  v_has_eng := exists (select 1 from public.engagements e where e.client_id = c.id);

  select coalesce(bool_or(e.process_published_at is not null), true)
    into v_published from public.engagements e where e.client_id = c.id;

  select * into quo from public.quotations q
    where q.client_id = c.id and q.status <> 'draft'
    order by q.updated_at desc limit 1;

  if v_has_eng then
    v_items := v_items || jsonb_build_object('bucket','done','key','quotation','label','הצעת המחיר אושרה');
  elsif quo.id is not null and quo.status in ('sent','viewed') then
    v_items := v_items || jsonb_strip_nulls(jsonb_build_object(
      'bucket','action','key','quote_sign',
      'label','הצעת המחיר שלך מוכנה',
      'sub','לקריאה ולאישור — ואפשר להתחיל · כמה דקות',
      'actionKind','quote','actionValue', quo.public_token));
  elsif quo.id is not null and quo.status = 'approved' then
    v_items := v_items || jsonb_build_object('bucket','done','key','quotation','label','הצעת המחיר אושרה');
    v_items := v_items || jsonb_build_object('bucket','office','key','quote_processing',
      'label','אנחנו מכינים את המשך התהליך','sub','נעדכן אותך כאן ברגע שיהיה מה לעשות');
  elsif quo.id is not null and quo.status in ('expired','cancelled') then
    v_items := v_items || jsonb_build_object('bucket','office','key','quote_expired',
      'label','הצעת המחיר כבר לא בתוקף','sub','נשמח לחדש אותה — דברו איתנו');
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
        v_rep_item := jsonb_strip_nulls(jsonb_build_object('bucket','action','key','rep_sign','label','חתימה על ייפוי הכוח','sub','הטופס מוכן — נשארה חתימה · כדקה','actionKind','sign','actionValue', v_sign_token));
      elsif v_spouse_pending then
        select jsonb_strip_nulls(jsonb_build_object('bucket','action','key','rep_sign_spouse','label','חתימת בן/בת הזוג על ייפוי הכוח','sub','אפשר לחתום יחד עכשיו, או לשלוח לבן/בת הזוג קישור אישי','actionKind','sign','actionValue', x->>'signToken')) into v_rep_item
        from jsonb_array_elements(coalesce(req.signers, '[]'::jsonb)) x
        where x->>'role' = 'client' and coalesce(x->>'signToken', '') <> '' limit 1;
      end if;
    elsif req.status in ('awaiting_accountant', 'awaiting_stamp') then
      v_rep_item := jsonb_build_object('bucket','office','key','rep_office','label','ייפוי הכוח','sub','נחתם על ידך — עכשיו בבדיקה ובחתימה אצלנו');
    elsif req.status = 'awaiting_authorities' then
      v_rep_item := jsonb_build_object('bucket','office','key','rep_authorities','label','ייפוי הכוח','sub','נחתם והוגש לרשויות המס — ממתינים לאישור');
    elsif req.status = 'active' then
      v_rep_item := jsonb_build_object('bucket','done','key','rep_done','label','הייצוג מול רשויות המס אושר');
    end if;
  end if;

  for s in
    select * from public.onboarding_steps st
    where st.client_id = c.id and st.status <> 'cancelled'
      and (p_mode = 'preview'
           or (st.published_at is not null and (v_published or st.step_type = 'representation')))
    order by (case when p_mode = 'preview' then coalesce(st.pending_sort_order, st.sort_order, 0)
                   else coalesce(st.sort_order, 0) end),
             st.created_at
  loop
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
          'checklist', (select jsonb_agg(jsonb_build_object(
                            'key', x->>'key', 'label', x->>'label', 'done', (x->>'done')::boolean)
                          order by ord)
                          from jsonb_array_elements(coalesce(s.payload->'checklist','[]'::jsonb))
                               with ordinality t(x, ord))));
      end if;

    when 'custom_request' then
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

      if s.status in ('completed','verified','skipped') then
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
          'sub', coalesce(nullif(s.payload->>'clientSub',''), 'שם, אימייל וטלפון — כדי שנפנה אליו בשמך'),
          'actionKind','portal','actionValue', s.id, 'kind','prev_accountant'));
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
    when 'retainer_authorization' then
      if coalesce(s.payload->>'method', '') = 'manual_arrangement' then
        continue;
      elsif s.status in ('completed', 'verified') then
        v_items := v_items || jsonb_build_object('bucket','done','key','retainer','label','החיוב החודשי הוסדר');
      elsif s.status = 'locked' then
        v_items := v_items || jsonb_build_object('bucket','future','key','retainer_future',
          'label','הרשאת התשלום החודשי',
          'sub', coalesce(public.portal_lock_reason(s.id), 'תופיע כאן אחרי חיבור הפייפרלס'));
      -- ‼ 114: עד כאן ההודעה "תתבקש להזין כרטיס" הופיעה ברגע שהשלב נפתח —
      -- כלומר לפני שגיא בכלל יצר את ההרשאה בפייפרלס. הבטחה שאין מאחוריה
      -- כלום היא בדיוק הפנייה שהיא באה למנוע.
      elsif nullif(s.payload->>'authorizationCreatedAt','') is null then
        v_items := v_items || jsonb_build_object('bucket','office','key','retainer_info',
          'label', coalesce(nullif(s.payload->>'clientTitle',''), 'החיוב החודשי'),
          'sub', 'אנחנו מסדירים מול פייפרלס את החיוב החודשי שסיכמנו. אין צורך לעשות דבר כרגע.');
      -- ‼ הכדור אצל הלקוח — אבל הפעולה עצמה קורית בתוך פייפרלס, ולכן כרטיס
      -- מידע בלי פקד: הלקוח לא מאשר לנו כאן שהזין כרטיס. אין לנו דרך לדעת,
      -- ואישור שאין מאחוריו אימות הוא בדיוק מה שלא רצינו.
      elsif nullif(s.payload->>'cardEnteredAt','') is null then
        v_items := v_items || jsonb_build_object('bucket','action','key','retainer_card',
          'kind','info',
          'label','הזנת כרטיס אשראי בפייפרלס',
          'sub','פייפרלס תבקש מכם להזין כרטיס אשראי לחיוב החודשי שסיכמנו — באפליקציה או בהודעה מהם.',
          -- ‼ "1 ₪" ולא "₪1": בעברית סימן המטבע נדחף אחרי הספרה בכל מקרה, ובלי
          -- הרווח זה נקרא "1₪" ונראה כמו תקלה. נבדק בדפדפן.
          'note','ייתכן שתראו חיוב אימות בסך 1 ₪ — הוא נועד לוודא שהכרטיס תקין, ואינו החיוב החודשי.' || chr(10) ||
                 'אין מה לאשר כאן: ברגע שהכרטיס יוזן, נראה את זה מצידנו ונעדכן.');
      else
        v_items := v_items || jsonb_build_object('bucket','office','key','retainer_charge',
          'label','החיוב החודשי',
          'sub','פרטי הכרטיס התקבלו. נשלים את החיוב החודשי ונעדכן כאן.');
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
        v_items := v_items || jsonb_build_object('bucket','office','key','files_office','label','פתיחת התיקים ברשויות','sub','מע"מ, מס הכנסה וביטוח לאומי — בטיפולנו');
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
  end loop;

  if not v_rep_seen and v_rep_item is not null then
    v_items := v_items || v_rep_item;
  end if;

  if v_prev_open then
    v_items := v_items || jsonb_build_object('bucket','office','key','prev_accountant','label','קבלת החומרים מרואה החשבון הקודם','sub','ביקשנו את התיק — בתהליך');
  elsif v_prev_done then
    v_items := v_items || jsonb_build_object('bucket','done','key','prev_accountant','label','החומרים מרואה החשבון הקודם התקבלו');
  end if;

  if v_has_eng and not v_published and p_mode = 'live' then
    v_items := v_items || jsonb_build_object('bucket','office','key','process_pending',
      'label','אנחנו מכינים את המשך התהליך','sub','נעדכן אותך כאן ברגע שיהיה מה לעשות');
  end if;

  select count(*) filter (where x->>'bucket' = 'done'),
         count(*) filter (where x->>'bucket' <> 'future')
    into v_done, v_total
    from jsonb_array_elements(v_items) x;

  if not v_has_eng and quo.id is null and req.id is not null then
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

-- ── ב. portal_submit_step ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.portal_submit_step(p_token text, p_step_id text, p_data jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  c      public.clients%rowtype;
  s      public.onboarding_steps%rowtype;
  v_name  text;
  v_email text;
  v_phone text;
  v_key   text;
  v_val   text;
  v_kind  text;
  v_req   jsonb;
  v_reqs  jsonb;
  v_open  int;
  v_label text;
  v_client_name text;
  -- ‼ 114: שם העסק שהלקוח אישר, והמדריך שנחשף לו אחרי האישור.
  v_biz   text;
  v_guide text;
begin
  select * into c from public.clients where portal_token = p_token limit 1;
  if c.id is null then return jsonb_build_object('ok', false, 'error', 'invalid'); end if;
  if c.portal_token_expires_at is not null and c.portal_token_expires_at < now() then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  update public.clients set portal_token_last_used_at = now() where id = c.id;

  select * into s from public.onboarding_steps where id = p_step_id and client_id = c.id;
  if s.id is null then return jsonb_build_object('ok', false, 'error', 'step_not_found'); end if;
  if s.status in ('completed','verified','skipped','cancelled') then
    return jsonb_build_object('ok', true, 'noop', true);
  end if;
  if s.published_at is null then
    return jsonb_build_object('ok', false, 'error', 'not_published');
  end if;
  if s.status = 'locked' then
    return jsonb_build_object('ok', false, 'error', 'locked');
  end if;
  if s.step_type not in ('prev_accountant_details', 'custom_request', 'paperless_invite') then
    return jsonb_build_object('ok', false, 'error', 'not_client_editable');
  end if;

  v_client_name := nullif(trim(coalesce(c.first_name,'') || ' ' || coalesce(c.last_name,'')), '');

  -- ── "נרשמתי לפייפרלס" ─────────────────────────────────────────────────────
  -- ‼ אישור אחד, בלי נתונים: אין לנו דרך לאמת מול פייפרלס שהחשבון נפתח, ולכן
  -- מה שנרשם הוא בדיוק מה שקרה — הלקוח הצהיר שנרשם. הרו״ח רואה את ההצהרה
  -- ביומן ויכול תמיד להחזיר את השלב לפתוח אם התברר אחרת.
  -- ‼ שלב 2 (החיבור) נפתח מכאן דרך unlock_dependent_steps בלבד — אותה פתיחה
  -- אוטומטית של כל תלות אחרת. אין קפיצה ישירה לשלב 3.
  if s.step_type = 'paperless_invite' then
    -- ── שם העסק — מקור אמת אחד ──────────────────────────────────────────
    -- ‼ 114: הערך נכתב אל clients.business_name בלבד ואינו נשמר על השלב.
    -- עותק שני על ה-payload היה הופך לשקר ביום שגיא יתקן את הכרטיס.
    -- ‼ הערך ששלח הלקוח גובר: זהו בדיוק מסך האישור של השם.
    v_biz := nullif(trim(coalesce(p_data->>'businessName','')), '');
    if v_biz is not null then
      update public.clients set business_name = v_biz, updated_at = now() where id = c.id;
    elsif nullif(trim(coalesce(c.business_name,'')), '') is null then
      return jsonb_build_object('ok', false, 'error', 'missing_business_name');
    end if;

    update public.onboarding_steps
       set status = 'completed', ball = 'me', completion_method = 'system',
           completed_at = now(), needs_attention = false,
           payload = payload || jsonb_build_object(
             'submittedByClient', true,
             'clientConfirmedAt', to_jsonb(now()))
     where id = s.id;

    perform public.log_onboarding_event(s.user_id, s.id, s.engagement_id, 'status_changed', 'client',
      'הלקוח אישר שנרשם לפייפרלס', jsonb_build_object('to', 'completed'));

    perform public.unlock_dependent_steps(s.id);

    -- ── המדריך נחשף רק עכשיו ─────────────────────────────────────────────
    -- ‼ נוצר כאן ולא מראש: שלב שנוצר מראש היה מופיע בדף כ«בהמשך» ומספר
    -- ללקוח על משהו שאין לו מה לעשות איתו לפני שנרשם.
    -- ‼ בקשה רגילה עם קישור חיצוני — לא סוג שלב חדש, לא מנוע שני, ולא
    -- ספריית מסמכים שנייה. required_for_close=false ⇒ אינו חוסם כלום.
    -- ‼ לא ללקוח שכבר עובד עם פייפרלס: מדריך התקנה למי שכבר מותקן הוא רעש.
    if coalesce(s.payload->>'paperlessStatus','') not in ('self','other_rep','not_applicable')
       and not exists (select 1 from public.onboarding_steps g
                        where g.client_id = c.id
                          and g.payload->>'guideKey' = 'paperless_app'
                          and g.status <> 'cancelled') then
      insert into public.onboarding_steps
        (user_id, engagement_id, client_id, step_type, track, scope, status, ball,
         sort_order, published_at, required_for_close, payload)
      values (s.user_id, s.engagement_id, c.id, 'custom_request',
              public.onboarding_track_for('custom_request'), 'person',
              'waiting_client', 'client', coalesce(s.sort_order, 0), now(), false,
              jsonb_build_object(
                'guideKey', 'paperless_app',
                'title', 'מדריך פייפרלס ללקוח',
                'clientTitle', 'מדריך: איך עובדים עם פייפרלס',
                'clientSub', 'סרטון קצר — להוריד את האפליקציה ולשלוח את הקבלה הראשונה',
                'clientCta', 'לצפייה במדריך',
                'clientLinkUrl', 'https://www.youtube.com/watch?v=Rvbq3DPF50s&list=PL8VCJr5Lb2NHqEjAf96xbmIFTDj7Gfoxl&index=2',
                'requirements', jsonb_build_array(jsonb_build_object(
                  'key','opened','kind','confirm','label','צפייה במדריך',
                  'done', false, 'required', true))))
      returning id into v_guide;

      perform public.log_onboarding_event(s.user_id, v_guide, s.engagement_id, 'created', 'system',
        'מדריך הפייפרלס נחשף ללקוח אחרי אישור ההרשמה', '{}'::jsonb);
    end if;

    perform public.queue_accountant_notification(
      s.user_id, 'client_request_completed', c.id, s.id, null, null,
      jsonb_build_object(
        'clientName', v_client_name,
        'requestTitle', coalesce(nullif(s.payload->>'clientTitle',''), 'הרשמה לפייפרלס'),
        'lastItem', 'הלקוח נרשם — אפשר להיכנס לחשבון ולהשלים את החיבור'));

    return jsonb_build_object('ok', true, 'completed', true);
  end if;

  if s.step_type = 'custom_request' then
    v_key := nullif(trim(coalesce(p_data->>'key','')), '');
    if v_key is null then return jsonb_build_object('ok', false, 'error', 'missing_key'); end if;
    v_val := nullif(trim(coalesce(p_data->>'value','')), '');

    v_reqs := coalesce(s.payload->'requirements', '[]'::jsonb);
    select x into v_req from jsonb_array_elements(v_reqs) x where x->>'key' = v_key limit 1;
    if v_req is null then return jsonb_build_object('ok', false, 'error', 'requirement_not_found'); end if;

    v_kind := coalesce(v_req->>'kind', '');
    if v_kind in ('file','files') then
      return jsonb_build_object('ok', false, 'error', 'file_via_upload');
    end if;
    if v_kind not in ('confirm','text','email','phone','number','date','select') then
      return jsonb_build_object('ok', false, 'error', 'requirement_not_found');
    end if;

    if v_kind <> 'confirm' and v_val is null then
      return jsonb_build_object('ok', false, 'error', 'missing_value');
    end if;
    if v_kind = 'email' and v_val !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
      return jsonb_build_object('ok', false, 'error', 'bad_email');
    end if;
    if v_kind = 'phone' and length(regexp_replace(v_val, '\D', '', 'g')) not between 7 and 15 then
      return jsonb_build_object('ok', false, 'error', 'bad_phone');
    end if;
    if v_kind = 'number' and v_val !~ '^-?\d+(\.\d+)?$' then
      return jsonb_build_object('ok', false, 'error', 'bad_number');
    end if;
    if v_kind = 'date' then
      begin
        perform v_val::date;
      exception when others then
        return jsonb_build_object('ok', false, 'error', 'bad_date');
      end;
    end if;
    if v_kind = 'select' and not exists (
      select 1 from jsonb_array_elements_text(coalesce(v_req->'options','[]'::jsonb)) o
       where o = v_val) then
      return jsonb_build_object('ok', false, 'error', 'bad_choice');
    end if;

    select jsonb_agg(
             case when x->>'key' = v_key
                  then x || jsonb_build_object('done', true)
                         || case when v_val is not null then jsonb_build_object('value', v_val) else '{}'::jsonb end
                         || jsonb_build_object('doneAt', to_jsonb(now()))
                  else x end order by ord)
      into v_reqs
      from jsonb_array_elements(v_reqs) with ordinality t(x, ord);

    select count(*) into v_open from jsonb_array_elements(v_reqs) x
      where not coalesce((x->>'done')::boolean, false)
        and coalesce((x->>'required')::boolean, true);

    select x->>'label' into v_label from jsonb_array_elements(v_reqs) x where x->>'key' = v_key;

    update public.onboarding_steps
       set payload = payload || jsonb_build_object('requirements', v_reqs),
           status  = case when v_open = 0 then 'completed' else 'waiting_client' end,
           ball    = case when v_open = 0 then 'me' else 'client' end,
           completion_method = case when v_open = 0 then 'system' else completion_method end,
           completed_at = case when v_open = 0 then now() else completed_at end,
           needs_attention = case when v_open = 0 then false else needs_attention end
     where id = s.id;

    perform public.log_onboarding_event(s.user_id, s.id, s.engagement_id,
      case when v_open = 0 then 'status_changed' else 'note' end, 'client',
      case when v_open = 0 then 'הלקוח השלים את הבקשה'
           else 'הלקוח השלים: ' || coalesce(v_label, v_key) end,
      jsonb_build_object('key', v_key, 'remaining', v_open));

    if v_open = 0 then
      perform public.unlock_dependent_steps(s.id);
      perform public.queue_accountant_notification(
        s.user_id, 'client_request_completed', c.id, s.id, null, null,
        jsonb_build_object(
          'clientName', v_client_name,
          'requestTitle', coalesce(nullif(s.payload->>'clientTitle',''), 'בקשה מהמשרד'),
          'lastItem', coalesce(v_label, v_key)));
    end if;

    return jsonb_build_object('ok', true, 'remaining', v_open, 'completed', v_open = 0);
  end if;

  v_name  := nullif(trim(coalesce(p_data->>'name','')), '');
  v_email := nullif(trim(coalesce(p_data->>'email','')), '');
  v_phone := nullif(trim(coalesce(p_data->>'phone','')), '');
  if v_name is null and v_email is null then
    return jsonb_build_object('ok', false, 'error', 'missing_details');
  end if;

  update public.clients
     set prev_accountant_name  = coalesce(prev_accountant_name, v_name),
         prev_accountant_email = coalesce(prev_accountant_email, v_email),
         prev_accountant_phone = coalesce(prev_accountant_phone, v_phone),
         has_previous_accountant = true,
         updated_at = now()
   where id = c.id;

  update public.onboarding_steps
     set status = 'completed', ball = 'me', completion_method = 'system',
         completed_at = now(), needs_attention = false,
         payload = payload || jsonb_build_object(
           'submittedByClient', true,
           'submitted', jsonb_strip_nulls(jsonb_build_object('name', v_name, 'email', v_email, 'phone', v_phone)))
   where id = s.id;

  perform public.log_onboarding_event(s.user_id, s.id, s.engagement_id, 'status_changed', 'client',
    'הלקוח מסר את פרטי הרו״ח הקודם', jsonb_build_object('to', 'completed'));

  perform public.unlock_dependent_steps(s.id);

  perform public.queue_accountant_notification(
    s.user_id, 'client_request_completed', c.id, s.id, null, null,
    jsonb_build_object(
      'clientName', v_client_name,
      'requestTitle', coalesce(nullif(s.payload->>'clientTitle',''), 'פרטי רואה החשבון הקודם'),
      'lastItem', coalesce(v_name, v_email)));

  return jsonb_build_object('ok', true);
end;
$function$;

grant execute on function public.portal_submit_step(text, text, jsonb) to anon, authenticated;

-- ── ג. reopen_paperless_registration — ביטול אישור שגוי ─────────────────────
-- ‼ הלקוח יכול ללחוץ «נרשמתי לפייפרלס» בטעות, ועד היום לא הייתה לגיא שום
-- דרך להחזיר את השלב: תפריט ⋯ מוצג רק על שלב פתוח, ו-advance('reopen')
-- לא הגיע לשום כפתור. RPC ייעודי ומצומצם, באותה תבנית של
-- reopen_institution_alignment — ולא הרחבה של הפעולה הגנרית.
--
-- ‼ שלב החיבור ננעל בחזרה, אבל **רק אם עוד לא נגעו בו**: אישור שגוי פתח
-- אותו, וזה מה שמתבטל. שלב שכבר התחיל או הושלם נשאר כפי שהוא — אסור
-- שביטול אישור ימחק עבודה שנעשתה בפועל.
create or replace function public.reopen_paperless_registration(p_step_id text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  s         public.onboarding_steps%rowtype;
  v_uid     uuid := auth.uid();
  v_relocked int := 0;
begin
  select * into s from public.onboarding_steps where id = p_step_id;
  if s.id is null then return jsonb_build_object('ok', false, 'error', 'step_not_found'); end if;
  if v_uid is null or s.user_id <> v_uid then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;
  if s.step_type <> 'paperless_invite' then
    return jsonb_build_object('ok', false, 'error', 'wrong_step_type');
  end if;
  if s.status not in ('completed', 'verified', 'skipped') then
    return jsonb_build_object('ok', true, 'noop', true);
  end if;

  update public.onboarding_steps
     set status = 'waiting_client', ball = 'client',
         completed_at = null, completed_by = null, verified_at = null,
         completion_method = 'manual', needs_attention = false,
         payload = (payload - 'submittedByClient' - 'clientConfirmedAt' - 'skipReason')
                   || jsonb_build_object('reopenedAt', to_jsonb(now()))
   where id = s.id;

  update public.onboarding_steps d
     set status = 'locked'
   where d.client_id = s.client_id
     and d.id <> s.id
     and d.status in ('pending', 'waiting_client', 'in_progress')
     and d.completed_at is null
     and (d.depends_on_step_id = s.id
          or exists (select 1 from public.onboarding_step_dependencies x
                      where x.step_id = d.id and x.depends_on_step_id = s.id));
  get diagnostics v_relocked = row_count;

  perform public.log_onboarding_event(s.user_id, s.id, s.engagement_id, 'status_changed', 'accountant',
    'אישור ההרשמה בוטל — השלב הוחזר ללקוח',
    jsonb_build_object('from', s.status, 'to', 'waiting_client', 'relocked', v_relocked));

  return jsonb_build_object('ok', true, 'relocked', v_relocked);
end;
$function$;

revoke all on function public.reopen_paperless_registration(text) from public, anon;
grant execute on function public.reopen_paperless_registration(text) to authenticated;

-- ── ד. set_paperless_path — הבעלות ששלב 106 קבע, גם אחרי «שנה מסלול» ────────
-- ‼ התגלה בבדיקה בדפדפן (2026-08-17): לקוח שכבר אישר «נרשמתי לפייפרלס», ואז
-- גיא ענה על שאלות המסלול — שלב החיבור ננעל בחזרה וקיבל ball='client'.
-- שתי תקלות באותה שורה:
--   · הנעילה סופית בפועל: ההורה (ההרשמה) כבר completed, ולכן
--     unlock_dependent_steps לעולם לא ירוץ עליו שוב. השלב תקוע נעול.
--   · הבעלות סותרת את מיגרציה 106: החיבור הוא עבודה של המשרד, לא של הלקוח.
-- הפונקציה פשוט לא עודכנה כשהבעלות התהפכה ב-106.
--
-- ‼ תיקון נקודתי לשתי פקודות UPDATE בגוף החי, ולא שכתוב של פונקציה שכל שאר
-- ענפיה תקינים. השומר מוודא שההחלפה קרתה, וניתן להריץ שוב בלי נזק.
do $migration$
declare
  v_src text;
  v_new text;
begin
  select pg_get_functiondef(p.oid) into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'set_paperless_path';
  if v_src is null then
    raise exception 'set_paperless_path לא נמצאה';
  end if;

  if v_src like '%-- 114: הבעלות של שלב החיבור%' then
    raise notice 'set_paperless_path כבר מתוקנת — מדלגים';
    return;
  end if;

  -- (1) מסלול "כבר בפייפרלס": החיבור הוא של המשרד בשני המקרים.
  v_new := replace(v_src,
    $old$          ball = case when p_paperless_status = 'other_rep' then 'me' else 'client' end$old$,
    $new$          -- 114: הבעלות של שלב החיבור היא של המשרד בכל מסלול —
          -- שם מזינים את פרטי האשראי שפייפרלס מבקשת (ראה מיגרציה 106).
          ball = 'me'$new$);
  if v_new = v_src then
    raise exception 'ענף other_rep/self לא נמצא בהגדרה החיה — לא מיישמים חלקית';
  end if;
  v_src := v_new;

  -- (2) מסלול הרשמה רגיל: לא לנעול שלב שההרשמה שלו כבר הושלמה.
  v_new := replace(v_src,
    $old$    update public.onboarding_steps
      set status = 'locked', ball = 'client', payload = payload - 'skipReason'
      where id = v_conn.id and status in ('pending','locked','skipped');$old$,
    $new$    update public.onboarding_steps
      set status = case
                     when v_invite.id is null then 'locked'
                     when v_invite.status in ('completed','verified','skipped') then 'pending'
                     else 'locked' end,
          ball = 'me', payload = payload - 'skipReason'
      where id = v_conn.id and status in ('pending','locked','skipped');$new$);
  if v_new = v_src then
    raise exception 'ענף ההרשמה הרגיל לא נמצא בהגדרה החיה — לא מיישמים חלקית';
  end if;

  execute v_new;
end
$migration$;

-- שורות שכבר נתקעו נעולות אף שההרשמה הושלמה — משחררים אותן פעם אחת.
update public.onboarding_steps conn
   set status = 'pending', ball = 'me'
 where conn.step_type = 'paperless_connection'
   and conn.status = 'locked'
   and exists (
     select 1 from public.onboarding_steps inv
      where inv.client_id = conn.client_id
        and inv.step_type = 'paperless_invite'
        and inv.status in ('completed','verified','skipped'));

-- ── ה. מילוי-לאחור ──────────────────────────────────────────────────────────
-- ‼ שלב הרשאה פתוח שכבר סומן "ההרשאה נוצרה" אצל גיא ממשיך משם בדיוק: השדה
-- authorizationCreatedAt כבר קיים עליו (מיגרציה 103), והמסך החדש קורא אותו.
-- אין מה לשנות בשורות קיימות — ולכן אין כאן UPDATE. השדות החדשים
-- (cardEnteredAt, retainerChargedAt) נולדים ריקים, וזה המצב הנכון: איש לא
-- אישר עדיין שהכרטיס הוזן ואיש לא חייב עדיין ריטיינר.
