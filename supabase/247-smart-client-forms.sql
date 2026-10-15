-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- 247 · טפסים חכמים שהלקוח ממלא וחותם בדף האישי — 4440 (מס הכנסה) ו-821 (מע״מ)
-- 15.10.2026 · docs/PLAN-SMART-CLIENT-FORMS-4440-821.md
--
--   1. התבניות נרשמות ב-_smart_form_template (clientFill) וב-check של smart_form_filings.
--   2. «מה בכרטיס» מחושב בשרת בלבד (_scf_card) — הדף והמשרד מקבלים אותו, לא מחשבים.
--   3. תשובה לשדה שיש לו בית בכרטיס נכתבת לכרטיס (_scf_apply) עם field_meta ושורת tax_fact_changes;
--      תשובה שאין לה בית — ב-smart_form_revisions.values.answers. ‼ זהות (שם, ת.ז.) — רק השלמה של ריק.
--   4. הצילום לחתימה נבנה בשרת (כרטיס ∪ תשובות ∪ תאריך), והטביעה כמו ב-6101.
--   5. ההיטל ב«בקשות» (_smart_form_sync_client_step) והפריט בדף (_smart_form_portal_item) — שלהם בלבד;
--      ענף 6101 לא משתנה. ‼ הזרקות לגוף החי בעוגן של שורה אחת, פעם אחת בדיוק (הכול או כלום).
--   6. ארבע פונקציות anon לדף האישי — אותו שער כמו portal_submit_step (טוקן הדף, פרסום, שער).
--
-- ‼ החלה חוזרת — כל הזרקה מדלגת לפי הסימון «247 ·». apply_migration עלול לדווח הצלחה על DO בלי להחיל — לאמת אחרי:
--   select proname, prosrc like '%247 ·%' from pg_proc where proname in
--     ('_portal_step_items','_smart_form_sync_step','smart_form_start','assert_domain_function_invariants');
-- ‼ החזרה: scripts/sql/247/rollback-247.sql
-- ════════════════════════════════════════════════════════════════════════════════════════════════

do $guard$
begin
  if to_regclass('public.smart_form_filings') is null or to_regclass('public.smart_form_mappings') is null then
    raise exception '247: חסרות טבלאות 206/210';
  end if;
  if not exists (select 1 from pg_proc where proname = '_portal_step_items') then
    raise exception '247: _portal_step_items חסרה (222)';
  end if;
end
$guard$;

-- ── 1 · התבניות ─────────────────────────────────────────────────────────────────────────────────
alter table public.smart_form_filings drop constraint if exists smart_form_filings_template_key_check;
alter table public.smart_form_filings add constraint smart_form_filings_template_key_check
  check (template_key in ('btl-6101', 'ita-4440', 'vat-821'));

create or replace function public._smart_form_template(p_key text)
returns jsonb language sql stable set search_path to 'public' as $$
  select case p_key
    when 'btl-6101' then jsonb_build_object(
      'version', '06.2026',
      'sha256', '79e4f387e851cf1a8218c52c4991321e9daae39f3c02f235aeaa3287c3d93754',
      'mappingVersion', coalesce((select max(m.version) from public.smart_form_mappings m
                                   where m.template_key = p_key and m.status = 'published'), 2),
      'codeBase', 2,
      'title', 'דין וחשבון רב שנתי (6101) · ביטוח לאומי',
      'purposes', jsonb_build_array('multi_year_report', 'start', 'change', 'end', 'stop_employees', 'spouse_in_business', 'update_details'))
    -- 247 · טפסים שהלקוח ממלא וחותם בדף האישי
    when 'ita-4440' then jsonb_build_object(
      'version', '12.2009',
      'sha256', '6cec4c26b718306c799ae1f8c6f35fc023b79df9e3a4c009e72c83fb3e747265',
      'mappingVersion', coalesce((select max(m.version) from public.smart_form_mappings m
                                   where m.template_key = p_key and m.status = 'published'), 1),
      'codeBase', 1, 'clientFill', true, 'authority', 'ita',
      'title', 'תצהיר נשואים החיים בנפרד (4440) · מס הכנסה',
      'clientTitle', 'תצהיר על חיים בנפרד (טופס 4440)',
      'purposes', '[]'::jsonb)
    when 'vat-821' then jsonb_build_object(
      'version', '821',
      'sha256', 'ff5f46569e32b5085597e461d1c0d779c9f486c311cc38c94da184285c33d8d6',
      'mappingVersion', coalesce((select max(m.version) from public.smart_form_mappings m
                                   where m.template_key = p_key and m.status = 'published'), 1),
      'codeBase', 1, 'clientFill', true, 'authority', 'vat',
      'title', 'רישום עוסק במע״מ (821) · מע״מ',
      'clientTitle', 'רישום העסק במע״מ (טופס 821)',
      'purposes', '[]'::jsonb)
    else null end;
