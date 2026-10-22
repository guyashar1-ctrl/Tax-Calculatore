-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- 287 · שאלון הדוח השנתי — סבב 2.1 (22.10.2026; בלי טקסט חופשי, «הדבר הבא» בלי כפילות)
-- ‼ נוצר ב-scripts/sql/287/build.mjs. לא לערוך ביד. חזרה: scripts/sql/287/rollback-287.sql.
-- ‼ מה כאן (רק השרת; השאר — בקוד האתר):
--   1. _tax_year_items: 319 פריטים (312 ב-286; חדשים: 7): income.other, income.otherKinds, income.prize, income.prizeDocs, income.royalties, income.royaltiesDocs, income.unlisted.
--      ריבוע «הכנסה אחרת» (זכייה, תמלוגים, משהו אחר ⇐ המשרד מתקשר) — במקום «משהו אחר?» בטקסט חופשי.
--   2. _portal_step_items: בדף האישי, שאלון הדוח השנתי — «רק מה שהשתנה · אפשר לעצור ולהמשיך» במקום «N שאלות»
--      (המספר סופר שאלות שמוצגות יחד במסך אחד). החלפת ביטוי אחד בעוגן אחד, בלי סכמה ובלי נתונים.
-- ════════════════════════════════════════════════════════════════════════════════════════════════
create or replace function public._tax_year_items()
returns jsonb language sql immutable set search_path = public as $$
  select '{
    "household.maritalAtYearEnd":"confirm","household.children":"confirm","household.childDeferral":"detail","household.settlement":"confirm",
    "household.address":"confirm","household.degree":"confirm","household.release":"confirm","household.creditChanges":"screener",
    "household.degreeDocs":"document","household.creditEmployer":"detail","household.alimonyPaid":"amount","salary.worked":"screener",
    "salary.employers":"confirm","salary.spouseIncomeEstimate":"amount","salary.form106":"document","salary.employerDetails":"detail",
    "salary.payslipToDate":"document","salary.amounts":"amount","business.active":"confirm","business.books":"document",
    "business.profit":"amount","business.selfDeposits":"amount","business.assetsChanged":"screener","business.assetDocs":"document",
    "business.depreciation":"document","business.inventory":"screener","business.inventoryCount":"document","business.employees":"screener",
    "business.payrollReport":"document","business.badDebts":"screener","business.badDebtDocs":"document","business.vehicle":"screener",
    "business.vehicleDetails":"detail","business.vehicleLicense":"document","business.vehicleExpenses":"amount","business.partnership":"screener",
    "business.partnershipDocs":"document","business.partners":"detail","business.rentsPremises":"screener","business.premisesLease":"document",
    "business.priorDepreciation":"document","business.microRegistration":"document","business.microTrack":"amount","business.microExclusions":"screener",
    "business.microCoordination":"document","business.forecast":"amount","business.oneOffs":"amount","niBenefits.received":"screener",
    "niBenefits.cert":"document","niBenefits.maternity":"screener","niBenefits.maternityPeriod":"detail","niBenefits.maternityAmounts":"amount",
    "niBenefits.maternityNotice":"document","niBenefits.maternitySpread":"detail","rent.properties":"confirm","rent.income":"amount",
    "rent.incomeTotal":"amount","rent.expenses":"amount","rent.contract":"document","rent.track":"detail",
    "rent.singleApartment":"screener","rent.businessUse":"screener","rent.businessUseDocs":"document","rent.businessUseAmounts":"amount",
    "rent.coOwned":"screener","rent.coOwners":"detail","rent.keyMoney":"screener","rent.keyMoneyDocs":"document",
    "rent.ownRent":"screener","rent.ownRentDocs":"document","rent.otherProperty":"screener","rent.otherPropertyDocs":"document",
    "capital.accounts":"confirm","capital.form867":"document","capital.amounts":"amount","capital.owner":"detail",
    "capital.relatedParty":"screener","capital.totals":"amount","capital.estimate":"amount","sales.sold":"screener",
    "sales.transaction":"detail","sales.circumstances":"screener","sales.buyer":"detail","sales.expenseDocs":"document",
    "sales.specialDeal":"screener","sales.specialDocs":"document","sales.officeChecks":"detail","sales.docs":"document",
    "foreign.income":"screener","foreign.totals":"amount","foreign.sourceDetails":"detail","foreign.statements":"document",
    "foreign.securitiesSold":"screener","foreign.tradeReport":"document","foreign.taxCert":"document","foreign.amounts":"amount",
    "foreign.work":"screener","foreign.workDocs":"document","foreign.rentalProperty":"screener","foreign.leaseDocs":"document",
    "foreign.company":"screener","foreign.companyDocs":"document","foreign.owner":"detail","foreign.taxRefund":"screener",
    "savings.selfDeposits":"screener","savings.selfAmounts":"amount","savings.fundDetails":"detail","savings.fundCerts":"document",
    "savings.depositsEstimate":"amount","savings.insuranceAmounts":"amount","savings.insuranceCert":"document","savings.insurance":"screener",
    "donations.given":"screener","donations.amount":"amount","donations.receipts":"document","companies.controlled":"screener",
    "payments.advances":"amount","payments.withholding":"amount","payments.niPaid":"amount","carryForward.balances":"amount",
    "special.otherIncome":"amount","special.gambling":"amount","special.reserveCombatDays":"amount","special.trust":"screener",
    "special.kibbutz":"screener","special.reportablePosition":"screener","special.partnership":"screener","special.nonResident":"screener",
    "special.moneyAbroad":"screener","special.financialInstitution":"screener","filing.refundAccount":"detail","filing.declarations":"detail",
    "filing.identity":"detail","household.changesSince":"screener","salary.changesSince":"screener","business.changesSince":"screener",
    "niBenefits.changesSince":"screener","rent.changesSince":"screener","capital.changesSince":"screener","sales.changesSince":"screener",
    "foreign.changesSince":"screener","savings.changesSince":"screener","donations.changesSince":"screener","period.property":"detail",
    "period.account":"detail","wealth.period.property":"detail","wealth.period.account":"detail","annual.whatHappened":"screener",
    "annual.lessTax":"screener","savings.withdrawal":"screener","savings.withdrawalDocs":"document","business.started":"screener",
    "business.startedDocs":"document","household.aliyah":"screener","household.aliyahDocs":"document","household.relativeCare":"screener",
    "household.relativeCareDocs":"document","income.other":"screener","income.otherKinds":"detail","income.prize":"screener",
    "income.prizeDocs":"document","income.royalties":"screener","income.royaltiesDocs":"document","income.unlisted":"screener",
    "household.studies":"detail","household.releaseDocs":"document","household.internshipDocs":"document","household.childChange":"detail",
    "household.newChild":"screener","household.newChildDocs":"document","household.disabledChild":"screener","household.disabledChildDocs":"document",
    "household.addressCert":"document","niBenefits.kinds":"detail","niBenefits.kindUnemployment":"screener","niBenefits.kindReserve":"screener",
    "niBenefits.kindInjury":"screener","niBenefits.kindDisability":"screener","niBenefits.kindOther":"screener","salary.equity":"screener",
    "salary.equityDocs":"document","pension.received":"screener","pension.certs":"document","special.disability":"screener",
    "special.disabilityCert":"document","rent.newRental":"screener","capital.newAccount":"screener","household.familyChange":"screener",
    "household.familyEvent":"detail","family.eventDeath":"screener","family.eventDivorce":"screener","family.eventMarriage":"screener",
    "family.death":"detail","family.deathIncome":"detail","family.deathGotSalary":"screener","family.deathGotPension":"screener",
    "family.deathGotNi":"screener","family.deathGotDisabilityIns":"screener","family.disabilityInsDocs":"document","family.deathPayouts":"detail",
    "family.payoutSeverance":"screener","family.payoutLifeIns":"screener","family.payoutFund":"screener","family.payoutMortgage":"screener",
    "family.payoutSickDays":"screener","family.sickPayDocs":"document","family.pensionCapitalized":"detail","family.capitalizationDocs":"document",
    "family.survivorPaidWhen":"detail","family.survivorDocsState":"document","family.survivorDocsBtl":"document","family.severanceDocs":"document",
    "family.payoutDocs":"document","family.survivorPensions":"detail","family.survivorFromFund":"screener","family.survivorFromState":"screener",
    "family.survivorFromBtl":"screener","family.deathDocs":"document","family.survivorDocs":"document","family.divorce":"detail",
    "family.divorceDocs":"document","family.marriage":"detail","family.marriageSpouseDocs":"document","annual.officeDecision":"detail",
    "wealth.household":"confirm","wealth.spouseSeparate":"detail","wealth.realEstate.list":"confirm","wealth.realEstate.has":"screener",
    "wealth.realEstate.details":"detail","wealth.realEstate.docs":"document","wealth.realEstate.total":"amount","wealth.bank.accounts":"detail",
    "wealth.bank.certs":"document","wealth.bank.foreign":"confirm","wealth.bank.total":"amount","wealth.crypto.has":"screener",
    "wealth.crypto.docs":"document","wealth.cash":"amount","wealth.funds.list":"confirm","wealth.funds.has":"screener",
    "wealth.funds.certs":"document","wealth.funds.total":"amount","wealth.securities.list":"confirm","wealth.securities.has":"screener",
    "wealth.securities.docs":"document","wealth.securities.total":"amount","wealth.loansGiven.has":"screener","wealth.loansGiven.details":"detail",
    "wealth.loansGiven.docs":"document","wealth.vehicles.has":"screener","wealth.vehicles.details":"detail","wealth.vehicles.docs":"document",
    "wealth.valuables.has":"screener","wealth.contents":"document","wealth.mortgage.has":"screener","wealth.mortgage.docs":"document",
    "wealth.loansReceived.has":"screener","wealth.loansReceived.details":"detail","wealth.liabilities.total":"amount","wealth.business.books":"detail",
    "wealth.companies.has":"screener","wealth.companies.docs":"document","wealth.business.total":"amount","wealth.partD.has":"screener",
    "wealth.partD.details":"detail","wealth.prevDeclaration":"document","wealth.since.sources":"detail","wealth.since.uses":"detail",
    "wealth.since.living":"detail","intake.whatYouHave":"screener","intake.family":"confirm","intake.marriageYear":"detail",
    "intake.divorceYear":"detail","intake.widowhoodYear":"detail","intake.children":"confirm","intake.address":"confirm",
    "intake.idCard":"document","intake.settlement":"confirm","intake.settlementCert":"document","intake.credits":"screener",
    "intake.creditDocs":"document","intake.special":"screener","intake.specialDocs":"document","intake.employers":"confirm",
    "intake.employed":"screener","intake.employerDetails":"detail","intake.payslip":"document","intake.business":"confirm",
    "intake.selfEmployed":"screener","intake.businessDetails":"detail","intake.businessCert":"document","intake.bookkeeping":"detail",
    "intake.rentals":"confirm","intake.rents":"screener","intake.propertyDetails":"detail","intake.rentalContract":"document",
    "intake.investments":"confirm","intake.hasInvestments":"screener","intake.accountDetails":"detail","intake.foreign":"screener",
    "intake.foreignDetails":"detail","intake.crypto":"screener","intake.cryptoDetails":"detail","intake.funds":"confirm",
    "intake.selfDeposits":"screener","intake.fundDetails":"detail","intake.allowances":"screener","intake.allowanceDetails":"detail",
    "intake.allowanceDocs":"document","intake.insurance":"screener","intake.insuranceDetails":"detail","intake.insuranceDocs":"document",
    "intake.prevReturns":"screener","intake.prevReturnDocs":"document","intake.openIssues":"screener","intake.openIssueDocs":"document",
    "intake.bankAccount":"confirm","intake.bankCert":"document","intake.authorityAlignment":"screener"}'::jsonb
