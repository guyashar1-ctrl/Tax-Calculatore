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
begin
  select * into c from public.clients where portal_token = p_token limit 1;
  if c.id is null then return jsonb_build_object('ok', false, 'error', 'invalid'); end if;
  select * into p from public.profiles where id = c.user_id;
  v_first := split_part(trim(coalesce(c.first_name, '')), ' ', 1);
  v_invite_url := nullif(trim(coalesce(p.settings->'paperless'->>'inviteUrl', '')), '');

  v_has_eng := exists (select 1 from public.engagements e where e.client_id = c.id);

  -- ההצעה האחרונה שרלוונטית ללקוח. לפני החתימה היא כל מה שיש לו בדף,
  -- ואחריה היא ההוכחה שהתהליך התחיל.
  select * into quo from public.quotations q
    where q.client_id = c.id and q.status <> 'draft'
    order by q.updated_at desc limit 1;

  if v_has_eng then
    v_items := v_items || jsonb_build_object('bucket','done','key','quotation','label','אישור הצעת המחיר');
  elsif quo.id is not null and quo.status in ('sent','viewed') then
    v_items := v_items || jsonb_strip_nulls(jsonb_build_object(
      'bucket','action','key','quote_sign',
      'label','הצעת המחיר שלך מוכנה',
      'sub','לקריאה ולאישור — ואפשר להתחיל · כמה דקות',
      'actionKind','quote','actionValue', quo.public_token));
  elsif quo.id is not null and quo.status = 'approved' then
    v_items := v_items || jsonb_build_object('bucket','done','key','quotation','label','אישור הצעת המחיר');
    v_items := v_items || jsonb_build_object('bucket','office','key','quote_processing',
      'label','אנחנו מכינים את המשך התהליך','sub','נעדכן אותך כאן ברגע שיהיה מה לעשות');
  elsif quo.id is not null and quo.status in ('expired','cancelled') then
    v_items := v_items || jsonb_build_object('bucket','office','key','quote_expired',
      'label','הצעת המחיר כבר לא בתוקף','sub','נשמח לחדש אותה — דברו איתנו');
  end if;

  select * into req from public.representation_requests
    where linked_client_id = c.id order by created_at desc limit 1;

  for s in
    select * from public.onboarding_steps st
    where st.client_id = c.id and st.status <> 'cancelled'
    order by st.created_at
  loop
    case s.step_type

    when 'representation' then
      if req.id is null then
        continue;
      elsif req.status = 'pending_fill' then
        v_items := v_items || jsonb_strip_nulls(jsonb_build_object('bucket','action','key','rep_fill','label','מילוי פרטים וייפוי כוח','sub','הפרטים שנדרשים כדי לייצג אותך מול רשויות המס · כמה דקות','actionKind','onboard','actionValue', req.onboarding_token));
      elsif req.status = 'pending_signature' then
        select x->>'signToken' into v_sign_token
          from jsonb_array_elements(coalesce(req.signers, '[]'::jsonb)) x
          where x->>'role' = 'client' and x->>'signStatus' = 'pending' limit 1;
        select exists (
          select 1 from jsonb_array_elements(coalesce(req.signers, '[]'::jsonb)) x
          where x->>'role' = 'spouse' and x->>'signStatus' = 'pending')
          into v_spouse_pending;
        if v_sign_token is not null then
          v_items := v_items || jsonb_strip_nulls(jsonb_build_object('bucket','action','key','rep_sign','label','חתימה על ייפוי הכוח','sub','הטופס מוכן — נשארה חתימה · כדקה','actionKind','sign','actionValue', v_sign_token));
        elsif v_spouse_pending then
          v_items := v_items || jsonb_build_object('bucket','office','key','rep_sign_spouse','label','חתימת בן/בת הזוג על ייפוי הכוח','sub','קישור חתימה אישי נשלח במייל נפרד');
        end if;
      elsif req.status in ('awaiting_accountant', 'awaiting_stamp') then
        v_items := v_items || jsonb_build_object('bucket','office','key','rep_office','label','ייפוי הכוח בבדיקה ובחתימה אצלנו');
      elsif req.status = 'awaiting_authorities' then
        v_items := v_items || jsonb_build_object('bucket','office','key','rep_authorities','label','ייפוי הכוח הוגש לרשויות המס','sub','נעדכן ברגע שהייצוג יאושר');
      elsif req.status = 'active' then
        v_items := v_items || jsonb_build_object('bucket','done','key','rep_done','label','הייצוג מול רשויות המס אושר');
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
        v_items := v_items || jsonb_build_object('bucket','office','key','paperless_transfer','label','העברת חשבון הפייפרלס אלינו','sub','אנחנו מושכים את החשבון מהמייצג הקודם — אין צורך בפעולה שלך');
      elsif coalesce(s.payload->>'paperlessStatus', '') = 'self' then
        v_items := v_items || jsonb_build_object('bucket','action','key','paperless_link','label','קישור חשבון הפייפרלס למשרד','sub','בחשבון הפייפרלס שלך: הוסיפו את המשרד כמייצג');
      elsif v_invite_url is not null then
        v_items := v_items || jsonb_strip_nulls(jsonb_build_object('bucket','action','key','paperless_open','label','פתיחת חשבון פייפרלס','sub','המערכת שדרכה נעבוד יחד — צילום קבלות מהטלפון · כדקה','actionKind','external','actionValue', v_invite_url));
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
          'label','אישור הרשאת התשלום החודשי',
          'sub','הסכום שסוכם בהצעה, כהרשאה קבועה · פחות מדקה',
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

  if v_prev_open then
    v_items := v_items || jsonb_build_object('bucket','office','key','prev_accountant','label','קבלת החומרים מרואה החשבון הקודם','sub','ביקשנו את התיק — בתהליך');
  elsif v_prev_done then
    v_items := v_items || jsonb_build_object('bucket','done','key','prev_accountant','label','החומרים מרואה החשבון הקודם התקבלו');
  end if;

  select count(*) filter (where x->>'bucket' = 'done'),
         count(*) filter (where x->>'bucket' <> 'future')
    into v_done, v_total
    from jsonb_array_elements(v_items) x;

  -- תחנת המסע. חייבת להיגזר מאותם נתונים שמזינים את הרשימה, אחרת הפס
  -- למעלה יגיד דבר אחד והרשימה מתחתיו דבר אחר.
  if not v_has_eng then
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
$function$
