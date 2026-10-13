-- ════════════════════════════════════════════════════════════════════════════
-- התאוששות מ-236 (קליטה והשלמת תיק המס) — נוצר ב-scripts/sql/236/make-rollback-236.mjs (לא לערוך ביד)
-- ════════════════════════════════════════════════════════════════════════════
-- ‼ מוחק את בקשות הקליטה, השאלות, התשובות והראיות שלהן (הקבצים עצמם נשארים בתיקיית המסמכים של הלקוח).
--   בייצור — רק לפני שלקוחות ענו; אחרי זה: להסתיר במסך (ראו מסמך השחרור), לא למחוק.
-- ‼ מחזיר את האילוץ, האינדקס ו-_tax_year_items של 230, ואת שש הפונקציות שהוזרקו (בסדר הפוך).
-- ‼ שאלון ישן שהמשרד החליף בקליטה נשאר מבוטל (זו החלטת המשרד); התשובות שלו לא נמחקות.
-- ‼ כרטיסי לקוחות לא משתנים: מה שנכנס לכרטיס מקליטה נכנס דרך tax_fact_changes, עם היסטוריה — ונשאר.

begin;

delete from public.tax_evidence where ask_id in (select id from public.tax_info_asks where item_key like 'intake.%');
delete from public.tax_year_facts where item_key like 'intake.%';
delete from public.tax_info_asks where item_key like 'intake.%';
delete from public.onboarding_steps where step_type = 'info_collection'
  and payload->>'parentStepId' in (select id from public.onboarding_steps where step_type = 'tax_file_intake');
delete from public.onboarding_steps where step_type = 'tax_file_intake';

drop function if exists public.ensure_tax_file_intake(text);
drop function if exists public.replace_legacy_intake(text);
drop function if exists public.intake_replaced_state(text);
drop function if exists public._legacy_intake_replaced(text);
drop index if exists public.onboarding_steps_tax_file_intake_open_idx;

alter table public.onboarding_steps drop constraint if exists onboarding_steps_step_type_check;
alter table public.onboarding_steps add constraint onboarding_steps_step_type_check
  check (step_type = any (array[
    'representation', 'file_opening', 'representation_upgrade', 'release_letter', 'rep_client_approval',
    'materials_received', 'paperless_invite', 'paperless_connection', 'paperless_tax_authority',
    'data_import', 'data_verification', 'retainer_authorization', 'internal_setup', 'kyc_identification',
    'first_month_review', 'intake_questionnaire', 'client_documents', 'prev_accountant_details',
    'custom_request', 'institution_alignment_btl', 'institution_alignment_vat',
    'institution_alignment_income', 'opening_call', 'authority_representation',
    'business_details',
    'tax_estimate', 'annual_return', 'info_collection',
    -- 230
    'wealth_declaration',
    -- ‼ 12.10.2026: גם הסוג של 236 — כדי שהחלה חוזרת של 230 אחריה לא תיכשל על שורות קליטה קיימות
    'tax_file_intake']));

drop index if exists public.onboarding_steps_person_type_idx;
create unique index onboarding_steps_person_type_idx on public.onboarding_steps (client_id, step_type)
  where scope = 'person' and status <> 'cancelled'
    and step_type <> all (array['custom_request', 'authority_representation', 'client_documents',
      'prev_accountant_details', 'release_letter', 'materials_received', 'intake_questionnaire',
      'retainer_authorization', 'business_details',
      'tax_estimate', 'annual_return', 'info_collection', 'wealth_declaration', 'tax_file_intake']);

