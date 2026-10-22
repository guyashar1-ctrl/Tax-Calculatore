-- חזרה מ-286: רשימת הפריטים של 268, והסרת ההזרקה מ-portal_submit_tax_info. נוצר ב-scripts/sql/286/build.mjs.
-- ‼ שאלות שכבר נוצרו עם המפתחות החדשים נשארות; תשובה אליהן תיכשל ב-bad_option אחרי החזרה — להחזיר רק כשאין כאלה פתוחות.
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
    "niBenefits.kinds":"detail","niBenefits.kindUnemployment":"screener","niBenefits.kindReserve":"screener","niBenefits.kindInjury":"screener",
    "niBenefits.kindDisability":"screener","niBenefits.kindOther":"screener","salary.equity":"screener","salary.equityDocs":"document",
    "pension.received":"screener","pension.certs":"document","special.disability":"screener","special.disabilityCert":"document",
    "rent.newRental":"screener","capital.newAccount":"screener","household.familyChange":"screener","household.familyEvent":"detail",
    "family.eventDeath":"screener","family.eventDivorce":"screener","family.eventMarriage":"screener","family.death":"detail",
    "family.deathIncome":"detail","family.deathGotSalary":"screener","family.deathGotPension":"screener","family.deathGotNi":"screener",
    "family.deathGotDisabilityIns":"screener","family.disabilityInsDocs":"document","family.deathPayouts":"detail","family.payoutSeverance":"screener",
    "family.payoutLifeIns":"screener","family.payoutFund":"screener","family.payoutMortgage":"screener","family.payoutSickDays":"screener",
    "family.sickPayDocs":"document","family.pensionCapitalized":"detail","family.capitalizationDocs":"document","family.survivorPaidWhen":"detail",
    "family.survivorDocsState":"document","family.survivorDocsBtl":"document","family.severanceDocs":"document","family.payoutDocs":"document",
    "family.survivorPensions":"detail","family.survivorFromFund":"screener","family.survivorFromState":"screener","family.survivorFromBtl":"screener",
    "family.deathDocs":"document","family.survivorDocs":"document","family.divorce":"detail","family.divorceDocs":"document",
    "family.marriage":"detail","family.marriageSpouseDocs":"document","annual.officeDecision":"detail","wealth.household":"confirm",
    "wealth.spouseSeparate":"detail","wealth.realEstate.list":"confirm","wealth.realEstate.has":"screener","wealth.realEstate.details":"detail",
    "wealth.realEstate.docs":"document","wealth.realEstate.total":"amount","wealth.bank.accounts":"detail","wealth.bank.certs":"document",
    "wealth.bank.foreign":"confirm","wealth.bank.total":"amount","wealth.crypto.has":"screener","wealth.crypto.docs":"document",
    "wealth.cash":"amount","wealth.funds.list":"confirm","wealth.funds.has":"screener","wealth.funds.certs":"document",
    "wealth.funds.total":"amount","wealth.securities.list":"confirm","wealth.securities.has":"screener","wealth.securities.docs":"document",
    "wealth.securities.total":"amount","wealth.loansGiven.has":"screener","wealth.loansGiven.details":"detail","wealth.loansGiven.docs":"document",
    "wealth.vehicles.has":"screener","wealth.vehicles.details":"detail","wealth.vehicles.docs":"document","wealth.valuables.has":"screener",
    "wealth.contents":"document","wealth.mortgage.has":"screener","wealth.mortgage.docs":"document","wealth.loansReceived.has":"screener",
    "wealth.loansReceived.details":"detail","wealth.liabilities.total":"amount","wealth.business.books":"detail","wealth.companies.has":"screener",
    "wealth.companies.docs":"document","wealth.business.total":"amount","wealth.partD.has":"screener","wealth.partD.details":"detail",
    "wealth.prevDeclaration":"document","wealth.since.sources":"detail","wealth.since.uses":"detail","wealth.since.living":"detail",
    "intake.whatYouHave":"screener","intake.family":"confirm","intake.marriageYear":"detail","intake.divorceYear":"detail",
    "intake.widowhoodYear":"detail","intake.children":"confirm","intake.address":"confirm","intake.idCard":"document",
    "intake.settlement":"confirm","intake.settlementCert":"document","intake.credits":"screener","intake.creditDocs":"document",
    "intake.special":"screener","intake.specialDocs":"document","intake.employers":"confirm","intake.employed":"screener",
    "intake.employerDetails":"detail","intake.payslip":"document","intake.business":"confirm","intake.selfEmployed":"screener",
    "intake.businessDetails":"detail","intake.businessCert":"document","intake.bookkeeping":"detail","intake.rentals":"confirm",
    "intake.rents":"screener","intake.propertyDetails":"detail","intake.rentalContract":"document","intake.investments":"confirm",
    "intake.hasInvestments":"screener","intake.accountDetails":"detail","intake.foreign":"screener","intake.foreignDetails":"detail",
    "intake.crypto":"screener","intake.cryptoDetails":"detail","intake.funds":"confirm","intake.selfDeposits":"screener",
    "intake.fundDetails":"detail","intake.allowances":"screener","intake.allowanceDetails":"detail","intake.allowanceDocs":"document",
    "intake.insurance":"screener","intake.insuranceDetails":"detail","intake.insuranceDocs":"document","intake.prevReturns":"screener",
    "intake.prevReturnDocs":"document","intake.openIssues":"screener","intake.openIssueDocs":"document","intake.bankAccount":"confirm",
    "intake.bankCert":"document","intake.authorityAlignment":"screener"}'::jsonb
