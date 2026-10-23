-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- 290 · השאלון השנתי סוגר את קלטי נקודות הזיכוי (23.10.2026, גיא אישר)
-- ‼ נוצר ב-scripts/sql/290/build.mjs. לא לערוך ביד. חזרה: scripts/sql/290/rollback-290.sql.
-- ‼ מה כאן (רק השרת; השאר — בקוד האתר: catalog / records / recordToCard):
--   1. clients.aliyah_month — חודש העלייה (1–12). סעיף 35 סופר חודשי ותק; בלעדיו החישוב הניח ינואר.
--   2. _tax_fact_field_op: ענפים aliyahMonth (חדש) ו-returningYear (העמודה קיימת, עד עכשיו בלי ענף) — כדי ש«אשר ועדכן בתיק»
--      (apply_tax_facts) יכתוב אותם עם הערך הקודם. ‼ ענף = העמודה מנוהלת (_governed_client_columns) ⇒ שתיהן ב-GOVERNED_FACT_KEYS.
--   3. _tax_year_items: 328 פריטים (319 ב-287; חדשים: 9): household.spouseBasics, household.noIncomeSpouse, household.aliyahDetails, household.reserveDuty, household.reserveDays, household.reserveDocs, household.disabledChildDetails, special.disabilityDetails, family.childSupport.
--      שאלות ההמשך (עלייה, נכות, מילואים אחרי «כן» בריבוע; ילד עם מוגבלות בשורת הילדים; מזונות ילדים מ«אני משלם/ת» בגירושין — onValue)
--      הן צילומים בתוך השאלה (followUps 262 / onValue 286) — השרת פותח אותן רק אם הוא מכיר את המפתח; לכן הם כאן.
--      מזונות לגרוש/ה (household.alimonyPaid) כבר מוכר — רק נעשה ריבוע בקוד. מין ותאריך הלידה של בן/בת הזוג, וסעיף 37 — שאלות לזוג.
-- ════════════════════════════════════════════════════════════════════════════════════════════════
alter table public.clients
  add column if not exists aliyah_month smallint check (aliyah_month between 1 and 12);

do $p289$
declare
  v_def text;
  v_nl text;
  a1 text := E'    when ''taxFiles'' then\n';
  n1 text := E'    -- 290 · עלייה: חודש העלייה ושנת החזרה לארץ — מהשאלון השנתי, באישור המשרד\n    when ''aliyahMonth'' then\n      select to_jsonb(aliyah_month) into out_current from public.clients where id = p_client_id;\n      if p_write then update public.clients set aliyah_month = nullif(p_value #>> ''{}'', '''')::smallint, field_meta = coalesce(field_meta,''{}''::jsonb) || v_meta where id = p_client_id; end if;\n    when ''returningYear'' then\n      select to_jsonb(returning_year) into out_current from public.clients where id = p_client_id;\n      if p_write then update public.clients set returning_year = nullif(p_value #>> ''{}'', '''')::integer, field_meta = coalesce(field_meta,''{}''::jsonb) || v_meta where id = p_client_id; end if;\n';
begin
  select pg_get_functiondef('public._tax_fact_field_op(text,text,boolean,jsonb,text)'::regprocedure) into v_def;
  v_nl := case when position(E'\r\n' in v_def) > 0 then E'\r\n' else E'\n' end;
  a1 := replace(a1, E'\n', v_nl); n1 := replace(n1, E'\n', v_nl);
  if position('290 · עלייה' in v_def) > 0 then raise notice '290: _tax_fact_field_op — כבר הוחל'; return; end if;
  if (length(v_def) - length(replace(v_def, a1, ''))) / length(a1) <> 1 then raise exception '290: עוגן taxFiles ב-_tax_fact_field_op לא נמצא פעם אחת'; end if;
  if v_def ~ E'when ''(aliyahMonth|returningYear)'' then' then raise exception '290: ענף aliyahMonth/returningYear כבר קיים בגרסה לא מוכרת'; end if;
  execute replace(v_def, a1, n1 || a1);
end
$p289$;
revoke all on function public._tax_fact_field_op(text, text, boolean, jsonb, text) from public, anon, authenticated;