$$;

create or replace function public._scf_is_client_form(p_key text)
returns boolean language sql immutable set search_path to 'public' as $$
  select coalesce(p_key in ('ita-4440', 'vat-821'), false);
$$;

/** מה כל טופס מקבל: מפתחות כרטיס, מפתחות הגשה, חובה לחתימה, וזהות (השלמה בלבד). ‼ אותם מפתחות כמו בקוד (src/features/smartForms/clientForms). */
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

-- ── 2 · «מה בכרטיס» — מקור אחד ─────────────────────────────────────────────────────────────────
/** פירוק כתובת חופשית: «הרצל 12» / «הרצל 12א» / «הרצל 12/4». לא מזוהה ⇒ הכול ברחוב. */
create or replace function public._scf_split_address(p_address text, out street text, out house text)
language plpgsql immutable set search_path to 'public' as $$
declare v text := nullif(btrim(coalesce(p_address, '')), ''); m text[];
begin
  if v is null then return; end if;
  m := regexp_match(v, '^(.*\S)\s+(\d+\s*[א-ת]?(?:\s*/\s*\d+)?)$');
  if m is null then street := v; else street := btrim(m[1]); house := regexp_replace(m[2], '\s+', '', 'g'); end if;
end;
$$;

create or replace function public._scf_business_index(c public.clients)
returns int language sql stable set search_path to 'public' as $$
  select (x.i - 1)::int
    from jsonb_array_elements(case when jsonb_typeof(c.businesses) = 'array' then c.businesses else '[]'::jsonb end) with ordinality x(e, i)
   where coalesce((x.e->>'isClosed')::boolean, false) = false and coalesce((x.e->>'belongsToSpouse')::boolean, false) = false
   order by x.i limit 1;
$$;

create or replace function public._scf_bank_index(c public.clients)
returns int language sql stable set search_path to 'public' as $$
  select (x.i - 1)::int
    from jsonb_array_elements(case when jsonb_typeof(c.bank_accounts) = 'array' then c.bank_accounts else '[]'::jsonb end) with ordinality x(e, i)
   where coalesce(x.e->>'closedAt', '') = '' and coalesce(x.e->>'country', '') = ''
   order by coalesce((x.e->>'isPrimary')::boolean, false) desc, x.i limit 1;
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

/** בדיקת ערך לפי מפתח. null = תקין. ‼ אותם כללים כמו clientForms/validate.ts. */
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

-- ── 3 · כתיבה: כרטיס / הגשה ─────────────────────────────────────────────────────────────────────
/**
 * ‼ המקום היחיד שבו תשובה בטופס נוגעת בכרטיס. p_actor: 'client' (הדף האישי) | 'office' (מילוי במשרד).
 * גרסה נעולה שעוד לא נחתמה — חוזרת לטיוטה (מה שנחתם הוא מה שהוצג). חתומה — לא משתנה כאן.
 */
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

/** הנתונים שעל הטופס עכשיו: הכרטיס ∪ התשובות (∪ תאריך החתימה בנעילה). */
create or replace function public._scf_data(p_filing_id text)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare f public.smart_form_filings%rowtype; r public.smart_form_revisions%rowtype; c public.clients%rowtype;
begin
  select * into f from public.smart_form_filings where id = p_filing_id;
  select * into r from public.smart_form_revisions where filing_id = f.id and revision = f.current_revision;
  if r.state in ('locked', 'signed') and r.snapshot ? 'data' then return r.snapshot->'data'; end if;
  select * into c from public.clients where id = f.client_id;
  return public._scf_card(c) || coalesce(r.values->'answers', '{}'::jsonb);
end;
$$;

/** הכנה לחתימה: צילום בשרת, טביעה, חותם. ‼ חסר חובה ⇒ לא ננעל. */
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

-- ── 4 · ההיטל ב«בקשות» והפריט בדף ─────────────────────────────────────────────────────────────
create or replace function public._smart_form_sync_client_step(p_filing_id text)
returns void language plpgsql security definer set search_path to 'public' as $$
declare
  f public.smart_form_filings%rowtype; r public.smart_form_revisions%rowtype; t jsonb;
  v_status text; v_ball text; v_label text; v_auth text;
