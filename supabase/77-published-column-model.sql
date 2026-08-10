-- 77 — מצב הפרסום של בקשה עובר ממוסכמת-jsonb לעמודות אמיתיות
--
-- עד היום "טיוטה" סומנה ב-payload.published='false', וההיעדר של המפתח פירושו
-- "מפורסם" (opt-out). מהיום מקור האמת הוא עמודה: published_at (null = טיוטה),
-- ובנוסף draft_payload — שכבת עריכה עתידית לבקשה שכבר פורסמה (מהלך "מרכז
-- התיק": עריכות נכתבות ל-draft_payload, והפרסום מעתיק אותן ל-payload —
-- כך עריכה פנימית לעולם לא משנה את מה שהלקוח רואה עד "עדכן את דף הלקוח").
--
-- כללי המעבר:
-- 1. ברירת המחדל של העמודה היא now() — כל מסלולי היצירה הקיימים שאינם עוברים
--    כאן (generate_onboarding_steps, set_paperless_path,
--    sync_representation_upgrade_step) ממשיכים להתנהג בדיוק כמו היום: השלבים
--    נולדים "מפורסמים" ושער הפרסום של התהליך (process_published_at) הוא
--    שמסתיר אותם עד הפתיחה. מדיניות "נולד כטיוטה" נאכפת בשכבת ה-RPC של
--    העריכה, לא בברירת המחדל של העמודה.
-- 2. במעבר נשמרת מראה כפולה: create/publish ממשיכים לתחזק גם את
--    payload.published, כי ה-UI הקיים (תג "טיוטה") ופונקציית ההעלאה
--    portal-upload-document עדיין קוראים אותו. האינווריאנט:
--    published_at is null ⇔ payload->>'published'='false'.
-- 3. הפונקציות הציבוריות (get_client_portal, portal_submit_step) עוברות
--    לקרוא את העמודה — ההתנהגות זהה בזכות המילוי-לאחור.
--
-- ההגדרות שנדרסו שמורות ב-supabase/live-2026-08-09/.

-- ── 1. עמודות ────────────────────────────────────────────────────────────────

alter table public.onboarding_steps
  add column if not exists published_at timestamptz default now(),
  add column if not exists draft_payload jsonb;

comment on column public.onboarding_steps.published_at is
  'null = טיוטה שהלקוח אינו רואה. מקור האמת לפרסום פר-בקשה (מיגרציה 77); payload.published נשמר כמראה זמנית ל-UI ולפונקציית ההעלאה.';
comment on column public.onboarding_steps.draft_payload is
  'עריכות ממתינות לבקשה שכבר פורסמה — הלקוח ממשיך לראות את payload עד שהרו"ח מפרסם את שינויי התיק. null = אין שינויים ממתינים.';

-- ── 2. מילוי-לאחור לפי המוסכמה הקיימת ────────────────────────────────────────

update public.onboarding_steps
   set published_at = case when coalesce(payload->>'published','true') <> 'false'
                           then created_at
                           else null end;

-- ── 3. get_client_portal — הסינון עובר לעמודה (שינוי שורה אחת) ───────────────

