-- החזרה של 251: גופי 247 המקוריים (בייט-בבייט מתוך supabase/247-smart-client-forms.sql), בלי _scf_missing.
-- ‼ נתונים שנשמרו עם המפתחות החדשים (industry, openDate, propExists, dealerKind) נשארים; 247 פשוט מתעלמת מהם.
--   הגשה שנעולה עם openDate בלבד (בלי openMonth) תיחשב אחרי החזרה כחסרת openMonth — ראה הערת השחרור.

create or replace function public._scf_spec(p_key text)
returns jsonb language sql immutable set search_path to 'public' as $$
  select case p_key
    when 'ita-4440' then jsonb_build_object(
      'card', jsonb_build_array('firstName', 'lastName', 'idNumber', 'gender', 'mobile',
                                'homeStreet', 'homeHouse', 'homeCity', 'homeZip',
                                'spouseFirstName', 'spouseLastName', 'spouseIdNumber', 'spousePhone', 'taxOffice'),
      'filing', jsonb_build_array('marriageDate', 'separationDate', 'spouseAddress', 'incomeYear',
                                  'incSalary', 'incBusiness', 'incOther', 'incOtherText',
                                  'spIncSalary', 'spIncBusiness', 'spIncOther', 'spIncOtherText'),
      'required', jsonb_build_array('firstName', 'lastName', 'idNumber', 'gender', 'spouseFirstName', 'spouseLastName',
                                    'spouseIdNumber', 'marriageDate', 'separationDate', 'spouseAddress', 'homeStreet', 'homeCity'))
    when 'vat-821' then jsonb_build_object(
      'card', jsonb_build_array('firstName', 'lastName', 'idNumber', 'mobile', 'landline',
                                'homeStreet', 'homeHouse', 'homeCity', 'homeZip',
                                'mailStreet', 'mailHouse', 'mailCity', 'mailZip',
                                'businessName', 'activity', 'bizStreet', 'bizHouse', 'bizCity', 'bizZip', 'bizPhone',
                                'bankCode', 'bankName', 'bankBranch', 'bankAccount'),
      'filing', jsonb_build_array('mailSame', 'bizAtHome', 'openMonth', 'turnover', 'employees',
                                  'propKind', 'propKindOther', 'propTenure', 'propParty', 'propValue', 'propRent'),
      'required', jsonb_build_array('firstName', 'lastName', 'idNumber', 'homeStreet', 'homeCity', 'businessName', 'activity',
                                    'bizStreet', 'bizCity', 'openMonth', 'turnover', 'employees',
                                    'bankCode', 'bankBranch', 'bankAccount', 'propKind', 'propTenure'))
    else null end;
$$;

create or replace function public._scf_card(c public.clients)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare
  a record;
  b jsonb; bi int := public._scf_business_index(c);
  k jsonb; ki int := public._scf_bank_index(c);
  mail jsonb := case when jsonb_typeof(c.mailing_address) = 'object' then c.mailing_address end;
  sp jsonb := case when jsonb_typeof(c.spouse) = 'object' then c.spouse end;
  n text;
