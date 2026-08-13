-- ─── 91: תיק מס — הפיכת אישור/עריכה ידנית לפעולה טרנזקציונית אחת ───────────
-- מהלך מתקן ל-90-tax-fact-reconciliation.sql. לא עורך את המיגרציה הקודמת —
-- זו תוספת קדימה (CREATE OR REPLACE על אותם שמות פונקציות).
--
-- ‼ הבעיה שתוקנה: accept_tax_fact_change בגרסה הקודמת סימנה 'accepted' בלבד;
-- הכתיבה בפועל ל-clients קרתה בצד הלקוח (updateClient), בקריאה נפרדת,
-- *לפני* קריאת ה-RPC. שתי קריאות רשת נפרדות = לא אטומי: כישלון בקריאה
-- השנייה (אחרי שה-clients כבר נכתב) משאיר עובדה מקובלת בלי סטטוס accepted
-- שמתאים לה, וההפך. אותה בעיה בדיוק ב-record_manual_fact_change.
--
-- ‼ הפתרון: כל הכתיבה — קריאת הערך הנוכחי, בדיקת עדכניות, כתיבת clients,
-- עדכון field_meta, וסימון הסטטוס/ההיסטוריה — קורית עכשיו בתוך קריאת RPC
-- אחת, בתוך הטרנזקציה המשתמעת של הפונקציה. בלוק EXCEPTION בגוף הפונקציה
-- יוצר SAVEPOINT אוטומטי בתחילת הפונקציה; כל שגיאה (כולל מפתח שדה לא
-- מוכר) מגלגלת הכל אחורה ומחזירה {ok:false}, בלי כתיבה חלקית.
--
-- ‼ בטיחות שדות: אין SQL דינמי על שם עמודה. _tax_fact_field_op היא מיפוי
-- קשיח (allowlist) בין מפתח לוגי (camelCase, כמו בקוד ה-TS) לעמודת clients
-- ספציפית וטיפוסה — "fail closed": מפתח לא ברשימה מפיל את כל הפעולה.
-- הרשימה כוללת כל שדה מקצועי שנכתב היום דרך המנגנון: הדיפים של
-- SyncConfirmation, שני שדות העריכה הידנית בתיק המס, וכל השדות שנכתבים
-- מתוך CardSectionEditor (עורך "עדכן בכרטיס" בתוך השאלון — ראה בהמשך).
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
    -- ── עמודות jsonb (מערכים) — הערך מוצב כמות שהוא, בלי חילוץ סקלרי ──
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
    else
      out_ok := false;
  end case;
end;
$function$;

revoke all on function public._tax_fact_field_op(text, text, boolean, jsonb, text) from public, anon, authenticated;