begin
  select * into f from public.smart_form_filings where id = p_filing_id;
  if f.id is null or f.step_id is null then return; end if;
  select * into r from public.smart_form_revisions where filing_id = f.id and revision = f.current_revision;
  t := public._smart_form_template(f.template_key);
  v_auth := case t->>'authority' when 'vat' then 'מע״מ' else 'מס הכנסה' end;
  case f.state
    when 'draft', 'waiting_client_info', 'review' then v_status := 'waiting_client'; v_ball := 'client'; v_label := 'ממתין ללקוח - מילוי וחתימה';
    when 'awaiting_signatures' then v_status := 'waiting_client'; v_ball := 'client'; v_label := 'ממתין לחתימת הלקוח';
    when 'signed' then v_status := 'in_progress'; v_ball := 'me';
      v_label := case when r.signed_document_id is null then 'נחתם - להפקת המסמך החתום' else 'נחתם - להגשה ל' || v_auth end;
    when 'awaiting_client_submission' then v_status := 'waiting_client'; v_ball := 'client'; v_label := 'הלקוח מגיש בעצמו';
    when 'submitted' then v_status := 'in_progress'; v_ball := 'authority'; v_label := 'הוגש - ממתין ל' || v_auth;
    when 'info_requested' then v_status := 'in_progress'; v_ball := 'me'; v_label := v_auth || ' ביקש מידע נוסף';
    when 'result_received' then v_status := 'in_progress'; v_ball := 'me'; v_label := 'התקבלה תשובה - לסגירה';
    when 'closed' then v_status := 'completed'; v_ball := 'me'; v_label := 'הושלם';
    when 'cancelled' then v_status := 'cancelled'; v_ball := 'me'; v_label := 'בוטל';
  end case;
  update public.onboarding_steps
     set payload = (coalesce(payload, '{}'::jsonb) - 'messageOnly')
                   || jsonb_build_object('smartForm', jsonb_strip_nulls(jsonb_build_object(
                        'filingId', f.id, 'templateKey', f.template_key, 'state', f.state, 'stateLabel', v_label,
                        'waitingOn', case v_ball when 'client' then 'client' when 'authority' then 'authority' end,
                        'revision', f.current_revision, 'clientFill', true, 'authority', t->>'authority',
                        'signedAt', r.signed_at, 'syncedAt', now()))),
         updated_at = now()
   where id = f.step_id;
  perform public._set_step_status(f.step_id, v_status, 'system', v_label,
    jsonb_build_object('filingId', f.id, 'state', f.state), v_ball,
    case when v_status = 'completed' then 'manual' else null end);
end;
$$;

/**
 * הפריט בדף האישי. ‼ נגזר מההיטל בלבד (payload.smartForm.state) — כך גם התצוגה לדוגמה
 * (preview_request_sample, בלי הגשה במסד) רואה בדיוק אותו פריט.
 */
create or replace function public._smart_form_portal_item(s public.onboarding_steps, p_ctx jsonb default '{}'::jsonb)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare
  sf jsonb := coalesce(s.payload->'smartForm', '{}'::jsonb);
  v_state text := coalesce(sf->>'state', 'waiting_client_info');
  v_label text := coalesce(nullif(s.payload->>'clientTitle', ''), 'טופס לחתימה');
  v_auth text := case coalesce(sf->>'authority', public._smart_form_template(sf->>'templateKey')->>'authority') when 'vat' then 'מע״מ' else 'מס הכנסה' end;
begin
  if s.status in ('cancelled') or v_state = 'cancelled' then return '[]'::jsonb; end if;
  if s.status = 'locked' then
    return jsonb_build_array(jsonb_strip_nulls(jsonb_build_object('bucket', 'future', 'key', 'sform_' || s.id, 'label', v_label,
      'sub', coalesce(p_ctx->>'lockReason', public.portal_lock_reason(s.id), nullif(s.payload->>'clientSub', '')))));
  end if;
  if v_state in ('draft', 'waiting_client_info', 'review') then
    return jsonb_build_array(jsonb_strip_nulls(jsonb_build_object('bucket', 'action', 'key', 'sform_' || s.id, 'label', v_label,
      'sub', coalesce(nullif(s.payload->>'clientSub', ''), 'רוב הפרטים כבר מולאו מהתיק שלך · כמה שאלות קצרות, ואז חתימה'),
      'actionKind', 'portal', 'actionValue', s.id, 'stepId', s.id, 'kind', 'smart_form', 'cta', 'למילוי וחתימה')));
  elsif v_state = 'awaiting_signatures' then
    return jsonb_build_array(jsonb_build_object('bucket', 'action', 'key', 'sform_' || s.id, 'label', v_label,
      'sub', 'הטופס מוכן · נשאר לעבור עליו ולחתום',
      'actionKind', 'portal', 'actionValue', s.id, 'stepId', s.id, 'kind', 'smart_form', 'cta', 'לצפייה וחתימה'));
  elsif v_state = 'closed' then
    return jsonb_build_array(jsonb_build_object('bucket', 'done', 'key', 'sform_' || s.id, 'label', v_label));
  else
    return jsonb_build_array(jsonb_build_object('bucket', 'office', 'key', 'sform_' || s.id, 'label', v_label,
      'sub', case when v_state in ('signed', 'awaiting_client_submission') then 'נחתם · המשרד מגיש ל' || v_auth
                  else 'הוגש ל' || v_auth || ' · ממתינים לתשובה' end));
  end if;