create or replace function public._tax_year_items()
returns jsonb language sql immutable set search_path = public as $$
  select '{
    "household.maritalAtYearEnd":"confirm","household.children":"confirm","household.childDeferral":"detail","household.settlement":"confirm",
    "household.address":"confirm","household.degree":"confirm","household.release":"confirm","household.creditChanges":"screener",
    "household.degreeDocs":"document","household.creditEmployer":"detail","household.alimonyPaid":"amount","household.spouseBasics":"detail",
    "household.noIncomeSpouse":"detail","salary.worked":"screener","salary.employers":"confirm","salary.spouseIncomeEstimate":"amount",
    "salary.form106":"document","salary.employerDetails":"detail","salary.payslipToDate":"document","salary.amounts":"amount",
    "business.active":"confirm","business.books":"document","business.profit":"amount","business.selfDeposits":"amount",
    "business.assetsChanged":"screener","business.assetDocs":"document","business.depreciation":"document","business.inventory":"screener",
    "business.inventoryCount":"document","business.employees":"screener","business.payrollReport":"document","business.badDebts":"screener",
    "business.badDebtDocs":"document","business.vehicle":"screener","business.vehicleDetails":"detail","business.vehicleLicense":"document",
    "business.vehicleExpenses":"amount","business.partnership":"screener","business.partnershipDocs":"document","business.partners":"detail",
    "business.rentsPremises":"screener","business.premisesLease":"document","business.priorDepreciation":"document","business.microRegistration":"document",
    "business.microTrack":"amount","business.microExclusions":"screener","business.microCoordination":"document","business.forecast":"amount",
    "business.oneOffs":"amount","niBenefits.received":"screener","niBenefits.cert":"document","niBenefits.maternity":"screener",
    "niBenefits.maternityPeriod":"detail","niBenefits.maternityAmounts":"amount","niBenefits.maternityNotice":"document","niBenefits.maternitySpread":"detail",
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
    "donations.changesSince":"screener","period.property":"detail","period.account":"detail","wealth.period.property":"detail",
    "wealth.period.account":"detail","annual.whatHappened":"screener","annual.lessTax":"screener","savings.withdrawal":"screener",
    "savings.withdrawalDocs":"document","business.started":"screener","business.startedDocs":"document","household.aliyah":"screener",
    "household.aliyahDetails":"detail","household.aliyahDocs":"document","household.reserveDuty":"screener","household.reserveDays":"detail",
    "household.reserveDocs":"document","household.relativeCare":"screener","household.relativeCareDocs":"document","income.other":"screener",
    "income.otherKinds":"detail","income.prize":"screener","income.prizeDocs":"document","income.royalties":"screener",
    "income.royaltiesDocs":"document","income.unlisted":"screener","household.studies":"detail","household.releaseDocs":"document",
    "household.internshipDocs":"document","household.childChange":"detail","household.newChild":"screener","household.newChildDocs":"document",
    "household.disabledChild":"screener","household.disabledChildDetails":"detail","household.disabledChildDocs":"document","household.addressCert":"document",
    "niBenefits.kinds":"detail","niBenefits.kindUnemployment":"screener","niBenefits.kindReserve":"screener","niBenefits.kindInjury":"screener",
    "niBenefits.kindDisability":"screener","niBenefits.kindOther":"screener","salary.equity":"screener","salary.equityDocs":"document",
    "pension.received":"screener","pension.certs":"document","special.disability":"screener","special.disabilityDetails":"detail",
    "special.disabilityCert":"document","rent.newRental":"screener","capital.newAccount":"screener","household.familyChange":"screener",
    "household.familyEvent":"detail","family.eventDeath":"screener","family.eventDivorce":"screener","family.eventMarriage":"screener",
    "family.death":"detail","family.deathIncome":"detail","family.deathGotSalary":"screener","family.deathGotPension":"screener",
    "family.deathGotNi":"screener","family.deathGotDisabilityIns":"screener","family.disabilityInsDocs":"document","family.deathPayouts":"detail",
    "family.payoutSeverance":"screener","family.payoutLifeIns":"screener","family.payoutFund":"screener","family.payoutMortgage":"screener",
    "family.payoutSickDays":"screener","family.sickPayDocs":"document","family.pensionCapitalized":"detail","family.capitalizationDocs":"document",
    "family.survivorPaidWhen":"detail","family.survivorDocsState":"document","family.survivorDocsBtl":"document","family.severanceDocs":"document",
    "family.payoutDocs":"document","family.survivorPensions":"detail","family.survivorFromFund":"screener","family.survivorFromState":"screener",
    "family.survivorFromBtl":"screener","family.deathDocs":"document","family.survivorDocs":"document","family.divorce":"detail",
    "family.childSupport":"detail","family.divorceDocs":"document","family.marriage":"detail","family.marriageSpouseDocs":"document",
    "annual.officeDecision":"detail","wealth.household":"confirm","wealth.spouseSeparate":"detail","wealth.realEstate.list":"confirm",
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
    "wealth.since.uses":"detail","wealth.since.living":"detail","intake.whatYouHave":"screener","intake.family":"confirm",
    "intake.marriageYear":"detail","intake.divorceYear":"detail","intake.widowhoodYear":"detail","intake.children":"confirm",
    "intake.address":"confirm","intake.idCard":"document","intake.settlement":"confirm","intake.settlementCert":"document",
    "intake.credits":"screener","intake.creditDocs":"document","intake.special":"screener","intake.specialDocs":"document",
    "intake.employers":"confirm","intake.employed":"screener","intake.employerDetails":"detail","intake.payslip":"document",
    "intake.business":"confirm","intake.selfEmployed":"screener","intake.businessDetails":"detail","intake.businessCert":"document",
    "intake.bookkeeping":"detail","intake.rentals":"confirm","intake.rents":"screener","intake.propertyDetails":"detail",
    "intake.rentalContract":"document","intake.investments":"confirm","intake.hasInvestments":"screener","intake.accountDetails":"detail",
    "intake.foreign":"screener","intake.foreignDetails":"detail","intake.crypto":"screener","intake.cryptoDetails":"detail",
    "intake.funds":"confirm","intake.selfDeposits":"screener","intake.fundDetails":"detail","intake.allowances":"screener",
    "intake.allowanceDetails":"detail","intake.allowanceDocs":"document","intake.insurance":"screener","intake.insuranceDetails":"detail",
    "intake.insuranceDocs":"document","intake.prevReturns":"screener","intake.prevReturnDocs":"document","intake.openIssues":"screener",
    "intake.openIssueDocs":"document","intake.bankAccount":"confirm","intake.bankCert":"document","intake.authorityAlignment":"screener"}'::jsonb