-- ── 2'. אישור — עכשיו פעולה טרנזקציונית אחת: נעילת ההצעה + הלקוח, בדיקת
-- עדכניות מול תמונת המצב שנשמרה בהצעה, כתיבת clients+field_meta, וסימון
-- accepted — הכל בתוך אותה קריאת RPC. EXCEPTION בגוף הפונקציה = SAVEPOINT
-- אוטומטי; כל כשל מגלגל הכל אחורה. מחזירה גם את הלקוח המעודכן, כדי
-- שהלקוח (הדפדפן) לא יצטרך יותר לכתוב בעצמו.
create or replace function public.accept_tax_fact_change(p_change_id text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  r public.tax_fact_changes%rowtype;
  v_patch jsonb;
  v_old_patch jsonb;
  k text;
  v_current jsonb;
  v_ok boolean;
  v_stale text[] := '{}';
  v_client jsonb;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'unauthenticated'); end if;

  select * into r from public.tax_fact_changes
   where id = p_change_id and user_id = v_uid and status = 'pending'
   for update;

  if r.id is null then
    return jsonb_build_object('ok', false, 'error', 'not_pending_or_not_found');
  end if;

  -- נועלים גם את שורת הלקוח (ובבדיקה — מוודאים בעלות, הגנה כפולה מעבר ל-RLS)
  -- למשך כל הפעולה, כדי שכתיבה מתחרה על אותו לקוח תמתין לתור.
  perform 1 from public.clients where id = r.client_id and user_id = v_uid for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'client_not_found');
  end if;

  v_patch     := r.new_value -> 'patch';
  v_old_patch := r.old_value -> 'patch';

  -- ── בדיקת עדכניות (שמרנית) ──
  -- ‼ ההצעה נוצרה כשהערך המקובל היה X (old_value.patch, תמונת מצב שנלקחה
  -- בזמן ההצעה). אם הערך המקובל היום שונה מ-X — מישהו/משהו כבר שינה אותו
  -- אחרי שההצעה נוצרה (עריכה ידנית, הצעה אחרת שאושרה וכו'). לא דורסים בשקט:
  -- ההצעה נשארת pending ומוחזרת שגיאה ברורה — דורש בדיקה מחדש של הרו"ח.
  if v_old_patch is not null then
    for k in select jsonb_object_keys(v_old_patch) loop
      select f.out_current, f.out_ok into v_current, v_ok
        from public._tax_fact_field_op(r.client_id, k, false, null, null) f;
      if v_ok and v_current is distinct from (v_old_patch -> k) then
        v_stale := array_append(v_stale, k);
      end if;
    end loop;
  end if;

  if array_length(v_stale, 1) > 0 then
    return jsonb_build_object('ok', false, 'error', 'stale_conflict', 'staleFields', to_jsonb(v_stale));
  end if;

  -- ── כתיבה בפועל — allowlist בלבד, fail-closed על מפתח לא מוכר ──
  if v_patch is not null then
    for k in select jsonb_object_keys(v_patch) loop
      select f.out_ok into v_ok
        from public._tax_fact_field_op(r.client_id, k, true, v_patch -> k, r.source) f;
      if not v_ok then
        raise exception 'unknown_field_key: %', k;
      end if;
    end loop;
  end if;

  update public.tax_fact_changes
     set status = 'accepted', decided_by = v_uid, decided_at = now()
   where id = p_change_id;

  -- מרעננים את r אחרי העדכון — כדי שהתשובה תשקף גם decided_by/decided_at
  -- בפועל, ולא את השורה כפי שנקראה לפני האישור.
  select * into r from public.tax_fact_changes where id = p_change_id;
  select to_jsonb(c) into v_client from public.clients c where c.id = r.client_id;

  return jsonb_build_object('ok', true, 'change', to_jsonb(r), 'client', v_client);
exception when others then
  -- בלוק EXCEPTION בגוף הפונקציה = SAVEPOINT אוטומטי בתחילתה. כל שגיאה
  -- (כולל unknown_field_key שהועלתה למעלה) מגלגלת אחורה כל UPDATE שכבר רץ
  -- בקריאה הזו — clients, field_meta וה-status נשארים בדיוק כמו שהיו.
  return jsonb_build_object('ok', false, 'error', sqlerrm);
end;
$function$;

-- ── 4'. עריכה ידנית — עכשיו גם היא פעולה טרנזקציונית אחת: נעילת הלקוח,
-- כתיבת clients+field_meta דרך אותו allowlist, והוספת שורת ההיסטוריה
-- 'accepted' — הכל בקריאת RPC אחת. מחזירה גם את הלקוח המעודכן.
create or replace function public.record_manual_fact_change(
  p_client_id text,
  p_field_key text,
  p_label text,
  p_old_value jsonb,
  p_new_value jsonb,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_owner uuid;
  v_id text;
  v_patch jsonb := p_new_value -> 'patch';
  k text;
  v_ok boolean;
  v_client jsonb;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'unauthenticated'); end if;

  select user_id into v_owner from public.clients where id = p_client_id for update;
  if v_owner is null then return jsonb_build_object('ok', false, 'error', 'client_not_found'); end if;
  if v_owner <> v_uid then return jsonb_build_object('ok', false, 'error', 'forbidden'); end if;

  if v_patch is not null then
    for k in select jsonb_object_keys(v_patch) loop
      select f.out_ok into v_ok
        from public._tax_fact_field_op(p_client_id, k, true, v_patch -> k, 'manual') f;
      if not v_ok then
        raise exception 'unknown_field_key: %', k;
      end if;
    end loop;
  end if;

  insert into public.tax_fact_changes
    (user_id, client_id, field_key, label, old_value, new_value, source, status, decided_by, decided_at, note)
  values
    (v_uid, p_client_id, p_field_key, p_label, p_old_value, p_new_value, 'manual', 'accepted', v_uid, now(), p_note)
  returning id into v_id;

  select to_jsonb(c) into v_client from public.clients c where c.id = p_client_id;

  return jsonb_build_object('ok', true, 'id', v_id, 'client', v_client);
exception when others then
  return jsonb_build_object('ok', false, 'error', sqlerrm);
end;
$function$;

-- reject נשארת ללא שינוי מבחינת התנהגות (UPDATE יחיד כבר אטומי ולא נוגע
-- ב-clients בכלל) — מוגדרת מחדש כאן רק כדי שהמיגרציה הזו תישאר self-contained.
create or replace function public.reject_tax_fact_change(p_change_id text, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  r public.tax_fact_changes%rowtype;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'error', 'unauthenticated'); end if;

  update public.tax_fact_changes
     set status = 'rejected', decided_by = v_uid, decided_at = now(),
         note = coalesce(p_note, note)
   where id = p_change_id and user_id = v_uid and status = 'pending'
   returning * into r;

  if r.id is null then
    return jsonb_build_object('ok', false, 'error', 'not_pending_or_not_found');
  end if;

  return jsonb_build_object('ok', true, 'change', to_jsonb(r));
end;
$function$;

revoke all on function public.accept_tax_fact_change(text) from public, anon;
revoke all on function public.record_manual_fact_change(text, text, text, jsonb, jsonb, text) from public, anon;
revoke all on function public.reject_tax_fact_change(text, text) from public, anon;

grant execute on function public.accept_tax_fact_change(text) to authenticated;
grant execute on function public.record_manual_fact_change(text, text, text, jsonb, jsonb, text) to authenticated;
grant execute on function public.reject_tax_fact_change(text, text) to authenticated;
