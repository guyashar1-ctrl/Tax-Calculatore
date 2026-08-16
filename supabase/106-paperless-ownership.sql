-- ─── 106: פייפרלס — בעלות נכונה על שלושת השלבים ─────────────────────────────
-- הכרעת גיא (2026-08-16). עד היום שלב ההרשמה לא הגיע ללקוח בכלל, ושלב החיבור
-- הוצג לו ככפתור יוצא לפייפרלס בלי שום דרך לומר "נרשמתי" — ולכן הרו״ח היה
-- צריך לנחש מתי הלקוח סיים. הבעלות מתהפכת ונעשית מפורשת:
--
--   1. paperless_invite       → הלקוח.  "הרשמה לפייפרלס", עם קישור ההרשמה
--                                וכפתור "נרשמתי לפייפרלס" בדף האישי.
--   2. paperless_connection   → המשרד.  "חיבור לפייפרלס" — נכנסים לחשבון
--                                ומשלימים (שם פייפרלס מבקשת את פרטי האשראי).
--                                הלקוח רואה "בטיפול המשרד" ובלי שום פקד.
--   3. retainer_authorization → נפתחת אחרי (2). ללא שינוי.
--
-- ‼ אין כאן מנוע שני ואין מצב חדש: הבעלות היא עמודת ball הקיימת, הפתיחה היא
-- unlock_dependent_steps הקיימת, וההשלמה של הלקוח היא portal_submit_step
-- הקיימת — רק שרשימת ההיתר שלה נפתחת גם ל-paperless_invite.
--
-- ארבעה חלקים: (א) גזירת הדף ללקוח, (ב) היתר ההשלמה של הלקוח,
-- (ג) המרכיב שיוצר את השלבים מהצעת מחיר, (ד) מילוי-לאחור לשורות קיימות.