begin
  select * into a from public._scf_split_address(c.address);
  if bi is not null then b := c.businesses->bi; end if;
  if ki is not null then k := c.bank_accounts->ki; end if;
  n := nullif(btrim(coalesce(c.zip_code, '')), '');
  return jsonb_strip_nulls(jsonb_build_object(
    'firstName', nullif(btrim(coalesce(c.first_name, '')), ''),
    'lastName', nullif(btrim(coalesce(c.last_name, '')), ''),
    'idNumber', nullif(btrim(coalesce(c.id_number, '')), ''),
    'gender', case when c.gender in ('male', 'female') then c.gender end,
    'mobile', nullif(btrim(coalesce(c.phone, '')), ''),
    'landline', nullif(btrim(coalesce(c.landline_phone, '')), ''),
    'email', nullif(btrim(coalesce(c.email, '')), ''),
    'homeStreet', a.street, 'homeHouse', a.house,
    'homeCity', nullif(btrim(coalesce(c.city, '')), ''), 'homeZip', n,
    'mailStreet', nullif(btrim(coalesce(mail->>'street', '')), ''),
    'mailHouse', nullif(btrim(coalesce(mail->>'houseNumber', '')), ''),
    'mailCity', nullif(btrim(coalesce(mail->>'city', '')), ''),
    'mailZip', nullif(btrim(coalesce(mail->>'zip', '')), ''),
    'spouseFirstName', coalesce(nullif(btrim(coalesce(c.spouse_first_name, '')), ''), nullif(btrim(coalesce(sp->>'firstName', '')), '')),
    'spouseLastName', coalesce(nullif(btrim(coalesce(c.spouse_last_name, '')), ''), nullif(btrim(coalesce(sp->>'lastName', '')), '')),
    'spouseIdNumber', coalesce(nullif(btrim(coalesce(c.spouse_id_number, '')), ''), nullif(btrim(coalesce(sp->>'idNumber', '')), '')),
    'spousePhone', coalesce(nullif(btrim(coalesce(c.spouse_phone, '')), ''), nullif(btrim(coalesce(sp->>'phone', '')), '')),
    'familyStatus', c.family_status,
    'marriageYear', c.marriage_year::text,
    'taxOffice', nullif(btrim(coalesce(c.tax_office_name, '')), ''),
    'clientType', coalesce(c.type, 'individual'),
    'businessId', b->>'id',
    'businessName', coalesce(nullif(btrim(coalesce(c.business_name, '')), ''), nullif(btrim(coalesce(b->>'name', '')), '')),
    'activity', coalesce(nullif(btrim(coalesce(b->>'description', '')), ''), nullif(btrim(coalesce(c.business_description, '')), '')),
    'bizStreet', nullif(btrim(coalesce(b->'address'->>'street', '')), ''),
    'bizHouse', nullif(btrim(coalesce(b->'address'->>'houseNumber', '')), ''),
    'bizCity', nullif(btrim(coalesce(b->'address'->>'city', '')), ''),
    'bizZip', nullif(btrim(coalesce(b->'address'->>'zip', '')), ''),
    'bizPhone', nullif(btrim(coalesce(b->'address'->>'phone', '')), ''),
    'bizStartYear', b->>'startYear',
    'bankCode', nullif(btrim(coalesce(k->>'bankCode', '')), ''),
    'bankName', nullif(btrim(coalesce(k->>'bankName', '')), ''),
    'bankBranch', nullif(btrim(coalesce(k->>'branchNumber', '')), ''),
    'bankAccount', nullif(btrim(coalesce(k->>'accountNumber', '')), '')));
end;
$$;