$$;
revoke all on function public._tax_year_items() from public, anon, authenticated;

do $p1$
declare
  v_def text; v_nl text;
  a1 text := $blk$  -- 286 · סבב 2: «השתנה» בשורת «זה עדיין נכון?» פותח את prompt.onChanged; ערך ברשומה («לימודים וצבא») פותח את prompt.onValue
  --   (תואר ⇒ אישור זכאות, שחרור ⇒ תעודת שחרור, התמחות ⇒ אישור). צילומים כמו onYes (264) — לא נוסח מהדפדפן; פריט לא מוכר מדולג;
  --   פעם אחת לזהות (האינדקס של 229). אותו כלל בדפדפן: asks.ts › onChangedFor / onValueFor.
  declare
    v_r286 jsonb; v_x286 jsonb; v_l286 jsonb := '[]'::jsonb;
  begin
    if jsonb_typeof(a.prompt->'onChanged') = 'array'
       and (v_kind = 'changed' or (v_kind = 'record' and coalesce(p_answer->>'assertion', '') = 'changed')) then
      v_l286 := a.prompt->'onChanged';
    end if;
    if jsonb_typeof(a.prompt->'onValue') = 'array' and v_kind = 'record' and jsonb_typeof(p_answer->'value'->'items') = 'array' then
      for v_r286 in select value from jsonb_array_elements(a.prompt->'onValue') loop
        if jsonb_typeof(v_r286) = 'object' and jsonb_typeof(v_r286->'in') = 'array' and nullif(v_r286->>'field', '') is not null
           and exists (select 1 from jsonb_array_elements(p_answer->'value'->'items') x
                        where jsonb_typeof(x) = 'object' and (v_r286->'in') ? coalesce(x->>(v_r286->>'field'), '')) then
          v_l286 := v_l286 || jsonb_build_array(v_r286->'ask');
        end if;
      end loop;
    end if;
    for v_x286 in select value from jsonb_array_elements(v_l286) loop
      if jsonb_typeof(v_x286) = 'object' and (v_items ? (v_x286->>'itemKey')) and coalesce(v_x286->>'subjectRole', '') in ('client', 'spouse', 'couple')
         and jsonb_typeof(v_x286->'prompt') = 'object' and nullif(v_x286->'prompt'->>'title', '') is not null then
        insert into public.tax_info_asks (user_id, client_id, tax_year, step_id, parent_step_id, item_key, item_kind, subject_role, entity_kind, entity_ref, prompt, state)
        values (a.user_id, c.id, a.tax_year, a.step_id, a.parent_step_id, v_x286->>'itemKey', v_items->>(v_x286->>'itemKey'),
                v_x286->>'subjectRole', nullif(v_x286->>'entityKind', ''), nullif(v_x286->>'entityRef', ''), v_x286->'prompt', 'published')
        on conflict do nothing;
      end if;
    end loop;
  end;
  -- 264 · «סבב אחד»: תשובה חיובית פותחת מיד את ההמשך שהוכן בתוך השאלה (prompt.onYes). קודם פותחים, ואז בודקים אם נשאר משהו פתוח.
$blk$;
  n1 text := $blk$  -- 264 · «סבב אחד»: תשובה חיובית פותחת מיד את ההמשך שהוכן בתוך השאלה (prompt.onYes). קודם פותחים, ואז בודקים אם נשאר משהו פתוח.
$blk$;
begin
  select pg_get_functiondef('public.portal_submit_tax_info(text, uuid, jsonb)'::regprocedure) into v_def;
  if position('286 · סבב 2' in v_def) = 0 then raise notice 'rollback 286: לא הוחל'; return; end if;
  v_nl := case when position(E'\r\n' in v_def) > 0 then E'\r\n' else E'\n' end;
  a1 := replace(a1, E'\n', v_nl); n1 := replace(n1, E'\n', v_nl);
  if (length(v_def) - length(replace(v_def, a1, ''))) / length(a1) <> 1 then raise exception 'rollback 286: העוגן לא נמצא פעם אחת'; end if;
  execute replace(v_def, a1, n1);
end
$p1$;