$$;
revoke all on function public._tax_year_items() from public, anon, authenticated;

do $$
begin
  if position('290 · עלייה' in pg_get_functiondef('public._tax_fact_field_op(text,text,boolean,jsonb,text)'::regprocedure)) = 0 then raise exception '290: _tax_fact_field_op לא עודכן'; end if;
  if not ('aliyah_month' = any(public._governed_client_columns()) and 'returning_year' = any(public._governed_client_columns())) then
    raise exception '290: העמודות לא מנוהלות';
  end if;
  if not (public._tax_year_items() ?& array['household.spouseBasics', 'household.noIncomeSpouse', 'household.aliyahDetails', 'special.disabilityDetails', 'household.reserveDuty', 'household.reserveDays', 'household.reserveDocs', 'household.disabledChildDetails', 'family.childSupport']) then raise exception '290: הפריטים החדשים חסרים'; end if;
end;
$$;

-- אימות אחרי ההחלה (apply_migration עלול לדווח הצלחה על בלוק DO בלי להחיל):
--   select position('290 · עלייה' in pg_get_functiondef('public._tax_fact_field_op(text,text,boolean,jsonb,text)'::regprocedure)) > 0;
--   select public._tax_year_items() ?& array['household.spouseBasics', 'household.noIncomeSpouse', 'household.aliyahDetails', 'special.disabilityDetails', 'household.reserveDuty', 'household.reserveDays', 'household.reserveDocs', 'household.disabledChildDetails', 'family.childSupport'];
