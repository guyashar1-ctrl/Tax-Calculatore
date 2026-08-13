-- ─── 92: M2 — יישור קו מול הרשויות ──────────────────────────────────────────
-- מקור UX מחייב: docs/prototypes/client-case-simplified-exploration-v3-final2.html
-- (?life=existing/active, תהליך → "יישור קו מול הרשויות"/"הקמת תיק במערכת").
--
-- ‼ יכולת אחת, לא שלושה מימושים: שני שלבי-על חדשים —
--   institution_alignment_{btl,vat,income} — שלוש שורות onboarding_steps נפרדות
--   (allowlist סגור, לכן ערך ייעודי לכל מוסד ולא 'institution_alignment'+key —
--   כך אינדקס הייחודיות הקיים לפי (client_id, step_type) ממשיך לעבוד בלי שינוי)
--   ומקובצות תחת journey_stage משותף אחד "יישור קו מול הרשויות".
--   opening_call — שלב-על נוסף, לקליטה חדשה בלבד, תלוי בשלושתם (multi-parent).
--
-- ‼ scope='person': עובדה של האדם, לא של ההתקשרות — בדיוק מה שמאפשר "הקמת תיק
-- במערכת" ו"יישור קו מחדש" ללקוח בלי engagement_id (ראה 30-engagements.sql:45-46,
-- "לקוח ותיק שמסמנים לו 'כבר מחובר לפייפרלס' עוד לפני שנפתחה לו התקשרות").
--
-- ‼ אין UPDATE ישיר על onboarding_steps מהדפדפן. שינוי סטטוס עובר תמיד דרך
-- advance_onboarding_step — כולל מתוך הפונקציות כאן (reopen_institution_alignment
-- קוראת לה במקום לשכפל את לוגיקת הסטטוס/היומן שלה).
--
-- ‼ עובדות מקצועיות: מנותב דרך propose_tax_facts/accept_tax_fact_change
-- (91-tax-fact-transactions.sql) — לא נכתב ישירות ל-clients. הרחבת ה-allowlist
-- כאן היא בדיוק מה ש-M1 השאיר בכוונה מחוץ לתחום: "יישור קו... יהפכו למנוהלים
-- כש-M2 יבנה את מקור יישור הקו" (ראה דוח M1). בקשת לקוח (הרשאת חיוב חסרה)
-- ממשיכה להשתמש ב-create_onboarding_request הקיימת — אין מנגנון טיוטה שני.

-- ── 1. עמודות מקצועיות חדשות על clients ─────────────────────────────────────
-- ‼ תוספתי בלבד, כולן nullable — לקוח קיים לא מושפע. "סוג תיק" במע"מ הוא
-- טקסט מתוך רשימה סגורה שנאכפת בצד הלקוח (לא CHECK כאן, כדי לא לנעול מיגרציה
-- עתידית אם הרשימה תתעדכן) — לא שדה חופשי לחלוטין, אך גם לא טבלת ייחוס נפרדת
-- (ראה הערת "לא לבנות פרויקט ייחוס ענק" בהנחיית M2).
alter table public.clients
  add column if not exists ni_balance numeric,
  add column if not exists ni_occupations jsonb,
  add column if not exists ni_debit_authorization boolean,
  add column if not exists vat_balance numeric,
  add column if not exists vat_debit_authorization boolean,
  add column if not exists vat_file_type text,
  add column if not exists vat_opening_date date,
  add column if not exists vat_primary_industry text,
  add column if not exists vat_last_report_period text,
  add column if not exists income_tax_balance numeric,
  add column if not exists income_tax_file_type text,
  add column if not exists income_tax_unit text,
  add column if not exists income_tax_economic_industry text,
  add column if not exists income_tax_debit_authorization boolean,
  add column if not exists withholding_detail text,
  add column if not exists capital_declaration_required boolean,
  add column if not exists capital_declaration_deadline date;