create or replace function public._tax_year_items()
returns jsonb language sql immutable as $$
  select '{
    "household.maritalAtYearEnd":"confirm","household.children":"confirm","household.childDeferral":"detail","household.settlement":"confirm",
    "household.degree":"confirm","household.release":"confirm","household.creditChanges":"screener","household.degreeDocs":"document",
    "household.creditEmployer":"detail","household.alimonyPaid":"amount","salary.worked":"screener","salary.employers":"confirm",
    "salary.spouseIncomeEstimate":"amount","salary.form106":"document","salary.employerDetails":"detail","salary.payslipToDate":"document",
    "salary.amounts":"amount","business.active":"confirm","business.books":"document","business.profit":"amount",
    "business.selfDeposits":"amount","business.assetsChanged":"screener","business.assetDocs":"document","business.depreciation":"document",
    "business.inventory":"screener","business.inventoryCount":"document","business.employees":"screener","business.payrollReport":"document",
    "business.badDebts":"screener","business.badDebtDocs":"document","business.vehicle":"screener","business.vehicleDetails":"detail",
    "business.vehicleLicense":"document","business.vehicleExpenses":"amount","business.partnership":"screener","business.partnershipDocs":"document",
    "business.partners":"detail","business.rentsPremises":"screener","business.premisesLease":"document","business.priorDepreciation":"document",
    "business.microRegistration":"document","business.microTrack":"amount","business.microExclusions":"screener","business.microCoordination":"document",
    "business.forecast":"amount","business.oneOffs":"amount","niBenefits.received":"screener","niBenefits.cert":"document",
    "rent.properties":"confirm","rent.income":"amount","rent.incomeTotal":"amount","rent.expenses":"amount",
    "rent.contract":"document","rent.track":"detail","rent.singleApartment":"screener","rent.businessUse":"screener",
    "rent.businessUseDocs":"document","rent.businessUseAmounts":"amount","rent.coOwned":"screener","rent.coOwners":"detail",
    "rent.keyMoney":"screener","rent.keyMoneyDocs":"document","rent.ownRent":"screener","rent.ownRentDocs":"document",
    "rent.otherProperty":"screener","rent.otherPropertyDocs":"document","capital.accounts":"confirm","capital.form867":"document",
    "capital.amounts":"amount","capital.owner":"detail","capital.relatedParty":"screener","capital.totals":"amount",
    "capital.estimate":"amount","sales.sold":"screener","sales.transaction":"detail","sales.circumstances":"screener",
    "sales.buyer":"detail","sales.expenseDocs":"document","sales.specialDeal":"screener","sales.specialDocs":"document",
    "sales.officeChecks":"detail","sales.docs":"document","foreign.income":"screener","foreign.totals":"amount",
    "foreign.sourceDetails":"detail","foreign.statements":"document","foreign.securitiesSold":"screener","foreign.tradeReport":"document",
    "foreign.taxCert":"document","foreign.amounts":"amount","foreign.work":"screener","foreign.workDocs":"document",
    "foreign.rentalProperty":"screener","foreign.leaseDocs":"document","foreign.company":"screener","foreign.companyDocs":"document",
    "foreign.owner":"detail","foreign.taxRefund":"screener","savings.selfDeposits":"screener","savings.selfAmounts":"amount",
    "savings.fundDetails":"detail","savings.fundCerts":"document","savings.depositsEstimate":"amount","savings.insuranceAmounts":"amount",
    "savings.insuranceCert":"document","savings.insurance":"screener","donations.given":"screener","donations.amount":"amount",
    "donations.receipts":"document","companies.controlled":"screener","payments.advances":"amount","payments.withholding":"amount",
    "payments.niPaid":"amount","carryForward.balances":"amount","special.otherIncome":"amount","special.gambling":"amount",
    "special.reserveCombatDays":"amount","special.trust":"screener","special.kibbutz":"screener","special.reportablePosition":"screener",
    "special.partnership":"screener","special.nonResident":"screener","special.moneyAbroad":"screener","special.financialInstitution":"screener",
    "filing.refundAccount":"detail","filing.declarations":"detail","filing.identity":"detail","household.changesSince":"screener",
    "salary.changesSince":"screener","business.changesSince":"screener","niBenefits.changesSince":"screener","rent.changesSince":"screener",
    "capital.changesSince":"screener","sales.changesSince":"screener","foreign.changesSince":"screener","savings.changesSince":"screener",
    "donations.changesSince":"screener","wealth.household":"confirm","wealth.spouseSeparate":"detail","wealth.realEstate.list":"confirm",
    "wealth.realEstate.has":"screener","wealth.realEstate.details":"detail","wealth.realEstate.docs":"document","wealth.realEstate.total":"amount",
    "wealth.bank.accounts":"detail","wealth.bank.certs":"document","wealth.bank.foreign":"confirm","wealth.bank.total":"amount",
    "wealth.crypto.has":"screener","wealth.crypto.docs":"document","wealth.cash":"amount","wealth.funds.list":"confirm",
    "wealth.funds.has":"screener","wealth.funds.certs":"document","wealth.funds.total":"amount","wealth.securities.list":"confirm",
    "wealth.securities.has":"screener","wealth.securities.docs":"document","wealth.securities.total":"amount","wealth.loansGiven.has":"screener",
    "wealth.loansGiven.details":"detail","wealth.loansGiven.docs":"document","wealth.vehicles.has":"screener","wealth.vehicles.details":"detail",
    "wealth.vehicles.docs":"document","wealth.valuables.has":"screener","wealth.contents":"document","wealth.mortgage.has":"screener",
    "wealth.mortgage.docs":"document","wealth.loansReceived.has":"screener","wealth.loansReceived.details":"detail","wealth.liabilities.total":"amount",
    "wealth.business.books":"detail","wealth.companies.has":"screener","wealth.companies.docs":"document","wealth.business.total":"amount",
    "wealth.partD.has":"screener","wealth.partD.details":"detail","wealth.prevDeclaration":"document","wealth.since.sources":"detail",
    "wealth.since.uses":"detail","wealth.since.living":"detail"}'::jsonb
$$;

do $r236$
declare
  v_def text;
  v_a text; v_n text;
