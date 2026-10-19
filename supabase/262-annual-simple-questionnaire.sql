-- ════════════════════════════════════════════════════════════════════════════════════════════════
-- 262 · השאלון הפשוט לדוח השנתי — מסך רשת, ענף משפחתי, קצבאות ונכות (19.10.2026)
-- ‼ נוצר ב-scripts/sql/262/build.mjs מהקטלוג בקוד. לא לערוך ביד. חזרה: scripts/sql/262/rollback-262.sql.
-- ‼ ההכרעה: גיא 19.10 (docs/proposals/2026-10-19-simple-annual-questionnaire.html). תלויות: 229, 241, 253.
--
-- מה כאן:
--   1. _tax_year_items — הרשימה המלאה מהקטלוג: 278 פריטים (241 ב-253; חדשים: 37).
--      חדשים: annual.whatHappened, pension.received, pension.certs, special.disability, special.disabilityCert, rent.newRental, capital.newAccount, household.familyChange, household.familyEvent, family.eventDeath, family.eventDivorce, family.eventMarriage, family.death, family.deathIncome, family.deathGotSalary, family.deathGotPension, family.deathGotNi, family.deathGotDisabilityIns, family.disabilityInsDocs, family.deathPayouts, family.payoutSeverance, family.payoutLifeIns, family.payoutFund, family.payoutMortgage, family.severanceDocs, family.payoutDocs, family.survivorPensions, family.survivorFromFund, family.survivorFromState, family.survivorFromBtl, family.deathDocs, family.survivorDocs, family.divorce, family.divorceDocs, family.marriage, family.marriageSpouseDocs, annual.officeDecision.
--   2. portal_submit_tax_info — אריח במסך הרשת יכול לפתוח כמה שאלות המשך יחד (followUps), לא רק אחת (followUp).
--      כל שאלה היא צילום שנשמר בשאלה בזמן הכנתה; פריט שהשרת לא מכיר — מדולג; פעם אחת לזהות (האינדקס של 229).
--   3. add_tax_info_asks — בקשת־הבת של דוח שנתי נקראת אצל הלקוח «הדוח השנתי {שנה}» (חדשות בלבד; קיימות לא משתנות).
-- ‼ הזרקה לגוף החי — כל עוגן שורה אחת, פעם אחת בדיוק; החלה חוזרת מדלגת לפי הסימון «262 ·».
-- ════════════════════════════════════════════════════════════════════════════════════════════════

do $guard$
begin
  if not exists (select 1 from pg_proc where proname = 'portal_submit_tax_info' and prosrc like '%253 · מסך הרשת%') then
    raise exception '262: 253 לא הוחלה — להחיל 253 לפני 262';
  end if;
end
$guard$;

-- ── 1. רשימת הפריטים — מהקטלוג בקוד ──
create or replace function public._tax_year_items()
returns jsonb language sql immutable set search_path = public as $$
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
    "niBenefits.maternity":"screener","niBenefits.maternityPeriod":"detail","niBenefits.maternityAmounts":"amount","niBenefits.maternityNotice":"document",
    "niBenefits.maternitySpread":"detail","rent.properties":"confirm","rent.income":"amount","rent.incomeTotal":"amount",
    "rent.expenses":"amount","rent.contract":"document","rent.track":"detail","rent.singleApartment":"screener",
    "rent.businessUse":"screener","rent.businessUseDocs":"document","rent.businessUseAmounts":"amount","rent.coOwned":"screener",
    "rent.coOwners":"detail","rent.keyMoney":"screener","rent.keyMoneyDocs":"document","rent.ownRent":"screener",
    "rent.ownRentDocs":"document","rent.otherProperty":"screener","rent.otherPropertyDocs":"document","capital.accounts":"confirm",
    "capital.form867":"document","capital.amounts":"amount","capital.owner":"detail","capital.relatedParty":"screener",
    "capital.totals":"amount","capital.estimate":"amount","sales.sold":"screener","sales.transaction":"detail",
    "sales.circumstances":"screener","sales.buyer":"detail","sales.expenseDocs":"document","sales.specialDeal":"screener",
    "sales.specialDocs":"document","sales.officeChecks":"detail","sales.docs":"document","foreign.income":"screener",
    "foreign.totals":"amount","foreign.sourceDetails":"detail","foreign.statements":"document","foreign.securitiesSold":"screener",
    "foreign.tradeReport":"document","foreign.taxCert":"document","foreign.amounts":"amount","foreign.work":"screener",
    "foreign.workDocs":"document","foreign.rentalProperty":"screener","foreign.leaseDocs":"document","foreign.company":"screener",
    "foreign.companyDocs":"document","foreign.owner":"detail","foreign.taxRefund":"screener","savings.selfDeposits":"screener",
    "savings.selfAmounts":"amount","savings.fundDetails":"detail","savings.fundCerts":"document","savings.depositsEstimate":"amount",
    "savings.insuranceAmounts":"amount","savings.insuranceCert":"document","savings.insurance":"screener","donations.given":"screener",
    "donations.amount":"amount","donations.receipts":"document","companies.controlled":"screener","payments.advances":"amount",
    "payments.withholding":"amount","payments.niPaid":"amount","carryForward.balances":"amount","special.otherIncome":"amount",
    "special.gambling":"amount","special.reserveCombatDays":"amount","special.trust":"screener","special.kibbutz":"screener",
    "special.reportablePosition":"screener","special.partnership":"screener","special.nonResident":"screener","special.moneyAbroad":"screener",
    "special.financialInstitution":"screener","filing.refundAccount":"detail","filing.declarations":"detail","filing.identity":"detail",
    "household.changesSince":"screener","salary.changesSince":"screener","business.changesSince":"screener","niBenefits.changesSince":"screener",
    "rent.changesSince":"screener","capital.changesSince":"screener","sales.changesSince":"screener","foreign.changesSince":"screener",
    "savings.changesSince":"screener","donations.changesSince":"screener","period.property":"detail","period.account":"detail",
    "wealth.period.property":"detail","wealth.period.account":"detail","annual.whatHappened":"screener","pension.received":"screener",
    "pension.certs":"document","special.disability":"screener","special.disabilityCert":"document","rent.newRental":"screener",
    "capital.newAccount":"screener","household.familyChange":"screener","household.familyEvent":"detail","family.eventDeath":"screener",
    "family.eventDivorce":"screener","family.eventMarriage":"screener","family.death":"detail","family.deathIncome":"detail",
    "family.deathGotSalary":"screener","family.deathGotPension":"screener","family.deathGotNi":"screener","family.deathGotDisabilityIns":"screener",
    "family.disabilityInsDocs":"document","family.deathPayouts":"detail","family.payoutSeverance":"screener","family.payoutLifeIns":"screener",
    "family.payoutFund":"screener","family.payoutMortgage":"screener","family.severanceDocs":"document","family.payoutDocs":"document",
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