CREATE OR REPLACE FUNCTION public.get_client_portal(p_token text)
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
begin
  select * into c from public.clients where portal_token = p_token limit 1;
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
      and st.published_at is not null
      and (v_published or st.step_type = 'representation')
    order by coalesce(st.sort_order, 0), st.created_at
  loop
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
      select count(*) filter (where (x->>'done')::boolean), count(*)
        into v_rq_done, v_rq_total
        from jsonb_array_elements(v_reqs) x;
      v_label := coalesce(nullif(s.payload->>'clientTitle',''), 'בקשה מהמשרד');

      if s.status in ('completed','verified','skipped') then
        v_items := v_items || jsonb_build_object('bucket','done','key','custom_'||s.id,'label', v_label);
      elsif s.status = 'locked' then
        v_items := v_items || jsonb_strip_nulls(jsonb_build_object(
          'bucket','future','key','custom_'||s.id,'label', v_label,
          'sub', nullif(s.payload->>'clientSub','')));
      else
        v_items := v_items || jsonb_strip_nulls(jsonb_build_object(
          'bucket','action','key','custom_'||s.id,'label', v_label,
          'sub', case when coalesce(v_rq_total,0) > 1
                      then v_rq_done || ' מתוך ' || v_rq_total || ' הושלמו'
                      else nullif(s.payload->>'clientSub','') end,
          'actionKind','portal','actionValue', s.id,
          'kind','custom',
          'cta', nullif(s.payload->>'clientCta',''),
          'canUpload', exists (select 1 from jsonb_array_elements(v_reqs) x where x->>'kind' = 'file'),
          'requirements', (select jsonb_agg(jsonb_build_object(
                              'key', x->>'key', 'kind', x->>'kind', 'label', x->>'label',
                              'done', coalesce((x->>'done')::boolean, false),
                              'value', x->>'value') order by ord)
                            from jsonb_array_elements(v_reqs) with ordinality t(x, ord))));
      end if;

    when 'prev_accountant_details' then
      if s.status in ('completed','verified','skipped') then
        v_items := v_items || jsonb_build_object('bucket','done','key','prev_details',
          'label', coalesce(nullif(s.payload->>'clientTitle',''), 'פרטי רואה החשבון הקודם'));
      else
        v_items := v_items || jsonb_strip_nulls(jsonb_build_object(
          'bucket','action','key','prev_details',
          'label', coalesce(nullif(s.payload->>'clientTitle',''), 'פרטי רואה החשבון הקודם שלך'),
          'sub', coalesce(nullif(s.payload->>'clientSub',''), 'שם, אימייל וטלפון — כדי שנפנה אליו בשמך'),
          'actionKind','portal','actionValue', s.id, 'kind','prev_accountant'));
      end if;

    when 'paperless_invite' then
      continue;

    when 'paperless_connection' then
      if coalesce(s.payload->>'paperlessStatus', '') = 'not_applicable' then
        continue;
      elsif s.status in ('completed', 'verified') or
            (s.status = 'skipped' and coalesce(s.payload->>'skipReason','') in ('already_connected','transferred_rep')) then
        v_items := v_items || jsonb_build_object('bucket','done','key','paperless','label','חיבור לפייפרלס');
      elsif coalesce(s.payload->>'paperlessStatus', '') = 'other_rep' then
        v_items := v_items || jsonb_build_object('bucket','office','key','paperless_transfer','label','העברת חשבון הפייפרלס אלינו','sub','אנחנו מושכים את החשבון מהמייצג הקודם');
      elsif coalesce(s.payload->>'paperlessStatus', '') = 'self' then
        v_items := v_items || jsonb_build_object('bucket','action','key','paperless_link','label','קישור חשבון הפייפרלס למשרד','sub','בחשבון הפייפרלס שלך: הוסיפו את המשרד כמייצג');
      elsif v_invite_url is not null then
        v_items := v_items || jsonb_strip_nulls(jsonb_build_object('bucket','action','key','paperless_open',
          'label', coalesce(nullif(s.payload->>'clientTitle',''), 'פתיחת חשבון פייפרלס'),
          'sub', coalesce(nullif(s.payload->>'clientSub',''), 'המערכת שדרכה נעבוד יחד — צילום קבלות מהטלפון · כדקה'),
          'actionKind','external','actionValue', v_invite_url));
      else
        v_items := v_items || jsonb_build_object('bucket','office','key','paperless_soon','label','חיבור לפייפרלס','sub','נשלח לך הזמנה בהמשך');
      end if;

    when 'retainer_authorization' then
      if coalesce(s.payload->>'method', '') = 'manual_arrangement' then
        continue;
      elsif s.status in ('completed', 'verified') then
        v_items := v_items || jsonb_build_object('bucket','done','key','retainer','label','הרשאת התשלום החודשי הוקמה');
      elsif s.status = 'locked' then
        v_items := v_items || jsonb_build_object('bucket','future','key','retainer_future','label','הרשאת התשלום החודשי','sub','תופיע כאן אחרי חיבור הפייפרלס');
      elsif nullif(trim(coalesce(s.payload->>'authUrl', '')), '') is not null then
        v_items := v_items || jsonb_build_object('bucket','action','key','retainer_auth',
          'label', coalesce(nullif(s.payload->>'clientTitle',''), 'אישור הרשאת התשלום החודשי'),
          'sub', coalesce(nullif(s.payload->>'clientSub',''), 'הסכום שסוכם בהצעה, כהרשאה קבועה · פחות מדקה'),
          'actionKind','external','actionValue', trim(s.payload->>'authUrl'));
      end if;

    when 'intake_questionnaire' then
      if s.status in ('completed', 'verified') then
        v_items := v_items || jsonb_build_object('bucket','done','key','intake','label','שאלון פתיחת התיק');
      elsif s.status = 'waiting_client' and c.intake_token is not null then
        v_items := v_items || jsonb_strip_nulls(jsonb_build_object('bucket','action','key','intake_fill','label','שאלון פתיחת התיק','sub','עונים רק על מה שרלוונטי · אפשר לעצור ולהמשיך','actionKind','intake','actionValue', c.intake_token));
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
  end loop;

  if not v_rep_seen and v_rep_item is not null then
    v_items := v_items || v_rep_item;
  end if;

  if v_prev_open then
    v_items := v_items || jsonb_build_object('bucket','office','key','prev_accountant','label','קבלת החומרים מרואה החשבון הקודם','sub','ביקשנו את התיק — בתהליך');
  elsif v_prev_done then
    v_items := v_items || jsonb_build_object('bucket','done','key','prev_accountant','label','החומרים מרואה החשבון הקודם התקבלו');
  end if;

  if v_has_eng and not v_published then
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

