CREATE OR REPLACE FUNCTION public._tax_fact_field_op(p_client_id text, p_key text, p_write boolean, p_value jsonb, p_source text DEFAULT NULL::text, OUT out_current jsonb, OUT out_ok boolean)
 RETURNS record
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    when 'withholdingStatus' then
      select to_jsonb(withholding_status) into out_current from public.clients where id = p_client_id;
      if p_write then update public.clients set withholding_status = p_value #>> '{}', field_meta = coalesce(field_meta,'{}'::jsonb) || v_meta where id = p_client_id; end if;
    when 'otherIncome' then
      select to_jsonb(other_income) into out_current from public.clients where id = p_client_id;
      if p_write then update public.clients set other_income = (p_value #>> '{}')::numeric, field_meta = coalesce(field_meta,'{}'::jsonb) || v_meta where id = p_client_id; end if;
    when 'rentalExpenses' then
      select to_jsonb(rental_expenses) into out_current from public.clients where id = p_client_id;
      if p_write then update public.clients set rental_expenses = (p_value #>> '{}')::numeric, field_meta = coalesce(field_meta,'{}'::jsonb) || v_meta where id = p_client_id; end if;
    when 'selfEmployedPensionAmount' then
      select to_jsonb(self_employed_pension_amount) into out_current from public.clients where id = p_client_id;
      if p_write then update public.clients set self_employed_pension_amount = (p_value #>> '{}')::numeric, field_meta = coalesce(field_meta,'{}'::jsonb) || v_meta where id = p_client_id; end if;
    when 'krenHashtalmutSE' then
      select to_jsonb(keren_hishtalmut_se) into out_current from public.clients where id = p_client_id;
      if p_write then update public.clients set keren_hishtalmut_se = (p_value #>> '{}')::numeric, field_meta = coalesce(field_meta,'{}'::jsonb) || v_meta where id = p_client_id; end if;
    when 'foreignTaxPaid' then
      select to_jsonb(foreign_tax_paid) into out_current from public.clients where id = p_client_id;
      if p_write then update public.clients set foreign_tax_paid = (p_value #>> '{}')::numeric, field_meta = coalesce(field_meta,'{}'::jsonb) || v_meta where id = p_client_id; end if;
    when 'hasForeignIncome' then
      select to_jsonb(has_foreign_income) into out_current from public.clients where id = p_client_id;
      if p_write then update public.clients set has_foreign_income = (p_value #>> '{}')::boolean, field_meta = coalesce(field_meta,'{}'::jsonb) || v_meta where id = p_client_id; end if;
    when 'foreignIncomeAnnual' then
      select to_jsonb(foreign_income_annual) into out_current from public.clients where id = p_client_id;
      if p_write then update public.clients set foreign_income_annual = (p_value #>> '{}')::numeric, field_meta = coalesce(field_meta,'{}'::jsonb) || v_meta where id = p_client_id; end if;
    when 'reserveCombatDaysPrevYear' then
      select to_jsonb(reserve_combat_days_prev_year) into out_current from public.clients where id = p_client_id;
      if p_write then update public.clients set reserve_combat_days_prev_year = (p_value #>> '{}')::integer, field_meta = coalesce(field_meta,'{}'::jsonb) || v_meta where id = p_client_id; end if;
    when 'hasCrypto' then
      select to_jsonb(has_crypto) into out_current from public.clients where id = p_client_id;
      if p_write then update public.clients set has_crypto = (p_value #>> '{}')::boolean, field_meta = coalesce(field_meta,'{}'::jsonb) || v_meta where id = p_client_id; end if;
    when 'businessDataStatus' then
      select to_jsonb(business_data_status) into out_current from public.clients where id = p_client_id;
      if p_write then update public.clients set business_data_status = p_value #>> '{}', field_meta = coalesce(field_meta,'{}'::jsonb) || v_meta where id = p_client_id; end if;
    when 'hasRentalIncome' then
      select to_jsonb(has_rental_income) into out_current from public.clients where id = p_client_id;
      if p_write then update public.clients set has_rental_income = (p_value #>> '{}')::boolean, field_meta = coalesce(field_meta,'{}'::jsonb) || v_meta where id = p_client_id; end if;
    when 'hasKrenHashtalmut' then
      select to_jsonb(has_kren_hashtalmut) into out_current from public.clients where id = p_client_id;
      if p_write then update public.clients set has_kren_hashtalmut = (p_value #>> '{}')::boolean, field_meta = coalesce(field_meta,'{}'::jsonb) || v_meta where id = p_client_id; end if;
    when 'hasDisabilityInsurance' then
      select to_jsonb(has_disability_insurance) into out_current from public.clients where id = p_client_id;
      if p_write then update public.clients set has_disability_insurance = (p_value #>> '{}')::boolean, field_meta = coalesce(field_meta,'{}'::jsonb) || v_meta where id = p_client_id; end if;
    when 'hasMedicalInsurance' then
      select to_jsonb(has_medical_insurance) into out_current from public.clients where id = p_client_id;
      if p_write then update public.clients set has_medical_insurance = (p_value #>> '{}')::boolean, field_meta = coalesce(field_meta,'{}'::jsonb) || v_meta where id = p_client_id; end if;
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
    when 'niIncomeBasisMonthly' then
      select to_jsonb(ni_income_basis_monthly) into out_current from public.clients where id = p_client_id;
      if p_write then update public.clients set ni_income_basis_monthly = (p_value #>> '{}')::numeric, field_meta = coalesce(field_meta,'{}'::jsonb) || v_meta where id = p_client_id; end if;
    when 'incomeTaxReportingStatus' then
      select to_jsonb(income_tax_reporting_status) into out_current from public.clients where id = p_client_id;
      if p_write then update public.clients set income_tax_reporting_status = p_value #>> '{}', field_meta = coalesce(field_meta,'{}'::jsonb) || v_meta where id = p_client_id; end if;
    else
      out_ok := false;
  end case;
end;
$function$

