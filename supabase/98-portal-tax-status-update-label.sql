-- ─── 98: תיקון ניסוח — "עדכון סטטוס מיסויי" בדף הלקוח ───────────────────────
-- ‼ סטייה שהתגלתה בבדיקת דפדפן אמיתית מול המסך המאוחד: תיק מס כבר משתמש
-- ב"עדכן סטטוס מיסויי" (830ec4c), אבל build_client_portal עדיין החזיר ללקוח
-- את הניסוח הישן "שאלון פתיחת התיק" לאותה פעולה בדיוק. תיקון מילולי בלבד —
-- אותו step_type, אותו מנגנון, רק שני מחרוזות טקסט.

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
    order by coalesce(st.sort_order, 0), st.created_at
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

    -- ‼ תוקן: "שאלון פתיחת התיק" → "עדכון סטטוס מיסויי" — אותו step_type,
    -- אותו טוקן, אותו מנגנון. רק הניסוח שהלקוח רואה, כדי שיתאים למה שכבר
    -- קיים ב"תיק מס" (830ec4c) ובאב-טיפוס המאוחד המאושר.
    when 'intake_questionnaire' then
      if s.status in ('completed', 'verified') then
        v_items := v_items || jsonb_build_object('bucket','done','key','intake','label','עדכון סטטוס מיסויי');
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