-- ── 4. portal_submit_step — בדיקת הטיוטה עוברת לעמודה ────────────────────────

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
  v_reqs  jsonb;
  v_found boolean := false;
  v_open  int;
  v_label text;
  v_client_name text;
begin
  select * into c from public.clients where portal_token = p_token limit 1;
  if c.id is null then return jsonb_build_object('ok', false, 'error', 'invalid'); end if;

  select * into s from public.onboarding_steps where id = p_step_id and client_id = c.id;
  if s.id is null then return jsonb_build_object('ok', false, 'error', 'step_not_found'); end if;
  if s.status in ('completed','verified','skipped','cancelled') then
    return jsonb_build_object('ok', true, 'noop', true);
  end if;
  -- בקשה שהרו"ח עוד לא פתח ללקוח אינה קיימת מבחינתו, גם אם ניחש מזהה.
  if s.published_at is null then
    return jsonb_build_object('ok', false, 'error', 'not_published');
  end if;
  if s.status = 'locked' then
    return jsonb_build_object('ok', false, 'error', 'locked');
  end if;
  -- רשימה סגורה ומפורשת. כל סוג אחר נסגר רק ביד של הרו"ח.
  if s.step_type not in ('prev_accountant_details', 'custom_request') then
    return jsonb_build_object('ok', false, 'error', 'not_client_editable');
  end if;

  v_client_name := nullif(trim(coalesce(c.first_name,'') || ' ' || coalesce(c.last_name,'')), '');

  -- ── בקשה חופשית: אישור קריאה או תשובת טקסט ────────────────────────────────
  if s.step_type = 'custom_request' then
    v_key := nullif(trim(coalesce(p_data->>'key','')), '');
    if v_key is null then return jsonb_build_object('ok', false, 'error', 'missing_key'); end if;
    v_val := nullif(trim(coalesce(p_data->>'value','')), '');

    v_reqs := coalesce(s.payload->'requirements', '[]'::jsonb);
    select jsonb_agg(
             case when x->>'key' = v_key and x->>'kind' in ('confirm','text')
                  then x || jsonb_build_object('done', true)
                         || case when v_val is not null then jsonb_build_object('value', v_val) else '{}'::jsonb end
                         || jsonb_build_object('doneAt', to_jsonb(now()))
                  else x end order by ord)
      into v_reqs
      from jsonb_array_elements(v_reqs) with ordinality t(x, ord);

    select exists (select 1 from jsonb_array_elements(v_reqs) x
                   where x->>'key' = v_key and x->>'kind' in ('confirm','text'))
      into v_found;
    if not v_found then return jsonb_build_object('ok', false, 'error', 'requirement_not_found'); end if;

    -- דרישת טקסט בלי תשובה אינה השלמה.
    if v_val is null and exists (select 1 from jsonb_array_elements(v_reqs) x
                                 where x->>'key' = v_key and x->>'kind' = 'text') then
      return jsonb_build_object('ok', false, 'error', 'missing_value');
    end if;

    select count(*) into v_open from jsonb_array_elements(v_reqs) x
      where not coalesce((x->>'done')::boolean, false);

    select x->>'label' into v_label from jsonb_array_elements(v_reqs) x where x->>'key' = v_key;

    update public.onboarding_steps
       set payload = payload || jsonb_build_object('requirements', v_reqs),
           -- נסגר רק כשכל הדרישות מולאו; אחרת ממשיך להמתין ללקוח.
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
      -- ההתראה נרשמת רק כשהבקשה כולה נסגרה. פריט בודד מתוך חמישה אינו אירוע.
      perform public.queue_accountant_notification(
        s.user_id, 'client_request_completed', c.id, s.id, null, null,
        jsonb_build_object(
          'clientName', v_client_name,
          'requestTitle', coalesce(nullif(s.payload->>'clientTitle',''), 'בקשה מהמשרד'),
          'lastItem', coalesce(v_label, v_key)));
    end if;

    return jsonb_build_object('ok', true, 'remaining', v_open, 'completed', v_open = 0);
  end if;

  -- ── פרטי הרו"ח הקודם ──────────────────────────────────────────────────────
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