-- ── 2. שני שלבי-על חדשים ב-onboarding_steps ──────────────────────────────────
alter table public.onboarding_steps drop constraint if exists onboarding_steps_step_type_check;
alter table public.onboarding_steps add constraint onboarding_steps_step_type_check
  check (step_type = any (array[
    'representation','file_opening','representation_upgrade','release_letter','materials_received',
    'paperless_invite','paperless_connection','data_import','data_verification','retainer_authorization',
    'internal_setup','kyc_identification','first_month_review','intake_questionnaire','client_documents',
    'prev_accountant_details','custom_request',
    'institution_alignment_btl','institution_alignment_vat','institution_alignment_income','opening_call'
  ]));

create or replace function public.onboarding_track_for(p_step_type text)
returns text
language sql
immutable
as $function$
  select case p_step_type
    when 'representation' then 'authorities'
    when 'representation_upgrade' then 'authorities'
    when 'file_opening' then 'authorities'
    when 'institution_alignment_btl' then 'authorities'
    when 'institution_alignment_vat' then 'authorities'
    when 'institution_alignment_income' then 'authorities'
    when 'release_letter' then 'prev_accountant'
    when 'materials_received' then 'prev_accountant'
    when 'prev_accountant_details' then 'prev_accountant'
    when 'paperless_invite' then 'tools'
    when 'paperless_connection' then 'tools'
    when 'data_import' then 'tools'
    when 'data_verification' then 'tools'
    when 'client_documents' then 'tools'
    when 'retainer_authorization' then 'payment'
    when 'internal_setup' then 'internal'
    when 'kyc_identification' then 'internal'
    when 'intake_questionnaire' then 'internal'
    when 'first_month_review' then 'review'
    when 'opening_call' then 'review'
    when 'custom_request' then 'custom'
    else 'custom' end;
$function$;

-- ── 3. יצירת/וידוא שלבי יישור הקו — יכולת אחת, שלושה הקשרים ─────────────────
-- אידמפוטנטי: אותו דפוס בדיוק כמו generate_onboarding_steps — "כבר קיים? לא
-- יוצרים שוב". p_engagement_id יכול להיות null (לקוח ותיק/פעיל בלי התקשרות
-- פתוחה). p_include_opening_call=true רק בקליטה חדשה.
create or replace function public.ensure_institution_alignment_steps(
  p_client_id text,
  p_engagement_id text default null,
  p_include_opening_call boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_owner uuid;
  v_stage_id text;
  v_btl_id text;
  v_vat_id text;
  v_income_id text;
  v_call_id text;
  v_created int := 0;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'unauthenticated'); end if;
  select user_id into v_owner from public.clients where id = p_client_id;
  if v_owner is null then return jsonb_build_object('ok', false, 'error', 'client_not_found'); end if;
  if v_owner <> v_uid then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;

  select id into v_stage_id from public.journey_stages
   where client_id = p_client_id and title = 'יישור קו מול הרשויות' limit 1;
  if v_stage_id is null then
    insert into public.journey_stages (user_id, client_id, engagement_id, title, sort_order)
    values (v_uid, p_client_id, p_engagement_id, 'יישור קו מול הרשויות', 5)
    returning id into v_stage_id;
  end if;

  select id into v_btl_id from public.onboarding_steps
   where client_id = p_client_id and step_type = 'institution_alignment_btl' and status <> 'cancelled' limit 1;
  if v_btl_id is null then
    insert into public.onboarding_steps
      (user_id, engagement_id, client_id, step_type, track, scope, status, ball, stage_id, required_for_close, payload)
    values
      (v_uid, p_engagement_id, p_client_id, 'institution_alignment_btl', 'authorities', 'person', 'pending', 'me',
       v_stage_id, false, jsonb_build_object('institution', 'btl'))
    returning id into v_btl_id;
    v_created := v_created + 1;
  end if;

  select id into v_vat_id from public.onboarding_steps
   where client_id = p_client_id and step_type = 'institution_alignment_vat' and status <> 'cancelled' limit 1;
  if v_vat_id is null then
    insert into public.onboarding_steps
      (user_id, engagement_id, client_id, step_type, track, scope, status, ball, stage_id, required_for_close, payload)
    values
      (v_uid, p_engagement_id, p_client_id, 'institution_alignment_vat', 'authorities', 'person', 'pending', 'me',
       v_stage_id, false, jsonb_build_object('institution', 'vat'))
    returning id into v_vat_id;
    v_created := v_created + 1;
  end if;

  select id into v_income_id from public.onboarding_steps
   where client_id = p_client_id and step_type = 'institution_alignment_income' and status <> 'cancelled' limit 1;
  if v_income_id is null then
    insert into public.onboarding_steps
      (user_id, engagement_id, client_id, step_type, track, scope, status, ball, stage_id, required_for_close, payload)
    values
      (v_uid, p_engagement_id, p_client_id, 'institution_alignment_income', 'authorities', 'person', 'pending', 'me',
       v_stage_id, false, jsonb_build_object('institution', 'income'))
    returning id into v_income_id;
    v_created := v_created + 1;
  end if;

  if p_include_opening_call then
    select id into v_call_id from public.onboarding_steps
     where client_id = p_client_id and step_type = 'opening_call' and status <> 'cancelled' limit 1;
    if v_call_id is null then
      insert into public.onboarding_steps
        (user_id, engagement_id, client_id, step_type, track, scope, status, ball, required_for_close, payload)
      values
        (v_uid, p_engagement_id, p_client_id, 'opening_call', 'review', 'person', 'locked', 'me',
         false, jsonb_build_object('clarifications', '[]'::jsonb))
      returning id into v_call_id;
      v_created := v_created + 1;
      -- תלות מרובת-הורים: פתוחה רק אחרי שלושת המוסדות (78-multi-parent-dependencies.sql)
      insert into public.onboarding_step_dependencies (step_id, depends_on_step_id, user_id)
      values (v_call_id, v_btl_id, v_uid), (v_call_id, v_vat_id, v_uid), (v_call_id, v_income_id, v_uid)
      on conflict do nothing;
    end if;
  end if;

  return jsonb_build_object(
    'ok', true, 'created', v_created, 'stageId', v_stage_id,
    'btlStepId', v_btl_id, 'vatStepId', v_vat_id, 'incomeStepId', v_income_id, 'openingCallStepId', v_call_id
  );