-- ── 2. portal_submit_tax_info — כמה שאלות המשך לאריח ──
do $p1$
declare
  v_def text; v_nl text;
  a1 text := $blk$  v_out  jsonb; v_it jsonb; v_f jsonb; v_val text; v_list jsonb; v_clean jsonb;
$blk$;
  n1 text := $blk$  v_out  jsonb; v_it jsonb; v_f jsonb; v_val text; v_list jsonb; v_clean jsonb;
  v_fu   jsonb; -- 262 · כמה שאלות המשך לאריח
$blk$;
  a2 text := $blk$      -- שאלת ההמשך היא צילום שנשמר בשאלה בזמן הכנתה במשרד — לא נוסח מהדפדפן; פעם אחת לזהות (האינדקס של 229)
$blk$;
  n2 text := $blk$      -- 262 · כמה שאלות המשך לאריח (followUps): כל אחת צילום כמו followUp; פריט שהשרת לא מכיר — מדולג (לא נכשל)
      if v_yes and jsonb_typeof(v_o->'followUps') = 'array' then
        for v_fu in select value from jsonb_array_elements(v_o->'followUps') loop
          if jsonb_typeof(v_fu) = 'object' and (v_items ? (v_fu->>'itemKey')) and coalesce(v_fu->>'subjectRole', '') in ('client','spouse','couple')
             and jsonb_typeof(v_fu->'prompt') = 'object' and nullif(v_fu->'prompt'->>'title', '') is not null then
            insert into public.tax_info_asks (user_id, client_id, tax_year, step_id, parent_step_id, item_key, item_kind, subject_role, entity_kind, entity_ref, prompt, state)
            values (a.user_id, c.id, a.tax_year, a.step_id, a.parent_step_id, v_fu->>'itemKey', v_items->>(v_fu->>'itemKey'),
                    v_fu->>'subjectRole', nullif(v_fu->>'entityKind', ''), nullif(v_fu->>'entityRef', ''), v_fu->'prompt', 'published')
            on conflict do nothing;
            get diagnostics v_n = row_count;
            v_opened := v_opened + v_n;
          end if;
        end loop;
      end if;
$blk$;
begin
  select pg_get_functiondef('public.portal_submit_tax_info(text, uuid, jsonb)'::regprocedure) into v_def;
  if position('262 · כמה שאלות המשך' in v_def) > 0 then raise notice '262: portal_submit_tax_info — כבר הוחל'; return; end if;
  v_nl := case when position(E'\r\n' in v_def) > 0 then E'\r\n' else E'\n' end;
  a1 := replace(a1, E'\n', v_nl); n1 := replace(n1, E'\n', v_nl); a2 := replace(a2, E'\n', v_nl); n2 := replace(n2, E'\n', v_nl);
  if (length(v_def) - length(replace(v_def, a1, ''))) / length(a1) <> 1 then raise exception '262: עוגן ההצהרות (v_out) לא נמצא פעם אחת'; end if;
  if (length(v_def) - length(replace(v_def, a2, ''))) / length(a2) <> 1 then raise exception '262: עוגן שאלת ההמשך של 253 לא נמצא פעם אחת'; end if;
  execute replace(replace(v_def, a1, n1), a2, n2 || a2);
end
$p1$;

-- ── 3. add_tax_info_asks — הכותרת של בקשת־הבת בדוח שנתי ──
do $p2$
declare v_def text; a1 text := $blk$else 'השלמת מידע לשנת ' || v_year end))$blk$; n1 text := $blk$when par.step_type = 'annual_return' then 'הדוח השנתי ' || v_year /* 262 · כותרת */ else 'השלמת מידע לשנת ' || v_year end))$blk$;
begin
  select pg_get_functiondef('public.add_tax_info_asks(text, jsonb)'::regprocedure) into v_def;
  if position('262 · כותרת' in v_def) > 0 then raise notice '262: add_tax_info_asks — כבר הוחל'; return; end if;
  if (length(v_def) - length(replace(v_def, a1, ''))) / length(a1) <> 1 then raise exception '262: עוגן הכותרת ב-add_tax_info_asks לא נמצא פעם אחת'; end if;
  execute replace(v_def, a1, n1);
end
$p2$;

-- אימות אחרי ההחלה (apply_migration עלול לדווח הצלחה על בלוק DO בלי להחיל):
--   select prosrc like '%262 · כמה שאלות המשך%' from pg_proc where proname = 'portal_submit_tax_info';
--   select prosrc like '%262 · כותרת%' from pg_proc where proname = 'add_tax_info_asks';
--   select count(*) from jsonb_object_keys(public._tax_year_items());  -- = 278