end;
$$;

-- ── 5 · פתיחה, מילוי במשרד, תצוגה במשרד ─────────────────────────────────────────────────────────
create or replace function public.smart_form_client_start(p_client_id text, p_template_key text, p_published boolean default true)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  v_uid uuid := auth.uid();
  c public.clients%rowtype;
  f public.smart_form_filings%rowtype;
  t jsonb := public._smart_form_template(p_template_key);
  v_res jsonb;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'unauthenticated'); end if;
  if not public.is_authorized() then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;
  if t is null or not public._scf_is_client_form(p_template_key) then return jsonb_build_object('ok', false, 'error', 'unknown_template'); end if;
  select * into c from public.clients where id = p_client_id;
  if c.id is null then return jsonb_build_object('ok', false, 'error', 'client_not_found'); end if;
  if c.user_id <> v_uid then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;
  -- ‼ התצהיר הוא של בני זוג נשואים; 821 כאן — עוסק יחיד בלבד (עמוד 2 של הטופס לא ממופה).
  if p_template_key = 'ita-4440' and coalesce(c.family_status, '') <> 'married' then
    return jsonb_build_object('ok', false, 'error', 'not_married');
  end if;
  if p_template_key = 'vat-821' and coalesce(c.type, 'individual') = 'company' then
    return jsonb_build_object('ok', false, 'error', 'individual_only');
  end if;

  select * into f from public.smart_form_filings
   where client_id = c.id and template_key = p_template_key and subject_role = 'client' and state not in ('closed', 'cancelled')
   for update;
  if f.id is not null then return jsonb_build_object('ok', true, 'filingId', f.id, 'existing', true, 'stepId', f.step_id); end if;

  begin
    insert into public.smart_form_filings (user_id, client_id, template_key, subject_role, purposes, state)
    values (v_uid, c.id, p_template_key, 'client', '{}', 'waiting_client_info')
    returning * into f;
  exception when unique_violation then
    select * into f from public.smart_form_filings
     where client_id = c.id and template_key = p_template_key and subject_role = 'client' and state not in ('closed', 'cancelled');
    return jsonb_build_object('ok', true, 'filingId', f.id, 'existing', true, 'stepId', f.step_id);
  end;
  insert into public.smart_form_revisions (filing_id, user_id, revision, template_key, template_version, template_sha256, mapping_version, purposes, values)
  values (f.id, v_uid, 1, p_template_key, t->>'version', t->>'sha256', (t->>'mappingVersion')::int, '{}', jsonb_build_object('answers', '{}'::jsonb));

  -- ‼ owner=me ביצירה (בלי דרישות); ההיטל מעביר את הכדור ללקוח. פרסום — כמו כל בקשה (טיוטה עד «הדף של …»).
  v_res := public.create_onboarding_request(
    c.id, 'custom_request',
    jsonb_build_object('title', t->>'title', 'clientTitle', t->>'clientTitle', 'requirements', '[]'::jsonb,
                       'smartForm', jsonb_build_object('filingId', f.id, 'templateKey', p_template_key, 'state', 'waiting_client_info',
                                                       'clientFill', true, 'authority', t->>'authority')),
    null, null, coalesce(p_published, true), false, 'me', null);
  if not coalesce((v_res->>'ok')::boolean, false) then
    raise exception 'smart_form_step_failed: %', coalesce(v_res->>'error', 'unknown');
  end if;
  update public.smart_form_filings set step_id = v_res->>'stepId' where id = f.id;
  perform public._smart_form_event(f.id, v_uid, 1, 'office', 'created',
    jsonb_build_object('templateKey', p_template_key, 'templateVersion', t->>'version', 'published', coalesce(p_published, true)));
  perform public._smart_form_sync_step(f.id);
  return jsonb_build_object('ok', true, 'filingId', f.id, 'existing', false, 'stepId', v_res->>'stepId');