create or replace function public._scf_invalid(p_key text, p_val text)
returns text language plpgsql immutable set search_path to 'public' as $$
declare v text := btrim(coalesce(p_val, '')); d text;
begin
  if v = '' then return null; end if;
  if length(v) > 300 then return 'too_long'; end if;
  case
    when p_key in ('idNumber', 'spouseIdNumber') then
      if v !~ '^\d{9}$' then return 'bad_id'; end if;
    when p_key in ('mobile', 'landline', 'spousePhone', 'bizPhone') then
      d := regexp_replace(v, '[\s\-]', '', 'g');
      if d !~ '^0\d{8,9}$' then return 'bad_phone'; end if;
    when p_key in ('homeZip', 'mailZip', 'bizZip') then
      if v !~ '^\d{7}$' then return 'bad_zip'; end if;
    when p_key in ('homeStreet', 'homeCity', 'mailStreet', 'mailCity', 'bizStreet', 'bizCity', 'spouseAddress') then
      if not public.is_hebrew_only(v) then return 'hebrew_only'; end if;
    when p_key in ('homeHouse', 'mailHouse', 'bizHouse') then
      if v !~ '^[0-9א-ת/ \-]{1,12}$' then return 'bad_house'; end if;
    when p_key in ('marriageDate', 'separationDate') then
      if v !~ '^\d{4}-\d{2}-\d{2}$' then return 'bad_date'; end if;
      begin
        if v::date > (now() at time zone 'Asia/Jerusalem')::date or v::date < date '1930-01-01' then return 'bad_date'; end if;
      exception when others then return 'bad_date';
      end;
    when p_key = 'openMonth' then
      if v !~ '^\d{4}-(0[1-9]|1[0-2])$' then return 'bad_month'; end if;
    when p_key = 'incomeYear' then
      if v !~ '^\d{4}$' then return 'bad_year'; end if;
    when p_key in ('incSalary', 'incBusiness', 'incOther', 'spIncSalary', 'spIncBusiness', 'spIncOther') then
      if v <> '1' then return 'bad_choice'; end if;
    when p_key in ('turnover', 'propValue', 'propRent') then
      if v !~ '^\d{1,10}$' then return 'bad_amount'; end if;
    when p_key = 'employees' then
      if v !~ '^\d{1,3}$' or v::int < 1 then return 'bad_number'; end if;
    when p_key = 'gender' then
      if v not in ('male', 'female') then return 'bad_choice'; end if;
    when p_key = 'propKind' then
      if v not in ('store', 'office', 'lot', 'warehouse', 'other') then return 'bad_choice'; end if;
    when p_key = 'propTenure' then
      if v not in ('owned', 'rented') then return 'bad_choice'; end if;
    when p_key in ('mailSame', 'bizAtHome') then
      if v not in ('yes', 'no') then return 'bad_choice'; end if;
    when p_key = 'bankCode' then
      if v !~ '^\d{1,3}$' then return 'bad_bank'; end if;
    when p_key = 'bankBranch' then
      if v !~ '^\d{1,4}$' then return 'bad_branch'; end if;
    when p_key = 'bankAccount' then
      if v !~ '^\d{2,12}$' then return 'bad_account'; end if;
    when p_key = 'email' then
      if v !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then return 'bad_email'; end if;
    else null;
  end case;
  return null;
end;
$$;

create or replace function public._scf_apply(p_filing_id text, p_values jsonb, p_actor text)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  f public.smart_form_filings%rowtype;
  r public.smart_form_revisions%rowtype;
  c public.clients%rowtype;
  spec jsonb;
  card jsonb;
  k text; v text; e text;
  v_card_keys text[]; v_filing_keys text[];
  v_identity text[] := array['firstName', 'lastName', 'idNumber', 'gender', 'spouseFirstName', 'spouseLastName', 'spouseIdNumber'];
  v_answers jsonb;
  v_old jsonb := '{}'::jsonb; v_new jsonb := '{}'::jsonb;
  v_meta jsonb := '{}'::jsonb;
  v_meta_one jsonb;
  v_street text; v_house text; a record;
  v_mail jsonb; v_biz jsonb; v_bank jsonb;
  bi int; ki int;
  v_filing_changed text[] := '{}';
  v_unlocked boolean := false;
  v_year int;