begin
  if to_regprocedure('public.reopen_intake(text)') is not null then
    v_def := pg_get_functiondef('public.reopen_intake(text)'::regprocedure);
    v_a := E'  if t.client_id is null then return false; end if;';
    v_n := E'  if t.client_id is null then return false; end if;\n  if public._legacy_intake_replaced(t.client_id) is not null then return false; end if; -- 236 · שאלון שהוחלף בקליטה';
    if position(v_n in v_def) > 0 then
      execute replace(v_def, v_n, v_a);
    end if;
  end if;
  if to_regprocedure('public.save_intake_answer(text, uuid, text, jsonb, jsonb, text, boolean)') is not null then
    v_def := pg_get_functiondef('public.save_intake_answer(text, uuid, text, jsonb, jsonb, text, boolean)'::regprocedure);
    v_a := E'  if t.client_id is null then return false; end if;';
    v_n := E'  if t.client_id is null then return false; end if;\n  if public._legacy_intake_replaced(t.client_id) is not null then return false; end if; -- 236 · שאלון שהוחלף בקליטה';
    if position(v_n in v_def) > 0 then
      execute replace(v_def, v_n, v_a);
    end if;
  end if;
  if to_regprocedure('public.start_intake(text)') is not null then
    v_def := pg_get_functiondef('public.start_intake(text)'::regprocedure);
    v_a := E'  if t.client_id is null then\n    raise exception ''invalid token'';\n  end if;';
    v_n := E'  if t.client_id is null then\n    raise exception ''invalid token'';\n  end if;\n  -- 236 · שאלון שהוחלף בקליטה: לא נפתח שוב — ההמשך בדף האישי\n  if public._legacy_intake_replaced(t.client_id) is not null then\n    raise exception ''intake_replaced'';\n  end if;';
    if position(v_n in v_def) > 0 then
      execute replace(v_def, v_n, v_a);
    end if;
  end if;
  if to_regprocedure('public.add_intake_questionnaire_step(text)') is not null then
    v_def := pg_get_functiondef('public.add_intake_questionnaire_step(text)'::regprocedure);
    v_a := E'  if public.step_removed_by_office(e.client_id, ''intake_questionnaire'', e.id) then';
    v_n := E'  -- 236 · קליטה פתוחה מכסה את השאלון הישן\n  if exists (select 1 from public.onboarding_steps t where t.client_id = e.client_id and t.step_type = ''tax_file_intake''\n             and t.status <> all (array[''completed'',''verified'',''skipped'',''cancelled'',''failed''])) then\n    return jsonb_build_object(''ok'', true, ''skipped'', ''covered_by_tax_file_intake'');\n  end if;\n  if public.step_removed_by_office(e.client_id, ''intake_questionnaire'', e.id) then';
    if position(v_n in v_def) > 0 then
      execute replace(v_def, v_n, v_a);
    end if;
  end if;
  if to_regprocedure('public.portal_submit_tax_info(text, uuid, jsonb)') is not null then
    v_def := pg_get_functiondef('public.portal_submit_tax_info(text, uuid, jsonb)'::regprocedure);
    v_a := E'v_per := case when v_ins->>''purpose'' = ''wealth'' /* 230 · הצהרת הון */';
    v_n := E'v_per := case when v_ins->>''purpose'' in (''wealth'', ''intake'') /* 230 · הצהרת הון */ /* 236 · קליטה */';
    if position(v_n in v_def) > 0 then
      execute replace(v_def, v_n, v_a);
    end if;
  end if;
  if to_regprocedure('public.add_tax_info_asks(text, jsonb)') is not null then
    v_def := pg_get_functiondef('public.add_tax_info_asks(text, jsonb)'::regprocedure);
    v_a := E'where ((z->>''itemKey'') like ''wealth.%'') <> (par.step_type = ''wealth_declaration'')) then';
    v_n := E'where ((z->>''itemKey'') like ''wealth.%'') <> (par.step_type = ''wealth_declaration'')\n                or ((z->>''itemKey'') like ''intake.%'') <> (par.step_type = ''tax_file_intake'')) then';
    if position(v_n in v_def) > 0 then
      execute replace(v_def, v_n, v_a);
    end if;
  end if;
  if to_regprocedure('public.add_tax_info_asks(text, jsonb)') is not null then
    v_def := pg_get_functiondef('public.add_tax_info_asks(text, jsonb)'::regprocedure);
    v_a := E'''title'', case when par.step_type = ''wealth_declaration'' then ''השלמת מידע להצהרת הון'' else ''השלמת מידע לשנת '' || v_year end))';
    v_n := E'''title'', case when par.step_type = ''wealth_declaration'' then ''השלמת מידע להצהרת הון'' when par.step_type = ''tax_file_intake'' then ''השלמת פרטים לתיק המס'' else ''השלמת מידע לשנת '' || v_year end))';
    if position(v_n in v_def) > 0 then
      execute replace(v_def, v_n, v_a);
    end if;
  end if;
  if to_regprocedure('public.add_tax_info_asks(text, jsonb)') is not null then
    v_def := pg_get_functiondef('public.add_tax_info_asks(text, jsonb)'::regprocedure);
    v_a := E'par.step_type not in (''tax_estimate'',''annual_return'',''wealth_declaration'') /* 230 · הצהרת הון */';
    v_n := E'par.step_type not in (''tax_estimate'',''annual_return'',''wealth_declaration'',''tax_file_intake'') /* 230 · הצהרת הון */ /* 236 · קליטה */';
    if position(v_n in v_def) > 0 then
      execute replace(v_def, v_n, v_a);
    end if;
  end if;
end
$r236$;

commit;