end;
$$;

create or replace function public.smart_form_client_fill(p_filing_id text, p_values jsonb)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare f public.smart_form_filings%rowtype := public._smart_form_owned(p_filing_id);
begin
  if f.id is null then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;
  return public._scf_apply(f.id, p_values, 'office');
end;
$$;

create or replace function public.smart_form_client_view(p_filing_id text)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare f public.smart_form_filings%rowtype; r public.smart_form_revisions%rowtype; c public.clients%rowtype; t jsonb;
begin
  if auth.uid() is null or not public.is_authorized() then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;
  select * into f from public.smart_form_filings where id = p_filing_id;
  if f.id is null or f.user_id <> auth.uid() or not public._scf_is_client_form(f.template_key) then
    return jsonb_build_object('ok', false, 'error', 'forbidden');
  end if;
  select * into r from public.smart_form_revisions where filing_id = f.id and revision = f.current_revision;
  select * into c from public.clients where id = f.client_id;
  t := public._smart_form_template(f.template_key);
  return jsonb_build_object('ok', true, 'templateKey', f.template_key, 'state', f.state, 'revision', r.revision,
    'revisionState', r.state, 'card', public._scf_card(c), 'answers', coalesce(r.values->'answers', '{}'::jsonb),
    'data', public._scf_data(f.id), 'contentSha256', r.content_sha256,
    'mappingVersion', coalesce(r.mapping_version, (t->>'mappingVersion')::int),
    'activeMappingVersion', (t->>'mappingVersion')::int,
    'mapping', public._smart_form_mapping_fields(f.template_key, coalesce(r.mapping_version, (t->>'mappingVersion')::int)),
    'signatures', (select coalesce(jsonb_object_agg(k, v->'png'), '{}'::jsonb) from jsonb_each(coalesce(r.signatures, '{}'::jsonb)) sg(k, v)),
    'signers', r.signers, 'signedAt', r.signed_at, 'lockedAt', r.locked_at,
    'signedDocumentId', r.signed_document_id, 'stepId', f.step_id);
end;
$$;

-- ── 6 · הדף האישי (anon, טוקן הדף) ────────────────────────────────────────────────────────────
/** אותו שער כמו portal_submit_step: טוקן תקף, הבקשה של הלקוח, פורסמה ושערה פתוח. */
create or replace function public._scf_portal_resolve(p_token text, p_step_id text, out v_client_id text, out v_filing_id text, out v_reason text)
returns record language plpgsql security definer set search_path to 'public' as $$
declare c public.clients%rowtype; s public.onboarding_steps%rowtype; f public.smart_form_filings%rowtype;
begin
  if coalesce(p_token, '') = '' then v_reason := 'invalid'; return; end if;
  select * into c from public.clients where portal_token = p_token limit 1;
  if c.id is null or (c.portal_token_expires_at is not null and c.portal_token_expires_at < now()) then v_reason := 'invalid'; return; end if;
  select * into s from public.onboarding_steps where id = p_step_id and client_id = c.id;
  if s.id is null or s.payload #>> '{smartForm,clientFill}' is distinct from 'true' then v_reason := 'step_not_found'; return; end if;
  if s.published_at is null or not public.client_step_gate_open(c.id, s.published_at) then v_reason := 'not_published'; return; end if;
  if s.status in ('cancelled', 'locked') then v_reason := 'not_available'; return; end if;
  select * into f from public.smart_form_filings where step_id = s.id and client_id = c.id;
  if f.id is null or f.state = 'cancelled' then v_reason := 'not_available'; return; end if;
  v_client_id := c.id; v_filing_id := f.id;
end;
$$;

