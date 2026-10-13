-- ════════════════════════════════════════════════════════════════════════════
-- התאוששות מ-230 על staging בלבד — נוצר ב-scripts/sql/230/make-rollback-230.mjs (לא לערוך ביד)
-- ════════════════════════════════════════════════════════════════════════════
-- ‼ לא לייצור. מוחק הכנות להצהרת הון ואת פריטי ההון (נתוני בדיקה בלבד ב-staging), מחזיר את
--   האילוץ, האינדקס ו-_tax_year_items של 229, ומחזיר את הפונקציות שהוזרקו לגוף של 229.
-- ‼ לאמת אחרי: md5(prosrc) של add_tax_info_asks, portal_submit_tax_info ו-_tax_year_items שווה
--   למה שנמדד לפני ההחלה (stage2-execution-plan.md §13): 2bbbdca3…, 4c0a19d1…, f0f758b0….

begin;

delete from public.tax_info_asks where item_key like 'wealth.%';
delete from public.tax_year_facts where item_key like 'wealth.%';
delete from public.onboarding_steps where step_type = 'info_collection'
  and payload->>'parentStepId' in (select id from public.onboarding_steps where step_type = 'wealth_declaration');
delete from public.onboarding_steps where step_type = 'wealth_declaration';

drop function if exists public.ensure_wealth_declaration(text, date, text);
drop function if exists public.update_wealth_declaration(text, jsonb, text);
drop function if exists public._wealth_min_due(date, date);
drop trigger if exists onboarding_steps_wealth_omission_guard on public.onboarding_steps;
drop function if exists public._wealth_omission_guard();
drop index if exists public.onboarding_steps_wealth_open_idx;

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
    -- 229
    'tax_estimate', 'annual_return', 'info_collection',
    -- ‼ 12.10.2026: גם הסוגים של 230 ו-236 — כדי שהחלה חוזרת של 229 אחריהן לא תיכשל על שורות שכבר קיימות
    --   (האילוץ הוא רשימה מותרת בלבד; הפונקציות של הסוגים האלה נוספות ב-230 וב-236).
    'wealth_declaration', 'tax_file_intake']));

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
    "donations.changesSince":"screener"}'::jsonb
$$;

do $r230$
declare
  v_def text;
  v_a text; v_n text;
begin
  v_def := pg_get_functiondef('public.add_tax_info_asks(text, jsonb)'::regprocedure);
  v_a := E'v_year := (par.payload->>''taxYear'')::int;';
  v_n := E'v_year := (par.payload->>''taxYear'')::int;\n  if exists (select 1 from jsonb_array_elements(coalesce(p_asks, ''[]''::jsonb)) z /* 230b · פריט לפי תכלית */\n             where ((z->>''itemKey'') like ''wealth.%'') <> (par.step_type = ''wealth_declaration'')) then\n    return jsonb_build_object(''ok'', false, ''error'', ''item_purpose_mismatch'');\n  end if;';
  if position(v_n in v_def) > 0 then
    execute replace(v_def, v_n, v_a);
  end if;
  v_def := pg_get_functiondef('public.portal_submit_tax_info(text, uuid, jsonb)'::regprocedure);
  v_a := E'v_per := public._tax_answer_period(v_ins->>''purpose'', (v_ins->>''cutoffMonth'')::int, a.tax_year, a.item_key, a.item_kind);';
  v_n := E'v_per := case when v_ins->>''purpose'' = ''wealth'' /* 230 · הצהרת הון */\n    then jsonb_build_object(''periodKind'', ''as_of'', ''from'', null, ''to'', (v_ins->>''asOfDate'')::date, ''basis'', case when a.item_kind = ''amount'' then ''declared'' else ''actual'' end)\n    else public._tax_answer_period(v_ins->>''purpose'', (v_ins->>''cutoffMonth'')::int, a.tax_year, a.item_key, a.item_kind) end;';
  if position(v_n in v_def) > 0 then
    execute replace(v_def, v_n, v_a);
  end if;
  v_def := pg_get_functiondef('public.add_tax_info_asks(text, jsonb)'::regprocedure);
  v_a := E'''cutoffMonth'', par.payload->''cutoffMonth'', ''title'', ''השלמת מידע לשנת '' || v_year))';
  v_n := E'''cutoffMonth'', par.payload->''cutoffMonth'', ''asOfDate'', par.payload->''asOfDate'',\n        ''title'', case when par.step_type = ''wealth_declaration'' then ''השלמת מידע להצהרת הון'' else ''השלמת מידע לשנת '' || v_year end))';
  if position(v_n in v_def) > 0 then
    execute replace(v_def, v_n, v_a);
  end if;
  v_def := pg_get_functiondef('public.add_tax_info_asks(text, jsonb)'::regprocedure);
  v_a := E'par.step_type not in (''tax_estimate'',''annual_return'')';
  v_n := E'par.step_type not in (''tax_estimate'',''annual_return'',''wealth_declaration'') /* 230 · הצהרת הון */';
  if position(v_n in v_def) > 0 then
    execute replace(v_def, v_n, v_a);
  end if;
end
$r230$;

commit;