$$;
revoke all on function public._tax_year_items() from public, anon, authenticated;

do $p1$
declare
  v_def text;
  a1 text := $blk$'sub', case when v_ck_total = 1 then 'שאלה אחת' else v_ck_total || ' שאלות' end || ' · אפשר לעצור ולהמשיך',$blk$;
  n1 text := $blk$'sub', case when s.payload->>'purpose' = 'annual' then 'רק מה שהשתנה' /* 287 · הדוח השנתי */ when v_ck_total = 1 then 'שאלה אחת' else v_ck_total || ' שאלות' end || ' · אפשר לעצור ולהמשיך',$blk$;
begin
  select pg_get_functiondef('public._portal_step_items(public.onboarding_steps, public.clients, public.profiles, public.representation_requests, jsonb, jsonb)'::regprocedure) into v_def;
  if position('287 · הדוח השנתי' in v_def) > 0 then raise notice '287: _portal_step_items — כבר הוחל'; return; end if;
  if (length(v_def) - length(replace(v_def, a1, ''))) / length(a1) <> 1 then raise exception '287: העוגן לא נמצא פעם אחת'; end if;
  execute replace(v_def, a1, n1);
end
$p1$;

-- אימות אחרי ההחלה (apply_migration עלול לדווח הצלחה על בלוק DO בלי להחיל):
--   select prosrc like '%287 · הדוח השנתי%' from pg_proc where proname = '_portal_step_items';
--   select public._tax_year_items() ? 'income.other', public._tax_year_items() ? 'income.unlisted';