create or replace function public.portal_smart_form_get(p_token text, p_step_id text)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare x record; f public.smart_form_filings%rowtype; r public.smart_form_revisions%rowtype; c public.clients%rowtype; p public.profiles%rowtype; t jsonb;
begin
  select * into x from public._scf_portal_resolve(p_token, p_step_id);
  if x.v_reason is not null then return jsonb_build_object('ok', false, 'error', x.v_reason); end if;
  update public.clients set portal_token_last_used_at = now() where id = x.v_client_id;
  select * into f from public.smart_form_filings where id = x.v_filing_id;
  select * into r from public.smart_form_revisions where filing_id = f.id and revision = f.current_revision;
  select * into c from public.clients where id = f.client_id;
  select * into p from public.profiles where id = f.user_id;
  t := public._smart_form_template(f.template_key);
  return jsonb_build_object('ok', true, 'templateKey', f.template_key, 'title', t->>'clientTitle', 'authority', t->>'authority',
    'firmName', coalesce(p.firm_name, ''), 'state', f.state, 'revisionState', r.state,
    'card', public._scf_card(c), 'answers', coalesce(r.values->'answers', '{}'::jsonb),
    'data', public._scf_data(f.id), 'contentSha256', r.content_sha256,
    'mappingVersion', coalesce(r.mapping_version, (t->>'mappingVersion')::int),
    'activeMappingVersion', (t->>'mappingVersion')::int,
    'mapping', public._smart_form_mapping_fields(f.template_key, coalesce(r.mapping_version, (t->>'mappingVersion')::int)),
    -- ‼ רק החתימה של הלקוח עצמו, ורק אחרי שחתם — כדי להציג לו את הטופס החתום.
    'signature', case when r.state = 'signed' then r.signatures->'client'->'png' end,
    'signedAt', r.signed_at);
end;
$$;

create or replace function public.portal_smart_form_save(p_token text, p_step_id text, p_values jsonb)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare x record; v jsonb;
begin
  select * into x from public._scf_portal_resolve(p_token, p_step_id);
  if x.v_reason is not null then return jsonb_build_object('ok', false, 'error', x.v_reason); end if;
  v := public._scf_apply(x.v_filing_id, coalesce(p_values, '{}'::jsonb), 'client');
  if not coalesce((v->>'ok')::boolean, false) then return v; end if;
  return public.portal_smart_form_get(p_token, p_step_id) || jsonb_build_object('saved', v);
end;
$$;

create or replace function public.portal_smart_form_prepare(p_token text, p_step_id text)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare x record; v jsonb;
begin
  select * into x from public._scf_portal_resolve(p_token, p_step_id);
  if x.v_reason is not null then return jsonb_build_object('ok', false, 'error', x.v_reason); end if;
  v := public._scf_lock(x.v_filing_id, 'client');
  if not coalesce((v->>'ok')::boolean, false) then return v; end if;
  return public.portal_smart_form_get(p_token, p_step_id);
end;
$$;

create or replace function public.portal_smart_form_sign(p_token text, p_step_id text, p_png text, p_content_sha256 text, p_consent boolean)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  x record; f public.smart_form_filings%rowtype; r public.smart_form_revisions%rowtype; s public.onboarding_steps%rowtype;
  c public.clients%rowtype; v_signers jsonb := '[]'::jsonb; sg jsonb; v_all boolean;
begin
  select * into x from public._scf_portal_resolve(p_token, p_step_id);
  if x.v_reason is not null then return jsonb_build_object('ok', false, 'error', x.v_reason); end if;
  select * into f from public.smart_form_filings where id = x.v_filing_id for update;
  select * into r from public.smart_form_revisions where filing_id = f.id and revision = f.current_revision for update;
  if r.state = 'signed' then return jsonb_build_object('ok', true, 'alreadySigned', true); end if;
  if f.state <> 'awaiting_signatures' or r.state <> 'locked' then return jsonb_build_object('ok', false, 'error', 'not_signable'); end if;
  if r.mapping_version is distinct from (public._smart_form_template(f.template_key)->>'mappingVersion')::int then
    return jsonb_build_object('ok', false, 'error', 'mapping_outdated');
  end if;
  if p_content_sha256 is distinct from r.content_sha256 then return jsonb_build_object('ok', false, 'error', 'content_changed'); end if;
  if p_consent is not true then return jsonb_build_object('ok', false, 'error', 'consent_required'); end if;
  if not public._smart_form_png_ok(p_png) then return jsonb_build_object('ok', false, 'error', 'bad_signature_image'); end if;
  for sg in select * from jsonb_array_elements(r.signers) loop
    if sg->>'role' = 'client' then sg := sg || jsonb_build_object('status', 'signed', 'signedAt', now(), 'method', 'client_page'); end if;
    v_signers := v_signers || jsonb_build_array(sg);
  end loop;
  update public.smart_form_revisions
     set signers = v_signers,
         signatures = signatures || jsonb_build_object('client', jsonb_build_object('png', p_png, 'signedAt', now(), 'method', 'client_page'))
   where id = r.id;
  perform public._smart_form_event(f.id, f.user_id, r.revision, 'client', 'signature_captured',
    jsonb_build_object('role', 'client', 'method', 'client_page', 'contentSha256', r.content_sha256));
  v_all := public._smart_form_after_signature(r.id);
  perform public._smart_form_sync_step(f.id);
  select * into s from public.onboarding_steps where id = f.step_id;
  select * into c from public.clients where id = f.client_id;
  perform public.log_onboarding_event(f.user_id, s.id, s.engagement_id, 'note', 'client',
    'הלקוח מילא וחתם על ' || coalesce(nullif(s.payload->>'clientTitle', ''), 'הטופס'), jsonb_build_object('filingId', f.id));
  perform public.queue_accountant_notification(f.user_id, 'client_request_completed', c.id, s.id, null, null,
    jsonb_build_object('clientName', btrim(coalesce(c.first_name, '') || ' ' || coalesce(c.last_name, '')),
                       'requestTitle', coalesce(nullif(s.payload->>'clientTitle', ''), 'טופס'),
                       'lastItem', 'הלקוח חתם על הטופס'));
  return jsonb_build_object('ok', true, 'allSigned', v_all);