end;
$function$;

revoke all on function public.ensure_institution_alignment_steps(text, text, boolean) from public, anon;
grant execute on function public.ensure_institution_alignment_steps(text, text, boolean) to authenticated;

-- ── 4. ריצה מחדש — לא פותחת קליטה חדשה, שומרת היסטוריה ──────────────────────
-- "בצע יישור קו מחדש": מצלמת את payload הנוכחי (collected/exceptions/checkedAt)
-- לתוך payload.history, ואז מפעילה 'reopen' דרך advance_onboarding_step הקיימת —
-- אותה נקודת כתיבה יחידה לסטטוס, אותו יומן. לא נוגעת ב-clients (שם כבר יושב
-- הערך המקובל האחרון; ריצה חדשה רק *מציעה* עדכון דרכו של M1, לא מוחקת את הישן).
create or replace function public.reopen_institution_alignment(p_step_id text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  s public.onboarding_steps%rowtype;
  v_history jsonb;
  v_snapshot jsonb;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'unauthenticated'); end if;
  select * into s from public.onboarding_steps where id = p_step_id;
  if s.id is null then return jsonb_build_object('ok', false, 'error', 'step_not_found'); end if;
  if s.user_id <> v_uid then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;
  if s.step_type not in ('institution_alignment_btl','institution_alignment_vat','institution_alignment_income') then
    return jsonb_build_object('ok', false, 'error', 'not_an_institution_step');
  end if;

  v_snapshot := jsonb_build_object(
    'checkedAt', s.payload->'checkedAt',
    'collected', coalesce(s.payload->'collected', '{}'::jsonb),
    'exceptions', coalesce(s.payload->'exceptions', '{}'::jsonb)
  );
  v_history := coalesce(s.payload->'history', '[]'::jsonb) || jsonb_build_array(v_snapshot);

  return public.advance_onboarding_step(p_step_id, 'reopen', jsonb_build_object('history', v_history));