-- ── 5. create_onboarding_request — כותב את העמודה ומתחזק את המראה ───────────

CREATE OR REPLACE FUNCTION public.create_onboarding_request(p_client_id text, p_step_type text, p_payload jsonb DEFAULT '{}'::jsonb, p_due_date date DEFAULT NULL::date, p_depends_on text DEFAULT NULL::text, p_published boolean DEFAULT true, p_required_for_close boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  c      public.clients%rowtype;
  v_uid  uuid := auth.uid();
  v_eng  text;
  v_id   text;
  v_ball text;
  v_next int;
  v_dep  public.onboarding_steps%rowtype;
  v_status text := 'pending';
begin
  select * into c from public.clients where id = p_client_id;
  if c.id is null then return jsonb_build_object('ok', false, 'error', 'client_not_found'); end if;
  if v_uid is null or c.user_id <> v_uid then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;

  -- רשימה סגורה. שלב הייצוג לא נוצר ידנית — הוא מסונכרן מבקשת הייצוג.
  if p_step_type not in ('client_documents','prev_accountant_details','custom_request',
                         'paperless_invite','paperless_connection','retainer_authorization',
                         'release_letter','materials_received','file_opening',
                         'intake_questionnaire','kyc_identification','internal_setup') then
    return jsonb_build_object('ok', false, 'error', 'step_type_not_allowed');
  end if;

  -- בקשה חופשית בלי דרישות אינה בקשה — אין ללקוח מה לעשות בה.
  if p_step_type = 'custom_request'
     and coalesce(jsonb_array_length(p_payload->'requirements'), 0) = 0 then
    return jsonb_build_object('ok', false, 'error', 'no_requirements');
  end if;

  select id into v_eng from public.engagements
   where client_id = c.id and status = 'onboarding' order by created_at desc limit 1;
  if v_eng is null then
    select id into v_eng from public.engagements where client_id = c.id order by created_at desc limit 1;
  end if;

  v_ball := case when p_step_type in ('client_documents','prev_accountant_details','custom_request')
                 then 'client' else 'me' end;

  if p_depends_on is not null then
    select * into v_dep from public.onboarding_steps where id = p_depends_on and client_id = c.id;
    if v_dep.id is null then return jsonb_build_object('ok', false, 'error', 'dependency_not_found'); end if;
    -- תלות שכבר הושלמה אינה נועלת — אחרת השלב נולד נעול לנצח.
    if v_dep.status not in ('completed','verified','skipped') then v_status := 'locked'; end if;
  end if;

  select coalesce(max(sort_order), 0) + 10 into v_next
    from public.onboarding_steps where client_id = c.id;

  insert into public.onboarding_steps
    (user_id, engagement_id, client_id, step_type, track, scope, status, ball,
     depends_on_step_id, due_date, sort_order, payload, required_for_close, published_at)
  values
    (c.user_id, v_eng, c.id, p_step_type, public.onboarding_track_for(p_step_type), 'person',
     v_status, v_ball, p_depends_on, p_due_date, v_next,
     coalesce(p_payload, '{}'::jsonb)
       || case when p_published then '{}'::jsonb else jsonb_build_object('published', false) end,
     coalesce(p_required_for_close, true),
     -- מקור האמת החדש; payload.published נשמר במקביל עד שכל הקוראים יעברו לעמודה.
     case when p_published then now() else null end)
  returning id into v_id;

  perform public.log_onboarding_event(c.user_id, v_id, v_eng, 'created', 'accountant',
    case when p_published then 'נוספה בקשה' else 'נוספה בקשה כטיוטה' end,
    jsonb_build_object('stepType', p_step_type,
                       'requiredForClose', coalesce(p_required_for_close, true)));

  return jsonb_build_object('ok', true, 'stepId', v_id, 'status', v_status);
end;
$function$;

-- ── 6. publish_onboarding_request — מפרסם דרך העמודה ─────────────────────────

CREATE OR REPLACE FUNCTION public.publish_onboarding_request(p_step_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  s     public.onboarding_steps%rowtype;
  v_uid uuid := auth.uid();
begin
  select * into s from public.onboarding_steps where id = p_step_id;
  if s.id is null then return jsonb_build_object('ok', false, 'error', 'step_not_found'); end if;
  if v_uid is null or s.user_id <> v_uid then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;
  if s.published_at is not null then
    return jsonb_build_object('ok', true, 'noop', true);
  end if;

  update public.onboarding_steps
     set published_at = now(),
         payload = payload - 'published'
   where id = s.id;

  perform public.log_onboarding_event(s.user_id, s.id, s.engagement_id, 'status_changed', 'accountant',
    'הבקשה נפתחה ללקוח', jsonb_build_object('published', true));

  return jsonb_build_object('ok', true);
end;
$function$;

-- ── 7. add_intake_questionnaire_step — השאלון ממשיך להיוולד כטיוטה ──────────

CREATE OR REPLACE FUNCTION public.add_intake_questionnaire_step(p_engagement_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  e public.engagements%rowtype;
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

  insert into public.onboarding_steps (
    user_id, engagement_id, client_id, step_type, track, scope, status, ball,
    required_for_close, payload, published_at)
  values (
    e.user_id, e.id, e.client_id, 'intake_questionnaire', 'internal', 'person', 'pending', 'me',
    -- תזכורת אופציונלית בסוף הקליטה, לא תנאי לסגירתה.
    false,
    -- טיוטה: הלקוח אינו רואה אותה עד שהרו"ח פותח אותה במפורש.
    jsonb_build_object('published', false),
    null)
  returning id into v_id;

  return jsonb_build_object('ok', true, 'existed', false, 'stepId', v_id);
end;
$function$;

-- ── 8. אימות האינווריאנט אחרי המילוי-לאחור ───────────────────────────────────

do $$
declare v_bad int;
begin
  select count(*) into v_bad
    from public.onboarding_steps
   where (published_at is null) <> (coalesce(payload->>'published','true') = 'false');
  if v_bad > 0 then
    raise exception 'מיגרציה 77: % שורות מפרות את האינווריאנט published_at ⇔ payload.published', v_bad;
  end if;
end $$;