-- ── א. build_client_portal — שני ענפי הפייפרלס נכתבים מחדש ──────────────────
-- הבסיס הוא ההגדרה החיה ממיגרציה 103; כל שאר הענפים זהים לה מילה במילה.
create or replace function public.build_client_portal(p_client_id text, p_mode text)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
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
        v_rep_item := jsonb_build_object('bucket','office','key','rep_sign_spouse','label','ייפוי הכוח','sub','ממתינים לחתימת בן/בת הזוג — קישור אישי נשלח במייל נפרד');
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

      if s.status in ('completed','verified','skipped') then
        v_items := v_items || jsonb_build_object('bucket','done','key','custom_'||s.id,'label', v_label);
      elsif s.status = 'locked' then
        v_items := v_items || jsonb_strip_nulls(jsonb_build_object(
          'bucket','future','key','custom_'||s.id,'label', v_label,
          'sub', coalesce(public.portal_lock_reason(s.id), nullif(s.payload->>'clientSub',''))));
      else
        v_items := v_items || jsonb_strip_nulls(jsonb_build_object(
          'bucket','action','key','custom_'||s.id,'label', v_label,
          'sub', case when coalesce(v_rq_total,0) > 1
                      then v_rq_done || ' מתוך ' || v_rq_total || ' הושלמו'
                      else nullif(s.payload->>'clientSub','') end,
          'actionKind','portal','actionValue', s.id,
          'kind','custom',
          'cta', nullif(s.payload->>'clientCta',''),
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
          'cta','קישרתי את המשרד'));
      else
        v_items := v_items || jsonb_strip_nulls(jsonb_build_object(
          'bucket','action','key','paperless_signup',
          'label', coalesce(nullif(s.payload->>'clientTitle',''), 'הרשמה לפייפרלס'),
          'sub', coalesce(nullif(s.payload->>'clientSub',''),
                          'שתי דקות, ומשם רק מצלמים קבלות מהטלפון'),
          'actionKind','portal','actionValue', s.id, 'kind','paperless_signup',
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
        v_items := v_items || jsonb_build_object('bucket','done','key','retainer','label','הרשאת התשלום החודשי הוקמה');
      elsif s.status = 'locked' then
        v_items := v_items || jsonb_build_object('bucket','future','key','retainer_future',
          'label','הרשאת התשלום החודשי',
          'sub', coalesce(public.portal_lock_reason(s.id), 'תופיע כאן אחרי חיבור הפייפרלס'));
      else
        v_items := v_items || jsonb_build_object('bucket','office','key','retainer_info',
          'label', coalesce(nullif(s.payload->>'clientTitle',''), 'החיוב החודשי'),
          'sub', 'בימים הקרובים, בפעם הבאה שתיכנס, תתבקש להזין כרטיס אשראי לחיוב החודשי שסיכמנו.');
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


revoke all on function public.build_client_portal(text, text) from public, anon, authenticated;

-- ── ב. portal_submit_step — הלקוח רשאי לאשר שנרשם ───────────────────────────
-- ‼ הרחבה של רשימת ההיתר הקיימת, לא נתיב כתיבה חדש. אותן בדיקות טוקן, אותה
-- דרישת published_at, אותה חסימה על שלב נעול — ואותה שרשרת סיום בדיוק כמו
-- ב-prev_accountant_details: השלמה, יומן, unlock_dependent_steps, והתראה
-- לרו״ח. הבסיס הוא ההגדרה החיה ממיגרציה 97.
create or replace function public.portal_submit_step(p_token text, p_step_id text, p_data jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
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

-- ── ג. generate_onboarding_steps — אותה בעלות גם ללקוח שנולד מהצעת מחיר ─────
-- ‼ עדכון נקודתי בגוף החי (שני inserts), ולא שכתוב של פונקציה בת 300 שורות
-- שאין בה שינוי אחר. השומר בסוף מוודא שהחלפה אכן קרתה — הגדרה שהשתנתה
-- בינתיים תיעצר כאן ולא תיושם חלקית.
-- ‼ ניתן להרצה חוזרת: אם ההחלפה כבר בוצעה (הרצה שנייה, או staging ואז
-- פרודקשן מאותו קובץ) — מדלגים. עוצרים רק כשגם הישן וגם החדש אינם שם,
-- כלומר ההגדרה החיה אינה מה שהמיגרציה הזאת מכירה.
do $migration$
declare
  v_src text;
  v_new text;
begin
  select pg_get_functiondef(p.oid) into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'generate_onboarding_steps';
  if v_src is null then
    raise exception 'generate_onboarding_steps לא נמצאה';
  end if;

  if v_src like '%''paperless_invite'', ''tools'', ''person'', ''pending'', ''client''%'
     and v_src like '%''paperless_connection'', ''tools'', ''person'', ''locked'', ''me''%' then
    raise notice 'generate_onboarding_steps כבר נושאת את הבעלות החדשה — מדלגים';
    return;
  end if;

  -- שלב ההרשמה עובר ללקוח, ונושא את הניסוח שהוא יראה בדף האישי.
  v_new := replace(v_src,
    $old$values (e.user_id, e.id, e.client_id, true, 'paperless_invite', 'tools', 'person', 'pending', 'me',
                jsonb_build_object('paperlessStatus', coalesce(v_client.paperless_status,'unknown'),
                                   'dataSource','unknown'))$old$,
    $new$values (e.user_id, e.id, e.client_id, true, 'paperless_invite', 'tools', 'person', 'pending', 'client',
                jsonb_build_object('paperlessStatus', coalesce(v_client.paperless_status,'unknown'),
                                   'dataSource','unknown',
                                   'clientTitle','הרשמה לפייפרלס',
                                   'clientSub','שתי דקות, ומשם רק מצלמים קבלות מהטלפון',
                                   'clientCta','נרשמתי לפייפרלס'))$new$);
  if v_new = v_src then
    raise exception 'ענף paperless_invite לא נמצא בהגדרה החיה — לא מיישמים חלקית';
  end if;
  v_src := v_new;

  -- שלב החיבור עובר למשרד, והניסוח ללקוח הופך למידע במקום לקריאה לפעולה.
  v_new := replace(v_src,
    $old$values (e.user_id, e.id, e.client_id, true, 'paperless_connection', 'tools', 'person', 'locked', 'client', v_id_invite,
                jsonb_build_object(
                  'clientTitle', 'להירשם לפייפרלס',
                  'clientSub', 'שתי דקות, ומשם רק מצלמים קבלות מהטלפון',
                  'clientCta', 'להרשמה'))$old$,
    $new$values (e.user_id, e.id, e.client_id, true, 'paperless_connection', 'tools', 'person', 'locked', 'me', v_id_invite,
                jsonb_build_object(
                  'clientTitle', 'חיבור לפייפרלס',
                  'clientSub', 'בימים הקרובים ניכנס לחשבון הפייפרלס ונשלים את החיבור. אין צורך לעשות דבר כרגע.'))$new$);
  if v_new = v_src then
    raise exception 'ענף paperless_connection לא נמצא בהגדרה החיה — לא מיישמים חלקית';
  end if;

  execute v_new;
end
$migration$;

-- ── ד. מילוי-לאחור — שורות שכבר קיימות ──────────────────────────────────────
-- ‼ רק שלבים פתוחים. שלב שכבר נסגר נושא ball='me' מרגע הסגירה, ושכתוב שלו
-- היה משנה היסטוריה בלי שום תועלת.
update public.onboarding_steps
   set ball = 'client'
 where step_type = 'paperless_invite'
   and status not in ('completed','verified','skipped','cancelled')
   and ball <> 'client';

update public.onboarding_steps
   set ball = 'me'
 where step_type = 'paperless_connection'
   and status not in ('completed','verified','skipped','cancelled')
   and ball <> 'me';

-- הניסוח ללקוח על שורות קיימות, בלי לדרוס ניסוח שנערך ידנית.
update public.onboarding_steps
   set payload = payload || jsonb_build_object(
         'clientTitle','הרשמה לפייפרלס',
         'clientSub','שתי דקות, ומשם רק מצלמים קבלות מהטלפון',
         'clientCta','נרשמתי לפייפרלס')
 where step_type = 'paperless_invite'
   and status not in ('completed','verified','skipped','cancelled')
   and coalesce(payload->>'clientTitle','') = '';

update public.onboarding_steps
   set payload = payload || jsonb_build_object(
         'clientTitle','חיבור לפייפרלס',
         'clientSub','בימים הקרובים ניכנס לחשבון הפייפרלס ונשלים את החיבור. אין צורך לעשות דבר כרגע.')
     - 'clientCta'
 where step_type = 'paperless_connection'
   and status not in ('completed','verified','skipped','cancelled')
   and coalesce(payload->>'clientTitle','') in ('', 'להירשם לפייפרלס');