end;
$function$;

revoke all on function public.reopen_institution_alignment(text) from public, anon;
grant execute on function public.reopen_institution_alignment(text) to authenticated;

-- ── 5. הרחבת ה-allowlist של עובדות מקצועיות (M1) ────────────────────────────
-- אותה פונקציה מ-91-tax-fact-transactions.sql, מוגדרת מחדש עם ענפים נוספים
-- בלבד. שדות שכבר היו קיימים על clients (vatFrequency/pitAdvance*/bookStatus/
-- withholdingRate/hasExemptFromWithholding/niAdvanceMonthly/taxOfficeName)
-- היו בכוונה מחוץ ל-allowlist ב-M1 — "יהפכו למנוהלים כש-M2 יבנה את מקור יישור
-- הקו" (ראה דוח M1). זה הרגע הזה.
create or replace function public._tax_fact_field_op(
  p_client_id text,
  p_key text,
  p_write boolean,
  p_value jsonb,
  p_source text default null,
  out out_current jsonb,
  out out_ok boolean
)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_meta jsonb;
begin
  out_ok := true;
  v_meta := jsonb_build_object(
    p_key, jsonb_build_object(
      'source', p_source,
      'syncedAt', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
    )
  );

  case p_key
    when 'familyStatus' then
      select to_jsonb(family_status) into out_current from public.clients where id = p_client_id;
      if p_write then update public.clients set family_status = p_value #>> '{}', field_meta = coalesce(field_meta,'{}'::jsonb) || v_meta where id = p_client_id; end if;
    when 'isNewImmigrant' then
      select to_jsonb(is_new_immigrant) into out_current from public.clients where id = p_client_id;
      if p_write then update public.clients set is_new_immigrant = (p_value #>> '{}')::boolean, field_meta = coalesce(field_meta,'{}'::jsonb) || v_meta where id = p_client_id; end if;
    when 'aliyahYear' then
      select to_jsonb(aliyah_year) into out_current from public.clients where id = p_client_id;
      if p_write then update public.clients set aliyah_year = (p_value #>> '{}')::integer, field_meta = coalesce(field_meta,'{}'::jsonb) || v_meta where id = p_client_id; end if;
    when 'isReturningResident' then
      select to_jsonb(is_returning_resident) into out_current from public.clients where id = p_client_id;
      if p_write then update public.clients set is_returning_resident = (p_value #>> '{}')::boolean, field_meta = coalesce(field_meta,'{}'::jsonb) || v_meta where id = p_client_id; end if;
    when 'disabilityPercentage' then
      select to_jsonb(disability_percentage) into out_current from public.clients where id = p_client_id;
      if p_write then update public.clients set disability_percentage = (p_value #>> '{}')::numeric, field_meta = coalesce(field_meta,'{}'::jsonb) || v_meta where id = p_client_id; end if;
    when 'hasAcademicDegree' then
      select to_jsonb(has_academic_degree) into out_current from public.clients where id = p_client_id;
      if p_write then update public.clients set has_academic_degree = (p_value #>> '{}')::boolean, field_meta = coalesce(field_meta,'{}'::jsonb) || v_meta where id = p_client_id; end if;
    when 'academicDegreeYear' then
      select to_jsonb(academic_degree_year) into out_current from public.clients where id = p_client_id;
      if p_write then update public.clients set academic_degree_year = (p_value #>> '{}')::integer, field_meta = coalesce(field_meta,'{}'::jsonb) || v_meta where id = p_client_id; end if;
    when 'completedIdf' then
      select to_jsonb(completed_idf) into out_current from public.clients where id = p_client_id;
      if p_write then update public.clients set completed_idf = (p_value #>> '{}')::boolean, field_meta = coalesce(field_meta,'{}'::jsonb) || v_meta where id = p_client_id; end if;
    when 'idfReleaseYear' then
      select to_jsonb(idf_release_year) into out_current from public.clients where id = p_client_id;
      if p_write then update public.clients set idf_release_year = (p_value #>> '{}')::integer, field_meta = coalesce(field_meta,'{}'::jsonb) || v_meta where id = p_client_id; end if;
    when 'completedNationalService' then
      select to_jsonb(completed_national_service) into out_current from public.clients where id = p_client_id;
      if p_write then update public.clients set completed_national_service = (p_value #>> '{}')::boolean, field_meta = coalesce(field_meta,'{}'::jsonb) || v_meta where id = p_client_id; end if;
    when 'nationalServiceYear' then
      select to_jsonb(national_service_year) into out_current from public.clients where id = p_client_id;
      if p_write then update public.clients set national_service_year = (p_value #>> '{}')::integer, field_meta = coalesce(field_meta,'{}'::jsonb) || v_meta where id = p_client_id; end if;
    when 'donationsAnnual' then
      select to_jsonb(donations_annual) into out_current from public.clients where id = p_client_id;
      if p_write then update public.clients set donations_annual = (p_value #>> '{}')::numeric, field_meta = coalesce(field_meta,'{}'::jsonb) || v_meta where id = p_client_id; end if;
    when 'lifeInsuranceAnnual' then
      select to_jsonb(life_insurance_annual) into out_current from public.clients where id = p_client_id;
      if p_write then update public.clients set life_insurance_annual = (p_value #>> '{}')::numeric, field_meta = coalesce(field_meta,'{}'::jsonb) || v_meta where id = p_client_id; end if;
    when 'hasLifeInsurance' then
      select to_jsonb(has_life_insurance) into out_current from public.clients where id = p_client_id;
      if p_write then update public.clients set has_life_insurance = (p_value #>> '{}')::boolean, field_meta = coalesce(field_meta,'{}'::jsonb) || v_meta where id = p_client_id; end if;
    when 'isFamilyCompanyMember' then
      select to_jsonb(is_family_company_member) into out_current from public.clients where id = p_client_id;
      if p_write then update public.clients set is_family_company_member = (p_value #>> '{}')::boolean, field_meta = coalesce(field_meta,'{}'::jsonb) || v_meta where id = p_client_id; end if;
    when 'isForeignControllingShareholder' then
      select to_jsonb(is_foreign_controlling_shareholder) into out_current from public.clients where id = p_client_id;
      if p_write then update public.clients set is_foreign_controlling_shareholder = (p_value #>> '{}')::boolean, field_meta = coalesce(field_meta,'{}'::jsonb) || v_meta where id = p_client_id; end if;
    when 'isKibbutzMember' then
      select to_jsonb(is_kibbutz_member) into out_current from public.clients where id = p_client_id;
      if p_write then update public.clients set is_kibbutz_member = (p_value #>> '{}')::boolean, field_meta = coalesce(field_meta,'{}'::jsonb) || v_meta where id = p_client_id; end if;
    when 'isSubstantialShareholder' then
      select to_jsonb(is_substantial_shareholder) into out_current from public.clients where id = p_client_id;
      if p_write then update public.clients set is_substantial_shareholder = (p_value #>> '{}')::boolean, field_meta = coalesce(field_meta,'{}'::jsonb) || v_meta where id = p_client_id; end if;
    when 'hasResidentialProperty' then
      select to_jsonb(has_residential_property) into out_current from public.clients where id = p_client_id;
      if p_write then update public.clients set has_residential_property = (p_value #>> '{}')::boolean, field_meta = coalesce(field_meta,'{}'::jsonb) || v_meta where id = p_client_id; end if;
    when 'numberOfProperties' then
      select to_jsonb(number_of_properties) into out_current from public.clients where id = p_client_id;
      if p_write then update public.clients set number_of_properties = (p_value #>> '{}')::integer, field_meta = coalesce(field_meta,'{}'::jsonb) || v_meta where id = p_client_id; end if;
    when 'hasCapitalIncome' then
      select to_jsonb(has_capital_income) into out_current from public.clients where id = p_client_id;
      if p_write then update public.clients set has_capital_income = (p_value #>> '{}')::boolean, field_meta = coalesce(field_meta,'{}'::jsonb) || v_meta where id = p_client_id; end if;
    when 'hasGamblingIncome' then
      select to_jsonb(has_gambling_income) into out_current from public.clients where id = p_client_id;
      if p_write then update public.clients set has_gambling_income = (p_value #>> '{}')::boolean, field_meta = coalesce(field_meta,'{}'::jsonb) || v_meta where id = p_client_id; end if;
    when 'hasForeignAssets' then
      select to_jsonb(has_foreign_assets) into out_current from public.clients where id = p_client_id;
      if p_write then update public.clients set has_foreign_assets = (p_value #>> '{}')::boolean, field_meta = coalesce(field_meta,'{}'::jsonb) || v_meta where id = p_client_id; end if;
    when 'spouseWorking' then
      select to_jsonb(spouse_working) into out_current from public.clients where id = p_client_id;
      if p_write then update public.clients set spouse_working = (p_value #>> '{}')::boolean, field_meta = coalesce(field_meta,'{}'::jsonb) || v_meta where id = p_client_id; end if;
    when 'rentalTaxTrack' then
      select to_jsonb(rental_tax_track) into out_current from public.clients where id = p_client_id;
      if p_write then update public.clients set rental_tax_track = p_value #>> '{}', field_meta = coalesce(field_meta,'{}'::jsonb) || v_meta where id = p_client_id; end if;
    when 'hasInvestments' then
      select to_jsonb(has_investments) into out_current from public.clients where id = p_client_id;
      if p_write then update public.clients set has_investments = (p_value #>> '{}')::boolean, field_meta = coalesce(field_meta,'{}'::jsonb) || v_meta where id = p_client_id; end if;
    when 'hasPension' then
      select to_jsonb(has_pension) into out_current from public.clients where id = p_client_id;
      if p_write then update public.clients set has_pension = (p_value #>> '{}')::boolean, field_meta = coalesce(field_meta,'{}'::jsonb) || v_meta where id = p_client_id; end if;
    when 'taxFiles' then
      select to_jsonb(tax_files) into out_current from public.clients where id = p_client_id;
      if p_write then update public.clients set tax_files = p_value, field_meta = coalesce(field_meta,'{}'::jsonb) || v_meta where id = p_client_id; end if;
    when 'bankAccounts' then
      select to_jsonb(bank_accounts) into out_current from public.clients where id = p_client_id;
      if p_write then update public.clients set bank_accounts = p_value, field_meta = coalesce(field_meta,'{}'::jsonb) || v_meta where id = p_client_id; end if;
    when 'investmentAccounts' then
      select to_jsonb(investment_accounts) into out_current from public.clients where id = p_client_id;
      if p_write then update public.clients set investment_accounts = p_value, field_meta = coalesce(field_meta,'{}'::jsonb) || v_meta where id = p_client_id; end if;
    when 'children' then
      select to_jsonb(children) into out_current from public.clients where id = p_client_id;
      if p_write then update public.clients set children = p_value, field_meta = coalesce(field_meta,'{}'::jsonb) || v_meta where id = p_client_id; end if;
    when 'employers' then
      select to_jsonb(employers) into out_current from public.clients where id = p_client_id;
      if p_write then update public.clients set employers = p_value, field_meta = coalesce(field_meta,'{}'::jsonb) || v_meta where id = p_client_id; end if;
    when 'pensionFunds' then
      select to_jsonb(pension_funds) into out_current from public.clients where id = p_client_id;
      if p_write then update public.clients set pension_funds = p_value, field_meta = coalesce(field_meta,'{}'::jsonb) || v_meta where id = p_client_id; end if;
    -- ── M2: שדות שהיו בכוונה מחוץ ל-allowlist ב-M1 (טריטוריית יישור קו) ──
    when 'vatFrequency' then
      select to_jsonb(vat_frequency) into out_current from public.clients where id = p_client_id;
      if p_write then update public.clients set vat_frequency = p_value #>> '{}', field_meta = coalesce(field_meta,'{}'::jsonb) || v_meta where id = p_client_id; end if;
    when 'pitAdvancePercent' then
      select to_jsonb(pit_advance_percent) into out_current from public.clients where id = p_client_id;
      if p_write then update public.clients set pit_advance_percent = (p_value #>> '{}')::numeric, field_meta = coalesce(field_meta,'{}'::jsonb) || v_meta where id = p_client_id; end if;
    when 'pitAdvanceFrequency' then
      select to_jsonb(pit_advance_frequency) into out_current from public.clients where id = p_client_id;
      if p_write then update public.clients set pit_advance_frequency = p_value #>> '{}', field_meta = coalesce(field_meta,'{}'::jsonb) || v_meta where id = p_client_id; end if;
    when 'bookStatus' then
      select to_jsonb(book_status) into out_current from public.clients where id = p_client_id;
      if p_write then update public.clients set book_status = p_value #>> '{}', field_meta = coalesce(field_meta,'{}'::jsonb) || v_meta where id = p_client_id; end if;
    when 'withholdingRate' then
      select to_jsonb(withholding_rate) into out_current from public.clients where id = p_client_id;
      if p_write then update public.clients set withholding_rate = (p_value #>> '{}')::numeric, field_meta = coalesce(field_meta,'{}'::jsonb) || v_meta where id = p_client_id; end if;
    when 'hasExemptFromWithholding' then
      select to_jsonb(has_exempt_from_withholding) into out_current from public.clients where id = p_client_id;
      if p_write then update public.clients set has_exempt_from_withholding = (p_value #>> '{}')::boolean, field_meta = coalesce(field_meta,'{}'::jsonb) || v_meta where id = p_client_id; end if;
    when 'niAdvanceMonthly' then
      select to_jsonb(ni_advance_monthly) into out_current from public.clients where id = p_client_id;
      if p_write then update public.clients set ni_advance_monthly = (p_value #>> '{}')::numeric, field_meta = coalesce(field_meta,'{}'::jsonb) || v_meta where id = p_client_id; end if;
    when 'taxOfficeName' then
      select to_jsonb(tax_office_name) into out_current from public.clients where id = p_client_id;
      if p_write then update public.clients set tax_office_name = p_value #>> '{}', field_meta = coalesce(field_meta,'{}'::jsonb) || v_meta where id = p_client_id; end if;
    -- ── M2: שדות חדשים לחלוטין (עמודות סעיף 1 למעלה) ──
    when 'niBalance' then
      select to_jsonb(ni_balance) into out_current from public.clients where id = p_client_id;
      if p_write then update public.clients set ni_balance = (p_value #>> '{}')::numeric, field_meta = coalesce(field_meta,'{}'::jsonb) || v_meta where id = p_client_id; end if;
    when 'niOccupations' then
      select to_jsonb(ni_occupations) into out_current from public.clients where id = p_client_id;
      if p_write then update public.clients set ni_occupations = p_value, field_meta = coalesce(field_meta,'{}'::jsonb) || v_meta where id = p_client_id; end if;
    when 'niDebitAuthorization' then
      select to_jsonb(ni_debit_authorization) into out_current from public.clients where id = p_client_id;
      if p_write then update public.clients set ni_debit_authorization = (p_value #>> '{}')::boolean, field_meta = coalesce(field_meta,'{}'::jsonb) || v_meta where id = p_client_id; end if;
    when 'vatBalance' then
      select to_jsonb(vat_balance) into out_current from public.clients where id = p_client_id;
      if p_write then update public.clients set vat_balance = (p_value #>> '{}')::numeric, field_meta = coalesce(field_meta,'{}'::jsonb) || v_meta where id = p_client_id; end if;
    when 'vatDebitAuthorization' then
      select to_jsonb(vat_debit_authorization) into out_current from public.clients where id = p_client_id;
      if p_write then update public.clients set vat_debit_authorization = (p_value #>> '{}')::boolean, field_meta = coalesce(field_meta,'{}'::jsonb) || v_meta where id = p_client_id; end if;
    when 'vatFileType' then
      select to_jsonb(vat_file_type) into out_current from public.clients where id = p_client_id;
      if p_write then update public.clients set vat_file_type = p_value #>> '{}', field_meta = coalesce(field_meta,'{}'::jsonb) || v_meta where id = p_client_id; end if;
    when 'vatOpeningDate' then
      select to_jsonb(vat_opening_date) into out_current from public.clients where id = p_client_id;
      if p_write then update public.clients set vat_opening_date = (p_value #>> '{}')::date, field_meta = coalesce(field_meta,'{}'::jsonb) || v_meta where id = p_client_id; end if;
    when 'vatPrimaryIndustry' then
      select to_jsonb(vat_primary_industry) into out_current from public.clients where id = p_client_id;
      if p_write then update public.clients set vat_primary_industry = p_value #>> '{}', field_meta = coalesce(field_meta,'{}'::jsonb) || v_meta where id = p_client_id; end if;
    when 'vatLastReportPeriod' then
      select to_jsonb(vat_last_report_period) into out_current from public.clients where id = p_client_id;
      if p_write then update public.clients set vat_last_report_period = p_value #>> '{}', field_meta = coalesce(field_meta,'{}'::jsonb) || v_meta where id = p_client_id; end if;
    when 'incomeTaxBalance' then
      select to_jsonb(income_tax_balance) into out_current from public.clients where id = p_client_id;
      if p_write then update public.clients set income_tax_balance = (p_value #>> '{}')::numeric, field_meta = coalesce(field_meta,'{}'::jsonb) || v_meta where id = p_client_id; end if;
    when 'incomeTaxFileType' then
      select to_jsonb(income_tax_file_type) into out_current from public.clients where id = p_client_id;
      if p_write then update public.clients set income_tax_file_type = p_value #>> '{}', field_meta = coalesce(field_meta,'{}'::jsonb) || v_meta where id = p_client_id; end if;
    when 'incomeTaxUnit' then
      select to_jsonb(income_tax_unit) into out_current from public.clients where id = p_client_id;
      if p_write then update public.clients set income_tax_unit = p_value #>> '{}', field_meta = coalesce(field_meta,'{}'::jsonb) || v_meta where id = p_client_id; end if;
    when 'incomeTaxEconomicIndustry' then
      select to_jsonb(income_tax_economic_industry) into out_current from public.clients where id = p_client_id;
      if p_write then update public.clients set income_tax_economic_industry = p_value #>> '{}', field_meta = coalesce(field_meta,'{}'::jsonb) || v_meta where id = p_client_id; end if;
    when 'incomeTaxDebitAuthorization' then
      select to_jsonb(income_tax_debit_authorization) into out_current from public.clients where id = p_client_id;
      if p_write then update public.clients set income_tax_debit_authorization = (p_value #>> '{}')::boolean, field_meta = coalesce(field_meta,'{}'::jsonb) || v_meta where id = p_client_id; end if;
    when 'withholdingDetail' then
      select to_jsonb(withholding_detail) into out_current from public.clients where id = p_client_id;
      if p_write then update public.clients set withholding_detail = p_value #>> '{}', field_meta = coalesce(field_meta,'{}'::jsonb) || v_meta where id = p_client_id; end if;
    when 'capitalDeclarationRequired' then
      select to_jsonb(capital_declaration_required) into out_current from public.clients where id = p_client_id;
      if p_write then update public.clients set capital_declaration_required = (p_value #>> '{}')::boolean, field_meta = coalesce(field_meta,'{}'::jsonb) || v_meta where id = p_client_id; end if;
    when 'capitalDeclarationDeadline' then
      select to_jsonb(capital_declaration_deadline) into out_current from public.clients where id = p_client_id;
      if p_write then update public.clients set capital_declaration_deadline = (p_value #>> '{}')::date, field_meta = coalesce(field_meta,'{}'::jsonb) || v_meta where id = p_client_id; end if;
    else
      out_ok := false;
  end case;
end;
$function$;

revoke all on function public._tax_fact_field_op(text, text, boolean, jsonb, text) from public, anon, authenticated;