end;
$$;

-- ── 7 · הרשאות ─────────────────────────────────────────────────────────────────────────────────
revoke all on function public._scf_is_client_form(text) from public, anon, authenticated;
revoke all on function public._scf_spec(text) from public, anon, authenticated;
revoke all on function public._scf_split_address(text) from public, anon, authenticated;
revoke all on function public._scf_business_index(public.clients) from public, anon, authenticated;
revoke all on function public._scf_bank_index(public.clients) from public, anon, authenticated;
revoke all on function public._scf_card(public.clients) from public, anon, authenticated;
revoke all on function public._scf_invalid(text, text) from public, anon, authenticated;
revoke all on function public._scf_apply(text, jsonb, text) from public, anon, authenticated;
revoke all on function public._scf_data(text) from public, anon, authenticated;
revoke all on function public._scf_lock(text, text) from public, anon, authenticated;
revoke all on function public._scf_portal_resolve(text, text) from public, anon, authenticated;
revoke all on function public._smart_form_sync_client_step(text) from public, anon, authenticated;
revoke all on function public._smart_form_portal_item(public.onboarding_steps, jsonb) from public, anon, authenticated;
revoke all on function public.smart_form_client_start(text, text, boolean) from public, anon;
revoke all on function public.smart_form_client_fill(text, jsonb) from public, anon;
revoke all on function public.smart_form_client_view(text) from public, anon;
grant execute on function public.smart_form_client_start(text, text, boolean) to authenticated;
grant execute on function public.smart_form_client_fill(text, jsonb) to authenticated;
grant execute on function public.smart_form_client_view(text) to authenticated;
-- ‼ כמו get_client_portal / portal_submit_step: הטוקן הוא השער, ולכן גם משתמש מחובר (רו"ח שפותח את
--   הקישור בדפדפן שלו) עובר באותו מסלול. אין כאן שום הרשאה שתלויה בזהות המחובר.
revoke all on function public.portal_smart_form_get(text, text) from public;
revoke all on function public.portal_smart_form_save(text, text, jsonb) from public;
revoke all on function public.portal_smart_form_prepare(text, text) from public;
revoke all on function public.portal_smart_form_sign(text, text, text, text, boolean) from public;
grant execute on function public.portal_smart_form_get(text, text) to anon, authenticated;
grant execute on function public.portal_smart_form_save(text, text, jsonb) to anon, authenticated;
grant execute on function public.portal_smart_form_prepare(text, text) to anon, authenticated;
grant execute on function public.portal_smart_form_sign(text, text, text, text, boolean) to anon, authenticated;

-- ── 8 · הזרקות לגוף החי (עוגן של שורה אחת, פעם אחת בדיוק; הכול או כלום) ──────────────────────
do $p246$
declare
  v_psi text; v_sync text; v_start text; v_inv text; v_nl text;
  a_psi text := E'      v_reqs := coalesce(s.payload->''requirements'', ''[]''::jsonb);\n';
  n_psi text := E'      -- 247 · טופס חכם שהלקוח ממלא וחותם בדף (4440/821) — הפריט נגזר מההיטל smartForm\n'
             || E'      if s.payload #>> ''{smartForm,clientFill}'' = ''true'' then\n'
             || E'        v_items := v_items || public._smart_form_portal_item(s, p_ctx);\n'
             || E'        exit step_body;\n'
             || E'      end if;\n';
  a_sync text := E'  if f.id is null or f.step_id is null then return; end if;\n';
  n_sync text := E'  -- 247 · טפסים שהלקוח ממלא וחותם — היטל משלהם\n'
              || E'  if public._scf_is_client_form(f.template_key) then perform public._smart_form_sync_client_step(f.id); return; end if;\n';
  a_start text := E'  if t is null then return jsonb_build_object(''ok'', false, ''error'', ''unknown_template''); end if;\n';
  n_start text := E'  -- 247 · טופס שהלקוח ממלא נפתח ב-smart_form_client_start בלבד\n'
               || E'  if coalesce((t->>''clientFill'')::boolean, false) then return jsonb_build_object(''ok'', false, ''error'', ''use_client_start''); end if;\n';
  a_inv text := E'    ''onboarding_set_no_license''\n';
  n_inv text := E'    ''onboarding_set_no_license'',\n'
             || E'    -- 247 · טופס חכם בדף האישי — טוקן הדף בלבד, אותו שער כמו portal_submit_step\n'
             || E'    ''portal_smart_form_get'', ''portal_smart_form_save'', ''portal_smart_form_prepare'', ''portal_smart_form_sign''\n';
  cnt int;