begin
  if p_actor not in ('client', 'office') then return jsonb_build_object('ok', false, 'error', 'bad_actor'); end if;
  if jsonb_typeof(p_values) is distinct from 'object' then return jsonb_build_object('ok', false, 'error', 'bad_values'); end if;
  select * into f from public.smart_form_filings where id = p_filing_id for update;
  if f.id is null or not public._scf_is_client_form(f.template_key) then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if f.state not in ('draft', 'waiting_client_info', 'review', 'awaiting_signatures') then
    return jsonb_build_object('ok', false, 'error', 'not_editable', 'state', f.state);
  end if;
  select * into r from public.smart_form_revisions where filing_id = f.id and revision = f.current_revision for update;
  if r.state = 'signed' or exists (select 1 from jsonb_array_elements(coalesce(r.signers, '[]'::jsonb)) s where s->>'status' = 'signed') then
    return jsonb_build_object('ok', false, 'error', 'already_signed');
  end if;
  select * into c from public.clients where id = f.client_id for update;
  spec := public._scf_spec(f.template_key);
  select array_agg(x) into v_card_keys from jsonb_array_elements_text(spec->'card') x;
  select array_agg(x) into v_filing_keys from jsonb_array_elements_text(spec->'filing') x;
  card := public._scf_card(c);

  -- כל המפתחות נבדקים לפני כל כתיבה (הכול או כלום)
  for k in select jsonb_object_keys(p_values) loop
    if not (k = any(v_card_keys) or k = any(v_filing_keys)) then
      return jsonb_build_object('ok', false, 'error', 'field_not_allowed', 'field', k);
    end if;
    if jsonb_typeof(p_values->k) not in ('string', 'null') then
      return jsonb_build_object('ok', false, 'error', 'bad_value', 'field', k);
    end if;
    e := public._scf_invalid(k, p_values->>k);
    if e is not null then return jsonb_build_object('ok', false, 'error', e, 'field', k); end if;
    if k = any(v_identity) and nullif(btrim(coalesce(p_values->>k, '')), '') is not null
       and card ? k and card->>k is distinct from btrim(p_values->>k) then
      -- ‼ זהות שכבר בכרטיס אינה משתנה מהטופס — תיקון זהות רק במשרד, בכרטיס עצמו.
      return jsonb_build_object('ok', false, 'error', 'identity_in_card', 'field', k);
    end if;
  end loop;

  if r.state = 'locked' then
    update public.smart_form_revisions
       set state = 'draft', snapshot = null, content_sha256 = null, signers = '[]'::jsonb, signatures = '{}'::jsonb,
           sign_tokens = '{}'::jsonb, locked_at = null
     where id = r.id;
    v_unlocked := true;
  end if;

  -- ── הגשה ──
  v_answers := coalesce(r.values->'answers', '{}'::jsonb);
  for k in select jsonb_object_keys(p_values) loop
    if not (k = any(v_filing_keys)) then continue; end if;
    v := nullif(btrim(coalesce(p_values->>k, '')), '');
    if v is null then
      if v_answers ? k then v_answers := v_answers - k; v_filing_changed := v_filing_changed || k; end if;
    elsif v_answers->>k is distinct from v then
      v_answers := v_answers || jsonb_build_object(k, v); v_filing_changed := v_filing_changed || k;
    end if;
  end loop;
  update public.smart_form_revisions set values = coalesce(values, '{}'::jsonb) || jsonb_build_object('answers', v_answers) where id = r.id;

  -- ── כרטיס ── (‼ ריק אינו מוחק: תשובה ריקה לשדה כרטיס פשוט אינה נכתבת)
  perform set_config('pivo.change_source', case when p_actor = 'client' then 'portal' else 'office' end, true);

  -- פרטים פשוטים
  for k, v in select key, nullif(btrim(coalesce(value #>> '{}', '')), '') from jsonb_each(p_values)
               where key = any(array['firstName', 'lastName', 'idNumber', 'gender', 'mobile', 'landline', 'email',
                                     'homeCity', 'homeZip', 'spouseFirstName', 'spouseLastName', 'spouseIdNumber',
                                     'spousePhone', 'taxOffice', 'businessName'])
                 and key = any(v_card_keys) loop
    if v is null or card->>k is not distinct from v then continue; end if;
    v_old := v_old || jsonb_build_object(k, card->k);
    v_new := v_new || jsonb_build_object(k, v);
    case k
      when 'firstName' then update public.clients set first_name = v where id = c.id; v_meta_one := jsonb_build_object('firstName', null);
      when 'lastName' then update public.clients set last_name = v where id = c.id; v_meta_one := jsonb_build_object('lastName', null);
      when 'idNumber' then update public.clients set id_number = v where id = c.id; v_meta_one := jsonb_build_object('idNumber', null);
      when 'gender' then update public.clients set gender = v where id = c.id; v_meta_one := jsonb_build_object('gender', null);
      when 'mobile' then update public.clients set phone = v where id = c.id; v_meta_one := jsonb_build_object('phone', null);
      when 'landline' then update public.clients set landline_phone = v where id = c.id; v_meta_one := jsonb_build_object('landlinePhone', null);
      when 'email' then update public.clients set email = v where id = c.id; v_meta_one := jsonb_build_object('email', null);
      when 'homeCity' then update public.clients set city = v where id = c.id; v_meta_one := jsonb_build_object('city', null);
      when 'homeZip' then update public.clients set zip_code = v where id = c.id; v_meta_one := jsonb_build_object('zipCode', null);
      when 'spouseFirstName' then update public.clients set spouse_first_name = v where id = c.id; v_meta_one := jsonb_build_object('spouseFirstName', null);
      when 'spouseLastName' then update public.clients set spouse_last_name = v where id = c.id; v_meta_one := jsonb_build_object('spouseLastName', null);
      when 'spouseIdNumber' then update public.clients set spouse_id_number = v where id = c.id; v_meta_one := jsonb_build_object('spouseIdNumber', null);
      when 'spousePhone' then update public.clients set spouse_phone = v where id = c.id; v_meta_one := jsonb_build_object('spousePhone', null);
      when 'taxOffice' then update public.clients set tax_office_name = v where id = c.id; v_meta_one := jsonb_build_object('taxOfficeName', null);
      when 'businessName' then update public.clients set business_name = v where id = c.id; v_meta_one := jsonb_build_object('businessName', null);
    end case;
    v_meta := v_meta || v_meta_one;
  end loop;

  -- שם בן/בת הזוג המשורשר (תאימות) — רק כשהוא ריק
  if (v_new ? 'spouseFirstName' or v_new ? 'spouseLastName') then
    update public.clients
       set spouse_name = btrim(coalesce(spouse_first_name, '') || ' ' || coalesce(spouse_last_name, ''))
     where id = c.id and nullif(btrim(coalesce(spouse_name, '')), '') is null;
  end if;

  -- כתובת המגורים: רחוב + מספר ⇒ address
  if (p_values ? 'homeStreet' or p_values ? 'homeHouse') and 'homeStreet' = any(v_card_keys) then
    select * into a from public._scf_split_address(c.address);
    v_street := coalesce(nullif(btrim(coalesce(p_values->>'homeStreet', '')), ''), a.street);
    v_house := coalesce(nullif(btrim(coalesce(p_values->>'homeHouse', '')), ''), a.house);
    if v_street is not null and btrim(v_street || ' ' || coalesce(v_house, '')) is distinct from nullif(btrim(coalesce(c.address, '')), '') then
      v_old := v_old || jsonb_build_object('address', c.address);
      v_new := v_new || jsonb_build_object('address', btrim(v_street || ' ' || coalesce(v_house, '')));
      update public.clients set address = btrim(v_street || ' ' || coalesce(v_house, '')) where id = c.id;
      v_meta := v_meta || jsonb_build_object('address', null);
    end if;
  end if;

  -- מען למכתבים
  if exists (select 1 from jsonb_object_keys(p_values) x where x in ('mailStreet', 'mailHouse', 'mailCity', 'mailZip'))
     and 'mailStreet' = any(v_card_keys) then
    v_mail := case when jsonb_typeof(c.mailing_address) = 'object' then c.mailing_address else '{}'::jsonb end;
    v_mail := v_mail || jsonb_strip_nulls(jsonb_build_object(
      'street', nullif(btrim(coalesce(p_values->>'mailStreet', '')), ''),
      'houseNumber', nullif(btrim(coalesce(p_values->>'mailHouse', '')), ''),
      'city', nullif(btrim(coalesce(p_values->>'mailCity', '')), ''),
      'zip', nullif(btrim(coalesce(p_values->>'mailZip', '')), '')));
    if v_mail <> '{}'::jsonb and v_mail is distinct from c.mailing_address then
      v_old := v_old || jsonb_build_object('mailingAddress', c.mailing_address);
      v_new := v_new || jsonb_build_object('mailingAddress', v_mail);
      update public.clients set mailing_address = v_mail where id = c.id;
      v_meta := v_meta || jsonb_build_object('mailingAddress', null);
    end if;
  end if;

  -- העסק: העסק הפעיל הראשון של הלקוח (לא של בן/בת הזוג); אין ⇒ נוצר
  if exists (select 1 from jsonb_object_keys(p_values) x where x in ('activity', 'bizStreet', 'bizHouse', 'bizCity', 'bizZip', 'bizPhone', 'businessName'))
     or (p_values ? 'openMonth' and f.template_key = 'vat-821') then
    select * into c from public.clients where id = c.id;
    bi := public._scf_business_index(c);
    v_biz := case when bi is not null then c.businesses->bi
                  else jsonb_build_object('id', 'biz-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12),
                                          'name', coalesce(nullif(btrim(coalesce(c.business_name, '')), ''), btrim(coalesce(c.first_name, '') || ' ' || coalesce(c.last_name, ''))),
                                          'kind', 'osek_morshe') end;
    if nullif(btrim(coalesce(p_values->>'businessName', '')), '') is not null and nullif(btrim(coalesce(v_biz->>'name', '')), '') is null then
      v_biz := v_biz || jsonb_build_object('name', btrim(p_values->>'businessName'));
    end if;
    if nullif(btrim(coalesce(p_values->>'activity', '')), '') is not null then
      v_biz := v_biz || jsonb_build_object('description', btrim(p_values->>'activity'));
    end if;
    if exists (select 1 from jsonb_object_keys(p_values) x where x in ('bizStreet', 'bizHouse', 'bizCity', 'bizZip', 'bizPhone')) then
      v_biz := jsonb_set(v_biz, '{address}', coalesce(case when jsonb_typeof(v_biz->'address') = 'object' then v_biz->'address' end, '{}'::jsonb)
        || jsonb_strip_nulls(jsonb_build_object(
          'street', nullif(btrim(coalesce(p_values->>'bizStreet', '')), ''),
          'houseNumber', nullif(btrim(coalesce(p_values->>'bizHouse', '')), ''),
          'city', nullif(btrim(coalesce(p_values->>'bizCity', '')), ''),
          'zip', nullif(btrim(coalesce(p_values->>'bizZip', '')), ''),
          'phone', nullif(btrim(coalesce(p_values->>'bizPhone', '')), ''))));
    end if;
    -- שנת פתיחת העסק נגזרת מחודש הפתיחה (רק כשאין)
    if f.template_key = 'vat-821' and coalesce(p_values->>'openMonth', '') ~ '^\d{4}-\d{2}$' and v_biz->>'startYear' is null then
      v_biz := v_biz || jsonb_build_object('startYear', left(p_values->>'openMonth', 4)::int);
    end if;
    if (bi is null and (v_biz ? 'description' or v_biz ? 'address' or v_biz ? 'startYear'))
       or (bi is not null and v_biz is distinct from c.businesses->bi) then
      v_old := v_old || jsonb_build_object('business', case when bi is not null then c.businesses->bi end);
      v_new := v_new || jsonb_build_object('business', v_biz);
      update public.clients
         set businesses = case when bi is null
                               then coalesce(case when jsonb_typeof(businesses) = 'array' then businesses end, '[]'::jsonb) || jsonb_build_array(v_biz)
                               else jsonb_set(businesses, array[bi::text], v_biz) end
       where id = c.id;
      v_meta := v_meta || jsonb_build_object('businesses', null);
      if nullif(btrim(coalesce(c.business_description, '')), '') is null and v_biz ? 'description' then
        update public.clients set business_description = v_biz->>'description' where id = c.id;
      end if;
    end if;
  end if;

  -- חשבון הבנק: הראשי (או הפתוח הראשון); אין ⇒ חשבון חדש שהוא הראשי
  if exists (select 1 from jsonb_object_keys(p_values) x where x in ('bankCode', 'bankName', 'bankBranch', 'bankAccount'))
     and 'bankCode' = any(v_card_keys) then
    select * into c from public.clients where id = c.id;
    ki := public._scf_bank_index(c);
    v_bank := case when ki is not null then c.bank_accounts->ki
                   else jsonb_build_object('id', 'bank-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12), 'isPrimary', true) end;
    v_bank := v_bank || jsonb_strip_nulls(jsonb_build_object(
      'bankCode', nullif(btrim(coalesce(p_values->>'bankCode', '')), ''),
      'bankName', nullif(btrim(coalesce(p_values->>'bankName', '')), ''),
      'branchNumber', nullif(btrim(coalesce(p_values->>'bankBranch', '')), ''),
      'accountNumber', nullif(btrim(coalesce(p_values->>'bankAccount', '')), '')));
    if v_bank->>'bankName' is null and v_bank->>'bankCode' is not null then
      v_bank := v_bank || jsonb_build_object('bankName', 'בנק ' || (v_bank->>'bankCode'));
    end if;
    if ki is null or v_bank is distinct from c.bank_accounts->ki then
      v_old := v_old || jsonb_build_object('bankAccount', case when ki is not null then c.bank_accounts->ki end);
      v_new := v_new || jsonb_build_object('bankAccount', v_bank);
      update public.clients
         set bank_accounts = case when ki is null
                                  then (select coalesce(jsonb_agg(x || jsonb_build_object('isPrimary', false)), '[]'::jsonb)
                                          from jsonb_array_elements(case when jsonb_typeof(bank_accounts) = 'array' then bank_accounts else '[]'::jsonb end) x)
                                       || jsonb_build_array(v_bank)
                                  else jsonb_set(bank_accounts, array[ki::text], v_bank) end
       where id = c.id;
      v_meta := v_meta || jsonb_build_object('bankAccounts', null);
    end if;
  end if;

  -- שנת הנישואין נגזרת מתאריך הנישואין (רק כשאין בכרטיס)
  if coalesce(p_values->>'marriageDate', '') ~ '^\d{4}-\d{2}-\d{2}$' and c.marriage_year is null then
    v_year := left(p_values->>'marriageDate', 4)::int;
    v_old := v_old || jsonb_build_object('marriageYear', null);
    v_new := v_new || jsonb_build_object('marriageYear', v_year);
    update public.clients set marriage_year = v_year where id = c.id;
    v_meta := v_meta || jsonb_build_object('marriageYear', null);
  end if;

  perform set_config('pivo.change_source', '', true);

  if v_new <> '{}'::jsonb then
    update public.clients
       set field_meta = coalesce(field_meta, '{}'::jsonb) || (
             select jsonb_object_agg(m.key, jsonb_build_object('source', 'manual', 'syncedAt', now(), 'via', f.template_key, 'by', p_actor))
               from jsonb_each(v_meta) m),
           updated_at = now()
     where id = c.id;
    insert into public.tax_fact_changes
      (user_id, client_id, field_key, label, old_value, new_value, source, status, decided_by, decided_at, note)
    values
      (f.user_id, c.id, 'smartForm:' || f.template_key, coalesce(public._smart_form_template(f.template_key)->>'clientTitle', 'טופס'),
       v_old, jsonb_build_object('values', v_new, 'stepId', f.step_id, 'filingId', f.id, 'via', p_actor),
       'prerequisite', 'accepted', f.user_id, now(), p_actor);
  end if;

  if f.state in ('awaiting_signatures', 'review') then
    update public.smart_form_filings set state = 'waiting_client_info', updated_at = now() where id = f.id;
  else
    update public.smart_form_filings set updated_at = now() where id = f.id;
  end if;

  if v_new <> '{}'::jsonb or cardinality(v_filing_changed) > 0 then
    perform public._smart_form_event(f.id, f.user_id, f.current_revision, p_actor, 'answers_saved',
      jsonb_build_object('cardKeys', (select coalesce(jsonb_agg(x), '[]'::jsonb) from jsonb_object_keys(v_new) x),
                         'filingKeys', to_jsonb(v_filing_changed), 'unlocked', v_unlocked));
  end if;
  perform public._smart_form_sync_step(f.id);
  return jsonb_build_object('ok', true, 'cardChanged', (select coalesce(jsonb_agg(x), '[]'::jsonb) from jsonb_object_keys(v_new) x),
                            'filingChanged', to_jsonb(v_filing_changed), 'unlocked', v_unlocked);
end;
$$;

create or replace function public._scf_lock(p_filing_id text, p_actor text)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  f public.smart_form_filings%rowtype; r public.smart_form_revisions%rowtype; c public.clients%rowtype;
  v_data jsonb; v_missing jsonb; v_map int; v_hash text; t jsonb;
begin
  select * into f from public.smart_form_filings where id = p_filing_id for update;
  select * into r from public.smart_form_revisions where filing_id = f.id and revision = f.current_revision for update;
  t := public._smart_form_template(f.template_key);
  v_map := (t->>'mappingVersion')::int;
  if r.state = 'signed' then return jsonb_build_object('ok', true, 'alreadySigned', true); end if;
  if r.state = 'locked' and r.mapping_version = v_map then
    return jsonb_build_object('ok', true, 'data', r.snapshot->'data', 'contentSha256', r.content_sha256, 'mappingVersion', r.mapping_version);
  end if;
  if f.state not in ('draft', 'waiting_client_info', 'review', 'awaiting_signatures') then
    return jsonb_build_object('ok', false, 'error', 'not_lockable', 'state', f.state);
  end if;
  select * into c from public.clients where id = f.client_id;
  v_data := public._scf_card(c) || coalesce(r.values->'answers', '{}'::jsonb)
            || jsonb_build_object('signDate', to_char((now() at time zone 'Asia/Jerusalem')::date, 'YYYY-MM-DD'));
  select coalesce(jsonb_agg(k), '[]'::jsonb) into v_missing
    from jsonb_array_elements_text(public._scf_spec(f.template_key)->'required') k
   where nullif(btrim(coalesce(v_data->>k, '')), '') is null;
  if jsonb_array_length(v_missing) > 0 then return jsonb_build_object('ok', false, 'error', 'missing', 'missing', v_missing); end if;
  v_hash := encode(sha256(convert_to(r.template_sha256 || '|' || v_map::text || '|' || array_to_string(f.purposes, ',') || '|' || v_data::text, 'UTF8')), 'hex');
  update public.smart_form_revisions
     set state = 'locked', mapping_version = v_map, content_sha256 = v_hash, locked_at = now(),
         snapshot = jsonb_build_object('data', v_data, 'source', p_actor,
                                       'template', jsonb_build_object('key', f.template_key, 'version', r.template_version,
                                                                      'sha256', r.template_sha256, 'mappingVersion', v_map)),
         signers = jsonb_build_array(jsonb_build_object('role', 'client', 'required', true, 'status', 'pending',
                     'name', btrim(coalesce(v_data->>'firstName', '') || ' ' || coalesce(v_data->>'lastName', '')),
                     'idNumber', v_data->>'idNumber')),
         signatures = '{}'::jsonb, sign_tokens = '{}'::jsonb
   where id = r.id;
  update public.smart_form_filings set state = 'awaiting_signatures', updated_at = now() where id = f.id;
  perform public._smart_form_event(f.id, f.user_id, r.revision, p_actor, 'locked', jsonb_build_object('contentSha256', v_hash, 'signers', jsonb_build_array('client')));
  perform public._smart_form_sync_step(f.id);
  return jsonb_build_object('ok', true, 'data', v_data, 'contentSha256', v_hash, 'mappingVersion', v_map);
end;
$$;

drop function if exists public._scf_missing(text, jsonb);