begin
  select pg_get_functiondef(p.oid) into v_psi from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = '_portal_step_items';
  select pg_get_functiondef(p.oid) into v_sync from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = '_smart_form_sync_step';
  select pg_get_functiondef(p.oid) into v_start from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'smart_form_start';
  select pg_get_functiondef(p.oid) into v_inv from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'assert_domain_function_invariants';

  -- ‼ שורות הגוף החי עשויות להיות CRLF (נשמר כך בייצור) — העוגן מותאם לגוף עצמו
  v_nl := case when position(E'\r\n' in v_psi) > 0 then E'\r\n' else E'\n' end;
  a_psi := replace(a_psi, E'\n', v_nl); n_psi := replace(n_psi, E'\n', v_nl);
  v_nl := case when position(E'\r\n' in v_sync) > 0 then E'\r\n' else E'\n' end;
  a_sync := replace(a_sync, E'\n', v_nl); n_sync := replace(n_sync, E'\n', v_nl);
  v_nl := case when position(E'\r\n' in v_start) > 0 then E'\r\n' else E'\n' end;
  a_start := replace(a_start, E'\n', v_nl); n_start := replace(n_start, E'\n', v_nl);
  v_nl := case when position(E'\r\n' in v_inv) > 0 then E'\r\n' else E'\n' end;
  a_inv := replace(a_inv, E'\n', v_nl); n_inv := replace(n_inv, E'\n', v_nl);

  -- כל העוגנים נבדקים לפני כל שינוי
  if position('247 ·' in v_psi) = 0 then
    cnt := (length(v_psi) - length(replace(v_psi, a_psi, ''))) / length(a_psi);
    if cnt <> 1 then raise exception '247: עוגן _portal_step_items נמצא % פעמים', cnt; end if;
  end if;
  if position('247 ·' in v_sync) = 0 then
    cnt := (length(v_sync) - length(replace(v_sync, a_sync, ''))) / length(a_sync);
    if cnt <> 1 then raise exception '247: עוגן _smart_form_sync_step נמצא % פעמים', cnt; end if;
  end if;
  if position('247 ·' in v_start) = 0 then
    cnt := (length(v_start) - length(replace(v_start, a_start, ''))) / length(a_start);
    if cnt <> 1 then raise exception '247: עוגן smart_form_start נמצא % פעמים', cnt; end if;
  end if;
  if position('247 ·' in v_inv) = 0 then
    cnt := (length(v_inv) - length(replace(v_inv, a_inv, ''))) / length(a_inv);
    if cnt <> 1 then raise exception '247: עוגן assert_domain_function_invariants נמצא % פעמים', cnt; end if;
  end if;

  if position('247 ·' in v_psi) = 0 then execute replace(v_psi, a_psi, n_psi || a_psi); else raise notice '247: _portal_step_items — כבר הוחל'; end if;
  if position('247 ·' in v_sync) = 0 then execute replace(v_sync, a_sync, a_sync || n_sync); else raise notice '247: _smart_form_sync_step — כבר הוחל'; end if;
  if position('247 ·' in v_start) = 0 then execute replace(v_start, a_start, a_start || n_start); else raise notice '247: smart_form_start — כבר הוחל'; end if;
  if position('247 ·' in v_inv) = 0 then execute replace(v_inv, a_inv, n_inv); else raise notice '247: assert_domain_function_invariants — כבר הוחל'; end if;
end
$p246$;

-- ‼ create or replace שומר הרשאות, אבל הגוף החדש עובר בדיקה: _portal_step_items נשארת פנימית.
revoke all on function public._portal_step_items(public.onboarding_steps, public.clients, public.profiles, public.representation_requests, jsonb, jsonb) from public, anon, authenticated;
